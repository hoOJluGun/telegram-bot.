const fs = require('fs');
const path = require('path');
const FILE = path.join(process.cwd(), 'data', 'db.json');

/* -------- core io ---------- */
function readSafe() {
  try {
    if (!fs.existsSync(FILE)) return {};
    const raw = fs.readFileSync(FILE, 'utf8') || '{}';
    return JSON.parse(raw);
  } catch (e) {
    console.error('db read error:', e.message);
    return {};
  }
}
function writeSafe(obj) {
  try {
    const dir = path.dirname(FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
    fs.renameSync(tmp, FILE);
  } catch (e) { console.error('db write error:', e.message); }
}

/* -------- helpers ---------- */
function normName(first, last) {
  const a = [first, last].map(x => (x || '').trim()).filter(Boolean);
  const s = a.join(' ').replace(/\s+/g, ' ').trim();
  return s || undefined;
}
function computeTag(username, name, id) {
  if (username) return '@' + username;
  if (name) return name;
  return String(id);
}

/* -------- API ---------- */
function upsertUser(from) {
  if (!from || !from.id) return;
  const db = readSafe();
  const id = String(from.id);
  const prev = db[id] || { id };
  const name = normName(from.first_name, from.last_name) ?? prev.name;
  const tag = computeTag(from.username, name, id);

  db[id] = {
    id,
    ...(tag ? { tag } : {}),
    ...(name ? { name } : {}),
    ...(prev.role ? { role: prev.role } : {}),
    ...(prev.application ? { application: prev.application } : {})
  };
  writeSafe(db);
  return db[id];
}

function getUser(id){ const db = readSafe(); return db[String(id)] || null; }
function setUser(id, patch){
  const db = readSafe(); const k=String(id);
  const prev = db[k] || { id:k };
  const next = { ...prev, ...patch };
  const out = { id:k };
  if (next.tag) out.tag = String(next.tag);
  if (next.name) out.name = String(next.name);
  if (next.role) out.role = String(next.role);
  if (next.application) out.application = { ...next.application };
  db[k] = out;
  writeSafe(db);
  return db[k];
}

/* единственная роль (строка) */
function setRole(userId, role){
  const allowed = new Set(['worker','admin','support','mentor','vbiv']);
  const db = readSafe(); const k=String(userId);
  const u = db[k] || { id:k, tag: k };
  if (!role || !allowed.has(role)) {
    const { role:_, ...rest } = u;
    db[k] = rest;
  } else {
    db[k] = { ...u, role };
  }
  writeSafe(db);
  return db[k];
}

/* единственная заявка */
function hasApplication(userId){ const u=getUser(userId); return !!(u && u.application); }
function createApplication(userId, text, status='pending'){
  const db = readSafe(); const k=String(userId);
  const u = db[k] || { id:k, tag:k };
  if (u.application) return null; // повтор запрещён
  u.application = { text: String(text||''), status };
  db[k] = u; writeSafe(db); return u.application;
}
function setApplicationStatus(userId, status){
  const db=readSafe(); const k=String(userId);
  const u=db[k]; if(!u || !u.application) return null;
  u.application = { ...u.application, status };
  db[k]=u; writeSafe(db); return u.application;
}
function getApplication(userId){ const u=getUser(userId); return u? (u.application||null) : null; }

/* выборки для админки */
function listUsers(){
  const db = readSafe();
  return Object.values(db)
    .map(u => ({
      id: String(u.id),
      ...(u.tag ? { tag: u.tag } : {}),
      ...(u.name ? { name: u.name } : {}),
      ...(u.role ? { role: u.role } : {}),
      ...(u.application ? { application: { ...u.application } } : {})
    }))
    .sort((a,b)=> BigInt(a.id) - BigInt(b.id));
}
function listApplications(status){
  const all = listUsers().filter(u => u.application);
  if (!status || status === 'all') return all;
  return all.filter(u => (u.application.status === status));
}

/* ---------- SHIMS for old middlewares ---------- */
// старые мидлвары могут звать это для «режима бутстрапа / админов»
function listByRole(role){
  return listUsers().filter(u => u.role === role).map(u => u.id);
}
// мы больше не храним уведомления; отдаём пусто, чтобы мидлварь не падала
function drainNotifications(){ return []; }
function pushNotification(){ /* no-op */ }

module.exports = {
  FILE, readSafe, writeSafe,
  upsertUser, getUser, setUser,
  setRole,
  hasApplication, createApplication, setApplicationStatus, getApplication,
  listUsers, listApplications,
  // shims:
  listByRole, drainNotifications, pushNotification
};
