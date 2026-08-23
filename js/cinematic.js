/* ============ Cinematic intro v2 — video + synced narration ============
   One cohesive opener: assets/cinematic/intro-web.mp4 plays as the visual
   layer; the existing narrator VO plays over it with subtitle captions
   pinned to video timecodes. Ends (or is skipped) → straight to the hub. */
"use strict";
const Cinematic = (() => {
  // beat → timecode map (seconds), matched to the 38.3s re-stitched cut:
  // shot xfades ≈7.1 / 14.2 / 21.3 / 29.4; title shot ≈30.2→38.3
  const BEAT_TIMES = [0, 7.5, 14.5, 21.5];
  const BEAT_ENDS = [7, 14, 21, 29]; // caption off-times
  const TITLE_AT = 31; // fade in HTML title from ~31s (final ~8s)

  let onDone = null;
  let finished = false;
  let tapTimer = null;
  let captionIdx = -1;
  let bound = false;

  function $(id) { return document.getElementById(id); }

  function bindOnce() {
    if (bound) return;
    bound = true;
    const vid = $("cine-video");

    $("cine-skip").onclick = (e) => { e.stopPropagation(); finish(); };

    // tap/click anywhere skips once the clip has been up for 3s
    $("screen-cine").addEventListener("click", () => {
      if (tapTimer !== null) finish();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && window.__activeScreen === "screen-cine") {
        e.preventDefault();
        finish();
      }
    });

    vid.addEventListener("ended", () => finish());
    vid.addEventListener("error", () => finish()); // missing/broken asset → straight to hub
    vid.addEventListener("timeupdate", onTime);
  }

  function onTime() {
    const vid = $("cine-video");
    try {
      // narration captions per mapped window
      if (typeof Intro !== "undefined") {
        let i = -1;
        for (let k = 0; k < BEAT_TIMES.length; k++) {
          if (vid.currentTime >= BEAT_TIMES[k] && vid.currentTime < BEAT_ENDS[k]) { i = k; break; }
        }
        if (i !== captionIdx) {
          captionIdx = i;
          if (i >= 0) { showCaption(i); Intro.playVO(i); } // narrator VO over the video
          else clearCaption();
        }
      }
      // finale title card
      if (vid.currentTime >= TITLE_AT) {
        clearCaption();
        $("cine-titlecard").classList.add("show");
      }
    } catch (_) {}
  }

  function showCaption(i) {
    const el = $("cine-caption");
    const beats = (typeof Intro !== "undefined" && Intro.BEATS) ? Intro.BEATS : [];
    el.textContent = beats[i] ? beats[i].text : "";
    el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
  }

  function clearCaption() {
    if (captionIdx === -1) return;
    captionIdx = -1;
    $("cine-caption").classList.remove("show");
  }

  function play(done) {
    onDone = done || null;
    finished = false;
    captionIdx = -1;
    bindOnce();

    // pause chiptune during playback (narration carries the audio)
    if (typeof Chip !== "undefined") Chip.stop();

    // sync mute button with existing AudioMuted state
    const vid = $("cine-video");
    vid.muted = !!AudioMuted;
    updateMuteLabel();
    $("cine-titlecard").classList.remove("show");
    $("cine-caption").classList.remove("show");

    showScreen("screen-cine");
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => { tapTimer = null; }, 3000); // tap-to-skip grace period

    // inside the user-gesture call stack → satisfies autoplay policies
    const p = vid.play();
    if (p && p.catch) p.catch(() => {}); // if blocked, ended/error won't fire; skip still works
  }

  function updateMuteLabel() {
    $("cine-mute").textContent = AudioMuted ? "🔇" : "🔊";
  }

  function toggleMute() {
    AudioMuted = typeof AudioSys !== "undefined" ? AudioSys.toggleMute() : !AudioMuted;
    if (typeof Chip !== "undefined") Chip.setMuted(AudioMuted);
    $("cine-video").muted = AudioMuted;
    updateMuteLabel();
  }

  function finish() {
    if (finished) return;
    finished = true;
    clearTimeout(tapTimer);
    tapTimer = null;
    if (typeof Intro !== "undefined") Intro.stopVO();
    clearCaption();
    const vid = $("cine-video");
    try { vid.pause(); } catch (_) {}
    try { vid.currentTime = 0; } catch (_) {}
    $("cine-titlecard").classList.remove("show");
    const cb = onDone;
    onDone = null;
    if (cb) cb(); // caller transitions to the hub
  }

  $("cine-mute").onclick = (e) => { e.stopPropagation(); toggleMute(); };

  return { play, finish };
})();
