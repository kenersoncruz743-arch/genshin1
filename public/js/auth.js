let CHAR_CATALOG = [];
let DECK_LIMIT = null;
let MY_CHARS = [];

function showMsg(el, text, kind){
  el.textContent = text;
  el.className = 'msg ' + (kind || '');
}

/* ---------------- UI wiring ---------------- */

async function renderProfile(session){
  document.getElementById('authBox').classList.add('hidden');
  document.getElementById('profileBox').classList.remove('hidden');

  document.getElementById('welcomeName').textContent = session.username || session.email;

  try{
    if(CHAR_CATALOG.length === 0) CHAR_CATALOG = await loadCharacters();
  } catch(e){
    showMsg(document.getElementById('profileMsg'), 'Não foi possível carregar a lista de personagens da planilha: ' + e.message, 'error');
  }

  DECK_LIMIT = await getDeckPointLimit();

  const perfilJogo = await getMyGameProfile(session.id);
  if(perfilJogo) renderUidSummary(perfilJogo);

  await renderMyCharacterList(session.id);
}

function renderUidSummary(perfil){
  document.getElementById('uidInput').value = perfil.uid;
  document.getElementById('uidSummary').classList.remove('hidden');
  document.getElementById('uidNickname').textContent = perfil.nickname || perfil.uid;
  document.getElementById('uidNivel').textContent = perfil.nivelJogo || '—';
  document.getElementById('uidAbismo').textContent = (perfil.abyssFloor && perfil.abyssChamber)
    ? `${perfil.abyssFloor}-${perfil.abyssChamber}`
    : 'não disponível';
  const dt = perfil.atualizadoEm ? new Date(perfil.atualizadoEm) : null;
  document.getElementById('uidLastSync').textContent = dt ? `Atualizado em ${dt.toLocaleString('pt-BR')}` : '';
}

function deckPointsFor(mine){
  return mine.reduce((sum, row) => {
    const item = CHAR_CATALOG.find(c => c.name === row.character_name);
    const cost = item ? (item.costs['C'+row.constellation] ?? 0) : 0;
    return sum + cost;
  }, 0);
}

function renderDeckCounter(mine){
  const used = deckPointsFor(mine);
  const el = document.getElementById('deckPointsCounter');
  if(DECK_LIMIT === null){
    el.textContent = `${used} pontos usados (sem limite definido)`;
  } else {
    el.textContent = `${used} / ${DECK_LIMIT} pontos`;
    el.style.color = used > DECK_LIMIT ? 'var(--danger)' : (used === DECK_LIMIT ? 'var(--gold-bright)' : 'var(--ink-faint)');
  }
}

/* ---------------- Meus Personagens (cards) ---------------- */

async function renderMyCharacterList(userId){
  const list = document.getElementById('myCharList');
  list.innerHTML = '<div class="hint">Carregando…</div>';
  try{
    MY_CHARS = await fetchMyCharacters(userId);
  } catch(e){
    list.innerHTML = '';
    showMsg(document.getElementById('profileMsg'), 'Não foi possível carregar seus personagens: ' + e.message, 'error');
    return;
  }

  renderDeckCounter(MY_CHARS);

  if(MY_CHARS.length === 0){
    list.innerHTML = '<div class="hint">Você ainda não adicionou nenhum personagem — use a busca abaixo.</div>';
  } else {
    list.innerHTML = '';
    MY_CHARS.forEach(row => {
      const catalogItem = CHAR_CATALOG.find(c => c.name === row.character_name);
      const card = document.createElement('div');
      card.className = 'char-card';
      card.innerHTML = `
        <span class="cc-rarity">${catalogItem ? catalogItem.rarity+'★' : ''}</span>
        ${catalogItem && catalogItem.image ? `<img src="${catalogItem.image}" data-name="${row.character_name}" onerror="this.style.display='none'">` : ''}
        <span class="cc-name" data-name="${row.character_name}">${row.character_name}</span>
        <select class="constel-select" data-name="${row.character_name}">
          ${[0,1,2,3,4,5,6].map(n => `<option value="${n}" ${n===row.constellation?'selected':''}>C${n}</option>`).join('')}
        </select>
        <button class="cc-btn remove" data-name="${row.character_name}">Remover</button>
      `;
      list.appendChild(card);
    });

    list.querySelectorAll('img, .cc-name').forEach(el => {
      el.addEventListener('click', () => openBuildModal(el.dataset.name));
    });
    list.querySelectorAll('.constel-select').forEach(sel => {
      const previousValue = sel.value;
      sel.addEventListener('change', async () => {
        const session = await getSession();
        try{
          await upsertMyCharacter(session.id, sel.dataset.name, parseInt(sel.value,10));
          showMsg(document.getElementById('profileMsg'), 'Constelação atualizada.', 'ok');
          await renderMyCharacterList(session.id);
        } catch(e){
          sel.value = previousValue;
          showMsg(document.getElementById('profileMsg'), e.message, 'error');
        }
      });
    });
    list.querySelectorAll('.cc-btn.remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        const session = await getSession();
        await deleteMyCharacter(session.id, btn.dataset.name);
        await renderMyCharacterList(session.id);
        renderCatalogGrid(document.getElementById('catalogSearchInput')?.value || '');
      });
    });
  }

  renderCatalogGrid(document.getElementById('catalogSearchInput')?.value || '');
}

