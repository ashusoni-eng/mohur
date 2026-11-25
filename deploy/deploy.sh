#!/usr/bin/env bash
# Builds here, then ships the code and the build to the server and restarts Mohur.
#   deploy/deploy.sh [ssh-host]     (default: bigrock; always signs in as the mohur user)
set -euo pipefail
cd "$(dirname "$0")/.."
HOST=${1:-bigrock}
SSH="ssh -T -o BatchMode=yes -l mohur"

npm run typecheck
npm test
npm run build
REV=$(git rev-parse --short HEAD)$(git diff --quiet HEAD -- || echo -dirty)

# Only what git knows about, plus the build. Local data, keys and settings never leave this machine.
git ls-files -z | rsync -az --from0 --files-from=- -e "$SSH" ./ "$HOST:app/"
rsync -az --delete --exclude cache --exclude dev -e "$SSH" .next/ "$HOST:app/.next.new/"

$SSH "$HOST" REV="$REV" bash -s <<'R'
set -euo pipefail
export XDG_RUNTIME_DIR=/run/user/$(id -u)
cd ~/app
echo "$REV" > REVISION
npm ci --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error
rm -rf .next.old; [ -d .next ] && mv .next .next.old; mv .next.new .next
install -D -m 644 deploy/mohur.service ~/.config/systemd/user/mohur.service
systemctl --user daemon-reload
systemctl --user enable mohur --quiet
systemctl --user restart mohur
( crontab -l 2>/dev/null | grep -v deploy/backup.mjs || true; echo "17 21 * * * cd \$HOME/app && /usr/bin/node deploy/backup.mjs" ) | crontab -
. ~/.env
for i in $(seq 1 30); do
  if curl -fsS -o /dev/null -m 3 "http://127.0.0.1:$PORT/login"; then echo "Live: $REV"; exit 0; fi
  sleep 1
done
echo "Did not start. Rolling back."
journalctl --user -u mohur -n 20 --no-pager || true
[ -d .next.old ] && { rm -rf .next; mv .next.old .next; systemctl --user restart mohur; }
exit 1
R
