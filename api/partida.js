// api/partida.js
const sheets = require('../lib/sheets');

module.exports = async function partidaHandler(req, res) {
  try {
    // GET /api/partida?id=CODIGO -> usado pro polling (a cada poucos segundos)
    if (req.method === 'GET') {
      const id = req.query.id;
      if (!id) return res.status(400).json({ ok: false, msg: 'Informe o código da partida (?id=).' });
      const match = await sheets.getMatch(id);
      return res.status(200).json({ ok: true, match });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, msg: 'Método não permitido.' });
    }

    const body = req.body || {};

    if (body.action === 'create') {
      const { hostId, hostName, config, estado } = body;
      const result = await sheets.createMatch({ hostId, hostName, config, estado });
      return res.status(200).json({ ok: true, partidaId: result.partidaId });
    }

    if (body.action === 'join') {
      const { partidaId, userId, userName } = body;
      const match = await sheets.joinMatch({ partidaId, userId, userName });
      return res.status(200).json({ ok: true, match });
    }

    if (body.action === 'pick') {
      const { partidaId, userId, estado, versaoEsperada } = body;
      const { conflito, match } = await sheets.updateMatchState({ partidaId, userId, estado, versaoEsperada });
      return res.status(200).json({ ok: true, conflito, match });
    }

    if (body.action === 'finalizar') {
      const { partidaId, requesterId, pontosJ1, pontosJ2, vencedor } = body;
      const match = await sheets.setFinalScore({ partidaId, requesterId, pontosJ1, pontosJ2, vencedor });
      return res.status(200).json({ ok: true, match });
    }

    return res.status(400).json({ ok: false, msg: 'Ação desconhecida: ' + body.action });
  } catch (err) {
    return res.status(400).json({ ok: false, msg: err.message });
  }
};
