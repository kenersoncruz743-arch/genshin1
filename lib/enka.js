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

// Nomes/formatos dos stats finais do personagem (fightPropMap) e das peças
// de artefato (mainPropId / appendPropId), no formato usado pela Enka.
const FIGHT_PROP_LABELS = {
  '1': 'Vida Base', '2000': 'Vida', '2001': 'ATQ', '2002': 'DEF',
  '4': 'ATQ Base', '7': 'DEF Base',
  '20': 'Taxa Crítica', '22': 'Dano Crítico', '23': 'Recarga de Energia',
  '26': 'Bônus de Cura', '28': 'Proficiência Elemental',
  '30': 'Bônus de Dano Físico',
  '40': 'Bônus de Dano Pyro', '41': 'Bônus de Dano Electro', '42': 'Bônus de Dano Hydro',
  '43': 'Bônus de Dano Dendro', '44': 'Bônus de Dano Anemo', '45': 'Bônus de Dano Geo',
  '46': 'Bônus de Dano Cryo',
};
// Props que devem ser exibidos como porcentagem (o resto é valor plano).
// fightPropMap (stats finais do personagem) usa ids numéricos ('20','22'…);
// artefatos e armas (reliquaryMainstat/reliquarySubstats/weaponStats) usam
// o nome do enum da Enka ('FIGHT_PROP_CRITICAL_HURT'…) — os dois formatos
// aparecem então os dois precisam estar cobertos aqui.
const PERCENT_PROP_IDS = new Set(['20','22','23','26','30','40','41','42','43','44','45','46']);
const PERCENT_PROP_NAMES = new Set([
  'FIGHT_PROP_HP_PERCENT', 'FIGHT_PROP_ATTACK_PERCENT', 'FIGHT_PROP_DEFENSE_PERCENT',
  'FIGHT_PROP_CRITICAL', 'FIGHT_PROP_CRITICAL_HURT', 'FIGHT_PROP_CHARGE_EFFICIENCY',
  'FIGHT_PROP_HEAL_ADD',
  'FIGHT_PROP_FIRE_ADD_HURT', 'FIGHT_PROP_ELEC_ADD_HURT', 'FIGHT_PROP_WATER_ADD_HURT',
  'FIGHT_PROP_GRASS_ADD_HURT', 'FIGHT_PROP_WIND_ADD_HURT', 'FIGHT_PROP_ROCK_ADD_HURT',
  'FIGHT_PROP_ICE_ADD_HURT', 'FIGHT_PROP_PHYSICAL_ADD_HURT',
]);
const RELIQUARY_PROP_LABELS = {
  FIGHT_PROP_HP: 'Vida', FIGHT_PROP_HP_PERCENT: 'Vida %',
  FIGHT_PROP_ATTACK: 'ATQ', FIGHT_PROP_ATTACK_PERCENT: 'ATQ %',
  FIGHT_PROP_DEFENSE: 'DEF', FIGHT_PROP_DEFENSE_PERCENT: 'DEF %',
  FIGHT_PROP_CRITICAL: 'Taxa Crítica', FIGHT_PROP_CRITICAL_HURT: 'Dano Crítico',
  FIGHT_PROP_CHARGE_EFFICIENCY: 'Recarga de Energia',
  FIGHT_PROP_ELEMENT_MASTERY: 'Proficiência Elemental',
  FIGHT_PROP_HEAL_ADD: 'Bônus de Cura',
  FIGHT_PROP_FIRE_ADD_HURT: 'Bônus de Dano Pyro', FIGHT_PROP_ELEC_ADD_HURT: 'Bônus de Dano Electro',
  FIGHT_PROP_WATER_ADD_HURT: 'Bônus de Dano Hydro', FIGHT_PROP_GRASS_ADD_HURT: 'Bônus de Dano Dendro',
  FIGHT_PROP_WIND_ADD_HURT: 'Bônus de Dano Anemo', FIGHT_PROP_ROCK_ADD_HURT: 'Bônus de Dano Geo',
  FIGHT_PROP_ICE_ADD_HURT: 'Bônus de Dano Cryo', FIGHT_PROP_PHYSICAL_ADD_HURT: 'Bônus de Dano Físico',
};
const RELIQUARY_SLOT_LABELS = {
  EQUIP_BRACER: 'Flor', EQUIP_NECKLACE: 'Pluma', EQUIP_SHOES: 'Ampulheta',
  EQUIP_RING: 'Cálice', EQUIP_DRESS: 'Coroa',
};

