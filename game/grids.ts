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

// Navier-Stokes Fluid Solver (RGB Variant)
export class VisualGrid {
  size: number;
  N: number;
  iter: number;
  width: number;
  height: number;
  cols: number;
  rows: number;

  // Color Density Fields (R, G, B)
  r: Float32Array; rPrev: Float32Array;
  g: Float32Array; gPrev: Float32Array;
  b: Float32Array; bPrev: Float32Array;

  // Velocity Field
  vx: Float32Array;
  vy: Float32Array;
  vx0: Float32Array;
  vy0: Float32Array;

  // Thermodynamic Field
  temperature: Float32Array;
  temperaturePrev: Float32Array;

  particles: EtherParticle[];

  constructor(width: number, height: number, cellSize = CONFIG.ETHER.CELL_SIZE) {
    this.size = cellSize;
    this.width = width;
    this.height = height;
    this.cols = Math.ceil(width / cellSize) + 2;
    this.rows = Math.ceil(height / cellSize) + 2;
    this.iter = 4;

    const count = this.cols * this.rows;
    // 3 Channels for RGB Density
    this.r = new Float32Array(count); this.rPrev = new Float32Array(count);
    this.g = new Float32Array(count); this.gPrev = new Float32Array(count);
    this.b = new Float32Array(count); this.bPrev = new Float32Array(count);

    this.vx = new Float32Array(count);
    this.vy = new Float32Array(count);
    this.vx0 = new Float32Array(count);
    this.vy0 = new Float32Array(count);

    this.temperature = new Float32Array(count);
    this.temperaturePrev = new Float32Array(count);

    this.particles = [];
    this.rebuild(width, height);
  }

