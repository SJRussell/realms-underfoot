/*
 * Ignis. He lands at the bottom of the page when the visitor gets there, roars, and then
 * watches the pointer. Poke him three times and he ends the visit the way he ends the
 * goblin encounter in the game.
 *
 * The bone names are the ones in the game's IgnisRig.json. He is posed from code, as in the game.
 */
import * as THREE from "three";
import { Rig, damp, clamp, ease } from "./rig.js";

const BONES = {
  hips: "bone_0", back: "bone_1", chest: "bone_2",
  neck1: "bone_3", neck2: "bone_4", neck3: "bone_5", head: "bone_6", jaw: "bone_7",
  wingL1: "bone_25", wingL2: "bone_26", wingL3: "bone_27", wingR1: "bone_32", wingR2: "bone_33", wingR3: "bone_34",
  tail1: "bone_39", tail2: "bone_40", tail3: "bone_41", tail4: "bone_42", tail5: "bone_43", tail6: "bone_44", tail7: "bone_45",
  legFL: "bone_19", legFR: "bone_22", legBL: "bone_46", legBR: "bone_51",
  shinFL: "bone_20", shinFR: "bone_23", shinBL: "bone_47", shinBR: "bone_52",
};
const TAIL = ["tail1", "tail2", "tail3", "tail4", "tail5", "tail6", "tail7"];
const v = new THREE.Vector3();

