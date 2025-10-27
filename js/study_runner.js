// study_runner.js — v=2957
// Separate CSV per block (moves/tests) + session filter fix
console.log("study_runner loaded v=2957");

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
    #study-title { font:700 22px/1.2 system-ui; }
    #study-body  { font:500 14px/1.35 system-ui; opacity:.95; margin-top:6px; }
    #study-timer {
      position: fixed; top: 14px; right: 14px; z-index: 10000;
      background: #0f172a; color: #e5e7eb; border: 1px solid #334155;
      border-radius: 10px; padding: 6px 10px; font: 600 13px system-ui;
      box-shadow: 0 6px 18px rgba(0,0,0,.35); display: none;
    }
  `;
  document.head.appendChild(s);
});

(async function(){
  const L = window.StudyLogger;
  const Tests = window.TestsUI;

  // Overlay
  const overlay = document.getElementById("study-overlay");
  const titleEl = document.getElementById("study-title");
  const bodyEl  = document.getElementById("study-body");
  const show = (t,s="")=>{ titleEl.textContent=t; bodyEl.textContent=s; overlay.style.display="grid"; };
  const hide = ()=>{ overlay.style.display="none"; };

  // YAML
  async function loadConfigSmart(){
    if(!window.jsyaml){
      await new Promise((res,rej)=>{
        const s=document.createElement("script");
        s.src="https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/dist/js-yaml.min.js";
        s.onload=res; s.onerror=rej; document.head.appendChild(s);
      });
    }
    const urls=["public/block.yaml","/public/block.yaml","block.yaml","/block.yaml"];
    for(const u of urls){
      try{
        const r=await fetch(u,{cache:"no-cache"});
        if(!r.ok) throw new Error(r.status);
        return window.jsyaml.load(await r.text());
      }catch(e){ console.warn("YAML load failed:",u,e.message); }
    }
    throw new Error("block.yaml not found");
  }

  // Timer
  function getTimerEl(){
    let el=document.getElementById("study-timer");
    if(!el){ el=document.createElement("div"); el.id="study-timer"; document.body.appendChild(el); }
    return el;
  }
  function startCountdown(seconds,onEnd){
    if(!seconds) return {stop(){},running:false};
    const el=getTimerEl();
    const fmt=s=>`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
    let t=seconds; el.textContent=`Time: ${fmt(t)}`; el.style.display="block";
    const id=setInterval(()=>{t--; el.textContent=`Time: ${fmt(t)}`;
      if(t<=0){clearInterval(id); el.style.display="none"; onEnd?.();}},1000);
    return {stop:()=>{clearInterval(id);el.style.display="none";},running:true};
  }

  // Prefill helper
  function pickWeighted(obj){
    const entries=Object.entries(obj).map(([k,v])=>[+k,+v]);
    const sum=entries.reduce((a,[,w])=>a+w,0)||1;
    let r=Math.random()*sum;
    for(const [val,w] of entries){ if((r-=w)<=0) return Math.floor(val); }
    return Math.floor(entries[0]?.[0]??2);
  }

  function prefillBoard(gm,spec){
    if(!spec?.prefill) return;
    const ratio=Math.max(0,Math.min(1,+spec.prefill.fill_ratio||0));
    let need=Math.round(gm.size*gm.size*ratio);
    const weights=spec.prefill.values||{"2":1,"4":1};
    while(need-- >0 && gm.grid.availableCells().length){
      const cell=gm.grid.randomAvailableCell();
      gm.grid.insertTile(new Tile(cell,pickWeighted(weights)));
    }
  }

  function applyStartGrid(gm,spec){
    if(!spec?.grid) return false;
    gm.grid=new Grid(gm.size);
    for(let y=0;y<spec.grid.length;y++)
      for(let x=0;x<spec.grid[y].length;x++){
        const v=+spec.grid[y][x]||0;
        if(v>0) gm.grid.insertTile(new Tile({x,y},v));
      }
    gm.score=0; gm.over=false; gm.won=false; gm.keepPlaying=false;
    gm.actuator.actuate(gm.grid,{score:gm.score,terminated:false});
    return true;
  }

  function getRandomTileEl(){
    const inners=Array.from(document.querySelectorAll(".tile .tile-inner"));
    return inners.length?inners[Math.floor(Math.random()*inners.length)]:null;
  }
  function flashTileEl(el,ms=600){ if(!el)return; el.classList.add("flash-brief"); setTimeout(()=>el.classList.remove("flash-brief"),ms); }

  // ============== REST ==============
  async function runRestBlock(cfg,b){
    show("Rest",b.ui?.show_message||"Relax");
    await new Promise(r=>setTimeout(r,(b.stop?.value||10)*1000));
    hide();
  }

  // ============== PLAY ==============
  async function runPlayBlock(cfg,block){
    return new Promise(resolve=>{
      const size=block.board_size||cfg?.global?.board_size||4;
      const gc=document.querySelector(".game-container");
      if(gc) gc.innerHTML="";
      const gm=new GameManager(size,KeyboardInputManager,HTMLActuator,LocalStorageManager);
      L.setContext({participant_id:"P001",mode_id:block.id});
      L.newSession(block.id);
      const SESSION_ID=L.getContext().session_id; // new line

      const goalTile=Number(block.goal_tile)||null;
      show(block.description||block.id,goalTile?`Goal: ${goalTile}`:"Play");
      setTimeout(()=>hide(),3000);

      let ended=false,cd=null,lastMoveAt=performance.now();
      const dirName=d=>({0:"up",1:"right",2:"down",3:"left"})[d]??String(d);
      gm.inputManager.on("move",dir=>{
        const now=performance.now(),lat=Math.round(now-lastMoveAt); lastMoveAt=now;
        const gridOut=Array.from({length:gm.size},(_,y)=>
          Array.from({length:gm.size},(_,x)=>gm.grid.cells[x][y]?.value||0));
        L.logMove(gm.moveCount||0,dirName(dir),gm.score,lat,gridOut);
      });

      if(!applyStartGrid(gm,block.start_state)) prefillBoard(gm,block.start_state);

      if(block.stop?.kind==="time"&&block.stop?.value){
        const secs=+block.stop.value;
        cd=startCountdown(secs,()=>stop("time_done"));
      }

      function stop(reason){
        if(ended)return; ended=true; cd?.stop?.();
        askPostQuestions(block).then(()=>{
          setTimeout(()=>{
            const rows=L.moveRowsForExport()
              .filter(r=>r.mode_id===block.id && r.session_id===SESSION_ID);
            resolve(rows);
          },80);
        });
      }

      const act=gm.actuator.actuate.bind(gm.actuator);
      gm.actuator.actuate=(grid,meta)=>{
        act(grid,meta);
        if(meta?.terminated){ stop("end"); return; }
        let maxNow=0; grid.eachCell((x,y,c)=>{if(c)maxNow=Math.max(maxNow,c.value);});
        if(goalTile && maxNow>=goalTile) stop("goal_reached");
      };

      if(block.id==="oddball_mode"){
        setTimeout(()=>flashTileEl(getRandomTileEl(),700),5000);
      }
    });
  }

  // ============== TESTS ==============
  async function runTestsBlock(cfg,block){
    L.setContext({participant_id:"P001",mode_id:block.id});
    L.newSession(block.id);
    const TEST_SESSION_ID=L.getContext().session_id; // new line
    try{
      const res=await Tests.runTests(block.tests||[],block.id,block.tests_options||null);
      const write=(id,val)=>L.logTest(block.id,String(id),"test_item",val);
      if(res && typeof res==="object"){
        if(Array.isArray(res)) res.forEach((it,i)=>write(it.id??i,it.value??it.answer??it));
        else Object.entries(res).forEach(([k,v])=>write(k,v));
      }
    }catch(e){console.error("Tests error",e);}
  }

  // ============== RUNNER ==============
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const ROUND_ORDER=["easy_mode","medium_mode","hard_mode","oddball_mode"];
  const tsPrecise=()=>{const d=new Date(),p=n=>String(n).padStart(2,"0");
    const ms=String(d.getMilliseconds()).padStart(3,"0");
    return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${ms}`;};
  function buildName(pattern,meta,id,kind){
    const base=(pattern||"{study_id}__{block_id}__{kind}__{ts}.csv")
      .replace("{study_id}",meta?.study_id||"study")
      .replace("{block_id}",id)
      .replace("{kind}",kind)
      .replace("{ts}",tsPrecise());
    return base.includes("__moves__")||base.includes("__tests__")?base:base.replace(/\.csv$/i,`__${kind}.csv`);
  }

  async function runStudy(cfg){
    const {meta,blocks,sequence,output}=cfg;
    const map=Object.fromEntries(blocks.map(b=>[b.id,b]));
    for(const id of sequence){
      const b=map[id]; if(!b) continue;

      if(b.type==="rest"){ await runRestBlock(cfg,b); continue; }

      if(b.type==="play"){
        const rows=await runPlayBlock(cfg,b);
        if(output?.autosave_csv_on_block_end){
          const csv=L.toCSVMoves(rows);
          const name=buildName(output.filename_pattern,meta,id,"moves");
          L.download(name,csv);
        }
        continue;
      }

      if(b.type==="tests"){
        await runTestsBlock(cfg,b);
        if(output?.autosave_csv_on_block_end){
          const rows=L.testRowsForExport()
            .filter(r=>r.mode_id===id && r.session_id===L.getContext().session_id);
          const csv=L.toCSVTests(rows);
          const name=buildName(output.tests_filename_pattern,meta,id,"tests");
          L.download(name,csv);
        }
        continue;
      }
    }
    show("Study complete","Thank you!");
  }

  try{
    const cfg=await loadConfigSmart();
    L.setContext({participant_id:"P001"});
    await runStudy(cfg);
  }catch(e){
    console.error(e);
    show("Config error","Could not load block.yaml");
  }
})();
