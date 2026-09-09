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
 *    exacto (0.3/20 MON según config), visible en la wallet
 *    del usuario ANTES de que la confirme.
 * ============================================================
 */
const R3Wallet = (() => {
  const CFG = window.R3_CONFIG;
  const ABIS = window.R3_ABIS;

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
      throw new Error("No se detectó ninguna wallet (instala MetaMask u otra wallet compatible con Monad).");
    }
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    if (!accounts || accounts.length === 0) throw new Error("No se autorizó ninguna cuenta.");

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
    if (!hasInjectedWallet()) throw new Error("No se detectó ninguna wallet.");
    await ensureMonadNetwork();
    const provider = browserProvider || new ethers.BrowserProvider(window.ethereum);
    const contract = new ethers.Contract(CFG.GAME_CONTRACT_ADDRESS, ABIS.GAME, provider);
    return await contract.playPrice();
  }

  async function payToPlay() {
    if (!isContractConfigured()) {
      throw new Error(
        "El contrato del juego todavía no está configurado. (Edita GAME_CONTRACT_ADDRESS en js/config.js después de desplegarlo.)"
      );
    }
    if (!signer) throw new Error("Conecta tu wallet primero.");
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

  return { hasInjectedWallet, isContractConfigured, connect, getAddress, getPlayPrice, payToPlay, shortAddress };
})();

window.R3Wallet = R3Wallet;
