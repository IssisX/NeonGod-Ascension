import { CONFIG } from '../constants';
import { Entity } from '../types';
import { Utils } from '../utils';

export class SpatialGrid {
  cellSize: number;
  cellSizeInv: number;
  cells: Map<string, Entity[]>;
  results: Entity[];

  constructor(cellSize = 128) {
    this.cellSize = cellSize;
    this.cellSizeInv = 1 / cellSize;
    this.cells = new Map();
    this.results = [];
  }
  
  clear() { this.cells.clear(); }
  
  insert(entity: Entity) {
    const key = `${Math.floor(entity.x * this.cellSizeInv)},${Math.floor(entity.y * this.cellSizeInv)}`;
    let cell = this.cells.get(key);
    if (!cell) { cell = []; this.cells.set(key, cell); }
    cell.push(entity);
  }
  
  queryRadius(x: number, y: number, radius: number) {
    this.results.length = 0;
    const minCx = Math.floor((x - radius) * this.cellSizeInv);
    const maxCx = Math.floor((x + radius) * this.cellSizeInv);
    const minCy = Math.floor((y - radius) * this.cellSizeInv);
    const maxCy = Math.floor((y + radius) * this.cellSizeInv);
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const cell = this.cells.get(`${cx},${cy}`);
        if (cell) for (let i = 0; i < cell.length; i++) this.results.push(cell[i]);
      }
    }
    return this.results;
  }
}

interface EtherParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  color: string;
}

// Navier-Stokes Fluid Solver
// Based on Jos Stam's "Real-Time Fluid Dynamics for Games"
export class VisualGrid {
  size: number;
  N: number;
  iter: number;
  width: number;
  height: number;
  cols: number;
  rows: number;

  // Fluid Fields
  density: Float32Array;
  s: Float32Array; // Previous density
  vx: Float32Array;
  vy: Float32Array;
  vx0: Float32Array;
  vy0: Float32Array;

  particles: EtherParticle[];

  constructor(width: number, height: number, cellSize = CONFIG.ETHER.CELL_SIZE) {
    this.size = cellSize;
    this.width = width;
    this.height = height;
    this.cols = Math.ceil(width / cellSize) + 2;
    this.rows = Math.ceil(height / cellSize) + 2;
    this.iter = 4; // Solver iterations (lower = faster, higher = more accurate)

    const count = this.cols * this.rows;
    this.density = new Float32Array(count);
    this.s = new Float32Array(count);
    this.vx = new Float32Array(count);
    this.vy = new Float32Array(count);
    this.vx0 = new Float32Array(count);
    this.vy0 = new Float32Array(count);

    this.particles = [];
    this.rebuild(width, height);
  }

  rebuild(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.cols = Math.ceil(width / this.size) + 2;
    this.rows = Math.ceil(height / this.size) + 2;

    const count = this.cols * this.rows;
    if (this.density.length !== count) {
        this.density = new Float32Array(count);
        this.s = new Float32Array(count);
        this.vx = new Float32Array(count);
        this.vy = new Float32Array(count);
        this.vx0 = new Float32Array(count);
        this.vy0 = new Float32Array(count);
    } else {
        // Clear existing
        this.density.fill(0); this.s.fill(0);
        this.vx.fill(0); this.vy.fill(0);
        this.vx0.fill(0); this.vy0.fill(0);
    }
    
    // Initialize Particles
    this.particles = [];
    const particleCount = CONFIG.QUALITY.TIERS.HIGH.etherParticles;
    for(let i=0; i<particleCount; i++) {
        this.particles.push({
            x: Math.random() * width,
            y: Math.random() * height,
            vx: 0, vy: 0,
            alpha: Math.random() * 0.5 + 0.1,
            color: Math.random() > 0.8 ? '#00f3ff' : '#4d4d80'
        });
    }
  }

  // --- SOLVER METHODS ---

  IX(x: number, y: number) {
      return x + y * this.cols;
  }

