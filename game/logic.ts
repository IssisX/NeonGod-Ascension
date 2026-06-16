import { CONFIG, UPGRADES } from '../constants';
import { GameState, Player, UpgradeOption, RunData, Enemy, Bullet, Particle, Gem, SoundType, Pickup, EnemyAffix } from '../types';
import { Utils } from '../utils';
import { SpatialGrid, VisualGrid } from './grids';

// --- POOLS & FACTORIES ---
// (Kept streamlined for performance)
export const Factories = {
  bullet: () => ({ id: '', x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, color: '', dmg: 0, pierce: 0, homing: 0, size: 3, active: false, behavior: 'STRAIGHT', behaviorParams: {}, originX: 0, originY: 0, angle: 0 }),
  resetBullet: (b: any) => { 
      b.id = ''; b.x = 0; b.y = 0; b.vx = 0; b.vy = 0; b.life = 0; b.maxLife = 0; b.color = ''; b.dmg = 0; 
      b.pierce = 0; b.homing = 0; b.size = 3; b.active = false; 
      b.behavior = 'STRAIGHT'; b.behaviorParams = {}; b.originX = 0; b.originY = 0; b.angle = 0;
  },
  enemy: () => ({ id: '', x: 0, y: 0, vx: 0, vy: 0, hp: 0, maxHp: 0, type: 'chaser', speed: 0, size: 0, color: '', isElite: false, affixes: [], affixTimer: 0, xp: 0, score: 0, shootTimer: 0, attackTimer: 0, phase: 0, dead: false, active: false, life: 0, hitFlash: 0, rotation: 0, spawnAnim: 0, kind: 'enemy' }),
  resetEnemy: (e: any) => { e.id = ''; e.x = 0; e.y = 0; e.vx = 0; e.vy = 0; e.hp = 0; e.maxHp = 0; e.type = 'chaser'; e.speed = 0; e.size = 0; e.color = ''; e.isElite = false; e.affixes = []; e.affixTimer = 0; e.xp = 0; e.score = 0; e.shootTimer = 0; e.attackTimer = 0; e.phase = 0; e.dead = false; e.active = false; e.life = 0; e.hitFlash = 0; e.rotation = 0; e.spawnAnim = 0; e.kind = 'enemy'; },
  particle: () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, color: '', size: 0, friction: 0.92, type: 'glow', active: false, rotation: 0, rotationSpeed: 0, polyPoints: [] }),
  resetParticle: (p: any) => { 
      p.x = 0; p.y = 0; p.vx = 0; p.vy = 0; p.life = 0; p.maxLife = 0; p.color = ''; p.size = 0; 
      p.friction = 0.92; p.type = 'glow'; p.active = false; p.rotation = 0; p.rotationSpeed = 0; p.polyPoints = []; 
  },
  gem: () => ({ x: 0, y: 0, vx: 0, vy: 0, val: 0, life: 0, active: false, kind: 'gem' }),
  resetGem: (g: any) => { g.x = 0; g.y = 0; g.vx = 0; g.vy = 0; g.val = 0; g.life = 0; g.active = false; g.kind = 'gem'; },
  pickup: () => ({ x: 0, y: 0, vx: 0, vy: 0, type: 'heal', life: 0, active: false, kind: 'pickup' }),
  resetPickup: (p: any) => { p.x = 0; p.y = 0; p.vx = 0; p.vy = 0; p.type = 'heal'; p.life = 0; p.active = false; p.kind = 'pickup'; },
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
        bullets: [], enemies: [], particles: [], gems: [], pickups: [], texts: [], shockwaves: [], orbitals: [],
        keys: { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, space: false, shift: false, f: false },
        mouse: { x: width / 2, y: height / 2, down: false },
        touches: {},
        spawnTimer: 0, spawnRate: CONFIG.SPAWNING.INITIAL_RATE, bossActive: false,
        upgradeStacks: new Map(),
        pools: {
            bullets: new ObjectPool(Factories.bullet, Factories.resetBullet, CONFIG.POOLS.BULLETS.initial, CONFIG.POOLS.BULLETS.max),
            enemies: new ObjectPool(Factories.enemy, Factories.resetEnemy, CONFIG.POOLS.ENEMIES.initial, CONFIG.POOLS.ENEMIES.max),
            particles: new ObjectPool(Factories.particle, Factories.resetParticle, CONFIG.POOLS.PARTICLES.initial, CONFIG.POOLS.PARTICLES.max),
            gems: new ObjectPool(Factories.gem, Factories.resetGem, CONFIG.POOLS.GEMS.initial, CONFIG.POOLS.GEMS.max),
            pickups: new ObjectPool(Factories.pickup, Factories.resetPickup, CONFIG.POOLS.PICKUPS.initial, CONFIG.POOLS.PICKUPS.max),
        },
        spatialGrid: new SpatialGrid(CONFIG.SPATIAL.CELL_SIZE),
        visualGrid: new VisualGrid(width, height),
    };
    s.spatialGrid.resize(width, height);
    resetPlayer(s.player, width, height);
    return s;
}

// --- FRACTURE & PHYSICS HELPERS ---

