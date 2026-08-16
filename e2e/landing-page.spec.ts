import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

type ScrollSurfaceMetrics = {
  clientHeight: number;
  footerBottom: number;
  scrollHeight: number;
};

function readPngDimensions(screenshot: Buffer) {
  if (screenshot.length < 24 || screenshot.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error('Expected a PNG screenshot');
  }
  return {
    width: screenshot.readUInt32BE(16),
    height: screenshot.readUInt32BE(20),
  };
}

async function waitForLandingAssets(page: Page) {
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Log transactions to Google Sheets in seconds',
  );
  await expect(page.locator('footer')).toContainText('Privacy');

  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images).map(async (image) => {
        if (!image.complete) {
          await new Promise<void>((resolve, reject) => {
            const cleanup = () => {
              image.removeEventListener('load', handleLoad);
              image.removeEventListener('error', handleError);
            };
            const handleLoad = () => {
              cleanup();
              resolve();
            };
            const handleError = () => {
              cleanup();
              reject(new Error(`Failed to load image: ${image.currentSrc || image.src}`));
            };
            image.addEventListener('load', handleLoad, { once: true });
            image.addEventListener('error', handleError, { once: true });
            if (image.complete) {
              if (image.naturalWidth > 0) {
                handleLoad();
              } else {
                handleError();
              }
            }
          });
        }
        if (image.naturalWidth === 0) {
          throw new Error(`Failed to decode image: ${image.currentSrc || image.src}`);
        }
        await image.decode();
      }),
    );
  });
}

async function waitForTwoAnimationFrames(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

async function revealLandingSections(page: Page, landingSurface: Locator) {
  const scrollRange = await landingSurface.evaluate((surface) => ({
    clientHeight: surface.clientHeight,
    maxScrollTop: surface.scrollHeight - surface.clientHeight,
  }));
  const scrollStep = Math.max(1, Math.floor(scrollRange.clientHeight * 0.75));
  for (let scrollTop = 0; scrollTop < scrollRange.maxScrollTop; scrollTop += scrollStep) {
    await landingSurface.evaluate((surface, nextScrollTop) => {
      surface.scrollTop = nextScrollTop;
    }, scrollTop);
    await waitForTwoAnimationFrames(page);
  }
  await landingSurface.evaluate((surface, maxScrollTop) => {
    surface.scrollTop = maxScrollTop;
  }, scrollRange.maxScrollTop);
  await waitForTwoAnimationFrames(page);
  await landingSurface.evaluate((surface) => {
    surface.scrollTop = 0;
    surface.scrollLeft = 0;
  });
  await waitForTwoAnimationFrames(page);
}

async function measureLandingSurface(landingSurface: Locator): Promise<ScrollSurfaceMetrics> {
  return landingSurface.evaluate((surface) => {
    const footer = surface.querySelector('footer');
    if (!footer) {
      throw new Error('Landing footer is missing from the scroll surface');
    }
    const surfaceRect = surface.getBoundingClientRect();
    const footerRect = footer.getBoundingClientRect();
    return {
      clientHeight: surface.clientHeight,
      footerBottom: footerRect.bottom - surfaceRect.top + surface.scrollTop,
      scrollHeight: surface.scrollHeight,
    };
  });
}

async function captureExpandedLandingSurface(
  landingSurface: Locator,
  screenshotPath: string,
  targetHeight: number,
) {
  const styleSnapshot = await landingSurface.evaluate((surface, expandedHeight) => {
    const root = document.getElementById('root');
    if (!root) {
      throw new Error('Missing root element');
    }
    const snapshot = {
      bodyStyle: document.body.getAttribute('style'),
      htmlStyle: document.documentElement.getAttribute('style'),
      rootStyle: root.getAttribute('style'),
      surfaceScrollLeft: surface.scrollLeft,
      surfaceScrollTop: surface.scrollTop,
      surfaceStyle: surface.getAttribute('style'),
      windowScrollX: window.scrollX,
      windowScrollY: window.scrollY,
    };

    document.documentElement.style.height = 'auto';
    document.documentElement.style.overflow = 'visible';
    document.body.style.position = 'static';
    document.body.style.inset = 'auto';
    document.body.style.height = 'auto';
    document.body.style.overflow = 'visible';
    root.style.height = 'auto';
    surface.style.height = `${expandedHeight}px`;
    surface.style.maxHeight = 'none';
    surface.style.overflowX = 'hidden';
    surface.style.overflowY = 'visible';

    return snapshot;
  }, Math.ceil(targetHeight));

  try {
    await expect
      .poll(() => landingSurface.evaluate((surface) => surface.getBoundingClientRect().height))
      .toBeGreaterThanOrEqual(Math.floor(targetHeight));
    return await landingSurface.screenshot({
      path: screenshotPath,
      animations: 'disabled',
    });
  } finally {
    await landingSurface.evaluate((surface, snapshot) => {
      const root = document.getElementById('root');
      if (!root) {
        throw new Error('Missing root element');
      }
      const restoreStyle = (element: HTMLElement, style: string | null) => {
        if (style === null) {
          element.removeAttribute('style');
        } else {
          element.setAttribute('style', style);
        }
      };
      restoreStyle(document.documentElement, snapshot.htmlStyle);
      restoreStyle(document.body, snapshot.bodyStyle);
      restoreStyle(root, snapshot.rootStyle);
      restoreStyle(surface, snapshot.surfaceStyle);
      surface.scrollLeft = snapshot.surfaceScrollLeft;
      surface.scrollTop = snapshot.surfaceScrollTop;
      window.scrollTo(snapshot.windowScrollX, snapshot.windowScrollY);
    }, styleSnapshot);
  }
}

function artifactSuffix(testInfo: TestInfo) {
  return testInfo.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function getVisibleIphoneFrame(page: Page) {
  return page
    .getByRole('img', { name: 'iPhone 17 frame' })
    .filter({ visible: true });
}

async function activateVisibleDemo(page: Page) {
  const iphoneFrame = getVisibleIphoneFrame(page);
  await expect(iphoneFrame).toBeVisible();

  const activateButton = iphoneFrame.getByRole('button', { name: 'Activate demo' });
  await expect(activateButton).toBeVisible();
  await activateButton.click();

  const transactionDemo = iphoneFrame.getByTestId('transaction-flow-demo');
  await expect(transactionDemo).toBeVisible();
  return transactionDemo;
}

test.describe('Landing Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('displays hero section with key messaging', async ({ page }) => {
    // Check main headline emphasizes speed
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Log transactions to Google Sheets in seconds',
    );

    // Check Google Sheets integration is mentioned
    await expect(page.getByText(/Google Sheet/i).first()).toBeVisible();
  });

  test('shows the interactive iPhone demo', async ({ page }) => {
    const iphoneFrame = getVisibleIphoneFrame(page);
    await expect(iphoneFrame).toBeVisible();
  });

  test('demo can be activated and shows transaction flow', async ({ page }) => {
    await activateVisibleDemo(page);
  });

  test('has navigation to app', async ({ page }) => {
    const continueLink = page.getByRole('link', { name: 'Continue in browser' });
    await expect(continueLink).toBeVisible();
    await expect(continueLink).toHaveAttribute('href', '/app');

    const browserLink = page.getByRole('link', { name: 'Try in browser' });
    await expect(browserLink).toBeVisible();
    await expect(browserLink).toHaveAttribute('href', '/app');
  });

  test('shows install tips for mobile platforms', async ({ page }) => {
    await expect(page.getByText(/iPhone \/ iPad/i)).toBeVisible();
    await expect(page.getByText(/Android \/ Chrome/i)).toBeVisible();
  });

  test('displays what SheetLog does section', async ({ page }) => {
    await expect(page.getByText(/What SheetLog does/i)).toBeVisible();
    await expect(page.getByText(/One-tap entry/i)).toBeVisible();
    await expect(page.getByText(/Works offline: entries queue/i)).toBeVisible();
  });

  test('footer contains privacy and terms links', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer.getByRole('link', { name: 'Privacy' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Terms' })).toBeVisible();
  });
});

