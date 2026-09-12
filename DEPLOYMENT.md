# 🚀 Hostinger VPS Deployment Guide

Complete step-by-step deployment guide for the Pharmacy Medicine Search System on Hostinger VPS.

---

## Prerequisites

- A Hostinger **KVM 1** (or higher) VPS with Ubuntu 22.04 LTS
- A domain pointed to your VPS IP (A record in DNS)
- Your Supabase project URL + keys (from `https://supabase.com/dashboard/project/_/settings/api`)

---

## Step 1 — Connect to VPS

```bash
ssh root@YOUR_VPS_IP
```

## Step 2 — Install dependencies (one-time)

```bash
apt update && apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs nginx certbot python3-certbot-nginx git ufw
npm install -g pm2
node -v && npm -v && pm2 -v
```

## Step 3 — Clone the repository

```bash
mkdir -p /var/www
cd /var/www
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git pharmacy
cd pharmacy
```

## Step 4 — Configure environment

```bash
cp .env.example .env
nano .env
```

Fill in your Supabase keys + domain. Save with **Ctrl+O → Enter → Ctrl+X**.

## Step 5 — Build and run

```bash
npm install
npm run build
pm2 start "npm start" --name Emergent
pm2 save
pm2 startup        # then run the command it prints
```

Test locally on the VPS:
```bash
curl http://localhost:3000
```

## Step 6 — Set up Nginx reverse proxy

```bash
nano /etc/nginx/sites-available/pharmacy
```

Paste:
```nginx
server {
    listen 80;
    server_name pharmacy.yourdomain.com;
    client_max_body_size 50M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable:
```bash
ln -s /etc/nginx/sites-available/pharmacy /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

## Step 7 — Free HTTPS with Let's Encrypt

```bash
certbot --nginx -d pharmacy.yourdomain.com
```

Follow the prompts (email + agree to terms). Certbot will auto-renew the certificate.

## Step 8 — Firewall hardening

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
ufw status
```

---

## 🔄 Update Workflow (After Changes)

When you push new code to GitHub:

```bash
cd /var/www/pharmacy
git pull
npm install
NODE_OPTIONS="--max-old-space-size=2048" npm run build
pm2 restart Emergent --update-env
```

Or run the helper script:
```bash
./deploy.sh
```

---

## 🛠️ Troubleshooting

### App not starting / 502 error
```bash
pm2 logs Emergent --lines 50
```

### Nginx config error
```bash
nginx -t
tail -f /var/log/nginx/error.log
```

### Out of memory during build (small VPS)
Increase build memory:
```bash
NODE_OPTIONS="--max-old-space-size=2048" npm run build
```

### Reset PM2 after VPS reboot doesn't restart app
```bash
pm2 startup
# Run the command it prints, then:
pm2 save
```

---

## 🌐 DNS Setup (Hostinger)

1. Hostinger Dashboard → **Domains** → your domain → **DNS / Nameservers**
2. Add an **A record**:
   - Name: `pharmacy` (or `@` for root domain)
   - Points to: your VPS IP
   - TTL: 14400
3. Wait 5–30 minutes for DNS propagation
4. Verify with: `dig pharmacy.yourdomain.com +short`

---

## ✅ Post-Deployment Checklist

- [ ] App loads on https://pharmacy.yourdomain.com
- [ ] HTTPS certificate is valid (padlock icon)
- [ ] Admin can log in
- [ ] Admin can upload an Excel file
- [ ] Search returns results from the latest upload
- [ ] Staff users (created from Users tab) can only search
- [ ] Default admin password changed to a strong one
- [ ] `.env` file permissions: `chmod 600 .env`
