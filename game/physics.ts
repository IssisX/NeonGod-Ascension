import { Tentacle, VerletPoint } from '../types';
import { Utils } from '../utils';

export const Physics = {
    /**
     * Creates a new tentacle with N segments.
     */
    createTentacle: (startX: number, startY: number, length: number, count: number, stiffness = 0.5): Tentacle => {
        const segments: VerletPoint[] = [];
        const segLen = length / count;
        for (let i = 0; i < count; i++) {
            segments.push({
                x: startX,
                y: startY + i * segLen,
                prevX: startX,
                prevY: startY + i * segLen,
                pinned: i === 0
            });
        }
        return { segments, length: segLen, stiffness };
    },

    /**
     * Updates a tentacle using Verlet Integration.
     * @param t The tentacle
     * @param headX X position to pin the head to (usually entity body)
     * @param headY Y position to pin the head to
     * @param drag Fluid drag factor (0-1)
     * @param gravity Gravity vector (optional)
     */
    updateTentacle: (t: Tentacle, headX: number, headY: number, drag = 0.9, gravity = {x:0, y:0}) => {
        // 1. Move Points (Verlet)
        for (let i = 0; i < t.segments.length; i++) {
            const p = t.segments[i];
            if (p.pinned) {
                p.x = headX;
                p.y = headY;
                p.prevX = headX;
                p.prevY = headY;
                continue;
            }

            const vx = (p.x - p.prevX) * drag;
            const vy = (p.y - p.prevY) * drag;

            p.prevX = p.x;
            p.prevY = p.y;

            p.x += vx + gravity.x;
            p.y += vy + gravity.y;
        }

        // 2. Constrain Distance (Inverse Kinematics / Stick Constraint)
        // Iterate multiple times for stability
        const iterations = 5;
        for (let k = 0; k < iterations; k++) {
            for (let i = 0; i < t.segments.length - 1; i++) {
                const p1 = t.segments[i];
                const p2 = t.segments[i + 1];

                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const dist = Math.hypot(dx, dy);
                const diff = t.length - dist;
                const percent = diff / dist / 2;

                const offsetX = dx * percent * t.stiffness;
                const offsetY = dy * percent * t.stiffness;

                if (!p1.pinned) {
                    p1.x -= offsetX;
                    p1.y -= offsetY;
                }
                if (!p2.pinned) {
                    p2.x += offsetX;
                    p2.y += offsetY;
                }
            }
        }
    }
};
