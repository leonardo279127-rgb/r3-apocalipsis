/**
 * ============================================================
 *  R3 APOCALIPSIS — Lista de logros (guardados on-chain)
 * ============================================================
 *  Cada logro tiene un `id` fijo (0-255): es el número de bit que se
 *  guarda en `achievementsMask` dentro del contrato (ver
 *  contracts/R3Apocalipsis.sol → unlockAchievements()). NUNCA cambies
 *  el `id` de un logro que ya exista una vez publicado el juego — eso
 *  haría que un jugador que ya lo tenía "pierda" ese logro (el bit
 *  seguiría prendido en la cadena, pero apuntaría a otro logro nuevo).
 *  Para agregar logros nuevos en el futuro, usa el siguiente id libre.
 *
 *  `scope`:
 *    - "session": se puede calcular con los datos de la partida que
 *      recién terminó (ver el `summary` de onGameOver en game.js).
 *    - "lifetime": depende del conteo acumulado de kills de ESTE
 *      NAVEGADOR (R3Achievements, ver achievements.js) — hereda la
 *      misma limitación conocida de esa lista (no viaja entre
 *      dispositivos/navegadores). Aun así, una vez que el logro se
 *      desbloquea y se guarda on-chain, ESE desbloqueo sí es global y
 *      permanente para siempre — solo la "cuenta" que lleva hasta
 *      llegar ahí es local.
 * ============================================================
 */
const R3AchievementDefs = (() => {
  const I18N = window.R3I18N;

  // `name`/`desc` de cada logro ahora se leen del diccionario bilingüe
  // de js/i18n.js (claves "achv.<key>.name"/"achv.<key>.desc") en vez de
  // quedar quemados en español acá — así main.js (game over) y
  // medallas.html (medallero) muestran cada logro en el idioma activo
  // del jugador. Se conserva `key` (el nombre corto, ej. "primera_sangre")
  // precisamente para poder armar esas claves; `name`/`desc` como tal ya
  // NO se guardan en este arreglo (usar name(def)/desc(def) más abajo).
  const LIST = [
    { id: 0, key: "primera_sangre", scope: "session" },
    { id: 1, key: "cazador_raros", scope: "session" },
    { id: 2, key: "depredador_epico", scope: "session" },
    { id: 3, key: "leyenda_personal", scope: "session" },
    { id: 4, key: "certificado", scope: "session" },
    { id: 5, key: "racha_x10", scope: "session" },
    { id: 6, key: "maratonista", scope: "session" },
    { id: 7, key: "milesimo_punto", scope: "session" },
    { id: 8, key: "multi_legendario", scope: "session" },
    { id: 9, key: "cazador_leyendas", scope: "lifetime" },
    { id: 10, key: "coleccion_completa", scope: "lifetime" },
  ];

  /** Nombre del logro en el idioma activo (ver js/i18n.js). */
  function name(def) {
    return def ? I18N.t("achv." + def.key + ".name") : "";
  }
  /** Descripción del logro en el idioma activo (ver js/i18n.js). */
  function desc(def) {
    return def ? I18N.t("achv." + def.key + ".desc") : "";
  }

  /**
   * Dado el resumen de la partida que acaba de terminar (mismo objeto que
   * recibe onGameOver en main.js), devuelve la lista de ids de logros de
   * scope "session" que esa partida por sí sola ya cumple.
   */
  function bySessionStats(stats) {
    if (!stats) return [];
    const kb = stats.killsByTier || {};
    const totalKills = Object.values(kb).reduce((s, n) => s + (n || 0), 0);
    const out = [];
    if (totalKills >= 1) out.push(0);
    if ((kb.rare || 0) >= 1) out.push(1);
    if ((kb.epic || 0) >= 1) out.push(2);
    if ((kb.legendary || 0) >= 1) out.push(3);
    if ((stats.certifiedKills || 0) >= 1) out.push(4);
    if ((stats.bestCombo || 0) >= 10) out.push(5);
    if ((stats.survivalMs || 0) >= 10 * 60 * 1000) out.push(6);
    if ((stats.score || 0) >= 1000) out.push(7);
    if ((kb.legendary || 0) >= 3) out.push(8);
    return out;
  }

  /**
   * Dada la lista de kills acumulados de ESTE navegador para una wallet
   * (R3Achievements.getKills(address)) y el tamaño total de la colección,
   * devuelve los ids de logros "lifetime" ya cumplidos.
   */
  function byLifetimeKills(kills, collectionSize) {
    if (!Array.isArray(kills)) return [];
    const out = [];
    const legendaryKillCount = kills
      .filter((k) => k.tierKey === "legendary")
      .reduce((s, k) => s + (k.timesKilled || 0), 0);
    if (legendaryKillCount >= 10) out.push(9);
    if (collectionSize > 0 && kills.length >= collectionSize) out.push(10);
    return out;
  }

  function byId(id) {
    return LIST.find((a) => a.id === id) || null;
  }

  return { LIST, bySessionStats, byLifetimeKills, byId, name, desc };
})();

window.R3AchievementDefs = R3AchievementDefs;
