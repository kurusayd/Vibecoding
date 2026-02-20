import Phaser from 'phaser';
import BattleScene from './scenes/BattleScene.js';

new Phaser.Game({
  type: Phaser.AUTO,
  backgroundColor: '#000000',
  parent: 'app',

  // ✅ повышаем внутреннюю “плотность” без изменения логических размеров сцены
  resolution: Math.min(window.devicePixelRatio || 1, 2),

  render: {
    antialias: true,
    roundPixels: true,
  },

  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1280,
    height: 720,
    fullscreenTarget: 'app',
  },
  scene: BattleScene,
});
