# Mission Specification: Boom Town Tier List Site

**Branch**: `codex/boom-town-site`  
**Created**: 2026-09-02  
**Status**: Approved for implementation  
**Bead**: `tm-ai-k6r`

## Requirements

| ID | Requirement |
|----|-------------|
| FR-001 | English and Russian Prelude and all-card tier-list pages SHALL include Boom Town in D tier at score 54. |
| FR-002 | Card modal text SHALL match the canonical advisor facts and situational evaluation. |
| FR-003 | Sprite and builder assets SHALL include a resolvable Boom Town image. |
| FR-004 | Canonical `apps/tm-site/src` and publish mirrors SHALL remain synchronized. |
| NFR-001 | `site:check` and `test:site` SHALL pass. |
| C-001 | The site consumes advisor output; it SHALL not introduce an independent score. |
| C-002 | No VPS/live publication is authorized. |

## Acceptance Criteria

1. Boom Town appears once in the expected D-tier sections on EN/RU Prelude and all-card pages.
2. The modal and builder metadata identify X80 and score 54/D accurately.
3. All site asset and network validations pass.
4. The task-owned PR is merged; live static release is unchanged.

## Non-goals

- No redesign of the site generator or layout.
- No live VPS publish.
