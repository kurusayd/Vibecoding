export function atlasFramePrefix(def) {
  return String(def?.framePrefix ?? 'psd_animation');
}

function atlasFrameName(def, baseName) {
  const prefix = atlasFramePrefix(def);
  return prefix ? `${prefix}/${baseName}` : baseName;
}

export function atlasIdleFrame(def) {
  return atlasFrameName(def, 'idle.png');
}

export function atlasDeadFrame(def) {
  return atlasFrameName(def, 'dead.png');
}

export function atlasWalkFrameRegex(def) {
  const prefix = atlasFramePrefix(def);
  if (!prefix) return /^walk_?\d{4}\.png$/;
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escapedPrefix}/walk_?\\d{4}\\.png$`);
}

export function atlasAttackFrameRegex(def) {
  const prefix = atlasFramePrefix(def);
  if (!prefix) return /^attack_?\d{4}\.png$/;
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escapedPrefix}/attack_?\\d{4}\\.png$`);
}

export function atlasSpellFrameRegex(def) {
  const prefix = atlasFramePrefix(def);
  if (!prefix) return /^spell_?\d{4}\.png$/;
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escapedPrefix}/spell_?\\d{4}\\.png$`);
}

export const UNIT_ATLAS_DEFS = [
  {
    type: 'Swordsman',
    atlasKey: 'swordman_atlas',
    atlasPath: '/assets/units/human/swordman/atlas/swordman_atlas',
    idleAnim: 'swordman_idle',
    walkAnim: 'swordman_walk',
    attackAnim: 'swordman_attack',
    deadAnim: 'swordman_dead',
    framePrefix: 'psd_anim',
  },
  {
    type: 'Crossbowman',
    atlasKey: 'crossbowman_atlas',
    atlasPath: '/assets/units/human/crossbowman/atlas/crossbowman_atlas',
    idleAnim: 'crossbowman_idle',
    walkAnim: 'crossbowman_walk',
    attackAnim: 'crossbowman_attack',
    deadAnim: 'crossbowman_dead',
    framePrefix: 'psd_anim',
  },
  {
    type: 'Crusader',
    atlasKey: 'crusader_atlas',
    atlasPath: '/assets/units/human/crusader/atlas/crusader_atlas',
    idleAnim: 'crusader_idle',
    walkAnim: 'crusader_walk',
    attackAnim: 'crusader_attack',
    deadAnim: 'crusader_dead',
    framePrefix: 'psd_anim',
  },
  {
    type: 'Priest',
    atlasKey: 'priest_atlas',
    atlasPath: '/assets/units/human/priest/atlas/priest_atlas',
    idleAnim: 'priest_idle',
    walkAnim: 'priest_walk',
    attackAnim: 'priest_attack',
    deadAnim: 'priest_dead',
    framePrefix: 'psd_anim',
  },
  {
    type: 'Monk',
    atlasKey: 'lizard_atlas',
    atlasPath: '/assets/units/lizard/monk/lizard_atlas',
    idleAnim: 'monk_idle',
    walkAnim: 'monk_walk',
    attackAnim: 'monk_attack',
    deadAnim: 'monk_dead',
    framePrefix: 'psd_anim',
  },
  {
    type: 'Skeleton',
    atlasKey: 'skeleton_atlas',
    atlasPath: '/assets/units/undead/skeleton/skeleton_atlas',
    idleAnim: 'skeleton_idle',
    walkAnim: 'skeleton_walk',
    attackAnim: 'skeleton_attack',
    deadAnim: 'skeleton_dead',
    framePrefix: 'psd_anim',
  },
  {
    type: 'SimpleSkeleton',
    atlasKey: 'simple_skeleton_atlas',
    atlasPath: '/assets/units/undead/simple_skeleton/simple_skeleton_atlas',
    idleAnim: 'simple_skeleton_idle',
    walkAnim: 'simple_skeleton_walk',
    attackAnim: 'simple_skeleton_attack',
    deadAnim: 'simple_skeleton_dead',
    framePrefix: 'psd_anim',
  },
  {
    type: 'BonesGolem',
    atlasKey: 'bones_golem_atlas',
    atlasPath: '/assets/units/undead/bones_golem/bones_golem_atlas',
    idleAnim: 'bones_golem_idle',
    walkAnim: 'bones_golem_walk',
    attackAnim: 'bones_golem_attack',
    deadAnim: 'bones_golem_dead',
    framePrefix: 'psd_anim',
  },
  {
    type: 'Ghost',
    atlasKey: 'ghost_atlas',
    atlasPath: '/assets/units/undead/ghost/ghost_atlas',
    idleAnim: 'ghost_idle',
    walkAnim: 'ghost_walk',
    attackAnim: 'ghost_attack',
    deadAnim: 'ghost_dead',
    framePrefix: 'psd_anim',
  },
  {
    type: 'Lich',
    atlasKey: 'lich_atlas',
    atlasPath: '/assets/units/undead/lich/lich_atlas',
    idleAnim: 'lich_idle',
    walkAnim: 'lich_walk',
    attackAnim: 'lich_attack',
    deadAnim: 'lich_dead',
    framePrefix: 'psd_anim',
  },
  {
    type: 'SkeletonArcher',
    atlasKey: 'sarcher_atlas',
    atlasPath: '/assets/units/undead/skeleton_archer/sarcher_atlas',
    idleAnim: 'skeleton_archer_idle',
    walkAnim: 'skeleton_archer_walk',
    attackAnim: 'skeleton_archer_attack',
    deadAnim: 'skeleton_archer_dead',
    framePrefix: 'psd_anim',
  },
  {
    type: 'Vampire',
    atlasKey: 'vampire_atlas',
    atlasPath: '/assets/units/undead/vampire/vampire_atlas',
    idleAnim: 'vampire_idle',
    walkAnim: 'vampire_walk',
    attackAnim: 'vampire_attack',
    deadAnim: 'vampire_dead',
    framePrefix: 'psd_anim',
  },
  {
    type: 'Zombie',
    atlasKey: 'zombie_atlas',
    atlasPath: '/assets/units/undead/zombie/zombie_atlas',
    idleAnim: 'zombie_idle',
    walkAnim: 'zombie_walk',
    attackAnim: 'zombie_attack',
    deadAnim: 'zombie_dead',
    framePrefix: 'psd_anim',
  },
  {
    type: 'Undertaker',
    atlasKey: 'undertaker_atlas',
    atlasPath: '/assets/units/undead/undertaker/undertaker_atlas',
    idleAnim: 'undertaker_idle',
    walkAnim: 'undertaker_walk',
    attackAnim: 'undertaker_attack',
    spellAnim: 'undertaker_spell',
    deadAnim: 'undertaker_dead',
    framePrefix: 'psd_anim',
  },
  {
    type: 'Angel',
    atlasKey: 'angel_atlas',
    atlasPath: '/assets/units/gods/angel/angel_atlas',
    idleAnim: 'angel_idle',
    walkAnim: 'angel_walk',
    attackAnim: 'angel_attack',
    deadAnim: 'angel_dead',
    framePrefix: '',
  },
  {
    type: 'Devil',
    atlasKey: 'devil_atlas',
    atlasPath: '/assets/units/demons/devil/atlas/devil_atlas',
    idleAnim: 'devil_idle',
    walkAnim: 'devil_walk',
    attackAnim: 'devil_attack',
    deadAnim: 'devil_dead',
    framePrefix: 'psd_anim',
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
      spell: def.spellAnim ?? null,
      dead: def.deadAnim,
    },
  ])
);
