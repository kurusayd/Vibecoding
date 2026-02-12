export function updateHpBar(state, unit) {
  const barW = Math.max(18, Math.floor(state.hexSize * 1.0));
  const barH = Math.max(4, Math.floor(state.hexSize * 0.16));
  const yOffset = state.hexSize * 0.70;

  const p = state.hexToPixel(unit.q, unit.r);
  const x = p.x - barW / 2;
  const y = p.y - yOffset;

  const pctNow = Math.max(0, Math.min(1, unit.hp / unit.maxHp));
  const pctShown = Math.max(0, Math.min(1, (unit.hpShown ?? unit.hp) / unit.maxHp));

  const wNow = Math.floor(barW * pctNow);
  const wShown = Math.floor(barW * pctShown);

  unit.hpBar.clear();

  // рамка
  unit.hpBar.fillStyle(0x000000, 0.6);
  unit.hpBar.fillRoundedRect(x - 1, y - 1, barW + 2, barH + 2, 2);

  // серый max
  unit.hpBar.fillStyle(0x555555, 1);
  unit.hpBar.fillRoundedRect(x, y, barW, barH, 2);

  // жёлтый lag
  if (wShown > wNow) {
    unit.hpBar.fillStyle(0xffd34d, 1);
    unit.hpBar.fillRoundedRect(x, y, wShown, barH, 2);
  }

  // текущий hp
  unit.hpBar.fillStyle(unit.hpColor, 1);
  unit.hpBar.fillRoundedRect(x, y, wNow, barH, 2);
}

export function startHpLag(scene, unit) {
  // hpShown догоняет hp с задержкой
  if (unit.hpLag) {
    unit.hpLag.stop();
    unit.hpLag = null;
  }

  if (unit.hpShown < unit.hp) unit.hpShown = unit.hp;

  unit.hpLag = scene.tweens.add({
    targets: unit,
    hpShown: unit.hp,
    duration: 250,
    delay: 140,
    ease: 'Linear',
    onUpdate: () => updateHpBar(scene, unit),
    onComplete: () => { unit.hpLag = null; },
  });
}
