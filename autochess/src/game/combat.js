import { startHpLag, updateHpBar } from './hpbar.js';

export function attackIfPossible(scene, attacker, target, distanceFn) {
  if (!attacker || !target) return false;
  if (target.team !== 'enemy') return false;

  const d = distanceFn(attacker.q, attacker.r, target.q, target.r);
  if (d > 1) return false;

  target.hp -= attacker.atk;

  // визуальный фидбек
  scene.tweens.add({
    targets: target.circle,
    alpha: 0.2,
    duration: 60,
    yoyo: true,
    repeat: 2,
  });

  updateHpBar(scene, target);
  startHpLag(scene, target);

  return true;
}
