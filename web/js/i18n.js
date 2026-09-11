/**
 * ============================================================
 *  R3 APOCALIPSIS — Internacionalización (i18n): Español / English
 * ============================================================
 *  QUÉ HACE ESTE ARCHIVO Y POR QUÉ EXISTE:
 *  Hasta ahora el juego entero estaba escrito a mano en español — todos
 *  los textos, avisos, logros y hasta las frases de humor de los
 *  r3tards estaban "quemados" directamente en el HTML y en el código.
 *  Eso significa que un jugador que se conecta desde, por ejemplo,
 *  Estados Unidos, Francia o Japón (donde el navegador está configurado
 *  en inglés, francés o japonés) igual veía TODO en español — no porque
 *  quisiéramos forzarlo, sino porque no existía ninguna otra opción.
 *
 *  Pedido explícito del dueño del juego: "revisa que sirva para cada
 *  idioma según donde esté conectado, no vaya a ser que para todos esté
 *  en español". Es decir: cada jugador debería ver el juego en SU propio
 *  idioma automáticamente, sin tener que hacer nada — y como hoy en día
 *  casi todo internet funciona en inglés, la regla que se sigue aquí es:
 *
 *    - Si el navegador del jugador está en español (de España, México,
 *      Argentina, cualquier variante "es-*"), se le muestra en ESPAÑOL.
 *    - Para CUALQUIER OTRO idioma del mundo (inglés, francés, portugués,
 *      chino, alemán, lo que sea), se le muestra en INGLÉS — no en
 *      español. Inglés es el idioma "de respaldo" para todo el que no
 *      hable español, no al revés.
 *
 *  Esto se decide leyendo navigator.language (el idioma que el propio
 *  navegador del visitante ya le reporta a cualquier página web — no
 *  hace falta preguntarle nada ni adivinar por su ubicación/IP).
 *
 *  Como ninguna detección automática es 100% infalible (alguien puede
 *  tener el navegador en un idioma que no es el que en realidad prefiere
 *  para jugar, o simplemente quiere probar el otro idioma), se agregó
 *  además un botoncito discreto (🌐 ES / 🌐 EN) en cada pantalla para que
 *  cualquiera pueda cambiarlo a mano en cualquier momento — esa elección
 *  manual se recuerda en este navegador (localStorage) y desde ahí
 *  siempre gana sobre la detección automática.
 *
 *  CÓMO SE USA DESDE EL RESTO DEL CÓDIGO (HTML y JS):
 *  - En el HTML: cualquier elemento con data-i18n="alguna.clave" recibe
 *    automáticamente el texto traducido como su contenido, y cualquiera
 *    con data-i18n-attr="placeholder:alguna.clave" (se pueden separar
 *    varias claves con comas) recibe la traducción en ESE atributo en
 *    vez de en el texto visible. Esto lo aplica
 *    R3I18N.applyStaticTranslations(), llamado una vez al cargar cada
 *    página y de nuevo cada vez que alguien cambia de idioma a mano.
 *  - En el JS: en vez de escribir un texto en español directamente, se
 *    llama a R3I18N.t("alguna.clave") (o con variables:
 *    R3I18N.t("saludo", { nombre: "Ana" }) si el texto tiene un
 *    "{nombre}" adentro) y esa función devuelve el texto ya en el
 *    idioma que corresponda.
 *  - Para el nombre de una rareza (Común/Poco común/Raro/Épico/
 *    Legendario) SIEMPRE se usa R3I18N.tierLabel(clave, opciones) —
 *    antes había TRES listas de nombres de rareza repetidas y sueltas
 *    por el código (config.js, main.js, logros.html), cada una
 *    traducida aparte a mano y sin ninguna relación entre sí; ahora hay
 *    una sola, aquí, y todo el resto del código la usa en vez de
 *    inventar la suya.
 *  - Para mostrar un puntaje con separador de miles, se usa
 *    R3I18N.formatScore(numero) en vez de numero.toLocaleString("es") a
 *    mano — así el separador (1.000 vs 1,000) también respeta el idioma
 *    activo, no siempre el español.
 *
 *  Si una clave no existe en el idioma activo, se cae de respaldo al
 *  texto en español (el idioma "original" en el que se escribió todo
 *  este juego) — y si tampoco existe ahí, se devuelve la clave tal cual
 *  (nunca se rompe la página, nunca se muestra "undefined").
 *
 *  ORDEN DE CARGA (IMPORTANTE): este script debe ir en el <head>/<body>
 *  ANTES que cualquier otro script del juego (config.js, wallet.js,
 *  nft-loader.js, onchain-events.js, game.js, main.js, y los <script>
 *  propios de ranking.html/medallas.html/logros.html) — todos ellos ya
 *  llaman a R3I18N.t()/tierLabel()/getLang() desde el momento en que se
 *  cargan, así que si i18n.js llegara después, esas llamadas fallarían.
 * ============================================================
 */
