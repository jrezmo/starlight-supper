/* ============ Story overlay v2 (with choice support) ============ */
"use strict";
const Story = (() => {
  let queue = [], idx = 0, cb = null, icon = "";

  function show(iconEmoji, lines, onDone) {
    queue = Array.isArray(lines) ? lines : [lines];
    idx = 0; cb = onDone || null; icon = iconEmoji || "";
    $("overlay-story").classList.remove("hidden");
    // WS-11: gentle animated scene behind the story card
    document.querySelectorAll(".story-choices").forEach(e => e.remove());
    $("story-next").style.display = "";
    const sp = queue[0].speaker;
    const rival = DATA.rivals.find(r => r.name === sp);
    const key = (sp === "BARON VOLT" || icon === "⚡") ? "volt" : rival ? rival.id : (icon === "💠" || sp === "Nimbus Quill" || !sp) ? "nimbus" : "nimbus";
    $("story-portrait-wrap").style.display = "";
    const imgWrap = $("story-portrait-wrap");
    const im = new Image();
    im.onload = () => { $("story-portrait").style.display = "none";
      let el = imgWrap.querySelector(".art-img"); if (!el) { el = document.createElement("img"); el.className = "art-img"; imgWrap.appendChild(el); }
      el.src = "assets/" + key + ".png"; };
    im.onerror = () => { $("story-portrait").style.display = ""; const el = imgWrap.querySelector(".art-img"); el && el.remove();
      Art.drawCharacter($("story-portrait"), key); };
    im.src = "assets/" + key + ".png";
    render();
    AudioSys.click();
  }

  function render() {
    const line = queue[idx];
    $("story-speaker").textContent = line.speaker ? (icon + " " + line.speaker) : icon;
    $("story-text").textContent = line.text;
  }

  function next() {
    idx++;
    if (idx >= queue.length) {
      $("overlay-story").classList.add("hidden");
      const f = cb; cb = null;
      if (f) f();
    } else { render(); AudioSys.click(); }
  }

  return { show, next };
})();