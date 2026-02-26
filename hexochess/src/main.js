async function boot() {
  const [{ default: Phaser }, { default: BattleScene }] = await Promise.all([
    import('phaser'),
    import('./scenes/BattleScene.js'),
  ]);

  new Phaser.Game({
    type: Phaser.AUTO,
    backgroundColor: '#000000',
    parent: 'app',

    // Повышаем внутреннюю "плотность" без изменения логических размеров сцены.
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
}

boot().catch((err) => {
  console.error('Failed to boot game', err);
});

