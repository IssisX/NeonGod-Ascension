import { Enemy, GameState, Player } from '../types';
import { Utils } from '../utils';
import { CONFIG } from '../constants';
import { VisualGrid } from './grids';

// --- VECTOR MATH (Inlined for performance) ---
const Vec = {
    add: (v1: {x: number, y: number}, v2: {x: number, y: number}) => ({ x: v1.x + v2.x, y: v1.y + v2.y }),
    sub: (v1: {x: number, y: number}, v2: {x: number, y: number}) => ({ x: v1.x - v2.x, y: v1.y - v2.y }),
    mult: (v: {x: number, y: number}, s: number) => ({ x: v.x * s, y: v.y * s }),
    mag: (v: {x: number, y: number}) => Math.hypot(v.x, v.y),
    normalize: (v: {x: number, y: number}) => {
        const m = Math.hypot(v.x, v.y);
        return m === 0 ? { x: 0, y: 0 } : { x: v.x / m, y: v.y / m };
    },
    limit: (v: {x: number, y: number}, max: number) => {
        const m = Math.hypot(v.x, v.y);
        if (m > max) {
            return { x: (v.x / m) * max, y: (v.y / m) * max };
        }
        return v;
    },
    dist: (v1: {x: number, y: number}, v2: {x: number, y: number}) => Math.hypot(v2.x - v1.x, v2.y - v1.y),
};

// --- STEERING BEHAVIORS ---

/**
 * Seek a target position.
 */
const seek = (e: Enemy, target: {x: number, y: number}, slowingRadius = 0) => {
    const desired = Vec.sub(target, e);
    const d = Vec.mag(desired);

    let speed = e.speed;
    if (slowingRadius > 0 && d < slowingRadius) {
        speed = e.speed * (d / slowingRadius);
    }

    if (d > 0) {
        // desired = normalize(desired) * speed
        const n = Vec.normalize(desired);
        const v = Vec.mult(n, speed);
        // steer = desired - velocity
        return Vec.sub(v, { x: e.vx, y: e.vy });
    }
    return { x: 0, y: 0 };
};

/**
 * Flee from a position.
 */
const flee = (e: Enemy, target: {x: number, y: number}, panicDist = 200) => {
    const d = Vec.dist(e, target);
    if (d > panicDist) return { x: 0, y: 0 };

    const desired = Vec.sub(e, target);
    const n = Vec.normalize(desired);
    const v = Vec.mult(n, e.speed);
    return Vec.sub(v, { x: e.vx, y: e.vy });
};

/**
 * Ride the fluid flow.
 */
const flow = (e: Enemy, grid: VisualGrid) => {
    if (!grid) return { x: 0, y: 0 };
    const fv = grid.getVelocityAt(e.x, e.y);
    return { x: fv.vx, y: fv.vy };
};

/**
 * Calculate swarm forces (Separation, Alignment, Cohesion).
 */
const flock = (e: Enemy, neighbors: Enemy[]) => {
    let sep = { x: 0, y: 0 };
    let ali = { x: 0, y: 0 };
    let coh = { x: 0, y: 0 };
    let count = 0;

    const sepDist = e.size * 2 + 20;
    const neighborDist = 100;

    for (const other of neighbors) {
        if (other === e || !other.active) continue;
        const d = Vec.dist(e, other);

        if (d > 0 && d < neighborDist) {
            // Separation
            if (d < sepDist) {
                const diff = Vec.sub(e, other);
                const n = Vec.normalize(diff);
                // Weight by distance (closer = stronger push)
                const w = Vec.mult(n, 100 / (d * d + 1));
                sep = Vec.add(sep, w);
            }
            // Alignment
            ali = Vec.add(ali, { x: other.vx, y: other.vy });
            // Cohesion
            coh = Vec.add(coh, { x: other.x, y: other.y });
            count++;
        }
    }

    if (count > 0) {
        // Average alignment
        ali = Vec.mult(ali, 1 / count);
        ali = Vec.normalize(ali);
        ali = Vec.mult(ali, e.speed);
        ali = Vec.sub(ali, { x: e.vx, y: e.vy });

        // Cohesion (seek center)
        coh = Vec.mult(coh, 1 / count);
        const seekForce = seek(e, coh);
        coh = seekForce;
    }

    return { sep, ali, coh };
};

