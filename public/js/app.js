import {
  BRAND, AREA, ROOMS, BATHS, REPAIR_TYPES, OBJECTS, MATERIALS, OPTIONS, START, CONTACT_METHODS,
} from './config.js';
import {
  normalizeAnswers, calculate, optionCost, formatRub, formatShort, plural, normalizePhone, formatPhone,
} from './calc.js';

const STEPS = ['object', 'size', 'repair', 'materials', 'options', 'start', 'result'];
const QUESTIONS = STEPS.length - 1;
const RESULT = STEPS.indexOf('result');
const STORAGE_KEY = 'kvadrat-quiz-v1';
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'yclid', 'gclid'];

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const storage = {
  get(key, store = localStorage) {
    try { return JSON.parse(store.getItem(key)); } catch { return null; }
  },
  set(key, value, store = localStorage) {
    try { store.setItem(key, JSON.stringify(value)); } catch { /* приватный режим */ }
  },
};

const saved = storage.get(STORAGE_KEY);
const state = {
  answers: normalizeAnswers(saved?.answers),
  step: Math.min(Number(saved?.step) || 0, RESULT),
  maxStep: Math.min(Number(saved?.maxStep) || 0, RESULT),
  sheetNo: saved?.sheetNo || String(1000 + Math.floor(Math.random() * 9000)),
  startedAt: Date.now(),
  sent: false,
  started: Boolean(saved),
};

function persist() {
  const { answers, step, maxStep, sheetNo } = state;
  storage.set(STORAGE_KEY, { answers, step, maxStep, sheetNo });
}

// ---------- аналитика ----------

function track(goal, params = {}) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event: goal, ...params });
  if (BRAND.metrikaId && typeof window.ym === 'function') window.ym(BRAND.metrikaId, 'reachGoal', goal, params);
}

function loadMetrika() {
  if (!BRAND.metrikaId) return;
  window.ym = window.ym || function ym(...args) { (window.ym.a = window.ym.a || []).push(args); };
  window.ym.l = Date.now();
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://mc.yandex.ru/metrika/tag.js';
  document.head.append(s);
  window.ym(BRAND.metrikaId, 'init', { clickmap: true, trackLinks: true, webvisor: true });
}

// UTM запоминаем на сессию: человек может прийти по рекламе, походить по сайту
// и оставить заявку уже без меток в адресе.
function collectUtm() {
  const params = new URLSearchParams(location.search);
  const fromUrl = Object.fromEntries(UTM_KEYS.filter((k) => params.get(k)).map((k) => [k, params.get(k).slice(0, 200)]));
  const stored = storage.get('kvadrat-utm', sessionStorage) || {};
  const utm = Object.keys(fromUrl).length ? fromUrl : stored;
  storage.set('kvadrat-utm', utm, sessionStorage);
  return utm;
}
const utm = collectUtm();

// ---------- шаги ----------

const priceUnit = (o) => ({ m2: '₽/м²', bath: '₽ за санузел', room: '₽ за комнату', fixed: '₽' })[o.unit];

function choiceCard(name, item, checked, extra = '') {
  return `
    <label class="choice">
      <input type="radio" name="${name}" value="${item.id}" ${checked ? 'checked' : ''}>
      <span class="choice__title">${esc(item.title)}</span>
      ${item.note ? `<span class="choice__note">${esc(item.note)}</span>` : ''}
      ${extra}
    </label>`;
}

function stepper(field, label, { min, max }) {
  const value = state.answers[field];
  return `
    <div class="stepper" data-field="${field}">
      <span class="stepper__label" id="${field}-label">${label}</span>
      <div class="stepper__ctrl">
        <button type="button" data-delta="-1" aria-label="Уменьшить: ${label}" ${value <= min ? 'disabled' : ''}>−</button>
        <output aria-labelledby="${field}-label" aria-live="polite">${value}</output>
        <button type="button" data-delta="1" aria-label="Увеличить: ${label}" ${value >= max ? 'disabled' : ''}>+</button>
      </div>
    </div>`;
}

function tapeLabels() {
  const marks = [];
  for (let v = Math.ceil(AREA.min / 25) * 25; v <= AREA.max; v += 25) {
    const p = (v - AREA.min) / (AREA.max - AREA.min);
    marks.push(`<span style="--p:${p}">${v}</span>`);
  }
  return marks.join('');
}

