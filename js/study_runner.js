// study_runner.js — v=2969 (goal left / timer right on grid header)
console.log("study_runner loaded v=2969");

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

    /* top overlay badges */
    #goal-badge, #timer-badge {
      position: absolute;
      top: -36px;
      background: #8C7B68;
      color: #ffffff;
      border: none;
      border-radius: 10px;
      padding: 8px 16px;
      font: 700 15px/1.2 system-ui;
      box-shadow: 0 3px 8px rgba(0,0,0,.25);
      cursor: default;
      width: max-content;
      display: none;
      z-index: 10;
    }

    #goal-badge { left: 0; }
    #timer-badge { right: 0; }

    .grid-header-wrapper {
      position: relative;
      height: 0;
    }

    /* keep the rest intact */
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

  const overlay = document.getElementById("study-overlay");
  const titleEl = document.getElementById("study-title");
  const bodyEl  = document.getElementById("study-body");
  const show = (t, s = "") => { titleEl.textContent = t; bodyEl.textContent = s; overlay.style.display = "grid"; };
  const hide = () => { overlay.style.display = "none"; };

  // --- badge helpers ---
  function ensureGridHeaderWrapper(){
    let wrap=document.querySelector(".grid-header-wrapper");
    if(wrap) return wrap;
    const grid=document.querySelector(".game-container");
    wrap=document.createElement("div");
    wrap.className="grid-header-wrapper";
    grid?.prepend(wrap);
    return wrap;
  }

  function ensureGoalBadge(){
    let el=document.getElementById("goal-badge");
    if(el) return el;
    const wrap=ensureGridHeaderWrapper();
    el=document.createElement("button");
    el.id="goal-badge";
    el.type="button";
    el.disabled=true;
    wrap.appendChild(el);
    return el;
  }
  function ensureTimerBadge(){
    let el=document.getElementById("timer-badge");
    if(el) return el;
    const wrap=ensureGridHeaderWrapper();
    el=document.createElement("button");
    el.id="timer-badge";
    el.type="button";
    el.disabled=true;
    wrap.appendChild(el);
    return el;
  }

  function setGoalBadge(text){
    const el=ensureGoalBadge();
    if(text){el.textContent=text;el.style.display="block";}
    else{el.style.display="none";}
  }
  function setTimerBadge(text){
    const el=ensureTimerBadge();
    if(text){el.textContent=text;el.style.display="block";}
    else{el.style.display="none";}
  }
  function clearBadges(){
    ["goal-badge","timer-badge"].forEach(id=>{
      const el=document.getElementById(id);
      if(el) el.style.display="none";
    });
  }

  // --- config loader ---
  async function ensureYamlLib(){
    if(window.jsyaml) return;
    const u="https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/dist/js-yaml.min.js";
    await new Promise((res,rej)=>{
      const s=document.createElement("script");
      s.src=u;s.onload=res;s.onerror=rej;document.head.appendChild(s);
    });
  }

  async function loadConfigSmart(){
    const bust=`?t=${Date.now()}`;
    const jsonPaths=["block.json","public/block.json"].map(p=>`${p}${bust}`);
    for(const p of jsonPaths){
      try{const r=await fetch(p,{cache:"no-store"});if(r.ok)return await r.json();}catch(_){}
    }
    await ensureYamlLib();
    const yamlPaths=["block.yaml","public/block.yaml"].map(p=>`${p}${bust}`);
    for(const p of yamlPaths){
      try{const r=await fetch(p,{cache:"no-store"});if(r.ok)return window.jsyaml.load(await r.text());}catch(_){}
    }
    throw new Error("Config not found");
  }

  // --- prefill ---
  function pickWeighted(obj){
    const entries=Object.entries(obj).map(([k,v])=>[+k,+v]);
    const sum=entries.reduce((a,[,w])=>a+w,0)||1;
    let r=Math.random()*sum;
    for(const [val,w]of entries){if((r-=w)<=0)return val;}
    return entries[0][0];
  }

  function prefillBoard(gm,spec){
    if(!spec?.prefill)return;
    const ratio=Math.max(0,Math.min(1,Number(spec.prefill.fill_ratio||0)));
    let need=Math.round(gm.size*gm.size*ratio);
    const weights=spec.prefill.values||{"2":1,"4":1};
    while(need-->0&&gm.grid.availableCells().length){
      const cell=gm.grid.randomAvailableCell();
      gm.grid.insertTile(new Tile(cell,pickWeighted(weights)));
    }
  }

  // --- timer ---
  function startCountdown(seconds,onEnd){
    clearBadges();
    if(!seconds)return{stop(){},running:false};
    let t=Math.max(0,Math.floor(seconds));
    const fmt=s=>{
      const m=Math.floor(s/60),ss=String(Math.max(0,s%60)).padStart(2,"0");
      return `${m}:${ss}`;
    };
    setTimerBadge(`Time: ${fmt(t)}`);
    const id=setInterval(()=>{
      t-=1;
      setTimerBadge(`Time: ${fmt(t)}`);
      if(t<=0){clearInterval(id);setTimerBadge("Time: 0:00");onEnd?.();}
    },1000);
    return{stop:()=>clearInterval(id)};
  }

  // --- play block ---
  async function runPlayBlock(cfg,block){
    return new Promise(resolve=>{
      const gm=new GameManager(block.board_size||4,KeyboardInputManager,HTMLActuator,(()=>{}));
      const goalTile=Number(block.goal_tile)||null;
      const goalLine=goalTile?`Goal: Reach ${goalTile}`:"Play!";
      show(block.description||block.id,goalLine);
      setTimeout(hide,3000);
      setGoalBadge(goalLine);

      let cd=null;
      if((block.stop?.kind==="time"&&block.stop?.value)||block.timer?.hard_cap_sec){
        const secs=Number(block.timer?.hard_cap_sec||block.stop?.value||0);
        cd=startCountdown(secs,()=>stop("time_up"));
      }

      function stop(){
        cd?.stop?.();
        clearBadges();
        resolve();
      }

      prefillBoard(gm,block.start_state);
    });
  }

  // --- study ---
  async function runStudy(cfg){
    for(const b of cfg.blocks){
      if(b.type==="play") await runPlayBlock(cfg,b);
    }
    clearBadges();
    show("Done","Thank you!");
  }

  try{
    const cfg=await loadConfigSmart();
    await runStudy(cfg);
  }catch(e){
    console.error(e);
    show("Config error",e.message);
  }
})();
