const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const FILE = path.join(DATA_DIR, 'users.json');

// ---------- helpers ----------
function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify({ users: {} }, null, 2));
}

function readDB() {
  ensureFile();
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    if (!parsed.users || typeof parsed.users !== 'object') parsed.users = {};
    return parsed;
  } catch {
    return { users: {} };
  }
}

function writeDB(db) {
  ensureFile();
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
}

function compact(obj) {
  // вернуть копию без undefined/пустых строк/пустых объектов
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) continue;
    out[k] = v;
  }
  return out;
}

// ---------- public API ----------
/**
 * Мягкий апсерт карточки пользователя по объекту Telegram "from".
 * Сохраняем: id, tag (@username), name (first + last единым полем).
 * Поля, которых нет — просто опускаем (не 'none').
 */
function upsertFromTelegram(from) {
  if (!from || !from.id) return;
  const uid = String(from.id);

  const db = readDB();
  const prev = db.users[uid] || {};

  const tag = from.username ? `@${from.username}` : undefined;
  const first = (from.first_name || '').trim();
  const last = (from.last_name || '').trim();
  const name = [first, last].filter(Boolean).join(' ') || undefined;

  // НЕ трогаем role и application, если уже есть.
  const next = compact({
    id: uid,
    ...(prev.role ? { role: prev.role } : {}),
    ...(prev.application ? { application: prev.application } : {}),
    ...(tag ? { tag } : {}),
    ...(name ? { name } : {}),
  });

  db.users[uid] = next;
  writeDB(db);
  return next;
}

/**
 * Установить ЕДИНСТВЕННУЮ роль пользователю. Если role falsy — поле удалим.
 */
function setRole(userId, role) {
  const uid = String(userId);
  const db = readDB();
  const u = db.users[uid] || { id: uid };
  if (role && typeof role === 'string') {
    u.role = role;
  } else {
    delete u.role;
  }
  db.users[uid] = compact(u);
  writeDB(db);
  return db.users[uid];
}

function isRole(userId, role) {
  const uid = String(userId);
  const db = readDB();
  const u = db.users[uid];
  return !!(u && u.role === role);
}

function listByRole(role) {
  const db = readDB();
  return Object.values(db.users).filter(u => u.role === role);
}

/**
 * Создать/перезаписать заявку пользователя.
 * По правилам — хранится ровно ОДНА заявка. Старые мы затираем.
 * text может включать URL — если удаётся вытащить, кладём link; иначе link не пишем.
 * Если text начинается с '/', возвращаем ошибку (команды как заявки запрещены).
 */
function setApplication(userId, text) {
  const uid = String(userId);
  const db = readDB();
  const u = db.users[uid] || { id: uid };

  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Текст заявки пуст');
  }
  if (text.trim().startsWith('/')) {
    throw new Error('Команды не принимаются как текст заявки');
  }

  // Простейший URL-детектор
  const urlMatch = text.match(/https?:\/\/[^\s]+/i);
  const link = urlMatch ? urlMatch[0] : undefined;

  u.application = compact({
    status: 'pending',       // статус по умолчанию
    text,                    // исходный текст
    ...(link ? { link } : {}),
  });

  db.users[uid] = compact(u);
  writeDB(db);
  return db.users[uid];
}

function setApplicationStatus(userId, status) {
  const uid = String(userId);
  const db = readDB();
  const u = db.users[uid];
  if (!u || !u.application) throw new Error('Заявка не найдена');
  u.application.status = status;
  db.users[uid] = compact(u);
  writeDB(db);
  return db.users[uid];
}

function listByApplicationStatus(status) {
  const db = readDB();
  return Object.values(db.users).filter(u => u.application && u.application.status === status);
}

function getUser(userId) {
  const uid = String(userId);
  const db = readDB();
  return db.users[uid];
}

function allUsers() {
  const db = readDB();
  return Object.values(db.users);
}

module.exports = {
  // карточка пользователя
  upsertFromTelegram,
  getUser,
  allUsers,

  // роли
  setRole,
  isRole,
  listByRole,

  // заявки
  setApplication,
  setApplicationStatus,
  listByApplicationStatus,
};