const STEP_VIEWS = {
  object: () => `
    <h2 class="step__title" tabindex="-1">Что ремонтируем?</h2>
    <p class="step__hint">От состояния объекта зависит объём черновых работ.</p>
    <div class="choices choices--2" role="radiogroup" aria-label="Тип объекта">
      ${OBJECTS.map((o) => choiceCard('object', o, state.answers.object === o.id)).join('')}
    </div>`,

  size: () => `
    <h2 class="step__title" tabindex="-1">Площадь и планировка</h2>
    <p class="step__hint">Общая площадь по документам, можно примерно.</p>
    <div class="tape-field">
      <div class="tape-field__top">
        <label for="area">Площадь</label>
        <span class="tape-field__value">
          <input type="number" id="area-num" inputmode="numeric" min="${AREA.min}" max="${AREA.max}" value="${state.answers.area}" aria-label="Площадь в квадратных метрах">
          <span>м²</span>
        </span>
      </div>
      <div class="tape" style="--p:${(state.answers.area - AREA.min) / (AREA.max - AREA.min)}">
        <input type="range" id="area" name="area" min="${AREA.min}" max="${AREA.max}" step="${AREA.step}" value="${state.answers.area}" aria-valuetext="${state.answers.area} м²">
        <div class="tape__labels" aria-hidden="true">${tapeLabels()}</div>
      </div>
    </div>
    <div class="steppers">
      ${stepper('rooms', 'Жилых комнат', ROOMS)}
      ${stepper('baths', 'Санузлов', BATHS)}
    </div>`,

  repair: () => `
    <h2 class="step__title" tabindex="-1">Какой ремонт нужен?</h2>
    <p class="step__hint">Цена за квадратный метр, только работы.</p>
    <div class="choices choices--2" role="radiogroup" aria-label="Тип ремонта">
      ${REPAIR_TYPES.map((r) => choiceCard('repair', r, state.answers.repair === r.id,
        `<span class="choice__price">${formatRub(r.perM2)}/м²</span>`)).join('')}
    </div>`,

  materials: () => `
    <h2 class="step__title" tabindex="-1">Материалы</h2>
    <p class="step__hint">Можем закупить сами по ценам поставщиков, это быстрее и дешевле розницы.</p>
    <div class="choices choices--2" role="radiogroup" aria-label="Материалы">
      ${MATERIALS.map((m) => choiceCard('materials', m, state.answers.materials === m.id)).join('')}
    </div>`,

  options: () => `
    <h2 class="step__title" tabindex="-1">Что ещё сделать?</h2>
    <p class="step__hint">Отметьте всё, что нужно. Цена пересчитана под вашу площадь.</p>
    <div class="opts">
      ${OPTIONS.map((o) => `
        <label class="opt">
          <input type="checkbox" name="options" value="${o.id}" ${state.answers.options.includes(o.id) ? 'checked' : ''}>
          <span class="opt__box" aria-hidden="true"></span>
          <span class="opt__title">${esc(o.title)}</span>
          <span class="opt__price">${formatRub(optionCost(o, state.answers))}</span>
          <span class="opt__unit">${o.unit === 'fixed' ? 'разово' : `${o.price.toLocaleString('ru-RU')} ${priceUnit(o)}`}</span>
        </label>`).join('')}
    </div>`,

  start: () => `
    <h2 class="step__title" tabindex="-1">Когда планируете начать?</h2>
    <p class="step__hint">Подстроим график бригады под ваши сроки.</p>
    <div class="choices" role="radiogroup" aria-label="Сроки начала">
      ${START.map((s) => choiceCard('start', s, state.answers.start === s.id)).join('')}
    </div>
    <p class="step__error" id="start-error" role="alert" hidden>Выберите один из вариантов.</p>`,

  result: () => {
    const r = calculate(state.answers);
    return `
    <h2 class="step__title" tabindex="-1">Смета готова</h2>
    <p class="result__range">${formatShort(r.low)} – ${formatShort(r.high)}</p>
    <p class="step__hint">Оставьте телефон: инженер уточнит детали и пришлёт подробную смету по позициям. Цену из расчёта держим 14 дней.</p>
    <div class="lead" id="lead">
      <div class="field">
        <label for="lead-name">Как к вам обращаться</label>
        <input id="lead-name" name="name" autocomplete="name" maxlength="60" required>
      </div>
      <div class="field">
        <label for="lead-phone">Телефон</label>
        <input id="lead-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+7 (___) ___-__-__" required>
      </div>
      <fieldset class="field field--seg">
        <legend>Как удобнее связаться</legend>
        <div class="seg">
          ${CONTACT_METHODS.map((m, i) => `
            <label><input type="radio" name="method" value="${m.id}" ${i === 0 ? 'checked' : ''}><span>${m.title}</span></label>`).join('')}
        </div>
      </fieldset>
      <div class="field field--wide">
        <label for="lead-comment">Комментарий <span class="field__opt">необязательно</span></label>
        <textarea id="lead-comment" name="comment" rows="2" maxlength="500" placeholder="Например: нужна перепланировка кухни"></textarea>
      </div>
      <div class="hp" aria-hidden="true">
        <label for="lead-website">Сайт</label>
        <input id="lead-website" name="website" tabindex="-1" autocomplete="off">
      </div>
      <label class="consent">
        <input type="checkbox" name="consent" required>
        <span>Согласен на обработку персональных данных по <a href="#" target="_blank" rel="noopener">политике конфиденциальности</a></span>
      </label>
      <p class="lead__error" id="lead-error" role="alert" hidden></p>
      <button type="submit" class="btn btn--primary btn--wide" id="btn-submit">Получить точный расчёт</button>
    </div>`;
  },
};

