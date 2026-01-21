export const STORAGE_KEYS = {
  leaderboard: 'cs_leaderboard_v2',
  leaderboardLegacy: 'cs_leaderboard',
  trophies: 'cs_trophies',
  trophyLevels: 'cs_trophy_levels_v1',
  cash: 'cs_cash',
  achievements: 'cs_achievements_v1',
  ultimate: 'cs_ultimate_v1',
  ultimatesOwned: 'cs_ultimates_owned_v1',
  mouseAim: 'cs_mouse_aim_v1',
  maxStartLevel: 'cs_max_start_level_v1',
  playerName: 'cs_player_name_v1',
};

export const COLOR_CASH_VALUES = {
  yellow: 2,
  red: 3,
  green: 3,
  blue: 4,
  black: 5,
  white: 5,
  purple: 6,
  brown: 4,
  pink: 5,
};

export const COLOR_ORDER = [
  'yellow',
  'red',
  'green',
  'blue',
  'black',
  'white',
  'purple',
  'brown',
  'pink',
];

export const TROPHIES = [
  {
    id: 'spark',
    name: 'Spark Shard',
    price: 120,
    maxLevel: 3,
    icon: 'S',
    desc: '+1 starting life per level',
    effect: { startLives: 1 },
  },
  {
    id: 'prism',
    name: 'Prism Core',
    price: 320,
    maxLevel: 3,
    icon: 'P',
    desc: '+5s powerup duration per level',
    effect: { powerupDurationBonusMs: 5000 },
  },
  {
    id: 'nova',
    name: 'Nova Crown',
    price: 900,
    maxLevel: 3,
    icon: 'N',
    desc: '+15% cash from kills per level',
    effect: { cashMultiplier: 1.15 },
  },
  {
    id: 'vault',
    name: 'Vault Sigil',
    price: 650,
    maxLevel: 3,
    icon: 'V',
    desc: '+1 starting life and +2.5s powerup duration per level',
    effect: { startLives: 1, powerupDurationBonusMs: 2500 },
  },
  {
    id: 'harvest',
    name: 'Harvest Chip',
    price: 1100,
    maxLevel: 3,
    icon: 'H',
    desc: '+10% cash from kills and +2s powerup duration per level',
    effect: { cashMultiplier: 1.1, powerupDurationBonusMs: 2000 },
  },
];

export const POWERUP_DURATION_MS = 15000;
export const POWERUP_DROP_CHANCE = 0.1;
export const LIFE_DROP_CHANCE = 0.05;

export const POWERUP_TYPES = {
  speed: 'speed',
  fireRate: 'fireRate',
  piercing: 'piercing',
  shotgun: 'shotgun',
  bounce: 'bounce',
  life: 'life',
};
