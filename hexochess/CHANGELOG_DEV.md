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

## 2026-03-03 (Late Session Addendum)

### Combat Accuracy + Miss Pipeline
- Added `accuracy` as a default combat stat for all units (`0.8` baseline).
- Server attack resolution now uses binary `hit / miss` check before damage application.
- On miss:
  - no damage is applied;
  - no on-hit side effects are executed (including Skeleton Archer bounce);
  - attack still consumes normal attack cooldown.
- Replay now emits and renders explicit `miss` events.

### Ghost Passive: Evasion
- `Ghost` now has passive `ghost_evasion` behavior:
  - incoming successful hit then has extra 50% evade check;
  - on evade, hit is converted to `miss` event.
- Client replay VFX:
  - `miss` text shown above unit;
  - ghost-specific fade/alpha flicker is played when evasion triggers.

### Undertaker Active Ability
- `Undertaker` switched to active non-attack behavior in battle sim:
  - does not perform standard attacks;
  - movement AI picks step maximizing distance from nearest enemy.
- Added active summon ability flow:
  - cast event (`ability_cast`) with cast time;
  - summon resolve (`spawn`) after cast completes;
  - cooldown starts after cast resolve, not at cast start.
- Ability is not ready at battle start (starts on cooldown by design).
- During cast, unit cannot move (same action gate style as attack lock).
- Summon placement upgraded:
  - nearest free hex search expands by distance if adjacent cells are blocked.
- Summoned `SimpleSkeleton`:
  - inherits caster rank;
  - is excluded from shop offers (summon-only unit).

### Ability Cooldown UI
- Added thin golden ability cooldown bar under HP bar for active-ability units.
- Added cast-phase bar behavior:
  - during cast, bar shrinks to zero over cast time;
  - cooldown fill then starts after cast resolution.
- Added ready flash effect directly in HP/CD graphics layer (overlay-safe).
- Fixed false ready flash triggers on battle start edge cases.

### Unit Modal
- Added unit rank visualization in modal portrait area (icon overlay).
- Added ability cooldown line in modal for active abilities.

### Replay + Spawn Robustness
- Improved replay visual spawn fallback for occasional temporary occupancy desync.
- Added warning diagnostics for failed visual spawn cases.

## 2026-03-06

### Server Structure / Tests / Docs
- Started server decomposition without changing battle behavior:
  - extracted battle phase constants into `server/battlePhases.js`;
  - extracted server-authoritative combat replay logic into `server/combatSimulator.js`;
  - switched `server/index.js` to imported phase config and combat simulator entry points.
- Added combat-focused automated tests:
  - `entry` duration invariant (`5s`);
  - ranged projectile travel timing;
  - `SkeletonArcher` bounce;
  - `Ghost` evasion -> `miss`;
  - `Undertaker` cast/spawn flow;
  - `sanitizeUnitForBattleStart`.
- Synced docs/spec with current behavior:
  - `entry` duration is explicitly documented as `5s`;
  - project memory reflects extracted server modules and broader combat test coverage.

### Entry Phase
- Added explicit `entry` phase between `prep` and `battle`.
- Entry reveal sequence now has staged enemy king, enemy king UI, enemy army, and enemy army UI.
- Entry waits for prepared server replay; if replay is missing by timeout, round resolves as `draw`.
- Board occupancy gray fill is hidden during `entry` for cleaner presentation.

### HUD / Shop / Bench
- Added king-side board cap HUD block `X / Y`.
- `X` counts only player units on board, never bench units.
- During battle, `X` is frozen from battle start so deaths/summons do not change the displayed starting army size.
- Shop purchase placement now respects board cap:
  - if board cap is reached, unit goes to bench;
  - if bench is full too, purchase is blocked and client shows `Нет места` over the clicked shop card.
- Shop auto-placement on board now starts from player prep midpoint preference:
  - row 4 from top / column 3 from left;
  - then nearest free cell around that point.