// --- BEHAVIOR STATE MACHINES ---

export interface AIContext {
    gameState: GameState;
    spawnProjectile: (x: number, y: number, vx: number, vy: number, type: string, color: string, size: number) => void;
    spawnEnemy: (x: number, y: number, type: string) => void;
    spawnExplosion: (x: number, y: number, color: string, size: number) => void;
    spawnShockwave: (x: number, y: number, size: number, color: string) => void;
    playSound: (s: any) => void;
}

const updateChaser = (e: Enemy, p: Player) => {
    const steer = seek(e, p);
    // Chasers are aggressive but simple
    return steer;
};

const updateKamikaze = (e: Enemy, p: Player, ctx: AIContext) => {
    const dist = Vec.dist(e, p);

    // Phase 0: Stalk / Approach
    if (e.phase === 0) {
        e.rotation = Math.atan2(p.y - e.y, p.x - e.x);
        const steer = seek(e, p);
        if (dist < CONFIG.ENEMIES.KAMIKAZE.detectRange) {
            e.phase = 1;
            e.attackTimer = 0;
            ctx.playSound('charge');
            // Little jump back before charge
            const back = Vec.mult(Vec.normalize({x: e.vx, y: e.vy}), -5);
            e.vx += back.x; e.vy += back.y;
        }
        return steer;
    }
    // Phase 1: Charge (No steering, just momentum)
    else {
        e.vx *= 0.98; e.vy *= 0.98; // Slight drag to prevent infinite speed
        e.attackTimer++;

        // Blink effect
        e.hitFlash = Math.floor(e.attackTimer / 4) % 2 === 0 ? 1 : 0;

        if (e.attackTimer > 45) {
            e.dead = true;
            ctx.playSound('explosion');
            ctx.spawnExplosion(e.x, e.y, '#ff4400', 30);
            ctx.spawnShockwave(e.x, e.y, 180, '#ffaa00');
            ctx.gameState.shake = 15;
            // Explosion Logic is handled in logic.ts upon death usually, but we force it here
            // We need to ensure we don't double count kill score?
            // The logic.ts handles 'dead' check. We just set dead=true.

            // Apply AOE damage if close
            if (Vec.dist(e, p) < 120 && p.invuln <= 0) {
                p.hp -= 35;
                p.invuln = 45;
                p.hitFlash = 10;
                ctx.playSound('hit');
            }
        }
        return { x: 0, y: 0 };
    }
};

const updateShooter = (e: Enemy, p: Player, ctx: AIContext) => {
    const dist = Vec.dist(e, p);
    let force = { x: 0, y: 0 };

    // Shooters maintain distance
    if (dist < 250) {
        force = flee(e, p); // Back off
    } else if (dist > 400) {
        force = seek(e, p); // Get closer
    } else {
        // Strafe?
        const toP = Vec.sub(p, e);
        const n = Vec.normalize(toP);
        force = { x: n.y * e.speed, y: -n.x * e.speed }; // Tangent
    }

    // Shoot Logic
    e.shootTimer++;
    if (e.shootTimer >= CONFIG.ENEMIES.SHOOTER.shootInterval && dist < 500) {
        e.shootTimer = 0;
        ctx.playSound('shoot');
        const ang = Math.atan2(p.y - e.y, p.x - e.x);

        // Predictive Aim (Linear)
        const t = dist / 5; // approx travel time
        const predX = p.x + p.vx * t;
        const predY = p.y + p.vy * t;
        const finalAng = Math.atan2(predY - e.y, predX - e.x);

        ctx.spawnProjectile(e.x, e.y, Math.cos(finalAng) * 5, Math.sin(finalAng) * 5, 'projectile', e.color, 5);
    }

    return force;
};

