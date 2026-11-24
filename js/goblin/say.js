/*
 * How a line reaches the visitor: a speech bubble by the goblin's head, the same words in a
 * polite live region for screen readers, and the game's own clip if sound is on.
 */
import { NAMES } from "./lines.js";

export class Voice {
  constructor(site) {
    this.site = site;
    this.layer = document.getElementById("bubbles");
    this.live = document.getElementById("say-live");
    this.floaters = document.getElementById("floaters");
    this.bubble = null;            // one bubble at a time
    this.audio = new Map();
    this.playing = null;
    this.hasStage = false;
  }

  show(who, words) {
    this.clear();
    const el = document.createElement("div");
    el.className = "bubble";
    const label = document.createElement("span"); label.className = "who"; label.textContent = NAMES[who] || who;
    const text = document.createElement("span"); text.textContent = words;
    el.append(label, text);
    this.layer.append(el);
    this.bubble = { el, who, w: el.offsetWidth, h: el.offsetHeight };
    if (!this.hasStage) el.classList.add("docked");
    this.place(this.lastAnchors);
    el.classList.add("show");
    this.live.textContent = (NAMES[who] || who) + ": " + words;
  }
  clear() {
    if (!this.bubble) return;
    const el = this.bubble.el; this.bubble = null;
    el.classList.add("hide"); setTimeout(() => el.remove(), 260);
  }
  silence() { this.clear(); this.live.textContent = ""; this.stopClip(); }

  /** Called every frame with where each speaker's head is on the screen. */
  place(anchors) {
    this.lastAnchors = anchors;
    const b = this.bubble; if (!b) return;
    const W = document.documentElement.clientWidth, H = window.innerHeight, top = 64;
    const a = anchors && anchors[b.who];
    let x, y;
    if (!a) { x = W - b.w - 14; y = H - b.h - 18; b.el.classList.add("docked"); }
    else {
      x = Math.min(W - b.w - 10, Math.max(10, a.x - b.w / 2));
      y = a.y - b.h - 20;
      const off = !a.on || a.y < top - 20 || a.y > H + 40;
      let below = false, side = "", caption = false;
      if (!off && y < top) {
        const r = a.r || 40, roomL = a.x - r - 14 - b.w, roomR = W - (a.x + r + 14 + b.w);
        if (roomL >= 8 || roomR >= 8) { side = roomL >= roomR ? "left" : "right"; x = side === "left" ? a.x - r - 14 - b.w : a.x + r + 14; y = a.y + 6; }
        else if (W < 640) {
          // On a phone, a caption card at the foot of the screen, as in the game. At the top if he is standing down there.
          x = (W - b.w) / 2; y = a.feet > H - b.h - 40 ? top : H - b.h - 14; caption = true;
        }
        else { y = a.feet + 16; below = true; }
      }
      y = Math.min(H - b.h - 12, Math.max(top, y));
      b.el.classList.toggle("docked", off || caption);
      b.el.classList.toggle("below", below);
      b.el.classList.toggle("side-left", side === "left");
      b.el.classList.toggle("side-right", side === "right");
      b.el.style.setProperty("--tail", Math.min(b.w - 20, Math.max(20, a.x - x)) + "px");
    }
    b.el.style.transform = "translate(" + Math.round(x) + "px," + Math.round(y) + "px)";
  }

  /** A number or word that jumps off something and fades, like the game's damage numbers. */
  floater(x, y, text, big) {
    const el = document.createElement("div");
    el.className = "floater" + (big ? " big" : ""); el.textContent = text;
    el.style.left = x + "px"; el.style.top = y + "px";
    this.floaters.append(el);
    setTimeout(() => el.remove(), big ? 1800 : 1500);
  }

  // ----- sound: nothing is fetched or played until the visitor turns it on -----
  clip(id) {
    let a = this.audio.get(id);
    if (!a) { a = new Audio(new URL("assets/audio/" + id + ".mp3", document.baseURI).href); a.preload = "auto"; this.audio.set(id, a); }
    return a;
  }
  /** Plays a spoken clip and resolves when it ends (or at once if sound is off). */
  speak(id, volume = 0.9) {
    if (!this.site.prefs.sound || !id) return Promise.resolve(false);
    this.stopClip();
    const a = this.clip(id); this.playing = a; a.volume = volume;
    try { a.currentTime = 0; } catch (e) { /* not loaded yet */ }
    return new Promise((done) => {
      const end = () => { a.removeEventListener("ended", end); a.removeEventListener("error", end); done(true); };
      a.addEventListener("ended", end); a.addEventListener("error", end);
      a.play().catch(() => done(false));
    });
  }
  /** A sound effect. Several can overlap. */
  effect(id, volume = 0.6) {
    if (!this.site.prefs.sound) return;
    const a = this.clip(id).cloneNode(); a.volume = volume; a.play().catch(() => {});
  }
  stopClip() { if (this.playing) { this.playing.pause(); this.playing = null; } }
}
