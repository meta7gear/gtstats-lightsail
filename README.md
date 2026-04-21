# GT Session Worker

This package is the standalone browser worker for Gran Turismo session maintenance.
It is intended to live separately from the Nuxt frontend app and write the latest `JSESSIONID`
to Firestore for the main site to consume.

## What It Does

- opens a persistent browser profile
- completes the Sony / Gran Turismo login flow once
- refreshes the GT session on a schedule
- writes the latest session to Firestore

## Environment

Shared with the main site:

```env
GRAN_TURISMO_SESSION_STORE=firestore
GRAN_TURISMO_SESSION_COLLECTION=systemState
GRAN_TURISMO_SESSION_DOCUMENT=granTurismoSession
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...
```

Worker-specific:

```env
GRAN_TURISMO_BROWSER_TYPE=chromium
GRAN_TURISMO_BROWSER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
GRAN_TURISMO_BROWSER_PROFILE_DIR=/var/lib/gtstats/gran-turismo/browser-profile
GRAN_TURISMO_REGION=au
```

Optional:

- `GRAN_TURISMO_SESSION_FILE`
- `GRAN_TURISMO_BROWSER_CHANNEL`
- `GRAN_TURISMO_BASE_URL`
- `GRAN_TURISMO_SIGNIN_URL`
- `GRAN_TURISMO_TOKEN_URL`
- `GRAN_TURISMO_SESSION_COOKIE_NAME`

## Scripts

Install dependencies:

```bash
pnpm install
```

One-time login:

```bash
pnpm run gt-session-login
```

Scheduled refresh:

```bash
pnpm run gt-session-refresh
```

## Lightsail

Lightsail notes and helper files live in [lightsail/README.md](/Users/mattbarton/Sites/gtstats.live/gt-session-worker/lightsail/README.md:1).
