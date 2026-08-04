/* ===================== DATA (carregado da planilha) ===================== */
const ELEMENTS = {
  Pyro:'--pyro', Hydro:'--hydro', Electro:'--electro', Cryo:'--cryo',
  Anemo:'--anemo', Geo:'--geo', Dendro:'--dendro'
};

let CHARACTERS = [];
let WEAPONS = [];

/* ===================== STATE ===================== */
let CFG = {};
let ST = null;
let timerHandle = null;

function buildSnakeOrder(slotsPerPlayer, startPlayer){
  const order = [];
  for(let i=0;i<slotsPerPlayer*2;i++){
    const round = Math.floor(i/2);
    const pair = (round % 2 === 0) ? [0,1] : [1,0];
    let p = pair[i%2];
    if(startPlayer===1) p = 1-p;
    order.push(p);
  }
  return order;
}

function initState(){
  const budget = parseInt(document.getElementById('cfgBudget').value)||550;
  const chars = parseInt(document.getElementById('cfgChars').value)||4;
  const weapons = parseInt(document.getElementById('cfgWeapons').value)||4;
  const fiveCap = parseInt(document.getElementById('cfgFiveStar').value)??5;
  const timer = parseInt(document.getElementById('cfgTimer').value)||45;
  const n1 = document.getElementById('p1name').value.trim() || 'Jogador 1';
  const n2 = document.getElementById('p2name').value.trim() || 'Jogador 2';

  CFG = {budget, charSlots:chars, weaponSlots:weapons, fiveCap, timer, names:[n1,n2]};

  ST = {
    phase: 'characters',
    pool: { characters: CHARACTERS.map(c=>({...c})), weapons: WEAPONS.map(w=>({...w})) },
    players: [
      {points:budget, picksChar:[], picksWeapon:[], fiveStar:0},
      {points:budget, picksChar:[], picksWeapon:[], fiveStar:0}
    ],
    globalFiveStarUsed: 0,
    order: buildSnakeOrder(chars, 0),
    turnIdx: 0,
    timeLeft: timer,
    log: []
  };
}

/* ===================== RENDER ===================== */
function rarityClass(r){ return r>=5?'r5': r===4?'r4':'r3'; }
function currentPool(){ return ST.phase==='weapons' ? ST.pool.weapons : ST.pool.characters; }

function imgTag(it, size){
  if(!it.image) return '';
  return `<img src="${it.image}" style="width:${size}px;height:${size}px;" class="item-img" onerror="this.style.display='none'">`;
}

function renderSidePanels(){
  for(let p=0;p<2;p++){
    document.getElementById('dispName'+(p+1)).textContent = CFG.names[p];
    document.getElementById('dispPoints'+(p+1)).textContent = ST.players[p].points;

    const list = document.getElementById('picksP'+(p+1));
    list.innerHTML = '';
    const allPicks = [
      ...ST.players[p].picksChar.map(x=>({...x,kind:'char'})),
      ...ST.players[p].picksWeapon.map(x=>({...x,kind:'weapon'}))
    ];
    const totalSlots = CFG.charSlots + CFG.weaponSlots;
    for(let i=0;i<totalSlots;i++){
      if(allPicks[i]){
        const it = allPicks[i];
        const chip = document.createElement('div');
        chip.className = 'pick-chip ' + rarityClass(it.rarity);
        chip.innerHTML = `${imgTag(it,22)}<span>${it.name}</span><span class="cost">${it.cost}</span>`;
        list.appendChild(chip);
      } else {
        const slot = document.createElement('div');
        slot.className = 'empty-slot';
        slot.textContent = i < CFG.charSlots ? '— personagem —' : '— arma —';
        list.appendChild(slot);
      }
    }

    const dotsWrap = document.getElementById('fsP'+(p+1));
    dotsWrap.innerHTML = '';
    for(let i=0;i<Math.max(CFG.fiveCap,1);i++){
      const d = document.createElement('div');
      d.className = 'dot' + (i < ST.players[p].fiveStar ? ' filled':'');
      dotsWrap.appendChild(d);
    }
    document.getElementById('panelP'+(p+1)).classList.toggle('turn-active', ST.order[ST.turnIdx]===p);
  }
}

