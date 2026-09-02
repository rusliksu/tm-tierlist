# Implementation Plan: Boom Town Tier List Site

## Strategy

Use the advisor's validated Boom Town output as the only scoring source. Regenerate the affected canonical pages, sprite, and builder assets, synchronize publish mirrors, and validate the static site before a task-owned PR.

## Work Packages

### WP01 — Import generated Boom Town assets

- Generate/copy the approved EN/RU card data and image assets.
- Update Prelude and all-card pages plus builder metadata.

### WP02 — Synchronize and validate

- Run site sync.
- Run complete site validation and inspect the focused diff.

### WP03 — Deliver PR

- Commit, push, verify CI, and merge the task-owned PR.
- Do not publish the VPS static release.
