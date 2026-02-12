// Рисуем HP бар над юнитом.
// unit.hpInstant — “мгновенный” (основной) hp
// unit.hpLag     — “догоняющий” (жёлтый хвост)
// unit.hp        — логическое (может совпадать с hpInstant)

export function updateHpBar(scene, unit) {
  if (!unit || !unit.hpBar) return;

  const g = unit.hpBar;
  g.clear();

  const maxHp = Math.max(1, unit.maxHp ?? 1);
  const hpInstant = clamp(unit.hpInstant ?? unit.hp ?? maxHp, 0, maxHp);
  const hpLag = clamp(unit.hpLag ?? hpInstant, 0, maxHp);

  // размеры бара
  const w = Math.floor(scene.hexSize * 1.1);     // ширина
  const h = Math.max(6, Math.floor(scene.hexSize * 0.18)); // высота
  const yOffset = Math.floor(scene.hexSize * 0.75); // насколько выше центра юнита

  // позиция относительно юнита (абсолютные координаты)
  const cx = unit.circle?.x ?? 0;
  const cy = unit.circle?.y ?? 0;
  const x = Math.round(cx - w / 2);
  const y = Math.round(cy - yOffset);

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
