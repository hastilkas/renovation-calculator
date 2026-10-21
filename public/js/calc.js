// Чистые функции без DOM: их импортирует и браузер, и сервер.
import {
  AREA, ROOMS, BATHS, REPAIR_TYPES, OBJECTS, MATERIALS, OPTIONS, START,
  CONTACT_METHODS, RANGE, DEFAULTS,
} from './config.js';

const byId = (list, id) => list.find((item) => item.id === id);

const clampInt = (value, { min, max }, fallback) => {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

// Приводит произвольный ввод к допустимым ответам. Всё неизвестное
// заменяется значением по умолчанию, лишние поля отбрасываются.
export function normalizeAnswers(raw = {}) {
  const pick = (list, id, fallback) => (byId(list, id) ? id : fallback);
  const options = Array.isArray(raw.options)
    ? [...new Set(raw.options.filter((id) => byId(OPTIONS, id)))]
    : [...DEFAULTS.options];

  return {
    object: pick(OBJECTS, raw.object, DEFAULTS.object),
    area: clampInt(raw.area, AREA, DEFAULTS.area),
    rooms: clampInt(raw.rooms, ROOMS, DEFAULTS.rooms),
    baths: clampInt(raw.baths, BATHS, DEFAULTS.baths),
    repair: pick(REPAIR_TYPES, raw.repair, DEFAULTS.repair),
    materials: pick(MATERIALS, raw.materials, DEFAULTS.materials),
    options,
    start: pick(START, raw.start, null),
  };
}

const roundTo = (value, step) => Math.round(value / step) * step;

export function optionCost(option, { area, rooms, baths }) {
  const qty = { m2: area, bath: baths, room: rooms, fixed: 1 }[option.unit];
  return option.price * qty;
}

export function calculate(rawAnswers) {
  const a = normalizeAnswers(rawAnswers);
  const repair = byId(REPAIR_TYPES, a.repair);
  const object = byId(OBJECTS, a.object);
  const materials = byId(MATERIALS, a.materials);

  const works = a.area * repair.perM2 * object.coef;
  const baths = a.baths * repair.perBath;
  const options = a.options.map((id) => {
    const option = byId(OPTIONS, id);
    return { id, title: option.title, cost: optionCost(option, a) };
  });
  const optionsTotal = options.reduce((sum, o) => sum + o.cost, 0);
  // Материалы на опции не начисляем: в цене опций они уже учтены.
  const materialsTotal = (works + baths) * materials.coef;
  const total = works + baths + optionsTotal + materialsTotal;

  const weeksRaw = repair.weeks.base + a.area * repair.weeks.perM2 + (a.baths - 1) * 0.5;
  const weeks = Math.max(1, Math.ceil(weeksRaw));

  return {
    answers: a,
    lines: {
      works: roundTo(works, 1000),
      baths: roundTo(baths, 1000),
      options: roundTo(optionsTotal, 1000),
      materials: roundTo(materialsTotal, 1000),
    },
    options,
    total: roundTo(total, 1000),
    low: roundTo(total * RANGE.low, 10000),
    high: roundTo(total * RANGE.high, 10000),
    perM2: roundTo(total / a.area, 100),
    weeks,
  };
}

export function describe(answers) {
  const a = normalizeAnswers(answers);
  return {
    object: byId(OBJECTS, a.object).title,
    repair: byId(REPAIR_TYPES, a.repair).title,
    materials: byId(MATERIALS, a.materials).title,
    start: a.start ? byId(START, a.start).title : 'не указано',
    hot: a.start ? byId(START, a.start).hot : false,
    options: a.options.map((id) => byId(OPTIONS, id).title),
  };
}

export const contactTitle = (id) => byId(CONTACT_METHODS, id)?.title ?? 'Звонок';

export const formatRub = (n) => `${Math.round(n).toLocaleString('ru-RU').replace(/ | /g, ' ')} ₽`;

// «1,2 млн ₽» для мест, где точная цифра не влезает.
export function formatShort(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.', ',')} млн ₽`;
  return `${Math.round(n / 1000)} тыс ₽`;
}

export function plural(n, [one, few, many]) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

// Номер телефона только цифрами в формате 7XXXXXXXXXX. null, если номер неполный.
export function normalizePhone(input) {
  let digits = String(input ?? '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith('9')) digits = `7${digits}`;
  return /^7\d{10}$/.test(digits) ? digits : null;
}

export const formatPhone = (digits) =>
  `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
