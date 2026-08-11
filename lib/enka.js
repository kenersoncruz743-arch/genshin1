// lib/enka.js
// Roda só no servidor. Busca o perfil público do jogador na Enka.Network
// (https://enka.network) a partir do UID do Genshin — o mesmo mecanismo que
// sites como o Akasha usam pra ler personagens, builds e progresso no Abismo
// direto do jogo, sem precisar de login/senha da conta HoYoverse.
//
// A Enka pede, por boa prática, que cada app identifique-se com um User-Agent
// próprio e evite bater na API sem necessidade — por isso o resultado fica
// em cache por um tempo (ver CACHE_TTL_MS abaixo).

const ENKA_USER_AGENT = 'ConfrontoAbissal/1.0 (+https://github.com/kenersonmarticru-creator/genshin)';
const CACHE_TTL_MS = {
  maps: 24 * 60 * 60 * 1000,   // tabela de nomes muda pouco — 24h
  profile: 3 * 60 * 1000,       // perfil do jogador — 3min (evita martelar a Enka)
};

const ELEMENT_MAP = {
  Ice: 'Cryo', Fire: 'Pyro', Water: 'Hydro', Wind: 'Anemo',
  Rock: 'Geo', Grass: 'Dendro', Electric: 'Electro', None: '',
};

const RAW_BASE = 'https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store';

let _cache = { maps: null, mapsAt: 0, profiles: {} };

// Tabela de fallback empacotada com o projeto — usada só se a busca ao vivo
// no GitHub falhar (ex: sem internet no ambiente de build local).
let _fallbackChars = null;
let _fallbackWeapons = null;
function loadFallback() {
  if (_fallbackChars && _fallbackWeapons) return;
  try {
    _fallbackChars = require('./enka-characters.json');
    _fallbackWeapons = require('./enka-weapons.json');
  } catch {
    _fallbackChars = {};
    _fallbackWeapons = {};
  }
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': ENKA_USER_AGENT } });
  if (!res.ok) throw new Error(`Falha ao buscar ${url} (status ${res.status})`);
  return res.json();
}

async function getMaps() {
  if (_cache.maps && (Date.now() - _cache.mapsAt) < CACHE_TTL_MS.maps) return _cache.maps;

  try {
    const [loc, chars1, chars2, weapons] = await Promise.all([
      fetchJson(`${RAW_BASE}/loc.json`),
      fetchJson(`${RAW_BASE}/characters.json`),
      fetchJson(`${RAW_BASE}/gi/avatars.json`),
      fetchJson(`${RAW_BASE}/gi/weapons.json`),
    ]);
    const locEn = loc.en || {};
    const merged = { ...chars1, ...chars2 };

    const charMap = {};
    for (const [id, data] of Object.entries(merged)) {
      const name = locEn[String(data.NameTextMapHash)];
      if (!name) continue;
      charMap[id] = {
        name,
        element: ELEMENT_MAP[data.Element] ?? (data.Element || ''),
        rarity: data.QualityType === 'QUALITY_ORANGE' ? 5 : 4,
      };
    }

    const weaponMap = {};
    for (const [id, data] of Object.entries(weapons)) {
      const name = locEn[String(data.NameTextMapHash)];
      if (!name) continue;
      weaponMap[id] = { name, rarity: data.Rarity || 3 };
    }

    _cache.maps = { charMap, weaponMap, locEn };
    _cache.mapsAt = Date.now();
    return _cache.maps;
  } catch (err) {
    // GitHub fora do ar / sem rede — usa a tabela empacotada como fallback.
    loadFallback();
    return { charMap: _fallbackChars, weaponMap: _fallbackWeapons, locEn: {} };
  }
}

// Extrai o nível do personagem do propMap (chave "4001" = nível, doc oficial da Enka).
function getLevel(avatarInfo) {
  const raw = avatarInfo.propMap && avatarInfo.propMap['4001'];
  return raw ? parseInt(raw.val || raw.ival || '1', 10) : null;
}

