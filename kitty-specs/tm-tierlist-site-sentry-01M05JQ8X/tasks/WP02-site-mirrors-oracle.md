---
work_package_id: "WP02"
title: "Publish mirrors и fake-browser oracle"
dependencies: ["WP01"]
planning_base_branch: "codex/tm-tierlist-site-sentry"
merge_target_branch: "main"
phase: "Фаза 2 — Интеграция"
status: "done"
subtasks: ["T003", "T004"]
---

# WP02

Подключить script к source/publish HTML и проверить no-op, фактический capture и
отсутствие запрещённых sentinels через независимый fake browser/SDK.
