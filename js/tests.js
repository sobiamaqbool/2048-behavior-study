// TestsUI v3.9 — TLX (0–9) + Feelings + Stroop(TEXT-only options)
// Change: Stroop options show ONLY color names (no color squares).

window.TestsUI = (() => {
  const L = window.StudyLogger;
  console.log("TestsUI v3.9 loaded");

  // ---------- Global state ----------
  let IN_TESTS = false;
  let lastUntrap = null;
  let hostCreatedAt = 0;

  // ---------- Key trap (only while overlay exists) ----------
  function trapKeys() {
    if (lastUntrap) { try { lastUntrap(); } catch(_) {} lastUntrap = null; }
    function eat(e) {
      if (document.getElementById("tests-host")) {
        e.stopPropagation(); e.preventDefault();
      }
    }
    document.addEventListener("keydown", eat, true);
    document.addEventListener("keyup", eat, true);
    const untrap = () => {
      document.removeEventListener("keydown", eat, true);
      document.removeEventListener("keyup", eat, true);
    };
    window.__tests_untrap = untrap;
    lastUntrap = untrap;
    return untrap;
  }

  // ---------- Overlay host ----------
  function ensureHost() {
    let el = document.getElementById("tests-host");
    if (el) return el;
    el = document.createElement("div");
    el.id = "tests-host";
    Object.assign(el.style, {
      position: "fixed", inset: 0, display: "grid", placeItems: "center",
      background: "rgba(0,0,0,.55)", zIndex: 10000
    });
    el.tabIndex = -1;
    document.body.appendChild(el);

    // Emergency top-right bar
    const bar = document.createElement("div");
    Object.assign(bar.style, { position: "absolute", top: 10, right: 10, display: "flex", gap: "8px" });
    const exit = document.createElement("button");
    exit.textContent = "Exit tests";
    Object.assign(exit.style, {
      background: "#ef4444", color: "#fff", border: 0, borderRadius: "8px",
      padding: "6px 10px", fontWeight: 700, cursor: "pointer", boxShadow: "0 2px 10px rgba(0,0,0,.25)"
    });
    exit.onclick = emergencyExit;
    bar.appendChild(exit);
    el.appendChild(bar);

    el.focus();
    hostCreatedAt = Date.now();
    return el;
  }
  function clearHost() {
    const el = document.getElementById("tests-host");
    if (el) el.remove();
  }

  // ---------- Failsafes ----------
  function emergencyExit() {
    try { clearHost(); } catch(_) {}
    try { lastUntrap?.(); } catch(_) {}
    try { window.__tests_untrap?.(); } catch(_) {}
    IN_TESTS = false;
    console.warn("TestsUI: Emergency exit executed");
  }
  window.TestsUIEmergencyClear = emergencyExit;

  // ESC to exit tests
  window.addEventListener("keydown", (e) => {
    if (!IN_TESTS) return;
    if (e.key === "Escape") {
      e.preventDefault();
      emergencyExit();
    }
  }, true);

  // Watchdog
  setInterval(() => {
    const host = document.getElementById("tests-host");
    const stale = host && !IN_TESTS && Date.now() - hostCreatedAt > 3000;
    if (stale) {
      console.warn("TestsUI watchdog: clearing stale overlay & untrapping keys");
      emergencyExit();
    }
  }, 1000);

  // ---------- Final wordings ----------
  const QUESTION_TEXT = {
    time_pressure:   "How hurried or rushed were you feeling while playing?",
    thinking_effort: "How much mental effort did you need to play well?",
    success_feeling: "How successful were you in accomplishing what you aimed to do in the game?",
    frustration:     "How irritated, stressed, or annoyed did you feel?",
    mental_demand:   "How mentally demanding or complex was the game?",
    physical_demand: "How physically demanding was the task?"
  };

  // ---------- TLX items ----------
  const BASE_ITEMS = [
    { id: "time_pressure",   label: QUESTION_TEXT.time_pressure },
    { id: "thinking_effort", label: QUESTION_TEXT.thinking_effort },
    { id: "success_feeling", label: QUESTION_TEXT.success_feeling },
    { id: "frustration",     label: QUESTION_TEXT.frustration },
    { id: "mental_demand",   label: QUESTION_TEXT.mental_demand },
    { id: "physical_demand", label: QUESTION_TEXT.physical_demand },
  ];
  function itemsForBlock(blockId) {
    return BASE_ITEMS.map(q => ({ ...q, label: QUESTION_TEXT[q.id] || q.label }));
  }

  // ---------- TLX UI (0–9) ----------
  function tlxCard(title, items, onSubmit) {
    const host = ensureHost();
    host.innerHTML = "";

    const card = document.createElement("div");
    Object.assign(card.style, {
      width: "min(760px,92vw)", maxHeight: "92vh", overflow: "auto",
      background: "#0f172a", color: "#e5e7eb",
      border: "1px solid #334155", borderRadius: "14px", padding: "18px",
      font: "14px system-ui", boxShadow: "0 16px 40px rgba(0,0,0,.45)",
      display: "grid", gridTemplateRows: "auto auto 1fr auto", gap: "10px"
    });

    const h = document.createElement("div");
    h.textContent = title;
    Object.assign(h.style, { fontWeight: 700, fontSize: "18px" });
    card.appendChild(h);

    const info = document.createElement("div");
    info.textContent = "Rate each from 0 (very low) to 9 (very high).";
    Object.assign(info.style, { opacity: .9 });
    card.appendChild(info);

    const form = document.createElement("div");
    Object.assign(form.style, { display: "grid", gap: "14px" });

    const answers = {};
    const total = items.length;

    for (const q of items) {
      const row = document.createElement("div");
      Object.assign(row.style, { display: "grid", gap: "8px" });

      const label = document.createElement("div");
      label.textContent = q.label;
      Object.assign(label.style, { fontWeight: 600, lineHeight: "1.35" });

      const btns = document.createElement("div");
      Object.assign(btns.style, { display: "flex", gap: "6px", flexWrap: "wrap" });

      for (let n = 0; n <= 9; n++) {
        const b = document.createElement("button");
        b.type = "button"; b.textContent = String(n);
        Object.assign(b.style, {
          background: "#111827", color: "#e5e7eb", border: "1px solid #374151",
          borderRadius: "8px", padding: "6px 8px", cursor: "pointer", minWidth: "34px"
        });
        b.addEventListener("click", () => {
          answers[q.id] = n;
          [...btns.children].forEach(x => x.style.background = "#111827");
          b.style.background = "#1f2937";
          progress.textContent = `Answered ${Object.keys(answers).length} / ${total}`;
          submit.disabled = Object.keys(answers).length !== total;
          submit.style.opacity = submit.disabled ? ".6" : "1";
        });
        btns.appendChild(b);
      }

      row.appendChild(label);
      row.appendChild(btns);
      form.appendChild(row);
    }

    card.appendChild(form);

    const actions = document.createElement("div");
    Object.assign(actions.style, {
      position: "sticky", bottom: 0, background: "#0f172a",
      paddingTop: "8px", display: "flex", justifyContent: "space-between", alignItems: "center",
      borderTop: "1px solid #334155"
    });

    const progress = document.createElement("div");
    progress.textContent = `Answered 0 / ${total}`;
    Object.assign(progress.style, { opacity: .9 });

    const submit = document.createElement("button");
    submit.textContent = "Continue";
    Object.assign(submit.style, {
      background: "#2563eb", color: "#fff", border: 0, borderRadius: "10px",
      padding: "8px 14px", fontWeight: 700, cursor: "pointer", opacity: ".6"
    });
    submit.disabled = true;

    submit.onclick = () => {
      if (Object.keys(answers).length !== total) return;
      onSubmit(answers);
      clearHost();
    };

    actions.appendChild(progress);
    actions.appendChild(submit);
    card.appendChild(actions);
    host.appendChild(card);
    host.focus();
  }

  async function runTLX(blockId) {
    const items = itemsForBlock(blockId);
    return new Promise(resolve => {
      tlxCard("Workload Ratings", items, (answers) => {
        try {
          for (const q of items) {
            L.log("test", q.id, answers[q.id], {
              grid_size:"", score:"", moves:"", empty_cells:"",
              merge_count:"", latency_raw_ms:"", smoothness:"",
              no_op:"", direction:"", max_tile_value:"",
              max_tile_position:"", tight_board:""
            });
          }
        } finally { resolve(); }
      });
    });
  }

  // ---------- Feelings ----------
  async function runSAM(blockId) {
    return new Promise(resolve => {
      const host = ensureHost();
      host.innerHTML = "";

      const card = document.createElement("div");
      Object.assign(card.style, {
        width: "min(560px,92vw)", background: "#0f172a", color: "#e5e7eb",
        border: "1px solid #334155", borderRadius: "14px", padding: "18px",
        font: "14px system-ui", boxShadow: "0 16px 40px rgba(0,0,0,.45)",
        textAlign: "center"
      });
      card.innerHTML = `<div style="font-weight:700;font-size:18px;margin-bottom:10px">Feelings during play</div>
        <div style="opacity:.9">Use 1–9 for each question.</div>
        <div id="sam-q" style="margin-top:12px;text-align:left"></div>`;
      host.appendChild(card);

      const div = card.querySelector("#sam-q");
      const ratings = {};

      div.appendChild(makeNinePointQuestion(
        "overall_feeling",
        "How did you feel overall while playing? (Bad → Good)",
        ratings
      ));

      div.appendChild(makeNinePointQuestion(
        "alertness",
        "How alert did you feel while playing? (Sleepy → Alert)",
        ratings
      ));

      const btn = document.createElement("button");
      btn.textContent = "Continue";
      Object.assign(btn.style, {
        marginTop:"14px", padding:"8px 14px", border:"0", borderRadius:"8px",
        background:"#2563eb", color:"#fff", fontWeight:700, cursor:"pointer"
      });
      btn.onclick = () => {
        if (!ratings.overall_feeling || !ratings.alertness) return;
        try {
          L.log("test","SAM_valence",ratings.overall_feeling,{});
          L.log("test","SAM_arousal",ratings.alertness,{});
        } finally {
          clearHost();
          resolve();
        }
      };
      card.appendChild(btn);
    });

    function makeNinePointQuestion(key, title, ratingsObj) {
      const wrap = document.createElement("div");
      wrap.innerHTML = `<div style="margin-top:10px;font-weight:600">${title}</div>`;
      const row = document.createElement("div");
      Object.assign(row.style, { marginTop:"6px" });

      for (let n=1; n<=9; n++) {
        const b = document.createElement("button");
        b.textContent = n;
        Object.assign(b.style, {
          margin:"4px",padding:"6px 8px",border:"1px solid #475569",
          borderRadius:"6px",background:"#1e293b",color:"#fff",cursor:"pointer"
        });
        b.onclick = () => {
          ratingsObj[key]=n;
          [...row.querySelectorAll("button")].forEach(x=>x.style.background="#1e293b");
          b.style.background="#334155";
        };
        row.appendChild(b);
      }
      wrap.appendChild(row);
      return wrap;
    }
  }

  // ---------- Stroop (text-only options; 10 congruent + 10 incongruent) ----------
  async function runStroop(blockId) {
    return new Promise(resolver => {
      const host = ensureHost();
      host.innerHTML = "";

      const card = document.createElement("div");
      Object.assign(card.style, {
        width: "min(720px,92vw)", background: "#0f172a", color: "#e5e7eb",
        border: "1px solid #334155", borderRadius: "14px", padding: "18px",
        font: "14px system-ui", boxShadow: "0 16px 40px rgba(0,0,0,.45)"
      });
      card.innerHTML = `
        <div style="font-weight:700;font-size:18px;margin-bottom:4px">Color-Word Task</div>
        <div style="opacity:.9;margin-bottom:10px">
          Click the option that matches the <b>color</b> of the word.
        </div>
        <div id="stroop-word" style="font-size:36px;margin:16px 0;font-weight:800;text-align:center;"></div>
        <div id="stroop-options" style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:8px"></div>
        <div id="stroop-progress" style="opacity:.85"></div>`;
      host.appendChild(card);

      const colors = ["red","green","blue","yellow"];
      const words  = ["RED","GREEN","BLUE","YELLOW"];

      // 10 congruent + 10 incongruent
      const trials = [];
      for (let i=0;i<10;i++) {
        const idx = Math.floor(Math.random()*4);
        trials.push({ congruent:true, word:words[idx], color:colors[idx] });
      }
      for (let i=0;i<10;i++) {
        const wordIdx = Math.floor(Math.random()*4);
        let colorIdx = Math.floor(Math.random()*4);
        while (colorIdx === wordIdx) colorIdx = Math.floor(Math.random()*4);
        trials.push({ congruent:false, word:words[wordIdx], color:colors[colorIdx] });
      }

      let trial = 0, correct = 0;
      let congCorrect=0, incongCorrect=0;
      const rts = [], congRT=[], incongRT=[];

      const wordEl  = card.querySelector("#stroop-word");
      const optsEl  = card.querySelector("#stroop-options");
      const progEl  = card.querySelector("#stroop-progress");

      function renderOptions(onChoose) {
        optsEl.innerHTML = "";
        for (const c of colors) {
          const btn = document.createElement("button");
          btn.type = "button";
          // TEXT ONLY label (no color square)
          btn.textContent = c.toUpperCase();
          Object.assign(btn.style, {
            padding:"10px", border:"1px solid #475569", borderRadius:"10px",
            background:"#1e293b", color:"#fff", cursor:"pointer", fontWeight:700
          });
          btn.onclick = () => onChoose(c);
          optsEl.appendChild(btn);
        }
      }

      let t0 = 0;
      function showTrial() {
        const t = trials[trial];
        wordEl.textContent = t.word;
        wordEl.style.color = t.color;
        progEl.textContent = `Trial ${trial+1} / 20`;

        t0 = performance.now();
        renderOptions((choiceColor) => {
          const rt = performance.now() - t0;
          const isCorrect = choiceColor === t.color;
          correct += isCorrect ? 1 : 0;
          if (t.congruent) {
            congCorrect += isCorrect ? 1 : 0;
            congRT.push(rt);
          } else {
            incongCorrect += isCorrect ? 1 : 0;
            incongRT.push(rt);
          }
          rts.push(rt);

          L.log("test","Stroop_trial", isCorrect ? 1 : 0, {
            block: blockId, trial: trial+1, congruent: t.congruent ? 1 : 0,
            word: t.word, color: t.color, chosen: choiceColor,
            rt_ms: Math.round(rt)
          });

          trial++;
          if (trial >= 20) {
            const mean = arr => arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : 0;
            L.log("test","Stroop_summary", correct, {
              total: 20,
              cong_correct: congCorrect, incong_correct: incongCorrect,
              cong_mean_rt_ms: mean(congRT), incong_mean_rt_ms: mean(incongRT),
              overall_mean_rt_ms: mean(rts)
            });
            clearHost();
            resolver();
          } else {
            showTrial();
          }
        });
      }

      showTrial();
    });
  }


  // ---------- Master runner ----------
  async function runTests(testList, blockId) {
    try { window.__tests_untrap?.(); } catch(_) {}
    IN_TESTS = true;

    const untrap = trapKeys();
    const auto = setTimeout(() => { try { untrap(); } catch(_) {} }, 120000);

    try {
      for (const name of (testList || [])) {
        if (name === "TLX")    await runTLX(blockId);
        if (name === "SAM")    await runSAM(blockId);
        if (name === "Stroop") await runStroop(blockId);
      }
    } catch (err) {
      console.error("TestsUI error:", err);
    } finally {
      clearTimeout(auto);
      try { untrap(); } catch(_) {}
      try { window.__tests_untrap?.(); } catch(_) {}
      IN_TESTS = false;
      clearHost();
    }
  }

  return { runTests, emergencyExit };
})();