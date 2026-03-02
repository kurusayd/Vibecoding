# Hexochess Project Memory

Обновлено: 2026-03-02

## 1) Цель и текущий формат проекта
- Hexochess — авто-баттлер в духе Dota Autochess на гекс-поле.
- Игрок управляет только подготовкой: покупка, расстановка, менеджмент скамейки, прокачка короля.
- Бой полностью автоматический и сервер-авторитетный.
- Текущий режим матча: solo lobby на 8 участников (1 человек + 7 ботов).

## 2) Технологический стек и запуск
- Клиент: `Phaser 3` + `Vite`.
- Сервер: `Node.js` + `Express` + `ws`.
- Общая логика: `shared/*` (контракты, экономика, боевое ядро, каталог юнитов).

Команды:
- `npm run dev:server` — сервер (`server/index.js`).
- `npm run dev:client` — клиент (`vite` на `5173`).
- `npm test` — `node --test`.

## 3) Архитектурные решения (ключевые)
- Source of truth по состоянию матча — сервер (`server/index.js`).
- Клиент отправляет только intents; прямых мутаций логики боя на клиенте нет.
- Протокол WebSocket минимальный:
  - server -> client: `init`, `state`, `error`
  - client -> server: `intent` + `action`
- Shared-контракты и правила вынесены в `shared/*`, чтобы клиент и сервер не расходились.

## 4) Игровые инварианты и правила
- Размер поля: `12x8`, скамейка: `8` слотов.
- В `prep` игрок может ставить на свою половину поля (первые 6 колонок).
- Мерж юнитов авторитетный на сервере: 3 одинаковых (`type+rank`) -> ап ранга, максимум `rank=3`.
- В `prep` мерж учитывает board + bench; вне `prep` — только bench.
- Фазы: `prep` -> `battle` -> (показ `result` внутри battle-view) -> `prep`.
- Ограничения по экономике:
  - cap монет: `100`
  - refresh shop: `2`
  - buy XP: `4` золота за `+4 XP`
  - shop работает в `prep` и `battle`
- Базовый доход по раундам: 1/2/3/4/5..., процент: `+1` за каждые 10 золота (до `+5`), стрики как в `shared/economy.js`.
- Бой ограничен `45` сек; prep-таймер `40` сек (кроме режима “все соперники боты”, где prep-таймер обнуляется).

## 5) Боевой пайплайн (текущее решение)
- Перед стартом боя сервер сохраняет `prepSnapshot` расстановки игрока.
- На старте боя сервер спавнит армию текущего бота.
- Сервер считает весь бой заранее: `simulateBattleReplayFromState(...)`.
- Клиент в основном проигрывает готовый server replay (`USE_SERVER_BATTLE_REPLAY = true`).
- После боя:
  - урон по королям применяет сервер;
  - начисляются золото и XP;
  - через ~3 сек переход в новый prep;
  - board восстанавливается из `prepSnapshot`, а текущая bench игрока сохраняется.

## 6) Матчмейкинг и боты
- Solo matchmaking: round-robin pairings по живым участникам.
- При нечётном числе живых используется copy fallback (бой с копией соперника).
- Для игрока хранится текущий opponent + флаг “copy”.
- Боты и их пресеты определены в `server/botProfiles.js`.
- Debug snapshot матчмейкинга кладётся в `state.matchmaking` для UI/диагностики.

## 7) Клиентская структура
- Сцены:
  - `StartScene` — меню.
  - `BattleScene` — основная сцена.
- `BattleScene` разбита по модулям (`src/scenes/battleScene/*`):
  - `stateSync`, `dragController`, `shopUi`, `debugUi`, `testScene`, `kingHudUi`, `kingDamageFx`, `lifecycle`.
- Визуальная система юнитов: `src/game/units.js` + `unitAtlasConfig.js` + `unitVisualConfig.js`.

## 8) Debug/Test режимы (важно)
- Есть `testScene` для локальной симуляции и проверки баланса/анимаций без live-сервера.
- На сервере есть debug intents (`resetGame`, `debugAddGold100`, `debugAddLevel`, `debugSetShopUnit`).
- Эти intents помечены в коде как DEV ONLY и должны быть ограничены/отключены для production/shared lobby.

## 9) Текущие ограничения и техдолг
- В `server/index.js` сконцентрировано много доменной логики (matchmaking, экономика, бой, intents, lifecycle) — крупный монолитный файл.
- Система `matchStore` сейчас фактически использует общий global state (`default` матч).
- По `abilityType/abilityKey` есть данные в каталоге, но отдельного развитого движка способностей пока нет.
- Тесты пока базовые (game rules / economy / XP), без полноценного покрытия матчинга/replay/интентов.

## 10) Правила поддержки этого файла
- При каждом заметном решении добавлять:
  - что решили,
  - почему,
  - где это в коде,
  - что стало инвариантом.
- Если решение временное — помечать `TEMP`.