### Overflow And Bench Depth
- At battle start, random excess board units above king-level cap are auto-moved to bench.
- If bench is full, remaining excess units are auto-sold with trash flight + coin burst FX.
- Auto-bench transfer in entry now uses visible arc motion instead of teleport.
- Bench render depth is fixed as an invariant:
  - slots 1-4 below king;
  - slots 5-8 above king;
  - inside each half, lower slots on screen render above higher ones.

### Replay / Animation
- Started attack and cast animations are no longer cut immediately when round result arrives; they finish naturally.
- Added replay-safe handling for auto-bench / auto-sell FX synchronization.

### Worm Passive
- Added passive ability `worm_swallow`.
- Current implemented behavior:
  - 50% chance to swallow attack target;
  - swallowed unit leaves battlefield into `zone = swallowed`;
  - digestion lasts 6 seconds;
  - while digesting, Worm switches to `worm_fat_atlas`;
  - while digesting, Worm move speed and attack speed are reduced by 30%;
  - cooldown bar is hidden at battle start and shown only while digesting;
  - if digestion completes, swallowed unit dies permanently with no corpse;
  - if Worm dies first, swallowed unit is released with 50% of stored HP.
- Added replay events: `worm_swallow`, `worm_release`, `worm_digest`.
- Added server safety pass so swallowed units are still released if Worm death and round end happen in the same tick.

### Bot Kings
- Replaced removed bot king textures with new assets from `assets/bots`:
  - `black_knight`, `black_pawn`, `white_knight`, `white_pawn`
- Bot profiles were remapped to new texture keys.
- Bot king art on right side is no longer mirrored; source art is already authored for enemy-side display.

## 2026-03-07

### Crossbowman
- Added and finalized special passive behavior `crossbowman_line_shot`.
- Crossbowman now:
  - fires only on a straight forward/backward line;
  - no longer fires diagonally;
  - prefers enemies already standing on a valid firing line over nearer off-line targets;
  - otherwise moves toward the nearest reachable firing hex and re-checks after each move;
  - prefers more rear-biased firing positions / movement ties to stay closer to its own board edge.
- Projectile behavior is now fully unique to Crossbowman:
  - uses `assets/projectiles/bolt.png`;
  - projectile is piercing and visually flies beyond board bounds;
  - projectile targets a board cell / line, not the target unit center;
  - server damage resolution is simplified to a fixed `200ms` post-shot occupancy check on all pierced cells.
- Tuned unit stats:
  - `moveSpeed: 1.0 -> 1.2`;
  - current `projectileSpeed: 20.0`.
- Updated unit modal text and drag-range presentation:
  - drag preview now paints only real Crossbowman firing cells;
  - non-line cells are no longer highlighted.
- Added lightweight bolt trail visuals and fixed several projectile issues:
  - straight-shot path is fixed at fire time;
  - enemy bolt orientation no longer appears backward;
  - first enemy Crossbowman shot now uses the same pierce behavior as later shots;
  - bolt trail is a pale rectangle aligned to bolt tail;
  - miss-text spam is throttled per unit to once per `200ms`.

### Ranged Projectile Regression Fixes
- Restored normal ranged-unit targeting for non-Crossbowman units.
- `SkeletonArcher`, `Priest`, `Lich` and other standard ranged units now again fire at the visual center of the target unit, not at a hex center.
- Fixed client bug where missing target-cell coordinates could be interpreted as a real `(0,0)`-style projectile cell and make projectiles animate on the attacker's own hex.

### Empty-Board Round Start
- Changed round-start flow when player has no units on board.
- Defeat is no longer applied before `entry`.
- The game now still shows:
  - enemy king reveal;
  - enemy army reveal;
  - short transition into battle;
  - then defeat resolution.

### Assets / Visual Config
- Fixed `Monk` atlas config to match actual asset names:
  - `atlasKey: monk_atlas`
  - `atlasPath: /assets/units/lizard/monk/monk_atlas`
- Verified `Knight` atlas update; config already matched current files and needed no code change.

### Balance / Catalog
- Added flat spreadsheet-friendly export file `balance.csv` in project root for Excel / Google Sheets workflow.
- Changed `Zombie` `powerType` from `Rook` to `Knight`.
