import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const baseUrl = process.env.SITE_BASE_URL;
if (!baseUrl) throw new Error('Run through tools/site/run-static-server.mjs');
const browser = await chromium.launch({headless: true});
const errors = [];
const fullManifestRequests = [];
const manifestUrl = `${baseUrl}/release-date.json`;

function watch(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (new URL(request.url()).pathname.endsWith('/release-manifest.json')) fullManifestRequests.push(request.url());
  });
}

try {
  const context = await browser.newContext({timezoneId: 'America/Los_Angeles'});
  const page = await context.newPage();
  watch(page);
  let pending;
  const requestSeen = page.waitForRequest(manifestUrl, {timeout: 5000}).catch(error => error);
  await page.route(manifestUrl, route => { pending = route; });
  await page.goto(baseUrl, {waitUntil: 'domcontentloaded'});
  assert.deepEqual(fullManifestRequests, [], 'Loading the date must not request the full release manifest');
  const footer = page.locator('.footer span');
  assert.equal(await footer.textContent(), 'Дата обновления недоступна');
  await page.locator('[data-lang="en"]').click();
  assert.equal(await footer.textContent(), 'Update date unavailable');
  const request = await requestSeen;
  if (request instanceof Error) throw request;
  await pending.fulfill({json: {generated_utc: '2026-10-15T00:15:00+00:00'}});
  await page.waitForFunction(() => document.querySelector('.footer span').textContent === 'Last updated: 15 October 2026');
  await page.locator('[data-lang="ru"]').click();
  assert.equal(await footer.textContent(), 'Обновлено: 15 октября 2026 г.');

  // A new release must replace the previous date, even in the same browser.
  await page.unroute(manifestUrl);
  await page.route(manifestUrl, route => route.fulfill({json: {generated_utc: '2027-01-02T00:15:00+00:00'}}));
  await page.reload({waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => document.querySelector('.footer span').textContent === 'Обновлено: 2 января 2027 г.');
  assert.equal(await page.locator('.subtitle').textContent(), '1329 карт оценены для формата 3P / WGT / Все дополнения');
  await context.close();

  for (const reply of [
    {status: 404, body: 'Not found'},
    {contentType: 'application/json', body: '{broken'},
    {json: {}},
    {json: {generated_utc: null}},
    {json: {generated_utc: 'not a date'}},
    null,
  ]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    watch(page);
    await page.route(manifestUrl, route => reply ? route.fulfill(reply) : route.abort());
    await page.goto(baseUrl, {waitUntil: 'domcontentloaded'});
    await page.evaluate(() => loadReleaseDate());
    const footer = page.locator('.footer span');
    assert.equal(await footer.textContent(), 'Дата обновления недоступна');
    await page.locator('[data-lang="en"]').click();
    assert.equal(await footer.textContent(), 'Update date unavailable');
    assert.equal(await page.locator('#card-all').getAttribute('href'), 'output/tierlist_all.html');
    await context.close();
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(fullManifestRequests, [], 'Error handling must not fall back to the full manifest');
  console.log('Release date: compact metadata only, UTC day, RU/EN, late response, next release and error fallback PASS');
} finally {
  await browser.close();
}
