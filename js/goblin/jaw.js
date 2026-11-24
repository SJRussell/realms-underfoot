/*
 * A goblin's jaw opens with the loudness of the line he is saying, as it does in the game.
 *
 * The game measures the voice as it plays. The page reads the same measure from a small file made ahead of
 * time (tools/jaw_curves.mjs: one number every `step` seconds for each voice clip), by the line's play time.
 * So the jaw moves whether or not the visitor has sound on, and with sound on it follows the clip's own clock.
 * A line with no clip gets a made-up pattern, one beat for each syllable.
 */
import { clamp } from "./rig.js";

// The game's numbers: shut below `quiet`, fully open at `full`, quiet speech opened a little further by `curve`,
// up in `attack` seconds and down in `release`, read `lead` seconds ahead so the mouth is opening as the sound arrives.
export const JAW = { degrees: 14, quiet: 0.015, full: 0.24, curve: 0.75, attack: 0.035, release: 0.11, lead: 0.02 };

class Curve {
  constructor(levels, step) { this.levels = levels; this.step = step; this.seconds = (levels.length - 1) * step; }
  /** Loudness (0 to 1) at a moment of the line. */
  at(seconds) {
    const x = seconds / this.step;
    if (x <= 0) return this.levels[0];
    if (x >= this.levels.length - 1) return 0;
    const i = Math.floor(x), f = x - i;
    return this.levels[i] * (1 - f) + this.levels[i + 1] * f;
  }
}

/** A pattern for words that have no clip: each syllable a short swell, with a breath at commas and full stops. */
function mime(words, step) {
  const out = [];
  const add = (seconds, level) => { const n = Math.max(1, Math.round(seconds / step)); for (let i = 0; i < n; i++) out.push(level * Math.sin(Math.PI * (i + 0.5) / n)); };
  add(0.1, 0);
  for (const word of String(words).split(/\s+/)) {
    const beats = Math.max(1, (word.match(/[aeiouy]+/gi) || []).length);
    for (let i = 0; i < beats; i++) add(0.17, 0.15 + 0.04 * ((i + word.length) % 3));
    add(/[.!?,]$/.test(word) ? 0.28 : 0.04, 0);
  }
  out.push(0);
  return new Curve(Float32Array.from(out), step);
}

export class JawCurves {
  constructor() { this.file = null; this.made = new Map(); }
  /** Fetch the file. The jaws use the made-up pattern until it arrives, and for good if it never does. */
  load(address) {
    return fetch(address).then((r) => (r.ok ? r.json() : null)).then((file) => { if (file && file.clips) this.file = file; return !!this.file; }).catch(() => false);
  }
  /** The curve for a clip, or for the words if the clip has none. */
  get(id, words) {
    const key = id && this.file && this.file.clips[id] ? id : "words|" + words;
    let c = this.made.get(key);
    if (!c) {
      if (key === id) {
        const bytes = atob(this.file.clips[id]), levels = new Float32Array(bytes.length), scale = this.file.top / 255;
        for (let i = 0; i < bytes.length; i++) levels[i] = bytes.charCodeAt(i) * scale;
        c = new Curve(levels, this.file.step);
      } else c = mime(words, 0.025);
      this.made.set(key, c);
    }
    return c;
  }
}

/** One frame of one jaw. `line` is { curve, audio, t0 } or null; returns how far open the jaw is now, 0 to 1. */
export function jawStep(open, line, now, dt) {
  let loud = 0;
  if (line) {
    // With sound on, the clip's own clock; with sound off, the time since the words appeared.
    const at = line.audio ? (line.audio.paused || line.audio.ended ? -1 : line.audio.currentTime) : (now - line.t0) / 1000;
    if (at >= 0 && at <= line.curve.seconds) loud = line.curve.at(at + JAW.lead);
  }
  const want = Math.pow(clamp((loud - JAW.quiet) / (JAW.full - JAW.quiet), 0, 1), JAW.curve);
  open += (want - open) * (1 - Math.exp(-dt / (want > open ? JAW.attack : JAW.release)));
  return open < 0.001 && want <= 0 ? 0 : open;
}
