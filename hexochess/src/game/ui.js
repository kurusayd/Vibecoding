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
    const isFs = scene.scale.isFullscreen;

    scene.fsBtn.setText(isFs ? '✕' : '⛶');

    // ✅ Размер: разворот — 1.5x, крестик — как раньше
    const fontSize = isFs ? 18 : 27; // 18px было у тебя изначально, 27 = *1.5
    scene.fsBtn.setStyle({ fontSize: `${fontSize}px` });

    // ✅ Поддержим “кнопочность” паддингом: для большой кнопки больше воздуха
    scene.fsBtn.setPadding(
      isFs
        ? { left: 8, right: 8, top: 6, bottom: 6 }     // как было
        : { left: 12, right: 12, top: 9, bottom: 9 }   // примерно *1.5
    );

    scene.fsBtn.setInteractive({ useHandCursor: true });
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
