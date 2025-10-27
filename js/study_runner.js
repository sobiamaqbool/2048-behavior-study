// study_runner.js — v=2956
// Separate CSV per step (moves after play; tests after tests).
// Reliable move logging via inputManager.on("move").
// Oddball awareness Yes/No logs to tests CSV.
// Dual YAML path loader. Overlay + timer included.

console.log("study_runner loaded v=2956");

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
    #study-body  { font:500 14px/1.35 system-ui; opacity:.95; margin-top:6px; }
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
  `;
  document.head.appendChild(s);
});

(async function () {
  const L = window.StudyLogger;   // logger
  const Tests = window.TestsUI;   // tests UI

  // ---------- Overlay ----------
  const overlay = document.getElementById("study-overlay");
  const titleEl = document.getElementById("study-title");
  const bodyEl  = document.getElementById("study-body");
  const show = (t, s = "") => { titleEl.textContent = t; bodyEl.textContent = s; overlay.style.display = "grid"; };
  const hide = () => { overlay.style.display = "none"; };

  // ---------- YAML ----------
  async function loadConfigSmart() {
    if (!window.jsyaml) {
      await new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/dist/js-yaml.min.js";
        s.onload = res; s.onerror = rej; document.head.appendChild(s);
      });
    }
    const urls = ["public/block.yaml","/public/block.yaml","block.yaml","/block.yaml"];
    for (const u of urls) {
      try {
        const r = await fetch(u, { cache: "no-cache" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return window.jsyaml.load(await r.text());
      } catch (e) { console.warn("YAML load failed:", u, e.message); }
    }
    throw new Error("Could not find block.yaml");
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

    let maxVal = -Infinity, maxPos = null;
    for (let y = 0; y < spec.grid.length; y++){
      for (let x = 0; x < spec.grid[y].length; x++){
        const v = Number(spec.grid[y][x]) || 0;
        if (v > 0) {
          gm.grid.insertTile(new Tile({ x, y }, v));
          if (v > maxVal){ maxVal = v; maxPos = { x, y }; }
        }
      }
    }

    if (Array.isArray(spec.high_tile_randomize) && spec.high_tile_randomize.length && maxPos){
      const choices = spec.high_tile_randomize.map(Number).filter(n => n > 0);
      if (choices.length){
        const pick = choices[Math.floor(Math.random()*choices.length)];
        const t = gm.grid.cells[maxPos.x][maxPos.y];
        if (t) t.value = pick;
      }
    }

    gm.score = 0;
    gm.over = false; gm.won = false; gm.keepPlaying = false;
    gm.actuator.actuate(gm.grid, { score: gm.score, terminated: false });

    return true;
  }

  // ---------- Metrics (spare helpers if needed later) ----------
  function computeSmoothness(grid){
    let s=0, cells=grid.cells;
    for (let x=0;x<cells.length;x++) for (let y=0;y<cells[x].length;y++){
      const c=cells[x][y]; if (!c) continue;
      if (x+1<cells.length && cells[x+1][y]) s+=Math.abs(c.value-cells[x+1][y].value);
      if (y+1<cells[x].length && cells[x][y+1]) s+=Math.abs(c.value-cells[x][y+1].value);
    }
    return s;
  }
  function maxTileInfo(grid){
    let max=0,pos=""; grid.eachCell((x,y,c)=>{ if(c&&c.value>=max){max=c.value;pos=`${x},${y}`;} });
    return { max, pos };
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

    // Try TestsUI if capable; else built-in form.
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

    // Built-in overlay form
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
          rng.addEventListener("input", () => {
            out.textContent = rng.value;
            answers[q.id || `q${idx}`] = Number(rng.value);
          });
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

  // ---------- Awareness Yes/No (logs to tests CSV) ----------
  function askYesNoAwareness(block) {
    return new Promise((resolve) => {
      show("Quick question", "Did you notice any tile changing color?");
      let form = document.getElementById("study-form");
      if (!form) {
        form = document.createElement("div");
        form.id = "study-form";
        overlay.appendChild(form);
      }
      form.innerHTML = "";

      const wrap = document.createElement("div");
      wrap.className = "opts";

      const makeBtn = (label) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "optbtn";
        b.textContent = label;
        b.addEventListener("click", () => {
          L.logTest(block.id, "noticed_color_change", "oddball_awareness", label);
          form.remove();
          hide();
          resolve();
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
    show("Rest", block.ui?.show_message || "Relax");
    await new Promise(r=>setTimeout(r,(block.stop?.value||10)*1000));
    hide();
  }

  // Track last finished play block
  let lastPlayBlockId = null;

  // ================= PLAY =================
  async function runPlayBlock(cfg, block){
    return new Promise(resolve=>{
      const size = block.board_size || cfg?.global?.board_size || 4;
      wipeGameDOM(size);

      const msgNode = document.querySelector(".game-message");
      if (msgNode) {
        msgNode.classList.remove("game-won", "game-over");
        const p = msgNode.querySelector("p");
        if (p) p.textContent = "";
      }

      const gm = new GameManager(size, KeyboardInputManager, HTMLActuator, NoStorageManager);
      const freshActuator = gm.actuator;

      if (freshActuator?.messageContainer) {
        freshActuator.messageContainer.classList.remove("game-won", "game-over");
        const p = freshActuator.messageContainer.querySelector("p");
        if (p) p.textContent = "";
      }
      gm.over=false; gm.won=false; gm.keepPlaying=false;

      // Context for move logs
      L.setContext({ participant_id:"P001", mode_id:block.id });
      L.newSession(block.id);

      const goalTile=Number.isFinite(Number(block.goal_tile))?Number(block.goal_tile):null;
      const introMsg=goalTile?`Goal: reach ${goalTile}`:"Press arrow keys to play";
      show(block.description||block.id,introMsg);
      const ov=document.getElementById("study-overlay");
      if(ov) ov.style.pointerEvents="none";
      setTimeout(()=>{ hide(); if(ov) ov.style.pointerEvents=""; },5000);

      let ended=false, cd=null, microTimer=null;

      function finalizeAndResolve(){
        lastPlayBlockId = block.id;
        setTimeout(()=>resolve(L.moveRowsForExport().filter(r=>r.mode_id===block.id)),80);
      }
      function stop(reason){
        if (ended) return;
        ended = true;
        try { cd?.stop?.(); } catch(_){}
        try { clearTimeout(microTimer); } catch(_){}
        hide();
        askPostQuestions(block).then(finalizeAndResolve);
      }

      if((block.stop?.kind==="time"&&block.stop?.value)||block.timer?.hard_cap_sec){
        const secs=Number(block.timer?.hard_cap_sec||block.stop?.value||0);
        cd=startCountdown(secs,()=>stop("time_done"));
      }

      // --------- MOVE LOGGING (reliable) ---------
      let lastMoveAt=performance.now();
      let inputs_total=0;
      const dirName=d=>({0:"up",1:"right",2:"down",3:"left"})[d]??String(d);

      gm.inputManager.on("move", (dir) => {
        const now = performance.now();
        const latencyMs = Math.max(1, Math.round(now - lastMoveAt));
        lastMoveAt = now;
        inputs_total += 1;

        // Snapshot grid AFTER GameManager applied move
        const n = gm.size;
        const gridOut = Array.from({length:n}, (_, y) =>
          Array.from({length:n}, (_, x) => {
            const cell = gm.grid.cells[x][y];
            return cell ? cell.value : 0;
          })
        );

        L.logMove(inputs_total, dirName(dir), gm.score, latencyMs, gridOut);
      });
      // -------------------------------------------

      // Start grid / prefill
      if (!applyStartGrid(gm, block.start_state)) {
        prefillBoard(gm, block.start_state);
      }

      // Spawns (respect YAML)
      const spawnRates=block?.spawn?.rates;
      const origAdd=gm.addRandomTile.bind(gm);
      gm.addRandomTile=function(){
        if(!gm.grid.cellsAvailable()) return origAdd();
        const cell=gm.grid.randomAvailableCell();
        if(spawnRates){ gm.grid.insertTile(new Tile(cell,pickWeighted(spawnRates))); return; }
        origAdd();
      };

      const oldActuate=freshActuator.actuate.bind(freshActuator);
      freshActuator.actuate=(grid,meta)=>{
        oldActuate(grid,meta);
        const msgEl=document.querySelector(".game-message");
        if(msgEl&&!gm.over&&!gm.won) msgEl.classList.remove("game-over","game-won");

        if(meta?.terminated){
          stop(meta.over ? "game_over" : "won");
          return;
        }

        if(Number.isFinite(goalTile)){
          let maxNow=0; grid.eachCell((x,y,c)=>{ if(c) maxNow=Math.max(maxNow,c.value); });
          if(maxNow>=goalTile && !gm.won){
            gm.won=true;
            show("You win!",`Reached ${goalTile}`);
            setTimeout(()=>stop("goal_reached"),600);
          }
        }
      };

      // Oddball flashes (visual only)
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
    });
  }

  // ================= TESTS =================
  async function runTestsBlock(cfg, block){
    L.setContext({ participant_id:"P001", mode_id:block.id });
    L.newSession(block.id);
    try {
      const res = await Tests.runTests(block.tests||[], block.id, block.tests_options||null);

      const write = (id, val) => L.logTest(block.id, String(id), "test_item", val);

      if (res != null) {
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
      } else if (typeof Tests.getLastResults === "function") {
        const last = Tests.getLastResults();
        if (last && typeof last === "object") {
          Object.entries(last).forEach(([k, v]) => write(k, v));
        }
      }
    } catch (e) {
      console.error("TestsUI.runTests error:", e);
    }

    // Awareness question if previous was oddball
    if (lastPlayBlockId === "oddball_mode" || /oddball/i.test(block.id)) {
      await askYesNoAwareness(block);
    }
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
    // allow {study_id}, {block_id}, {kind}, {ts}
    const base=(pattern||"{study_id}__{block_id}__{kind}__{ts}.csv")
      .replace("{study_id}", meta?.study_id||"study")
      .replace("{block_id}", blockId)
      .replace("{kind}", kind)
      .replace("{ts}", tsPrecise());
    // If user pattern lacked {kind}, append before .csv to avoid collisions.
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
        await runPlayBlock(config,b);

        if (output?.autosave_csv_on_block_end){
          // Save only MOVES for this play block
          const rows = L.moveRowsForExport().filter(r => r.mode_id === id);
          const csv  = L.toCSVMoves(rows);
          const name = buildName(output.filename_pattern, meta, id, "moves");
          L.download(name, csv);
        }
        continue;
      }

      if(b.type==="tests"){
        await runTestsBlock(config,b);

        if (output?.autosave_csv_on_block_end){
          // Save only TESTS for this tests block
          const rows = L.testRowsForExport().filter(r => r.mode_id === id);
          const csv  = L.toCSVTests(rows);
          const name = buildName(output.tests_filename_pattern, meta, id, "tests");
          L.download(name, csv);
        }
        continue;
      }
    }
    show("Study complete","Thank you!");
  }

  // ---------- Boot ----------
  try{
    const cfg=await loadConfigSmart();
    L.setContext({ participant_id:"P001" });
    await runStudy(cfg);
  }catch(e){
    console.error(e);
    show("Config error","Could not load public/block.yaml");
  }
})();
