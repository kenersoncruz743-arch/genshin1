// api/damage.js
const enka = require('../lib/enka');
const talents = require('../lib/talents');

module.exports = async function damageHandler(req, res) {
  try {
    // GET /api/damage?personagem=Mualani -> lista de talentos + multiplicadores por nível
    if (req.method === 'GET' && req.query.personagem) {
      const avatarId = await enka.getAvatarIdByName(req.query.personagem);
      if (!avatarId) {
        return res.status(404).json({ ok: false, msg: `"${req.query.personagem}" não foi encontrado.` });
      }
      const data = await talents.getCharacterTalents(avatarId);
      return res.status(200).json({ ok: true, ...data });
    }

    return res.status(400).json({ ok: false, msg: 'Requisição inválida — informe ?personagem=Nome.' });
  } catch (err) {
    return res.status(400).json({ ok: false, msg: err.message });
  }
};
