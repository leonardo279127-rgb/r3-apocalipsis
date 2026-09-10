/**
 * ============================================================
 *  R3 APOCALIPSIS — Carga de la colección r3tards on-chain
 * ============================================================
 *  - Lee tokenURI() de TODOS los NFTs directo desde Monad mainnet
 *    (usando Multicall3 para hacerlo en pocos viajes de red).
 *  - Resuelve metadata (soporta data:application/json;base64 e IPFS).
 *  - Calcula una "rareza" real a partir de la frecuencia de cada
 *    rasgo (trait) en toda la colección: entre menos común es un
 *    rasgo, más puntos de rareza suma.
 *  - Cachea el resultado en localStorage (no hay que releer 1000+
 *    tokens cada vez que alguien abre la página).
 *  - El "propietario actual" de cada NFT se consulta EN VIVO justo
 *    cuando ese NFT va a caer en la partida (no se cachea, porque
 *    eso sí cambia constantemente).
 * ============================================================
 */

const R3Loader = (() => {
  const CFG = window.R3_CONFIG;
  const ABIS = window.R3_ABIS;

  let provider = null;
  let rpcIndex = 0;
  const ownerCache = new Map(); // tokenId -> { owner, ts }
  const OWNER_TTL_MS = 45_000;

  function getProvider() {
    if (provider) return provider;
    // ethers v6: probamos el primer RPC; si falla en tiempo de uso, rotamos.
    provider = new ethers.JsonRpcProvider(CFG.RPC_URLS[rpcIndex], CFG.CHAIN_ID_DEC, {
      staticNetwork: true,
    });
    return provider;
  }

  function rotateProvider() {
    rpcIndex = (rpcIndex + 1) % CFG.RPC_URLS.length;
    provider = new ethers.JsonRpcProvider(CFG.RPC_URLS[rpcIndex], CFG.CHAIN_ID_DEC, {
      staticNetwork: true,
    });
    return provider;
  }

  function withTimeout(promise, ms, label) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`Tiempo agotado (${label || "RPC"})`)), ms);
      promise.then(
        (v) => { clearTimeout(t); resolve(v); },
        (e) => { clearTimeout(t); reject(e); }
      );
    });
  }

  function describeErr(err) {
    return (err && (err.shortMessage || err.reason || err.message)) || String(err);
  }

  /**
   * Reintenta `fn` rotando entre los RPCs configurados. Cada intento tiene
   * un límite de tiempo propio (RPC_TIMEOUT_MS) — así, si un endpoint se
   * queda "colgado" sin responder ni fallar, no bloquea la carga entera:
   * lo damos por perdido y probamos el siguiente.
   */
  async function withRetry(fn, tries = CFG.RPC_URLS.length) {
    let lastErr;
    for (let i = 0; i < tries; i++) {
      const rpcUrl = CFG.RPC_URLS[rpcIndex];
      try {
        return await withTimeout(fn(getProvider()), 12000, rpcUrl);
      } catch (err) {
        lastErr = err;
        console.warn(`R3: RPC ${rpcUrl} falló (${describeErr(err)}), probando siguiente…`);
        rotateProvider();
      }
    }
    throw lastErr;
  }

  /**
   * Devuelve la lista ORDENADA de URLs candidatas para un recurso (metadata
   * o imagen). Para ipfs:// probamos TODOS los gateways configurados, en
   * orden distinto cada vez (barajado) para no pegarle siempre al mismo
   * gateway primero y repartir la carga. Para http(s)/data: solo hay una
   * candidata.
   */
  function resolveCandidates(uri) {
    if (!uri) return [];
    if (uri.startsWith("ipfs://")) {
      const path = uri.replace("ipfs://", "").replace(/^ipfs\//, "");
      const order = CFG.IPFS_GATEWAYS.map((_, i) => i);
      // barajado simple para repartir carga entre gateways entre distintos tokens
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      return order.map((i) => CFG.IPFS_GATEWAYS[i] + path);
    }
    return [uri];
  }

  async function fetchOnce(url, timeoutMs) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } finally {
      clearTimeout(t);
    }
  }

  /**
   * Resuelve la metadata JSON de un tokenURI probando cada candidata
   * (gateways IPFS en orden barajado, o la URL directa si es http/data).
   * Un solo intento por candidata (sin reintento+espera): la redundancia
   * viene de tener varios gateways distintos, no de insistir en el mismo.
   * Esto evita que un token "atascado" tarde minuto y medio en rendirse
   * (lo que hacía que la barra pareciera colgada cerca del final, ej.
   * "1032/1033" quieto mucho rato).
   */
  async function fetchJsonWithFallback(uri) {
    if (uri.startsWith("data:application/json;base64,")) {
      const b64 = uri.split(",")[1];
      return JSON.parse(atob(b64));
    }
    if (uri.startsWith("data:application/json,")) {
      return JSON.parse(decodeURIComponent(uri.split(",")[1]));
    }
    const candidates = resolveCandidates(uri);
    let lastErr;
    for (const url of candidates) {
      try {
        return await fetchOnce(url, 6000);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error("No se pudo resolver " + uri);
  }

  /**
   * Ejecuta `fn` sobre `items` con un máximo de `limit` tareas en vuelo a
   * la vez. Evita mandar cientos de fetch() simultáneos a los gateways de
   * IPFS (que responden con rate-limit / timeouts si los saturas), que es
   * la causa más común de que "no carguen las imágenes ni los nombres".
   */
  async function mapWithConcurrency(items, limit, fn, onEach) {
    let idx = 0;
    let done = 0;
    async function worker() {
      while (idx < items.length) {
        const cur = idx++;
        await fn(items[cur], cur);
        done++;
        onEach && onEach(done);
      }
    }
    const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
    await Promise.all(workers);
  }

  function loadCache() {
    try {
      const raw = localStorage.getItem(CFG.CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed.ts || Date.now() - parsed.ts > CFG.CACHE_TTL_MS) return null;
      if (!Array.isArray(parsed.items) || parsed.items.length === 0) return null;
      return parsed.items;
    } catch {
      return null;
    }
  }

  function saveCache(items) {
    try {
      localStorage.setItem(CFG.CACHE_KEY, JSON.stringify({ ts: Date.now(), items }));
    } catch {
      // localStorage lleno o bloqueado: no es crítico, seguimos sin cache.
    }
  }

  async function getTotalSupply() {
    try {
      const num = await withRetry(async (prov) => {
        const erc721 = new ethers.Contract(CFG.NFT_CONTRACT_ADDRESS, ABIS.ERC721, prov);
        return Number(await erc721.totalSupply());
      });
      if (num > 0 && num < 200000) return num;
    } catch (err) {
      console.warn("R3: no se pudo leer totalSupply() en ningún RPC, usando el valor de respaldo.", describeErr(err));
    }
    return CFG.NFT_TOTAL_SUPPLY_HINT;
  }

  function encodeTokenURICall(iface, tokenId) {
    return iface.encodeFunctionData("tokenURI", [tokenId]);
  }

  function encodeOwnerOfCall(iface, tokenId) {
    return iface.encodeFunctionData("ownerOf", [tokenId]);
  }

  /**
   * Lee tokenURI(id) para un rango de ids usando Multicall3 (allowFailure=true
   * por id, así un solo token inexistente/roto no tumba el lote completo).
   */
  async function multicallTokenURIs(ids) {
    const erc721Iface = new ethers.Interface(ABIS.ERC721);
    const calls = ids.flatMap((id) => [
      { target: CFG.NFT_CONTRACT_ADDRESS, allowFailure: true, callData: encodeTokenURICall(erc721Iface, id) },
      { target: CFG.NFT_CONTRACT_ADDRESS, allowFailure: true, callData: encodeOwnerOfCall(erc721Iface, id) },
    ]);

    return withRetry(async (prov) => {
      const multicall = new ethers.Contract(CFG.MULTICALL3_ADDRESS, ABIS.MULTICALL3, prov);
      const results = await multicall.aggregate3.staticCall(calls);
      return ids.map((id, i) => {
        const tokenResult = results[i * 2];
        const ownerResult = results[i * 2 + 1];
        let uri = null;
        if (tokenResult.success) {
          try {
            [uri] = erc721Iface.decodeFunctionResult("tokenURI", tokenResult.returnData);
          } catch {}
        }
        let exists = false;
        if (ownerResult.success) {
          try {
            erc721Iface.decodeFunctionResult("ownerOf", ownerResult.returnData);
            exists = true;
          } catch {}
        }
        return { id, uri, exists };
      });
    });
  }

  function computeRarity(items) {
    // Frecuencia de cada (trait_type -> value) en toda la colección cargada.
    const freq = new Map();
    for (const it of items) {
      for (const attr of it.attributes) {
        const key = attr.trait_type + "::" + attr.value;
        freq.set(key, (freq.get(key) || 0) + 1);
      }
    }
    const n = items.length;
    for (const it of items) {
      let score = 0;
      for (const attr of it.attributes) {
        const key = attr.trait_type + "::" + attr.value;
        const f = freq.get(key) || 1;
        score += n / f; // rasgo más escaso => más puntos
      }
      it.rarityScore = score;
    }
    // Rankeamos de más raro (score alto) a más común.
    const sorted = [...items].sort((a, b) => b.rarityScore - a.rarityScore);
    sorted.forEach((it, idx) => {
      const percentile = (idx + 1) / n;
      const tier = CFG.TIERS.find((t) => percentile <= t.topPercent) || CFG.TIERS[CFG.TIERS.length - 1];
      it.rarityTier = tier.key;
      it.rarityRank = idx + 1;
    });

    // Los 1/1 "Certified" (piezas únicas con nombre propio) se fuerzan a
    // legendario y guardan su nombre propio — ver el mismo bloque en
    // tools/build-collection.mjs (debe hacer EXACTAMENTE lo mismo, esto
    // es el respaldo cuando no existe el snapshot estático).
    for (const it of items) {
      const certAttr = it.attributes.find((a) => a.trait_type === "Certified");
      if (certAttr) {
        it.rarityTier = "legendary";
        it.certifiedName = certAttr.value;
      }
    }
    return items;
  }

  /**
   * Carga la colección completa (con cache). Llama onProgress(loaded, total)
   * mientras trabaja para poder mostrar una barra de progreso.
   *
   * Dos fases, para no saturar RPC/gateways (que es lo que causaba que
   * faltaran imágenes y nombres):
   *   1) Leer tokenURI() de todos los tokens vía Multicall3 (pocos viajes).
   *   2) Resolver la metadata (JSON + imagen) con concurrencia limitada y
   *      reintentos/gateways alternos por token.
   */
  /**
   * Snapshot pre-generado (ver tools/build-collection.mjs → web/data/collection.json).
   * Si existe, se usa de una vez — es un archivo del propio sitio, así que
   * carga casi instantáneo, sin tocar la cadena ni gateways de IPFS.
   */
  async function loadStaticSnapshot() {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch("data/collection.json", { signal: ctrl.signal, cache: "no-cache" });
      clearTimeout(t);
      if (!res.ok) return null;
      const json = await res.json();
      const items = Array.isArray(json) ? json : json.items;
      if (!Array.isArray(items) || items.length === 0) return null;
      if (!Array.isArray(json) && json.contract && json.contract.toLowerCase() !== CFG.NFT_CONTRACT_ADDRESS.toLowerCase()) return null;
      if (!Array.isArray(json) && Number.isFinite(Number(json.totalSupply)) && items.length !== Number(json.totalSupply)) return null;
      if (!Array.isArray(json) && Number.isFinite(Number(json.resolvedCount)) && Number(json.resolvedCount) !== items.length) return null;
      return items;
    } catch {
      return null; // no existe todavía o falló: seguimos con el respaldo on-chain
    }
  }

  async function loadCollection(onProgress) {
    // El snapshot estático (data/collection.json) se revisa PRIMERO, antes
    // que la copia guardada en localStorage. Es una petición chica y del
    // mismo sitio, así que revisarla siempre no cuesta nada en velocidad —
    // pero evita el bug de quedarnos sirviendo una copia vieja en caché
    // (por ejemplo, de antes de que las imágenes se re-alojaran
    // localmente) hasta por 24h después de publicar una versión nueva.
    const snapshot = await loadStaticSnapshot();
    if (snapshot) {
      onProgress && onProgress(snapshot.length, snapshot.length);
      saveCache(snapshot); // sobreescribe cualquier copia vieja en caché
      return snapshot;
    }

    const cached = loadCache();
    if (cached) {
      onProgress && onProgress(cached.length, cached.length);
      return cached;
    }

    const totalSupply = await getTotalSupply();
    // totalSupply() puede ser menor que el mayor tokenId cuando hubo burns.
    // La colección r3tards usa IDs históricos 1..1033, así que escaneamos hasta el hint
    // y usamos ownerOf() para distinguir IDs quemados/inexistentes de errores.
    const maxTokenId = Math.max(CFG.NFT_TOTAL_SUPPLY_HINT, totalSupply);
    const ids = Array.from({ length: maxTokenId }, (_, i) => i + 1);
    const BATCH = 40;
    const uriEntries = []; // { id, uri }

    // onProgress(loaded, total, phase) — "loaded" y "total" son SIEMPRE la
    // cantidad real de tokens (nunca más que el tamaño de la colección),
    // aunque haya dos fases internas. "phase" deja mostrar una etiqueta
    // distinta para cada una sin inventar un número más grande.

    // ---- Fase 1: tokenURI() de todos los ids ----
    // Si el PRIMER lote falla contra TODOS los RPCs configurados, no tiene
    // sentido seguir intentando 25 lotes más (cada uno probando los mismos
    // 5 endpoints) — eso es lo que hacía que "cargando" se quedara colgado
    // varios minutos. En vez de eso, fallamos rápido con un mensaje claro.
    // Si un lote (que no sea el primero) falla contra TODOS los RPCs, esos
    // ids NO se cuentan como "quemados/inexistentes" (bug real corregido
    // aquí: antes se colaban silenciosamente como si no existieran, y el
    // usuario terminaba viendo el mensaje genérico y confuso de "la
    // colección está incompleta" en vez de enterarse de que fue un corte
    // de RPC a mitad de la carga). Se cuentan aparte y se avisa con
    // claridad al final.
    let rpcFailedCount = 0;
    for (let i = 0; i < ids.length; i += BATCH) {
      const batchIds = ids.slice(i, i + BATCH);
      let batchResults = [];
      try {
        batchResults = await multicallTokenURIs(batchIds);
      } catch (err) {
        if (i === 0) {
          throw new Error(
            `No se pudo conectar a ningún RPC de Monad (${describeErr(err)}). Puede ser tu red/firewall bloqueando esos dominios, o que los RPC públicos estén saturados en este momento. Revisa la consola del navegador (F12) para más detalle, o intenta de nuevo en unos minutos.`
          );
        }
        rpcFailedCount += batchIds.length;
        batchResults = batchIds.map((id) => ({ id, uri: null, exists: null }));
      }
      for (const r of batchResults) {
        if (r.uri) uriEntries.push(r);
        else if (r.exists) {
          throw new Error(`El token #${r.id} existe pero tokenURI() no respondió correctamente.`);
        }
        // exists === false: token inexistente/burned, no se agrega a la
        // colección. exists === null: no se sabe (falló el RPC en este
        // lote), ver rpcFailedCount más abajo — nunca se trata como burned.
      }
      onProgress && onProgress(Math.min(i + BATCH, ids.length), ids.length, "uri");
    }

    if (rpcFailedCount > 0) {
      throw new Error(
        `No se pudieron leer ${rpcFailedCount} tokens: los RPC de Monad dejaron de responder a mitad de la carga (probablemente saturados o caídos un momento). Intenta de nuevo en unos minutos.`
      );
    }

    if (uriEntries.length !== totalSupply) {
      throw new Error(`La colección está incompleta: ${uriEntries.length} tokens resueltos, totalSupply() indica ${totalSupply}.`);
    }

    if (uriEntries.length === 0) {
      throw new Error(
        "Se pudo hablar con la cadena pero ningún token devolvió tokenURI() válido. Revisa que NFT_CONTRACT_ADDRESS en config.js sea el correcto."
      );
    }

    // ---- Fase 2: resolver metadata + imagen, con concurrencia limitada ----
    const rawItems = [];
    const failed = [];
    const metaPromise = mapWithConcurrency(
      uriEntries,
      6, // máximo de resoluciones en vuelo a la vez (evita rate-limit de gateways IPFS)
      async ({ id, uri }) => {
        try {
          const meta = await fetchJsonWithFallback(uri);
          rawItems.push({
            tokenId: id,
            name: meta.name || `r3tards #${id}`,
            image: meta.image || "", // se guarda SIN resolver a un gateway fijo
            attributes: Array.isArray(meta.attributes)
              ? meta.attributes.map((a) => ({ trait_type: a.trait_type || "Rasgo", value: String(a.value) }))
              : [],
          });
        } catch {
          failed.push(id); // token individual no resoluble tras varios gateways: se omite
        }
      },
      (done) => onProgress && onProgress(done, uriEntries.length, "metadata")
    );

    await metaPromise;

    if (rawItems.length === 0) {
      throw new Error(
        "No se pudo resolver la metadata/imágenes de r3tards (posible bloqueo de red hacia los gateways IPFS). Inténtalo de nuevo."
      );
    }
    if (failed.length > 0) {
      throw new Error(`No se pudo resolver la metadata de ${failed.length} tokens activos: ${failed.join(", ")}`);
    }
    if (rawItems.length !== totalSupply) {
      throw new Error(`La metadata está incompleta: ${rawItems.length}/${totalSupply} tokens.`);
    }

    const withRarity = computeRarity(rawItems);
    saveCache(withRarity);
    return withRarity;
  }

  /**
   * Owner actual en vivo (con cache corto en memoria para no golpear el RPC
   * si el mismo token vuelve a aparecer segundos después).
   */
  async function getCurrentOwner(tokenId) {
    const hit = ownerCache.get(tokenId);
    if (hit && Date.now() - hit.ts < OWNER_TTL_MS) return hit.owner;
    try {
      const owner = await withRetry(async (prov) => {
        const erc721 = new ethers.Contract(CFG.NFT_CONTRACT_ADDRESS, ABIS.ERC721, prov);
        return erc721.ownerOf(tokenId);
      });
      ownerCache.set(tokenId, { owner, ts: Date.now() });
      return owner;
    } catch {
      return null; // se muestra "desconocido" en el HUD, no bloquea el juego
    }
  }

  function shortenAddress(addr) {
    if (!addr) return "??????";
    return addr.slice(0, 6) + "…" + addr.slice(-4);
  }

  return { loadCollection, getCurrentOwner, shortenAddress, getProvider, resolveCandidates };
})();

window.R3Loader = R3Loader;
