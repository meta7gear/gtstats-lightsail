import {
  extractSessionCookie,
  getBrowserConfig,
  getGranTurismoConfig,
  getSessionPaths,
  launchPersistentBrowser,
  loadEnv,
  maskSecret,
  requestGranTurismoToken,
  saveSessionSnapshot,
} from './gtSessionShared.mjs';

const SUCCESS_CHECK_INTERVAL_MS = 2_000;
const SUCCESS_TIMEOUT_MS = 10 * 60 * 1000;

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const openSigninPage = async (page, signinUrl) => {
  try {
    await page.goto(signinUrl, { waitUntil: 'commit', timeout: 30_000 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Initial navigation warning: ${message}`);
  }

  await page.waitForLoadState('domcontentloaded', { timeout: 30_000 }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`DOMContentLoaded wait warning: ${message}`);
  });
};

const main = async () => {
  loadEnv();

  const { browserProfileDir, sessionFilePath } = getSessionPaths();
  const { signinUrl, tokenUrl, baseUrl, sessionCookieName } = getGranTurismoConfig();
  const { browserType, executablePath, channel } = getBrowserConfig();

  console.log(`Opening persistent browser profile at ${browserProfileDir}`);
  console.log(`Sign-in page: ${signinUrl}`);
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
    headless: false,
  });

  try {
    const page = context.pages()[0] || await context.newPage();
    page.on('close', () => {
      console.warn('Login page was closed.');
    });
    page.on('crash', () => {
      console.warn('Login page crashed.');
    });
    context.on('close', () => {
      console.warn('Browser context was closed.');
    });

    await openSigninPage(page, signinUrl);

    console.log('');
    console.log('Complete the Sony / Gran Turismo sign-in flow in the opened browser window.');
    console.log(`This script will wait until ${sessionCookieName} can successfully fetch a GT API token.`);
    console.log('');

    const deadline = Date.now() + SUCCESS_TIMEOUT_MS;

    while (Date.now() < deadline) {
      try {
        const sessionId = await extractSessionCookie(context, { baseUrl, sessionCookieName });
        const tokenData = await requestGranTurismoToken(sessionId, tokenUrl, sessionCookieName);
        const saved = await saveSessionSnapshot({
          sessionFilePath,
          sessionId,
          source: 'playwright-login',
          tokenPreview: maskSecret(tokenData.accessToken),
        });

        console.log(`Saved ${sessionCookieName} to ${saved.savedTargets.join(', ')}`);
        console.log(`Session: ${maskSecret(saved.sessionId)}`);
        console.log(`Access token: ${maskSecret(tokenData.accessToken)}`);
        console.log('Login bootstrap completed successfully.');
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`Waiting for successful login: ${message}`);
        await sleep(SUCCESS_CHECK_INTERVAL_MS);
      }
    }

    throw new Error(
      `Timed out after ${Math.round(SUCCESS_TIMEOUT_MS / 60_000)} minutes waiting for a valid ${sessionCookieName}.`,
    );
  } finally {
    await context.close();
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
