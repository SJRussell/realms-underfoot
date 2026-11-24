/*
 * The 3D layer: one see-through canvas fixed over the page. One unit in the scene is one CSS
 * pixel at the page's surface, so anything can be stood on an HTML element by reading where
 * that element is.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { JawCurves } from "./jaw.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { Goblin } from "./goblin.js";
import { Ignis } from "./ignis.js";
import { clamp, damp } from "./rig.js";

const url = (p) => new URL(p, document.baseURI).href;
const FOV = 26;

export class Stage {
  constructor({ canvas, brain, voice, reduced, site }) {
    this.canvas = canvas; this.brain = brain; this.voice = voice; this.reduced = reduced; this.site = site;
    const coarse = matchMedia("(pointer: coarse)").matches;
    this.maxRatio = coarse ? 1.75 : 2;
    this.ratio = Math.min(window.devicePixelRatio || 1, this.maxRatio);
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: this.ratio < 2, powerPreference: "high-performance" });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 10, 6000);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.hemi = new THREE.HemisphereLight(0xbcd0e6, 0x3a3020, 1);
    this.key = new THREE.DirectionalLight(0xffe6c0, 2.4); this.key.position.set(-0.55, 0.85, 1);
    this.rim = new THREE.DirectionalLight(0x86b4ff, 2.2); this.rim.position.set(0.9, 0.45, -1);
    this.scene.add(this.hemi, this.key, this.rim);
    this.light = matchMedia("(prefers-color-scheme: light)");
    this.light.addEventListener("change", () => this.theme());

    this.shadowTexture = blobTexture();
    this.loader = new GLTFLoader();
    const draco = new DRACOLoader(); draco.setDecoderPath(url("vendor/three/addons/libs/draco/gltf/")); this.loader.setDRACOLoader(draco);

    this.T = null; this.B = null; this.ignis = null; this.egg = null; this.chest = null; this.motes = null;
    this.curves = new JawCurves(); this.curves.load(url("assets/audio/jaw-curves.json"));
    this.perches = [...document.querySelectorAll("[data-perch]")].filter((el) => el.dataset.perch !== "end");
    this.cornerPerch = document.getElementById("corner-perch");
    this.bruiserPerch = document.querySelector("[data-perch-bruiser]");
    this.fleePerch = document.querySelector('[data-perch="end"]');
    this.ignisSpot = document.querySelector("[data-ignis-spot]");
    this.eggSpots = [...document.querySelectorAll("[data-egg-spot]")];
    this.chestSpot = document.querySelector("[data-chest-spot]");
    this.buttons = { T: document.getElementById("hit-thrower"), B: document.getElementById("hit-bruiser"), I: document.getElementById("hit-ignis") };
    this.chip = document.getElementById("mood-chip");
    this.hover = null;
    this.hiding = false;
    this.env = { sx: 0, sy: 0, W: 1, H: 1, look: null, reduced, shadow: 0.5 };
    this.mouse = null; this.touch = null; this.scrollV = 0; this.lastSY = window.scrollY;
    this.frames = 0; this.slow = 0; this.avg = 16; this.lastT = 0; this.raf = 0; this.pickAt = 0; this.lastDraw = 0;

    this.theme(); this.size(); this.wire();
  }

  theme() {
    const light = this.light.matches;
    this.hemi.intensity = light ? 1.5 : 0.75; this.key.intensity = light ? 2.6 : 2.3; this.rim.intensity = light ? 1.1 : 2.4;
    this.rim.color.set(light ? 0xfff0d0 : 0x7fb2ff);
    this.scene.environmentIntensity = light ? 0.75 : 0.42;
    this.env.shadow = light ? 0.42 : 0.62;
    if (this.motes) this.motes.visible = !light && !this.reduced;
  }
  size() {
    const W = this.canvas.clientWidth || window.innerWidth, H = this.canvas.clientHeight || window.innerHeight;
    this.env.W = W; this.env.H = H;
    this.renderer.setPixelRatio(this.ratio);
    this.renderer.setSize(W, H, false);
    const d = H / 2 / Math.tan((FOV / 2) * Math.PI / 180);
    this.camera.aspect = W / H; this.camera.near = Math.max(10, d * 0.12); this.camera.far = d + 4000;
    this.camera.position.set(W / 2, -H / 2, d); this.camera.lookAt(W / 2, -H / 2, 0); this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
  }
  wire() {
    window.addEventListener("resize", () => this.size(), { passive: true });
    window.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse" || e.pointerType === "pen") this.mouse = { x: e.clientX, y: e.clientY }; }, { passive: true });
    document.documentElement.addEventListener("pointerleave", () => { this.mouse = null; }, { passive: true });
    window.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse") this.touch = { x: e.clientX, y: e.clientY, at: performance.now() }; }, { passive: true });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) { cancelAnimationFrame(this.raf); this.raf = 0; this.hiddenAt = performance.now(); }
      else { if (this.egg && performance.now() - (this.hiddenAt || 0) > 1000) this.moveEgg(true); this.run(); }
    });
    for (const who of ["T", "B", "I"]) {
      const b = this.buttons[who];
      b.addEventListener("click", (e) => this.poke(who, e));
      const over = () => { this.hover = who; if (who !== "I") this.brain.stare(who); };
      const out = () => { if (this.hover === who) this.hover = null; };
      b.addEventListener("pointerenter", over); b.addEventListener("pointerleave", out);
      b.addEventListener("focus", () => { this.hover = who; }); b.addEventListener("blur", out);
    }
  }

  async gltf(name) { const g = await this.loader.loadAsync(url("assets/models/" + name + ".glb")); g.scene.traverse((o) => { if (o.isMesh && o.material) { o.material.envMapIntensity = o.material.name === "MouthInside" ? 0 : 1; } }); return g.scene; }   // the inside of a goblin's mouth is dark and matte, as in the game: it reflects nothing

  /** The rock thrower first: he is the page. Everything else follows. */
  async loadFirst() {
    const model = await this.gltf("goblin-thrower");
    this.T = new Goblin(model, { key: "T", build: "wiry", shadowTexture: this.shadowTexture });
    this.T.onArrive = (g, d) => { if (d.el && d.el.dataset.perch) this.brain.arrived(d.el.dataset.perch); };
    this.T.onStep = () => this.voice.effect("footstep-grass-" + (1 + Math.floor(Math.random() * 3)), 0.25);
    this.scene.add(this.T.root);
    this.readEnv();
    this.T.place(this.pickPerch(), this.env);
    if (!this.reduced) this.addMotes();
    this.run();
    this.canvas.classList.add("ready");
    this.loadRest();
  }
  async loadRest() {
    try {
      const m = await this.gltf("goblin-bruiser");
      this.B = new Goblin(m, { key: "B", build: "stocky", shadowTexture: this.shadowTexture });
      this.B.onStep = this.T.onStep;
      this.scene.add(this.B.root); this.B.place(this.bruiserPerch, this.env);
    } catch (e) { console.warn("The bruiser did not load.", e); }
    try {
      const [egg, chest] = await Promise.all([this.gltf("silk-egg"), this.gltf("silk-chest-shut")]);
      this.egg = { obj: this.prop(egg), spot: 0, away: 0, seen: false, fresh: false, moves: 0 };
      this.chest = { obj: this.prop(chest) };
      this.chest.obj.rotation.y = -0.45; this.egg.obj.rotation.y = 0.6;
    } catch (e) { console.warn("The props did not load.", e); }
    // The dragon is the heaviest thing here. Fetch him once the visitor is on their way down, or after a pause.
    const fetchIgnis = () => { window.removeEventListener("scroll", onScroll); clearTimeout(timer); this.loadIgnis(); };
    const onScroll = () => { if (window.scrollY > window.innerHeight * 0.8) fetchIgnis(); };
    const timer = setTimeout(fetchIgnis, 7000);
    window.addEventListener("scroll", onScroll, { passive: true });
  }
  prop(model) {
    const g = new THREE.Group(); g.add(model);
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.shadowTexture, transparent: true, depthWrite: false, opacity: 0.55 }));
    const box = new THREE.Box3().setFromObject(model); const w = box.max.x - box.min.x;
    blob.scale.set(w * 1.5, w * 0.2, 1); blob.position.set(0, 0.005, -w * 0.2); blob.renderOrder = -1; g.add(blob);
    g.userData.height = box.max.y - box.min.y; g.userData.blob = blob; g.rotation.x = 0.16; g.visible = false;
    this.scene.add(g); return g;
  }
  loadIgnis() {
    if (!this.ignisLoading) {
      this.ignisLoading = this.gltf("ignis").then((m) => {
        this.ignis = new Ignis(m, this.shadowTexture);
        this.ignis.onLand = () => {
          this.voice.effect("dragon-land", 0.9);
          if (!this.reduced) { document.body.classList.add("shake"); setTimeout(() => document.body.classList.remove("shake"), 650); }
        };
        this.ignis.onRoar = () => { this.voice.effect("dragon-roar", 1); const h = this.ignis.headScreen; this.voice.floater(clamp(h.x, 120, this.env.W - 120), Math.max(150, h.y - 60), "IGNIS", true); };
        this.ignis.onBite = () => { this.voice.effect("dragon-chomp", 1); this.brain.die(); };
        this.scene.add(this.ignis.root);
        return this.ignis;
      }).catch((e) => { console.warn("The dragon did not load.", e); return null; });
    }
    return this.ignisLoading;
  }

  // ------------------------------------------------------------------ asked for by the brain
  react(who, type, opts) { const g = this[who]; if (g && !g.gone && !this.reduced) g.do(type, opts); }
  set(who, key, value) { const g = this[who]; if (g) g.want[key] = value; }
  lookAway(who, seconds) { const g = this[who]; if (g && !this.reduced) g.lookAway = seconds; }
  talking(who, ms) { const g = this[who]; if (g && !this.reduced) g.say(ms); }
  /** Whose jaw moves, and with what: the clip's id, the words, the playing clip if sound is on, and when the words appeared.
      The other goblin's jaw shuts. With no `who`, both shut. */
  mouth(who, id, words, audio, t0) {
    for (const k of ["T", "B"]) { const g = this[k]; if (g) g.mouth(k === who && !this.reduced ? this.curves.get(id, words) : null, audio, t0); }
  }
  flee(who, ms, back) {
    const g = this[who]; if (!g || g.gone) return;
    const s = g.screen(this.env);
    if (who === "T") this.hiding = true;
    g.goTo({ sx: s.x < this.env.W / 2 ? -160 : this.env.W + 160, sy: s.y, h: g.height });
    setTimeout(() => {
      if (this.brain.ignisHere && this.brain.fled) return;      // the dragon is still here: stay hidden
      if (who === "T") this.hiding = false; else g.goTo({ el: this.bruiserPerch });
      if (back) setTimeout(back, 900);
    }, ms);
  }
  async ignisArrive() {
    const pass = document.getElementById("shadow-pass");
    if (!this.reduced) { pass.classList.remove("go"); void pass.offsetWidth; pass.classList.add("go"); }
    this.voice.effect("dragon-wings", 0.8); this.voice.effect("dragon-roar-far", 0.5);
    for (const g of [this.T, this.B]) if (g) g.want.lookUp = 1;
    setTimeout(() => {
      for (const who of ["T", "B"]) {
        const g = this[who]; if (!g) continue;
        g.want.lookUp = 0;
        if (who === "T") this.hiding = true;
        if (g.gone) continue;
        const s = g.screen(this.env);
        g.goTo({ sx: s.x < this.env.W / 2 ? -170 : this.env.W + 170, sy: s.y, h: g.height });
      }
    }, 1500);
    const ignis = await this.loadIgnis();
    if (ignis && this.brain.ignisHere) ignis.arrive(this.reduced);
  }
  ignisReset() { if (this.ignis) this.ignis.reset(); }
  goblinsReturn() {
    this.hiding = false;
    if (this.B) { this.B.want.cower = 0; this.B.goTo({ el: this.bruiserPerch }); }
    if (this.T) this.T.want.cower = 0;
  }
  poke(who, ev) {
    if (who === "I") {
      if (!this.ignis) return;
      const did = this.ignis.poke(this.reduced);
      if (did === "roar") this.voice.effect("dragon-roar", 1); else if (did === "stare") this.voice.effect("dragon-roar-far", 0.7);
      return;
    }
    const g = this[who]; if (!g || g.gone) return;
    const head = g.headTop(this.env);
    const px = ev && ev.clientX ? ev.clientX : head.x;
    g.do("hit", { dir: px < head.x ? 1 : -1 });
    this.brain.poke(who, head.x + (Math.random() * 40 - 20), head.y - 6);
  }

  // ------------------------------------------------------------------ every frame
  readEnv() {
    const e = this.env; e.sx = window.scrollX; e.sy = window.scrollY;
    const t = performance.now();
    if (this.mouse) e.look = this.mouse;
    else if (this.touch && t - this.touch.at < 4000) e.look = this.touch;
    else e.look = { x: e.W * 0.5, y: e.H * 0.42 + clamp(this.scrollV * 0.12, -260, 260) };   // where the visitor is reading
  }
  /** The perch nearest the middle of the screen that is wholly in view. He keeps the one he has while it stays in view. */
  pickPerch() {
    const H = this.env.H; let best = null, score = 1e9;
    const fits = (el) => { const r = el.getBoundingClientRect(); return r.height > 0 && r.top > 58 && r.bottom < H - 2 ? Math.abs((r.top + r.bottom) / 2 - H * 0.46) : -1; };
    const cur = this.T && (this.T.on || (this.T.dest && this.T.dest.el));
    if (cur && this.perches.includes(cur) && fits(cur) >= 0) return cur;
    for (const el of this.perches) { const f = fits(el); if (f >= 0 && f < score) { score = f; best = el; } }
    return best || this.cornerPerch;
  }
  moveEgg(whileAway) {
    const egg = this.egg; if (!egg || !egg.seen || (egg.fresh && !whileAway)) return;   // one move, then it waits to be found
    const H = this.env.H;
    const options = this.eggSpots.map((el, i) => { const r = el.getBoundingClientRect(); return { i, on: r.bottom > 0 && r.top < H, far: r.top < 0 ? -r.bottom : r.top - H }; }).filter((o) => o.i !== egg.spot);
    // Never while it could be seen: with the tab open it only goes somewhere out of view.
    const ok = whileAway ? options : options.filter((o) => !o.on);
    if (!ok.length) return;
    ok.sort((a, b) => (whileAway ? Number(b.on) - Number(a.on) : 0) || Math.abs(a.far) - Math.abs(b.far));
    egg.spot = ok[0].i; egg.moves += 1; egg.fresh = true; egg.away = 0; egg.obj.rotation.y = Math.random() * 6.3;
  }
  props(dt) {
    const e = this.env;
    if (this.egg) {
      const r = this.eggSpots[this.egg.spot].getBoundingClientRect();
      const on = r.bottom > 0 && r.top < e.H, clear = r.top > 70 && r.bottom < e.H - 10;
      if (on) { this.egg.away = 0; if (clear) { if (this.egg.fresh) { this.egg.fresh = false; this.brain.eggSeen(); } this.egg.seen = true; } }
      else { this.egg.away += dt; if (this.egg.away > 1.4) this.moveEgg(false); }
      const o = this.egg.obj; o.visible = on;
      o.position.set(r.left + r.width / 2, -r.bottom, 0); o.scale.setScalar(r.height / o.userData.height);
      o.userData.blob.material.opacity = e.shadow;
    }
    if (this.chest) {
      const r = this.chestSpot.getBoundingClientRect(), o = this.chest.obj;
      o.visible = r.bottom > -50 && r.top < e.H + 50;
      o.position.set(r.left + r.width / 2, -(r.bottom - r.height * 0.08), 0); o.scale.setScalar(r.height * 0.84 / o.userData.height);
      o.userData.blob.material.opacity = e.shadow;
    }
  }
  addMotes() {
    const n = 44, pos = new Float32Array(n * 3); this.moteSeed = [];
    for (let i = 0; i < n; i++) { this.moteSeed.push({ x: Math.random(), y: Math.random(), z: Math.random() * 500 - 350, s: 0.4 + Math.random(), p: Math.random() * 6.3 }); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ map: blobTexture("255,255,255"), color: 0xffd27a, size: 9, sizeAttenuation: false, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
    this.motes = new THREE.Points(geo, mat); this.motes.frustumCulled = false; this.motes.renderOrder = -2;
    this.motes.visible = !this.light.matches; this.scene.add(this.motes);
  }
  moveMotes(t) {
    if (!this.motes || !this.motes.visible) return;
    const e = this.env, a = this.motes.geometry.attributes.position, H = e.H + 80;
    this.moteSeed.forEach((m, i) => {
      const y = (((m.y * H - t * 9 * m.s - e.sy * 0.25 * m.s) % H) + H) % H - 40;
      a.setXYZ(i, m.x * e.W + Math.sin(t * 0.4 * m.s + m.p) * 26, -y, m.z);
    });
    a.needsUpdate = true; this.motes.material.opacity = 0.34 + 0.12 * Math.sin(t * 0.8);
  }
  overlay() {
    const e = this.env, anchors = {};
    for (const who of ["T", "B"]) {
      const g = this[who], b = this.buttons[who];
      if (!g || g.gone || !g.visibleNow) { if (!b.hidden) b.hidden = true; if (g && !g.gone) { const h = g.headTop(e); anchors[who] = { x: h.x, y: h.y, feet: h.y + g.height, on: false }; } continue; }
      const h = g.headTop(e), w = g.height * 0.62;
      anchors[who] = { x: h.x, y: h.y, feet: h.y + g.height + g.lift, on: true, r: g.height * 0.3 };
      if (b.hidden) b.hidden = false;
      b.style.left = Math.round(h.x - w / 2) + "px"; b.style.top = Math.round(h.y) + "px"; b.style.width = Math.round(w) + "px"; b.style.height = Math.round(g.height) + "px";
    }
    const ib = this.buttons.I, ig = this.ignis;
    if (ig && ig.state === "landed" && !this.brain.dead) {
      const hs = ig.headScreen, r = hs.r;
      if (ib.hidden) ib.hidden = false;
      ib.style.left = Math.round(hs.x - r) + "px"; ib.style.top = Math.round(hs.y - r * 0.8) + "px"; ib.style.width = Math.round(r * 2) + "px"; ib.style.height = Math.round(r * 2.4) + "px";
    } else if (!ib.hidden) ib.hidden = true;
    this.voice.place(anchors);

    // the name and mood card, as over an aimed-at enemy in the game
    const who = this.hover, a = who && anchors[who], bubble = this.voice.bubble;
    if (a && a.on && !(bubble && bubble.who === who)) {
      const m = this.brain.mood[who], c = this.chip;
      if (c.hidden) c.hidden = false;
      c.querySelector(".mood-name").textContent = (who === "T" ? "Goblin rock thrower" : "Goblin bruiser") + " · Lv 1";
      c.querySelector(".mood-word").textContent = m.word;
      const bar = c.querySelector(".mood-bar i"); bar.style.width = Math.round(m.level * 100) + "%"; bar.style.backgroundColor = m.tone;
      const w = c.offsetWidth, hgt = c.offsetHeight;
      c.style.transform = "translate(" + Math.round(clamp(a.x - w / 2, 8, e.W - w - 8)) + "px," + Math.round(Math.max(64, a.y - hgt - 14)) + "px)";
    } else if (!this.chip.hidden) this.chip.hidden = true;
  }

  run() { if (!this.raf && !document.hidden) { this.lastT = 0; this.raf = requestAnimationFrame((t) => this.frame(t)); } }
  frame(now) {
    this.raf = requestAnimationFrame((t) => this.frame(t));
    const dt = this.lastT ? Math.min(0.05, (now - this.lastT) / 1000) : 0.016;
    const raw = this.lastT ? now - this.lastT : 16; this.lastT = now;
    const e = this.env;
    if (this.canvas.clientWidth !== e.W || this.canvas.clientHeight !== e.H) this.size();
    const sy = window.scrollY; this.scrollV = damp(this.scrollV, (sy - this.lastSY) / Math.max(dt, 0.008), 6, dt);
    const moved = sy !== this.lastSY; this.lastSY = sy;
    if (this.reduced && !moved && now - this.lastDraw < 250) return;   // a still goblin does not need sixty frames a second
    this.lastDraw = now;
    this.readEnv();

    if (this.T) {
      if (now - this.pickAt > 140) {
        this.pickAt = now;
        if (!this.hiding) { const p = this.pickPerch(); if (p && p !== this.T.on && !(this.T.dest && this.T.dest.el === p)) this.T.goTo({ el: p }); else if (this.T.gone && !this.T.dest && p) this.T.goTo({ el: p }); }
      }
      this.T.update(dt, now, e);
    }
    if (this.B) this.B.update(dt, now, e);
    if (this.ignis) this.ignis.update(dt, now, e, this.ignisSpot, this.camera);
    this.props(dt);
    this.moveMotes(now / 1000);
    this.overlay();
    this.renderer.render(this.scene, this.camera);

    // If the device cannot keep up, draw fewer pixels before anything else.
    if (!this.reduced) {
      this.avg = this.avg * 0.95 + raw * 0.05; this.frames += 1;
      if (this.frames > 90 && this.frames % 60 === 0 && this.avg > 24 && this.ratio > 1) {
        this.ratio = Math.max(1, this.ratio - 0.5); this.slow += 1; this.size(); this.avg = 16;
        if (this.slow > 1 && this.motes) { this.motes.visible = false; }
      }
    }
  }
}

/** A soft round spot, used for ground shadows and for the drifting motes. */
function blobTexture(rgb = "0,0,0") {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d"), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(" + rgb + ",1)"); grad.addColorStop(0.55, "rgba(" + rgb + ",.45)"); grad.addColorStop(1, "rgba(" + rgb + ",0)");
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
