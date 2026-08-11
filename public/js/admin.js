const CHAR_LEVELS = [0,1,2,3,4,5,6];
const WEAPON_LEVELS = [1,2,3,4,5];

let ME = null;
let CHAR_CATALOG = [];
let WEAPON_CATALOG = [];

function rarityClass(r){ return r>=5?'r5': r===4?'r4':'r3'; }

async function loadCatalog(){
  const res = await fetch('/api/personagens?tipo=catalogo');
  const json = await res.json();
  if(!json.ok) throw new Error(json.msg || 'Não foi possível carregar o catálogo.');
  return json;
}

function renderCharsTable(filter){
  const body = document.getElementById('charsBody');
  body.innerHTML = '';
  const q = (filter||'').toLowerCase();
  CHAR_CATALOG
    .filter(c => c.name.toLowerCase().includes(q))
    .sort((a,b)=> a.name.localeCompare(b.name))
    .forEach(c => {
      const tr = document.createElement('tr');
      const nameTd = document.createElement('td');
      nameTd.innerHTML = `<div class="admin-row-name">${c.image?`<img src="${c.image}" onerror="this.style.display='none'">`:''}<span>${c.name}</span><span class="rarity">${c.rarity}★</span></div>`;
      tr.appendChild(nameTd);

      CHAR_LEVELS.forEach(lvl => {
        const td = document.createElement('td');
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'cost-input';
        input.value = c.costs['C'+lvl];
        input.min = 0;
        input.addEventListener('change', () => saveCharacterCost(c.name, lvl, input));
        td.appendChild(input);
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
}

function renderWeaponsTable(filter){
  const body = document.getElementById('weaponsBody');
  body.innerHTML = '';
  const q = (filter||'').toLowerCase();
  WEAPON_CATALOG
    .filter(w => w.name.toLowerCase().includes(q))
    .sort((a,b)=> a.name.localeCompare(b.name))
    .forEach(w => {
      const tr = document.createElement('tr');
      const nameTd = document.createElement('td');
      nameTd.innerHTML = `<div class="admin-row-name">${w.image?`<img src="${w.image}" onerror="this.style.display='none'">`:''}<span>${w.name}</span><span class="rarity">${w.rarity}★</span></div>`;
      tr.appendChild(nameTd);

      WEAPON_LEVELS.forEach(lvl => {
        const td = document.createElement('td');
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'cost-input';
        input.value = w.costs['R'+lvl];
        input.min = 0;
        input.addEventListener('change', () => saveWeaponCost(w.name, lvl, input));
        td.appendChild(input);
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
}

async function saveCharacterCost(name, level, input){
  input.classList.remove('saved','erro');
  try{
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ action:'updateCharacterCost', requesterId: ME.id, name, level, value: Number(input.value)||0 })
    });
    const json = await res.json();
    if(!json.ok) throw new Error(json.msg);
    input.classList.add('saved');
    setTimeout(()=> input.classList.remove('saved'), 1200);
  } catch(e){
    input.classList.add('erro');
    alert('Erro ao salvar: ' + e.message);
  }
}

async function saveWeaponCost(name, level, input){
  input.classList.remove('saved','erro');
  try{
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ action:'updateWeaponCost', requesterId: ME.id, name, level, value: Number(input.value)||0 })
    });
    const json = await res.json();
    if(!json.ok) throw new Error(json.msg);
    input.classList.add('saved');
    setTimeout(()=> input.classList.remove('saved'), 1200);
  } catch(e){
    input.classList.add('erro');
    alert('Erro ao salvar: ' + e.message);
  }
}

document.getElementById('tabChars').addEventListener('click', ()=>{
  document.getElementById('tabChars').classList.add('active');
  document.getElementById('tabWeapons').classList.remove('active');
  document.getElementById('charsTable').classList.remove('hidden');
  document.getElementById('weaponsTable').classList.add('hidden');
});
document.getElementById('tabWeapons').addEventListener('click', ()=>{
  document.getElementById('tabWeapons').classList.add('active');
  document.getElementById('tabChars').classList.remove('active');
  document.getElementById('weaponsTable').classList.remove('hidden');
  document.getElementById('charsTable').classList.add('hidden');
});
document.getElementById('adminSearchInput').addEventListener('input', (e)=>{
  renderCharsTable(e.target.value);
  renderWeaponsTable(e.target.value);
});

async function loadDeckLimit(){
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ action:'getDeckPointLimit' })
  });
  const json = await res.json();
  if(json.ok && json.limit !== null){
    document.getElementById('deckLimitInput').value = json.limit;
  }
}

document.getElementById('deckLimitBtn').addEventListener('click', async ()=>{
  const msgEl = document.getElementById('deckLimitMsg');
  const raw = document.getElementById('deckLimitInput').value;
  try{
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ action:'updateDeckPointLimit', requesterId: ME.id, value: raw === '' ? '' : Number(raw) })
    });
    const json = await res.json();
    if(!json.ok) throw new Error(json.msg);
    msgEl.textContent = 'Salvo!';
    msgEl.className = 'msg ok';
  } catch(e){
    msgEl.textContent = e.message;
    msgEl.className = 'msg error';
  }
});

async function boot(){
  ME = await getSession();
  if(!ME || !ME.isAdmin){
    document.getElementById('loadingBox').classList.add('hidden');
    document.getElementById('notAuthorized').classList.remove('hidden');
    return;
  }

  try{
    const catalogo = await loadCatalog();
    CHAR_CATALOG = catalogo.characters;
    WEAPON_CATALOG = catalogo.weapons;
    renderCharsTable('');
    renderWeaponsTable('');
    await loadDeckLimit();
    document.getElementById('loadingBox').classList.add('hidden');
    document.getElementById('deckLimitPanel').classList.remove('hidden');
    document.getElementById('adminPanel').classList.remove('hidden');
  } catch(e){
    document.getElementById('loadingBox').innerHTML = `<p style="color:var(--danger);">Erro ao carregar: ${e.message}</p>`;
  }
}
boot();
