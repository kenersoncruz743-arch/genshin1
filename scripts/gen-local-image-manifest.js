// scripts/gen-local-image-manifest.js
//
// Gera lib/local-images.json: a lista real de arquivos que existem em
// public/img/characters e public/img/weapons.
//
// Por quê: a planilha (coluna "ImagemURL") às vezes aponta pra um arquivo
// local que nunca foi enviado ao repositório, o que gera 404 em cascata no
// site. O código usa esse manifesto pra só confiar num caminho local
// quando o arquivo realmente existe — senão cai pro ícone oficial da
// Enka.Network. Rode `node scripts/gen-local-image-manifest.js` sempre que
// adicionar/remover imagens em public/img/.
const fs = require('fs');
const path = require('path');

function listFiles(dir) {
  try {
    return fs.readdirSync(dir).filter(f => /\.(webp|png|jpe?g)$/i.test(f));
  } catch {
    return [];
  }
}

const base = path.join(__dirname, '..', 'public', 'img');
const manifest = {
  characters: listFiles(path.join(base, 'characters')),
  weapons: listFiles(path.join(base, 'weapons')),
};

const outPath = path.join(__dirname, '..', 'lib', 'local-images.json');
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`OK: ${manifest.characters.length} personagens, ${manifest.weapons.length} armas -> ${outPath}`);
