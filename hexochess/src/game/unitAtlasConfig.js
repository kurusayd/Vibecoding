export function atlasFramePrefix(def) {
  return String(def?.framePrefix ?? 'psd_animation');
}

export function atlasIdleFrame(def) {
  return `${atlasFramePrefix(def)}/idle.png`;
}

export function atlasDeadFrame(def) {
  return `${atlasFramePrefix(def)}/dead.png`;
}

export function atlasWalkFrameRegex(def) {
  const prefix = atlasFramePrefix(def).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${prefix}/walk_?\\d{4}\\.png$`);
}

export function atlasAttackFrameRegex(def) {
  const prefix = atlasFramePrefix(def).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${prefix}/attack_?\\d{4}\\.png$`);
}

export const UNIT_ATLAS_DEFS = [
  {
    type: 'Swordsman',
    atlasKey: 'sworman_atlas',
    atlasPath: '/assets/units/human/swordman/atlas/swordman_atlas',
    idleAnim: 'swordman_idle',
    walkAnim: 'swordman_walk',
    attackAnim: 'swordman_attack',
    deadAnim: 'swordman_dead',
    framePrefix: 'psd_animation',
  },
  {
    type: 'Crossbowman',
    atlasKey: 'crossbowman_atlas',
    atlasPath: '/assets/units/human/crossbowman/atlas/swordman_atlas',
    idleAnim: 'crossbowman_idle',
    walkAnim: 'crossbowman_walk',
    attackAnim: 'crossbowman_attack',
    deadAnim: 'crossbowman_dead',
    framePrefix: 'psd_animation',
  },
  {
    type: 'Knight',
    atlasKey: 'knight_atlas',
    atlasPath: '/assets/units/human/knight/atlas/swordman_atlas',
    idleAnim: 'knight_idle',
    walkAnim: 'knight_walk',
    attackAnim: 'knight_attack',
    deadAnim: 'knight_dead',
    framePrefix: 'psd_animation',
  },
  {
    type: 'Skeleton',
    atlasKey: 'skeleton_atlas',
    atlasPath: '/assets/units/undead/skeleton/skeleton_atlas',
    idleAnim: 'skeleton_idle',
    walkAnim: 'skeleton_walk',
    attackAnim: 'skeleton_attack',
    deadAnim: 'skeleton_dead',
    framePrefix: 'psd_animation2',
  },
  {
    type: 'BonesGolem',
    atlasKey: 'bones_golem_atlas',
    atlasPath: '/assets/units/undead/bones_golem/bones_golem_atlas',
    idleAnim: 'bones_golem_idle',
    walkAnim: 'bones_golem_walk',
    attackAnim: 'bones_golem_attack',
    deadAnim: 'bones_golem_dead',
    framePrefix: 'psd_animation',
  },
  {
    type: 'Ghost',
    atlasKey: 'ghost_atlas',
    atlasPath: '/assets/units/undead/ghost/ghost_atlas',
    idleAnim: 'ghost_idle',
    walkAnim: 'ghost_walk',
    attackAnim: 'ghost_attack',
    deadAnim: 'ghost_dead',
    framePrefix: 'psd_animation',
  },
  {
    type: 'Lich',
    atlasKey: 'lich_atlas',
    atlasPath: '/assets/units/undead/lich/lich_atlas',
    idleAnim: 'lich_idle',
    walkAnim: 'lich_walk',
    attackAnim: 'lich_attack',
    deadAnim: 'lich_dead',
    framePrefix: 'psd_animation',
  },
  {
    type: 'SkeletonArcher',
    atlasKey: 'skeleton_archer_atlas',
    atlasPath: '/assets/units/undead/skeleton_archer/skeleton_archer_atlas',
    idleAnim: 'skeleton_archer_idle',
    walkAnim: 'skeleton_archer_walk',
    attackAnim: 'skeleton_archer_attack',
    deadAnim: 'skeleton_archer_dead',
    framePrefix: 'psd_animation',
  },
  {
    type: 'Vampire',
    atlasKey: 'vampire_atlas',
    atlasPath: '/assets/units/undead/vampire/vampire_atlas',
    idleAnim: 'vampire_idle',
    walkAnim: 'vampire_walk',
    attackAnim: 'vampire_attack',
    deadAnim: 'vampire_dead',
    framePrefix: 'psd_animation',
  },
  {
    type: 'Zombie',
    atlasKey: 'zombie_atlas',
    atlasPath: '/assets/units/undead/zombie/zombie_atlas',
    idleAnim: 'zombie_idle',
    walkAnim: 'zombie_walk',
    attackAnim: 'zombie_attack',
    deadAnim: 'zombie_dead',
    framePrefix: 'psd_animation',
  },
];

export const UNIT_ATLAS_DEF_BY_TYPE = Object.fromEntries(
  UNIT_ATLAS_DEFS.map((def) => [def.type, def])
);

export const UNIT_ANIMS_BY_TYPE = Object.fromEntries(
  UNIT_ATLAS_DEFS.map((def) => [
    def.type,
    {
      idle: def.idleAnim,
      walk: def.walkAnim,
      attack: def.attackAnim,
      dead: def.deadAnim,
    },
  ])
);

