/*
  Calculadora de dano — monta um time de até 4 personagens salvos no Perfil
  (com status finais, arma e artefatos já importados do UID) e estima o dano
  de um golpe usando o multiplicador oficial do talento escolhido, buscado na
  Project Amber (gi.yatta.moe) via /api/damage.
*/

const TEAM_SIZE = 4;
let MY_CHARS = [];
let CHAR_CATALOG = [];
let TEAM = new Array(TEAM_SIZE).fill(null);
const TALENTS_CACHE = {}; // characterName -> talents[]

function imageFor(characterName){
  const c = CHAR_CATALOG.find(c => c.name === characterName);
  return c ? c.image : '';
}

async function getTalentsFor(characterName){
  if (TALENTS_CACHE[characterName]) return TALENTS_CACHE[characterName];
  const talents = await fetchCharacterTalents(characterName);
  TALENTS_CACHE[characterName] = talents;
  return talents;
}

// DEF multiplier padrão do jogo: (NívelPersonagem + 100) / (NívelPersonagem + 100 + NívelInimigo + 100)
function defMultiplier(charLevel, enemyLevel){
  const cl = Number(charLevel) || 90;
  const el = Number(enemyLevel) || 100;
  return (cl + 100) / (cl + 100 + el + 100);
}

// RES multiplier padrão do jogo (RES em fração, ex: 0.1 = 10%)
function resMultiplier(resPercent){
  const res = (Number(resPercent) || 0) / 100;
  if (res < 0) return 1 - res / 2;
  if (res < 0.5) return 1 - res;
  return 1 / (1 + 4 * res);
}

function critMultiplier(stats, mode){
  if (!stats) return 1;
  const rate = Math.min(1, (stats.critRate || 0) / 100);
  const dmg = (stats.critDmg || 0) / 100;
  if (mode === 'always') return 1 + dmg;
  if (mode === 'never') return 1;
  return 1 + rate * dmg; // média
}

function calcSlotDamage(slot, globals){
  if (!slot || !slot.talent || slot.levelIdx === null || slot.levelIdx === undefined) return 0;
  const level = slot.talent.levels[slot.levelIdx];
  if (!level || !level.params || !level.params.length) return 0;

  const multiplier = Number(level.params[0]) || 0; // primeiro parâmetro = % de dano na maioria dos talentos
  const statValue = (slot.row.stats && slot.row.stats[slot.statChoice]) || 0;

  const base = statValue * multiplier;
  const crit = critMultiplier(slot.row.stats, globals.critMode);
  const def = defMultiplier(slot.row.characterLevel, globals.enemyLevel);
  const res = resMultiplier(globals.enemyRes);
  const bonus = 1 + (Number(slot.extraDmgPercent) || 0) / 100;

  return base * crit * def * res * bonus;
}

function renderTeamTotal(globals){
  let total = 0;
  TEAM.forEach(slot => { total += calcSlotDamage(slot, globals); });
  document.getElementById('teamTotal').textContent = Math.round(total).toLocaleString('pt-BR');
}

function currentGlobals(){
  return {
    enemyLevel: document.getElementById('enemyLevel').value,
    enemyRes: document.getElementById('enemyRes').value,
    critMode: document.getElementById('critMode').value,
  };
}

function availableCharsFor(slotIdx){
  const usedElsewhere = new Set(TEAM.map((s,i)=> i!==slotIdx && s ? s.row.character_name : null).filter(Boolean));
  return MY_CHARS.filter(r => !usedElsewhere.has(r.character_name));
}

