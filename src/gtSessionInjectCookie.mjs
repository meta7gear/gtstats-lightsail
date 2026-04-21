import {
  getBrowserConfig,
  getGranTurismoConfig,
  getSessionPaths,
  injectSessionCookie,
  launchPersistentBrowser,
  loadEnv,
  maskSecret,
  requestGranTurismoToken,
  saveSessionSnapshot,
} from './gtSessionShared.mjs';

const main = async () => {
  loadEnv();

  const sessionId = process.argv[2]?.trim();
  if (!sessionId) {
    throw new Error(
      'Missing cookie value. Usage: pnpm run gt-session-inject-cookie "<JSESSIONID value>"',
    );
  }

  const { browserProfileDir, sessionFilePath } = getSessionPaths();
  const { baseUrl, tokenUrl, sessionCookieName } = getGranTurismoConfig();
  const { browserType, executablePath, channel } = getBrowserConfig();

  console.log(`Injecting ${sessionCookieName} into browser profile at ${browserProfileDir}`);
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
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});

    await injectSessionCookie({
      context,
      baseUrl,
      sessionCookieName,
      sessionId,
    });

    const tokenData = await requestGranTurismoToken(sessionId, tokenUrl, sessionCookieName);
    const saved = await saveSessionSnapshot({
      sessionFilePath,
      sessionId,
      source: 'manual-cookie-injection',
      tokenPreview: maskSecret(tokenData.accessToken),
    });

    console.log(`Saved ${sessionCookieName} to ${saved.savedTargets.join(', ')}`);
    console.log(`Session: ${maskSecret(saved.sessionId)}`);
    console.log(`Access token: ${maskSecret(tokenData.accessToken)}`);
    console.log('Cookie injection completed successfully.');
  } finally {
    await context.close();
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
