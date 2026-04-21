# GT Session Worker on Lightsail

This worker keeps a Gran Turismo web session alive on an always-on VM and writes the latest `JSESSIONID`
to Firestore so the Vercel app can fetch GT API tokens without depending on a browser on a personal machine.

This setup is based on AWS Lightsail instance behavior documented here:

- Create a Linux instance: https://docs.aws.amazon.com/lightsail/latest/userguide/getting-started-with-amazon-lightsail.html
- Connect with browser SSH: https://docs.aws.amazon.com/lightsail/latest/userguide/lightsail-how-to-connect-to-your-instance-virtual-private-server.html
- Keep the same IP with a static IP: https://docs.aws.amazon.com/lightsail/latest/userguide/understanding-static-ip-addresses-in-amazon-lightsail.html
- Create snapshots: https://docs.aws.amazon.com/lightsail/latest/userguide/lightsail-how-to-create-a-snapshot-of-your-instance.html
- Pricing: https://aws.amazon.com/lightsail/pricing/

## Recommended Shape

- Lightsail instance: Ubuntu or Debian
- worker repo path: `/opt/gt-session-worker`
- session store: Firestore
- app host: Vercel
- browser: Google Chrome

## Worker Environment

Use these settings on both the worker and Vercel:

```env
GRAN_TURISMO_SESSION_STORE=firestore
GRAN_TURISMO_SESSION_COLLECTION=systemState
GRAN_TURISMO_SESSION_DOCUMENT=granTurismoSession
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...
```

Use these worker-specific settings on Lightsail:

```env
GRAN_TURISMO_BROWSER_TYPE=chromium
GRAN_TURISMO_BROWSER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
GRAN_TURISMO_BROWSER_PROFILE_DIR=/var/lib/gtstats/gran-turismo/browser-profile
GRAN_TURISMO_REGION=au
```

## Install the Worker

```bash
sudo mkdir -p /opt
sudo chown "$USER":"$USER" /opt
git clone YOUR_WORKER_REPO_URL /opt/gt-session-worker
cd /opt/gt-session-worker
pnpm install
```

## Create the Worker Env File

```bash
sudo mkdir -p /etc/gtstats
sudo cp /opt/gt-session-worker/lightsail/gt-session-worker.env.example /etc/gtstats/gt-session-worker.env
sudo chmod 600 /etc/gtstats/gt-session-worker.env
sudo nano /etc/gtstats/gt-session-worker.env
sudo mkdir -p /var/lib/gtstats/gran-turismo/browser-profile
sudo chown -R "$USER":"$USER" /var/lib/gtstats
```

## One-Time Manual Login

Connect over RDP, open a terminal on the VM desktop, then run:

```bash
cd /opt/gt-session-worker
set -a
source /etc/gtstats/gt-session-worker.env
set +a
pnpm run gt-session-login
```

Complete the Sony / GT sign-in in Chrome and wait for the script to save the session to Firestore.

## Install the Refresh Timer

On Ubuntu, make sure the service user is `ubuntu`.

```bash
sudo cp /opt/gt-session-worker/lightsail/gt-session-refresh.service /etc/systemd/system/gt-session-refresh.service
sudo cp /opt/gt-session-worker/lightsail/gt-session-refresh.timer /etc/systemd/system/gt-session-refresh.timer
sudo sed -i 's/^User=.*/User=ubuntu/' /etc/systemd/system/gt-session-refresh.service
sudo systemctl daemon-reload
sudo systemctl enable --now gt-session-refresh.timer
```

Check status:

```bash
systemctl status gt-session-refresh.timer --no-pager
journalctl -u gt-session-refresh.service -n 100 --no-pager
```

## Vercel

Set the same Firestore session env vars in Vercel:

```env
GRAN_TURISMO_SESSION_STORE=firestore
GRAN_TURISMO_SESSION_COLLECTION=systemState
GRAN_TURISMO_SESSION_DOCUMENT=granTurismoSession
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...
```