const updateTurret = (e: Enemy, p: Player, ctx: AIContext) => {
    e.rotation += 0.02;
    const dist = Vec.dist(e, p);

    // Turrets drift slowly to player if far, otherwise stop
    let force = { x: 0, y: 0 };
    if (dist > 400) force = seek(e, p, 100);
    else { e.vx *= 0.9; e.vy *= 0.9; }

    e.shootTimer++;
    if (e.shootTimer >= CONFIG.ENEMIES.TURRET.shootInterval) {
        e.shootTimer = 0;
        ctx.playSound('shoot');
        // Spiral shot
        for(let k=0; k<4; k++) {
            const ang = e.rotation + (Math.PI/2) * k;
            ctx.spawnProjectile(e.x, e.y, Math.cos(ang) * 4, Math.sin(ang) * 4, 'projectile', '#00ffff', 6);
        }
    }
    return force;
};

const updateBoss = (e: Enemy, p: Player, ctx: AIContext) => {
    e.attackTimer++;
    // Intro float in
    if (e.y < 150) e.y += 1.5;

    const phase = Math.floor(e.attackTimer / 300) % 3;
    let force = { x: 0, y: 0 };

    if (phase === 0) {
        // Bullet Hell Phase
        if (e.attackTimer % 8 === 0) {
            if (e.attackTimer % 32 === 0) ctx.playSound('shoot');
            const angle = e.attackTimer * 0.08;
            for (let k = 0; k < 3; k++) {
                const fa = angle + (Math.PI * 2 / 3) * k;
                ctx.spawnProjectile(e.x, e.y, Math.cos(fa) * 4, Math.sin(fa) * 4, 'projectile', '#ff0000', 6);
            }
        }
        // Wander slowly
        // force = seek(e, {x: ctx.gameState.width/2, y: 150}, 50);
    } else if (phase === 1) {
        // Charge Phase
        if (e.attackTimer % 120 === 0) {
             const ang = Math.atan2(p.y - e.y, p.x - e.x);
             e.vx = Math.cos(ang) * 12;
             e.vy = Math.sin(ang) * 12;
             ctx.playSound('charge');
        }
        e.vx *= 0.96; e.vy *= 0.96; // Heavy friction
    } else {
        // Summon Phase
        if (e.attackTimer % 180 === 0) {
            ctx.playSound('spawn');
            for (let m = 0; m < 3; m++) {
                const sa = (Math.PI * 2 / 3) * m;
                const sx = e.x + Math.cos(sa) * 100;
                const sy = e.y + Math.sin(sa) * 100;
                ctx.spawnEnemy(sx, sy, 'chaser');
            }
        }
    }

    return force;
};

// --- MAIN AI UPDATE ---

// --- SQUAD TACTICS ---
const applySquadTactics = (e: Enemy, ctx: AIContext, steering: {x:number, y:number}) => {
    // If one enemy spots the player, alert nearby idle ones
    const distToPlayer = Vec.dist(e, ctx.gameState.player);
    if (distToPlayer < 400 && e.type === 'chaser') {
        const nearby = ctx.gameState.spatialGrid.queryRadius(e.x, e.y, 200);
        for (const other of nearby) {
            if (other.type === 'tank' && other.active) {
                // Tanks move to intercept
                other.vx += (e.vx * 0.1);
                other.vy += (e.vy * 0.1);
            }
        }
    }
    return steering;
}

