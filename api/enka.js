// api/enka.js
const sheets = require('../lib/sheets');

module.exports = async function enkaHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, msg: 'Método não permitido.' });
  }

  const body = req.body || {};

  try {
    if (body.action === 'previewUID') {
      const { uid } = body;
      if (!uid) throw new Error('uid é obrigatório.');
      const resultado = await sheets.previewUID(uid);
      return res.status(200).json({ ok: true, ...resultado });
    }

    if (body.action === 'salvarSelecionados') {
      const { userId, uid, selecionados } = body;
      if (!userId || !uid) throw new Error('userId e uid são obrigatórios.');
      const resultado = await sheets.saveSelectedFromUID(userId, uid, selecionados || []);
      return res.status(200).json({ ok: true, ...resultado });
    }

    if (body.action === 'meuPerfilJogo') {
      const { userId } = body;
      const perfil = await sheets.getUserGameProfile(userId);
      return res.status(200).json({ ok: true, perfil });
    }

    return res.status(400).json({ ok: false, msg: 'Ação desconhecida: ' + body.action });
  } catch (err) {
    return res.status(400).json({ ok: false, msg: err.message });
  }
};
