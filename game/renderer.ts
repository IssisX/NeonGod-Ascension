import { CONFIG } from '../constants';
import { GameState, Light } from '../types';
import { Utils } from '../utils';

// --- OFFSCREEN BUFFERS ---
let bloomCanvas: HTMLCanvasElement | null = null;
let bloomCtx: CanvasRenderingContext2D | null = null;

const getBloomContext = (width: number, height: number) => {
    // Downsample for performance and natural blur
    const scale = 0.25;
    const w = Math.floor(width * scale);
    const h = Math.floor(height * scale);

    if (!bloomCanvas) {
        bloomCanvas = document.createElement('canvas');
        bloomCanvas.width = w;
        bloomCanvas.height = h;
        bloomCtx = bloomCanvas.getContext('2d');
    } else if (bloomCanvas.width !== w || bloomCanvas.height !== h) {
        bloomCanvas.width = w;
        bloomCanvas.height = h;
    }
    return { canvas: bloomCanvas, ctx: bloomCtx, scale };
};

// Helper for Procedural Lightning
const drawLightning = (ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, width: number, displace: number) => {
    if (displace < 2) {
        ctx.lineWidth = width;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    } else {
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        const normalX = -(y2 - y1);
        const normalY = (x2 - x1);
        const len = Math.sqrt(normalX * normalX + normalY * normalY);
        const offsetX = (normalX / len) * (Math.random() - 0.5) * displace;
        const offsetY = (normalY / len) * (Math.random() - 0.5) * displace;
        
        drawLightning(ctx, x1, y1, midX + offsetX, midY + offsetY, color, width, displace / 2);
        drawLightning(ctx, midX + offsetX, midY + offsetY, x2, y2, color, width, displace / 2);
    }
};

// Helper for Tentacles
const drawTentacle = (ctx: CanvasRenderingContext2D, t: any, color: string, width: number) => {
    if (!t.segments || t.segments.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(t.segments[0].x, t.segments[0].y);
    for (let i = 1; i < t.segments.length; i++) {
        // Quadratic Curve for smoothness
        const p0 = t.segments[i - 1];
        const p1 = t.segments[i];
        const midX = (p0.x + p1.x) / 2;
        const midY = (p0.y + p1.y) / 2;
        ctx.quadraticCurveTo(p0.x, p0.y, midX, midY);
    }
    ctx.lineTo(t.segments[t.segments.length - 1].x, t.segments[t.segments.length - 1].y);

    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    ctx.stroke();
};

// Procedural Harmongraph / Lissajous Drawing
const drawHarmonicEntity = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, type: string, seed: number, time: number) => {
    let freqX = 1, freqY = 1, mod = 0;

    switch (type) {
        case 'chaser': freqX = 3; freqY = 2; break;
        case 'kamikaze': freqX = 5; freqY = 4; break;
        case 'tank': freqX = 1; freqY = 1; mod = Math.PI/4; break;
        case 'shooter': freqX = 3; freqY = 1; break;
        case 'turret': freqX = 4; freqY = 4; break;
        case 'boss': freqX = 2.01; freqY = 3.01; break;
        default: freqX = 2; freqY = 3;
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    const phase = time * 0.1 + seed;
    const steps = 50;

    for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * Math.PI * 2;
        const rawX = Math.sin(freqX * t + phase + mod);
        const rawY = Math.cos(freqY * t + phase);

        const px = x + rawX * size;
        const py = y + rawY * size;

        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }

    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.globalAlpha = 0.1;
    ctx.fill();
    ctx.globalAlpha = 1.0;
};

