## Context

Public-site repo хранит статические source/publish mirrors, а production nginx раздаёт атомарно переключаемый каталог `current`. Канонический генератор и данные остаются в private advisor repo, поэтому public change принимает только уже проверенные артефакты.

## Goals / Non-Goals

**Goals:**

- опубликовать Quantum Research на существующем URL;
- сохранить совпадение source/publish mirrors;
- доказать, что diff ограничен одной новой картой и пересобранными атласами;
- оставить предыдущий release для rollback.

**Non-Goals:**

- перенос генератора или private данных в public repo;
- изменение nginx, DNS или игрового сервера;
- публикация карты как официально финальной.

## Decisions

- Брать артефакты только из прошедшего проверки advisor-worktree.
- Обновить статические счётчики, чтобы главная страница не оставалась на устаревшем числе.
- Создать новый immutable release directory и атомарно переключить `current`; рестарт nginx не нужен.

## Risks / Trade-offs

- [Generated diff большой из-за sprite placement] → сравнить набор `data-name`, score/facts и число карт до/после, а не только бинарный размер.
- [Production release не совпадёт с Git] → собирать архив из зафиксированного site commit и проверить live HTTP/содержимое после switch.
- [Финальная карта изменится] → будущий узкий change обновит facts/оценку/изображение.

## Migration Plan

1. Скопировать проверенный site diff и ассеты из advisor change.
2. Прогнать self-contained site checks и strict OpenSpec validation.
3. Commit/push task branch, интегрировать в `main` после проверки.
4. Снять VPS baseline, загрузить новый release, проверить его до переключения.
5. Атомарно переключить `current` и выполнить HTTP smoke; при ошибке вернуть предыдущий symlink.

## Open Questions

- Нет блокирующих вопросов; официальный metadata карты будет отдельным последующим change.