/* ---------------- Adicionar Personagens (catálogo completo) ---------------- */

function renderCatalogGrid(filter){
  const grid = document.getElementById('catalogGrid');
  if(!grid) return; // HTML desatualizado/em cache — evita quebrar o resto da página
  const q = (filter || '').toLowerCase();
  const mineNames = new Set(MY_CHARS.map(r => r.character_name));

  grid.innerHTML = '';
  CHAR_CATALOG
    .filter(c => c.name.toLowerCase().includes(q))
    .sort((a,b) => a.name.localeCompare(b.name))
    .forEach(c => {
      const already = mineNames.has(c.name);
      const card = document.createElement('div');
      card.className = 'char-card';
      card.innerHTML = `
        <span class="cc-rarity">${c.rarity}★</span>
        ${c.image ? `<img src="${c.image}" onerror="this.style.display='none'">` : ''}
        <span class="cc-name">${c.name}</span>
        <button class="cc-btn ${already ? 'remove' : 'add'}" data-name="${c.name}">${already ? 'Remover' : 'Adicionar'}</button>
      `;
      grid.appendChild(card);
    });

  grid.querySelectorAll('.cc-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const session = await getSession();
      try{
        if(btn.textContent === 'Remover'){
          await deleteMyCharacter(session.id, btn.dataset.name);
        } else {
          await upsertMyCharacter(session.id, btn.dataset.name, 0);
        }
        await renderMyCharacterList(session.id);
      } catch(e){
        showMsg(document.getElementById('profileMsg'), e.message, 'error');
      }
    });
  });
}

/* ---------------- Modal de build ---------------- */

function openBuildModal(characterName){
  const row = MY_CHARS.find(r => r.character_name === characterName);
  if(!row) return;

  document.getElementById('buildModalTitle').textContent = characterName;
  const body = document.getElementById('buildModalBody');

  if(!row.weapon){
    body.innerHTML = `
      <div class="build-row"><span>Constelação</span><span>C${row.constellation}</span></div>
      <p class="hint" style="margin-top:12px;">Sem build importada ainda — conecte o UID no topo da página pra trazer arma e nível automaticamente.</p>
    `;
  } else {
    body.innerHTML = `
      <div class="build-row"><span>Constelação</span><span>C${row.constellation}</span></div>
      ${row.characterLevel ? `<div class="build-row"><span>Nível</span><span>${row.characterLevel}</span></div>` : ''}
      <div class="build-row"><span>Arma</span><span>${row.weapon.name}</span></div>
      <div class="build-row"><span>Refinamento</span><span>R${row.weapon.refinement}</span></div>
      ${row.weapon.level ? `<div class="build-row"><span>Nível da arma</span><span>${row.weapon.level}</span></div>` : ''}
    `;
  }
  document.getElementById('buildModal').classList.remove('hidden');
}
function closeBuildModal(){
  document.getElementById('buildModal').classList.add('hidden');
}