// --- DYNAMIC BLOOM SYSTEM ---
const renderBloomPass = (mainCtx: CanvasRenderingContext2D, s: GameState) => {
    const { canvas, ctx, scale } = getBloomContext(s.width, s.height);
    if (!ctx || !canvas) return;

    // 1. Clear Bloom Buffer
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Render Emissive Entities (Scaled)
    ctx.save();
    ctx.scale(scale, scale);

    // Player Glow
    ctx.fillStyle = '#00f3ff';
    ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.arc(s.player.x, s.player.y, 40, 0, Math.PI * 2); ctx.fill();

    // Bullets
    for (const b of s.bullets) {
        ctx.fillStyle = b.color;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.size * 2, 0, Math.PI * 2); ctx.fill();
    }

    // Enemies (Glow)
    for (const e of s.enemies) {
        if (!e.active) continue;
        ctx.fillStyle = e.color;
        ctx.globalAlpha = 0.3;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.size * 2, 0, Math.PI * 2); ctx.fill();
        // Tentacles glow too
        if (e.tentacles) {
             e.tentacles.forEach(t => {
                 if (t.segments.length > 0) {
                    ctx.beginPath(); ctx.arc(t.segments[0].x, t.segments[0].y, 10, 0, Math.PI*2); ctx.fill();
                 }
             });
        }
    }

    // Particles
    if (s.particleSystem) {
        for (const p of s.particleSystem.activeParticles) {
            if (p.type === 'glow') {
                ctx.fillStyle = p.color;
                ctx.globalAlpha = p.life / p.maxLife;
                ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2); ctx.fill();
            }
        }
    }

    // MPM Matter (Hyper-Elastic Glow)
    if (s.mpmSystem) {
        const m = s.mpmSystem;
        for (let i = 0; i < m.count; i++) {
            // Visualize Stress (J - 1)
            const J = m.F00[i] * m.F11[i] - m.F01[i] * m.F10[i];
            const stress = Math.abs(J - 1.0);

            if (stress > 0.1) { // Only glow if stressed
                const r = m.colorR[i]; const g = m.colorG[i]; const b = m.colorB[i];
                ctx.fillStyle = `rgb(${r},${g},${b})`;
                ctx.globalAlpha = Math.min(1.0, stress * 2.0); // Glow intensity proportional to stress
                ctx.beginPath(); ctx.arc(m.x[i], m.y[i], 4, 0, Math.PI * 2); ctx.fill();
            }
        }
    }

    ctx.restore();

    // 3. Composite Bloom back to Main (Screen/Additive)
    mainCtx.globalCompositeOperation = 'screen';
    mainCtx.globalAlpha = 1.0;
    // Draw scaled up (linear interpolation gives free blur)
    mainCtx.drawImage(canvas, 0, 0, s.width, s.height);
    mainCtx.globalCompositeOperation = 'source-over';
};

