// lib/talents.js
// Busca dados de talento (o quanto cada Ataque Normal / Habilidade Elemental /
// Explosão Elemental escala em % conforme o nível) na Project Amber
// (https://gi.yatta.moe) — o mesmo banco de dados público que sites como o
// Akasha/Genshin Optimizer usam. A gente NÃO precisa manter uma tabela de
// fórmulas por personagem: a API já manda o multiplicador pronto pra cada
// nível de talento (1 a 15).
//
// Como funciona a requisição: a API pede um "vh" (hash da versão de dados)
// como query string — buscamos esse hash uma vez e cacheamos junto.

const YATTA_BASE = 'https://gi.yatta.moe/api/v2/en';
const YATTA_USER_AGENT = 'ConfrontoAbissal/1.0 (+https://github.com/kenersonmarticru-creator/genshin)';
const CACHE_TTL_MS = {
  version: 24 * 60 * 60 * 1000, // 24h
  talent: 24 * 60 * 60 * 1000,  // 24h — dados de talento raramente mudam no meio de uma versão
};

let _cache = { version: null, versionAt: 0, talents: {} };

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': YATTA_USER_AGENT } });
  if (!res.ok) throw new Error(`Falha ao buscar ${url} (status ${res.status})`);
  return res.json();
}

async function getVersionHash() {
  if (_cache.version && (Date.now() - _cache.versionAt) < CACHE_TTL_MS.version) return _cache.version;
  try {
    const json = await fetchJson(`${YATTA_BASE}/static/version`);
    const vh = json && json.data && json.data.vh;
    if (vh) {
      _cache.version = vh;
      _cache.versionAt = Date.now();
      return vh;
    }
  } catch {
    // segue sem vh — a API costuma responder com os dados mais recentes mesmo assim
  }
  return null;
}

// type: 0 = Ataque Normal, 1 = Habilidade Elemental, 2 = Explosão Elemental, 3 = Passiva
const TALENT_TYPE_LABEL = { 0: 'Ataque Normal', 1: 'Habilidade Elemental', 2: 'Explosão Elemental' };

// Descrição bruta tem placeholders tipo "{param0:P0}" (percentual) ou
// "{param1:F1P}" — a gente só precisa dos números crus (params), não do
// texto formatado, então não tentamos parsear os placeholders.

async function getCharacterTalents(avatarId) {
  avatarId = String(avatarId);
  const cached = _cache.talents[avatarId];
  if (cached && (Date.now() - cached.at) < CACHE_TTL_MS.talent) return cached.data;

  const vh = await getVersionHash();
  const url = `${YATTA_BASE}/avatar/${avatarId}` + (vh ? `?vh=${vh}` : '');
  const json = await fetchJson(url);
  const data = (json && json.data) || {};
  const talentMap = data.talent || {};

  const talents = [];
  for (const key of Object.keys(talentMap)) {
    const t = talentMap[key];
    if (!t || t.type === undefined || t.type === 3) continue; // pula passivas/constelações
    const promote = t.promote || {};
    const levels = Object.values(promote)
      .map(p => ({
        level: p.level,
        params: Array.isArray(p.params) ? p.params : [],
      }))
      .sort((a, b) => a.level - b.level);
    if (!levels.length) continue;

    talents.push({
      key,
      type: t.type,
      typeLabel: TALENT_TYPE_LABEL[t.type] || 'Talento',
      name: t.name || TALENT_TYPE_LABEL[t.type] || 'Talento',
      icon: t.icon ? `https://gi.yatta.moe/assets/UI/${t.icon}.png` : '',
      levels,
    });
  }

  // Ordena: Ataque Normal, Habilidade, Explosão.
  talents.sort((a, b) => a.type - b.type);

  const result = { avatarId, talents };
  _cache.talents[avatarId] = { at: Date.now(), data: result };
  return result;
}

module.exports = { getCharacterTalents };
