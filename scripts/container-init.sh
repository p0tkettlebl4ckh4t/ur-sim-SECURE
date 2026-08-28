#!/bin/bash
set -euo pipefail

: "${ROOT_PASSWORD:?ROOT_PASSWORD is required}"
: "${EASYBOT_PASSWORD:?EASYBOT_PASSWORD is required}"
: "${ROOT_FLAG:?ROOT_FLAG is required}"

printf 'root:%s\n' "$ROOT_PASSWORD" | chpasswd
if ! id easybot >/dev/null 2>&1; then
	useradd --create-home --shell /bin/bash easybot
fi
usermod --home /home/easybot --shell /bin/bash easybot
install -d -o easybot -g easybot -m 0755 /home/easybot
printf 'easybot:%s\n' "$EASYBOT_PASSWORD" | chpasswd
getent group users >/dev/null || groupadd users
usermod -aG users easybot
printf '%s\n' "$ROOT_FLAG" > /root/flag.txt
chown root:root /root/flag.txt
chmod 0600 /root/flag.txt
chown root:root /etc/cron.d/opsec /opt/opsec.sh
chown root:users /opt/userupdates.sh
chmod 0644 /etc/cron.d/opsec
chmod 0755 /opt/opsec.sh
chmod 0666 /opt/userupdates.sh
mkdir -p /run/sshd
pgrep -x cron >/dev/null || /usr/sbin/cron
pgrep -x sshd >/dev/null || /usr/sbin/sshd

exec /entrypoint.sh "$@"
