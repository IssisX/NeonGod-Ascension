import { Utils } from '../utils';
import { GameState } from '../types';

export type GestureType = 'SWIPE' | 'CIRCLE' | 'PINCH' | 'TAP';

export interface Gesture {
    type: GestureType;
    points: {x: number, y: number}[];
    centroid: {x: number, y: number};
    radius?: number;
    vector?: {x: number, y: number};
    age: number;
}

export class InputSystem {
    // Track active touches
    activeTouches: Map<number, {x: number, y: number, t: number}[]> = new Map();

    // Detected gestures queue
    gestures: Gesture[] = [];

    // Visual trails for gestures (for renderer)
    trails: {id: number, points: {x: number, y: number}[], color: string, life: number}[] = [];

    constructor() {}

    handleTouchStart(id: number, x: number, y: number) {
        this.activeTouches.set(id, [{x, y, t: Date.now()}]);
        this.trails.push({id, points: [{x, y}], color: '#00f3ff', life: 20});
    }

    handleTouchMove(id: number, x: number, y: number) {
        const history = this.activeTouches.get(id);
        if (history) {
            history.push({x, y, t: Date.now()});
            // Keep history short-ish
            if (history.length > 20) history.shift();
        }

        // Update visual trail
        const trail = this.trails.find(t => t.id === id);
        if (trail) {
            trail.points.push({x, y});
            if (trail.points.length > 20) trail.points.shift();
            trail.life = 20;
        }
    }

    handleTouchEnd(id: number, x: number, y: number) {
        const history = this.activeTouches.get(id);
        if (!history || history.length < 2) {
            this.activeTouches.delete(id);
            return;
        }

        // Analyze Gesture
        const start = history[0];
        const end = history[history.length - 1];
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const dist = Math.hypot(dx, dy);
        const time = end.t - start.t;

        if (time < 500 && dist > 50) {
            // Fast Swipe
            this.gestures.push({
                type: 'SWIPE',
                points: [...history],
                centroid: {x: (start.x + end.x)/2, y: (start.y + end.y)/2},
                vector: {x: dx, y: dy},
                age: 0
            });
        }
        // Circle Detection (Simplified: Start near End, path length > dist)
        // ... (Would need more complex logic, stick to Swipes for now as "Gusts")

        this.activeTouches.delete(id);
    }

    update(s: GameState) {
        // Process Gestures -> Game Logic
        for (let i = this.gestures.length - 1; i >= 0; i--) {
            const g = this.gestures[i];

            if (g.type === 'SWIPE' && g.age === 0) {
                // Apply "Gust" to Fluid
                if (s.visualGrid && g.vector) {
                    const force = 100;
                    // Inject velocity along the line
                    const steps = 10;
                    for(let k=0; k<=steps; k++) {
                        const t = k/steps;
                        const px = g.centroid.x - g.vector.x/2 + g.vector.x*t;
                        const py = g.centroid.y - g.vector.y/2 + g.vector.y*t;
                        s.visualGrid.addVelocity(px, py, g.vector.x * 0.1, g.vector.y * 0.1);
                        s.visualGrid.addDensity(px, py, 20, '#00f3ff'); // Divine Ink
                    }
                }
            }

            g.age++;
            if (g.age > 1) this.gestures.splice(i, 1);
        }

        // Update Trails
        for (let i = this.trails.length - 1; i >= 0; i--) {
            this.trails[i].life--;
            if (this.trails[i].life <= 0) this.trails.splice(i, 1);
        }
    }
}
