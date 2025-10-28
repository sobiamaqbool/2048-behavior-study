// study_runner.js — v=2965 (goal badge centered below intro + clean layout)
console.log("study_runner loaded v=2965");

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
      position: fixed;
      inset: 0;
      z-index: 100000;
      place-items: center;
      padding: 24px;
    }

    #study-title { font:700 22px/1.2 system-ui; letter-spacing:.2px; }
    #study-body  { font:800 26px/1.25 system-ui; opacity:.98; margin-top:8px; }

    #study-form {
      margin-top: 14px;
      max-width: 520px;
      width: 100%;
      background: rgba(15,23,42,.9);
      border:1px solid #334155;
      border-radius: 12px;
      padding: 14px;
    }
    #study-form .q { margin: 10px 0 14px; }
    #study-form label { display:block; font:600 13px system-ui; margin-bottom:6px; }
    #study-form .opts { display:flex; flex-wrap:wrap; gap:8px; }
    #study-form .optbtn {
      border:1px solid #475569;
      border-radius:10px;
      padding:6px 10px;
      font:600 13px system-ui;
      background:#0b1220;
      cursor:pointer;
      color:#fff;
    }
    #study-form .optbtn.active { background:#1f2a44; border-color:#64748b; }
    #study-form .rangewrap { display:flex; align-items:center; gap:10px; }
    #study-form input[type=range] { flex:1; }
    #study-submit {
      margin-top: 8px;
      width: 100%;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid #4663d0;
      background:#3452c8;
      color:#fff;
      font:700 14px system-ui;
      cursor:pointer;
    }

    #study-timer {
      position: fixed;
      top: 14px;
      right: 14px;
      z-index: 10000;
      background: #0f172a;
      color: #e5e7eb;
      border: 1px solid #334155;
      border-radius: 10px;
      padding: 6px 10px;
      font: 600 13px system-ui;
      box-shadow: 0 6px 18px rgba(0,0,0,.35);
      display: none;
    }

    /* ✅ Clean centered goal badge below intro line */
    #goal-badge {
      display: none;
      background: #8C7B68;
      color: #ffffff;
      border: none;
      border-radius: 10px;
      padding: 8px 16px;
      font: 700 15px/1.2 system-ui;
      box-shadow: 0 3px 8px rgba(0,0,0,.25);
      margin-top: 12px;
      clear: both;
      display: block;
      width: max-content;
      margin-left: auto;
      margin-right: auto;
      cursor: default;
    }
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

  // ---------- Goal badge ----------
  function ensureGoalBadge() {
    let el = document.getElementById("goal-badge");
    if (el) return el;

    const btn = document.createElement("button");
    btn.id = "goal-badge";
    btn.type = "button";
    btn.disabled = true;

    const intro = document.querySelector(".above-game .game-intro") ||
                  document.querySelector(".game-intro");

    if (intro && intro.parentNode) {
      intro.parentNode.insertBefore(btn, intro.nextSibling);
    } else {
      const heading = document.querySelector(".above-game") ||
                      document.querySelector(".heading") ||
                      document.querySelector(".game-container");
      heading?.prepend(btn);
    }
    return btn;
  }

  function setGoalBadge(text) {
    const el = ensureGoalBadge();
    if (text) {
      el.textContent = text;
      el.style.display = "block";
    } else {
      el.style.display = "none";
    }
  }

  function clearGoalBadge() {
    const el = document.getElementById("goal-badge");
    if (el) el.style.display = "none";
  }

  // ---------- Config loader ----------
  async function ensureYamlLib() {
    if (window.jsyaml) return;
    const urls = [
      "vendor/js-yaml.min.js",
      "/vendor/js-yaml.min.js",
      "https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/dist/js-yaml.min.js"
    ];
    for (const u of urls) {
      try {
        await new Promise((res, rej) => {
          const s = document.createElement("script");
          s.src = u; s.referrerPolicy = "no-referrer";
          s.onload = res; s.onerror = rej; document.head.appendChild(s);
        });
        if (window.jsyaml) return;
      } catch (_) {}
    }
    throw new Error("YAML parser missing");
  }

  async function loadConfigSmart() {
    const bust = `?t=${Date.now()}`;
    const jsonUrls = [
      `public/block.json${bust}`,
      `/public/block.json${bust}`,
      `block.json${bust}`,
      `/block.json${bust}`
    ];
    for (const u of jsonUrls) {
      try {
        const r = await fetch(u, { cache: "no-store" });
        if (r.ok) return await r.json();
      } catch (_) {}
    }

    try {
      await ensureYamlLib();
      const yamlUrls = [
        `public/block.yaml${bust}`,
        `/public/block.yaml${bust}`,
        `block.yaml${bust}`,
        `/block.yaml${bust}`
      ];
      for (const u of yamlUrls) {
        try {
          const r = await fetch(u, { cache: "no-store" });
          if (r.ok) return window.jsyaml.load(await r.text());
        } catch (_) {}
      }
    } catch (_) {}

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

  // ---------- Timer ----------
  function getTimerEl() {
    let el = document.getElementById("study-timer");
    if (!el) {
      el = document.createElement("div");
      el.id = "study-timer";
      document.body.appendChild(el);
    }
    return el;
  }

  function startCountdown(seconds, onEnd) {
    if (!seconds) return { stop() {}, running: false };
    const el = getTimerEl();
    const fmt = s => {
      const m = Math.floor(s / 60), ss = String(Math.max(0, s % 60)).padStart(2, "0");
      return `${m}:${ss}`;
    };
    let t = seconds;
    el.textContent = `Time: ${fmt(t)}`;
    el.style.display = "block";
    const id = setInterval(() => {
      t -= 1; el.textContent = `Time: ${fmt(t)}`;
      if (t <= 0) { clearInterval(id); el.style.display = "none"; onEnd?.(); }
    }, 1000);
    const stop = () => { clearInterval(id); el.style.display = "none"; };
    return { stop, running: true };
  }

  // ---------- Prefill / weights ----------
  function pickWeighted(obj) {
    const entries = Object.entries(obj).map(([k,v])=>[+k,+v]);
    const sum = entries.reduce((a,[,w])=>a+w,0)||1;
    let r=Math.random()*sum;
    for (const [val,w] of entries){ if ((r-=w)<=0) return Math.floor(val); }
    return Math.floor(entries[0]?.[0]??2);
  }

  function prefillBoard(gm, spec) {
    if (!spec?.prefill) return;
    const ratio = Math.max(0, Math.min(1, Number(spec.prefill.fill_ratio ?? 0)));
    let need = Math.round(gm.size*gm.size*ratio);
    const weights = spec.prefill.values || {"2":1,"4":1};
    while (need-- > 0 && gm.grid.availableCells().length){
      const cell = gm.grid.randomAvailableCell();
      gm.grid.insertTile(new Tile(cell, pickWeighted(weights)));
    }
  }

  // ---------- Optional start grid ----------
  function applyStartGrid(gm, spec) {
    if (!spec?.grid) return false;
    gm.grid = new Grid(gm.size);
    for (let y = 0; y < spec.grid.length; y++){
      for (let x = 0; x < spec.grid[y].length; x++){
        const v = Number(spec.grid[y][x]) || 0;
        if (v > 0) gm.grid.insertTile(new Tile({ x, y }, v));
      }
    }
    gm.score = 0;
    gm.over = false; gm.won = false; gm.keepPlaying = false;
    gm.actuator.actuate(gm.grid, { score: gm.score, terminated: false });
    return true;
  }

  // ---------- Oddball visuals ----------
  function getRandomTileEl(){
    const inners=Array.from(document.querySelectorAll(".tile .tile-inner"));
    return inners.length? inners[Math.floor(Math.random()*inners.length)] : null;
  }

  function flashTileEl(el, ms=600){
    if(!el) return;
    el.classList.add("flash-brief");
    setTimeout(()=>el.classList.remove("flash-brief"), ms);
  }

  // ---------- NoStorage ----------
  function NoStorageManager() {}
  NoStorageManager.prototype.getBestScore = () => 0;
  NoStorageManager.prototype.setBestScore = _ => {};  
  NoStorageManager.prototype.getGameState = () => null;
  NoStorageManager.prototype.setGameState = _ => {};
  NoStorageManager.prototype.clearGameState = _ => {};

  // ---------- PLAY logic ----------
  let lastPlayBlockId = null;

  async function runPlayBlock(cfg, block){
    return new Promise(resolve=>{
      const size = block.board_size || cfg?.global?.board_size || 4;
      wipeGameDOM(size);
      const gm = new GameManager(size, KeyboardInputManager, HTMLActuator, NoStorageManager);
      L.setContext({ participant_id:"P001", mode_id:block.id });
      L.newSession(block.id);
      const SESSION_ID = L.getContext?.().session_id;

      const goalTile = Number(block.goal_tile)||null;
      const goalLine = goalTile ? `Goal: Reach ${goalTile}` : "Press arrow keys to play";
      show(block.description||block.id, goalLine);
      const ov=document.getElementById("study-overlay");
      if(ov) ov.style.pointerEvents="none";
      setTimeout(()=>{ hide(); if(ov) ov.style.pointerEvents=""; },3000);

      // ✅ Keep goal badge below intro
      setGoalBadge(goalLine);

      let ended=false, cd=null, microTimer=null;

      let lastMoveAt=performance.now();
      let inputs_total=0;
      const dirName=d=>({0:"up",1:"right",2:"down",3:"left"})[d]??String(d);

      gm.inputManager.on("move", (dir)=>{
        const now=performance.now();
        const latencyMs=Math.max(1,Math.round(now-lastMoveAt));
        lastMoveAt=now; inputs_total+=1;
        const n=gm.size;
        const gridOut=Array.from({length:n},(_,y)=>
          Array.from({length:n},(_,x)=>{
            const cell=gm.grid.cells[x][y];
            return cell?cell.value:0;
          })
        );
        L.logMove(inputs_total,dirName(dir),gm.score,latencyMs,gridOut);
      });

      if (!applyStartGrid(gm, block.start_state)) prefillBoard(gm, block.start_state);

      const spawnRates=block?.spawn?.rates;
      const origAdd=gm.addRandomTile.bind(gm);
      gm.addRandomTile=function(){
        if(!gm.grid.cellsAvailable()) return origAdd();
        const cell=gm.grid.randomAvailableCell();
        if(spawnRates){ gm.grid.insertTile(new Tile(cell,pickWeighted(spawnRates))); return; }
        origAdd();
      };

      if((block.stop?.kind==="time"&&block.stop?.value)||block.timer?.hard_cap_sec){
        const secs=Number(block.timer?.hard_cap_sec||block.stop?.value||0);
        cd=startCountdown(secs,()=>stop("time_done"));
      }

      const oldAct=gm.actuator.actuate.bind(gm.actuator);
      gm.actuator.actuate=(grid,meta)=>{
        oldAct(grid,meta);
        if(meta?.terminated){ stop(meta.over?"game_over":"won"); return; }
        if(goalTile){
          let maxNow=0; grid.eachCell((x,y,c)=>{ if(c) maxNow=Math.max(maxNow,c.value); });
          if(maxNow>=goalTile&&!gm.won){
            gm.won=true; show("You win!",`Reached ${goalTile}`);
            setTimeout(()=>stop("goal_reached"),600);
          }
        }
      };

      // flashes for oddball
      const enableMicro=(block.id==="oddball_mode");
      let microStarted=false,microCount=0;
      const MICRO_LIMIT=2;
      function fireFlashOnce(){
        if(!enableMicro||microCount>=MICRO_LIMIT||ended)return;
        const el=getRandomTileEl();
        if(el){flashTileEl(el,700);}
        microCount+=1;
        if(microCount<MICRO_LIMIT){
          const gap=12000+Math.floor(Math.random()*8000);
          microTimer=setTimeout(fireFlashOnce,gap);
        }
      }
      setTimeout(()=>{
        if(enableMicro&&!microStarted&&!ended){microStarted=true;fireFlashOnce();}
      },3000);

      function finalizeAndResolve(){
        lastPlayBlockId=block.id;
        setTimeout(()=>{
          const rows=L.moveRowsForExport().filter(r=>r.mode_id===block.id&&(r.session_id===SESSION_ID));
          resolve(rows);
        },80);
      }

      function stop(){
        if(ended)return;
        ended=true;
        try{cd?.stop();}catch(_){}
        try{clearTimeout(microTimer);}catch(_){}
        hide();
        askPostQuestions(block).then(finalizeAndResolve);
      }
    });
  }

  // ---------- Study Runner ----------
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const ROUND_ORDER=["easy_mode","medium_mode","hard_mode","oddball_mode"];
  function preBlockLabel(nextId,nextType){
    if(nextType!=="play")return null;
    const idx=ROUND_ORDER.indexOf(nextId);if(idx===-1)return null;
    const n=idx+1,total=ROUND_ORDER.length;
    return{title:`Round ${n}/${total}`,body:"Starting in 5 seconds…"};
  }

  async function runStudy(config){
    const{meta,blocks,sequence,output}=config;
    const map=Object.fromEntries(blocks.map(b=>[b.id,b]));
    for(let i=0;i<sequence.length;i++){
      const id=sequence[i],b=map[id];if(!b)continue;
      const label=preBlockLabel(id,b.type);
      if(label){show(label.title,label.body);await sleep(5000);hide();}

      if(b.type==="rest"){clearGoalBadge();await sleep(1000);continue;}
      if(b.type==="play"){await runPlayBlock(config,b);continue;}
    }
    clearGoalBadge();
    show("Study complete","Thank you!");
  }

  // ---------- Boot ----------
  try{
    const cfg=await loadConfigSmart();
    L.setContext({participant_id:"P001"});
    await runStudy(cfg);
  }catch(e){
    console.error(e);
    clearGoalBadge();
    show("Config error","Could not load public/block.json or block.yaml");
  }
})();
