import fs from 'fs';
import path from 'path';
import {chromium} from 'playwright';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const outputDir = path.join(repoRoot, 'output', 'playwright');
const builderUrl = process.env.BUILDER_URL || 'http://127.0.0.1:4173/tierlist-builder.html';
const expectedVersionPart = 'uniform-3x4-480x640-q96-corpdom';
const categories = [
  ['corporations', 'Корпорации', '69'],
  ['preludes', 'Прелюдии', '105'],
  ['projects', 'Проекты', '716'],
  ['ceos', 'CEO', '37'],
];

async function main() {
  fs.mkdirSync(outputDir, {recursive: true});
  const errors = [];
  const browser = await chromium.launch({headless: true});
  const page = await browser.newPage({viewport: {width: 1100, height: 1200}, deviceScaleFactor: 1});

  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => errors.push(`requestfailed: ${request.url()} ${request.failure()?.errorText}`));

  await page.goto(`${builderUrl}?builderSmoke=${Date.now()}`, {waitUntil: 'networkidle'});
  await page.evaluate(() => localStorage.clear());
  await page.reload({waitUntil: 'networkidle'});

  const results = {};
  for (const [key, label, expectedCount] of categories) {
    await page.getByRole('button', {name: label, exact: true}).click();
    await page.locator('#cardSize').evaluate((element) => {
      element.value = 132;
      element.dispatchEvent(new Event('input', {bubbles: true}));
    });
    await page.waitForSelector('#poolZone .maker-card');
    await page.waitForFunction((count) => document.querySelector('#poolCount')?.textContent?.trim() === count, expectedCount);
    const visibleExpansionChips = await page.evaluate(() => [...document.querySelectorAll('#expansionChips .chip')].map((button) => button.textContent.trim()));
    if (key === 'corporations' && visibleExpansionChips.includes('Delta Project')) {
      throw new Error('corporations category should not show the Delta Project expansion filter');
    }
    if (key === 'preludes' && !visibleExpansionChips.includes('Delta Project')) {
      throw new Error('preludes category should show the Delta Project expansion filter');
    }
    if (key === 'preludes') {
      for (const label of ['Community', 'Pathfinders', 'Prelude 2', 'Promo']) {
        if (!visibleExpansionChips.includes(label)) {
          throw new Error(`preludes category should show the ${label} expansion filter: ${visibleExpansionChips.join(', ')}`);
        }
      }
    }
    await page.locator('#poolZone .maker-card img:not([hidden])').evaluateAll((imgs) => {
      imgs.slice(0, 32).forEach((img) => {
        img.loading = 'eager';
      });
    });
    await page.waitForFunction((versionPart) => {
      const cards = [...document.querySelectorAll('#poolZone .maker-card')].slice(0, 32);
      return cards.length > 0 && cards.every((card) => {
        const img = card.querySelector('img:not([hidden])');
        if (img) {
          if (!img.complete || img.naturalWidth <= 0) return false;
          return img.currentSrc.includes(versionPart) || !img.currentSrc.includes('output/builder_cards/');
        }
        const fallback = card.querySelector('.sprite-art');
        return fallback && getComputedStyle(fallback).backgroundImage.includes('tierlist_all_cards.webp');
      });
    }, expectedVersionPart, {timeout: 15000});

    const result = await page.evaluate((versionPart) => {
      const uniqueBoxes = (nodes) => [...new Set(nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return `${rect.width.toFixed(2)}x${rect.height.toFixed(2)}`;
      }))];
      const cards = [...document.querySelectorAll('#poolZone .maker-card')].slice(0, 32);
      const art = [...document.querySelectorAll('#poolZone .card-art')].slice(0, 32);
      const imgs = cards.map((card) => card.querySelector('img:not([hidden])')).filter(Boolean);
      const builderImgs = imgs.filter((img) => img.currentSrc.includes('output/builder_cards/'));
      const fallbacks = cards.map((card) => card.querySelector('.sprite-art')).filter(Boolean);
      const renderedCards = cards.filter((card) => {
        const img = card.querySelector('img:not([hidden])');
        if (img && img.naturalWidth > 0) return true;
        return Boolean(card.querySelector('.sprite-art'));
      });
      return {
        visibleCards: document.querySelectorAll('#poolZone .maker-card').length,
        sampledCards: cards.length,
        cardBoxes: uniqueBoxes(cards),
        artBoxes: uniqueBoxes(art),
        naturalSizes: [...new Set(builderImgs.map((img) => `${img.naturalWidth}x${img.naturalHeight}`))],
        objectFits: [...new Set(imgs.map((img) => getComputedStyle(img).objectFit))],
        fallbackCount: fallbacks.length,
        renderedCards: renderedCards.length,
        captions: document.querySelectorAll('#poolZone .card-name').length,
        versioned: builderImgs.every((img) => img.currentSrc.includes(versionPart)),
        assetVersion: window.TM_BUILDER_ASSETS?.builderImageVersion,
      };
    }, expectedVersionPart);
    results[key] = result;

    const failures = [];
    if (String(result.visibleCards) !== expectedCount) failures.push(`expected ${expectedCount} visible cards, got ${result.visibleCards}`);
    if (result.cardBoxes.length !== 1) failures.push(`non-uniform card boxes: ${result.cardBoxes.join(', ')}`);
    if (result.artBoxes.length !== 1) failures.push(`non-uniform art boxes: ${result.artBoxes.join(', ')}`);
    if (result.renderedCards !== result.sampledCards) failures.push(`rendered ${result.renderedCards}/${result.sampledCards} sampled cards`);
    if (result.naturalSizes.length > 0 && (result.naturalSizes.length !== 1 || result.naturalSizes[0] !== '480x640')) failures.push(`unexpected natural sizes: ${result.naturalSizes.join(', ')}`);
    if (result.objectFits.length > 0 && (result.objectFits.length !== 1 || result.objectFits[0] !== 'contain')) failures.push(`unexpected object-fit: ${result.objectFits.join(', ')}`);
    if (result.captions !== 0) failures.push(`pool captions should be hidden, got ${result.captions}`);
    if (!result.versioned) failures.push(`images are not using ${expectedVersionPart}`);
    if (result.assetVersion !== expectedVersionPart) failures.push(`assetVersion is ${result.assetVersion}`);
    if (failures.length > 0) {
      throw new Error(`${key}: ${failures.join('; ')}`);
    }
  }

  await page.getByRole('button', {name: 'Прелюдии'}).click();
  await page.getByRole('button', {name: 'Delta Project'}).click();
  await page.getByRole('button', {name: 'Корпорации'}).click();
  await page.waitForFunction(() => document.querySelector('#poolCount')?.textContent?.trim() === '69');
  const corporationExpansionLabels = await page.evaluate(() => [...document.querySelectorAll('#expansionChips .chip')].map((button) => button.textContent.trim()));
  if (corporationExpansionLabels.includes('Delta Project')) {
    throw new Error(`Delta Project filter should be hidden after switching to corporations: ${corporationExpansionLabels.join(', ')}`);
  }

  await page.getByRole('button', {name: 'Прелюдии'}).click();
  async function assertPreludeExpansion(cardName, expectedExpansion) {
    await page.locator('#searchInput').fill(cardName);
    await page.waitForFunction(
      ({name}) => {
        const card = document.querySelector(`#poolZone .maker-card[data-name="${CSS.escape(name)}"]`);
        return document.querySelector('#poolCount')?.textContent?.trim() === '1' && Boolean(card);
      },
      {name: cardName},
    );
    const actual = await page.locator(`#poolZone .maker-card[data-name="${cardName}"]`).getAttribute('data-expansion');
    if (actual !== expectedExpansion) {
      throw new Error(`${cardName} should be a ${expectedExpansion} prelude, got ${actual}`);
    }
  }
  await assertPreludeExpansion('Suitable Infrastructure', 'Prelude 2');
  await assertPreludeExpansion('Established Methods', 'Promo');
  await assertPreludeExpansion('Aerospace Mission', 'Community');
  await assertPreludeExpansion('Research Grant', 'Community');
  await page.locator('#searchInput').fill('');

  await page.getByRole('button', {name: 'Проекты'}).click();
  await page.locator('#searchInput').fill('Earth Catapult');
  await page.waitForFunction(() => document.querySelector('#poolCount')?.textContent?.trim() === '1');
  await page.getByRole('button', {name: 'Начать оценивание'}).click();
  await page.waitForSelector('body.rating-mode');
  await page.waitForSelector('#ratingCardFrame .maker-card img');
  await page.locator('#ratingCardFrame .maker-card img').evaluate((img) => {
    img.loading = 'eager';
  });
  await page.waitForFunction(() => {
    const img = document.querySelector('#ratingCardFrame .maker-card img');
    return img?.complete && img.naturalWidth > 0;
  });
  const ratingState = await page.evaluate(() => ({
    controlPanelHidden: getComputedStyle(document.querySelector('.control-panel')).display === 'none',
    poolHidden: getComputedStyle(document.querySelector('.pool-wrap')).display === 'none',
    viewModeHidden: getComputedStyle(document.querySelector('#viewModeBtn')).display === 'none',
    largeCardWidth: Math.round(document.querySelector('#ratingCardFrame .maker-card').getBoundingClientRect().width),
    topbarHeight: Math.round(document.querySelector('.topbar').getBoundingClientRect().height),
    boardHeaderHeight: Math.round(document.querySelector('.board-header').getBoundingClientRect().height),
    dataPanelHeight: Math.round(document.querySelector('.rating-data-panel').getBoundingClientRect().height),
    cardPanelHeight: Math.round(document.querySelector('.rating-card-panel').getBoundingClientRect().height),
    ratingImage: document.querySelector('#ratingCardFrame .maker-card img')?.currentSrc || '',
    baseScoreVisible: getComputedStyle(document.querySelector('.rating-base-score-item')).display !== 'none',
    scoreValue: document.querySelector('#ratingScoreInput')?.value || '',
    scorePlaceholder: document.querySelector('#ratingScoreInput')?.getAttribute('placeholder') || '',
    rangeValue: document.querySelector('#ratingScore')?.value || '',
    rangeDisabled: document.querySelector('#ratingScore')?.disabled || false,
    rateDisabled: document.querySelector('#rateCardBtn')?.disabled || false,
    hasScoreClass: document.querySelector('.rating-score-row')?.classList.contains('has-score') || false,
    targetTierExists: Boolean(document.querySelector('#ratingTargetTier')),
    visibleText: document.body.innerText,
    numberButtons: [...document.querySelectorAll('button')].map((button) => button.textContent.trim()).filter((label) => /^(50|55|60)$/.test(label)),
  }));
  if (!ratingState.controlPanelHidden || !ratingState.poolHidden || !ratingState.viewModeHidden) {
    throw new Error('rating mode should hide setup controls, preview toggle, and the unranked pool');
  }
  if (ratingState.largeCardWidth < 360 || ratingState.largeCardWidth > 440) {
    throw new Error(`rating card should be compact but readable, got ${ratingState.largeCardWidth}px`);
  }
  if (ratingState.topbarHeight > 56 || ratingState.boardHeaderHeight > 64 || ratingState.dataPanelHeight > 430 || ratingState.cardPanelHeight > 620) {
    throw new Error(`rating mode should keep the recording layout compact: ${JSON.stringify(ratingState)}`);
  }
  await page.setViewportSize({width: 820, height: 1100});
  await page.waitForFunction(() => document.querySelector('#ratingCardFrame .maker-card')?.getBoundingClientRect().width <= 380);
  const tabletRatingState = await page.evaluate(() => {
    const box = (selector) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      return rect ? {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      } : null;
    };
    return {
      topbar: box('.topbar'),
      cardPanel: box('.rating-card-panel'),
      dataPanel: box('.rating-data-panel'),
      card: box('#ratingCardFrame .maker-card'),
      firstTier: box('#tierStack .tier-row'),
    };
  });
  if (tabletRatingState.topbar.height > 48 || tabletRatingState.dataPanel.x <= tabletRatingState.cardPanel.x || tabletRatingState.card.width > 380 || tabletRatingState.firstTier.y > 760) {
    throw new Error(`tablet rating mode should keep card, metadata, and first tiers in view: ${JSON.stringify(tabletRatingState)}`);
  }
  await page.setViewportSize({width: 1100, height: 1200});
  if (!ratingState.ratingImage.includes('images/project_cards/Earth_Catapult.png')) {
    throw new Error(`rating mode should prefer the original card image, got ${ratingState.ratingImage}`);
  }
  if (ratingState.baseScoreVisible) {
    throw new Error('rating mode should hide Ruslan score unless score display is enabled');
  }
  if (ratingState.scoreValue !== '0' || ratingState.scorePlaceholder !== '0' || ratingState.rangeValue !== '0' || ratingState.rangeDisabled || ratingState.rateDisabled || !ratingState.hasScoreClass) {
    throw new Error(`rating mode should start at valid zero with a visible slider, got value=${ratingState.scoreValue}, placeholder=${ratingState.scorePlaceholder}, range=${ratingState.rangeValue}, rangeDisabled=${ratingState.rangeDisabled}, disabled=${ratingState.rateDisabled}, hasScore=${ratingState.hasScoreClass}`);
  }
  if (ratingState.targetTierExists) {
    throw new Error('rating mode should not show the live target tier field');
  }
  if (ratingState.visibleText.includes('symbol symbol') || ratingState.visibleText.includes('effect root')) {
    throw new Error('rating mode leaked raw extracted effect text');
  }
  if (ratingState.numberButtons.length > 0) {
    throw new Error(`rating mode should not show quick number buttons: ${ratingState.numberButtons.join(', ')}`);
  }

  await page.locator('#ratingScoreInput').fill('677');
  await page.waitForFunction(() => document.querySelector('#ratingScoreInput')?.value === '677');
  const invalidScoreState = await page.evaluate(() => ({
    rateDisabled: document.querySelector('#rateCardBtn')?.disabled || false,
    isInvalid: document.querySelector('.rating-score-row')?.classList.contains('is-invalid') || false,
    progress: document.querySelector('#ratingProgressLabel')?.textContent?.trim(),
  }));
  if (!invalidScoreState.rateDisabled || !invalidScoreState.isInvalid || invalidScoreState.progress !== '0 / 1') {
    throw new Error(`677 should stay visible but not be submittable: ${JSON.stringify(invalidScoreState)}`);
  }
  await page.keyboard.press('Space');
  await page.waitForFunction(() => document.querySelector('#ratingProgressLabel')?.textContent?.trim() === '0 / 1');
  await page.locator('#ratingScoreInput').fill('0');
  await page.keyboard.press('Space');
  await page.waitForSelector('#tierStack .tier-row:last-child .maker-card[data-name="Earth Catapult"]');
  const placedRatingCardWidth = await page.locator('#tierStack .tier-row:last-child .maker-card[data-name="Earth Catapult"]').evaluate((card) => Math.round(card.getBoundingClientRect().width));
  if (placedRatingCardWidth < 120) {
    throw new Error(`rating tier cards should stay readable, got ${placedRatingCardWidth}px`);
  }
  await page.waitForFunction(() => document.querySelector('#ratingProgressLabel')?.textContent?.trim() === '1 / 1');
  await page.getByRole('button', {name: 'Фильтры'}).click();
  await page.locator('#searchInput').fill('Huygens Observatory');
  await page.waitForFunction(() => document.querySelector('#poolCount')?.textContent?.trim() === '1');
  await page.getByRole('button', {name: 'Начать оценивание'}).click();
  await page.waitForSelector('body.rating-mode');
  if (!new URL(page.url()).searchParams.has('rating')) {
    throw new Error(`rating mode should be encoded in the URL for F5 restore: ${page.url()}`);
  }
  await page.reload({waitUntil: 'networkidle'});
  await page.waitForSelector('body.rating-mode');
  await page.waitForFunction(() => document.querySelector('#ratingCardName')?.textContent?.includes('Обсерватория Гюйгенса'));
  const huygensMetadata = await page.evaluate(() => ({
    scoreValue: document.querySelector('#ratingScoreInput')?.value || '',
    tags: [...document.querySelectorAll('#ratingCardTags .rating-tag')].map((tag) => tag.textContent?.trim()),
    expansion: document.querySelector('#ratingExpansion')?.textContent?.trim(),
    type: document.querySelector('#ratingType')?.textContent?.trim(),
  }));
  if (huygensMetadata.scoreValue !== '0') {
    throw new Error(`F5 restore should keep rating mode at zero score, got: ${huygensMetadata.scoreValue}`);
  }
  if (!huygensMetadata.tags.includes('Science') || !huygensMetadata.tags.includes('Space')) {
    throw new Error(`Huygens Observatory should show Science and Space tags, got: ${huygensMetadata.tags.join(', ')}`);
  }
  if (huygensMetadata.expansion !== 'Pathfinders') {
    throw new Error(`Huygens Observatory expansion should be Pathfinders, got: ${huygensMetadata.expansion}`);
  }
  if (huygensMetadata.type !== 'Автоматическая') {
    throw new Error(`Huygens Observatory type should be automated, got: ${huygensMetadata.type}`);
  }
  await page.keyboard.press('9');
  await page.keyboard.press('3');
  await page.waitForFunction(() => document.querySelector('#ratingScoreInput')?.value === '93');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => document.querySelector('#ratingProgressLabel')?.textContent?.trim() === '1 / 1');

  await page.getByRole('button', {name: 'Фильтры'}).click();
  await page.locator('#searchInput').fill('Colonial Representation');
  await page.waitForFunction(() => document.querySelector('#poolCount')?.textContent?.trim() === '1');
  await page.getByRole('button', {name: 'Начать оценивание'}).click();
  await page.waitForSelector('body.rating-mode');
  await page.waitForFunction(() => document.querySelector('#ratingCardName')?.textContent?.includes('Колониальное представительство'));
  const dataPanelFit = await page.evaluate(() => {
    const panel = document.querySelector('.rating-data-panel');
    const name = document.querySelector('#ratingCardName');
    const range = document.querySelector('#ratingScore');
    const progress = document.querySelector('.rating-progress');
    const panelRect = panel.getBoundingClientRect();
    const rightEdge = panelRect.right + 1;
    return {
      panelWidth: Math.round(panelRect.width),
      panelOverflow: panel.scrollWidth - panel.clientWidth,
      nameFits: name.getBoundingClientRect().right <= rightEdge,
      rangeFits: range.getBoundingClientRect().right <= rightEdge,
      progressFits: progress.getBoundingClientRect().right <= rightEdge,
    };
  });
  if (dataPanelFit.panelWidth < 440 || dataPanelFit.panelOverflow > 2 || !dataPanelFit.nameFits || !dataPanelFit.rangeFits || !dataPanelFit.progressFits) {
    throw new Error(`rating data panel should contain long card metadata without horizontal overflow: ${JSON.stringify(dataPanelFit)}`);
  }

  await page.getByRole('button', {name: 'Фильтры'}).click();
  await page.locator('#searchInput').fill('Economic Help');
  await page.waitForFunction(() => document.querySelector('#poolCount')?.textContent?.trim() === '1');
  await page.getByRole('button', {name: 'Начать оценивание'}).click();
  await page.waitForSelector('body.rating-mode');
  await page.waitForFunction(() => document.querySelector('#ratingCardName')?.textContent?.includes('Экономическая Помощь'));
  const economicHelpMetadata = await page.evaluate(() => ({
    tags: [...document.querySelectorAll('#ratingCardTags .rating-tag')].map((tag) => tag.textContent?.trim()),
    expansion: document.querySelector('#ratingExpansion')?.textContent?.trim(),
    type: document.querySelector('#ratingType')?.textContent?.trim(),
  }));
  if (economicHelpMetadata.expansion !== 'Pathfinders') {
    throw new Error(`Economic Help expansion should be Pathfinders, got: ${economicHelpMetadata.expansion}`);
  }
  if (economicHelpMetadata.type !== 'Событие') {
    throw new Error(`Economic Help type should be event, got: ${economicHelpMetadata.type}`);
  }
  if (!economicHelpMetadata.tags.includes('Без тегов')) {
    throw new Error(`Economic Help should keep canonical empty tags, got: ${economicHelpMetadata.tags.join(', ')}`);
  }

  await page.getByRole('button', {name: 'Фильтры'}).click();
  await page.locator('#searchInput').fill('');

  await page.getByRole('button', {name: 'Корпорации'}).click();
  await page.locator('#listTitle').fill('Smoke saved tier list');
  await page.locator('#listAuthor').fill('Smoke Author');
  await page.locator('#saveBtn').click();
  await page.waitForFunction(() => document.querySelector('#statusLine')?.textContent?.includes('сохранений: 1'));
  const savedState = await page.evaluate(() => ({
    status: document.querySelector('#statusLine')?.textContent || '',
    options: [...document.querySelectorAll('#savedLists option')].map((option) => option.textContent || ''),
  }));
  if (!savedState.status.includes('сохранений: 1')) {
    throw new Error(`save status did not update after saving: ${savedState.status}`);
  }
  if (!savedState.options.some((label) => label.includes('Smoke saved tier list') && label.includes('Smoke Author'))) {
    throw new Error(`saved list option missing title/author: ${savedState.options.join(' | ')}`);
  }

  await page.locator('.pool-wrap').scrollIntoViewIfNeeded();
  await page.screenshot({path: path.join(outputDir, 'tierlist-builder-smoke-corps.png'), fullPage: false});

  await page.getByRole('button', {name: 'Прелюдии'}).click();
  await page.locator('.pool-wrap').scrollIntoViewIfNeeded();
  await page.screenshot({path: path.join(outputDir, 'tierlist-builder-smoke-preludes.png'), fullPage: false});

  await browser.close();
  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }
  console.log(JSON.stringify({builderUrl, expectedVersionPart, results}, null, 2));
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
