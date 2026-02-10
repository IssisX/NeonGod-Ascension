import { GameState } from './types';
import { Utils } from './utils';

// --- KINETIC CAMERA SYSTEM ---
// Implements a Mass-Spring-Damper model for smooth, physics-based screen shake and punches.
// Supports translational recoil, rotational kicks, and zoom punches.

export class CameraSystem {
    // Spring configuration
    static STIFFNESS = 0.4;
    static DAMPING = 0.82;

    static update(s: GameState) {
        const cam = s.camera;

        // 1. Spring Physics for Translation (Recoil)
        const ax = (cam.targetX - cam.x) * this.STIFFNESS;
        const ay = (cam.targetY - cam.y) * this.STIFFNESS;

        cam.vx = (cam.vx + ax) * this.DAMPING;
        cam.vy = (cam.vy + ay) * this.DAMPING;

        cam.x += cam.vx;
        cam.y += cam.vy;

        // 2. Spring Physics for Rotation (Kicks)
        const ar = (0 - cam.rotation) * (this.STIFFNESS * 0.5);
        cam.vr = (cam.vr + ar) * this.DAMPING;
        cam.rotation += cam.vr;

        // 3. Spring Physics for Zoom (Punches)
        const az = (1 - cam.zoom) * this.STIFFNESS;
        cam.vz = (cam.vz + az) * this.DAMPING;
        cam.zoom += cam.vz;

        // 4. Integrated High-Frequency Jitter (Basic Shake)
        if (s.shake > 0.1) {
            cam.x += Utils.rand(-s.shake, s.shake);
            cam.y += Utils.rand(-s.shake, s.shake);
            cam.rotation += Utils.rand(-s.shake, s.shake) * 0.002;
        }
    }

    static punch(s: GameState, x: number, y: number, rotation = 0, zoom = 0) {
        s.camera.vx += x;
        s.camera.vy += y;
        s.camera.vr += rotation;
        s.camera.vz += zoom;
    }
}
