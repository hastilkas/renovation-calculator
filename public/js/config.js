// Всё, что относится к конкретному заказчику, живёт здесь: цены, шаги квиза,
// тексты. Формулы в calc.js от этих чисел не зависят, поэтому сменить прайс
// или нишу можно без правки логики. Этот же файл читает сервер, чтобы
// пересчитать смету и не доверять цифрам, пришедшим из браузера.

export const BRAND = {
  name: 'Квадрат',
  tagline: 'ремонт квартир под ключ',
  phone: '+7 (900) 000-00-00',
  phoneHref: '+79000000000',
  city: 'Москва и область',
  // ID счётчика Яндекс Метрики. Пусто: цели уходят только в dataLayer.
  metrikaId: '',
};

export const AREA = { min: 15, max: 250, step: 1, initial: 54 };
export const ROOMS = { min: 1, max: 6, initial: 2 };
export const BATHS = { min: 1, max: 3, initial: 1 };

// Стоимость работ на квадратный метр и отдельно на санузел: плитка, гидроизоляция
// и сантехника в санузле стоят как полкомнаты, поэтому считаются отдельно.
export const REPAIR_TYPES = [
  {
    id: 'cosmetic',
    title: 'Косметический',
    note: 'Обои, покраска, ламинат, замена розеток. Без переноса стен и коммуникаций.',
    perM2: 4500,
    perBath: 70000,
    weeks: { base: 2, perM2: 1 / 25 },
  },
  {
    id: 'capital',
    title: 'Капитальный',
    note: 'Выравнивание стен и пола, новая электрика и трубы, стяжка, плитка.',
    perM2: 10500,
    perBath: 140000,
    weeks: { base: 5, perM2: 1 / 12 },
  },
  {
    id: 'euro',
    title: 'Комфорт',
    note: 'Капитальный плюс сложные потолки, скрытые двери, раскладка плитки по проекту.',
    perM2: 15500,
    perBath: 200000,
    weeks: { base: 7, perM2: 1 / 10 },
  },
  {
    id: 'design',
    title: 'Дизайнерский',
    note: 'Работа строго по дизайн-проекту, авторский надзор, нестандартные решения.',
    perM2: 24000,
    perBath: 290000,
    weeks: { base: 10, perM2: 1 / 8 },
  },
];

// Коэффициент к стоимости работ: в новостройке без отделки больше черновых
// работ, в доме добавляется логистика.
export const OBJECTS = [
  { id: 'new', title: 'Новостройка без отделки', note: 'Бетон, нет стяжки и штукатурки', coef: 1.15 },
  { id: 'whitebox', title: 'Новостройка white box', note: 'Есть стяжка и штукатурка', coef: 0.9 },
  { id: 'secondary', title: 'Вторичное жильё', note: 'Старый ремонт, понадобится демонтаж', coef: 1.0 },
  { id: 'house', title: 'Частный дом', note: 'Коттедж или таунхаус', coef: 1.1 },
];

// Материалы считаются долей от стоимости работ: так прикидывают сметчики
// на первом звонке, пока нет ведомости.
export const MATERIALS = [
  { id: 'none', title: 'Покупаю сам', note: 'В смете только работы', coef: 0 },
  { id: 'econ', title: 'Эконом', note: 'Российские бренды, ламинат 32 класса', coef: 0.45 },
  { id: 'standard', title: 'Стандарт', note: 'Knauf, Ceresit, керамогранит, инженерная доска', coef: 0.7 },
  { id: 'premium', title: 'Премиум', note: 'Европейская плитка и сантехника, паркет', coef: 1.15 },
];

// unit: m2 считается от площади, bath от числа санузлов, room от комнат, fixed разово.
export const OPTIONS = [
  { id: 'demolition', title: 'Демонтаж старой отделки', unit: 'm2', price: 900 },
  { id: 'electric', title: 'Новая электрика', unit: 'm2', price: 2200 },
  { id: 'plumbing', title: 'Разводка труб', unit: 'bath', price: 45000 },
  { id: 'floorheat', title: 'Тёплый пол в санузле', unit: 'bath', price: 28000 },
  { id: 'ceilings', title: 'Натяжные потолки', unit: 'm2', price: 1100 },
  { id: 'soundproof', title: 'Шумоизоляция стен', unit: 'm2', price: 1900 },
  { id: 'ac', title: 'Трассы под кондиционеры', unit: 'room', price: 18000 },
  { id: 'project', title: 'Дизайн-проект', unit: 'm2', price: 1800 },
  { id: 'waste', title: 'Вывоз мусора', unit: 'fixed', price: 25000 },
  { id: 'cleaning', title: 'Уборка после ремонта', unit: 'm2', price: 250 },
];

export const START = [
  { id: 'now', title: 'В ближайший месяц', note: 'Ключи уже на руках', hot: true },
  { id: 'soon', title: 'Через 1–3 месяца', note: 'Ждём ключи или выбираем бригаду', hot: false },
  { id: 'later', title: 'Пока просто считаю', note: 'Хочу понять бюджет', hot: false },
];

export const CONTACT_METHODS = [
  { id: 'call', title: 'Звонок' },
  { id: 'telegram', title: 'Telegram' },
  { id: 'whatsapp', title: 'WhatsApp' },
];

// Точность предварительной сметы: итог показываем вилкой.
export const RANGE = { low: 0.9, high: 1.12 };

export const DEFAULTS = {
  object: 'secondary',
  area: AREA.initial,
  rooms: ROOMS.initial,
  baths: BATHS.initial,
  repair: 'capital',
  materials: 'standard',
  options: ['demolition', 'waste'],
  start: null,
};
