/**
 * ============================================================
 *  R3 APOCALIPSIS — main.js
 *  Máquina de estados de la UI + pegamento entre módulos.
 * ============================================================
 */
(async function () {
  const CFG = window.R3_CONFIG;

  const el = (id) => document.getElementById(id);
  const screens = {
    menu: el("screen-menu"),
    game: el("screen-game"),
    gameover: el("screen-gameover"),
  };

  const btnConnect = el("btn-connect");
  const btnPlay = el("btn-play");
  const btnPlayAgain = el("btn-play-again");
  const btnBackMenu = el("btn-back-menu");
  const walletStatus = el("wallet-status");
  const menuError = el("menu-error");
  const btnRetry = el("btn-retry-collection");
  const priceDisplay = el("price-display");
  const progressWrap = el("collection-progress");
  const progressBar = el("progress-bar");
  const progressLabel = el("progress-label");

  const aliasRow = el("alias-row");
  const aliasCurrent = el("alias-current");
  const aliasInput = el("alias-input");
  const btnSaveAlias = el("btn-save-alias");

  const goAchievementsEarned = el("go-achievements-earned");
  const goAchievementsList = el("go-achievements-list");
  const goOnchain = el("go-onchain");
  const goOnchainStatus = el("go-onchain-status");
  const btnSaveScore = el("btn-save-score");
  const btnSaveAchievements = el("btn-save-achievements");
  const goConnectHint = el("go-connect-hint");
  const btnConnectGameover = el("btn-connect-gameover");

  const hudScore = el("hud-score");
  const hudWave = el("hud-wave");
  const hudWaveName = el("hud-wave-name");
  const hudDifficulty = el("hud-difficulty");
  const hudDifficultyLevel = el("hud-difficulty-level");
  const hudDifficultyMax = el("hud-difficulty-max");
  const hudDifficultyFill = el("hud-difficulty-fill");
  const hudLives = el("hud-lives");
  const hudCombo = el("hud-combo");
  const hudProgress = el("hud-progress");
  const tagLayer = el("tag-layer");
  const bannerLayer = el("banner-layer");
  const killLog = el("kill-log");

  const goTitle = el("go-title");
  const goVictoryNote = el("go-victory-note");
  const goScore = el("go-score");
  const goCombo = el("go-combo");
  const goWave = el("go-wave");
  const goProgress = el("go-progress");
  const goBreakdown = el("go-breakdown");

  let lastProgressText = "0/0";

  const toastEl = el("toast");
  let toastTimer = null;

  let collection = null;
  let collectionLoading = false;

  // ---- Ranking/logros on-chain: estado compartido entre el menú y la
  // pantalla de game over -----------------------------------------------
  let currentAlias = "";
  let achievementsMaskCache = null; // bitmask leído del contrato (se refresca al conectar y tras guardar)
  let lastGameOverSummary = null; // el último resumen de partida, para poder mostrar/guardar logros si la wallet se conecta DESPUÉS del game over
  let lastNewAchievementIds = []; // ids de logros ganados esta partida que TODAVÍA no están on-chain

  // Aviso claro si alguien abre index.html directo desde su computadora
  // (doble clic, o desde dentro de un .zip sin extraer) en vez de por un
  // servidor real (GitHub Pages, o un servidor local). Bajo file:// el
  // navegador BLOQUEA fetch() de archivos locales (como collection.json)
  // por seguridad — no es un bug del juego, es una restricción del propio
  // navegador. Sin este aviso, se ve exactamente como "no cargan los
  // precargados ni los fondos", sin ninguna pista de por qué.
  if (window.location.protocol === "file:") {
    showMenuError(
      "⚠️ Estás abriendo este archivo directamente desde tu computadora (protocolo file://). Así el navegador bloquea la carga de la colección y de los fondos — no es un error del juego. Pruébalo siempre desde el link real de GitHub Pages (o un servidor local), nunca abriendo index.html con doble clic."
    );
  }

  function showScreen(name) {
    Object.values(screens).forEach((s) => s.classList.remove("active"));
    screens[name].classList.add("active");
  }

  function toast(msg, ms = 3800) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toastEl.hidden = true), ms);
  }

  function showMenuError(msg) {
    menuError.textContent = msg;
    menuError.hidden = false;
  }
  function clearMenuError() {
    menuError.hidden = true;
  }

  // Mientras GAME_CONTRACT_ADDRESS siga siendo el placeholder, el juego
  // corre en "modo prueba": colección real, sin wallet ni pago. Apenas
  // pongas la dirección real del contrato desplegado, esto se apaga solo
  // y vuelve a exigir conectar wallet + pagar.
  const testMode = !R3Wallet.isContractConfigured();

  let priceText = "Precio actual";
  if (!testMode) {
    try {
      const priceWei = await R3Wallet.getPlayPrice();
      priceText = `${ethers.formatEther(priceWei)} MON`;
    } catch (err) {
      console.warn("No se pudo leer playPrice() todavía:", err);
    }
  }
  priceDisplay.textContent = testMode ? "Modo prueba" : priceText;
  btnPlay.textContent = testMode ? "🧪 Probar gratis (colección real)" : `🎮 Jugar (${priceText})`;
  btnPlayAgain.textContent = testMode ? "🧪 Probar de nuevo" : `🔁 Jugar de nuevo (${priceText})`;
  btnPlay.disabled = false;

  if (testMode) {
    btnConnect.hidden = true;
    walletStatus.textContent = "Modo prueba: colección real de r3tards, sin wallet ni pago.";
    showMenuError(
      "🧪 Estás en modo prueba: GAME_CONTRACT_ADDRESS todavía es el placeholder en js/config.js, así que \"Probar gratis\" carga la colección REAL de r3tards pero no cobra nada. Despliega tu contrato y pega su dirección ahí para activar el cobro real."
    );
  }

  // ---------------------------------------------------------------
  // Ranking global y logros on-chain (ver contracts/R3Apocalipsis.sol).
  // Todo esto es SOLO un extra sobre lo anterior: en modo prueba, o sin
  // wallet conectada, simplemente no se muestra nada de esto.
  // ---------------------------------------------------------------
  async function refreshAliasUI(addr) {
    if (testMode || !addr) {
      aliasRow.hidden = true;
      return;
    }
    aliasRow.hidden = false;
    try {
      currentAlias = (await R3Wallet.getPlayerAlias(addr)) || "";
    } catch (err) {
      console.warn("No se pudo leer el alias on-chain:", err);
      currentAlias = "";
    }
    aliasCurrent.textContent = currentAlias ? `Alias actual: "${currentAlias}"` : "Todavía no tienes alias";
    aliasInput.value = currentAlias;
  }

  btnSaveAlias.addEventListener("click", async () => {
    R3Audio.uiClick();
    const value = aliasInput.value.trim();
    if (!value) {
      showMenuError("Escribe un alias antes de guardarlo.");
      return;
    }
    const addr = R3Wallet.getAddress();
    if (!addr) {
      showMenuError("Conecta tu wallet primero.");
      return;
    }
    btnSaveAlias.disabled = true;
    toast("Confirma la transacción en tu wallet…", 6000);
    try {
      await R3Wallet.setPlayerAlias(value);
      currentAlias = value;
      aliasCurrent.textContent = `Alias actual: "${value}"`;
      toast("¡Alias guardado! Ya aparece así en el ranking.", 2600);
    } catch (err) {
      console.error(err);
      const msg = /user rejected|denied/i.test(err.message || "") ? "Cancelaste la transacción." : err.message || "No se pudo guardar el alias.";
      showMenuError(msg);
    } finally {
      btnSaveAlias.disabled = false;
    }
  });

  async function ensureAchievementsMask(addr) {
    if (achievementsMaskCache !== null) return achievementsMaskCache;
    try {
      achievementsMaskCache = await R3Wallet.getAchievementsMask(addr);
    } catch (err) {
      console.warn("No se pudo leer achievementsMask on-chain:", err);
      achievementsMaskCache = 0n;
    }
    return achievementsMaskCache;
  }

  /** Calcula qué logros (session + lifetime) ya cumple esta partida/wallet. */
  function computeEarnedAchievementIds(summary, addr) {
    const sessionIds = window.R3AchievementDefs ? R3AchievementDefs.bySessionStats(summary) : [];
    let lifetimeIds = [];
    if (addr && window.R3Achievements && window.R3AchievementDefs && collection) {
      const kills = R3Achievements.getKills(addr);
      lifetimeIds = R3AchievementDefs.byLifetimeKills(kills, collection.length);
    }
    return Array.from(new Set([...sessionIds, ...lifetimeIds])).sort((a, b) => a - b);
  }

  function renderGameOverAchievements(earnedIds) {
    if (!window.R3AchievementDefs || earnedIds.length === 0) {
      goAchievementsEarned.hidden = true;
      goAchievementsList.innerHTML = "";
      return;
    }
    goAchievementsEarned.hidden = false;
    goAchievementsList.innerHTML = earnedIds
      .map((id) => {
        const def = R3AchievementDefs.byId(id);
        return def ? `<li title="${def.desc}">🎖️ ${def.name}</li>` : "";
      })
      .join("");
  }

  /** Actualiza la sección "guardar en el ranking / guardar logros" del game over. */
  async function updateGameOverOnchainSection() {
    const addr = R3Wallet.getAddress && R3Wallet.getAddress();
    if (testMode) {
      goOnchain.hidden = true;
      goConnectHint.hidden = true;
      return;
    }
    if (!addr) {
      goOnchain.hidden = true;
      goConnectHint.hidden = false;
      return;
    }
    goConnectHint.hidden = true;
    goOnchain.hidden = false;
    goOnchainStatus.textContent = "";

    const earnedIds = lastGameOverSummary ? computeEarnedAchievementIds(lastGameOverSummary, addr) : [];
    renderGameOverAchievements(earnedIds);

    const mask = await ensureAchievementsMask(addr);
    lastNewAchievementIds = earnedIds.filter((id) => (mask & (1n << BigInt(id))) === 0n);
    btnSaveAchievements.textContent = lastNewAchievementIds.length
      ? `🎖️ Guardar logros nuevos (${lastNewAchievementIds.length})`
      : "🎖️ Guardar logros nuevos";
    btnSaveAchievements.disabled = lastNewAchievementIds.length === 0;
  }

  btnConnectGameover.addEventListener("click", async () => {
    R3Audio.uiClick();
    btnConnectGameover.disabled = true;
    try {
      const addr = await R3Wallet.connect();
      walletStatus.textContent = `Conectado: ${R3Wallet.shortAddress(addr)}`;
      achievementsMaskCache = null;
      await Promise.all([refreshAliasUI(addr), updateGameOverOnchainSection()]);
    } catch (err) {
      console.error(err);
      goOnchainStatus.textContent = err.message || "No se pudo conectar la wallet.";
    } finally {
      btnConnectGameover.disabled = false;
    }
  });

  btnSaveScore.addEventListener("click", async () => {
    R3Audio.uiClick();
    if (!lastGameOverSummary) return;
    btnSaveScore.disabled = true;
    goOnchainStatus.textContent = "Confirma la transacción en tu wallet…";
    try {
      await R3Wallet.submitScore(lastGameOverSummary.score);
      goOnchainStatus.textContent = "¡Puntaje guardado en el ranking global!";
    } catch (err) {
      console.error(err);
      const msg = /user rejected|denied/i.test(err.message || "")
        ? "Cancelaste la transacción."
        : /no supera/i.test(err.message || "")
        ? "Este puntaje no supera tu mejor récord guardado — no hace falta guardarlo de nuevo."
        : err.message || "No se pudo guardar el puntaje.";
      goOnchainStatus.textContent = msg;
    } finally {
      btnSaveScore.disabled = false;
    }
  });

  btnSaveAchievements.addEventListener("click", async () => {
    R3Audio.uiClick();
    if (lastNewAchievementIds.length === 0) return;
    btnSaveAchievements.disabled = true;
    goOnchainStatus.textContent = "Confirma la transacción en tu wallet…";
    try {
      await R3Wallet.unlockAchievementsOnChain(lastNewAchievementIds);
      const addr = R3Wallet.getAddress();
      achievementsMaskCache = null; // se relee fresco la próxima vez
      goOnchainStatus.textContent = `¡${lastNewAchievementIds.length} logro(s) guardado(s)! Ya se ven en tus medallas.`;
      lastNewAchievementIds = [];
      btnSaveAchievements.textContent = "🎖️ Guardar logros nuevos";
      btnSaveAchievements.disabled = true;
    } catch (err) {
      console.error(err);
      const msg = /user rejected|denied/i.test(err.message || "") ? "Cancelaste la transacción." : err.message || "No se pudieron guardar los logros.";
      goOnchainStatus.textContent = msg;
      btnSaveAchievements.disabled = false;
    }
  });

  // ---------------------------------------------------------------
  // Carga de la colección (arranca sola, no bloquea el resto del menú)
  // ---------------------------------------------------------------
  async function ensureCollectionLoaded() {
    if (collection) return collection;
    if (collectionLoading) return null;
    collectionLoading = true;
    progressWrap.hidden = false;
    try {
      // OJO: se guarda en una variable LOCAL a propósito (no en la
      // variable `collection` de arriba) hasta que también termine el
      // precargado de imágenes de más abajo. Si se asignara aquí, una
      // llamada a ensureCollectionLoaded() disparada por apretar "Jugar"
      // mientras las imágenes todavía se están precargando vería
      // `collection` ya truthy y devolvería de inmediato en el
      // `if (collection) return collection;` de arriba — dejando entrar a
      // jugar ANTES de que el precargado terminara, exactamente el bug que
      // este precargado existe para evitar.
      const loadedCollection = await R3Loader.loadCollection((loaded, total, phase) => {
        // "loaded"/"total" son siempre la cantidad real de tokens (nunca
        // más que el tamaño de la colección). Cuando hay dos fases
        // internas (leer on-chain, luego resolver metadata/imágenes),
        // cada una ocupa la mitad de la barra, para que se vea continua
        // en vez de "reiniciarse" a la mitad.
        const phasePct = total ? loaded / total : 0;
        const overallPct =
          phase === "metadata" ? 50 + phasePct * 50 : phase === "uri" ? phasePct * 50 : phasePct * 100;
        progressBar.style.width = Math.round(Math.min(100, overallPct)) + "%";
        const label = phase === "metadata" ? "Resolviendo imágenes y nombres" : phase === "uri" ? "Leyendo la colección on-chain" : "Cargando colección r3tards";
        progressLabel.textContent = `${label}… ${loaded}/${total}`;
      });
      // Adelanta la descarga de las ~1033 imágenes en dos etapas, para no
      // tener que elegir entre "esperar todo" (lento) y "no esperar nada"
      // (carreras de red, círculos vacíos — ver el historial de esto en el
      // README, sección 7.5-7.7):
      //   1) Un empujón CORTO y de tiempo fijo (QUICK_START_MS) apenas la
      //      colección está lista, antes de habilitar "Jugar" — así ya
      //      arrancas con una buena parte de las imágenes en caché, sin
      //      tener que esperar las 1033.
      //   2) El resto sigue descargándose SOLO, en segundo plano, MIENTRAS
      //      ya estás jugando — sin bloquear nada. Para que esas descargas
      //      de fondo no le quiten ancho de banda a las imágenes que sí
      //      hacen falta YA (las que van cayendo), se marcan con prioridad
      //      BAJA (`fetchPriority: "low"`) y las que sí son urgentes se
      //      marcan con prioridad ALTA en `loadImageWithFallback()` — el
      //      navegador mismo se encarga de darles paso a las urgentes
      //      primero cuando compiten por la misma conexión.
      if (R3Game && typeof R3Game.prefetchImages === "function") {
        progressLabel.textContent = `Colección lista. Precargando imágenes… 0/${loadedCollection.length}`;
        progressBar.style.width = "0%";
        const QUICK_START_MS = 3500;
        const prefetchPromise = R3Game.prefetchImages(loadedCollection, (done, total) => {
          progressBar.style.width = Math.round((done / total) * 100) + "%";
          progressLabel.textContent = `Precargando imágenes… ${done}/${total}`;
        });
        // No hace falta un botón para "saltar" la espera: como el tope ya
        // es corto y fijo (unos segundos), simplemente se deja pasar ese
        // tiempo y se sigue — la descarga real (`prefetchPromise`) NO se
        // cancela, sigue sola de fondo aunque ya se haya dejado de esperar.
        await Promise.race([prefetchPromise, new Promise((resolve) => setTimeout(resolve, QUICK_START_MS))]);
      }
      // Recién ahora (con el empujón inicial ya hecho — el resto sigue en
      // segundo plano) se marca la colección como lista de verdad para
      // que "Jugar" pueda usarla.
      collection = loadedCollection;
      progressLabel.textContent = `Colección lista: ${collection.length} r3tards cargados ✅`;
      progressBar.style.width = "100%";
      setTimeout(() => (progressWrap.hidden = true), 1400);
      return collection;
    } catch (err) {
      console.error(err);
      progressLabel.textContent = "No se pudo cargar la colección.";
      // Si estamos en file://, el error real (típicamente algo de RPC/red)
      // es solo un síntoma confuso — mostramos la explicación clara en vez
      // de dejar que el mensaje genérico de más abajo la tape.
      if (window.location.protocol === "file:") {
        showMenuError(
          "⚠️ Estás abriendo este archivo directamente desde tu computadora (protocolo file://). Bajo file:// el navegador bloquea la carga rápida de la colección Y no siempre puede completar el respaldo on-chain tampoco. Esto NO es un error del juego — pruébalo desde el link real de GitHub Pages (o un servidor local), nunca abriendo index.html con doble clic."
        );
      } else {
        showMenuError((err && err.message) || "No se pudo leer la colección r3tards. Revisa tu conexión e intenta de nuevo.");
      }
      btnRetry.hidden = false;
      return null;
    } finally {
      collectionLoading = false;
    }
  }
  btnRetry.addEventListener("click", () => {
    R3Audio.uiClick();
    btnRetry.hidden = true;
    clearMenuError();
    ensureCollectionLoaded();
  });
  ensureCollectionLoaded();

  // ---------------------------------------------------------------
  // Wallet
  // ---------------------------------------------------------------
  btnConnect.addEventListener("click", async () => {
    R3Audio.unlock();
    R3Audio.uiClick();
    clearMenuError();
    btnConnect.disabled = true;
    try {
      const addr = await R3Wallet.connect();
      walletStatus.textContent = `Conectado: ${R3Wallet.shortAddress(addr)}`;
      achievementsMaskCache = null;
      await refreshAliasUI(addr);
    } catch (err) {
      console.error(err);
      showMenuError(err.message || "No se pudo conectar la wallet.");
    } finally {
      btnConnect.disabled = false;
    }
  });

  // ---------------------------------------------------------------
  // Jugar: en modo prueba, gratis y sin wallet. En modo real, pide
  // wallet conectada y cobra el precio exacto vía el contrato.
  // ---------------------------------------------------------------
  async function startGame(triggerBtn) {
    R3Audio.unlock();
    R3Audio.uiClick();
    clearMenuError();

    const coll = await ensureCollectionLoaded();
    if (!coll) {
      showMenuError("Espera a que cargue la colección antes de jugar.");
      return;
    }

    if (testMode) {
      toast("Modo prueba: sin pago, colección real de r3tards.", 2000);
      showScreen("game");
      R3Game.start(coll);
      return;
    }

    if (!R3Wallet.getAddress()) {
      showMenuError("Conecta tu wallet primero.");
      return;
    }

    triggerBtn.disabled = true;
    toast("Confirma el pago en tu wallet…", 6000);
    try {
      await R3Wallet.payToPlay();
      R3Audio.coinPay();
      toast("¡Pago confirmado! Que empiece el apocalipsis.", 2200);
      showScreen("game");
      R3Game.start(coll);
    } catch (err) {
      console.error(err);
      const msg = /user rejected|denied/i.test(err.message || "")
        ? "Cancelaste la transacción."
        : err.message || "No se pudo procesar el pago.";
      showMenuError(msg);
    } finally {
      triggerBtn.disabled = false;
    }
  }

  btnPlay.addEventListener("click", () => startGame(btnPlay));
  btnPlayAgain.addEventListener("click", () => startGame(btnPlayAgain));
  btnBackMenu.addEventListener("click", () => {
    R3Audio.uiClick();
    showScreen("menu");
  });

  // ---------------------------------------------------------------
  // Motor del juego: callbacks de UI
  // ---------------------------------------------------------------
  R3Game.init(el("game-canvas"), {
    onScoreChange: (score) => {
      hudScore.textContent = score.toLocaleString("es");
    },
    onLivesChange: (lives) => {
      // Cada vida es el logo de Monad (web/assets/monad-orb.svg) — las que
      // ya perdiste se muestran apagadas/en gris en vez de desaparecer,
      // así siempre se ve cuántas vidas máximas hay (CFG.MAX_LIVES).
      let html = "";
      for (let i = 0; i < CFG.MAX_LIVES; i++) {
        const lost = i >= lives;
        html += `<img class="life-icon${lost ? " life-icon-lost" : ""}" src="assets/monad-orb.svg" alt="vida" />`;
      }
      hudLives.innerHTML = html;
    },
    onWaveChange: (wave, themeName) => {
      hudWave.textContent = wave;
      hudWaveName.textContent = themeName;
    },
    onDifficultyChange: (level, max) => {
      // Sube un escalón por cada minuto real de partida (ver
      // SPAWN_PROGRESSION.durationMinutes en config.js) — se pidió que
      // esto se VEA con claridad, así que además de la barrita, el
      // número "salta" con una animación cada vez que cambia.
      hudDifficultyLevel.textContent = level;
      hudDifficultyMax.textContent = max;
      hudDifficultyFill.style.width = Math.round((level / Math.max(1, max)) * 100) + "%";
      hudDifficulty.classList.remove("hud-difficulty-bump");
      // Forzar reflow para poder re-disparar la animación aunque sea el
      // mismo nombre de clase que ya estaba puesto.
      void hudDifficulty.offsetWidth;
      hudDifficulty.classList.add("hud-difficulty-bump");
    },
    onNftTag: (info) => {
      spawnTag(info);
      if (info.big) spawnBanner(info);
    },
    onDamageBuff: (mult) => spawnDamageBanner(mult),
    onProgress: (killedCount, total) => {
      lastProgressText = `${killedCount}/${total}`;
      hudProgress.textContent = lastProgressText;
      if (killedCount === 0) killLog.innerHTML = ""; // partida nueva: log limpio
    },
    onKill: (info) => {
      // Logros: solo se registran si hay una wallet conectada (en modo
      // prueba, sin wallet, no hay a quién atribuírselos).
      const addr = R3Wallet.getAddress && R3Wallet.getAddress();
      if (addr && window.R3Achievements) {
        R3Achievements.recordKill(addr, info);
      }
      appendKillLog(info);
    },
    onGameOver: (summary) => {
      goTitle.textContent = summary.victory ? "¡COLECCIÓN COMPLETA!" : "FIN DEL APOCALIPSIS";
      goTitle.classList.toggle("gameover-title-victory", !!summary.victory);
      goVictoryNote.hidden = !summary.victory;
      goScore.textContent = summary.score.toLocaleString("es");
      goCombo.textContent = summary.bestCombo;
      goWave.textContent = summary.wave;
      goProgress.textContent = lastProgressText;
      goBreakdown.innerHTML = "";
      const labels = { common: "Comunes", uncommon: "Poco comunes", rare: "Raros", epic: "Épicos", legendary: "Legendarios" };
      Object.entries(summary.killsByTier).forEach(([tier, count]) => {
        if (!count) return;
        const li = document.createElement("li");
        li.textContent = `${labels[tier] || tier}: ${count}`;
        goBreakdown.appendChild(li);
      });
      lastGameOverSummary = summary;
      updateGameOverOnchainSection();
      showScreen("gameover");
    },
  });

  // Log en vivo (transparente) de los r3tards que vas matando, más
  // reciente arriba. Se limita a las últimas líneas para no acumular
  // miles de nodos DOM en una partida larga.
  const KILL_LOG_MAX = 14;
  function appendKillLog(info) {
    const line = document.createElement("div");
    line.className = "kill-log-line kill-log-" + info.tierKey;
    line.innerHTML = `<span class="kill-log-tier">${info.tierLabel}</span> r3tards #${info.tokenId} · <span class="kill-log-name">${info.name}</span> <span class="kill-log-pts">+${info.points}</span>`;
    killLog.prepend(line);
    while (killLog.children.length > KILL_LOG_MAX) {
      killLog.removeChild(killLog.lastChild);
    }
  }

  function spawnTag(info) {
    const tag = document.createElement("div");
    tag.className = "nft-tag";
    const activeCount = tagLayer.childElementCount;
    const row = activeCount % 3;
    tag.style.left = 18 + Math.random() * 64 + "%";
    tag.style.top = 60 + row * 40 + "px";
    tag.style.color = info.color;
    tag.innerHTML = `<span class="tag-name">#${info.tokenId} · ${info.name}</span><span class="tag-tier">${info.tierLabel}</span>`;
    tagLayer.appendChild(tag);
    setTimeout(() => tag.remove(), 2600);
  }

  function spawnBanner(info) {
    const b = document.createElement("div");
    b.className = "rare-banner";
    b.style.color = info.color;
    // Los "Certified" son las piezas 1/1 de verdad únicas de la colección
    // (ej. "Cranium", "Angel") — el aviso grande los llama por su nombre
    // propio en vez del genérico "¡LEGENDARIO DETECTADO!", para que se
    // sienta el momento especial de que salió justo esa pieza.
    const verb = info.tierKey === "legendary"
      ? (info.isCertified ? `¡LEGENDARIO "${info.name.toUpperCase()}"!` : "¡LEGENDARIO DETECTADO!")
      : info.tierKey === "epic" ? "¡ÉPICO A LA VISTA!" : "¡RARO CAYENDO!";
    const sub = info.isCertified ? "Pieza 1/1 · Certified" : `r3tards #${info.tokenId}`;
    b.innerHTML = `${verb}<br><span style="font-size:0.6em">${sub}</span>`;
    bannerLayer.appendChild(b);
    setTimeout(() => b.remove(), 2300);
  }

  // Se dispara al matar un legendario: el daño del jugador sube (x2, luego
  // x3 tope) por el resto de la partida — lo anunciamos igual de fuerte
  // que la aparición de un legendario, para que se sienta como un logro.
  function spawnDamageBanner(mult) {
    R3Audio.waveUp();
    const b = document.createElement("div");
    b.className = "rare-banner";
    b.style.color = "#ffd166";
    b.innerHTML = `¡DAÑO x${mult} DESBLOQUEADO!<br><span style="font-size:0.6em">Tus disparos ahora hacen ${mult}x de daño</span>`;
    bannerLayer.appendChild(b);
    setTimeout(() => b.remove(), 2300);
  }
})();
