# План подключения Sentry к статическому сайту

## Контекст

**Тип**: статический HTML/JavaScript, GitHub Pages и VPS mirror
**Поставка**: source `apps/tm-site/src`, публикация через `tools/site/sync-site.py`
**SDK**: pinned `@sentry/browser` CDN bundle 10.70.0, загружается только после DSN gate
**Проверки**: Node fake browser/SDK oracle, site sync check, Playwright-backed existing suite
**Ограничения**: нет build-time env, поэтому runtime config — explicit window globals;
  без них сеть и listeners отсутствуют

## Архитектура

1. `apps/tm-site/src/sentry-client.js` валидирует runtime config, lazy-loads pinned
   CDN SDK, и регистрирует два browser error listeners.
2. Sanitizer создаёт новый event из allowlist до отправки; unknown event fields
   отбрасываются, function/filename фиксируются в `?`, а message/value не копируются.
3. Все HTML-источники используют относительный путь к одному скрипту; manifest
   добавляет скрипт в source/publish mirror.
4. `tools/site/test-sentry-client.mjs` исполняет bootstrap в fake window/document и
   проверяет фактический вызов fake SDK без сети.

## Проверки

- `node tools/site/test-sentry-client.mjs`
- `npm run site:check`
- `npm run test:site`
- `git diff --check`

Live config injection и deployment остаются отдельными воротами.
