# Подключение Sentry к статическому tm-tierlist-site

## Цель

Добавить опциональный браузерный error boundary к публичному статическому сайту
Terraforming Mars tier list. По умолчанию сайт не загружает сторонний SDK и не
делает сетевых вызовов Sentry; при явной runtime-конфигурации захватываются только
необработанные браузерные ошибки и rejected promises.

## Границы

В scope входят source-owned HTML, небольшой браузерный bootstrap, sync-manifest,
fake-browser тест и операторская документация. Дизайн, карточные данные, аналитику,
пиксели, performance tracing и live DSN не меняем.

## Требования

### FR-001 — Runtime DSN gate

Без `window.__TM_SENTRY_DSN__` или с malformed DSN bootstrap завершается no-op:
CDN SDK не загружается и listeners не устанавливаются. DSN принимается только в
строгой lowercase HTTPS-форме без credentials/query/fragment.

### FR-002 — Browser errors

При валидном DSN загружается pinned Sentry Browser SDK и устанавливаются listeners
для `error` с настоящим `Error` и `unhandledrejection`. Обычная навигация, health-like
проверки статических страниц и ожидаемые UI-события не создают события.

### FR-003 — Privacy fail-closed

`beforeSend` строит новый allowlisted envelope event: фиксированные service/runtime/
error_kind, безопасные environment/release и числовые frame coordinates. Message,
request, user, headers, cookies, query, body, locals, contexts, breadcrumbs, extra,
function и произвольные stack values не передаются.

### FR-004 — Source mirror integrity

Все publish HTML, включая output tier lists и wiki entrypoint, получают корректный
relative script path; `site:check` и существующие site tests остаются зелёными.

## Не в scope

- live DSN/config injection, CDN availability guarantee, push/PR/merge/deploy;
- frontend performance/session replay/analytics;
- изменение публичного текста и карточных данных.

## Критерии приёмки

- fake-browser tests подтверждают no-op без DSN и privacy-safe capture при валидном DSN;
- malformed DSN и вредные event sentinels не доходят до fake SDK;
- `npm run site:check` и `npm run test:site` проходят;
- в diff нет live DSN, токена или персональных данных;
- task branch изолирована и clean после commit.
