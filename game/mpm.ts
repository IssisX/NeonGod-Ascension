import { Utils } from '../utils';

// --- CONFIGURATION ---
const GRID_SPACING = 20; // Size of background grid cells
const MAX_PARTICLES = 4096;
const DT = 0.016; // Fixed time step assumption or passed in
const ITERATIONS = 1; // Sub-steps per frame if needed

// Neo-Hookean Material Parameters
const HARDENING = 10.0; // "Mu"
const BULK_MODULUS = 5.0; // "Lambda" roughly

export class MPMSystem {
    // --- PARTICLE STATE (SoA) ---
    count: number = 0;
    x: Float32Array = new Float32Array(MAX_PARTICLES);
    y: Float32Array = new Float32Array(MAX_PARTICLES);
    u: Float32Array = new Float32Array(MAX_PARTICLES);
    v: Float32Array = new Float32Array(MAX_PARTICLES);

    // Deformation Gradient (F) - Identity init
    F00: Float32Array = new Float32Array(MAX_PARTICLES);
    F01: Float32Array = new Float32Array(MAX_PARTICLES);
    F10: Float32Array = new Float32Array(MAX_PARTICLES);
    F11: Float32Array = new Float32Array(MAX_PARTICLES);

    // Volume/Mass (J * V0)
    mass: Float32Array = new Float32Array(MAX_PARTICLES);
    volume: Float32Array = new Float32Array(MAX_PARTICLES); // Initial volume

    // Material Properties (per particle)
    colorR: Float32Array = new Float32Array(MAX_PARTICLES);
    colorG: Float32Array = new Float32Array(MAX_PARTICLES);
    colorB: Float32Array = new Float32Array(MAX_PARTICLES);
    life: Float32Array = new Float32Array(MAX_PARTICLES);

    // APIC Affine Matrix (C)
    C00: Float32Array = new Float32Array(MAX_PARTICLES);
    C01: Float32Array = new Float32Array(MAX_PARTICLES);
    C10: Float32Array = new Float32Array(MAX_PARTICLES);
    C11: Float32Array = new Float32Array(MAX_PARTICLES);

    // --- GRID STATE ---
    gridWidth: number;
    gridHeight: number;
    gridMass: Float32Array;
    gridVelX: Float32Array;
    gridVelY: Float32Array;

    // Scratchpad for weights
    // Not storing per particle to save memory, computed on fly

    constructor(width: number, height: number) {
        this.gridWidth = Math.ceil(width / GRID_SPACING) + 2; // Padding
        this.gridHeight = Math.ceil(height / GRID_SPACING) + 2;
        const gridSize = this.gridWidth * this.gridHeight;

        this.gridMass = new Float32Array(gridSize);
        this.gridVelX = new Float32Array(gridSize);
        this.gridVelY = new Float32Array(gridSize);
    }

    spawn(x: number, y: number, vx: number, vy: number, color: {r:number, g:number, b:number}, mass = 1.0) {
        if (this.count >= MAX_PARTICLES) return;
        const i = this.count++;

        this.x[i] = x;
        this.y[i] = y;
        this.u[i] = vx;
        this.v[i] = vy;

        this.mass[i] = mass;
        this.volume[i] = 200; // Arbitrary "rest volume" scaling factor
        this.life[i] = 1.0;

        this.colorR[i] = color.r;
        this.colorG[i] = color.g;
        this.colorB[i] = color.b;

        // Identity F
        this.F00[i] = 1; this.F01[i] = 0;
        this.F10[i] = 0; this.F11[i] = 1;

        // Zero C
        this.C00[i] = 0; this.C01[i] = 0;
        this.C10[i] = 0; this.C11[i] = 0;
    }

    spawnExplosion(x: number, y: number, color: {r:number, g:number, b:number}, count: number) {
        for(let i=0; i<count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * 20;
            const speed = Math.random() * 5;

            this.spawn(
                x + Math.cos(angle) * dist,
                y + Math.sin(angle) * dist,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                color
            );
        }
    }

