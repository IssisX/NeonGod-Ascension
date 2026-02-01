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

    createChain: (x: number, y: number, count: number, length: number): Tentacle => {
        return Physics.createTentacle(x, y, length, count, 0.1); // Loose chain
    },

    /**
     * Updates a tentacle using Verlet Integration.
     * @param t The tentacle
     * @param headX X position to pin the head to (usually entity body)
     * @param headY Y position to pin the head to
     * @param drag Fluid drag factor (0-1)
     * @param gravity Gravity vector (optional)
     */
    updateTentacle: (t: Tentacle, headX: number | null, headY: number | null, drag = 0.9, gravity = {x:0, y:0}) => {
        // 1. Move Points (Verlet)
        for (let i = 0; i < t.segments.length; i++) {
            const p = t.segments[i];
            if (i === 0 && headX !== null && headY !== null) {
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
        const iterations = 5;
        for (let k = 0; k < iterations; k++) {
            for (let i = 0; i < t.segments.length - 1; i++) {
                const p1 = t.segments[i];
                const p2 = t.segments[i + 1];

                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const dist = Math.hypot(dx, dy);
                const diff = t.length - dist;

                // Avoid divide by zero
                if (dist === 0) continue;

                const percent = diff / dist / 2;
                const offsetX = dx * percent * t.stiffness;
                const offsetY = dy * percent * t.stiffness;

                if (i !== 0 || (headX === null)) { // If head is free, move it
                    p1.x -= offsetX;
                    p1.y -= offsetY;
                }

                p2.x += offsetX;
                p2.y += offsetY;
            }
        }
    }
};
