import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const baseUrl = process.env.SITE_BASE_URL;
if (!baseUrl) throw new Error('Run through tools/site/run-static-server.mjs');

// Cards whose artwork exists on disk; each must reach a loadable image.
const CARDS_WITH_ART = [
  "An Offer You Can't Refuse",
  "CEO's Favorite Project",
  "Darkside Smugglers' Union",
  "Inventors' Guild",
  'Staging Station "Behemoth"',
  'Bio-Batteries',
  'Co-leadership',
];

// Control: no artwork file exists, so the text fallback is the correct outcome.
const CARD_WITHOUT_ART = 'Zeta Tollkeeper';

const browser = await chromium.launch({headless: true});
try {
  const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(baseUrl + '/tierlist-builder.html?category=all', {waitUntil: 'domcontentloaded'});
  await page.locator('#poolZone .maker-card').first().waitFor({state: 'attached'});

  const result = await page.evaluate(async ({wanted, control}) => {
    const load = (src) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ok: img.naturalWidth > 0, width: img.naturalWidth});
      img.onerror = () => resolve({ok: false, width: 0});
      img.src = src;
    });
    const out = [];
    for (const name of [...wanted, control]) {
      const card = state.allCards.find((item) => item.name === name);
      if (!card) {
        out.push({name, found: false});
        continue;
      }
      const candidates = card.imageCandidates || [];
      const probe = candidates.length > 0 ? await load(candidates[0]) : {ok: false, width: 0};
      out.push({name, found: true, candidates, loaded: probe.ok, width: probe.width});
    }
    const entityLeaks = state.allCards
      .map((card) => card.name)
      .filter((name) => /&(#\d+|#x[0-9a-f]+|[a-z]+);/i.test(name));
    return {cards: out, entityLeaks, total: state.allCards.length};
  }, {wanted: CARDS_WITH_ART, control: CARD_WITHOUT_ART});

  assert.ok(result.total > 1000, 'catalog cards loaded');
  assert.deepEqual(result.entityLeaks, [], 'card names must be entity-decoded');

  const failures = [];
  for (const card of result.cards) {
    if (card.name === CARD_WITHOUT_ART) {
      assert.equal(card.found, true, `${card.name}: present in catalog`);
      assert.equal(card.candidates.length, 0, `${card.name}: no artwork exists, so no candidates`);
      continue;
    }
    if (!card.found) failures.push(`${card.name}: missing from catalog`);
    else if (!card.candidates.length) failures.push(`${card.name}: no image candidate`);
    else if (!card.loaded) failures.push(`${card.name}: ${card.candidates[0]} did not load`);
  }
  assert.deepEqual(failures, [], 'cards with existing artwork must resolve to a loadable image');
  assert.deepEqual(errors, []);

  console.log(`Builder card art: ${CARDS_WITH_ART.length} cards with artwork resolve, control card falls back to text PASS`);
} finally {
  await browser.close();
}
