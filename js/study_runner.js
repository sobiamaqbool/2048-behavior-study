
// study_runner.js — v=2960 (goal text larger + persistent goal badge)

console.log("study_runner loaded v=2961");

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
    /* Title back to normal size */
    #study-title { font:700 22px/1.2 system-ui; letter-spacing:.2px; }
    /* Make GOAL line bigger and bold */
    #study-body  { font:800 26px/1.25 system-ui; opacity:.98; margin-top:8px; }
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
    #study-timer {
      position: fixed; top: 14px; right: 14px; z-index: 10000;
      background: #0f172a; color: #e5e7eb; border: 1px solid #334155;
      border-radius: 10px; padding: 6px 10px; font: 600 13px system-ui;
      box-shadow: 0 6px 18px rgba(0,0,0,.35); display: none;
    }
/* Button-style goal badge under the intro line */
#goal-badge {
  display: none;
  background: #8C7B68;   /*  color */
  color: #ffffff;        /* white text */
  border: none;
  border-radius: 10px;
  padding: 8px 16px;
  font: 700 15px/1.2 system-ui;
  box-shadow: 0 3px 8px rgba(0,0,0,.25);
  cursor: default;
  margin-top: 10px;      /* space below the intro line */
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
// Put the badge right after ".game-intro"
function ensureGoalBadge(){
  let el = document.getElementById("goal-badge");
  if (el) return el;

  const btn = document.createElement("button");
  btn.id = "goal-badge";
  btn.type = "button";
  btn.disabled = true; // looks like a button, not clickable

  // Find the intro line container
  const intro = document.querySelector(".above-game .game-intro") ||
                document.querySelector(".game-intro");

  if (intro && intro.parentNode) {
    // insert AFTER the intro line
    intro.parentNode.insertBefore(btn, intro.nextSibling);
  } else {
    // fallback: put into heading
    const heading = document.querySelector(".above-game") ||
                    document.querySelector(".heading") ||
                    document.querySelector(".game-container");
    heading?.prepend(btn);
  }
  return btn;
}

function setGoalBadge(text){
  const el = ensureGoalBadge();
  if (text) {
    el.textContent = text;
    el.style.display = "inline-block";
  } else {
    el.style.display = "none";
  }
}

