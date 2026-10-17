import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const baseUrl = process.env.SITE_BASE_URL;
if (!baseUrl) throw new Error('Run through tools/site/run-static-server.mjs');
const oldName = 'TerraLabs Research';
const cardName = 'Terralabs Research';
const ratingsKey = 'tm-tierlist-user-ratings-v1';
const savesKey = 'tm-tierlist-builder:saves:v1';
const draftKey = 'tm-tierlist-builder:draft:v1';
const sessionKey = 'tm-tierlist-builder:rating-session:v1';
const legacySave = {
  id: 'legacy-fixture', title: 'Legacy fixture', author: 'Test', category: 'corporations',
  tiers: [{id: 'A', label: 'A', color: '#ffbf7f'}, {id: 'B', label: 'B', color: '#ffdf7f'}],
  placements: {A: ['CrediCor', oldName, 'EcoLine'], B: []},
  ratings: {[oldName]: 0, CrediCor: 87, EcoLine: 62}, showScores: true,
};
const expectedRatings = {[cardName]: 0, CrediCor: 87, EcoLine: 62};
const expectedPlacements = {A: ['CrediCor', cardName, 'EcoLine'], B: []};
const errors = [];
const browser = await chromium.launch({headless: true});

// Only synthetic fixtures in fresh contexts; never attach a user's browser.
async function fixturePage(storage) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript((entries) => {
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, JSON.stringify(value));
  }, storage);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  return {context, page};
}

async function exportedSave(page) {
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportBtn').click();
  const stream = await (await downloadPromise).createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function assertBuilder(page, placements, ratings) {
  const exported = await exportedSave(page);
  assert.deepEqual(exported.placements, placements);
  assert.deepEqual(exported.ratings, ratings);
  assert.equal(exported.title, 'Legacy fixture');
  assert.equal(exported.author, 'Test');
  for (const [tier, names] of Object.entries(placements)) {
    assert.deepEqual(await page.locator(`#tierStack [data-zone="${tier}"] .maker-card`).evaluateAll(
      (cards) => cards.map((card) => card.dataset.name)), names);
  }
  assert.equal(await page.locator(`#poolZone .maker-card[data-name="${cardName}"]`).count(), 0);
}

try {
  for (const category of ['all', 'corporations', 'projects', 'preludes', 'ceos']) {
    for (const suffix of ['', '_ru']) {
      const {context, page} = await fixturePage({[ratingsKey]: {[oldName]: 0, CrediCor: 87}});
      try {
        await page.goto(`${baseUrl}/output/tierlist_${category}${suffix}.html`);
        await page.waitForFunction(() => typeof getUserRating === 'function');
        assert.equal(await page.evaluate(() => getUserRating('Terralabs Research')), 0);
        if (category === 'all' || category === 'corporations') {
          const card = page.locator(`.card[data-name="${cardName}"]`);
          assert.equal(await card.getAttribute('data-user-score'), '0');
          assert.equal(await card.getAttribute('data-score'), '38');
          await card.click();
          await page.locator('#userScoreInput').fill('77');
          await page.locator('#saveUserScore').click();
          assert.deepEqual(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), ratingsKey),
            {[cardName]: 77, CrediCor: 87});
          await page.locator('#clearUserScore').click();
          assert.equal(await page.evaluate(() => getUserRating('Terralabs Research')), null);
          assert.equal(await card.getAttribute('data-score'), '38');
        }
      } finally { await context.close(); }
    }
  }

  const conflict = {...legacySave, ratings: {...legacySave.ratings, [cardName]: 91},
    placements: {A: ['CrediCor', oldName, 'EcoLine'], B: [cardName, cardName]}};
  for (const route of ['draft', 'saved', 'import', 'conflict']) {
    const storage = route === 'draft' ? {[draftKey]: legacySave} :
      route === 'saved' ? {[savesKey]: [legacySave]} : {};
    const {context, page} = await fixturePage(storage);
    try {
      await page.goto(`${baseUrl}/tierlist-builder.html`);
      await page.waitForSelector('#poolZone .maker-card');
      if (route === 'saved') {
        await page.locator('#savedLists').selectOption('legacy-fixture');
        await page.locator('#loadBtn').click();
      } else if (route === 'import' || route === 'conflict') {
        await page.locator('#importFile').setInputFiles({name: 'legacy.json', mimeType: 'application/json',
          buffer: Buffer.from(JSON.stringify(route === 'conflict' ? conflict : legacySave))});
        await page.locator('#confirmImportBtn').click();
      }
      await page.waitForSelector(`#tierStack .maker-card[data-name="${cardName}"]`);
      const placements = route === 'conflict' ? {A: ['CrediCor', 'EcoLine'], B: [cardName]} : expectedPlacements;
      const ratings = route === 'conflict' ? {...expectedRatings, [cardName]: 91} : expectedRatings;
      await assertBuilder(page, placements, ratings);
      await page.locator('#saveBtn').click();
      const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), savesKey);
      assert.deepEqual(saved[0].placements, placements);
      assert.deepEqual(saved[0].ratings, ratings);
      // This new page has no fixture script; it restores the actual saved draft.
      const reloaded = await context.newPage();
      await reloaded.goto(`${baseUrl}/tierlist-builder.html`);
      await reloaded.waitForSelector(`#tierStack .maker-card[data-name="${cardName}"]`);
      await assertBuilder(reloaded, placements, ratings);
      await reloaded.close();
    } finally { await context.close(); }
  }

  const {context, page} = await fixturePage({[draftKey]: legacySave, [sessionKey]: {
    active: true, category: 'corporations', queue: ['CrediCor', oldName, 'EcoLine'], index: 1,
    currentName: oldName, activeScoreText: '67',
  }});
  try {
    await page.goto(`${baseUrl}/tierlist-builder.html?rating=1`);
    await page.waitForSelector('body.rating-mode');
    assert.equal(await page.locator('#ratingScoreInput').inputValue(), '67');
    assert.equal(await page.evaluate(() => state.ratingCurrentName), cardName);
    assert.deepEqual(await page.evaluate(() => state.ratingQueue), ['CrediCor', cardName, 'EcoLine']);
  } finally { await context.close(); }

  const canonical = await fixturePage({[ratingsKey]: {[oldName]: 88, [cardName]: 0, CrediCor: 87}});
  try {
    await canonical.page.goto(`${baseUrl}/output/tierlist_corporations.html`);
    assert.equal(await canonical.page.locator(`.card[data-name="${cardName}"]`).getAttribute('data-user-score'), '0');
  } finally { await canonical.context.close(); }
  assert.deepEqual(errors, []);
  console.log('Saved card names: 10 catalog pages, draft/saved/import/conflict/export/save/reload/session PASS');
} finally {
  await browser.close();
}
