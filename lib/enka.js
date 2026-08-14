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

// Nomes legíveis (PT-BR) pros status de artefato — a Enka só manda o ID
// interno do jogo (ex: "FIGHT_PROP_CRITICAL_HURT").
const PROP_NAMES = {
  FIGHT_PROP_HP: 'HP', FIGHT_PROP_HP_PERCENT: 'HP',
  FIGHT_PROP_ATTACK: 'ATQ', FIGHT_PROP_ATTACK_PERCENT: 'ATQ',
  FIGHT_PROP_DEFENSE: 'DEF', FIGHT_PROP_DEFENSE_PERCENT: 'DEF',
  FIGHT_PROP_ELEMENT_MASTERY: 'Domínio Elemental',
  FIGHT_PROP_CRITICAL: 'Taxa de Crítico',
  FIGHT_PROP_CRITICAL_HURT: 'Dano de Crítico',
  FIGHT_PROP_CHARGE_EFFICIENCY: 'Recarga de Energia',
  FIGHT_PROP_HEAL_ADD: 'Bônus de Cura',
  FIGHT_PROP_FIRE_ADD_HURT: 'Bônus de Dano Pyro',
  FIGHT_PROP_ELEC_ADD_HURT: 'Bônus de Dano Electro',
  FIGHT_PROP_WATER_ADD_HURT: 'Bônus de Dano Hydro',
  FIGHT_PROP_ICE_ADD_HURT: 'Bônus de Dano Cryo',
  FIGHT_PROP_WIND_ADD_HURT: 'Bônus de Dano Anemo',
  FIGHT_PROP_ROCK_ADD_HURT: 'Bônus de Dano Geo',
  FIGHT_PROP_GRASS_ADD_HURT: 'Bônus de Dano Dendro',
  FIGHT_PROP_PHYSICAL_ADD_HURT: 'Bônus de Dano Físico',
};
// Props cujo statValue já vem como percentual (a Enka manda o número pronto,
// só falta o "%" na exibição).
const PERCENT_PROPS = new Set([
  'FIGHT_PROP_HP_PERCENT', 'FIGHT_PROP_ATTACK_PERCENT', 'FIGHT_PROP_DEFENSE_PERCENT',
  'FIGHT_PROP_CRITICAL', 'FIGHT_PROP_CRITICAL_HURT', 'FIGHT_PROP_CHARGE_EFFICIENCY',
  'FIGHT_PROP_HEAL_ADD', 'FIGHT_PROP_FIRE_ADD_HURT', 'FIGHT_PROP_ELEC_ADD_HURT',
  'FIGHT_PROP_WATER_ADD_HURT', 'FIGHT_PROP_ICE_ADD_HURT', 'FIGHT_PROP_WIND_ADD_HURT',
  'FIGHT_PROP_ROCK_ADD_HURT', 'FIGHT_PROP_GRASS_ADD_HURT', 'FIGHT_PROP_PHYSICAL_ADD_HURT',
]);
function propLabel(id) { return PROP_NAMES[id] || id; }
function formatStatValue(id, value) {
  if (value === undefined || value === null) return '';
  const n = Number(value);
  return PERCENT_PROPS.has(id) ? `${n.toFixed(1)}%` : Math.round(n).toString();
}

// Peça do conjunto (slot) -> rótulo em PT-BR.
const ARTIFACT_SLOT_NAMES = {
  EQUIP_BRACER: 'Flor',
  EQUIP_NECKLACE: 'Pluma',
  EQUIP_SHOES: 'Ampulheta',
  EQUIP_RING: 'Cálice',
  EQUIP_DRESS: 'Coroa',
};
const ARTIFACT_SLOT_ORDER = ['EQUIP_BRACER', 'EQUIP_NECKLACE', 'EQUIP_SHOES', 'EQUIP_RING', 'EQUIP_DRESS'];

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

function normalizeIconPath(p) {
  if (!p) return '';
  if (!p.startsWith('/')) p = '/ui/' + p;
  if (!/\.(png|webp|jpg)$/i.test(p)) p += '.png';
  return p;
}

