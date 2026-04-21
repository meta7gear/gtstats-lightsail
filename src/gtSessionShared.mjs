import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { chromium, firefox, webkit } from 'playwright';

const DEFAULT_BROWSER_PROFILE_DIR = '.data/gran-turismo/browser-profile';
const DEFAULT_SESSION_FILE = '.data/gran-turismo/session.json';
const DEFAULT_REGION = 'au';
const DEFAULT_GT_BASE_URL = `https://www.gran-turismo.com/${DEFAULT_REGION}/gt7`;
const DEFAULT_SIGNIN_URL = `${DEFAULT_GT_BASE_URL}/user/signin/`;
const DEFAULT_TOKEN_URL = `${DEFAULT_GT_BASE_URL}/info/api/token/`;
const DEFAULT_SESSION_COOKIE_NAME = 'JSESSIONID';
const DEFAULT_BROWSER_TYPE = 'chromium';
const DEFAULT_SESSION_COLLECTION = 'systemState';
const DEFAULT_SESSION_DOCUMENT = 'granTurismoSession';

const ensureAbsolute = (cwd, targetPath) => {
  if (!targetPath) {
    return cwd;
  }

  if (targetPath.startsWith('/')) {
    return targetPath;
  }

  return resolve(cwd, targetPath);
};

export const loadEnvFile = (path) => {
  if (!existsSync(path)) {
    return;
  }

  const file = readFileSync(path, 'utf8');
  const lines = file.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith('\'') && value.endsWith('\''))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
};

export const loadEnv = () => {
  const cwd = process.cwd();
  loadEnvFile(resolve(cwd, '.env'));
  loadEnvFile(resolve(cwd, '.env.local'));
};

export const getSessionPaths = () => {
  const cwd = process.cwd();

  return {
    browserProfileDir: ensureAbsolute(
      cwd,
      process.env.GRAN_TURISMO_BROWSER_PROFILE_DIR || DEFAULT_BROWSER_PROFILE_DIR,
    ),
    sessionFilePath: ensureAbsolute(
      cwd,
      process.env.GRAN_TURISMO_SESSION_FILE || DEFAULT_SESSION_FILE,
    ),
  };
};

export const getSessionStoreConfig = () => {
  const mode = (process.env.GRAN_TURISMO_SESSION_STORE || 'auto').trim().toLowerCase();
  const collectionName = process.env.GRAN_TURISMO_SESSION_COLLECTION || DEFAULT_SESSION_COLLECTION;
  const documentId = process.env.GRAN_TURISMO_SESSION_DOCUMENT || DEFAULT_SESSION_DOCUMENT;

  return {
    mode,
    collectionName,
    documentId,
  };
};

export const getGranTurismoConfig = () => {
  const region = process.env.GRAN_TURISMO_REGION || DEFAULT_REGION;
  const baseUrl = process.env.GRAN_TURISMO_BASE_URL || `https://www.gran-turismo.com/${region}/gt7`;
  const signinUrl = process.env.GRAN_TURISMO_SIGNIN_URL || `${baseUrl}/user/signin/`;
  const tokenUrl = process.env.GRAN_TURISMO_TOKEN_URL || `${baseUrl}/info/api/token/`;
  const sessionCookieName = process.env.GRAN_TURISMO_SESSION_COOKIE_NAME || DEFAULT_SESSION_COOKIE_NAME;

  return {
    region,
    baseUrl,
    signinUrl,
    tokenUrl,
    sessionCookieName,
  };
};

export const getBrowserConfig = () => {
  const browserType = process.env.GRAN_TURISMO_BROWSER_TYPE || DEFAULT_BROWSER_TYPE;
  const executablePath = process.env.GRAN_TURISMO_BROWSER_EXECUTABLE_PATH || null;
  const channel = process.env.GRAN_TURISMO_BROWSER_CHANNEL || null;

  return {
    browserType,
    executablePath,
    channel,
  };
};

const getBrowserLauncher = (browserType) => {
  switch (browserType) {
    case 'chromium':
      return chromium;
    case 'firefox':
      return firefox;
    case 'webkit':
      return webkit;
    default:
      throw new Error(
        `Unsupported GRAN_TURISMO_BROWSER_TYPE=${browserType}. Use chromium, firefox, or webkit.`,
      );
  }
};