function renderGrid(){
  const grid = document.getElementById('itemGrid');
  const search = document.getElementById('searchBox').value.toLowerCase();
  const sort = document.getElementById('sortBox').value;
  const activePlayer = ST.order[ST.turnIdx];
  const budgetLeft = ST.players[activePlayer].points;

  let items = currentPool().filter(it => it.name.toLowerCase().includes(search));
  if(sort==='cost-desc') items.sort((a,b)=>b.cost-a.cost);
  else if(sort==='cost-asc') items.sort((a,b)=>a.cost-b.cost);
  else items.sort((a,b)=>a.name.localeCompare(b.name));

  grid.innerHTML = '';
  items.forEach(it=>{
    const fiveStarBlocked = (it.rarity===5 && ST.globalFiveStarUsed >= CFG.fiveCap);
    const cantAfford = it.cost > budgetLeft;
    const disabled = fiveStarBlocked || cantAfford;

    const card = document.createElement('div');
    card.className = `item-card ${rarityClass(it.rarity)} ${disabled?'disabled':''}`;
    const elemLabel = it.element ? `<span class="elem-dot" style="background:var(${ELEMENTS[it.element]||'--ink-faint'})"></span>${it.element}` : (ST.phase==='weapons' ? 'Arma' : '');
    card.innerHTML = `
      ${imgTag(it,100)}
      <div style="font-size:10.5px; color:var(--ink-faint); text-transform:uppercase; letter-spacing:.04em; margin-top:6px;">${elemLabel}</div>
      <span class="iname">${it.name}</span>
      <div class="imeta"><span class="rarity-tag">${it.rarity}★</span><span class="cost-tag">${it.cost}</span></div>`;
    if(!disabled) card.addEventListener('click', ()=>makePick(it.id));
    grid.appendChild(card);
  });
}

function renderTurnInfo(){
  const activePlayer = ST.order[ST.turnIdx];
  document.getElementById('turnTitle').innerHTML = `Vez de <b class="${activePlayer===0?'p-color-1':'p-color-2'}">${CFG.names[activePlayer]}</b>`;
  document.getElementById('phaseCaption').textContent = ST.phase==='weapons' ? 'Fase 2 · Escolha de Armas' : 'Fase 1 · Escolha de Personagens';
  document.getElementById('phasePill').textContent = ST.phase==='weapons' ? 'Draft — Armas' : 'Draft — Personagens';
}

function renderLog(){
  const box = document.getElementById('logList');
  box.innerHTML = ST.log.slice().reverse().map(l=>{
    const who = l.player===0 ? 'who1' : 'who2';
    return `<div class="log-entry"><span class="${who}">${l.name}</span> ${l.text}</div>`;
  }).join('');
}

function renderTimerRing(){
  const circ = 2*Math.PI*66;
  const ring = document.getElementById('ringFg');
  ring.style.strokeDasharray = circ;
  const frac = ST.timeLeft / CFG.timer;
  ring.style.strokeDashoffset = circ * (1-frac);
  const low = frac < 0.25;
  ring.style.stroke = low ? 'var(--danger)' : 'var(--gold)';
  document.getElementById('ringTime').textContent = ST.timeLeft;
  document.getElementById('ringTime').style.color = low ? 'var(--danger)' : 'var(--ink)';
}

function renderAll(){ renderSidePanels(); renderTurnInfo(); renderGrid(); renderLog(); renderTimerRing(); }

/* ===================== LOGIC ===================== */
function startTimer(){
  clearInterval(timerHandle);
  ST.timeLeft = CFG.timer;
  document.getElementById('skipNote').textContent = '';
  renderTimerRing();
  timerHandle = setInterval(()=>{
    ST.timeLeft--;
    if(ST.timeLeft<=0){
      clearInterval(timerHandle);
      const p = ST.order[ST.turnIdx];
      document.getElementById('skipNote').textContent = `Tempo esgotado — ${CFG.names[p]} perdeu a vez.`;
      ST.log.push({player:p, name:CFG.names[p], text:'perdeu a vez (tempo esgotado)'});
      advanceTurn();
      return;
    }
    renderTimerRing();
  },1000);
}