const ENKA_ASSET_BASE = 'https://enka.network';

// Personagens muito recentes (recém-anunciados) às vezes já têm ícone e ID
// na Enka, mas ainda sem o texto do nome traduzido publicado — nesse caso
// a gente cai pro "codinome" interno do próprio arquivo do ícone (ex:
// "UI_AvatarIcon_Side_Skirk.png" -> "Skirk") em vez de mostrar só o ID
// numérico ("Personagem #10000114"). Alguns registros de teste reaproveitam
// o ícone de um personagem já existente — filtramos esses depois, pra não
// sobrescrever o personagem real com um nome/ID errado.
function fallbackNameFromIcon(iconPath) {
  const m = /UI_AvatarIcon_Side_([A-Za-z0-9]+)\.(?:png|webp|jpg)$/i.exec(iconPath || '');
  if (!m) return '';
  return m[1]
    .replace(/New$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
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
    // gi/avatars.json tem os caminhos de ícone no formato certo (com /ui/ e
    // .png) — processado por último de propósito, pra ganhar de
    // characters.json quando os dois têm o mesmo personagem.
    const merged = { ...chars1, ...chars2 };

    // Nomes já resolvidos oficialmente pela Enka — usado a seguir pra evitar
    // que um fallback por ícone reaproveitado "roube" o nome de um
    // personagem que já existe de verdade.
    const officialNames = new Set();
    for (const data of Object.values(merged)) {
      const n = locEn[String(data.NameTextMapHash)];
      if (n) officialNames.add(n.toLowerCase());
    }

    const charMap = {};
    for (const [id, data] of Object.entries(merged)) {
      let name = locEn[String(data.NameTextMapHash)];
      const iconPath = normalizeIconPath(data.SideIconName || data.IconName || '');
      if (!name) {
        const fallback = fallbackNameFromIcon(iconPath);
        // Só usa o fallback se não colidir com o nome de um personagem já
        // publicado oficialmente (evita sobrescrever, ex., a Arlecchino de
        // verdade com um registro de teste que reaproveita o ícone dela).
        if (!fallback || officialNames.has(fallback.toLowerCase())) continue;
        name = fallback;
      }
      charMap[id] = {
        name,
        element: ELEMENT_MAP[data.Element] ?? (data.Element || ''),
        rarity: data.QualityType === 'QUALITY_ORANGE' ? 5 : 4,
        image: iconPath ? ENKA_ASSET_BASE + iconPath : '',
      };
    }

    const weaponMap = {};
    for (const [id, data] of Object.entries(weapons)) {
      const name = locEn[String(data.NameTextMapHash)];
      if (!name) continue;
      const iconPath = normalizeIconPath(data.Icon || '');
      weaponMap[id] = { name, rarity: data.Rarity || 3, image: iconPath ? ENKA_ASSET_BASE + iconPath : '' };
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

// Extrai os 5 artefatos equipados (flor/pluma/ampulheta/cálice/coroa) do
// mesmo equipList de onde vem a arma. Cada peça já traz o essencial pronto
// no campo "flat" da própria Enka — nome do conjunto, status principal,
// status secundários e ícone — sem precisar de outra chamada à API.
function getArtifactsFromEquip(equipList, locEn) {
  const pieces = (equipList || []).filter(e => e.flat && e.flat.itemType === 'ITEM_RELIQUARY');
  const bySlot = {};
  for (const eq of pieces) {
    const flat = eq.flat;
    const slot = flat.equipType;
    const setHash = String(flat.setNameTextMapHash || '');
    const mainId = flat.reliquaryMainstat ? flat.reliquaryMainstat.mainPropId : null;
    const mainVal = flat.reliquaryMainstat ? flat.reliquaryMainstat.statValue : null;
    const subs = (flat.reliquarySubstats || []).map(s => ({
      label: propLabel(s.appendPropId),
      value: formatStatValue(s.appendPropId, s.statValue),
    }));
    const iconPath = normalizeIconPath(flat.icon || '');
    bySlot[slot] = {
      slot,
      slotName: ARTIFACT_SLOT_NAMES[slot] || slot,
      setName: locEn[setHash] || 'Conjunto desconhecido',
      rarity: flat.rankLevel || 0,
      level: eq.reliquary ? Math.max(0, (eq.reliquary.level || 1) - 1) : 0, // Enka manda 1-21 (+0 a +20)
      mainStat: mainId ? { label: propLabel(mainId), value: formatStatValue(mainId, mainVal) } : null,
      subStats: subs,
      image: iconPath ? ENKA_ASSET_BASE + iconPath : '',
    };
  }
  return ARTIFACT_SLOT_ORDER.map(slot => bySlot[slot] || null).filter(Boolean);
}

// Conta quantas peças de cada conjunto estão equipadas — pra saber se o
// personagem tem bônus de 2 ou 4 peças ativo.
function summarizeArtifactSets(artifacts) {
  const counts = {};
  for (const a of artifacts) counts[a.setName] = (counts[a.setName] || 0) + 1;
  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

// fightPropMap vem com as chaves como o ID NUMÉRICO interno do jogo (não o
// nome tipo "FIGHT_PROP_HP") — esse já é o valor FINAL calculado pela própria
// Enka (base + arma + artefato + conjunto), não precisamos recalcular nada.
const FINAL_STAT_IDS = {
  hp: '2000', atk: '2001', def: '2002',
  critRate: '20', critDmg: '22', energyRecharge: '23', elementMastery: '28',
};
function extractFinalStats(av) {
  const m = av.fightPropMap || {};
  const num = id => Number(m[id] || 0);
  const hp = Math.round(num(FINAL_STAT_IDS.hp));
  const atk = Math.round(num(FINAL_STAT_IDS.atk));
  const def = Math.round(num(FINAL_STAT_IDS.def));
  const critRate = num(FINAL_STAT_IDS.critRate) * 100;
  const critDmg = num(FINAL_STAT_IDS.critDmg) * 100;
  const er = num(FINAL_STAT_IDS.energyRecharge) * 100;
  const em = Math.round(num(FINAL_STAT_IDS.elementMastery));
  // "Valor de Crítico" (CV): a mesma conta que ferramentas tipo Akasha usam
  // pra resumir crit rate + crit dmg num único número (2x rate + dmg).
  const cv = critRate * 2 + critDmg;
  return {
    hp, atk, def, em,
    critRate: Number(critRate.toFixed(1)),
    critDmg: Number(critDmg.toFixed(1)),
    energyRecharge: Number(er.toFixed(1)),
    critValue: Number(cv.toFixed(1)),
  };
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
    const artifacts = getArtifactsFromEquip(av.equipList, locEn);
    characters.push({
      avatarId: av.avatarId,
      name: (meta && meta.name) || `Personagem #${av.avatarId}`,
      element: meta ? meta.element : '',
      rarity: meta ? meta.rarity : 4,
      image: meta ? meta.image : '',
      level: getLevel(av),
      constellation: (av.talentIdList || []).length,
      weapon: getWeaponFromEquip(av.equipList, weaponMap),
      artifacts,
      artifactSets: summarizeArtifactSets(artifacts),
      stats: extractFinalStats(av),
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
      image: meta ? meta.image : '',
      level: av.level || null,
      constellation: 0, // desconhecida — assume C0 por segurança
      weapon: null,
      artifacts: [],
      artifactSets: [],
      stats: null,
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

// Acha o avatarId (ID interno do jogo) a partir do nome do personagem —
// usado pela calculadora de dano pra saber qual personagem pedir na API de
// talentos, já que ela também indexa por avatarId (mesma fonte de dados do
// jogo que a Enka usa).
async function getAvatarIdByName(name) {
  const { charMap } = await getMaps();
  const norm = s => String(s || '').trim().toLowerCase();
  const target = norm(name);
  for (const [id, meta] of Object.entries(charMap)) {
    if (norm(meta.name) === target) return id;
  }
  return null;
}

module.exports = { fetchProfile, getMaps, getAvatarIdByName };
