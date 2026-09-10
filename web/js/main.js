/**
 * ============================================================
 *  R3 APOCALIPSIS — main.js
 *  Máquina de estados de la UI + pegamento entre módulos.
 * ============================================================
 */
(async function () {
  const CFG = window.R3_CONFIG;
  const I18N = window.R3I18N;

  // Aplica ya mismo las traducciones estáticas marcadas en el HTML con
  // data-i18n/data-i18n-attr (ver js/i18n.js) — se vuelve a llamar cada
  // vez que el jugador cambia de idioma a mano desde R3I18N.setLang().
  I18N.applyStaticTranslations();

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
  const cardRow = el("card-row");
  const cardStatus = el("card-status");
  const btnMintCard = el("btn-mint-card");

  const goAchievementsEarned = el("go-achievements-earned");
  const goAchievementsList = el("go-achievements-list");
  const goOnchain = el("go-onchain");
  const goOnchainStatus = el("go-onchain-status");
  const btnRetrySave = el("btn-retry-save");
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
  const hudWeaponName = el("hud-weapon-name");
  const hudWeaponEl = el("hud-weapon");
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
    showMenuError(I18N.t("err.file_protocol_initial"));
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

  let priceText = I18N.t("price.current_default");
  if (!testMode) {
    try {
      const priceWei = await R3Wallet.getPlayPrice();
      // Si el owner puso el precio en 0 (juego gratis, solo gas), se
      // muestra "Gratis" en vez del feo "0.0 MON".
      priceText = priceWei === 0n ? I18N.t("price.free") : `${ethers.formatEther(priceWei)} MON`;
    } catch (err) {
      console.warn("No se pudo leer playPrice() todavía:", err);
    }
  }
  priceDisplay.textContent = testMode ? I18N.t("price.test_mode") : priceText;
  btnPlay.textContent = testMode ? I18N.t("btn.play_test") : I18N.t("btn.play_priced", { price: priceText });
  btnPlayAgain.textContent = testMode ? I18N.t("btn.play_again_test") : I18N.t("btn.play_again_priced", { price: priceText });
  btnPlay.disabled = false;

  // Aclaración explícita del costo real — pedido explícito: "decir que
  // no vale nada y que solo cobra las fees del minteo". playPrice() en
  // el contrato ya decide si de verdad cobra algo o no; este texto solo
  // lo explica en criollo para que no quede duda de qué es cada cosa.
  const feeNote = el("fee-note");
  if (testMode) {
    feeNote.textContent = I18N.t("feenote.test_mode");
  } else if (priceText === I18N.t("price.free")) {
    feeNote.innerHTML = I18N.t("feenote.free");
  } else {
    feeNote.innerHTML = I18N.t("feenote.priced", { price: priceText });
  }

  if (testMode) {
    btnConnect.hidden = true;
    walletStatus.textContent = I18N.t("wallet.test_mode_status");
    showMenuError(I18N.t("err.test_mode_warning"));
  }

  // ---------------------------------------------------------------
  // Ranking global y logros on-chain (ver contracts/R3Apocalipsis.sol).
  // Todo esto es SOLO un extra sobre lo anterior: en modo prueba, o sin
  // wallet conectada, simplemente no se muestra nada de esto.
  // ---------------------------------------------------------------
  async function refreshAliasUI(addr) {
    if (testMode || !addr) {
      aliasRow.hidden = true;
      cardRow.hidden = true;
      return;
    }
    aliasRow.hidden = false;
    try {
      currentAlias = (await R3Wallet.getPlayerAlias(addr)) || "";
    } catch (err) {
      console.warn("No se pudo leer el alias on-chain:", err);
      currentAlias = "";
    }
    aliasCurrent.textContent = currentAlias ? I18N.t("alias.current", { alias: currentAlias }) : I18N.t("alias.none_yet_dynamic");
    aliasInput.value = currentAlias;
    await refreshCardUI(addr);
  }

  async function refreshCardUI(addr) {
    if (testMode || !addr) {
      cardRow.hidden = true;
      return;
    }
    cardRow.hidden = false;
    try {
      const owns = await R3Wallet.hasCard(addr);
      cardStatus.textContent = owns ? I18N.t("card.has") : I18N.t("card.none_yet");
      btnMintCard.hidden = owns;
    } catch (err) {
      console.warn("No se pudo leer hasCard() on-chain:", err);
    }
  }

  /** Muestra un aviso especial la primera vez que un tx mintea la tarjeta
   * (llamado tras setAlias/recordMatch/mintCard). */
  function announceCardIfMinted(receipt) {
    if (R3Wallet.wasCardMinted(receipt)) {
      toast(I18N.t("toast.card_minted"), 5200);
      const addr = R3Wallet.getAddress();
      if (addr) refreshCardUI(addr);
    }
  }

  btnMintCard.addEventListener("click", async () => {
    R3Audio.uiClick();
    const addr = R3Wallet.getAddress();
    if (!addr) {
      showMenuError(I18N.t("err.connect_wallet_first"));
      return;
    }
    btnMintCard.disabled = true;
    toast(I18N.t("toast.confirm_tx"), 6000);
    try {
      const receipt = await R3Wallet.mintCard();
      announceCardIfMinted(receipt);
      await refreshCardUI(addr);
    } catch (err) {
      console.error(err);
      const msg = /user rejected|denied/i.test(err.message || "") ? I18N.t("err.tx_cancelled") : err.message || I18N.t("err.mint_card_failed");
      showMenuError(msg);
    } finally {
      btnMintCard.disabled = false;
    }
  });

  btnSaveAlias.addEventListener("click", async () => {
    R3Audio.uiClick();
    const value = aliasInput.value.trim();
    if (!value) {
      showMenuError(I18N.t("err.alias_empty"));
      return;
    }
    const addr = R3Wallet.getAddress();
    if (!addr) {
      showMenuError(I18N.t("err.connect_wallet_first"));
      return;
    }
    btnSaveAlias.disabled = true;
    toast(I18N.t("toast.confirm_tx"), 6000);
    try {
      const receipt = await R3Wallet.setPlayerAlias(value);
      currentAlias = value;
      aliasCurrent.textContent = I18N.t("alias.current", { alias: value });
      toast(I18N.t("toast.alias_saved"), 2600);
      announceCardIfMinted(receipt);
    } catch (err) {
      console.error(err);
      const msg = /user rejected|denied/i.test(err.message || "") ? I18N.t("err.tx_cancelled") : err.message || I18N.t("err.alias_save_failed");
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
        if (!def) return "";
        const name = R3AchievementDefs.name(def);
        const desc = R3AchievementDefs.desc(def);
        return `<li title="${desc}">🎖️ ${name}</li>`;
      })
      .join("");
  }

  // ---------------------------------------------------------------
  // Guardado on-chain AUTOMÁTICO al terminar la partida — puntaje, logros
  // nuevos y qué r3tards se cazaron, TODO junto en una sola transacción
  // (recordMatch(), ver wallet.js/contracts/R3Apocalipsis.sol). Antes
  // esto requería apretar dos botones aparte; ahora se dispara solo, apenas
  // se llega al game over (si ya hay wallet conectada) o justo después de
  // conectar desde esta misma pantalla. Si el guardado automático falla
  // (la wallet lo rechaza, no hay gas, se cae la red…) se deja un botón de
  // "Reintentar" a la vista — el jugador nunca se queda sin forma de
  // guardar su progreso solo porque la wallet le mostró el popup en mal
  // momento.
  // ---------------------------------------------------------------
  let autoSaveInFlight = false;

  /** Decide qué mostrar/hacer en la sección on-chain del game over, y
   * dispara el guardado automático si corresponde. */
  async function autoSaveProgress() {
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
    btnRetrySave.hidden = true;

    const earnedIds = lastGameOverSummary ? computeEarnedAchievementIds(lastGameOverSummary, addr) : [];
    renderGameOverAchievements(earnedIds);

    const mask = await ensureAchievementsMask(addr);
    lastNewAchievementIds = earnedIds.filter((id) => (mask & (1n << BigInt(id))) === 0n);

    const score = lastGameOverSummary ? lastGameOverSummary.score : 0;
    const killedTokens = ((lastGameOverSummary && lastGameOverSummary.killedTokens) || []).map((k) => ({
      tokenId: k.tokenId,
      tierCode: CFG.TIER_CHAIN_CODE[k.tierKey] ?? 0,
    }));

    // Nada que intentar guardar (por ejemplo, una muerte instantánea sin
    // puntos ni r3tards cazados): no molestamos con un popup de wallet
    // para nada, dejamos el estado limpio y listo.
    if (score <= 0 && lastNewAchievementIds.length === 0 && killedTokens.length === 0) {
      goOnchainStatus.textContent = I18N.t("toast.nothing_to_save");
      return;
    }

    await attemptSave(score, lastNewAchievementIds, killedTokens);
  }

  /** Dispara la transacción recordMatch() de verdad (llamada sola al
   * terminar la partida, y de nuevo si el jugador aprieta "Reintentar"). */
  async function attemptSave(score, newAchievementIds, killedTokens) {
    if (autoSaveInFlight) return;
    autoSaveInFlight = true;
    btnRetrySave.hidden = true;
    btnRetrySave.disabled = true;
    goOnchainStatus.textContent = I18N.t("toast.autosaving");
    try {
      const receipt = await R3Wallet.recordMatch(score, newAchievementIds, killedTokens);
      achievementsMaskCache = null; // se relee fresco la próxima vez que haga falta
      lastNewAchievementIds = [];
      goOnchainStatus.textContent = I18N.t("toast.progress_saved");
      announceCardIfMinted(receipt);
    } catch (err) {
      console.error(err);
      const msg = /user rejected|denied/i.test(err.message || "")
        ? I18N.t("err.tx_cancelled")
        : /nada nuevo/i.test(err.message || "")
        ? I18N.t("toast.nothing_to_save")
        : err.message || I18N.t("err.progress_save_failed");
      goOnchainStatus.textContent = msg;
      // "Nada nuevo que guardar" no es un error de verdad (puede pasar si
      // jugaste de nuevo con un puntaje peor y ya habías cazado todos esos
      // mismos r3tards antes) — en ESE caso puntual no tiene sentido
      // ofrecer "reintentar" (volvería a pasar lo mismo).
      if (!/nada nuevo/i.test(err.message || "")) {
        btnRetrySave.hidden = false;
      }
    } finally {
      autoSaveInFlight = false;
      btnRetrySave.disabled = false;
    }
  }

  btnRetrySave.addEventListener("click", () => {
    R3Audio.uiClick();
    if (!lastGameOverSummary) return;
    const addr = R3Wallet.getAddress && R3Wallet.getAddress();
    if (!addr) return;
    const killedTokens = ((lastGameOverSummary.killedTokens) || []).map((k) => ({
      tokenId: k.tokenId,
      tierCode: CFG.TIER_CHAIN_CODE[k.tierKey] ?? 0,
    }));
    attemptSave(lastGameOverSummary.score, lastNewAchievementIds, killedTokens);
  });

  btnConnectGameover.addEventListener("click", async () => {
    R3Audio.uiClick();
    btnConnectGameover.disabled = true;
    try {
      const addr = await R3Wallet.connect();
      walletStatus.textContent = I18N.t("wallet.connected", { addr: R3Wallet.shortAddress(addr) });
      achievementsMaskCache = null;
      await Promise.all([refreshAliasUI(addr), autoSaveProgress()]);
    } catch (err) {
      console.error(err);
      goOnchainStatus.textContent = err.message || I18N.t("err.wallet_connect_failed");
    } finally {
      btnConnectGameover.disabled = false;
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
        const label = phase === "metadata" ? I18N.t("progress.resolving_images") : phase === "uri" ? I18N.t("progress.reading_chain") : I18N.t("progress.loading_collection");
        progressLabel.textContent = I18N.t("progress.line", { label, loaded, total });
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
        progressLabel.textContent = I18N.t("progress.prefetch_start", { total: loadedCollection.length });
        progressBar.style.width = "0%";
        const QUICK_START_MS = 3500;
        const prefetchPromise = R3Game.prefetchImages(loadedCollection, (done, total) => {
          progressBar.style.width = Math.round((done / total) * 100) + "%";
          progressLabel.textContent = I18N.t("progress.prefetching", { done, total });
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
      progressLabel.textContent = I18N.t("progress.ready", { count: collection.length });
      progressBar.style.width = "100%";
      setTimeout(() => (progressWrap.hidden = true), 1400);
      return collection;
    } catch (err) {
      console.error(err);
      progressLabel.textContent = I18N.t("progress.load_failed_label");
      // Si estamos en file://, el error real (típicamente algo de RPC/red)
      // es solo un síntoma confuso — mostramos la explicación clara en vez
      // de dejar que el mensaje genérico de más abajo la tape.
      if (window.location.protocol === "file:") {
        showMenuError(I18N.t("err.file_protocol_catch"));
      } else {
        showMenuError((err && err.message) || I18N.t("err.collection_read_failed_fallback"));
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
    ensureCollectionLoaded().then(fillShowcase);
  });
  ensureCollectionLoaded().then(fillShowcase);

  // ---------------------------------------------------------------
  // Vitrina de piezas reales en el menú — pedido explícito: "con imagen
  // de r3tards", "más interactivo". Nada de arte de relleno: son piezas
  // reales de la colección ya cargada, elegidas al azar. Cada tanto (con
  // el menú a la vista) se cambia UNA al azar por otra, para que se
  // sienta vivo sin marear con demasiado movimiento a la vez.
  const showcaseImgs = Array.from(document.querySelectorAll(".showcase-img"));
  function setShowcaseSlot(imgEl, item) {
    if (!item || !item.image) return;
    imgEl.classList.remove("loaded");
    const probe = new Image();
    probe.onload = () => {
      imgEl.src = item.image;
      imgEl.classList.add("loaded");
    };
    probe.onerror = () => {}; // si esa imagen puntual falla, se queda con la anterior — nunca un ícono roto
    probe.src = item.image;
  }
  function fillShowcase(coll) {
    if (!coll || !coll.length || showcaseImgs.length === 0) return;
    const pool = [...coll].sort(() => Math.random() - 0.5);
    showcaseImgs.forEach((imgEl, i) => setShowcaseSlot(imgEl, pool[i % pool.length]));
    if (!fillShowcase._rotating) {
      fillShowcase._rotating = true;
      setInterval(() => {
        if (!collection || !screens.menu.classList.contains("active")) return;
        const slot = showcaseImgs[(Math.random() * showcaseImgs.length) | 0];
        const item = collection[(Math.random() * collection.length) | 0];
        setShowcaseSlot(slot, item);
      }, 4000);
    }
  }

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
      walletStatus.textContent = I18N.t("wallet.connected", { addr: R3Wallet.shortAddress(addr) });
      achievementsMaskCache = null;
      await refreshAliasUI(addr);
    } catch (err) {
      console.error(err);
      showMenuError(err.message || I18N.t("err.wallet_connect_failed"));
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
      showMenuError(I18N.t("err.wait_for_collection"));
      return;
    }

    if (testMode) {
      toast(I18N.t("toast.test_mode_play"), 2000);
      showScreen("game");
      R3Game.start(coll);
      return;
    }

    if (!R3Wallet.getAddress()) {
      showMenuError(I18N.t("err.connect_wallet_first"));
      return;
    }

    triggerBtn.disabled = true;
    toast(I18N.t("toast.confirm_payment"), 6000);
    try {
      await R3Wallet.payToPlay();
      R3Audio.coinPay();
      toast(I18N.t("toast.payment_confirmed"), 2200);
      showScreen("game");
      R3Game.start(coll);
    } catch (err) {
      console.error(err);
      const msg = /user rejected|denied/i.test(err.message || "")
        ? I18N.t("err.tx_cancelled")
        : err.message || I18N.t("err.payment_failed");
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
  // Silenciar/activar la música de fondo — se recuerda entre partidas
  // (ver MUSIC_MUTE_KEY en audio.js), para que "no sea molesto" sea
  // una decisión del jugador, no solo del volumen que le pusimos.
  // ---------------------------------------------------------------
  const btnMuteMusic = el("btn-mute-music");
  function refreshMuteBtn() {
    const muted = R3Audio.isMusicMuted();
    btnMuteMusic.textContent = muted ? I18N.t("hud.mute_off") : I18N.t("hud.mute_on");
    btnMuteMusic.classList.toggle("muted", muted);
  }
  refreshMuteBtn();
  btnMuteMusic.addEventListener("click", () => {
    R3Audio.setMusicMuted(!R3Audio.isMusicMuted());
    refreshMuteBtn();
  });

  // ---------------------------------------------------------------
  // Motor del juego: callbacks de UI
  // ---------------------------------------------------------------
  R3Game.init(el("game-canvas"), {
    onScoreChange: (score) => {
      hudScore.textContent = I18N.formatScore(score);
    },
    onLivesChange: (lives) => {
      // Cada vida es el logo de Monad (web/assets/monad-logo.png) — las
      // que ya perdiste se muestran apagadas/en gris en vez de
      // desaparecer, así siempre se ve cuántas vidas máximas hay
      // (CFG.MAX_LIVES). Matar un raro/épico/legendario puede dar vidas
      // "a medias" (ej. +1.5 por un épico), así que una vida a medio
      // llenar se dibuja como medio logo encendido sobre el apagado.
      let html = "";
      for (let i = 0; i < CFG.MAX_LIVES; i++) {
        const filled = i + 1 <= lives;
        const half = !filled && i < lives;
        if (half) {
          html +=
            `<span class="life-icon-wrap">` +
            `<img class="life-icon life-icon-lost" src="assets/monad-logo.png" alt="" />` +
            `<img class="life-icon life-icon-half-fill" src="assets/monad-logo.png" alt="${I18N.t("alt.half_life")}" />` +
            `</span>`;
        } else {
          html += `<img class="life-icon${filled ? "" : " life-icon-lost"}" src="assets/monad-logo.png" alt="${I18N.t("alt.life")}" />`;
        }
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
    onWeaponUnlock: (meta) => {
      // Además del banner (que se ve 2s y desaparece), el HUD deja el
      // nombre y el ícono del arma puestos todo el tiempo — así el
      // jugador siempre sabe qué trae equipado sin tener que recordarlo.
      hudWeaponName.textContent = meta.label[I18N.getLang()] || meta.label.es;
      const existingIcon = hudWeaponEl.querySelector(".hud-weapon-icon");
      if (existingIcon) existingIcon.remove();
      const icon = document.createElement("img");
      icon.className = "hud-weapon-icon";
      icon.src = `assets/weapons/w-${meta.imgKey}.png`;
      icon.alt = "";
      hudWeaponEl.prepend(icon);
      spawnWeaponBanner(meta);
    },
    onProgress: (killedCount, total) => {
      lastProgressText = `${killedCount}/${total}`;
      hudProgress.textContent = lastProgressText;
      if (killedCount === 0) {
        killLog.innerHTML = ""; // partida nueva: log limpio
        // Reset del indicador de arma: cada partida arranca sin arma
        // (a puños) hasta el primer épico/legendario muerto.
        hudWeaponName.textContent = I18N.t("weapon.fists");
        const existingIcon = hudWeaponEl.querySelector(".hud-weapon-icon");
        if (existingIcon) existingIcon.remove();
      }
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
      goTitle.textContent = summary.victory ? I18N.t("go.title_victory") : I18N.t("go.title_defeat");
      goTitle.classList.toggle("gameover-title-victory", !!summary.victory);
      goVictoryNote.hidden = !summary.victory;
      goScore.textContent = I18N.formatScore(summary.score);
      goCombo.textContent = summary.bestCombo;
      goWave.textContent = summary.wave;
      goProgress.textContent = lastProgressText;
      goBreakdown.innerHTML = "";
      Object.entries(summary.killsByTier).forEach(([tier, count]) => {
        if (!count) return;
        const li = document.createElement("li");
        li.textContent = `${I18N.tierLabel(tier, { plural: true })}: ${count}`;
        goBreakdown.appendChild(li);
      });
      lastGameOverSummary = summary;
      autoSaveProgress();
      showScreen("gameover");
    },
  });

  // Log en vivo (transparente) de los r3tards que vas matando, más
  // reciente arriba. Se limita a las últimas líneas para no acumular
  // miles de nodos DOM en una partida larga. Pedido explícito: nada de
  // texto redundante (ni "r3tards", ni el nombre) — solo el número, la
  // rareza (con su propio color) y los puntos.
  const KILL_LOG_MAX = 14;
  function appendKillLog(info) {
    const line = document.createElement("div");
    line.className = "kill-log-line kill-log-" + info.tierKey;
    line.innerHTML = `#${info.tokenId} · <span class="kill-log-tier" style="color:${info.color}">${info.tierLabel}</span> · <span class="kill-log-pts">+${info.points}</span>`;
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
      ? (info.isCertified ? I18N.t("banner.legendary_named", { name: info.name.toUpperCase() }) : I18N.t("banner.legendary_detected"))
      : info.tierKey === "epic" ? I18N.t("banner.epic_sighted") : I18N.t("banner.rare_falling");
    const sub = info.isCertified ? I18N.t("banner.certified_piece") : I18N.t("banner.token_id", { id: info.tokenId });
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
    b.innerHTML = `${I18N.t("banner.damage_title", { mult })}<br><span style="font-size:0.6em">${I18N.t("banner.damage_sub", { mult })}</span>`;
    bannerLayer.appendChild(b);
    setTimeout(() => b.remove(), 2300);
  }

  // Se dispara al desbloquear un arma nueva (ver WEAPON_TIER_META en
  // game.js: épico → 1° legendario → 5° legendario → 10° legendario).
  function spawnWeaponBanner(meta) {
    R3Audio.waveUp();
    const b = document.createElement("div");
    b.className = "rare-banner";
    b.style.color = "#8f7bff";
    const weaponLabel = ((meta.label[I18N.getLang()] || meta.label.es) || "").toLocaleUpperCase();
    b.innerHTML = `${I18N.t("banner.weapon_title", { label: weaponLabel })}<br><span style="font-size:0.6em">${I18N.t("banner.weapon_sub", { burst: meta.burst })}</span>`;
    bannerLayer.appendChild(b);
    setTimeout(() => b.remove(), 2300);
  }
})();