// ---------- отрисовка ----------

const stepsEl = $('#quiz-steps');
const backBtn = $('#btn-back');
const nextBtn = $('#btn-next');

function renderStep({ focus = false } = {}) {
  const name = STEPS[state.step];
  stepsEl.innerHTML = `<div class="step step--${name}" data-step="${name}">${STEP_VIEWS[name]()}</div>`;

  const question = Math.min(state.step + 1, QUESTIONS);
  $('#quiz-counter').textContent = state.step === RESULT ? 'Расчёт готов' : `Вопрос ${question} из ${QUESTIONS}`;
  const progress = $('.quiz__progress');
  progress.setAttribute('aria-valuenow', String(state.step));
  $('#quiz-progress-bar').style.setProperty('--progress', state.step / QUESTIONS);

  $('#quiz-nav').hidden = false;
  backBtn.hidden = state.step === 0;
  nextBtn.hidden = state.step === RESULT;
  nextBtn.textContent = state.step === RESULT - 1 ? 'Показать смету' : 'Дальше';
  $('#quiz-nav').classList.toggle('quiz__nav--end', state.step === 0);

  if (name === 'result') bindLeadForm();
  if (focus) $('.step__title', stepsEl)?.focus({ preventScroll: true });
}

function go(to) {
  const target = Math.max(0, Math.min(RESULT, to));
  if (target === state.step) return;
  state.step = target;
  if (target > state.maxStep) {
    state.maxStep = target;
    track(target === RESULT ? 'quiz_result' : `quiz_step_${target + 1}`);
  }
  persist();
  renderStep({ focus: true });
  renderSheet();

  // На телефоне вопрос может оказаться выше экрана после длинного шага.
  const top = $('#quiz').getBoundingClientRect().top;
  if (top < 0) $('#quiz').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
}

function next() {
  if (STEPS[state.step] === 'start' && !state.answers.start) {
    $('#start-error').hidden = false;
    return;
  }
  go(state.step + 1);
}

function markStarted() {
  if (state.started) return;
  state.started = true;
  track('quiz_start');
}

function setAnswer(field, value) {
  state.answers = normalizeAnswers({ ...state.answers, [field]: value });
  markStarted();
  persist();
  renderSheet();
}

// ---------- смета справа ----------

let shownTotal = 0;
let totalAnim = 0;

function animateNumber(el, from, to, format) {
  cancelAnimationFrame(totalAnim);
  if (reducedMotion || from === 0 || document.hidden) { el.textContent = format(to); return; }
  const t0 = performance.now();
  const tick = (now) => {
    const k = Math.min(1, (now - t0) / 450);
    const eased = 1 - (1 - k) ** 3;
    el.textContent = format(from + (to - from) * eased);
    if (k < 1) totalAnim = requestAnimationFrame(tick);
  };
  totalAnim = requestAnimationFrame(tick);
}

