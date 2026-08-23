/* ============ Cinematic intro v3 — narration-driven shot sequencer ============
   Each story beat owns one Flow-generated video clip. The clip plays; when the
   clip ends but the narrator VO is still speaking, we hold the last frame on a
   canvas with a slow Ken Burns drift so nothing feels frozen. Next beat starts
   only when its VO completes. Title card = final beat, then hub. */
"use strict";
const Cinematic = (() => {
  // beat order: kettle(Sundering) → kitchen(Nimbus) → map(jewels/napkin) → liftoff(worlds) → title
  const SHOTS = [
    { src: "assets/cinematic/shot-kettle.mp4",  beat: 0 },
    { src: "assets/cinematic/shot-kitchen.mp4", beat: 1 },
    { src: "assets/cinematic/shot-map.mp4",     beat: 2 },
    { src: "assets/cinematic/shot-liftoff.mp4", beat: 3 },
    { src: "assets/cinematic/shot-title.mp4",   beat: -1, title: true },
  ];

  let onDone = null, finished = false, tapTimer = null, bound = false;
  let seqAbort = null, holdRAF = null, holdCanvas = null, holdCtx = null;

  function $(id) { return document.getElementById(id); }
  function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

  function bindOnce() {
    if (bound) return;
    bound = true;
    $("cine-skip").onclick = (e) => { e.stopPropagation(); finish(); };
    $("screen-cine").addEventListener("click", () => {
      if (tapTimer === null) finish(); // grace period handled in play()
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && window.__activeScreen === "screen-cine") {
        e.preventDefault(); finish();
      }
    });
    $("cine-mute").onclick = (e) => {
      e.stopPropagation();
      AudioMuted = typeof AudioSys !== "undefined" ? AudioSys.toggleMute() : !AudioMuted;
      if (typeof Chip !== "undefined") Chip.setMuted(AudioMuted);
      const v = $("cine-video"); if (v) v.muted = AudioMuted;
      $("cine-mute").textContent = AudioMuted ? "🔇" : "🔊";
    };
  }

  /* Hold a video's last frame on canvas with slow zoom drift. Resolves when
     the predicate fires or abort signal trips. */
  function holdLastFrame(video, shouldContinue) {
    return new Promise(resolve => {
      try {
        holdCanvas.classList.add("active"); video.style.visibility = "hidden";
        holdCanvas.width = video.videoWidth || 960;
        holdCanvas.height = video.videoHeight || 540;
        let t0 = performance.now();
        const draw = (now) => {
          if (!shouldContinue()) { resolve(); return; }
          const el = (now - t0) / 1000;
          const zoom = 1 + Math.min(0.06, el * 0.004); // slow push-in, max 6%
          const c = holdCtx, w = holdCanvas.width, h = holdCanvas.height;
          c.clearRect(0, 0, w, h);
          c.drawImage(video, -(w * zoom - w) / 2, -(h * zoom - h) / 2, w * zoom, h * zoom);
          holdRAF = requestAnimationFrame(draw);
        };
        holdRAF = requestAnimationFrame(draw);
      } catch (_) { resolve(); }
    });
  }
  function stopHold() { if (holdRAF) cancelAnimationFrame(holdRAF); holdRAF = null; if (holdCanvas) holdCanvas.classList.remove("active"); const v = $("cine-video"); if (v) v.style.visibility = "visible"; }

  /* Wait until VO for beat i finishes (or fails to exist). */
  function voDone(i) {
    if (typeof Intro === "undefined" || !Intro.VO[i]) return wait(300);
    const a = Intro.VO[i];
    if (AudioMuted) return wait(Math.min(a.duration || 9, 9) * 1000);
    return new Promise(res => {
      if (a.ended) return res();
      a.onended = () => res();
      // safety: never hang longer than duration + 3s
      setTimeout(res, ((a.duration || 10) + 3) * 1000);
    });
  }

  async function runSequence() {
    const vid = $("cine-video");
    for (const shot of SHOTS) {
      if (seqAbort.aborted) return;
      // title beat: no VO, no caption — just the clip + HTML overlay
      if (shot.title) {
        await playClip(vid, shot.src);
        if (seqAbort.aborted) return;
        continue;
      }
      const i = shot.beat;
      showCaption(i);
      if (typeof Intro !== "undefined") Intro.playVO(i);
      await playClipHoldForVO(vid, shot.src, i);
      clearCaption();
      if (seqAbort.aborted) return;
      await wait(350); // breathing room between beats
    }
    // small hold on title before hub
    await wait(1800);
  }

  function playClip(vid, src) {
    return new Promise(resolve => {
      vid.src = src;
      vid.muted = !!AudioMuted;
      vid.play().catch(() => {});
      vid.onended = () => resolve();
      vid.onerror = () => resolve();
    });
  }

  async function playClipHoldForVO(vid, src, beatIdx) {
    vid.src = src;
    vid.muted = true; // keep clip audio low? no — let it play; but VO must be audible
    vid.muted = !!AudioMuted;
    vid.play().catch(() => {});
    // wait for clip end OR vo end, whichever is later:
    const clipEnd = new Promise(resolve => { vid.onended = resolve; vid.onerror = resolve; });
    await clipEnd;
    if (seqAbort.aborted) return;
    // VO still going? freeze frame + drift
    const a = typeof Intro !== "undefined" ? Intro.VO[beatIdx] : null;
    if (a && !a.ended && !a.paused) {
      await holdLastFrame(vid, () => !seqAbort.aborted && !a.ended && !a.paused);
    }
    if (typeof Intro !== "undefined" && Intro.VO[beatIdx]) {
      await voDone(beatIdx);
    }
  }

  function showCaption(i) {
    const el = $("cine-caption");
    const beats = (typeof Intro !== "undefined" && Intro.BEATS) ? Intro.BEATS : [];
    el.textContent = beats[i] ? beats[i].text : "";
    el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
  }
  function clearCaption() { $("cine-caption").classList.remove("show"); }

  function play(done) {
    onDone = done || null;
    finished = false;
    seqAbort = { aborted: false };
    bindOnce();

    if (typeof Chip !== "undefined") Chip.stop(); // pause chiptune during cine
    holdCanvas = $("cine-hold"); holdCtx = holdCanvas ? holdCanvas.getContext("2d") : null;
    $("cine-titlecard").classList.remove("show");
    clearCaption();
    $("cine-mute").textContent = AudioMuted ? "🔇" : "🔊";

    showScreen("screen-cine");
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => { tapTimer = null; }, 3000);

    // kick sequence inside user gesture
    runSequence().then(() => { if (!finished && !seqAbort.aborted) finish(); })
                 .catch(() => finish());
  }

  function finish() {
    if (finished) return;
    finished = true;
    if (seqAbort) seqAbort.aborted = true;
    clearTimeout(tapTimer); tapTimer = null;
    stopHold();
    if (typeof Intro !== "undefined") Intro.stopVO();
    clearCaption();
    const vid = $("cine-video");
    try { vid.pause(); } catch (_) {}
    try { vid.removeAttribute("src"); vid.load(); } catch (_) {}
    $("cine-titlecard").classList.remove("show");
    const cb = onDone; onDone = null;
    if (cb) cb();
  }

  // title overlay trigger: when title shot starts playing
  const origPlayClip = playClip;
  playClip = function (vid, src) {
    if (src.includes("title")) $("cine-titlecard").classList.add("show");
    return origPlayClip(vid, src);
  };

  return { play, finish };
})();
