import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {chromium} from 'playwright';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const assetsPath = path.join(repoRoot, 'apps', 'tm-site', 'src', 'tierlist-builder-assets.js');
const outputDir = path.join(repoRoot, 'tools', 'site', 'builder_card_sources');
const cardsUrl = process.env.TM_CARDS_URL || 'https://tm.knightbyte.win/cards';

function parseAssets() {
  const text = fs.readFileSync(assetsPath, 'utf8');
  const match = text.match(/=\s*(\{[\s\S]*\});?\s*$/);
  if (!match) throw new Error(`Could not parse ${assetsPath}`);
  return JSON.parse(match[1]);
}

function outputName(cardName) {
  return `${crypto.createHash('sha1').update(cardName).digest('hex').slice(0, 10)}.png`;
}

function cardClass(cardName) {
  return `card-${cardName.toLowerCase().replaceAll(' ', '-')}`;
}

async function main() {
  const payload = parseAssets();
  const originalMap = payload.originalCardImages || payload.cardImages || {};
  const candidates = [];

  for (const [name, relPath] of Object.entries(originalMap)) {
    const normalized = relPath.replaceAll('\\', '/');
    if (!normalized.includes('/corporations/')) continue;
    const source = path.join(repoRoot, relPath);
    if (!fs.existsSync(source)) continue;
    const size = fs.statSync(source).size;
    if (size <= 0) continue;
    candidates.push(name);
  }

  fs.mkdirSync(outputDir, {recursive: true});

  const browser = await chromium.launch({headless: true});
  const page = await browser.newPage({viewport: {width: 1500, height: 1100}, deviceScaleFactor: 2});
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(cardsUrl, {waitUntil: 'networkidle', timeout: 60000});
  await page.waitForSelector('.card-container', {timeout: 30000});
  await page.locator('#tall-cards').click();
  await page.waitForTimeout(1200);

  let captured = 0;
  const missing = [];
  for (const name of candidates.sort()) {
    const className = cardClass(name);
    const staged = await page.evaluate((cls) => {
      document.getElementById('builder-card-capture-stage')?.remove();
      const source = [...document.querySelectorAll('.card-container')]
        .find((node) => node.classList.contains(cls));
      if (!source) return false;
      const stage = document.createElement('div');
      stage.id = 'builder-card-capture-stage';
      stage.style.position = 'fixed';
      stage.style.left = '0';
      stage.style.top = '0';
      stage.style.zIndex = '999999';
      stage.style.padding = '18px 5px 8px';
      stage.style.background = '#343942';
      stage.style.overflow = 'visible';
      stage.style.lineHeight = 'normal';

      const clone = source.cloneNode(true);
      clone.style.margin = '0';
      clone.style.transform = 'none';
      clone.style.position = 'relative';
      stage.append(clone);
      document.body.append(stage);
      return true;
    }, className);
    if (!staged) {
      missing.push(name);
      continue;
    }
    await page.locator('#builder-card-capture-stage').screenshot({
      path: path.join(outputDir, outputName(name)),
    });
    await page.evaluate(() => document.getElementById('builder-card-capture-stage')?.remove());
    captured += 1;
  }

  await browser.close();
  console.log(JSON.stringify({cardsUrl, candidates: candidates.length, captured, missing, errors}, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
