import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLead, buildMessage, handleLead, telegramConfig, looksLikeSpam,
} from '../lib/lead.js';

const validBody = (over = {}) => ({
  answers: { object: 'new', area: 84, rooms: 3, baths: 1, repair: 'capital', materials: 'standard', options: ['waste'], start: 'now' },
  contact: { name: 'Илья', phone: '+7 (916) 123-45-67', method: 'whatsapp', comment: 'Кухня <b>и</b> & коридор' },
  sheetNo: '3720',
  website: '',
  meta: { utm: { utm_source: 'yandex', utm_campaign: 'remont_msk', evil: 'x' }, page: 'https://site.ru/?a=1&b=2', referrer: '', fillSeconds: 40 },
  ...over,
});

const env = { TELEGRAM_BOT_TOKEN: '123:abc', TELEGRAM_CHAT_ID: '111, -100222' };
let ipCounter = 0;
const freshIp = () => `10.0.0.${++ipCounter}`;

function fakeTelegram({ ok = true } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return { status: ok ? 200 : 400, json: async () => (ok ? { ok: true } : { ok: false, description: 'Bad Request' }) };
  };
  return { calls, fetchImpl };
}

test('смета пересчитывается на сервере, цифры из браузера не используются', () => {
  const lead = parseLead(validBody({ estimate: { total: 1 }, total: 1 }));
  assert.equal(lead.estimate.answers.area, 84);
  assert.ok(lead.estimate.total > 1_000_000);
  assert.equal(lead.contact.phone, '79161234567');
  assert.deepEqual(Object.keys(lead.meta.utm), ['utm_source', 'utm_campaign']);
});

test('без имени или с неполным номером заявка отклоняется', () => {
  assert.throws(() => parseLead(validBody({ contact: { name: ' ', phone: '+79161234567' } })), /имя/);
  assert.throws(() => parseLead(validBody({ contact: { name: 'Аня', phone: '123' } })), /телефон/);
  assert.throws(() => parseLead(null), /Пустой/);
});

test('сообщение экранирует ввод пользователя и содержит всё для менеджера', () => {
  const text = buildMessage(parseLead(validBody()), { userAgent: 'Mozilla/5.0 (iPhone)' });
  assert.match(text, /Заявка № 3720/);
  assert.match(text, /#горячий/);
  assert.match(text, /Кухня &lt;b&gt;и&lt;\/b&gt; &amp; коридор/);
  assert.match(text, /wa\.me\/79161234567/);
  assert.match(text, /84 м², 3 комнаты, 1 санузел/);
  assert.match(text, /utm_source: yandex/);
  assert.match(text, /a=1&amp;b=2/);
  assert.match(text, /устройство: телефон/);
  assert.doesNotMatch(text, /evil/);
});

test('холодная заявка без хэштега #горячий', () => {
  const body = validBody();
  body.answers.start = 'later';
  assert.doesNotMatch(buildMessage(parseLead(body)), /#горячий/);
});

test('заявка уходит во все указанные чаты', async () => {
  const tg = fakeTelegram();
  const res = await handleLead(validBody(), { ip: freshIp(), env, fetchImpl: tg.fetchImpl });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true, id: '3720' });
  assert.deepEqual(tg.calls.map((c) => c.body.chat_id), ['111', '-100222']);
  assert.ok(tg.calls[0].url.endsWith('/bot123:abc/sendMessage'));
  assert.equal(tg.calls[0].body.parse_mode, 'HTML');
});

test('если Telegram отказал во всех чатах, клиент получает ошибку', async () => {
  const tg = fakeTelegram({ ok: false });
  const res = await handleLead(validBody(), { ip: freshIp(), env, fetchImpl: tg.fetchImpl });
  assert.equal(res.status, 502);
  assert.equal(res.body.ok, false);
});

test('без токена работает демо-режим', async () => {
  const tg = fakeTelegram();
  const res = await handleLead(validBody(), { ip: freshIp(), env: {}, fetchImpl: tg.fetchImpl });
  assert.deepEqual(res.body, { ok: true, id: '3720', demo: true });
  assert.equal(tg.calls.length, 0);
});

test('бот с заполненной ловушкой или слишком быстрый получает «успех», но в Telegram ничего не уходит', async () => {
  for (const body of [validBody({ website: 'http://spam' }), validBody({ meta: { fillSeconds: 1 } })]) {
    const tg = fakeTelegram();
    const res = await handleLead(body, { ip: freshIp(), env, fetchImpl: tg.fetchImpl });
    assert.equal(res.body.ok, true);
    assert.equal(tg.calls.length, 0);
  }
  assert.equal(looksLikeSpam(parseLead(validBody())), false);
});

test('шестая заявка с одного IP за 10 минут отклоняется', async () => {
  const ip = freshIp();
  const tg = fakeTelegram();
  for (let i = 0; i < 5; i++) {
    assert.equal((await handleLead(validBody(), { ip, env, fetchImpl: tg.fetchImpl })).status, 200);
  }
  assert.equal((await handleLead(validBody(), { ip, env, fetchImpl: tg.fetchImpl })).status, 429);
});

test('настройки Telegram читаются из окружения', () => {
  assert.equal(telegramConfig({}), null);
  assert.equal(telegramConfig({ TELEGRAM_BOT_TOKEN: 'x' }), null);
  assert.deepEqual(telegramConfig(env), { token: '123:abc', chatIds: ['111', '-100222'] });
});
