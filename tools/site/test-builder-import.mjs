import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const base = process.env.SITE_BASE_URL;
if (!base) throw new Error('Run through tools/site/run-static-server.mjs');
const keys = {draft: 'tm-tierlist-builder:draft:v1', saves: 'tm-tierlist-builder:saves:v1',
  session: 'tm-tierlist-builder:rating-session:v1', ratings: 'tm-tierlist-user-ratings-v1'};
const draft = {id: 'original', title: 'Keep my draft', author: 'Test author', category: 'corporations',
  tiers: [{id: 'A', label: 'Favorites', color: '#ffbf7f'}, {id: 'B', label: 'Other', color: '#ffdf7f'}],
  placements: {A: ['Terralabs Research'], B: ['CrediCor']}, ratings: {'Terralabs Research': 0, CrediCor: 67},
  expansions: ['Base'], cardSize: 132, showScores: true};
const fixture = {[keys.draft]: draft, [keys.saves]: [draft],
  [keys.session]: {active: true, category: 'corporations', queue: ['CrediCor'], index: 0, activeScoreText: '57'},
  [keys.ratings]: {'Terralabs Research': 0, CrediCor: 67}};
const legacy = {title: 'Legacy list', author: 'Legacy author', tierLabels: {A: 'Old favorites'},
  placements: {A: ['TerraLabs Research', 'Future card fixture'], B: ['CrediCor']},
  ratings: {'TerraLabs Research': '0', CrediCor: '67'}};
