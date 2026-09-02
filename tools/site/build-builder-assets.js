const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const sourceHtml = path.join(repoRoot, 'apps', 'tm-site', 'src', 'output', 'tierlist_all_ru.html');
const outputPath = path.join(repoRoot, 'apps', 'tm-site', 'src', 'tierlist-builder-assets.js');

const imageDirs = [
  {dir: 'images/corporations', types: ['corporation']},
  {dir: 'images/preludes', types: ['prelude']},
  {dir: 'images/ceos', types: ['ceo']},
  {dir: 'images/project_cards', types: ['active', 'automated', 'event', 'project', '']},
  {dir: 'output/tiermaker_template_corps', types: ['corporation']},
  {dir: 'output/tiermaker_template_preludes', types: ['prelude']},
  {dir: 'output/tiermaker_template_projects', types: ['active', 'automated', 'event', 'project', '']},
];

function decodeHtml(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function normalize(value) {
  return decodeHtml(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/['’]s\b/gi, '')
    .replace(/s['’]\b/gi, 's')
    .replace(/:(ares|u|promo)$/i, '_$1')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
}

function keysFor(value) {
  const decoded = decodeHtml(value);
  const variants = new Set();
  if (/:promo$/i.test(decoded)) {
    variants.add(decoded.replace(/:promo$/i, ''));
    variants.add(decoded.replace(/:promo$/i, '_promo'));
  }
  variants.add(decoded);
  variants.add(decoded.replace(/:(ares|u|promo)$/i, '_$1'));
  variants.add(decoded.replace(/:(ares|u|promo)$/i, ''));
  variants.add(decoded.replace(/['’]s\b/gi, '_s'));
  variants.add(decoded.replace(/['’]s\b/gi, ''));
  variants.add(decoded.replace(/['’]/g, ''));
  variants.add(decoded.replace(/-/g, ' '));
  const keys = new Set();
  for (const variant of variants) {
    const normalized = normalize(variant);
    if (normalized) {
      keys.add(normalized);
      keys.add(normalized.replace(/_/g, ''));
    }
  }
  return Array.from(keys);
}

function typeFromClass(className) {
  const match = String(className || '').match(/\bctype-([^\s"]+)/);
  return match ? match[1] : '';
}

function listImages() {
  const images = [];
  const byType = new Map();
  for (const group of imageDirs) {
    const absDir = path.join(repoRoot, group.dir);
    if (!fs.existsSync(absDir)) continue;
    for (const file of fs.readdirSync(absDir).sort()) {
      if (!/\.(png|jpg|jpeg|webp)$/i.test(file)) continue;
      const ext = path.extname(file);
      const stem = path.basename(file, ext);
      const webPath = `${group.dir}/${encodeURIComponent(stem)}${ext}`.replace(/\\/g, '/');
      images.push(webPath);
      for (const type of group.types) {
        if (!byType.has(type)) byType.set(type, new Map());
        const map = byType.get(type);
        for (const key of keysFor(stem)) {
          if (!map.has(key)) map.set(key, webPath);
        }
      }
    }
  }
  return {images, byType};
}

function parseCards(html) {
  const cards = [];
  const seen = new Set();
  const re = /<div class="([^"]*\bcard\b[^"]*)"([^>]*)data-name="([^"]+)"([^>]*)>/g;
  for (const match of html.matchAll(re)) {
    const name = decodeHtml(match[3]);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    cards.push({
      name,
      type: typeFromClass(match[1]),
    });
  }
  return cards;
}

function loadExistingPayload() {
  if (!fs.existsSync(outputPath)) return {};
  const text = fs.readFileSync(outputPath, 'utf8');
  const match = text.match(/=\s*(\{[\s\S]*\});?\s*$/);
  return match ? JSON.parse(match[1]) : {};
}

function resolveImage(card, imageIndex) {
  const map = imageIndex.byType.get(card.type) || imageIndex.byType.get('');
  if (!map) return '';
  for (const key of keysFor(card.name)) {
    const found = map.get(key);
    if (found) return found;
  }
  return '';
}

function main() {
  const html = fs.readFileSync(sourceHtml, 'utf8');
  const existingPayload = loadExistingPayload();
  const cards = parseCards(html);
  const imageIndex = listImages();
  const cardImages = {};
  const unmatched = [];

  for (const card of cards) {
    const image = resolveImage(card, imageIndex);
    if (image) {
      cardImages[card.name] = image;
    } else {
      unmatched.push(card.name);
    }
  }

  const payload = {
    images: imageIndex.images,
    cardImages,
    stats: {
      cards: cards.length,
      matched: Object.keys(cardImages).length,
      unmatched: unmatched.length,
    },
    unmatched,
    cardMetadata: existingPayload.cardMetadata || {},
  };

  const body = `window.TM_BUILDER_ASSETS = ${JSON.stringify(payload, null, 2)};\n`;
  fs.writeFileSync(outputPath, body, 'utf8');
  console.log(`builder assets: ${payload.stats.matched}/${payload.stats.cards} cards matched, ${payload.stats.unmatched} unmatched`);
  if (unmatched.length > 0) {
    console.log(`unmatched: ${unmatched.join(', ')}`);
  }
}

main();
