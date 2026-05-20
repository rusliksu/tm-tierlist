import fs from 'fs';
import {chromium} from '@playwright/test';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const outputDir = path.join(repoRoot, 'output');
const expectedThumbBox = '80.00x100.00';

function pageFiles() {
  return fs.readdirSync(outputDir)
    .filter((name) => /^tierlist_.*\.html$/.test(name))
    .sort()
    .map((name) => path.join('output', name));
}

function cardSelector(cardName) {
  return `.card[data-name="${cardName.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
}

async function sampleCards(page) {
  return page.evaluate(() => {
    const cards = [...document.querySelectorAll('.card')];
    return cards.slice(0, 3).flatMap((card) => {
      const thumb = card.querySelector('.card-thumb');
      if (!thumb) return [];
      const backgroundImage = getComputedStyle(thumb).backgroundImage;
      if (!backgroundImage || backgroundImage === 'none') {
        return [];
      }
      return [{
        cardName: card.getAttribute('data-name'),
        thumbBackground: backgroundImage,
      }];
    }).filter((target) => target.cardName && target.thumbBackground);
  });
}

async function inspectTarget(page, target) {
  const card = page.locator(cardSelector(target.cardName)).first();
  await card.waitFor({state: 'visible', timeout: 15000});
  await card.scrollIntoViewIfNeeded();

  const before = await card.evaluate((element) => {
    const thumb = element.querySelector('.card-thumb');
    const rect = thumb?.getBoundingClientRect();
    return {
      thumbBox: rect ? `${rect.width.toFixed(2)}x${rect.height.toFixed(2)}` : null,
      thumbBackground: thumb ? getComputedStyle(thumb).backgroundImage : null,
    };
  });

  await card.click();
  await page.waitForSelector('.modal-card-img, .modal-card-sprite', {
    state: 'attached',
    timeout: 10000,
  });

  const modal = await page.evaluate(async () => {
    const img = document.querySelector('.modal-card-img');
    const sprite = document.querySelector('.modal-card-sprite');
    if (img) {
      if (!img.complete || img.naturalWidth === 0) {
        await img.decode();
      }
      return {
        type: 'img',
        src: img.getAttribute('src'),
        naturalSize: `${img.naturalWidth}x${img.naturalHeight}`,
        alt: img.getAttribute('alt'),
      };
    }
    if (sprite) {
      const rect = sprite.getBoundingClientRect();
      return {
        type: 'sprite',
        box: `${rect.width.toFixed(2)}x${rect.height.toFixed(2)}`,
        background: getComputedStyle(sprite).backgroundImage,
      };
    }
    return {type: 'missing'};
  });

  await page.keyboard.press('Escape');
  await page.locator('#modalOverlay.active').waitFor({state: 'hidden', timeout: 5000}).catch(() => {});

  return {
    ...target,
    before,
    modal,
  };
}

async function inspectPage(browser, pageFile) {
  const pagePath = path.join(repoRoot, pageFile);
  const pageUrl = pathToFileURL(pagePath).href;
  const context = await browser.newContext();
  const page = await context.newPage();
  const failedRequests = [];
  const pageErrors = [];

  page.on('requestfailed', (request) => {
    failedRequests.push({
      url: request.url(),
      failure: request.failure()?.errorText ?? 'unknown',
    });
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  try {
    await page.goto(pageUrl, {waitUntil: 'networkidle', timeout: 60000});
    const targets = await sampleCards(page);
    const targetResults = [];
    for (const target of targets) {
      targetResults.push(await inspectTarget(page, target));
    }
    return {
      page: pageFile,
      pageUrl,
      checkedCardCount: targets.length,
      targets: targetResults,
      failedRequests,
      pageErrors,
    };
  } finally {
    await context.close();
  }
}

export async function run() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--allow-file-access-from-files'],
  });
  const results = [];

  try {
    for (const pageFile of pageFiles()) {
      results.push(await inspectPage(browser, pageFile));
    }
  } finally {
    await browser.close();
  }

  const failures = [];
  const checkedTargets = results.flatMap((result) => result.targets);
  if (checkedTargets.length === 0) {
    failures.push('No card modals were checked');
  }

  for (const result of results) {
    if (result.failedRequests.length > 0) {
      failures.push(`${result.page}: failed requests ${result.failedRequests.length}`);
    }
    if (result.pageErrors.length > 0) {
      failures.push(`${result.page}: page errors ${result.pageErrors.length}`);
    }
    for (const target of result.targets) {
      const label = `${result.page} ${target.cardName}`;
      if (target.before.thumbBox !== expectedThumbBox) {
        failures.push(`${label}: expected thumb ${expectedThumbBox}, got ${target.before.thumbBox}`);
      }
      if (target.before.thumbBackground === 'none') {
        failures.push(`${label}: missing thumb background before click`);
      }
      if (target.modal.type !== 'img' && target.modal.type !== 'sprite') {
        failures.push(`${label}: expected modal image or sprite, got ${target.modal.type}`);
      }
      if (target.modal.type === 'img' && target.modal.naturalSize === '0x0') {
        failures.push(`${label}: modal image did not decode`);
      }
      if (target.modal.type === 'sprite' && !target.modal.background?.includes('sprites/')) {
        failures.push(`${label}: modal sprite background is missing`);
      }
    }
  }

  console.log(JSON.stringify({results}, null, 2));

  if (failures.length > 0) {
    console.error('Tier list card modal failures:');
    for (const failure of failures) {
      console.error(failure);
    }
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
