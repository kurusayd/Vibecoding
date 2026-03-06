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

          if (id.includes('/src/scenes/BattleScene.js') || id.includes('\\src\\scenes\\BattleScene.js')) return 'battle-scene';
          if (id.includes('/src/scenes/battleScene/') || id.includes('\\src\\scenes\\battleScene\\')) return 'battle-scene-ui';

          if (
            id.includes('/src/game/units.js') ||
            id.includes('\\src\\game\\units.js') ||
            id.includes('/src/game/unitAtlasConfig.js') ||
            id.includes('\\src\\game\\unitAtlasConfig.js') ||
            id.includes('/src/game/unitVisualConfig.js') ||
            id.includes('\\src\\game\\unitVisualConfig.js')
          ) {
            return 'game-units';
          }

          if (
            id.includes('/src/game/hpbar.js') ||
            id.includes('\\src\\game\\hpbar.js') ||
            id.includes('/src/game/depthOrder.js') ||
            id.includes('\\src\\game\\depthOrder.js') ||
            id.includes('/src/game/hex.js') ||
            id.includes('\\src\\game\\hex.js')
          ) {
            return 'game-render';
          }

          if (
            id.includes('/src/game/') ||
            id.includes('\\src\\game\\') ||
            id.includes('/src/net/') ||
            id.includes('\\src\\net\\')
          ) {
            return 'game-core';
          }

          if (id.includes('/src/scenes/') || id.includes('\\src\\scenes\\')) return 'game-scenes';

          return undefined;
        },
      },
    },
  },
});