export class Ignis {
  constructor(model, shadowTexture) {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.model = model;
    this.rig = new Rig(model, BONES);
    this.body.add(model); this.root.add(this.body);
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, opacity: 0.6 }));
    this.blob.scale.set(7.5, 1.3, 1); this.blob.position.set(0, 0.05, -1.5); this.blob.renderOrder = -1; this.root.add(this.blob);
    model.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    this.state = "away";
    this.t = 0;
    this.lookYaw = 0; this.lookPitch = 0; this.jaw = 0; this.roar = 0; this.fold = 0; this.flap = 0;
    this.pokes = 0; this.act = null;
    this.root.visible = false;
    this.onLand = null; this.onRoar = null; this.onBite = null;
    this.headScreen = { x: 0, y: 0, r: 60 };
  }

  arrive(reduced) {
    if (this.state !== "away") return;
    this.state = reduced ? "landed" : "flying"; this.t = reduced ? 9 : 0; this.pokes = 0; this.act = null;
    this.landed = reduced; this.roared = reduced; this.fold = reduced ? 1 : 0;
  }
  reset() { this.state = "away"; this.root.visible = false; this.act = null; this.pokes = 0; }
  /** Returns what he did: "stare", "roar" or "bite". */
  poke(reduced) {
    if (this.state !== "landed" || (this.act && this.act.type === "bite")) return null;
    this.pokes += 1;
    const type = this.pokes >= 3 ? "bite" : this.pokes === 2 ? "roar" : "stare";
    this.act = { type, t: 0, dur: type === "bite" ? (reduced ? 0.05 : 0.62) : type === "roar" ? 1.9 : 1.1 };
    return type;
  }

  update(dt, now, env, spot, camera) {
    if (this.state === "away" || !spot) { this.root.visible = false; return; }
    this.t += dt;
    const t = this.t, time = now / 1000;
    const r = spot.getBoundingClientRect();
    const gx = r.left + r.width / 2, gy = r.bottom;
    const ppm = Math.min(r.height / 4.7, env.W / 5.4);   // pixels per metre
    const g = this.rig; g.clear();
    const still = env.reduced ? 0 : 1;

    let x = gx, y = gy, pitch = 0, roll = 0, scale = 1, z = 0, sink = 0;
    let flap = 0, roar = 0, jawOpen = 0, coil = 0;
    const FLY0 = 1.0, FLY1 = 2.55;
    if (this.state === "flying") {
      if (t < FLY0) { this.root.visible = false; return; }
      const u = clamp((t - FLY0) / (FLY1 - FLY0), 0, 1), k = 1 - Math.pow(1 - u, 2.2);
      x = gx + (1 - k) * env.W * 0.42; y = gy - (1 - k) * env.H * 1.15;
      pitch = -30 + 22 * k; roll = (1 - k) * 14; scale = 0.8 + 0.2 * k; flap = 1;
      if (u >= 1) { this.state = "landed"; this.landT = t; if (this.onLand) this.onLand(); }
    }
    if (this.state === "landed") {
      const since = t - (this.landT ?? -9);
      // the weight comes down, then back up
      sink = since < 1.1 ? 0.5 * Math.exp(-3.2 * since) * Math.cos(since * 5.2) + 0.12 * Math.exp(-2 * since) : 0;
      pitch = -8 * Math.exp(-3 * Math.max(0, since));
      if (!this.roared && since > 0.75) { this.roared = true; this.act = { type: "roar", t: 0, dur: 2.0 }; if (this.onRoar) this.onRoar(); }
      this.fold = damp(this.fold, 1, 2.2, dt);
    }
    if (this.act) {
      const a = this.act; a.t += dt; const u = clamp(a.t / a.dur, 0, 1);
      if (a.type === "roar") { roar = clamp(Math.min(u / 0.16, (1 - u) / 0.22), 0, 1); jawOpen = roar; }
      else if (a.type === "stare") { const e = clamp(Math.min(u / 0.12, (1 - u) / 0.4), 0, 1); jawOpen = 0.35 * e; coil = 0.5 * e; }
      else if (a.type === "bite") { const e = ease(u); coil = -1.2 * e; jawOpen = clamp(u * 2.2, 0, 1); z = e * 0.55; scale = 1 + e * 1.9; pitch += 10 * e; }
      if (u >= 1) { const done = a.type; this.act = null; if (done === "bite" && this.onBite) this.onBite(); }
    }
    this.flap = damp(this.flap, flap, 8, dt);
    this.roar = damp(this.roar, roar, 10, dt);
    this.jaw = damp(this.jaw, jawOpen, 14, dt);

    // ---- where he looks ----
    let ly = 0, lp = 0;
    if (env.look && this.state === "landed" && !env.reduced) {
      const hs = this.headScreen;
      ly = Math.atan2(env.look.x - hs.x, ppm * 5) * 57.3; lp = Math.atan2(env.look.y - hs.y, ppm * 5) * 57.3;
    }
    ly = clamp(ly, -50, 50) * (1 - this.roar); lp = clamp(lp, -22, 34) * (1 - this.roar);
    this.lookYaw = damp(this.lookYaw, ly, 4.5, dt); this.lookPitch = damp(this.lookPitch, lp, 4.5, dt);

    // ---- the pose ----
    const br = Math.sin(time * 1.25) * still, R = this.roar, F = this.flap, fold = this.fold * (1 - F);
    g.add("chest", br * 1.4 - 6 * R); g.add("back", br * 0.8);
    // neck and head: an S that follows the pointer, and throws back for the roar
    const Y = this.lookYaw, P = this.lookPitch, shake = Math.sin(time * 31) * R * still;
    g.add("neck1", -12 * R + P * 0.2 + 10 * coil, Y * 0.2 + shake * 1.2);
    g.add("neck2", -16 * R + P * 0.25 + 8 * coil, Y * 0.25 + shake * 1.5);
    g.add("neck3", -14 * R + P * 0.25 - 8 * coil, Y * 0.25, shake * 2);
    g.add("head", -20 * R + P * 0.3 - 10 * coil + br * 0.8, Y * 0.3, Y * -0.12 + shake * 2.5);
    g.add("jaw", -26 + 46 * this.jaw);
    // wings: beating on the way down, half folded once he is standing
    const beat = Math.sin(time * 15.5) * F, lag = Math.sin(time * 15.5 - 0.9) * F;
    const rest = 9 * fold + br * 1.6 * fold;
    g.add("wingL1", 0, -8 * fold, 36 * beat - rest + 12 * R * (1 - F)); g.add("wingR1", 0, 8 * fold, -36 * beat + rest - 12 * R * (1 - F));
    g.add("wingL2", 0, -6 * fold, 26 * lag - 5 * fold); g.add("wingR2", 0, 6 * fold, -26 * lag + 5 * fold);
    g.add("wingL3", 0, 0, 18 * lag); g.add("wingR3", 0, 0, -18 * lag);
    // tail
    TAIL.forEach((k, i) => g.add(k, Math.sin(time * 0.9 - i * 0.5) * 1.2 * still + 3 * F, Math.sin(time * 0.75 - i * 0.55) * (3 + i * 1.1) * still));
    // legs: hang in the air, take the weight on landing
    const bend = clamp(sink * 60, -8, 34) + 18 * F;
    for (const k of ["legFL", "legFR"]) g.add(k, -bend * 0.7); for (const k of ["shinFL", "shinFR"]) g.add(k, bend * 1.1);
    for (const k of ["legBL", "legBR"]) g.add(k, bend * 0.8); for (const k of ["shinBL", "shinBR"]) g.add(k, -bend * 1.2);
    g.apply();

    // ---- on the page ----
    const px = ppm * scale;
    this.root.position.set(x, -(y + sink * ppm * 0.35), z * camera.position.z);
    this.root.scale.setScalar(px);
    this.root.rotation.set(0.06, -0.5 + roll * 0.01, 0);
    this.body.rotation.set(pitch * 0.01745, 0, roll * 0.01745);
    this.root.visible = true;
    this.blob.visible = this.state === "landed"; this.blob.material.opacity = env.shadow;

    // where his head is on the screen, for the pointer and for the button over him
    this.root.updateMatrixWorld(true);
    this.rig.parts.head.bone.getWorldPosition(v);
    v.project(camera);
    this.headScreen.x = (v.x * 0.5 + 0.5) * env.W; this.headScreen.y = (-v.y * 0.5 + 0.5) * env.H; this.headScreen.r = ppm * 0.9;
  }
}
