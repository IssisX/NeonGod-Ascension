export interface Entity {
  x: number;
  y: number;
  vx: number;
  vy: number;
  active: boolean;
}

export interface Player extends Entity {
  hp: number;
  maxHp: number;
  xp: number;
  level: number;
  xpToNext: number;
  angle: number;
  cd: number;
  dashCd: number;
  maxDashCd: number;
  invuln: number;
  hitFlash: number;
  muzzleFlash: number; 
  trail: { x: number; y: number; angle: number }[]; // Temporal Echo
  weapon: 'DEFAULT' | 'SHOTGUN' | 'RAILGUN' | 'VOID';
  stats: {
    multishot: number;
    fireRateMod: number;
    speedMod: number;
    damageMod: number;
    magnetRange: number;
    orbitals: number;
    homing: number;
    pierce: number;
  };
}

export interface Bullet extends Entity {
  id: string;
  life: number;
  color: string;
  dmg: number;
  pierce: number;
  homing: number;
  size: number;
}

export type EnemyAffix = 'VORTEX' | 'REPULSOR' | 'SPLITTER' | 'WARP' | 'REGEN';

export interface Enemy extends Entity {
  id: string;
  hp: number;
  maxHp: number;
  type: string;
  speed: number;
  size: number;
  color: string;
  isElite: boolean;
  affixes: EnemyAffix[]; 
  affixTimer: number;    
  xp: number;
  score: number;
  shootTimer: number;
  attackTimer: number;
  phase: number;
  dead: boolean;
  life: number;
  hitFlash: number;
  rotation: number;
  spawnAnim: number; 
}

export interface Particle extends Entity {
  life: number;
  maxLife: number;
  color: string;
  size: number;
  friction: number;
  type: 'glow' | 'shard' | 'ring' | 'text' | 'ghost'; 
  rotation: number;     
  rotationSpeed: number; 
}

export interface Gem extends Entity {
  val: number;
  life: number;
  active: boolean;
}

export interface Pickup extends Entity {
    type: 'heal' | 'power';
    life: number;
    active: boolean;
}

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  life: number;
  maxLife: number; // NEW
  vx: number; // NEW: Physics velocity X
  vy: number; // NEW: Physics velocity Y
  color: string;
  size: number;
}

export interface Shockwave {
  x: number;
  y: number;
  size: number;
  maxSize: number;
  color: string;
  speed: number;
  alpha: number;
  width: number;
}

export interface Light {
  x: number;
  y: number;
  radius: number;
  color: string; // Hex or rgba
  intensity: number;
  flicker?: boolean;
}

export interface Orbital {
  angle: number;
  dist: number;
}

export interface TouchInput {
  id: number;
  originX: number;
  originY: number;
  x: number;
  y: number;
  type: 'move' | 'aim';
}

export interface GameState {
  active: boolean;
  paused: boolean;
  gameOver: boolean;
  autoMode: boolean;
  frame: number;
  width: number;
  height: number;
  pixelRatio: number;
  score: number;
  wave: number;
  waveKills: number; 
  waveQuota: number; 
  combo: number;
  comboTimer: number;
  overdrive: number;
  timeScale: number;
  shake: number;
  screenFlash: number; 
  flashColor: string; 
  startTime: number;
  runDuration: number;
  quality: string;
  qualitySettings: any;
  player: Player;
  bullets: Bullet[];
  enemies: Enemy[];
  particles: Particle[];
  gems: Gem[];
  pickups: Pickup[];
  texts: FloatingText[];
  shockwaves: Shockwave[];
  lights: Light[]; // Dynamic Lighting
  orbitals: Orbital[];
  keys: { [key: string]: boolean; ArrowUp: boolean; ArrowDown: boolean; ArrowLeft: boolean; ArrowRight: boolean; space: boolean; shift: boolean; f: boolean };
  mouse: { x: number; y: number; down: boolean };
  touches: { [key: number]: TouchInput };
  spawnTimer: number;
  spawnRate: number;
  bossActive: boolean;
  upgradeStacks: Map<string, number>;
  pools: {
    bullets: any;
    enemies: any;
    particles: any;
    gems: any;
    pickups: any;
  };
  spatialGrid: any;
  visualGrid: any;
}

export interface UpgradeOption {
  id: string;
  name: string;
  desc: string;
  weight: number;
  maxStack: number;
  currentStack: number;
}

export interface RunData {
  id?: string;
  score: number;
  wave: number;
  level: number;
  duration: number;
  weapon: string;
  upgrades: { id: string; count: number }[];
  timestamp?: number;
}

export interface UIState {
  screen: 'boot' | 'start' | 'playing' | 'levelup' | 'gameover';
  score: number;
  hp: number;
  maxHp: number;
  xp: number;
  xpToNext: number;
  level: number;
  wave: number;
  combo: number;
  overdrive: number;
  dashReady: boolean;
  bossWarning: boolean;
  upgradeOptions: UpgradeOption[];
  weaponName: string;
  topRuns: RunData[];
  globalStats: { totalRuns: number; bestScore: number };
  error?: string | null;
  autoMode: boolean;
}

export interface InputState {
    keys: { [key: string]: boolean };
    mouse: { x: number; y: number; down: boolean };
}

export type SoundType = 'shoot' | 'explosion' | 'hit' | 'dash' | 'levelup' | 'gameover' | 'spawn' | 'charge' | 'ultimate' | 'pickup' | 'evolve';
