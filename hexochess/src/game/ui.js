export function createFullscreenButton(scene) {
  if (scene.fsBtn) return;

  scene.fsBtn = scene.add.text(10, 10, '⛶', {
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
    fontSize: '18px',
    color: '#ffffff',
    backgroundColor: 'rgba(0,0,0,0.55)',
    padding: { left: 8, right: 8, top: 6, bottom: 6 },
  })
  .setScrollFactor(0)
  .setDepth(9999)
  .setInteractive({ useHandCursor: true });

  scene.fsBtn.on('pointerdown', () => {
    if (scene.scale.isFullscreen) scene.scale.stopFullscreen();
    else scene.scale.startFullscreen();
  });

  const updateLabel = () => {
    scene.fsBtn.setText(scene.scale.isFullscreen ? '✕' : '⛶');
    scene.fsBtn.setInteractive();
    positionFullscreenButton(scene);
  };

  scene.scale.on('enterfullscreen', updateLabel);
  scene.scale.on('leavefullscreen', updateLabel);

  updateLabel();
}

export function positionFullscreenButton(scene) {
  if (!scene.fsBtn) return;

  const view = scene.scale.getViewPort();
  const margin = 10;
  scene.fsBtn.setPosition(view.x + margin, view.y + margin);
}
