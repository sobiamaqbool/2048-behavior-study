// TestsUI v3.3 — TLX + SAM + Stroop (sequential). Game keys blocked during tests.

window.TestsUI = (() => {
  const L = window.StudyLogger;

  // ---------- Key trap (blocks game input while tests run) ----------
  function trapKeys() {
    function eat(e) { e.stopPropagation(); e.preventDefault(); }
    document.addEventListener("keydown", eat, true);
    document.addEventListener("keyup", eat, true);
    const untrap = () => {
      document.removeEventListener("keydown", eat, true);
      document.removeEventListener("keyup", eat, true);
    };
    // expose for emergency release
    window.__tests_untrap = untrap;
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
    // focusable to keep keyboard here
    el.tabIndex = -1;
    document.body.appendChild(el);
    el.focus();
    return el;
  }
  function clearHost() {
    const el = document.getElementById("tests-host");
    if (el) el.remove();
  }

  // ---------- TLX items ----------
  const BASE_ITEMS = [
    { id: "thinking_effort", label: "Thinking Effort" },
    { id: "time_pressure",   label: "Time Pressure" },
    { id: "success_feeling", label: "Success Feeling" },
    // removed globally: { id: "overall_effort", label: "Overall Effort" },
    { id: "frustration",     label: "Frustration / Stress" },
  ];
  function itemsForBlock(blockId) {
    let items = BASE_ITEMS.slice();
    // Remove Time Pressure for easy block
    if (blockId === "easy_mode" || blockId === "easy" || /easy/i.test(blockId)) {
      items = items.filter(q => q.id !== "time_pressure");
    }
    return items;
  }

  // ---------- TLX UI ----------
  function tlxCard(title, items, onSubmit) {
    const host = ensureHost();
    host.innerHTML = "";

    const card = document.createElement("div");
    Object.assign(card.style, {
      width: "min(720px,92vw)", background: "#0f172a", color: "#e5e7eb",
      border: "1px solid #334155", borderRadius: "14px", padding: "18px",
      font: "14px system-ui", boxShadow: "0 16px 40px rgba(0,0,0,.45)",
    });

    const h = document.createElement("div");
    h.textContent = title;
    Object.assign(h.style, { fontWeight: 700, fontSize: "18px", marginBottom: "10px" });
    card.appendChild(h);

    const form = document.createElement("div");
    Object.assign(form.style, { display: "grid", gap: "14px" });

    const answers = {};
    for (const q of items) {
      const row = document.createElement("div");
      Object.assign(row.style, {
        display: "grid", gridTemplateColumns: "180px 1fr", alignItems: "center", gap: "12px",
      });

      const label = document.createElement("div");
      label.textContent = q.label;
      Object.assign(label.style, { fontWeight: 600 });

      const btns = document.createElement("div");
      Object.assign(btns.style, { display: "flex", gap: "6px", flexWrap: "wrap" });

      for (let n = 1; n <= 10; n++) {
        const b = document.createElement("button");
        b.type = "button"; b.textContent = String(n);
        Object.assign(b.style, {
          background: "#111827", color: "#e5e7eb", border: "1px solid #374151",
          borderRadius: "8px", padding: "6px 8px", cursor: "pointer", minWidth: "34px",
        });
        b.addEventListener("click", () => {
          answers[q.id] = n;
          [...btns.children].forEach(x => x.style.background = "#111827");
          b.style.background = "#1f2937";
        });
        btns.appendChild(b);
      }

      row.appendChild(label);
      row.appendChild(btns);
      form.appendChild(row);
    }

    const actions = document.createElement("div");
    Object.assign(actions.style, { marginTop: "12px", display: "flex", justifyContent: "flex-end" });

    const submit = document.createElement("button");
    submit.textContent = "Continue";
    Object.assign(submit.style, {
      background: "#2563eb", color: "#fff", border: 0, borderRadius: "10px",
      padding: "8px 14px", fontWeight: 700, cursor: "pointer",
    });
    submit.onclick = () => {
      const missing = items.filter(q => answers[q.id] == null);
      if (missing.length) { submit.textContent = "Answer all"; setTimeout(()=>submit.textContent="Continue", 900); return; }
      onSubmit(answers);
      clearHost();
    };

    actions.appendChild(submit);
    card.appendChild(form);
    card.appendChild(actions);
    host.appendChild(card);
    host.focus();
  }

  async function runTLX(blockId) {
    const items = itemsForBlock(blockId);
    return new Promise(resolve => {
      tlxCard("Short NASA-TLX", items, (answers) => {
        for (const q of items) {
          L.log("test", q.id, answers[q.id], {
            grid_size:"", score:"", moves:"", empty_cells:"",
            merge_count:"", latency_raw_ms:"", smoothness:"",
            no_op:"", direction:"", max_tile_value:"",
            max_tile_position:"", tight_board:""
          });
        }
        resolve();
      });
    });
  }

  // ---------- SAM UI ----------
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
      card.innerHTML = `<div style="font-weight:700;font-size:18px;margin-bottom:10px">Self-Assessment Manikin (SAM)</div>
        <div>Please rate <b>Valence(Bad-Good)</b> (1–9) and <b>Arousal(Sleepy-Alert)</b> (1–9)</div>
        <div id="sam-q" style="margin-top:12px"></div>`;
      host.appendChild(card);

      const div = card.querySelector("#sam-q");
      const ratings = {};
      for (const dim of ["valence","arousal"]) {
        const row = document.createElement("div");
        row.innerHTML = `<div style="margin-top:10px;font-weight:600">${dim}</div>`;
        for (let n=1; n<=9; n++) {
          const b = document.createElement("button");
          b.textContent = n;
          Object.assign(b.style, {
            margin:"4px",padding:"6px 8px",border:"1px solid #475569",
            borderRadius:"6px",background:"#1e293b",color:"#fff",cursor:"pointer"
          });
          b.onclick = () => {
            ratings[dim]=n;
            [...row.querySelectorAll("button")].forEach(x=>x.style.background="#1e293b");
            b.style.background="#334155";
          };
          row.appendChild(b);
        }
        div.appendChild(row);
      }

      const btn = document.createElement("button");
      btn.textContent = "Continue";
      Object.assign(btn.style, {
        marginTop:"14px", padding:"8px 14px", border:"0", borderRadius:"8px",
        background:"#2563eb", color:"#fff", fontWeight:700, cursor:"pointer"
      });
      btn.onclick = () => {
        if (!ratings.valence || !ratings.arousal) return;
        L.log("test","SAM_valence",ratings.valence,{});
        L.log("test","SAM_arousal",ratings.arousal,{});
        clearHost();
        resolve();
      };
      div.appendChild(btn);
    });
  }

  // ---------- Stroop UI ----------
  async function runStroop(blockId) {
    return new Promise(resolver => {
      const host = ensureHost();
      host.innerHTML = "";

      const card = document.createElement("div");
      Object.assign(card.style, {
        width: "min(560px,92vw)", background: "#0f172a", color: "#e5e7eb",
        border: "1px solid #334155", borderRadius: "14px", padding: "18px",
        font: "14px system-ui", boxShadow: "0 16px 40px rgba(0,0,0,.45)",
        textAlign: "center"
      });
      card.innerHTML = `<div style="font-weight:700;font-size:18px;margin-bottom:10px">Stroop Task (Quick)</div>
        <div>Press key for the <b>color</b> of the word: R,G,B,Y</div>
        <div id="stroop-word" style="font-size:28px;margin:20px;font-weight:700;"></div>
        <div id="stroop-progress" style="opacity:.8"></div>`;
      host.appendChild(card);

      const wordEl = card.querySelector("#stroop-word");
      const progEl = card.querySelector("#stroop-progress");

      const colors = ["red","green","blue","yellow"];
      const words  = ["RED","GREEN","BLUE","YELLOW"];
      let trial = 0, correct = 0;

      function showTrial() {
        const word  = words[Math.floor(Math.random()*4)];
        const color = colors[Math.floor(Math.random()*4)];
        wordEl.textContent = word;
        wordEl.style.color = color;
        wordEl.dataset.correct = color[0].toUpperCase();
        progEl.textContent = `Trial ${trial+1} / 10`;
      }

      function onKey(e) {
        const ans = e.key.toUpperCase();
        if (!["R","G","B","Y"].includes(ans)) return;
        if (ans === wordEl.dataset.correct) correct++;
        trial++;
        if (trial >= 10) {
          document.removeEventListener("keydown", onKey, true);
          L.log("test","Stroop_score", correct, {});
          clearHost();
          resolver();
          return;
        }
        showTrial();
      }

      document.addEventListener("keydown", onKey, true);
      showTrial();
    });
  }

  // ---------- Master runner (sequential) ----------
  async function runTests(testList, blockId) {
    const untrap = trapKeys(); // block game keys
    try {
      for (const name of (testList || [])) {
        if (name === "TLX")    await runTLX(blockId);
        if (name === "SAM")    await runSAM(blockId);
        if (name === "Stroop") await runStroop(blockId);
      }
    } finally {
      untrap();
      clearHost();
    }
  }

  return { runTests };
})();
