// netlify/functions/api.js
const authHandler = require('../../api/auth');
const personagensHandler = require('../../api/personagens');
const partidaHandler = require('../../api/partida');

function buildReq(event) {
  const body = event.body
    ? (() => { try { return JSON.parse(event.body); } catch { return {}; } })()
    : {};

  return {
    method: event.httpMethod,
    body,
    query: event.queryStringParameters || {},
    headers: event.headers || {},
    path: event.path,
  };
}

function buildRes() {
  let _status = 200;
  let _headers = { 'Content-Type': 'application/json' };
  let _body = '';

  const res = {
    status(code) { _status = code; return res; },
    setHeader(k, v) { _headers[k] = v; return res; },
    json(data) { _body = JSON.stringify(data); return res; },
    end() { return res; },
    getResult() {
      return { statusCode: _status, headers: _headers, body: _body };
    },
  };
  return res;
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const path = event.path.replace('/.netlify/functions/api', '').replace('/api', '');
  const req = buildReq(event);
  const res = buildRes();

  try {
    if (path === '/auth' || path === '/auth/') {
      await authHandler(req, res);
    } else if (path.startsWith('/personagens')) {
      await personagensHandler(req, res);
    } else if (path.startsWith('/partida')) {
      await partidaHandler(req, res);
    } else {
      return { statusCode: 404, headers, body: JSON.stringify({ ok: false, msg: 'Rota não encontrada: ' + path }) };
    }

    const result = res.getResult();
    return { ...result, headers: { ...headers, ...result.headers } };

  } catch (err) {
    console.error('[NETLIFY FUNCTION] Erro:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, msg: 'Erro interno: ' + err.message }),
    };
  }
};
