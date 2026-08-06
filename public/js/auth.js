let CHAR_CATALOG = [];

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
    const select = document.getElementById('addCharSelect');
    select.innerHTML = '<option value="">Selecione um personagem…</option>' +
      CHAR_CATALOG.map(c => `<option value="${c.name}">${c.rarity}★ ${c.name}</option>`).join('');
  } catch(e){
    showMsg(document.getElementById('profileMsg'), 'Não foi possível carregar a lista de personagens da planilha: ' + e.message, 'error');
  }

  await renderMyCharacterList(session.id);
}

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
  if(mine.length === 0){
    list.innerHTML = '<div class="hint">Você ainda não adicionou nenhum personagem.</div>';
    return;
  }
  list.innerHTML = '';
  mine.forEach(row => {
    const catalogItem = CHAR_CATALOG.find(c => c.name === row.character_name);
    const div = document.createElement('div');
    div.className = 'char-row';
    div.innerHTML = `
      ${catalogItem && catalogItem.image ? `<img class="item-img" style="width:44px;height:44px;" src="${catalogItem.image}" onerror="this.style.display='none'">` : ''}
      <span class="char-name">${row.character_name}</span>
      <select class="constel-select" data-name="${row.character_name}">
        ${[0,1,2,3,4,5,6].map(n => `<option value="${n}" ${n===row.constellation?'selected':''}>C${n}</option>`).join('')}
      </select>
      <button class="btn-remove" data-name="${row.character_name}" title="Remover">✕</button>
    `;
    list.appendChild(div);
  });

  list.querySelectorAll('.constel-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      const session = await getSession();
      await upsertMyCharacter(session.id, sel.dataset.name, parseInt(sel.value,10));
      showMsg(document.getElementById('profileMsg'), 'Constelação atualizada.', 'ok');
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

  document.getElementById('addCharBtn').addEventListener('click', async () => {
    const select = document.getElementById('addCharSelect');
    if(!select.value) return;
    const session = await getSession();
    await upsertMyCharacter(session.id, select.value, 0);
    select.value = '';
    await renderMyCharacterList(session.id);
  });

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await handleSignOut();
    location.reload();
  });
});
