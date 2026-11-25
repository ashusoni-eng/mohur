#!/usr/bin/env bash
# One-time server setup. Run as root on the server; safe to run again.
#   sudo bash setup-server.sh <domain> <deploy-public-key-file> [port]
# Creates the "mohur" user, an nginx site and a certificate. Touches no other user or site.
set -euo pipefail

DOMAIN=${1:?domain}; KEYFILE=${2:?public key file}; PORT=${3:-4300}
APP_USER=mohur; HOME_DIR=/home/$APP_USER; ACME=/var/www/acme-mohur
SITE=/etc/nginx/sites-available/$DOMAIN; LINK=/etc/nginx/sites-enabled/$DOMAIN
[ "$(id -u)" = 0 ] || { echo "Run with sudo"; exit 1; }
[[ $DOMAIN =~ ^[a-z0-9.-]+$ ]] || { echo "Bad domain"; exit 1; }
ssh-keygen -l -f "$KEYFILE" >/dev/null || { echo "Not a public key: $KEYFILE"; exit 1; }
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

say "1. User $APP_USER"
# No password and no sudo: it can only be reached with the deploy key.
id $APP_USER >/dev/null 2>&1 || useradd --create-home --shell /bin/bash $APP_USER
passwd -l $APP_USER >/dev/null
chmod 750 $HOME_DIR
install -d -m 700 -o $APP_USER -g $APP_USER $HOME_DIR/.ssh $HOME_DIR/data $HOME_DIR/backups
install -d -m 755 -o $APP_USER -g $APP_USER $HOME_DIR/app
touch $HOME_DIR/.ssh/authorized_keys
grep -qxF "$(cat "$KEYFILE")" $HOME_DIR/.ssh/authorized_keys || cat "$KEYFILE" >> $HOME_DIR/.ssh/authorized_keys
chown $APP_USER:$APP_USER $HOME_DIR/.ssh/authorized_keys; chmod 600 $HOME_DIR/.ssh/authorized_keys
# Lets this user's own service start at boot and be restarted without root.
loginctl enable-linger $APP_USER

say "2. Settings"
if [ ! -f $HOME_DIR/.env ]; then
  install -m 600 -o $APP_USER -g $APP_USER /dev/null $HOME_DIR/.env
  cat > $HOME_DIR/.env <<ENV
NODE_ENV=production
APP_URL=https://$DOMAIN
APP_SECRET=$(openssl rand -hex 32)
DATA_DIR=$HOME_DIR/data
TRUST_PROXY=1
SIGNUPS=open
PORT=$PORT
ENV
fi

reload() {
  if nginx -t 2>/tmp/mohur-nginx.err; then systemctl reload nginx; else
    cat /tmp/mohur-nginx.err; rm -f "$LINK"; nginx -t && echo "Site removed again; other sites are unaffected."; exit 1
  fi
}
HTTP="server {
    listen 80;
    server_name $DOMAIN;
    location ^~ /.well-known/acme-challenge/ { root $ACME; }
    location / { return 301 https://\$host\$request_uri; }
}"

say "3. Web server"
install -d -m 755 $ACME
CERT=/etc/letsencrypt/live/$DOMAIN/fullchain.pem
if [ ! -f "$CERT" ]; then
  echo "$HTTP" > "$SITE"; ln -sfn "$SITE" "$LINK"; reload
  say "4. Certificate"
  WANT=$(curl -4 -s -m 10 https://api.ipify.org || true)
  GOT=$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}' || true)
  if [ -z "$GOT" ] || [ "$GOT" != "$WANT" ]; then
    echo "DNS is not ready: $DOMAIN points to '${GOT:-nothing}', expected $WANT."
    echo "Add an A record for it, wait a few minutes, and run this script again. Everything above is done."
    exit 0
  fi
  certbot certonly --non-interactive --webroot -w $ACME -d "$DOMAIN" --deploy-hook "systemctl reload nginx"
fi

cat > "$SITE" <<NGINX
$HTTP
server {
    listen 443 ssl http2;
    server_name $DOMAIN;
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:mohur_ssl:2m;
    ssl_session_timeout 1d;
    server_tokens off;
    client_max_body_size 1m;
    add_header Strict-Transport-Security "max-age=31536000" always;
    gzip on;
    gzip_proxied any;
    gzip_types text/css application/javascript application/json image/svg+xml;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header Connection "";
        # Mohur trusts only the last address in this list, which nginx writes itself.
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        # Live status is a long-lived stream, so it must not be buffered or cut short.
        proxy_buffering off;
        proxy_read_timeout 20m;
    }
}
NGINX
ln -sfn "$SITE" "$LINK"; reload
say "Done. https://$DOMAIN is ready for a deploy."
