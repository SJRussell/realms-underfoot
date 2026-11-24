/*
 * One goblin: where he stands on the page, how he gets about, and how he holds himself.
 * He has no baked animation. Every pose is built here from a few numbers, as the game does
 * for the dragon.
 */
import * as THREE from "three";
import { Rig, damp, clamp, ease } from "./rig.js";
import { JAW, jawStep } from "./jaw.js";

// The pipeline's bone numbering is the same for both goblins (config/goblin-pilot-*-bones.json).
const BONES = {
  hips: "bone_0", spine: "bone_1", chest: "bone_2", upperChest: "bone_3", neck: "bone_4", head: "bone_5",
  lShoulder: "bone_6", lArm: "bone_7", lFore: "bone_8", lHand: "bone_9",
  rShoulder: "bone_25", rArm: "bone_26", rFore: "bone_27", rHand: "bone_28",
  lThigh: "bone_44", lShin: "bone_45", lFoot: "bone_46", lToe: "bone_47",
  rThigh: "bone_48", rShin: "bone_49", rFoot: "bone_50", rToe: "bone_51",
  jaw: "jaw",   // added by the game under the head bone; its pivot is the jaw hinge
};
const FEET = ["lFoot", "lToe", "rFoot", "rToe"];
const v = new THREE.Vector3();

