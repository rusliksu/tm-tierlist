## ADDED Requirements

### Requirement: Quantum Research видна в публичном тирлисте
Публичный сайт SHALL показывать Quantum Research с оценкой 75/B, стоимостью 11 M€, Wild-меткой, требованием 4 Science и предоставленным изображением на английских и русских страницах all и projects.

#### Scenario: Пользователь открывает карточку в русском тирлисте
- **WHEN** пользователь открывает `/tierlist/output/tierlist_projects_ru.html` и ищет Quantum Research
- **THEN** карта присутствует ровно один раз, открывает подробную карточку и отображает рабочее изображение

#### Scenario: Пользователь открывает английский тирлист
- **WHEN** пользователь открывает `/tierlist/output/tierlist_all.html` и ищет Quantum Research
- **THEN** карта присутствует ровно один раз с теми же score, tier и facts

### Requirement: Ограниченный и обратимый выпуск
Релиз SHALL добавлять одну новую оценённую карту и SHALL сохранять предыдущий VPS release как rollback target.

#### Scenario: Production smoke после переключения
- **WHEN** `current` атомарно переключён на новый release
- **THEN** главная страница, EN/RU all/projects и sprite assets возвращают HTTP 200, а Quantum Research находится на EN/RU страницах
