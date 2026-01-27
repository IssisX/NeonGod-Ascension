import { CONFIG } from '../constants';
import { GameState } from '../types';
import { Utils } from '../utils';

export const renderGame = (ctx: CanvasRenderingContext2D, s: GameState) => {
    // 1. ABERRATION OFFSET CALCULATION
    let abX = 0, abY = 0;
    const trauma = Math.max(s.screenFlash, s.player.hitFlash > 0 ? 0.5 : 0);
    if (trauma > 0) {
        abX = Math.random() * 6 * trauma;
        abY = Math.random() * 6 * trauma;
    }

    // --- PASS 1: BACKGROUND ---
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, s.width, s.height);

    ctx.save();
    
    // Global Shake + Trauma
    if (s.shake > 0.5) {
        ctx.translate(Utils.rand(-s.shake, s.shake), Utils.rand(-s.shake, s.shake));
    }

    // Background Elements
    ctx.fillStyle = '#ffffff';
    for(let i=0; i<50; i++) {
        const x = (i * 137 + s.player.x * 0.1) % s.width;
        const y = (i * 243 + s.player.y * 0.1) % s.height;
        const size = (i % 3) * 0.5 + 0.5;
        const alpha = 0.2 + (Math.sin(s.frame * 0.05 + i) * 0.2);
        ctx.globalAlpha = alpha;
        ctx.fillRect(x, y, size, size);
    }
    ctx.globalAlpha = 1;

    // Grid 
    const playerSpeed = Math.hypot(s.player.vx, s.player.vy);
    const speedRatio = Math.min(1, playerSpeed / CONFIG.PLAYER.BASE_SPEED / 2);
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#1a1a2e';
    ctx.globalAlpha = speedRatio > 0.1 ? 0.3 + (speedRatio * 0.2) : 0.3;
    if (s.visualGrid) s.visualGrid.render(ctx, s.qualitySettings.gridStep);
    
    // --- PASS 2: MAIN ENTITIES ---
    const blur = s.qualitySettings.shadowBlur; 

    // Helper to draw entities with potential chromatic aberration
    const drawEntities = (offsetX: number, offsetY: number, channel: 'main' | 'red' | 'blue') => {
        if (channel === 'red') { ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = '#ff0000'; ctx.strokeStyle = '#ff0000'; ctx.globalAlpha = 0.5; }
        else if (channel === 'blue') { ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = '#0000ff'; ctx.strokeStyle = '#0000ff'; ctx.globalAlpha = 0.5; }
        else { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }

        // Debris
        for (const part of s.particles) {
            if (!part.active || part.type !== 'shard') continue;
            ctx.save(); ctx.translate(part.x + offsetX, part.y + offsetY); ctx.rotate(part.rotation);
            if (channel === 'main') ctx.fillStyle = part.color;
            ctx.beginPath();
            ctx.moveTo(-part.size, -part.size/2); ctx.lineTo(part.size, 0); ctx.lineTo(-part.size, part.size/2);
            ctx.fill(); ctx.restore();
        }

        // Enemies
        for (const e of s.enemies) {
            if (!e.active || e.dead || e.type === 'projectile') continue;
            if (e.spawnAnim < 1) {
                 if (channel === 'main') {
                    ctx.save(); ctx.translate(e.x + offsetX, e.y + offsetY);
                    ctx.strokeStyle = e.color; ctx.lineWidth = 2; ctx.globalAlpha = e.spawnAnim;
                    ctx.beginPath();
                    const scale = 2 - e.spawnAnim; 
                    ctx.arc(0, 0, e.size * scale, 0, Math.PI * 2); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(-e.size*scale, 0); ctx.lineTo(e.size*scale, 0); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(0, -e.size*scale); ctx.lineTo(0, e.size*scale); ctx.stroke();
                    ctx.restore();
                 }
                 continue;
            }

            if (channel === 'main') {
                ctx.shadowBlur = e.isElite ? (blur > 0 ? 25 : 0) : (blur > 0 ? 12 : 0);
                ctx.shadowColor = e.color; 
                ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : e.color;
            }

            ctx.save(); ctx.translate(e.x + offsetX, e.y + offsetY);
            if (e.type === 'boss') {
                ctx.rotate(s.frame * 0.015); ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const th = (i * Math.PI) / 3;
                    const px = Math.cos(th) * e.size, py = Math.sin(th) * e.size;
                    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                }
                ctx.closePath(); ctx.fill();
            } else { 
                ctx.beginPath(); ctx.arc(0, 0, e.size, 0, Math.PI * 2); ctx.fill(); 
            }
            ctx.restore();
            ctx.shadowBlur = 0; // Reset for next draw
        }

        // Player
        const p = s.player;
        if (!s.gameOver && p.invuln % 4 < 2) {
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
            }
            ctx.restore();
        }
    };

    // Render Channels (Chromatic Aberration Effect)
    if (trauma > 0) {
        drawEntities(abX, abY, 'red');
        drawEntities(-abX, -abY, 'blue');
    }
    drawEntities(0, 0, 'main');

    // --- PASS 3: OVERLAYS (No aberration) ---

    // Radial Health Bars (Enemies)
    ctx.globalAlpha = 1;
    for (const e of s.enemies) {
        if (!e.active || e.dead || e.type === 'projectile') continue;
        if (e.hp < e.maxHp) {
            const hpPct = e.hp / e.maxHp;
            const radius = e.size + 8;
            ctx.beginPath();
            ctx.arc(e.x, e.y, radius, -Math.PI/2, -Math.PI/2 + (Math.PI * 2 * hpPct));
            ctx.strokeStyle = hpPct > 0.5 ? '#10b981' : '#ef4444';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Back ring
            ctx.beginPath();
            ctx.arc(e.x, e.y, radius, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
        // Affix Icons
        if (e.isElite && e.affixes.length > 0) {
            e.affixes.forEach((affix, idx) => {
                const iconSize = 4;
                const angle = -Math.PI/2 + (idx * 0.5);
                const rx = e.x + Math.cos(angle) * (e.size + 14);
                const ry = e.y + Math.sin(angle) * (e.size + 14);
                ctx.fillStyle = CONFIG.AFFIXES[affix]?.color || '#fff';
                ctx.beginPath(); ctx.arc(rx, ry, iconSize, 0, Math.PI * 2); ctx.fill();
            });
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

    // --- PASS 4: GLOW / PARTICLES / BULLETS ---
    ctx.globalCompositeOperation = 'lighter';

    // Particles (Glow + Ghost)
    for (const part of s.particles) {
        if (!part.active || (part.type !== 'glow' && part.type !== 'ghost')) continue;
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

    // Bullets & Projectiles
    for (const b of s.bullets) {
        if (!b.active) continue;
        ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(b.x, b.y, b.size * 0.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = b.color; ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(b.x, b.y, b.size * 1.5, 0, Math.PI * 2); ctx.fill();
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

    // --- PASS 5: UI ---
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // Tactical Reticle
    if (!s.gameOver && !s.paused && s.active) {
        const cx = s.player.x + Math.cos(s.player.angle) * 150;
        const cy = s.player.y + Math.sin(s.player.angle) * 150;
        ctx.strokeStyle = s.autoMode ? '#00f3ff' : 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 2;
        
        if (s.autoMode) {
            ctx.save(); ctx.translate(cx, cy); ctx.rotate(s.frame * 0.05); ctx.beginPath(); ctx.rect(-10, -10, 20, 20); ctx.stroke(); ctx.restore();
        } else {
            ctx.beginPath(); ctx.moveTo(cx - 10, cy); ctx.lineTo(cx + 10, cy); ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy + 10); ctx.stroke();
        }

        if (s.player.cd > 0) {
           const reloadPct = 1 - (s.player.cd / (20/s.player.stats.fireRateMod)); 
           ctx.beginPath(); ctx.arc(s.player.x, s.player.y, 40, -Math.PI/2, -Math.PI/2 + (Math.PI * 2 * reloadPct));
           ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'; ctx.stroke();
        }
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