export class Goblin {
  constructor(model, { key, build, shadowTexture }) {
    this.key = key;
    this.build = build; // "wiry" or "stocky"
    this.root = new THREE.Group();   // feet on the ground, in page pixels
    this.lean = new THREE.Group();   // tips and squashes about the feet
    this.model = model;
    this.rig = new Rig(model, BONES);
    model.position.y = 0.5;          // the pipeline centres the model; this puts the soles at zero
    this.lean.add(model);
    this.root.add(this.lean);
    this.root.rotation.x = 0.1;      // seen from very slightly above
    model.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; } });

    const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, opacity: 0.6 }));
    blob.scale.set(0.95, 0.13, 1); blob.position.set(0, 0.012, -0.05); blob.renderOrder = -1;
    this.blob = blob; this.root.add(blob);

    // Rest height of the lowest foot bone, for keeping the soles on the ground.
    this.root.updateMatrixWorld(true);
    this.restSole = this.lowestFoot();

    this.pos = { x: 0, y: 0 };       // feet, in page coordinates
    this.height = 200;               // pixels
    this.on = null;                  // the perch element he is standing on
    this.dest = null;                // where he is going: { el } or { sx, sy, h } for a spot off the screen
    this.hop = null;
    this.rest = 0;
    this.yaw = 0; this.lookYaw = 0; this.lookPitch = 0;
    this.air = 0; this.crouch = 0; this.lift = 0;
    this.talk = 0; this.talkUntil = 0; this.talkArm = 1;
    this.line = null;                // the line he is saying, for his jaw: { curve, audio, t0 }
    this.jaw = 0;                    // 0 shut, 1 fully open
    this.react = null;
    this.level = { sleep: 0, cower: 0, lookUp: 0, lean: 0, bored: 0 };
    this.want = { sleep: 0, cower: 0, lookUp: 0, lean: 0, bored: 0 };
    this.lookAway = 0;
    this.gone = true;                // not on the page at all (not loaded yet, or ran away)
    this.onArrive = null;
    this.onStep = null;
    this.phase = Math.random() * 10;
    this.root.visible = false;
  }

  lowestFoot() {
    let low = Infinity;
    for (const k of FEET) { const p = this.rig.parts[k]; if (p) { p.bone.getWorldPosition(v); low = Math.min(low, v.y); } }
    return low;
  }

  /** Put him straight onto a perch, no hopping. */
  place(el, env) {
    const p = perchPoint(el, env);
    this.pos.x = p.x; this.pos.y = p.y; this.height = p.h; this.on = el; this.dest = null; this.hop = null; this.gone = false;
  }
  goTo(dest) { this.dest = dest; if (dest && dest.el && dest.el === this.on && !this.hop) this.dest = null; }
  say(ms) { this.talkUntil = performance.now() + ms; this.talkArm = Math.random() < 0.5 ? 1 : -1; }
  /** The line his jaw follows: its loudness curve, the playing clip if sound is on, and when the words appeared. Null shuts it. */
  mouth(curve, audio, t0) { this.line = curve ? { curve, audio: audio || null, t0 } : null; }
  do(type, opts = {}) { this.react = { type, t: 0, dur: opts.dur || DURATION[type] || 1, dir: opts.dir || (Math.random() < 0.5 ? -1 : 1) }; }

  screen(env) { return { x: this.pos.x - env.sx, y: this.pos.y - env.sy }; }
  /** Top of his head on the screen, for bubbles and buttons. */
  headTop(env) { const s = this.screen(env); return { x: s.x, y: s.y - this.lift - this.height * (this.build === "wiry" ? 1.0 : 0.99) }; }

  startHop(env) {
    const d = this.dest; if (!d) return;
    const target = d.el ? perchPoint(d.el, env) : { x: d.sx + env.sx, y: d.sy + env.sy, h: d.h || this.height };
    let s = this.screen(env);
    const ts = { x: target.x - env.sx, y: target.y - env.sy };
    const offA = s.x < -90 || s.x > env.W + 90 || s.y < -60 || s.y > env.H + this.height + 60;
    const offB = ts.x < -90 || ts.x > env.W + 90 || ts.y < -60 || ts.y > env.H + target.h + 60;
    if (env.reduced || (offA && offB) || (this.gone && offB)) {
      // Nothing to watch: be there.
      this.pos.x = target.x; this.pos.y = target.y; this.height = target.h; this.arrive(d); return;
    }
    if (offA || this.gone) {
      // Come in from the nearest edge instead of crossing a page nobody is looking at.
      const fromAbove = s.y < env.H / 2;
      s = { x: clamp(ts.x + (ts.x < env.W / 2 ? 40 : -40), -60, env.W + 60), y: fromAbove ? -30 : env.H + target.h + 30 };
      if (this.gone) s = { x: ts.x < env.W / 2 ? -80 : env.W + 80, y: ts.y };
      this.pos.x = s.x + env.sx; this.pos.y = s.y + env.sy; this.height = target.h; this.gone = false;
    }
    const dx = target.x - this.pos.x, dy = target.y - this.pos.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 5) { this.pos.x = target.x; this.pos.y = target.y; this.height = target.h; this.arrive(d); return; }
    const reach = Math.max(260, 2.3 * Math.max(this.height, target.h));
    const f = Math.min(1, reach / dist);
    this.on = null;
    this.hop = {
      from: { x: this.pos.x, y: this.pos.y, h: this.height },
      to: { x: this.pos.x + dx * f, y: this.pos.y + dy * f, h: this.height + (target.h - this.height) * f },
      t: 0, dur: 0.36 + Math.min(0.26, dist * f * 0.0006), last: f >= 1, d,
      arc: Math.max(46, Math.min(0.32 * dist * f, 0.75 * this.height)) + Math.max(0, -dy * f) * 0.25,
      dir: Math.abs(dx) < 12 ? 0 : Math.sign(dx),
    };
  }
  arrive(d) {
    this.hop = null;
    if (d.el) { this.on = d.el; this.gone = false; } else { this.gone = true; }
    if (this.dest === d) this.dest = null;
    if (this.onArrive) this.onArrive(this, d);
  }

  update(dt, now, env) {
    const t = now / 1000 + this.phase;
    const L = this.level, W = this.want;

    // ---- getting about ----
    if (this.on && !this.hop) { const p = perchPoint(this.on, env); this.pos.x = p.x; this.pos.y = p.y; this.height = p.h; }
    if (!this.hop && this.dest) { this.rest -= dt; if (this.rest <= 0) this.startHop(env); }
    let yawWant = 0, crouchWant = 0, airWant = 0, lift = 0;
    if (this.hop) {
      const h = this.hop; h.t += dt;
      const u = clamp(h.t / h.dur, 0, 1);
      const prep = 0.2, land = 0.86;
      const fly = clamp((u - prep) / (land - prep), 0, 1);
      const k = ease(fly);
      if (h.last && h.d.el) h.to = perchPoint(h.d.el, env);
      this.pos.x = h.from.x + (h.to.x - h.from.x) * k; this.pos.y = h.from.y + (h.to.y - h.from.y) * k;
      this.height = h.from.h + (h.to.h - h.from.h) * k;
      lift = h.arc * 4 * fly * (1 - fly);
      crouchWant = u < prep ? u / prep : u > land ? 1 - (u - land) / (1 - land) * 0.4 : 0;
      airWant = u >= prep && u <= land ? 1 : 0;
      yawWant = h.dir * 58;
      if (u >= 1) {
        if (this.onStep) this.onStep(this);
        this.squash = 1;
        if (h.last) this.arrive(h.d); else { this.hop = null; this.rest = 0.05; }
      }
    }
    this.lift = lift;
    this.air = damp(this.air, airWant, 22, dt);
    this.crouch = damp(this.crouch, crouchWant, airWant ? 30 : 16, dt);
    this.squash = damp(this.squash || 0, 0, 9, dt);

    // ---- slow states ----
    for (const k in L) L[k] = damp(L[k], W[k], k === "cower" ? 7 : 3, dt);
    const talking = now < this.talkUntil ? 1 : 0;
    this.talk = damp(this.talk, talking, talking ? 12 : 6, dt);
    this.jaw = env.reduced ? 0 : jawStep(this.jaw, this.line, now, dt);

    // ---- where he looks ----
    const s = this.screen(env);
    const hx = s.x, hy = s.y - this.height * 0.86;
    let ly = 0, lp = 0;
    if (env.look && !env.reduced) {
      const depth = Math.max(260, this.height * 1.25);
      ly = Math.atan2(env.look.x - hx, depth) * 57.3; lp = Math.atan2(env.look.y - hy, depth) * 57.3;
    }
    if (this.lookAway > 0) { this.lookAway -= dt; ly = ly > 0 ? -62 : 62; lp = -6; }
    if (L.bored > 0.05 && !env.reduced) { ly += Math.sin(t * 0.37) * 38 * L.bored; lp += Math.sin(t * 0.23 + 1) * 14 * L.bored - 6 * L.bored; }
    ly = clamp(ly, -68, 68) * (1 - L.sleep) * (1 - 0.6 * L.cower); lp = clamp(lp, -32, 40) * (1 - L.sleep);
    if (this.hop) { ly = ly * 0.35; }
    this.lookYaw = damp(this.lookYaw, ly, 9, dt); this.lookPitch = damp(this.lookPitch, lp, 9, dt);
    this.yaw = damp(this.yaw, yawWant + (Math.abs(this.lookYaw) > 48 ? Math.sign(this.lookYaw) * 14 : 0), 12, dt);

    // ---- one-off reactions ----
    let hit = 0, wave = 0, shrug = 0, cheer = 0, startle = 0, tilt = 0, extraLift = 0;
    if (this.react) {
      const r = this.react; r.t += dt; const u = clamp(r.t / r.dur, 0, 1);
      const bell = Math.sin(Math.PI * u), inout = clamp(Math.min(u / 0.18, (1 - u) / 0.25), 0, 1);
      if (r.type === "hit") { hit = Math.pow(1 - u, 2); tilt = r.dir * 24 * Math.exp(-4 * u) * Math.cos(u * 9); extraLift = 14 * Math.max(0, Math.sin(Math.PI * Math.min(1, u * 3.2))); if (r.t < dt * 1.5) this.squash = 1; }
      else if (r.type === "wave") wave = ease(inout);
      else if (r.type === "shrug") shrug = ease(inout);
      else if (r.type === "cheer") { cheer = ease(inout); extraLift = 26 * Math.abs(Math.sin(u * Math.PI * 2.5)) * (1 - u); }
      else if (r.type === "startle") { startle = bell; extraLift = 30 * bell; }
      else if (r.type === "wobble") { tilt = r.dir * 14 * Math.exp(-2.6 * u) * Math.sin(u * 16); }
      if (u >= 1) this.react = null;
    }
    this.lift += extraLift * this.height / 220;

    // ---- the pose ----
    const g = this.rig; g.clear();
    const wiry = this.build === "wiry";
    const still = env.reduced ? 0 : 1;
    const calm = 1 - L.sleep * 0.5;
    const br = Math.sin(t * (1.7 - 0.9 * L.sleep)) * (1 + 1.6 * L.sleep) * still;
    const sway = Math.sin(t * 0.62) * still * calm, sway2 = Math.sin(t * 0.41 + 2) * still * calm;

    // standing at ease, out of the A pose the mesh was made in
    if (wiry) {
      g.add("lArm", -4, 0, -36); g.add("rArm", -4, 0, 36); g.add("lFore", -30, 0, 6); g.add("rFore", -30, 0, -6);
      g.add("spine", 8); g.add("upperChest", 5); g.add("neck", 4); g.add("head", -12);
      g.add("lThigh", -4, 0, 2); g.add("rThigh", -4, 0, -2); g.add("lShin", 9); g.add("rShin", 9); g.add("lFoot", -5); g.add("rFoot", -5);
    } else {
      g.add("lArm", 0, 0, -27); g.add("rArm", 0, 0, 27); g.add("lFore", -20, 0, 8); g.add("rFore", -20, 0, -8);
      g.add("spine", 3); g.add("upperChest", -3); g.add("head", -2);
    }
    // breathing and shifting weight
    g.add("chest", br * 1.3); g.add("upperChest", br * 0.9); g.add("lShoulder", 0, 0, br * 1.6); g.add("rShoulder", 0, 0, -br * 1.6);
    g.add("hips", 0, sway2 * 2, sway * 2.2); g.add("spine", 0, 0, -sway * 2.6); g.add("lThigh", 0, 0, -sway * 2.2); g.add("rThigh", 0, 0, -sway * 2.2);
    g.add("lArm", sway2 * 2, 0, sway * 1.4); g.add("rArm", -sway2 * 2, 0, sway * 1.4); g.add("head", 0, 0, sway2 * 1.6);

    // the look, shared down the spine so the whole goblin turns to you
    const Y = this.lookYaw, P = this.lookPitch;
    g.add("head", P * 0.55, Y * 0.5); g.add("neck", P * 0.22, Y * 0.2); g.add("upperChest", P * 0.12, Y * 0.18); g.add("spine", P * 0.05, Y * 0.12);

    // hop: crouch, tuck, land
    const c = this.crouch + L.cower * 0.55 + this.squash * 0.25, a = this.air;
    g.add("lThigh", -52 * c - 34 * a); g.add("rThigh", -52 * c - 46 * a); g.add("lShin", 98 * c + 62 * a); g.add("rShin", 98 * c + 78 * a);
    g.add("lFoot", -46 * c + 22 * a); g.add("rFoot", -46 * c + 22 * a); g.add("spine", 15 * c - 7 * a); g.add("hips", 6 * c);
    g.add("lArm", 26 * c - 20 * a, 0, 58 * a); g.add("rArm", 26 * c - 20 * a, 0, -58 * a); g.add("lFore", -22 * a); g.add("rFore", -22 * a);

    // talking with his hands
    if (this.talk > 0.01) {
      const e = this.talk * (wiry ? 1 : 0.6), n1 = Math.sin(t * 9.3), n2 = Math.sin(t * 5.7 + 1.3), n3 = Math.sin(t * 3.1);
      g.add("head", e * (n1 * 3.5 + 2), e * n3 * 5, e * n2 * 5); g.add("chest", e * n2 * 2);
      const A = this.talkArm > 0 ? "r" : "l", sgn = this.talkArm > 0 ? -1 : 1;
      g.add(A + "Arm", -e * 24, 0, sgn * e * (34 + n3 * 8)); g.add(A + "Fore", -e * (58 + n1 * 20), 0, sgn * e * n2 * 16); g.add(A + "Hand", e * n1 * 22);
      const O = this.talkArm > 0 ? "l" : "r";
      g.add(O + "Fore", -e * (14 + n2 * 10));
    }
    // the jaw, on top of everything else: a turn about the hinge, the way a nod turns the head
    if (this.jaw > 0) g.add("jaw", this.jaw * JAW.degrees);
    // reactions
    if (wave) { g.add("rArm", -10 * wave, 0, -112 * wave); g.add("rFore", -8 * wave, 0, (-18 + Math.sin(t * 12) * 30) * wave); g.add("head", 0, 0, 7 * wave); g.add("spine", 0, 0, 4 * wave); }
    if (shrug) { g.add("lShoulder", 0, 0, 16 * shrug); g.add("rShoulder", 0, 0, -16 * shrug); g.add("lArm", 0, 0, 14 * shrug); g.add("rArm", 0, 0, -14 * shrug); g.add("lFore", -72 * shrug, 34 * shrug); g.add("rFore", -72 * shrug, -34 * shrug); g.add("head", -5 * shrug, 0, 10 * shrug); }
    if (cheer) { g.add("lArm", -8 * cheer, 0, 118 * cheer); g.add("rArm", -8 * cheer, 0, -118 * cheer); g.add("lFore", -18 * cheer); g.add("rFore", -18 * cheer); g.add("head", -14 * cheer); }
    if (hit) { g.add("spine", -20 * hit); g.add("head", -16 * hit); g.add("lArm", 0, 0, 44 * hit); g.add("rArm", 0, 0, -44 * hit); g.add("lFore", -30 * hit); g.add("rFore", -30 * hit); }
    if (startle) { g.add("lArm", 0, 0, 70 * startle); g.add("rArm", 0, 0, -70 * startle); g.add("head", -12 * startle); g.add("lThigh", -20 * startle); g.add("rThigh", -20 * startle); g.add("lShin", 40 * startle); g.add("rShin", 40 * startle); }
    // slow states
    if (L.cower > 0.01) { const k = L.cower, sh = Math.sin(t * 38) * still; g.add("lArm", -20 * k, 0, 104 * k); g.add("rArm", -20 * k, 0, -104 * k); g.add("lFore", -30 * k, 0, 82 * k); g.add("rFore", -30 * k, 0, -82 * k); g.add("head", 20 * k, sh * 2 * k); g.add("spine", 8 * k); tilt += sh * 1.1 * k; }
    if (L.lookUp > 0.01) { const k = L.lookUp; g.add("head", -34 * k); g.add("neck", -12 * k); g.add("upperChest", -7 * k); }
    if (L.sleep > 0.01) { const k = L.sleep; g.add("head", 36 * k, 0, 10 * k); g.add("neck", 10 * k); g.add("spine", 11 * k, 0, Math.sin(t * 0.5) * 3 * k * still); g.add("lArm", 4 * k, 0, -8 * k); g.add("rArm", 4 * k, 0, 8 * k); g.add("lFore", 16 * k); g.add("rFore", 16 * k); }
    if (L.lean > 0.01) { const k = L.lean; g.add("spine", 15 * k); g.add("chest", 9 * k); g.add("head", -8 * k); g.add("lArm", -10 * k); g.add("rArm", -10 * k); g.add("lThigh", -6 * k); g.add("rThigh", -6 * k); }
    if (L.bored > 0.01) { const k = L.bored; g.add("spine", 6 * k); g.add("rFoot", -20 * k * Math.max(0, Math.sin(t * 6.5)) * still); g.add("hips", 0, 0, 3 * k); g.add("lThigh", 0, 0, -3 * k); g.add("rThigh", 0, 0, -3 * k); }
    g.apply();

    // ---- on the page ----
    const scale = this.height;
    this.root.position.set(s.x, -(s.y - this.lift), 0);
    this.root.scale.setScalar(scale);
    this.root.rotation.y = this.yaw * 0.01745;
    this.lean.rotation.z = tilt * 0.01745; this.lean.rotation.x = -hit * 0.2;
    const sq = this.squash * 0.11 - a * 0.05;
    this.lean.scale.set(1 + sq * 0.6, 1 - sq, 1 + sq * 0.6);
    // keep the soles on the ground when the legs bend
    this.model.position.y = 0.5;
    const grounded = 1 - a;
    if (grounded > 0.02) {
      this.root.updateMatrixWorld(true);
      const low = (this.lowestFoot() - this.root.position.y) / scale;
      this.model.position.y = 0.5 + (this.restSole - low) * grounded;
    }
    this.blob.position.y = 0.012 - this.lift / scale;
    this.blob.material.opacity = env.shadow * clamp(1 - this.lift / (scale * 0.9), 0.15, 1);
    const b = this.blob.scale; b.x = 0.95 * (1 - 0.35 * clamp(this.lift / scale, 0, 1));

    const vis = !this.gone && s.x > -scale && s.x < env.W + scale && s.y > -40 && s.y - scale * 1.2 < env.H + 40;
    this.root.visible = vis;
    this.visibleNow = vis;
  }
}

const DURATION = { hit: 0.9, wave: 1.9, shrug: 1.5, cheer: 1.5, startle: 0.55, wobble: 1.2 };

/** A perch is an empty box in the page. Feet go at its bottom middle; its height is his height. */
export function perchPoint(el, env) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2 + env.sx, y: r.bottom + env.sy, h: Math.max(60, r.height) };
}