const createDebris = (s: GameState, x: number, y: number, color: string, count: number, speed: number) => {
    if (s.visualGrid) s.visualGrid.applyForce(x, y, 150 * speed, 12 * speed);
    const maxCount = Math.min(count, s.qualitySettings.particles - s.particles.length);
    for (let i = 0; i < maxCount; i++) {
        const p = s.pools.particles.acquire();
        if (!p) break;
        
        const pts = [];
        const sides = Math.random() > 0.5 ? 3 : 4;
        const rad = Utils.rand(4, 10);
        for(let j=0; j<sides; j++) {
            const ang = (Math.PI * 2 / sides) * j + Utils.rand(-0.2, 0.2);
            const r = rad * Utils.rand(0.7, 1.3);
            pts.push({ x: Math.cos(ang) * r, y: Math.sin(ang) * r });
        }
        const angle = Utils.rand(0, Math.PI * 2);
        const vel = Utils.rand(2, 6) * speed;
        p.x = x; p.y = y; p.vx = Math.cos(angle) * vel; p.vy = Math.sin(angle) * vel;
        p.life = Utils.rand(30, 60); p.maxLife = 60; p.color = color;
        p.size = rad; p.friction = 0.94; p.type = 'poly'; p.polyPoints = pts;
        p.rotation = Utils.rand(0, Math.PI * 2); p.rotationSpeed = Utils.rand(-0.3, 0.3); p.active = true;
        s.particles.push(p);
    }
    const glowCount = Math.floor(count / 2);
    for (let i = 0; i < glowCount; i++) {
        const p = s.pools.particles.acquire(); if (!p) break;
        const angle = Utils.rand(0, Math.PI * 2), vel = Utils.rand(1, 4) * speed;
        p.x = x; p.y = y; p.vx = Math.cos(angle) * vel; p.vy = Math.sin(angle) * vel;
        p.life = Utils.rand(20, 40); p.maxLife = 40; p.color = color;
        p.size = Utils.rand(2, 5); p.friction = 0.9; p.type = 'glow'; p.active = true;
        s.particles.push(p);
    }
};

export const createExplosion = (s: GameState, x: number, y: number, color: string, count = 10, speed = 1) => {
    createDebris(s, x, y, color, count, speed);
};

export const createEvolutionEffect = (s: GameState, x: number, y: number, color: string) => {
    s.screenFlash = 1.0; s.flashColor = color; s.shake = 40; 
    s.shockwaves.push({ x, y, size: 20, maxSize: 1200, color: color, speed: 40, alpha: 1, width: 80 });
    if (s.visualGrid) s.visualGrid.applyForce(x, y, 800, 100);
    createFloatingText(s, x, y - 100, "EVOLUTION!", color, 40);
};

const createShockwave = (s: GameState, x: number, y: number, size: number, color: string, speed = 2) => {
    s.shockwaves.push({ x, y, size: 5, maxSize: size, color, speed, alpha: 1, width: 20 });
    if (s.visualGrid) s.visualGrid.applyForce(x, y, size / 3, speed * 25);
};

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

