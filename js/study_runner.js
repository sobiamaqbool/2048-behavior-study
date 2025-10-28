// study_runner.js — v=2974 (fix: label defined + smoother transition)
console.log("study_runner loaded v=2974");

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
      background: rgba(2,6,23,0.78)!important;
      backdrop-filter: blur(6px);
      color: #e5e7eb!important;
      display: none;
      position: fixed; inset: 0; z-index: 100000;
      place-items: center; padding: 24px;
    }
    #study-title { font:700 22px/1.2 system-ui; letter-spacing:.2px; }
    #study-body  { font:800 26px/1.25 system-ui; opacity:.98; margin-top:8px; }

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
      background: rgba(15,23,42,.9); border:1px solid #334155;
      border-radius: 12px; padding: 14px; }
    #study-form .q { margin: 10px 0 14px; }
    #study-form label { display:block; font:600 13px system-ui; margin-bottom:6px; }
    #study-form .opts { display:flex; flex-wrap:wrap; gap:8px; }
    #study-form .optbtn { border:1px solid #475569; border-radius:10px; padding:6px 10px; font:600 13px system-ui; background:#0b1220; cursor:pointer; color:#fff; }
    #study-form .optbtn.active { background:#1f2a44; border-color:#64748b; }
    #study-form .rangewrap { display:flex; align-items:center; gap:10px; }
    #study-form input[type=range] { flex:1; }
    #study-submit { margin-top: 8px; width: 100%; padding: 10px 12px;
      border-radius: 10px; border: 1px solid #4663d0; background:#3452c8; color:#fff; font:700 14px system-ui; cursor:pointer; }
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
  const show = (t, s = "") => { titleEl.textContent = t; bodyEl.textContent = s; overlay.style.display = "grid"; };
  const hide = () => { overlay.style.display = "none"; };

  // ---------- NoStorage ----------
  function NoStorageManager() {}
  NoStorageManager.prototype.getBestScore = () => 0;
  NoStorageManager.prototype.setBestScore = _ => {};
  NoStorageManager.prototype.getGameState = () => null;
  NoStorageManager.prototype.setGameState = _ => {};
  NoStorageManager.prototype.clearGameState = _ => {};

  // ---------- HUD above grid ----------
  function ensureGridHUD() {
    let hud = document.querySelector(".grid-hud");
    if (hud) return hud;
    const gc = document.querySelector(".game-container");
    if (!gc) return null;
    const gridFrame = gc.querySelector(".grid-container");
    hud = document.createElement("div");
    hud.className = "grid-hud";
    if (gridFrame && gridFrame.parentNode) {
      gridFrame.parentNode.insertBefore(hud, gridFrame);
    } else {
      gc.prepend(hud);
    }
    return hud;
  }
  function ensureGoalBadge(){
    let el = document.getElementById("goal-badge");
    if (el) return el;
    const hud = ensureGridHUD();
    el = document.createElement("button");
    el.id = "goal-badge"; el.type = "button"; el.disabled = true;
    hud?.appendChild(el);
    return el;
  }
  function ensureTimerBadge(){
    let el = document.getElementById("timer-badge");
    if (el) return el;
    const hud = ensureGridHUD();
    el = document.createElement("button");
    el.id = "timer-badge"; el.type = "button"; el.disabled = true;
    hud?.appendChild(el);
    return el;
  }
  function setGoalBadge(text){
    const el = ensureGoalBadge();
    if (text) { el.textContent = text; el.style.display = "block"; }
    else { el.style.display = "none"; }
  }
  function setTimerBadge(text){
    const el = ensureTimerBadge();
    if (text) { el.textContent = text; el.style.display = "block"; }
    else { el.style.display = "none"; }
  }
  function clearBadges(){ setGoalBadge(""); setTimerBadge(""); }

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
      `public/block.json${bust}`,
      `/public/block.json${bust}`,
      `block.json${bust}`,
      `/block.json${bust}`,
    ];
    for (const u of tries) {
      try { const r = await fetch(u, { cache: "no-store" }); if (r.ok) return await r.json(); } catch(_) {}
    }
    try {
      await ensureYamlLib();
      const ytries = [
        `public/block.yaml${bust}`,
        `/public/block.yaml${bust}`,
        `block.yaml${bust}`,
        `/block.yaml${bust}`,
      ];
      for (const u of ytries) {
        try { const r = await fetch(u, { cache: "no-store" }); if (r.ok) return window.jsyaml.load(await r.text()); } catch(_) {}
      }
    } catch(_) {}
    throw new Error("Could not load public/block.json or block.yaml");
  }

  // ---------- DOM reset ----------
  function wipeGameDOM(size = 4) {
    const gc = document.querySelector(".game-container"); if (!gc) return;
    const rows = Array.from({ length: size }, () =>
      `<div class="grid-row">${Array.from({ length: size }, () => `<div class="grid-cell"></div>`).join("")}</div>`
    ).join("");
    gc.innerHTML = `
      <div class="heading">
        <a class="restart-button" style="display:none"></a>
        <a class="retry-button" style="display:none"></a>
        <a class="keep-playing-button" style="display:none"></a>
      </div>
      <div class="game-message"><p></p><div class="lower">
        <a class="keep-playing-button" style="display:none"></a>
        <a class="retry-button" style="display:none"></a>
      </div></div>
      <div class="grid-container">${rows}</div>
      <div class="tile-container"></div>
    `;
  }

  // ---------- Timer (badge-based) ----------
  function startCountdown(seconds, onEnd) {
    setTimerBadge("");
    if (!seconds) return { stop() {}, running: false };

    let t = Math.max(0, Math.floor(seconds));
    const fmt = s => {
      const m = Math.floor(s / 60), ss = String(Math.max(0, s % 60)).padStart(2, "0");
      return `${m}:${ss}`;
    };
    setTimerBadge(`Time: ${fmt(t)}`);

    const id = setInterval(() => {
      t -= 1;
      setTimerBadge(`Time: ${fmt(t)}`);
      if (t <= 0) {
        clearInterval(id);
        setTimerBadge(`Time: 0:00`);
        onEnd?.();
      }
    }, 1000);

    return { stop: () => { clearInterval(id); setTimerBadge(""); } };
  }

  // ---------- Prefill / weights ----------
  function pickWeighted(obj){
    const entries = Object.entries(obj).map(([k,v])=>[+k,+v]);
    const sum = entries.reduce((a,[,w])=>a+w,0)||1;
    let r=Math.random()*sum;
    for (const [val,w] of entries){ if ((r-=w)<=0) return Math.floor(val); }
    return Math.floor(entries[0]?.[0]??2);
  }

  // ================= RUNNER =================
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const ROUND_ORDER=["easy_mode","medium_mode","hard_mode","oddball_mode"];
  function preBlockLabel(nextId,nextType){
    if(nextType!=="play") return null;
    const idx=ROUND_ORDER.indexOf(nextId); if(idx===-1) return null;
    const n=idx+1,total=ROUND_ORDER.length;
    return { title:`Round ${n}/${total}`, body:"Starting soon…" };
  }

  function buildName(pattern, meta, blockId, kind){
    const base=(pattern||"{study_id}__{block_id}__{kind}__{ts}.csv")
      .replace("{study_id}", meta?.study_id||"study")
      .replace("{block_id}", blockId)
      .replace("{kind}", kind)
      .replace("{ts}", Date.now());
    if (!/__moves__|__tests__|__.+__/.test(base)) {
      return base.replace(/\.csv$/i, `__${kind}.csv`);
    }
    return base;
  }

  async function runStudy(config){
    const { blocks, sequence, output }=config;
    const map=Object.fromEntries(blocks.map(b=>[b.id,b]));
    for(let i=0;i<sequence.length;i++){
      const id=sequence[i],b=map[id]; if(!b) continue;

      const label = preBlockLabel(id,b.type);   // ✅ FIXED
      const PREBLOCK_MS = 1200;                 // 1.2 seconds
      if (label) {
        show(label.title, label.body);
        await sleep(PREBLOCK_MS);
        hide();
      }

      if(b.type==="rest"){
        clearBadges();
        await new Promise(r=>setTimeout(r,(b.stop?.value||10)*1000));
        continue;
      }
      if(b.type==="play"){
        const moveRows = await runPlayBlock(config,b);
        if (output?.autosave_csv_on_block_end){
          const csv  = L.toCSVMoves(moveRows);
          const name = buildName(output.filename_pattern, config.meta, id, "moves");
          L.download(name,csv);
        }
        continue;
      }
      if(b.type==="tests"){
        const testRows = await runTestsBlock(config,b);
        if (output?.autosave_csv_on_block_end){
          const csv  = L.toCSVTests(testRows);
          const name = buildName(output.tests_filename_pattern, config.meta, id, "tests");
          L.download(name,csv);
        }
        continue;
      }
    }
    clearBadges();
    show("Study complete","Thank you!");
  }

  // ---------- Boot ----------
  try{
    const cfg=await loadConfigSmart();
    L.setContext({ participant_id:"P001" });
    await runStudy(cfg);
  }catch(e){
    console.error(e);
    clearBadges();
    show("Config error","Could not load public/block.json or block.yaml");
  }
})();
