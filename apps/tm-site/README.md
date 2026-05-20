# tm-site

`apps/tm-site/src` is the source-owned site tree for GitHub Pages content.

Published files still live in the repo root because the current Pages flow expects
them there. Use `npm run site:sync` to sync source-owned landing, guide, builder,
and asset files back to the publish target.

Generated tierlist pages are source-owned under `apps/tm-site/src/output` and are
mirrored to the current publish target `output/` by the tierlist generator.

Scope of this module:
- landing page
- interactive tier list builder
- guide pages
- source-owned generated tierlist HTML under `src/output`
- site assets (`favicon*`, `og-image.png`)

Builder card assets:
- `tools/site/build-builder-assets.js` extracts card metadata for the builder.
- `tools/site/build-builder-card-images.py` writes uniform `480x640` WebP cards to `output/builder_cards/`.
- `tools/site/builder_card_sources/` stores corporation source captures used to avoid top cropping.
- `tools/site/capture-builder-card-sources.mjs` refreshes those source captures from the live card renderer.

Out of scope:
- `extension/**`
- `bot/**`
- `scripts/tm_advisor/**`
- runtime logs and temporary analysis artifacts
