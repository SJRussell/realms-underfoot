/*
 * The page itself: the game's name, the sign-up form and the two switches.
 * Nothing here needs 3D. The goblins load afterwards (js/goblin/main.js) and listen to the
 * same page events.
 */
(function () {
  "use strict";
  var SITE = window.SITE || {};
  var root = document.documentElement;
  root.classList.add("js");

  // ----- the game's name, from js/config.js -----
  var name = SITE.gameName || "The game";
  document.querySelectorAll("[data-game-name]").forEach(function (el) { el.textContent = name; });
  // The wordmark: the first word set big, the rest under the line.
  var words = name.split(" ");
  document.querySelectorAll("[data-wordmark]").forEach(function (el) {
    var first = el.querySelector(".wm-1"), rest = el.querySelector(".wm-2");
    if (!first || !rest) return;
    first.textContent = words[0]; rest.textContent = words.slice(1).join(" "); rest.hidden = words.length < 2;
  });
  document.title = name + (SITE.nameIsFinal ? "" : " (working title)") + " \u00b7 an outdoor AR game";
  var chip = document.getElementById("title-chip");
  if (chip && !SITE.nameIsFinal) chip.textContent = "Working title";

  // ----- remembered switches (they fall back to defaults if storage is blocked) -----
  var store = {
    get: function (k) { try { return window.localStorage.getItem("realms-underfoot." + k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem("realms-underfoot." + k, v); } catch (e) { /* private mode */ } },
  };
  SITE.store = store;
  SITE.prefs = { sound: false, talk: store.get("talk") !== "off" }; // sound is always off until asked for
  function emit(type, detail) { document.dispatchEvent(new CustomEvent(type, { detail: detail || {} })); }
  SITE.emit = emit;

  var soundBtn = document.getElementById("sound-toggle");
  var talkBtn = document.getElementById("talk-toggle");
  soundBtn.hidden = !SITE.soundAvailable; // see js/config.js
  function paintSwitches() {
    soundBtn.setAttribute("aria-pressed", String(SITE.prefs.sound));
    soundBtn.querySelector(".state").textContent = SITE.prefs.sound ? "on" : "off";
    talkBtn.setAttribute("aria-pressed", String(SITE.prefs.talk));
    talkBtn.querySelector(".state").textContent = SITE.prefs.talk ? "talking" : "quiet";
  }
  paintSwitches();
  soundBtn.addEventListener("click", function () {
    SITE.prefs.sound = !SITE.prefs.sound; paintSwitches(); emit("site:sound", { on: SITE.prefs.sound });
  });
  talkBtn.addEventListener("click", function () {
    var turningOff = SITE.prefs.talk;
    if (turningOff) emit("site:talk", { on: false }); // he gets a last word in before the switch closes
    SITE.prefs.talk = !SITE.prefs.talk; store.set("talk", SITE.prefs.talk ? "on" : "off"); paintSwitches();
    if (!turningOff) emit("site:talk", { on: true });
  });


  // ----- the sign-up form -----
  var form = document.getElementById("signup-form");
  var email = document.getElementById("f-email");
  var err = document.getElementById("f-email-err");
  var result = document.getElementById("signup-result");
  var quest = document.getElementById("quest-text");
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  email.addEventListener("input", function () { if (!err.hidden) { err.hidden = true; email.removeAttribute("aria-invalid"); } });
  form.addEventListener("submit", function (ev) {
    var value = email.value.trim();
    if (!EMAIL.test(value)) {
      ev.preventDefault();
      err.hidden = false; email.setAttribute("aria-invalid", "true"); email.focus();
      emit("site:submit", { valid: false });
      return;
    }
    if (!SITE.signupEndpoint) {
      // No destination in js/config.js: nothing leaves the browser, and the visitor is told so.
      ev.preventDefault();
      result.hidden = false; quest.textContent = "Not open yet";
      result.querySelector(".result-title").textContent = "Not open yet";
      result.querySelector("p:last-child").textContent = "Nothing was sent and nothing was saved. Sign-ups are closed for the moment.";
      emit("site:submit", { valid: true, sent: false });
      return;
    }
    // The list is run by Buttondown, which takes an ordinary form post and refuses a fetch. So the
    // browser sends the form itself and the page goes with it. Buttondown may show a CAPTCHA or a
    // correction, then sends the visitor back here with ?list=pending. The fields that go are the
    // ones in the form: email, the hidden "embed", and each input named metadata__<key>.
    email.value = value;
    ["f-name", "f-city"].forEach(function (id) { var el = document.getElementById(id); if (el) el.value = el.value.trim(); });
    form.action = SITE.signupEndpoint; form.method = "post"; form.removeAttribute("target");
    emit("site:submit", { valid: true, sent: true });
  });

  // ----- back from Buttondown: ?list=pending after the form, ?list=confirmed after the link in the email -----
  var done = document.getElementById("signup-done");
  var listState = null;
  try { listState = new URLSearchParams(window.location.search).get("list"); } catch (e) { /* very old browser */ }
  var words = (SITE.listMessages || {})[listState];
  if (words && done) {
    SITE.listState = listState; // the goblins read this when they start
    document.getElementById("signup-done-title").textContent = words.title;
    document.getElementById("signup-done-text").textContent = words.text;
    form.hidden = true; done.hidden = false;
    quest.textContent = words.quest;
    // Take the marker out of the address bar, so a reload or a shared link starts clean.
    try { window.history.replaceState(null, "", window.location.pathname + window.location.hash); } catch (e) { /* leave it */ }
    var show = function () {
      var band = document.getElementById("signup");
      band.classList.add("seen");
      var smooth = document.documentElement.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = "auto";
      band.scrollIntoView({ block: "start" });
      document.documentElement.style.scrollBehavior = smooth;
      done.focus({ preventScroll: true });
    };
    if (document.readyState === "complete") show(); else window.addEventListener("load", show);
    document.getElementById("signup-again").addEventListener("click", function (ev) {
      ev.preventDefault(); done.hidden = true; form.hidden = false; quest.textContent = "Get on the list"; email.focus();
    });
  }

  // ----- the trailer: the goblins keep quiet while it plays -----
  var trailer = document.getElementById("trailer");
  if (trailer) {
    trailer.addEventListener("play", function () { emit("site:video", { playing: true }); });
    ["pause", "ended"].forEach(function (type) { trailer.addEventListener(type, function () { emit("site:video", { playing: false }); }); });
  }

  // ----- sections ease in as they are reached -----
  var bands = document.querySelectorAll(".band");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("seen"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -12% 0px" });
    bands.forEach(function (b) { io.observe(b); });
  } else {
    bands.forEach(function (b) { b.classList.add("seen"); });
  }

  // ----- the goblins, after the page has painted -----
  function loadGoblins() {
    import(new URL("js/goblin/main.js", document.baseURI).href).catch(function (e) { console.warn("The goblins did not load.", e); });
  }
  function later(fn) { if ("requestIdleCallback" in window) window.requestIdleCallback(fn, { timeout: 1500 }); else setTimeout(fn, 300); }
  if (document.readyState === "complete") later(loadGoblins); else window.addEventListener("load", function () { later(loadGoblins); });
})();
