// Серверная часть заявки: проверка, пересчёт сметы, текст для Telegram, отправка.
// Не зависит от платформы: её вызывают и функция Vercel, и локальный server.js.
import { BRAND, CONTACT_METHODS } from '../public/js/config.js';
import {
  calculate, describe, normalizePhone, formatPhone, formatRub, plural, contactTitle,
} from '../public/js/calc.js';

const MIN_FILL_SECONDS = 4;
const RATE_LIMIT = { windowMs: 10 * 60 * 1000, max: 5 };
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'yclid', 'gclid'];

export class LeadError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const escapeHtml = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const clip = (s, max) => String(s ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, max);

// Цифры сметы сервер считает сам: из браузера берём только ответы на вопросы.
export function parseLead(body) {
  if (!body || typeof body !== 'object') throw new LeadError('Пустой запрос.');
  const contact = body.contact ?? {};
  const meta = body.meta ?? {};

  const name = clip(contact.name, 60);
  if (!name) throw new LeadError('Укажите имя.');
  const phone = normalizePhone(contact.phone);
  if (!phone) throw new LeadError('Проверьте номер телефона.');

  const method = CONTACT_METHODS.some((m) => m.id === contact.method) ? contact.method : 'call';
  const utm = Object.fromEntries(
    UTM_KEYS.filter((k) => meta.utm?.[k]).map((k) => [k, clip(meta.utm[k], 200)]),
  );

  return {
    id: /^\d{4}$/.test(body.sheetNo) ? body.sheetNo : String(1000 + Math.floor(Math.random() * 9000)),
    estimate: calculate(body.answers),
    contact: { name, phone, method, comment: clip(contact.comment, 500) },
    meta: {
      utm,
      page: clip(meta.page, 500),
      referrer: clip(meta.referrer, 500),
      fillSeconds: Number.isFinite(meta.fillSeconds) ? Math.max(0, Math.round(meta.fillSeconds)) : null,
    },
    honeypot: clip(body.website, 200),
  };
}

// Ботов отсекаем молча: они получают «успех», а в Telegram ничего не уходит.
export function looksLikeSpam(lead) {
  if (lead.honeypot) return true;
  if (lead.meta.fillSeconds !== null && lead.meta.fillSeconds < MIN_FILL_SECONDS) return true;
  return false;
}

export function buildMessage(lead, { userAgent = '' } = {}) {
  const { estimate: e, contact: c, meta } = lead;
  const a = e.answers;
  const d = describe(a);
  const lines = [];

  lines.push(`<b>Заявка № ${lead.id}</b> · калькулятор ремонта`);
  lines.push(d.hot ? '#заявка #горячий' : '#заявка');
  lines.push('');
  lines.push(`👤 ${escapeHtml(c.name)}`);
  // tel: ссылки Telegram не принимает, но номер в тексте сам делает кликабельным.
  lines.push(`📞 ${formatPhone(c.phone)} · ${contactTitle(c.method)}`);
  if (c.method === 'whatsapp') lines.push(`💬 <a href="https://wa.me/${c.phone}">Написать в WhatsApp</a>`);
  if (c.method === 'telegram') lines.push(`💬 <a href="https://t.me/+${c.phone}">Написать в Telegram</a>`);
  if (c.comment) lines.push(`📝 <i>${escapeHtml(c.comment)}</i>`);
  lines.push('');
  lines.push(`🏠 ${d.object}, ${a.area} м², ${a.rooms} ${plural(a.rooms, ['комната', 'комнаты', 'комнат'])}, ${a.baths} ${plural(a.baths, ['санузел', 'санузла', 'санузлов'])}`);
  lines.push(`🛠 Ремонт: ${d.repair}`);
  lines.push(`🧱 Материалы: ${d.materials}`);
  lines.push(`➕ Доп. работы: ${d.options.length ? d.options.join(', ') : 'нет'}`);
  lines.push(`🗓 Старт: ${d.start}`);
  lines.push('');
  lines.push(`💰 <b>${formatRub(e.low)} – ${formatRub(e.high)}</b>`);
  lines.push(`   работы ${formatRub(e.lines.works)}, санузлы ${formatRub(e.lines.baths)}, материалы ${formatRub(e.lines.materials)}, доп. ${formatRub(e.lines.options)}`);
  lines.push(`⏱ Срок ≈ ${e.weeks} ${plural(e.weeks, ['неделя', 'недели', 'недель'])} · ${formatRub(e.perM2)} за м²`);

  const utm = Object.entries(meta.utm);
  const source = [];
  if (utm.length) source.push(...utm.map(([k, v]) => `${k}: ${escapeHtml(v)}`));
  if (meta.referrer) source.push(`referrer: ${escapeHtml(meta.referrer)}`);
  if (meta.page) source.push(`страница: ${escapeHtml(meta.page)}`);
  if (meta.fillSeconds !== null) source.push(`заполнил за ${meta.fillSeconds} с`);
  const device = /Mobi|Android|iPhone/i.test(userAgent) ? 'телефон' : 'компьютер';
  source.push(`устройство: ${device}`);
  lines.push('');
  lines.push(`<blockquote expandable>📊 Источник\n${source.join('\n')}</blockquote>`);

  return lines.join('\n');
}

export async function sendToTelegram(text, { token, chatIds, fetchImpl = fetch }) {
  const results = await Promise.all(chatIds.map(async (chatId) => {
    const res = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) console.error(`Telegram ${chatId}: ${res.status} ${data.description ?? ''}`);
    return Boolean(data.ok);
  }));
  // Заявка считается доставленной, если дошла хотя бы до одного чата.
  if (!results.some(Boolean)) throw new LeadError('Не удалось доставить заявку.', 502);
}

// Ограничение частоты по IP. На бессерверном хостинге память живёт, пока
// жив экземпляр функции, так что это защита от тупого перебора, не от атаки.
const hits = new Map();
export function rateLimited(ip, now = Date.now()) {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > RATE_LIMIT.max;
}

export function telegramConfig(env = process.env) {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatIds = (env.TELEGRAM_CHAT_ID ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return token && chatIds.length ? { token, chatIds } : null;
}

// Полный цикл обработки заявки. Возвращает { status, body } для ответа клиенту.
export async function handleLead(body, { ip = '', userAgent = '', env = process.env, fetchImpl = fetch } = {}) {
  try {
    if (rateLimited(ip)) throw new LeadError('Слишком много заявок подряд. Попробуйте через несколько минут.', 429);
    const lead = parseLead(body);
    if (looksLikeSpam(lead)) return { status: 200, body: { ok: true, id: lead.id } };

    const text = buildMessage(lead, { userAgent });
    const tg = telegramConfig(env);
    if (!tg) {
      console.log(`[demo] TELEGRAM_BOT_TOKEN не задан, заявка не отправлена:\n${text}\n`);
      return { status: 200, body: { ok: true, id: lead.id, demo: true } };
    }
    await sendToTelegram(text, { ...tg, fetchImpl });
    return { status: 200, body: { ok: true, id: lead.id } };
  } catch (err) {
    if (err instanceof LeadError) return { status: err.status, body: { ok: false, error: err.message } };
    console.error(err);
    return { status: 500, body: { ok: false, error: `Сервер не принял заявку. Позвоните: ${BRAND.phone}.` } };
  }
}
