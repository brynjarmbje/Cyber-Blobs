export const STORAGE_KEYS = {
  leaderboard: 'cs_leaderboard_v2',
  leaderboardLegacy: 'cs_leaderboard',
  trophies: 'cs_trophies',
  cash: 'cs_cash',
  achievements: 'cs_achievements_v1',
  ultimate: 'cs_ultimate_v1',
  ultimatesOwned: 'cs_ultimates_owned_v1',
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
    price: 50,
    icon: 'S',
    desc: '+1 starting life each run',
    effect: { startLives: 1 },
  },
  {
    id: 'prism',
    name: 'Prism Core',
    price: 150,
    icon: 'P',
    desc: '+5s powerup duration',
    effect: { powerupDurationBonusMs: 5000 },
  },
  {
    id: 'nova',
    name: 'Nova Crown',
    price: 400,
    icon: 'N',
    desc: '+25% cash from kills',
    effect: { cashMultiplier: 1.25 },
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
