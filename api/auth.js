// api/auth.js
const sheets = require('../lib/sheets');

module.exports = async function authHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, msg: 'Método não permitido.' });
  }

  const { action, email, password, username } = req.body || {};

  try {
    if (action === 'signup') {
      const user = await sheets.signUp({ email, password, username });
      return res.status(200).json({ ok: true, user });
    }
    if (action === 'login') {
      const user = await sheets.logIn({ email, password });
      return res.status(200).json({ ok: true, user });
    }
    return res.status(400).json({ ok: false, msg: 'Ação desconhecida: ' + action });
  } catch (err) {
    return res.status(400).json({ ok: false, msg: err.message });
  }
};