function clearGoalBadge(){
  const el = document.getElementById("goal-badge");
  if (el) el.style.display = "none";
}


  // ---------- Config loader (JSON first; YAML fallback) ----------
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

    // Fallback to YAML if JSON missing
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

  // ---------- Optional start grid ----------
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

  // ---------- NoStorage ----------
  function NoStorageManager() {}
  NoStorageManager.prototype.getBestScore = () => 0;
  NoStorageManager.prototype.setBestScore = _ => {};  
  NoStorageManager.prototype.getGameState = () => null;
  NoStorageManager.prototype.setGameState = _ => {};
  NoStorageManager.prototype.clearGameState = _ => {};

  // ---------- Inline questions ----------
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

    // Built-in fallback form
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
        const qWrap = document.createElement("div"); qWrap.className = "q";
        const lbl = document.createElement("label");
        lbl.textContent = q.text || `Question ${idx+1}`;
        qWrap.appendChild(lbl);

        if (q.type === "single" && Array.isArray(q.options)) {
          const opts = document.createElement("div"); opts.className = "opts";
          (q.options).forEach(opt => {
            const b = document.createElement("button");
            b.type = "button"; b.className = "optbtn"; b.textContent = opt;
            b.addEventListener("click", () => {
              opts.querySelectorAll(".optbtn").forEach(x => x.classList.remove("active"));
              b.classList.add("active");
              answers[q.id || `q${idx}`] = opt;
            });
            opts.appendChild(b);
          });
          qWrap.appendChild(opts);
        } else if (q.type === "scale" && Number.isFinite(q.min) && Number.isFinite(q.max)) {
          const wrap = document.createElement("div"); wrap.className = "rangewrap";
          const out = document.createElement("div"); out.style.minWidth="32px"; out.textContent = String(q.min);
          const rng = document.createElement("input");
          rng.type = "range";
          rng.min = q.min; rng.max = q.max; rng.step = 1; rng.value = q.min;
          rng.addEventListener("input", () => { out.textContent = rng.value; answers[q.id || `q${idx}`] = Number(rng.value); });
          answers[q.id || `q${idx}`] = q.min;
          wrap.appendChild(rng); wrap.appendChild(out);
          qWrap.appendChild(wrap);

          if (Array.isArray(q.labels)) {
            const lab = document.createElement("div");
            lab.style.font = "600 12px system-ui"; lab.style.opacity=".8";
            lab.style.marginTop = "4px";
            lab.textContent = q.labels.join(" | ");
            qWrap.appendChild(lab);
          }
        } else {
          const inp = document.createElement("input");
          inp.type = "text"; inp.style.width="100%";
          inp.addEventListener("input", () => { answers[q.id || `q${idx}`] = inp.value; });
          qWrap.appendChild(inp);
        }
        form.appendChild(qWrap);
      });

      const submit = document.createElement("button");
      submit.id = "study-submit"; submit.textContent = "Submit";
      submit.addEventListener("click", () => {
        Object.entries(answers).forEach(([itemId, response]) => {
          L.logTest(block.id, itemId, "post_question", response);
        });
        form.remove();
        hide();
        resolve();
      });
      form.appendChild(submit);
    });
  }

  // ---------- Awareness Yes/No ----------
  function askYesNoAwareness(block) {
    return new Promise((resolve) => {
      show("Quick question", "Did you notice any tile changing color?");
      let form = document.getElementById("study-form");
      if (!form) { form = document.createElement("div"); form.id = "study-form"; overlay.appendChild(form); }
      form.innerHTML = "";
      const wrap = document.createElement("div"); wrap.className = "opts";
      const makeBtn = (label) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "optbtn"; b.textContent = label;
        b.addEventListener("click", () => {
          L.logTest(block.id, "noticed_color_change", "oddball_awareness", label);
          form.remove(); hide(); resolve();
        });
        return b;
      };
      wrap.appendChild(makeBtn("Yes"));
      wrap.appendChild(makeBtn("No"));
      form.appendChild(wrap);
    });
  }

  // ================= REST =================
  async function runRestBlock(cfg, block){
    // Hide goal during rest
    clearGoalBadge();
    show("Rest", block.ui?.show_message || "Relax");
    await new Promise(r=>setTimeout(r,(block.stop?.value||10)*1000));
    hide();
  }

  let lastPlayBlockId = null;

  // ================= PLAY =================
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

      // Popup: title normal size, GOAL big
      show(block.description||block.id, goalLine);
      const ov=document.getElementById("study-overlay");
      if(ov) ov.style.pointerEvents="none";
      setTimeout(()=>{ hide(); if(ov) ov.style.pointerEvents=""; },3000);

      // Keep goal visible on screen after popup
      setGoalBadge(goalTile ? goalLine : "");

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

      if((block.stop?.kind==="time"&&block.stop?.value)||block.timer?.hard_cap_sec){
        const secs=Number(block.timer?.hard_cap_sec||block.stop?.value||0);
        cd=startCountdown(secs,()=>stop("time_done"));
      }

      const oldAct=gm.actuator.actuate.bind(gm.actuator);
      gm.actuator.actuate=(grid,meta)=>{
        oldAct(grid,meta);
        if(meta?.terminated){ stop(meta.over ? "game_over" : "won"); return; }
        if(Number.isFinite(goalTile)){
          let maxNow=0; grid.eachCell((x,y,c)=>{ if(c) maxNow=Math.max(maxNow,c.value); });
          if(maxNow>=goalTile && !gm.won){
            gm.won=true; show("You win!",`Reached ${goalTile}`);
            setTimeout(()=>stop("goal_reached"),600);
          }
        }
      };

      // ---- Attention / Oddball: two random flashes only during gameplay ----
      const enableMicro=(block.id==="oddball_mode");
      let microStarted=false, microCount=0;
      const MICRO_LIMIT=2;
      function fireFlashOnce(){
        if (!enableMicro || microCount >= MICRO_LIMIT || ended) return;
        const el=getRandomTileEl();
        if(el){ flashTileEl(el,700); }
        microCount += 1;
        if (microCount < MICRO_LIMIT) {
          const gap = 12000 + Math.floor(Math.random()*8000);
          microTimer = setTimeout(fireFlashOnce, gap);
        }
      }
      setTimeout(()=>{
        if(enableMicro && !microStarted && !ended){
          microStarted=true;
          fireFlashOnce();
        }
      },3000);

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
        // Keep goal badge visible until next block starts (or rest clears it)
        askPostQuestions(block).then(finalizeAndResolve);
      }
    });
  }

  // ================= TESTS =================
  async function runTestsBlock(cfg, block){
    L.setContext({ participant_id:"P001", mode_id:block.id });
    L.newSession(block.id);
    const TEST_SESSION_ID = (typeof L.getContext === "function" ? L.getContext().session_id : null);
    try {
      await Tests.runTests(block.tests||[], block.id, block.tests_options||null);
    } catch (e) {
      console.error("TestsUI.runTests error:", e);
    }
    if (lastPlayBlockId === "oddball_mode" || /oddball/i.test(block.id)) {
      await askYesNoAwareness(block);
    }

    // return filtered tests rows for export
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
    const { meta, blocks, sequence, output }=config;
    const map=Object.fromEntries(blocks.map(b=>[b.id,b]));
    for(let i=0;i<sequence.length;i++){
      const id=sequence[i],b=map[id]; if(!b) continue;
      const label=preBlockLabel(id,b.type);
      if(label){ show(label.title,label.body); await sleep(5000); hide(); }

      if(b.type==="rest"){
        await runRestBlock(config,b);
        continue;
      }

      if(b.type==="play"){
        const moveRows = await runPlayBlock(config,b);
        if (output?.autosave_csv_on_block_end){
          const csv  = L.toCSVMoves(moveRows);
          const name = buildName(output.filename_pattern, meta, id, "moves");
          L.download(name,csv);
        }
        continue;
      }

      if(b.type==="tests"){
        const testRows = await runTestsBlock(config,b);
        if (output?.autosave_csv_on_block_end){
          const csv  = L.toCSVTests(testRows);
          const name = buildName(output.tests_filename_pattern, meta, id, "tests");
          L.download(name,csv);
        }
        continue;
      }
    }
    // Clear goal at the very end
    clearGoalBadge();
    show("Study complete","Thank you!");
  }

  // ---------- Boot ----------
  try{
    const cfg=await loadConfigSmart();
    L.setContext({ participant_id:"P001" });
    await runStudy(cfg);
  }catch(e){
    console.error(e);
    clearGoalBadge();
    show("Config error","Could not load public/block.json or block.yaml");
  }
})();