// --- AUTOPILOT AI ---
function calculateAutoPilot(s: GameState): { mx: number; my: number; aimAngle: number; shoot: boolean; dash: boolean; ult: boolean } {
    const p = s.player;
    let moveX = 0, moveY = 0, totalDanger = 0;
    const searchRadius = 250;
    const nearby = s.spatialGrid.queryRadius(p.x, p.y, searchRadius);
    let nearestEnemy: Enemy | null = null;
    let minEnemyDist = Infinity;

    for (const e of nearby as Enemy[]) {
        if (e.kind !== 'enemy' || !e.active || e.dead || e.type === 'projectile') continue;
        const dSq = Utils.distSq(p.x, p.y, e.x, e.y);
        const dist = Math.sqrt(dSq);
        if (dist < minEnemyDist) { minEnemyDist = dist; nearestEnemy = e; }
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
        let minGemDistSq = Infinity;
        const pickupSearchRadius = 500;
        const items = s.spatialGrid.queryRadius(p.x, p.y, pickupSearchRadius);
        for (const item of items) {
            if ((item.kind === 'gem' || item.kind === 'pickup') && item.active) {
                const dSq = Utils.distSq(p.x, p.y, item.x, item.y);
                if (dSq < minGemDistSq) {
                    minGemDistSq = dSq;
                    nearestGem = item as Gem | Pickup;
                }
            }
        }
        if (nearestGem) {
            const angle = Math.atan2(nearestGem.y - p.y, nearestGem.x - p.x);
            const pullStrength = totalDanger < 1.0 ? 1.5 : 0.5;
            moveX += Math.cos(angle) * pullStrength; moveY += Math.sin(angle) * pullStrength;
        }
    }

    const margin = 100;
    if (p.x < margin) moveX += 2; if (p.x > s.width - margin) moveX -= 2;
    if (p.y < margin) moveY += 2; if (p.y > s.height - margin) moveY -= 2;
    const lenSq = moveX * moveX + moveY * moveY;
    if (lenSq > 1) { const len = Math.sqrt(lenSq); moveX /= len; moveY /= len; } else if (lenSq < 0.01) { moveX = 0; moveY = 0; }

    let aimAngle = p.angle;
    if (!nearestEnemy) {
        // Fallback search if grid was empty (though grid is now robust)
        let minEnemyDistSq = minEnemyDist === Infinity ? Infinity : minEnemyDist * minEnemyDist;
        for (const e of s.enemies) {
            if (!e.active || e.dead || e.type === 'projectile') continue;
            const dSq = Utils.distSq(p.x, p.y, e.x, e.y);
            if (dSq < minEnemyDistSq) { minEnemyDistSq = dSq; nearestEnemy = e; }
        }
        if (nearestEnemy) minEnemyDist = Math.sqrt(minEnemyDistSq);
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

// --- MAIN GAME LOOP ---

export function updateGame(s: GameState, callbacks: GameCallbacks) {
    // 1. SELF-HEALING: Detect and fix uninitialized grids caused by resize bugs
    if (s.spatialGrid.width === 0 || s.spatialGrid.cols === 0) {
        console.warn("System: Grid uninitialized. Executing Emergency Repair Protocol.");
        s.spatialGrid.resize(s.width, s.height);
    }

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
    if (s.frame % step === 0) { 
        s.spatialGrid.clear(); 
        // Only insert active entities on screen + padding
        for (const e of s.enemies) if (e.active) s.spatialGrid.insert(e); 
        for (const g of s.gems) if (g.active) s.spatialGrid.insert(g);
        for (const pick of s.pickups) if (pick.active) s.spatialGrid.insert(pick);
    }
    s.visualGrid.update(s.qualitySettings.gridStep);

    const p = s.player;
    if (p.hitFlash > 0) p.hitFlash--;
    if (p.muzzleFlash > 0) p.muzzleFlash--;
    
    // INPUT HANDLING
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
        const magSq = mx * mx + my * my;
        if (magSq > 1) { const mag = Math.sqrt(magSq); mx /= mag; my /= mag; }
        p.angle = Math.atan2(s.mouse.y - p.y, s.mouse.x - p.x);
        Object.values(s.touches).forEach(t => {
            if (t.type === 'aim') { const dx = t.x - t.originX, dy = t.y - t.originY; if (dx * dx + dy * dy > 100) { p.angle = Math.atan2(dy, dx); } }
        });
    }

    const speed = CONFIG.PLAYER.BASE_SPEED * p.stats.speedMod;
    p.vx += mx * speed; p.vy += my * speed;
    p.vx *= CONFIG.PLAYER.ACCELERATION; p.vy *= CONFIG.PLAYER.ACCELERATION;
    p.x = Utils.clamp(p.x + p.vx * s.timeScale, 0, s.width);
    p.y = Utils.clamp(p.y + p.vy * s.timeScale, 0, s.height);

    if (Math.abs(p.vx) > 0.1 || Math.abs(p.vy) > 0.1) {
        s.visualGrid.addVelocity(p.x, p.y, p.vx * 2, p.vy * 2);
    }

    if (p.vx*p.vx + p.vy*p.vy > 0.25 && s.frame % 3 === 0) {
        const backAngle = p.angle + Math.PI;
        const spawnThruster = (offsetAng: number) => {
            const part = s.pools.particles.acquire();
            if (part) {
                const tAng = backAngle + offsetAng;
                part.x = p.x + Math.cos(tAng) * 20; part.y = p.y + Math.sin(tAng) * 20;
                part.vx = Math.cos(backAngle) * Utils.rand(2, 4); part.vy = Math.sin(backAngle) * Utils.rand(2, 4);
                part.life = 15; part.maxLife = 15; part.color = '#00f3ff'; part.size = Utils.rand(2, 5);
                part.friction = 0.9; part.type = 'glow'; part.active = true;
                s.particles.push(part);
            }
        };
        spawnThruster(0.4); spawnThruster(-0.4);
    }
    
    let shooting = false;
    if (s.autoMode) { shooting = autoShooting; } else {
        shooting = s.mouse.down;
        Object.values(s.touches).forEach(t => { if (t.type === 'aim') { const dx = t.x - t.originX, dy = t.y - t.originY; if (dx * dx + dy * dy > 100) shooting = true; } });
    }

    // Ult Logic
    const triggerUlt = s.autoMode ? autoUlt : (s.keys.f && s.overdrive >= 100);
    if (triggerUlt && s.overdrive >= 100) {
        s.overdrive = 0; callbacks.playSound('ultimate'); createShockwave(s, p.x, p.y, 1500, CONFIG.COLORS.ULTIMATE, 25); s.shake = 30;
        s.visualGrid.applyForce(p.x, p.y, 600, 100);
        s.bullets.forEach(b => { s.pools.bullets.release(b); }); s.bullets = [];
        for (const e of s.enemies) {
            if(e.active) {
                e.hp -= 200; e.hitFlash = 10;
                const ang = Math.atan2(e.y - p.y, e.x - p.x); e.vx += Math.cos(ang) * 20; e.vy += Math.sin(ang) * 20;
                if(e.hp <= 0 && !e.dead) {
                     e.dead = true; s.waveKills++; s.combo++; s.comboTimer = CONFIG.PROGRESSION.COMBO_DURATION; s.score += e.score; createGem(s, e.x, e.y, e.xp); createExplosion(s, e.x, e.y, e.color, 20);
                }
            }
        }
    }

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
      s.visualGrid.addVelocity(p.x, p.y, p.vx * 4, p.vy * 4);
      createShockwave(s, p.x, p.y, 200, CONFIG.COLORS.PLAYER_DASH, 10);
      for (let i = 0; i < 5; i++) {
        const particle = s.pools.particles.acquire();
        if (particle) {
          particle.x = p.x - dmx * i * 5; particle.y = p.y - dmy * i * 5; particle.vx = 0; particle.vy = 0; particle.life = 20; particle.maxLife = 20;
          particle.color = 'rgba(0, 243, 255, 0.4)'; particle.size = 10; particle.friction = 0; particle.type = 'ghost'; particle.active = true; particle.rotation = p.angle;
          s.particles.push(particle);
        }
      }
    }
    if (p.cd > 0) p.cd--; if (p.dashCd > 0) p.dashCd--; if (p.invuln > 0) p.invuln--;

    if (shooting && p.cd <= 0) {
      const arch = CONFIG.WEAPONS[p.weapon];
      callbacks.playSound('shoot'); p.muzzleFlash = 3;
      const baseDmg = 10 * p.stats.damageMod * arch.dmgMult;
      
      const fireBullet = (angleOffset: number) => {
        const bullet = s.pools.bullets.acquire();
        if (!bullet) return;
        const finalAngle = p.angle + angleOffset;
        bullet.id = Utils.uid('b'); 
        bullet.x = p.x + Math.cos(finalAngle) * 15; 
        bullet.y = p.y + Math.sin(finalAngle) * 15;
        bullet.vx = Math.cos(finalAngle) * arch.speed; 
        bullet.vy = Math.sin(finalAngle) * arch.speed;
        bullet.life = arch.lifetime; bullet.maxLife = arch.lifetime;
        bullet.color = arch.color; bullet.dmg = baseDmg;
        bullet.pierce = (arch.pierce || 0) + p.stats.pierce; 
        bullet.homing = Math.max(arch.homing || 0, p.stats.homing);
        bullet.size = arch.size || 3; bullet.active = true;
        bullet.originX = bullet.x; bullet.originY = bullet.y; bullet.angle = finalAngle;

        if (s.upgradeStacks.get('sineWave')) { bullet.behavior = 'SINE'; bullet.behaviorParams = { amp: 5, freq: 0.2, phase: 0 }; } 
        else if (s.upgradeStacks.get('accel')) { bullet.behavior = 'ACCEL'; bullet.vx *= 0.2; bullet.vy *= 0.2; } 
        else { bullet.behavior = 'STRAIGHT'; }
        s.bullets.push(bullet);
      };

      fireBullet(Utils.rand(-arch.spread, arch.spread));
      const count = (arch.count || 1) + p.stats.multishot;
      for (let i = 1; i < count; i++) { const spread = (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2) * (arch.spread || 0.1); fireBullet(spread); }
      p.cd = Math.max(2, 20 / p.stats.fireRateMod * arch.fireDelay);
      s.shake = arch.name === 'Rail Driver' ? 5 : 2;
      p.vx -= Math.cos(p.angle) * 0.8; p.vy -= Math.sin(p.angle) * 0.8;
    }

    // UPDATE ENTITIES
    for (let i = s.enemies.length - 1; i >= 0; i--) {
      const e = s.enemies[i];
      if (!e.active || e.dead) continue;
      if (Math.abs(e.vx) > 0.1 || Math.abs(e.vy) > 0.1) { s.visualGrid.addVelocity(e.x, e.y, e.vx * 0.5, e.vy * 0.5); }
      if (e.hitFlash > 0) e.hitFlash--;
      if (e.spawnAnim < 1) e.spawnAnim = Math.min(1, e.spawnAnim + 0.05);
      const toPlayerAng = Math.atan2(p.y - e.y, p.x - e.x);
      const distSqToPlayer = Utils.distSq(e.x, e.y, p.x, p.y);

      if (e.isElite && e.affixes.length > 0) {
          e.affixTimer++;
          for (const affix of e.affixes) {
              if (affix === 'VORTEX') { if (distSqToPlayer < CONFIG.AFFIXES.VORTEX.range ** 2) { const pull = CONFIG.AFFIXES.VORTEX.force; p.vx -= Math.cos(toPlayerAng) * pull; p.vy -= Math.sin(toPlayerAng) * pull; } }
              else if (affix === 'REPULSOR') { if (distSqToPlayer < CONFIG.AFFIXES.REPULSOR.range ** 2) { const push = CONFIG.AFFIXES.REPULSOR.force; p.vx += Math.cos(toPlayerAng) * push; p.vy += Math.sin(toPlayerAng) * push; } }
              else if (affix === 'WARP') { if (e.affixTimer > CONFIG.AFFIXES.WARP.cooldown) { e.affixTimer = 0; e.x = p.x + p.vx * 30 + Utils.rand(-50, 50); e.y = p.y + p.vy * 30 + Utils.rand(-50, 50); e.x = Utils.clamp(e.x, 50, s.width-50); e.y = Utils.clamp(e.y, 50, s.height-50); createShockwave(s, e.x, e.y, 100, CONFIG.AFFIXES.WARP.color, 10); } } 
              else if (affix === 'REGEN') { if (e.affixTimer % CONFIG.AFFIXES.REGEN.interval === 0) { e.hp = Math.min(e.maxHp, e.hp + e.maxHp * CONFIG.AFFIXES.REGEN.rate); } }
          }
      }
      
      if (e.type === 'kamikaze') {
        if (e.phase === 0) { e.rotation = toPlayerAng; e.vx += Math.cos(toPlayerAng) * 0.4; e.vy += Math.sin(toPlayerAng) * 0.4; if (distSqToPlayer < CONFIG.ENEMIES.KAMIKAZE.detectRange ** 2) { e.phase = 1; e.attackTimer = 0; callbacks.playSound('charge'); } }
        else if (e.phase === 1) { e.vx *= 0.85; e.vy *= 0.85; e.attackTimer++; e.hitFlash = Math.floor(e.attackTimer / 4) % 2 === 0 ? 1 : 0; if (e.attackTimer > 45) { e.dead = true; callbacks.playSound('explosion'); createExplosion(s, e.x, e.y, '#ff4400', 30, 2); createShockwave(s, e.x, e.y, 180, '#ffaa00', 8); s.shake = 15; if (distSqToPlayer < 120 * 120 && p.invuln <= 0) { p.hp -= 35; p.invuln = 45; p.hitFlash = 10; callbacks.playSound('hit'); } } }
      } else if (e.type === 'turret') {
         e.rotation += 0.01; if (distSqToPlayer > 160000) { e.vx += Math.cos(toPlayerAng) * 0.05; e.vy += Math.sin(toPlayerAng) * 0.05; } else { e.vx *= 0.9; e.vy *= 0.9; }
         e.shootTimer++; if (e.shootTimer >= CONFIG.ENEMIES.TURRET.shootInterval) { e.shootTimer = 0; callbacks.playSound('shoot'); for(let k=0; k<4; k++) { const proj = s.pools.enemies.acquire(); if(proj) { const ang = e.rotation + (Math.PI/2) * k; proj.id = Utils.uid('t_shot'); proj.x = e.x; proj.y = e.y; proj.vx = Math.cos(ang) * 4; proj.vy = Math.sin(ang) * 4; proj.type = 'projectile'; proj.size = 6; proj.color = '#00ffff'; proj.life = 120; proj.hp = 1; proj.active = true; s.enemies.push(proj); } } }
      } else if (e.type === 'boss') {
         e.attackTimer++; if (e.y < 150) e.y += 1.5; const phase = Math.floor(e.attackTimer / 300) % 3;
         if (phase === 0) { if (e.attackTimer % 8 === 0) { if (e.attackTimer % 32 === 0) callbacks.playSound('shoot'); const angle = e.attackTimer * 0.08; for (let k = 0; k < 3; k++) { const proj = s.pools.enemies.acquire(); if (proj) { const fa = angle + (Math.PI * 2 / 3) * k; proj.id = Utils.uid('bp'); proj.x = e.x; proj.y = e.y; proj.vx = Math.cos(fa) * 4; proj.vy = Math.sin(fa) * 4; proj.type = 'projectile'; proj.size = 6; proj.color = '#ff0000'; proj.life = 200; proj.hp = 1; proj.active = true; s.enemies.push(proj); } } } } 
         else if (phase === 1) { if (e.attackTimer % 120 === 0) { const ang = Math.atan2(p.y - e.y, p.x - e.x); e.vx = Math.cos(ang) * 12; e.vy = Math.sin(ang) * 12; callbacks.playSound('charge'); } } 
         else { if (e.attackTimer % 180 === 0) { for (let m = 0; m < 3; m++) { const minion = s.pools.enemies.acquire(); if (minion) { const sa = (Math.PI * 2 / 3) * m; minion.id = Utils.uid('min'); minion.x = e.x + Math.cos(sa) * 100; minion.y = e.y + Math.sin(sa) * 100; minion.vx = 0; minion.vy = 0; minion.hp = 30; minion.maxHp = 30; minion.type = 'chaser'; minion.speed = 3; minion.size = 12; minion.color = CONFIG.ENEMIES.CHASER.color; minion.xp = 15; minion.score = 150; minion.active = true; minion.dead = false; s.enemies.push(minion); } } } }
         e.vx *= 0.94; e.vy *= 0.94; e.x += e.vx * s.timeScale; e.y += e.vy * s.timeScale; e.x = Utils.clamp(e.x, e.size, s.width - e.size); e.y = Utils.clamp(e.y, e.size, s.height - e.size);
      } else if (e.type === 'projectile') { e.x += e.vx * s.timeScale; e.y += e.vy * s.timeScale; e.life--; if (e.life <= 0 || !Utils.inBounds(e.x, e.y, s.width, s.height, 100)) e.dead = true; }
      else if (e.type === 'shooter') { if (distSqToPlayer < 62500) { e.vx -= Math.cos(toPlayerAng) * 0.15; e.vy -= Math.sin(toPlayerAng) * 0.15; } else { e.vx += Math.cos(toPlayerAng) * 0.1; e.vy += Math.sin(toPlayerAng) * 0.1; } e.shootTimer++; if (e.shootTimer >= CONFIG.ENEMIES.SHOOTER.shootInterval && distSqToPlayer < 160000) { e.shootTimer = 0; callbacks.playSound('shoot'); const proj = s.pools.enemies.acquire(); if (proj) { proj.id = Utils.uid('es'); proj.x = e.x; proj.y = e.y; proj.vx = Math.cos(toPlayerAng) * 5; proj.vy = Math.sin(toPlayerAng) * 5; proj.type = 'projectile'; proj.size = 5; proj.color = e.color; proj.life = 150; proj.hp = 1; proj.active = true; s.enemies.push(proj); } } const spdSq = e.vx*e.vx + e.vy*e.vy; if (spdSq > e.speed*e.speed) { const spd = Math.sqrt(spdSq); e.vx = (e.vx / spd) * e.speed; e.vy = (e.vy / spd) * e.speed; } e.x += e.vx * s.timeScale; e.y += e.vy * s.timeScale; }
      else { const accel = e.type === 'tank' ? 0.15 : 0.2; e.vx += Math.cos(toPlayerAng) * accel; e.vy += Math.sin(toPlayerAng) * accel; if (s.quality !== 'LOW') { const nearby = s.spatialGrid.queryRadius(e.x, e.y, e.size * 3); const sepRangeSq = (e.size * 2) ** 2; for (const other of nearby as Enemy[]) { if (other.kind === 'enemy' && other.id !== e.id && other.type !== 'projectile' && other.active) { const dSq = Utils.distSq(e.x, e.y, other.x, other.y); if (dSq < sepRangeSq && dSq > 0) { const pa = Math.atan2(e.y - other.y, e.x - other.x); e.vx += Math.cos(pa) * 0.3; e.vy += Math.sin(pa) * 0.3; } } } } const spdSq = e.vx*e.vx + e.vy*e.vy; if (spdSq > e.speed*e.speed) { const spd = Math.sqrt(spdSq); e.vx = (e.vx / spd) * e.speed; e.vy = (e.vy / spd) * e.speed; } e.x += e.vx * s.timeScale; e.y += e.vy * s.timeScale; }
      if (e.type !== 'boss') { const spdSq = e.vx*e.vx + e.vy*e.vy; if (spdSq > e.speed*e.speed) { const spd = Math.sqrt(spdSq); e.vx = (e.vx / spd) * e.speed; e.vy = (e.vy / spd) * e.speed; } e.x += e.vx * s.timeScale; e.y += e.vy * s.timeScale; }

      const colDist = e.size + CONFIG.PLAYER.COLLISION_RADIUS;
      if (p.invuln <= 0 && Utils.distSq(e.x, e.y, p.x, p.y) < colDist * colDist) { const damage = e.type === 'boss' ? 40 : 15; s.player.hp -= damage; s.shake = 15; s.player.invuln = CONFIG.PLAYER.INVULN_ON_HIT; s.player.hitFlash = 10; s.combo = 0; s.comboTimer = 0; callbacks.playSound('hit'); createShockwave(s, s.player.x, s.player.y, 100, '#ff0000', 10); if (s.player.hp <= 0) { s.gameOver = true; callbacks.playSound('gameover'); const runData = { score: Math.floor(s.score), wave: s.wave, level: s.player.level, duration: s.runDuration, upgrades: Array.from(s.upgradeStacks.entries()).map(([id, count]) => ({ id, count })), weapon: s.player.weapon }; callbacks.onGameOver(runData); } }
    }
    
    // Cleanup Logic
    for (let i = s.enemies.length - 1; i >= 0; i--) { const e = s.enemies[i]; if (e.dead || !e.active) { s.pools.enemies.release(e); s.enemies.splice(i, 1); } }
    for(let i=s.pickups.length-1; i>=0; i--) {
        const pick = s.pickups[i];
        const dSq = Utils.distSq(pick.x, pick.y, p.x, p.y);
        if (dSq < 150 * 150) {
            pick.x += (p.x - pick.x) * 0.05;
            pick.y += (p.y - pick.y) * 0.05;
        }
        if (dSq < 30 * 30) {
            if(pick.type === 'heal') {
                p.hp = Math.min(p.maxHp, p.hp + CONFIG.PICKUPS.HEAL_AMOUNT);
                createFloatingText(s, p.x, p.y, `+${CONFIG.PICKUPS.HEAL_AMOUNT} HP`, '#00ff00', 20);
                callbacks.playSound('pickup');
            }
            s.pools.pickups.release(pick);
            s.pickups.splice(i, 1);
        } else {
            pick.life--;
            if(pick.life <= 0) {
                s.pools.pickups.release(pick);
                s.pickups.splice(i, 1);
            }
        }
    }
    
    // 2. PHYSICS UPGRADE: BALLISTICS UPDATE WITH CCD
    for (let bi = s.bullets.length - 1; bi >= 0; bi--) { 
        const b = s.bullets[bi]; if (!b.active) continue;
        s.visualGrid.addVelocity(b.x, b.y, b.vx * 0.3, b.vy * 0.3);
        
        // Store previous position for Raycasting
        const prevX = b.x;
        const prevY = b.y;

        // PARAMETRIC PHYSICS
        if (b.behavior === 'SINE') {
             const t = (b.maxLife - b.life) * 0.2; // normalized time
             const perpAngle = b.angle + Math.PI / 2;
             const offset = Math.sin(t) * 10;
             b.x += b.vx * s.timeScale + Math.cos(perpAngle) * Math.cos(t) * 5 * s.timeScale;
             b.y += b.vy * s.timeScale + Math.sin(perpAngle) * Math.cos(t) * 5 * s.timeScale;
        } 
        else if (b.behavior === 'ACCEL') {
             b.vx *= 1.05; b.vy *= 1.05;
             b.x += b.vx * s.timeScale; b.y += b.vy * s.timeScale;
        } 
        else {
             b.x += b.vx * s.timeScale; b.y += b.vy * s.timeScale;
        }

        if (b.homing > 0 && s.quality !== 'LOW') { 
            let target = null, minDSq = 160000; const nearby = s.spatialGrid.queryRadius(b.x, b.y, 400);
            for (const e of nearby as Enemy[]) { if (e.kind !== 'enemy' || e.type === 'projectile' || !e.active) continue; const dSq = Utils.distSq(b.x, b.y, e.x, e.y); if (dSq < minDSq) { minDSq = dSq; target = e; } }
            if (target) { 
                const wantAng = Math.atan2(target.y - b.y, target.x - b.x); 
                const currAng = Math.atan2(b.vy, b.vx); 
                const diff = Utils.angleDiff(currAng, wantAng); 
                const newAng = currAng + diff * b.homing; 
                const spd = Math.hypot(b.vx, b.vy); 
                b.vx = Math.cos(newAng) * spd; b.vy = Math.sin(newAng) * spd; b.angle = newAng; 
            } 
        } 
        b.life--; if (b.life <= 0 || !Utils.inBounds(b.x, b.y, s.width, s.height, 50)) { s.pools.bullets.release(b); s.bullets.splice(bi, 1); continue; } 
        
        // 3. CONTINUOUS COLLISION DETECTION (CCD)
        // Instead of checking if point B is inside E, we check if segment PrevB->B intersects Circle E
        // This prevents high speed projectiles from "tunneling" through enemies.
        
        // Broadphase: Expanded radius to account for bullet travel
        const travelDist = Math.hypot(b.x - prevX, b.y - prevY);
        const searchRadius = Math.max(50, travelDist + 20);
        const candidates = s.spatialGrid.queryRadius(b.x, b.y, searchRadius); 
        
        let hitEnemy = false; 
        
        for (const e of candidates as Enemy[]) {
            if (e.kind !== 'enemy' || e.type === 'projectile' || e.dead || !e.active) continue;
            
            let isHit = false;
            const collisionRadius = e.size + b.size;
            const distSq = (b.x - e.x)**2 + (b.y - e.y)**2;
            
            // Fast check: Standard overlap
            if (distSq < collisionRadius**2) {
                isHit = true;
            } 
            // CCD check: Only if bullet moved fast enough to skip radius
            else if (travelDist > e.size) {
                 // Project Circle Center onto Line Segment
                 const dx = b.x - prevX;
                 const dy = b.y - prevY;
                 const t = ((e.x - prevX) * dx + (e.y - prevY) * dy) / (dx*dx + dy*dy);
                 const clampedT = Math.max(0, Math.min(1, t));
                 const closestX = prevX + clampedT * dx;
                 const closestY = prevY + clampedT * dy;
                 const closestDistSq = (e.x - closestX)**2 + (e.y - closestY)**2;
                 
                 if (closestDistSq < collisionRadius**2) {
                     isHit = true;
                     // Move bullet to impact point visually
                     b.x = closestX;
                     b.y = closestY;
                 }
            }

            if (isHit) { 
                e.hp -= b.dmg; e.hitFlash = 3; 
                createExplosion(s, b.x, b.y, b.color, 3, 0.5); 
                createFloatingText(s, e.x, e.y - 20, Math.floor(b.dmg).toString(), b.color, 14); 
                
                if (b.pierce <= 0) hitEnemy = true; else b.pierce--; 
                
                if (e.hp <= 0 && !e.dead) { 
                    e.dead = true; s.waveKills++; s.combo++; s.comboTimer = CONFIG.PROGRESSION.COMBO_DURATION; s.overdrive = Math.min(100, s.overdrive + (e.isElite ? 15 : 4)); 
                    const comboBonus = 1 + s.combo * CONFIG.PROGRESSION.COMBO_BONUS; s.score += e.score * comboBonus; 
                    createGem(s, e.x, e.y, e.xp); callbacks.playSound('explosion'); 
                    createDebris(s, e.x, e.y, e.color, e.isElite ? 20 : 12, e.isElite ? 2 : 1.2); 
                    if (s.visualGrid) s.visualGrid.applyForce(e.x, e.y, e.size * 4, 30);
                    
                    if (e.affixes.includes('SPLITTER')) { const count = CONFIG.AFFIXES.SPLITTER.count; for(let k=0; k<count; k++) { const m = s.pools.enemies.acquire(); if (m) { const a = (Math.PI*2/count)*k; m.id = Utils.uid('split'); m.x = e.x; m.y = e.y; m.vx = Math.cos(a)*4; m.vy = Math.sin(a)*4; m.hp = e.maxHp * 0.3; m.maxHp = m.hp; m.type = 'chaser'; m.speed = e.speed * 1.5; m.size = e.size * 0.6; m.color = CONFIG.AFFIXES.SPLITTER.color; m.active = true; m.dead = false; s.enemies.push(m); } } } 
                    if (e.isElite && Math.random() < 0.6) { createPickup(s, e.x, e.y); } 
                    if (e.type === 'boss') { s.bossActive = false; s.wave++; s.waveKills = 0; s.waveQuota = Math.ceil(s.waveQuota * CONFIG.SPAWNING.QUOTA_MULTIPLIER); s.spawnTimer = 0; s.timeScale = 0.2; createFloatingText(s, e.x, e.y - 60, 'VICTORY', '#ffff00', 40); } 
                } 
                if (hitEnemy) break; 
            } 
        } 
        if (hitEnemy) { s.pools.bullets.release(b); s.bullets.splice(bi, 1); } 
    }
    
    const magnetRangeSq = p.stats.magnetRange ** 2;
    const collectRadiusSq = CONFIG.GEMS.COLLECT_RADIUS ** 2;
    const nearbyItems = s.spatialGrid.queryRadius(p.x, p.y, p.stats.magnetRange);
    for (const item of nearbyItems) {
        if (item.kind === 'gem' && item.active) {
            const g = item as Gem;
            const dSq = Utils.distSq(g.x, g.y, p.x, p.y);
            if (dSq < magnetRangeSq) {
                g.vx += (p.x - g.x) * CONFIG.GEMS.PULL_STRENGTH;
                g.vy += (p.y - g.y) * CONFIG.GEMS.PULL_STRENGTH;
            }
        }
    }
    for (let i = s.gems.length - 1; i >= 0; i--) {
        const g = s.gems[i];
        if (!g.active) continue;
        g.x += g.vx; g.y += g.vy; g.vx *= CONFIG.GEMS.FRICTION; g.vy *= CONFIG.GEMS.FRICTION; g.life--;
        const dSq = Utils.distSq(g.x, g.y, p.x, p.y);
        if (dSq < collectRadiusSq) {
            p.xp += g.val;
            if (p.xp >= p.xpToNext) {
                p.xp -= p.xpToNext; p.level++; p.xpToNext = Math.floor(p.xpToNext * CONFIG.PROGRESSION.XP_SCALE); s.paused = true; callbacks.playSound('levelup'); const pool: UpgradeOption[] = []; UPGRADES.forEach(u => { const current = s.upgradeStacks.get(u.id) || 0; if (current < u.maxStack) { const weight = Math.max(0.1, u.weight - current * 0.1); for (let k = 0; k < weight * 10; k++) pool.push({ ...u, currentStack: current }); } }); const options: UpgradeOption[] = []; if (pool.length > 0) { while (options.length < 3 && pool.length > 0) { const idx = Math.floor(Math.random() * pool.length); const pick = pool[idx]; if (!options.find(o => o.id === pick.id)) options.push(pick); for (let z = pool.length - 1; z >= 0; z--) if (pool[z].id === pick.id) pool.splice(z, 1); } callbacks.onLevelUp(options); } else { s.paused = false; }
            }
            s.pools.gems.release(g); s.gems.splice(i, 1);
        } else if (g.life <= 0) {
            s.pools.gems.release(g); s.gems.splice(i, 1);
        }
    }
    for (let i = s.particles.length - 1; i >= 0; i--) { const part = s.particles[i]; if (!part.active) continue; part.x += part.vx * s.timeScale; part.y += part.vy * s.timeScale; part.vx *= part.friction; part.vy *= part.friction; part.life -= s.timeScale; if (part.type === 'shard' || part.type === 'poly') { part.rotation += part.rotationSpeed * s.timeScale; part.rotationSpeed *= 0.98; } if (part.life <= 0) { s.pools.particles.release(part); s.particles.splice(i, 1); } }
    for (let i = s.shockwaves.length - 1; i >= 0; i--) { const sw = s.shockwaves[i]; sw.size += sw.speed * s.timeScale; sw.alpha -= 0.03 * s.timeScale; if (sw.alpha <= 0) s.shockwaves.splice(i, 1); }
    for (const o of s.orbitals) {
        o.angle += 0.05;
        const ox = p.x + Math.cos(o.angle) * o.dist;
        const oy = p.y + Math.sin(o.angle) * o.dist;
        const nearbyEnemies = s.spatialGrid.queryRadius(ox, oy, 100);
        for (const item of nearbyEnemies) {
            const e = item as Enemy;
            if (e.kind !== 'enemy' || e.type === 'projectile' || e.dead || !e.active) continue;
            const collisionDist = e.size + 10;
            if (Utils.distSq(ox, oy, e.x, e.y) < collisionDist * collisionDist) {
                e.hp -= 2; e.hitFlash = 2; createExplosion(s, e.x, e.y, '#00ffff', 1, 0.5);
            }
        }
    }
    for (let i = s.texts.length - 1; i >= 0; i--) { const t = s.texts[i]; t.x += t.vx * s.timeScale; t.y += t.vy * s.timeScale; t.vy += 0.1 * s.timeScale; t.life -= s.timeScale; if (t.life <= 0) s.texts.splice(i, 1); }
    
    // ... [Spawn logic] ...
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
            s.spawnTimer++;
            if (s.spawnTimer > s.spawnRate && s.enemies.length < CONFIG.SPAWNING.MAX_ENEMIES) {
                const count = Math.min(3, 1 + Math.floor(s.wave / 5));
                for (let k = 0; k < count; k++) {
                    const e = s.pools.enemies.acquire(); 
                    if (!e) continue;
                    const pos = Utils.getSpawnPos(s.width, s.height, 100);
                    const roll = Math.random();
                    let typeKey = 'CHASER';
                    if (s.wave >= 2 && roll > 0.8) typeKey = 'KAMIKAZE';
                    else if (s.wave >= 3 && roll > 0.7 && roll <= 0.8) typeKey = 'TANK';
                    else if (s.wave >= 4 && roll > 0.6 && roll <= 0.7) typeKey = 'TURRET';
                    else if (s.wave >= 5 && roll > 0.4 && roll <= 0.6) typeKey = 'SHOOTER';
                    
                    const cfg = CONFIG.ENEMIES[typeKey];
                    const eliteChance = Math.min(CONFIG.ELITE.MAX_CHANCE, s.wave * CONFIG.ELITE.CHANCE_PER_WAVE);
                    const isElite = Math.random() < eliteChance;
                    const hp = cfg.hp + s.wave * cfg.hpScale;
                    const speed = cfg.speed + s.wave * cfg.speedScale;
                    
                    e.id = Utils.uid('e'); e.x = pos.x; e.y = pos.y; e.vx = 0; e.vy = 0;
                    e.hp = isElite ? hp * CONFIG.ELITE.HP_MULT : hp; e.maxHp = e.hp;
                    e.type = typeKey.toLowerCase();
                    e.speed = isElite ? speed * CONFIG.ELITE.SPEED_MULT : speed;
                    e.size = isElite ? cfg.size * CONFIG.ELITE.SIZE_MULT : cfg.size;
                    e.color = isElite ? CONFIG.ELITE.COLOR : cfg.color; e.isElite = isElite;
                    e.xp = isElite ? cfg.xp * CONFIG.ELITE.XP_MULT : cfg.xp;
                    e.score = isElite ? cfg.score * CONFIG.ELITE.SCORE_MULT : cfg.score;
                    e.shootTimer = 0; e.active = true; e.dead = false; e.phase = 0; e.hitFlash = 0;
                    e.affixes = []; e.affixTimer = 0; e.spawnAnim = 0;

                    if (isElite && s.wave >= 3) {
                        const affixRoll = Math.random();
                        if (affixRoll < 0.2) e.affixes.push('VORTEX');
                        else if (affixRoll < 0.4) e.affixes.push('REPULSOR');
                        else if (affixRoll < 0.6) e.affixes.push('SPLITTER');
                        else if (affixRoll < 0.8) e.affixes.push('WARP');
                        else e.affixes.push('REGEN');
                    }
                    s.enemies.push(e);
                }
                s.spawnTimer = 0;
            }
        }
    }
}