  rebuild(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.cols = Math.ceil(width / this.size) + 2;
    this.rows = Math.ceil(height / this.size) + 2;

    const count = this.cols * this.rows;
    if (this.r.length !== count) {
        this.r = new Float32Array(count); this.rPrev = new Float32Array(count);
        this.g = new Float32Array(count); this.gPrev = new Float32Array(count);
        this.b = new Float32Array(count); this.bPrev = new Float32Array(count);
        this.vx = new Float32Array(count); this.vy = new Float32Array(count);
        this.vx0 = new Float32Array(count); this.vy0 = new Float32Array(count);
        this.temperature = new Float32Array(count); this.temperaturePrev = new Float32Array(count);
    } else {
        this.r.fill(0); this.rPrev.fill(0);
        this.g.fill(0); this.gPrev.fill(0);
        this.b.fill(0); this.bPrev.fill(0);
        this.vx.fill(0); this.vy.fill(0);
        this.vx0.fill(0); this.vy0.fill(0);
        this.temperature.fill(0); this.temperaturePrev.fill(0);
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

  IX(x: number, y: number) {
      return x + y * this.cols;
  }

  // Add RGB density from a hex color or default
  addHeat(x: number, y: number, amount: number) {
      const cx = Math.floor(x / this.size);
      const cy = Math.floor(y / this.size);
      if (cx >= 0 && cx < this.cols && cy >= 0 && cy < this.rows) {
          const idx = this.IX(cx, cy);
          this.temperature[idx] += amount;
      }
  }

  addDensity(x: number, y: number, amount: number, colorHex: string = '#ffffff') {
      const cx = Math.floor(x / this.size);
      const cy = Math.floor(y / this.size);

      // Parse Hex to RGB (0-1 approx)
      let r = 1, g = 1, b = 1;
      if (colorHex.startsWith('#')) {
          const hex = colorHex.substring(1);
          const bigint = parseInt(hex, 16);
          if (hex.length === 6) {
              r = ((bigint >> 16) & 255) / 255;
              g = ((bigint >> 8) & 255) / 255;
              b = (bigint & 255) / 255;
          }
      }

      if (cx >= 0 && cx < this.cols && cy >= 0 && cy < this.rows) {
        const idx = this.IX(cx, cy);
        this.r[idx] += amount * r;
        this.g[idx] += amount * g;
        this.b[idx] += amount * b;

        // Cap
        if(this.r[idx] > 255) this.r[idx] = 255;
        if(this.g[idx] > 255) this.g[idx] = 255;
        if(this.b[idx] > 255) this.b[idx] = 255;
      }
  }

  removeDensity(x: number, y: number, radius: number) {
      const cx = Math.floor(x / this.size);
      const cy = Math.floor(y / this.size);
      const radCells = Math.ceil(radius / this.size);

      for(let i = -radCells; i <= radCells; i++) {
          for(let j = -radCells; j <= radCells; j++) {
              const idxX = cx + i;
              const idxY = cy + j;
              if (idxX >= 0 && idxX < this.cols && idxY >= 0 && idxY < this.rows) {
                  const idx = this.IX(idxX, idxY);
                  this.r[idx] *= 0.5;
                  this.g[idx] *= 0.5;
                  this.b[idx] *= 0.5;
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
                      const idx = this.IX(idxX, idxY);
                      this.vx[idx] += Math.cos(ang) * f;
                      this.vy[idx] += Math.sin(ang) * f;
                      // Don't add density here, rely on explicit addDensity calls
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
      const h = 1.0 / this.cols;
      for (let j = 1; j < this.rows - 1; j++) {
          for (let i = 1; i < this.cols - 1; i++) {
              div[this.IX(i, j)] = -0.5 * h * (velocX[this.IX(i+1, j)] - velocX[this.IX(i-1, j)] + velocY[this.IX(i, j+1)] - velocY[this.IX(i, j-1)]);
              p[this.IX(i, j)] = 0;
          }
      }
      this.set_bnd(0, div);
      this.set_bnd(0, p);
      this.lin_solve(0, p, div, 1, 6);

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

  // Get interpolated density at world position (for lighting)
  getDensityAt(x: number, y: number): number {
      const cx = x / this.size;
      const cy = y / this.size;
      if (cx < 0.5 || cx >= this.cols - 1.5 || cy < 0.5 || cy >= this.rows - 1.5) return 0;
      const i0 = Math.floor(cx); const i1 = i0 + 1;
      const j0 = Math.floor(cy); const j1 = j0 + 1;
      const s1 = cx - i0; const s0 = 1.0 - s1;
      const t1 = cy - j0; const t0 = 1.0 - t1;

      // Sum RGB channels for total obstruction
      const getSum = (idx: number) => this.r[idx] + this.g[idx] + this.b[idx];

      const d = s0 * (t0 * getSum(this.IX(i0, j0)) + t1 * getSum(this.IX(i0, j1))) +
                s1 * (t0 * getSum(this.IX(i1, j0)) + t1 * getSum(this.IX(i1, j1)));
      return d;
  }

  update(dt = 0.1) {
      // 0. Apply Drag & Buoyancy
      for(let i=0; i<this.vx.length; i++) {
          this.vx[i] *= 0.99;
          this.vy[i] *= 0.99;

          // Buoyancy: Heat rises (y is down in canvas usually? check logic)
          // If y=0 is top, heat rises means y decreases.
          if (this.temperature[i] > 0.01) {
              this.vy[i] -= this.temperature[i] * 0.05; // Upward force
              this.temperature[i] *= 0.96; // Cooling
          }
      }

      // 0.5. Solve Temperature
      this.diffuse(0, this.temperaturePrev, this.temperature, 0.001, dt);
      this.advect(0, this.temperature, this.temperaturePrev, this.vx, this.vy, dt);

      // 1. Solve Velocity
      this.diffuse(1, this.vx0, this.vx, 0.0001, dt);
      this.diffuse(2, this.vy0, this.vy, 0.0001, dt);
      this.project(this.vx0, this.vy0, this.vx, this.vy);
      this.advect(1, this.vx, this.vx0, this.vx0, this.vy0, dt);
      this.advect(2, this.vy, this.vy0, this.vx0, this.vy0, dt);
      this.project(this.vx, this.vy, this.vx0, this.vy0);

      // 2. Solve Density (RGB Channels Independently)
      // Red
      this.diffuse(0, this.rPrev, this.r, 0.0001, dt);
      this.advect(0, this.r, this.rPrev, this.vx, this.vy, dt);
      // Green
      this.diffuse(0, this.gPrev, this.g, 0.0001, dt);
      this.advect(0, this.g, this.gPrev, this.vx, this.vy, dt);
      // Blue
      this.diffuse(0, this.bPrev, this.b, 0.0001, dt);
      this.advect(0, this.b, this.bPrev, this.vx, this.vy, dt);

      // 3. Fade Density
      for(let i=0; i<this.r.length; i++) {
          this.r[i] *= 0.985;
          this.g[i] *= 0.985;
          this.b[i] *= 0.985;
      }

      // 4. Update Particles
      for (const p of this.particles) {
          const v = this.getVelocityAt(p.x, p.y);
          p.vx = p.vx * 0.9 + v.vx * 50 * 0.1;
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
    // Render RGB Nebula
    // Drawing thousands of rects is slow.
    // Optimization: Draw to an ImageData buffer and put it?
    // Or just threshold heavily.

    // For 2D Canvas, `putImageData` is fastest for per-pixel operations.
    // But since `cellSize` is likely large (e.g. 32px or 64px), rects are fine.
    // Let's assume cellSize ~64. 1920/64 = 30 cols. 30*20 = 600 rects. Very fast.

    for (let j = 0; j < this.rows; j++) {
        for (let i = 0; i < this.cols; i++) {
            const idx = this.IX(i, j);
            const r = this.r[idx];
            const g = this.g[idx];
            const b = this.b[idx];

            const total = r + g + b;

            if (total > 5) { // Threshold
                const alpha = Math.min(0.4, total * 0.002);

                // Heat Visualization (Blackbody-ish shift)
                let temp = this.temperature[idx];
                let hr = 0, hg = 0;
                if (temp > 0) {
                    hr = Math.min(255, temp * 50);
                    hg = Math.min(100, temp * 20);
                }

                // Normalized Color
                const nr = Math.min(255, r * 2 + hr);
                const ng = Math.min(255, g * 2 + hg);
                const nb = Math.min(255, b * 2);

                ctx.fillStyle = `rgba(${nr}, ${ng}, ${nb}, ${alpha})`;
                // Slight overlap
                ctx.fillRect(i * this.size - 1, j * this.size - 1, this.size + 2, this.size + 2);
            }
        }
    }

    // Render Particles
    ctx.lineWidth = 1;
    for (const p of this.particles) {
        const speed = Math.hypot(p.vx, p.vy);
        const alpha = Math.min(0.8, p.alpha + speed * 0.2);
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = alpha;
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