(function () {
  const STORAGE_KEY = "r3_lang";

  // ---------------------------------------------------------------
  // Detección automática del idioma del visitante
  // ---------------------------------------------------------------
  /**
   * "es" si el navegador está en español (cualquier variante: es, es-ES,
   * es-MX, es-419, etc.) — "en" para TODO lo demás. Se usa
   * navigator.languages[0] cuando existe (la preferencia más específica
   * del usuario) y si no, navigator.language como respaldo.
   */
  function detect() {
    let lang = "";
    try {
      if (Array.isArray(navigator.languages) && navigator.languages.length > 0) {
        lang = navigator.languages[0] || "";
      } else {
        lang = navigator.language || "";
      }
    } catch {
      lang = "";
    }
    return String(lang).toLowerCase().startsWith("es") ? "es" : "en";
  }

  function readOverride() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === "es" || stored === "en" ? stored : null;
    } catch {
      return null; // localStorage bloqueado/deshabilitado: seguimos solo con detección automática
    }
  }

  // Idioma activo, resuelto una vez al cargar y cacheado aquí — getLang()
  // no vuelve a leer localStorage/navigator en cada llamada (se llama
  // MUCHÍSIMAS veces por segundo dentro del loop del juego).
  let currentLang = readOverride() || detect();

  function getLang() {
    return currentLang;
  }

  function setLang(lang) {
    if (lang !== "es" && lang !== "en") return;
    currentLang = lang;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // no es crítico: el idioma elegido sigue activo esta sesión, solo
      // no se recuerda entre visitas si localStorage está bloqueado.
    }
    document.documentElement.lang = lang;
    applyStaticTranslations();
    refreshLangToggles();
    window.dispatchEvent(new CustomEvent("r3langchange", { detail: { lang } }));
  }

  // Se marca en <html lang="..."> desde ya (no hace falta esperar a
  // DOMContentLoaded para esto: document.documentElement ya existe
  // apenas el navegador empieza a parsear el <head>).
  document.documentElement.lang = currentLang;

  // ---------------------------------------------------------------
  // Diccionario — español es la referencia (el idioma "original" en el
  // que se escribió todo el juego); inglés es la traducción nueva.
  // Las claves son strings con puntos (ej. "menu.subtitle_pre") — no hay
  // anidamiento real de objetos, es más simple así de mantener y de
  // buscar (DICT[idioma][clave] directo, sin recorrer nada).
  // ---------------------------------------------------------------
  const DICT = {
    es: {
      // ---- Menú principal (index.html) ----
      "menu.subtitle_pre": "Los ",
      "menu.subtitle_strong": "r3tards",
      "menu.subtitle_post": " de Monad están cayendo. Dispárales antes de que lleguen al suelo.",
      "stat.collection_label": "Colección",
      "stat.network_label": "Red",
      "stat.cost_label": "Costo",
      "progress.loading_collection_initial": "Cargando colección r3tards desde Monad…",
      "wallet.connect_btn": "🔌 Conectar wallet",
      "wallet.not_connected": "No conectado",
      "wallet.connected": "Conectado: {addr}",
      "alias.none_yet_static": "Sin alias todavía",
      "alias.none_yet_dynamic": "Todavía no tienes alias",
      "alias.current": 'Alias actual: "{alias}"',
      "alias.placeholder": "Tu alias (máx. 20)",
      "btn.save_alias": "💾 Guardar alias",
      "card.none_yet": "Todavía no tienes tu tarjeta",
      "card.has": "🪪 Ya tienes tu tarjeta de jugador (NFT)",
      "btn.mint_card": "🪪 Mintear mi tarjeta (gratis)",
      "howto.summary": "¿Cómo se juega?",
      "howto.step1": "Conecta tu wallet (necesitas MON en Monad Mainnet).",
      "howto.step2": "Confirma la transacción para jugar: es gratis, no es un pago — solo confirmas en tu wallet el gas normal de la red Monad (una sola transacción, sin permisos raros).",
      "howto.step3": "Toca o haz clic para disparar el orbe de Monad hacia los NFTs que caen.",
      "howto.step4": "Entre más raro es el NFT, más grande, más resistente y más puntos vale. Si llega al suelo, pierdes una vida.",
      "footer.payment_note": "Contrato de pago verificable on-chain · Colección real de",
      "footer.opensea_link": "r3tardsnft en OpenSea",
      "footer.my_achievements": "🏆 Ver mis logros",
      "footer.ranking": "🥇 Ranking global",
      "footer.medals": "🎖️ Medallas",
      "footer.collection": "📖 Colección",
      "btn.retry_collection": "🔄 Reintentar carga de la colección",

      // ---- HUD (pantalla de juego) ----
      "hud.score_label": "Puntaje:",
      "hud.wave_label": "Oleada",
      "hud.difficulty_title": "Sube un escalón cada minuto de partida",
      "hud.difficulty_label": "Dificultad",
      "hud.progress_label": "r3tards distintos:",
      "hud.mute_title": "Silenciar/activar la música de fondo",
      "hud.mute_on": "🔊 Música",
      "hud.mute_off": "🔇 Música",
      "hud.lives_title": "Vidas",
      "hud.weapon_label": "Arma:",
      "weapon.fists": "puños",
      "alt.life": "vida",
      "alt.half_life": "media vida",

      // ---- Game over ----
      "go.title_victory": "¡COLECCIÓN COMPLETA!",
      "go.title_defeat": "FIN DEL APOCALIPSIS",
      "go.victory_note": "🏆 ¡Mataste los 1033 r3tards distintos! Colección completa.",
      "go.score_label": "Puntaje final:",
      "go.best_combo_label": "Mejor combo:",
      "go.wave_reached_label": "Oleada alcanzada:",
      "go.distinct_label": "r3tards distintos:",
      "go.achievements_title": "🎖️ Logros conseguidos esta partida",
      "btn.retry_save": "🔁 Reintentar guardado",
      "go.connect_hint": "Conecta tu wallet para guardar automáticamente este puntaje, tus logros y los r3tards que cazaste.",
      "btn.play_again_test": "🧪 Probar de nuevo",
      "btn.play_again_priced": "🔁 Jugar de nuevo ({price})",
      "btn.back_menu": "Menú",

      // ---- Precio / modo prueba ----
      "price.current_default": "Precio actual",
      "price.free": "Gratis",
      "price.test_mode": "Modo prueba",
      "btn.play_test": "🧪 Probar gratis (colección real)",
      "btn.play_priced": "🎮 Jugar ({price})",
      "feenote.test_mode": "🧪 Modo prueba: no hay wallet ni cobro de ningún tipo todavía.",
      "feenote.free": "Jugar es <strong>100% gratis</strong> — esto no es un pago ni un cobro nuestro. Lo único que gastas es el gas normal de la red Monad (por ejemplo, al mintear automáticamente tu tarjeta de jugador la primera vez), que es la comisión propia de la blockchain por procesar la transacción, no algo que nosotros cobremos.",
      "feenote.priced": "Pagas <strong>{price}</strong> por partida (va directo al contrato, verificable on-chain) más el gas normal de la red Monad — nada oculto, nada de suscripciones.",
      "wallet.test_mode_status": "Modo prueba: colección real de r3tards, sin wallet ni pago.",
      "err.test_mode_warning": '🧪 Estás en modo prueba: GAME_CONTRACT_ADDRESS todavía es el placeholder en js/config.js, así que "Probar gratis" carga la colección REAL de r3tards pero no cobra nada. Despliega tu contrato y pega su dirección ahí para activar el cobro real.',

      // ---- Avisos/errores del menú y del flujo de juego ----
      "err.file_protocol_initial": "⚠️ Estás abriendo este archivo directamente desde tu computadora (protocolo file://). Así el navegador bloquea la carga de la colección y de los fondos — no es un error del juego. Pruébalo siempre desde el link real de GitHub Pages (o un servidor local), nunca abriendo index.html con doble clic.",
      "err.file_protocol_catch": "⚠️ Estás abriendo este archivo directamente desde tu computadora (protocolo file://). Bajo file:// el navegador bloquea la carga rápida de la colección Y no siempre puede completar el respaldo on-chain tampoco. Esto NO es un error del juego — pruébalo desde el link real de GitHub Pages (o un servidor local), nunca abriendo index.html con doble clic.",
      "err.collection_read_failed_fallback": "No se pudo leer la colección r3tards. Revisa tu conexión e intenta de nuevo.",
      "err.wait_for_collection": "Espera a que cargue la colección antes de jugar.",
      "err.connect_wallet_first": "Conecta tu wallet primero.",
      "err.alias_empty": "Escribe un alias antes de guardarlo.",
      "err.tx_cancelled": "Cancelaste la transacción.",
      "err.mint_card_failed": "No se pudo mintear la tarjeta.",
      "err.alias_save_failed": "No se pudo guardar el alias.",
      "err.wallet_connect_failed": "No se pudo conectar la wallet.",
      "err.progress_save_failed": "No se pudo guardar tu progreso. Podés reintentarlo.",
      "err.payment_failed": "No se pudo procesar el pago.",

      "toast.confirm_tx": "Confirma la transacción en tu wallet…",
      "toast.confirm_payment": "Confirma el pago en tu wallet…",
      "toast.payment_confirmed": "¡Pago confirmado! Que empiece el apocalipsis.",
      "toast.test_mode_play": "Modo prueba: sin pago, colección real de r3tards.",
      "toast.card_minted": "🪪 ¡Conseguiste tu Tarjeta de Jugador (NFT)! Se actualiza sola con tu progreso — no se puede vender ni transferir.",
      "toast.alias_saved": "¡Alias guardado! Ya aparece así en el ranking.",
      "toast.autosaving": "Guardando tu progreso on-chain (puntaje, logros y r3tards cazados)…",
      "toast.progress_saved": "✅ ¡Progreso guardado! Puntaje, logros y r3tards cazados quedaron on-chain.",
      "toast.nothing_to_save": "Nada nuevo que guardar esta vez (ya tenías todo esto guardado).",

      // ---- Barra de progreso de carga de la colección ----
      "progress.reading_chain": "Leyendo la colección on-chain",
      "progress.resolving_images": "Resolviendo imágenes y nombres",
      "progress.loading_collection": "Cargando colección r3tards",
      "progress.line": "{label}… {loaded}/{total}",
      "progress.prefetch_start": "Colección lista. Precargando imágenes… 0/{total}",
      "progress.prefetching": "Precargando imágenes… {done}/{total}",
      "progress.ready": "Colección lista: {count} r3tards cargados ✅",
      "progress.load_failed_label": "No se pudo cargar la colección.",

      // ---- Banners/avisos grandes dentro de la partida ----
      "banner.legendary_named": '¡LEGENDARIO "{name}"!',
      "banner.legendary_detected": "¡LEGENDARIO DETECTADO!",
      "banner.epic_sighted": "¡ÉPICO A LA VISTA!",
      "banner.rare_falling": "¡RARO CAYENDO!",
      "banner.certified_piece": "Pieza 1/1 · Certified",
      "banner.token_id": "r3tards #{id}",
      "banner.damage_title": "¡DAÑO x{mult} DESBLOQUEADO!",
      "banner.damage_sub": "Tus disparos ahora hacen {mult}x de daño",
      "banner.weapon_title": "¡NUEVA ARMA: {label}!",
      "banner.weapon_sub": "Ráfaga x{burst} — {burst} logos de Monad por disparo",
      "float.hit": "¡TE DIERON!",
      "float.life_max": "¡VIDA AL MÁXIMO!",
      "float.life_gained": "+{n} {unit}",
      "unit.life": "vida",
      "unit.lives": "vidas",

      // ---- Nombres de rareza (ver R3I18N.tierLabel) ----
      "tier.common": "Común",
      "tier.uncommon": "Poco común",
      "tier.rare": "Raro",
      "tier.epic": "Épico",
      "tier.legendary": "Legendario",
      "tier.common.plural": "Comunes",
      "tier.uncommon.plural": "Poco comunes",
      "tier.rare.plural": "Raros",
      "tier.epic.plural": "Épicos",
      "tier.legendary.plural": "Legendarios",

      // ---- Nombres de armas (ver WEAPON_TIER_META en game.js) ----
      "weapon.pistol": "Pistola",
      "weapon.revolver": "Revólver",
      "weapon.smg": "Subfusil",
      "weapon.rifle": "Rifle",

      // ---- ranking.html / medallas.html / logros.html: títulos ----
      "title.ranking_word1": "Ranking",
      "title.ranking_word2": "Global",
      "title.medals": "Medallas",
      "title.my": "Mis",
      "title.achievements": "Logros",
      "nav.back_to_game": "🎮 Volver al juego",
      "nav.ranking": "🥇 Ranking",
      "nav.medals": "🎖️ Medallas",
      "nav.my_kills": "🏆 Mis logros",
      "nav.collection": "📖 Colección",
      "table.player": "Jugador",
      "table.score": "Puntaje",
      "table.achievements_col": "Logros",

      // ---- ranking.html ----
      "ranking.subtitle_pre": "Los mejores puntajes de ",
      "ranking.subtitle_strong": "todos los jugadores",
      "ranking.subtitle_mid": ", leídos directo de la cadena (evento ",
      "ranking.subtitle_code": "ScoreSubmitted",
      "ranking.subtitle_post": " del contrato) — cualquiera que abra este link ve el mismo ranking, no depende de este navegador ni de este dispositivo.",
      "ranking.progress_initial": "Leyendo puntajes on-chain…",
      "onchain.reading_scores": "Leyendo puntajes on-chain…",
      "onchain.reading_aliases": "Leyendo alias on-chain…",
      "ranking.empty": "Todavía nadie ha guardado un puntaje en el ranking. ¡Sé el primero desde el juego!",
      "err.ranking_contract_not_configured": "El contrato del juego todavía no está configurado (GAME_CONTRACT_ADDRESS en js/config.js sigue siendo el placeholder), así que todavía no hay ranking que mostrar.",
      "err.ranking_read_failed": "No se pudo leer el ranking on-chain.",

      // ---- medallas.html ----
      "medals.subtitle_pre": "Logros guardados on-chain (evento ",
      "medals.subtitle_code": "AchievementUnlocked",
      "medals.subtitle_post": " del contrato) — una vez guardados, quedan permanentes y visibles para cualquiera, aunque cambies de navegador o de computadora.",
      "medals.connect_hint": "Conecta tu wallet para ver cuáles ya tienes.",
      "medals.unlocked_count": "{count}/{total} logros desbloqueados con esta wallet.",
      "medals.scope_lifetime": "Acumulado",
      "medals.scope_session": "Una partida",
      "medals.unlocked_on": "Desbloqueado {date}",
      "medals.reading_achievements": "Leyendo logros on-chain…",
      "medals.empty": "Todavía nadie ha guardado un logro on-chain.",
      "err.medals_contract_not_configured": "El contrato del juego todavía no está configurado (GAME_CONTRACT_ADDRESS en js/config.js sigue siendo el placeholder), así que todavía no hay logros on-chain que mostrar.",
      "err.my_medals_read_failed": "No se pudieron leer tus logros on-chain.",
      "err.medals_ranking_read_failed": "No se pudo leer el top de logros on-chain.",
      "medals.mine_title": "Tus medallas",
      "medals.top_title": "🏆 Top por cantidad de logros",

      // ---- logros.html ----
      "logros.subtitle_pre": "Conecta la misma wallet con la que jugaste para ver qué r3tards has matado. Esta lista vive ",
      "logros.subtitle_strong": "solo en este navegador",
      "logros.subtitle_post": " — no es on-chain, así que no la vas a ver si cambias de computadora, de navegador, o borras los datos del sitio.",
      "logros.empty": "Todavía no has matado ningún r3tard con esta wallet en este navegador. ¡Ve a jugar!",
      "stat.distinct_r3tards": "r3tards distintos",
      "stat.total_kills": "Kills totales",

      // ---- coleccion.html ----
      "title.collection_word1": "Colección",
      "title.collection_word2": "R3tards",
      "collection.subtitle_pre": "Conecta la misma wallet con la que jugaste — vas a ver, de los ",
      "collection.subtitle_strong": "1033 r3tards",
      "collection.subtitle_mid": " de la colección, a ",
      "collection.subtitle_you": "todo color",
      "collection.subtitle_post": " los que TÚ ya has matado, y en oscuro el resto. Es tu registro personal, guardado ",
      "collection.subtitle_local": "solo en este navegador",
      "collection.subtitle_end": " — igual que en \"Mis logros\", no viaja entre dispositivos.",
      "collection.loading_collection": "Cargando la colección…",
      "collection.summary_total": "r3tards en total",
      "collection.summary_dead": "Que ya mataste",
      "collection.summary_alive": "Que te faltan",
      "collection.filter_all": "Todos",
      "collection.status_dead": "💀 Ya lo mataste",
      "collection.status_alive": "🌑 Todavía no",
      "collection.empty_filter": "Ningún r3tard de esta rareza todavía (o el filtro no coincide con nada).",

      // ---- Logros (ver achievements-onchain.js) ----
      "achv.primera_sangre.name": "Primera Sangre",
      "achv.primera_sangre.desc": "Mata tu primer r3tard.",
      "achv.cazador_raros.name": "Cazador de Raros",
      "achv.cazador_raros.desc": "Mata tu primer r3tard RARO.",
      "achv.depredador_epico.name": "Depredador Épico",
      "achv.depredador_epico.desc": "Mata tu primer r3tard ÉPICO.",
      "achv.leyenda_personal.name": "Leyenda Personal",
      "achv.leyenda_personal.desc": "Mata tu primer r3tard LEGENDARIO.",
      "achv.certificado.name": "Certificado",
      "achv.certificado.desc": 'Mata uno de los 38 r3tards "Certified" (piezas 1/1 únicas).',
      "achv.racha_x10.name": "Racha x10",
      "achv.racha_x10.desc": "Llega a combo x10 en una sola partida.",
      "achv.maratonista.name": "Maratonista",
      "achv.maratonista.desc": "Sobrevive 10 minutos seguidos en una sola partida.",
      "achv.milesimo_punto.name": "Milésimo Punto",
      "achv.milesimo_punto.desc": "Llega a 1000 puntos o más en una sola partida.",
      "achv.multi_legendario.name": "Multi-Legendario",
      "achv.multi_legendario.desc": "Mata 3 r3tards legendarios en una sola partida.",
      "achv.cazador_leyendas.name": "Cazador de Leyendas",
      "achv.cazador_leyendas.desc": "Mata 10 r3tards legendarios en total (sumando todas tus partidas en este navegador).",
      "achv.coleccion_completa.name": "Colección Completa",
      "achv.coleccion_completa.desc": "Mata alguna vez a cada r3tards distinto de toda la colección (sumando todas tus partidas en este navegador).",

      // ---- Errores de wallet.js / nft-loader.js / onchain-events.js ----
      "err.no_wallet_detected": "No se detectó ninguna wallet (instala MetaMask u otra wallet compatible con Monad).",
      "err.no_account_authorized": "No se autorizó ninguna cuenta.",
      "err.no_wallet_short": "No se detectó ninguna wallet.",
      "err.contract_not_configured": "El contrato del juego todavía no está configurado. (Edita GAME_CONTRACT_ADDRESS en js/config.js después de desplegarlo.)",
      "err.timeout": "Tiempo agotado ({label})",
      "err.resolve_failed": "No se pudo resolver {uri}",
      "err.rpc_unreachable": "No se pudo conectar a ningún RPC de Monad ({detail}). Puede ser tu red/firewall bloqueando esos dominios, o que los RPC públicos estén saturados en este momento. Revisa la consola del navegador (F12) para más detalle, o intenta de nuevo en unos minutos.",
      "err.rpc_dropped_mid_load": "No se pudieron leer {count} tokens: los RPC de Monad dejaron de responder a mitad de la carga (probablemente saturados o caídos un momento). Intenta de nuevo en unos minutos.",
      "err.token_uri_failed": "El token #{id} existe pero tokenURI() no respondió correctamente.",
      "err.collection_incomplete_uri": "La colección está incompleta: {resolved} tokens resueltos, totalSupply() indica {total}.",
      "err.no_valid_token_uri": "Se pudo hablar con la cadena pero ningún token devolvió tokenURI() válido. Revisa que NFT_CONTRACT_ADDRESS en config.js sea el correcto.",
      "err.metadata_resolve_failed": "No se pudo resolver la metadata/imágenes de r3tards (posible bloqueo de red hacia los gateways IPFS). Inténtalo de nuevo.",
      "err.metadata_partial_failed": "No se pudo resolver la metadata de {count} tokens activos: {ids}",
      "err.metadata_incomplete": "La metadata está incompleta: {resolved}/{total} tokens.",
      "err.block_number_failed": "No se pudo consultar el número de bloque actual en ningún RPC.",
      "err.events_read_failed": "No se pudieron leer los eventos {event} ({detail}).",

      "lang.toggle_title": "Cambiar idioma / Change language",
    },
    en: {
      // ---- Main menu (index.html) ----
      "menu.subtitle_pre": "Monad's ",
      "menu.subtitle_strong": "r3tards",
      "menu.subtitle_post": " are falling. Shoot them down before they hit the ground.",
      "stat.collection_label": "Collection",
      "stat.network_label": "Network",
      "stat.cost_label": "Cost",
      "progress.loading_collection_initial": "Loading r3tards collection from Monad…",
      "wallet.connect_btn": "🔌 Connect wallet",
      "wallet.not_connected": "Not connected",
      "wallet.connected": "Connected: {addr}",
      "alias.none_yet_static": "No alias yet",
      "alias.none_yet_dynamic": "You don't have an alias yet",
      "alias.current": 'Current alias: "{alias}"',
      "alias.placeholder": "Your alias (max. 20)",
      "btn.save_alias": "💾 Save alias",
      "card.none_yet": "You don't have your card yet",
      "card.has": "🪪 You already have your Player Card (NFT)",
      "btn.mint_card": "🪪 Mint my card (free)",
      "howto.summary": "How do you play?",
      "howto.step1": "Connect your wallet (you need MON on Monad Mainnet).",
      "howto.step2": "Confirm the transaction to play: it's free, not a payment — you just confirm the normal Monad network gas in your wallet (one single transaction, no weird permissions).",
      "howto.step3": "Tap or click to shoot the Monad orb at the falling NFTs.",
      "howto.step4": "The rarer the NFT, the bigger, tougher, and worth more points it is. If it reaches the ground, you lose a life.",
      "footer.payment_note": "On-chain verifiable payment contract · Real collection from",
      "footer.opensea_link": "r3tardsnft on OpenSea",
      "footer.my_achievements": "🏆 View my achievements",
      "footer.ranking": "🥇 Global leaderboard",
      "footer.medals": "🎖️ Medals",
      "footer.collection": "📖 Collection",
      "btn.retry_collection": "🔄 Retry loading the collection",

      // ---- HUD (game screen) ----
      "hud.score_label": "Score:",
      "hud.wave_label": "Wave",
      "hud.difficulty_title": "Rises one step every minute of play",
      "hud.difficulty_label": "Difficulty",
      "hud.progress_label": "distinct r3tards:",
      "hud.mute_title": "Mute/unmute the background music",
      "hud.mute_on": "🔊 Music",
      "hud.mute_off": "🔇 Music",
      "hud.lives_title": "Lives",
      "hud.weapon_label": "Weapon:",
      "weapon.fists": "fists",
      "alt.life": "life",
      "alt.half_life": "half life",

      // ---- Game over ----
      "go.title_victory": "FULL COLLECTION!",
      "go.title_defeat": "END OF THE APOCALYPSE",
      "go.victory_note": "🏆 You killed all 1033 distinct r3tards! Full collection.",
      "go.score_label": "Final score:",
      "go.best_combo_label": "Best combo:",
      "go.wave_reached_label": "Wave reached:",
      "go.distinct_label": "distinct r3tards:",
      "go.achievements_title": "🎖️ Achievements earned this match",
      "btn.retry_save": "🔁 Retry save",
      "go.connect_hint": "Connect your wallet to automatically save this score, your achievements, and the r3tards you hunted.",
      "btn.play_again_test": "🧪 Try again",
      "btn.play_again_priced": "🔁 Play again ({price})",
      "btn.back_menu": "Menu",

      // ---- Price / test mode ----
      "price.current_default": "Current price",
      "price.free": "Free",
      "price.test_mode": "Test mode",
      "btn.play_test": "🧪 Try for free (real collection)",
      "btn.play_priced": "🎮 Play ({price})",
      "feenote.test_mode": "🧪 Test mode: there's no wallet or charge of any kind yet.",
      "feenote.free": "Playing is <strong>100% free</strong> — this isn't a payment or a charge from us. The only thing you spend is the normal Monad network gas (for example, when your player card mints automatically the first time), which is the blockchain's own fee for processing the transaction, not something we charge.",
      "feenote.priced": "You pay <strong>{price}</strong> per match (goes straight to the contract, verifiable on-chain) plus the normal Monad network gas — nothing hidden, no subscriptions.",
      "wallet.test_mode_status": "Test mode: real r3tards collection, no wallet or payment.",
      "err.test_mode_warning": '🧪 You\'re in test mode: GAME_CONTRACT_ADDRESS in js/config.js is still the placeholder, so "Try for free" loads the REAL r3tards collection but doesn\'t charge anything. Deploy your contract and paste its address there to turn on real charging.',

      // ---- Menu/gameplay warnings and errors ----
      "err.file_protocol_initial": "⚠️ You're opening this file directly from your computer (file:// protocol). Browsers block loading the collection and the backgrounds this way — this is not a bug in the game. Always try it from the real GitHub Pages link (or a local server), never by double-clicking index.html.",
      "err.file_protocol_catch": "⚠️ You're opening this file directly from your computer (file:// protocol). Under file://, the browser blocks the fast collection load AND can't always complete the on-chain fallback either. This is NOT a bug in the game — try it from the real GitHub Pages link (or a local server), never by double-clicking index.html.",
      "err.collection_read_failed_fallback": "Couldn't read the r3tards collection. Check your connection and try again.",
      "err.wait_for_collection": "Wait for the collection to load before playing.",
      "err.connect_wallet_first": "Connect your wallet first.",
      "err.alias_empty": "Type an alias before saving it.",
      "err.tx_cancelled": "You cancelled the transaction.",
      "err.mint_card_failed": "Couldn't mint the card.",
      "err.alias_save_failed": "Couldn't save the alias.",
      "err.wallet_connect_failed": "Couldn't connect the wallet.",
      "err.progress_save_failed": "Couldn't save your progress. You can retry it.",
      "err.payment_failed": "Couldn't process the payment.",

      "toast.confirm_tx": "Confirm the transaction in your wallet…",
      "toast.confirm_payment": "Confirm the payment in your wallet…",
      "toast.payment_confirmed": "Payment confirmed! Let the apocalypse begin.",
      "toast.test_mode_play": "Test mode: no payment, real r3tards collection.",
      "toast.card_minted": "🪪 You got your Player Card (NFT)! It updates itself with your progress — it can't be sold or transferred.",
      "toast.alias_saved": "Alias saved! It now shows up like that on the leaderboard.",
      "toast.autosaving": "Saving your progress on-chain (score, achievements, and hunted r3tards)…",
      "toast.progress_saved": "✅ Progress saved! Score, achievements, and hunted r3tards are now on-chain.",
      "toast.nothing_to_save": "Nothing new to save this time (you already had all of this saved).",

      // ---- Collection-loading progress bar ----
      "progress.reading_chain": "Reading the collection on-chain",
      "progress.resolving_images": "Resolving images and names",
      "progress.loading_collection": "Loading r3tards collection",
      "progress.line": "{label}… {loaded}/{total}",
      "progress.prefetch_start": "Collection ready. Preloading images… 0/{total}",
      "progress.prefetching": "Preloading images… {done}/{total}",
      "progress.ready": "Collection ready: {count} r3tards loaded ✅",
      "progress.load_failed_label": "Couldn't load the collection.",

      // ---- In-game banners/alerts ----
      "banner.legendary_named": 'LEGENDARY "{name}"!',
      "banner.legendary_detected": "LEGENDARY SPOTTED!",
      "banner.epic_sighted": "EPIC INCOMING!",
      "banner.rare_falling": "RARE DROPPING!",
      "banner.certified_piece": "1/1 Piece · Certified",
      "banner.token_id": "r3tards #{id}",
      "banner.damage_title": "DAMAGE x{mult} UNLOCKED!",
      "banner.damage_sub": "Your shots now deal {mult}x damage",
      "banner.weapon_title": "NEW WEAPON: {label}!",
      "banner.weapon_sub": "Burst x{burst} — {burst} Monad logos per shot",
      "float.hit": "YOU GOT HIT!",
      "float.life_max": "MAX LIFE!",
      "float.life_gained": "+{n} {unit}",
      "unit.life": "life",
      "unit.lives": "lives",

      // ---- Rarity/tier names (see R3I18N.tierLabel) ----
      "tier.common": "Common",
      "tier.uncommon": "Uncommon",
      "tier.rare": "Rare",
      "tier.epic": "Epic",
      "tier.legendary": "Legendary",
      "tier.common.plural": "Commons",
      "tier.uncommon.plural": "Uncommons",
      "tier.rare.plural": "Rares",
      "tier.epic.plural": "Epics",
      "tier.legendary.plural": "Legendaries",

      // ---- Weapon names (see WEAPON_TIER_META in game.js) ----
      "weapon.pistol": "Pistol",
      "weapon.revolver": "Revolver",
      "weapon.smg": "SMG",
      "weapon.rifle": "Rifle",

      // ---- ranking.html / medallas.html / logros.html titles ----
      "title.ranking_word1": "Global",
      "title.ranking_word2": "Leaderboard",
      "title.medals": "Medals",
      "title.my": "My",
      "title.achievements": "Achievements",
      "nav.back_to_game": "🎮 Back to game",
      "nav.ranking": "🥇 Leaderboard",
      "nav.medals": "🎖️ Medals",
      "nav.my_kills": "🏆 My achievements",
      "nav.collection": "📖 Collection",
      "table.player": "Player",
      "table.score": "Score",
      "table.achievements_col": "Achievements",

      // ---- ranking.html ----
      "ranking.subtitle_pre": "The best scores from ",
      "ranking.subtitle_strong": "all players",
      "ranking.subtitle_mid": ", read straight from the chain (the ",
      "ranking.subtitle_code": "ScoreSubmitted",
      "ranking.subtitle_post": " contract event) — anyone who opens this link sees the same leaderboard, no matter their browser or device.",
      "ranking.progress_initial": "Reading scores on-chain…",
      "onchain.reading_scores": "Reading scores on-chain…",
      "onchain.reading_aliases": "Reading aliases on-chain…",
      "ranking.empty": "Nobody has saved a score to the leaderboard yet. Be the first, straight from the game!",
      "err.ranking_contract_not_configured": "The game contract still isn't configured (GAME_CONTRACT_ADDRESS in js/config.js is still the placeholder), so there's no leaderboard to show yet.",
      "err.ranking_read_failed": "Couldn't read the leaderboard on-chain.",

      // ---- medallas.html ----
      "medals.subtitle_pre": "Achievements saved on-chain (the ",
      "medals.subtitle_code": "AchievementUnlocked",
      "medals.subtitle_post": " contract event) — once saved, they're permanent and visible to anyone, even if you switch browsers or computers.",
      "medals.connect_hint": "Connect your wallet to see which ones you already have.",
      "medals.unlocked_count": "{count}/{total} achievements unlocked with this wallet.",
      "medals.scope_lifetime": "Cumulative",
      "medals.scope_session": "One match",
      "medals.unlocked_on": "Unlocked {date}",
      "medals.reading_achievements": "Reading achievements on-chain…",
      "medals.empty": "Nobody has saved an achievement on-chain yet.",
      "err.medals_contract_not_configured": "The game contract still isn't configured (GAME_CONTRACT_ADDRESS in js/config.js is still the placeholder), so there are no on-chain achievements to show yet.",
      "err.my_medals_read_failed": "Couldn't read your achievements on-chain.",
      "err.medals_ranking_read_failed": "Couldn't read the achievements leaderboard on-chain.",
      "medals.mine_title": "Your medals",
      "medals.top_title": "🏆 Top by achievement count",

      // ---- logros.html ----
      "logros.subtitle_pre": "Connect the same wallet you played with to see which r3tards you've killed. This list lives ",
      "logros.subtitle_strong": "only in this browser",
      "logros.subtitle_post": " — it's not on-chain, so you won't see it if you switch computers, browsers, or clear this site's data.",
      "logros.empty": "You haven't killed any r3tard with this wallet in this browser yet. Go play!",
      "stat.distinct_r3tards": "distinct r3tards",
      "stat.total_kills": "Total kills",

      // ---- coleccion.html ----
      "title.collection_word1": "R3tards",
      "title.collection_word2": "Collection",
      "collection.subtitle_pre": "Connect the same wallet you played with — you'll see, of the ",
      "collection.subtitle_strong": "1033 r3tards",
      "collection.subtitle_mid": " in the collection, ",
      "collection.subtitle_you": "in full color",
      "collection.subtitle_post": " the ones YOU'VE already killed, and the rest in the dark. It's your personal record, saved ",
      "collection.subtitle_local": "only in this browser",
      "collection.subtitle_end": " — same as \"My achievements\", it doesn't travel between devices.",
      "collection.loading_collection": "Loading the collection…",
      "collection.summary_total": "r3tards total",
      "collection.summary_dead": "You've killed",
      "collection.summary_alive": "Still to kill",
      "collection.filter_all": "All",
      "collection.status_dead": "💀 You've killed it",
      "collection.status_alive": "🌑 Not yet",
      "collection.empty_filter": "No r3tards of this rarity yet (or the filter doesn't match anything).",

      // ---- Achievements (see achievements-onchain.js) ----
      "achv.primera_sangre.name": "First Blood",
      "achv.primera_sangre.desc": "Kill your first r3tard.",
      "achv.cazador_raros.name": "Rare Hunter",
      "achv.cazador_raros.desc": "Kill your first RARE r3tard.",
      "achv.depredador_epico.name": "Epic Predator",
      "achv.depredador_epico.desc": "Kill your first EPIC r3tard.",
      "achv.leyenda_personal.name": "Personal Legend",
      "achv.leyenda_personal.desc": "Kill your first LEGENDARY r3tard.",
      "achv.certificado.name": "Certified",
      "achv.certificado.desc": 'Kill one of the 38 "Certified" r3tards (unique 1/1 pieces).',
      "achv.racha_x10.name": "Streak x10",
      "achv.racha_x10.desc": "Reach a x10 combo in a single match.",
      "achv.maratonista.name": "Marathoner",
      "achv.maratonista.desc": "Survive 10 straight minutes in a single match.",
      "achv.milesimo_punto.name": "Thousandth Point",
      "achv.milesimo_punto.desc": "Reach 1000 points or more in a single match.",
      "achv.multi_legendario.name": "Multi-Legendary",
      "achv.multi_legendario.desc": "Kill 3 legendary r3tards in a single match.",
      "achv.cazador_leyendas.name": "Legend Hunter",
      "achv.cazador_leyendas.desc": "Kill 10 legendary r3tards in total (across all your matches in this browser).",
      "achv.coleccion_completa.name": "Full Collection",
      "achv.coleccion_completa.desc": "Kill every distinct r3tard in the whole collection at least once (across all your matches in this browser).",

      // ---- Errors from wallet.js / nft-loader.js / onchain-events.js ----
      "err.no_wallet_detected": "No wallet detected (install MetaMask or another Monad-compatible wallet).",
      "err.no_account_authorized": "No account was authorized.",
      "err.no_wallet_short": "No wallet detected.",
      "err.contract_not_configured": "The game contract still isn't configured. (Edit GAME_CONTRACT_ADDRESS in js/config.js after deploying it.)",
      "err.timeout": "Timed out ({label})",
      "err.resolve_failed": "Couldn't resolve {uri}",
      "err.rpc_unreachable": "Couldn't connect to any Monad RPC ({detail}). This could be your network/firewall blocking those domains, or the public RPCs being overloaded right now. Check the browser console (F12) for details, or try again in a few minutes.",
      "err.rpc_dropped_mid_load": "Couldn't read {count} tokens: the Monad RPCs stopped responding partway through loading (likely overloaded or briefly down). Try again in a few minutes.",
      "err.token_uri_failed": "Token #{id} exists but tokenURI() didn't respond correctly.",
      "err.collection_incomplete_uri": "The collection is incomplete: {resolved} tokens resolved, totalSupply() reports {total}.",
      "err.no_valid_token_uri": "Could reach the chain, but no token returned a valid tokenURI(). Check that NFT_CONTRACT_ADDRESS in config.js is correct.",
      "err.metadata_resolve_failed": "Couldn't resolve r3tards metadata/images (possible network block towards the IPFS gateways). Try again.",
      "err.metadata_partial_failed": "Couldn't resolve the metadata for {count} active tokens: {ids}",
      "err.metadata_incomplete": "The metadata is incomplete: {resolved}/{total} tokens.",
      "err.block_number_failed": "Couldn't query the current block number on any RPC.",
      "err.events_read_failed": "Couldn't read the {event} events ({detail}).",

      "lang.toggle_title": "Cambiar idioma / Change language",
    },
  };

  // ---------------------------------------------------------------
  // Traducción de una clave, con interpolación opcional {variable}
  // ---------------------------------------------------------------
  function interpolate(str, vars) {
    if (!vars) return str;
    return str.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
  }

  function t(key, vars) {
    const lang = getLang();
    const table = DICT[lang] || DICT.es;
    let value = Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
    if (value === undefined) {
      // Español es la referencia: si falta la clave en el idioma activo
      // (normalmente inglés, por un texto nuevo que se olvidó traducir),
      // se cae de respaldo al español en vez de mostrar un hueco.
      value = Object.prototype.hasOwnProperty.call(DICT.es, key) ? DICT.es[key] : undefined;
    }
    if (value === undefined) return key; // nunca "undefined" en pantalla
    return interpolate(value, vars);
  }

  // ---------------------------------------------------------------
  // Nombres de rareza — ver el porqué en el comentario grande de arriba
  // (reemplaza las 3 listas sueltas que había antes en config.js,
  // main.js y logros.html).
  // ---------------------------------------------------------------
  const TIER_KEYS = ["common", "uncommon", "rare", "epic", "legendary"];
  function tierLabel(tierKey, opts) {
    opts = opts || {};
    const suffix = opts.plural ? ".plural" : "";
    const key = TIER_KEYS.includes(tierKey) ? "tier." + tierKey + suffix : null;
    const label = key ? t(key) : tierKey;
    return opts.upper ? label.toLocaleUpperCase() : label;
  }

  // ---------------------------------------------------------------
  // Puntajes con separador de miles según el idioma activo.
  // ---------------------------------------------------------------
  function formatScore(n) {
    return Number(n).toLocaleString(getLang() === "en" ? "en-US" : "es-ES");
  }

  // ---------------------------------------------------------------
  // Aplica las traducciones a todo lo estático marcado en el HTML con
  // data-i18n / data-i18n-attr. Se llama una vez al cargar cada página
  // (DOMContentLoaded, más abajo) y de nuevo cada vez que se cambia de
  // idioma a mano (setLang).
  // ---------------------------------------------------------------
  function applyStaticTranslations(root) {
    const scope = root || document;
    scope.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (key) el.textContent = t(key);
    });
    scope.querySelectorAll("[data-i18n-attr]").forEach((el) => {
      const spec = el.getAttribute("data-i18n-attr") || "";
      spec.split(",").forEach((pair) => {
        const [attrName, key] = pair.split(":").map((s) => s.trim());
        if (attrName && key) el.setAttribute(attrName, t(key));
      });
    });
  }

  // ---------------------------------------------------------------
  // Botón(es) de cambio manual de idioma — pedido no explícito, pero
  // necesario: la detección automática puede adivinar mal (alguien con
  // el navegador en inglés que en realidad prefiere jugar en español, o
  // viceversa), así que cualquier página puede poner un botón así:
  //   <button data-lang-toggle>🌐 ES</button>
  // y este archivo se encarga solo de mostrarle el idioma ACTIVO y de
  // cambiarlo al hacer clic — no hace falta cablear nada más a mano.
  // ---------------------------------------------------------------
  function refreshLangToggles() {
    document.querySelectorAll("[data-lang-toggle]").forEach((btn) => {
      btn.textContent = "🌐 " + getLang().toUpperCase();
      btn.setAttribute("title", t("lang.toggle_title"));
      btn.setAttribute("aria-label", t("lang.toggle_title"));
    });
  }
  function wireLangToggles() {
    document.querySelectorAll("[data-lang-toggle]").forEach((btn) => {
      if (btn._r3i18nWired) return;
      btn._r3i18nWired = true;
      btn.addEventListener("click", () => {
        setLang(getLang() === "es" ? "en" : "es");
      });
    });
    refreshLangToggles();
  }

  function onReady() {
    wireLangToggles();
    applyStaticTranslations();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onReady);
  } else {
    // El script puede terminar de cargar después de DOMContentLoaded en
    // algunos casos raros (ej. reintentos de red) — si ya pasó, corremos
    // igual ya mismo en vez de esperar un evento que ya no va a llegar.
    onReady();
  }

  // ---------------------------------------------------------------
  // Frases de "cultura nad" de los r3tards COMUNES (ver COMMON_NAD_PHRASES
  // en game.js) — 2% de probabilidad al caer, una sola vez. El español es
  // el original tal cual estaba; el inglés es una traducción con el
  // mismo tono (no literal palabra por palabra) para que siga sonando
  // natural y gracioso en inglés, no como un traductor automático.
  // ---------------------------------------------------------------
  const COMMON_NAD_PHRASES = {
    es: [
    "Gmonad ☀️", "GMONAD fren", "gmonad a todos", "gm y monad, todo en uno",
    "Gmonad, hoy sí pumpea", "¿Ya le diste gmonad hoy?", "gmonad desde el charco", "GMONAD o nada",
    "gmonad, otra vez tarde", "gmonad eterno", "Gmonad, gm, gm", "gmonad antes que el café",
    "Nad nad nad nad", "NAD NAD NAD!!!", "nad nad nad... nad", "¿Nad? Nad nad",
    "nad nad nad forever", "🟣 nad nad nad", "nadnadnadnadnad", "Nad nad nad, ser",
    "nad nad nad, fren", "Somos puro nad nad nad", "Nad nad nad nad nad nad", "nad (nad nad)",
    "Chog manda aquí", "Yo voto por Moyaki", "Molandak nunca duerme", "Somos los Monanimales",
    "Purple fren hasta la muerte", "El morado es mi color favorito", "Chog, Moyaki y Molandak me vieron nacer", "Team Moyaki, sin discusión",
    "Molandak me enseñó todo", "Purple Frens forever", "Chog aprueba esto", "Con Moyaki no se juega",
    "Molandak está orgulloso de mí", "El charco es morado y es hermoso", "Nací morado, moriré morado", "Los Monanimales me representan",
    "Chog dice que sí", "Moyaki tiene la razón siempre", "gm fren", "wagmi, ¿o no?",
    "ngmi si no me matas rápido", "wen moon", "few entienden esto", "ser, cálmate",
    "based y morado", "cope harder", "up only, dice mi corazón", "manos de diamante, cabeza de r3tard",
    "manos de papel detectadas", "LFG, vamos", "apostando todo, como siempre", "toca pasto después de esto",
    "los reales ya lo saben", "wen mainnet... ya llegó", "10.000 TPS y ni me inmuto", "ejecución en paralelo, como mi vida",
    "ya minteé, no me arrepiento", "no vendo ni loco", "esto es solo el principio", "purple chain hasta el final",
    "wagmi o nada", "cope, seethe, y sigo aquí", "few entienden el gas de aquí", "el gas aquí es una limosna",
    "gas gratis, alma cara", "esto no es un simulacro", "diamond hands activadas", "otra vela verde, por favor",
    "vine por el hype, me quedé por el caos", "en monad todo es más rápido, menos yo", "certified degen", "no financial advice, solo caos",
    "dyor antes de esquivarme", "hodl hasta que duela", "esto pump o me pumpeo yo", "fren, agáchate",
    "mi portafolio y yo, cayendo juntos", "wen airdrop", "airdrop de golpes, ya llegó", "gm es lo único que sé decir",
    "bullish en caos", "bearish en escapar", "moon soon, dice siempre alguien", "otro día, otro rugpull evitado",
    "no somos rug, somos r3tards", "wagmi, aunque me maten", "sigo en la lista blanca", "mi mint fue el mejor error",
    "esto explota más que mi wallet", "en cadena y sin frenos", "gas cero, caos infinito", "consenso total: soy un desastre",
    "validando este salto", "bloque tras bloque, aquí sigo", "latencia cero, vergüenza también", "finalidad instantánea, como mi caída",
    "throughput alto, IQ bajo", "escalo mejor que tú", "ejecuto en paralelo mis excusas", "soy descentralizado, nadie me controla",
    "mi hash es único, como yo", "nodo validador de caos", "firmo esta transacción con orgullo", "mempool de sentimientos",
    "reorg en mi vida, no en la cadena", "gas fee: mi dignidad", "smart contract, torpe ejecución", "on-chain y fuera de control",
    "mi wallet está más vacía que mi cabeza", "stake en el caos", "yield farming de problemas", "liquidez cero, actitud al 100",
    "rugpuleado por la vida, no por ustedes", "sigo siendo bullish en mí mismo", "otro bloque, otra oportunidad de caer", "TPS altísimos, autoestima bajísima",
    "fork esto", "mainnet real, caída real", "consenso: nadie me quiere", "confirmaciones: cero, caos: infinito",
    "gwei de actitud", "airdrop de mala suerte", "testnet de mis emociones", "sync completo con el desastre",
    "throughput de chistes malos", "latencia baja, chistes bajos también", "purple pill, la tomé sin dudar", "orgullosamente r3tard",
    "r3tard hasta la muerte", "no pienso, solo r3teo", "certified r3tard moment", "otro r3tard más al ataque",
    "somos ejército r3tard", "r3tard mode: on", "r3tard sin remedio", "vengo a caer con estilo",
    "esto es lo mío, caer", "profesional en caídas", "nadie cae como yo", "r3tard 4 life",
    "aquí para hacer el ridículo", "mi único talento es esto", "r3tard certificado, no falso", "vine, caí, y ya",
    "esto lo hago gratis", "r3tard de nacimiento", "no hay r3tard como yo", "somos leyenda... casi",
    "un r3tard más, ¿y qué?", "r3tard con orgullo total", "vine a molestar, no a ganar", "r3tard oficial de la colección",
    "el caos me define", "chaos r3tard incoming", "r3tard 2.0, más chistoso", "esto no es una crisis, es mi personalidad",
    "r3tard que no se rinde", "vine a caer, no a razonar", "r3tard sin filtro", "esto es arte, créeme",
    "otro r3tard cayendo con estilo", "r3tard fuera de serie", "no me juzgues, r3téame", "así nací, así muero",
    "r3tard total, sin arrepentimientos", "vengo con toda la actitud", "r3tard sin miedo", "esto es solo el calentamiento",
    "r3tard indestructible... o no", "aquí sigo, cayendo", "r3tard con propósito: ninguno", "esto es lo que hago mejor",
    "r3tard incondicional", "vine a dar espectáculo", "r3tard con más actitud que cerebro", "otro más del montón, y feliz",
    "r3tard sin complejos", "auch, eso dolió", "espera, no estaba listo", "otra vez no",
    "¿en serio otra vez?", "esto no estaba en el plan", "solo vine a pasear", "quién me invitó a esto",
    "yo solo quería mintear", "esto se salió de control", "alguien avise a mi mamá", "esto no lo cubre el seguro",
    "y pensar que solo quería un airdrop", "esto es peor que un rugpull", "juro que esto no es normal", "mi vida on-chain, un caos",
    "no debí mintear tan barato", "por esto no pago gas alto", "esto es gratis, ni modo", "y así fue como caí",
    "esto lo pago con creces", "no debí bajar del gráfico", "esto no estaba en el whitepaper",
    "ese sombrero, esto no se puede explicar", "esos ojos, esto no se puede explicar", "esa boca, esto no se puede explicar", "ese fondo, esto no se puede explicar",
    "esa aura, esto no se puede explicar", "esa ropa, esto no se puede explicar", "ese pelaje, esto no se puede explicar", "esos accesorios, esto no se puede explicar",
    "esas gafas, esto no se puede explicar", "esa cadena, esto no se puede explicar", "ese casco de ese r3tard es un caso aparte", "esa sonrisa de ese r3tard es un caso aparte",
    "esa mirada de ese r3tard es un caso aparte", "ese color de ese r3tard es un caso aparte", "esa piel de ese r3tard es un caso aparte", "esos rasgos de ese r3tard es un caso aparte",
    "ese estilo de ese r3tard es un caso aparte", "ese look de ese r3tard es un caso aparte", "esa pinta de ese r3tard es un caso aparte", "ese outfit de ese r3tard es un caso aparte",
    "¿quién le puso esa corona?", "¿quién le puso esa gorra?", "¿quién le puso ese peinado?", "¿quién le puso esas orejas?",
    "¿quién le puso esos dientes?", "¿quién le puso esa cara?", "¿quién le puso esas manchas?", "¿quién le puso ese traje?",
    "¿quién le puso esa vibra?", "¿quién le puso esos detalles?", "esa vestimenta, y nadie dijo nada", "ese antifaz, y nadie dijo nada",
    "esas botas, y nadie dijo nada", "esa capa, y nadie dijo nada", "ese chaleco, y nadie dijo nada", "ese sombrero, y nadie dijo nada",
    "esos ojos, y nadie dijo nada", "esa boca, y nadie dijo nada", "ese fondo, y nadie dijo nada", "esa aura, y nadie dijo nada",
    "ese r3tard con esa ropa, no supero", "ese r3tard con ese pelaje, no supero", "ese r3tard con esos accesorios, no supero", "ese r3tard con esas gafas, no supero",
    "ese r3tard con esa cadena, no supero", "ese r3tard con ese casco, no supero", "ese r3tard con esa sonrisa, no supero", "ese r3tard con esa mirada, no supero",
    "ese r3tard con ese color, no supero", "ese r3tard con esa piel, no supero", "esos rasgos, sin explicación posible", "ese estilo, sin explicación posible",
    "ese look, sin explicación posible", "esa pinta, sin explicación posible", "ese outfit, sin explicación posible", "esa corona, sin explicación posible",
    "esa gorra, sin explicación posible", "ese peinado, sin explicación posible", "esas orejas, sin explicación posible", "esos dientes, sin explicación posible",
    "miren esa cara, ya no aguanto", "miren esas manchas, ya no aguanto", "miren ese traje, ya no aguanto", "miren esa vibra, ya no aguanto",
    "miren esos detalles, ya no aguanto", "miren esa vestimenta, ya no aguanto", "miren ese antifaz, ya no aguanto", "miren esas botas, ya no aguanto",
    "miren esa capa, ya no aguanto", "miren ese chaleco, ya no aguanto", "ese sombrero, la comedia sigue viva", "esos ojos, la comedia sigue viva",
    "esa boca, la comedia sigue viva", "ese fondo, la comedia sigue viva", "esa aura, la comedia sigue viva", "esa ropa, la comedia sigue viva",
    "ese pelaje, la comedia sigue viva", "esos accesorios, la comedia sigue viva", "esas gafas, la comedia sigue viva", "esa cadena, la comedia sigue viva",
    "ese casco lo dice todo de él", "esa sonrisa lo dice todo de él", "esa mirada lo dice todo de él", "ese color lo dice todo de él",
    "esa piel lo dice todo de él", "esos rasgos lo dice todo de él", "ese estilo lo dice todo de él", "ese look lo dice todo de él",
    "esa pinta lo dice todo de él", "ese outfit lo dice todo de él", "esa corona, y aún así presume", "esa gorra, y aún así presume",
    "ese peinado, y aún así presume", "esas orejas, y aún así presume", "esos dientes, y aún así presume", "esa cara, y aún así presume",
    "esas manchas, y aún así presume", "ese traje, y aún así presume", "esa vibra, y aún así presume", "esos detalles, y aún así presume",
    "ese sombrero costó más gas que el mint", "ese fondo costó más gas que el mint", "ese pelaje costó más gas que el mint", "esa cadena costó más gas que el mint",
    "esa mirada costó más gas que el mint", "esos rasgos costó más gas que el mint", "esa pinta costó más gas que el mint", "esa gorra costó más gas que el mint",
    "esos dientes costó más gas que el mint", "ese traje costó más gas que el mint", "minteó solo para lucir esos accesorios, dice él", "minteó solo para lucir ese casco, dice él",
    "minteó solo para lucir ese color, dice él", "minteó solo para lucir ese estilo, dice él", "minteó solo para lucir ese outfit, dice él", "minteó solo para lucir ese peinado, dice él",
    "minteó solo para lucir esa cara, dice él", "minteó solo para lucir esa vibra, dice él", "minteó solo para lucir ese antifaz, dice él", "minteó solo para lucir ese chaleco, dice él",
    "esa piel y ni un lambo, en serio", "ese look y ni un lambo, en serio", "esa corona y ni un lambo, en serio", "esas orejas y ni un lambo, en serio",
    "esas manchas y ni un lambo, en serio", "esos detalles y ni un lambo, en serio", "esas botas y ni un lambo, en serio", "ese sombrero y ni un lambo, en serio",
    "ese fondo y ni un lambo, en serio", "ese pelaje y ni un lambo, en serio", "esa gorra así, ¿el whitepaper qué dice?", "esos dientes así, ¿el whitepaper qué dice?",
    "ese traje así, ¿el whitepaper qué dice?", "esa vestimenta así, ¿el whitepaper qué dice?", "esa capa así, ¿el whitepaper qué dice?", "esos ojos así, ¿el whitepaper qué dice?",
    "esa aura así, ¿el whitepaper qué dice?", "esos accesorios así, ¿el whitepaper qué dice?", "ese casco así, ¿el whitepaper qué dice?", "ese color así, ¿el whitepaper qué dice?",
    "esa vibra rarísimo, floor bajo, pura casualidad", "ese antifaz rarísimo, floor bajo, pura casualidad", "ese chaleco rarísimo, floor bajo, pura casualidad", "esa boca rarísimo, floor bajo, pura casualidad",
    "esa ropa rarísimo, floor bajo, pura casualidad", "esas gafas rarísimo, floor bajo, pura casualidad", "esa sonrisa rarísimo, floor bajo, pura casualidad", "esa piel rarísimo, floor bajo, pura casualidad",
    "ese look rarísimo, floor bajo, pura casualidad", "esa corona rarísimo, floor bajo, pura casualidad", "gm con ese sombrero, algo no cuadra", "gm con ese fondo, algo no cuadra",
    "gm con ese pelaje, algo no cuadra", "gm con esa cadena, algo no cuadra", "gm con esa mirada, algo no cuadra", "gm con esos rasgos, algo no cuadra",
    "gm con esa pinta, algo no cuadra", "gm con esa gorra, algo no cuadra", "gm con esos dientes, algo no cuadra", "gm con ese traje, algo no cuadra",
    "esos accesorios en la wallet equivocada, qué tragedia", "ese casco en la wallet equivocada, qué tragedia", "ese color en la wallet equivocada, qué tragedia", "ese estilo en la wallet equivocada, qué tragedia",
    "ese outfit en la wallet equivocada, qué tragedia", "ese peinado en la wallet equivocada, qué tragedia", "esa cara en la wallet equivocada, qué tragedia", "esa vibra en la wallet equivocada, qué tragedia",
    "ese antifaz en la wallet equivocada, qué tragedia", "ese chaleco en la wallet equivocada, qué tragedia", "vendo mi wallet antes de aceptar esa piel", "vendo mi wallet antes de aceptar ese look",
    "vendo mi wallet antes de aceptar esa corona", "vendo mi wallet antes de aceptar esas orejas", "vendo mi wallet antes de aceptar esas manchas", "vendo mi wallet antes de aceptar esos detalles",
    "vendo mi wallet antes de aceptar esas botas", "vendo mi wallet antes de aceptar ese sombrero", "vendo mi wallet antes de aceptar ese fondo", "vendo mi wallet antes de aceptar ese pelaje",
    "esa gorra, y aun así habla de wagmi", "esos dientes, y aun así habla de wagmi", "ese traje, y aun así habla de wagmi", "esa vestimenta, y aun así habla de wagmi",
    "esa capa, y aun así habla de wagmi", "esos ojos, y aun así habla de wagmi", "esa aura, y aun así habla de wagmi", "esos accesorios, y aun así habla de wagmi",
    "ese casco, y aun así habla de wagmi", "ese color, y aun así habla de wagmi", "el charco entero comenta esa vibra de aquel", "el charco entero comenta ese antifaz de aquel",
    "el charco entero comenta ese chaleco de aquel", "el charco entero comenta esa boca de aquel", "el charco entero comenta esa ropa de aquel", "el charco entero comenta esas gafas de aquel",
    "el charco entero comenta esa sonrisa de aquel", "el charco entero comenta esa piel de aquel", "el charco entero comenta ese look de aquel", "el charco entero comenta esa corona de aquel",
    "ese sombrero, otro rugpull visual para mí", "ese fondo, otro rugpull visual para mí", "ese pelaje, otro rugpull visual para mí", "esa cadena, otro rugpull visual para mí",
    "esa mirada, otro rugpull visual para mí", "esos rasgos, otro rugpull visual para mí", "esa pinta, otro rugpull visual para mí", "esa gorra, otro rugpull visual para mí",
    "esos dientes, otro rugpull visual para mí", "ese traje, otro rugpull visual para mí", "posteen ya esos accesorios, esto es evidencia", "posteen ya ese casco, esto es evidencia",
    "posteen ya ese color, esto es evidencia", "posteen ya ese estilo, esto es evidencia", "posteen ya ese outfit, esto es evidencia", "posteen ya ese peinado, esto es evidencia",
    "posteen ya esa cara, esto es evidencia", "posteen ya esa vibra, esto es evidencia", "posteen ya ese antifaz, esto es evidencia", "posteen ya ese chaleco, esto es evidencia",
    "screenshot a esa piel antes de que borre todo", "screenshot a ese look antes de que borre todo", "screenshot a esa corona antes de que borre todo", "screenshot a esas orejas antes de que borre todo",
    "screenshot a esas manchas antes de que borre todo", "screenshot a esos detalles antes de que borre todo", "screenshot a esas botas antes de que borre todo", "screenshot a ese sombrero antes de que borre todo",
    "screenshot a ese fondo antes de que borre todo", "screenshot a ese pelaje antes de que borre todo", "esa gorra on-chain para siempre, que quede claro", "esos dientes on-chain para siempre, que quede claro",
    "ese traje on-chain para siempre, que quede claro", "esa vestimenta on-chain para siempre, que quede claro", "esa capa on-chain para siempre, que quede claro", "esos ojos on-chain para siempre, que quede claro",
    "esa aura on-chain para siempre, que quede claro", "esos accesorios on-chain para siempre, que quede claro", "ese casco on-chain para siempre, que quede claro", "ese color on-chain para siempre, que quede claro",
    "¿wagmi con esa vibra? lo dudo mucho", "¿wagmi con ese antifaz? lo dudo mucho", "¿wagmi con ese chaleco? lo dudo mucho", "¿wagmi con esa boca? lo dudo mucho",
    "¿wagmi con esa ropa? lo dudo mucho", "¿wagmi con esas gafas? lo dudo mucho", "¿wagmi con esa sonrisa? lo dudo mucho", "¿wagmi con esa piel? lo dudo mucho",
    "¿wagmi con ese look? lo dudo mucho", "¿wagmi con esa corona? lo dudo mucho", "chisme fresco: ese r3tard minteó dormido", "dicen que pagó gas de más por nada",
    "se rumora que su wallet es un caos", "quién le dijo que mintear era buena idea", "que quede en el mempool, qué desastre", "todo el charco ya sabe lo de ese mint",
    "no hablo mal, pero exagera con el wagmi", "dicen que le tiembla la mano firmando transacciones", "chisme del charco: nadie confía en su gas fee", "ese r3tard presume su mint como si fuera raro",
    "dicen que compró en el peor bloque posible", "se comenta que su portafolio es puro cope", "nadie le avisó que eso no era el airdrop", "ese r3tard cree que su wallet es especial",
    "chisme caliente: le rugpulearon y ni se dio cuenta", "dicen que su nodo se cae más que él", "todo el mempool sabe que él causó el pánico", "se rumora que su seed phrase es su cumpleaños",
    "ese r3tard le puso stop loss al orgullo", "dicen que confirma transacciones con los ojos cerrados", "chisme fresco: ese ni sabe qué es un gwei", "se comenta que su mint fue puro fluke",
    "todo el charco lo vio vender pésimo", "dicen que su wallet tiene más deudas que nads", "ese r3tard finge que entiende de gas fees", "se rumora que hodlea porque no sabe vender",
    "chisme del bloque: ese confirmó dos veces por nervios", "dicen que su cartera huele a pánico", "ese r3tard alardea de un airdrop que nunca llegó", "se comenta que su gm diario es puro teatro",
    "todo el charco sabe que compró el tope", "dicen que su hodl es en realidad indecisión", "ese r3tard cree que fue el primero en mintear", "se rumora que borró su wallet del susto",
    "chisme del mempool: nadie confirma sus transacciones a tiempo", "dicen que su whitelist fue por lástima", "ese r3tard aún cree en su propio hype", "se comenta que su portafolio es un simulacro",
    "todo el charco vio ese fork y se rió", "dicen que reza antes de cada transacción", "ese r3tard confunde bullish con desesperado", "se rumora que su mint fue un accidente feliz",
    "chisme fresco: ese ni entiende el whitepaper propio", "dicen que le da miedo su propia wallet", "todo el charco comenta lo lento de su nodo", "ese r3tard cree que hodl es una personalidad",
    "se comenta que su seed phrase es un chiste", "dicen que su fren list se achica cada día", "ese r3tard aplaude cada vela roja como si nada", "se rumora que gastó su gas en pura ansiedad",
    "chisme del charco: ese sí que ngmi de verdad", "dicen que su mint casi tumbó la red", "ese r3tard confunde gm con pedir ayuda", "se comenta que su bag es puro papel higiénico",
    "todo el charco sabe que fue el rugpull chiquito", "dicen que su wallet perdió la cuenta de pérdidas", "ese r3tard cree que el gas gratis fue mérito", "se rumora que le tiembla el dedo al mintear",
    "chisme fresco: nadie le explicó qué es dyor", "dicen que su hodl es solo olvido de contraseña", "ese r3tard cree que la finalidad instantánea es suya", "se comenta que su charco favorito es el drama",
    "todo el mempool vio ese error de transacción", "dicen que confunde based con desesperado por likes", "ese r3tard alardea de un throughput que no entiende", "se rumora que su mainnet favorito es el drama",
    "perdió su llave y culpa a la cadena", "dicen que su cope diario es récord del charco", "ese r3tard llama estrategia a su propio rugpull", "su único fren real es el gas gratis",
    "todo el charco sabe que él inventó el pánico", "su idea de dyor es preguntarle al gato", "ese r3tard cree que su reorg personal es normal", "su gm diario tarda más que un bloque",
    "chisme fresco: ese confunde staking con olvidar la wallet", "ya ni él cree en su propio wagmi", "ese r3tard cree que consenso es tener razón", "su mempool interno está lleno de excusas",
    "el charco vio ese sync fallido y se rió", "su gas fee es más alto que su autoestima", "ese r3tard alardea de un nodo que ni prende", "se rumora que su bullish es puro miedo escondido",
    "ese le da gm a su propia sombra", "su hash favorito es el de su caída", "ese r3tard confunde validador con validación emocional", "su whitelist es solo una lista de disculpas",
    "todo el mempool sabe que ese mint fue nervioso", "su cadena favorita es la que lo aleja", "ese r3tard cree que su fork cuenta como historia", "confirma sus errores dos veces, por si acaso",
    "chisme fresco: ese le tiene miedo a su gwei", "su latencia emocional es peor que la red", "ese r3tard cree que rugpuleado es un honor", "ni él entiende el chiste de su seed phrase",
    "todo el charco sabe de su reorg emocional", "dicen que su airdrop favorito nunca existió", "alardea de un yield que es pura pérdida", "su gm matutino es un llanto disfrazado",
    "chisme del charco: ese confunde based con desastre total", "chisme fresco: mintió, se arrepintió, mintió de nuevo", "chisme del charco, pasen la voz", "esto no lo cuento dos veces",
    "nadie me lo dijo, lo vi yo mismo", "esto se queda entre nosotros, o no", "posteen esto antes que lo borren", "el chisme del bloque de hoy es fuerte",
    "cada r3tard tiene su drama, aquí el de hoy", "no juzgo, pero ya lo dije", "esto lo supe por el mempool, no pregunten cómo", "otro chisme fresco recién minteado",
    "esto vale más que cualquier NFT", "el charco entero está hablando de esto", "nadie pidió mi opinión, la doy igual", "esto es tea on-chain, para siempre",
    "guarden este chisme, va a servir después", "esto no es drama, es investigación", "hoy toca chisme, mañana toca caer", "esto se comparte, no se guarda",
    "mi fuente es confiable, casi siempre", "esto no es mentira, es exageración con base", "el chisme de hoy viene con capturas", "esto es más viral que cualquier mint",
    "todos callados, pero todos lo saben", "esto se queda grabado en la cadena, fren", "no inventé nada, solo lo repito con estilo", "hoy el charco tiene tema nuevo",
    "esto no lo va a tapar ningún gas fee", "chisme confirmado, pasó en el último bloque", "esto no se borra ni con un reorg", "el charco lo vio primero que las noticias",
    "esto ya lo sabía medio charco, yo lo confirmo", "no vine a pelear, vine a contar lo visto", "esto es contenido premium del charco", "nadie me creyó, hasta que salió el screenshot",
    "esto no es chisme, es historia on-chain", "el charco tiene memoria, y hoy la usó", "esto se lo cuento a todo el que caiga", "no hay funeral sin chisme, aquí el de hoy",
    "esto va a doler más que el gas fee", "el charco no perdona, y menos olvida", "esto se lo debía al charco entero", "nadie confirmó esto, pero todos lo repiten",
    "esto no necesita dyor, se vio en vivo", "el chisme de hoy no tiene stop loss", "esto se guarda en el mempool de la memoria", "nadie lo pidió, pero el charco lo necesitaba",
    "esto es tan real como el gas que pagué", "el charco ya tiene su meme del día", "esto no se vota, se comparte y ya", "chisme fresco, directo del último bloque minado",
  ],
    en: [
    "Gmonad ☀️", "GMONAD fren", "gmonad to everyone", "gm and monad, all in one",
    "Gmonad, it's really pumping today", "Did you gmonad today?", "gmonad from the puddle", "GMONAD or nothing",
    "gmonad, late again", "gmonad forever", "Gmonad, gm, gm", "gmonad before coffee",
    "Nad nad nad nad", "NAD NAD NAD!!!", "nad nad nad... nad", "Nad? Nad nad",
    "nad nad nad forever", "🟣 nad nad nad", "nadnadnadnadnad", "Nad nad nad, ser",
    "nad nad nad, fren", "We're pure nad nad nad", "Nad nad nad nad nad nad", "nad (nad nad)",
    "Chog's in charge here", "I vote for Moyaki", "Molandak never sleeps", "We are the Monanimals",
    "Purple fren till death", "Purple's my favorite color", "Chog, Moyaki and Molandak watched me get born", "Team Moyaki, no debate",
    "Molandak taught me everything", "Purple Frens forever", "Chog approves this", "You don't mess with Moyaki",
    "Molandak's proud of me", "The puddle is purple and it's beautiful", "Born purple, I'll die purple", "The Monanimals represent me",
    "Chog says yes", "Moyaki's always right", "gm fren", "wagmi, or not?",
    "ngmi if you don't kill me fast", "wen moon", "few understand this", "ser, calm down",
    "based and purple", "cope harder", "up only, says my heart", "diamond hands, r3tard brain",
    "paper hands detected", "LFG, let's go", "going all in, as always", "touch grass after this",
    "the real ones already know", "wen mainnet... it's already here", "10,000 TPS and I don't even flinch", "parallel execution, just like my life",
    "already minted, no regrets", "not selling, no way", "this is only the beginning", "purple chain till the end",
    "wagmi or nothing", "cope, seethe, and I'm still here", "few understand the gas fees here", "gas here is basically pocket change",
    "gas is free, my soul isn't", "this is not a drill", "diamond hands activated", "one more green candle, please",
    "came for the hype, stayed for the chaos", "on monad everything's faster, except me", "certified degen", "not financial advice, just chaos",
    "dyor before you dodge me", "hodl till it hurts", "this pumps or I pump myself", "fren, duck",
    "my portfolio and me, falling together", "wen airdrop", "airdrop of hits, just landed", "gm is the only thing I know how to say",
    "bullish on chaos", "bearish on escaping", "moon soon, someone always says", "another day, another rugpull dodged",
    "we're not a rug, we're r3tards", "wagmi, even if you kill me", "still on the whitelist", "my mint was my best mistake",
    "this blows up harder than my wallet did", "chained in, no brakes", "zero gas, infinite chaos", "total consensus: I'm a disaster",
    "validating this jump", "block after block, still here", "zero latency, zero shame too", "instant finality, just like my fall",
    "high throughput, low IQ", "I scale better than you", "I execute my excuses in parallel", "I'm decentralized, nobody controls me",
    "my hash is unique, just like me", "chaos validator node", "signing this transaction with pride", "mempool of feelings",
    "reorg in my life, not the chain", "gas fee: my dignity", "smart contract, clumsy execution", "on-chain and out of control",
    "my wallet's emptier than my head", "staking in chaos", "yield farming problems", "zero liquidity, 100% attitude",
    "rugged by life, not by you guys", "still bullish on myself", "another block, another chance to fall", "TPS sky-high, self-esteem rock-bottom",
    "fork this", "real mainnet, real fall", "consensus: nobody likes me", "confirmations: zero, chaos: infinite",
    "gwei of attitude", "airdrop of bad luck", "testnet of my emotions", "fully synced with disaster",
    "throughput of bad jokes", "low latency, low jokes too", "purple pill, took it without hesitation", "proudly r3tard",
    "r3tard till death", "I don't think, I just r3tard", "certified r3tard moment", "another r3tard on the attack",
    "we're the r3tard army", "r3tard mode: on", "r3tard beyond saving", "here to fall in style",
    "falling is my thing", "professional at falling", "nobody falls like I do", "r3tard 4 life",
    "here to make a fool of myself", "this is my only talent", "certified r3tard, no fakes", "I came, I fell, that's it",
    "I do this for free", "r3tard by birth", "there's no r3tard like me", "we're legends... almost",
    "one more r3tard, so what?", "r3tard with total pride", "I came to bother, not to win", "official r3tard of the collection",
    "chaos defines me", "chaos r3tard incoming", "r3tard 2.0, funnier edition", "this isn't a crisis, it's my personality",
    "r3tard who never quits", "I came to fall, not to reason", "r3tard with no filter", "this is art, trust me",
    "another r3tard falling in style", "one-of-a-kind r3tard", "don't judge me, r3tard me", "born this way, dying this way",
    "total r3tard, zero regrets", "coming in with full attitude", "r3tard with no fear", "this is just the warm-up",
    "indestructible r3tard... or not", "still here, falling", "r3tard with a purpose: none", "this is what I do best",
    "unconditional r3tard", "I came to put on a show", "r3tard with more attitude than brains", "just another one of the bunch, and happy about it",
    "r3tard with no hang-ups", "ouch, that hurt", "wait, I wasn't ready", "not again",
    "seriously, again?", "this wasn't part of the plan", "I just came for a walk", "who invited me to this",
    "I just wanted to mint", "this got out of hand", "somebody tell my mom", "insurance doesn't cover this",
    "and to think I just wanted an airdrop", "this is worse than a rugpull", "I swear this isn't normal", "my on-chain life, a total mess",
    "I shouldn't have minted so cheap", "this is why I don't pay high gas", "this is free, oh well", "and that's how I fell",
    "I'm paying for this big time", "I shouldn't have gotten off the chart", "this wasn't in the whitepaper",
    "that hat, there's no explaining it", "those eyes, there's no explaining it", "that mouth, there's no explaining it", "that background, there's no explaining it",
    "that aura, there's no explaining it", "that outfit, there's no explaining it", "that fur, there's no explaining it", "those accessories, there's no explaining it",
    "those glasses, there's no explaining it", "that chain, there's no explaining it", "that helmet on that r3tard is a whole situation", "that smile on that r3tard is a whole situation",
    "that stare on that r3tard is a whole situation", "that color on that r3tard is a whole situation", "that skin on that r3tard is a whole situation", "those features on that r3tard is a whole situation",
    "that style on that r3tard is a whole situation", "that look on that r3tard is a whole situation", "that get-up on that r3tard is a whole situation", "that fit on that r3tard is a whole situation",
    "who gave him that crown?", "who gave him that cap?", "who gave him that hairdo?", "who gave him those ears?",
    "who gave him those teeth?", "who gave him that face?", "who gave him those spots?", "who gave him that suit?",
    "who gave him that vibe?", "who gave him those details?", "that getup, and nobody said a word, some frens", "that mask, and nobody said a word, some frens",
    "those boots, and nobody said a word, some frens", "that cape, and nobody said a word, some frens", "that vest, and nobody said a word, some frens", "that hat, and nobody said a word, some frens",
    "those eyes, and nobody said a word, some frens", "that mouth, and nobody said a word, some frens", "that background, and nobody said a word, some frens", "that aura, and nobody said a word, some frens",
    "that r3tard with that outfit, I can't even", "that r3tard with that fur, I can't even", "that r3tard with those accessories, I can't even", "that r3tard with those glasses, I can't even",
    "that r3tard with that chain, I can't even", "that r3tard with that helmet, I can't even", "that r3tard with that smile, I can't even", "that r3tard with that stare, I can't even",
    "that r3tard with that color, I can't even", "that r3tard with that skin, I can't even", "those features, absolutely no explanation for it", "that style, absolutely no explanation for it",
    "that look, absolutely no explanation for it", "that get-up, absolutely no explanation for it", "that fit, absolutely no explanation for it", "that crown, absolutely no explanation for it",
    "that cap, absolutely no explanation for it", "that hairdo, absolutely no explanation for it", "those ears, absolutely no explanation for it", "those teeth, absolutely no explanation for it",
    "look at that face, I can't", "look at those spots, I can't", "look at that suit, I can't", "look at that vibe, I can't",
    "look at those details, I can't", "look at that getup, I can't", "look at that mask, I can't", "look at those boots, I can't",
    "look at that cape, I can't", "look at that vest, I can't", "that hat, comedy is not dead", "those eyes, comedy is not dead",
    "that mouth, comedy is not dead", "that background, comedy is not dead", "that aura, comedy is not dead", "that outfit, comedy is not dead",
    "that fur, comedy is not dead", "those accessories, comedy is not dead", "those glasses, comedy is not dead", "that chain, comedy is not dead",
    "that helmet says it all about him", "that smile says it all about him", "that stare says it all about him", "that color says it all about him",
    "that skin says it all about him", "those features says it all about him", "that style says it all about him", "that look says it all about him",
    "that get-up says it all about him", "that fit says it all about him", "that crown, and he still flexes", "that cap, and he still flexes",
    "that hairdo, and he still flexes", "those ears, and he still flexes", "those teeth, and he still flexes", "that face, and he still flexes",
    "those spots, and he still flexes", "that suit, and he still flexes", "that vibe, and he still flexes", "those details, and he still flexes",
    "that hat cost more gas than the mint", "that background cost more gas than the mint", "that fur cost more gas than the mint", "that chain cost more gas than the mint",
    "that stare cost more gas than the mint", "those features cost more gas than the mint", "that get-up cost more gas than the mint", "that cap cost more gas than the mint",
    "those teeth cost more gas than the mint", "that suit cost more gas than the mint", "he minted just to flex those accessories, he says", "he minted just to flex that helmet, he says",
    "he minted just to flex that color, he says", "he minted just to flex that style, he says", "he minted just to flex that fit, he says", "he minted just to flex that hairdo, he says",
    "he minted just to flex that face, he says", "he minted just to flex that vibe, he says", "he minted just to flex that mask, he says", "he minted just to flex that vest, he says",
    "that skin and still no lambo, seriously", "that look and still no lambo, seriously", "that crown and still no lambo, seriously", "those ears and still no lambo, seriously",
    "those spots and still no lambo, seriously", "those details and still no lambo, seriously", "those boots and still no lambo, seriously", "that hat and still no lambo, seriously",
    "that background and still no lambo, seriously", "that fur and still no lambo, seriously", "that cap like that, whitepaper says what?", "those teeth like that, whitepaper says what?",
    "that suit like that, whitepaper says what?", "that getup like that, whitepaper says what?", "that cape like that, whitepaper says what?", "those eyes like that, whitepaper says what?",
    "that aura like that, whitepaper says what?", "those accessories like that, whitepaper says what?", "that helmet like that, whitepaper says what?", "that color like that, whitepaper says what?",
    "that vibe that rare, floor that low, sure", "that mask that rare, floor that low, sure", "that vest that rare, floor that low, sure", "that mouth that rare, floor that low, sure",
    "that outfit that rare, floor that low, sure", "those glasses that rare, floor that low, sure", "that smile that rare, floor that low, sure", "that skin that rare, floor that low, sure",
    "that look that rare, floor that low, sure", "that crown that rare, floor that low, sure", "gm with that hat, something's off here", "gm with that background, something's off here",
    "gm with that fur, something's off here", "gm with that chain, something's off here", "gm with that stare, something's off here", "gm with those features, something's off here",
    "gm with that get-up, something's off here", "gm with that cap, something's off here", "gm with those teeth, something's off here", "gm with that suit, something's off here",
    "those accessories in the wrong wallet, what a shame", "that helmet in the wrong wallet, what a shame", "that color in the wrong wallet, what a shame", "that style in the wrong wallet, what a shame",
    "that fit in the wrong wallet, what a shame", "that hairdo in the wrong wallet, what a shame", "that face in the wrong wallet, what a shame", "that vibe in the wrong wallet, what a shame",
    "that mask in the wrong wallet, what a shame", "that vest in the wrong wallet, what a shame", "I'd sell my wallet before rocking that skin", "I'd sell my wallet before rocking that look",
    "I'd sell my wallet before rocking that crown", "I'd sell my wallet before rocking those ears", "I'd sell my wallet before rocking those spots", "I'd sell my wallet before rocking those details",
    "I'd sell my wallet before rocking those boots", "I'd sell my wallet before rocking that hat", "I'd sell my wallet before rocking that background", "I'd sell my wallet before rocking that fur",
    "that cap, and he still says wagmi", "those teeth, and he still says wagmi", "that suit, and he still says wagmi", "that getup, and he still says wagmi",
    "that cape, and he still says wagmi", "those eyes, and he still says wagmi", "that aura, and he still says wagmi", "those accessories, and he still says wagmi",
    "that helmet, and he still says wagmi", "that color, and he still says wagmi", "the whole puddle's gossiping about that vibe", "the whole puddle's gossiping about that mask",
    "the whole puddle's gossiping about that vest", "the whole puddle's gossiping about that mouth", "the whole puddle's gossiping about that outfit", "the whole puddle's gossiping about those glasses",
    "the whole puddle's gossiping about that smile", "the whole puddle's gossiping about that skin", "the whole puddle's gossiping about that look", "the whole puddle's gossiping about that crown",
    "that hat, a visual rugpull if you ask me", "that background, a visual rugpull if you ask me", "that fur, a visual rugpull if you ask me", "that chain, a visual rugpull if you ask me",
    "that stare, a visual rugpull if you ask me", "those features, a visual rugpull if you ask me", "that get-up, a visual rugpull if you ask me", "that cap, a visual rugpull if you ask me",
    "those teeth, a visual rugpull if you ask me", "that suit, a visual rugpull if you ask me", "post those accessories already, this is evidence", "post that helmet already, this is evidence",
    "post that color already, this is evidence", "post that style already, this is evidence", "post that fit already, this is evidence", "post that hairdo already, this is evidence",
    "post that face already, this is evidence", "post that vibe already, this is evidence", "post that mask already, this is evidence", "post that vest already, this is evidence",
    "screenshot that skin before he deletes it all", "screenshot that look before he deletes it all", "screenshot that crown before he deletes it all", "screenshot those ears before he deletes it all",
    "screenshot those spots before he deletes it all", "screenshot those details before he deletes it all", "screenshot those boots before he deletes it all", "screenshot that hat before he deletes it all",
    "screenshot that background before he deletes it all", "screenshot that fur before he deletes it all", "that cap on-chain forever, let that be known", "those teeth on-chain forever, let that be known",
    "that suit on-chain forever, let that be known", "that getup on-chain forever, let that be known", "that cape on-chain forever, let that be known", "those eyes on-chain forever, let that be known",
    "that aura on-chain forever, let that be known", "those accessories on-chain forever, let that be known", "that helmet on-chain forever, let that be known", "that color on-chain forever, let that be known",
    "wagmi with that vibe? I doubt it", "wagmi with that mask? I doubt it", "wagmi with that vest? I doubt it", "wagmi with that mouth? I doubt it",
    "wagmi with that outfit? I doubt it", "wagmi with those glasses? I doubt it", "wagmi with that smile? I doubt it", "wagmi with that skin? I doubt it",
    "wagmi with that look? I doubt it", "wagmi with that crown? I doubt it", "fresh gossip: that r3tard minted asleep", "word is he overpaid gas for nothing",
    "rumor has it his wallet's a mess", "who told him minting was a good idea", "straight into the mempool, what a mess", "the whole puddle already knows about that mint",
    "not talking trash, but he overdoes the wagmi", "word is his hand shakes signing transactions", "puddle gossip: nobody trusts his gas fee", "that r3tard flexes his mint like it's rare",
    "word is he bought at the worst block", "it's said his whole bag is pure cope", "nobody told him that wasn't the airdrop", "that r3tard thinks his wallet is special",
    "hot gossip: got rugged and didn't even notice", "word is his node falls more than he does", "the whole mempool knows he was the panic seller", "rumor is his seed phrase is his birthday",
    "that r3tard put a stop loss on his pride", "word is he confirms transactions with his eyes closed", "fresh gossip: he doesn't even know what gwei is", "it's said his mint was pure luck",
    "the whole puddle watched that terrible sell", "word is his wallet owes more than it holds", "that r3tard fakes knowing anything about gas fees", "rumor is he hodls 'cause he can't sell",
    "block gossip: he confirmed twice out of nerves", "word is his portfolio smells like panic", "that r3tard brags about an airdrop he never got", "it's said his daily gm is pure theater",
    "the whole puddle knows he bought the top", "word is his hodl is really just indecision", "that r3tard thinks he minted first", "rumor is he deleted his wallet out of fear",
    "mempool gossip: nobody confirms his transactions on time", "word is his whitelist spot was a pity invite", "that r3tard still believes his own hype", "it's said his portfolio is basically a drill",
    "the whole puddle saw that fork and laughed", "word is he prays before every transaction", "that r3tard confuses bullish with desperate", "rumor is his mint was a happy accident",
    "fresh gossip: he doesn't get his own whitepaper", "word is he's scared of his own wallet", "the whole puddle's talking about his slow node", "that r3tard thinks hodl is a personality",
    "it's said his seed phrase is a joke", "word is his fren list shrinks every day", "that r3tard claps at every red candle anyway", "rumor is he spent his gas on pure anxiety",
    "puddle gossip: that one's actually ngmi for real", "word is his mint almost broke the network alone", "that r3tard confuses gm with a cry for help", "it's said his bag is basically toilet paper",
    "the whole puddle knows he caused that tiny rugpull", "word is his wallet lost count of the losses", "that r3tard thinks free gas was his own doing", "rumor is his finger shakes over the mint button",
    "fresh gossip: nobody explained dyor to him", "word is his hodl is just a forgotten password", "that r3tard thinks instant finality is his personal win", "it's said his favorite puddle is drama itself",
    "the whole mempool saw that failed transaction, yikes", "word is he confuses based with desperate for likes", "that r3tard brags about throughput he doesn't understand", "rumor is his favorite mainnet is other people's drama",
    "lost his key, now blames the chain", "word is his daily cope is a puddle record", "that r3tard calls his own rugpull a strategy", "it's said his only fren is free gas",
    "the whole puddle knows he invented panic selling", "his idea of dyor is asking the cat", "that r3tard thinks his personal reorg is totally normal", "his daily gm takes longer than a block",
    "fresh gossip: he confuses staking with forgetting his wallet", "word is even he doesn't believe his own wagmi", "that r3tard thinks consensus means everyone agreeing with him", "it's said his internal mempool is full of excuses",
    "the whole puddle saw that failed sync and snickered", "word is his gas fee's higher than his self-esteem", "that r3tard brags about a node that won't boot", "rumor is his bullish is just fear in disguise",
    "puddle gossip: he says gm to his own shadow", "his favorite hash is the one from his fall", "that r3tard confuses validator with emotional validation", "his whitelist is really just a list of apologies",
    "the whole mempool knows that mint was pure nerves", "his favorite chain is the one keeping him away", "that r3tard thinks his own fork counts as history", "he confirms his mistakes twice, just in case",
    "fresh gossip: he's scared of his own gwei", "word is his emotional latency beats the network's", "that r3tard wears getting rugged as a badge", "even he doesn't get his own seed phrase joke",
    "the whole puddle knows about his emotional reorg", "word is his favorite airdrop never even existed", "that r3tard brags about a pure-loss yield", "rumor is his morning gm is disguised crying",
    "puddle gossip: he confuses based with total disaster", "fresh gossip: minted, regretted it, minted again", "puddle gossip, pass it on", "not repeating this twice",
    "nobody told me, I saw it myself", "this stays between us, or not", "post this before it gets deleted", "today's block gossip is a lot",
    "every r3tard has drama, here's today's", "not judging, just saying it out loud", "heard it through the mempool, don't ask how", "another fresh gossip, straight off the mint",
    "this is worth more than any NFT", "the whole puddle's talking about this", "nobody asked for my take, here it is", "this is on-chain tea, forever",
    "save this gossip, it'll be useful later", "it's not drama, it's research", "today's gossip, tomorrow's fall", "this gets shared, not kept",
    "my source is reliable, mostly", "not a lie, just exaggeration with receipts", "today's gossip comes with screenshots", "this is going more viral than any mint",
    "everyone's quiet, but everyone knows", "this stays carved on the chain, fren", "didn't make it up, just repeating it with style", "the puddle's got fresh material today",
    "no gas fee is covering this up", "confirmed gossip, happened last block", "not even a reorg erases this", "the puddle saw it before the news did",
    "half the puddle already knew, I'm just confirming", "not here to fight, just here to report", "this is premium puddle content", "nobody believed me until the screenshot dropped",
    "this isn't gossip, it's on-chain history", "the puddle has memory, and used it today", "telling this to every single one who falls", "no funeral without gossip, here's today's",
    "this is gonna sting more than the gas fee", "the puddle doesn't forgive, and it never forgets", "the whole puddle deserved to hear this", "nobody confirmed it, but everyone repeats it",
    "no dyor needed here, it happened live", "today's gossip has no stop loss", "this one's saved in the mempool of memory", "nobody asked, but the puddle needed this",
    "this is as real as the gas I paid", "the puddle already has today's meme", "no voting on this, just share it", "fresh gossip, straight from the latest mined block",
  ],
  };

  window.R3I18N = {
    detect,
    getLang,
    setLang,
    t,
    tierLabel,
    applyStaticTranslations,
    formatScore,
    COMMON_NAD_PHRASES,
  };
})();
