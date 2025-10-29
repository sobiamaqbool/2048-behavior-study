// study_runner.js — v=2978 (instant start + theme color #cc8a3f)
console.log("study_runner loaded v=2979");

document.addEventListener("DOMContentLoaded", () => {
  const s = document.createElement("style");
  s.textContent = `
    .game-message { pointer-events: none !important; }
    .tile-inner.flash-brief {
      filter: brightness(2.3) saturate(1.5);
      box-shadow: 0 0 15px 6px rgba(255,255,255,0.8);
      transition: all 0.25s ease;
    }

    #study-overlay {
      background: rgba(204,138,63,0.95)!important; /* theme color */
      backdrop-filter: blur(4px);
      color: #fff!important;
      display: none;
      position: fixed; inset: 0; z-index: 100000;
      place-items: center; padding: 24px;
      text-align: center;
    }
    #study-title { font:700 22px/1.2 system-ui; letter-spacing:.2px; }
    #study-body  { font:800 26px/1.25 system-ui; margin-top:8px; }

    /* HUD anchors just above the grid */
    .grid-hud { position: relative; height: 0; }
    #goal-badge, #timer-badge {
      position: absolute; top: -40px;
      background: #8C7B68; color: #fff;
      border: none; border-radius: 10px;
      padding: 8px 16px; font: 700 15px/1.2 system-ui;
      box-shadow: 0 3px 8px rgba(0,0,0,.25);
      cursor: default; width: max-content;
      display: none; z-index: 10;
    }
    #goal-badge  { left: 0; }
    #timer-badge { right: 0; }

    /* Form styles */
    #study-form { margin-top: 14px; max-width: 520px; width: 100%;
      background: rgba(204,138,63,.9); border:1px solid #a46a1e;
      border-radius: 12px; padding: 14px; color:#fff; }
    #study-form .q { margin: 10px 0 14px; }
    #study-form label { display:block; font:600 13px system-ui; margin-bottom:6px; }
    #study-form .opts { display:flex; flex-wrap:wrap; gap:8px; }
    #study-form .optbtn { border:1px solid #cfa263; border-radius:10px; padding:6px 10px; font:600 13px system-ui; background:#cc8a3f; cursor:pointer; color:#fff; }
    #study-form .optbtn.active { background:#a46a1e; border-color:#7a5215; }
    #study-submit { margin-top: 8px; width: 100%; padding: 10px 12px;
      border-radius: 10px; border: 1px solid #b17729; background:#cc8a3f; color:#fff; font:700 14px system-ui; cursor:pointer; }
  `;
  document.head.appendChild(s);
});