document.addEventListener('DOMContentLoaded', async () => {
  const session = await getSession();
  if(session) await renderProfile(session);
  if(session && session.isAdmin){
    const link = document.getElementById('navAdminLink');
    if(link) link.classList.remove('hidden');
  }

  document.getElementById('toggleModeBtn').addEventListener('click', () => {
    const isSignup = document.getElementById('authForm').dataset.mode === 'signup';
    document.getElementById('authForm').dataset.mode = isSignup ? 'login' : 'signup';
    document.getElementById('usernameField').classList.toggle('hidden', isSignup);
    document.getElementById('authSubmitBtn').textContent = isSignup ? 'Entrar' : 'Criar conta';
    document.getElementById('toggleModeBtn').textContent = isSignup ? 'Não tem conta? Criar uma' : 'Já tem conta? Entrar';
  });

  document.getElementById('authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const mode = document.getElementById('authForm').dataset.mode || 'signup';
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const username = document.getElementById('authUsername').value.trim();
    const msgEl = document.getElementById('authMsg');
    try{
      if(mode === 'signup'){
        await handleSignUp(email, password, username);
        showMsg(msgEl, 'Conta criada!', 'ok');
        const newSession = await getSession();
        await renderProfile(newSession);
      } else {
        await handleSignIn(email, password);
        const session = await getSession();
        await renderProfile(session);
      }
    } catch(err){
      showMsg(msgEl, err.message, 'error');
    }
  });

  document.getElementById('catalogSearchInput').addEventListener('input', (e) => {
    renderCatalogGrid(e.target.value);
  });
  document.getElementById('buildModalClose').addEventListener('click', closeBuildModal);

let UID_PREVIEW_ITENS = [];
let UID_ATUAL = '';

document.getElementById('uidBtn').addEventListener('click', async () => {
  const uid = document.getElementById('uidInput').value.trim();
  const msgEl = document.getElementById('uidMsg');
  document.getElementById('uidPreviewWrap').classList.add('hidden');
  if(!uid){ showMsg(msgEl, 'Digite seu UID.', 'error'); return; }
  showMsg(msgEl, 'Buscando perfil na Enka.Network…', '');
  try{
    const resultado = await previewUidProfile(uid);
    UID_PREVIEW_ITENS = resultado.itens;
    UID_ATUAL = uid;
    renderUidSummary(resultado.perfil);
    showMsg(msgEl, `${resultado.itens.length} personagem(ns) na vitrine — marque quem quer salvar.`, 'ok');
    renderUidPreviewGrid();
  } catch(e){
    showMsg(msgEl, e.message, 'error');
  }
});

function renderUidPreviewGrid(){
  const wrap = document.getElementById('uidPreviewWrap');
  const grid = document.getElementById('uidPreviewGrid');
  wrap.classList.remove('hidden');
  grid.innerHTML = '';

  UID_PREVIEW_ITENS.forEach((it, idx) => {
    const card = document.createElement('div');
    card.className = 'char-card' + (it.encontrado ? '' : ' cc-disabled');
    card.innerHTML = `
      <input type="checkbox" class="cc-check" data-idx="${idx}" ${it.encontrado ? 'checked' : 'disabled'}>
      <span class="cc-rarity">${it.rarity}★</span>
      ${it.image ? `<img src="${it.image}" onerror="this.style.display='none'">` : ''}
      <span class="cc-name">${it.name}${it.encontrado ? '' : '<span class="cc-notfound">não cadastrado</span>'}</span>
      <span class="hint">C${it.constellation} · ${it.cost} pts</span>
      ${it.weapon ? `<span class="cc-weapon">${it.weapon.name} R${it.weapon.refinement}</span>` : '<span class="cc-weapon">sem build</span>'}
    `;
    grid.appendChild(card);
  });

  updateUidPreviewCounter();
  grid.querySelectorAll('.cc-check').forEach(cb => cb.addEventListener('change', updateUidPreviewCounter));
  grid.querySelectorAll('.char-card').forEach((card, idx) => {
    card.addEventListener('click', (e) => {
      if(e.target.classList.contains('cc-check')) return; // clique foi no checkbox, não abre a modal
      openUidPreviewBuildModal(idx);
    });
  });
}

function openUidPreviewBuildModal(idx){
  const it = UID_PREVIEW_ITENS[idx];
  if(!it) return;

  document.getElementById('buildModalTitle').textContent = it.name;
  const body = document.getElementById('buildModalBody');

  if(!it.encontrado){
    body.innerHTML = `<p class="hint" style="margin-top:12px;">"${it.name}" ainda não está cadastrado no catálogo — por isso não é possível salvar nem calcular o custo em pontos.</p>`;
    document.getElementById('buildModal').classList.remove('hidden');
    return;
  }

  let html = `<div class="build-row"><span>Constelação</span><span>C${it.constellation}</span></div>`;
  if(it.level) html += `<div class="build-row"><span>Nível</span><span>${it.level}</span></div>`;

  if(it.weapon){
    html += `
      <div class="build-row"><span>Arma</span><span>${it.weapon.name}</span></div>
      <div class="build-row"><span>Refinamento</span><span>R${it.weapon.refinement}</span></div>
      ${it.weapon.level ? `<div class="build-row"><span>Nível da arma</span><span>${it.weapon.level}</span></div>` : ''}
    `;
  } else if(it.temDetalhes){
    html += `<p class="hint" style="margin-top:8px;">Sem arma equipada.</p>`;
  }

  if(it.artifacts && it.artifacts.length){
    html += `<div class="hint" style="text-transform:uppercase; letter-spacing:.08em; margin:16px 0 8px;">Artefatos</div>`;
    if(it.artifactSets && it.artifactSets.length){
      html += `<div style="margin-bottom:10px;">${it.artifactSets.map(s => `<span class="cc-weapon" style="display:inline-block; margin:0 6px 4px 0;">${s.count}x ${s.name}${s.count>=4?' (4pç)':s.count>=2?' (2pç)':''}</span>`).join('')}</div>`;
    }
    html += `<div style="display:flex; flex-direction:column; gap:8px;">`;
    it.artifacts.forEach(a => {
      const rTier = a.rarity>=5?'5':a.rarity===4?'4':'3';
      const borderColor = `var(--r${rTier}-a)`;
      html += `
        <div style="display:flex; gap:10px; padding:10px; border:1px solid ${borderColor}; border-radius:10px; background:var(--void-2);">
          <div style="flex:0 0 auto; width:52px; height:52px; border-radius:8px; background:var(--void-1); display:flex; align-items:center; justify-content:center; position:relative;">
            ${a.image ? `<img src="${a.image}" style="width:44px;height:44px;object-fit:contain;" onerror="this.style.display='none'">` : ''}
            <span style="position:absolute; bottom:-4px; right:-4px; background:var(--void-0); color:var(--gold-bright); font-size:10px; font-weight:700; padding:1px 4px; border-radius:6px; border:1px solid ${borderColor};">+${a.level}</span>
          </div>
          <div style="flex:1; min-width:0;">
            <div style="display:flex; justify-content:space-between; gap:8px;">
              <b style="font-size:12.5px;">${a.slotName}</b>
              <span class="hint" style="font-size:10.5px; white-space:nowrap;">${a.rarity}★</span>
            </div>
            <div class="hint" style="font-size:11px; margin-bottom:4px;">${a.setName}</div>
            ${a.mainStat ? `<div style="font-size:13px; margin-bottom:4px;">${a.mainStat.label} <b style="color:var(--gold-bright);">${a.mainStat.value}</b></div>` : ''}
            ${a.subStats && a.subStats.length ? `<div style="display:flex; flex-wrap:wrap; gap:4px;">${a.subStats.map(s=>`<span style="font-size:10.5px; background:var(--void-1); border:1px solid var(--line); border-radius:6px; padding:2px 6px; color:var(--ink-dim);">${s.label} +${s.value}</span>`).join('')}</div>` : ''}
          </div>
        </div>
      `;
    });
    html += `</div>`;
  } else if(it.temDetalhes){
    html += `<p class="hint" style="margin-top:8px;">Nenhum artefato equipado.</p>`;
  } else {
    html += `<p class="hint" style="margin-top:12px;">Ative "Mostrar detalhes do personagem" no jogo pra trazer arma, artefatos e nível completos.</p>`;
  }

  body.innerHTML = html;
  document.getElementById('buildModal').classList.remove('hidden');
}

function updateUidPreviewCounter(){
  const checked = [...document.querySelectorAll('#uidPreviewGrid .cc-check:checked')];
  const total = checked.reduce((sum, cb) => sum + UID_PREVIEW_ITENS[cb.dataset.idx].cost, 0);
  document.getElementById('uidPreviewCounter').textContent = `${checked.length} selecionado(s) · ${total} pts`;
}

document.getElementById('uidSaveBtn').addEventListener('click', async () => {
  const msgEl = document.getElementById('uidSaveMsg');
  const selecionados = [...document.querySelectorAll('#uidPreviewGrid .cc-check:checked')]
    .map(cb => UID_PREVIEW_ITENS[cb.dataset.idx].name);

  if(selecionados.length === 0){ showMsg(msgEl, 'Marque pelo menos um personagem.', 'error'); return; }

  const session = await getSession();
  showMsg(msgEl, 'Salvando…', '');
  try{
    const resultado = await saveSelectedUidCharacters(session.id, UID_ATUAL, selecionados);
    let texto = `Salvos ${resultado.salvos.length} de ${selecionados.length} selecionado(s).`;
    showMsg(msgEl, texto, resultado.ignorados.length ? 'error' : 'ok');
    if(resultado.ignorados.length){
      msgEl.innerHTML += '<ul style="margin:6px 0 0 18px;">' +
        resultado.ignorados.map(i => `<li>${i.name} — ${i.motivo}</li>`).join('') + '</ul>';
    }
    await renderMyCharacterList(session.id);
  } catch(e){
    showMsg(msgEl, e.message, 'error');
  }
});

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await handleSignOut();
    location.reload();
  });
});
