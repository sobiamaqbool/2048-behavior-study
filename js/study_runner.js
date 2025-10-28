// study_runner.js — v=2973 (fix: askPostQuestions + goal left / timer right)
console.log("study_runner loaded v=2973");

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
  function prefillBoard(gm, spec){
    if (!spec?.prefill) return;
    const ratio = Math.max(0, Math.min(1, Number(spec.prefill.fill_ratio ?? 0)));
    let need = Math.round(gm.size*gm.size*ratio);
    const weights = spec.prefill.values || {"2":1,"4":1};
    while (need-- > 0 && gm.grid.availableCells().length){
      const cell = gm.grid.randomAvailableCell();
      gm.grid.insertTile(new Tile(cell, pickWeighted(weights)));
    }
  }
  function applyStartGrid(gm, spec){
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
  function flashTileEl(el, ms=600){ if(!el) return; el.classList.add("flash-brief"); setTimeout(()=>el.classList.remove("flash-brief"), ms); }

  // ---------- Inline questions (RESTORED) ----------
  function askPostQuestions(block){
    const qs = block?.post_questions;
    if (!qs || !Array.isArray(qs) || !qs.length) return Promise.resolve();

    if (Tests && typeof Tests.runTests === "function") {
      show("Quick questions", "Answer, then continue.");
      return Tests.runTests(qs, `${block.id}__post`, block.tests_options || null)
        .then(res => {
          const write = (id, val) => L.logTest(block.id, String(id), "post_question", val);
          if (res == null) return;

          if (Array.isArray(res)) {
            res.forEach((item, i) => {
              if (item && typeof item === "object") {
                const id  = item.id ?? item.itemId ?? item.key ?? i;
                const val = item.response ?? item.value ?? item.answer ?? item.score ?? JSON.stringify(item);
                write(id, val);
              } else {
                write(i, item);
              }
            });
          } else if (typeof res === "object") {
            Object.entries(res).forEach(([k, v]) => write(k, v));
          } else {
            write("result", res);
          }
        })
        .catch(e => console.error("Post questions error:", e))
        .finally(() => hide());
    }

    // Fallback mini form
    return new Promise((resolve) => {
      show("Quick questions", "Answer, then continue.");
      let form = document.getElementById("study-form");
      if (!form) {
        form = document.createElement("div");
        form.id = "study-form";
        overlay.appendChild(form);
      }
      form.innerHTML = "";

      const answers = {};
      qs.forEach((q, idx) => {
        const wrap = document.createElement("div"); wrap.className = "q";
        const lbl = document.createElement("label"); lbl.textContent = q.text || `Question ${idx+1}`;
        wrap.appendChild(lbl);

        if (q.type === "single" && Array.isArray(q.options)) {
          const opts = document.createElement("div"); opts.className = "opts";
          q.options.forEach(opt => {
            const b = document.createElement("button");
            b.type = "button"; b.className = "optbtn"; b.textContent = opt;
            b.addEventListener("click", () => {
              opts.querySelectorAll(".optbtn").forEach(x => x.classList.remove("active"));
              b.classList.add("active");
              answers[q.id || `q${idx}`] = opt;
            });
            opts.appendChild(b);
          });
          wrap.appendChild(opts);
        } else if (q.type === "scale" && Number.isFinite(q.min) && Number.isFinite(q.max)) {
          const r = document.createElement("input");
          const out = document.createElement("div");
          const box = document.createElement("div");
          box.className="rangewrap"; out.style.minWidth="32px";
          r.type="range"; r.min=q.min; r.max=q.max; r.step=1; r.value=q.min;
          out.textContent=String(q.min);
          r.addEventListener("input",()=>{ out.textContent=r.value; answers[q.id || `q${idx}`]=Number(r.value); });
          answers[q.id || `q${idx}`]=q.min;
          box.appendChild(r); box.appendChild(out); wrap.appendChild(box);
        } else {
          const inp = document.createElement("input");
          inp.type = "text"; inp.style.width="100%";
          inp.addEventListener("input", () => { answers[q.id || `q${idx}`] = inp.value; });
          wrap.appendChild(inp);
        }
        form.appendChild(wrap);
      });

      const submit = document.createElement("button");
      submit.id = "study-submit"; submit.textContent = "Submit";
      submit.addEventListener("click", () => {
        Object.entries(answers).forEach(([itemId, response]) => {
          L.logTest(block.id, itemId, "post_question", response);
        });
        form.remove(); hide(); resolve();
      });
      form.appendChild(submit);
    });
  }

  // ================= PLAY =================
  let lastPlayBlockId = null;

  async function runPlayBlock(cfg, block){
    return new Promise(resolve=>{
      const size = block.board_size || cfg?.global?.board_size || 4;
      wipeGameDOM(size);

      const gm = new GameManager(size, KeyboardInputManager, HTMLActuator, NoStorageManager);

      L.setContext({ participant_id:"P001", mode_id:block.id });
      L.newSession(block.id);
      const SESSION_ID = (typeof L.getContext === "function" ? L.getContext().session_id : null);

      const goalTile=Number.isFinite(Number(block.goal_tile))?Number(block.goal_tile):null;
      const goalLine=goalTile?`Goal: Reach ${goalTile}`:"Press arrow keys to play";

      // Popup
      show(block.description||block.id, goalLine);
      const ov=document.getElementById("study-overlay");
      if(ov) ov.style.pointerEvents="none";
      setTimeout(()=>{ hide(); if(ov) ov.style.pointerEvents=""; },3000);

      // HUD
      setGoalBadge(goalLine);
      setTimerBadge("");

      let ended=false, cd=null, microTimer=null;

      // move logging
      let lastMoveAt=performance.now();
      let inputs_total=0;
      const dirName=d=>({0:"up",1:"right",2:"down",3:"left"})[d]??String(d);

      gm.inputManager.on("move", (dir) => {
        const now = performance.now();
        const latencyMs = Math.max(1, Math.round(now - lastMoveAt));
        lastMoveAt = now;
        inputs_total += 1;

        const n = gm.size;
        const gridOut = Array.from({length:n}, (_, y) =>
          Array.from({length:n}, (_, x) => {
            const cell = gm.grid.cells[x][y];
            return cell ? cell.value : 0;
          })
        );

        L.logMove(inputs_total, dirName(dir), gm.score, latencyMs, gridOut);
      });

      if (!applyStartGrid(gm, block.start_state)) {
        prefillBoard(gm, block.start_state);
      }

      const spawnRates=block?.spawn?.rates;
      const origAdd=gm.addRandomTile.bind(gm);
      gm.addRandomTile=function(){
        if(!gm.grid.cellsAvailable()) return origAdd();
        const cell=gm.grid.randomAvailableCell();
        if(spawnRates){ gm.grid.insertTile(new Tile(cell,pickWeighted(spawnRates))); return; }
        origAdd();
      };

      // Timer badge
      if((block.stop?.kind==="time"&&block.stop?.value)||block.timer?.hard_cap_sec){
        const secs=Number(block.timer?.hard_cap_sec||block.stop?.value||0);
        cd=startCountdown(secs,()=>stop("time_done"));
      }

      // WIN logic without locking moves
      const oldAct=gm.actuator.actuate.bind(gm.actuator);
      gm.actuator.actuate=(grid,meta)=>{
        oldAct(grid,meta);
        if (ended) return;

        if(meta?.terminated){
          stop(meta.over ? "game_over" : "won");
          return;
        }

        if(Number.isFinite(goalTile)){
          let maxNow=0;
          for(let x=0;x<gm.size;x++){
            for(let y=0;y<gm.size;y++){
              const c=gm.grid.cells[x][y];
              if(c) maxNow=Math.max(maxNow,c.value);
            }
          }
          if(maxNow>=goalTile){
            show("Goal reached",`Reached ${goalTile}`);
            setTimeout(()=>stop("goal_reached"),500);
          }
        }
      };

      // Oddball flashes (optional)
      const enableMicro=(block.id==="oddball_mode");
      let microStarted=false, microCount=0;
      const MICRO_LIMIT=2;
      function getRandomTileEl(){
        const inners=Array.from(document.querySelectorAll(".tile .tile-inner"));
        return inners.length? inners[Math.floor(Math.random()*inners.length)] : null;
      }
      function flashTileEl(el, ms=600){ if(!el) return; el.classList.add("flash-brief"); setTimeout(()=>el.classList.remove("flash-brief"), ms); }
      function fireFlashOnce(){
        if (!enableMicro || microCount >= MICRO_LIMIT || ended) return;
        const el=getRandomTileEl(); if(el){ flashTileEl(el,700); }
        microCount += 1;
        if (microCount < MICRO_LIMIT) {
          const gap = 12000 + Math.floor(Math.random()*8000);
          microTimer = setTimeout(fireFlashOnce, gap);
        }
      }
      setTimeout(()=>{ if(enableMicro && !microStarted && !ended){ microStarted=true; fireFlashOnce(); } },3000);

      function finalizeAndResolve(){
        lastPlayBlockId = block.id;
        setTimeout(()=>{
          const rows = L.moveRowsForExport()
            .filter(r => r.mode_id === block.id && (!SESSION_ID || r.session_id === SESSION_ID));
          resolve(rows);
        },80);
      }

      function stop(){
        if (ended) return;
        ended = true;
        try { cd?.stop?.(); } catch(_){}
        try { clearTimeout(microTimer); } catch(_){}
        hide();
        setTimerBadge("");

        const p = (block?.post_questions && block.post_questions.length)
          ? askPostQuestions(block)
          : Promise.resolve();

        p.then(finalizeAndResolve);
      }
    });
  }

  // ================= TESTS =================
  async function runTestsBlock(cfg, block){
    L.setContext({ participant_id:"P001", mode_id:block.id });
    L.newSession(block.id);
    const TEST_SESSION_ID = (typeof L.getContext === "function" ? L.getContext().session_id : null);
    try { await Tests.runTests(block.tests||[], block.id, block.tests_options||null); }
    catch (e) { console.error("TestsUI.runTests error:", e); }

    return L.testRowsForExport()
      .filter(r => r.mode_id === block.id && (!TEST_SESSION_ID || r.session_id === TEST_SESSION_ID));
  }

  // ================= RUNNER =================
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const ROUND_ORDER=["easy_mode","medium_mode","hard_mode","oddball_mode"];
  function preBlockLabel(nextId,nextType){
    if(nextType!=="play") return null;
    const idx=ROUND_ORDER.indexOf(nextId); if(idx===-1) return null;
    const n=idx+1,total=ROUND_ORDER.length;
    return { title:`Round ${n}/${total}`, body:"Starting in 5 seconds…" };
  }
  const tsPrecise=()=>{ const d=new Date(),p=n=>String(n).padStart(2,"0");
    const ms=String(d.getMilliseconds()).padStart(3,"0");
    return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${ms}`;
  };
  function buildName(pattern, meta, blockId, kind){
    const base=(pattern||"{study_id}__{block_id}__{kind}__{ts}.csv")
      .replace("{study_id}", meta?.study_id||"study")
      .replace("{block_id}", blockId)
      .replace("{kind}", kind)
      .replace("{ts}", tsPrecise());
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
      const PREBLOCK_MS = 1200; // 1.2 seconds
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
