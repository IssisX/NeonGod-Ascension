import { CONFIG, UPGRADES } from '../constants';
import { GameState, Player, UpgradeOption, RunData, Enemy, Bullet, Particle, Shard, Gem, SoundType, Pickup, EnemyAffix } from '../types';
import { Utils } from '../utils';
import { SpatialGrid, VisualGrid } from './grids';
import { updateEnemyAI, AIContext } from './ai';
import { Director } from './director';
import { Physics } from './physics';
import { ParticleSystem } from './particles';
import { MPMSystem } from './mpm';

// --- POOLS & FACTORIES ---
export const Factories = {
  bullet: () => ({ id: '', x: 0, y: 0, vx: 0, vy: 0, life: 0, color: '', dmg: 0, pierce: 0, homing: 0, size: 3, active: false }),
  resetBullet: (b: any) => { b.id = ''; b.x = 0; b.y = 0; b.vx = 0; b.vy = 0; b.life = 0; b.color = ''; b.dmg = 0; b.pierce = 0; b.homing = 0; b.size = 3; b.active = false; },
  enemy: () => ({ id: '', x: 0, y: 0, vx: 0, vy: 0, hp: 0, maxHp: 0, type: 'chaser', speed: 0, size: 0, color: '', isElite: false, affixes: [], affixTimer: 0, xp: 0, score: 0, shootTimer: 0, attackTimer: 0, phase: 0, flockForceX: 0, flockForceY: 0, dead: false, active: false, life: 0, hitFlash: 0, rotation: 0, spawnAnim: 0, tentacles: [] }),
  resetEnemy: (e: any) => { e.id = ''; e.x = 0; e.y = 0; e.vx = 0; e.vy = 0; e.hp = 0; e.maxHp = 0; e.type = 'chaser'; e.speed = 0; e.size = 0; e.color = ''; e.isElite = false; e.affixes = []; e.affixTimer = 0; e.xp = 0; e.score = 0; e.shootTimer = 0; e.attackTimer = 0; e.phase = 0; e.flockForceX = 0; e.flockForceY = 0; e.dead = false; e.active = false; e.life = 0; e.hitFlash = 0; e.rotation = 0; e.spawnAnim = 0; e.tentacles = []; },
  shard: () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, color: '', size: 0, rotation: 0, rotationSpeed: 0, active: false }),
  resetShard: (s: any) => { s.x = 0; s.y = 0; s.vx = 0; s.vy = 0; s.life = 0; s.maxLife = 0; s.color = ''; s.size = 0; s.rotation = 0; s.rotationSpeed = 0; s.active = false; },
  gem: () => ({ x: 0, y: 0, vx: 0, vy: 0, val: 0, life: 0, active: false }),
  resetGem: (g: any) => { g.x = 0; g.y = 0; g.vx = 0; g.vy = 0; g.val = 0; g.life = 0; g.active = false; },
  pickup: () => ({ x: 0, y: 0, vx: 0, vy: 0, type: 'heal', life: 0, active: false }),
  resetPickup: (p: any) => { p.x = 0; p.y = 0; p.vx = 0; p.vy = 0; p.type = 'heal'; p.life = 0; p.active = false; },
};

class ObjectPool<T> {
    factory: () => T;
    reset: (obj: T) => void;
    max: number;
    available: T[];
    active: Set<T>;

    constructor(factory: () => T, reset: (obj: T) => void, initial = 50, max = 200) {
        this.factory = factory; this.reset = reset; this.max = max;
        this.available = []; this.active = new Set();
        for (let i = 0; i < initial; i++) this.available.push(factory());
    }
    acquire(): T | null {
        let obj;
        if (this.available.length > 0) obj = this.available.pop();
        else if (this.active.size < this.max) obj = this.factory();
        else return null;
        if (obj) this.active.add(obj);
        return obj || null;
    }
    release(obj: T) {
        if (!this.active.has(obj)) return;
        this.active.delete(obj);
        this.reset(obj);
        this.available.push(obj);
    }
}

export function resetPlayer(player: Player, width: number, height: number) {
  player.x = width / 2; player.y = height / 2; player.vx = 0; player.vy = 0;
  player.hp = CONFIG.PLAYER.BASE_HP; player.maxHp = CONFIG.PLAYER.BASE_HP;
  player.xp = 0; player.level = 1; player.xpToNext = CONFIG.PROGRESSION.XP_BASE;
  player.angle = -Math.PI / 2; player.cd = 0; player.dashCd = 0; player.maxDashCd = CONFIG.PLAYER.DASH.COOLDOWN; player.invuln = 0;
  player.hitFlash = 0; player.muzzleFlash = 0;
  player.trail = [];
  player.weapon = 'DEFAULT';
  player.stats = { multishot: 0, fireRateMod: 1, speedMod: 1, damageMod: 1, magnetRange: CONFIG.GEMS.MAGNET_RANGE, orbitals: 0, homing: 0, pierce: 0 };
}