test.describe('Landing Page - Rapid Logging Demo', () => {
  test('demo shows timing badge after transaction completes', async ({ page }) => {
    await page.goto('/');

    const transactionDemo = await activateVisibleDemo(page);
    await transactionDemo
      .getByRole('button', { name: 'Coffee & Snacks', exact: true })
      .click();

    const dateDrawer = getVisibleIphoneFrame(page).getByRole('dialog', {
      name: 'Date & time',
    });
    await expect(dateDrawer).toBeVisible();
    await dateDrawer.getByRole('button', { name: 'Done' }).click();

    const keypad = transactionDemo.getByRole('group', { name: 'Amount keypad' });
    await keypad.getByRole('button', { name: '1', exact: true }).click();
    await transactionDemo.getByRole('button', { name: 'Submit', exact: true }).click();

    await expect(transactionDemo.getByText('Payment Successful')).toBeVisible();
    await expect(transactionDemo.getByText(/^\d+\.\d+s$/)).toBeVisible();
  });
});

test.describe('Landing Page - Google Sheets Integration Messaging', () => {
  test('emphasizes data ownership with Google Sheets', async ({ page }) => {
    await page.goto('/');

    // Check for Google Sheets mentions
    const sheetsText = page.getByText(/Google Sheet/i);
    await expect(sheetsText.first()).toBeVisible();

    // Check for data ownership messaging
    await expect(page.getByText(/you own your data/i)).toBeVisible();
  });

  test('FAQ explains Google access permissions', async ({ page }) => {
    await page.goto('/');

    // Click to expand FAQ
    const faqTrigger = page.getByRole('button', { name: /Why Google access is requested/i });
    await expect(faqTrigger).toBeVisible();
    await faqTrigger.click();

    // Check FAQ content is visible
    await expect(page.getByText(/Google Sheets: create and update/i)).toBeVisible();
    await expect(page.getByText(/Google Drive: locate\/create/i)).toBeVisible();
  });
});

