/**
 * ============================================================
 *  R3 APOCALIPSIS — CONFIGURACIÓN
 * ============================================================
 *  Este es el ÚNICO archivo que normalmente necesitas editar
 *  antes de publicar el juego.
 * ============================================================
 */
window.R3_CONFIG = {
  // ---- Red Monad Mainnet -------------------------------------------------
  CHAIN_ID_DEC: 143,
  CHAIN_ID_HEX: "0x8f",
  CHAIN_NAME: "Monad Mainnet",
  CHAIN_CURRENCY: { name: "Monad", symbol: "MON", decimals: 18 },
  // Varios RPC públicos oficiales, se usan con rotación/backup automático.
  RPC_URLS: [
    "https://rpc.monad.xyz",
    "https://rpc1.monad.xyz",
    "https://rpc2.monad.xyz",
    "https://rpc3.monad.xyz",
    "https://rpc-mainnet.monadinfra.com",
  ],
  BLOCK_EXPLORER_URLS: ["https://monadscan.com"],

  // ---- Colección NFT: r3tards --------------------------------------------
  NFT_CONTRACT_ADDRESS: "0x200723A706de0013316E5cd8EBa2b3f53DD90c29",
  NFT_TOTAL_SUPPLY_HINT: 1033, // máximo histórico conocido; no define la meta del juego
  OPENSEA_COLLECTION_URL: "https://opensea.io/collection/r3tardsnft",

  // ---- Contrato del juego (TÚ debes desplegarlo y pegar la dirección aquí) ----
  // Ver README.md → "1) Desplegar el contrato". Hasta que pongas la dirección
  // real, el botón de jugar mostrará un aviso en vez de intentar cobrar.
  GAME_CONTRACT_ADDRESS: "0x0000000000000000000000000000000000dEaD",

  // Número de bloque en el que quedó desplegado el contrato de arriba.
  // ranking.html y medallas.html lo usan como punto de partida para leer
  // los eventos ScoreSubmitted/AchievementUnlocked/AliasSet — así solo
  // escanean los bloques que SÍ pueden tener algo, en vez de la cadena
  // completa (que muchos RPCs públicos rechazan o limitan por ser un
  // rango demasiado grande). Ponlo en 0 mientras no sepas el número
  // exacto (funciona, solo es más lento de cargar); actualízalo con el
  // número de bloque real apenas despliegues el contrato (Remix te lo
  // muestra en los detalles de la transacción de deploy, o búscalo en
  // el explorador con la dirección del contrato).
  GAME_CONTRACT_DEPLOY_BLOCK: 0,

  // Dirección que recibe los fondos al hacer withdraw() en el contrato.
  // Es solo informativa aquí (el contrato ya sabe quién es el owner),
  // se usa para mostrar un texto de transparencia en el menú si quieres.
  // ⚠️ Esta debe ser también la dirección que pongas como "initialOwner"
  // al desplegar el contrato en Remix (ver README.md).
  OWNER_WALLET_DISPLAY: "0xA320dAA989Ae8d6D7813340697f4f9e75f5B78E8",

  // ---- Precio de la partida (debe coincidir con playPrice() del contrato) ----

  // ---- Multicall3 (mismo address en casi todas las redes EVM) ------------
  MULTICALL3_ADDRESS: "0xcA11bde05977b3631167028862bE2a173976CA11",

  // ---- Gateways IPFS (con fallback en orden) ------------------------------
  IPFS_GATEWAYS: [
    "https://ipfs.io/ipfs/",
    "https://nftstorage.link/ipfs/",
    "https://cloudflare-ipfs.com/ipfs/",
    "https://gateway.pinata.cloud/ipfs/",
  ],

  // ---- Cache local de metadata (para no re-leer la cadena cada visita) ---
  CACHE_KEY: "r3ap_collection_cache_v2",
  CACHE_TTL_MS: 1000 * 60 * 60 * 24, // 24 horas

  // ---- Progresión de rareza y dificultad, basada en TIEMPO real de la
  // partida (no en el puntaje) — para que una partida vaya notándose más
  // difícil MINUTO A MINUTO, y llegue a su punto más difícil (y se quede
  // ahí, el juego no tiene fin) a los `durationMinutes`.
  // Al inicio de la partida, progress01() = 0 (fácil, legendarios muy
  // raros). A los `durationMinutes`, progress01() = 1 (máximo) y ya no
  // sigue subiendo — así nunca se vuelve imposible ni absurdamente veloz.
  // IMPORTANTE: progress01() (en game.js) avanza en saltos por MINUTO
  // COMPLETO, no de forma continua — a propósito, para que el salto de
  // dificultad se note claramente cada minuto (velocidad, qué tan
  // seguido caen, qué tan probable es un raro) en vez de subir tan
  // despacio que sea imperceptible.
  SPAWN_PROGRESSION: {
    durationMinutes: 10, // 10 escalones de dificultad, uno por minuto, hasta llegar al máximo
    // (La vida/dificultad de cada NFT ya no sube igual para todos — ver
    // "hpGrowth" en cada tier, más abajo en TIERS. Los raros suben mucho
    // más que los comunes.)
    spawnIntervalStartMs: 1500, // qué tan seguido caen NFTs al inicio
    spawnIntervalMinMs: 420, // qué tan seguido caen al máximo
    // Probabilidad de que el SIGUIENTE NFT en caer sea de este tier —
    // interpolada linealmente entre "start" (inicio) y "end" (a las 3h).
    // "common" no se configura aquí: se calcula solo como 1 - el resto,
    // así siempre queda una distribución válida (nunca negativa).
    tierWeights: {
      legendary: { start: 0.001, end: 0.02 }, // 1 entre 1000 al inicio → 1 entre 50 al final
      epic: { start: 0.004, end: 0.05 },
      rare: { start: 0.02, end: 0.12 },
      uncommon: { start: 0.18, end: 0.3 },
    },
  },

  // ---- Balance de juego ----------------------------------------------------
  MAX_LIVES: 5,
  // `hp` = golpes que aguanta ese tier AL PRINCIPIO de la partida (progreso 0).
  // `hpGrowth` = cuánto más aguanta ESE tier según pasa el tiempo, aparte:
  // a progreso 1 (máximo, ver SPAWN_PROGRESSION.durationMinutes) su vida
  // pasa a ser hp * (1 + hpGrowth). Los tiers más raros suben MUCHO más
  // que los comunes — así lo común sigue siendo fácil de matar toda la
  // partida, pero un legendario tardío se vuelve un verdadero jefe.
  // NOTA: al matar legendarios el daño del jugador sube (x2 al primero,
  // x3 al segundo — ver `legendaryKills`/damageMultiplier en game.js).
  // Para que la partida no se vuelva trivial después de eso, el hp base
  // y el crecimiento de "poco común" en adelante se subieron a propósito
  // — SOLO "común" se queda igual de fácil siempre (es el tier "de
  // relleno", nunca debe sentirse injusto).
  TIERS: [
    // percentil superior de "rarityScore" que cae en cada tier (0 = el más raro posible)
    { key: "legendary", label: "LEGENDARIO", topPercent: 0.01, sizeMul: 4.0, hp: 16, hpGrowth: 16, points: 500, color: "#ffd166" },
    { key: "epic", label: "ÉPICO", topPercent: 0.05, sizeMul: 2.6, hp: 10, hpGrowth: 9, points: 220, color: "#c77dff" },
    { key: "rare", label: "RARO", topPercent: 0.15, sizeMul: 1.8, hp: 6, hpGrowth: 4.5, points: 100, color: "#5eead4" },
    { key: "uncommon", label: "POCO COMÚN", topPercent: 0.40, sizeMul: 1.3, hp: 3, hpGrowth: 2, points: 40, color: "#7cc4ff" },
    { key: "common", label: "COMÚN", topPercent: 1.00, sizeMul: 1.0, hp: 1, hpGrowth: 0.4, points: 15, color: "#c9c9d6" },
  ],
};
