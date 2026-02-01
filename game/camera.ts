// Mass-Spring-Damper Camera Rig
// Solves: F = -k*x - c*v
// For translation (x,y) and rotation (angle) and zoom (scale)

export class SpringCamera {
    x: number = 0;
    y: number = 0;
    angle: number = 0;
    zoom: number = 1.0;

    // Target (Anchor)
    targetX: number = 0;
    targetY: number = 0;
    targetZoom: number = 1.0;

    // Physics State
    vx: number = 0;
    vy: number = 0;
    vAngle: number = 0;
    vZoom: number = 0;

    // Constants (Tuned for "Heavy" feel)
    stiffness: number = 0.05; // k
    damping: number = 0.85;   // c
    mass: number = 1.0;

    constructor() {}

    update(dt: number = 1.0) {
        // Translation Spring
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const ax = dx * this.stiffness;
        const ay = dy * this.stiffness;

        this.vx += ax / this.mass;
        this.vy += ay / this.mass;
        this.vx *= this.damping;
        this.vy *= this.damping;

        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // Rotation Spring (Target is always 0 usually, unless tilting)
        const dAngle = 0 - this.angle;
        const aAngle = dAngle * this.stiffness;
        this.vAngle += aAngle / this.mass;
        this.vAngle *= this.damping;
        this.angle += this.vAngle * dt;

        // Zoom Spring
        const dZoom = this.targetZoom - this.zoom;
        const aZoom = dZoom * this.stiffness;
        this.vZoom += aZoom / this.mass;
        this.vZoom *= this.damping;
        this.zoom += this.vZoom * dt;
    }

    // Apply instantaneous force (Recoil)
    kick(x: number, y: number, rot: number = 0, zoom: number = 0) {
        this.vx += x;
        this.vy += y;
        this.vAngle += rot;
        this.vZoom += zoom;
    }

    // Continuous Shake
    shake(amount: number) {
        this.x += (Math.random() - 0.5) * amount;
        this.y += (Math.random() - 0.5) * amount;
    }
}
