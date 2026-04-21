import {
  extractSessionCookie,
  getBrowserConfig,
  getSessionCookieValue,
  getGranTurismoConfig,
  getSessionPaths,
  getStoredSessionSnapshot,
  injectSessionCookie,
  launchPersistentBrowser,
  loadEnv,
  maskSecret,
  requestGranTurismoToken,
  saveSessionSnapshot,
} from './gtSessionShared.mjs';

const main = async () => {
  loadEnv();

  const { browserProfileDir, sessionFilePath } = getSessionPaths();
  const { signinUrl, tokenUrl, baseUrl, sessionCookieName } = getGranTurismoConfig();
  const { browserType, executablePath, channel } = getBrowserConfig();

  console.log(`Refreshing GT session using persistent browser profile at ${browserProfileDir}`);
  console.log(`Browser type: ${browserType}`);
  if (executablePath) {
    console.log(`Browser executable: ${executablePath}`);
  } else if (channel) {
    console.log(`Browser channel: ${channel}`);
  }

  const context = await launchPersistentBrowser({
    browserProfileDir,
    browserType,
    executablePath,
    channel,
    headless: true,
  });

  try {
    const page = context.pages()[0] || await context.newPage();
    await page.goto(signinUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});

    const storedSession = await getStoredSessionSnapshot();
    const currentSessionId = await getSessionCookieValue(context, { baseUrl, sessionCookieName });

    if (storedSession?.sessionId && storedSession.sessionId !== currentSessionId) {
      console.log(
        `Updating browser profile ${sessionCookieName} from Firestore session source=${storedSession.source}`,
      );
      await injectSessionCookie({
        context,
        baseUrl,
        sessionCookieName,
        sessionId: storedSession.sessionId,
      });
      await page.goto(signinUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    }

    const sessionId = await extractSessionCookie(context, { baseUrl, sessionCookieName });
    const tokenData = await requestGranTurismoToken(sessionId, tokenUrl, sessionCookieName);

    const saved = await saveSessionSnapshot({
      sessionFilePath,
      sessionId,
      source: 'playwright-refresh',
      tokenPreview: maskSecret(tokenData.accessToken),
    });

    console.log(`Saved ${sessionCookieName} to ${saved.savedTargets.join(', ')}`);
    console.log(`Session: ${maskSecret(saved.sessionId)}`);
    console.log(`Access token: ${maskSecret(tokenData.accessToken)}`);
    console.log(
      tokenData.expiresIn
        ? `Token endpoint responded with expires_in=${tokenData.expiresIn}`
        : 'Token endpoint responded without expires_in',
    );
  } finally {
    await context.close();
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
