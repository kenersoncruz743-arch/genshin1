/*
  Fala com nossa própria API (/api/auth e /api/personagens), que roda como
  Netlify Function e usa a service account do Google do lado do servidor.
  A senha do usuário viaja em HTTPS até o servidor, que a transforma em hash
  (bcrypt) antes de gravar na planilha — o navegador nunca vê nem guarda a
  senha em texto puro.

  A "sessão" fica salva no localStorage (não existe servidor guardando
  sessão, então o login dura enquanto o navegador não limpar os dados do
  site).
*/

const SESSION_KEY = 'confronto_abissal_session';

async function apiAuth(action, payload) {
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ action }, payload)),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.msg || 'Erro desconhecido.');
  return json.user;
}

function saveSession(user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

async function getSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

async function handleSignUp(email, password, username) {
  const user = await apiAuth('signup', { email, password, username });
  saveSession(user);
  return user;
}

async function handleSignIn(email, password) {
  const user = await apiAuth('login', { email, password });
  saveSession(user);
  return user;
}

async function handleSignOut() {
  clearSession();
}

async function fetchMyCharacters(userId) {
  const res = await fetch('/api/personagens?userId=' + encodeURIComponent(userId));
  const json = await res.json();
  if (!json.ok) throw new Error(json.msg || 'Erro ao buscar personagens.');
  return (json.rows || []).sort((a, b) => a.character_name.localeCompare(b.character_name));
}

async function upsertMyCharacter(userId, characterName, constellation) {
  const res = await fetch('/api/personagens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, characterName, constellation }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.msg || 'Erro ao salvar personagem.');
}

async function deleteMyCharacter(userId, characterName) {
  const res = await fetch('/api/personagens', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, characterName }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.msg || 'Erro ao remover personagem.');
}

/* ---------------- UID do Genshin (Enka.Network) ---------------- */

async function importUidProfile(userId, uid) {
  const res = await fetch('/api/enka', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'importarUID', userId, uid }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.msg || 'Erro ao buscar UID.');
  return json;
}

async function getMyGameProfile(userId) {
  const res = await fetch('/api/enka', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'meuPerfilJogo', userId }),
  });
  const json = await res.json();
  if (!json.ok) return null;
  return json.perfil;
}

async function getDeckPointLimit() {
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'getDeckPointLimit' }),
  });
  const json = await res.json();
  if (!json.ok) return null;
  return json.limit;
}
