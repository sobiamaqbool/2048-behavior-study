// v2.7 — raw latency; no rolling; no feedback
window.StudyLogger = (() => {
  console.info("StudyLogger v2.7");

  const rows = [];
  const nowISO = () => new Date().toISOString();
  const esc = v => `"${String(v ?? "").replace(/"/g,'""')}"`;

  let context = { participant_id: "P001", block_id: "", block_type: "", grid_size: "" };

  const HEADERS = [
    "timestamp","participant_id","block_id","block_type",
    "event","key","value",
    "grid_size","score","moves","empty_cells","merge_count",
    "latency_raw_ms","smoothness","no_op","direction",
    "max_tile_value","max_tile_position","tight_board"
  ];

  function setContext(partial){ context = { ...context, ...partial }; }

  function normalize(obj){
    const base = {
      timestamp: nowISO(),
      participant_id: context.participant_id,
      block_id: context.block_id,
      block_type: context.block_type,
      event: "", key: "", value: "",
      grid_size: context.grid_size,
      score: "", moves: "", empty_cells: "",
      merge_count: "", latency_raw_ms: "", smoothness: "",
      no_op: "", direction: "",
      max_tile_value: "", max_tile_position: "", tight_board: ""
    };
    return { ...base, ...obj };
  }

  function log(event, key, value, extra = {}) { rows.push(normalize({ event, key, value, ...extra })); }
  const rowsForExport = () => rows.slice();

  function toCSV(r = rows){
    const head = HEADERS.join(",");
    const body = r.map(x => HEADERS.map(h => esc(x[h])).join(",")).join("\n");
    return head + "\n" + body + "\n";
  }

  function download(name, text){
    const b = new Blob([text], {type:"text/csv"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = name; a.click();
    URL.revokeObjectURL(a.href);
  }

  return { log, setContext, rowsForExport, toCSV, download, HEADERS };
})();
