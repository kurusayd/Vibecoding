# Hexochess Dev Changelog

## 2026-03-02

### Что зафиксировано
- Создана устойчивая документация “памяти проекта” в `PROJECT_MEMORY.md`.
- Зафиксированы текущие архитектурные решения:
  - сервер-авторитетное состояние матча;
  - клиент через intents + state sync;
  - server battle replay как основной путь отображения боя на клиенте.
- Зафиксированы важные игровые инварианты:
  - поле `12x8`, bench `8`;
  - prep-зона игрока = первые 6 колонок;
  - merge `3x` одинаковых, максимум `rank3`;
  - экономика/XP/таймеры раунда.
- Зафиксированы риски и техдолг:
  - DEV-only intents на сервере;
  - монолитность `server/index.js`;
  - ограниченное тестовое покрытие.

### Зачем это сделано
- Чтобы сохранять контекст между сессиями и не терять ключевые решения.
- Чтобы быстро онбордиться в проект без повторного чтения всего кода.
- Чтобы фиксировать инварианты, которые нельзя “случайно” ломать в новых задачах.

### Проверки
- Проверка структуры проекта и ключевых модулей (`server`, `shared`, `src`).
- Проверка актуальных npm-скриптов и тестового контура (`npm test`).
- Проверка основных intent-экшенов и фазовых ограничений на сервере.

### Следующий шаг
- Поддерживать этот файл после каждого meaningful изменения: короткая запись “что изменили / риск / что проверить”.

### Session Addendum (Chat Work Summary)
- Main menu polish:
- duplicated fullscreen button behavior from battle scene into start menu;
- switched menu button background to `assets/buttons/bt_menu`;
- added configurable vertical spacing, global block Y offset variable, button scale variable;
- tuned hover/click behavior (smaller hover scale, action on pointer up, press feedback);
- text style iterations (uppercase, non-bold, color/outline/shadow adjustments), text Y offset variable.
- Fonts:
- connected custom fonts from `assets/fonts`;
- verified fallback behavior and discussed Roboto limitations for multilingual glyph coverage.
- Unit assets integrated/updated:
- swordman, crossbowman, ghost, zombie, skeleton archer (`sarcher_atlas`), skeleton, lich, bones golem, vampire, angel, devil, undertaker, simple skeleton;
- replaced human knight with crusader temporarily;
- added race `Lizard` with `monk` unit; added race `God` with `Angel` unit.
- Unit catalog/gameplay data:
- added/adjusted unit type and cost mappings (pawn/knight/bishop/queen changes requested during balance passes);
- added ability metadata defaults for all units (`no ability` baseline), with undertaker marked for active ability path.
- Battle simulation/replay evolution:
- moved from coarse turn-feel to time-sliced server snapshots (`0.1s`) for 45s combat horizon;
- introduced separate combat stats direction: initiative/attack speed/move speed behavior tuning;
- enforced post-attack cooldown hold behavior (unit does not instantly continue moving after attack event);
- improved replay movement stability (reduced jitter/backtracking/dead-unit sliding cases);
- aligned render layering by board row and column so lower and right-side units draw on top consistently;
- synced HP bar depth sorting with same X/Y combat layering rules.
- Occupancy and shadows:
- added debug-toggleable combat hex occupancy shadow visibility;
- preserved occupied-hex tint behavior on bench regardless of combat replay visibility setting;
- added unit ellipse ground shadow that follows unit visual, with per-unit shadow tuning fields;
- hid unit ellipse shadow while dragging.
- Replay + bench state:
- fixed prep return state where bench could incorrectly revert to pre-battle snapshot;
- ensured bench remains “live” while only battlefield uses replay playback.
- Debug/cheats:
- added battle-scene debug `Units` picker flow: race -> unit -> force current shop slots to selected unit.
- Shop/UI and king HUD:
- added XP buy button with `BookExp` icon and coin cost cluster;
- styled XP bar to match king HUD style; then tuned size/position variables and color;
- reworked insufficient-gold UX for XP buy: click remains active, red cost number, hint text with coin icon;
- tuned hint lifetime and copy (“Не хватает”);
- fixed press animation so only book icon animates and no post-click scale drift.
- Shop card rendering iterations:
- tested replacing icon portraits with full atlas idle art + clip/mask logic;
- after quality issues, reverted to stable icon-atlas based portraits;
- added chess-figure icon on shop cards with configurable scale and X/Y offsets;
- fixed subline content to show race where required.
- Text encoding fixes:
- multiple passes on broken Russian labels in shop cards and unit role naming strings.
- Latest change in this turn:
- added ranged beam VFX during replay attacks in `BattleScene`:
  - beam starts from attacker visual center and ends at target visual center;
  - only for ranged attacks (`attackRangeMax > 1`);
  - includes short impact flash at target.

### Skeleton Archer Passive (New)
- Added passive ability metadata to `SkeletonArcher`:
  - `abilityType: passive`
  - `abilityKey: skeleton_archer_bounce`
- Implemented server-authoritative bounce logic:
  - after primary projectile hit, find one extra enemy target within `2` hexes from primary target;
  - bounce damage is `50%` of primary hit damage (minimum `1`);
  - bounce projectile travel speed uses the same projectile-speed model as direct ranged shot.
- Replay/VFX:
  - after primary hit, a second projectile is spawned from primary target center to bounce target center;
  - bounce projectile flies straight and spins clockwise quickly for readability.

## 2026-03-03

### Что добавили/уточнили по механикам боя
- Зафиксирована серверная логика `move -> arrive -> action`: юнит не может атаковать/кастовать, пока не завершит текущее перемещение в целевой гекс.
- Для будущих активных способностей заложен тот же gate: применение только после фактического завершения движения.
- Уточнена визуальная/логическая синхронизация реплея:
  - юнит после атаки остаётся в attack cooldown;
  - это исключает резкие «ударил и сразу полетел дальше» скачки.

### Дальний бой и прожектайлы
- Ренж-урон серверно привязан к времени долёта прожектайла (не instant-hit).
- Для `Skeleton Archer`:
  - основной выстрел снова летит по дуге;
  - скорость прожектайла зафиксирована как единая (без дополнительных множителей для ближней/дальней зоны);
  - bounce-прожектайл остался отдельным вторичным выстрелом со спином по часовой.

### Визуальные подсказки при перетаскивании
- Полностью отказались от нестабильной логики подсветки граней гексов.
- Ввели стабильную heatmap-подсветку для ренж-юнитов при drag:
  - зона полного урона: мягкая зелёная;
  - зона штрафного урона: прозрачная красная.
- Для штрафной зоны добавлена иконка `icons/broken_arrow` (полупрозрачная, центр гекса).
- Подсветка диапазона теперь показывается и на вражеской половине поля, чтобы сразу видеть реальную боевую геометрию.

### UX клика/перетаскивания и модалки юнита
- Добавлен drag-threshold, чтобы быстрый тап не превращался в мгновенный drag.
- Реализована модалка юнита по обычному клику:
  - портрет, статы, способность с явным типом (active/passive/none), flavour-текст.
- Для модалки в бою зафиксировано:
  - модалка не «едет» за юнитом во время его движения;
  - убрана лишняя боевая hover-подсветка гекса, чтобы не мешать чтению информации.

### Документация
- Обновлены `CHANGELOG_DEV.md` и `PROJECT_MEMORY.md` с фиксацией новых инвариантов реплея, дальнего боя, drag-подсветок и UX модалки.
