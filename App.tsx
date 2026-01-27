import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createGameState, updateGame, resetPlayer, createEvolutionEffect } from './game/logic';
import { renderGame } from './game/renderer';
import { SpatialGrid } from './game/grids';
import { GameState, UIState, RunData, InputState } from './types';
import { CONFIG } from './constants';
import { GameUI } from './components/GameUI';
import { StorageService } from './services/storage';
import { audio } from './services/audio';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const stateRef = useRef<GameState | null>(null);

  // UI State encapsulated in React
  const [ui, setUI] = useState<UIState>({
    screen: 'boot',
    score: 0,
    hp: CONFIG.PLAYER.BASE_HP,
    maxHp: CONFIG.PLAYER.BASE_HP,
    xp: 0,
    xpToNext: CONFIG.PROGRESSION.XP_BASE,
    level: 1,
    wave: 1,
    combo: 0,
    overdrive: 0,
    dashReady: true,
    bossWarning: false,
    upgradeOptions: [],
    weaponName: 'Pulse Rifle',
    topRuns: [],
    globalStats: { totalRuns: 0, bestScore: 0 },
    autoMode: false,
  });

  // Initialize Game Logic
  useEffect(() => {
    // Initialize state immediately so the render loop has data to work with
    stateRef.current = createGameState(window.innerWidth, window.innerHeight);

    // Simulate boot sequence for UI
    setTimeout(() => {
      StorageService.getTopRuns().then(runs => {
        StorageService.getStats().then(stats => {
          setUI(prev => ({ ...prev, screen: 'start', topRuns: runs, globalStats: stats }));
        });
      });
    }, 1500);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  // Handler for Upgrade selection (Used by UI and Auto-Mode)
  const handleUpgradeSelect = useCallback((id: string) => {
    const s = stateRef.current;
    if (!s) return;
    
    const p = s.player;
    const current = s.upgradeStacks.get(id) || 0;
    s.upgradeStacks.set(id, current + 1);
    
    switch (id) {
        case 'multishot': p.stats.multishot++; break;
        case 'fireRate': p.stats.fireRateMod += 0.2; break;
        case 'speed': p.stats.speedMod += 0.15; break;
        case 'dashCd': p.maxDashCd = Math.max(20, p.maxDashCd - 15); break;
        case 'magnet': p.stats.magnetRange += 60; break;
        case 'maxHp': p.maxHp += 50; p.hp = p.maxHp; break;
        case 'damage': p.stats.damageMod += 0.2; break;
        case 'pierce': p.stats.pierce++; break;
        case 'homing': p.stats.homing += 0.15; break;
        case 'orbital': 
            p.stats.orbitals++; 
            s.orbitals.push({ angle: 0, dist: 60 });
            s.orbitals.forEach((o, i) => o.angle = (Math.PI * 2 / s.orbitals.length) * i);
            break;
    }
    
    // Check evolutions
    let evolved = false;
    let newName = '';
    let newColor = '#ffffff';

    if (p.stats.multishot >= 4 && p.weapon !== 'SHOTGUN') { 
        p.weapon = 'SHOTGUN'; evolved = true; newName = 'Scattergun'; newColor = CONFIG.WEAPONS.SHOTGUN.color;
    }
    else if (p.stats.pierce >= 2 && p.weapon !== 'RAILGUN') { 
        p.weapon = 'RAILGUN'; evolved = true; newName = 'Rail Driver'; newColor = CONFIG.WEAPONS.RAILGUN.color;
    }
    else if (p.stats.homing >= 0.5 && p.weapon !== 'VOID') { 
        p.weapon = 'VOID'; evolved = true; newName = 'Void Ray'; newColor = CONFIG.WEAPONS.VOID.color;
    }
    
    if (evolved) {
        setUI(prev => ({ ...prev, weaponName: newName }));
        // Trigger Effects
        audio.play('evolve');
        createEvolutionEffect(s, p.x, p.y, newColor);
        if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]);
    }
    
    s.paused = false;
    setUI(prev => ({ ...prev, screen: 'playing' }));
  }, []);

  // Handle Auto Mode Toggle
  const handleToggleAutoMode = useCallback(() => {
      setUI(prev => {
          const newVal = !prev.autoMode;
          if (stateRef.current) stateRef.current.autoMode = newVal;
          return { ...prev, autoMode: newVal };
      });
  }, []);

  // Auto Level Up Ref to prevent multiple triggers
  const autoLevelUpTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
      if (ui.screen === 'levelup' && ui.autoMode) {
          if (!autoLevelUpTimeoutRef.current) {
              autoLevelUpTimeoutRef.current = window.setTimeout(() => {
                  if (ui.upgradeOptions.length > 0) {
                      // Simple AI: Pick random upgrade
                      const randomIdx = Math.floor(Math.random() * ui.upgradeOptions.length);
                      handleUpgradeSelect(ui.upgradeOptions[randomIdx].id);
                  }
                  autoLevelUpTimeoutRef.current = null;
              }, 1000); // 1 second delay to see the level up screen
          }
      } else {
          if(autoLevelUpTimeoutRef.current) {
              clearTimeout(autoLevelUpTimeoutRef.current);
              autoLevelUpTimeoutRef.current = null;
          }
      }
  }, [ui.screen, ui.autoMode, ui.upgradeOptions, handleUpgradeSelect]);


  // Game Loop
  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const s = stateRef.current;
    
    // Safety check - if state isn't ready, keep trying
    if (!canvas || !s) {
        requestRef.current = requestAnimationFrame(gameLoop);
        return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (s.active && !s.paused && !s.gameOver) {
      // Update Physics & Logic
      updateGame(s, {
        onLevelUp: (options) => {
          setUI(prev => ({ ...prev, screen: 'levelup', upgradeOptions: options }));
        },
        onGameOver: (runData) => {
          StorageService.saveRun(runData).then(() => {
            Promise.all([StorageService.getTopRuns(), StorageService.getStats()])
              .then(([topRuns, globalStats]) => {
                setUI(prev => ({ ...prev, screen: 'gameover', topRuns, globalStats }));
              });
          });
        },
        onBossSpawn: () => {
          setUI(prev => ({ ...prev, bossWarning: true }));
          setTimeout(() => setUI(prev => ({ ...prev, bossWarning: false })), 3000);
        },
        onWeaponEvolve: (name) => {
          setUI(prev => ({ ...prev, weaponName: name }));
        },
        playSound: (type) => audio.play(type),
        setAudioIntensity: (val) => audio.setIntensity(val)
      });

      // Sync React UI with Game State (throttled slightly for performance)
      if (s.frame % 4 === 0) {
        setUI(prev => ({
          ...prev,
          score: Math.floor(s.score),
          hp: Math.max(0, s.player.hp),
          maxHp: s.player.maxHp,
          xp: s.player.xp,
          xpToNext: s.player.xpToNext,
          level: s.player.level,
          dashReady: s.player.dashCd <= 0,
          combo: s.combo,
          overdrive: s.overdrive,
          wave: s.wave,
        }));
      }
    } else if (!s.active) {
         // Idle animation for grid when not playing
         if(s.visualGrid) s.visualGrid.update(s.qualitySettings.gridStep);
         s.frame++;
    }

    // Render
    renderGame(ctx, s);
    requestRef.current = requestAnimationFrame(gameLoop);
  }, []);

  // Input Listeners
  useEffect(() => {
    const s = stateRef.current;
    
    const handleResize = () => {
        const canvas = canvasRef.current;
        const s = stateRef.current;
        if (!canvas || !s) return;
        
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
        canvas.style.width = `${window.innerWidth}px`;
        canvas.style.height = `${window.innerHeight}px`;
        
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.scale(dpr, dpr);
        
        s.width = window.innerWidth;
        s.height = window.innerHeight;
        s.pixelRatio = dpr;
        s.spatialGrid = new SpatialGrid(CONFIG.SPATIAL.CELL_SIZE);
        s.visualGrid.rebuild(s.width, s.height);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const s = stateRef.current;
      if (!s) return;
      const key = e.key.toLowerCase();
      // Safe type casting for keys
      const k = s.keys as any;
      if (k.hasOwnProperty(key)) { k[key] = true; }
      if (e.code === 'ArrowUp') s.keys.ArrowUp = true;
      if (e.code === 'ArrowDown') s.keys.ArrowDown = true;
      if (e.code === 'ArrowLeft') s.keys.ArrowLeft = true;
      if (e.code === 'ArrowRight') s.keys.ArrowRight = true;
      if (e.code === 'Space') { s.keys.space = true; e.preventDefault(); }
      if (e.key === 'Shift') { s.keys.shift = true; e.preventDefault(); }
      if (e.key.toLowerCase() === 'f') { s.keys.f = true; }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const s = stateRef.current;
      if (!s) return;
      const key = e.key.toLowerCase();
      const k = s.keys as any;
      if (k.hasOwnProperty(key)) { k[key] = false; }
      if (e.code === 'ArrowUp') s.keys.ArrowUp = false;
      if (e.code === 'ArrowDown') s.keys.ArrowDown = false;
      if (e.code === 'ArrowLeft') s.keys.ArrowLeft = false;
      if (e.code === 'ArrowRight') s.keys.ArrowRight = false;
      if (e.code === 'Space') { s.keys.space = false; e.preventDefault(); }
      if (e.key === 'Shift') { s.keys.shift = false; e.preventDefault(); }
      if (e.key.toLowerCase() === 'f') { s.keys.f = false; }
    };

    const onMouseMove = (e: MouseEvent) => {
      const s = stateRef.current;
      if (s) { s.mouse.x = e.clientX; s.mouse.y = e.clientY; }
    };

    const onMouseDown = () => { const s = stateRef.current; if (s) s.mouse.down = true; };
    const onMouseUp = () => { const s = stateRef.current; if (s) s.mouse.down = false; };
    
    // Touch handling
    const onTouch = (e: TouchEvent) => {
      const s = stateRef.current;
      if (!s) return;
      // Prevent scrolling
      if (e.type !== 'touchend') e.preventDefault(); 
      
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (e.type === 'touchstart') {
          // If tapping the bottom area (HUD) trigger Ultimate
          if (t.clientY > s.height - 100 && s.overdrive >= 100) {
              s.keys.f = true;
              setTimeout(() => { if(s.keys) s.keys.f = false; }, 100);
          } else {
              const type = t.clientX < s.width / 2 ? 'move' : 'aim';
              s.touches[t.identifier] = { id: t.identifier, originX: t.clientX, originY: t.clientY, x: t.clientX, y: t.clientY, type };
          }
        } else if (e.type === 'touchmove') {
          const touch = s.touches[t.identifier];
          if (touch) {
            const dx = t.clientX - touch.originX;
            const dy = t.clientY - touch.originY;
            const maxDist = 60;
            const dist = Math.hypot(dx, dy);
            if (dist > maxDist) {
              const ang = Math.atan2(dy, dx);
              touch.x = touch.originX + Math.cos(ang) * maxDist;
              touch.y = touch.originY + Math.sin(ang) * maxDist;
            } else {
              touch.x = t.clientX;
              touch.y = t.clientY;
            }
          }
        } else {
          delete s.touches[t.identifier];
        }
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    
    const canvas = canvasRef.current;
    if(canvas) {
        canvas.addEventListener('touchstart', onTouch, { passive: false });
        canvas.addEventListener('touchmove', onTouch, { passive: false });
        canvas.addEventListener('touchend', onTouch, { passive: false });
        canvas.addEventListener('touchcancel', onTouch, { passive: false });
    }

    handleResize();
    requestRef.current = requestAnimationFrame(gameLoop);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      if(canvas) {
        canvas.removeEventListener('touchstart', onTouch);
        canvas.removeEventListener('touchmove', onTouch);
        canvas.removeEventListener('touchend', onTouch);
        canvas.removeEventListener('touchcancel', onTouch);
      }
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [gameLoop]);

  const startGame = () => {
    // Initialize Audio Context on user gesture
    audio.init();

    const s = stateRef.current;
    if (!s) return;
    
    // Reset Logic
    s.active = true;
    s.paused = false;
    s.gameOver = false;
    s.score = 0;
    s.wave = 1;
    s.spawnRate = CONFIG.SPAWNING.INITIAL_RATE;
    s.spawnTimer = 0;
    s.combo = 0;
    s.overdrive = 0;
    s.bossActive = false;
    s.timeScale = 1;
    s.shake = 0;
    s.frame = 0;
    s.startTime = Date.now();
    s.upgradeStacks.clear();
    
    resetPlayer(s.player, s.width, s.height);
    
    // Clear pools
    s.bullets.forEach(b => s.pools.bullets.release(b));
    s.enemies.forEach(e => s.pools.enemies.release(e));
    s.particles.forEach(p => s.pools.particles.release(p));
    s.gems.forEach(g => s.pools.gems.release(g));
    s.pickups.forEach(p => s.pools.pickups.release(p));
    
    s.bullets = []; s.enemies = []; s.particles = []; s.gems = []; s.pickups = []; s.texts = []; s.shockwaves = []; s.orbitals = [];
    s.visualGrid.rebuild(s.width, s.height);
    
    setUI(prev => ({ 
        ...prev, 
        screen: 'playing', 
        score: 0, 
        hp: CONFIG.PLAYER.BASE_HP, 
        wave: 1, 
        level: 1,
        xp: 0,
        xpToNext: CONFIG.PROGRESSION.XP_BASE,
        weaponName: 'Pulse Rifle'
    }));
  };

  return (
    <div className="relative w-full h-screen bg-[#050510] font-mono overflow-hidden">
        <canvas ref={canvasRef} className="block w-full h-full" />
        <GameUI 
            ui={ui} 
            onStart={startGame} 
            onUpgradeSelect={handleUpgradeSelect} 
            onToggleAutoMode={handleToggleAutoMode}
        />
    </div>
  );
}