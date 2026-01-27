import React from 'react';
import { UIState } from '../types';

interface GameUIProps {
  ui: UIState;
  onStart: () => void;
  onUpgradeSelect: (id: string) => void;
  onToggleAutoMode: () => void;
}

export const GameUI: React.FC<GameUIProps> = ({ ui, onStart, onUpgradeSelect, onToggleAutoMode }) => {
  if (ui.screen === 'boot') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-dark-bg text-neon-blue font-mono z-50">
        <div className="text-5xl font-black mb-2 tracking-tighter">
          NEON<span className="text-neon-pink">GOD</span>
        </div>
        <div className="text-lg text-neon-purple tracking-[0.5em] mb-10">ASCENSION</div>
        <div className="w-48 h-1 bg-gray-900 rounded overflow-hidden">
          <div className="h-full bg-gradient-to-r from-neon-blue to-neon-pink animate-[width_1s_ease-out] w-full origin-left animate-pulse"></div>
        </div>
        <div className="mt-4 text-xs text-gray-500">INITIALIZING SYSTEMS...</div>
      </div>
    );
  }

  if (ui.screen === 'start') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/95 backdrop-blur-sm z-50">
        <h1 className="text-7xl font-black italic tracking-tighter mb-2 text-white">
          NEON<span className="text-neon-blue">GOD</span>
        </h1>
        <div className="text-2xl text-neon-purple font-bold tracking-[0.5em] mb-12">ASCENSION</div>
        
        <button 
            onClick={onStart}
            className="px-12 py-3 bg-white text-black font-black text-2xl rounded hover:scale-105 transition-transform border-b-4 border-gray-300 active:border-b-0 active:translate-y-1"
        >
            START
        </button>
        
        <div className="mt-6 text-gray-500 text-sm">WASD + MOUSE / TOUCH</div>

        {ui.topRuns.length > 0 && (
          <div className="mt-12 w-96 max-w-[90vw]">
            <div className="text-neon-blue text-center font-bold mb-4">TOP SCORES</div>
            {ui.topRuns.slice(0, 5).map((run, i) => (
              <div key={i} className="flex justify-between p-2 bg-white/5 mb-1 rounded text-sm">
                <span className="text-gray-500">#{i + 1}</span>
                <span className="text-white font-bold">{run.score.toLocaleString()}</span>
                <span className="text-gray-400">Wave {run.wave}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (ui.screen === 'gameover') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-950/90 backdrop-blur-sm z-50">
        <div className="text-6xl font-black text-red-500 mb-4">SYSTEM FAILURE</div>
        <div className="text-4xl text-red-300 mb-8">{ui.score.toLocaleString()}</div>
        
        <div className="flex gap-8 text-gray-400 text-sm mb-8">
            <div>Wave {ui.wave}</div>
            <div>Level {ui.level}</div>
        </div>

        <button 
            onClick={onStart}
            className="px-10 py-3 bg-white text-black font-black text-xl rounded hover:scale-105 transition-transform"
        >
            RESTART
        </button>

        {ui.topRuns.length > 0 && (
          <div className="mt-12 w-96 max-w-[90vw]">
            <div className="text-red-500 text-center font-bold mb-4">LEADERBOARD</div>
            {ui.topRuns.slice(0, 5).map((run, i) => (
              <div key={i} className="flex justify-between p-2 bg-white/5 mb-1 rounded text-sm">
                <span className="text-gray-500">#{i + 1}</span>
                <span className="text-white font-bold">{run.score.toLocaleString()}</span>
                <span className="text-gray-400">Wave {run.wave}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (ui.screen === 'levelup') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm z-50">
        <h2 className="text-5xl font-black text-emerald-500 mb-8">LEVEL UP</h2>
        {ui.autoMode && <div className="text-neon-blue animate-pulse mb-4 font-mono">AUTO-SELECTING...</div>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-[90%] max-w-4xl">
            {ui.upgradeOptions.map((opt, i) => (
                <button
                    key={i}
                    onClick={() => onUpgradeSelect(opt.id)}
                    className="group bg-slate-900 border-2 border-slate-700 hover:border-emerald-500 p-6 rounded-xl text-left transition-all hover:-translate-y-1"
                >
                    <div className="text-xl font-bold text-white mb-2 group-hover:text-emerald-400">{opt.name}</div>
                    <div className="text-gray-400 text-sm mb-4">{opt.desc}</div>
                    <div className="text-gray-600 text-xs font-bold">{opt.currentStack + 1}/{opt.maxStack}</div>
                </button>
            ))}
        </div>
      </div>
    );
  }

  // HUD
  return (
    <div className="absolute inset-0 pointer-events-none p-4 select-none">
        {/* Score & Wave */}
        <div className="absolute top-4 left-4">
            <div className="text-4xl font-black italic bg-gradient-to-r from-yellow-400 to-red-500 bg-clip-text text-transparent drop-shadow-lg">
                {ui.score.toLocaleString()}
            </div>
            <div className="text-neon-blue text-sm font-bold tracking-widest mt-1">
                WAVE {ui.wave}
            </div>
            {ui.combo > 1 && (
                <div className="text-amber-500 text-lg font-extrabold mt-2 animate-pulse drop-shadow-md">
                    x{ui.combo} COMBO
                </div>
            )}
        </div>

        {/* Auto Pilot Toggle - Centered Top */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-auto">
             <button 
                onClick={onToggleAutoMode}
                className={`flex items-center gap-2 group bg-black/80 backdrop-blur p-2 px-4 rounded-full border transition-all active:scale-95 ${
                    ui.autoMode 
                        ? 'border-neon-blue shadow-[0_0_15px_rgba(0,243,255,0.4)]' 
                        : 'border-white/10 hover:border-white/30'
                }`}
             >
                <div className={`w-3 h-3 rounded-full transition-colors ${ui.autoMode ? 'bg-neon-blue animate-pulse' : 'bg-gray-600'}`}></div>
                <span className={`text-xs font-bold tracking-widest transition-colors ${ui.autoMode ? 'text-neon-blue' : 'text-gray-400'}`}>
                    AUTO-PILOT {ui.autoMode ? 'ON' : 'OFF'}
                </span>
             </button>
        </div>

        {/* Status Panel */}
        <div className="absolute top-4 right-4 w-60">
            {/* HP */}
            <div className="flex justify-between text-red-500 text-xs font-bold mb-1">
                <span>HP</span>
                <span>{Math.ceil(ui.hp)}/{ui.maxHp}</span>
            </div>
            <div className="h-3 bg-gray-900 border border-white/10 rounded overflow-hidden mb-3">
                <div 
                    className={`h-full transition-all duration-300 ${ui.hp < ui.maxHp * 0.25 ? 'bg-red-600 animate-pulse' : 'bg-emerald-500'}`}
                    style={{ width: `${(ui.hp / ui.maxHp) * 100}%` }}
                />
            </div>

            {/* XP */}
            <div className="flex justify-between text-emerald-500 text-xs font-bold mb-1">
                <span>LVL {ui.level}</span>
                <span>{Math.floor((ui.xp / ui.xpToNext) * 100)}%</span>
            </div>
            <div className="h-2 bg-gray-900 border border-white/10 rounded overflow-hidden">
                <div 
                    className="h-full bg-emerald-500 transition-all duration-200"
                    style={{ width: `${(ui.xp / ui.xpToNext) * 100}%` }}
                />
            </div>
            
            <div className="mt-4 flex flex-col gap-1 items-end text-xs font-bold">
                 <span className={ui.dashReady ? 'text-neon-blue' : 'text-gray-600'}>
                    {ui.dashReady ? '⚡ DASH [SPACE]' : '⚡ CHARGING...'}
                 </span>
                 <span className="text-neon-purple mt-1">{ui.weaponName}</span>
            </div>
        </div>

        {/* Boss Warning */}
        {ui.bossWarning && (
            <div className="absolute bottom-32 left-1/2 -translate-x-1/2 text-6xl font-black text-red-600 animate-pulse-fast whitespace-nowrap shadow-red-500 drop-shadow-lg z-50">
                ⚠ BOSS INCOMING ⚠
            </div>
        )}

        {/* Overdrive Bar (Visual Flair) */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-center pointer-events-auto">
            {ui.overdrive >= 100 && (
                <div className="text-fuchsia-500 font-black mb-2 text-lg animate-bounce drop-shadow-[0_0_10px_rgba(255,0,255,0.8)]">
                    PRESS [F] - NEON NOVA
                </div>
            )}
            <div className={`w-72 h-4 bg-gray-950 rounded-full overflow-hidden border-2 ${ui.overdrive >= 100 ? 'border-fuchsia-500 shadow-[0_0_15px_#d946ef]' : 'border-white/10'}`}>
                <div 
                    className={`h-full transition-all duration-200 ${ui.overdrive >= 100 ? 'bg-fuchsia-500' : 'bg-gradient-to-r from-purple-900 to-purple-600'}`}
                    style={{ width: `${ui.overdrive}%` }}
                />
            </div>
        </div>
    </div>
  );
};