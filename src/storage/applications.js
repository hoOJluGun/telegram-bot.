const fs = require('fs');
const applicationsFile = 'applications.json';

function readJsonSafe(path, fallback) {
  if (!fs.existsSync(path)) return fallback;
  try { return JSON.parse(fs.readFileSync(path, 'utf8')); } catch { return fallback; }
}

function writeJsonSafe(path, data) {
  try { fs.writeFileSync(path, JSON.stringify(data, null, 2)); } catch {}
}

let applications = readJsonSafe(applicationsFile, {});
function saveApplications() { writeJsonSafe(applicationsFile, applications); }

function isAdminId(id) {
  return applications[id]?.admin === true;
}

module.exports = { applications, applicationsFile, saveApplications, readJsonSafe, writeJsonSafe, isAdminId };
