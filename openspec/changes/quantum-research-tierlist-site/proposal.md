## Why

Публичный тирлист должен показать предварительную оценку Quantum Research до её появления на игровом сервере. Выпуск должен сохранить отдельный public-site source of truth и не включить несвязанные изменения advisor.

## What Changes

- Принять проверенные generated HTML и sprite-атласы с Quantum Research из канонического advisor change.
- Обновить счётчики сайта с учётом одной новой project-карты.
- Выпустить новый атомарный релиз на существующий production URL `/tierlist/` с возможностью возврата к предыдущему release.

## Capabilities

### New Capabilities

- `quantum-research-public-card`: публичное отображение Quantum Research на английских и русских страницах тирлиста.

### Modified Capabilities

- Нет.

## Impact

Затрагиваются site source/publish mirrors, project/all HTML, sprite-атласы, OpenSpec-каркас репозитория и production release каталога `/home/openclaw/tm-runtime/tierlist/releases/`. Nginx и игровой сервер не изменяются.
