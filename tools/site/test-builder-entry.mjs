import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const baseUrl = process.env.SITE_BASE_URL;
if (!baseUrl) throw new Error('Run through tools/site/run-static-server.mjs');
const browser = await chromium.launch({headless: true});
const errors = [];
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile ? {width: 390, height: 844} : {width: 1440, height: 1000},
      isMobile: mobile, hasTouch: mobile,
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const cases = [{path: '/index.html', ru: true}, {path: '/index.html', ru: false}];
    for (const category of ['all', 'corporations', 'preludes', 'projects', 'ceos']) {
      for (const ru of [true, false]) cases.push({path: `/output/tierlist_${category}${ru ? '_ru' : ''}.html`, ru});
    }
    for (const {path, ru} of cases) {
      await page.goto(baseUrl + path, {waitUntil: 'domcontentloaded'});
      if (path === '/index.html' && !ru) await page.locator('[data-lang="en"]').click();
      const link = page.getByRole('link', {name: ru ? 'Создать свой тир-лист' : 'Create your tier list', exact: true});
      assert.equal(await link.count(), 1, `${path}: discoverable builder link`);
      assert.equal(await link.isVisible(), true);
      const box = await link.boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= (mobile ? 390 : 1440) && box.y + box.height < (mobile ? 844 : 1000), `${path}: visible above the fold`);
      assert.ok(box.height >= 44, `${path}: touch-sized target`);
      assert.equal(await page.getByText(ru ? 'Личный список не меняет базовые оценки.' : 'Your personal list does not change the base ratings.', {exact: true}).isVisible(), true);
      if (mobile) {
        await link.tap();
      } else {
        await link.focus();
        await page.keyboard.press('Tab');
        await page.keyboard.press('Shift+Tab');
        assert.equal(await link.evaluate(el => el === document.activeElement && el.matches(':focus-visible')), true);
        assert.equal(await link.evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
        await page.keyboard.press('Enter');
      }
      await page.waitForURL('**/tierlist-builder.html');
      assert.equal(new URL(page.url()).pathname, '/tierlist-builder.html');
      await page.locator('#poolZone .maker-card').first().waitFor({state: 'attached'});
      assert.equal(await page.locator('h1').isVisible(), true);
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log('Builder entry: homepage RU/EN + all 10 catalogs, desktop + touch phone, visible navigation PASS');
} finally {
  await browser.close();
}