    update() {
        if (this.count === 0) return;

        // Clear Grid
        this.gridMass.fill(0);
        this.gridVelX.fill(0);
        this.gridVelY.fill(0);

        const invGrid = 1.0 / GRID_SPACING;

        // --- STEP 1: PARTICLES TO GRID (P2G) ---
        for (let i = 0; i < this.count; i++) {
            if (this.life[i] <= 0) continue;

            // Quadratic B-Spline Weights
            const cellX = Math.floor(this.x[i] * invGrid);
            const cellY = Math.floor(this.y[i] * invGrid);
            const fx = this.x[i] * invGrid - cellX;
            const fy = this.y[i] * invGrid - cellY;

            // Weights
            const w = [
                [0.5 * (1.5 - fx) ** 2, 0.75 - (fx - 1) ** 2, 0.5 * (fx - 0.5) ** 2],
                [0.5 * (1.5 - fy) ** 2, 0.75 - (fy - 1) ** 2, 0.5 * (fy - 0.5) ** 2]
            ];

            // Constitutive Model (Neo-Hookean)
            // F = [F00 F01]
            //     [F10 F11]
            const F00 = this.F00[i]; const F01 = this.F01[i];
            const F10 = this.F10[i]; const F11 = this.F11[i];

            // J = det(F)
            const J = F00 * F11 - F01 * F10;
            // Clamping J to prevent inversion instability
            // const clampedJ = Math.max(0.1, Math.min(J, 5.0));

            // Stress P = mu * (F - F^-T) + lambda * log(J) * F^-T
            // F^-T = 1/J * [F11 -F10]
            //             [-F01 F00]

            // Term 1: mu * F
            let P00 = HARDENING * F00;
            let P01 = HARDENING * F01;
            let P10 = HARDENING * F10;
            let P11 = HARDENING * F11;

            // Term 2: (mu - lambda * log(J)) * F^-T
            const invJ = 1.0 / J;
            const logJ = Math.log(J); // Or clampedJ
            const term2Coef = HARDENING - (BULK_MODULUS * logJ); // Note sign: energy derivation often P = mu(F - F^-T) + lambda logJ F^-T.
            // Wait, standard NH: Psi = mu/2 (tr(F^T F) - 2 - 2lnJ) + lambda/2 (lnJ)^2
            // P = dPsi/dF = mu(F - F^-T) + lambda lnJ F^-T
            // So coef is (mu - lambda * lnJ) is WRONG.
            // It is: mu * F + (lambda * lnJ - mu) * F^-T.

            const coef = (BULK_MODULUS * logJ) - HARDENING;

            P00 += coef * (F11 * invJ);
            P01 += coef * (-F10 * invJ);
            P10 += coef * (-F01 * invJ);
            P11 += coef * (F00 * invJ);

            // Force = -Volume * P * F^T (Projected to grid? No, MPM way)
            // Force integral logic usually involves: Stress * WeightGradient.
            // Simplified APIC/MLS-MPM formulation:
            // Stress acts as an affine momentum update.
            // EQ: affine += -dt * Volume * Stress * invDX * invDX? Actually Dp inverse...

            // Standard MLS-MPM affine term update:
            // eq_16_term = - volume * 4 * invGrid * invGrid * Stress * dt
            // But we do forces on grid.
            // Let's use the standard "Stress contributes to affine momentum" approach.

            const stressScale = -DT * this.volume[i] * 4 * invGrid * invGrid;

            // Add stress to affine matrix C
            // C is velocity gradient approximation.
            // We fuse the stress force into the momentum transfer.
            const fusedC00 = this.C00[i] + stressScale * P00;
            const fusedC01 = this.C01[i] + stressScale * P01;
            const fusedC10 = this.C10[i] + stressScale * P10;
            const fusedC11 = this.C11[i] + stressScale * P11;

            const mass = this.mass[i];

            // Scatter to 3x3 Grid
            for (let gx = 0; gx < 3; gx++) {
                for (let gy = 0; gy < 3; gy++) {
                    const weight = w[0][gx] * w[1][gy];
                    const dpos_x = (gx - fx + 0.5) * GRID_SPACING; // Distance grid node to particle
                    const dpos_y = (gy - fy + 0.5) * GRID_SPACING;

                    const gridIdx = (cellX + gx) + (cellY + gy) * this.gridWidth;

                    if (gridIdx >= 0 && gridIdx < this.gridMass.length) {
                        // Q = C * dpos
                        const Qx = fusedC00 * dpos_x + fusedC01 * dpos_y;
                        const Qy = fusedC10 * dpos_x + fusedC11 * dpos_y;

                        this.gridMass[gridIdx] += weight * mass;
                        // Velocity + Affine Momentum
                        this.gridVelX[gridIdx] += weight * (mass * this.u[i] + Qx);
                        this.gridVelY[gridIdx] += weight * (mass * this.v[i] + Qy);
                    }
                }
            }
        }

        // --- STEP 2: GRID UPDATE ---
        for (let i = 0; i < this.gridMass.length; i++) {
            const m = this.gridMass[i];
            if (m > 0.0001) {
                // Normalize momentum to velocity
                this.gridVelX[i] /= m;
                this.gridVelY[i] /= m;

                // Gravity / External Forces
                // this.gridVelY[i] += 0.1; // Mild gravity?

                // Boundary Conditions (Stick/Slip)
                const x = (i % this.gridWidth) * GRID_SPACING;
                const y = Math.floor(i / this.gridWidth) * GRID_SPACING;

                if (x < GRID_SPACING || x > (this.gridWidth - 2) * GRID_SPACING) this.gridVelX[i] *= -0.5;
                if (y < GRID_SPACING || y > (this.gridHeight - 2) * GRID_SPACING) this.gridVelY[i] *= -0.5;
            } else {
                this.gridVelX[i] = 0;
                this.gridVelY[i] = 0;
            }
        }

        // --- STEP 3: GRID TO PARTICLES (G2P) ---
        // Compact the particle list (remove dead ones)
        let activeCount = 0;
        for (let i = 0; i < this.count; i++) {
            if (this.life[i] <= 0) continue;

            // Shift if needed
            if (i !== activeCount) {
                // Copy all props (Manual SoA copy is painful but fast)
                this.x[activeCount] = this.x[i]; this.y[activeCount] = this.y[i];
                this.u[activeCount] = this.u[i]; this.v[activeCount] = this.v[i];
                this.F00[activeCount] = this.F00[i]; this.F01[activeCount] = this.F01[i];
                this.F10[activeCount] = this.F10[i]; this.F11[activeCount] = this.F11[i];
                this.C00[activeCount] = this.C00[i]; this.C01[activeCount] = this.C01[i];
                this.C10[activeCount] = this.C10[i]; this.C11[activeCount] = this.C11[i];
                this.mass[activeCount] = this.mass[i]; this.volume[activeCount] = this.volume[i];
                this.life[activeCount] = this.life[i];
                this.colorR[activeCount] = this.colorR[i];
                this.colorG[activeCount] = this.colorG[i];
                this.colorB[activeCount] = this.colorB[i];
            }
            const currentIdx = activeCount;
            activeCount++;

            // Update Logic
            const cellX = Math.floor(this.x[currentIdx] * invGrid);
            const cellY = Math.floor(this.y[currentIdx] * invGrid);
            const fx = this.x[currentIdx] * invGrid - cellX;
            const fy = this.y[currentIdx] * invGrid - cellY;
            const w = [
                [0.5 * (1.5 - fx) ** 2, 0.75 - (fx - 1) ** 2, 0.5 * (fx - 0.5) ** 2],
                [0.5 * (1.5 - fy) ** 2, 0.75 - (fy - 1) ** 2, 0.5 * (fy - 0.5) ** 2]
            ];

            let newVx = 0, newVy = 0;
            let newC00 = 0, newC01 = 0, newC10 = 0, newC11 = 0;

            for (let gx = 0; gx < 3; gx++) {
                for (let gy = 0; gy < 3; gy++) {
                    const weight = w[0][gx] * w[1][gy];
                    const gridIdx = (cellX + gx) + (cellY + gy) * this.gridWidth;

                    if (gridIdx >= 0 && gridIdx < this.gridMass.length) {
                        const gvx = this.gridVelX[gridIdx];
                        const gvy = this.gridVelY[gridIdx];

                        const dpos_x = (gx - fx + 0.5) * GRID_SPACING;
                        const dpos_y = (gy - fy + 0.5) * GRID_SPACING;

                        newVx += weight * gvx;
                        newVy += weight * gvy;

                        // APIC B-matrix construction (4 * weight * vel * dpos) / grid_spacing^2 ??
                        // Simplified: C = 4 * Sum(weight * vel * dpos^T)
                        const cScale = 4 * weight * invGrid * invGrid;
                        newC00 += cScale * gvx * dpos_x;
                        newC01 += cScale * gvx * dpos_y;
                        newC10 += cScale * gvy * dpos_x;
                        newC11 += cScale * gvy * dpos_y;
                    }
                }
            }

            // Update Velocity & Position
            this.u[currentIdx] = newVx;
            this.v[currentIdx] = newVy;
            this.x[currentIdx] += newVx * DT * 60; // Scale to game time? Assuming DT matches frame
            this.y[currentIdx] += newVy * DT * 60;

            // Update Affine & Deformation Gradient
            this.C00[currentIdx] = newC00; this.C01[currentIdx] = newC01;
            this.C10[currentIdx] = newC10; this.C11[currentIdx] = newC11;

            // F_new = (I + dt * C) * F_old
            // Multiplicative update for finite strain
            // I + dt*C
            const id00 = 1 + DT * newC00; const id01 = DT * newC01;
            const id10 = DT * newC10; const id11 = 1 + DT * newC11;

            const oldF00 = this.F00[currentIdx]; const oldF01 = this.F01[currentIdx];
            const oldF10 = this.F10[currentIdx]; const oldF11 = this.F11[currentIdx];

            this.F00[currentIdx] = id00 * oldF00 + id01 * oldF10;
            this.F01[currentIdx] = id00 * oldF01 + id01 * oldF11;
            this.F10[currentIdx] = id10 * oldF00 + id11 * oldF10;
            this.F11[currentIdx] = id10 * oldF01 + id11 * oldF11;

            // Decay Life
            this.life[currentIdx] -= 0.01;
        }
        this.count = activeCount;
    }
}
