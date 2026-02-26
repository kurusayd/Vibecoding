export function createFullscreenButton(scene) {
  if (scene.fsBtn) return;

  scene.fsBtn = scene.add.text(10, 10, '⛶', {
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
    fontSize: '24px',
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

    // ✅ ⛶ большая, ✕ маленькая (как сейчас)
    const fontSize = isFs ? 25 : 40; // 18 было, 27 = *1.5
    scene.fsBtn.setStyle({ fontSize: `${fontSize}px` });

    // ✅ паддинги тоже масштабируем, чтобы фон кнопки был больше
    scene.fsBtn.setPadding(
      isFs
        ? { left: 8, right: 8, top: 6, bottom: 6 }     // как было
        : { left: 18, right: 18, top: 12, bottom: 12 }   // примерно *1.5
    );

    scene.fsBtn.setInteractive({ useHandCursor: true });
    positionFullscreenButton(scene);
  };

  scene._fsBtnUpdateLabel = updateLabel;
  scene.scale.on('enterfullscreen', updateLabel);
  scene.scale.on('leavefullscreen', updateLabel);

  if (!scene._fsBtnCleanupBound) {
    scene._fsBtnCleanupBound = true;

    const cleanup = () => {
      const handler = scene._fsBtnUpdateLabel;
      if (handler) {
        scene.scale.off('enterfullscreen', handler);
        scene.scale.off('leavefullscreen', handler);
      }

      if (scene.fsBtn?.active) {
        try { scene.fsBtn.destroy(); } catch {}
      }

      scene.fsBtn = null;
      scene._fsBtnUpdateLabel = null;
      scene._fsBtnCleanupBound = false;
    };

    scene.events?.once?.('shutdown', cleanup);
    scene.events?.once?.('destroy', cleanup);
  }

  updateLabel();
}

export function positionFullscreenButton(scene) {
  if (!scene.fsBtn) return;

  const view = scene.scale.getViewPort();
  const margin = 10;
  scene.fsBtn.setPosition(view.x + margin, view.y + margin);
}
