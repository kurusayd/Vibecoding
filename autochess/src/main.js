import Phaser from 'phaser';
import BattleScene from './scenes/BattleScene.js';

new Phaser.Game({
  type: Phaser.AUTO,
  backgroundColor: '#000000',
  parent: 'app',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 960,
    height: 540,
    fullscreenTarget: 'app',
  },
  scene: BattleScene,
});
