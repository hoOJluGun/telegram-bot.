const fs = require('fs');

const applicationsFile = 'applications.json';

const readJsonSafe = (path, fallback) => {
  if (!fs.existsSync(path)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch (e) {
    console.error(`Ошибка чтения ${path}:`, e.message);
    return fallback;
  }
};

const writeJsonSafe = (path, data) => {
  try {
    const currentData = JSON.stringify(data);
    const existingData = fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : '{}';
    if (currentData !== existingData) {
      fs.writeFileSync(path, JSON.stringify(data, null, 2));
      console.log(`Файл ${path} успешно сохранен`);
    } else {
      console.log(`Файл ${path} не изменен, пропуск записи`);
    }
  } catch (e) {
    console.error(`Ошибка сохранения ${path}:`, e.message, e.stack);
  }
};

let applications = readJsonSafe(applicationsFile, {});

const saveApplications = () => writeJsonSafe(applicationsFile, applications);

module.exports = { applications, saveApplications, readJsonSafe, writeJsonSafe };
