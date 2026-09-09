/**
 * ============================================================
 *  R3 APOCALIPSIS — Logros (solo en este navegador)
 * ============================================================
 *  Guarda qué r3tards ha matado cada wallet, SOLO en localStorage
 *  de este navegador — así lo eligió el dueño del juego a propósito
 *  (gratis, sin pedir firmas extra ni gastar gas por guardar logros).
 *
 *  Por eso esta lista NO viaja entre dispositivos ni navegadores:
 *  vive solo en el navegador donde se jugó. Si alguien juega en el
 *  celular y luego revisa sus logros en la computadora, no va a ver
 *  nada — es la limitación conocida de este enfoque, a cambio de que
 *  sea gratis y no pida nada extra al jugador.
 *
 *  Usado por: game.js/main.js (para registrar cada kill) y
 *  logros.html (para leerlos y mostrarlos).
 * ============================================================
 */
const R3Achievements = (() => {
  const KEY = "r3ap_kills_v1";

  function loadAll() {
    try {
      const raw = localStorage.getItem(KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveAll(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      // localStorage lleno/bloqueado: no es crítico, el juego sigue igual,
      // simplemente ese kill no queda guardado.
    }
  }

  /**
   * Registra (o actualiza) el kill de un token para una wallet. Si ya lo
   * había matado antes, solo suma al contador y actualiza la fecha —
   * conserva la primera vez que lo mató.
   */
  function recordKill(address, info) {
    if (!address || !info || info.tokenId === undefined || info.tokenId === null) return;
    const addr = address.toLowerCase();
    const all = loadAll();
    if (!all[addr]) all[addr] = {};
    const key = String(info.tokenId);
    const prev = all[addr][key];
    all[addr][key] = {
      tokenId: info.tokenId,
      name: info.name || `r3tards #${info.tokenId}`,
      image: info.image || "",
      tierKey: info.tierKey || "common",
      tierLabel: info.tierLabel || "",
      points: info.points || 0,
      timesKilled: (prev ? prev.timesKilled : 0) + 1,
      firstKilledAt: prev ? prev.firstKilledAt : Date.now(),
      lastKilledAt: Date.now(),
    };
    saveAll(all);
  }

  /**
   * Devuelve la lista de kills de una wallet, más reciente primero.
   */
  function getKills(address) {
    if (!address) return [];
    const all = loadAll();
    const entry = all[address.toLowerCase()];
    if (!entry) return [];
    return Object.values(entry).sort((a, b) => b.lastKilledAt - a.lastKilledAt);
  }

  return { recordKill, getKills };
})();

window.R3Achievements = R3Achievements;
