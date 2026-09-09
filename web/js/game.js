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

  let canvas, ctx, dpr;
  let running = false;
  let rafId = null;
  let lastTs = 0;

  let collection = [];
  let falling = [];
  let projectiles = [];
  let particles = [];
  let floatTexts = [];
  let banners = []; // avisos grandes tipo "¡LEGENDARIO detectado!"

  let score = 0;
  let lives = CFG.MAX_LIVES;
  let wave = 1;
  let combo = 0;
  let bestCombo = 0;
  let comboTimer = 0;
  let killsByTier = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 };
  let legendaryKills = 0; // sube el daño del jugador: 1er legendario → x2, 2do → x3 (tope)
  let legendariesSpawned = 0; // cada legendario que aparece hace que el SIGUIENTE sea más resistente
  let sessionKilledIds = new Set(); // tokenIds distintos matados en ESTA partida — meta: llegar a collection.length (los 1033)

  let spawnTimer = 0;
  let shakeTime = 0;
  let shakeMag = 0;
  let spawnFlash = null; // { time, color, key } — destello de pantalla al caer algo especial

  // ---- Progresión por tiempo real (no por puntaje) --------------------
  let sessionStartTs = 0;
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

  // ---- Fondo dinámico: la imagen de un r3tard real de fondo, que va
  // cambiando de menos raro a más raro a medida que avanza la partida.
  let bgSortedList = []; // [...collection] ordenada de menos a más rara
  let bgIndex = 0;
  let bgChangeTimer = 0;
  const bgImageCache = new Map(); // tokenId -> HTMLImageElement | 'loading' | 'error'

  const THEMES = [
    { name: "Grieta Inicial", top: "#150a2b", bottom: "#3a1f68", particle: "#8f7bff", accent: "#6E54FF" },
    { name: "Tormenta Púrpura", top: "#1a0433", bottom: "#5b12a8", particle: "#c77dff", accent: "#b14aff" },
    { name: "Núcleo en Llamas", top: "#2a0808", bottom: "#7a1f0e", particle: "#ff8a3d", accent: "#ff5e1a" },
    { name: "Vacío Cósmico", top: "#020010", bottom: "#12002b", particle: "#9df1ff", accent: "#5eead4" },
    { name: "Apocalipsis Total", top: "#050005", bottom: "#4a0e6b", particle: "#ff5e9c", accent: "#6E54FF" },
  ];

  let monadOrbImg = null;

  let onScoreChange = () => {};
  let onLivesChange = () => {};
  let onWaveChange = () => {};
  let onGameOver = () => {};
  let onNftTag = () => {}; // cuadro de texto flotante (DOM) al caer un NFT
  let onKill = () => {}; // se llama en cada NFT eliminado (para logros)
  let onDamageBuff = () => {}; // se llama cuando el daño del jugador sube (tras matar legendarios)
  let onProgress = () => {}; // se llama con (distintosMatados, total) cada vez que sube el contador

  function damageMultiplier() {
    if (legendaryKills <= 0) return 1;
    if (legendaryKills === 1) return 2;
    return 3; // tope: matar más legendarios ya no sigue subiendo el daño
  }

  function init(canvasEl, callbacks) {
    canvas = canvasEl;
    ctx = canvas.getContext("2d");
    onScoreChange = callbacks.onScoreChange || onScoreChange;
    onLivesChange = callbacks.onLivesChange || onLivesChange;
    onWaveChange = callbacks.onWaveChange || onWaveChange;
    onGameOver = callbacks.onGameOver || onGameOver;
    onNftTag = callbacks.onNftTag || onNftTag;
    onKill = callbacks.onKill || onKill;
    onDamageBuff = callbacks.onDamageBuff || onDamageBuff;
    onProgress = callbacks.onProgress || onProgress;

    monadOrbImg = new Image();
    monadOrbImg.src = "assets/monad-orb.svg";

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
   * aparece", aunque el archivo exista y esté bien en el repo. Lo mismo le
   * pasa al fondo (ensureBgImage) si tiene que competir por red contra
   * todas las caídas a la vez.
   * La solución no es tocar el spawn (tiene que seguir siendo al azar) ni
   * el fallback CORS de arriba (eso ya está bien) — es adelantar la
   * descarga de TODA la colección en cuanto está lista la lista de items,
   * mucho antes de que hagan falta, con pocas descargas a la vez para no
   * saturar la red del navegador ni trabar el hilo principal. Así, cuando
   * un r3tard cae por primera "vez visual", su imagen casi siempre ya está
   * en la caché HTTP del navegador y aparece de inmediato.
   */
  function prefetchImages(coll) {
    if (!Array.isArray(coll) || coll.length === 0) return;
    const urls = [];
    for (const item of coll) {
      if (!item || !item.image) continue;
      urls.push(resolvedImageUrl(item.image));
    }
    let idx = 0;
    let done = 0;
    const CONCURRENCY = 10;
    function next() {
      if (idx >= urls.length) return;
      const url = urls[idx++];
      const img = new Image();
      img.crossOrigin = "anonymous";
      const advance = () => {
        done++;
        next();
      };
      img.onload = advance;
      img.onerror = advance;
      img.src = url;
    }
    const starters = Math.min(CONCURRENCY, urls.length);
    for (let k = 0; k < starters; k++) next();
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
    return Math.max(0, Math.min(1, elapsedMin / dur));
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
   * Pide que se cargue la imagen del r3tard en `bgSortedList[idx]` (si no
   * se ha pedido ya) para usarla como fondo de pantalla. También adelanta
   * la SIGUIENTE, para que el cambio de fondo sea instantáneo cuando
   * toque (en vez de verse un salto en blanco mientras carga).
   */
  function ensureBgImage(idx) {
    const item = bgSortedList[idx];
    if (!item || !item.image) return;
    if (bgImageCache.has(item.tokenId)) return;
    bgImageCache.set(item.tokenId, "loading");
    loadImageWithFallback(item.image, (img) => {
      bgImageCache.set(item.tokenId, img || "error");
    });
  }

  function loadBgImageAt(idx) {
    ensureBgImage(idx);
    ensureBgImage(idx + 1);
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
    };
    if (tierKey === "rare") {
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
    if (tier.key === "legendary") {
      legendariesSpawned += 1;
      legendaryEscalation = 1 + Math.min(legendariesSpawned - 1, 6) * 0.55;
    }
    const hp = Math.max(1, Math.round(tier.hp * (1 + progress01() * growth) * legendaryEscalation));
    const baseSpeed = 38 + progress01() * 90; // fácil al inicio, hasta ~3x a las 3h, luego se mantiene
    const speed = baseSpeed * (tier.sizeMul > 2 ? 0.62 : 1); // lo grande cae más lento (más justo)
    const pointsValue = Math.round(tier.points * rarityBonusMultiplier(item));
    const movement = pickMovementPattern(tier.key);

    let startX, startY, vx;
    if (movement.kind === "side") {
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

    const nft = {
      id: item.tokenId + "_" + Math.random().toString(36).slice(2, 7),
      tokenId: item.tokenId,
      name: item.name,
      image: item.image,
      tierKey: tier.key,
      tier,
      pointsValue,
      size,
      hp,
      maxHp: hp,
      x: startX,
      baseX: startX, // ancla del zigzag — nunca se pierde aunque n.x oscile
      y: startY,
      vy: movement.kind === "side" ? 14 + Math.random() * 10 : speed,
      vx,
      movement,
      wobblePhase: Math.random() * Math.PI * 2,
      wobbleAmp: 12 + Math.random() * 18,
      spawnT: performance.now(),
      owner: null,
      flash: 0,
    };
    falling.push(nft);

    // Owner en vivo (no bloquea el spawn).
    R3Loader.getCurrentOwner(item.tokenId).then((owner) => {
      nft.owner = owner;
    });

    onNftTag({
      tokenId: item.tokenId,
      name: item.name,
      tierLabel: tier.label,
      tierKey: tier.key,
      color: tier.color,
      big: tier.key === "rare" || tier.key === "epic" || tier.key === "legendary",
    });

    if (tier.key === "epic" || tier.key === "legendary") {
      if (tier.key === "legendary") {
        R3Audio.legendarySpawnAlert();
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
    const dist = Math.max(1, Math.hypot(dx, dy));
    const speed = 780;
    projectiles.push({
      x: originX,
      y: originY,
      vx: (dx / dist) * speed,
      vy: (dy / dist) * speed,
      rot: 0,
      life: 1.4,
    });
    R3Audio.shoot();
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
    floatTexts.push({ x, y, text, color, life: 1.1, vy: -46 });
  }

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
      onWaveChange(wave, THEMES[(wave - 1) % THEMES.length].name);
      R3Audio.waveUp();
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

    // Partículas
    for (let i = particles.length - 1; i >= 0; i--) {
      const pt = particles[i];
      pt.life -= dt;
      if (pt.life <= 0) { particles.splice(i, 1); continue; }
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vy += 220 * dt;
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

    // Fondo dinámico: cada 10-20s (al azar) avanza UN paso hacia r3tards
    // más raros — nunca retrocede ni salta varios de una vez.
    if (bgSortedList.length > 0) {
      bgChangeTimer -= dt * 1000;
      if (bgChangeTimer <= 0) {
        if (bgIndex < bgSortedList.length - 1) {
          bgIndex += 1;
          loadBgImageAt(bgIndex);
        }
        bgChangeTimer = 10000 + Math.random() * 10000;
      }
    }
  }

  function hitNFT(n, idx) {
    n.hp -= damageMultiplier();
    n.flash = 1;
    R3Audio.hitImpact(n.tierKey);
    burst(n.x, n.y, n.tier.color, 6, 0.6);

    if (n.hp <= 0) {
      combo += 1;
      comboTimer = 2.2;
      bestCombo = Math.max(bestCombo, combo);
      killsByTier[n.tierKey] = (killsByTier[n.tierKey] || 0) + 1;

      const comboMul = 1 + Math.min(combo - 1, 8) * 0.12;
      const pts = Math.round(n.pointsValue * comboMul);
      score += pts;
      onScoreChange(score, pts, combo);

      R3Audio.death(n.tierKey);
      burst(n.x, n.y, n.tier.color, n.tierKey === "legendary" ? 60 : n.tierKey === "epic" ? 40 : 18, n.tier.sizeMul);
      floatText(n.x, n.y, `+${pts}${combo > 1 ? ` x${combo}` : ""}`, n.tier.color);

      onKill({
        tokenId: n.tokenId,
        name: n.name,
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
        tierLabel: n.tier.label,
        points: pts,
      });

      // Meta de "colección completa": ¿ya habíamos matado a este mismo
      // r3tard antes en esta partida? Si es la primera vez, sube el
      // contador de distintos — cuando llegue a collection.length (los
      // collection.length) se gana la partida (ver winGame()).
      if (!sessionKilledIds.has(n.tokenId)) {
        sessionKilledIds.add(n.tokenId);
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
  function drawBackground() {
    const theme = THEMES[(wave - 1) % THEMES.length];

    // Fondo dinámico: la imagen real de un r3tard (el mismo mecanismo de
    // carga que usan los que caen), recortada para llenar toda la
    // pantalla sin importar su proporción. Va cambiando de menos raro a
    // más raro a medida que avanza la partida (ver update()).
    const bgItem = bgSortedList[bgIndex];
    const bgImg = bgItem ? bgImageCache.get(bgItem.tokenId) : null;
    if (bgImg && bgImg !== "loading" && bgImg !== "error" && bgImg.naturalWidth) {
      const iw = bgImg.naturalWidth, ih = bgImg.naturalHeight;
      const scale = Math.max(cssW() / iw, cssH() / ih);
      const dw = iw * scale, dh = ih * scale;
      const dx = (cssW() - dw) / 2, dy = (cssH() - dh) / 2;
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.drawImage(bgImg, dx, dy, dw, dh);
      ctx.restore();
      // Oscurecemos encima para que las figuras/textos del juego sigan
      // leyéndose bien sobre la imagen.
      ctx.fillStyle = "rgba(6,3,14,0.55)";
      ctx.fillRect(0, 0, cssW(), cssH());
    } else {
      // Mientras carga la primera imagen (o si falla): degradado liso.
      const g0 = ctx.createLinearGradient(0, 0, 0, cssH());
      g0.addColorStop(0, theme.top);
      g0.addColorStop(1, theme.bottom);
      ctx.fillStyle = g0;
      ctx.fillRect(0, 0, cssW(), cssH());
    }

    // Tinte de color según la oleada (el sistema de paletas por tema).
    const g = ctx.createLinearGradient(0, 0, 0, cssH());
    g.addColorStop(0, theme.top + "55");
    g.addColorStop(1, theme.bottom + "55");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cssW(), cssH());

    // Resplandor pulsante de fondo
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 900);
    const rg = ctx.createRadialGradient(cssW() / 2, cssH() * 0.35, 0, cssW() / 2, cssH() * 0.35, cssW() * 0.7);
    rg.addColorStop(0, theme.accent + Math.round(18 + pulse * 14).toString(16).padStart(2, "0"));
    rg.addColorStop(1, "transparent");
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, cssW(), cssH());
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
    legendary: { rings: 4, amp: 9.5, freq: 7, speed: 3.6, spacing: 9, width: 3, glow: 24, colors: ["#fff3b0", "#ffd166", "#ff5e9c", "#ffd166"] },
  };
  function drawFluorescentWave(n) {
    const cfg = WAVE_CFG[n.tierKey];
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
    const auraIntensity = { uncommon: 0.18, rare: 0.34, epic: 0.55, legendary: 0.95 }[n.tierKey] || 0;
    if (auraIntensity > 0) {
      ctx.save();
      const speedDiv = n.tierKey === "legendary" ? 150 : n.tierKey === "epic" ? 200 : 260;
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / speedDiv);
      const extra = { uncommon: 8, rare: 16, epic: 27, legendary: 46 }[n.tierKey] || 8;
      const alphaByte = Math.min(255, Math.round((0.55 + pulse * 0.35) * auraIntensity * 255));
      const g = ctx.createRadialGradient(0, 0, n.size / 2, 0, 0, n.size / 2 + extra);
      g.addColorStop(0, n.tier.color + alphaByte.toString(16).padStart(2, "0"));
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, n.size / 2 + extra, 0, Math.PI * 2);
      ctx.fill();

      if (n.tierKey === "legendary" || n.tierKey === "epic") {
        const rays = n.tierKey === "legendary" ? 8 : 5;
        const rot = performance.now() / (n.tierKey === "legendary" ? 500 : 700);
        ctx.strokeStyle = n.tier.color;
        ctx.lineWidth = n.tierKey === "legendary" ? 2.5 : 2;
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
    ctx.textAlign = "center";
    ctx.font = "bold 20px 'Segoe UI', sans-serif";
    for (const t of floatTexts) {
      ctx.globalAlpha = Math.max(0, t.life);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
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
    drawFloatTexts();
    drawAvatar();

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
    particles = [];
    floatTexts = [];
    score = 0;
    lives = CFG.MAX_LIVES;
    wave = 1;
    combo = 0;
    bestCombo = 0;
    killsByTier = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 };
    legendaryKills = 0;
    legendariesSpawned = 0;
    sessionKilledIds = new Set();
    spawnTimer = 600;
    spawnFlash = null;
    cutoutCache.clear();

    // Progresión por tiempo real, desde cero en cada partida nueva.
    sessionStartTs = performance.now();
    tierBuckets = {};
    for (const it of collection) {
      const key = it.rarityTier || "common";
      (tierBuckets[key] = tierBuckets[key] || []).push(it);
    }

    // Fondo dinámico: lista ordenada de menos a más raro, empezando
    // siempre en el más común. bgImageCache NO se limpia entre partidas
    // (las imágenes ya descargadas se pueden reusar tal cual).
    bgSortedList = [...collection].sort((a, b) => (a.rarityScore || 0) - (b.rarityScore || 0));
    bgIndex = 0;
    bgChangeTimer = 10000 + Math.random() * 10000;
    if (bgSortedList.length > 0) loadBgImageAt(0);

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
    onWaveChange(wave, THEMES[0].name);
    onProgress(0, collection.length);
    running = true;
    lastTs = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  function endGame() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    R3Audio.gameOver();
    onGameOver({ score, bestCombo, killsByTier, wave, victory: false });
  }

  // Se llama cuando ya se mató al menos una vez a todos los r3tards
  // distintos cargados EN ESTA MISMA partida, la "partida perfecta"/final real
  // del juego (a diferencia de endGame(), que es perder por quedarse
  // sin vidas).
  function winGame() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    R3Audio.waveUp();
    onGameOver({ score, bestCombo, killsByTier, wave, victory: true });
  }

  function stop() {
    running = false;
    keyLeft = false;
    keyRight = false;
    pointerActive = false;
    if (rafId) cancelAnimationFrame(rafId);
  }

  return { init, start, stop, fireProjectile, prefetchImages };
})();

window.R3Game = R3Game;
