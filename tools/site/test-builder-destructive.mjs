import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const baseUrl = process.env.SITE_BASE_URL;
if (!baseUrl) throw new Error('Run through tools/site/run-static-server.mjs');
const keys = {draft: 'tm-tierlist-builder:draft:v1', saves: 'tm-tierlist-builder:saves:v1',
  session: 'tm-tierlist-builder:rating-session:v1', ratings: 'tm-tierlist-user-ratings-v1'};
const draft = {id: 'current', title: 'My personal list', author: 'Test author', category: 'corporations',
  tiers: [{id: 'A', label: 'Favorites', color: '#ffbf7f'}, {id: 'B', label: 'Other', color: '#ffdf7f'}],
  placements: {A: ['Terralabs Research'], B: ['CrediCor']}, ratings: {'Terralabs Research': 0, CrediCor: 67},
  expansions: ['Base'], cardSize: 132, showScores: true};
const other = {...draft, id: 'other', title: 'Do not delete this list'};
const concurrent = {...draft, id: 'concurrent', title: 'Saved in another tab'};
const fixtures = {[keys.draft]: draft, [keys.saves]: [draft, other],
  [keys.session]: {active: true, category: 'corporations', queue: ['CrediCor'], index: 0, activeScoreText: '57'},
  [keys.ratings]: {'Terralabs Research': 0, CrediCor: 67}};
const fields = ['title', 'author', 'category', 'tiers', 'placements', 'ratings', 'expansions', 'cardSize', 'showScores'];
const browser = await chromium.launch({headless: true});
const failures = [];

async function stored(page) {
  return page.evaluate(keys => Object.fromEntries(Object.values(keys).map(key => [key, localStorage.getItem(key)])), keys);
}

async function exported(page) {
  const pending = page.waitForEvent('download');
  await page.locator('#exportBtn').click();
  const chunks = [];
  for await (const chunk of await (await pending).createReadStream()) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

try {
  for (const mobile of [false, true]) {
    for (const action of ['newListBtn', 'resetBoardBtn', 'deleteBtn']) {
      const context = await browser.newContext({viewport: mobile ? {width: 390, height: 844} : {width: 1440, height: 1000},
        isMobile: mobile, hasTouch: mobile});
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => {if (m.type() === 'error') errors.push(m.text());});
      try {
        // Synthetic fixtures only, in a fresh browser context.
        await page.goto(`${baseUrl}/tierlist-builder.html?category=corporations#board`);
        await page.locator('#poolZone .maker-card').first().waitFor();
        await page.evaluate(entries => {
          for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, JSON.stringify(value));
        }, fixtures);
        await page.reload();
        await page.locator('#tierStack .maker-card[data-name="CrediCor"]').waitFor();
        const before = await stored(page);
        const initial = await exported(page);
        const initialUrl = page.url();
        const peer = action === 'deleteBtn' ? await context.newPage() : null;
        if (peer) await peer.goto(`${baseUrl}/tierlist-builder.html`);
        const dialogs = [];
        let accept = false;
        page.on('dialog', async dialog => {
          dialogs.push({type: dialog.type(), text: dialog.message()});
          if (accept && peer) await peer.evaluate(({key, save}) => {
            const saves = JSON.parse(localStorage.getItem(key));
            localStorage.setItem(key, JSON.stringify([...saves, save]));
          }, {key: keys.saves, save: concurrent});
          if (accept) await dialog.accept(); else await dialog.dismiss();
        });
        const button = page.locator(`#${action}`);
        if (action === 'deleteBtn') {
          await page.locator('#savedLists').selectOption('current');
        }
        if (mobile) await button.tap();
        else {await button.focus(); await page.keyboard.press('Enter');}
        assert.deepEqual(await stored(page), before, `${action}: Cancel must not write user data`);
        const cancelled = await exported(page);
        for (const field of ['id', ...fields]) assert.deepEqual(cancelled[field], initial[field], `Cancel: ${field}`);
        assert.equal(page.url(), initialUrl);
        assert.equal(dialogs.length, 1);
        assert.equal(dialogs[0].type, 'confirm');
        if (action === 'deleteBtn') assert.ok(dialogs[0].text.includes(draft.title), 'Name the selected list');
        await page.reload();
        await page.locator('#tierStack .maker-card[data-name="CrediCor"]').waitFor();
        const reloaded = await exported(page);
        for (const field of ['id', ...fields]) assert.deepEqual(reloaded[field], initial[field], `Reload after Cancel: ${field}`);
        assert.deepEqual(await stored(page), before);

        accept = true;
        if (action === 'deleteBtn') await page.locator('#savedLists').selectOption('current');
        if (mobile) await button.tap(); else await button.click();
        if (action === 'deleteBtn') await page.locator('#savedLists option[value="current"]').waitFor({state: 'detached'});
        assert.equal(dialogs.length, 2);
        const after = await stored(page);
        assert.equal(after[keys.ratings], before[keys.ratings], 'Catalog ratings stay unchanged');
        if (action === 'deleteBtn') {
          assert.deepEqual(JSON.parse(after[keys.saves]), [other, concurrent], 'Only the named list is removed, including a save made while the dialog is open');
          assert.equal(after[keys.draft], before[keys.draft], 'Delete does not rewrite the draft');
          assert.equal(after[keys.session], before[keys.session]);
        } else {
          assert.equal(after[keys.saves], before[keys.saves], 'Saved lists stay byte-identical');
          const changed = JSON.parse(after[keys.draft]);
          assert.deepEqual(changed.ratings, {});
          assert.ok(Object.values(changed.placements).every(cards => cards.length === 0));
          if (action === 'resetBoardBtn') {
            for (const field of ['id', ...fields.filter(f => !['placements', 'ratings'].includes(f))]) assert.deepEqual(changed[field], initial[field], field);
            assert.equal(after[keys.session], before[keys.session]);
          } else {
            assert.equal(changed.id, 'draft');
            assert.equal(changed.title, 'Мой тир-лист корпораций');
            assert.equal(changed.author, draft.author);
            assert.equal(after[keys.session], null, 'Confirmed New ends the rating session');
          }
        }
        await page.reload();
        await page.locator('#poolZone .maker-card').first().waitFor();
        const final = await exported(page);
        if (action === 'deleteBtn') {
          for (const field of fields) assert.deepEqual(final[field], initial[field], field);
          assert.deepEqual(JSON.parse((await stored(page))[keys.saves]), [other, concurrent]);
        } else {
          assert.deepEqual(final.ratings, {});
          assert.ok(Object.values(final.placements).every(cards => cards.length === 0));
          await page.locator('#savedLists').selectOption('current');
          await page.locator('#loadBtn').click();
          const saved = await exported(page);
          for (const field of fields) assert.deepEqual(saved[field], initial[field], `Saved list after reset: ${field}`);
        }
        assert.deepEqual(errors, []);
        console.log(`Safe builder actions: ${mobile ? 'touch phone' : 'desktop keyboard'} ${action} cancel/confirm/reload PASS`);
      } catch (error) {
        failures.push(`${mobile ? 'phone' : 'desktop'} ${action}: ${error.message}`);
      } finally {await context.close();}
    }
  }
  assert.deepEqual(failures, []);
} finally {await browser.close();}
