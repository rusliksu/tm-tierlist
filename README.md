# Terraforming Mars Tier List Site

Site-only repository for the public Terraforming Mars tier list pages.

**Live site:** [rusliksu.github.io/tm-tierlist](https://rusliksu.github.io/tm-tierlist/)

This repo intentionally contains only the GitHub Pages surface:

- landing and guide pages
- generated tier list HTML
- images and static assets
- site sync and validation tooling

It intentionally does not contain the advisor runtime, Chrome extension runtime,
smartbot runtime, canonical card data, or shared brain packages.

## Current Model

- canonical site source lives in `apps/tm-site/src/`
- publish files live at the repo root and under `output/`
- GitHub Pages publishes the live site from branch `main`
- `tools/site/sync-site.py` checks and syncs canonical source to publish paths
- `tools/site/test-tierlist-network.mjs` verifies local page asset requests

## Local Validation

```bash
npm install
npm run site:check
npm run test:site
```

## Tier List Builder

The interactive builder is source-owned in `apps/tm-site/src/tierlist-builder.html`
and mirrored to the root `tierlist-builder.html` for GitHub Pages.

Builder card data is generated into `apps/tm-site/src/tierlist-builder-assets.js`
and mirrored to the root `tierlist-builder-assets.js`. The uniform card images
used by the builder live in `output/builder_cards/`.

Useful commands:

```bash
node tools/site/build-builder-assets.js
python tools/site/build-builder-card-images.py
npm run site:sync
npm run test:site
```

Corporation source captures that fix Pathfinder-style top cropping live in
`tools/site/builder_card_sources/`. Refresh them from the live card renderer with:

```bash
node tools/site/capture-builder-card-sources.mjs
python tools/site/build-builder-card-images.py
```

## Repository Layout

```text
tm-tierlist/
|-- apps/tm-site/
|   `-- src/
|-- tools/site/
|   `-- builder_card_sources/
|-- images/
|-- output/
|   `-- builder_cards/
|-- index.html
|-- *-guide.html
|-- tierlist-builder.html
|-- tierlist-builder-assets.js
|-- favicon.ico
|-- favicon.png
`-- og-image.png
```

## Publishing Notes

- Keep site source changes in `apps/tm-site/src/`.
- Run `npm run test:site` before pushing.
- Use `main` for the live GitHub Pages site.
- Keep advisor, extension, smartbot, and data changes in their own repos.

## License

This is a fan project. Terraforming Mars is designed by Jacob Fryxelius and
published by FryxGames / Stronghold Games. All card names and game mechanics
belong to their respective owners.