export function createGameState(width: number, height: number): GameState {
    const s: GameState = {
        active: false, paused: false, gameOver: false, autoMode: false, frame: 0,
        width, height, pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        score: 0, wave: 1, combo: 0, comboTimer: 0, overdrive: 0,
        waveKills: 0, waveQuota: CONFIG.SPAWNING.INITIAL_WAVE_QUOTA,
        timeScale: 1, shake: 0, screenFlash: 0, flashColor: '#ffffff',
        startTime: 0, runDuration: 0,
        quality: 'HIGH', qualitySettings: CONFIG.QUALITY.TIERS.HIGH,
        player: {} as Player,
        bullets: [], enemies: [], particles: [], shards: [], gems: [], pickups: [], texts: [], shockwaves: [], lights: [], orbitals: [],
        keys: { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, space: false, shift: false, f: false },
        mouse: { x: width / 2, y: height / 2, down: false },
        touches: {},
        spawnTimer: 0, spawnRate: CONFIG.SPAWNING.INITIAL_RATE, bossActive: false,
        upgradeStacks: new Map(),
        pools: {
            bullets: new ObjectPool(Factories.bullet, Factories.resetBullet, CONFIG.POOLS.BULLETS.initial, CONFIG.POOLS.BULLETS.max),
            enemies: new ObjectPool(Factories.enemy, Factories.resetEnemy, CONFIG.POOLS.ENEMIES.initial, CONFIG.POOLS.ENEMIES.max),
            shards: new ObjectPool(Factories.shard, Factories.resetShard, 50, 150),
            gems: new ObjectPool(Factories.gem, Factories.resetGem, CONFIG.POOLS.GEMS.initial, CONFIG.POOLS.GEMS.max),
            pickups: new ObjectPool(Factories.pickup, Factories.resetPickup, CONFIG.POOLS.PICKUPS.initial, CONFIG.POOLS.PICKUPS.max),
        },
        spatialGrid: new SpatialGrid(CONFIG.SPATIAL.CELL_SIZE),
        visualGrid: new VisualGrid(width, height),
        particleSystem: new ParticleSystem(CONFIG.POOLS.PARTICLES.max), // Initialize new system
        mpmSystem: new MPMSystem(width, height), // Initialize MPM System
    };
    resetPlayer(s.player, width, height);
    return s;
}

export const createExplosion = (s: GameState, x: number, y: number, color: string, count = 10, speed = 1) => {
    // Inject Force into Fluid (Explosion Shockwave)
    if (s.visualGrid) {
        s.visualGrid.applyForce(x, y, 150 * speed, 50 * speed);
        s.visualGrid.addDensity(x, y, 50 * speed);
    }
    // Delegate to Smart Particle System
    if (s.particleSystem) {
        s.particleSystem.spawnExplosion(x, y, color, count, speed);
    }
};

