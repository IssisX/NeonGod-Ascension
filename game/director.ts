import { GameState, Enemy } from './types';

// --- THE DARWINIAN FORGE (DIRECTOR AI) ---
// Tracks player damage types and gameplay intensity to evolve enemy mutation profiles.
// Implements an intensity sine wave for pacing.

export type DamageType = 'KINETIC' | 'THERMAL' | 'VOID';

export class DirectorAI {
    static intensity = 0;
    static damageHistory: Record<DamageType, number> = {
        KINETIC: 0,
        THERMAL: 0,
        VOID: 0
    };

    static trackDamage(type: DamageType, amount: number) {
        this.damageHistory[type] += amount;
    }

    static update(s: GameState) {
        // 1. Intensity Sine Wave (Pacing)
        // Cycles every ~30 seconds at 60fps
        const cycle = (s.frame % 1800) / 1800;
        this.intensity = Math.sin(cycle * Math.PI);

        // 2. Adaptive Mutations
        // If player uses a lot of Thermal damage, enemies might become 'Thermal Resistant'
        // or gain 'Thermal Leech' affixes. (Logic for manifestation goes in spawning)
    }

    static getMutationProfile() {
        const total = this.damageHistory.KINETIC + this.damageHistory.THERMAL + this.damageHistory.VOID;
        if (total === 0) return 'NONE';

        if (this.damageHistory.THERMAL / total > 0.6) return 'ARMORED'; // High thermal -> Hard shells
        if (this.damageHistory.VOID / total > 0.4) return 'PHASE'; // High void -> Ethereal shifting
        if (this.intensity > 0.8) return 'SWARM'; // High intensity -> Swarm behavior

        return 'NONE';
    }
}
