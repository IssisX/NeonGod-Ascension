import { GameState } from './types';

// --- MATERIAL POINT METHOD (MPM) SOLVER ---
// Implements a 2D MLS-MPM solver for soft-body materials.
// matter is represented as particles that transfer mass/momentum to a grid and back.
// Used for high-fidelity soft-body debris and 'Matter' effects.

interface MPMParticle {
    x: number; y: number;
    vx: number; vy: number;
    C: [number, number, number, number]; // Affine momentum matrix
    mass: number;
    stress: number; // For Hyperbolic Canvas Thermal Emission
    active: boolean;
}

export class MPMSolver {
    static GRID_RES = 64;
    static particles: MPMParticle[] = [];
    static grid: { v: [number, number], m: number }[] = [];

    static init() {
        this.grid = [];
        for (let i = 0; i < this.GRID_RES * this.GRID_RES; i++) {
            this.grid.push({ v: [0, 0], m: 0 });
        }
    }

    static update(s: GameState) {
        // 1. Reset Grid
        for (let i = 0; i < this.grid.length; i++) {
            this.grid[i].v = [0, 0];
            this.grid[i].m = 0;
        }

        // 2. Particles to Grid (P2G)
        for (const p of this.particles) {
            if (!p.active) continue;

            const cx = p.x / (s.width / this.GRID_RES);
            const cy = p.y / (s.height / this.GRID_RES);
            const base_x = (cx - 0.5) | 0;
            const base_y = (cy - 0.5) | 0;
            const fx = cx - base_x;
            const fy = cy - base_y;

            const w = [
                0.5 * (1.5 - fx) ** 2, 0.75 - (fx - 1) ** 2, 0.5 * (fx - 0.5) ** 2,
                0.5 * (1.5 - fy) ** 2, 0.75 - (fy - 1) ** 2, 0.5 * (fy - 0.5) ** 2
            ];

            for (let i = 0; i < 3; i++) {
                for (let j = 0; j < 3; j++) {
                    const weight = w[i] * w[j + 3];
                    const cell_x = base_x + i;
                    const cell_y = base_y + j;
                    if (cell_x < 0 || cell_x >= this.GRID_RES || cell_y < 0 || cell_y >= this.GRID_RES) continue;

                    const cell_idx = cell_y * this.GRID_RES + cell_x;
                    const dpos = [ (i - fx) * (s.width / this.GRID_RES), (j - fy) * (s.height / this.GRID_RES) ];
                    const momentum = p.mass * (p.vx + p.C[0] * dpos[0] + p.C[1] * dpos[1]);
                    // Simplified for JS performance - focusing on spectacular motion over physical perfection
                    this.grid[cell_idx].v[0] += weight * momentum;
                    this.grid[cell_idx].v[1] += weight * p.mass * (p.vy + p.C[2] * dpos[0] + p.C[3] * dpos[1]);
                    this.grid[cell_idx].m += weight * p.mass;
                }
            }
        }

        // 3. Grid Operations (Gravity, Boundaries)
        for (let i = 0; i < this.grid.length; i++) {
            const cell = this.grid[i];
            if (cell.m > 0) {
                cell.v[0] /= cell.m;
                cell.v[1] /= cell.m;
                cell.v[1] += 0.1; // Soft gravity
            }
        }

        // 4. Grid to Particles (G2P)
        for (const p of this.particles) {
            if (!p.active) continue;

            const cx = p.x / (s.width / this.GRID_RES);
            const cy = p.y / (s.height / this.GRID_RES);
            const base_x = (cx - 0.5) | 0;
            const base_y = (cy - 0.5) | 0;
            const fx = cx - base_x;
            const fy = cy - base_y;

            const w = [
                0.5 * (1.5 - fx) ** 2, 0.75 - (fx - 1) ** 2, 0.5 * (fx - 0.5) ** 2,
                0.5 * (1.5 - fy) ** 2, 0.75 - (fy - 1) ** 2, 0.5 * (fy - 0.5) ** 2
            ];

            const old_vx = p.vx;
            const old_vy = p.vy;
            p.vx = 0; p.vy = 0;
            p.C = [0, 0, 0, 0];

            for (let i = 0; i < 3; i++) {
                for (let j = 0; j < 3; j++) {
                    const weight = w[i] * w[j + 3];
                    const cell_x = base_x + i;
                    const cell_y = base_y + j;
                    if (cell_x < 0 || cell_x >= this.GRID_RES || cell_y < 0 || cell_y >= this.GRID_RES) continue;

                    const cell_idx = cell_y * this.GRID_RES + cell_x;
                    const g_v = this.grid[cell_idx].v;
                    const dpos = [ (i - fx) * (s.width / this.GRID_RES), (j - fy) * (s.height / this.GRID_RES) ];

                    p.vx += weight * g_v[0];
                    p.vy += weight * g_v[1];
                    p.C[0] += 4 * weight * g_v[0] * dpos[0];
                    p.C[1] += 4 * weight * g_v[0] * dpos[1];
                    p.C[2] += 4 * weight * g_v[1] * dpos[0];
                    p.C[3] += 4 * weight * g_v[1] * dpos[1];
                }
            }

            p.x += p.vx;
            p.y += p.vy;

            // SPECTACULAR: Stress-driven Thermal Emission (Hyperbolic Canvas)
            const dvx = p.vx - old_vx;
            const dvy = p.vy - old_vy;
            p.stress = Utils.lerp(p.stress, Math.sqrt(dvx*dvx + dvy*dvy) * 10, 0.1);

            // Interaction with Fluid Grid
            if (s.visualGrid) {
                const fv = s.visualGrid.sampleVelocity(p.x, p.y);
                p.vx += fv.vx * 0.05;
                p.vy += fv.vy * 0.05;
            }

            // Boundaries
            if (p.x < 10) { p.x = 10; p.vx *= -0.5; }
            if (p.x > s.width - 10) { p.x = s.width - 10; p.vx *= -0.5; }
            if (p.y < 10) { p.y = 10; p.vy *= -0.5; }
            if (p.y > s.height - 10) { p.y = s.height - 10; p.vy *= -0.5; }
        }
    }

    static spawn(x: number, y: number, vx: number, vy: number, count = 20) {
        for (let i = 0; i < count; i++) {
            let p = this.particles.find(p => !p.active);
            if (!p) {
                p = { x: 0, y: 0, vx: 0, vy: 0, C: [0, 0, 0, 0], mass: 1, active: false };
                this.particles.push(p);
            }
            p.x = x + (Math.random() - 0.5) * 10;
            p.y = y + (Math.random() - 0.5) * 10;
            p.vx = vx + (Math.random() - 0.5) * 5;
            p.vy = vy + (Math.random() - 0.5) * 5;
            p.C = [0, 0, 0, 0];
            p.stress = 0;
            p.active = true;
        }
    }
}