  addDensity(x: number, y: number, amount: number) {
      const cx = Math.floor(x / this.size);
      const cy = Math.floor(y / this.size);
      if (cx >= 0 && cx < this.cols && cy >= 0 && cy < this.rows) {
        const idx = this.IX(cx, cy);
        this.density[idx] += amount;
        if(this.density[idx] > 255) this.density[idx] = 255;
      }
  }

  // Remove density (Cavitation)
  removeDensity(x: number, y: number, radius: number) {
      const cx = Math.floor(x / this.size);
      const cy = Math.floor(y / this.size);
      const radCells = Math.ceil(radius / this.size);

      for(let i = -radCells; i <= radCells; i++) {
          for(let j = -radCells; j <= radCells; j++) {
              const idxX = cx + i;
              const idxY = cy + j;
              if (idxX >= 0 && idxX < this.cols && idxY >= 0 && idxY < this.rows) {
                  this.density[this.IX(idxX, idxY)] *= 0.5; // Diminish rapidly
              }
          }
      }
  }

  addVelocity(x: number, y: number, amountX: number, amountY: number) {
      const cx = Math.floor(x / this.size);
      const cy = Math.floor(y / this.size);
      if (cx >= 0 && cx < this.cols && cy >= 0 && cy < this.rows) {
        const index = this.IX(cx, cy);
        this.vx[index] += amountX;
        this.vy[index] += amountY;
      }
  }

  // Inject radial force (e.g., explosions)
  applyForce(x: number, y: number, radius: number, strength: number) {
      const cx = Math.floor(x / this.size);
      const cy = Math.floor(y / this.size);
      const radCells = Math.ceil(radius / this.size);

      for (let i = -radCells; i <= radCells; i++) {
          for (let j = -radCells; j <= radCells; j++) {
              const idxX = cx + i;
              const idxY = cy + j;
              if (idxX > 0 && idxX < this.cols-1 && idxY > 0 && idxY < this.rows-1) {
                  const px = idxX * this.size;
                  const py = idxY * this.size;
                  const dx = px - x;
                  const dy = py - y;
                  const dSq = dx*dx + dy*dy;
                  if (dSq < radius*radius && dSq > 0) {
                      const d = Math.sqrt(dSq);
                      const f = (1 - d/radius) * strength;
                      const ang = Math.atan2(dy, dx);
                      this.vx[this.IX(idxX, idxY)] += Math.cos(ang) * f;
                      this.vy[this.IX(idxX, idxY)] += Math.sin(ang) * f;
                      this.density[this.IX(idxX, idxY)] += f * 0.1;
                  }
              }
          }
      }
  }

  diffuse(b: number, x: Float32Array, x0: Float32Array, diff: number, dt: number) {
      const a = dt * diff * (this.cols - 2) * (this.rows - 2);
      this.lin_solve(b, x, x0, a, 1 + 6 * a);
  }

  lin_solve(b: number, x: Float32Array, x0: Float32Array, a: number, c: number) {
      const cRecip = 1.0 / c;
      for (let k = 0; k < this.iter; k++) {
          for (let j = 1; j < this.rows - 1; j++) {
              for (let i = 1; i < this.cols - 1; i++) {
                  const ix = this.IX(i, j);
                  x[ix] = (x0[ix] + a * (x[this.IX(i+1, j)] + x[this.IX(i-1, j)] + x[this.IX(i, j+1)] + x[this.IX(i, j-1)])) * cRecip;
              }
          }
          this.set_bnd(b, x);
      }
  }