function getWeaponFromEquip(equipList, weaponMap) {
  const eq = (equipList || []).find(e => e.flat && e.flat.itemType === 'ITEM_WEAPON');
  if (!eq) return null;
  const hash = String((eq.flat && (eq.flat.nameTextMapHash ?? eq.flat.nameTextHashMap)) || '');
  const known = weaponMap[String(eq.itemId)];
  const refineRaw = eq.weapon && eq.weapon.affixMap ? Object.values(eq.weapon.affixMap)[0] : 0;
  return {
    name: (known && known.name) || 'Arma desconhecida',
    level: eq.weapon ? eq.weapon.level : null,
    refinement: (Number(refineRaw) || 0) + 1, // affixMap vem 0-4 -> nosso R1-R5
  };
}

// Monta um resumo da build (conjuntos de artefatos equipados, ex: "Coroa de
// Ouro x4" ou "Coração Flamejante x2 + Emblema do Coração Perdido x2") a
// partir dos artefatos (relíquias) no equipList do personagem.
//
// A Enka expõe o nome de cada peça em flat.setNameTextMapHash — se esse
// campo não vier preenchido em alguma resposta da API (formato pode variar
// entre atualizações da Enka), a peça é ignorada silenciosamente em vez de
// quebrar a importação; nesse caso vale a pena conferir o JSON bruto de
// https://enka.network/api/uid/SEU_UID/ pra ajustar o nome do campo aqui.
function getBuildFromEquip(equipList, locEn) {
  const pieces = (equipList || []).filter(e => e.flat && e.flat.itemType === 'ITEM_RELIQUARY');
  if (!pieces.length) return null;

  const setCounts = {};
  for (const piece of pieces) {
    const hash = String(piece.flat.setNameTextMapHash || '');
    const setName = locEn[hash];
    if (!setName) continue;
    setCounts[setName] = (setCounts[setName] || 0) + 1;
  }

  const parts = Object.entries(setCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `${name} x${count}`);

  return parts.length ? parts.join(' + ') : null;
}

async function fetchProfile(uid) {
  uid = String(uid || '').trim();
  if (!/^\d{6,10}$/.test(uid)) throw new Error('UID inválido — deve ter só números (6 a 10 dígitos).');

  const cached = _cache.profiles[uid];
  if (cached && (Date.now() - cached.at) < CACHE_TTL_MS.profile) return cached.data;

  const { charMap, weaponMap, locEn } = await getMaps();
  const raw = await fetchJson(`https://enka.network/api/uid/${uid}/`);

  const info = raw.playerInfo || {};
  const detailed = raw.avatarInfoList || [];
  const brief = info.showAvatarInfoList || [];

  const characters = [];
  const seen = new Set();

  for (const av of detailed) {
    const meta = charMap[String(av.avatarId)];
    seen.add(av.avatarId);
    characters.push({
      avatarId: av.avatarId,
      name: (meta && meta.name) || `Personagem #${av.avatarId}`,
      element: meta ? meta.element : '',
      rarity: meta ? meta.rarity : 4,
      level: getLevel(av),
      constellation: (av.talentIdList || []).length,
      weapon: getWeaponFromEquip(av.equipList, weaponMap),
      build: getBuildFromEquip(av.equipList, locEn || {}),
      temDetalhes: true,
    });
  }
  // Personagens que aparecem na vitrine mas sem "Mostrar detalhes" ativado
  // no jogo só vêm com id+nível, sem constelação/build.
  for (const av of brief) {
    if (seen.has(av.avatarId)) continue;
    const meta = charMap[String(av.avatarId)];
    characters.push({
      avatarId: av.avatarId,
      name: (meta && meta.name) || `Personagem #${av.avatarId}`,
      element: meta ? meta.element : '',
      rarity: meta ? meta.rarity : 4,
      level: av.level || null,
      constellation: 0, // desconhecida — assume C0 por segurança
      weapon: null,
      build: null,
      temDetalhes: false,
    });
  }

  const result = {
    uid,
    nickname: info.nickname || '',
    nivelJogo: info.level || null,
    worldLevel: info.worldLevel || null,
    abyssFloor: info.towerFloorIndex || null,
    abyssChamber: info.towerLevelIndex || null,
    characters,
    atualizadoEm: new Date().toISOString(),
  };

  _cache.profiles[uid] = { data: result, at: Date.now() };
  return result;
}

module.exports = { fetchProfile };
