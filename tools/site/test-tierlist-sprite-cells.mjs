import fs from 'fs';
import path from 'path';
import {chromium} from '@playwright/test';
import {fileURLToPath, pathToFileURL} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const spritesDir = path.join(repoRoot, 'output', 'sprites');

function spriteFiles() {
  return fs.readdirSync(spritesDir)
    .filter((name) => /^tierlist_.*_cards\.webp$/.test(name))
    .sort()
    .map((name) => path.join(spritesDir, name));
}

function spriteConfigFor(filePath) {
  const name = path.basename(filePath);
  const match = /^tierlist_(.*)_cards\.webp$/.exec(name);
  if (!match) {
    throw new Error(`Unexpected sprite file name: ${name}`);
  }
  const htmlPath = path.join(repoRoot, 'output', `tierlist_${match[1]}.html`);
  const html = fs.readFileSync(htmlPath, 'utf8');
  const marker = 'const spriteConfig = ';
  const start = html.indexOf(marker);
  if (start < 0) {
    throw new Error(`No spriteConfig found in ${htmlPath}`);
  }
  const jsonStart = start + marker.length;
  const jsonEnd = html.indexOf(';', jsonStart);
  if (jsonEnd < 0) {
    throw new Error(`No spriteConfig terminator found in ${htmlPath}`);
  }
  return JSON.parse(html.slice(jsonStart, jsonEnd));
}

async function inspectSprite(page, filePath, spriteConfig) {
  const name = path.basename(filePath);
  const fileUrl = pathToFileURL(filePath).href;
  const cellWidth = spriteConfig.thumbWidth;
  const cellHeight = spriteConfig.thumbHeight;

  return page.evaluate(async ({name, fileUrl, cellWidth, cellHeight}) => {
    const img = new Image();
    img.src = fileUrl;
    await img.decode();

    const width = img.naturalWidth;
    const height = img.naturalHeight;
    const dimensionErrors = [];
    if (width % cellWidth !== 0) {
      dimensionErrors.push(`width ${width} is not divisible by ${cellWidth}`);
    }
    if (height % cellHeight !== 0) {
      dimensionErrors.push(`height ${height} is not divisible by ${cellHeight}`);
    }

    const columns = Math.floor(width / cellWidth);
    const rows = Math.floor(height / cellHeight);
    const canvas = document.createElement('canvas');
    canvas.width = cellWidth;
    canvas.height = cellHeight;
    const context = canvas.getContext('2d', {willReadFrequently: true});
    context.imageSmoothingEnabled = false;
    const maxInset = Math.max(2, Math.ceil(Math.min(cellWidth, cellHeight) * 0.1));

    const failures = [];
    let nonemptyCells = 0;

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        context.clearRect(0, 0, cellWidth, cellHeight);
        context.drawImage(
          img,
          column * cellWidth,
          row * cellHeight,
          cellWidth,
          cellHeight,
          0,
          0,
          cellWidth,
          cellHeight,
        );

        const pixels = context.getImageData(0, 0, cellWidth, cellHeight).data;
        let minX = cellWidth;
        let minY = cellHeight;
        let maxX = -1;
        let maxY = -1;

        for (let y = 0; y < cellHeight; y += 1) {
          for (let x = 0; x < cellWidth; x += 1) {
            const alpha = pixels[((y * cellWidth + x) * 4) + 3];
            if (alpha === 0) continue;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }

        if (maxX < 0) continue;
        nonemptyCells += 1;

        const marginRight = cellWidth - 1 - maxX;
        const marginBottom = cellHeight - 1 - maxY;
        if (minX > maxInset || minY > maxInset || marginRight > maxInset || marginBottom > maxInset) {
          failures.push({
            sprite: name,
            cell: row * columns + column,
            row,
            column,
            bbox: {minX, minY, maxX, maxY},
            maxInset,
          });
        }
      }
    }

    return {
      summary: {
        width,
        height,
        cellWidth,
        cellHeight,
        cells: columns * rows,
        nonemptyCells,
      },
      failures: [
        ...dimensionErrors.map((message) => ({sprite: name, message})),
        ...failures,
      ],
    };
  }, {name, fileUrl, cellWidth, cellHeight});
}

export async function run() {
  const files = spriteFiles();
  if (files.length === 0) {
    throw new Error(`No tier list card sprites found in ${spritesDir}`);
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--allow-file-access-from-files'],
  });
  const summaries = {};
  const failures = [];

  try {
    for (const filePath of files) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(pathToFileURL(path.join(repoRoot, 'index.html')).href);
      const name = path.basename(filePath);
      try {
        const result = await inspectSprite(page, filePath, spriteConfigFor(filePath));
        summaries[name] = result.summary;
        failures.push(...result.failures);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify({
    spritesDir,
    sprites: summaries,
  }, null, 2));

  if (failures.length > 0) {
    console.error('Sprite cell bbox failures:');
    for (const failure of failures.slice(0, 20)) {
      console.error(JSON.stringify(failure));
    }
    if (failures.length > 20) {
      console.error(`...and ${failures.length - 20} more`);
    }
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
