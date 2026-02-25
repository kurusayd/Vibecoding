// Рисуем HP бар над юнитом.
// unit.hpInstant — “мгновенный” (основной) hp
// unit.hpLag     — “догоняющий” (жёлтый хвост)
// unit.hp        — логическое (может совпадать с hpInstant)

const UNIT_UI_LIFT_BY_TYPE = {
  Skeleton: 10, // больше -> выше HP-бар и rank icon
};
const HP_BAR_EXTRA_LIFT_PX = 3; // общий подъём HP-бара для всех юнитов (rank icon не трогаем)

export function updateHpBar(scene, unit) {
  if (!unit || !unit.hpBar) return;

  const g = unit.hpBar;
  g.clear();

  const maxHp = Math.max(1, unit.maxHp ?? 1);
  const hpInstant = clamp(unit.hpInstant ?? unit.hp ?? maxHp, 0, maxHp);
  const hpLag = clamp(unit.hpLag ?? hpInstant, 0, maxHp);

  // размеры бара
  const w = Math.floor(scene.hexSize * 1.1);                 // ширина
  const h = Math.max(6, Math.floor(scene.hexSize * 0.15));   // высота

  // позиция относительно юнита (внизу гекса)
  const cx = unit.sprite?.x ?? 0;
  const cy = unit.sprite?.y ?? 0;
  const coreUnit = (scene.battleState?.units ?? []).find((u) => u.id === unit.id);
  const unitType = coreUnit?.type ?? unit.type ?? null;
  const uiLift = Number(UNIT_UI_LIFT_BY_TYPE[unitType] ?? 0);

  // нижний угол "pointy-top" гекса
  const tipY = cy + scene.hexSize * 0.98;

  // HP бар — на том же уровне, но чуть выше (подними/опусти тут)
  const hpGap = Math.round(scene.hexSize * 2.75); // ≈ +5px при hexSize=44
  const y = Math.round(tipY - h - hpGap - uiLift - HP_BAR_EXTRA_LIFT_PX);

  const x = Math.round(cx - w / 2);

  // ⭐ rank icon (внизу гекса, поверх арта)
  if (unit.rankIcon) {
    const rank = Math.max(1, Math.min(3, unit.rank ?? 1));
    const key = `rank${rank}`;

    // если текстура есть — обновим (на случай изменения ранга)
    if (scene.textures?.exists?.(key)) {
      unit.rankIcon.setTexture(key);
    }

    // rankIcon привязываем к нижней границе HP-бара (originY = 1).
    unit.rankIcon.setPosition(cx, y + h - 5);

    // видимость:
    // - на скамейке ранг показываем всегда;
    // - на поле — только в prep.
    const isBench = coreUnit?.zone === 'bench';
    unit.rankIcon.setVisible(Boolean(isBench || scene.battleState?.phase === 'prep'));
  }

  // цвета
  const bg = 0x111111;
  const border = 0x000000;
  const lagColor = 0xffcc33; // жёлтый хвост
  const mainColor = (unit.team === 'enemy') ? 0xff4444 : 0x44ff66; // красн/зел

  const lagW = Math.round((hpLag / maxHp) * w);
  const instW = Math.round((hpInstant / maxHp) * w);

  // фон
  g.fillStyle(bg, 0.85);
  g.fillRect(x, y, w, h);

  // жёлтый “хвост” (сначала он)
  if (lagW > 0) {
    g.fillStyle(lagColor, 0.85);
    g.fillRect(x, y, lagW, h);
  }

  // основной бар (поверх хвоста)
  if (instW > 0) {
    g.fillStyle(mainColor, 0.95);
    g.fillRect(x, y, instW, h);
  }

  // обводка
  g.lineStyle(1, border, 0.9);
  g.strokeRect(x, y, w, h);
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
