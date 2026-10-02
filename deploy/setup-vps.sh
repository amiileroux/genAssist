#!/usr/bin/env bash
# One-time setup for a fresh Ubuntu 22.04/24.04 VM (e.g. an Oracle Cloud
# "Always Free" instance) to run genAssist permanently, with a real HTTPS
# URL, at zero recurring cost.
#
# Prerequisites YOU must do first (none of this can be scripted for you):
#   1. Create the VM (Oracle Cloud Always Free, or any Ubuntu box you own)
#      and note its public IP address.
#   2. Create a free subdomain at https://www.duckdns.org pointing at that
#      IP (e.g. genassist-yourco.duckdns.org). DuckDNS needs updating if
#      the IP ever changes — Oracle Always Free VMs keep a fixed IP, so a
#      one-time setup is enough.
#   3. Open inbound TCP ports 80 and 443 in the VM's firewall/security list
#      (on Oracle Cloud this is a separate "Security List" / "Network
#      Security Group" setting in the console, in addition to the OS
#      firewall this script configures).
#
# Usage (as root, or with sudo, on the VM):
#   sudo DOMAIN=genassist-yourco.duckdns.org REPO_URL=https://github.com/amiileroux/genAssist.git BRANCH=claude/amazing-shannon-1d3yul bash setup-vps.sh
#
# After it finishes, put your SMTP credentials in /opt/genassist/.env (see
# the template this script creates) and run: systemctl restart genassist

set -euo pipefail

: "${DOMAIN:?Set DOMAIN=yourname.duckdns.org (or your own domain) before running}"
: "${REPO_URL:=https://github.com/amiileroux/genAssist.git}"
: "${BRANCH:=main}"
APP_DIR=/opt/genassist
SERVICE_USER=genassist

echo "==> Installing Node.js 22"
if ! command -v node >/dev/null || [[ "$(node -v)" < "v22" ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

echo "==> Installing Caddy (free automatic HTTPS via Let's Encrypt)"
if ! command -v caddy >/dev/null; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi

echo "==> Creating dedicated service user"
id -u "$SERVICE_USER" &>/dev/null || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"

echo "==> Fetching genAssist ($REPO_URL @ $BRANCH) into $APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch origin "$BRANCH"
  git -C "$APP_DIR" checkout "$BRANCH"
  git -C "$APP_DIR" pull origin "$BRANCH"
else
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

echo "==> Installing dependencies"
cd "$APP_DIR"
npm install --omit=dev

if [ ! -f "$APP_DIR/.env" ]; then
  echo "==> Creating $APP_DIR/.env template — fill this in with real values, then: systemctl restart genassist"
  cat > "$APP_DIR/.env" <<EOF
PORT=3000
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=
ADMIN_EMAIL=amii.aral@enbfocus.com
EOF
fi

chown -R "$SERVICE_USER":"$SERVICE_USER" "$APP_DIR"
chmod 600 "$APP_DIR/.env"

echo "==> Writing systemd service"
cat > /etc/systemd/system/genassist.service <<EOF
[Unit]
Description=genAssist
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

echo "==> Writing Caddy config (reverse proxy + free automatic HTTPS for $DOMAIN)"
cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
	reverse_proxy localhost:3000
}
EOF

echo "==> Opening firewall (OS-level — also open 80/443 in your cloud provider's console)"
if command -v ufw >/dev/null; then
  ufw allow 22/tcp || true
  ufw allow 80/tcp || true
  ufw allow 443/tcp || true
  ufw --force enable || true
fi

systemctl daemon-reload
systemctl enable --now genassist
systemctl reload-or-restart caddy

echo ""
echo "==> Done. Next steps:"
echo "    1. Edit $APP_DIR/.env with real SMTP credentials (see README's 'Email sending' section)."
echo "    2. systemctl restart genassist"
echo "    3. Visit https://$DOMAIN — Caddy issues the certificate automatically on first request."
