/*
  Busca o catálogo de personagens/armas do jogo através da nossa própria API
  (netlify/functions/api.js -> api/personagens.js -> lib/sheets.js), que lê a
  planilha do lado do servidor usando a service account do Google.

  Antes isso lia a planilha direto do navegador via CSV público — agora não é
  mais necessário deixar a planilha compartilhada publicamente: basta ter
  compartilhado com o e-mail da service account (veja o README).
*/

let _catalogCache = null;

async function loadCatalog(){
  if(_catalogCache) return _catalogCache;
  const res = await fetch('/api/personagens?tipo=catalogo');
  const json = await res.json();
  if(!json.ok) throw new Error(json.msg || 'Não foi possível carregar o catálogo.');
  _catalogCache = json;
  return json;
}

async function loadCharacters(){
  const { characters } = await loadCatalog();
  return characters;
}

async function loadWeapons(){
  const { weapons } = await loadCatalog();
  return weapons;
}
