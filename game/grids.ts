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

// Replaces the old Spring Grid with a Velocity Field (Fluid-lite)
export class VisualGrid {
  cellSize: number;
  cols: number;
  rows: number;
  vx: Float32Array;
  vy: Float32Array;
  width: number;
  height: number;
  particles: EtherParticle[];

  constructor(width: number, height: number, cellSize = CONFIG.ETHER.CELL_SIZE) {
    this.cellSize = cellSize;
    this.width = width;
    this.height = height;
    this.cols = Math.ceil(width / cellSize) + 2;
    this.rows = Math.ceil(height / cellSize) + 2;
    this.vx = new Float32Array(this.cols * this.rows);
    this.vy = new Float32Array(this.cols * this.rows);
    this.particles = [];
    this.rebuild(width, height);
  }

  rebuild(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.cols = Math.ceil(width / this.cellSize) + 2;
    this.rows = Math.ceil(height / this.cellSize) + 2;
    this.vx = new Float32Array(this.cols * this.rows);
    this.vy = new Float32Array(this.cols * this.rows);
    
    // Initialize Ether Particles (The Dust)
    this.particles = [];
    const particleCount = CONFIG.QUALITY.TIERS.HIGH.etherParticles;
    for(let i=0; i<particleCount; i++) {
        this.particles.push({
            x: Math.random() * width,
            y: Math.random() * height,
            vx: 0, vy: 0,
            alpha: Math.random() * 0.5 + 0.1,
            color: Math.random() > 0.8 ? '#00f3ff' : '#4d4d80' // Cyan or Dark Blue
        });
    }
  }

  // Inject energy into the field
  applyForce(x: number, y: number, radius: number, strength: number) {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    const radCells = Math.ceil(radius / this.cellSize);
    const str = strength * 0.5; // Scale down for stability

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
                 const angle = Math.atan2(dy, dx);
                 
                 const arrayIdx = idxY * this.cols + idxX;
                 this.vx[arrayIdx] += Math.cos(angle) * force;
                 this.vy[arrayIdx] += Math.sin(angle) * force;
             }
        }
      }
    }
  }
  
  // Inject directed velocity (e.g. from a bullet)
  addVelocity(x: number, y: number, vx: number, vy: number) {
      const cx = Math.floor(x / this.cellSize);
      const cy = Math.floor(y / this.cellSize);
      if (cx >= 0 && cx < this.cols && cy >= 0 && cy < this.rows) {
          const idx = cy * this.cols + cx;
          this.vx[idx] += vx * 0.5;
          this.vy[idx] += vy * 0.5;
      }
  }

  update(step = 1) {
    // 1. Decay (Drag)
    for (let i = 0; i < this.vx.length; i++) {
        this.vx[i] *= CONFIG.ETHER.DRAG;
        this.vy[i] *= CONFIG.ETHER.DRAG;
    }

    // 2. Simple Diffusion (Blur the field to spread forces)
    // Note: Doing a full neighbor loop for every cell is heavy in JS. 
    // We skip diffusion for performance and rely on particle sampling to smooth it out.
    
    // 3. Update Particles (Advection)
    const dt = 1.0;
    for (const p of this.particles) {
        // Sample Grid Velocity
        const cx = Math.floor(p.x / this.cellSize);
        const cy = Math.floor(p.y / this.cellSize);
        
        let gvx = 0, gvy = 0;
        if (cx >= 0 && cx < this.cols && cy >= 0 && cy < this.rows) {
            const idx = cy * this.cols + cx;
            gvx = this.vx[idx];
            gvy = this.vy[idx];
        }

        p.vx = p.vx * 0.9 + gvx * 0.1; // Inertia
        p.vy = p.vy * 0.9 + gvy * 0.1;
        
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        // Wrap around screen
        if (p.x < 0) p.x += this.width;
        if (p.x > this.width) p.x -= this.width;
        if (p.y < 0) p.y += this.height;
        if (p.y > this.height) p.y -= this.height;
    }
  }

  render(ctx: CanvasRenderingContext2D, step = 1) {
    // Render the Ether Particles
    for (const p of this.particles) {
        const speed = Math.abs(p.vx) + Math.abs(p.vy);
        const alpha = Math.min(1, p.alpha + speed * 0.05);
        
        ctx.fillStyle = p.color;
        ctx.globalAlpha = alpha;
        
        const size = speed > 2 ? 1.5 : 1;
        ctx.fillRect(p.x, p.y, size, size);
    }
  }
}