const invalid = [
  ['empty object', '{}'], ['foreign JSON', '{"hello":"world"}'], ['null', 'null'], ['array', '[]'], ['syntax', '{'],
  ['bad placements', {...draft, placements: {A: 'CrediCor'}}],
  ['bad card name', {...draft, placements: {A: [null]}}],
  ['orphan tier', {...draft, placements: {missing: ['CrediCor']}}],
  ['duplicate tiers', {...draft, tiers: [draft.tiers[0], draft.tiers[0]]}],
  ['bad category', {...draft, category: 'unknown'}],
  ['bad score', {...draft, ratings: {CrediCor: 101}}],
  ['bad score text', {...draft, ratings: {CrediCor: 'oops'}}],
  ['bad size', {...draft, cardSize: 'NaN'}],
  ['bad filters', {...draft, expansions: [null]}],
  ['blank author', {...draft, author: ''}],
];
const fields = ['id', 'title', 'author', 'category', 'tiers', 'placements', 'ratings', 'expansions', 'cardSize', 'showScores'];
const browser = await chromium.launch();
const failures = [];
const readStorage = page => page.evaluate(keys => Object.fromEntries(Object.values(keys).map(k => [k, localStorage.getItem(k)])), keys);
async function exported(page) {
  const pending = page.waitForEvent('download');
  await page.locator('#exportBtn').click();
  const chunks = [];
  for await (const chunk of await (await pending).createReadStream()) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
async function selectFile(page, value) {
  await page.locator('#importFile').setInputFiles({name: 'fixture.json', mimeType: 'application/json',
    buffer: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value))});
}
async function upload(page, value, preview = true) {
  await selectFile(page, value);
  if (preview) {
    await page.locator('#importPreview').waitFor();
    await page.locator('#confirmImportBtn').click();
  }
  await page.locator('#toast.show').waitFor();
}
async function seed(page) {
  await page.evaluate(entries => {
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, JSON.stringify(value));
  }, fixture);
  await page.reload();
  await page.locator('#tierStack .maker-card[data-name="CrediCor"]').waitFor();
}
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({viewport: mobile ? {width: 390, height: 844} : {width: 1440, height: 1000},
      isMobile: mobile, hasTouch: mobile});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => {if (m.type() === 'error') errors.push(m.text());});
    try {
      await page.goto(`${base}/tierlist-builder.html?category=corporations#board`);
      await page.locator('#poolZone .maker-card').first().waitFor();
      // A valid file must not replace the draft until the user explicitly confirms.
      for (const [value, dismiss] of [[{...draft, title: '<img src=x onerror=alert(1)>'}, 'button'], [legacy, 'escape'], [draft, 'enter']]) {
        await seed(page);
        const before = await readStorage(page);
        const beforeExport = await exported(page);
        const url = page.url();
        const chooser = page.waitForEvent('filechooser');
        if (mobile) await page.locator('#importBtn').tap(); else await page.locator('#importBtn').click();
        await (await chooser).setFiles({name: 'preview.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value))});
        await page.locator('#importPreview').waitFor({timeout: 3000});
        assert.equal(await page.locator('#importPreviewTitle').textContent(), value.title);
        assert.equal(await page.locator('#importPreviewAuthor').textContent(), value.author);
        assert.equal(await page.locator('#importPreviewCategory').textContent(), 'Корпорации');
        assert.equal(await page.locator('#importPreviewCount').textContent(), value === legacy ? '3' : '2');
        assert.equal(await page.locator('#importPreview img').count(), 0, 'Preview renders untrusted names as text');
        assert.deepEqual(await readStorage(page), before, 'Preview must not write data');
        assert.equal(await page.locator('#cancelImportBtn').evaluate(el => el === document.activeElement), true);
        if (dismiss === 'button') {
          if (mobile) await page.locator('#cancelImportBtn').tap(); else await page.locator('#cancelImportBtn').click();
        } else await page.keyboard.press(dismiss === 'escape' ? 'Escape' : 'Enter');
        await page.locator('#importPreview').waitFor({state: 'hidden'});
        assert.deepEqual(await readStorage(page), before, 'Cancel must preserve raw storage');
        assert.equal(page.url(), url);
        const afterExport = await exported(page);
        for (const f of fields) assert.deepEqual(afterExport[f], beforeExport[f], `Cancel preview: ${f}`);
        await page.reload();
        await page.locator('#tierStack .maker-card[data-name="CrediCor"]').waitFor();
        assert.deepEqual(await readStorage(page), before, 'Cancel reload');
      }
      await seed(page);
      await page.goto(`${base}/tierlist-builder.html?rating=1`);
      await page.locator('#ratingStage').waitFor();
      const ratingBefore = await readStorage(page);
      const ratingUrl = page.url();
      await selectFile(page, legacy);
      await page.locator('#importPreview').waitFor();
      await page.keyboard.press('7');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Escape');
      await page.locator('#importPreview').waitFor({state: 'hidden'});
      assert.deepEqual(await readStorage(page), ratingBefore, 'Preview keys must not edit the active rating queue');
      assert.equal(page.url(), ratingUrl);
      await page.goto(`${base}/tierlist-builder.html?category=corporations#board`);
      for (const [label, value] of invalid) {
        await seed(page);
        const before = await readStorage(page);
        const beforeExport = await exported(page);
        const url = page.url();
        await upload(page, value, false);
        try {
          assert.deepEqual(await readStorage(page), before, `${label}: rejected import must not write storage`);
          const afterExport = await exported(page);
          for (const f of fields) assert.deepEqual(afterExport[f], beforeExport[f], `${label}: ${f}`);
          assert.equal(page.url(), url);
          assert.match(await page.locator('#toast').textContent(), /Не удалось|Неверный/);
          await page.reload();
          await page.locator('#tierStack .maker-card[data-name="CrediCor"]').waitFor();
          assert.deepEqual(await readStorage(page), before, `${label}: reload`);
        } catch (e) {failures.push(`${mobile ? 'phone' : 'desktop'} ${label}: ${e.message.split('\n')[0]}`);}
      }
      // Fault injection only at the browser storage boundary, in this synthetic context.
      for (const [failKey, emptySaves] of [[keys.saves, false], [keys.draft, false], [keys.draft, true]]) {
        await seed(page);
        if (emptySaves) await page.evaluate(key => localStorage.removeItem(key), keys.saves);
        const before = await readStorage(page);
        await page.evaluate(key => {
          const original = Storage.prototype.setItem;
          let failed = false;
          Storage.prototype.setItem = function(k, v) {
            if (k === key && !failed) {failed = true; throw new DOMException('Synthetic quota', 'QuotaExceededError');}
            return original.call(this, k, v);
          };
        }, failKey);
        await upload(page, {...draft, title: 'Rejected storage write'});
        try {
          assert.deepEqual(await readStorage(page), before, `Storage failure ${failKey}`);
          assert.equal(await page.locator('#listTitle').inputValue(), draft.title);
          assert.match(await page.locator('#toast').textContent(), /Не удалось/);
        } catch (e) {failures.push(`${mobile ? 'phone' : 'desktop'} write failure: ${e.message.split('\n')[0]}`);}
      }
      if (failures.length) continue;
      // Fill a fresh browser origin to its actual quota, leaving room for one write.
      await seed(page);
      const quotaReached = await page.evaluate(() => {
        let low = 0, high = 8 * 1024 * 1024, rejected = false;
        while (low + 1 < high) {
          const size = Math.floor((low + high) / 2);
          try {localStorage.setItem('quota-probe', 'x'.repeat(size)); low = size;}
          catch (e) {if (e.name !== 'QuotaExceededError') throw e; rejected = true; high = size;}
        }
        localStorage.setItem('quota-probe', 'x'.repeat(low - 75000));
        return rejected;
      });
      assert.equal(quotaReached, true, 'Actual browser quota must be reached');
      const beforeQuota = await readStorage(page);
      await upload(page, {...draft, title: 'q'.repeat(50000)});
      assert.match(await page.locator('#toast').textContent(), /Не удалось сохранить/);
      assert.deepEqual(await readStorage(page), beforeQuota, 'Actual quota failure preserves all four data keys');
      await page.evaluate(() => localStorage.removeItem('quota-probe'));
      await seed(page);
      const beforeRollback = await readStorage(page);
      await page.evaluate(({draft, saves}) => {
        const original = Storage.prototype.setItem;
        let saved = false;
        Storage.prototype.setItem = function(k, v) {
          if (k === draft || (k === saves && saved)) throw new DOMException('Synthetic denial', 'SecurityError');
          if (k === saves) saved = true;
          return original.call(this, k, v);
        };
      }, keys);
      await upload(page, {...draft, title: 'Import could not be opened'});
      const afterRollback = await readStorage(page);
      for (const key of [keys.draft, keys.ratings, keys.session]) assert.equal(afterRollback[key], beforeRollback[key]);
      const retained = JSON.parse(afterRollback[keys.saves]);
      assert.equal(retained.length, 2);
      assert.deepEqual(retained[0], draft, 'Even failed rollback retains the original saved list');
      assert.equal(await page.locator('#listTitle').inputValue(), draft.title);
      assert.match(await page.locator('#toast').textContent(), /проверьте список сохранений/);
      await page.reload();
      for (const value of [{...draft, title: 'Modern list'}, legacy]) {
        await seed(page);
        const before = await readStorage(page);
        await selectFile(page, value);
        await page.locator('#importPreview').waitFor();
        assert.deepEqual(await readStorage(page), before, 'Wait for explicit import confirmation');
        if (value !== legacy) {
          const other = await context.newPage();
          await other.goto(`${base}/tierlist-builder.html`);
          await other.evaluate(({key, record}) => {
            const saves = JSON.parse(localStorage.getItem(key));
            localStorage.setItem(key, JSON.stringify([...saves, record]));
          }, {key: keys.saves, record: {...draft, id: 'other-tab', title: 'Saved while preview was open'}});
          await other.close();
        }
        if (mobile) await page.locator('#confirmImportBtn').tap(); else await page.locator('#confirmImportBtn').click();
        await page.locator('#toast.show').waitFor();
        assert.equal(await page.locator('#listTitle').inputValue(), value.title);
        assert.equal(await page.locator('#listAuthor').inputValue(), value.author);
        const imported = await exported(page);
        assert.notEqual(imported.id, draft.id);
        assert.deepEqual(imported.ratings, {'Terralabs Research': 0, CrediCor: 67});
        assert.deepEqual(imported.placements.A, value === legacy ? ['Terralabs Research', 'Future card fixture'] : ['Terralabs Research']);
        if (value === legacy) assert.equal(imported.tiers.find(t => t.id === 'A').label, 'Old favorites');
        else assert.deepEqual(imported.tiers, draft.tiers);
        const after = await readStorage(page);
        const saves = JSON.parse(after[keys.saves]);
        assert.equal(saves.length, value === legacy ? 2 : 3);
        assert.deepEqual(saves[0], draft, 'Do not overwrite an existing saved list using imported id');
        if (value !== legacy) assert.equal(saves[1].id, 'other-tab', 'Retain lists added while preview was open');
        assert.equal(after[keys.ratings], before[keys.ratings]);
        assert.equal(after[keys.session], null);
        await page.reload();
        await page.locator('#tierStack .maker-card[data-name="CrediCor"]').waitFor();
        const reloaded = await exported(page);
        for (const f of fields) assert.deepEqual(reloaded[f], imported[f], `Valid import reload: ${f}`);
        const afterSuccess = await readStorage(page);
        await selectFile(page, value);
        await page.locator('#importPreview').waitFor();
        await page.keyboard.press('Escape');
        await page.locator('#importPreview').waitFor({state: 'hidden'});
        assert.deepEqual(await readStorage(page), afterSuccess, 'Escape after a prior confirmation must not import again');
      }
      assert.deepEqual(errors, []);
      console.log(`Safe import: ${mobile ? 'touch phone' : 'desktop'}, preview/cancel/escape/default-enter/rating-keys, ${invalid.length} invalid files, three write failures + actual quota + rollback denial, modern+legacy+alias+zero+reload PASS`);
    } finally {await context.close();}
  }
  assert.deepEqual(failures, []);
} finally {await browser.close();}