// Подсвечиваем только строки, которые только что появились или заполнились,
// иначе при движении ползунка мигала бы вся таблица.
let knownRows = new Set();
let nextKnownRows = new Set();

function sheetRow(label, sub, amount, known, key = label) {
  const fresh = known && knownRows.size > 0 && !knownRows.has(key);
  if (known) nextKnownRows.add(key);
  return `<tr class="${known ? '' : 'is-pending'} ${fresh ? 'is-new' : ''}">
    <th scope="row">${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</th>
    <td>${known ? formatRub(amount) : '…'}</td>
  </tr>`;
}

function renderSheet() {
  const r = calculate(state.answers);
  const a = r.answers;
  const seen = (name) => state.maxStep > STEPS.indexOf(name) || state.step === STEPS.indexOf(name);
  const repair = REPAIR_TYPES.find((x) => x.id === a.repair);
  const object = OBJECTS.find((x) => x.id === a.object);
  const materials = MATERIALS.find((x) => x.id === a.materials);

  nextKnownRows = new Set(['_init']);
  const rows = [
    sheetRow('Работы по площади', `${a.area} м² × ${repair.perM2.toLocaleString('ru-RU')} ₽${object.coef !== 1 ? ` × ${String(object.coef).replace('.', ',')}` : ''}`, r.lines.works, seen('repair')),
    sheetRow(`${a.baths} ${plural(a.baths, ['санузел', 'санузла', 'санузлов'])}`, 'плитка, гидроизоляция, сантехника', r.lines.baths, seen('repair'), 'baths'),
    sheetRow('Материалы', materials.title.toLowerCase(), r.lines.materials, seen('materials')),
  ];
  if (seen('options')) {
    rows.push(...r.options.map((o) => sheetRow(o.title, '', o.cost, true)));
    if (!r.options.length) rows.push(sheetRow('Доп. работы', 'не выбраны', 0, true));
  } else {
    rows.push(sheetRow('Доп. работы', '', 0, false));
  }
  $('#sheet-rows').innerHTML = rows.join('');
  knownRows = nextKnownRows;

  const lowEl = $('#sheet-low');
  const highEl = $('#sheet-high');
  animateNumber(lowEl, shownTotal * 0.9, r.low, formatShort);
  highEl.textContent = formatShort(r.high);
  shownTotal = r.total;

  $('#sheet-weeks').textContent = `${r.weeks} ${plural(r.weeks, ['неделя', 'недели', 'недель'])}`;
  $('#sheet-perm2').textContent = formatRub(r.perM2);
  $('#sheet-note').textContent = state.step === RESULT
    ? 'Точная смета после бесплатного замера. Цену из расчёта держим 14 дней.'
    : 'Пока по типовым параметрам. Отвечайте на вопросы, и смета уточнится.';

  $('#stamp-object').textContent = object.title;
  $('#stamp-repair').textContent = repair.title;
  $('#stamp-area').textContent = `${a.area} м², ${a.rooms} ${plural(a.rooms, ['комната', 'комнаты', 'комнат'])}`;
  $('#mbar-value').textContent = `${formatShort(r.low)} – ${formatShort(r.high)}`;
}

// ---------- события квиза ----------

stepsEl.addEventListener('change', (e) => {
  const t = e.target;
  if (t.type === 'radio' && STEPS.includes(t.name)) {
    setAnswer(t.name, t.value);
    if (t.name === 'start') $('#start-error').hidden = true;
  } else if (t.name === 'options') {
    const checked = [...stepsEl.querySelectorAll('input[name="options"]:checked')].map((i) => i.value);
    setAnswer('options', checked);
  } else if (t.id === 'area-num') {
    syncArea(t.value, { fromNumber: true, commit: true });
  }
});

// Клик мышью или пальцем по карточке сразу ведёт дальше. Стрелки клавиатуры
// только меняют выбор, иначе с клавиатуры не выбрать нужный вариант.
let autoAdvance = 0;
stepsEl.addEventListener('click', (e) => {
  const card = e.target.closest('.choice');
  if (!card || e.target.tagName === 'INPUT' || e.detail === 0) return;
  clearTimeout(autoAdvance);
  autoAdvance = setTimeout(next, reducedMotion ? 0 : 260);
});

