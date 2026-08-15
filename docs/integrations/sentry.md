# Sentry для tm-tierlist-site

Интеграция браузерная и по умолчанию выключена. Статический publish не содержит
DSN: пока перед загрузкой `sentry-client.js` не определены globals, CDN SDK не
запрашивается и listeners не устанавливаются.

Runtime-конфигурация передаётся отдельным deployment-шагом до основного скрипта:

```html
<script>
  window.__TM_SENTRY_DSN__ = "https://public@example.com/1";
  window.__TM_SENTRY_ENVIRONMENT__ = "production";
  window.__TM_SENTRY_RELEASE__ = "<git SHA>";
</script>
```

DSN — адрес маршрутизации проекта, не auth-токен. Не коммитьте live-конфигурацию в
этот репозиторий без отдельного согласования. SDK pinned на `10.70.0` и lazy-loads
только после строгой lowercase HTTPS-проверки DSN.

События ограничены необработанными browser `error` и `unhandledrejection`. Перед
отправкой строится новый allowlist event: не проходят message, request, user,
headers, cookies, query/body, contexts, extra, breadcrumbs, function и исходные
filenames. Tracing, profiling, logs и default PII отключены.

Проверки без сети:

```text
npm run test:sentry-client
npm run site:check
npm run test:site
```

Создание проекта, ввод live DSN, push/PR/merge и deployment остаются отдельными
воротами.
