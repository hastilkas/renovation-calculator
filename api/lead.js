// Функция Vercel: POST /api/lead. Токен бота живёт только здесь,
// в переменных окружения, и в браузер не попадает.
import { handleLead } from '../lib/lead.js';

const MAX_BODY = 16 * 1024;

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_BODY) throw new Error('too large');
  }
  return JSON.parse(raw || '{}');
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { ok: false, error: 'Method not allowed' });
  }

  let body;
  try {
    body = await readJson(req);
  } catch {
    return send(res, 400, { ok: false, error: 'Некорректный запрос.' });
  }

  const ip = String(req.headers['x-forwarded-for'] ?? req.socket?.remoteAddress ?? '').split(',')[0].trim();
  const { status, body: out } = await handleLead(body, { ip, userAgent: req.headers['user-agent'] ?? '' });
  return send(res, status, out);
}
