import { GameState } from '../types';
import { CONFIG } from '../constants';
import { Utils } from '../utils';

// --- TACTICAL FORMATIONS ---
const Formations = {
    // Spawns a cluster at a specific point
    Cluster: (x: number, y: number, count: number, radius: number) => {
        const points = [];
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = Math.random() * radius;
            points.push({ x: x + Math.cos(angle) * r, y: y + Math.sin(angle) * r });
        }
        return points;
    },
    // Spawns a V-formation (Phalanx) aiming at player
    Phalanx: (centerX: number, centerY: number, count: number, spacing: number, angle: number) => {
        const points = [];
        const left = { x: Math.cos(angle - Math.PI / 2), y: Math.sin(angle - Math.PI / 2) };
        const right = { x: Math.cos(angle + Math.PI / 2), y: Math.sin(angle + Math.PI / 2) };

        points.push({ x: centerX, y: centerY }); // Lead
        for (let i = 1; i < count; i++) {
            const offset = Math.ceil(i / 2) * spacing;
            const dir = i % 2 === 0 ? right : left;
            // Backwards slightly
            const backX = Math.cos(angle + Math.PI) * (offset * 0.5);
            const backY = Math.sin(angle + Math.PI) * (offset * 0.5);

            points.push({
                x: centerX + dir.x * offset + backX,
                y: centerY + dir.y * offset + backY
            });
        }
        return points;
    },
    // Spawns a circle surrounding the player
    Encirclement: (targetX: number, targetY: number, count: number, radius: number) => {
        const points = [];
        const startAngle = Math.random() * Math.PI * 2;
        const step = (Math.PI * 2) / count;
        for (let i = 0; i < count; i++) {
            const a = startAngle + step * i;
            points.push({ x: targetX + Math.cos(a) * radius, y: targetY + Math.sin(a) * radius });
        }
        return points;
    },
    // Spawns a stream from one edge
    Stream: (w: number, h: number, count: number) => {
        const points = [];
        const edge = Math.floor(Math.random() * 4); // 0: top, 1: right, 2: bottom, 3: left
        const startX = edge === 1 ? w + 50 : edge === 3 ? -50 : Math.random() * w;
        const startY = edge === 0 ? -50 : edge === 2 ? h + 50 : Math.random() * h;

        for (let i = 0; i < count; i++) {
            points.push({ x: startX + Utils.rand(-20, 20), y: startY + Utils.rand(-20, 20) });
        }
        return points;
    }
};

// --- DIRECTOR AI ---
export const Director = {
    /**
     * The Brain of the operation.
     * Decides *when*, *what*, and *how* to spawn enemies based on dramatic pacing.
     */
    update: (s: GameState, spawnEnemy: (x: number, y: number, type: string, isElite: boolean) => void) => {
        if (s.bossActive || s.paused || s.gameOver) return;

        // 1. Analyze State
        const activeEnemies = s.enemies.length;
        if (activeEnemies >= CONFIG.SPAWNING.MAX_ENEMIES) return;

        // 2. Determine Intensity (Pacing)
        // Sine wave oscillating every 60 seconds (approx 3600 frames)
        const timePhase = (s.frame / 3600) * Math.PI * 2;
        const baseIntensity = (Math.sin(timePhase) + 1) / 2; // 0 to 1

        // Player Stress (HP loss increases intensity/drama)
        const stress = 1 - (s.player.hp / s.player.maxHp);

        // Effective Threat Level (0.0 - 1.0)
        const threatLevel = Math.min(1, baseIntensity * 0.7 + stress * 0.3 + (s.wave * 0.05));

        // 3. Check Quotas
        // Dynamically adjust spawn rate based on threat
        // High threat = Faster spawns (Chaos)
        // Low threat = Slower spawns (Buildup)
        const currentRate = Math.max(10, Utils.lerp(120, 30, threatLevel));

        s.spawnTimer++;
        if (s.spawnTimer > currentRate) {
            s.spawnTimer = 0;

            // 4. Composition Strategy (What to spawn)
            const budget = 1 + Math.floor(threatLevel * 5) + Math.floor(s.wave / 3);
            const roll = Math.random();

            // Pick Archetype
            let type = 'chaser';
            if (s.wave >= 2 && roll > 0.7) type = 'kamikaze';
            if (s.wave >= 3 && roll > 0.85) type = 'tank';
            if (s.wave >= 4 && roll > 0.6 && roll < 0.7) type = 'shooter';
            if (s.wave >= 5 && roll > 0.4 && roll < 0.5) type = 'turret';

            // Elite Chance
            const isElite = Math.random() < (0.05 + s.wave * 0.01) && activeEnemies < 50;

            // 5. Tactical Deployment (How to spawn)
            // High intensity = Formations
            // Low intensity = Random clusters
            const formationChance = threatLevel > 0.5 ? 0.7 : 0.2;

            if (Math.random() < formationChance) {
                // Pick a formation
                let points: {x: number, y: number}[] = [];
                const formRoll = Math.random();
                const count = Math.min(budget, 5); // Cap formation size

                if (formRoll < 0.33) {
                    // Encirclement (High Pressure)
                    points = Formations.Encirclement(s.player.x, s.player.y, count, 400);
                } else if (formRoll < 0.66) {
                    // Phalanx (Direct Assault)
                    const spawnPos = Utils.getSpawnPos(s.width, s.height, 100);
                    const angle = Math.atan2(s.player.y - spawnPos.y, s.player.x - spawnPos.x);
                    points = Formations.Phalanx(spawnPos.x, spawnPos.y, count, 40, angle);
                } else {
                    // Stream (Reinforcements)
                    points = Formations.Stream(s.width, s.height, count);
                }

                // Spawn the squad
                points.forEach(p => {
                    if (s.enemies.length < CONFIG.SPAWNING.MAX_ENEMIES) {
                         spawnEnemy(p.x, p.y, type, isElite);
                    }
                });

            } else {
                // Guerrilla Tactics (Random Spawn)
                const pos = Utils.getSpawnPos(s.width, s.height, 100);
                spawnEnemy(pos.x, pos.y, type, isElite);
            }
        }
    }
};