  project(velocX: Float32Array, velocY: Float32Array, p: Float32Array, div: Float32Array) {
      const h = 1.0 / this.cols; // Assuming square cells roughly

      for (let j = 1; j < this.rows - 1; j++) {
          for (let i = 1; i < this.cols - 1; i++) {
              div[this.IX(i, j)] = -0.5 * h * (velocX[this.IX(i+1, j)] - velocX[this.IX(i-1, j)] + velocY[this.IX(i, j+1)] - velocY[this.IX(i, j-1)]);
              p[this.IX(i, j)] = 0;
          }
      }
      this.set_bnd(0, div);
      this.set_bnd(0, p);
      this.lin_solve(0, p, div, 1, 6); // Poisson equation

      for (let j = 1; j < this.rows - 1; j++) {
          for (let i = 1; i < this.cols - 1; i++) {
              velocX[this.IX(i, j)] -= 0.5 * (p[this.IX(i+1, j)] - p[this.IX(i-1, j)]) / h;
              velocY[this.IX(i, j)] -= 0.5 * (p[this.IX(i, j+1)] - p[this.IX(i, j-1)]) / h;
          }
      }
      this.set_bnd(1, velocX);
      this.set_bnd(2, velocY);
  }

  advect(b: number, d: Float32Array, d0: Float32Array, velocX: Float32Array, velocY: Float32Array, dt: number) {
      let i0, i1, j0, j1;
      let x, y, s0, t0, s1, t1;
      const dtx = dt * (this.cols - 2);
      const dty = dt * (this.rows - 2);

      for (let j = 1; j < this.rows - 1; j++) {
          for (let i = 1; i < this.cols - 1; i++) {
              x = i - dtx * velocX[this.IX(i, j)];
              y = j - dty * velocY[this.IX(i, j)];

              if (x < 0.5) x = 0.5; if (x > this.cols - 1.5) x = this.cols - 1.5;
              i0 = Math.floor(x); i1 = i0 + 1;

              if (y < 0.5) y = 0.5; if (y > this.rows - 1.5) y = this.rows - 1.5;
              j0 = Math.floor(y); j1 = j0 + 1;

              s1 = x - i0; s0 = 1.0 - s1;
              t1 = y - j0; t0 = 1.0 - t1;

              d[this.IX(i, j)] = s0 * (t0 * d0[this.IX(i0, j0)] + t1 * d0[this.IX(i0, j1)]) +
                                 s1 * (t0 * d0[this.IX(i1, j0)] + t1 * d0[this.IX(i1, j1)]);
          }
      }
      this.set_bnd(b, d);
  }

  set_bnd(b: number, x: Float32Array) {
      for (let i = 1; i < this.cols - 1; i++) {
          x[this.IX(i, 0)] = b === 2 ? -x[this.IX(i, 1)] : x[this.IX(i, 1)];
          x[this.IX(i, this.rows - 1)] = b === 2 ? -x[this.IX(i, this.rows - 2)] : x[this.IX(i, this.rows - 2)];
      }
      for (let j = 1; j < this.rows - 1; j++) {
          x[this.IX(0, j)] = b === 1 ? -x[this.IX(1, j)] : x[this.IX(1, j)];
          x[this.IX(this.cols - 1, j)] = b === 1 ? -x[this.IX(this.cols - 2, j)] : x[this.IX(this.cols - 2, j)];
      }

      x[this.IX(0, 0)] = 0.5 * (x[this.IX(1, 0)] + x[this.IX(0, 1)]);
      x[this.IX(0, this.rows - 1)] = 0.5 * (x[this.IX(1, this.rows - 1)] + x[this.IX(0, this.rows - 2)]);
      x[this.IX(this.cols - 1, 0)] = 0.5 * (x[this.IX(this.cols - 2, 0)] + x[this.IX(this.cols - 1, 1)]);
      x[this.IX(this.cols - 1, this.rows - 1)] = 0.5 * (x[this.IX(this.cols - 2, this.rows - 1)] + x[this.IX(this.cols - 1, this.rows - 2)]);
  }

