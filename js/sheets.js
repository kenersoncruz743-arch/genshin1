/*
  Lê dados de uma planilha Google pública (compartilhada como "Qualquer pessoa
  com o link — Leitor") sem precisar de chave de API, usando o endpoint gviz.

  Estrutura esperada das abas:

  Aba "Personagens": Nome | Elemento | Raridade | Custo | ImagemURL
  Aba "Armas":        Nome | Raridade | Custo | ImagemURL
*/

function csvToRows(csvText){
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for(let i=0;i<csvText.length;i++){
    const c = csvText[i];
    if(inQuotes){
      if(c === '"'){
        if(csvText[i+1] === '"'){ field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if(c === '"') inQuotes = true;
      else if(c === ','){ row.push(field); field=''; }
      else if(c === '\n'){ row.push(field); rows.push(row); row=[]; field=''; }
      else if(c === '\r'){ /* ignore */ }
      else field += c;
    }
  }
  if(field.length || row.length){ row.push(field); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim() !== ''));
}

function rowsToObjects(rows){
  const header = rows[0].map(h => h.trim());
  return rows.slice(1).map(r => {
    const obj = {};
    header.forEach((h,i) => obj[h] = (r[i] || '').trim());
    return obj;
  });
}

async function fetchSheetTab(sheetId, tabName){
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
  const res = await fetch(url);
  if(!res.ok){
    throw new Error(`Não foi possível ler a aba "${tabName}" (status ${res.status}). Verifique se a planilha está compartilhada como "Qualquer pessoa com o link — Leitor".`);
  }
  const csv = await res.text();
  return rowsToObjects(csvToRows(csv));
}

async function loadCharacters(){
  const cfg = window.APP_CONFIG;
  const rows = await fetchSheetTab(cfg.SHEET_ID, cfg.SHEET_TAB_CHARACTERS);
  return rows.map((r,i) => ({
    id: 'c' + i,
    name: r.Nome || r.nome || '',
    element: r.Elemento || r.elemento || '',
    rarity: parseInt(r.Raridade || r.raridade || '4', 10),
    cost: parseInt(r.Custo || r.custo || '0', 10),
    image: r.ImagemURL || r.imagemurl || r.Imagem || ''
  })).filter(c => c.name);
}

async function loadWeapons(){
  const cfg = window.APP_CONFIG;
  const rows = await fetchSheetTab(cfg.SHEET_ID, cfg.SHEET_TAB_WEAPONS);
  return rows.map((r,i) => ({
    id: 'w' + i,
    name: r.Nome || r.nome || '',
    element: null,
    rarity: parseInt(r.Raridade || r.raridade || '4', 10),
    cost: parseInt(r.Custo || r.custo || '0', 10),
    image: r.ImagemURL || r.imagemurl || r.Imagem || ''
  })).filter(w => w.name);
}
