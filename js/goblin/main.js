/*
 * Starts the goblins. Loaded by js/page.js after the page has painted.
 * If 3D is not available the goblins still talk, from a bubble docked in the corner.
 */
import { Voice } from "./say.js";
import { Brain } from "./brain.js";

const site = window.SITE;
const params = new URLSearchParams(location.search);
// ?still and ?no3d are for testing: the first acts as "reduce motion", the second as "no WebGL".
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches || params.has("still");
const voice = new Voice(site);
const brain = new Brain({ voice, site, reduced });
site.brain = brain;

function canDraw() {
  if (params.has("no3d")) return false;
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; }
}

let stage = null;
if (canDraw()) {
  try {
    const { Stage } = await import("./stage.js");
    stage = new Stage({ canvas: document.getElementById("stage"), brain, voice, reduced, site });
    brain.attach(stage);
    await stage.loadFirst();
  } catch (e) {
    console.warn("3D is not available here. The page works without it.", e);
    stage = null;
  }
}
if (!stage) { brain.attach(null); document.getElementById("stage").hidden = true; }
site.stage = stage;
brain.start();
