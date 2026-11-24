/*
 * What the goblins notice about the visitor, and how often they are allowed to mention it.
 *
 * Three kinds of line:
 *   1  passing remarks (idle, scrolling). At most three in ninety seconds, nine seconds apart.
 *   2  things worth a word (arriving, coming back to the tab, resizing).
 *   3  answers to something the visitor did to them or to the form (a poke, a submit, a switch).
 * A higher kind may cut off a lower one. While the visitor is typing, only lines about the
 * typing are allowed.
 */
import { LINES, DEATH_LINES } from "./lines.js";

const ABOUT_TYPING = new Set(["typing", "typingAt", "deleting", "submit", "submitBad"]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => performance.now();

export class Brain {
  constructor({ voice, site, reduced }) {
    this.voice = voice; this.site = site; this.reduced = reduced; this.stage = null;
    this.bags = {}; this.cool = {}; this.said = new Set(); this.passing = [];
    this.current = null; this.lastEnd = -1e9; this.typingUntil = 0; this.started = false;
    this.mood = { T: { word: "Suspicious", level: 0.45, tone: "var(--warn)" }, B: { word: "On duty", level: 0.6, tone: "var(--gold)" } };
    this.baseMood = this.mood.T;
    this.pokes = { T: 0, B: 0 };
    this.lastActivity = now();
    this.log = [];                      // what was said, for testing
    this.listen();
  }
  attach(stage) { this.stage = stage; this.voice.hasStage = !!stage; }
  typing() { return now() < this.typingUntil; }
  setMood(who, word, level, tone, keep) { this.mood[who] = { word, level, tone }; if (who === "T" && keep) this.baseMood = this.mood.T; }

  pick(key) {
    const all = LINES[key]; if (!all || !all.length) return null;
    let bag = this.bags[key];
    if (!bag || !bag.order.length) {
      const order = all.map((_, i) => i).sort(() => Math.random() - 0.5);
      if (bag && order.length > 1 && order[order.length - 1] === bag.last) order.unshift(order.pop());
      bag = this.bags[key] = { order, last: bag ? bag.last : -1 };
    }
    bag.last = bag.order.pop();
    return all[bag.last];
  }

  /** Try to say something. Returns true if he does. */
  say(key, { p = 1, cool = 0, once = false, first = false, now: atOnce = false } = {}) {
    const t = now();
    if (!this.started || this.dead) return false;
    if (!this.site.prefs.talk) return false;
    if (this.typing() && !ABOUT_TYPING.has(key)) return false;
    if (once && this.said.has(key)) return false;
    if ((this.cool[key] || 0) > t) return false;
    if (this.current) {
      const c = this.current;
      if (p < c.p || (p === c.p && !atOnce && (p < 3 || t - c.start < 900))) return false;
    } else {
      const gap = p === 1 ? 9000 : p === 2 ? 3200 : 500;
      if (!atOnce && t - this.lastEnd < gap) return false;
    }
    if (p === 1) {
      this.passing = this.passing.filter((x) => t - x < 90000);
      if (this.passing.length >= 3) return false;
      this.passing.push(t);
    }
    let bit = this.pick(key); if (!bit) return false;
    if (first) bit = LINES[key][0];
    if (cool) this.cool[key] = t + cool * 1000;
    this.said.add(key);
    if (this.current) { this.current.cancelled = true; this.voice.stopClip(); }
    const job = { p, key, start: t, cancelled: false };
    this.current = job;
    this.run(bit, job);
    return true;
  }
  async run(bit, job) {
    for (const [who, words, clip] of bit) {
      if (job.cancelled) return;
      const est = Math.max(1700, 1000 + words.length * 60);
      this.voice.show(who, words);
      this.log.push({ key: job.key, who, words, at: Math.round(now()) });
      if (this.stage) this.stage.talking(who, est);
      const t0 = now();
      const played = await Promise.race([this.voice.speak(clip), wait(est + 6000).then(() => false)]);
      if (job.cancelled) return;
      const left = (played ? 1300 : est) - (now() - t0);
      if (left > 0) await wait(left);
      if (job.cancelled) return;
      if (played && this.stage) this.stage.talking(who, 0);
      await wait(260);
    }
    if (job.cancelled) return;
    await wait(350);
    if (job.cancelled) return;
    this.voice.clear();
    this.current = null; this.lastEnd = now();
  }
  hush() { if (this.current) this.current.cancelled = true; this.current = null; this.voice.silence(); this.lastEnd = now(); }

  // ------------------------------------------------------------------ start
  start() {
    this.started = true;
    const store = this.site.store;
    const visits = Number(store.get("visits") || 0);
    store.set("visits", String(visits + 1));
    this.visits = visits;
    setTimeout(() => {
      if (this.say(visits ? "comeBack" : "arrive", { p: 2 }) && this.stage) this.stage.react("T", "wave");
    }, 900);
    if (!this.stage) setTimeout(() => this.say("noWebgl", { p: 1, once: true }), 9000);
    this.onScroll();
  }

  // ------------------------------------------------------------------ what he watches
  listen() {
    const on = (target, type, fn, opts) => target.addEventListener(type, fn, opts || { passive: true });
    const active = () => this.activity();

    // scrolling
    this.sY = window.scrollY; this.sT = now(); this.speed = 0; this.fastFor = 0; this.fastDist = 0; this.downRun = 0; this.upRun = 0;
    on(window, "scroll", () => { this.onScroll(); active(); });

    // sitting idle
    let px = 0, py = 0;
    on(window, "pointermove", (e) => { if (Math.abs(e.clientX - px) + Math.abs(e.clientY - py) > 4) { px = e.clientX; py = e.clientY; active(); } });
    on(window, "pointerdown", active); on(window, "keydown", active); on(window, "wheel", active); on(window, "touchstart", active);
    setInterval(() => this.tick(), 1000);

    // the sign-up box
    const form = document.getElementById("signup-form"), email = document.getElementById("f-email");
    let hoverTimer = 0;
    const near = () => {
      if (this.stage) this.stage.set("T", "lean", 1);
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => { if (email.value === "" && !this.typing()) this.say("hoverSignup", { p: 2, cool: 16 }); }, 2600);
    };
    const away = () => { clearTimeout(hoverTimer); if (this.stage && !form.contains(document.activeElement)) this.stage.set("T", "lean", 0); };
    on(form, "pointerenter", near); on(form, "pointerleave", away); on(form, "focusin", near); on(form, "focusout", () => setTimeout(away, 0));

    let prev = "", longest = 0, typedAt = -1e9;
    on(form, "input", (e) => {
      this.typingUntil = now() + 4000; this.lastActivity = now(); clearTimeout(hoverTimer);
      if (e.target !== email) return;
      const v = email.value;
      if (v.length > prev.length) {
        if (v.includes("@") && !prev.includes("@")) this.say("typingAt", { p: 3, cool: 25 });
        else if (v.length >= 2 && now() - typedAt > 30000) { if (this.say("typing", { p: 3 })) { typedAt = now(); if (this.stage) setTimeout(() => this.stage.lookAway("T", 2.2), 1600); } }
        this.setMood("T", "Warming up", 0.6, "var(--heal)", true);
      }
      if (v === "" && longest >= 3) { this.say("deleting", { p: 3, cool: 5, now: true }); longest = 0; typedAt = -1e9; if (this.stage) this.stage.react("T", "shrug"); }
      longest = Math.max(longest, v.length); prev = v;
    });
    on(document, "site:submit", (e) => {
      this.typingUntil = 0;
      if (e.detail.valid) { this.say(e.detail.sent ? "submit" : "submitClosed", { p: 3, now: true }); this.setMood("T", "Friendly", 0.85, "var(--heal)", true); if (this.stage) this.stage.react("T", "shrug"); }
      else this.say("submitBad", { p: 3, now: true });
    });

    // the tab
    let hiddenAt = 0;
    on(document, "visibilitychange", () => {
      if (document.hidden) { hiddenAt = now(); return; }
      this.lastActivity = now();
      if (hiddenAt && now() - hiddenAt > 2500) setTimeout(() => { if (this.say("tabReturn", { p: 2, cool: 8 }) && this.stage) this.stage.react("T", "startle"); }, 700);
    });

    // the window
    let w0 = window.innerWidth, resizeTimer = 0;
    on(window, "resize", () => {
      if (Math.abs(window.innerWidth - w0) < 30) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { w0 = window.innerWidth; if (this.say("resize", { p: 2, cool: 10 }) && this.stage) this.stage.react("T", "wobble"); }, 600);
    });

    // switches
    on(document, "site:sound", (e) => { if (!e.detail.on) this.voice.stopClip(); this.say(e.detail.on ? "soundOn" : "soundOff", { p: 3 }); });
    on(document, "site:talk", (e) => {
      if (e.detail.on) { this.say("talkOn", { p: 3 }); return; }
      this.say("talkOff", { p: 3 });
      setTimeout(() => this.hush(), 1000);
    });

    // smaller things
    document.querySelectorAll(".way").forEach((el) => {
      const key = "way" + el.dataset.way.charAt(0).toUpperCase() + el.dataset.way.slice(1);
      const go = () => this.say(key, { p: 2, once: true });
      on(el, "pointerenter", go); on(el, "focus", go);
    });
    on(window, "keydown", (e) => { if (e.key === "Tab") this.say("keyboard", { p: 2, once: true }); });
    on(document, "copy", () => this.say("copy", { p: 2, cool: 60 }));

    // the dragon's ending
    const again = document.getElementById("died-again");
    on(again, "click", () => this.tryAgain());
    on(document.getElementById("died"), "keydown", (e) => { if (e.key === "Escape") this.tryAgain(); if (e.key === "Tab") { e.preventDefault(); again.focus(); } }, { passive: false });
  }

  activity() {
    this.lastActivity = now();
    if (this.asleep) {
      this.asleep = false;
      if (this.stage) { this.stage.set("T", "sleep", 0); this.stage.react("T", "startle"); }
      this.mood.T = this.baseMood;
      this.hush(); this.say("wake", { p: 3, now: true });
    }
    this.idleSaid = false; this.sleepSaid = false;
    if (this.bored) { this.bored = false; if (this.stage) this.stage.set("T", "bored", 0); this.mood.T = this.baseMood; }
  }
  tick() {
    if (!this.started || document.hidden || this.dead || this.typing()) return;
    const idle = now() - this.lastActivity;
    if (idle > 24000 && !this.bored && !this.asleep) {
      this.bored = true; if (this.stage) this.stage.set("T", "bored", 1);
      this.mood.T = { word: "Bored", level: 0.2, tone: "var(--muted)" };
    }
    if (this.bored && !this.idleSaid) this.idleSaid = this.say("idle", { p: 1 });
    if (idle > 70000 && !this.asleep) {
      this.asleep = true; this.bored = false;
      if (this.stage) { this.stage.set("T", "bored", 0); this.stage.set("T", "sleep", 1); }
      this.mood.T = { word: "Asleep", level: 0.05, tone: "var(--muted)" };
    }
    if (this.asleep && !this.sleepSaid) this.sleepSaid = this.say("sleep", { p: 2 });
  }

  onScroll() {
    const y = window.scrollY, t = now(), dt = t - this.sT, dy = y - this.sY;
    this.sY = y; this.sT = t;
    if (!this.started || dt <= 0) return;
    this.speed = this.speed * 0.6 + (Math.abs(dy) / Math.max(dt, 8)) * 1000 * 0.4;
    if (this.speed > 3000) { this.fastFor += dt; this.fastDist += Math.abs(dy); } else { this.fastFor = 0; this.fastDist = 0; }
    if (this.fastFor > 200 && this.fastDist > 1000) {
      this.fastFor = 0; this.fastDist = 0;
      if (this.say("scrollFast", { p: 2, cool: 22 }) && this.stage) this.stage.react("T", "wobble");
    }
    if (dy > 0) { this.downRun += dy; this.upRun = 0; }
    else if (dy < 0) {
      this.upRun -= dy;
      if (this.upRun > 460 && this.downRun > 700) { this.downRun = 0; this.upRun = 0; this.say("scrollUp", { p: 2, cool: 30 }); }
    }
    if (y > 500 && this.baseMood.word === "Suspicious") this.setMood("T", "Curious", 0.5, "var(--gold)", true);

    const H = window.innerHeight, end = document.getElementById("end").getBoundingClientRect();
    const max = document.documentElement.scrollHeight - H;
    if (!this.omen && end.top < H * 0.8 && !this.ignisHere) { if (this.say("omen", { p: 2 })) { this.omen = true; this.setMood("T", "Nervous", 0.7, "#bfccff"); } }
    if (y >= max - 24 && max > 200 && !this.ignisHere) this.callIgnis();
    if (this.ignisHere && this.fled && end.top > H * 0.82) {
      this.fled = false;
      if (this.stage) this.stage.goblinsReturn();
      this.mood.T = this.baseMood;
      this.upRun = 0; this.downRun = 0;
      setTimeout(() => this.say("afterIgnis", { p: 3, now: true }), 1400);
    }
  }
  callIgnis() {
    this.ignisHere = true; this.fled = true; this.omen = true;
    this.setMood("T", "Terrified", 1, "#bfccff"); this.setMood("B", "Terrified", 1, "#bfccff");
    if (this.stage) this.stage.ignisArrive();
    setTimeout(() => { this.hush(); this.say("ignis", { p: 3, now: true }); }, 900);
  }

  // ------------------------------------------------------------------ called by the stage
  arrived(zone) {
    const key = { ways: "zoneWays", video: "zoneVideo", updates: "zoneUpdates", feeds: "zoneFeeds" }[zone];
    if (key) this.say(key, { p: 1, once: true });
  }
  eggSeen() { this.say("egg", { p: 2, cool: 40 }); }
  stare(who) { if (who === "T" && this.say("stare", { p: 1, cool: 90 }) && this.stage) setTimeout(() => this.stage.lookAway("T", 1.8), 1500); }
  poke(who, x, y) {
    this.activity();
    const n = (this.pokes[who] += 1);
    this.voice.floater(x, y, String(5 + Math.floor(Math.random() * 16)));
    this.voice.effect(who === "T" ? "goblin-skinny-pain-" + (1 + (n % 2)) : "goblin-stocky-pain-" + (1 + (n % 2)), 0.5);
    const scared = n % 6 === 0;
    if (who === "T") this.mood.T = n >= 4 ? { word: "Terrified", level: 0.95, tone: "#bfccff" } : { word: "Nervous", level: 0.35 + n * 0.12, tone: "#bfccff" };
    else this.mood.B = { word: n >= 3 ? "Cross" : "On duty", level: Math.min(1, 0.6 + n * 0.08), tone: n >= 3 ? "var(--blood)" : "var(--gold)" };
    if (scared && this.stage) {
      this.hush(); this.say(who === "T" ? "fleeT" : "fleeB", { p: 3, now: true });
      this.stage.flee(who, 8000, () => { if (who === "T") { this.mood.T = this.baseMood; this.say("backFromFlee", { p: 2 }); } else this.mood.B = { word: "On duty", level: 0.6, tone: "var(--gold)" }; });
      return;
    }
    this.say(who === "T" ? "pokeT" : "pokeB", { p: 3 });
  }
  die() {
    this.hush(); this.dead = true;
    const el = document.getElementById("died");
    if (!this.deaths) this.deaths = DEATH_LINES.map((_, i) => i).sort(() => Math.random() - 0.5);
    if (!this.deaths.length) this.deaths = DEATH_LINES.map((_, i) => i).sort(() => Math.random() - 0.5);
    document.getElementById("died-line").textContent = DEATH_LINES[this.deaths.pop()];
    el.hidden = false; document.documentElement.style.overflow = "hidden";
    document.getElementById("died-again").focus();
  }
  tryAgain() {
    if (!this.dead) return;
    document.getElementById("died").hidden = true; document.documentElement.style.overflow = "";
    window.scrollTo({ top: 0, behavior: "instant" });
    this.dead = false; this.ignisHere = false; this.fled = false; this.omen = false;
    this.mood.T = this.baseMood; this.mood.B = { word: "On duty", level: 0.6, tone: "var(--gold)" };
    if (this.stage) { this.stage.ignisReset(); this.stage.goblinsReturn(); }
    const home = document.querySelector(".hud-name"); if (home) home.focus();
    this.lastEnd = now() - 2000;
    setTimeout(() => this.say("comeBack", { p: 2, first: true }), 1200);
  }
}
