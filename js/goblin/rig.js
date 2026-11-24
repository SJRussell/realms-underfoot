/*
 * Posing a pipeline rig from code.
 *
 * The rigs come out of the project's rigging step with bones named bone_0, bone_1 and so on, and with bone axes
 * that mean nothing. So every rotation here is given in the model's own axes instead:
 *   x: tips the top of a part toward the viewer (a nod, a bow, a leg swinging back)
 *   y: turns it toward the viewer's right
 *   z: for a part on the character's left (the viewer's right), raises it
 * A pose is a sum of these, added on top of the rest pose and applied once a frame.
 */
import * as THREE from "three";

const q = new THREE.Quaternion();

export class Rig {
  constructor(root, map) {
    root.updateMatrixWorld(true);
    this.parts = {};
    for (const [key, name] of Object.entries(map)) {
      const bone = root.getObjectByName(name);
      if (!bone) continue;
      const pq = new THREE.Quaternion();
      bone.parent.getWorldQuaternion(pq);
      this.parts[key] = { bone, rest: bone.quaternion.clone(), pq, pqi: pq.clone().invert(), e: new THREE.Euler(0, 0, 0, "YXZ") };
    }
    this.list = Object.values(this.parts);
  }
  has(key) { return key in this.parts; }
  clear() { for (const p of this.list) p.e.set(0, 0, 0); }
  /** Add a rotation in degrees to one part. */
  add(key, x = 0, y = 0, z = 0) {
    const p = this.parts[key];
    if (!p) return;
    p.e.x += x * 0.017453292519943295; p.e.y += y * 0.017453292519943295; p.e.z += z * 0.017453292519943295;
  }
  apply() {
    for (const p of this.list) {
      q.setFromEuler(p.e);
      p.bone.quaternion.copy(p.pqi).multiply(q).multiply(p.pq).multiply(p.rest);
    }
  }
}

/** Smooth step toward a target that does not overshoot: rate is "how much per second". */
export function damp(current, target, rate, dt) { return current + (target - current) * (1 - Math.exp(-rate * dt)); }
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const ease = (u) => u * u * (3 - 2 * u);
