/**
 * ============================================================
 *  R3 APOCALIPSIS — Wallet y pago on-chain
 * ============================================================
 *  - Conecta una wallet inyectada (MetaMask, Rabby, OKX, etc.)
 *  - Asegura que esté en Monad Mainnet (chainId 143), agregando
 *    la red si el usuario no la tiene todavía.
 *  - Llama playGame() pagando exactamente el precio configurado.
 *
 *  Seguridad, a propósito:
 *  - Nunca pedimos approve() de ningún token.
 *  - Nunca pedimos firmar mensajes "a ciegas".
 *  - La única transacción posible es playGame() con el valor
 *    exacto (10 MON, o el que tenga configurado el contrato), visible en la wallet
 *    del usuario ANTES de que la confirme.
 * ============================================================
 */
const R3Wallet = (() => {
  const CFG = window.R3_CONFIG;
  const ABIS = window.R3_ABIS;
  const I18N = window.R3I18N;

  let browserProvider = null;
  let signer = null;
  let currentAddress = null;

  const PLACEHOLDER_ADDR = "0x0000000000000000000000000000000000dEaD";

  function hasInjectedWallet() {
    return typeof window.ethereum !== "undefined";
  }

  function isContractConfigured() {
    return CFG.GAME_CONTRACT_ADDRESS && CFG.GAME_CONTRACT_ADDRESS.toLowerCase() !== PLACEHOLDER_ADDR.toLowerCase();
  }

  async function ensureMonadNetwork() {
    const chainIdHex = await window.ethereum.request({ method: "eth_chainId" });
    if (chainIdHex.toLowerCase() === CFG.CHAIN_ID_HEX.toLowerCase()) return;

    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CFG.CHAIN_ID_HEX }],
      });
    } catch (switchErr) {
      if (switchErr && (switchErr.code === 4902 || String(switchErr.message || "").includes("Unrecognized chain"))) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: CFG.CHAIN_ID_HEX,
              chainName: CFG.CHAIN_NAME,
              nativeCurrency: CFG.CHAIN_CURRENCY,
              rpcUrls: CFG.RPC_URLS,
              blockExplorerUrls: CFG.BLOCK_EXPLORER_URLS,
            },
          ],
        });
      } else {
        throw switchErr;
      }
    }
  }

  async function connect() {
    if (!hasInjectedWallet()) {
      throw new Error(I18N.t("err.no_wallet_detected"));
    }
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    if (!accounts || accounts.length === 0) throw new Error(I18N.t("err.no_account_authorized"));

    await ensureMonadNetwork();

    browserProvider = new ethers.BrowserProvider(window.ethereum);
    signer = await browserProvider.getSigner();
    currentAddress = await signer.getAddress();

    window.ethereum.removeAllListeners?.("accountsChanged");
    window.ethereum.removeAllListeners?.("chainChanged");
    window.ethereum.on?.("accountsChanged", () => window.location.reload());
    window.ethereum.on?.("chainChanged", () => window.location.reload());

    return currentAddress;
  }

  function getAddress() {
    return currentAddress;
  }

  async function getPlayPrice() {
    if (!isContractConfigured()) return null;
    if (!hasInjectedWallet()) throw new Error(I18N.t("err.no_wallet_short"));
    await ensureMonadNetwork();
    const provider = browserProvider || new ethers.BrowserProvider(window.ethereum);
    const contract = new ethers.Contract(CFG.GAME_CONTRACT_ADDRESS, ABIS.GAME, provider);
    return await contract.playPrice();
  }

  async function payToPlay() {
    if (!isContractConfigured()) {
      throw new Error(I18N.t("err.contract_not_configured"));
    }
    if (!signer) throw new Error(I18N.t("err.connect_wallet_first"));
    await ensureMonadNetwork();

    const contract = new ethers.Contract(CFG.GAME_CONTRACT_ADDRESS, ABIS.GAME, signer);
    // El contrato es la fuente de verdad. Así el frontend sigue funcionando
    // si el owner cambia el precio con setPlayPrice().
    const value = await contract.playPrice();
    const tx = await contract.playGame({ value });
    const receipt = await tx.wait();
    return receipt;
  }

  function shortAddress(addr) {
    if (!addr) return "";
    return addr.slice(0, 6) + "…" + addr.slice(-4);
  }

  // ------------------------------------------------------------------
  // Ranking global, logros y r3tards cazados — cada función de abajo
  // dispara UNA transacción visible en la wallet (nunca se firma/envía
  // nada en silencio: la wallet del jugador SIEMPRE muestra el popup de
  // confirmación de siempre, esto no cambia eso, solo dispara ese popup
  // automáticamente en vez de esperar a que el jugador apriete un botón
  // aparte). setAlias() sigue siendo manual (el jugador elige cuándo
  // ponerse un alias); recordMatch() en cambio se llama sola al terminar
  // cada partida (ver main.js) — puntaje, logros nuevos y qué r3tards se
  // cazaron, TODO junto en una sola transacción/firma.
  // ------------------------------------------------------------------

  function requireReadyContract() {
    if (!isContractConfigured()) {
      throw new Error(I18N.t("err.contract_not_configured"));
    }
    if (!signer) throw new Error(I18N.t("err.connect_wallet_first"));
  }

  /** Pone/cambia el alias público on-chain (para el ranking). */
  async function setPlayerAlias(newAlias) {
    requireReadyContract();
    await ensureMonadNetwork();
    const contract = new ethers.Contract(CFG.GAME_CONTRACT_ADDRESS, ABIS.GAME, signer);
    const tx = await contract.setAlias(newAlias);
    return await tx.wait();
  }

  /** Lee el alias on-chain de cualquier wallet (solo lectura, sin costo). */
  async function getPlayerAlias(address) {
    if (!isContractConfigured()) return "";
    const provider = browserProvider || new ethers.BrowserProvider(window.ethereum);
    const contract = new ethers.Contract(CFG.GAME_CONTRACT_ADDRESS, ABIS.GAME, provider);
    return await contract.playerAlias(address);
  }

  /** Lee el mejor puntaje on-chain de cualquier wallet (solo lectura). */
  async function getBestScore(address) {
    if (!isContractConfigured()) return 0n;
    const provider = browserProvider || new ethers.BrowserProvider(window.ethereum);
    const contract = new ethers.Contract(CFG.GAME_CONTRACT_ADDRESS, ABIS.GAME, provider);
    return await contract.bestScore(address);
  }

  /** Lee el bitmask de logros on-chain de cualquier wallet (solo lectura). */
  async function getAchievementsMask(address) {
    if (!isContractConfigured()) return 0n;
    const provider = browserProvider || new ethers.BrowserProvider(window.ethereum);
    const contract = new ethers.Contract(CFG.GAME_CONTRACT_ADDRESS, ABIS.GAME, provider);
    return await contract.achievementsMask(address);
  }

  /** ¿Ya murió este r3tard (tokenId) alguna vez, en manos de cualquier
   * jugador? Lectura directa (solo lectura, gratis) del bitmap on-chain —
   * usado por la página de colección para casos puntuales; para pintar
   * la colección COMPLETA es más eficiente leer los eventos TokenKilled
   * una sola vez (ver js/onchain-events.js), no token por token. */
  async function isEverKilledGlobally(tokenId) {
    if (!isContractConfigured()) return false;
    const provider = browserProvider || new ethers.BrowserProvider(window.ethereum);
    const contract = new ethers.Contract(CFG.GAME_CONTRACT_ADDRESS, ABIS.GAME, provider);
    return await contract.isEverKilledGlobally(tokenId);
  }

  /**
   * Guarda TODO el progreso de la partida que acaba de terminar, en UNA
   * sola transacción/firma (ver recordMatch() en el contrato): el
   * puntaje (si es récord propio), los logros nuevos, y qué r3tards se
   * cazaron por primera vez en la historia del juego (para la página de
   * colección). Se llama SOLA al terminar cada partida — ver main.js.
   *
   * `killedTokens` es un array de `{ tokenId, tierCode }` (tierCode ya
   * numérico, 0=común..4=legendario — ver R3_CONFIG.TIER_CHAIN_CODE en
   * config.js). Se separa aquí mismo en dos arrays paralelos porque así
   * es como los espera el contrato (más barato en gas que un array de
   * structs).
   */
  async function recordMatch(score, newAchievementIds, killedTokens) {
    requireReadyContract();
    await ensureMonadNetwork();
    const contract = new ethers.Contract(CFG.GAME_CONTRACT_ADDRESS, ABIS.GAME, signer);
    const killedTokenIds = (killedTokens || []).map((k) => k.tokenId);
    const killedTiers = (killedTokens || []).map((k) => k.tierCode);
    const tx = await contract.recordMatch(score, newAchievementIds || [], killedTokenIds, killedTiers);
    return await tx.wait();
  }

  // ------------------------------------------------------------------
  // Tarjeta de jugador (NFT ERC-721 intransferible) — se mintea SOLA y
  // GRATIS (solo el gas) la primera vez que se guarda un alias, puntaje o
  // logro (ver setAlias/submitScore/unlockAchievements en el contrato).
  // mintCard() de aquí abajo es solo para quien la quiera mintear a mano,
  // antes de haber guardado cualquiera de esas tres cosas.
  // ------------------------------------------------------------------

  /** Mintea tu tarjeta directamente. Gratis (solo gas). No falla si ya la tenías. */
  async function mintCard() {
    requireReadyContract();
    await ensureMonadNetwork();
    const contract = new ethers.Contract(CFG.GAME_CONTRACT_ADDRESS, ABIS.GAME, signer);
    const tx = await contract.mintCard();
    return await tx.wait();
  }

  /** ¿Esta wallet ya tiene su tarjeta minteada? (solo lectura) */
  async function hasCard(address) {
    if (!isContractConfigured()) return false;
    const provider = browserProvider || new ethers.BrowserProvider(window.ethereum);
    const contract = new ethers.Contract(CFG.GAME_CONTRACT_ADDRESS, ABIS.GAME, provider);
    return await contract.hasCard(address);
  }

  /** El tokenId que le corresponde a una wallet (exista ya la tarjeta o no). */
  async function tokenIdOf(address) {
    if (!isContractConfigured()) return null;
    const provider = browserProvider || new ethers.BrowserProvider(window.ethereum);
    const contract = new ethers.Contract(CFG.GAME_CONTRACT_ADDRESS, ABIS.GAME, provider);
    return await contract.tokenIdOf(address);
  }

  /**
   * Revisa el recibo de CUALQUIER transacción de este contrato (setAlias,
   * submitScore, unlockAchievements, mintCard) y dice si esa transacción
   * en particular acabó minteando la tarjeta (primera vez para esa
   * wallet). Útil para mostrar un aviso especial solo esa vez.
   */
  function wasCardMinted(receipt) {
    if (!receipt || !receipt.logs) return false;
    const iface = new ethers.Interface(ABIS.GAME);
    return receipt.logs.some((log) => {
      try {
        return iface.parseLog(log)?.name === "CardMinted";
      } catch {
        return false;
      }
    });
  }

  return {
    hasInjectedWallet,
    isContractConfigured,
    connect,
    getAddress,
    getPlayPrice,
    payToPlay,
    shortAddress,
    setPlayerAlias,
    getPlayerAlias,
    getBestScore,
    recordMatch,
    getAchievementsMask,
    isEverKilledGlobally,
    mintCard,
    hasCard,
    tokenIdOf,
    wasCardMinted,
  };
})();

window.R3Wallet = R3Wallet;