## 11) Session Memory Addendum (Current Implemented State)
- Combat timeline model:
- server simulates combat for fixed `45s`;
- time-sliced replay snapshots are produced every `0.1s`;
- client replays server-authoritative snapshots instead of inventing combat locally.
- Unit pacing model currently relies on per-unit combat rates:
- initiative/order + attack cadence + movement cadence were iterated;
- practical invariant: attack and movement are constrained by server cooldown/state gates;
- after attack is executed, unit waits for attack cooldown window before continuing movement (no instant glide-through).
- Movement/attack consistency:
- destination hex can be reserved by a moving unit before visual arrival;
- replay-side fixes reduced visible jitter/back-step artifacts and dead-unit post-mortem movement artifacts.
- Layering invariants:
- battlefield render depth includes both vertical (lower row on top) and horizontal tie-break (right hex on top);
- HP bars follow same ordering logic as unit art.
- Bench vs battlefield responsibility split:
- battlefield is replay-driven during battle/result presentation;
- bench remains interactive/live and should not be rolled back by battle replay snapshots.
- Shadow system:
- two different shadow concepts exist and are intentionally separate:
  - occupancy tint on hexes (logic/debug oriented);
  - ellipse ground shadow under each unit (pure visual).
- occupancy tint visibility is debug-controllable for battle playback;
- bench occupancy tint remains visible for occupied bench slots;
- unit ellipse shadow follows unit visual, is configurable per unit, and is hidden while dragging.
- Unit/content pipeline conventions:
- new unit integration requires aligned updates in:
  - assets atlas path,
  - shared unit catalog stats/cost/type/race,
  - visual config (scale, offsets, shadow tuning),
  - debug/test selectors when relevant.
- Added/updated content during this cycle includes multiple atlas refreshes and new units/races
  (Angel/Devil/Undertaker/Lizard Monk/Simple Skeleton and others listed in changelog).
- UI/HUD invariants added:
- XP purchase is available as clickable book icon button near king XP bar;
- insufficient gold does not disable click feedback:
  - button still presses,
  - cost number turns red,
  - short hint appears (“Не хватает” + coin icon).
- shop card presentational decisions (current):
- stable path is icon-atlas portraits (full-size live atlas art in card was tested and rolled back);
- race labeling and figure/cost icon blocks were tuned and are expected configurable via constants.
- Debug tooling additions:
- battle scene debug supports forcing shop slots by selected race/unit (`Units` selector flow),
  separate from test-scene cheat flow.
- Recent VFX addition:
- ranged attacks now emit a visible beam in replay:
  - from attacker visual center to target visual center;
  - short impact flash at target;
  - applied only to ranged attackers.

## 12) Skeleton Archer Bounce Invariant
- Unit `SkeletonArcher` has passive ability:
  - `abilityType = passive`
  - `abilityKey = skeleton_archer_bounce`
- On primary projectile hit:
  - server searches one secondary enemy target within `2` hexes from the primary target position;
  - if found, schedules one bounce hit.
- Bounce hit rules:
  - damage = `50%` of primary hit damage, minimum `1`;
  - travel timing is projectile-based (not instant) and uses ranged projectile speed model.
- Client replay visualization:
  - primary shot: normal ranged projectile path logic;
  - bounce shot: spawned from primary target center to secondary target center, straight line;
  - bounce shot has fast clockwise spin for readability.

## 13) Battle Timeline And Action Gates (2026-03-03)
- Сервер остаётся единственным источником истины по боевой последовательности.
- Инвариант последовательности действий:
  - `reserve target hex -> move -> arrive -> can attack/use ability`.
- Пока юнит в состоянии перемещения, атака/способности недоступны даже если целевой гекс уже зарезервирован логически.
- После совершения атаки юнит отрабатывает attack cooldown и не продолжает движение мгновенно в тот же момент.

Это введено для устранения визуального рассинхрона реплея (удары «в пустоту», скольжение после удара).

## 14) Ranged Damage Delivery Model (2026-03-03)
- Для дальних атак урон серверно доставляется с задержкой, зависящей от дистанции и скорости прожектайла.
- Реплей обязан визуально повторять ту же временную модель долёта.
- Для `Skeleton Archer` зафиксировано:
  - основной выстрел по дуге;
  - единая базовая скорость прожектайла (без временных multipliers по дистанции);
  - пассивный bounce после primary-hit сохраняется (1 дополнительная цель в радиусе 2, урон 50%, min 1).

## 15) Drag Readability Invariant (2026-03-03)
- Подсветка ренж-зон при перетаскивании строится через заливку гексов (heatmap), а не через подсветку граней:
  - full-damage зона: мягкий зелёный;
  - reduced-damage зона: полупрозрачный красный.
- Для reduced-дальности поверх гекса рисуется `broken_arrow` из `assets/icons` (центр, полупрозрачность).
- Подсветка диапазона показывается и на вражеской стороне поля.
- Затемнение source-гекса при подъёме юнита отключено, чтобы не конфликтовать с новой heatmap-логикой.

## 16) Unit Modal UX Invariant (2026-03-03)
- Открытие карточки юнита работает по обычному tap/click, без необходимости RMB.
- Для предотвращения конфликтов с drag действует порог начала перетаскивания (`drag threshold`).
- Модалка:
  - отображает портрет, расу, статы, блок способности и flavour-описание;
  - использует адаптивный вертикальный flow (без налезаний блоков).
- В боевой фазе:
  - убрана hover-подсветка гекса у юнита;
  - открытая модалка остаётся на месте и не следует за двигающимся юнитом.
