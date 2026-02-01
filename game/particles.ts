import { Particle, GameState } from '../types';
import { Utils } from '../utils';
import { VisualGrid } from './grids';

export class ParticleSystem {
    pool: Particle[];
    activeParticles: Particle[];
    maxParticles: number;

    constructor(max = 2000) {
        this.maxParticles = max;
        this.pool = [];
        this.activeParticles = [];

        // Pre-allocate
        for(let i=0; i<max; i++) {
            this.pool.push({
                x: 0, y: 0, vx: 0, vy: 0,
                life: 0, maxLife: 0,
                color: '#fff', size: 0,
                friction: 0.95,
                type: 'glow',
                active: false,
                rotation: 0, rotationSpeed: 0
            });
        }
    }

    spawn(x: number, y: number, options: Partial<Particle>) {
        if (this.pool.length === 0) return;
        const p = this.pool.pop()!;

        p.x = x; p.y = y;
        p.vx = options.vx || (Math.random() - 0.5) * 2;
        p.vy = options.vy || (Math.random() - 0.5) * 2;
        p.life = options.life || 60;
        p.maxLife = p.life;
        p.color = options.color || '#fff';
        p.size = options.size || 2;
        p.friction = options.friction || 0.95;
        p.type = options.type || 'glow';
        p.active = true;
        p.rotation = Math.random() * Math.PI * 2;
        p.rotationSpeed = (Math.random() - 0.5) * 0.2;

        this.activeParticles.push(p);
    }

    spawnExplosion(x: number, y: number, color: string, count: number, speed = 1) {
        for(let i=0; i<count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const vel = Math.random() * 5 * speed;
            this.spawn(x, y, {
                vx: Math.cos(angle) * vel,
                vy: Math.sin(angle) * vel,
                color: color,
                life: Utils.rand(30, 60),
                size: Utils.rand(2, 5),
                type: 'glow'
            });
        }
    }

    update(s: GameState) {
        // Fluid Interaction
        const grid = s.visualGrid;

        let i = this.activeParticles.length;
        while (i--) {
            const p = this.activeParticles[i];

            // 1. Fluid Advection (The Swarm flows)
            if (grid) {
                const fv = grid.getVelocityAt(p.x, p.y);
                // Mass-less particles follow fluid closely
                // Heavy particles (shards) have inertia
                const fluidity = p.type === 'glow' ? 0.8 : 0.2;

                p.vx += fv.vx * 20 * fluidity; // Scaled up fluid force
                p.vy += fv.vy * 20 * fluidity;
            }

            // 2. Physics Integration
            p.x += p.vx * s.timeScale;
            p.y += p.vy * s.timeScale;
            p.vx *= p.friction;
            p.vy *= p.friction;
            p.rotation += p.rotationSpeed * s.timeScale;
            p.life -= s.timeScale;

            // 3. Screen Wrap / Bounds
            if (p.x < 0 || p.x > s.width || p.y < 0 || p.y > s.height) {
                p.life -= 5; // Die faster offscreen
            }

            // 4. Death
            if (p.life <= 0) {
                p.active = false;
                this.pool.push(p);
                // Swap-remove for O(1)
                this.activeParticles[i] = this.activeParticles[this.activeParticles.length - 1];
                this.activeParticles.pop();
            }
        }
    }
}
