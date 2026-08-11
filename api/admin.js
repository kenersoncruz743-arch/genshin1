// api/admin.js
const sheets = require('../lib/sheets');

module.exports = async function adminHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, msg: 'Método não permitido.' });
  }

  const body = req.body || {};

  try {
    if (body.action === 'updateCharacterCost') {
      const { requesterId, name, level, value } = body;
      await sheets.updateCharacterCost({ requesterId, name, level, value });
      return res.status(200).json({ ok: true });
    }

    if (body.action === 'updateWeaponCost') {
      const { requesterId, name, level, value } = body;
      await sheets.updateWeaponCost({ requesterId, name, level, value });
      return res.status(200).json({ ok: true });
    }

    if (body.action === 'updateDeckPointLimit') {
      const { requesterId, value } = body;
      await sheets.setDeckPointLimit(requesterId, value);
      return res.status(200).json({ ok: true });
    }

    if (body.action === 'getDeckPointLimit') {
      const limit = await sheets.getDeckPointLimit();
      return res.status(200).json({ ok: true, limit });
    }

    return res.status(400).json({ ok: false, msg: 'Ação desconhecida: ' + body.action });
  } catch (err) {
    return res.status(400).json({ ok: false, msg: err.message });
  }
};
