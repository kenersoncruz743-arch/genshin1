let CHAR_CATALOG = [];
let DECK_LIMIT = null;

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

let MY_CHARS_CACHE = [];

async function renderMyCharacterList(userId){
  const list = document.getElementById('myCharList');
  list.innerHTML = '<div class="hint">Carregando…</div>';
  let mine;
  try{
    mine = await fetchMyCharacters(userId);
  } catch(e){
    list.innerHTML = '';
    showMsg(document.getElementById('profileMsg'), 'Não foi possível carregar seus personagens: ' + e.message, 'error');
    return;
  }

  MY_CHARS_CACHE = mine;
  renderDeckCounter(mine);

  if(mine.length === 0){
    list.innerHTML = '<div class="hint">Você ainda não adicionou nenhum personagem. Clique em "Adicionar personagem" abaixo.</div>';
    return;
  }
  list.className = 'char-grid';
  list.innerHTML = '';
  mine.forEach(row => {
    const catalogItem = CHAR_CATALOG.find(c => c.name === row.character_name);
    const card = document.createElement('div');
    card.className = 'char-card';
    card.innerHTML = `
      <button class="btn-remove" data-name="${row.character_name}" title="Remover">✕</button>
      ${catalogItem && catalogItem.image ? `<img class="char-card-img" src="${catalogItem.image}" onerror="this.style.display='none'">` : '<div class="char-card-img"></div>'}
      <div class="char-card-body">
        <div class="char-card-name">${row.character_name}</div>
        <div class="char-card-meta">${catalogItem ? `${catalogItem.rarity}★ ${catalogItem.element || ''}` : ''}</div>
        <select class="constel-select" data-name="${row.character_name}">
          ${[0,1,2,3,4,5,6].map(n => `<option value="${n}" ${n===row.constellation?'selected':''}>C${n}</option>`).join('')}
        </select>
        ${row.weapon_name ? `<div class="char-card-build">🗡️ ${row.weapon_name}${row.weapon_refinement ? ' (R'+row.weapon_refinement+')' : ''}</div>` : ''}
        ${row.build ? `<div class="char-card-build">🛡️ ${row.build}</div>` : ''}
        ${(!row.weapon_name && !row.build) ? `<div class="char-card-build hint">Sem build importada — conecte seu UID ou adicione na mão.</div>` : ''}
      </div>
    `;
    list.appendChild(card);
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
  list.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', async () => {
      const session = await getSession();
      await deleteMyCharacter(session.id, btn.dataset.name);
      await renderMyCharacterList(session.id);
    });
  });
}

/* ---------------- Modal: adicionar personagem (grade de cards com busca) ---------------- */

function renderAddCharModal(filterText){
  const grid = document.getElementById('addCharGrid');
  const mineNames = new Set(MY_CHARS_CACHE.map(r => r.character_name));
  const term = (filterText || '').trim().toLowerCase();

  const items = CHAR_CATALOG
    .filter(c => !term || c.name.toLowerCase().includes(term))
    .sort((a,b) => a.name.localeCompare(b.name));

  if(items.length === 0){
    grid.innerHTML = '<div class="hint">Nenhum personagem encontrado.</div>';
    return;
  }

  grid.innerHTML = items.map(c => {
    const owned = mineNames.has(c.name);
    return `
      <div class="char-card pick-card">
        ${c.image ? `<img class="char-card-img" src="${c.image}" onerror="this.style.display='none'">` : '<div class="char-card-img"></div>'}
        <div class="char-card-body">
          <div class="char-card-name">${c.name}</div>
          <div class="char-card-meta">${c.rarity}★ ${c.element || ''}</div>
          <button class="btn ${owned ? 'btn-ghost' : 'btn-primary'} btn-pick" data-name="${c.name}" data-owned="${owned}">
            ${owned ? 'Remover' : '+ Adicionar'}
          </button>
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.btn-pick').forEach(btn => {
    btn.addEventListener('click', async () => {
      const session = await getSession();
      const name = btn.dataset.name;
      const owned = btn.dataset.owned === 'true';
      btn.disabled = true;
      try{
        if(owned){
          await deleteMyCharacter(session.id, name);
        } else {
          await upsertMyCharacter(session.id, name, 0);
        }
        await renderMyCharacterList(session.id);
        renderAddCharModal(document.getElementById('addCharSearch').value);
      } catch(e){
        showMsg(document.getElementById('profileMsg'), e.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });
  });
}

function openAddCharModal(){
  document.getElementById('addCharModal').classList.remove('hidden');
  document.getElementById('addCharSearch').value = '';
  renderAddCharModal('');
}

function closeAddCharModal(){
  document.getElementById('addCharModal').classList.add('hidden');
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

  document.getElementById('openAddCharModalBtn').addEventListener('click', openAddCharModal);
  document.getElementById('closeAddCharModalBtn').addEventListener('click', closeAddCharModal);
  document.getElementById('addCharModal').addEventListener('click', (e) => {
    if(e.target.id === 'addCharModal') closeAddCharModal();
  });
  document.getElementById('addCharSearch').addEventListener('input', (e) => {
    renderAddCharModal(e.target.value);
  });

  document.getElementById('uidBtn').addEventListener('click', async () => {
    const uid = document.getElementById('uidInput').value.trim();
    const msgEl = document.getElementById('uidMsg');
    const detailsEl = document.getElementById('uidImportDetails');
    detailsEl.classList.add('hidden');
    detailsEl.innerHTML = '';
    if(!uid){ showMsg(msgEl, 'Digite seu UID.', 'error'); return; }
    const session = await getSession();
    showMsg(msgEl, 'Buscando perfil na Enka.Network…', '');
    try{
      const resultado = await importUidProfile(session.id, uid);
      renderUidSummary(resultado.perfil);

      showMsg(msgEl, `Importados ${resultado.importados.length} de ${resultado.importados.length + resultado.ignorados.length} personagem(ns) da vitrine.`, resultado.ignorados.length ? 'error' : 'ok');

      if(resultado.ignorados.length){
        detailsEl.classList.remove('hidden');
        detailsEl.innerHTML = '<b style="color:var(--danger);">Não entraram:</b><ul style="margin:6px 0 0 18px; color:var(--ink-dim);">' +
          resultado.ignorados.map(i => `<li>${i.name} — ${i.motivo}</li>`).join('') +
          '</ul>';
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
