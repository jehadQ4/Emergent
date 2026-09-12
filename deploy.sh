#!/bin/bash
# Deploy/update script for the pharmacy app on a VPS.
# Run from the project root: ./deploy.sh

set -e

echo "🔄 Pulling latest code..."
git pull

echo "📦 Installing dependencies..."
npm install

echo "🏗️  Building production bundle..."
NODE_OPTIONS="--max-old-space-size=2048" npm run build

echo "🔁 Restarting PM2 process..."
if pm2 describe Emergent > /dev/null 2>&1; then
  pm2 restart Emergent --update-env
else
  pm2 start "npm start" --name Emergent
  pm2 save
fi

echo "✅ Done! App is running on http://localhost:3000"
pm2 status Emergent