const hexToRgb = (hex: string) => {
    let c = hex.substring(1);
    if(c.length === 3) c = c[0]+c[0]+c[1]+c[1]+c[2]+c[2];
    const num = parseInt(c, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

const createDebris = (s: GameState, x: number, y: number, color: string, size: number) => {
    // 1. Traditional Shards (Persistent sprites)
    const count = Math.ceil(size / 5);
    for(let i=0; i<count; i++) {
        const shard = s.pools.shards.acquire();
        if(shard) {
            const ang = Math.random() * Math.PI * 2;
            const spd = Math.random() * 4;
            shard.x = x; shard.y = y;
            shard.vx = Math.cos(ang) * spd;
            shard.vy = Math.sin(ang) * spd;
            shard.life = 300; shard.maxLife = 300;
            shard.color = color;
            shard.size = Math.random() * (size * 0.4) + 2;
            shard.rotation = Math.random() * Math.PI * 2;
            shard.rotationSpeed = (Math.random() - 0.5) * 0.2;
            shard.active = true;
            s.shards.push(shard);
        }
    }

    // 2. MPM Hyper-Elastic Matter (The Jelly)
    if (s.mpmSystem) {
        const rgb = hexToRgb(color);
        // Spawn a cluster of matter particles
        s.mpmSystem.spawnExplosion(x, y, rgb, count * 5); // Denser matter
    }
};

export const createEvolutionEffect = (s: GameState, x: number, y: number, color: string) => {
    s.screenFlash = 1.0;
    s.flashColor = color;
    s.shake = 40; 
    s.shockwaves.push({ x, y, size: 20, maxSize: 1200, color: color, speed: 40, alpha: 1, width: 80 });
    setTimeout(() => {
        s.shockwaves.push({ x, y, size: 10, maxSize: 800, color: '#ffffff', speed: 20, alpha: 0.8, width: 30 });
    }, 100);
    // Huge Ether disturbance
    if (s.visualGrid) {
        s.visualGrid.applyForce(x, y, 800, 200);
        s.visualGrid.addDensity(x, y, 200);
    }
    createFloatingText(s, x, y - 100, "EVOLUTION!", color, 40);
};

const createShockwave = (s: GameState, x: number, y: number, size: number, color: string, speed = 2) => {
    s.shockwaves.push({ x, y, size: 5, maxSize: size, color, speed, alpha: 1, width: 20 });
    // Shockwave interacts with Ether
    if (s.visualGrid) s.visualGrid.applyForce(x, y, size / 3, speed * 25);
};

// ... [Helper functions like createFloatingText, createGem, createPickup stay the same] ...
const createFloatingText = (s: GameState, x: number, y: number, text: string, color = '#fff', size = 16) => {
    const angle = Utils.rand(-Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); 
    const speed = Utils.rand(2, 5);
    s.texts.push({ x, y, text, life: 60, maxLife: 60, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, color, size });
};

const createGem = (s: GameState, x: number, y: number, val: number) => {
    const g = s.pools.gems.acquire(); if (!g) return;
    g.x = x; g.y = y; g.vx = Utils.rand(-2, 2); g.vy = Utils.rand(-3, -1);
    g.val = val; g.life = CONFIG.GEMS.LIFETIME; g.active = true;
    s.gems.push(g);
};

const createPickup = (s: GameState, x: number, y: number) => {
    const p = s.pools.pickups.acquire(); if (!p) return;
    p.x = x; p.y = y; p.vx = 0; p.vy = 0; p.type = 'heal'; 
    p.life = CONFIG.PICKUPS.LIFETIME; p.active = true;
    s.pickups.push(p);
};

// ... [Auto Pilot logic stays same] ...
function calculateAutoPilot(s: GameState): { mx: number; my: number; aimAngle: number; shoot: boolean; dash: boolean; ult: boolean } {
    const p = s.player;
    let moveX = 0; let moveY = 0; let totalDanger = 0;
    const searchRadius = 250;
    const nearby = s.spatialGrid.queryRadius(p.x, p.y, searchRadius);
    let nearestEnemy: Enemy | null = null;
    let minEnemyDist = Infinity;

    for (const e of nearby) {
        if (!e.active || e.dead || e.type === 'projectile') continue; 
        const dist = Utils.dist(p.x, p.y, e.x, e.y);
        if (e.type !== 'projectile' && dist < minEnemyDist) { minEnemyDist = dist; nearestEnemy = e; }
        if (dist < searchRadius) {
            const weight = (1 - dist / searchRadius);
            const force = weight * weight * (e.type === 'projectile' || e.type === 'kamikaze' ? 5.0 : 2.0); 
            const angle = Math.atan2(p.y - e.y, p.x - e.x);
            moveX += Math.cos(angle) * force; moveY += Math.sin(angle) * force;
            totalDanger += force;
        }
    }

    if (totalDanger < 3.0) {
        let nearestGem: Gem | Pickup | null = null;
        let minGemDist = Infinity;
        for (const pick of s.pickups) { if (!pick.active) continue; const dist = Utils.dist(p.x, p.y, pick.x, pick.y); if (dist < minGemDist) { minGemDist = dist; nearestGem = pick; } }
        if (!nearestGem) { for (const g of s.gems) { if (!g.active) continue; const dist = Utils.dist(p.x, p.y, g.x, g.y); if (dist < minGemDist) { minGemDist = dist; nearestGem = g; } } }
        if (nearestGem) {
            const angle = Math.atan2(nearestGem.y - p.y, nearestGem.x - p.x);
            const pullStrength = totalDanger < 1.0 ? 1.5 : 0.5;
            moveX += Math.cos(angle) * pullStrength; moveY += Math.sin(angle) * pullStrength;
        }
    }

    const margin = 100;
    if (p.x < margin) moveX += 2; if (p.x > s.width - margin) moveX -= 2;
    if (p.y < margin) moveY += 2; if (p.y > s.height - margin) moveY -= 2;
    const len = Math.hypot(moveX, moveY);
    if (len > 1) { moveX /= len; moveY /= len; } else if (len > 0.1) { } else { moveX = 0; moveY = 0; }

    let aimAngle = p.angle;
    if (!nearestEnemy) {
        for (const e of s.enemies) {
            if (!e.active || e.dead || e.type === 'projectile') continue;
            const dist = Utils.dist(p.x, p.y, e.x, e.y);
            if (dist < minEnemyDist) { minEnemyDist = dist; nearestEnemy = e; }
        }
    }

    if (nearestEnemy) {
        const weaponConfig = CONFIG.WEAPONS[p.weapon];
        const bulletSpeed = weaponConfig.speed;
        const dist = minEnemyDist;
        const timeToHit = dist / bulletSpeed;
        const futureX = nearestEnemy.x + nearestEnemy.vx * timeToHit;
        const futureY = nearestEnemy.y + nearestEnemy.vy * timeToHit;
        aimAngle = Math.atan2(futureY - p.y, futureX - p.x);
    } else { aimAngle = s.frame * 0.05; }

    const dash = (totalDanger > 4.0 || (p.hp < p.maxHp * 0.3 && totalDanger > 1.0));
    const ult = (s.enemies.length > 20 && s.overdrive >= 100);
    return { mx: moveX, my: moveY, aimAngle: aimAngle, shoot: !!nearestEnemy, dash, ult };
}

interface GameCallbacks {
    onLevelUp: (options: UpgradeOption[]) => void;
    onGameOver: (runData: RunData) => void;
    onBossSpawn: () => void;
    onWeaponEvolve: (name: string) => void;
    playSound: (type: SoundType) => void;
    setAudioIntensity: (val: number) => void;
}

export function updateGame(s: GameState, callbacks: GameCallbacks) {
    const enemyStress = Math.min(1, s.enemies.length / 30);
    const healthStress = 1 - (s.player.hp / s.player.maxHp);
    const bossStress = s.bossActive ? 0.3 : 0;
    const intensity = Math.min(1, enemyStress * 0.6 + healthStress * 0.3 + bossStress);
    callbacks.setAudioIntensity(intensity);

    const load = s.enemies.length + s.bullets.length * 0.3 + s.particles.length * 0.15;
    let q = 'LOW';
    if (load < CONFIG.QUALITY.LOAD_THRESHOLDS.HIGH_MAX) q = 'HIGH';
    else if (load < CONFIG.QUALITY.LOAD_THRESHOLDS.MEDIUM_MAX) q = 'MEDIUM';
    if (q !== s.quality) { s.quality = q; s.qualitySettings = CONFIG.QUALITY.TIERS[q]; }
    
    s.timeScale = Utils.lerp(s.timeScale, 1, 0.05);
    s.runDuration = Math.floor((Date.now() - s.startTime) / 1000);
    if (s.comboTimer > 0) { s.comboTimer--; if (s.comboTimer === 0) s.combo = 0; }
    if (s.shake > 0) { s.shake *= 0.9; if (s.shake < 0.1) s.shake = 0; }
    if (s.screenFlash > 0) { s.screenFlash -= 0.03; if(s.screenFlash < 0) s.screenFlash = 0; }

    const step = s.quality === 'LOW' ? 3 : s.quality === 'MEDIUM' ? 2 : 1;
    if (s.frame % step === 0) { s.spatialGrid.clear(); for (const e of s.enemies) if (e.active) s.spatialGrid.insert(e); }
    // Update Ether Grid
    s.visualGrid.update(s.qualitySettings.gridStep);

    const p = s.player;
    if (p.hitFlash > 0) p.hitFlash--;
    if (p.muzzleFlash > 0) p.muzzleFlash--;
    
    // ... [Input and Movement logic mostly same] ...
    let mx = 0, my = 0;
    let autoShooting = false; let autoDash = false; let autoUlt = false;

    if (s.autoMode) {
        const ai = calculateAutoPilot(s);
        mx = ai.mx; my = ai.my; p.angle = ai.aimAngle;
        autoShooting = ai.shoot; autoDash = ai.dash; autoUlt = ai.ult;
    } else {
        if (s.keys.w || s.keys.ArrowUp) my -= 1;
        if (s.keys.s || s.keys.ArrowDown) my += 1;
        if (s.keys.a || s.keys.ArrowLeft) mx -= 1;
        if (s.keys.d || s.keys.ArrowRight) mx += 1;
        Object.values(s.touches).forEach(t => {
          if (t.type === 'move') {
            const dx = t.x - t.originX, dy = t.y - t.originY;
            const ang = Math.atan2(dy, dx);
            const dist = Math.min(50, Utils.dist(0, 0, dx, dy)) / 50;
            mx += Math.cos(ang) * dist; my += Math.sin(ang) * dist;
          }
        });
        const mag = Math.hypot(mx, my);
        if (mag > 1) { mx /= mag; my /= mag; }
        p.angle = Math.atan2(s.mouse.y - p.y, s.mouse.x - p.x);
        Object.values(s.touches).forEach(t => {
            if (t.type === 'aim') { const dx = t.x - t.originX, dy = t.y - t.originY; if (Math.hypot(dx, dy) > 10) { p.angle = Math.atan2(dy, dx); } }
        });
    }

    const speed = CONFIG.PLAYER.BASE_SPEED * p.stats.speedMod;
    p.vx += mx * speed; p.vy += my * speed;
    p.vx *= CONFIG.PLAYER.ACCELERATION; p.vy *= CONFIG.PLAYER.ACCELERATION;
    p.x = Utils.clamp(p.x + p.vx * s.timeScale, 0, s.width);
    p.y = Utils.clamp(p.y + p.vy * s.timeScale, 0, s.height);

    // Record Trail (Temporal Echo)
    if (s.frame % 3 === 0) {
        p.trail.unshift({ x: p.x, y: p.y, angle: p.angle });
        if (p.trail.length > 8) p.trail.pop();
    }

    // INJECT PLAYER VELOCITY INTO FLUID
    if (Math.abs(p.vx) > 0.1 || Math.abs(p.vy) > 0.1) {
        s.visualGrid.addVelocity(p.x, p.y, p.vx * 3, p.vy * 3);
    }

    // Engine Particles
    if (Math.hypot(p.vx, p.vy) > 0.5 && s.frame % 3 === 0) {
        const backAngle = p.angle + Math.PI;
        const spawnThruster = (offsetAng: number) => {
            const tAng = backAngle + offsetAng;
            const px = p.x + Math.cos(tAng) * 20;
            const py = p.y + Math.sin(tAng) * 20;
            const pvx = Math.cos(backAngle) * Utils.rand(2, 4);
            const pvy = Math.sin(backAngle) * Utils.rand(2, 4);

            if(s.particleSystem) {
                s.particleSystem.spawn(px, py, {
                    vx: pvx, vy: pvy,
                    life: 15, color: '#00f3ff', size: Utils.rand(2, 5), type: 'glow'
                });
            }

            // Thrusters add colored fluid density
            s.visualGrid.addDensity(px, py, 30, '#00f3ff');
            s.visualGrid.addVelocity(px, py, pvx * 2, pvy * 2);
        };
        spawnThruster(0.4); spawnThruster(-0.4);
    }
    
    let shooting = false;
    if (s.autoMode) { shooting = autoShooting; } else {
        shooting = s.mouse.down;
        Object.values(s.touches).forEach(t => { if (t.type === 'aim') { const dx = t.x - t.originX, dy = t.y - t.originY; if (Math.hypot(dx, dy) > 10) shooting = true; } });
    }

    // Ult Logic
    const triggerUlt = s.autoMode ? autoUlt : (s.keys.f && s.overdrive >= 100);
    if (triggerUlt && s.overdrive >= 100) {
        s.overdrive = 0; callbacks.playSound('ultimate'); createShockwave(s, p.x, p.y, 1500, CONFIG.COLORS.ULTIMATE, 25); s.shake = 30;
        // Warp the Ether on Ult
        s.visualGrid.applyForce(p.x, p.y, 600, 200);
        s.bullets.forEach(b => { s.pools.bullets.release(b); }); s.bullets = [];
        for (const e of s.enemies) {
            if(e.active) {
                e.hp -= 200; e.hitFlash = 10;
                const ang = Math.atan2(e.y - p.y, e.x - p.x); e.vx += Math.cos(ang) * 20; e.vy += Math.sin(ang) * 20;
                if(e.hp <= 0 && !e.dead) {
                     e.dead = true; s.waveKills++; s.combo++; s.comboTimer = CONFIG.PROGRESSION.COMBO_DURATION; s.score += e.score; createGem(s, e.x, e.y, e.xp); createExplosion(s, e.x, e.y, e.color, 20); createDebris(s, e.x, e.y, e.color, e.size);
                }
            }
        }
    }

    // Dash Logic
    const triggerDash = s.autoMode ? autoDash : (s.keys.space || s.keys.shift);
    if (triggerDash && p.dashCd <= 0) {
      callbacks.playSound('dash'); p.dashCd = p.maxDashCd; p.invuln = CONFIG.PLAYER.DASH.INVULN_DURATION;
      let dmx = 0, dmy = 0;
      if(s.autoMode) {
          dmx = mx; dmy = my;
          if(dmx === 0 && dmy === 0) { dmx = -Math.cos(p.angle); dmy = -Math.sin(p.angle); } else { const m = Math.hypot(dmx, dmy) || 1; dmx /= m; dmy /= m; }
      } else {
          if (s.keys.w || s.keys.ArrowUp) dmy -= 1; if (s.keys.s || s.keys.ArrowDown) dmy += 1; if (s.keys.a || s.keys.ArrowLeft) dmx -= 1; if (s.keys.d || s.keys.ArrowRight) dmx += 1;
          if (dmx === 0 && dmy === 0) { dmx = Math.cos(p.angle); dmy = Math.sin(p.angle); } else { const m = Math.hypot(dmx, dmy) || 1; dmx /= m; dmy /= m; }
      }
      p.vx = dmx * CONFIG.PLAYER.DASH.SPEED; p.vy = dmy * CONFIG.PLAYER.DASH.SPEED;
      // Dash Wake in Fluid
      s.visualGrid.addVelocity(p.x, p.y, p.vx * 4, p.vy * 4);
      s.visualGrid.addDensity(p.x, p.y, 150, CONFIG.COLORS.PLAYER_DASH);
      
      createShockwave(s, p.x, p.y, 200, CONFIG.COLORS.PLAYER_DASH, 10);
      for (let i = 0; i < 5; i++) {
          if (s.particleSystem) {
              s.particleSystem.spawn(p.x - dmx * i * 5, p.y - dmy * i * 5, {
                  vx: 0, vy: 0, life: 20, color: 'rgba(0, 243, 255, 0.4)', size: 10, type: 'ghost', rotation: p.angle
              });
          }
      }
    }
    if (p.cd > 0) p.cd--; if (p.dashCd > 0) p.dashCd--; if (p.invuln > 0) p.invuln--;

    if (shooting && p.cd <= 0) {
      callbacks.playSound('shoot'); p.muzzleFlash = 3; 
      const arch = CONFIG.WEAPONS[p.weapon];
      const baseDmg = 10 * p.stats.damageMod * arch.dmgMult;
      const fireBullet = (angleOffset: number) => {
        const bullet = s.pools.bullets.acquire();
        if (!bullet) return;
        const finalAngle = p.angle + angleOffset;
        bullet.id = Utils.uid('b'); bullet.x = p.x + Math.cos(finalAngle) * 15; bullet.y = p.y + Math.sin(finalAngle) * 15;
        bullet.vx = Math.cos(finalAngle) * arch.speed; bullet.vy = Math.sin(finalAngle) * arch.speed;
        bullet.life = arch.lifetime; bullet.color = arch.color; bullet.dmg = baseDmg;
        bullet.pierce = (arch.pierce || 0) + p.stats.pierce; bullet.homing = Math.max(arch.homing || 0, p.stats.homing);
        bullet.size = arch.size || 3; bullet.active = true;
        s.bullets.push(bullet);
      };
      fireBullet(Utils.rand(-arch.spread, arch.spread));
      const count = (arch.count || 1) + p.stats.multishot;
      for (let i = 1; i < count; i++) { const spread = (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2) * (arch.spread || 0.1); fireBullet(spread); }
      p.cd = Math.max(2, 20 / p.stats.fireRateMod * arch.fireDelay);
      s.shake = arch.name === 'Rail Driver' ? 5 : 2;
      p.vx -= Math.cos(p.angle) * 0.8; p.vy -= Math.sin(p.angle) * 0.8;
    }

    // --- AI CONTEXT CONSTRUCTION (Optimized) ---
    const aiContext: AIContext = {
        gameState: s,
        spawnProjectile: (x, y, vx, vy, type, color, size) => {
            const proj = s.pools.enemies.acquire();
            if (proj) {
                proj.id = Utils.uid('proj');
                proj.x = x; proj.y = y; proj.vx = vx; proj.vy = vy;
                proj.type = type; proj.size = size; proj.color = color;
                proj.life = 120; proj.hp = 1; proj.active = true;
                s.enemies.push(proj);
            }
        },
        spawnEnemy: (x, y, type) => {
             const e = s.pools.enemies.acquire();
             if (e) {
                // Simplified spawn for summoned units
                const cfg = CONFIG.ENEMIES[type.toUpperCase()] || CONFIG.ENEMIES.CHASER;
                e.id = Utils.uid('sum'); e.x = x; e.y = y; e.vx = 0; e.vy = 0;
                e.hp = cfg.hp + s.wave * cfg.hpScale; e.maxHp = e.hp;
                e.type = type; e.speed = cfg.speed; e.size = cfg.size; e.color = cfg.color;
                e.isElite = false; e.xp = 1; e.score = 10; e.active = true; e.dead = false;
                s.enemies.push(e);
             }
        },
        spawnExplosion: (x, y, color, size) => createExplosion(s, x, y, color, Math.floor(size), 1.0),
        spawnShockwave: (x, y, size, color) => createShockwave(s, x, y, size, color, 5),
        playSound: callbacks.playSound
    };

    // UPDATE ENTITIES
    for (let i = s.enemies.length - 1; i >= 0; i--) {
      const e = s.enemies[i];
      if (!e.active || e.dead) continue;

      // 1. Update Animations
      if (e.hitFlash > 0) e.hitFlash--;
      if (e.spawnAnim < 1) e.spawnAnim = Math.min(1, e.spawnAnim + 0.05);

      // 2. Projectile Physics (Simple Linear)
      if (e.type === 'projectile') {
         e.x += e.vx * s.timeScale;
         e.y += e.vy * s.timeScale;
         e.life--;
         if (e.life <= 0 || !Utils.inBounds(e.x, e.y, s.width, s.height, 100)) e.dead = true;
      }
      // 3. AI Behavior (Delegated)
      else {
         updateEnemyAI(e, aiContext);

         // Apply Velocity (Physics Step)
         e.x += e.vx * s.timeScale;
         e.y += e.vy * s.timeScale;

         // Bounds Check (Soft Bounce)
         const margin = e.size;
         if (e.x < margin) { e.x = margin; e.vx *= -0.5; }
         if (e.x > s.width - margin) { e.x = s.width - margin; e.vx *= -0.5; }
         if (e.y < margin) { e.y = margin; e.vy *= -0.5; }
         if (e.y > s.height - margin) { e.y = s.height - margin; e.vy *= -0.5; }

         // Physics: Update Tentacles
         if (e.tentacles && e.tentacles.length > 0) {
            const drag = s.visualGrid ? 0.9 : 0.95; // More drag in "empty" space vs fluid? Actually fluid should have more drag but we simulate flow separately.
            e.tentacles.forEach(t => Physics.updateTentacle(t, e.x, e.y, drag));
         }
      }

      // 4. Player Collision
      if (p.invuln <= 0 && e.type !== 'projectile' && Utils.dist(e.x, e.y, p.x, p.y) < e.size + CONFIG.PLAYER.COLLISION_RADIUS) {
          const damage = e.type === 'boss' ? 40 : 15;
          p.hp -= damage;
          s.shake = 15;
          p.invuln = CONFIG.PLAYER.INVULN_ON_HIT;
          p.hitFlash = 10;
          s.combo = 0;
          s.comboTimer = 0;
          callbacks.playSound('hit');
          createShockwave(s, p.x, p.y, 100, '#ff0000', 10);

          if (p.hp <= 0) {
              s.gameOver = true;
              callbacks.playSound('gameover');
              const runData = {
                  score: Math.floor(s.score),
                  wave: s.wave,
                  level: p.level,
                  duration: s.runDuration,
                  upgrades: Array.from(s.upgradeStacks.entries()).map(([id, count]) => ({ id, count })),
                  weapon: p.weapon
              };
              callbacks.onGameOver(runData);
          }
      }
    }
    
    // Cleanup Logic
    for (let i = s.enemies.length - 1; i >= 0; i--) { const e = s.enemies[i]; if (e.dead || !e.active) { s.pools.enemies.release(e); s.enemies.splice(i, 1); } }
    for(let i=s.pickups.length-1; i>=0; i--) { const pick = s.pickups[i]; const dist = Utils.dist(pick.x, pick.y, p.x, p.y); if (dist < 150) { pick.x += (p.x - pick.x) * 0.05; pick.y += (p.y - pick.y) * 0.05; } if (dist < 30) { if(pick.type === 'heal') { p.hp = Math.min(p.maxHp, p.hp + CONFIG.PICKUPS.HEAL_AMOUNT); createFloatingText(s, p.x, p.y, `+${CONFIG.PICKUPS.HEAL_AMOUNT} HP`, '#00ff00', 20); callbacks.playSound('pickup'); } s.pools.pickups.release(pick); s.pickups.splice(i, 1); } else { pick.life--;
    // Pickups drift with fluid
    const fv = s.visualGrid.getVelocityAt(pick.x, pick.y);
    pick.x += fv.vx * 2; pick.y += fv.vy * 2;
    if(pick.life <= 0) { s.pools.pickups.release(pick); s.pickups.splice(i, 1); } } }
    
    // Bullet Update Loop
    for (let bi = s.bullets.length - 1; bi >= 0; bi--) { 
        const b = s.bullets[bi]; if (!b.active) continue;
        
        // Bullets drag the ether
        s.visualGrid.addVelocity(b.x, b.y, b.vx * 0.3, b.vy * 0.3);
        
        if (b.homing > 0 && s.quality !== 'LOW') { let target = null, minD = 400; const nearby = s.spatialGrid.queryRadius(b.x, b.y, 400); for (const e of nearby) { if (e.type === 'projectile' || !e.active) continue; const d = Utils.dist(b.x, b.y, e.x, e.y); if (d < minD) { minD = d; target = e; } } if (target) { const wantAng = Math.atan2(target.y - b.y, target.x - b.x); const currAng = Math.atan2(b.vy, b.vx); const diff = Utils.angleDiff(currAng, wantAng); const newAng = currAng + diff * b.homing; const spd = Math.hypot(b.vx, b.vy); b.vx = Math.cos(newAng) * spd; b.vy = Math.sin(newAng) * spd; } } 
        b.x += b.vx * s.timeScale; b.y += b.vy * s.timeScale; b.life--;

        // --- BALLISTIC CAVITATION & SINGULARITY PHYSICS ---
        const speed = Math.hypot(b.vx, b.vy);
        if (s.visualGrid) {
            if (s.player.weapon === 'RAILGUN') {
                // Fissure Effect: Extreme lateral force
                const normX = -b.vy / speed; const normY = b.vx / speed;
                s.visualGrid.addVelocity(b.x, b.y, normX * 100, normY * 100);
                s.visualGrid.addDensity(b.x, b.y, 20, '#00ffff'); // Ionize path
            } else if (s.player.weapon === 'VOID') {
                // Singularity: Sucks density IN
                s.visualGrid.applyForce(b.x, b.y, 50, -20); // Negative strength = suck
                s.visualGrid.addDensity(b.x, b.y, 10, '#aa00ff');
                // Pull Boids (Pseudo-Gravity)
                const nearby = s.spatialGrid.queryRadius(b.x, b.y, 150);
                for(const e of nearby) {
                    if (e.active && e.type !== 'projectile') {
                        const ang = Math.atan2(b.y - e.y, b.x - e.x);
                        e.vx += Math.cos(ang) * 2; e.vy += Math.sin(ang) * 2;
                    }
                }
            } else if (speed > 10) {
                // Normal Cavitation
                s.visualGrid.applyForce(b.x, b.y, 20, speed * 0.5);
                s.visualGrid.removeDensity(b.x, b.y, 10);
            }
        }

        if (b.life <= 0 || !Utils.inBounds(b.x, b.y, s.width, s.height, 50)) { s.pools.bullets.release(b); s.bullets.splice(bi, 1); continue; }
        const candidates = s.spatialGrid.queryRadius(b.x, b.y, 50); let hitEnemy = false; 
        for (const e of candidates) { 
            if (e.type === 'projectile' || e.dead || !e.active) continue; 
            if (Utils.dist(b.x, b.y, e.x, e.y) < e.size + b.size) { 
                e.hp -= b.dmg; e.hitFlash = 3; createExplosion(s, b.x, b.y, b.color, 3, 0.5); createFloatingText(s, e.x, e.y - 20, Math.floor(b.dmg).toString(), b.color, 14); 
                if (b.pierce <= 0) hitEnemy = true; else b.pierce--; 
                if (e.hp <= 0 && !e.dead) { 
                    e.dead = true; s.waveKills++; s.combo++; s.comboTimer = CONFIG.PROGRESSION.COMBO_DURATION; s.overdrive = Math.min(100, s.overdrive + (e.isElite ? 15 : 4)); 
                    const comboBonus = 1 + s.combo * CONFIG.PROGRESSION.COMBO_BONUS; s.score += e.score * comboBonus; createGem(s, e.x, e.y, e.xp); callbacks.playSound('explosion'); 
                    createExplosion(s, e.x, e.y, e.color, e.isElite ? 25 : 15, e.isElite ? 2 : 1.2); 
                    createDebris(s, e.x, e.y, e.color, e.size); // Debris on death
                    // Explosion DYES the Ether
                    if (s.visualGrid) {
                        s.visualGrid.applyForce(e.x, e.y, e.size * 4, 30);
                        s.visualGrid.addDensity(e.x, e.y, e.size * 5, e.color);
                    }
                    
                    if (e.affixes.includes('SPLITTER')) { const count = CONFIG.AFFIXES.SPLITTER.count; for(let k=0; k<count; k++) { const m = s.pools.enemies.acquire(); if (m) { const a = (Math.PI*2/count)*k; m.id = Utils.uid('split'); m.x = e.x; m.y = e.y; m.vx = Math.cos(a)*4; m.vy = Math.sin(a)*4; m.hp = e.maxHp * 0.3; m.maxHp = m.hp; m.type = 'chaser'; m.speed = e.speed * 1.5; m.size = e.size * 0.6; m.color = CONFIG.AFFIXES.SPLITTER.color; m.active = true; m.dead = false; s.enemies.push(m); } } } 
                    if (e.isElite && Math.random() < 0.6) { createPickup(s, e.x, e.y); } 
                    if (e.type === 'boss') { s.bossActive = false; s.wave++; s.waveKills = 0; s.waveQuota = Math.ceil(s.waveQuota * CONFIG.SPAWNING.QUOTA_MULTIPLIER); s.spawnTimer = 0; s.timeScale = 0.2; createFloatingText(s, e.x, e.y - 60, 'VICTORY', '#ffff00', 40); } 
                } 
                if (hitEnemy) break; 
            } 
        } 
        if (hitEnemy) { s.pools.bullets.release(b); s.bullets.splice(bi, 1); } 
    }
    
    // Update Shards (Physics Debris)
    for (let i = s.shards.length - 1; i >= 0; i--) {
        const shard = s.shards[i];
        if (!shard.active) continue;

        // Fluid Drag
        const fv = s.visualGrid.getVelocityAt(shard.x, shard.y);
        shard.vx = shard.vx * 0.95 + fv.vx * 2;
        shard.vy = shard.vy * 0.95 + fv.vy * 2;

        shard.x += shard.vx * s.timeScale;
        shard.y += shard.vy * s.timeScale;
        shard.rotation += shard.rotationSpeed * s.timeScale;

        shard.life -= s.timeScale;

        if (shard.life <= 0) {
            s.pools.shards.release(shard);
            s.shards.splice(i, 1);
        }
    }

    // ... [Rest of update loops unchanged] ...
    for (let i = s.gems.length - 1; i >= 0; i--) { const g = s.gems[i]; if (!g.active) continue; const d = Utils.dist(g.x, g.y, p.x, p.y); if (d < p.stats.magnetRange) { g.vx += (p.x - g.x) * CONFIG.GEMS.PULL_STRENGTH; g.vy += (p.y - g.y) * CONFIG.GEMS.PULL_STRENGTH; } g.x += g.vx; g.y += g.vy; g.vx *= CONFIG.GEMS.FRICTION; g.vy *= CONFIG.GEMS.FRICTION; g.life--;
    // Gems drift with fluid
    const fv = s.visualGrid.getVelocityAt(g.x, g.y); g.vx += fv.vx * 1.0; g.vy += fv.vy * 1.0;
    if (d < CONFIG.GEMS.COLLECT_RADIUS) { p.xp += g.val; if (p.xp >= p.xpToNext) { p.xp -= p.xpToNext; p.level++; p.xpToNext = Math.floor(p.xpToNext * CONFIG.PROGRESSION.XP_SCALE); s.paused = true; callbacks.playSound('levelup'); const pool: UpgradeOption[] = []; UPGRADES.forEach(u => { const current = s.upgradeStacks.get(u.id) || 0; if (current < u.maxStack) { const weight = Math.max(0.1, u.weight - current * 0.1); for (let k = 0; k < weight * 10; k++) pool.push({ ...u, currentStack: current }); } }); const options: UpgradeOption[] = []; if (pool.length > 0) { while (options.length < 3 && pool.length > 0) { const idx = Math.floor(Math.random() * pool.length); const pick = pool[idx]; if (!options.find(o => o.id === pick.id)) options.push(pick); for (let z = pool.length - 1; z >= 0; z--) if (pool[z].id === pick.id) pool.splice(z, 1); } callbacks.onLevelUp(options); } else { s.paused = false; } } s.pools.gems.release(g); s.gems.splice(i, 1); } else if (g.life <= 0) { s.pools.gems.release(g); s.gems.splice(i, 1); } }

    // UPDATE PARTICLE SYSTEM (New)
    if (s.particleSystem) s.particleSystem.update(s);
    // UPDATE MPM SYSTEM (New)
    if (s.mpmSystem) s.mpmSystem.update();

    for (let i = s.shockwaves.length - 1; i >= 0; i--) { const sw = s.shockwaves[i]; sw.size += sw.speed * s.timeScale; sw.alpha -= 0.03 * s.timeScale; if (sw.alpha <= 0) s.shockwaves.splice(i, 1); }
    for (const o of s.orbitals) { o.angle += 0.05; const ox = p.x + Math.cos(o.angle) * o.dist; const oy = p.y + Math.sin(o.angle) * o.dist; for (const e of s.enemies) { if (e.type === 'projectile' || e.dead || !e.active) continue; if (Utils.dist(ox, oy, e.x, e.y) < e.size + 10) { e.hp -= 2; e.hitFlash = 2; createExplosion(s, e.x, e.y, '#00ffff', 1, 0.5); } } }
    for (let i = s.texts.length - 1; i >= 0; i--) { const t = s.texts[i]; t.x += t.vx * s.timeScale; t.y += t.vy * s.timeScale; t.vy += 0.1 * s.timeScale; t.life -= s.timeScale; if (t.life <= 0) s.texts.splice(i, 1); }
    
    // --- DIRECTOR AI (SPAWNING) ---
    if (!s.bossActive) {
        const waveComplete = s.waveKills >= s.waveQuota;
        if (waveComplete) {
            if (s.enemies.length === 0) {
                if (s.wave % CONFIG.SPAWNING.BOSS_INTERVAL === 0) {
                    callbacks.onBossSpawn();
                    s.bossActive = true;
                    const boss = s.pools.enemies.acquire(); 
                    if (boss) {
                        const cfg = CONFIG.ENEMIES.BOSS;
                        const hp = cfg.hp + s.wave * cfg.hpScale;
                        boss.id = Utils.uid('boss'); boss.x = s.width / 2; boss.y = -200;
                        boss.vx = 0; boss.vy = 0; boss.hp = hp; boss.maxHp = hp;
                        boss.type = 'boss'; boss.speed = cfg.speed; boss.size = cfg.size; boss.color = cfg.color;
                        boss.phase = 0; boss.attackTimer = 0; boss.xp = cfg.xp; boss.score = cfg.score;
                        boss.active = true; boss.dead = false;
                        s.enemies.push(boss);
                        createShockwave(s, s.width / 2, s.height / 2, 2000, cfg.color, 5);
                        callbacks.playSound('spawn');
                    }
                } else {
                    s.wave++; s.waveKills = 0; s.waveQuota = Math.ceil(s.waveQuota * CONFIG.SPAWNING.QUOTA_MULTIPLIER);
                    s.spawnRate = Math.max(CONFIG.SPAWNING.MIN_RATE, s.spawnRate * CONFIG.SPAWNING.RATE_DECAY);
                    callbacks.playSound('levelup');
                    createFloatingText(s, s.width/2, s.height/3, `WAVE ${s.wave}`, '#fff', 40);
                }
            }
        } else {
            // DELEGATE TO DIRECTOR
            Director.update(s, (x, y, type, isElite) => {
                const e = s.pools.enemies.acquire();
                if (!e) return;

                const typeKey = type.toUpperCase();
                const cfg = CONFIG.ENEMIES[typeKey] || CONFIG.ENEMIES.CHASER;

                const hp = cfg.hp + s.wave * cfg.hpScale;
                const speed = cfg.speed + s.wave * cfg.speedScale;

                e.id = Utils.uid('e'); e.x = x; e.y = y; e.vx = 0; e.vy = 0;
                e.hp = isElite ? hp * CONFIG.ELITE.HP_MULT : hp; e.maxHp = e.hp;
                e.type = type.toLowerCase();
                e.speed = isElite ? speed * CONFIG.ELITE.SPEED_MULT : speed;
                e.size = isElite ? cfg.size * CONFIG.ELITE.SIZE_MULT : cfg.size;
                e.color = isElite ? CONFIG.ELITE.COLOR : cfg.color; e.isElite = isElite;
                e.xp = isElite ? cfg.xp * CONFIG.ELITE.XP_MULT : cfg.xp;
                e.score = isElite ? cfg.score * CONFIG.ELITE.SCORE_MULT : cfg.score;
                e.shootTimer = 0; e.active = true; e.dead = false; e.phase = 0; e.hitFlash = 0;
                e.affixes = []; e.affixTimer = 0; e.spawnAnim = 0;
                e.tentacles = [];

                // Procedurally add tentacles based on type
                if (typeKey === 'CHASER' || typeKey === 'KAMIKAZE') {
                    // Tail
                    e.tentacles.push(Physics.createTentacle(x, y, 40, 5, 0.2));
                } else if (typeKey === 'BOSS') {
                    // Multiple tentacles
                    for(let k=0; k<6; k++) e.tentacles.push(Physics.createTentacle(x, y, 100, 10, 0.1));
                }

                if (isElite && s.wave >= 3) {
                    const affixRoll = Math.random();
                    if (affixRoll < 0.2) e.affixes.push('VORTEX');
                    else if (affixRoll < 0.4) e.affixes.push('REPULSOR');
                    else if (affixRoll < 0.6) e.affixes.push('SPLITTER');
                    else if (affixRoll < 0.8) e.affixes.push('WARP');
                    else e.affixes.push('REGEN');
                }
                s.enemies.push(e);
            });
        }
    }
}
