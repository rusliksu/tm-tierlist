import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const baseUrl = process.env.SITE_BASE_URL;
if (!baseUrl) throw new Error('Run through tools/site/run-static-server.mjs');
const keys = {draft: 'tm-tierlist-builder:draft:v1', saves: 'tm-tierlist-builder:saves:v1',
  session: 'tm-tierlist-builder:rating-session:v1', ratings: 'tm-tierlist-user-ratings-v1'};
const draft = {id: 'personal-list', title: 'My custom list', author: 'Test author', category: 'corporations',
  tiers: [{id: 'A', label: 'Favorites', color: '#ffbf7f'}, {id: 'B', label: 'Other', color: '#ffdf7f'}],
  placements: {A: ['Terralabs Research', 'Space Port Colony'], B: ['CrediCor']},
  ratings: {'Terralabs Research': 0, 'Space Port Colony': 83, CrediCor: 67},
  expansions: ['Base'], cardSize: 144, showScores: true};
const session = {active: true, category: 'corporations', queue: ['Terralabs Research', 'CrediCor'],
  index: 0, currentName: 'Terralabs Research', activeScoreText: '57'};
const second = {...draft, id: 'second', title: 'Second list', category: 'projects', expansions: ['Colonies']};
const fixtures = {[keys.draft]: draft, [keys.saves]: [draft, second],
  [keys.session]: session, [keys.ratings]: {'Terralabs Research': 0, CrediCor: 67}};
const browser = await chromium.launch({headless: true});
const errors = [];

async function exported(page) {
  const pending = page.waitForEvent('download');
  await page.locator('#exportBtn').click();
  const stream = await (await pending).createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function stored(page) {
  return page.evaluate(keys => Object.fromEntries(Object.values(keys).map(key => [key, localStorage.getItem(key)])), keys);
}

try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({viewport: mobile ? {width: 390, height: 844} : {width: 1440, height: 1000},
      isMobile: mobile, hasTouch: mobile});
    const page = await context.newPage();
    // Only synthetic storage in a fresh browser, never an attached user profile.
    await page.goto(`${baseUrl}/tierlist-builder.html`);
    await page.locator('#poolZone .maker-card').first().waitFor();
    await page.evaluate(entries => {
      for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, JSON.stringify(value));
    }, fixtures);
    const before = await stored(page);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${baseUrl}/tierlist-builder.html?category=projects#board`);
    await page.locator('#poolZone .maker-card').first().waitFor();
    assert.equal(await page.locator('#categoryChips .active').textContent(), 'Проекты');
    assert.equal(await page.locator('#poolZone .maker-card').count(), 1061, 'All projects except the placed card, without the draft corporation filter');
    assert.equal(await page.locator('#tierStack .maker-card[data-name="Space Port Colony"]').count(), 1);
    const result = await exported(page);
    for (const field of ['id', 'title', 'author', 'tiers', 'placements', 'ratings']) assert.deepEqual(result[field], draft[field], field);
    assert.equal(result.category, 'projects');
    assert.equal(new URL(page.url()).hash, '#board');
    assert.deepEqual(await stored(page), before, 'Navigation/export must not rewrite draft, saves, ratings or rating session');

    await page.locator('#savedLists').selectOption('personal-list');
    if (mobile) await page.locator('#loadBtn').tap();
    else await page.locator('#loadBtn').click();
    assert.equal(await page.locator('#categoryChips .active').textContent(), 'Корпорации');
    assert.equal(new URL(page.url()).searchParams.get('category'), 'corporations');
    await page.reload();
    await page.locator('#poolZone .maker-card').first().waitFor();
    assert.equal(await page.locator('#categoryChips .active').textContent(), 'Корпорации');
    const loaded = await exported(page);
    for (const field of ['title', 'author', 'tiers', 'placements', 'ratings', 'expansions']) assert.deepEqual(loaded[field], draft[field]);
    assert.equal((await stored(page))[keys.saves], before[keys.saves]);

    // Without a category query, the normal saved draft controls reload.
    await page.goto(`${baseUrl}/tierlist-builder.html`);
    await page.locator('#poolZone .maker-card').first().waitFor();
    await page.locator('#savedLists').selectOption('second');
    if (mobile) await page.locator('#loadBtn').tap();
    else await page.locator('#loadBtn').click();
    assert.equal(await page.locator('#categoryChips .active').textContent(), 'Проекты');
    assert.equal(new URL(page.url()).searchParams.get('category'), null);
    await page.reload();
    await page.locator('#poolZone .maker-card').first().waitFor();
    assert.equal(await page.locator('#categoryChips .active').textContent(), 'Проекты');
    const bareLoaded = await exported(page);
    for (const field of ['title', 'author', 'tiers', 'placements', 'ratings', 'expansions']) assert.deepEqual(bareLoaded[field], second[field]);
    assert.equal((await stored(page))[keys.saves], before[keys.saves]);
    await page.locator('#savedLists').selectOption('personal-list');
    await page.locator('#loadBtn').click();

    await page.goto(`${baseUrl}/tierlist-builder.html?category=unknown`);
    await page.locator('#poolZone .maker-card').first().waitFor();
    assert.equal(await page.locator('#categoryChips .active').textContent(), 'Корпорации');
    assert.deepEqual((await exported(page)).placements, draft.placements);
    // The rating route resumes its own queue rather than mixing card categories.
    await page.evaluate(({key, value}) => localStorage.setItem(key, JSON.stringify(value)), {key: keys.session, value: session});
    await page.goto(`${baseUrl}/tierlist-builder.html?category=projects&rating=1`);
    await page.locator('body.rating-mode').waitFor();
    assert.equal(await page.locator('#categoryChips .active').textContent(), 'Корпорации');
    assert.equal(await page.locator('#ratingScoreInput').inputValue(), '57');
    assert.equal(new URL(page.url()).searchParams.get('category'), 'corporations');
    assert.equal(new URL(page.url()).searchParams.get('rating'), '1');
    assert.equal((await stored(page))[keys.saves], before[keys.saves]);
    assert.equal((await stored(page))[keys.ratings], before[keys.ratings]);
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log('Builder category: desktop/touch phone, preserved draft+saves+ratings+queue, export/load/reload, invalid route and rating resume PASS');
} finally {
  await browser.close();
}
