// Р РёСЃСѓРµРј HP Р±Р°СЂ РЅР°Рґ СЋРЅРёС‚РѕРј.
// unit.hpInstant вЂ” вЂњРјРіРЅРѕРІРµРЅРЅС‹Р№вЂќ (РѕСЃРЅРѕРІРЅРѕР№) hp
// unit.hpLag     вЂ” вЂњРґРѕРіРѕРЅСЏСЋС‰РёР№вЂќ (Р¶С‘Р»С‚С‹Р№ С…РІРѕСЃС‚)
// unit.hp        вЂ” Р»РѕРіРёС‡РµСЃРєРѕРµ (РјРѕР¶РµС‚ СЃРѕРІРїР°РґР°С‚СЊ СЃ hpInstant)

import { getUnitHpUiLiftPx } from './unitVisualConfig.js';

const HP_BAR_EXTRA_LIFT_PX = 3; // РѕР±С‰РёР№ РїРѕРґСЉС‘Рј HP-Р±Р°СЂР° РґР»СЏ РІСЃРµС… СЋРЅРёС‚РѕРІ (rank icon РЅРµ С‚СЂРѕРіР°РµРј)
const RANK_ICON_OFFSET_Y_PX = 8; // + вниз, - вверх (только rank icon, HP-бар не двигается)

export function updateHpBar(scene, unit) {
  // Tween callbacks can still fire during scene teardown/restart.
  // In that moment Phaser scene getters (e.g. `scene.textures`) may throw because `scene.sys` is gone.
  if (!scene || !scene.sys || !unit || !unit.hpBar) return;
  if (unit.hpBar && (!unit.hpBar.scene || !unit.hpBar.scene.sys)) return;
  if (unit.sprite && (!unit.sprite.scene || !unit.sprite.scene.sys)) return;

  const g = unit.hpBar;
  g.clear();

  const maxHp = Math.max(1, unit.maxHp ?? 1);
  const hpInstant = clamp(unit.hpInstant ?? unit.hp ?? maxHp, 0, maxHp);
  const hpLag = clamp(unit.hpLag ?? hpInstant, 0, maxHp);

  // СЂР°Р·РјРµСЂС‹ Р±Р°СЂР°
  const w = Math.floor(scene.hexSize * 1.1);                 // С€РёСЂРёРЅР°
  const h = Math.max(6, Math.floor(scene.hexSize * 0.15));   // РІС‹СЃРѕС‚Р°

  // РїРѕР·РёС†РёСЏ РѕС‚РЅРѕСЃРёС‚РµР»СЊРЅРѕ СЋРЅРёС‚Р° (РІРЅРёР·Сѓ РіРµРєСЃР°)
  const cx = unit.sprite?.x ?? 0;
  const cy = unit.sprite?.y ?? 0;
  const coreUnit =
    scene.coreUnitsById?.get?.(unit.id) ??
    (scene.battleState?.units ?? []).find((u) => u.id === unit.id);
  const unitType = coreUnit?.type ?? unit.type ?? null;
  const uiLift = Number(getUnitHpUiLiftPx(unitType));

  // РЅРёР¶РЅРёР№ СѓРіРѕР» "pointy-top" РіРµРєСЃР°
  const tipY = cy + scene.hexSize * 0.98;

  // HP Р±Р°СЂ вЂ” РЅР° С‚РѕРј Р¶Рµ СѓСЂРѕРІРЅРµ, РЅРѕ С‡СѓС‚СЊ РІС‹С€Рµ (РїРѕРґРЅРёРјРё/РѕРїСѓСЃС‚Рё С‚СѓС‚)
  const hpGap = Math.round(scene.hexSize * 2.75); // в‰€ +5px РїСЂРё hexSize=44
  const y = Math.round(tipY - h - hpGap - uiLift - HP_BAR_EXTRA_LIFT_PX);

  const x = Math.round(cx - w / 2);

  // в­ђ rank icon (РІРЅРёР·Сѓ РіРµРєСЃР°, РїРѕРІРµСЂС… Р°СЂС‚Р°)
  if (unit.rankIcon) {
    if (!unit.rankIcon.scene || !unit.rankIcon.scene.sys) return;
    const rank = Math.max(1, Math.min(3, unit.rank ?? 1));
    const key = `rank${rank}`;
    const textures = scene?.sys?.textures;

    // РµСЃР»Рё С‚РµРєСЃС‚СѓСЂР° РµСЃС‚СЊ вЂ” РѕР±РЅРѕРІРёРј (РЅР° СЃР»СѓС‡Р°Р№ РёР·РјРµРЅРµРЅРёСЏ СЂР°РЅРіР°)
    if (textures?.exists?.(key)) {
      unit.rankIcon.setTexture(key);
    }

    // rankIcon РїСЂРёРІСЏР·С‹РІР°РµРј Рє РЅРёР¶РЅРµР№ РіСЂР°РЅРёС†Рµ HP-Р±Р°СЂР° (originY = 1).
    unit.rankIcon.setPosition(cx, y + h - 5 + RANK_ICON_OFFSET_Y_PX);

    // РІРёРґРёРјРѕСЃС‚СЊ:
    // - РЅР° СЃРєР°РјРµР№РєРµ СЂР°РЅРі РїРѕРєР°Р·С‹РІР°РµРј РІСЃРµРіРґР°;
    // - РЅР° РїРѕР»Рµ вЂ” С‚РѕР»СЊРєРѕ РІ prep.
    const isBench = coreUnit?.zone === 'bench';
    unit.rankIcon.setVisible(Boolean(isBench || scene.battleState?.phase === 'prep'));
  }

  // С†РІРµС‚Р°
  const bg = 0x111111;
  const border = 0x000000;
  const lagColor = 0xffcc33; // Р¶С‘Р»С‚С‹Р№ С…РІРѕСЃС‚
  const mainColor = (unit.team === 'enemy') ? 0xff4444 : 0x44ff66; // РєСЂР°СЃРЅ/Р·РµР»

  const lagW = Math.round((hpLag / maxHp) * w);
  const instW = Math.round((hpInstant / maxHp) * w);

  // С„РѕРЅ
  g.fillStyle(bg, 0.85);
  g.fillRect(x, y, w, h);

  // Р¶С‘Р»С‚С‹Р№ вЂњС…РІРѕСЃС‚вЂќ (СЃРЅР°С‡Р°Р»Р° РѕРЅ)
  if (lagW > 0) {
    g.fillStyle(lagColor, 0.85);
    g.fillRect(x, y, lagW, h);
  }

  // РѕСЃРЅРѕРІРЅРѕР№ Р±Р°СЂ (РїРѕРІРµСЂС… С…РІРѕСЃС‚Р°)
  if (instW > 0) {
    g.fillStyle(mainColor, 0.95);
    g.fillRect(x, y, instW, h);
  }

  // РѕР±РІРѕРґРєР°
  g.lineStyle(1, border, 0.9);
  g.strokeRect(x, y, w, h);
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}