(async function () {
  const L = window.StudyLogger;
  const Tests = window.TestsUI;

  // ---------- Overlay ----------
  const overlay = document.getElementById("study-overlay");
  const titleEl = document.getElementById("study-title");
  const bodyEl  = document.getElementById("study-body");
  const show = (t, s = "") => {
    titleEl.textContent = t;
    bodyEl.textContent = s;
    overlay.style.display = "grid";
    overlay.style.opacity = "1";
    setTimeout(() => {
      overlay.style.opacity = "0";
      overlay.style.transition = "opacity 0.6s";
      setTimeout(() => (overlay.style.display = "none"), 600);
    }, 1000); // show 1s
  };
  const hide = () => { overlay.style.display = "none"; };

  // ---------- NoStorage ----------
  function NoStorageManager() {}
  NoStorageManager.prototype.getBestScore = () => 0;
  NoStorageManager.prototype.setBestScore = _ => {};
  NoStorageManager.prototype.getGameState = () => null;
  NoStorageManager.prototype.setGameState = _ => {};
  NoStorageManager.prototype.clearGameState = _ => {};

  // ---------- HUD ----------
  function ensureGridHUD() {
    let hud = document.querySelector(".grid-hud");
    if (hud) return hud;
    const gc = document.querySelector(".game-container");
    if (!gc) return null;
    const gridFrame = gc.querySelector(".grid-container");
    hud = document.createElement("div");
    hud.className = "grid-hud";
    if (gridFrame && gridFrame.parentNode) gridFrame.parentNode.insertBefore(hud, gridFrame);
    else gc.prepend(hud);
    return hud;
  }
  function ensureBadge(id, side) {
    let el = document.getElementById(id);
    if (el) return el;
    const hud = ensureGridHUD();
    el = document.createElement("button");
    el.id = id; el.type = "button"; el.disabled = true;
    el.style[side] = "0";
    hud?.appendChild(el);
    return el;
  }
  const setGoalBadge = text => {
    const el = ensureBadge("goal-badge", "left");
    if (text) { el.textContent = text; el.style.display = "block"; } else el.style.display = "none";
  };
  const setTimerBadge = text => {
    const el = ensureBadge("timer-badge", "right");
    if (text) { el.textContent = text; el.style.display = "block"; } else el.style.display = "none";
  };
  const clearBadges = () => { setGoalBadge(""); setTimerBadge(""); };

  // ---------- Config loader ----------
  async function ensureYamlLib() {
    if (window.jsyaml) return;
    const u = "https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/dist/js-yaml.min.js";
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = u; s.onload = res; s.onerror = rej; document.head.appendChild(s);
    });
  }
  async function loadConfigSmart() {
    const bust = `?t=${Date.now()}`;
    const tries = [
      `public/block.json${bust}`, `/public/block.json${bust}`,
      `block.json${bust}`, `/block.json${bust}`,
    ];
    for (const u of tries) {
      try { const r = await fetch(u, { cache: "no-store" }); if (r.ok) return await r.json(); } catch(_) {}
    }
    try {
      await ensureYamlLib();
      const ytries = [
        `public/block.yaml${bust}`, `/public/block.yaml${bust}`,
        `block.yaml${bust}`, `/block.yaml${bust}`,
      ];
      for (const u of ytries) {
        try { const r = await fetch(u, { cache: "no-store" }); if (r.ok) return window.jsyaml.load(await r.text()); } catch(_) {}
      }
    } catch(_) {}
    throw new Error("Could not load public/block.json or block.yaml");
  }

  // ---------- Timer ----------
  function startCountdown(seconds, onEnd) {
    setTimerBadge("");
    if (!seconds) return { stop() {}, running: false };
    let t = Math.floor(seconds);
    const fmt = s => {
      const m = Math.floor(s / 60), ss = String(Math.max(0, s % 60)).padStart(2, "0");
      return `${m}:${ss}`;
    };
    setTimerBadge(`Time: ${fmt(t)}`);
    const id = setInterval(() => {
      t -= 1;
      setTimerBadge(`Time: ${fmt(t)}`);
      if (t <= 0) { clearInterval(id); setTimerBadge("Time: 0:00"); onEnd?.(); }
    }, 1000);
    return { stop: () => { clearInterval(id); setTimerBadge(""); } };
  }

  // ---------- Prefill ----------
  function pickWeighted(obj){
    const entries = Object.entries(obj).map(([k,v])=>[+k,+v]);
    const sum = entries.reduce((a,[,w])=>a+w,0)||1;
    let r=Math.random()*sum;
    for (const [val,w] of entries){ if ((r-=w)<=0) return Math.floor(val); }
    return +entries[0][0]||2;
  }
  function prefillBoard(gm, spec){
    if (!spec?.prefill) return;
    const ratio = Math.max(0, Math.min(1, +spec.prefill.fill_ratio || 0));
    let need = Math.round(gm.size*gm.size*ratio);
    const weights = spec.prefill.values || {"2":1,"4":1};
    while (need-- > 0 && gm.grid.availableCells().length){
      const cell = gm.grid.randomAvailableCell();
      gm.grid.insertTile(new Tile(cell, pickWeighted(weights)));
    }
  }

  // ---------- PLAY ----------
  async function runPlayBlock(cfg, block){
    return new Promise(resolve=>{
      const size = block.board_size || cfg?.global?.board_size || 4;
      const gc = document.querySelector(".game-container");
      if (!gc) return;
      gc.innerHTML = ''; // clean start

      const gm = new GameManager(size, KeyboardInputManager, HTMLActuator, NoStorageManager);
      L.setContext({ participant_id:"P001", mode_id:block.id });
      L.newSession(block.id);

      const goalTile = Number(block.goal_tile) || null;
      const goalText = goalTile ? `Goal: Reach ${goalTile}` : "";
      setGoalBadge(goalText);

      show(block.description || block.id, goalText);

      if (!block.start_state || !block.start_state.grid)
        prefillBoard(gm, block.start_state);

      const spawnRates = block?.spawn?.rates;
      const origAdd = gm.addRandomTile.bind(gm);
      gm.addRandomTile = function(){
        if(!gm.grid.cellsAvailable()) return origAdd();
        const cell=gm.grid.randomAvailableCell();
        if(spawnRates) gm.grid.insertTile(new Tile(cell, pickWeighted(spawnRates)));
        else origAdd();
      };

      let ended=false, cd=null;
      if(block.stop?.kind==="time" && block.stop?.value)
        cd=startCountdown(block.stop.value, ()=>stop("time_up"));

      gm.actuator.actuate=(grid,meta)=>{
        gm.actuator.constructor.prototype.actuate.call(gm.actuator, grid, meta);
        if(ended) return;
        let maxVal=0;
        grid.eachCell((x,y,c)=>{ if(c) maxVal=Math.max(maxVal,c.value); });
        if(goalTile && maxVal>=goalTile){
          show("Goal reached",`Reached ${goalTile}`);
          setTimeout(()=>stop("goal_reached"),500);
        }
        if(meta.over){ stop("game_over"); }
      };

      function stop(){
        if(ended) return;
        ended=true; cd?.stop?.();
        resolve(L.moveRowsForExport());
      }
    });
  }

  // ---------- RUNNER ----------
  async function runStudy(config){
    const {blocks,sequence}=config;
    const map=Object.fromEntries(blocks.map(b=>[b.id,b]));
    for(const id of sequence){
      const b=map[id]; if(!b) continue;
      if(b.type==="play"){ await runPlayBlock(config,b); }
      else if(b.type==="rest"){ clearBadges(); await new Promise(r=>setTimeout(r,1000)); }
    }
    clearBadges();
    show("Study complete","Thank you!");
  }

  // ---------- Boot ----------
  try{
    const cfg=await loadConfigSmart();
    await runStudy(cfg);
  }catch(e){
    console.error(e);
    clearBadges();
    show("Config error","Could not load public/block.json or block.yaml");
  }
})();
