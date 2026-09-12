#!/bin/bash
# One-shot VPS setup script for Ubuntu 22.04 (Hostinger / DigitalOcean / etc.)
# Run as root: bash setup-vps.sh

set -e

DOMAIN=""
EMAIL=""
REPO_URL=""

read -p "🌐 Enter your domain (e.g. pharmacy.example.com): " DOMAIN
read -p "📧 Enter your email (for SSL certificate): " EMAIL
read -p "📁 Enter your GitHub repo URL (e.g. https://github.com/USER/REPO.git): " REPO_URL

echo "🔄 Updating system..."
apt update && apt upgrade -y

echo "📦 Installing Node.js 20 + npm + PM2 + Nginx + Certbot..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs nginx certbot python3-certbot-nginx git ufw
npm install -g pm2

echo "📥 Cloning repository..."
mkdir -p /var/www
cd /var/www
if [ -d pharmacy ]; then
  echo "⚠️  /var/www/pharmacy already exists, pulling latest..."
  cd pharmacy && git pull
else
  git clone "$REPO_URL" pharmacy
  cd pharmacy
fi

if [ ! -f .env ]; then
  echo "⚠️  IMPORTANT: Copy .env.example to .env and fill in your Supabase keys before continuing."
  echo "   Run: cp .env.example .env && nano .env"
  echo "   Then re-run this script or continue manually."
  cp .env.example .env
  ${EDITOR:-nano} .env
fi

echo "🏗️  Building app..."
npm install
NODE_OPTIONS="--max-old-space-size=2048" npm run build

echo "🚀 Starting with PM2..."
if pm2 describe Emergent > /dev/null 2>&1; then
  pm2 restart Emergent --update-env
else
  pm2 start "npm start" --name Emergent
fi
pm2 save
pm2 startup systemd -u root --hp /root | tail -1 | bash || true

echo "🌐 Configuring Nginx for $DOMAIN..."
cat > /etc/nginx/sites-available/pharmacy << EOF
server {
    listen 80;
    server_name $DOMAIN;
    client_max_body_size 50M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF
ln -sf /etc/nginx/sites-available/pharmacy /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "🔒 Setting up firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo "🔐 Requesting SSL certificate from Let's Encrypt..."
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" || echo "⚠️  SSL setup failed — you can run 'certbot --nginx -d $DOMAIN' manually later."

echo ""
echo "✅ ============================================"
echo "✅  Deployment complete!"
echo "✅  Open: https://$DOMAIN"
echo "✅ ============================================"
pm2 status Emergent