const RAW_BASE = 'https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store';
const ENKA_UI_BASE = 'https://enka.network/ui';

// `characters.json` guarda o ícone como "UI_AvatarIcon_Side_Nome" (sem
// caminho/extensão) e `gi/avatars.json` como "/ui/UI_AvatarIcon_Side_Nome.png"
// (com caminho e extensão) — isso normaliza os dois formatos pro mesmo nome
// de arquivo puro, pra montar a URL final sempre do mesmo jeito.
function normalizeIconName(raw) {
  if (!raw) return null;
  return String(raw).replace(/^\/?ui\//, '').replace(/\.png$/i, '');
}
function iconUrl(rawName) {
  const clean = normalizeIconName(rawName);
  return clean ? `${ENKA_UI_BASE}/${clean}.png` : null;
}

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

    // BUG CORRIGIDO: `characters.json` e `gi/avatars.json` às vezes têm um
    // NameTextMapHash levemente diferente pro mesmo personagem (visto em
    // Nefer, Zibai, Flins, Skirk, Varesa, Arlecchino) — e o hash de um dos
    // dois pode ainda não existir em loc.json, retornando nome vazio. Antes
    // o código fazia `{...chars1, ...chars2}`, deixando o hash de chars2
    // sempre vencer mesmo quando só o de chars1 resolvia. Agora testamos os
    // dois hashes (de cada fonte) pra cada id e usamos o que efetivamente
    // encontrar um nome.
    const ids = new Set([...Object.keys(chars1), ...Object.keys(chars2)]);
    const charMap = {};
    for (const id of ids) {
      const d1 = chars1[id];
      const d2 = chars2[id];
      const name = (d1 && locEn[String(d1.NameTextMapHash)])
        || (d2 && locEn[String(d2.NameTextMapHash)]);
      if (!name) continue;
      const data = d1 || d2;
      charMap[id] = {
        name,
        element: ELEMENT_MAP[data.Element] ?? (data.Element || ''),
        rarity: data.QualityType === 'QUALITY_ORANGE' ? 5 : 4,
        // Ícone oficial do personagem, servido pela própria Enka — não
        // depende de nenhuma imagem que a gente precise hospedar.
        icon: iconUrl(data.SideIconName ? data.SideIconName.replace('_Side_', '_') : null),
      };
    }

    const weaponMap = {};
    for (const [id, data] of Object.entries(weapons)) {
      const name = locEn[String(data.NameTextMapHash)];
      if (!name) continue;
      weaponMap[id] = {
        name,
        rarity: data.Rarity || 3,
        icon: iconUrl(data.Icon),
      };
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
  const known = weaponMap[String(eq.itemId)];
  const refineRaw = eq.weapon && eq.weapon.affixMap ? Object.values(eq.weapon.affixMap)[0] : 0;
  const stats = (eq.flat.weaponStats || []).map(s => ({
    label: RELIQUARY_PROP_LABELS[s.appendPropId] || s.appendPropId,
    value: formatStatValue(s.appendPropId, s.statValue),
  }));
  return {
    name: (known && known.name) || 'Arma desconhecida',
    icon: (known && known.icon) || null,
    rarity: (known && known.rarity) || eq.flat.rankLevel || 4,
    level: eq.weapon ? eq.weapon.level : null,
    refinement: (Number(refineRaw) || 0) + 1, // affixMap vem 0-4 -> nosso R1-R5
    stats,
  };
}

// Valores de prop na Enka vêm como fração pra tudo que é %, ex: 0.466 =
// 46.6%. As props "planas" (Vida, ATQ, DEF, Proficiência Elemental) vêm já
// no valor final.
function formatStatValue(propId, value) {
  const num = Number(value) || 0;
  const key = String(propId);
  const isPercent = PERCENT_PROP_IDS.has(key) || PERCENT_PROP_NAMES.has(key);
  if (isPercent) {
    return `${(num * 100).toFixed(1)}%`;
  }
  return Math.round(num).toLocaleString('pt-BR');
}

// Extrai os 5 artefatos equipados (flor/pluma/ampulheta/cálice/coroa) com
// status principal, substatus e o conjunto de cada peça — pra montar o card
// de build detalhado (igual ferramentas como Genshin Wizard/Akasha).
function getArtifactsFromEquip(equipList, locEn) {
  const pieces = (equipList || []).filter(e => e.flat && e.flat.itemType === 'ITEM_RELIQUARY');
  return pieces.map(piece => {
    const flat = piece.flat;
    const main = flat.reliquaryMainstat;
    const setName = locEn[String(flat.setNameTextMapHash || '')] || null;
    return {
      slot: RELIQUARY_SLOT_LABELS[flat.equipType] || flat.equipType,
      setName,
      rarity: flat.rankLevel || 5,
      level: piece.reliquary ? Math.max(0, (piece.reliquary.level || 1) - 1) : 0, // internamente level vem +1 (ex: +0 = level 1)
      icon: iconUrl(flat.icon),
      mainStat: main ? {
        label: RELIQUARY_PROP_LABELS[main.mainPropId] || main.mainPropId,
        value: formatStatValue(main.mainPropId, main.statValue),
      } : null,
      subStats: (flat.reliquarySubstats || []).map(s => ({
        label: RELIQUARY_PROP_LABELS[s.appendPropId] || s.appendPropId,
        value: formatStatValue(s.appendPropId, s.statValue),
      })),
    };
  });
}

// Monta o resumo da build (conjuntos de artefatos equipados, ex: "Coroa de
// Ouro x4" ou "Coração Flamejante x2 + Emblema do Coração Perdido x2") a
// partir dos mesmos artefatos já extraídos acima.
function summarizeSets(artifacts) {
  const setCounts = {};
  for (const piece of artifacts) {
    if (!piece.setName) continue;
    setCounts[piece.setName] = (setCounts[piece.setName] || 0) + 1;
  }
  const parts = Object.entries(setCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `${name} x${count}`);
  return parts.length ? parts.join(' + ') : null;
}

// Stats finais do personagem (depois de arma + artefatos), pro card de
// build detalhado — HP/ATQ/DEF, crítico, recarga de energia, etc.
function getFinalStats(avatarInfo) {
  const map = avatarInfo.fightPropMap || {};
  const order = ['2000','2001','2002','20','22','23','28','40','41','42','43','44','45','46','30','26'];
  return order
    .filter(id => map[id] !== undefined && (map[id] !== 0 || ['2000','2001','2002'].includes(id)))
    .map(id => ({ label: FIGHT_PROP_LABELS[id] || id, value: formatStatValue(id, map[id]) }));
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
    const artifacts = getArtifactsFromEquip(av.equipList, locEn || {});
    characters.push({
      avatarId: av.avatarId,
      name: (meta && meta.name) || `Personagem #${av.avatarId}`,
      element: meta ? meta.element : '',
      rarity: meta ? meta.rarity : 4,
      icon: meta ? meta.icon : null,
      level: getLevel(av),
      constellation: (av.talentIdList || []).length,
      weapon: getWeaponFromEquip(av.equipList, weaponMap),
      build: summarizeSets(artifacts),
      artifacts,
      stats: getFinalStats(av),
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
      icon: meta ? meta.icon : null,
      level: av.level || null,
      constellation: 0, // desconhecida — assume C0 por segurança
      weapon: null,
      build: null,
      artifacts: [],
      stats: [],
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
