/**
 * ============================================================
 *  R3 APOCALIPSIS — Motor del juego
 * ============================================================
 *  Canvas 2D puro, sin dependencias de motores externos.
 *  Estados del juego los maneja main.js; este archivo solo
 *  expone R3Game.start(collection) / .stop() y dibuja/actualiza
 *  todo lo que pasa DENTRO de una partida ya pagada.
 * ============================================================
 */
const R3Game = (() => {
  const CFG = window.R3_CONFIG;
  // Idioma activo (ver js/i18n.js) — se usa para elegir la versión en
  // español/inglés de todo lo que el juego le "dice" al jugador durante
  // la partida: nombres de oleada, nombres de arma, las frases de los
  // legendarios y las de "cultura nad" de los comunes.
  const I18N = window.R3I18N;

  let canvas, ctx, dpr;
  let running = false;
  let rafId = null;
  let lastTs = 0;

  let collection = [];
  let falling = [];
  let projectiles = [];
  let enemyThrows = []; // objetos que épicos/legendarios le lanzan al avatar (ver spawnNFT/OBJECT_KINDS)
  let particles = [];
  let floatTexts = [];
  let banners = []; // avisos grandes tipo "¡LEGENDARIO detectado!"
  // Frases "cultura nad" de comunes ya en camino de dispararse (ver
  // spawnNFT/COMMON_NAD_PHRASES) — vive SEPARADA de `falling` a propósito:
  // si no, se perdían cuando el r3tard moría antes de que le tocara
  // "hablar" (los comunes se matan rapidísimo). Guardamos la referencia
  // al objeto nft (aunque ya lo hayan sacado de `falling`, el objeto en sí
  // sigue vivo en memoria con su última posición conocida) para que la
  // frase siempre salga, en el lugar donde el jugador lo vio por última
  // vez.
  let pendingCommonTaunts = [];
  // Burbujas de diálogo tipo cómic (comunes Y legendarios) — a diferencia
  // de `floatTexts` (que se sueltan en un punto fijo y se van solas), cada
  // entrada acá guarda la referencia VIVA al nft (`nft`) y se vuelve a
  // posicionar cada frame según su x/y ACTUAL mientras dibuja/cae — así la
  // burbuja de verdad "sale" de encima del r3tard en vez de quedar
  // colgada en el aire en el punto donde apareció. Pedido explícito del
  // usuario: "deberia aparecer como tipo comic saliendo de ellos". Si el
  // r3tard ya murió (lo sacaron de `falling`), el objeto sigue vivo en
  // memoria con su última posición conocida — la burbuja simplemente deja
  // de moverse y termina de desvanecerse ahí, que es justo lo esperable.
  let speechBubbles = [];

  let score = 0;
  let lives = CFG.MAX_LIVES;
  let wave = 1;
  let combo = 0;
  let bestCombo = 0;
  let comboTimer = 0;
  let killsByTier = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 };
  let certifiedKills = 0; // cuántos "Certified" (1/1) mató en ESTA partida — ver logro "Certificado"
  let legendaryKills = 0; // sube el daño del jugador: 1er legendario → x2, 2do → x3 (tope)
  let legendariesSpawned = 0; // cada legendario que aparece hace que el SIGUIENTE sea más resistente
  // Tope de cuántos épicos/legendarios pueden estar ATACANDO (tirando
  // cosas) al mismo tiempo — ver spawnNFT/MAX_ACTIVE_THROWERS. Sin esto,
  // en partidas largas podían coincidir 4-5 al mismo tiempo bombardeando
  // al jugador, que solo se puede mover en una sola dimensión (izquierda/
  // derecha): eso deja de ser "difícil" y pasa a ser imposible de
  // esquivar de verdad, no importa qué tan bueno seas. Bajarle la vida a
  // eso hace que la partida sea más difícil de forma justa (más rápido,
  // más resistente, personajes más raros) en vez de injusta (bala por
  // todos lados a la vez, sin forma real de reaccionar).
  let activeThrowers = [];
  let sessionKilledIds = new Set(); // tokenIds distintos matados en ESTA partida — meta: llegar a collection.length (los 1033)
  let sessionKillDetails = new Map(); // tokenId -> tierKey (mismos distintos de arriba, con su rareza) — para poder mandarlos on-chain al terminar (ver recordMatch en wallet.js)

  let spawnTimer = 0;
  let shakeTime = 0;
  let shakeMag = 0;
  let spawnFlash = null; // { time, color, key } — destello de pantalla al caer algo especial

  // ---- Progresión por tiempo real (no por puntaje) --------------------
  let sessionStartTs = 0;
  let lastDifficultyStep = -1; // último "minuto de dificultad" ya avisado (ver progress01/onDifficultyChange)
  let tierBuckets = {}; // tierKey -> item[] (agrupados una vez al iniciar)

  // ---- Avatar del jugador: siempre el r3tard MENOS raro de la colección
  let avatarItem = null;
  let avatarCutout = null;
  let avatarX = 0;
  let avatarTargetX = 0;
  const AVATAR_Y_OFFSET = 34;
  let pointerActive = false;
  let keyLeft = false;
  let keyRight = false;
  const AVATAR_KEY_SPEED = 620; // px/s moviéndose con teclado (flechas o A/D)

  // ---- Progresión de arma (ver WEAPON_TIER_META/currentWeaponTier) ----
  let lastFireAngle = -Math.PI / 2; // ángulo (rad) del último disparo — arranca apuntando hacia arriba,
  // que es lo normal ya que los r3tards caen desde arriba. Reemplaza al viejo
  // lastFireDir (-1/1) que solo dejaba mirar el arma horizontal: ahora el
  // arma apunta EXACTAMENTE hacia donde disparaste (pedido explícito: "que
  // se vea vertical en vez de horizontal como está ahora").
  let lastAnnouncedWeaponTier = 0; // último tier ya avisado con el banner, no repetir el aviso

  // ---- Fondo: escenas 100% animadas y hechas a medida, una por cada
  // nivel de dificultad (1-10) — pedido explícito del usuario: "los
  // fondos son pésimos, quiero cambiarlos por imágenes de excelente
  // calidad, ojalá animaciones que encajen con el juego y con monad" y,
  // más específico todavía: "no quiero esos mismos fondos [las fotos
  // reales que había antes, ni las del zip nuevo], quiero personalizados
  // por ti, ojalá animado, consulta el estilo de los r3tards.club" — o
  // sea: nada de fotos ni de imágenes ajenas, todo dibujado y animado por
  // código, en el mismo espíritu oscuro/irreverente de r3tards.club
  // (fondo oscuro, paleta morada de Monad, siluetas rotas, actitud de
  // "apocalipsis cripto" antes que paisaje bonito). No hay herramienta de
  // generación de imágenes disponible en este entorno, así que la única
  // forma de tener algo "animado y de excelente calidad" de verdad (no
  // una foto estática) es Canvas puro: gradiente + horizonte de torres
  // quebradas (parallax) + chispas/ceniza subiendo + un "portal" Monad
  // pulsante + glitch/interferencia en los niveles más altos, todo
  // reescalando en intensidad junto con la dificultad (ver MONAD_SCENES).
  //
  // `name` es bilingüe ({es, en}, ver auraThemeFor/getLang más abajo en
  // este mismo archivo para el mismo patrón) — se usa en el HUD
  // (hud-wave-name) y en el nombre de oleada, así que tiene que salir en
  // el idioma activo del jugador, no siempre en español.
  const THEMES = [
    { name: { es: "Grieta Inicial", en: "Initial Rift" }, top: "#150a2b", bottom: "#3a1f68", particle: "#8f7bff", accent: "#6E54FF" },
    { name: { es: "Tormenta Púrpura", en: "Purple Storm" }, top: "#1a0433", bottom: "#5b12a8", particle: "#c77dff", accent: "#b14aff" },
    { name: { es: "Núcleo en Llamas", en: "Blazing Core" }, top: "#2a0808", bottom: "#7a1f0e", particle: "#ff8a3d", accent: "#ff5e1a" },
    { name: { es: "Vacío Cósmico", en: "Cosmic Void" }, top: "#020010", bottom: "#12002b", particle: "#9df1ff", accent: "#5eead4" },
    { name: { es: "Apocalipsis Total", en: "Total Apocalypse" }, top: "#050005", bottom: "#4a0e6b", particle: "#ff5e9c", accent: "#6E54FF" },
  ];
  function themeName(theme) {
    return theme.name[I18N.getLang()] || theme.name.es;
  }

  // ---- Escenas de fondo por nivel de dificultad (ver getSceneIdx) ----
  // Progresión deliberada: empieza en el morado de marca de Monad (una
  // "grieta" apenas visible) y va derivando hacia rojo/naranja a medida
  // que sube la dificultad — la idea es que el propio fondo "cuente" que
  // el apocalipsis se agrava, sin depender de texto. `intensity` (0-1)
  // controla cuántas chispas hay, qué tan quebrado se ve el horizonte y
  // a partir de qué nivel aparece el efecto de glitch/interferencia.
  const MONAD_SCENES = [
    { name: { es: "Grieta Monad", en: "Monad Rift" }, top: "#0c0620", bottom: "#2a1350", accent: "#8f7bff", ember: "#b7a6ff", skyline: "#190f34", intensity: 0.12, glitch: false },
    { name: { es: "Testnet en Ruinas", en: "Testnet Ruins" }, top: "#0d0724", bottom: "#341a68", accent: "#7cc4ff", ember: "#a9dcff", skyline: "#1a1236", intensity: 0.22, glitch: false },
    { name: { es: "Enjambre de Nodos", en: "Node Swarm" }, top: "#100729", bottom: "#3c1874", accent: "#c77dff", ember: "#dcb0ff", skyline: "#1d1039", intensity: 0.32, glitch: false },
    { name: { es: "Tormenta de Gas", en: "Gas Storm" }, top: "#130620", bottom: "#4c1546", accent: "#ff9ecf", ember: "#ffc2e0", skyline: "#22102e", intensity: 0.42, glitch: false },
    { name: { es: "Fork Salvaje", en: "Wild Fork" }, top: "#17051b", bottom: "#5c1348", accent: "#ff7a45", ember: "#ffbd8c", skyline: "#26102a", intensity: 0.5, glitch: false },
    { name: { es: "Colapso de Bloques", en: "Block Collapse" }, top: "#190416", bottom: "#6c1332", accent: "#ff5e9c", ember: "#ffa8c8", skyline: "#2a0f24", intensity: 0.6, glitch: true },
    { name: { es: "Núcleo Fragmentado", en: "Fragmented Core" }, top: "#1c0410", bottom: "#7c1120", accent: "#ff5e1a", ember: "#ffb277", skyline: "#2e0e19", intensity: 0.7, glitch: true },
    { name: { es: "Reorg Total", en: "Total Reorg" }, top: "#1f0310", bottom: "#87101a", accent: "#ff3d5c", ember: "#ff92a7", skyline: "#330c14", intensity: 0.8, glitch: true },
    { name: { es: "Última Confirmación", en: "Final Confirmation" }, top: "#22030a", bottom: "#920d10", accent: "#ff2e2e", ember: "#ff8080", skyline: "#360a0d", intensity: 0.9, glitch: true },
    { name: { es: "Apocalipsis On-Chain", en: "On-Chain Apocalypse" }, top: "#260206", bottom: "#a20c0c", accent: "#ffce45", ember: "#ffe08f", skyline: "#3a080a", intensity: 1, glitch: true },
  ];

  /** Nivel de dificultad real (1-10, ver SPAWN_PROGRESSION) → índice 0-9
   * en MONAD_SCENES. El nivel 0 (antes del primer minuto) usa la misma
   * escena que el nivel 1, para no arrancar la partida sin escenario.
   * SOLO se usa para decidir la silueta del horizonte (ver drawSkyline) —
   * para los colores/intensidad, ver sceneBlend() más abajo, que es
   * continuo en vez de saltar de golpe cada minuto. */
  function getSceneIdx() {
    return Math.max(0, Math.min(MONAD_SCENES.length - 1, lastDifficultyStep - 1));
  }

  /**
   * Mezcla continua entre la escena actual y la siguiente — pedido
   * explícito tras probar el fondo animado: "se ve igual todo el tiempo,
   * me gustaría que evolucionara a medida que va avanzando la partida".
   * La dificultad REAL del juego (qué tan seguido caen r3tards, qué tan
   * probable es un raro) sigue subiendo en saltos de un minuto completo
   * a propósito (ver progress01() en Spawning, más abajo) — ese salto
   * "que se note" fue un pedido explícito de otra ronda y no se toca acá.
   * Pero el FONDO no tiene por qué compartir ese mismo salto: acá se
   * calcula un progreso CONTINUO (no redondeado a minutos) para que el
   * color del cielo/portal/ceniza vaya derivando todo el tiempo, en vez
   * de quedarse fijo 60 segundos y saltar de golpe. Devuelve {a, b, t}:
   * mezclar MONAD_SCENES[a] y MONAD_SCENES[b] con t (0=todo a, 1=todo b).
   */
  function sceneBlend() {
    const dur = Math.max(1, CFG.SPAWN_PROGRESSION.durationMinutes);
    const elapsedMin = (performance.now() - sessionStartTs) / 60000;
    const progressContinuous = Math.max(0, Math.min(1, elapsedMin / dur));
    const f = progressContinuous * (MONAD_SCENES.length - 1);
    const a = Math.max(0, Math.min(MONAD_SCENES.length - 1, Math.floor(f)));
    const b = Math.min(MONAD_SCENES.length - 1, a + 1);
    return { a, b, t: f - a };
  }

  function lerp(x, y, t) {
    return x + (y - x) * t;
  }
  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  // Devuelve "#rrggbb" (NO "rgb(...)") a propósito: varios lugares del
  // dibujo (drawPortal/drawGroundFog/el resplandor de drawBackground)
  // arman un color con alpha concatenando dos dígitos hex directamente
  // al final de scene.accent (ej. `scene.accent + "18"` → "#8f7bff18",
  // un #RRGGBBAA válido) — con formato "rgb(...)" esa concatenación daría
  // un color inválido y el canvas lo ignoraría en silencio.
  function lerpColor(hexA, hexB, t) {
    const a = hexToRgb(hexA), b = hexToRgb(hexB);
    const r = Math.round(lerp(a[0], b[0], t));
    const g = Math.round(lerp(a[1], b[1], t));
    const bl = Math.round(lerp(a[2], b[2], t));
    const toHex = (n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(bl)}`;
  }
  /** Escena "virtual" con todos los colores/intensidad ya mezclados entre
   * las dos escenas reales más cercanas al progreso actual — el resto del
   * pipeline de dibujo (drawSky/drawPortal/drawEmbers/etc.) no necesita
   * saber que es una mezcla, la usa igual que a cualquier entrada de
   * MONAD_SCENES. La silueta del horizonte (ver drawSkyline) es la única
   * pieza que NO se mezcla — son formas fijas, no colores, así que usa la
   * escena más cercana (redondeada) tal cual, evitando dibujar dos
   * horizontes superpuestos.
   */
  function blendedScene() {
    const { a, b, t } = sceneBlend();
    const sa = MONAD_SCENES[a], sb = MONAD_SCENES[b];
    return {
      name: t < 0.5 ? sa.name : sb.name,
      top: lerpColor(sa.top, sb.top, t),
      bottom: lerpColor(sa.bottom, sb.bottom, t),
      accent: lerpColor(sa.accent, sb.accent, t),
      ember: lerpColor(sa.ember, sb.ember, t),
      skyline: lerpColor(sa.skyline, sb.skyline, t),
      intensity: lerp(sa.intensity, sb.intensity, t),
      glitch: t < 0.5 ? sa.glitch : sb.glitch,
    };
  }

  // ---- Horizonte de torres/monolitos quebrados (silueta de fondo) ----
  // Se genera UNA sola vez por escena (no en cada frame — sería carísimo
  // y además parpadearía de forma distinta cuadro a cuadro) usando un
  // generador pseudoaleatorio con semilla fija (mismo resultado siempre,
  // no cambia entre partidas ni recargas). Las coordenadas quedan en
  // fracciones (0-1 de ancho/alto) para poder reescalarlas al tamaño real
  // del canvas en cada resize, y se generan de -0.25 a 1.25 (más ancho
  // que la pantalla) para poder desplazarlas lentamente en parallax sin
  // que se note el borde.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function buildSkyline(seed, intensity) {
    const rand = mulberry32(seed * 977 + 13);
    const count = 9 + Math.round(intensity * 6); // más quebrado/denso en niveles altos
    const towers = [];
    for (let i = 0; i < count; i++) {
      const x = -0.25 + (1.5 * (i + rand() * 0.6)) / count;
      const width = 0.028 + rand() * (0.05 + intensity * 0.03);
      const height = 0.1 + rand() * (0.22 + intensity * 0.22);
      const jag = rand() < 0.55; // punta rota/irregular en vez de plana
      const crack = rand() < 0.3 + intensity * 0.3; // grieta luminosa vertical
      const antenna = rand() < 0.35; // varilla/antena rota asomando arriba
      towers.push({ x, width, height, jag, crack, antenna, seedA: rand(), seedB: rand() });
    }
    return towers;
  }
  // Cache: una silueta por escena, calculada una sola vez al cargar el módulo.
  const SKYLINES = MONAD_SCENES.map((scene, i) => buildSkyline(i + 1, scene.intensity));

  let monadOrbImg = null;
  const weaponImgs = {}; // imgKey -> HTMLImageElement (ver WEAPON_TIER_META)

  let onScoreChange = () => {};
  let onLivesChange = () => {};
  let onWaveChange = () => {};
  let onDifficultyChange = () => {}; // (minuto actual, minuto máximo) — sube en cada minuto completo de partida
  let onGameOver = () => {};
  let onNftTag = () => {}; // cuadro de texto flotante (DOM) al caer un NFT
  let onKill = () => {}; // se llama en cada NFT eliminado (para logros)
  let onDamageBuff = () => {}; // se llama cuando el daño del jugador sube (tras matar legendarios)
  let onWeaponUnlock = () => {}; // se llama al desbloquear un arma nueva (ver WEAPON_TIER_META)
  let onProgress = () => {}; // se llama con (distintosMatados, total) cada vez que sube el contador

  function damageMultiplier() {
    if (legendaryKills <= 0) return 1;
    if (legendaryKills === 1) return 2;
    return 3; // tope: matar más legendarios ya no sigue subiendo el daño
  }

  /**
   * Progresión de arma — pedido explícito del usuario: matar un épico
   * da la última pistola del set (ráfaga de 2); el 1er legendario da la
   * primera (ráfaga de 3); el 5° legendario da la tercera (ráfaga de
   * 4); el 10° legendario da la segunda (ráfaga de 5). Se calcula
   * siempre a partir de killsByTier (no hay estado aparte que
   * desincronizar), así que solo puede subir de nivel, nunca bajar.
   */
  const WEAPON_TIER_META = [
    null, // tier 0: sin arma todavía, disparo simple (el de siempre)
    { imgKey: "epic", burst: 2, label: { es: "Pistola", en: "Pistol" } },
    { imgKey: "legendary1", burst: 3, label: { es: "Revólver", en: "Revolver" } },
    { imgKey: "legendary5", burst: 4, label: { es: "Subfusil", en: "SMG" } },
    { imgKey: "legendary10", burst: 5, label: { es: "Rifle", en: "Rifle" } },
  ];
  function currentWeaponTier() {
    const legKills = killsByTier.legendary || 0;
    const epicKills = killsByTier.epic || 0;
    if (legKills >= 10) return 4;
    if (legKills >= 5) return 3;
    if (legKills >= 1) return 2;
    if (epicKills >= 1) return 1;
    return 0;
  }

  function init(canvasEl, callbacks) {
    canvas = canvasEl;
    ctx = canvas.getContext("2d");
    onScoreChange = callbacks.onScoreChange || onScoreChange;
    onLivesChange = callbacks.onLivesChange || onLivesChange;
    onWaveChange = callbacks.onWaveChange || onWaveChange;
    onDifficultyChange = callbacks.onDifficultyChange || onDifficultyChange;
    onGameOver = callbacks.onGameOver || onGameOver;
    onNftTag = callbacks.onNftTag || onNftTag;
    onKill = callbacks.onKill || onKill;
    onDamageBuff = callbacks.onDamageBuff || onDamageBuff;
    onWeaponUnlock = callbacks.onWeaponUnlock || onWeaponUnlock;
    onProgress = callbacks.onProgress || onProgress;

    // Logo real de Monad (el que mandó el usuario) — se usa para el
    // disparo del jugador, las vidas del HUD y el ataque "spam" de
    // Keone/James (ver drawProjectile/drawEnemyThrow más abajo).
    monadOrbImg = new Image();
    monadOrbImg.src = "assets/monad-logo.png";

    // Sprites de arma que manda el usuario (ver WEAPON_TIER_META) — se
    // van desbloqueando según la progresión de kills de esta partida.
    for (const key of ["epic", "legendary1", "legendary5", "legendary10"]) {
      const img = new Image();
      img.src = `assets/weapons/w-${key}.png`;
      weaponImgs[key] = img;
    }

    // Los 10 fondos (ver MONAD_SCENES/drawBackground) ya no son fotos que
    // precargar — son 100% Canvas animado, así que no hay nada que
    // esperar acá: quedan listos para dibujarse desde el primer frame.

    resize();
    window.addEventListener("resize", resize);
    // Tap/clic: dispara hacia ese punto Y empieza a mover el avatar hacia
    // esa misma X. Arrastrar (mantener presionado y mover) solo mueve al
    // avatar sin disparar de nuevo — así se puede reposicionar con calma
    // y disparar aparte con cada tap, cubriendo toda la pantalla.
    canvas.addEventListener("pointerdown", (e) => {
      pointerActive = true;
      handlePointer(e);
    });
    window.addEventListener("pointerup", () => {
      pointerActive = false;
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!running || !pointerActive) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      avatarTargetX = Math.max(24, Math.min(cssW() - 24, x));
    });

    // Teclado: flechas izquierda/derecha o A/D mueven al avatar de forma
    // continua mientras la tecla esté presionada (no dispara — para
    // disparar sigue siendo con clic/tap, como ya funcionaba).
    window.addEventListener("keydown", (e) => {
      if (!running) return;
      if (e.code === "ArrowLeft" || e.code === "KeyA") { keyLeft = true; e.preventDefault(); }
      else if (e.code === "ArrowRight" || e.code === "KeyD") { keyRight = true; e.preventDefault(); }
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === "ArrowLeft" || e.code === "KeyA") keyLeft = false;
      else if (e.code === "ArrowRight" || e.code === "KeyD") keyRight = false;
    });
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    // Si la ventana se hace más angosta (rotar el teléfono, redimensionar
    // en escritorio) mientras se juega, evita que el avatar quede "fuera"
    // del nuevo ancho hasta el próximo clic/tecla.
    if (canvas.width > 0) {
      const w = cssW();
      avatarTargetX = Math.max(24, Math.min(w - 24, avatarTargetX || w / 2));
      avatarX = Math.max(24, Math.min(w - 24, avatarX || w / 2));
    }
  }

  function cssW() {
    return canvas.width / dpr;
  }
  function cssH() {
    return canvas.height / dpr;
  }

  function tierConfig(key) {
    return CFG.TIERS.find((t) => t.key === key) || CFG.TIERS[CFG.TIERS.length - 1];
  }

  /**
   * Convierte una URI de imagen (posiblemente ipfs://...) en una URL
   * http(s) real y mostrable en un <img>, usando el primer gateway
   * candidato. Si ya es una ruta local (data/images/…) o http(s), se
   * devuelve tal cual. Se usa para lo que se GUARDA (logros), no para lo
   * que se dibuja en el canvas (eso ya prueba varios gateways con
   * loadImageWithFallback).
   */
  function resolvedImageUrl(uri) {
    if (!uri) return "";
    if (window.R3Loader && typeof R3Loader.resolveCandidates === "function") {
      const candidates = R3Loader.resolveCandidates(uri);
      if (candidates && candidates.length > 0) return candidates[0];
    }
    return uri;
  }

  // ---------------------------------------------------------------
  // Recorte "cutout" de la imagen del NFT: intenta quitar el fondo
  // plano de la imagen para que se vea recortado a su silueta.
  // Si el navegador no puede leer los píxeles (CORS), se usa un
  // recorte circular suave como respaldo — sigue viéndose bien.
  // ---------------------------------------------------------------
  function processCutout(rawImg) {
    const size = 256;
    const off = document.createElement("canvas");
    off.width = size;
    off.height = size;
    const octx = off.getContext("2d");
    octx.drawImage(rawImg, 0, 0, size, size);

    try {
      const imgData = octx.getImageData(0, 0, size, size);
      const d = imgData.data;
      // Estimamos el color de fondo promediando las 4 esquinas.
      const corners = [
        [0, 0],
        [size - 1, 0],
        [0, size - 1],
        [size - 1, size - 1],
      ];
      let br = 0, bg = 0, bb = 0;
      corners.forEach(([x, y]) => {
        const i = (y * size + x) * 4;
        br += d[i];
        bg += d[i + 1];
        bb += d[i + 2];
      });
      br /= 4; bg /= 4; bb /= 4;

      const threshold = 34;
      for (let i = 0; i < d.length; i += 4) {
        const dr = d[i] - br, dg = d[i + 1] - bg, db = d[i + 2] - bb;
        const dist = Math.sqrt(dr * dr + dg * dg + db * db);
        if (dist < threshold) {
          d[i + 3] = 0;
        } else if (dist < threshold * 1.8) {
          d[i + 3] = Math.round((d[i + 3] * (dist - threshold)) / (threshold * 0.8));
        }
      }
      octx.putImageData(imgData, 0, 0);
      return off;
    } catch {
      // Fallback: recorte circular suave, sin tocar píxeles.
      const off2 = document.createElement("canvas");
      off2.width = size;
      off2.height = size;
      const o2 = off2.getContext("2d");
      o2.save();
      o2.beginPath();
      o2.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
      o2.closePath();
      o2.clip();
      o2.drawImage(rawImg, 0, 0, size, size);
      o2.restore();
      return off2;
    }
  }

  const cutoutCache = new Map(); // tokenId -> processed canvas | 'loading' | 'error'

  /**
   * Carga la imagen del NFT probando, en orden, cada URL candidata
   * (gateways IPFS alternos si el primero falla o está saturado) antes
   * de rendirse. Esto es clave: un solo gateway público de IPFS caído o
   * con rate-limit ya no tira abajo la imagen de todo un NFT.
   *
   * BUG REAL corregido aquí: antes se pedía SIEMPRE con
   * `img.crossOrigin = "anonymous"`. Eso está bien para poder luego leer
   * los píxeles (processCutout) y recortar la silueta, PERO si el gateway
   * de turno no manda los encabezados CORS correctos (la mayoría de
   * gateways públicos de IPFS no los manda), el navegador NO CARGA LA
   * IMAGEN EN ABSOLUTO — no es un tema de lentitud ni de reintentos, la
   * imagen simplemente nunca aparece (ni el fondo, ni el NFT, ni el
   * avatar), sin importar cuántos gateways alternos se prueben, porque
   * TODOS fallan por el mismo motivo.
   * Ahora cada URL candidata se intenta primero CON crossOrigin (para
   * poder recortar la silueta si el gateway sí manda CORS) y, si eso
   * falla, se reintenta la MISMA url SIN crossOrigin antes de pasar a la
   * siguiente candidata — eso sí funciona siempre para poder MOSTRAR la
   * imagen (aunque no se pueda recortar su silueta), porque mostrar una
   * imagen en el canvas no depende de CORS, solo leer sus píxeles sí.
   */
  function loadImageWithFallback(rawImageUri, onDone) {
    const candidates =
      window.R3Loader && typeof R3Loader.resolveCandidates === "function"
        ? R3Loader.resolveCandidates(rawImageUri)
        : [rawImageUri];

    let i = 0;
    function tryNext() {
      if (i >= candidates.length) {
        onDone(null);
        return;
      }
      const url = candidates[i++];
      tryUrl(url, true);
    }
    function tryUrl(url, withCors) {
      const img = new Image();
      if (withCors) img.crossOrigin = "anonymous";
      // Prioridad ALTA: esta imagen hace falta YA (algo la está usando en
      // este mismo momento — un r3tard cayendo, el fondo, el avatar). Si
      // compite por red contra el precargado de fondo (que usa prioridad
      // BAJA, ver prefetchImages), el navegador debe atenderla primero.
      img.fetchPriority = "high";
      img.onload = () => onDone(img);
      img.onerror = () => {
        if (withCors) tryUrl(url, false); // misma url, ya sin pedir CORS
        else tryNext(); // esa url no sirvió de ninguna forma: siguiente candidata
      };
      img.src = url;
    }
    tryNext();
  }

  /**
   * PRECALENTAMIENTO de imágenes — el porqué:
   * Cada r3tard que cae se elige AL AZAR entre ~1033 posibles (no en orden,
   * ver spawnNFT), así que casi cada uno es una URL que el navegador nunca
   * pidió antes. Con la colección de prueba (6 items) eso no se nota,
   * porque a la 2ª aparición ya está en caché — pero con 1033 la inmensa
   * mayoría de caídas son "primera vez", y si la respuesta de red no llega
   * antes de que el r3tard toque el piso (o lo mates), su imagen nunca
   * llegó a mostrarse a tiempo: se ve como un círculo vacío que "no
   * aparece", aunque el archivo exista y esté bien en el repo. (El fondo
   * ya no depende de esto — es Canvas animado, ver MONAD_SCENES — pero
   * los r3tards que caen sí siguen usando su imagen real.)
   *
   * OJO — esto no tiene nada que ver con dónde "viven" las imágenes. Las
   * 1033 imágenes YA están en el repositorio (`web/data/images/*.webp`,
   * generadas por `tools/build-collection.mjs`) y se sirven directo desde
   * GitHub Pages — no hay IPFS ni ningún gateway de por medio en este
   * punto. Pero "estar en el repositorio" no es lo mismo que "ya estar en
   * el teléfono/computadora de cada jugador": cada visitante, sin importar
   * dónde esté, tiene que DESCARGAR esos archivos por internet la primera
   * vez que los necesita — igual que las imágenes de cualquier página web.
   * No hay forma de que eso tarde CERO segundos; la única pregunta es cómo
   * repartimos esa espera. La estrategia (coordinada con `main.js` /
   * `ensureCollectionLoaded`, y con la prioridad "alta" que se le pone a
   * las imágenes urgentes en `loadImageWithFallback` más arriba) es en dos
   * tiempos:
   *   1) Un empujón corto y de tiempo fijo apenas la colección está lista,
   *      ANTES de dejar jugar — así se arranca con una buena parte ya en
   *      caché, sin tener que esperar las 1033.
   *   2) El resto sigue solo, en segundo plano, MIENTRAS el jugador ya
   *      está jugando — sin bloquear nada. Para que esto no le quite ancho
   *      de banda a las imágenes que sí hacen falta YA (las que van
   *      cayendo), cada imagen de este precalentamiento se pide con
   *      `fetchPriority: "low"` — el navegador mismo le da paso primero a
   *      cualquier imagen "alta prioridad" que compita por la misma
   *      conexión en ese momento.
   * `onProgress(done, total)` se llama en cada imagen que termina (bien o
   * mal) y la promesa se resuelve cuando terminan todas — pero quien llama
   * a esta función puede dejar de esperarla sin cancelarla; sigue sola.
   */
  function prefetchImages(coll, onProgress) {
    return new Promise((resolve) => {
      if (!Array.isArray(coll) || coll.length === 0) {
        resolve();
        return;
      }
      const urls = [];
      for (const item of coll) {
        if (!item || !item.image) continue;
        urls.push(resolvedImageUrl(item.image));
      }
      const total = urls.length;
      if (total === 0) {
        resolve();
        return;
      }
      let idx = 0;
      let done = 0;
      // Ahora que build-collection.mjs sirve cada imagen ya reducida a un
      // WebP chiquito (unos pocos KB, ver GAME_IMAGE_MAX_SIZE), se puede
      // pedir más en paralelo sin saturar la conexión — antes esto asumía
      // archivos mucho más pesados.
      const CONCURRENCY = 12;
      function next() {
        if (idx >= urls.length) return;
        const url = urls[idx++];
        const img = new Image();
        img.crossOrigin = "anonymous";
        // Prioridad BAJA a propósito: esta descarga es "por si acaso"
        // (adelantada), no urgente — si en ese momento hace falta otra
        // imagen de verdad (fetchPriority "high" en loadImageWithFallback),
        // el navegador debe atenderla a ella primero.
        img.fetchPriority = "low";
        const advance = () => {
          done++;
          if (typeof onProgress === "function") onProgress(done, total);
          if (done >= total) resolve();
          else next();
        };
        img.onload = advance;
        img.onerror = advance;
        img.src = url;
      }
      const starters = Math.min(CONCURRENCY, urls.length);
      for (let k = 0; k < starters; k++) next();
    });
  }

  function getCutoutFor(item) {
    const hit = cutoutCache.get(item.tokenId);
    if (hit && hit !== "loading" && hit !== "error") return hit;
    if (hit === "loading" || hit === "error") return null;

    cutoutCache.set(item.tokenId, "loading");
    loadImageWithFallback(item.image, (img) => {
      if (!img) {
        cutoutCache.set(item.tokenId, "error");
        return;
      }
      try {
        cutoutCache.set(item.tokenId, processCutout(img));
      } catch {
        cutoutCache.set(item.tokenId, "error");
      }
    });
    return null;
  }

  // ---------------------------------------------------------------
  // Spawning
  // ---------------------------------------------------------------

  /**
   * 0 al empezar la partida, 1 a los CFG.SPAWN_PROGRESSION.durationMinutes
   * de juego real (y se queda en 1 después — nunca sigue subiendo). Todo
   * lo que depende de "qué tan avanzada/difícil" está la partida usa esto,
   * NO el puntaje — así una partida perfecta de ~3 horas llega al máximo
   * de dificultad/rareza de forma predecible, sin importar qué tan rápido
   * vaya anotando el jugador.
   */
  function progress01() {
    const elapsedMin = (performance.now() - sessionStartTs) / 60000;
    const dur = Math.max(1, CFG.SPAWN_PROGRESSION.durationMinutes);
    // Escalonado por MINUTO COMPLETO (no continuo): pedido explícito —
    // que se sienta que la dificultad sube cada minuto, no que crezca
    // tan despacio y suave que en la práctica no se note. Cada minuto
    // que pasa es un salto real en velocidad/frecuencia/rareza; al
    // llegar a `durationMinutes` ya está en el máximo y se queda ahí.
    const steppedMin = Math.floor(elapsedMin);
    return Math.max(0, Math.min(1, steppedMin / dur));
  }

  // Minuto de dificultad actual (0 al empezar, hasta durationMinutes en
  // el máximo) — separado de progress01() solo para poder avisarle a la
  // UI (onDifficultyChange) exactamente cuándo cambia, sin repetir el
  // cálculo del "piso" del minuto en dos lugares.
  function difficultyStep() {
    const elapsedMin = (performance.now() - sessionStartTs) / 60000;
    const dur = Math.max(1, CFG.SPAWN_PROGRESSION.durationMinutes);
    return Math.max(0, Math.min(dur, Math.floor(elapsedMin)));
  }

  function spawnInterval() {
    const p = CFG.SPAWN_PROGRESSION;
    return Math.max(p.spawnIntervalMinMs, p.spawnIntervalStartMs - progress01() * (p.spawnIntervalStartMs - p.spawnIntervalMinMs));
  }

  /**
   * Probabilidad actual de cada tier (interpolada por tiempo real, ver
   * CFG.SPAWN_PROGRESSION). "common" se calcula solo como el resto, así
   * la suma siempre da 1 sin tener que balancearlo a mano.
   */
  function currentTierWeights() {
    const p = progress01();
    const weights = {};
    let sumOthers = 0;
    for (const key of Object.keys(CFG.SPAWN_PROGRESSION.tierWeights)) {
      const cfgW = CFG.SPAWN_PROGRESSION.tierWeights[key];
      const val = Math.max(0, cfgW.start + (cfgW.end - cfgW.start) * p);
      weights[key] = val;
      sumOthers += val;
    }
    weights.common = Math.max(0, 1 - sumOthers);
    return weights;
  }

  /**
   * Elige qué TIER va a caer, con las probabilidades de arriba — no qué
   * NFT exacto (eso sale de un pick uniforme dentro del tier elegido, en
   * spawnNFT). Esto es lo que hace que los legendarios sean de verdad
   * raros al principio (≈1 entre 1000) sin importar cuántos tokens
   * legendarios existan en la colección.
   */
  function pickWeightedTierKey() {
    const weights = currentTierWeights();
    const entries = Object.keys(weights)
      .filter((k) => tierBuckets[k] && tierBuckets[k].length > 0)
      .map((k) => [k, weights[k]]);
    if (entries.length === 0) return null;
    const total = entries.reduce((s, [, w]) => s + w, 0);
    if (total <= 0) return entries[(Math.random() * entries.length) | 0][0];
    let r = Math.random() * total;
    for (const [key, w] of entries) {
      if (r < w) return key;
      r -= w;
    }
    return entries[entries.length - 1][0];
  }

  /**
   * El avatar del jugador siempre es el r3tard MENOS raro de la colección
   * (rarityScore más bajo; en caso de empate, el tokenId más chico) — así
   * es siempre el mismo NFT, partida tras partida, mientras la colección
   * no cambie.
   */
  function pickDefaultAvatarItem(coll) {
    if (!coll || coll.length === 0) return null;
    let best = coll[0];
    for (const it of coll) {
      const bs = typeof best.rarityScore === "number" ? best.rarityScore : Infinity;
      const is = typeof it.rarityScore === "number" ? it.rarityScore : Infinity;
      if (is < bs || (is === bs && it.tokenId < best.tokenId)) best = it;
    }
    return best;
  }


  /**
   * Los puntos base ya dependen del tier (que a su vez sale de la rareza
   * de los rasgos, ver nft-loader.js → computeRarity). Esto añade una
   * variación FINA dentro del tier: dos NFTs "raros" no valen exactamente
   * lo mismo — el que tiene rasgos más escasos dentro de ese tier vale
   * hasta 50% más puntos que el que está justo en el borde del tier.
   */
  function rarityBonusMultiplier(item) {
    const total = collection.length;
    if (!total || !item.rarityRank) return 1;
    const idx = CFG.TIERS.findIndex((t) => t.key === item.rarityTier);
    if (idx < 0) return 1;
    const upper = CFG.TIERS[idx].topPercent;
    const lower = idx > 0 ? CFG.TIERS[idx - 1].topPercent : 0;
    const span = Math.max(upper - lower, 0.0001);
    const percentile = item.rarityRank / total;
    const positionInTier = Math.min(1, Math.max(0, (percentile - lower) / span));
    return 1 + (1 - positionInTier) * 0.5; // 0% en el borde común del tier, hasta +50% en el extremo más raro
  }

  /**
   * Patrón de movimiento del NFT que va a caer. Los comunes/poco comunes
   * siempre caen recto (para que sigan siendo fáciles de identificar y
   * golpear). Desde "raro" en adelante empieza a variar, y "épico"/
   * "legendario" son los que de verdad se ponen difíciles de acertar:
   * zigzag (se mueven de lado a lado mientras caen), temblor (vibran,
   * cuesta apuntarles bien), parpadeo (aparecen y desaparecen), y una
   * variante especial "side" que en vez de caer entra por un costado de
   * la pantalla, cruza, y se DEVUELVE por donde vino (como un bonus que
   * hay que cazar rápido — si se escapa no quita vida, solo se pierde
   * la oportunidad de sus puntos).
   */
  function pickMovementPattern(tierKey) {
    const m = {
      kind: "fall",
      zigzag: false,
      zigAmp: 0,
      zigFreq: 0,
      zigPhase: Math.random() * Math.PI * 2,
      tremble: false,
      blink: false,
      blinkPhase: Math.random() * Math.PI * 2,
      drift: false,
      driftVx: 0,
      spin: false,
      spinSpeed: 0,
      spinPhase: Math.random() * Math.PI * 2,
    };
    if (tierKey === "uncommon" || tierKey === "common") {
      // Pedido explícito: antes los comunes/poco comunes SIEMPRE caían en
      // línea recta y sin ninguna gracia ("muy plano"). Se les da una
      // pizca de vida — un poquito de zigzag o una deriva lateral lenta
      // (bastante más suave que la de "raro" en adelante, para que sigan
      // siendo fáciles de acertar), más una probabilidad de "giro" que es
      // PURAMENTE VISUAL (rota su propio retrato dentro del círculo, no
      // mueve su punto real de golpeo) — nada de esto los hace más
      // difíciles, es solo para que no todos se sientan idénticos, sin
      // quitarle protagonismo a los raros/épicos/legendarios.
      const flavorRoll = Math.random();
      if (flavorRoll < 0.16) {
        m.zigzag = true;
        m.zigAmp = 8 + Math.random() * 7; // bastante más chico que "raro" (18-30)
        m.zigFreq = 0.55 + Math.random() * 0.35;
      } else if (flavorRoll < 0.28) {
        m.drift = true;
        m.driftVx = (Math.random() < 0.5 ? -1 : 1) * (10 + Math.random() * 14);
      }
      m.spin = Math.random() < 0.22;
      m.spinSpeed = (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 1.1);
    } else if (tierKey === "rare") {
      if (Math.random() < 0.35) {
        m.zigzag = true;
        m.zigAmp = 18 + Math.random() * 12;
        m.zigFreq = 0.9 + Math.random() * 0.4;
      }
    } else if (tierKey === "epic") {
      if (Math.random() < 0.55) {
        m.zigzag = true;
        m.zigAmp = 26 + Math.random() * 16;
        m.zigFreq = 1.1 + Math.random() * 0.5;
      }
      m.tremble = Math.random() < 0.35;
      m.blink = Math.random() < 0.3;
      if (Math.random() < 0.18) m.kind = "side";
    } else if (tierKey === "legendary") {
      if (Math.random() < 0.7) {
        m.zigzag = true;
        m.zigAmp = 34 + Math.random() * 21;
        m.zigFreq = 1.3 + Math.random() * 0.7;
      }
      m.tremble = Math.random() < 0.5;
      m.blink = Math.random() < 0.5;
      if (Math.random() < 0.3) m.kind = "side";
    }
    if (m.kind === "side") m.zigzag = false; // el recorrido lateral ya es su patrón principal
    return m;
  }

  // ---------------------------------------------------------------
  // Color a partir de los RASGOS REALES de cada r3tard ("Background" /
  // "Aura" en su metadata on-chain) — pedido explícito: que el fondo y
  // el aura de cada pieza salgan de sus propios atributos de la
  // colección, no de un tema inventado por nosotros. No sabemos de
  // antemano la lista completa de valores posibles que existan en la
  // colección real, así que: si el texto del rasgo menciona un color/
  // elemento conocido (rojo, fuego, agua...) usamos ese tono a mano;
  // si no, generamos un tono estable a partir del propio texto (hash →
  // matiz HSL) — así el MISMO valor de rasgo siempre da el MISMO color,
  // aunque no lo tengamos precargado.
  const NAMED_HUES = {
    rojo: 4, red: 4,
    azul: 226, blue: 226,
    verde: 140, green: 140, esmeralda: 150,
    amarillo: 48, yellow: 48,
    morado: 268, purpura: 268, "púrpura": 268, violeta: 268, purple: 268,
    naranja: 26, orange: 26,
    rosa: 330, pink: 330, magenta: 320,
    negro: 250, black: 250,
    blanco: 250, white: 250,
    gris: 235, grey: 235, gray: 235, plata: 220, silver: 220,
    dorado: 45, gold: 45, oro: 45,
    cian: 180, cyan: 180, turquesa: 174,
    fuego: 18, fire: 18, lava: 12, flama: 18,
    hielo: 195, ice: 195, agua: 200, water: 200, oceano: 200, "océano": 200,
    tierra: 32, earth: 32, tierral: 32,
    rayo: 52, rayos: 52, lightning: 52, thunder: 52, electrico: 52, "eléctrico": 52,
    cristal: 280, crystal: 280,
    viento: 150, wind: 150, aire: 150,
    cosmico: 268, "cósmico": 268, cosmic: 268, galaxia: 268, espacio: 268,
    toxico: 96, "tóxico": 96, toxic: 96, veneno: 96, poison: 96,
    arcoiris: 320, "arcoíris": 320, rainbow: 320,
  };
  function hueFromTraitValue(value) {
    if (!value) return null;
    const key = String(value).trim().toLowerCase();
    if (!key) return null;
    for (const name in NAMED_HUES) {
      if (key.includes(name)) return NAMED_HUES[name];
    }
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return h % 360;
  }
  function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const toHex = (x) => Math.round(255 * x).toString(16).padStart(2, "0");
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
  }
  /** Busca el valor de un rasgo por su trait_type (sin importar mayúsculas/acentos exactos). */
  function findAttr(item, traitType) {
    if (!item || !Array.isArray(item.attributes)) return null;
    const hit = item.attributes.find((a) => String(a.trait_type || "").trim().toLowerCase() === traitType);
    return hit ? hit.value : null;
  }
  /** Color único (hex) a partir del rasgo "Aura" real de un r3tard, o null si no tiene. */
  function auraColorFromItem(item) {
    const hue = hueFromTraitValue(findAttr(item, "aura"));
    return hue === null ? null : hslToHex(hue, 78, 62);
  }
  function spawnNFT() {
    if (collection.length === 0) return;
    const tierKey = pickWeightedTierKey();
    if (!tierKey) return;
    const bucket = tierBuckets[tierKey];
    // Para poder completar la colección (ver sessionKilledIds/meta
    // de "colección completa"), se prefiere un r3tard de este tier que
    // TODAVÍA no hayas matado en esta partida. Si ya mataste a todos los
    // de este tier, cae de respaldo a repetir cualquiera (normal, ya no
    // suma al contador de distintos pero sigue dando puntos).
    const freshInTier = bucket.filter((it) => !sessionKilledIds.has(it.tokenId));
    const pool = freshInTier.length > 0 ? freshInTier : bucket;
    const item = pool[(Math.random() * pool.length) | 0];
    const tier = tierConfig(item.rarityTier);
    const baseSize = Math.min(cssW(), cssH()) * 0.09;
    const size = baseSize * tier.sizeMul;
    // La vida de cada NFT sube con el tiempo, pero NO por igual: los tiers
    // más raros (hpGrowth alto) se vuelven muchísimo más resistentes según
    // avanza la partida, mientras que los comunes se quedan casi siempre
    // fáciles de matar de un par de golpes. Así la dificultad real escala
    // con la rareza, no solo con el reloj.
    const growth = typeof tier.hpGrowth === "number" ? tier.hpGrowth : 1;
    // Además, cada legendario que va apareciendo es más difícil que el
    // anterior (no solo por el reloj): el 1° sale normal, el 2° ya viene
    // ~55% más resistente, el 3° el doble, etc. — tope en +6 legendarios
    // para que nunca llegue a ser literalmente imposible de matar.
    let legendaryEscalation = 1;
    // Cada legendario tiene una "personalidad" fija (aura + tirada +
    // sonido + movimiento + frases), elegida por hash de su tokenId —
    // ver LEGENDARY_AURA_THEMES/auraThemeFor. legendaryTheme.hardness
    // (0-7) hace que unos sean de entrada más duros que otros, aparte de
    // la escalada normal por cuántos legendarios van saliendo.
    const legendaryTheme = tier.key === "legendary" ? auraThemeFor(item.tokenId) : null;
    if (tier.key === "legendary") {
      legendariesSpawned += 1;
      legendaryEscalation = 1 + Math.min(legendariesSpawned - 1, 6) * 0.55;
      // OJO — este multiplicador de hardness se dejó DELIBERADAMENTE
      // chico (máx. +28%, no +84%): ya se combina con legendaryEscalation
      // de arriba (que sola llega hasta 4.3x) y con el tiempo de partida
      // (hpGrowth). Con un hardness fuerte AQUÍ ADEMÁS, el legendario más
      // duro (rayos: hardness 7 + teletransporte + el que más tira) se
      // volvía casi imposible de bajar a tiempo — justo lo que el
      // usuario pidió evitar ("que todos se puedan matar si se
      // esfuerzan"). La dificultad de "rayos" ya se nota de sobra en que
      // cuesta más acertarle (se teletransporta) y ataca más seguido —
      // no hacía falta apilarle también el triple de vida.
      if (legendaryTheme) legendaryEscalation *= 1 + legendaryTheme.hardness * 0.04;
    }
    const hp = Math.max(1, Math.round(tier.hp * (1 + progress01() * growth) * legendaryEscalation));
    const baseSpeed = 38 + progress01() * 90; // fácil al inicio, hasta ~3x a los `durationMinutes` (sube en saltos, uno por minuto), luego se mantiene
    const speed = baseSpeed * (tier.sizeMul > 2 ? 0.62 : 1); // lo grande cae más lento (más justo)
    const pointsValue = Math.round(tier.points * rarityBonusMultiplier(item));
    const movement = pickMovementPattern(tier.key);

    // 14% de probabilidad de que este r3tard COMÚN venga con una frase de
    // "cultura nad" (ver R3I18N.COMMON_NAD_PHRASES más abajo). Las frases
    // viven en js/i18n.js (bilingüe, ver ahí el porqué) — se elige del set
    // del idioma ACTIVO, no siempre del español.
    //
    // Antes era 2% Y además el texto solo se mostraba si el r3tard seguía
    // vivo 350-850ms después de aparecer — como los comunes son los más
    // fáciles/rápidos de matar, en la práctica casi ninguna frase llegaba
    // a dibujarse (se perdía junto con el r3tard). Reportado por el
    // usuario: "jugué mucho rato y no apareció ninguno". Ahora se sube la
    // probabilidad Y se dispara la frase EN EL MOMENTO en que aparece
    // (ver más abajo, floatText inmediata), para que se vea sí o sí sin
    // importar qué tan rápido lo mate el jugador.
    const nadPhrasesPool = I18N.COMMON_NAD_PHRASES[I18N.getLang()] || I18N.COMMON_NAD_PHRASES.es;
    const commonTaunt =
      tier.key === "common" && Math.random() < 0.14
        ? nadPhrasesPool[(Math.random() * nadPhrasesPool.length) | 0]
        : null;

    // La personalidad de cada legendario también manda sobre cómo se
    // mueve — pisa lo que haya tirado pickMovementPattern al azar, para
    // que SIEMPRE sea el mismo tipo de movimiento para ese personaje
    // (pedido explícito: comportamiento único por legendario), no una
    // tirada de dados distinta cada vez que aparece.
    if (legendaryTheme) {
      if (legendaryTheme.quirk === "teleport") {
        movement.kind = "teleport";
      } else if (legendaryTheme.quirk === "weaver") {
        movement.kind = "fall";
        movement.zigzag = true;
        movement.zigAmp = 40 + Math.random() * 20;
        movement.zigFreq = 1.6 + Math.random() * 0.6;
      } else if (legendaryTheme.quirk === "tank") {
        movement.kind = "fall";
        movement.zigzag = false;
        movement.tremble = false;
      } else if (legendaryTheme.quirk === "charger") {
        movement.kind = "fall";
        movement.charger = true; // ver update(): acelera mientras sigue vivo
      }
    }

    let startX, startY, vx;
    if (movement.kind === "teleport") {
      // "Quedarse parado" en algún punto del tercio superior, sin caer —
      // ver update() para el salto periódico a otra esquina. Nunca cruza
      // el piso, así que nunca hace perder una vida por escaparse: hay
      // que cazarlo.
      startX = size / 2 + Math.random() * (cssW() - size);
      startY = cssH() * (0.14 + Math.random() * 0.4);
      vx = 0;
      movement.teleportTimer = 1400 + Math.random() * 900;
    } else if (movement.kind === "side") {
      // Entra por un costado al azar, cruza y se devuelve por donde vino
      // (ver update()) — no cae de arriba como los demás.
      const fromLeft = Math.random() < 0.5;
      startX = fromLeft ? -size / 2 : cssW() + size / 2;
      startY = size + Math.random() * (cssH() * 0.5);
      const sideSpeed = 95 + progress01() * 70;
      vx = fromLeft ? sideSpeed : -sideSpeed;
      movement.startX = startX;
      movement.turnDist = cssW() * (0.45 + Math.random() * 0.25);
      movement.turned = false;
    } else {
      startX = size / 2 + Math.random() * (cssW() - size);
      startY = -size;
      vx = 0;
    }

    // Los "Certified" son los 1/1 de verdad únicos de la colección (ej.
    // "Cranium", "Angel", "Banana") — ya vienen forzados a tier legendario
    // desde nft-loader.js/build-collection.mjs (ver computeRarity), y acá
    // se les muestra SU nombre propio en vez del nombre genérico del token.
    const isCertified = Boolean(item.certifiedName);
    const displayName = item.certifiedName || item.name;

    // Pedido explícito: "Keone" y "James" (piezas con nombre propio) no
    // tiran fruta/basura como el resto — spamean el logo de Monad, y
    // más seguido que cualquier otro épico/legendario (ver throwAtAvatar
    // y el reinicio de throwTimer en update()). Funciona sin importar en
    // qué tier real haya caído la pieza.
    const isMonadSpammer = MONAD_SPAMMER_NAMES.includes(String(displayName || "").trim().toLowerCase());

    const nft = {
      id: item.tokenId + "_" + Math.random().toString(36).slice(2, 7),
      tokenId: item.tokenId,
      name: displayName,
      isCertified,
      isMonadSpammer,
      image: item.image,
      tierKey: tier.key,
      tier,
      // Color del rasgo "Aura" real de esta pieza (si la colección lo
      // trae) — se usa para pintar su resplandor en vez de un tema
      // inventado por tier. Si no tiene ese rasgo, queda null y se sigue
      // usando el color de rareza de siempre (ver drawFalling).
      auraColor: auraColorFromItem(item),
      pointsValue,
      size,
      hp,
      maxHp: hp,
      x: startX,
      baseX: startX, // ancla del zigzag — nunca se pierde aunque n.x oscile
      y: startY,
      vy:
        movement.kind === "side" || movement.kind === "teleport"
          ? 0
          : speed * (legendaryTheme && legendaryTheme.quirk === "tank" ? 0.68 : 1), // "tank": pesado, cae más lento (ya de por sí aguanta más golpes)
      vx,
      movement,
      // Personalidad de este legendario (null si no es legendario) — ver
      // LEGENDARY_AURA_THEMES/auraThemeFor: qué tira, cómo suena, qué
      // grita, qué tan duro es.
      legendaryTheme,
      wobblePhase: Math.random() * Math.PI * 2,
      wobbleAmp: 12 + Math.random() * 18,
      spawnT: performance.now(),
      owner: null,
      flash: 0,
      // A partir de épico, el NFT ataca de verdad: le va lanzando cosas
      // al avatar mientras cae (ver update()/throwAtAvatar). El primer
      // lanzamiento tarda un poco (para no ser injusto apenas aparece);
      // después repite mientras siga vivo y cayendo. Keone/James
      // (isMonadSpammer) atacan siempre, sin importar el tier, y con un
      // primer lanzamiento mucho más corto (spam desde que aparecen). Los
      // legendarios más "duros" (hardness alto) además tiran más seguido.
      throwTimer:
        tier.key === "epic" || tier.key === "legendary" || isMonadSpammer
          ? isMonadSpammer
            ? 250 + Math.random() * 250
            : (700 + Math.random() * 700) * (legendaryTheme ? 1 - legendaryTheme.hardness * 0.06 : 1)
          : null,
      // Frases propias del personaje, mostradas como cuadros de texto
      // flotantes mientras sigue vivo (ver update()/floatText) — solo
      // los legendarios "hablan".
      tauntTimer: legendaryTheme ? 2200 + Math.random() * 1800 : null,
      // Pedido explícito: 14% de probabilidad de que un r3tard COMÚN
      // suelte una frase de "cultura nad" (gmonad, nad nad nad, mascotas
      // de Monad, cripto-Twitter, humor propio, chismes sobre otros
      // r3tards...) — ver COMMON_NAD_PHRASES. Es UNA sola vez, nunca en
      // bucle como los legendarios.
      commonTaunt: commonTaunt,
    };
    falling.push(nft);

    // Se encola en pendingCommonTaunts (ver declaración arriba), NO en un
    // timer dentro del propio nft — así la frase sale sí o sí, aunque el
    // jugador lo mate antes de que le toque "hablar".
    if (commonTaunt) {
      pendingCommonTaunts.push({ nft, delay: 300 + Math.random() * 450 });
    }

    // Tope de atacantes simultáneos (ver MAX_ACTIVE_THROWERS/
    // activeThrowers arriba): si ya hay demasiados tirando cosas a la
    // vez, el más viejo de la cola se "calla" (deja de atacar, pero
    // sigue cayendo y sigue valiendo puntos/contando para la colección)
    // para dejarle sitio al nuevo. Keone/James no entran en esta cola:
    // su gracia es precisamente spamear sin parar.
    if (nft.throwTimer !== null && !nft.isMonadSpammer) {
      activeThrowers.push(nft);
      const MAX_ACTIVE_THROWERS = 3;
      if (activeThrowers.length > MAX_ACTIVE_THROWERS) {
        const silenced = activeThrowers.shift();
        silenced.throwTimer = null;
      }
    }

    // Owner en vivo (no bloquea el spawn).
    R3Loader.getCurrentOwner(item.tokenId).then((owner) => {
      nft.owner = owner;
    });

    onNftTag({
      tokenId: item.tokenId,
      name: displayName,
      isCertified,
      tierLabel: I18N.tierLabel(tier.key, { upper: true }),
      tierKey: tier.key,
      color: tier.color,
      big: tier.key === "rare" || tier.key === "epic" || tier.key === "legendary",
    });

    if (tier.key === "epic" || tier.key === "legendary") {
      if (tier.key === "legendary") {
        R3Audio.legendarySpawnAlert(legendaryTheme ? legendaryTheme.pitch : 1);
        shakeTime = 0.55;
        shakeMag = 16;
        spawnFlash = { time: 0.9, maxTime: 0.9, color: tier.color };
      } else {
        R3Audio.rareSpawnAlert();
        shakeTime = 0.35;
        shakeMag = 6;
        spawnFlash = { time: 0.5, maxTime: 0.5, color: tier.color };
      }
    }
  }

  // ---------------------------------------------------------------
  // Disparo del jugador
  // ---------------------------------------------------------------
  function handlePointer(e) {
    if (!running) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    avatarTargetX = Math.max(24, Math.min(cssW() - 24, x));
    fireProjectile(x, y);
  }

  function fireProjectile(targetX, targetY) {
    const originX = avatarX;
    const originY = cssH() - AVATAR_Y_OFFSET;
    const dx = targetX - originX;
    const dy = targetY - originY;
    const speed = 780;
    const baseAngle = Math.atan2(dy, dx);
    if (dx !== 0 || dy !== 0) lastFireAngle = baseAngle; // hacia dónde queda apuntando el arma dibujada (ver drawWeapon)

    // Ráfaga según el arma desbloqueada (ver WEAPON_TIER_META/
    // currentWeaponTier): en vez de un solo disparo, varios en abanico
    // angosto alrededor del mismo punto — se nota de inmediato que hay
    // más de un disparo por clic, sin tener que volver a apuntar.
    const tier = currentWeaponTier();
    const burst = WEAPON_TIER_META[tier] ? WEAPON_TIER_META[tier].burst : 1;
    const spreadStep = 0.05;
    const startAngle = baseAngle - (spreadStep * (burst - 1)) / 2;
    for (let i = 0; i < burst; i++) {
      const a = startAngle + spreadStep * i;
      projectiles.push({
        x: originX,
        y: originY,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        rot: 0,
        life: 1.4,
      });
    }
    R3Audio.shoot();
  }

  /**
   * Objetos que un épico/legendario puede lanzarle al avatar — pedido
   * explícito: "sorpréndeme", así que hay variedad real de forma y
   * color, no un solo proyectil genérico. Cada uno se dibuja con canvas
   * (nada de imágenes externas) en dibujarEnemyThrow().
   */
  const THROW_OBJECT_KINDS = ["banana", "manzana", "basura", "roca", "hueso", "tomate"];

  // Piezas con nombre propio que, en vez de fruta/basura, spamean el
  // logo de Monad como ataque — pedido explícito: "que Keone y James
  // spameen también el logo de Monad como ataque".
  const MONAD_SPAMMER_NAMES = ["keone", "james"];

  /**
   * Un épico/legendario (n) le lanza un objeto al avatar desde donde está
   * cayendo — mismo patrón que fireProjectile pero al revés (el enemigo
   * apunta al jugador, no el jugador al enemigo). Keone/James (ver
   * isMonadSpammer en spawnNFT) siempre lanzan el logo de Monad en vez
   * de un objeto al azar. Un legendario normal tira SIEMPRE de su propio
   * repertorio (n.legendaryTheme.throwKinds — pato/tv/calzoncillo/rayo/
   * laser/disco/etc., ver LEGENDARY_AURA_THEMES), no de la lista genérica
   * de fruta/basura — así se nota de un vistazo qué personaje es, antes
   * incluso de leer su nombre.
   */
  function throwAtAvatar(n) {
    const targetX = avatarX, targetY = cssH() - AVATAR_Y_OFFSET;
    const dx = targetX - n.x, dy = targetY - n.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const speed = 210 + Math.random() * 70;
    const pool = n.legendaryTheme ? n.legendaryTheme.throwKinds : THROW_OBJECT_KINDS;
    enemyThrows.push({
      x: n.x,
      y: n.y,
      vx: (dx / dist) * speed,
      vy: (dy / dist) * speed,
      rot: Math.random() * Math.PI * 2,
      spin: (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 3),
      kind: n.isMonadSpammer ? "monad" : pool[(Math.random() * pool.length) | 0],
      color: n.legendaryTheme ? n.legendaryTheme.glowColor : n.tier.color,
      life: 3,
    });
    R3Audio.shoot(); // mismo "swoosh" que el disparo del jugador, con menos protagonismo visual
  }

  // ---------------------------------------------------------------
  // Partículas y textos flotantes
  // ---------------------------------------------------------------
  function burst(x, y, color, count, power = 1) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = (60 + Math.random() * 180) * power;
      particles.push({
        x, y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        life: 0.4 + Math.random() * 0.6,
        maxLife: 0.4 + Math.random() * 0.6,
        color,
        size: 2 + Math.random() * 4 * power,
      });
    }
  }

  function floatText(x, y, text, color) {
    // Texto suelto que aparece en un punto FIJO y flota/se desvanece solo
    // (golpe recibido, "+puntos", subida de arma). Las frases que dice un
    // r3tard (comunes y legendarios) YA NO usan esto — ver speechBubbles/
    // drawSpeechBubbles más abajo, que sigue al personaje en vez de
    // quedar colgado en el aire.
    floatTexts.push({ x, y, text, color, life: 1.1, maxLife: 1.1, vy: -46 });
  }

  // Frases sueltas de "cultura nad" que un r3tard COMÚN puede soltar al
  // azar mientras cae (ver spawnNFT: 2% de probabilidad por cada uno que
  // aparece, una sola vez, nunca en bucle como los legendarios). El set
  // completo de frases (español + su traducción al inglés, ~200 cada
  // una) vive en js/i18n.js -> R3I18N.COMMON_NAD_PHRASES, no acá — así
  // queda junto con el resto del contenido bilingüe del juego en vez de
  // duplicado en dos archivos.

  // ---------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------
  function update(dt) {
    comboTimer -= dt;
    if (comboTimer <= 0) combo = 0;

    // Oleada según score
    const newWave = Math.floor(score / 450) + 1;
    if (newWave !== wave) {
      wave = newWave;
      onWaveChange(wave, themeName(THEMES[(wave - 1) % THEMES.length]));
      R3Audio.waveUp();
    }

    // Dificultad según tiempo real (ver progress01/difficultyStep): esto
    // es lo que de verdad mueve velocidad/frecuencia/rareza, y es
    // independiente de la oleada (que solo depende del puntaje). Se
    // avisa a la UI SOLO cuando cambia el escalón, para que se vea el
    // salto justo en el momento en que ocurre.
    const newDifficultyStep = difficultyStep();
    if (newDifficultyStep !== lastDifficultyStep) {
      lastDifficultyStep = newDifficultyStep;
      onDifficultyChange(newDifficultyStep, CFG.SPAWN_PROGRESSION.durationMinutes);
      // La música de fondo sube de intensidad (tempo + brillo) junto con
      // la dificultad real de la partida — pedido explícito: "más
      // interactivo". Ver setMusicIntensity/scheduleMusicStep en audio.js.
      R3Audio.setMusicIntensity(newDifficultyStep / CFG.SPAWN_PROGRESSION.durationMinutes);
    }

    spawnTimer -= dt * 1000;
    if (spawnTimer <= 0) {
      spawnNFT();
      spawnTimer = spawnInterval();
    }

    // NFTs cayendo (o cruzando, si es tipo "side")
    for (let i = falling.length - 1; i >= 0; i--) {
      const n = falling[i];
      const mv = n.movement;
      n.wobblePhase += dt * 1.6;
      if (n.flash > 0) n.flash -= dt * 4;

      // Épico/legendario: le va lanzando objetos al avatar mientras cae
      // (independiente de cómo se mueva — normal, zigzag o cruzando).
      if (n.throwTimer !== null) {
        n.throwTimer -= dt * 1000;
        if (n.throwTimer <= 0) {
          throwAtAvatar(n);
          // Keone/James "spamean": repiten mucho más seguido que el
          // resto de épicos/legendarios. Un legendario "duro" (hardness
          // alto en su personalidad) también tira más seguido que uno
          // suave — ver LEGENDARY_AURA_THEMES.
          const hardnessMul = n.legendaryTheme ? 1 - n.legendaryTheme.hardness * 0.06 : 1;
          n.throwTimer = n.isMonadSpammer ? 380 + Math.random() * 260 : (1400 + Math.random() * 1000) * hardnessMul;
        }
      }

      // Frases propias del personaje (solo legendarios) — ahora como
      // burbuja de diálogo tipo cómic que sigue al r3tard mientras sigue
      // vivo (ver speechBubbles arriba), para que cada uno se sienta como
      // alguien distinto y no solo un color de aura distinto.
      if (n.tauntTimer !== null) {
        n.tauntTimer -= dt * 1000;
        if (n.tauntTimer <= 0) {
          const phrases = n.legendaryTheme.taunts[I18N.getLang()] || n.legendaryTheme.taunts.es;
          const phrase = phrases[(Math.random() * phrases.length) | 0];
          speechBubbles.push({ nft: n, text: phrase, color: n.legendaryTheme.glowColor, life: 2.6, maxLife: 2.6, kind: "legendary" });
          n.tauntTimer = 3200 + Math.random() * 2600;
        }
      }

      // "Teleporter" (ver quirk en LEGENDARY_AURA_THEMES): se queda
      // flotando en un punto del tercio superior sin caer, y cada tanto
      // desaparece y reaparece en otro punto al azar — sigue tirando
      // objetos todo el tiempo (ver arriba). Nunca cruza el piso, así
      // que hay que cazarlo: no se puede "dejar pasar".
      if (mv && mv.kind === "teleport") {
        mv.teleportTimer -= dt * 1000;
        if (mv.teleportTimer <= 0) {
          n.x = n.size / 2 + Math.random() * (cssW() - n.size);
          n.y = cssH() * (0.12 + Math.random() * 0.45);
          n.baseX = n.x;
          n.flash = 1; // mismo parpadeo blanco que al recibir un golpe, aprovechado como "destello de teletransporte"
          mv.teleportTimer = 1700 + Math.random() * 1300;
        }
        continue;
      }

      if (mv && mv.kind === "side") {
        // Cruza horizontalmente y se DEVUELVE por donde vino a mitad de
        // camino — es un bonus: si se escapa por cualquier lado, no
        // quita vida, solo se pierde la oportunidad de sus puntos.
        n.x += n.vx * dt;
        n.y += n.vy * dt;
        if (!mv.turned && Math.abs(n.x - mv.startX) >= mv.turnDist) {
          n.vx *= -1;
          mv.turned = true;
        }
        if (n.x < -n.size - 20 || n.x > cssW() + n.size + 20 || n.y - n.size / 2 > cssH()) {
          falling.splice(i, 1);
        }
        continue;
      }

      // Zigzag: oscila horizontalmente alrededor de su X original mientras
      // cae — la posición real (la que también se usa para golpearlo) se
      // mueve de verdad, no es solo un efecto visual.
      if (mv && mv.zigzag) {
        const osc = Math.sin(performance.now() / 1000 * mv.zigFreq + mv.zigPhase) * mv.zigAmp;
        n.x = Math.max(n.size / 2, Math.min(cssW() - n.size / 2, n.baseX + osc));
      }

      // Deriva lateral lenta y constante (distinta al vaivén del zigzag) —
      // ver pickMovementPattern: solo comunes/poco comunes, como toque de
      // variedad. Rebota suave contra los bordes en vez de salirse.
      if (mv && mv.drift) {
        n.baseX += mv.driftVx * dt;
        if (n.baseX < n.size / 2) {
          n.baseX = n.size / 2;
          mv.driftVx *= -1;
        } else if (n.baseX > cssW() - n.size / 2) {
          n.baseX = cssW() - n.size / 2;
          mv.driftVx *= -1;
        }
        n.x = n.baseX;
      }

      // "Charger" (ver quirk en LEGENDARY_AURA_THEMES): se va acelerando
      // mientras sigue vivo, cada vez más urgente — con tope, para que
      // nunca se vuelva literalmente imposible de reaccionar a tiempo.
      if (mv && mv.charger) {
        n.vy = Math.min(n.vy + dt * 30, (38 + progress01() * 90) * 2.4);
      }

      n.y += n.vy * dt;

      if (n.y - n.size / 2 > cssH()) {
        // Se escapó: pierde vida(s)
        const loss = n.tierKey === "legendary" ? 2 : 1;
        lives = Math.max(0, lives - loss);
        onLivesChange(lives);
        R3Audio.missLife();
        shakeTime = 0.25;
        shakeMag = 8;
        falling.splice(i, 1);
        combo = 0;
        if (lives <= 0) {
          endGame();
          return;
        }
      }
    }

    // Proyectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += dt * 14;
      p.life -= dt;
      if (p.life <= 0 || p.x < -40 || p.x > cssW() + 40 || p.y < -40 || p.y > cssH() + 40) {
        projectiles.splice(i, 1);
        continue;
      }
      // Colisión contra NFTs
      for (let j = falling.length - 1; j >= 0; j--) {
        const n = falling[j];
        const r = (n.size / 2) * 0.82;
        if (Math.hypot(p.x - n.x, p.y - n.y) < r) {
          projectiles.splice(i, 1);
          hitNFT(n, j);
          break;
        }
      }
    }

    // Objetos que épicos/legendarios le lanzaron al avatar (ver
    // throwAtAvatar) — si conectan, cuesta una vida; si el jugador se
    // corre a tiempo (moviendo el avatar), pasan de largo sin castigo.
    const avatarHitX = avatarX, avatarHitY = cssH() - AVATAR_Y_OFFSET, avatarHitR = 30;
    for (let i = enemyThrows.length - 1; i >= 0; i--) {
      const p = enemyThrows[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      p.life -= dt;
      if (p.life <= 0 || p.x < -40 || p.x > cssW() + 40 || p.y < -40 || p.y > cssH() + 40) {
        enemyThrows.splice(i, 1);
        continue;
      }
      if (Math.hypot(p.x - avatarHitX, p.y - avatarHitY) < avatarHitR * 0.85) {
        enemyThrows.splice(i, 1);
        lives = Math.max(0, lives - 1);
        onLivesChange(lives);
        R3Audio.playerHit();
        burst(avatarHitX, avatarHitY, p.color, 16, 0.8);
        floatText(avatarHitX, avatarHitY - 40, I18N.t("float.hit"), p.color);
        shakeTime = 0.3;
        shakeMag = 10;
        combo = 0;
        if (lives <= 0) {
          endGame();
          return;
        }
      }
    }

    // Partículas
    for (let i = particles.length - 1; i >= 0; i--) {
      const pt = particles[i];
      pt.life -= dt;
      if (pt.life <= 0) { particles.splice(i, 1); continue; }
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vy += 220 * dt;
    }

    // Frases "cultura nad" de comunes en espera (ver spawnNFT/
    // pendingCommonTaunts) — se procesan SEPARADAS de `falling` a
    // propósito: aunque el jugador ya haya matado a ese r3tard (lo más
    // común, dado lo rápido que caen los comunes), la frase sale igual,
    // en la última posición conocida del objeto. Ahora se muestran como
    // burbuja de diálogo (`speechBubbles`, ver drawSpeechBubbles) que
    // sigue al r3tard mientras sigue vivo/cayendo, en vez de un texto
    // suelto que se dibuja una vez y flota solo — así se ve de verdad
    // como que la está diciendo ÉL (pedido explícito del usuario:
    // "deberia aparecer como tipo comic saliendo de ellos").
    for (let i = pendingCommonTaunts.length - 1; i >= 0; i--) {
      const p = pendingCommonTaunts[i];
      p.delay -= dt * 1000;
      if (p.delay <= 0) {
        speechBubbles.push({ nft: p.nft, text: p.nft.commonTaunt, color: "#f4f1ff", life: 2.0, maxLife: 2.0, kind: "common" });
        pendingCommonTaunts.splice(i, 1);
      }
    }

    // Burbujas de diálogo (comunes + legendarios) — el posicionamiento en
    // pantalla (con el clamp para no quedar tapadas por las etiquetas DOM
    // de arriba, ni salirse por los costados) se hace en drawSpeechBubbles,
    // porque necesita la posición ACTUAL del r3tard (que puede seguir
    // moviéndose/cayendo mientras la burbuja sigue en pantalla).
    for (let i = speechBubbles.length - 1; i >= 0; i--) {
      const b = speechBubbles[i];
      b.life -= dt;
      if (b.life <= 0) speechBubbles.splice(i, 1);
    }

    // Textos flotantes
    for (let i = floatTexts.length - 1; i >= 0; i--) {
      const t = floatTexts[i];
      t.life -= dt;
      if (t.life <= 0) { floatTexts.splice(i, 1); continue; }
      t.y += t.vy * dt;
    }

    if (shakeTime > 0) shakeTime -= dt;
    if (spawnFlash) {
      spawnFlash.time -= dt;
      if (spawnFlash.time <= 0) spawnFlash = null;
    }

    // Teclado: si se está usando A/D o las flechas, eso manda sobre el
    // último punto tocado/clic y mueve el objetivo del avatar de forma
    // continua mientras la tecla siga presionada.
    if (keyLeft && !keyRight) {
      avatarTargetX = Math.max(24, avatarTargetX - AVATAR_KEY_SPEED * dt);
    } else if (keyRight && !keyLeft) {
      avatarTargetX = Math.min(cssW() - 24, avatarTargetX + AVATAR_KEY_SPEED * dt);
    }

    // El avatar se desliza suavemente hacia donde el jugador tocó/hizo
    // clic por última vez (o hacia donde lo llevó el teclado), en vez de
    // saltar de golpe.
    avatarX += (avatarTargetX - avatarX) * Math.min(1, dt * 8);
  }

  function hitNFT(n, idx) {
    n.hp -= damageMultiplier();
    n.flash = 1;
    R3Audio.hitImpact(n.tierKey, n.legendaryTheme ? n.legendaryTheme.pitch : 1);
    burst(n.x, n.y, n.tier.color, 6, 0.6);

    if (n.hp <= 0) {
      combo += 1;
      comboTimer = 2.2;
      bestCombo = Math.max(bestCombo, combo);
      killsByTier[n.tierKey] = (killsByTier[n.tierKey] || 0) + 1;
      if (n.isCertified) certifiedKills += 1;

      // Progresión de arma (ver WEAPON_TIER_META/currentWeaponTier): al
      // subir de tier se avisa UNA sola vez con un banner grande, igual
      // que el aviso de "daño desbloqueado".
      const weaponTierNow = currentWeaponTier();
      if (weaponTierNow > lastAnnouncedWeaponTier) {
        lastAnnouncedWeaponTier = weaponTierNow;
        onWeaponUnlock(WEAPON_TIER_META[weaponTierNow]);
      }

      const comboMul = 1 + Math.min(combo - 1, 8) * 0.12;
      const pts = Math.round(n.pointsValue * comboMul);
      score += pts;
      onScoreChange(score, pts, combo);

      R3Audio.death(n.tierKey, n.legendaryTheme ? n.legendaryTheme.pitch : 1);
      burst(n.x, n.y, n.tier.color, n.tierKey === "legendary" ? 60 : n.tierKey === "epic" ? 40 : 18, n.tier.sizeMul);
      floatText(n.x, n.y, `+${pts}${combo > 1 ? ` x${combo}` : ""}`, n.tier.color);

      // Rareza superior (raro en adelante) devuelve vida al morir —
      // pedido explícito: raro/poco-común-o-menos no regala nada; épico
      // suma 1.5 vidas de una vez; legendario rellena la barra entera.
      if (n.tierKey === "legendary" || n.tierKey === "epic" || n.tierKey === "rare") {
        const livesBefore = lives;
        if (n.tierKey === "legendary") {
          lives = CFG.MAX_LIVES;
        } else if (n.tierKey === "epic") {
          lives = Math.min(CFG.MAX_LIVES, lives + 1.5);
        } else {
          lives = Math.min(CFG.MAX_LIVES, lives + 1);
        }
        if (lives !== livesBefore) {
          onLivesChange(lives);
          const gained = Math.round((lives - livesBefore) * 10) / 10;
          const gainLabel =
            n.tierKey === "legendary"
              ? I18N.t("float.life_max")
              : I18N.t("float.life_gained", { n: gained, unit: I18N.t(gained === 1 ? "unit.life" : "unit.lives") });
          floatText(n.x, n.y - 34, gainLabel, "#8f7bff");
        }
      }

      onKill({
        tokenId: n.tokenId,
        name: n.name,
        isCertified: n.isCertified,
        color: n.tier.color,
        // BUG REAL corregido aquí: si la colección se cargó por el
        // respaldo on-chain (sin el snapshot estático), n.image puede
        // ser una URI ipfs://... sin resolver. Eso se guardaba tal cual
        // en los logros (achievements.js → localStorage), y la página
        // logros.html la usa directo en un <img src="...">  — los
        // navegadores NO entienden el protocolo ipfs://, así que esa
        // imagen se veía siempre rota ahí. Resolvemos a una URL http(s)
        // real ANTES de guardarla, para que el logro quede siempre
        // mostrable sin importar cómo se cargó la colección esa partida.
        image: resolvedImageUrl(n.image),
        tierKey: n.tierKey,
        tierLabel: I18N.tierLabel(n.tier.key, { upper: true }),
        points: pts,
      });

      // Meta de "colección completa": ¿ya habíamos matado a este mismo
      // r3tard antes en esta partida? Si es la primera vez, sube el
      // contador de distintos — cuando llegue a collection.length (los
      // collection.length) se gana la partida (ver winGame()).
      if (!sessionKilledIds.has(n.tokenId)) {
        sessionKilledIds.add(n.tokenId);
        sessionKillDetails.set(n.tokenId, n.tierKey);
        onProgress(sessionKilledIds.size, collection.length);
      }

      if (n.tierKey === "epic" || n.tierKey === "legendary") {
        shakeTime = 0.4;
        shakeMag = n.tierKey === "legendary" ? 14 : 7;
      }

      // Matar legendarios sube el daño del jugador de forma permanente
      // en esta partida: x2 al primero, x3 al segundo (tope). Como eso
      // hace todo más fácil después, el hp de poco-común-en-adelante ya
      // se subió a propósito en config.js (TIERS) para compensar.
      if (n.tierKey === "legendary" && legendaryKills < 2) {
        legendaryKills += 1;
        onDamageBuff(damageMultiplier());
      }

      falling.splice(idx, 1);

      if (collection.length > 0 && sessionKilledIds.size >= collection.length) {
        winGame();
        return;
      }
    }
  }

  // ---------------------------------------------------------------
  // Draw
  // ---------------------------------------------------------------
  // Próximo destello de glitch (ver drawGlitch) — momento (performance.now())
  // en el que puede disparar el próximo, para que no sea cada cuadro.
  let nextGlitchCheck = 0;
  let glitchUntil = 0;
  let glitchSeed = 0;

  function hash01(n) {
    const x = Math.sin(n * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  }

  function drawSky(scene, w, h) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, scene.top);
    g.addColorStop(1, scene.bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  /** Portal/núcleo Monad pulsante en el cielo — el elemento central de
   * marca del fondo: anillos concéntricos que laten y giran despacio,
   * más el logo real de Monad (monadOrbImg, ya cargado para el resto del
   * juego) tenue en el centro como sello de marca, no como decoración
   * genérica. */
  function drawPortal(scene, w, h, t) {
    const cx = w * 0.5, cy = h * 0.32;
    const pulse = 0.5 + 0.5 * Math.sin(t / 900);
    const baseR = Math.min(w, h) * (0.16 + pulse * 0.02);

    ctx.save();
    // Resplandor amplio de fondo del portal.
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR * 3.2);
    glow.addColorStop(0, scene.accent + Math.round(38 + pulse * 22).toString(16).padStart(2, "0"));
    glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    // Anillos concéntricos irregulares, cada uno rotando a su propia
    // velocidad — da sensación de portal "vivo" sin animar frame a frame
    // con imágenes.
    for (let i = 0; i < 3; i++) {
      const r = baseR * (0.55 + i * 0.28);
      const rot = t / (2600 + i * 900) + i * 1.7;
      ctx.beginPath();
      ctx.strokeStyle = scene.accent + (i === 0 ? "cc" : i === 1 ? "88" : "44");
      ctx.lineWidth = 2.4 - i * 0.5;
      ctx.setLineDash([r * 0.35, r * 0.18]);
      ctx.lineDashOffset = rot * r;
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    if (monadOrbImg && monadOrbImg.complete && monadOrbImg.naturalWidth) {
      ctx.globalAlpha = 0.22 + pulse * 0.1;
      const r = baseR * 0.55;
      ctx.drawImage(monadOrbImg, cx - r, cy - r, r * 2, r * 2);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  /** Horizonte de torres/monolitos quebrados con parallax lento y grietas
   * luminosas — ver buildSkyline/SKYLINES más arriba (silueta fija por
   * escena, calculada una sola vez). */
  function drawSkyline(scene, towers, w, h, t) {
    const baseY = h * 0.82;
    const drift = ((t * 0.006) % (w * 0.25)) - w * 0.25; // parallax: recorre 1/4 del ancho y se repite
    ctx.save();
    for (const tow of towers) {
      const x = (tow.x * w) + drift;
      if (x < -w * 0.3 || x > w * 1.3) continue; // fuera de vista, ni molestarse
      const tw = tow.width * w;
      const th = tow.height * h;
      const baseTopY = baseY - th;
      ctx.fillStyle = scene.skyline;
      ctx.beginPath();
      ctx.moveTo(x - tw / 2, baseY);
      if (tow.jag) {
        // Punta rota/irregular en vez de un rectángulo perfecto.
        ctx.lineTo(x - tw / 2, baseTopY + th * 0.22);
        ctx.lineTo(x - tw * 0.18, baseTopY);
        ctx.lineTo(x + tw * 0.08, baseTopY + th * 0.14);
        ctx.lineTo(x + tw / 2, baseTopY + th * 0.3);
      } else {
        ctx.lineTo(x - tw / 2, baseTopY);
        ctx.lineTo(x + tw / 2, baseTopY);
      }
      ctx.lineTo(x + tw / 2, baseY);
      ctx.closePath();
      ctx.fill();

      // Antena/varilla rota asomando — un detalle de "ruina", no un
      // edificio intacto.
      if (tow.antenna) {
        ctx.strokeStyle = scene.skyline;
        ctx.lineWidth = Math.max(1, tw * 0.06);
        ctx.beginPath();
        ctx.moveTo(x - tw * 0.15, baseTopY);
        ctx.lineTo(x - tw * 0.05 + tow.seedA * tw * 0.3, baseTopY - th * 0.22);
        ctx.stroke();
      }

      // Grieta luminosa vertical — pulsa con el mismo reloj que el portal
      // para que se sienta parte del mismo fenómeno, no un adorno suelto.
      if (tow.crack) {
        const crackPulse = 0.4 + 0.6 * Math.abs(Math.sin(t / 700 + tow.seedB * 10));
        ctx.strokeStyle = scene.accent;
        ctx.globalAlpha = crackPulse * 0.75;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        const cx = x - tw * 0.1 + tow.seedA * tw * 0.2;
        ctx.moveTo(cx, baseY);
        ctx.lineTo(cx + (tow.seedB - 0.5) * tw * 0.5, baseTopY + th * 0.35);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  /** Ceniza/chispas subiendo desde el horizonte — puramente funcional de
   * (índice, tiempo): nada de arrays que mantener ni resetear entre
   * niveles, la posición sale de una fórmula determinística por chispa. */
  function drawEmbers(scene, w, h, t) {
    const count = Math.round(26 + scene.intensity * 46);
    ctx.save();
    for (let i = 0; i < count; i++) {
      const seed = i * 7.13 + 1;
      const speed = 14 + hash01(seed) * 22;
      const cycle = h + 60;
      const phase = hash01(seed * 3.1) * cycle;
      const y = h - (((t / 1000) * speed + phase) % cycle);
      const xBase = hash01(seed * 5.7) * w;
      const drift = Math.sin(t / 1400 + seed) * (10 + hash01(seed * 2) * 18);
      const x = xBase + drift;
      const size = 0.8 + hash01(seed * 9.3) * (1.6 + scene.intensity * 1.4);
      const fade = Math.max(0, Math.min(1, y / cycle)); // se apaga cerca del techo
      ctx.globalAlpha = (0.25 + hash01(seed * 4.4) * 0.55) * (0.35 + fade * 0.65);
      ctx.fillStyle = scene.ember;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Niebla baja derivando — un par de manchas anchas y muy translúcidas
   * cerca del piso, para dar profundidad sin tapar a los r3tards. */
  function drawGroundFog(scene, w, h, t) {
    ctx.save();
    for (let i = 0; i < 3; i++) {
      const speed = 8 + i * 5;
      const cycle = w + 400;
      const x = (((t / 1000) * speed + i * 260) % cycle) - 200;
      const y = h * (0.86 + i * 0.045);
      const rw = w * 0.55, rh = h * 0.09;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rw);
      g.addColorStop(0, scene.accent + "18");
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, rw, rh, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Interferencia/glitch — solo en las escenas más caóticas (scene.glitch)
   * y solo de vez en cuando (no todo el tiempo, sería agotador de ver):
   * bandas horizontales con leve desfase de color, como una señal de TV
   * rota. Encaja con el tono "todo se está cayendo a pedazos on-chain". */
  function drawGlitch(scene, w, h, t) {
    if (!scene.glitch) return;
    if (t > nextGlitchCheck) {
      nextGlitchCheck = t + 1400 + Math.random() * 2600;
      if (Math.random() < 0.55) {
        glitchUntil = t + 90 + Math.random() * 160;
        glitchSeed = Math.random() * 1000;
      }
    }
    if (t > glitchUntil) return;
    ctx.save();
    const bands = 3 + Math.round(scene.intensity * 4);
    for (let i = 0; i < bands; i++) {
      const by = hash01(glitchSeed + i * 3.3) * h;
      const bh = 2 + hash01(glitchSeed + i * 7.1) * 10;
      const offset = (hash01(glitchSeed + i * 1.9) - 0.5) * 26 * scene.intensity;
      ctx.globalAlpha = 0.22 + hash01(glitchSeed + i) * 0.2;
      ctx.fillStyle = "#ff2e6a";
      ctx.fillRect(offset, by, w, bh);
      ctx.fillStyle = "#5ef1ff";
      ctx.fillRect(-offset, by + bh * 0.4, w, bh * 0.6);
    }
    ctx.restore();
  }

  function drawBackground() {
    // 100% Canvas animado, sin fotos ni imágenes externas (ver
    // MONAD_SCENES/SKYLINES más arriba y el motivo del cambio ahí mismo).
    // Capas de atrás hacia adelante: cielo degradado → portal Monad
    // pulsante → horizonte de torres quebradas (parallax) → ceniza
    // subiendo → niebla baja → oscurecido para legibilidad → glitch en
    // los niveles más caóticos.
    // `scene` mezcla colores continuamente entre las dos escenas más
    // cercanas al progreso real de la partida (ver blendedScene/
    // sceneBlend) — pedido explícito tras probar el fondo: "se ve igual
    // todo el tiempo, me gustaría que evolucionara a medida que va
    // avanzando la partida". El horizonte (`towers`, formas fijas, no
    // colores) usa la escena más cercana redondeada — mezclar dos
    // siluetas de edificios a la vez se vería como un horizonte doble.
    const scene = blendedScene();
    const towers = SKYLINES[getSceneIdx()];
    const w = cssW(), h = cssH();
    const t = performance.now();

    drawSky(scene, w, h);
    drawPortal(scene, w, h, t);
    drawSkyline(scene, towers, w, h, t);
    drawEmbers(scene, w, h, t);
    drawGroundFog(scene, w, h, t);

    // Oscurecido encima de todo lo anterior, para que el avatar, los
    // r3tards y los textos se sigan leyendo bien sin importar cuánta
    // actividad haya en el fondo.
    ctx.fillStyle = "rgba(6,3,14,0.34)";
    ctx.fillRect(0, 0, w, h);

    // Resplandor pulsante adicional con el color de acento de la escena
    // (además del propio portal), sutil, para dar aún más sensación de
    // "algo vivo" detrás de la acción.
    const pulse = 0.5 + 0.5 * Math.sin(t / 900);
    const rg = ctx.createRadialGradient(w / 2, h * 0.35, 0, w / 2, h * 0.35, w * 0.7);
    rg.addColorStop(0, scene.accent + Math.round(14 + pulse * 10).toString(16).padStart(2, "0"));
    rg.addColorStop(1, "transparent");
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);

    drawGlitch(scene, w, h, t);
  }

  /**
   * "Ondas fluorescentes" — anillos irregulares alrededor del NFT que
   * ondulan como agua/fuego (y para legendario, además, con destellos
   * tipo rayo). Pedido explícito: que los "raro" en adelante se vean
   * mucho más impactantes, no solo con un aura pareja. A diferencia del
   * aura de arriba (un solo resplandor circular liso), esto dibuja varios
   * anillos cuyo radio ondula con senos desfasados por ángulo y tiempo —
   * el resultado parpadea/fluye en vez de quedarse quieto. Es puramente
   * decorativo: no cambia n.x/n.y ni el radio de colisión.
   */
  const WAVE_CFG = {
    rare: { rings: 3, amp: 5, freq: 5, speed: 2.2, spacing: 7, width: 2.2, glow: 14, colors: ["#5eead4", "#bafff1", "#5eead4"] },
    epic: { rings: 3, amp: 7.5, freq: 6, speed: 3.0, spacing: 8, width: 2.6, glow: 18, colors: ["#ffb84d", "#c77dff", "#ff5e1a"] },
  };

  /**
   * Auras de LEGENDARIO: pedido explícito de que cada legendario se vea
   * único y distinto entre sí, no todos con el mismo dorado de siempre —
   * fuego, agua, tierra, rayos, cristal, viento, cósmico, tóxico, cada
   * uno con su propio color Y su propia "forma" de destello (línea,
   * rayo quebrado, diamante, roca, gota, burbuja...), no solo un cambio
   * de color. El tema se elige por un hash simple y estable del tokenId
   * — así la MISMA pieza (ej. "Cranium") siempre se ve exactamente
   * igual cada vez que cae, partida tras partida.
   */
  // Pedido explícito: "quiero total personalización de todos y cada uno
  // de los legendarios, desde su aura, sus sonidos, las cosas que tiran,
  // su comportamiento". Cada tema elemental (ya eran 8, y ya se elegían
  // por hash del tokenId — ver auraThemeFor) ahora ADEMÁS define: qué le
  // gusta tirarle al avatar (throwKinds), qué grita mientras caza al
  // jugador (taunts — cuadros de texto flotantes con frases variadas),
  // un tono de voz propio para sus sonidos (pitch — ver hitImpact/death
  // en audio.js), su forma de moverse (quirk) y qué tan duro es en
  // relación a los demás (hardness, 0=el más suave, 7=el más bravo) —
  // así cada legendario se siente de verdad como un personaje distinto,
  // no solo un color de aura distinto. "otro_r3tard"/"pato"/"perro"/
  // "tv"/"calzoncillo" se dibujan como emoji (ver drawEnemyThrow); ver
  // MONAD_SPAMMER_NAMES para el caso aparte de Keone/James.
  const LEGENDARY_AURA_THEMES = [
    {
      key: "fuego", glowColor: "#ff7a1a", raySpokes: 8, rayStyle: "line",
      wave: { rings: 4, amp: 11, freq: 8, speed: 4.2, spacing: 8, width: 2.6, glow: 22, colors: ["#fff3b0", "#ff9a3d", "#ff3d1a", "#ff9a3d"] },
      throwKinds: ["tomate", "roca", "rayo"], pitch: 0.82, quirk: "charger", hardness: 4,
      taunts: {
        es: ["🔥 ¡Arde con esto!", "Soy pura candela", "¿Sientes el calor?", "Te voy a achicharrar"],
        en: ["🔥 Burn with this!", "I'm pure fire", "Feel the heat?", "I'm gonna scorch you"],
      },
    },
    {
      key: "agua", glowColor: "#3ec6ff", raySpokes: 6, rayStyle: "dot",
      wave: { rings: 4, amp: 5.5, freq: 5, speed: 1.7, spacing: 10, width: 2.4, glow: 20, colors: ["#bdf1ff", "#3ec6ff", "#1a6fff", "#3ec6ff"] },
      throwKinds: ["pato", "tomate", "hueso"], pitch: 1.15, quirk: "weaver", hardness: 1,
      taunts: {
        es: ["🌊 ¡Prepárate a mojarte!", "Fluyo donde quiera", "Nadando hacia la victoria", "Splash"],
        en: ["🌊 Get ready to get wet!", "I flow wherever I want", "Swimming to victory", "Splash"],
      },
    },
    {
      key: "tierra", glowColor: "#b08d4a", raySpokes: 6, rayStyle: "rock",
      wave: { rings: 3, amp: 4, freq: 4, speed: 1.3, spacing: 11, width: 3.4, glow: 16, colors: ["#c9a15a", "#7a5a2a", "#9ee08a", "#7a5a2a"] },
      throwKinds: ["roca", "basura", "hueso"], pitch: 0.8, quirk: "tank", hardness: 0,
      taunts: {
        es: ["🪨 Sólido como roca", "No me vas a mover", "Esto sí que pesa", "Duro de romper"],
        en: ["🪨 Solid as rock", "You're not moving me", "Now THIS has weight", "Hard to break"],
      },
    },
    {
      key: "rayos", glowColor: "#fff36a", raySpokes: 9, rayStyle: "jagged",
      wave: { rings: 3, amp: 13, freq: 11, speed: 6.5, spacing: 7, width: 1.8, glow: 26, colors: ["#ffffff", "#fff36a", "#8ecbff", "#fff36a"] },
      throwKinds: ["rayo", "laser", "rayo"], pitch: 1.35, quirk: "teleport", hardness: 7,
      taunts: {
        es: ["⚡ ¡Sentirás la descarga!", "Más rápido que la luz", "Aquí, allá... ¡atrápame!", "Electrizante, ¿no?"],
        en: ["⚡ You'll feel the shock!", "Faster than light", "Here, there... catch me!", "Electrifying, right?"],
      },
    },
    {
      key: "cristal", glowColor: "#c77dff", raySpokes: 7, rayStyle: "diamond",
      wave: { rings: 4, amp: 8, freq: 7.5, speed: 3.2, spacing: 9, width: 2.2, glow: 26, colors: ["#f3d9ff", "#c77dff", "#ff9de3", "#c77dff"] },
      throwKinds: ["disco", "roca", "laser"], pitch: 1.2, quirk: "teleport", hardness: 5,
      taunts: {
        es: ["💎 Filoso como el cristal", "Reluciente y letal", "Brillo mortal", "Nunca me quiebro"],
        en: ["💎 Sharp as crystal", "Shiny and lethal", "Deadly shine", "I never break"],
      },
    },
    {
      key: "viento", glowColor: "#bdf2c9", raySpokes: 6, rayStyle: "arc",
      wave: { rings: 3, amp: 6, freq: 9, speed: 5.5, spacing: 9, width: 1.6, glow: 16, colors: ["#ffffff", "#bdf2c9", "#eafff0"] },
      throwKinds: ["calzoncillo", "tv", "basura"], pitch: 1.25, quirk: "weaver", hardness: 2,
      taunts: {
        es: ["💨 ¡Que te lleve el viento!", "Ligero pero letal", "Sopla fuerte hoy", "Atrápame si puedes"],
        en: ["💨 Let the wind take you!", "Light but lethal", "Blowing hard today", "Catch me if you can"],
      },
    },
    {
      key: "cosmico", glowColor: "#b06bff", raySpokes: 10, rayStyle: "twinkle",
      wave: { rings: 4, amp: 7, freq: 6, speed: 2.6, spacing: 10, width: 2, glow: 28, colors: ["#e6d6ff", "#b06bff", "#4d2b8f", "#b06bff"] },
      throwKinds: ["otro_r3tard", "disco", "rayo"], pitch: 0.7, quirk: "teleport", hardness: 6,
      taunts: {
        es: ["🌌 Vengo de otra dimensión", "El cosmos me protege", "Nada es coincidencia", "Ni me viste llegar"],
        en: ["🌌 I come from another dimension", "The cosmos protects me", "Nothing is a coincidence", "You didn't even see me arrive"],
      },
    },
    {
      key: "toxico", glowColor: "#9dff5e", raySpokes: 7, rayStyle: "bubble",
      wave: { rings: 3, amp: 9, freq: 5, speed: 2.4, spacing: 10, width: 2.4, glow: 18, colors: ["#e2ff9d", "#9dff5e", "#2b7a1a", "#9dff5e"] },
      throwKinds: ["perro", "basura", "tomate"], pitch: 0.9, quirk: "tank", hardness: 3,
      taunts: {
        es: ["☠️ No respires cerca", "Contaminando el ambiente", "Tóxico y orgulloso", "Aléjate si puedes"],
        en: ["☠️ Don't breathe near me", "Polluting the air", "Toxic and proud", "Get away if you can"],
      },
    },
  ];
  function auraThemeFor(tokenId) {
    let h = 0;
    const s = String(tokenId);
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return LEGENDARY_AURA_THEMES[h % LEGENDARY_AURA_THEMES.length];
  }

  function drawFluorescentWave(n) {
    const cfg = n.tierKey === "legendary" ? auraThemeFor(n.tokenId).wave : WAVE_CFG[n.tierKey];
    if (!cfg) return;
    const t = performance.now() / 1000;
    const baseR = n.size / 2 + 5;
    ctx.save();
    ctx.globalCompositeOperation = "lighter"; // los anillos se suman de forma luminosa (efecto agua/fuego)
    const steps = 26;
    for (let ring = 0; ring < cfg.rings; ring++) {
      const r0 = baseR + ring * cfg.spacing;
      const phase = ring * 1.7 + n.wobblePhase;
      const color = cfg.colors[ring % cfg.colors.length];
      const flicker = 0.5 + 0.5 * Math.sin(t * 1.3 + ring * 1.9);
      ctx.beginPath();
      for (let s = 0; s <= steps; s++) {
        const a = (s / steps) * Math.PI * 2;
        const wob = Math.sin(a * cfg.freq + t * cfg.speed + phase) * cfg.amp * flicker;
        const r = r0 + wob;
        const x = Math.cos(a) * r, y = Math.sin(a) * r;
        if (s === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.lineWidth = cfg.width;
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = cfg.glow;
      ctx.globalAlpha = 0.5 + 0.35 * Math.sin(t * 2.1 + ring);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * El anillo de "chispas" de cada tema de legendario (ver
   * LEGENDARY_AURA_THEMES) — no solo cambia el color, cambia la FORMA:
   * líneas de fuego, gotas de agua, rocas girando, rayos quebrados,
   * diamantes de cristal, ráfagas de viento, estrellas cósmicas
   * titilando, o burbujas tóxicas subiendo. Se llama desde dentro del
   * `ctx.save()`/`ctx.restore()` del aura en drawFalling.
   */
  function drawLegendarySparks(n, theme, extra, pulse) {
    const spokes = theme.raySpokes;
    const rot = performance.now() / 500;
    const r1 = n.size / 2 + extra * 0.55;
    const r2 = n.size / 2 + extra * 1.2;
    ctx.strokeStyle = theme.glowColor;
    ctx.fillStyle = theme.glowColor;
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = 0.5 + pulse * 0.3;

    for (let i = 0; i < spokes; i++) {
      const a = rot + (i / spokes) * Math.PI * 2;
      const cx1 = Math.cos(a) * r1, cy1 = Math.sin(a) * r1;
      const cx2 = Math.cos(a) * r2, cy2 = Math.sin(a) * r2;

      if (theme.rayStyle === "jagged") {
        // Rayo eléctrico: quebrado en zigzag, no una línea recta, y
        // parpadea (no todas las puntas visibles en todo momento).
        if (Math.sin(performance.now() / 90 + i * 2.4) < 0.15) continue;
        const midR = (r1 + r2) / 2;
        const jitter = (Math.sin(performance.now() / 60 + i * 5) * 0.5) * (r2 - r1) * 0.4;
        const mx = Math.cos(a + 0.18) * midR + jitter, my = Math.sin(a + 0.18) * midR + jitter;
        ctx.beginPath();
        ctx.moveTo(cx1, cy1);
        ctx.lineTo(mx, my);
        ctx.lineTo(cx2, cy2);
        ctx.stroke();
      } else if (theme.rayStyle === "dot") {
        // Gotas de agua: puntitos redondos orbitando a radio fijo, sube
        // y baja de tamaño suavemente (como burbujeo calmo).
        const rr = 2.2 + 1.4 * Math.sin(performance.now() / 260 + i);
        ctx.beginPath();
        ctx.arc(cx2, cy2, rr, 0, Math.PI * 2);
        ctx.fill();
      } else if (theme.rayStyle === "rock") {
        // Rocas: cuadraditos girando sobre su propio eje, orbitando lento.
        ctx.save();
        ctx.translate(cx2, cy2);
        ctx.rotate(performance.now() / 900 + i);
        ctx.fillRect(-3.2, -3.2, 6.4, 6.4);
        ctx.restore();
      } else if (theme.rayStyle === "diamond") {
        // Cristal: diamantes (rombos) que brillan con un pulso propio.
        const rr = 4 + 1.6 * Math.sin(performance.now() / 200 + i * 1.7);
        ctx.save();
        ctx.translate(cx2, cy2);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(0, -rr);
        ctx.lineTo(rr * 0.7, 0);
        ctx.lineTo(0, rr);
        ctx.lineTo(-rr * 0.7, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (theme.rayStyle === "arc") {
        // Viento: ráfagas curvas cortas, barriendo rápido alrededor.
        ctx.beginPath();
        ctx.arc(0, 0, (r1 + r2) / 2, a, a + 0.5);
        ctx.stroke();
      } else if (theme.rayStyle === "twinkle") {
        // Cósmico: estrellitas que titilan cada una por su cuenta (fase
        // propia por índice), no todas al mismo tiempo.
        const tw = Math.max(0, Math.sin(performance.now() / 240 + i * 2.9));
        ctx.save();
        ctx.globalAlpha = tw;
        ctx.beginPath();
        ctx.arc(cx2, cy2, 1.6 + tw * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (theme.rayStyle === "bubble") {
        // Tóxico: burbujitas que suben (se alejan) y se desvanecen, para
        // luego reaparecer desde adentro — nunca una línea fija.
        const cycle = ((performance.now() / 900 + i / spokes) % 1);
        const rr = r1 + cycle * (r2 - r1) * 1.6;
        ctx.save();
        ctx.globalAlpha = (0.5 + pulse * 0.3) * (1 - cycle);
        ctx.beginPath();
        ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        // "line" (fuego, y respaldo genérico): chispa recta clásica.
        ctx.beginPath();
        ctx.moveTo(cx1, cy1);
        ctx.lineTo(cx2, cy2);
        ctx.stroke();
      }
    }
  }

  function drawFalling(n) {
    ctx.save();
    const wob = Math.sin(n.wobblePhase) * n.wobbleAmp * 0.15;
    const mv = n.movement;
    // Temblor: sacudida rápida y pequeña, solo visual (no afecta el punto
    // real donde se le puede golpear) — hace que cueste más apuntarle.
    const tremX = mv && mv.tremble ? Math.sin(performance.now() / 35 + n.wobblePhase * 7) * 4 : 0;
    const tremY = mv && mv.tremble ? Math.cos(performance.now() / 41 + n.wobblePhase * 5) * 4 : 0;
    ctx.translate(n.x + wob + tremX, n.y + tremY);

    // Parpadeo: aparece y desaparece — sigue pudiéndose golpear aunque
    // esté casi invisible, así que obliga a memorizar por dónde iba.
    if (mv && mv.blink) {
      ctx.globalAlpha = 0.15 + 0.85 * Math.abs(Math.sin(performance.now() / 480 + mv.blinkPhase));
    }

    // Aura según tier — entre más raro, más grande y más intensa (y
    // legendarios/épicos además tienen un anillo de "chispas" girando).
    // Para legendario, la forma de las chispas sale de su propio tema
    // (ver LEGENDARY_AURA_THEMES/auraThemeFor) — cada pieza única se ve
    // distinta. El COLOR del resplandor, en cambio, sale del rasgo
    // "Aura" real de esa pieza (n.auraColor, ver spawnNFT) cuando la
    // colección lo trae; si no lo trae, cae de respaldo al tema por
    // tier de siempre.
    const legendaryTheme = n.tierKey === "legendary" ? auraThemeFor(n.tokenId) : null;
    const auraColor = n.auraColor || (legendaryTheme ? legendaryTheme.glowColor : n.tier.color);
    const auraIntensity = { uncommon: 0.18, rare: 0.34, epic: 0.55, legendary: 0.95 }[n.tierKey] || 0;
    if (auraIntensity > 0) {
      ctx.save();
      const speedDiv = n.tierKey === "legendary" ? 150 : n.tierKey === "epic" ? 200 : 260;
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / speedDiv);
      const extra = { uncommon: 8, rare: 16, epic: 27, legendary: 46 }[n.tierKey] || 8;
      const alphaByte = Math.min(255, Math.round((0.55 + pulse * 0.35) * auraIntensity * 255));
      const g = ctx.createRadialGradient(0, 0, n.size / 2, 0, 0, n.size / 2 + extra);
      g.addColorStop(0, auraColor + alphaByte.toString(16).padStart(2, "0"));
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, n.size / 2 + extra, 0, Math.PI * 2);
      ctx.fill();

      if (legendaryTheme) {
        drawLegendarySparks(n, legendaryTheme, extra, pulse);
      } else if (n.tierKey === "epic") {
        const rays = 5;
        const rot = performance.now() / 700;
        ctx.strokeStyle = auraColor;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.5 + pulse * 0.3;
        for (let i = 0; i < rays; i++) {
          const a = rot + (i / rays) * Math.PI * 2;
          const r1 = n.size / 2 + extra * 0.55;
          const r2 = n.size / 2 + extra * 1.2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
          ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    drawFluorescentWave(n);

    const cut = getCutoutFor(n);
    ctx.save();
    // "Giro" (ver pickMovementPattern: solo comunes/poco comunes) —
    // 100% visual, rota el retrato DENTRO del círculo recortado; como el
    // círculo es simétrico, no cambia en nada dónde se le puede golpear.
    if (mv && mv.spin) {
      ctx.rotate(performance.now() / 1000 * mv.spinSpeed + mv.spinPhase);
    }
    ctx.beginPath();
    ctx.arc(0, 0, n.size / 2, 0, Math.PI * 2);
    ctx.clip();
    if (cut) {
      ctx.drawImage(cut, -n.size / 2, -n.size / 2, n.size, n.size);
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(-n.size / 2, -n.size / 2, n.size, n.size);
    }
    if (n.flash > 0) {
      ctx.globalAlpha = n.flash;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(-n.size / 2, -n.size / 2, n.size, n.size);
    }
    ctx.restore();

    // Borde según tier
    ctx.beginPath();
    ctx.arc(0, 0, n.size / 2, 0, Math.PI * 2);
    ctx.lineWidth = n.tierKey === "common" ? 2 : 3.5;
    ctx.strokeStyle = n.tier.color;
    ctx.stroke();

    // Barra de vida si tiene más de 1 hp
    if (n.maxHp > 1) {
      const w = n.size * 0.8;
      const h = 6;
      const ratio = n.hp / n.maxHp;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(-w / 2, -n.size / 2 - 16, w, h);
      ctx.fillStyle = n.tier.color;
      ctx.fillRect(-w / 2, -n.size / 2 - 16, w * ratio, h);
    }

    ctx.restore();
  }

  function drawProjectile(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    const r = 13;
    if (monadOrbImg && monadOrbImg.complete && monadOrbImg.naturalWidth) {
      ctx.drawImage(monadOrbImg, -r, -r, r * 2, r * 2);
    } else {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, "#e6d9ff");
      g.addColorStop(1, "#6E54FF");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * Dibuja el objeto que un épico/legendario le lanzó al avatar — cada
   * "kind" tiene su propia silueta (nada de imágenes externas, todo
   * formas de canvas) para que se note variedad real, no un solo
   * proyectil repetido. Ver THROW_OBJECT_KINDS/throwAtAvatar.
   */
  function drawEnemyThrow(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.lineJoin = "round";
    // Pedido explícito: "los poderes... se ven muy pequeñas las cosas que
    // tiran" — antes cada forma medía ~16-22px de punta a punta, casi
    // invisibles en pantallas chicas. El escalado va DESPUÉS de rotar (no
    // afecta el ángulo) y ANTES de dibujar cualquier forma/emoji/imagen,
    // así que agranda por igual las 12 variantes (fruta/basura/roca/
    // hueso/emoji de personalidad/rayo/láser/disco/logo Monad) sin tener
    // que retocar cada una a mano. No toca el hitbox (ver update():
    // avatarHitR es fijo, no depende del tamaño dibujado), así que no
    // cambia la dificultad — solo se ve mucho mejor.
    ctx.scale(1.85, 1.85);

    if (p.kind === "monad") {
      // Keone/James (ver isMonadSpammer en spawnNFT): spamean el logo
      // de Monad en vez de fruta/basura.
      const r = 11;
      if (monadOrbImg && monadOrbImg.complete && monadOrbImg.naturalWidth) {
        ctx.drawImage(monadOrbImg, -r, -r, r * 2, r * 2);
      } else {
        ctx.fillStyle = "#6E54FF";
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (p.kind === "banana") {
      ctx.fillStyle = "#f5d94e";
      ctx.strokeStyle = "#8a6a1a";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-10, 6);
      ctx.quadraticCurveTo(0, -14, 12, -6);
      ctx.quadraticCurveTo(2, 2, -4, 10);
      ctx.quadraticCurveTo(-8, 9, -10, 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (p.kind === "manzana") {
      ctx.fillStyle = "#e34848";
      ctx.beginPath();
      ctx.arc(0, 1, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#5a3a1a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(2, -13);
      ctx.stroke();
      ctx.fillStyle = "#5eba5e";
      ctx.beginPath();
      ctx.ellipse(5, -10, 4, 2.4, -0.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === "basura") {
      ctx.fillStyle = "#8f9aa8";
      ctx.beginPath();
      ctx.moveTo(-8, -9);
      ctx.lineTo(8, -8);
      ctx.lineTo(7, 10);
      ctx.lineTo(-7, 10);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#4a525c";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-8, -9); ctx.lineTo(8, -8);
      ctx.moveTo(-6, -4); ctx.lineTo(6, -3);
      ctx.moveTo(-6, 2); ctx.lineTo(6, 3);
      ctx.stroke();
    } else if (p.kind === "roca") {
      ctx.fillStyle = "#7a7a86";
      ctx.beginPath();
      ctx.moveTo(-9, -2); ctx.lineTo(-3, -10); ctx.lineTo(7, -7);
      ctx.lineTo(9, 3); ctx.lineTo(2, 10); ctx.lineTo(-8, 6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#4a4a52";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    } else if (p.kind === "hueso") {
      ctx.fillStyle = "#f2ecdd";
      ctx.strokeStyle = "#b8ad8f";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-9, 0);
      ctx.lineTo(9, 0);
      ctx.stroke();
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#f2ecdd";
      ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-6, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(9, 0); ctx.stroke();
      [[-9, -3], [-9, 3], [9, -3], [9, 3]].forEach(([x, y]) => {
        ctx.beginPath();
        ctx.arc(x, y, 3.2, 0, Math.PI * 2);
        ctx.fill();
      });
    } else if (p.kind === "pato" || p.kind === "perro" || p.kind === "tv" || p.kind === "calzoncillo" || p.kind === "otro_r3tard") {
      // Objetos "de personalidad" que solo tiran ciertos legendarios (ver
      // LEGENDARY_AURA_THEMES.throwKinds) — se dibujan como emoji: nada
      // de imágenes externas que descargar, y de un vistazo se reconoce
      // qué es sin necesitar arte propio para cada uno.
      const EMOJI = { pato: "🦆", perro: "🐕", tv: "📺", calzoncillo: "🩲", otro_r3tard: "🫠" };
      ctx.rotate(-p.rot); // los emoji no deben girar "de cabeza": se leen siempre igual
      ctx.font = "20px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(EMOJI[p.kind], 0, 1);
    } else if (p.kind === "rayo") {
      // Rayo/lightning — firma de los legendarios eléctricos (rayos/cósmico).
      ctx.fillStyle = p.color || "#fff36a";
      ctx.strokeStyle = "#fffbe0";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-3, -11);
      ctx.lineTo(3, -2);
      ctx.lineTo(-2, -1);
      ctx.lineTo(4, 11);
      ctx.lineTo(-4, 1);
      ctx.lineTo(1, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (p.kind === "laser") {
      // Rayo láser — un haz brillante en vez de un objeto sólido.
      const g = ctx.createLinearGradient(0, -14, 0, 14);
      g.addColorStop(0, "rgba(255,80,140,0)");
      g.addColorStop(0.5, p.color || "#ff5e9c");
      g.addColorStop(1, "rgba(255,80,140,0)");
      ctx.strokeStyle = g;
      ctx.lineWidth = 3.5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(0, 14);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(0, 14);
      ctx.stroke();
    } else if (p.kind === "disco") {
      // Disco/gema — firma del legendario "cristal".
      ctx.fillStyle = p.color || "#c77dff";
      ctx.beginPath();
      ctx.ellipse(0, 0, 10, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, 0, 10, 4, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // "tomate"
      ctx.fillStyle = "#e0503a";
      ctx.beginPath();
      ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#5eba5e";
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * 3, -7 + Math.sin(a) * 2, 3, 1.6, a, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawFloatTexts() {
    // Textos sueltos de un solo uso (golpe recibido, "+puntos", subida de
    // arma) — aparecen en un punto fijo y flotan/se desvanecen solos, sin
    // fondo ni cola. Las frases que "dice" un r3tard (comunes y
    // legendarios) ya no pasan por acá — ver drawSpeechBubbles.
    ctx.textAlign = "center";
    ctx.font = "700 20px 'Kalam', 'Segoe UI', sans-serif";
    for (const t of floatTexts) {
      const lifeRatio = Math.max(0, t.life) / t.maxLife;
      const alpha = Math.max(0, Math.min(1, lifeRatio * 3, (1 - lifeRatio) * 6 + 1));
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Burbujas de diálogo tipo cómic — lo que "dicen" los r3tards (frases de
   * "cultura nad" de los comunes, y las burlas propias de cada legendario)
   * mientras siguen cayendo/vivos. A diferencia de un floatText suelto,
   * se vuelven a posicionar CADA FRAME según la posición ACTUAL del nft
   * (`b.nft.x`/`b.nft.y`) — por eso de verdad se ve como que la burbuja
   * "sale" de encima de ese r3tard en particular, en vez de quedar
   * colgada en el aire donde apareció. Pedido explícito del usuario:
   * "deberia aparecer como tipo comic saliendo de ellos".
   */
  // Parte `text` en varias líneas para que ninguna supere `maxWidth` con
  // la fuente YA seleccionada en `ctx` (llamar después de fijar ctx.font).
  // Sin esto, una frase larga (las hay de hasta 9 palabras) desborda la
  // burbuja por los costados y puede terminar recortada fuera del canvas
  // — bug real encontrado probando esta misma función.
  function wrapTextLines(text, maxWidth) {
    const words = text.split(" ");
    const lines = [];
    let cur = "";
    for (const word of words) {
      const test = cur ? cur + " " + word : word;
      if (cur && ctx.measureText(test).width > maxWidth) {
        lines.push(cur);
        cur = word;
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function drawSpeechBubbles() {
    if (!speechBubbles.length) return;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    const legendaryFont = "700 19px 'Kalam', 'Segoe UI', sans-serif";
    const commonFont = "700 16px 'Kalam', 'Segoe UI', sans-serif";
    const w = cssW(), h = cssH();
    for (const b of speechBubbles) {
      const isLegendary = b.kind === "legendary";
      ctx.font = isLegendary ? legendaryFont : commonFont;
      const lifeRatio = Math.max(0, b.life) / b.maxLife;
      // Fade-in rápido, sostenido, fade-out al final.
      const alpha = Math.max(0, Math.min(1, lifeRatio * 4, (1 - lifeRatio) * 6 + 1));
      ctx.globalAlpha = alpha;

      const nft = b.nft;
      // Punta de la cola: justo encima de la cabeza del r3tard, EN SU
      // POSICIÓN ACTUAL (no la de cuando se disparó la frase) — así la
      // burbuja lo sigue mientras cae/se mueve.
      const tipX = Math.max(0, Math.min(w, nft.x));
      const tipY = nft.y - nft.size / 2 - 6;

      const padX = isLegendary ? 11 : 9;
      const padY = isLegendary ? 7 : 6;
      const lineH = isLegendary ? 22 : 19;
      // Ancho máximo de línea de texto (antes de cortar a otra línea):
      // deja siempre margen a los costados del canvas, sin importar qué
      // tan angosta sea la pantalla (celular incluido).
      const maxTextWidth = Math.min(isLegendary ? 250 : 210, w - 56);
      const lines = wrapTextLines(b.text, maxTextWidth);
      let widestLine = 0;
      for (const line of lines) widestLine = Math.max(widestLine, ctx.measureText(line).width);
      const bw = widestLine + padX * 2;
      const bh = lineH * lines.length + padY * 2;

      // La burbuja va encima de la punta de la cola, pero nunca más
      // arriba de la franja donde `main.js` pone las etiquetas DOM de
      // nombre (mismo bug ya encontrado antes: si no se limita, la
      // burbuja de un r3tard recién aparecido queda tapada o fuera del
      // canvas). Al recalcularse cada frame, apenas el r3tard baja lo
      // suficiente la burbuja lo empieza a seguir con normalidad.
      const safeMinTop = Math.min(isLegendary ? 210 : 236, h * 0.3);
      let by = tipY - 14 - bh; // arriba de la punta de la cola
      by = Math.max(by, safeMinTop);
      let bx = tipX - bw / 2;
      bx = Math.max(6, Math.min(w - bw - 6, bx));

      // Cuerpo de la burbuja.
      ctx.fillStyle = isLegendary ? "rgba(18, 12, 30, 0.82)" : "rgba(10, 8, 20, 0.78)";
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 11);
      else ctx.rect(bx, by, bw, bh);
      ctx.fill();
      if (isLegendary) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = b.color;
        ctx.stroke();
      } else {
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "rgba(255,255,255,0.18)";
        ctx.stroke();
      }

      // Cola: triángulo desde el borde inferior de la burbuja hasta justo
      // encima de la cabeza del r3tard. Si el r3tard está muy cerca del
      // borde de la burbuja (o la burbuja tuvo que desplazarse mucho para
      // no salirse por un costado), la base de la cola se limita para que
      // siga naciendo DENTRO del borde inferior de la burbuja.
      const bubbleBottom = by + bh;
      if (tipY > bubbleBottom - 2) {
        const tailBaseX = Math.max(bx + 12, Math.min(bx + bw - 12, tipX));
        const tailTipClampedY = Math.min(tipY, bubbleBottom + 20);
        ctx.fillStyle = isLegendary ? "rgba(18, 12, 30, 0.82)" : "rgba(10, 8, 20, 0.78)";
        ctx.beginPath();
        ctx.moveTo(tailBaseX - 7, bubbleBottom - 1);
        ctx.lineTo(tailBaseX + 7, bubbleBottom - 1);
        ctx.lineTo(Math.max(bx - 2, Math.min(bx + bw + 2, tipX)), tailTipClampedY);
        ctx.closePath();
        ctx.fill();
      }

      // Texto centrado en la burbuja, una línea a la vez.
      const textX = bx + bw / 2;
      ctx.lineWidth = isLegendary ? 3 : 2.5;
      for (let li = 0; li < lines.length; li++) {
        const textY = by + padY + lineH * (li + 0.76);
        ctx.strokeStyle = "rgba(0,0,0,0.85)";
        ctx.strokeText(lines[li], textX, textY);
        ctx.fillStyle = isLegendary ? b.color : "#f4f1ff";
        ctx.fillText(lines[li], textX, textY);
      }
    }
    ctx.globalAlpha = 1;
    ctx.textBaseline = "alphabetic";
  }

  /**
   * El avatar del jugador: siempre el r3tard menos raro de la colección
   * (ver pickDefaultAvatarItem), dibujado con el mismo recorte "cutout"
   * que los NFTs que caen. Se desliza horizontalmente hacia donde el
   * jugador tocó/hizo clic por última vez (ver update()).
   */
  function drawAvatar() {
    const x = avatarX;
    const y = cssH() - AVATAR_Y_OFFSET;
    const r = 30;
    ctx.save();
    ctx.translate(x, y);

    // Plataforma/sombra bajo el avatar
    ctx.fillStyle = "rgba(110, 84, 255,0.28)";
    ctx.beginPath();
    ctx.ellipse(0, r * 0.75, r * 0.95, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Aro de energía detrás
    const glow = ctx.createRadialGradient(0, 0, r * 0.6, 0, 0, r * 1.4);
    glow.addColorStop(0, "rgba(110, 84, 255,0.35)");
    glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.clip();
    if (avatarCutout) {
      ctx.drawImage(avatarCutout, -r, -r, r * 2, r * 2);
    } else {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, "#e6d9ff");
      g.addColorStop(1, "#6E54FF");
      ctx.fillStyle = g;
      ctx.fillRect(-r, -r, r * 2, r * 2);
    }
    ctx.restore();

    ctx.lineWidth = 3;
    ctx.strokeStyle = "#e6d9ff";
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Arma que el avatar va desbloqueando (ver WEAPON_TIER_META/
   * currentWeaponTier) — pedido explícito: "ajustada al personaje", así
   * que se dibuja pegada al avatar y a su mismo tamaño relativo (nunca
   * más grande que el propio avatar), apuntando EXACTAMENTE hacia donde
   * fue el último disparo (lastFireAngle) — no solo mirando a la
   * izquierda/derecha como antes, sino rotada al ángulo real, así que
   * la mayoría del tiempo se ve vertical (apuntando hacia arriba, de
   * donde caen los r3tards) en vez de siempre horizontal.
   */
  function drawWeapon() {
    const tier = currentWeaponTier();
    if (tier <= 0) return;
    const meta = WEAPON_TIER_META[tier];
    const img = weaponImgs[meta.imgKey];
    if (!img || !img.complete || !img.naturalWidth) return;

    const x = avatarX;
    const y = cssH() - AVATAR_Y_OFFSET;
    const r = 30;
    // Se mira hacia la izquierda o la derecha según el signo de la
    // componente horizontal del ángulo (nunca queda "de cabeza"), y
    // dentro de eso rota libremente — así puede apuntar derecho hacia
    // arriba (vertical) sin verse invertida.
    const flip = Math.cos(lastFireAngle) < 0 ? -1 : 1;
    const theta = flip === 1 ? lastFireAngle : Math.PI - lastFireAngle;
    const targetW = r * 1.7; // ajustada al tamaño del avatar (r=30), no más grande que él
    const scale = targetW / img.naturalWidth;
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;

    ctx.save();
    ctx.translate(x, y + r * 0.1);
    ctx.scale(flip, 1);
    ctx.rotate(theta);
    ctx.drawImage(img, -w * 0.12, -h / 2, w, h);
    ctx.restore();
  }

  /**
   * Destello de pantalla completa cuando cae algo especial (épico o
   * legendario) — hace que el momento se sienta grande incluso antes de
   * que el NFT llegue a la mitad de la pantalla.
   */
  function drawSpawnFlash() {
    if (!spawnFlash) return;
    const alpha = Math.max(0, spawnFlash.time / spawnFlash.maxTime);
    ctx.save();
    ctx.globalAlpha = alpha * 0.4;
    const g = ctx.createRadialGradient(cssW() / 2, cssH() * 0.4, 0, cssW() / 2, cssH() * 0.4, Math.max(cssW(), cssH()) * 0.85);
    g.addColorStop(0, spawnFlash.color);
    g.addColorStop(1, "transparent");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cssW(), cssH());
    ctx.restore();
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW(), cssH());

    let shakeX = 0, shakeY = 0;
    if (shakeTime > 0) {
      shakeX = (Math.random() * 2 - 1) * shakeMag;
      shakeY = (Math.random() * 2 - 1) * shakeMag;
    }
    ctx.save();
    ctx.translate(shakeX, shakeY);

    drawBackground();
    drawSpawnFlash();
    for (const n of falling) drawFalling(n);
    drawParticles();
    for (const p of projectiles) drawProjectile(p);
    for (const p of enemyThrows) drawEnemyThrow(p);
    drawFloatTexts();
    drawSpeechBubbles();
    drawAvatar();
    drawWeapon();

    ctx.restore();
  }

  // ---------------------------------------------------------------
  // Loop
  // ---------------------------------------------------------------
  function loop(ts) {
    if (!running) return;
    const dt = Math.min(0.033, (ts - lastTs) / 1000 || 0);
    lastTs = ts;
    update(dt);
    draw();
    rafId = requestAnimationFrame(loop);
  }

  function start(coll) {
    collection = coll;
    falling = [];
    projectiles = [];
    enemyThrows = [];
    particles = [];
    floatTexts = [];
    pendingCommonTaunts = [];
    speechBubbles = [];
    score = 0;
    lives = CFG.MAX_LIVES;
    wave = 1;
    combo = 0;
    bestCombo = 0;
    killsByTier = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 };
    certifiedKills = 0;
    legendaryKills = 0;
    legendariesSpawned = 0;
    activeThrowers = [];
    sessionKilledIds = new Set();
    sessionKillDetails = new Map();
    lastFireAngle = -Math.PI / 2;
    lastAnnouncedWeaponTier = 0;
    spawnTimer = 600;
    spawnFlash = null;
    cutoutCache.clear();

    // Progresión por tiempo real, desde cero en cada partida nueva.
    sessionStartTs = performance.now();
    lastDifficultyStep = -1;
    tierBuckets = {};
    for (const it of collection) {
      const key = it.rarityTier || "common";
      (tierBuckets[key] = tierBuckets[key] || []).push(it);
    }

    // Avatar: siempre el r3tard menos raro de la colección.
    avatarItem = pickDefaultAvatarItem(collection);
    avatarCutout = null;
    resize();
    avatarX = cssW() / 2;
    avatarTargetX = avatarX;
    if (avatarItem && avatarItem.image) {
      loadImageWithFallback(avatarItem.image, (img) => {
        if (!img) return;
        try {
          avatarCutout = processCutout(img);
        } catch {
          avatarCutout = null;
        }
      });
    }

    onScoreChange(0, 0, 0);
    onLivesChange(lives);
    onWaveChange(wave, themeName(THEMES[0]));
    onDifficultyChange(0, CFG.SPAWN_PROGRESSION.durationMinutes);
    onProgress(0, collection.length);
    R3Audio.setMusicIntensity(0);
    R3Audio.startMusic();
    running = true;
    lastTs = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  // Lista {tokenId, tierKey} de los r3tards distintos matados en ESTA
  // partida — se manda tal cual a main.js en onGameOver, que a su vez la
  // usa para armar la transacción recordMatch() (ver wallet.js) al
  // terminar, con el código numérico de cada tier (R3_CONFIG.TIER_CHAIN_CODE).
  function sessionKillDetailsArray() {
    return Array.from(sessionKillDetails.entries()).map(([tokenId, tierKey]) => ({ tokenId, tierKey }));
  }

  function endGame() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    R3Audio.stopMusic();
    R3Audio.gameOver();
    onGameOver({ score, bestCombo, killsByTier, certifiedKills, wave, survivalMs: performance.now() - sessionStartTs, victory: false, killedTokens: sessionKillDetailsArray() });
  }

  // Se llama cuando ya se mató al menos una vez a todos los r3tards
  // distintos cargados EN ESTA MISMA partida, la "partida perfecta"/final real
  // del juego (a diferencia de endGame(), que es perder por quedarse
  // sin vidas).
  function winGame() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    R3Audio.stopMusic();
    R3Audio.victory();
    onGameOver({ score, bestCombo, killsByTier, certifiedKills, wave, survivalMs: performance.now() - sessionStartTs, victory: true, killedTokens: sessionKillDetailsArray() });
  }

  function stop() {
    running = false;
    keyLeft = false;
    keyRight = false;
    pointerActive = false;
    R3Audio.stopMusic();
    if (rafId) cancelAnimationFrame(rafId);
  }

  return { init, start, stop, fireProjectile, prefetchImages };
})();

window.R3Game = R3Game;
