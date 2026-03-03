// Р РёСЃСѓРµРј HP Р±Р°СЂ РЅР°Рґ СЋРЅРёС‚РѕРј.
// unit.hpInstant вЂ” вЂњРјРіРЅРѕРІРµРЅРЅС‹Р№вЂќ (РѕСЃРЅРѕРІРЅРѕР№) hp
// unit.hpLag     вЂ” вЂњРґРѕРіРѕРЅСЏСЋС‰РёР№вЂќ (Р¶С‘Р»С‚С‹Р№ С…РІРѕСЃС‚)
// unit.hp        вЂ” Р»РѕРіРёС‡РµСЃРєРѕРµ (РјРѕР¶РµС‚ СЃРѕРІРїР°РґР°С‚СЊ СЃ hpInstant)

import { getUnitHpUiLiftPx } from './unitVisualConfig.js';
import { boardDepth, hasBoardCoords } from './depthOrder.js';

const HP_BAR_EXTRA_LIFT_PX = 3; // РѕР±С‰РёР№ РїРѕРґСЉС‘Рј HP-Р±Р°СЂР° РґР»СЏ РІСЃРµС… СЋРЅРёС‚РѕРІ (rank icon РЅРµ С‚СЂРѕРіР°РµРј)
const RANK_ICON_OFFSET_Y_PX = 8; // + вниз, - вверх (только rank icon, HP-бар не двигается)
const HP_UI_DEPTH_BASE = 2000;
const ABILITY_CD_BAR_HEIGHT_PX = 4;
const ABILITY_CD_BAR_GAP_PX = 0;
const ABILITY_CD_BAR_BG = 0x3a2e12;
const ABILITY_CD_BAR_BG_ALPHA = 0.72;
const ABILITY_CD_BAR_FILL = 0xf3c24a;
const ABILITY_CD_BAR_FILL_ALPHA = 0.96;
const ABILITY_CD_BAR_BORDER = 0x241b0a;
const ABILITY_CD_BAR_BORDER_ALPHA = 0.85;
const ABILITY_CD_READY_FLASH_MS = 260;

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
  const uiDepth = (hasBoardCoords(coreUnit) && coreUnit?.zone !== 'bench')
    ? boardDepth(HP_UI_DEPTH_BASE, coreUnit.q, coreUnit.r)
    : HP_UI_DEPTH_BASE;
  g.setDepth(uiDepth);

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
    unit.rankIcon.setDepth(uiDepth + 1);

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

  // Active-ability cooldown bar (thin golden bar under HP).
  const abilityCdFill = Number(scene.getAbilityCooldownFillForUnit?.(unit));
  if (Number.isFinite(abilityCdFill)) {
    const cdRatio = clamp(abilityCdFill, 0, 1);
    const nowMs = Number(scene?.time?.now ?? 0);
    const cdY = y + h + ABILITY_CD_BAR_GAP_PX;
    const cdW = w;
    const cdH = ABILITY_CD_BAR_HEIGHT_PX;
    const cdFillW = Math.round(cdW * cdRatio);

    g.fillStyle(ABILITY_CD_BAR_BG, ABILITY_CD_BAR_BG_ALPHA);
    g.fillRect(x, cdY, cdW, cdH);

    if (cdFillW > 0) {
      g.fillStyle(ABILITY_CD_BAR_FILL, ABILITY_CD_BAR_FILL_ALPHA);
      g.fillRect(x, cdY, cdFillW, cdH);
    }

    g.lineStyle(1, ABILITY_CD_BAR_BORDER, ABILITY_CD_BAR_BORDER_ALPHA);
    g.strokeRect(x, cdY, cdW, cdH);

    // One-shot ready flash when cooldown reaches 100%.
    // Guard against false flash on battle start:
    // flash only after bar was previously "not full" in this cooldown cycle.
    if (cdRatio < 0.999) {
      unit._abilityCdReadyFxArmed = true;
      unit._abilityCdReadyFxPlayed = false;
    } else if (unit._abilityCdReadyFxArmed && !unit._abilityCdReadyFxPlayed) {
      unit._abilityCdReadyFxPlayed = true;
      unit._abilityCdReadyFxArmed = false;
      unit._abilityCdReadyFlashUntilMs = nowMs + ABILITY_CD_READY_FLASH_MS;
    }

    // Draw flash overlay directly in the same HP/CD graphics layer (guaranteed visible over the bar).
    const flashUntil = Number(unit._abilityCdReadyFlashUntilMs ?? 0);
    if (flashUntil > nowMs) {
      const leftMs = Math.max(0, flashUntil - nowMs);
      const t = clamp(leftMs / ABILITY_CD_READY_FLASH_MS, 0, 1);
      const a = 0.75 * t;
      g.fillStyle(0xfff2b3, a);
      g.fillRect(x - 1, cdY - 1, cdW + 2, cdH + 2);
      g.lineStyle(1, 0xffcc55, Math.min(1, a + 0.15));
      g.strokeRect(x - 1, cdY - 1, cdW + 2, cdH + 2);
    } else if (flashUntil > 0) {
      unit._abilityCdReadyFlashUntilMs = 0;
    }
  }
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}