async function renderSlot(slotIdx){
  const el = document.getElementById('slot-' + slotIdx);
  const slot = TEAM[slotIdx];
  const globals = currentGlobals();

  const options = ['<option value="">— vazio —</option>']
    .concat(availableCharsFor(slotIdx).map(r =>
      `<option value="${r.character_name}" ${slot && slot.row.character_name===r.character_name ? 'selected':''}>${r.character_name}</option>`
    ));

  let html = `<select class="slot-select" data-slot="${slotIdx}">${options.join('')}</select>`;

  if (slot){
    const img = imageFor(slot.row.character_name);
    html += `
      <div class="slot-head" style="margin-top:10px;">
        ${img ? `<img src="${img}">` : ''}
        <div>
          <b>${slot.row.character_name}</b><br>
          <span class="hint">C${slot.row.constellation} · ${slot.row.weapon ? slot.row.weapon.name : 'sem arma salva'}</span>
        </div>
      </div>
    `;

    if (!slot.row.stats){
      html += `<p class="hint" style="margin-top:8px;">Esse personagem não tem status salvos ainda — reconecte o UID no Perfil pra trazer os status finais.</p>`;
    } else if (slot.loadingTalents){
      html += `<p class="hint" style="margin-top:8px;">Carregando talentos...</p>`;
    } else if (slot.talentError){
      html += `<p class="hint" style="margin-top:8px; color:var(--danger);">${slot.talentError}</p>`;
    } else if (slot.talents && slot.talents.length){
      html += `<div class="talent-row"><label>Talento</label>
        <select class="talent-select" data-slot="${slotIdx}">
          ${slot.talents.map((t,i)=> `<option value="${i}" ${slot.talentIdx===i?'selected':''}>${t.typeLabel} — ${t.name}</option>`).join('')}
        </select>
      </div>`;

      if (slot.talent){
        html += `<div class="mini-row talent-row">
          <div>
            <label>Nível do talento</label>
            <select class="level-select" data-slot="${slotIdx}">
              ${slot.talent.levels.map((lv,i)=> `<option value="${i}" ${slot.levelIdx===i?'selected':''}>Lv. ${lv.level}</option>`).join('')}
            </select>
          </div>
          <div>
            <label>Status usado</label>
            <select class="stat-select" data-slot="${slotIdx}">
              <option value="atk" ${slot.statChoice==='atk'?'selected':''}>ATQ</option>
              <option value="hp" ${slot.statChoice==='hp'?'selected':''}>HP</option>
              <option value="def" ${slot.statChoice==='def'?'selected':''}>DEF</option>
            </select>
          </div>
        </div>
        <div class="talent-row">
          <label>Bônus de dano extra (%) — ex: talento/constelação que não está no status</label>
          <input type="number" class="extra-dmg" data-slot="${slotIdx}" value="${slot.extraDmgPercent||0}" step="1">
        </div>`;

        const lvl = slot.talent.levels[slot.levelIdx];
        if (lvl){
          html += `<div class="dmg-result">
            <div class="num">${Math.round(calcSlotDamage(slot, globals)).toLocaleString('pt-BR')}</div>
            <div class="lbl">dano estimado (1 acerto)</div>
          </div>`;
        }
      }
    } else {
      html += `<p class="hint" style="margin-top:8px;">Nenhum talento com escala de dano encontrado pra esse personagem.</p>`;
    }
  } else {
    html += `<div class="slot-empty">Escolha um personagem</div>`;
  }

  el.innerHTML = html;
}

function renderAllSlots(){
  for (let i=0;i<TEAM_SIZE;i++) renderSlot(i);
  renderTeamTotal(currentGlobals());
}

async function onPickCharacter(slotIdx, characterName){
  if (!characterName){
    TEAM[slotIdx] = null;
    renderAllSlots();
    return;
  }
  const row = MY_CHARS.find(r => r.character_name === characterName);
  TEAM[slotIdx] = {
    row,
    talents: null,
    talent: null,
    talentIdx: null,
    levelIdx: null,
    statChoice: 'atk',
    extraDmgPercent: 0,
    loadingTalents: true,
    talentError: null,
  };
  renderAllSlots();

  try{
    const talents = await getTalentsFor(characterName);
    const slot = TEAM[slotIdx];
    if (!slot || slot.row.character_name !== characterName) return; // usuário trocou antes de terminar
    slot.talents = talents;
    slot.loadingTalents = false;
    if (talents.length){
      slot.talentIdx = 0;
      slot.talent = talents[0];
      slot.levelIdx = Math.min(8, talents[0].levels.length - 1); // nível "médio" como padrão
    }
  } catch(e){
    const slot = TEAM[slotIdx];
    if (slot) { slot.loadingTalents = false; slot.talentError = e.message; }
  }
  renderAllSlots();
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = await getSession();
  if (!session){
    document.getElementById('loginNeeded').classList.remove('hidden');
    return;
  }
  document.getElementById('calcBox').classList.remove('hidden');

  const grid = document.getElementById('teamGrid');
  grid.innerHTML = '';
  for (let i=0;i<TEAM_SIZE;i++){
    const div = document.createElement('div');
    div.className = 'slot';
    div.id = 'slot-' + i;
    grid.appendChild(div);
  }

  try{
    [MY_CHARS, CHAR_CATALOG] = await Promise.all([
      fetchMyCharacters(session.id),
      loadCharacters(),
    ]);
  } catch(e){
    grid.innerHTML = `<p class="hint" style="color:var(--danger);">Erro ao carregar seus personagens: ${e.message}</p>`;
    return;
  }

  renderAllSlots();

  grid.addEventListener('change', async (e) => {
    const t = e.target;
    const slotIdx = Number(t.dataset.slot);
    if (isNaN(slotIdx)) return;
    const slot = TEAM[slotIdx];

    if (t.classList.contains('slot-select')){
      await onPickCharacter(slotIdx, t.value);
    } else if (t.classList.contains('talent-select') && slot){
      slot.talentIdx = Number(t.value);
      slot.talent = slot.talents[slot.talentIdx];
      slot.levelIdx = Math.min(8, slot.talent.levels.length - 1);
      renderAllSlots();
    } else if (t.classList.contains('level-select') && slot){
      slot.levelIdx = Number(t.value);
      renderAllSlots();
    } else if (t.classList.contains('stat-select') && slot){
      slot.statChoice = t.value;
      renderAllSlots();
    } else if (t.classList.contains('extra-dmg') && slot){
      slot.extraDmgPercent = Number(t.value) || 0;
      renderAllSlots();
    }
  });

  ['enemyLevel','enemyRes','critMode'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => renderAllSlots());
    document.getElementById(id).addEventListener('change', () => renderAllSlots());
  });
});