test.describe('Landing Page - Speed and Visual Elements', () => {
  test('displays speed badge with entry time', async ({ page }) => {
    await page.goto('/');

    // Check for speed badge showing "<3 seconds"
    await expect(page.getByText(/<3/)).toBeVisible();
    await expect(page.getByText(/seconds/i).first()).toBeVisible();
    await expect(page.getByText(/Average entry time/i)).toBeVisible();
  });

  test('shows value proposition cards', async ({ page }) => {
    await page.goto('/');

    // Check for the three main value props
    await expect(page.getByRole('heading', { name: 'Lightning fast' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your data in Google Sheets' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Works offline' })).toBeVisible();
  });

  test('displays Google Sheets icon with gradient branding', async ({ page }) => {
    await page.goto('/');

    // The headline should include Google Sheets with the sheet icon
    const headline = page.getByRole('heading', { level: 1 });
    await expect(headline).toContainText('Google Sheets');
  });

  test('captures landing page screenshot for visual review', async ({ page }, testInfo) => {
    await page.goto('/');
    await waitForLandingAssets(page);

    const hero = page.locator('main section').first();
    const landingSurface = page.getByRole('main').locator('..');
    await expect(hero).toBeVisible();
    await revealLandingSections(page, landingSurface);
    const detailsOpacity = await page
      .getByText('What SheetLog does', { exact: true })
      .evaluate((element) => {
        let current: Element | null = element;
        let effectiveOpacity = 1;
        while (current && current !== document.body) {
          effectiveOpacity *= Number.parseFloat(getComputedStyle(current).opacity);
          current = current.parentElement;
        }
        return effectiveOpacity;
      });
    expect(detailsOpacity).toBeGreaterThan(0);

    const surfaceMetrics = await measureLandingSurface(landingSurface);
    const suffix = artifactSuffix(testInfo);
    const fullScreenshotPath = testInfo.outputPath(`landing-page-full-${suffix}.png`);
    const heroScreenshotPath = testInfo.outputPath(`landing-page-hero-${suffix}.png`);

    // Expand the app's internal scroll surface before capturing it.
    const fullScreenshot = await captureExpandedLandingSurface(
      landingSurface,
      fullScreenshotPath,
      surfaceMetrics.scrollHeight,
    );
    const devicePixelRatio = await page.evaluate(() => window.devicePixelRatio);
    const viewport = page.viewportSize();
    if (!viewport) {
      throw new Error('Landing screenshot requires a viewport');
    }
    const fullDimensions = readPngDimensions(fullScreenshot);
    const screenshotHeight = fullDimensions.height / devicePixelRatio;
    expect(surfaceMetrics.scrollHeight).toBeGreaterThan(surfaceMetrics.clientHeight);
    expect(surfaceMetrics.footerBottom).toBeGreaterThan(surfaceMetrics.clientHeight);
    expect(fullDimensions.height).toBeGreaterThan(viewport.height * devicePixelRatio);
    expect(screenshotHeight).toBeGreaterThanOrEqual(surfaceMetrics.scrollHeight - 1);
    expect(screenshotHeight).toBeGreaterThanOrEqual(surfaceMetrics.footerBottom - 1);
    testInfo.annotations.push({
      type: 'screenshot-dimensions',
      description: `${fullDimensions.width}x${fullDimensions.height}px (${surfaceMetrics.scrollHeight}px scroll surface)`,
    });
    await testInfo.attach('landing-page-full', {
      path: fullScreenshotPath,
      contentType: 'image/png',
    });

    const heroScreenshot = await hero.screenshot({
      path: heroScreenshotPath,
      animations: 'disabled',
    });
    expect(readPngDimensions(heroScreenshot).height).toBeGreaterThan(0);
    await testInfo.attach('landing-page-hero', {
      path: heroScreenshotPath,
      contentType: 'image/png',
    });
  });
});

test.describe('Landing Page - Spreadsheet Preview', () => {
  test('shows live sync indicator on desktop', async ({ page }) => {
    // Set viewport to desktop size
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    // Check for live sync text (only visible on lg screens)
    const syncText = page
      .getByText('Syncing to Google Sheets', { exact: true })
      .filter({ visible: true });
    await expect(syncText).toBeVisible();
    await expect(
      page.getByText('Real-time sync', { exact: true }).filter({ visible: true }),
    ).toBeVisible();
  });

  test('shows spreadsheet preview on mobile', async ({ page }) => {
    // Set viewport to mobile size
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // On mobile, the spreadsheet preview should be in a dedicated section
    await expect(
      page
        .getByText('SheetLog Transactions', { exact: true })
        .filter({ visible: true }),
    ).toBeVisible();
    await expect(
      page
        .getByText('Appears in your Google Sheet', { exact: true })
        .filter({ visible: true }),
    ).toBeVisible();
  });
});