stepsEl.addEventListener('input', (e) => {
  if (e.target.id === 'area') syncArea(e.target.value, { fromNumber: false });
});

stepsEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.stepper button');
  if (!btn) return;
  const field = btn.closest('.stepper').dataset.field;
  const limits = field === 'rooms' ? ROOMS : BATHS;
  setAnswer(field, state.answers[field] + Number(btn.dataset.delta));
  const box = btn.closest('.stepper');
  box.querySelector('output').textContent = state.answers[field];
  const [minus, plus] = box.querySelectorAll('button');
  minus.disabled = state.answers[field] <= limits.min;
  plus.disabled = state.answers[field] >= limits.max;
});

function syncArea(value, { fromNumber, commit = false }) {
  const n = Number(value);
  if (fromNumber && !commit && (!Number.isFinite(n) || n < AREA.min)) return;
  setAnswer('area', n);
  const area = state.answers.area;
  const range = $('#area');
  const num = $('#area-num');
  if (range) {
    range.value = area;
    range.setAttribute('aria-valuetext', `${area} м²`);
    range.parentElement.style.setProperty('--p', (area - AREA.min) / (AREA.max - AREA.min));
  }
  if (num && (!fromNumber || commit)) num.value = area;
}

stepsEl.addEventListener('keyup', (e) => {
  if (e.target.id === 'area-num') syncArea(e.target.value, { fromNumber: true });
});

backBtn.addEventListener('click', () => go(state.step - 1));
nextBtn.addEventListener('click', next);

// Enter в поле площади не должен отправлять форму.
$('#quiz').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'area-num') {
    e.preventDefault();
    syncArea(e.target.value, { fromNumber: true, commit: true });
    next();
  }
});

// ---------- заявка ----------

// Десять цифр номера без кода страны.
function nationalDigits(value) {
  let d = value.replace(/\D/g, '');
  if (value.trim().startsWith('+7')) d = d.slice(1);
  // Вставили «89161234567» или «+7 916…» поверх уже набранного «+7 (».
  if (d.length >= 11 && /^[78]/.test(d)) d = d.slice(1);
  return d;
}

function maskPhone(d) {
  d = d.slice(0, 10);
  if (!d) return '';
  let out = `+7 (${d.slice(0, 3)}`;
  if (d.length >= 3) out += ')';
  if (d.length > 3) out += ` ${d.slice(3, 6)}`;
  if (d.length > 6) out += `-${d.slice(6, 8)}`;
  if (d.length > 8) out += `-${d.slice(8, 10)}`;
  return out;
}

function bindLeadForm() {
  const phone = $('#lead-phone');
  // По привычке номер начинают с восьмёрки. Первую 8 в пустом поле считаем
  // междугородним префиксом и пропускаем один раз, чтобы «8 812…» тоже набирался.
  let prev = '';
  let trunkSkipped = false;
  phone.addEventListener('input', () => {
    let d = nationalDigits(phone.value);
    if (!prev && d === '8' && !trunkSkipped) {
      d = '';
      trunkSkipped = true;
    }
    if (!d && !phone.value.replace(/\D/g, '').length) trunkSkipped = false;
    prev = d;
    phone.value = maskPhone(d) || (document.activeElement === phone ? '+7 (' : '');
    phone.removeAttribute('aria-invalid');
  });
  phone.addEventListener('focus', () => { if (!phone.value) phone.value = '+7 ('; });
  phone.addEventListener('blur', () => { if (phone.value === '+7 (') phone.value = ''; });
  $('#lead-name').addEventListener('input', (e) => e.target.removeAttribute('aria-invalid'));
}

function showLeadError(message, field) {
  const box = $('#lead-error');
  box.textContent = message;
  box.hidden = false;
  if (field) {
    field.setAttribute('aria-invalid', 'true');
    field.focus();
  }
}