  // Retrieve velocity at world coordinate (bilinear interpolation)
  getVelocityAt(x: number, y: number): { vx: number, vy: number } {
      const cx = x / this.size;
      const cy = y / this.size;

      if (cx < 0.5 || cx >= this.cols - 1.5 || cy < 0.5 || cy >= this.rows - 1.5) return { vx: 0, vy: 0 };

      const i0 = Math.floor(cx); const i1 = i0 + 1;
      const j0 = Math.floor(cy); const j1 = j0 + 1;

      const s1 = cx - i0; const s0 = 1.0 - s1;
      const t1 = cy - j0; const t0 = 1.0 - t1;

      const vx = s0 * (t0 * this.vx[this.IX(i0, j0)] + t1 * this.vx[this.IX(i0, j1)]) +
                 s1 * (t0 * this.vx[this.IX(i1, j0)] + t1 * this.vx[this.IX(i1, j1)]);

      const vy = s0 * (t0 * this.vy[this.IX(i0, j0)] + t1 * this.vy[this.IX(i0, j1)]) +
                 s1 * (t0 * this.vy[this.IX(i1, j0)] + t1 * this.vy[this.IX(i1, j1)]);

      return { vx, vy };
  }

  update(dt = 0.1) {
      // 0. Apply Drag (Decay)
      for(let i=0; i<this.vx.length; i++) {
          this.vx[i] *= 0.99;
          this.vy[i] *= 0.99;
      }

      // 1. Solve Velocity
      // Swap pointers if we were in C++, here we just copy/swap logic implicitly by passing args
      // Diffuse
      this.diffuse(1, this.vx0, this.vx, 0.0001, dt);
      this.diffuse(2, this.vy0, this.vy, 0.0001, dt);

      // Project
      this.project(this.vx0, this.vy0, this.vx, this.vy); // Use vx/vy as scratch

      // Advect
      this.advect(1, this.vx, this.vx0, this.vx0, this.vy0, dt);
      this.advect(2, this.vy, this.vy0, this.vx0, this.vy0, dt);

      // Project
      this.project(this.vx, this.vy, this.vx0, this.vy0);

      // 2. Solve Density
      this.diffuse(0, this.s, this.density, 0.0001, dt);
      this.advect(0, this.density, this.s, this.vx, this.vy, dt);

      // 3. Fade Density
      for(let i=0; i<this.density.length; i++) this.density[i] *= 0.99;

      // 4. Update Particles (Advect them by fluid velocity)
      for (const p of this.particles) {
          const v = this.getVelocityAt(p.x, p.y);
          p.vx = p.vx * 0.9 + v.vx * 50 * 0.1; // Fluid pushes particles
          p.vy = p.vy * 0.9 + v.vy * 50 * 0.1;
          p.x += p.vx;
          p.y += p.vy;

          if (p.x < 0) p.x += this.width;
          if (p.x > this.width) p.x -= this.width;
          if (p.y < 0) p.y += this.height;
          if (p.y > this.height) p.y -= this.height;
      }
  }

  render(ctx: CanvasRenderingContext2D, step = 1) {
    // Render Fluid Density as subtle background fog (The Aether)
    for (let j = 0; j < this.rows; j++) {
        for (let i = 0; i < this.cols; i++) {
            const d = this.density[this.IX(i, j)];
            if (d > 0.1) { // Threshold to save draw calls
                // Density mapping: Low -> Deep Blue, High -> Cyan/White
                const alpha = Math.min(0.3, d * 0.005);
                ctx.fillStyle = `rgba(0, 243, 255, ${alpha})`;
                // Overlap slightly to avoid grid lines
                ctx.fillRect(i * this.size - 1, j * this.size - 1, this.size + 2, this.size + 2);
            }
        }
    }

    // Render Particles as Flow Vectors
    ctx.lineWidth = 1;
    for (const p of this.particles) {
        const speed = Math.hypot(p.vx, p.vy);
        const alpha = Math.min(0.8, p.alpha + speed * 0.2);
        
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = alpha;
        
        // Draw as trail/streak aligned with velocity
        if (speed > 1.0) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - p.vx * 3, p.y - p.vy * 3);
            ctx.stroke();
        } else {
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, 1.5, 1.5);
        }
    }
    ctx.globalAlpha = 1;
  }
}
