#!/usr/bin/env bash
set -euo pipefail

# One-time host setup, release deployment never needs this root access.
[[ $EUID == 0 && $# == 3 ]] || { echo 'Usage as root: bootstrap-host.sh SOURCE_DIRECTORY DOMAIN DEPLOY_PUBLIC_KEY_FILE' >&2; exit 1; }
source_dir=$(realpath -- "$1")
domain=$2
public_key=$(cat -- "$3")
[[ $domain =~ ^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$ && $public_key == ssh-ed25519\ * ]] || { echo 'Invalid domain or deployment public key' >&2; exit 1; }
[[ -f /etc/moriitalks/api.env && -f /etc/moriitalks/caddy.env ]] || { echo 'Server-only API and Caddy environment files must exist first' >&2; exit 1; }
for file in server/receive-release.py scripts/verify-release.sh server/moriitalks-deploy.sudoers systemd/moriitalks-api.service caddy/Caddyfile systemd/caddy-moriitalks.conf; do
  [[ -f $source_dir/$file ]] || { echo "Missing setup input: $file" >&2; exit 1; }
done
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT

if ! command -v caddy >/dev/null; then
  # Prevent the vendor's default public page from starting before authentication exists.
  systemctl mask caddy.service
  export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=l
  apt-get update -qq
  apt-get install --yes --no-install-recommends debian-keyring debian-archive-keyring apt-transport-https curl gnupg
  curl --fail --silent --show-error --location https://dl.cloudsmith.io/public/caddy/stable/gpg.key |
    gpg --dearmor > "$work/caddy.gpg"
  curl --fail --silent --show-error --location https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > "$work/caddy.list"
  install -m 644 "$work/caddy.gpg" /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  install -m 644 "$work/caddy.list" /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install --yes --no-install-recommends caddy
fi

backup=/var/backups/moriitalks/$(date -u +%Y%m%dT%H%M%SZ)
install -d -m 700 "$backup"
cp -p /etc/moriitalks/api.env "$backup/api.env"
if [[ -f /etc/systemd/system/moriitalks-api.service ]]; then
  cp -p /etc/systemd/system/moriitalks-api.service "$backup/moriitalks-api.service"
fi
if [[ -f /etc/caddy/Caddyfile ]]; then cp -p /etc/caddy/Caddyfile "$backup/Caddyfile"; fi

if ! id morii-deploy >/dev/null 2>&1; then
  useradd --system --user-group --no-create-home --home-dir /var/lib/moriitalks-deploy --shell /bin/bash morii-deploy
fi
install -d -o root -g root -m 755 /var/lib/moriitalks-deploy /var/lib/moriitalks-deploy/.ssh
printf 'restrict,command="/usr/local/libexec/moriitalks-receive" %s\n' "$public_key" > /var/lib/moriitalks-deploy/.ssh/authorized_keys
chmod 644 /var/lib/moriitalks-deploy/.ssh/authorized_keys
install -d -o morii-deploy -g morii-deploy -m 755 /opt/moriitalks /opt/moriitalks/releases
install -d -o root -g root -m 755 /usr/local/libexec
install -m 755 "$source_dir/server/receive-release.py" /usr/local/libexec/moriitalks-receive
install -m 644 "$source_dir/scripts/verify-release.sh" /usr/local/libexec/moriitalks-verify-release
visudo -cf "$source_dir/server/moriitalks-deploy.sudoers"
install -m 440 "$source_dir/server/moriitalks-deploy.sudoers" /etc/sudoers.d/moriitalks-deploy

# Preserve the previous API as the initial rollback target without rebuilding it.
if [[ ! -L /opt/moriitalks/current ]]; then
  [[ -x /opt/moriitalks/api ]] || { echo 'Expected the existing API before migration' >&2; exit 1; }
  previous=/opt/moriitalks/releases/$(sha256sum /opt/moriitalks/api | cut -d ' ' -f 1)
  install -d -o morii-deploy -g morii-deploy -m 755 "$previous"
  install -o morii-deploy -g morii-deploy -m 755 /opt/moriitalks/api "$previous/api"
  ln -s "$previous" /opt/moriitalks/current
  chown -h morii-deploy:morii-deploy /opt/moriitalks/current
fi

python3 - "$domain" <<'PY'
from pathlib import Path
import sys

path = Path('/etc/moriitalks/api.env')
replacements = {
    'API_ADDR': '127.0.0.1:8080',
    'API_ALLOWED_ORIGINS': 'https://' + sys.argv[1] + ',http://localhost:8081,http://127.0.0.1:8081',
}
lines = [line for line in path.read_text().splitlines() if line.split('=', 1)[0] not in replacements]
path.write_text('\n'.join(lines + [key + '=' + value for key, value in replacements.items()]) + '\n')
path.chmod(0o600)
PY
install -m 644 "$source_dir/systemd/moriitalks-api.service" /etc/systemd/system/moriitalks-api.service
install -d -m 755 /etc/systemd/system/caddy.service.d
install -m 644 "$source_dir/systemd/caddy-moriitalks.conf" /etc/systemd/system/caddy.service.d/moriitalks.conf
install -m 644 "$source_dir/caddy/Caddyfile" /etc/caddy/Caddyfile
systemctl daemon-reload

# Validation does not start the public listener, first activate a verified release.
python3 - <<'PY'
from pathlib import Path
import os
import subprocess

env = dict(os.environ)
for line in Path('/etc/moriitalks/caddy.env').read_text().splitlines():
    if line and not line.startswith('#'):
        key, value = line.split('=', 1)
        env[key] = value
subprocess.run(['caddy', 'validate', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'], env=env, check=True)
PY
printf 'Host configured. Backup: %s\nActivate a release before unmasking and starting Caddy.\n' "$backup"
