import { CONFIG } from '../constants';
import { Entity } from '../types';
import { Utils } from '../utils';

// --- HIGH-PERFORMANCE SPATIAL HASH ---
// Replaces Map<string, Entity[]> with a flat 1D array indexed by integers.
// O(1) insertion, O(1) lookup, Zero Garbage Collection during update loop.
export class SpatialGrid {
  cellSize: number;
  cols: number;
  rows: number;
  grid: Entity[][]; // Flat array of arrays
  results: Entity[];
  width: number;
  height: number;

  constructor(cellSize = 128) {
    this.cellSize = cellSize;
    this.results = [];
    this.grid = [];
    this.cols = 0;
    this.rows = 0;
    this.width = 0;
    this.height = 0;
  }

  // Must resize if window changes, but usually static in game loop
  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.cols = Math.ceil(width / this.cellSize) + 1;
    this.rows = Math.ceil(height / this.cellSize) + 1;
    
    // Pre-allocate buckets to avoid GC thrashing
    const size = this.cols * this.rows;
    this.grid = new Array(size);
    for (let i = 0; i < size; i++) {
        this.grid[i] = [];
    }
  }
  
  clear() {
    const len = this.grid.length;
    for (let i = 0; i < len; i++) {
        // Fast clear without releasing the array instance
        this.grid[i].length = 0;
    }
  }
  
  insert(entity: Entity) {
    // Fast Integer Math
    const cx = (entity.x / this.cellSize) | 0; // Bitwise floor
    const cy = (entity.y / this.cellSize) | 0;
    
    // Boundary checks (handle off-screen entities gracefully)
    if (cx >= 0 && cx < this.cols && cy >= 0 && cy < this.rows) {
        const idx = cy * this.cols + cx;
        this.grid[idx].push(entity);
    }
  }
  
  queryRadius(x: number, y: number, radius: number) {
    this.results.length = 0;
    
    const minCx = Math.floor((x - radius) / this.cellSize);
    const maxCx = Math.floor((x + radius) / this.cellSize);
    const minCy = Math.floor((y - radius) / this.cellSize);
    const maxCy = Math.floor((y + radius) / this.cellSize);

    // Optimized bounding box loop
    for (let cy = minCy; cy <= maxCy; cy++) {
        if (cy < 0 || cy >= this.rows) continue;
        const rowOffset = cy * this.cols;
        
        for (let cx = minCx; cx <= maxCx; cx++) {
            if (cx < 0 || cx >= this.cols) continue;
            
            const cell = this.grid[rowOffset + cx];
            const len = cell.length;
            // Unroll loop slightly for common low counts? No, V8 handles this well.
            for (let i = 0; i < len; i++) {
                this.results.push(cell[i]);
            }
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

// --- DOUBLE-BUFFERED FLUID SOLVER ---
// Implements simplified Navier-Stokes Advection + Diffusion.
// Uses two buffers (read/write) to allow self-referential updates without artifacts.
export class VisualGrid {
  cellSize: number;
  cols: number;
  rows: number;
  width: number;
  height: number;
  
  // Double Buffer for Velocity and Temperature Fields
  // 0: Current (Read), 1: Next (Write)
  vx: [Float32Array, Float32Array];
  vy: [Float32Array, Float32Array];
  temp: [Float32Array, Float32Array]; // Thermodynamic Temperature Field
  bufferIdx: number = 0; // The active read buffer

  particles: EtherParticle[];

  constructor(width: number, height: number, cellSize = CONFIG.ETHER.CELL_SIZE) {
    this.cellSize = cellSize;
    this.width = width;
    this.height = height;
    
    this.cols = Math.ceil(width / cellSize) + 2;
    this.rows = Math.ceil(height / cellSize) + 2;
    
    const size = this.cols * this.rows;
    this.vx = [new Float32Array(size), new Float32Array(size)];
    this.vy = [new Float32Array(size), new Float32Array(size)];
    this.temp = [new Float32Array(size), new Float32Array(size)];
    
    this.particles = [];
    this.rebuild(width, height);
  }

  rebuild(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.cols = Math.ceil(width / this.cellSize) + 2;
    this.rows = Math.ceil(height / this.cellSize) + 2;
    
    const size = this.cols * this.rows;
    this.vx = [new Float32Array(size), new Float32Array(size)];
    this.vy = [new Float32Array(size), new Float32Array(size)];
    this.temp = [new Float32Array(size), new Float32Array(size)];
    
    // Initialize Ether Particles
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

  // Inject energy into the CURRENT write buffer
  applyForce(x: number, y: number, radius: number, strength: number, heat = 0) {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    const radCells = Math.ceil(radius / this.cellSize);
    const str = strength * 0.5;

    // Write to the current Read buffer immediately for instant feedback
    // (Technically slightly wrong for physics, but feels more responsive for games)
    const fieldVx = this.vx[this.bufferIdx];
    const fieldVy = this.vy[this.bufferIdx];
    const fieldTemp = this.temp[this.bufferIdx];

    for (let i = -radCells; i <= radCells; i++) {
      for (let j = -radCells; j <= radCells; j++) {
        const idxX = cx + i;
        const idxY = cy + j;
        
        if (idxX >= 0 && idxX < this.cols && idxY >= 0 && idxY < this.rows) {
             const cellX = idxX * this.cellSize;
             const cellY = idxY * this.cellSize;
             const dx = cellX - x;
             const dy = cellY - y;
             const distSq = dx*dx + dy*dy;
             const rSq = radius*radius;
             
             if (distSq < rSq) {
                 const dist = Math.sqrt(distSq);
                 const force = (1 - dist / radius) * str;
                 
                 const idx = idxY * this.cols + idxX;
                 if (dist > 0) {
                     fieldVx[idx] += (dx / dist) * force;
                     fieldVy[idx] += (dy / dist) * force;
                 }
                 if (heat !== 0) {
                     fieldTemp[idx] += force * heat;
                 }
             }
        }
      }
    }
  }
  
  addVelocity(x: number, y: number, vx: number, vy: number) {
      const cx = (x / this.cellSize) | 0;
      const cy = (y / this.cellSize) | 0;
      if (cx >= 0 && cx < this.cols && cy >= 0 && cy < this.rows) {
          const idx = cy * this.cols + cx;
          const fieldVx = this.vx[this.bufferIdx];
          const fieldVy = this.vy[this.bufferIdx];
          fieldVx[idx] += vx * 0.5;
          fieldVy[idx] += vy * 0.5;
      }
  }

  sampleVelocity(x: number, y: number) {
      const cx = (x / this.cellSize) | 0;
      const cy = (y / this.cellSize) | 0;
      if (cx >= 0 && cx < this.cols && cy >= 0 && cy < this.rows) {
          const idx = cy * this.cols + cx;
          return { vx: this.vx[this.bufferIdx][idx], vy: this.vy[this.bufferIdx][idx], temp: this.temp[this.bufferIdx][idx] };
      }
      return { vx: 0, vy: 0, temp: 0 };
  }

  update(step = 1) {
    const readIdx = this.bufferIdx;
    const writeIdx = (readIdx + 1) % 2;
    
    const rVx = this.vx[readIdx];
    const rVy = this.vy[readIdx];
    const rTemp = this.temp[readIdx];
    const wVx = this.vx[writeIdx];
    const wVy = this.vy[writeIdx];
    const wTemp = this.temp[writeIdx];

    const decay = CONFIG.ETHER.DRAG;
    const diffusion = CONFIG.ETHER.DIFFUSION; 
    
    // --- FLUID SOLVER STEP ---
    // 1. Diffusion (Blur) + Decay
    // For proper stability, diffusion should be an iterative Gauss-Seidel solve.
    // Here we do a simple neighbor average for performance (O(N) single pass).
    
    for (let y = 1; y < this.rows - 1; y++) {
        const rowOffset = y * this.cols;
        for (let x = 1; x < this.cols - 1; x++) {
            const i = rowOffset + x;
            
            // Neighbor indices
            const iL = i - 1;
            const iR = i + 1;
            const iU = i - this.cols;
            const iD = i + this.cols;
            
            // Laplacian smoothing (Diffusion)
            // NewVal = CurrentVal + Diffusion * (AverageNeighbors - CurrentVal)
            const avgVx = (rVx[iL] + rVx[iR] + rVx[iU] + rVx[iD]) * 0.25;
            const avgVy = (rVy[iL] + rVy[iR] + rVy[iU] + rVy[iD]) * 0.25;
            const avgTemp = (rTemp[iL] + rTemp[iR] + rTemp[iU] + rTemp[iD]) * 0.25;
            
            // Write to next buffer
            wVx[i] = Utils.lerp(rVx[i], avgVx, diffusion) * decay;

            // SPECTACULAR: Thermodynamic Buoyancy
            // Hotter areas rise (subtract from vy)
            const buoyancy = rTemp[i] * 0.15;
            wVy[i] = (Utils.lerp(rVy[i], avgVy, diffusion) - buoyancy) * decay;

            wTemp[i] = Utils.lerp(rTemp[i], avgTemp, diffusion * 0.5) * 0.95; // Temp dissipates faster
        }
    }
    
    // 2. Advection (Self-Transport)
    // Velocities should move... along the velocity field.
    // Backtrace method: Look back in time where the fluid came from.
    const dt = 1.0; 
    // Note: Implementing full Semi-Lagrangian advection is expensive in JS.
    // We will simulate it by having Particles carry momentum, which is handled below.
    // For the grid itself, the diffusion step provides enough "spread".

    // Flip Buffers
    this.bufferIdx = writeIdx;

    // 3. Particle Advection
    const currVx = this.vx[this.bufferIdx];
    const currVy = this.vy[this.bufferIdx];

    for (const p of this.particles) {
        // Sample Grid Velocity
        const cx = (p.x / this.cellSize) | 0;
        const cy = (p.y / this.cellSize) | 0;
        
        let gvx = 0, gvy = 0;
        if (cx >= 0 && cx < this.cols && cy >= 0 && cy < this.rows) {
            const idx = cy * this.cols + cx;
            gvx = currVx[idx];
            gvy = currVy[idx];
        }

        // Fluid Momentum Transfer
        // Particles gain velocity from grid
        p.vx = Utils.lerp(p.vx, gvx, 0.2);
        p.vy = Utils.lerp(p.vy, gvy, 0.2);
        
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        // Wrap around screen
        if (p.x < 0) p.x += this.width;
        else if (p.x > this.width) p.x -= this.width;
        if (p.y < 0) p.y += this.height;
        else if (p.y > this.height) p.y -= this.height;
    }
  }

  render(ctx: CanvasRenderingContext2D, step = 1) {
    // Render Particles (The Dust)
    for (const p of this.particles) {
        const speedSq = p.vx*p.vx + p.vy*p.vy;
        
        // Hide stationary particles to reduce visual noise
        if (speedSq < 0.1) continue;
        
        const alpha = Math.min(1, p.alpha + speedSq * 0.1);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = alpha;
        
        const size = speedSq > 4 ? 2 : 1;
        ctx.fillRect(p.x, p.y, size, size);
    }
    
    // Debug: Render Vector Field Vectors (Optional, normally disabled)
    /*
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    const fieldVx = this.vx[this.bufferIdx];
    const fieldVy = this.vy[this.bufferIdx];
    for(let y=0; y<this.rows; y+=2) {
        for(let x=0; x<this.cols; x+=2) {
            const i = y*this.cols + x;
            const vx = fieldVx[i];
            const vy = fieldVy[i];
            if(Math.abs(vx) > 0.5 || Math.abs(vy) > 0.5) {
                const px = x * this.cellSize;
                const py = y * this.cellSize;
                ctx.beginPath();
                ctx.moveTo(px, py);
                ctx.lineTo(px + vx * 5, py + vy * 5);
                ctx.stroke();
            }
        }
    }
    */
  }
}