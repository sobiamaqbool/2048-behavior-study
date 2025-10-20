// study_runner.js — v=2913 (no localStorage; hard/oddball stable; tests TLX fix)
console.log("study_runner loaded v=2913");

// Keep default banner from blocking input
document.addEventListener("DOMContentLoaded", () => {
  const s = document.createElement("style");
  s.textContent = `
    .game-message { pointer-events: none !important; }
    .tile-inner.flash-brief {
      filter: brightness(1.25) contrast(1.05);
      box-shadow: 0 0 0 2px rgba(255,255,255,.6) inset;
      transition: filter .12s ease, box-shadow .12s ease;
    }
    #probe-modal { position: fixed; inset: 0; display: none; place-items: center;
      background: rgba(0,0,0,.35); z-index: 10050; }
    #probe-card { background: #0b1220; color: #e5e7eb; border: 1px solid #334155;
      border-radius: 12px; padding: 16px; width: min(92vw, 360px);
      box-shadow: 0 12px 30px rgba(0,0,0,.45); font: 600 14px system-ui; }
    #probe-card h3 { margin: 0 0 8px 0; font-size: 16px; }
    #probe-actions { display: flex; gap: 8px; margin-top: 12px; }
    .probe-btn { flex: 1; padding: 8px 10px; border-radius: 10px; border: 1px solid #475569;
      background: #111827; color: #e5e7eb; cursor: pointer; }
    .probe-btn:hover { filter: brightness(1.1); }
  `;
  document.head.appendChild(s);
});

