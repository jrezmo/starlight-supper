/* ============ Intro narration v3 — VO + beat data for the cinematic ============
   The old animated-canvas beat cards are gone; this module now only owns
   the story BEATS text and the narrator voiceover playback that plays
   OVER the pre-rendered cinematic (see js/cinematic.js). */
"use strict";
const Intro = (() => {
  const BEATS = [
    { label: "", cue: "title",
      text: "Three hundred years ago, the Great Kettle — the cosmic hearth that simmered the First Broth — went cold." },
    { label: "GRANDMOTHER'S JEWELS", cue: null,
      text: "Grandmother said the Kettle burned on three jewels — one on each of three worlds. She drew them on a napkin. We still have the napkin." },
    { label: "THE THREE WORLDS", cue: null,
      text: "Verdanth, Cinder-9 and Pelagia — three worlds, three jewels, and every rival chef in the galaxy guarding them." },
    { label: "NIMBUS QUILL", cue: null,
      text: "You are Nimbus Quill — last of the Vessari Gourmand Nomads. You inherit her recipes, one rustbucket ship, and a family of worms with strong opinions." },
  ];

  const VO_V = "20260823b";
  // ---- Narrator voiceover ----
  const VO = {};
  BEATS.forEach((_, i) => { const a = new Audio(); a.preload = "auto"; a.src = `assets/vo/b${String(i).padStart(2,"0")}.mp3?v=${VO_V}`; VO[i] = a; });
  function voActive() { return Object.values(VO).some(a => !a.paused && !a.ended); }
  function playVO(i) {
    stopVO();
    if (AudioMuted || !VO[i] || !VO[i].src) return;
    const a = VO[i];
    try { a.currentTime = 0; } catch (_) {}
    if (typeof Chip !== "undefined") Chip.duckMusic(0.08, .4); // deep bed under speech
    a.onended = () => { if (!voActive() && typeof Chip !== "undefined") Chip.duckMusic(0.5, 1.8); }; // swell back
    a.play().catch(() => {});
  }
  function stopVO() {
    Object.values(VO).forEach(a => { a.pause(); try { a.currentTime = 0; } catch (_) {} });
  }

  return { BEATS, VO, playVO, stopVO };
})();
