# Terraforming Mars Site Rehearsal

This repository is a local rehearsal for the future `tm-site` split.

It intentionally contains only the site-owned scope:
- GitHub Pages landing and guide pages
- generated tierlist HTML
- site images and static assets
- site sync and validation tooling

It intentionally does not contain:
- extension runtime
- smartbot runtime
- advisor runtime
- canonical data and shared brain packages

## Current model

- canonical site source lives in `apps/tm-site/src/`
- publish copies currently live in the repo root and `output/`
- `tools/site/sync-site.py` checks and syncs canonical source to publish paths
- `tools/site/test-tierlist-network.mjs` verifies that local pages resolve their site assets

## Local validation

```bash
npm install
npm run site:check
npm run test:tierlist-network
```

## Repository shape

```text
tm-site-rehearsal-20260409/
|-- apps/tm-site/
|-- tools/site/
|-- images/
|-- output/
|-- index.html
|-- *-guide.html
|-- favicon.ico
|-- favicon.png
`-- og-image.png
```

## Notes

- This is a rehearsal checkout only.
- No deploy is wired from this local repo.
- Current public URLs still point at `rusliksu/tm-tierlist`.

## License

This is a fan project. Terraforming Mars is designed by Jacob Fryxelius and
published by FryxGames / Stronghold Games. All card names and game mechanics
belong to their respective owners.
