const path = require("path");

function pickRegistrar(mod, nameForLog) {
  if (typeof mod === "function") return mod;
  if (mod && typeof mod.register === "function") return mod.register;
  if (mod && typeof mod.default === "function") return mod.default;
  if (mod && mod.default && typeof mod.default.register === "function") return mod.default.register;

  const shape = mod === null ? 'null'
    : mod === undefined ? 'undefined'
    : (typeof mod === 'object' ? `object keys=[${Object.keys(mod)}]` : typeof mod);
  throw new Error(`Модуль ${nameForLog} имеет неподдерживаемый экспорт (${shape}). Ожидается function или { register() }.`);
}

module.exports.loadModules = async (bot, moduleList) => {
  for (const item of moduleList) {
    const modPath = path.join(__dirname, item + ".js");
    let mod;
    try {
      const resolved = require.resolve(modPath);
      console.log("[loader] require:", resolved);
      mod = require(resolved);
      console.log("[loader] shape:", typeof mod, mod && Object.keys(mod));
    } catch (e) {
      throw new Error(`Не удалось require("${modPath}"): ${e.message}`);
    }
    const registrar = pickRegistrar(mod, item);
    await registrar(bot);
  }
};