export const updateEnemyAI = (e: Enemy, ctx: AIContext) => {
    if (!e.active || e.dead) return;

    const p = ctx.gameState.player;
    let steering = { x: 0, y: 0 };

    // 1. Base Behavior
    switch (e.type) {
        case 'chaser': steering = updateChaser(e, p); break;
        case 'kamikaze': steering = updateKamikaze(e, p, ctx); break;
        case 'shooter': steering = updateShooter(e, p, ctx); break;
        case 'turret': steering = updateTurret(e, p, ctx); break;
        case 'boss': steering = updateBoss(e, p, ctx); break;
        case 'tank': steering = seek(e, p); break; // Slow chaser
        default: steering = seek(e, p); break;
    }

    // 1.5 Squad Tactics (Hive Mind)
    applySquadTactics(e, ctx, steering);

    // 2. Swarm / Flocking (Only for non-bosses)
    if (e.type !== 'boss' && e.type !== 'kamikaze' && e.type !== 'projectile') {
        // We need neighbors.
        // Note: Logic.ts passes neighbors usually? Or we query grid?
        // Querying grid here implies we need access to spatialGrid.
        const neighbors = ctx.gameState.spatialGrid.queryRadius(e.x, e.y, 100);
        const flockForces = flock(e, neighbors);

        // Accumulate Flocking
        // Weights: Sep: 1.5, Ali: 0.5, Coh: 0.1
        steering = Vec.add(steering, Vec.mult(flockForces.sep, 1.5));
        steering = Vec.add(steering, Vec.mult(flockForces.ali, 0.5));
        steering = Vec.add(steering, Vec.mult(flockForces.coh, 0.1));
    }

    // 3. Fluid Influence (Rheotaxis)
    // Enemies are pushed by fluid
    if (ctx.gameState.visualGrid) {
        const flowV = flow(e, ctx.gameState.visualGrid);
        // Add flow to velocity directly or steering?
        // Let's add it to steering (force) so mass matters.
        steering = Vec.add(steering, Vec.mult(flowV, 1.5));
    }

    // 4. Affix Logic (Elites)
    if (e.isElite && e.affixes.length > 0) {
        e.affixTimer++;
        const distToPlayer = Vec.dist(e, p);
        const toPlayerAng = Math.atan2(p.y - e.y, p.x - e.x);

        for (const affix of e.affixes) {
            if (affix === 'VORTEX') {
                if (distToPlayer < CONFIG.AFFIXES.VORTEX.range) {
                    const pull = CONFIG.AFFIXES.VORTEX.force;
                    p.vx -= Math.cos(toPlayerAng) * pull;
                    p.vy -= Math.sin(toPlayerAng) * pull;
                }
            } else if (affix === 'REPULSOR') {
                if (distToPlayer < CONFIG.AFFIXES.REPULSOR.range) {
                    const push = CONFIG.AFFIXES.REPULSOR.force;
                    p.vx += Math.cos(toPlayerAng) * push;
                    p.vy += Math.sin(toPlayerAng) * push;
                }
            } else if (affix === 'WARP') {
                if (e.affixTimer > CONFIG.AFFIXES.WARP.cooldown) {
                    e.affixTimer = 0;
                    e.x = p.x + p.vx * 30 + Utils.rand(-50, 50);
                    e.y = p.y + p.vy * 30 + Utils.rand(-50, 50);
                    e.x = Utils.clamp(e.x, 50, ctx.gameState.width - 50);
                    e.y = Utils.clamp(e.y, 50, ctx.gameState.height - 50);
                    ctx.spawnShockwave(e.x, e.y, 100, CONFIG.AFFIXES.WARP.color);
                }
            } else if (affix === 'REGEN') {
                if (e.affixTimer % CONFIG.AFFIXES.REGEN.interval === 0) {
                    e.hp = Math.min(e.maxHp, e.hp + e.maxHp * CONFIG.AFFIXES.REGEN.rate);
                }
            }
        }
    }

    // 5. Physics Integration (Euler)
    // Apply steering force to acceleration
    // We treat 'steering' as acceleration for simplicity (Mass = 1)

    // Limit force?
    const maxForce = 0.5;
    steering = Vec.limit(steering, maxForce);

    // Apply to velocity
    e.vx += steering.x;
    e.vy += steering.y;

    // Limit speed
    // Bosses and chargers might exceed speed temporarily
    let maxSpeed = e.speed;
    if (e.type === 'kamikaze' && e.phase === 1) maxSpeed *= 3;

    const currSpeed = Math.hypot(e.vx, e.vy);
    if (currSpeed > maxSpeed) {
        const n = Vec.normalize({x: e.vx, y: e.vy});
        const limited = Vec.mult(n, maxSpeed);
        e.vx = limited.x;
        e.vy = limited.y;
    }

    // Position update happens in logic.ts (common entity update) or here?
    // Let's do it here to keep it self-contained?
    // No, logic.ts handles timeScale. We return?
    // No, we modify 'e' directly. logic.ts will apply `x += vx * timeScale`.
};
