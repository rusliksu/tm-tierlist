# Пакеты реализации: Sentry для tm-tierlist-site

**Миссия:** `tm-tierlist-site-sentry-01M05JQ8X`
**Ветка:** `codex/tm-tierlist-site-sentry`
**Bead:** `tm-ai-3ho`

## Порядок

1. WP01 — браузерный bootstrap и privacy boundary.
2. WP02 — source/publish mirror и fake-browser oracle.
3. WP03 — документация и site gates.

## Подзадачи

| ID | Описание | WP |
|---|---|---|
| T001 | Добавить lazy SDK bootstrap и strict DSN gate | WP01 — готово |
| T002 | Добавить allowlist sanitizer и error listeners | WP01 — готово |
| T003 | Подключить скрипт ко всем publish HTML и manifest | WP02 — готово |
| T004 | Добавить fake-browser privacy/no-op tests | WP02 — готово |
| T005 | Обновить документацию и прогнать site gates | WP03 — готово |

## Acceptance

- no/malformed DSN не загружает SDK;
- валидный DSN захватывает только необработанные ошибки;
- фактический fake event не содержит приватных sentinels;
- source/publish sync и существующие site tests зелёные;
- live DSN и deploy не выполняются этим change.
