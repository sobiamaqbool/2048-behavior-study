// v3.4 — minimal move logs + tests router + context getter
window.StudyLogger = (() => {
  console.info("StudyLogger v3.4");

  // ---- ids
  const getOrMakeAnonId = () => {
    const k = "study_anon_id";
    let id = localStorage.getItem(k);
    if (!id) {
      id = (crypto?.randomUUID?.() || Math.random().toString(36).slice(2)) + "-" + Date.now().toString(36);
      localStorage.setItem(k, id);
    }
    return id;
  };
  const newSessionId = () =>
    (crypto?.randomUUID?.() || Math.random().toString(36).slice(2)) + "-" + Date.now().toString(36);

  // ---- state
  const moveRows = [];
  const testRows = [];
  const nowISO = () => new Date().toISOString();
  const esc = v => {
    const val = (Array.isArray(v) || (v && typeof v === "object")) ? JSON.stringify(v) : v;
    return `"${String(val ?? "").replace(/"/g, '""')}"`;
  };

  let context = {
    participant_id: "P001",
    anon_id: getOrMakeAnonId(),
    session_id: newSessionId(),
    mode_id: "" // e.g., "easy_mode" | "hard_mode" | "tests_after_easy"
  };

  // ---- headers
  const MOVE_HEADERS = [
    "timestamp","participant_id","anon_id","session_id","mode_id",
    "move_num","direction","score","latency_raw_ms","grid"
  ];
  const TEST_HEADERS = [
    "timestamp","participant_id","anon_id","session_id","mode_id",
    "test_block_id","item_id","item_type","response"
  ];

  // ---- context
  function setContext(partial = {}) { context = { ...context, ...partial }; }
  function newSession(mode_id) { context.session_id = newSessionId(); if (mode_id) context.mode_id = mode_id; }
  function getContext() { return { ...context }; } // NEW

  // ---- moves
  function normalizeMove(obj) {
    const base = {
      timestamp: nowISO(),
      participant_id: context.participant_id,
      anon_id: context.anon_id,
      session_id: context.session_id,
      mode_id: context.mode_id,
      move_num: "", direction: "", score: "", latency_raw_ms: "", grid: ""
    };
    return { ...base, ...obj };
  }
  function logMove(move_num, direction, score, latency_raw_ms, grid) {
    moveRows.push(normalizeMove({ move_num, direction, score, latency_raw_ms, grid }));
  }

  // ---- tests
  function normalizeTest(obj) {
    const base = {
      timestamp: nowISO(),
      participant_id: context.participant_id,
      anon_id: context.anon_id,
      session_id: context.session_id,
      mode_id: context.mode_id,
      test_block_id: "", item_id: "", item_type: "", response: ""
    };
    return { ...base, ...obj };
  }
  function logTest(test_block_id, item_id, item_type, response) {
    testRows.push(normalizeTest({ test_block_id, item_id, item_type, response }));
  }

  // ---- compatibility: route TestsUI logs into tests CSV
  // Many UIs call: StudyLogger.log(event, key, value, extra)
  function log(event, key, value, extra = {}) {
    const e = String(event ?? "");
    const k = String(key ?? "");

    const looksTest =
      e.includes("test") || k.includes("test") ||
      k.includes("answer") || e === "answer" ||
      extra.type === "test" || extra.kind === "test" || extra.is_test === true ||
      extra.item_id != null || extra.qid != null;

    if (looksTest) {
      const test_block_id = extra.block_id || context.mode_id || "unknown_block";
      const item_id = (extra.item_id ?? extra.id ?? extra.qid ?? k ?? "item").toString();
      const response = extra.response ?? extra.value ?? value;
      const item_type = e || "test_event";
      logTest(test_block_id, item_id, item_type, response);
      return;
    }
    // Ignore non-test events to keep schema minimal.
  }

  // ---- export
  const moveRowsForExport = () => moveRows.slice();
  const testRowsForExport = () => testRows.slice();

  function toCSV(rows, headers) {
    const head = headers.join(",");
    const body = rows.map(x => headers.map(h => esc(x[h])).join(",")).join("\n");
    return head + "\n" + body + "\n";
  }
  const toCSVMoves = (r = moveRows) => toCSV(r, MOVE_HEADERS);
  const toCSVTests = (r = testRows) => toCSV(r, TEST_HEADERS);

  function download(name, text) {
    const b = new Blob([text], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return {
    // context
    setContext, newSession, getContext, // getContext exported
    // moves
    logMove, moveRowsForExport, toCSVMoves,
    // tests
    logTest, testRowsForExport, toCSVTests,
    // utils
    download,
    // compatibility
    log
  };
})();