(async function () {
  const L = window.StudyLogger;
  const Tests = window.TestsUI;

  // ------- Overlay -------
  const overlay = document.getElementById("study-overlay");
  const title   = document.getElementById("study-title");
  const body    = document.getElementById("study-body");
  const show = (t, s = "") => { title.textContent = t; body.textContent = s; overlay.style.display = "grid"; };
  const hide = () => { overlay.style.display = "none"; };

  // ------- YAML -------
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
      } catch (e) { console.warn("YAML load failed:", e.message); }
    }
    throw new Error("Could not find block.yaml");
  }

  // ------- Ephemeral storage (prevents mid-block restores) -------
  function NoStorageManager() {}
  NoStorageManager.prototype.getBestScore = function(){ return 0; };
  NoStorageManager.prototype.setBestScore = function(_s){};
  NoStorageManager.prototype.getGameState = function(){ return null; };
  NoStorageManager.prototype.setGameState = function(_s){};
  NoStorageManager.prototype.clearGameState = function(){};

  // ------- Engine helpers -------
  function newGameInstance(size) {
    // eslint-disable-next-line no-undef
    return new GameManager(size || 4, KeyboardInputManager, HTMLActuator, NoStorageManager);
  }
  function hardReset(gm) {
    gm.over = false; gm.won = false; gm.keepPlaying = false;
    if (gm.actuator?.continueGame) gm.actuator.continueGame();
    const msg = document.querySelector(".game-message");
    if (msg) msg.classList.remove("game-won","game-over");
  }
  function applyStartState(gm, ss) {
    gm.restart(); hardReset(gm);
    if (ss?.classic) return;
  }

  // ------- Weighted & prefill -------
  function pickWeighted(obj) {
    const entries = Object.entries(obj).map(([k,v]) => [Number(k), Number(v)]);
    const sum = entries.reduce((a,[,w]) => a + w, 0) || 1;
    let r = Math.random() * sum;
    for (const [val, w] of entries) { if ((r -= w) <= 0) return Math.floor(val); }
    return Math.floor(entries[0]?.[0] ?? 2);
  }
  function prefillBoard(gm, spec) {
    if (!spec?.prefill) return;
    const ratio = Math.max(0, Math.min(1, Number(spec.prefill.fill_ratio ?? 0)));
    const total = gm.size * gm.size;
    let need = Math.round(total * ratio);
    const weights = spec.prefill.values || {"2":1,"4":1};
    while (need-- > 0 && gm.grid.availableCells().length) {
      const cell = gm.grid.randomAvailableCell();
      gm.grid.insertTile(new Tile(cell, pickWeighted(weights)));
    }
  }

  // ------- Metrics -------
  function computeSmoothness(grid) {
    let s = 0, cells = grid.cells;
    for (let x=0; x<cells.length; x++) for (let y=0; y<cells[x].length; y++) {
      const c = cells[x][y]; if (!c) continue;
      if (x+1<cells.length && cells[x+1][y]) s += Math.abs(c.value - cells[x+1][y].value);
      if (y+1<cells[x].length && cells[x][y+1]) s += Math.abs(c.value - cells[x][y+1].value);
    }
    return s;
  }
  function maxTileInfo(grid) {
    let max=0, pos=""; grid.eachCell((x,y,c)=>{ if (c && c.value>=max){ max=c.value; pos=`${x},${y}`; } });
    return { max, pos };
  }
  function maxFromSerializedCells(cells) {
    let mx = 0;
    for (let x=0; x<cells.length; x++) for (let y=0; y<cells[x].length; y++) {
      const c = cells[x][y]; if (c && c.value > mx) mx = c.value;
    }
    return mx;
  }

  // ------- Countdown UI -------
  function getTimerEl() {
    let el = document.getElementById("study-timer");
    if (el) return el;
    el = document.createElement("div");
    el.id = "study-timer";
    Object.assign(el.style, {
      position: "fixed", top: "14px", right: "14px", zIndex: 10000,
      background: "#0f172a", color: "#e5e7eb", border: "1px solid #334155",
      borderRadius: "10px", padding: "6px 10px", font: "600 13px system-ui",
      boxShadow: "0 6px 18px rgba(0,0,0,.35)", display: "none",
    });
    document.body.appendChild(el);
    return el;
  }
  function startCountdown(seconds, onEnd) {
    if (!seconds) return { stop(){}, running:false };
    if (window.__COUNTDOWN_STOP__) { try { window.__COUNTDOWN_STOP__(); } catch(_){} }
    const el = getTimerEl();
    const fmt = s => { const m=Math.floor(s/60), ss=String(Math.max(0,s%60)).padStart(2,"0"); return `${m}:${ss}`; };
    let t = seconds;
    el.textContent = `Time: ${fmt(t)}`; el.style.display = "block";
    const id = setInterval(() => {
      t -= 1; el.textContent = `Time: ${fmt(t)}`;
      if (t <= 0) { clearInterval(id); el.style.display = "none"; onEnd?.(); }
    }, 1000);
    const stop = () => { clearInterval(id); el.style.display = "none"; };
    window.__COUNTDOWN_STOP__ = stop;
    return { stop, running: true };
  }

  // ------- Feedback popup -------
  function getFeedbackEl() {
    let el = document.getElementById("study-feedback");
    if (el) return el;
    el = document.createElement("div");
    el.id = "study-feedback";
    Object.assign(el.style, {
      position:"fixed", left:"50%", bottom:"80px", transform:"translateX(-50%)",
      zIndex:10001, padding:"8px 14px", borderRadius:"12px",
      background:"rgba(0,0,0,.75)", color:"#fff", font:"600 14px system-ui",
      boxShadow:"0 6px 18px rgba(0,0,0,.35)", opacity:"0", pointerEvents:"none",
      transition:"opacity .18s ease",
    });
    document.body.appendChild(el); return el;
  }
  let __feedbackCooldownUntil = 0;
  function showFeedback(text) {
    const now = Date.now(); if (now < __feedbackCooldownUntil) return;
    __feedbackCooldownUntil = now + 800;
    const el = getFeedbackEl(); el.textContent = text; el.style.opacity = "1";
    clearTimeout(el.__hideTimer); el.__hideTimer = setTimeout(()=>{ el.style.opacity="0"; },700);
  }

  // ------- TLX result sanitizer for tests -------
  function stripTLXResults(res, omit = []) {
    const out = JSON.parse(JSON.stringify(res || {}));
    const tlx = out.TLX || out.tlx; if (!tlx) return out;
    const paths = [["items"],["dimensions"],["scores"],["raw"],["detail"]];
    for (const p of paths) {
      let node = tlx; for (let i=0;i<p.length;i++) node = node?.[p[i]];
      if (node && typeof node === "object" && omit.includes("temporal_demand")) delete node["temporal_demand"];
    }
    return out;
  }

  // ------- Micro-change helpers (oddball) -------
  function getRandomTileEl() {
    const inners = Array.from(document.querySelectorAll(".tile .tile-inner"));
    if (!inners.length) return null;
    return inners[Math.floor(Math.random() * inners.length)];
  }
  function flashTileEl(el, ms=300) {
    if (!el) return;
    el.classList.add("flash-brief");
    setTimeout(() => el.classList.remove("flash-brief"), ms);
  }
  function ensureProbeUI() {
    let wrap = document.getElementById("probe-modal");
    if (wrap) return wrap;
    wrap = document.createElement("div");
    wrap.id = "probe-modal";
    wrap.innerHTML = `
      <div id="probe-card">
        <h3 id="probe-q">Did you notice any color change?</h3>
        <div id="probe-actions">
          <button class="probe-btn" data-a="yes">Yes</button>
          <button class="probe-btn" data-a="no">No</button>
          <button class="probe-btn" data-a="unsure">Unsure</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    return wrap;
  }
  function askProbe(question = "Did you notice any color change?") {
    return new Promise((resolve) => {
      const wrap = ensureProbeUI();
      wrap.style.display = "grid";
      const q = wrap.querySelector("#probe-q");
      if (q) q.textContent = question;
      wrap.querySelectorAll(".probe-btn").forEach(btn => {
        btn.onclick = () => { wrap.style.display = "none"; resolve(btn.dataset.a); };
      });
    });
  }

  // ================= PLAY BLOCK =================
  async function runPlayBlock(cfg, block) {
    return new Promise(resolve => {
      const size = block.board_size || cfg?.global?.board_size || 4;

      const toNum = v => (v === null || v === undefined) ? null : Number(v);
      const goalTileRaw =
        (block?.rules && block.rules.goal != null) ? block.rules.goal :
        (block?.win && block.win.tile != null)     ? block.win.tile :
        (block?.goal_tile != null)                 ? block.goal_tile : null;
      const goalTile = Number.isFinite(toNum(goalTileRaw)) ? Number(goalTileRaw) : null;

      const gm = newGameInstance(size);
      applyStartState(gm, block.start_state || { classic:true });

      // prefill / spawns (hard, oddball)
      prefillBoard(gm, block.start_state);
      const oddCfg = block?.rules?.oddball;
      const spawnRates = block?.spawn?.rates;
      const origAdd = gm.addRandomTile.bind(gm);
      let spawnCount = 0, lastOddballAt = null;

      gm.addRandomTile = function () {
        if (!gm.grid.cellsAvailable()) return origAdd();
        const cell = gm.grid.randomAvailableCell();

        if (oddCfg?.enabled && Number.isFinite(oddCfg.force_every) && oddCfg.force_every > 0) {
          spawnCount += 1;
          if (spawnCount % oddCfg.force_every === 0) {
            const oddVal = Number(oddCfg.value ?? 3);
            gm.grid.insertTile(new Tile(cell, oddVal));
            lastOddballAt = Date.now();
            L.log("event","oddball_spawn", oddVal, { block_id:block.id, ts: lastOddballAt });
            return;
          }
        }
        if (spawnRates) {
          const value = pickWeighted(spawnRates);
          gm.grid.insertTile(new Tile(cell, value));
          if (oddCfg?.enabled && value === Number(oddCfg.value ?? 3)) {
            lastOddballAt = Date.now();
            L.log("event","oddball_spawn", value, { block_id:block.id, ts: lastOddballAt });
          }
          return;
        }
        origAdd();
      };

      // Last committed grid + prev max
      let prevCells = gm.grid.serialize().cells;
      let prevMaxVal = maxFromSerializedCells(prevCells);

      // Context + start log
      L.setContext({ participant_id:"P001", block_id:block.id, block_type:"play", grid_size:size });
      const BASE = { block_id:block.id, block_type:"play" };
      L.log("block","start","",{ ...BASE, grid_size:size, ts: Date.now() });

      // Intro
      const introMsg = goalTile ? `Goal: reach ${goalTile}` : "Press arrow keys to play";
      show(block.description || block.id, introMsg);
      const ov = document.getElementById("study-overlay"); if (ov) ov.style.pointerEvents = "none";
      setTimeout(()=>{ hide(); if (ov) ov.style.pointerEvents = ""; }, 5000);

      // Timer (per block)
      let cd = null;
      const showClock = (block.stop?.kind === "time" && block.stop?.value) || block.timer?.hard_cap_sec;
      if (showClock) {
        const secs = Number(block.timer?.hard_cap_sec || block.stop?.value || 0);
        cd = startCountdown(secs, () => stop("time_done"));
      }

      // ===== Oddball-only: visual micro-changes =====
      let microTimer = null, microStarted = false;
      function scheduleNextFlash() {
        const jitter = 20000 + Math.floor(Math.random() * 10000); // 20–30s
        microTimer = setTimeout(() => {
          const el = getRandomTileEl();
          if (!el) { microTimer = setTimeout(scheduleNextFlash, 1000); return; }
          flashTileEl(el, 300);
          L.log("event","micro_flash","", { block_id:block.id, ts: Date.now() });
          scheduleNextFlash();
        }, jitter);
      }
      const enableMicro = block.id === "oddball_mode";

      // trackers
      let moveCount = 0, lastMoveAt = performance.now(), latencyMs = 0, mergeCount = 0, smoothness = 0;
      const dirName = d => ({0:"up",1:"right",2:"down",3:"left"})[d] ?? String(d);
      let pendingDir = null, goalFired = false, ended = false;

      // actuator wrap
      const oldActuate = gm.actuator.actuate.bind(gm.actuator);
      gm.actuator.actuate = (grid, meta) => {
        let m = 0; grid.eachCell((x,y,c)=>{ if (c && c.mergedFrom) m++; });
        mergeCount = m; smoothness = computeSmoothness(grid);
        const maxBefore = prevMaxVal;

        oldActuate(grid, meta);

        // start flash scheduler after first render
        if (enableMicro && !microStarted) {
          microStarted = true;
          setTimeout(() => {
            const el = getRandomTileEl();
            if (el) {
              flashTileEl(el, 300);
              L.log("event","micro_flash_first","", { block_id:block.id, ts: Date.now() });
            }
            scheduleNextFlash();
          }, 1200);
        }

        const msgEl = document.querySelector(".game-message");
        if (msgEl && !gm.over && !gm.won) msgEl.classList.remove("game-over","game-won");

        if (mergeCount > 0 && Array.isArray(block?.ui?.feedback) && block.ui.feedback.length) {
          const msg = block.ui.feedback[Math.floor(Math.random() * block.ui.feedback.length)];
          showFeedback(msg);
        }

        // rare move subtle cue (oddball only)
        if (enableMicro && Math.random() < 0.08) {
          const cueEl = getRandomTileEl(); flashTileEl(cueEl, 300);
          L.log("event","move_cue","", { block_id:block.id, ts: Date.now() });
        }

        if (pendingDir !== null) {
          moveCount += 1;
          const nowCells = grid.serialize().cells;
          const changed  = JSON.stringify(nowCells) !== JSON.stringify(prevCells);
          const no_op    = changed ? 0 : 1;

          const empty = gm.grid.availableCells().length;
          const score = gm.score || 0;
          const { max, pos } = maxTileInfo(gm.grid);
          const tight = empty <= 2 ? 1 : 0;

          let reacted_to_oddball = 0, odd_reaction_ms = null;
          if (lastOddballAt && Date.now() - lastOddballAt < 5000) {
            reacted_to_oddball = 1; odd_reaction_ms = Date.now() - lastOddballAt; lastOddballAt = null;
          }

          L.log("move","dir", dirName(pendingDir), {
            ...BASE,
            grid_size: gm.size,
            score, moves: moveCount,
            empty_cells: empty, merge_count: mergeCount,
            latency_raw_ms: latencyMs, smoothness, no_op,
            direction: dirName(pendingDir),
            max_tile_value: max, max_tile_position: pos, tight_board: tight,
            reacted_to_oddball, odd_reaction_ms,
            ts: Date.now()
          });

          prevCells = nowCells; prevMaxVal = max; pendingDir = null;
        }

        if (!ended && meta?.terminated) return stop(meta.over ? "game_over" : "won");

        if (!ended && !goalFired && Number.isFinite(goalTile)) {
          let maxNow = 0; grid.eachCell((x,y,c)=>{ if (c) maxNow = Math.max(maxNow, c.value); });
          if (maxBefore < goalTile && maxNow >= goalTile) {
            goalFired = true; show("You win!", `Reached ${goalTile}`);
            return setTimeout(()=> stop("goal_reached"), 600);
          }
        }
      };

      // input per game instance
      if (!gm.inputManager.__runnerHooked) {
        gm.inputManager.__runnerHooked = true;
        gm.inputManager.on("move", (dir) => {
          const now = performance.now();
          latencyMs = Math.max(1, Math.round(now - lastMoveAt));
          lastMoveAt = now;
          pendingDir = dir;
        });
      }

      // stop
      const stop = async (reason) => {
        if (ended) return; ended = true;
        hide(); try { cd?.stop(); } catch(_) {}
        if (microTimer) { clearTimeout(microTimer); microTimer = null; }

        if (enableMicro) {
          try {
            const ans = await askProbe("Did you notice any color change?");
            L.log("event","post_oddball_probe", ans, { block_id:block.id, ts: Date.now() });
          } catch (_) {}
        }

        const { max, pos } = maxTileInfo(gm.grid);
        const empty = gm.grid.availableCells().length, tight = empty <= 2 ? 1 : 0;
        L.log("stop","reason",reason,{
          ...BASE, grid_size: gm.size, score: gm.score, moves: moveCount,
          empty_cells: empty, merge_count: mergeCount, latency_raw_ms: latencyMs,
          smoothness, no_op: 0, direction: "", max_tile_value: max, max_tile_position: pos,
          tight_board: tight, ts: Date.now()
        });
        setTimeout(() => resolve(L.rowsForExport().filter(r => r.block_id === block.id)), 80);
      };
    });
  }

  // ================= REST BLOCK =================
  async function runRestBlock(cfg, block) {
    show("Rest", block.ui?.show_message || "Relax");
    await new Promise(r => setTimeout(r, (block.stop?.value || 10) * 1000));
    hide();
  }

  // ================= TESTS BLOCK =================
  async function runTestsBlock(cfg, block) {
    L.setContext({ participant_id:"P001", block_id:block.id, block_type:"tests", grid_size: cfg?.global?.board_size || 4 });

    const tlxOpts =
      (block.tests_options && (block.tests_options.TLX || block.tests_options.tlx)) || null;
    const omitDims = Array.isArray(tlxOpts?.omit_dimensions) ? tlxOpts.omit_dimensions : [];

    L.log("block","start","", { block_id:block.id, block_type:"tests", tests:block.tests, tlx_omit: omitDims, ts: Date.now() });

    hide(); // ensure forms are visible, not covered

    let res = null;
    try {
      res = await Tests.runTests(block.tests || [], block.id, block.tests_options || null);
    } catch (e) {
      console.error("TestsUI.runTests error:", e);
      res = { error: String(e) };
    }

    const cleaned = stripTLXResults(res, omitDims);
    const summary = {
      TLX: cleaned?.TLX?.summary ?? cleaned?.tlx?.summary ?? null,
      SAM: cleaned?.SAM?.summary ?? cleaned?.sam?.summary ?? null,
      Stroop: cleaned?.Stroop?.summary ?? cleaned?.stroop?.summary ?? null,
      error: cleaned?.error ?? null,
    };

    L.log("block","stop","", { block_id:block.id, block_type:"tests", summary, ts: Date.now() });
  }

  // ================= RUNNER =================
  const ts = () => { const d=new Date(), p=n=>String(n).padStart(2,"0"); return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
  async function runStudy(config) {
    const { blocks, sequence, output } = config;
    const map = Object.fromEntries(blocks.map(b => [b.id, b]));
    for (const id of sequence) {
      const b = map[id]; if (!b) continue;
      if (b.type === "rest")  await runRestBlock(config, b);
      if (b.type === "play")  await runPlayBlock(config, b);
      if (b.type === "tests") await runTestsBlock(config, b);

      if (b.type !== "rest" && output?.autosave_csv_on_block_end) {
        const csv = L.toCSV(L.rowsForExport().filter(r => r.block_id === id));
        const fname = (output.filename_pattern || "{study_id}__{block_id}__{ts}.csv")
          .replace("{study_id}", config?.meta?.study_id || "study")
          .replace("{block_id}", id)
          .replace("{ts}", ts());
        L.download(fname, csv);
      }

      show("Next block", "Starting in 5 seconds…");
      await new Promise(r => setTimeout(r, 5000));
      hide();
    }
    show("Study complete", "Thank you!");
  }

  // ------- Boot -------
  try {
    const cfg = await loadConfigSmart();
    L.setContext({ participant_id:"P001" });
    await runStudy(cfg);
  } catch (e) {
    console.error(e);
    show("Config error", "Could not load public/block.yaml");
  }
})();
