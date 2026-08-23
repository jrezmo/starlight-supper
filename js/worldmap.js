/* ============ WorldMap: classic region-colored star map for expedition select ============ */
"use strict";
const WorldMap = (() => {
  // map-space coords (0..100) per planet; drawn on canvas
  const NODES = {
    home:     { x: 50, y: 78, name: "Home Shelter", icon: "🏠", color: "#c9b8ff" },
    verdanth: { x: 22, y: 30, name: "Verdanth", icon: "🌿", color: "#7de08a" },
    cinder:   { x: 82, y: 38, name: "Cinder Reach", icon: "🌋", color: "#ff8a5c" },
    pelagia:  { x: 55, y: 12, name: "Pelagia", icon: "🌊", color: "#6cb8ff" },
  };

  function open() {
    $("panel-title").textContent = "🛸 The Rustbucket — Galaxy Chart";
    $("panel-body").innerHTML = `
      <canvas id="starmap" width="940" height="480" style="max-width:96%;border-radius:16px;border:2px solid var(--panel2);cursor:pointer"></canvas>
      <div id="map-info" class="map-desc" style="text-align:center;min-height:52px">Tap a region to survey it. Tap LAUNCH to set down. ⚡1</div>`;
    showScreen("screen-panel");
    draw();
    const cv = $("starmap");
    let hover = null;
    const pos = e => {
      const r = cv.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width * 100, y: (e.clientY - r.top) / r.height * 100 };
    };
    const hit = pt => Object.entries(NODES).find(([id, n]) =>
      id !== "home" && Math.hypot(pt.x - n.x, (pt.y - n.y) * .8) < 9);
    cv.onclick = e => {
      const m = hit(pos(e));
      if (!m) return;
      const [id] = m;
      const p = DATA.planets.find(x => x.id === id);
      const done = State.jewels.includes(p.jewel);
      const ally = State.allies.includes(p.rival);
      $("map-info").innerHTML = `<b style="color:${NODES[id].color}">${p.icon} ${p.name}</b> — ${p.blurb}
        <br>Jewel: ${done ? "<b>✅ recovered</b>" : DATA.jewels[p.jewel]} ${ally ? "· 🤝 ally here" : ""}
        &nbsp;<button class="btn btn-primary" id="btn-launch-${id}" ${done || State.energy <= 0 ? "disabled" : ""}>🚀 Launch ⚡1</button>`;
      $("btn-launch-" + id).onclick = () => {
        if (!spendEnergy(1)) return;
        State.planet = id;
        AudioSys.good();
        toast(`🚀 Touchdown: ${p.name}!`, "gold");
        log(`🚀 Landed on <b>${p.name}</b>.`);
        Hub.open(); // shows Explore button in orbit context
        World.open();
      };
    };
    cv.onmousemove = e => {
      const m = hit(pos(e));
      cv.style.cursor = m ? "pointer" : "default";
      hover = m ? m[0] : null; draw(hover);
    };
  }

  function draw(hoverId) {
    const cv = $("starmap"); if (!cv) return;
    const c = cv.getContext("2d"), W = cv.width, H = cv.height;
    const X = x => x / 100 * W, Y = y => y / 100 * H;
    // deep space gradient
    const g = c.createRadialGradient(W/2, H*.4, 60, W/2, H/2, H);
    g.addColorStop(0, "#241b52"); g.addColorStop(1, "#0a0722");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // stars
    if (!draw._stars) draw._stars = Array.from({length:130},()=>({x:Math.random()*W,y:Math.random()*H,r:Math.random()*1.5+.3,tw:Math.random()*6}));
    for (const s of draw._stars) {
      const tw = .5 + .5*Math.sin(performance.now()/400 + s.tw);
      c.fillStyle = `rgba(255,255,255,${.25 + tw*.45})`;
      c.beginPath(); c.arc(s.x, s.y, s.r, 0, 7); c.fill();
    }
    // nebula washes per region (topography feel)
    const nebulae = [
      [NODES.verdanth.x, NODES.verdanth.y, 150, "125,224,138"], 
      [NODES.cinder.x, NODES.cinder.y, 160, "255,120,60"],
      [NODES.pelagia.x, NODES.pelagia.y, 155, "80,170,255"],
      [50, 85, 140, "180,160,255"],
    ];
    for (const [nx, ny, rad, rgb] of nebulae) {
      const rg = c.createRadialGradient(X(nx), Y(ny), 10, X(nx), Y(ny), rad);
      rg.addColorStop(0, `rgba(${rgb},.28)`); rg.addColorStop(1, `rgba(${rgb},0)`);
      c.fillStyle = rg; c.beginPath(); c.arc(X(nx), Y(ny), rad, 0, 7); c.fill();
    }
    // trade routes from home
    c.strokeStyle = "rgba(200,185,255,.25)"; c.lineWidth = 2; c.setLineDash([6,8]);
    for (const id of ["verdanth","cinder","pelagia"]) {
      c.beginPath(); c.moveTo(X(NODES.home.x), Y(NODES.home.y));
      c.quadraticCurveTo(X((NODES.home.x+NODES[id].x)/2), Y(Math.min(NODES.home.y,NODES[id].y)-10), X(NODES[id].x), Y(NODES[id].y));
      c.stroke();
    }
    c.setLineDash([]);
    // home node
    node(c, "home", false);
    // planet nodes
    for (const id of ["verdanth","cinder","pelagia"]) node(c, id, hoverId === id);
    // title flourish
    c.fillStyle = "rgba(220,210,255,.5)"; c.font = "bold 13px sans-serif"; c.textAlign = "left";
    c.fillText("KNOWN SPACE — VESSARI CHART", 14, 24);
    c.textAlign = "right"; c.fillStyle = "rgba(220,210,255,.35)";
    c.fillText("⚡" + State.energy + " energy · 💠" + State.jewels.length + "/3 jewels", W-14, 24);

    function node(c2, id, hov) {
      const n = NODES[id], x = X(n.x), y = Y(n.y);
      const p = DATA.planets.find(pl => pl.id === id);
      const isPlanet = !!p;
      const done = p && State.jewels.includes(p.jewel);
      const pulse = Math.sin(performance.now()/300 + n.x)*3;
      // halo
      const hg = c2.createRadialGradient(x,y,4,x,y,(hov?46:36)+pulse);
      hg.addColorStop(0, n.color + "aa"); hg.addColorStop(1, n.color + "00");
      c2.fillStyle = hg; c2.beginPath(); c2.arc(x,y,(hov?46:36)+pulse,0,7); c2.fill();
      // body
      c2.fillStyle = n.color; c2.beginPath(); c2.arc(x,y,hov?17:14,0,7); c2.fill();
      c2.fillStyle = "rgba(10,7,34,.35)"; c2.beginPath(); c2.arc(x - (isPlanet?4:0), y + 4, hov?15:12.5, 0, 7); c2.fill();
      c2.font = (hov?22:19) + "px serif"; c2.textAlign = "center";
      c2.fillText(p ? p.icon : n.icon, x, y + (hov?8:7));
      // label
      c2.fillStyle = hov ? "#fff" : "rgba(230,225,255,.85)";
      c2.font = "bold 12px sans-serif";
      c2.fillText((n.name + (done ? " ✅" : "")).toUpperCase(), x, y + 34);
      // status ring
      if (done) { c2.strokeStyle="#ffd76b"; c2.lineWidth=2; c2.beginPath(); c2.arc(x,y,20,0,7); c2.stroke(); }
    }
  }

  return { open };
})();
