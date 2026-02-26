import { defineConfig } from 'vite';

function isPhaserModule(id) {
  if (id.includes('/node_modules/phaser/') || id.includes('\\node_modules\\phaser\\')) return true;
  // Vite/rolldown may reference pre-bundled Phaser through cached deps paths or virtual ids.
  return id.includes('phaser') && (id.includes('.vite') || id.includes('node_modules'));
}

function isNodeModule(id) {
  return id.includes('/node_modules/') || id.includes('\\node_modules\\');
}

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (isPhaserModule(id)) return 'phaser';
          if (isNodeModule(id)) return 'vendor';

          // Keep battle scene and related UI code out of the tiny bootstrap chunk.
          if (id.includes('/src/scenes/') || id.includes('\\src\\scenes\\')) return 'game-scenes';
          if (id.includes('/src/game/') || id.includes('\\src\\game\\')) return 'game-core';

          return undefined;
        },
      },
    },
  },
});
