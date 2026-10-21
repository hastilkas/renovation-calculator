import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculate, normalizeAnswers, normalizePhone, formatPhone, formatRub, formatShort, plural,
} from '../public/js/calc.js';
import { AREA, DEFAULTS } from '../public/js/config.js';

const base = {
  object: 'secondary', area: 50, rooms: 2, baths: 1,
  repair: 'capital', materials: 'none', options: [], start: 'now',
};

test('работы считаются от площади, расценки и коэффициента объекта', () => {
  const r = calculate(base);
  assert.equal(r.lines.works, 50 * 10500);
  assert.equal(r.lines.baths, 140000);
  assert.equal(r.lines.materials, 0);
  assert.equal(r.total, 525000 + 140000);

  const bare = calculate({ ...base, object: 'new' });
  assert.equal(bare.lines.works, Math.round((50 * 10500 * 1.15) / 1000) * 1000);
});

test('материалы считаются долей от работ и санузлов, но не от опций', () => {
  const r = calculate({ ...base, materials: 'standard', options: ['waste'] });
  assert.equal(r.lines.materials, Math.round(((525000 + 140000) * 0.7) / 1000) * 1000);
  assert.equal(r.lines.options, 25000);
});

test('опции умножаются на свою единицу: м², санузел, комната, разово', () => {
  const r = calculate({ ...base, baths: 2, rooms: 3, options: ['demolition', 'plumbing', 'ac', 'waste'] });
  const byId = Object.fromEntries(r.options.map((o) => [o.id, o.cost]));
  assert.deepEqual(byId, { demolition: 900 * 50, plumbing: 45000 * 2, ac: 18000 * 3, waste: 25000 });
});

test('вилка охватывает итог, срок растёт с площадью', () => {
  const small = calculate({ ...base, area: 30 });
  const big = calculate({ ...base, area: 120 });
  assert.ok(small.low < small.total && small.total < small.high);
  assert.ok(big.weeks > small.weeks);
  assert.ok(big.total > small.total);
});

test('мусор во входных данных заменяется значениями по умолчанию', () => {
  const a = normalizeAnswers({
    object: 'castle', area: 'много', rooms: 99, baths: -3,
    repair: '<script>', options: ['waste', 'waste', 'hack'], start: 'yesterday', extra: 1,
  });
  assert.equal(a.object, DEFAULTS.object);
  assert.equal(a.area, DEFAULTS.area);
  assert.equal(a.rooms, 6);
  assert.equal(a.baths, 1);
  assert.equal(a.repair, DEFAULTS.repair);
  assert.deepEqual(a.options, ['waste']);
  assert.equal(a.start, null);
  assert.equal('extra' in a, false);
});

test('площадь ограничена диапазоном ползунка', () => {
  assert.equal(normalizeAnswers({ area: 5 }).area, AREA.min);
  assert.equal(normalizeAnswers({ area: 10000 }).area, AREA.max);
  assert.equal(normalizeAnswers({ area: 63.6 }).area, 64);
});

test('телефон приводится к 7XXXXXXXXXX', () => {
  assert.equal(normalizePhone('+7 (916) 123-45-67'), '79161234567');
  assert.equal(normalizePhone('8 916 123 45 67'), '79161234567');
  assert.equal(normalizePhone('9161234567'), '79161234567');
  assert.equal(normalizePhone('+7 (916) 123-45'), null);
  assert.equal(normalizePhone('+1 202 555 0100'), null);
  assert.equal(normalizePhone(undefined), null);
  assert.equal(formatPhone('79161234567'), '+7 (916) 123-45-67');
});

test('форматирование сумм и склонения', () => {
  assert.equal(formatRub(1234567), '1 234 567 ₽');
  assert.equal(formatShort(1250000), '1,3 млн ₽');
  assert.equal(formatShort(12500000), '13 млн ₽');
  assert.equal(formatShort(640000), '640 тыс ₽');
  const weeks = ['неделя', 'недели', 'недель'];
  assert.deepEqual([1, 2, 5, 11, 21, 22, 112].map((n) => plural(n, weeks)),
    ['неделя', 'недели', 'недель', 'недель', 'неделя', 'недели', 'недель']);
});