function makePick(itemId){
  const activePlayer = ST.order[ST.turnIdx];
  const poolKey = ST.phase==='weapons' ? 'weapons' : 'characters';
  const idx = ST.pool[poolKey].findIndex(i=>i.id===itemId);
  if(idx===-1) return;
  const item = ST.pool[poolKey][idx];

  if(item.cost > ST.players[activePlayer].points) return;
  if(item.rarity===5 && ST.globalFiveStarUsed >= CFG.fiveCap) return;

  ST.pool[poolKey].splice(idx,1);
  ST.players[activePlayer].points -= item.cost;
  if(ST.phase==='weapons') ST.players[activePlayer].picksWeapon.push(item);
  else ST.players[activePlayer].picksChar.push(item);
  if(item.rarity===5 && ST.phase==='weapons'){
    ST.globalFiveStarUsed++;
    ST.players[activePlayer].fiveStar++;
  }
  ST.log.push({player:activePlayer, name:CFG.names[activePlayer], text:`escolheu ${item.name} (${item.cost} pts)`});
  advanceTurn();
}

function advanceTurn(){
  clearInterval(timerHandle);
  ST.turnIdx++;
  if(ST.turnIdx >= ST.order.length){
    if(ST.phase==='characters'){
      ST.phase = 'weapons';
      ST.order = buildSnakeOrder(CFG.weaponSlots, 1);
      ST.turnIdx = 0;
    } else {
      showSummary();
      return;
    }
  }
  renderAll();
  startTimer();
}

/* ===================== SUMMARY ===================== */
function showSummary(){
  document.getElementById('draft').classList.add('hidden');
  document.getElementById('summary').classList.remove('hidden');
  document.getElementById('phasePill').textContent = 'Times Finalizados';

  const grid = document.getElementById('summaryGrid');
  grid.innerHTML = '';
  for(let p=0;p<2;p++){
    const spent = CFG.budget - ST.players[p].points;
    const col = document.createElement('div');
    col.className = 'sum-col panel';
    col.innerHTML = `
      <h3 class="${p===0?'p-color-1':'p-color-2'} font-display">${CFG.names[p]}</h3>
      <div class="hint" style="margin-bottom:16px;">${spent} / ${CFG.budget} pontos usados · ${ST.players[p].fiveStar} arma(s) 5★</div>
      <div class="hint" style="text-transform:uppercase; letter-spacing:.08em; margin-bottom:8px;">Personagens</div>
      ${ST.players[p].picksChar.map(c=>`<div class="sum-item">${imgTag(c,26)}<span>${c.rarity}★ ${c.name}</span><span class="cost">${c.cost}</span></div>`).join('') || '<div class="sum-item">Nenhum</div>'}
      <div class="hint" style="text-transform:uppercase; letter-spacing:.08em; margin:14px 0 8px;">Armas</div>
      ${ST.players[p].picksWeapon.map(w=>`<div class="sum-item">${imgTag(w,26)}<span>${w.rarity}★ ${w.name}</span><span class="cost">${w.cost}</span></div>`).join('') || '<div class="sum-item">Nenhuma</div>'}
    `;
    grid.appendChild(col);
  }
}

/* ===================== BOOT (carrega planilha) ===================== */
async function boot(){
  try{
    [CHARACTERS, WEAPONS] = await Promise.all([loadCharacters(), loadWeapons()]);
    document.getElementById('loadingBox').classList.add('hidden');
    document.getElementById('setup').classList.remove('hidden');
    document.getElementById('phasePill').textContent = 'Configuração';
  } catch(e){
    document.getElementById('loadingBox').classList.add('hidden');
    document.getElementById('loadError').classList.remove('hidden');
    document.getElementById('loadErrorText').textContent = 'Erro ao carregar a planilha: ' + e.message;
  }
}
boot();

/* ===================== EVENTS ===================== */
document.getElementById('startBtn').addEventListener('click', ()=>{
  initState();
  document.getElementById('setup').classList.add('hidden');
  document.getElementById('draft').classList.remove('hidden');
  renderAll();
  startTimer();
});
document.getElementById('searchBox').addEventListener('input', renderGrid);
document.getElementById('sortBox').addEventListener('change', renderGrid);
document.getElementById('restartBtn').addEventListener('click', ()=>{
  clearInterval(timerHandle);
  document.getElementById('summary').classList.add('hidden');
  document.getElementById('setup').classList.remove('hidden');
  document.getElementById('phasePill').textContent = 'Configuração';
});
