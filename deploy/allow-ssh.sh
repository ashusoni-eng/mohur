#!/usr/bin/env bash
# For servers whose sshd has an AllowUsers list: adds one user to it. Run as root.
#   sudo bash allow-ssh.sh <user>
# Keeps a backup, checks the result before reloading, and restores the file if the check fails.
set -euo pipefail
U=${1:?user}
[ "$(id -u)" = 0 ] || { echo "Run with sudo"; exit 1; }
id "$U" >/dev/null
[[ $U =~ ^[a-z][a-z0-9_-]*$ ]]
mapfile -t FILES < <(grep -lE '^[[:space:]]*AllowUsers[[:space:]]' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null)
[ "${#FILES[@]}" = 1 ] || { echo "Expected one AllowUsers line, found ${#FILES[@]} files. Nothing changed."; exit 1; }
F=${FILES[0]}
if grep -qE "^[[:space:]]*AllowUsers([[:space:]].*)?[[:space:]]$U([[:space:]]|$)" "$F"; then echo "$U is already allowed"; exit 0; fi
BAK=/root/$(basename "$F").before-$U
cp -p "$F" "$BAK"
sed -i -E "s/^([[:space:]]*AllowUsers[[:space:]].*[^[:space:]])[[:space:]]*$/\1 $U/" "$F"
if sshd -t; then systemctl reload ssh; else cp -p "$BAK" "$F"; echo "Check failed, restored."; exit 1; fi
echo "Changed $F:"; diff "$BAK" "$F" || true
echo "Backup: $BAK"
