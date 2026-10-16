# Terraforming Mars Tier List Site

Site-only repository for the public Terraforming Mars tier list pages.

**Primary live site:** [tm.knightbyte.win/tierlist](https://tm.knightbyte.win/tierlist/)

**Disabled legacy URL:** `https://rusliksu.github.io/tm-tierlist/`

This repo intentionally contains only the static tier list site surface:

- landing and guide pages
- generated tier list HTML
- images and static assets
- site sync and validation tooling

It intentionally does not contain the advisor runtime, Chrome extension runtime,
smartbot runtime, canonical card data, or shared brain packages.

## Current Model

- canonical site source lives in `apps/tm-site/src/`
- publish files live at the repo root and under `output/`
- production is served from a VPS static release under `tm.knightbyte.win/tierlist/`
- GitHub Pages is disabled to avoid maintaining two public versions
- `tools/site/sync-site.py` checks and syncs canonical source to publish paths
- `tools/site/test-tierlist-network.mjs` verifies local page asset requests

## Local Validation

```bash
npm install
npm run site:check
npm run test:site
```

## Refreshing published ratings

Canonical evaluations stay in the advisor repository. To refresh tier-list pages
from a local advisor checkout without replacing this site's CSS, JavaScript or
sprite sheets:

```powershell
python tools/site/refresh-tierlist.py --advisor-root C:\Users\Ruslan\tm\tm-tierlist
python tools/site/test-tierlist-ratings.py --advisor-root C:\Users\Ruslan\tm\tm-tierlist
npm run test:site
```

The generated manifest pins the source commit, evaluation-file hash, category
counts and score/tier fingerprints. CI checks both languages and publish mirrors
against that pin without needing access to the private advisor repository.
Existing counted wiki links are pinned from the previous public site snapshot
and retained exactly; refreshing ratings does not silently replace their context.
Cards without existing site artwork keep a named text fallback. Refreshing files
does not deploy the VPS site. The builder reads the refreshed card pool and uses
the same named fallback where no image or sprite cell exists.

Old personal ratings and builder saves using `TerraLabs Research` are normalized
to `Terralabs Research` when loaded, including drafts, JSON imports and resumed
rating sessions. Scores and tier order stay intact; if both spellings exist, the
canonical score and placement win (including a score of zero). Reading does not
bulk-rewrite stored lists; the next normal save/export uses canonical names.
This compatibility mapping does not change the site's base ratings.

## Tier List Builder

The interactive builder is source-owned in `apps/tm-site/src/tierlist-builder.html`
and mirrored to the root `tierlist-builder.html` for the publish layout.

Catalog builder links select their category with `?category=all|corporations|preludes|projects|ceos`.
This selects a card view without clearing the restored draft, placements, personal
scores, title or author, and does not rewrite saved lists. Switching to a different
category starts with that category's expansion filters. An existing category query
follows explicit category changes or a loaded save; query-free homepage entry stays
query-free and reloads the saved draft as before. Saved lists restore their own
category and filters in both cases. Unknown categories
are ignored. The homepage keeps the usual draft/default behavior, and an explicit
`rating=1` route resumes its existing rating queue, which takes precedence over a category hint.

Manually choosing a different builder category asks for confirmation before clearing
the current draft's placements and personal scores. Cancel keeps the draft, URL and
stored data untouched. Confirm starts the selected category without changing saved
lists or catalog ratings; choosing the current category does nothing.

New, Clear board and Delete also ask for confirmation before changing user data.
Delete names the selected saved list and removes only that list, keeping the
current draft. Cancel leaves the draft and storage untouched. Confirmed New or
Clear board resets only the current draft; saved lists and catalog ratings remain.
Delete re-reads saved lists after confirmation, retaining lists saved in another
tab while the dialog was open.

JSON import validates and normalizes the entire file before changing the draft or
saved lists. It requires a title, author and tier-to-card placement map, as in
existing exports. Invalid fields or storage write failures show an error without
replacing the current draft. Imported lists receive a new ID, so an imported ID
cannot overwrite an existing saved list. Global personal ratings stay untouched.
Legacy files may omit category, tiers and other optional settings; `tierLabels`,
numeric-string ratings, zero scores and old card aliases remain supported.
Unknown card names are retained for compatibility with newer catalogs.
Like loading a saved list, a successful import opens that list as the draft and
exits the active rating session. A rejected import retains that session and queue.
If the browser also denies rollback after a draft write failure, the original
lists and draft remain intact, but an extra imported list may remain in storage;
the error explicitly asks the user to check saved lists rather than claiming success.

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
- Use `main` as the source for VPS static releases served at `tm.knightbyte.win/tierlist/`.
- Keep advisor, extension, smartbot, and data changes in their own repos.

The landing page fetches only `release-date.json`, a compact projection of the
static release manifest's `generated_utc` field, formatted in UTC for RU and EN.
This is the site release date, not a change to card ratings. It is fetched without
caching; missing or invalid date metadata shows an unavailable label. There is
no browser fallback to the full release manifest.

After writing `release-manifest.json` into a prepared, inactive static release,
generate its date projection before verifying and activating that release:

```bash
python tools/site/write-release-date.py /absolute/path/to/prepared-static-release
```

The writer validates and copies the exact timestamp, never uses the current
clock, and leaves the full manifest untouched. Include the generated
`release-date.json` in release verification alongside the generated full manifest;
do not commit either runtime file or generate the date in the live directory.

## License

This is a fan project. Terraforming Mars is designed by Jacob Fryxelius and
published by FryxGames / Stronghold Games. All card names and game mechanics
belong to their respective owners.