export const renderGame = (ctx: CanvasRenderingContext2D, s: GameState) => {
    let abX = 0, abY = 0;
    const trauma = Math.max(s.screenFlash, s.player.hitFlash > 0 ? 0.5 : 0);
    if (trauma > 0) {
        abX = Math.random() * 6 * trauma;
        abY = Math.random() * 6 * trauma;
    }

    // --- PASS 1: BACKGROUND (Relativistic Warp) ---
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, s.width, s.height);

    ctx.save();
    
    // Apply Camera Transform
    if (s.camera) {
        // Pivot around center
        ctx.translate(s.width/2, s.height/2);
        ctx.scale(s.camera.zoom, s.camera.zoom);
        ctx.rotate(s.camera.angle);
        ctx.translate(-s.width/2 - s.camera.x, -s.height/2 - s.camera.y);
    } else if (s.shake > 0.5) {
        ctx.translate(Utils.rand(-s.shake, s.shake), Utils.rand(-s.shake, s.shake));
    }

    // Warped Starfield
    ctx.fillStyle = '#ffffff';
    for(let i=0; i<60; i++) {
        let x = (i * 137 + s.player.x * 0.1) % s.width;
        let y = (i * 243 + s.player.y * 0.1) % s.height;

        // Relativistic Distortion: Offset stars based on fluid velocity
        if (s.visualGrid) {
            const fv = s.visualGrid.getVelocityAt(x, y);
            x += fv.vx * 15; // Magnify the effect
            y += fv.vy * 15;
        }

        const size = (i % 3) * 0.5 + 0.5;
        const alpha = 0.2 + (Math.sin(s.frame * 0.05 + i) * 0.2);
        ctx.globalAlpha = alpha;
        ctx.fillRect(x, y, size, size);
    }
    ctx.globalAlpha = 1;

    // --- PASS 2: FLUID ---
    if (s.visualGrid) s.visualGrid.render(ctx, s.qualitySettings.gridStep);
    
    // --- PASS 3: VOLUMETRIC LIGHTING (Shadow Casting) ---
    // Ray-march from center to edges to create shadows from fluid density
    if (s.visualGrid && s.quality === 'HIGH') {
         const densityCtx = ctx;
         densityCtx.save();
         densityCtx.globalCompositeOperation = 'multiply'; // Shadows darken

         // Simple Radial Ray-March approximation
         // We draw "Shadow Fins" emanating from bright sources?
         // No, simpler: Draw a radial gradient masked by inverse density?
         // Let's do a "Light Shaft" pass:
         // 1. Clear a small buffer. 2. Draw density. 3. Radial Blur away from light.
         // Doing this on main canvas is hard. Let's do a screen-space overlay.

         const time = s.frame * 0.01;
         const cx = s.player.x;
         const cy = s.player.y;

         // Cast rays
         const rays = 12;
         const maxDist = Math.max(s.width, s.height);

         densityCtx.beginPath();
         for (let i = 0; i < rays; i++) {
             const theta = (i / rays) * Math.PI * 2 + time;
             // Ray-march
             let r = 0;
             let x = cx;
             let y = cy;
             const dr = 40;
             let transmittance = 1.0;

             // Move along ray
             while (r < maxDist && transmittance > 0.1) {
                 x += Math.cos(theta) * dr;
                 y += Math.sin(theta) * dr;
                 const dens = s.visualGrid.getDensityAt(x, y); // New method needed on Grid
                 transmittance *= Math.exp(-dens * 0.05);
                 r += dr;
             }

             // Draw the light shaft
             if (r > 100) {
                 densityCtx.moveTo(cx, cy);
                 densityCtx.lineTo(x, y);
             }
         }
         // This is too CPU intensive for JS render loop to stroke individual lines effectively for "Volume".
         // Alternative: Add "Glow" based on local density.

         // Let's use the Density Map to modulate a lighting layer.
         // We assume PASS 2 already drew the colored nebula.
         // Now we draw a "Shadow" layer on top.

         // Simpler Vex Hack:
         // Draw a radial gradient "Light" centered on player.
         // SUBTRACT density from it.

         densityCtx.globalCompositeOperation = 'screen';
         const grad = densityCtx.createRadialGradient(cx, cy, 50, cx, cy, 600);
         grad.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
         grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
         densityCtx.fillStyle = grad;
         densityCtx.fillRect(0, 0, s.width, s.height);

         densityCtx.restore();
    }

    // --- PASS 3.5: BLOOM (LUCID PIPELINE) ---
    renderBloomPass(ctx, s);

    // --- PASS 4: ENTITIES ---
    const blur = s.qualitySettings.shadowBlur; 

    const drawEntities = (offsetX: number, offsetY: number, channel: 'main' | 'red' | 'blue') => {
        if (channel === 'red') { ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = '#ff0000'; ctx.strokeStyle = '#ff0000'; ctx.globalAlpha = 0.5; }
        else if (channel === 'blue') { ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = '#0000ff'; ctx.strokeStyle = '#0000ff'; ctx.globalAlpha = 0.5; }
        else { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }

        // Shards (Debris)
        for (const shard of s.shards) {
            if (!shard.active) continue;
            ctx.save(); ctx.translate(shard.x + offsetX, shard.y + offsetY); ctx.rotate(shard.rotation);
            if (channel === 'main') ctx.fillStyle = shard.color;
            ctx.globalAlpha = Math.min(1, shard.life / 50);

            // Draw irregular shard
            ctx.beginPath();
            ctx.moveTo(-shard.size/2, -shard.size/2);
            ctx.lineTo(shard.size/2, 0);
            ctx.lineTo(-shard.size/2, shard.size/2);
            ctx.fill();

            ctx.restore();
        }

        // Enemies
        for (const e of s.enemies) {
            if (!e.active || e.dead || e.type === 'projectile') continue;

            ctx.save(); ctx.translate(offsetX, offsetY);

            // Draw Tentacles (Behind body)
            if (e.tentacles && e.tentacles.length > 0) {
                 ctx.globalAlpha = 0.8;
                 e.tentacles.forEach(t => drawTentacle(ctx, t, e.color, e.isElite ? 3 : 1.5));
                 ctx.globalAlpha = 1.0;
            }

            if (channel === 'main') {
                ctx.shadowBlur = e.isElite ? (blur > 0 ? 25 : 0) : (blur > 0 ? 12 : 0);
                ctx.shadowColor = e.color; 
                if (e.hitFlash > 0) ctx.strokeStyle = '#ffffff';
            }

            let drawSize = e.size;
            if (e.spawnAnim < 1) { ctx.globalAlpha = e.spawnAnim; drawSize *= (2 - e.spawnAnim); }

            const seed = e.id.charCodeAt(e.id.length-1);
            drawHarmonicEntity(ctx, e.x, e.y, drawSize, e.hitFlash > 0 ? '#fff' : e.color, e.type, seed, s.frame);

            ctx.restore();
            ctx.shadowBlur = 0;
        }

        // Player & Temporal Echo
        const p = s.player;
        if (!s.gameOver && p.invuln % 4 < 2) {
            // Draw Temporal Echo (Ghosts)
            if (channel === 'main' && p.trail) {
                for (let i = 0; i < p.trail.length; i++) {
                    const t = p.trail[i];
                    const alpha = (i + 1) / (p.trail.length + 1) * 0.3;
                    ctx.save();
                    ctx.translate(t.x + offsetX, t.y + offsetY);
                    ctx.rotate(t.angle);
                    ctx.fillStyle = `rgba(0, 243, 255, ${alpha})`;
                    ctx.strokeStyle = `rgba(0, 243, 255, ${alpha})`;

                    // Simple Ghost Shape
                    ctx.beginPath();
                    ctx.moveTo(25, 0); ctx.lineTo(-10, 20); ctx.lineTo(-10, -20);
                    ctx.stroke();

                    ctx.restore();
                }
            }

            ctx.save(); ctx.translate(p.x + offsetX, p.y + offsetY); ctx.rotate(p.angle);
            
            if (channel === 'main') {
                const shipColor = p.dashCd > 0 ? '#888' : CONFIG.COLORS.PLAYER;
                ctx.shadowBlur = blur > 0 ? 15 : 0; ctx.shadowColor = shipColor;
                ctx.fillStyle = p.hitFlash > 0 ? '#fff' : shipColor;
            }

            ctx.beginPath();
            ctx.moveTo(25, 0); ctx.lineTo(5, 5); ctx.lineTo(-10, 20); ctx.lineTo(-10, 8); 
            ctx.lineTo(-20, 12); ctx.lineTo(-22, 5); ctx.lineTo(-15, 0);
            ctx.lineTo(-22, -5); ctx.lineTo(-20, -12); ctx.lineTo(-10, -8); ctx.lineTo(-10, -20);
            ctx.lineTo(5, -5); ctx.closePath(); ctx.fill();

            if (channel === 'main') {
                ctx.fillStyle = '#000';
                ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-5, 3); ctx.lineTo(-5, -3); ctx.fill();

                // --- DIEGETIC UI ---
                // 1. Health Shield Ring
                const hpPct = p.hp / p.maxHp;
                if (hpPct < 1) {
                    ctx.strokeStyle = hpPct > 0.3 ? '#00ffaa' : '#ff0055';
                    ctx.lineWidth = 2;
                    ctx.globalAlpha = 0.6;
                    ctx.beginPath();
                    ctx.arc(0, 0, 35, -Math.PI/2, -Math.PI/2 + (Math.PI * 2 * hpPct));
                    ctx.stroke();
                }

                // 2. Heat Vent (Reload)
                if (p.cd > 0) {
                    ctx.fillStyle = '#ff5500';
                    ctx.globalAlpha = p.cd / 10; // Fades out
                    ctx.beginPath();
                    ctx.arc(-15, 0, 4, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            ctx.restore();
        }
    };

    if (trauma > 0) {
        drawEntities(abX, abY, 'red');
        drawEntities(-abX, -abY, 'blue');
    }
    drawEntities(0, 0, 'main');

    // --- PASS 5: OVERLAYS ---
    ctx.globalAlpha = 1;
    // Radial Health Bars
    for (const e of s.enemies) {
        if (!e.active || e.dead || e.type === 'projectile') continue;
        if (e.hp < e.maxHp) {
            const hpPct = e.hp / e.maxHp;
            const radius = e.size + 12;
            ctx.beginPath(); ctx.arc(e.x, e.y, radius, -Math.PI/2, -Math.PI/2 + (Math.PI * 2 * hpPct));
            ctx.strokeStyle = hpPct > 0.5 ? '#10b981' : '#ef4444'; ctx.lineWidth = 2; ctx.stroke();
            ctx.beginPath(); ctx.arc(e.x, e.y, radius, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1; ctx.stroke();
        }
    }

    // Pickups & Gems
    for (const g of s.gems) {
        if (!g.active) continue;
        const pulse = 1 + Math.sin(s.frame * 0.1 + g.x) * 0.15;
        ctx.fillStyle = CONFIG.COLORS.XP_GEM; 
        ctx.beginPath(); ctx.arc(g.x, g.y, 4 * pulse, 0, Math.PI * 2); ctx.fill();
    }
    for (const pick of s.pickups) {
        if(!pick.active) continue;
        const pulse = 1 + Math.sin(s.frame * 0.2) * 0.2;
        ctx.fillStyle = CONFIG.PICKUPS.COLOR;
        const sz = CONFIG.PICKUPS.SIZE * pulse;
        ctx.fillRect(pick.x - sz/2, pick.y - sz/2, sz, sz);
    }

    // --- PASS 6: GLOW / PARTICLES / BULLETS ---
    ctx.globalCompositeOperation = 'lighter';

    // MPM Matter (Hyperbolic Canvas)
    if (s.mpmSystem) {
        const m = s.mpmSystem;
        for (let i = 0; i < m.count; i++) {
            const J = m.F00[i] * m.F11[i] - m.F01[i] * m.F10[i];
            const stress = Math.abs(J - 1.0);
            const r = m.colorR[i]; const g = m.colorG[i]; const b = m.colorB[i];

            // Thermal Emission Logic: High compression/tension = White Hot
            if (stress > 0.5) {
                ctx.fillStyle = '#ffffff';
                ctx.globalAlpha = Math.min(1, (stress - 0.5));
                ctx.beginPath(); ctx.arc(m.x[i], m.y[i], 2, 0, Math.PI * 2); ctx.fill();
            }

            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.globalAlpha = 1.0;
            // Draw slightly larger when stressed
            const size = 2 + Math.min(3, stress * 5);
            ctx.beginPath(); ctx.arc(m.x[i], m.y[i], size, 0, Math.PI * 2); ctx.fill();
        }
    }

    // Particles (Render from System)
    if (s.particleSystem) {
        const parts = s.particleSystem.activeParticles;
        for (const part of parts) {
            if (part.type === 'ghost') {
                ctx.save(); ctx.translate(part.x, part.y); ctx.rotate(part.rotation);
                ctx.fillStyle = part.color; ctx.globalAlpha = (part.life / part.maxLife) * 0.5;
                ctx.beginPath(); ctx.moveTo(25, 0); ctx.lineTo(-10, 20); ctx.lineTo(-20, 0); ctx.lineTo(-10, -20); ctx.closePath(); ctx.fill();
                ctx.restore();
            } else {
                ctx.fillStyle = part.color; ctx.globalAlpha = part.life / part.maxLife;
                ctx.beginPath(); ctx.arc(part.x, part.y, part.size, 0, Math.PI * 2); ctx.fill();
            }
        }
    }

    // Bullets
    const isRailgun = s.player.weapon === 'RAILGUN';
    for (const b of s.bullets) {
        if (!b.active) continue;
        if (isRailgun) {
            const tailLen = 30;
            const angle = Math.atan2(b.vy, b.vx);
            const x2 = b.x - Math.cos(angle) * tailLen;
            const y2 = b.y - Math.sin(angle) * tailLen;
            ctx.globalAlpha = 1;
            drawLightning(ctx, x2, y2, b.x, b.y, b.color, 2, 8);
            ctx.globalAlpha = 0.5;
            drawLightning(ctx, x2, y2, b.x, b.y, '#ffffff', 1, 8);
        } else {
            ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(b.x, b.y, b.size * 0.6, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = b.color; ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(b.x, b.y, b.size * 1.5, 0, Math.PI * 2); ctx.fill();
        }
    }
    
    for (const e of s.enemies) {
        if (!e.active || e.type !== 'projectile') continue;
        ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(e.x, e.y, e.size * 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = e.color; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(e.x, e.y, e.size * 1.5, 0, Math.PI * 2); ctx.fill();
    }

    // Muzzle Flash
    if (s.player.muzzleFlash > 0) {
        ctx.save(); ctx.translate(s.player.x, s.player.y); ctx.rotate(s.player.angle);
        ctx.fillStyle = '#ffffff'; ctx.globalAlpha = s.player.muzzleFlash / 3; ctx.beginPath(); ctx.arc(25, 0, 15, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = CONFIG.WEAPONS[s.player.weapon].color; ctx.beginPath(); ctx.arc(25, 0, 25, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }

    // Affix Auras
    for (const e of s.enemies) {
        if (e.isElite && e.affixes.length > 0 && e.active && !e.dead) {
             for (const affix of e.affixes) {
                if (affix === 'VORTEX') {
                    const range = CONFIG.AFFIXES.VORTEX.range;
                    const time = s.frame * 0.05;
                    ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(time);
                    const grad = ctx.createRadialGradient(0, 0, range * 0.2, 0, 0, range);
                    grad.addColorStop(0, 'rgba(189, 0, 255, 0)'); grad.addColorStop(1, 'rgba(189, 0, 255, 0.2)');
                    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(0, 0, range, 0, Math.PI * 2); ctx.fill(); ctx.restore();
                } else if (affix === 'REPULSOR') {
                    const range = CONFIG.AFFIXES.REPULSOR.range; const pulse = 1 + Math.sin(s.frame * 0.1) * 0.1;
                    ctx.strokeStyle = `rgba(0, 136, 255, 0.4)`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(e.x, e.y, range * pulse, 0, Math.PI * 2); ctx.stroke();
                }
             }
        }
    }

    // Shockwaves
    for (const sw of s.shockwaves) {
        const alpha = sw.alpha * 0.5; ctx.lineWidth = sw.width; ctx.strokeStyle = sw.color; ctx.globalAlpha = alpha;
        ctx.beginPath(); ctx.arc(sw.x, sw.y, sw.size, 0, Math.PI * 2); ctx.stroke();
    }

    // --- PASS 7: POST-PROCESSING (Chromatic Aberration & Scanlines) ---
    // Apply RGB Split based on trauma
    if (trauma > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';

        // Red Channel Shift
        ctx.translate(abX, abY);
        ctx.globalAlpha = 0.03 * trauma; // Subtle
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(0,0, s.width, s.height); // Tint
        ctx.restore();
    }

    // --- PASS 8: DIEGETIC UI (Scanlines) ---
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // Scanlines (Simulated)
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = '#000';
    for(let j=0; j<s.height; j+=4) {
        ctx.fillRect(0, j, s.width, 1);
    }
    ctx.restore();

    // Tactical Reticle (DIEGETIC)
    if (!s.gameOver && !s.paused && s.active) {
        const cx = s.player.x + Math.cos(s.player.angle) * 150;
        const cy = s.player.y + Math.sin(s.player.angle) * 150;
        ctx.strokeStyle = s.autoMode ? '#00f3ff' : 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 2;
        
        // Reticle spins and pulses
        ctx.save();
        ctx.translate(cx, cy);
        if (s.autoMode) {
            ctx.rotate(s.frame * 0.05); ctx.beginPath(); ctx.rect(-10, -10, 20, 20); ctx.stroke();
        } else {
            ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(10, 0); ctx.moveTo(0, -10); ctx.lineTo(0, 10); ctx.stroke();
        }

        // Reload Ring around Reticle
        if (s.player.cd > 0) {
           const reloadPct = 1 - (s.player.cd / (20/s.player.stats.fireRateMod)); 
           ctx.beginPath(); ctx.arc(0, 0, 15, -Math.PI/2, -Math.PI/2 + (Math.PI * 2 * reloadPct));
           ctx.strokeStyle = 'rgba(255, 50, 0, 0.8)'; ctx.stroke();
        }
        ctx.restore();
    }

    // Kinetic Floating Texts
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const t of s.texts) {
      const alpha = Math.min(1, t.life / 20);
      ctx.globalAlpha = alpha;
      ctx.font = `bold ${t.size}px "Courier New"`; 
      ctx.fillStyle = t.color; 
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;

    ctx.restore();

    // Cinematic Flash
    if (s.screenFlash > 0.01) {
        const gradient = ctx.createRadialGradient(s.width / 2, s.height / 2, 0, s.width / 2, s.height / 2, s.width);
        gradient.addColorStop(0, `${s.flashColor}00`); gradient.addColorStop(0.2, `${s.flashColor}66`); gradient.addColorStop(1, `${s.flashColor}00`);   
        ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = gradient; ctx.globalAlpha = s.screenFlash; ctx.fillRect(0, 0, s.width, s.height);
        ctx.fillStyle = s.flashColor; ctx.globalAlpha = s.screenFlash * 0.3; ctx.fillRect(0, 0, s.width, s.height);
        ctx.globalAlpha = 1.0; ctx.globalCompositeOperation = 'source-over';
    }
};