export const launchPersistentBrowser = async ({
  browserProfileDir,
  browserType,
  executablePath,
  channel,
  headless,
}) => {
  const launcher = getBrowserLauncher(browserType);
  const launchOptions = {
    headless,
    viewport: { width: 1440, height: 960 },
  };

  if (executablePath) {
    launchOptions.executablePath = executablePath;
  } else if (channel) {
    launchOptions.channel = channel;
  }

  return launcher.launchPersistentContext(browserProfileDir, launchOptions);
};

export const ensureParentDirectory = (filePath) => {
  mkdirSync(dirname(filePath), { recursive: true });
};

export const writeSessionFile = ({ sessionFilePath, sessionId, source, tokenPreview }) => {
  ensureParentDirectory(sessionFilePath);

  const payload = {
    sessionId,
    source,
    tokenPreview,
    updatedAt: new Date().toISOString(),
  };

  writeFileSync(sessionFilePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
};

const hasFirebaseAdminConfig = () => {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID
    && process.env.FIREBASE_CLIENT_EMAIL
    && process.env.FIREBASE_PRIVATE_KEY,
  );
};

const getAdminDb = () => {
  if (!getApps().length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('Missing FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, or FIREBASE_PRIVATE_KEY');
    }

    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }

  return getFirestore();
};

export const saveSessionSnapshot = async ({
  sessionFilePath,
  sessionId,
  source,
  tokenPreview,
}) => {
  const savedTargets = [];
  const payload = {
    sessionId,
    source,
    tokenPreview,
    updatedAt: new Date().toISOString(),
  };
  const { mode, collectionName, documentId } = getSessionStoreConfig();

  const shouldWriteFile = mode === 'auto' || mode === 'file' || mode === 'both';
  const shouldWriteFirestore = (
    mode === 'firestore'
    || mode === 'both'
    || (mode === 'auto' && hasFirebaseAdminConfig())
  );

  if (shouldWriteFile) {
    writeSessionFile({ sessionFilePath, sessionId, source, tokenPreview });
    savedTargets.push(`file:${sessionFilePath}`);
  }

  if (shouldWriteFirestore) {
    const db = getAdminDb();
    await db.collection(collectionName).doc(documentId).set(payload, { merge: true });
    savedTargets.push(`firestore:${collectionName}/${documentId}`);
  }

  if (savedTargets.length === 0) {
    throw new Error(
      'No Gran Turismo session store is enabled. Set GRAN_TURISMO_SESSION_STORE to auto, file, firestore, or both.',
    );
  }

  return {
    ...payload,
    savedTargets,
  };
};

export const maskSecret = (value) => {
  if (!value) {
    return '(missing)';
  }

  if (value.length <= 10) {
    return `${value.slice(0, 3)}...`;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
};

export const extractSessionCookie = async (context, { baseUrl, sessionCookieName }) => {
  const cookies = await context.cookies(baseUrl);
  const sessionCookie = cookies.find((cookie) => cookie.name === sessionCookieName);

  if (!sessionCookie?.value) {
    throw new Error(
      `Could not find ${sessionCookieName} for ${baseUrl}. The browser profile may need to be signed in again.`,
    );
  }

  return sessionCookie.value;
};

export const requestGranTurismoToken = async (
  sessionId,
  tokenUrl,
  sessionCookieName = DEFAULT_SESSION_COOKIE_NAME,
) => {
  const response = await fetch(tokenUrl, {
    headers: {
      Cookie: `${sessionCookieName}=${sessionId}`,
    },
  });

  const rawBody = await response.text();
  let parsedBody = null;

  try {
    parsedBody = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    parsedBody = null;
  }

  if (!response.ok) {
    throw new Error(
      `Token endpoint returned ${response.status}. Body: ${rawBody || '(empty response)'}`,
    );
  }

  const accessToken = parsedBody?.access_token;
  if (!accessToken) {
    throw new Error(`Token endpoint response did not include access_token. Body: ${rawBody || '(empty response)'}`);
  }

  return {
    accessToken,
    expiresIn: parsedBody?.expires_in ?? null,
  };
};