$('#quiz').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (state.step !== RESULT || state.sent) return;
  const form = e.currentTarget;
  const nameEl = $('#lead-name');
  const phoneEl = $('#lead-phone');
  const name = nameEl.value.trim();
  const phone = normalizePhone(phoneEl.value);

  if (!name) return showLeadError('Напишите, как к вам обращаться.', nameEl);
  if (!phone) return showLeadError('Проверьте номер: нужно 10 цифр после +7.', phoneEl);
  if (!form.consent.checked) return showLeadError('Отметьте согласие на обработку данных.', form.consent);
  $('#lead-error').hidden = true;

  const btn = $('#btn-submit');
  btn.disabled = true;
  btn.textContent = 'Отправляем…';

  const payload = {
    answers: state.answers,
    contact: { name, phone, method: form.method.value, comment: form.comment.value.trim() },
    sheetNo: state.sheetNo,
    website: form.website.value,
    meta: {
      utm,
      page: location.href.slice(0, 500),
      referrer: document.referrer.slice(0, 500),
      fillSeconds: Math.round((Date.now() - state.startedAt) / 1000),
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch('/api/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    state.sent = true;
    track('lead_sent', { method: payload.contact.method });
    showSuccess(name, phone, data);
  } catch (err) {
    const msg = err.name === 'AbortError' ? 'Сервер долго не отвечает.' : (err.message.startsWith('HTTP') ? 'Не получилось отправить заявку.' : err.message);
    showLeadError(`${msg} Попробуйте ещё раз или позвоните: ${BRAND.phone}.`);
    btn.disabled = false;
    btn.textContent = 'Получить точный расчёт';
  } finally {
    clearTimeout(timer);
  }
});

function showSuccess(name, phone, data) {
  const lead = $('#lead');
  lead.outerHTML = `
    <div class="done" role="status">
      <p class="done__title">Заявка № ${esc(state.sheetNo)} принята</p>
      <p>${esc(name)}, инженер-сметчик свяжется с вами по номеру ${formatPhone(phone)} в течение 15 минут в рабочее время.</p>
      ${data.demo ? '<p class="done__demo">Демо-режим: бот не настроен, заявка выведена в консоль сервера.</p>' : ''}
      <div class="done__actions">
        <button type="button" class="btn btn--primary" data-action="print">Сохранить смету в PDF</button>
        <button type="button" class="btn btn--ghost" data-action="restart">Новый расчёт</button>
      </div>
    </div>`;
  $('#quiz-nav').hidden = true;
  $('.done .btn').focus();
}

stepsEl.addEventListener('click', (e) => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'print') window.print();
  if (action === 'restart') {
    state.answers = normalizeAnswers({});
    state.step = 0;
    state.maxStep = 0;
    state.sent = false;
    state.sheetNo = String(1000 + Math.floor(Math.random() * 9000));
    persist();
    $('#sheet-no').textContent = state.sheetNo;
    renderStep({ focus: true });
    renderSheet();
  }
});

$('#btn-print').addEventListener('click', () => window.print());

// ---------- статичные части страницы ----------

function fillBrand() {
  document.querySelectorAll('[data-brand]').forEach((el) => {
    const key = el.dataset.brand;
    el.textContent = BRAND[key];
    if (key === 'phone') el.href = `tel:${BRAND.phoneHref}`;
  });
  $('#sheet-no').textContent = state.sheetNo;
  $('#sheet-date').textContent = new Date().toLocaleDateString('ru-RU');
  $('#method-rows').innerHTML = REPAIR_TYPES.map((r) => {
    const weeks = Math.ceil(r.weeks.base + 50 * r.weeks.perM2);
    return `<tr><th scope="row">${esc(r.title)}</th><td>${r.perM2.toLocaleString('ru-RU')}</td><td>${r.perBath.toLocaleString('ru-RU')}</td><td>${weeks} ${plural(weeks, ['неделя', 'недели', 'недель'])}</td></tr>`;
  }).join('');
}

// Полоска с итогом внизу экрана на телефоне, пока сама смета не видна.
function watchSheet() {
  const bar = $('#mbar');
  if (!('IntersectionObserver' in window)) return;
  let sheetVisible = false;
  let quizVisible = true;
  const update = () => { bar.hidden = sheetVisible || !quizVisible; };
  new IntersectionObserver(([entry]) => { sheetVisible = entry.isIntersecting; update(); }).observe($('#sheet'));
  new IntersectionObserver(([entry]) => { quizVisible = entry.isIntersecting; update(); }).observe($('#quiz'));
}

fillBrand();
renderStep();
renderSheet();
watchSheet();
loadMetrika();
