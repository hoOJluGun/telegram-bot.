module.exports = function isValidUrl(input) {
  if (typeof input !== "string") return false;
  const s = input.trim();
  if (!s || /\s/.test(s)) return false;
  try {
    const u = new URL(s);
    if (!["http:", "https:"].includes(u.protocol)) return false;
    if (!u.hostname || !u.hostname.includes(".")) return false;
    return true;
  } catch { return false; }
};
