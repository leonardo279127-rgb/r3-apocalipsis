/**
 * ============================================================
 *  R3 APOCALIPSIS — Lectura de eventos on-chain (ranking/logros)
 * ============================================================
 *  Sin backend propio, la única forma de reconstruir "quién tiene el
 *  mejor puntaje" o "quién desbloqueó qué logro" es leyendo los eventos
 *  que el contrato ya emitió (ScoreSubmitted, AchievementUnlocked,
 *  AliasSet — ver contracts/R3Apocalipsis.sol) directo desde cualquier
 *  navegador, sin pedirle nada a nadie.
 *
 *  El rango de bloques se parte en pedazos: muchos RPCs públicos
 *  rechazan un solo eth_getLogs que abarque demasiados bloques. Si un
 *  pedazo falla, se reduce a la mitad y se reintenta; si igual sigue
 *  fallando, se rota al siguiente RPC configurado.
 * ============================================================
 */
const R3Events = (() => {
  const CFG = window.R3_CONFIG;

  const providers = [];
  let idx = 0;

  function getProvider() {
    if (!providers[idx]) {
      providers[idx] = new ethers.JsonRpcProvider(CFG.RPC_URLS[idx], CFG.CHAIN_ID_DEC, { staticNetwork: true });
    }
    return providers[idx];
  }

  function rotate() {
    idx = (idx + 1) % CFG.RPC_URLS.length;
    return getProvider();
  }

  async function getLatestBlock() {
    let lastErr;
    for (let i = 0; i < CFG.RPC_URLS.length; i++) {
      try {
        return await getProvider().getBlockNumber();
      } catch (err) {
        lastErr = err;
        rotate();
      }
    }
    throw lastErr || new Error("No se pudo consultar el número de bloque actual en ningún RPC.");
  }

  /**
   * Lee TODOS los logs del evento `eventName` de `contract` entre
   * fromBlock y toBlock (ambos incluidos), llamando onProgress(bloquesLeidos,
   * bloquesTotales) según avanza. Devuelve los logs decodificados
   * (ethers EventLog, con .args) en orden de bloque ascendente.
   */
  async function queryLogsChunked(contract, eventName, fromBlock, toBlock, onProgress) {
    const totalBlocks = Math.max(1, toBlock - fromBlock + 1);
    const results = [];
    let cursor = fromBlock;
    let chunk = 50000;
    const MIN_CHUNK = 500;
    let rpcFailuresInARow = 0;

    while (cursor <= toBlock) {
      const end = Math.min(cursor + chunk - 1, toBlock);
      try {
        const filter = contract.filters[eventName]();
        const logs = await contract.queryFilter(filter, cursor, end);
        results.push(...logs);
        onProgress && onProgress(Math.min(end - fromBlock + 1, totalBlocks), totalBlocks);
        cursor = end + 1;
        rpcFailuresInARow = 0;
      } catch (err) {
        if (chunk > MIN_CHUNK) {
          // Muy probablemente el RPC rechazó el rango por ser demasiado
          // grande — lo partimos y reintentamos el MISMO cursor.
          chunk = Math.max(MIN_CHUNK, Math.floor(chunk / 2));
          continue;
        }
        rpcFailuresInARow++;
        if (rpcFailuresInARow >= CFG.RPC_URLS.length) {
          throw new Error(
            `No se pudieron leer los eventos ${eventName} (${(err && (err.shortMessage || err.message)) || err}).`
          );
        }
        contract = contract.connect(rotate());
        chunk = 50000; // con el RPC nuevo, volvemos a intentar en pedazos grandes
      }
    }
    return results;
  }

  return { getProvider, rotate, getLatestBlock, queryLogsChunked };
})();

window.R3Events = R3Events;
