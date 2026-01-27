export const CONFIG = Object.freeze({
  ENGINE: { TARGET_FPS: 60, FRAME_BUDGET_MS: 16.667, PERF_SAMPLE_INTERVAL: 60 },
  QUALITY: {
    TIERS: {
      HIGH: { particles: 200, etherParticles: 2000, gridStep: 1, shadowBlur: 12 },
      MEDIUM: { particles: 100, etherParticles: 1000, gridStep: 2, shadowBlur: 6 },
      LOW: { particles: 50, etherParticles: 400, gridStep: 2, shadowBlur: 0 },
    },
    LOAD_THRESHOLDS: { HIGH_MAX: 300, MEDIUM_MAX: 500 },
  },
  SPATIAL: { CELL_SIZE: 128 },
  POOLS: {
    BULLETS: { initial: 100, max: 300 },
    PARTICLES: { initial: 150, max: 400 },
    ENEMIES: { initial: 30, max: 120 },
    GEMS: { initial: 50, max: 200 },
    PICKUPS: { initial: 5, max: 20 },
  },
  ETHER: {
    CELL_SIZE: 40,
    DRAG: 0.96, // Velocity decay per frame
    DIFFUSION: 0.1, // Neighbor spread
    PARTICLE_ALPHA: 0.4,
    PARTICLE_FADE: 0.99,
  },
  PLAYER: {
    BASE_HP: 200, 
    BASE_SPEED: 1.1, // Slower movement (was 1.3)
    ACCELERATION: 0.88,
    DASH: { COOLDOWN: 90, SPEED: 15, INVULN_DURATION: 25 },
    COLLISION_RADIUS: 10,
    INVULN_ON_HIT: 60, 
  },
  WEAPONS: {
    DEFAULT: { name: "Pulse Rifle", color: "#ffe600", speed: 16, spread: 0.05, dmgMult: 1.0, fireDelay: 1, size: 4, pierce: 0, homing: 0, count: 1, lifetime: 80 },
    SHOTGUN: { name: "Scattergun", color: "#ff9900", speed: 13, spread: 0.4, dmgMult: 0.8, fireDelay: 1, size: 4, pierce: 1, homing: 0, count: 6, lifetime: 50 },
    RAILGUN: { name: "Rail Driver", color: "#00ffff", speed: 45, spread: 0, dmgMult: 2.5, fireDelay: 2, size: 5, pierce: 4, homing: 0, count: 1, lifetime: 100, type: 'beam' },
    VOID: { name: "Void Ray", color: "#aa00ff", speed: 12, spread: 0.15, dmgMult: 1.3, fireDelay: 1, size: 8, pierce: 0, homing: 0.25, count: 1, lifetime: 90, type: 'orb' },
  } as Record<string, any>,
  ENEMIES: {
    // Reduced speeds across the board to match player
    CHASER: { hp: 10, speed: 1.5, size: 15, color: "#ff0055", xp: 10, score: 100, hpScale: 2.0, speedScale: 0.03 },
    SHOOTER: { hp: 8, speed: 1.2, size: 20, color: "#be00ff", xp: 15, score: 150, hpScale: 1.8, speedScale: 0.02, shootInterval: 120 },
    TANK: { hp: 35, speed: 0.8, size: 28, color: "#00ff9d", xp: 25, score: 200, hpScale: 7, speedScale: 0.01 },
    KAMIKAZE: { hp: 6, speed: 2.6, size: 14, color: "#ff5500", xp: 12, score: 120, hpScale: 1.2, speedScale: 0.04, detectRange: 180 },
    TURRET: { hp: 45, speed: 0.4, size: 30, color: "#0088ff", xp: 40, score: 300, hpScale: 9, speedScale: 0, shootInterval: 180 },
    BOSS: { hp: 2000, speed: 1.2, size: 60, color: "#ff3333", xp: 2000, score: 5000, hpScale: 350 },
  } as Record<string, any>,
  // AFFIX CONFIGURATION
  AFFIXES: {
    VORTEX: { range: 250, force: 0.4, color: "#bd00ff" },
    REPULSOR: { range: 180, force: 0.8, color: "#0088ff" },
    SPLITTER: { count: 3, color: "#ffaa00" },
    WARP: { cooldown: 240, range: 200, color: "#00ffcc" },
    REGEN: { rate: 0.05, interval: 60, color: "#00ff44" },
  },
  ELITE: { HP_MULT: 2.5, SPEED_MULT: 1.2, SIZE_MULT: 1.3, XP_MULT: 3, SCORE_MULT: 3, COLOR: "#ffffff", CHANCE_PER_WAVE: 0.02, MAX_CHANCE: 0.3 },
  SPAWNING: { 
    INITIAL_RATE: 110, // Slower start (was 80)
    MIN_RATE: 35, // Slower peak (was 25)
    RATE_DECAY: 0.99, // Slower ramp up (was 0.98)
    MAX_ENEMIES: 75, // Fewer max enemies (was 100)
    BOSS_INTERVAL: 5,
    INITIAL_WAVE_QUOTA: 12, // Lower initial quota (was 15)
    QUOTA_MULTIPLIER: 1.2
  },
  PROGRESSION: { XP_BASE: 100, XP_SCALE: 1.3, COMBO_DURATION: 200, COMBO_BONUS: 0.1 },
  GEMS: { MAGNET_RANGE: 130, PULL_STRENGTH: 0.1, FRICTION: 0.85, COLLECT_RADIUS: 30, LIFETIME: 800 },
  PICKUPS: { HEAL_AMOUNT: 50, LIFETIME: 1000, SIZE: 12, COLOR: "#00ff00" },
  COLORS: { BACKGROUND: "#050510", PLAYER: "#00f3ff", PLAYER_DASH: "#ffffff", XP_GEM: "#00ffaa", ULTIMATE: "#ff00ff" },
});

export const UPGRADES = [
  { id: "multishot", name: "Split Stream", desc: "+1 projectile", weight: 1.0, maxStack: 6 },
  { id: "fireRate", name: "Hyper Loader", desc: "+20% fire rate", weight: 1.2, maxStack: 5 },
  { id: "speed", name: "Thrusters", desc: "+15% move speed", weight: 1.0, maxStack: 4 },
  { id: "dashCd", name: "Phase Engine", desc: "-20% dash cooldown", weight: 0.8, maxStack: 3 },
  { id: "magnet", name: "Grav-Field", desc: "+50% pickup range", weight: 1.0, maxStack: 4 },
  { id: "maxHp", name: "Nano-Hull", desc: "+50 max HP & full heal", weight: 0.8, maxStack: 8 },
  { id: "damage", name: "Amp Core", desc: "+20% damage", weight: 1.0, maxStack: 10 },
  { id: "pierce", name: "Penetrator", desc: "+1 pierce", weight: 0.6, maxStack: 5 },
  { id: "homing", name: "Tracker AI", desc: "+15% homing", weight: 0.7, maxStack: 5 },
  { id: "orbital", name: "Guardian Orb", desc: "+1 orbital", weight: 0.5, maxStack: 4 },
];