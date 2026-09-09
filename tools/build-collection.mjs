/**
 * ============================================================
 *  R3 APOCALIPSIS — build-collection.mjs
 * ============================================================
 *  Genera web/data/collection.json: un "snapshot" ya resuelto de
 *  toda la colección r3tards (nombre, imagen, rasgos y rareza de
 *  cada token) para que el JUEGO NO TENGA QUE LEER LA CADENA cada
 *  vez que alguien abre la página.
 *
 *  Por qué existe esto:
 *  - Leer tokenURI() de 1000+ tokens y resolver su metadata/imagen
 *    en el navegador de cada jugador es lento (varios segundos a
 *    minutos) y depende de que los gateways públicos de IPFS
 *    respondan rápido en ese momento.
 *  - Esta metadata casi nunca cambia (los rasgos/imagen de un NFT
 *    ya minteado son fijos). Así que lo resolvemos UNA VEZ aquí,
 *    con tu propia conexión, y lo guardamos como archivo estático.
 *  - El juego (web/js/nft-loader.js) intenta cargar primero este
 *    archivo — casi instantáneo — y solo si no existe o falla,
 *    cae de respaldo a leer la cadena en vivo (el comportamiento
 *    original).
 *  - El "dueño actual" de cada NFT NO se guarda aquí a propósito
 *    (eso sí cambia todo el tiempo) — se sigue consultando en vivo
 *    justo cuando el NFT cae en la partida.
 *
 *  Cómo usarlo:
 *    cd tools
 *    npm install
 *    npm run build
 *  Esto crea/actualiza ../web/data/collection.json. Súbelo junto
 *  con el resto de la carpeta web/ a donde publiques el juego.
 *
 *  ¿Cuándo hay que volver a correrlo? Solo si la colección cambia
 *  (por ejemplo, se mintean tokens nuevos). Para r3tards, que ya
 *  está completa (1033/1033), probablemente nunca más haga falta.
 * ============================================================
 */
import { ethers } from "ethers";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ---- Mantener en sync con web/js/config.js ------------------------------
const NFT_CONTRACT_ADDRESS = "0x200723A706de0013316E5cd8EBa2b3f53DD90c29";
const NFT_TOTAL_SUPPLY_HINT = 1033;
const CHAIN_ID_DEC = 143;
const RPC_URLS = [
  "https://rpc.monad.xyz",
  "https://rpc1.monad.xyz",
  "https://rpc2.monad.xyz",
  "https://rpc3.monad.xyz",
  "https://rpc-mainnet.monadinfra.com",
];
const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";
const IPFS_GATEWAYS = [
  "https://ipfs.io/ipfs/",
  "https://nftstorage.link/ipfs/",
  "https://cloudflare-ipfs.com/ipfs/",
  "https://gateway.pinata.cloud/ipfs/",
];
const TIERS = [
  { key: "legendary", topPercent: 0.01 },
  { key: "epic", topPercent: 0.05 },
  { key: "rare", topPercent: 0.15 },
  { key: "uncommon", topPercent: 0.40 },
  { key: "common", topPercent: 1.00 },
];

const ERC721_ABI = [
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
];
const MULTICALL3_ABI = [
  "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[] returnData)",
];

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, "..", "web", "data", "collection.json");
const IMAGES_DIR = join(__dirname, "..", "web", "data", "images");

let rpcIndex = 0;
function getProvider() {
  return new ethers.JsonRpcProvider(RPC_URLS[rpcIndex % RPC_URLS.length], CHAIN_ID_DEC, { staticNetwork: true });
}
async function withRetry(fn, tries = RPC_URLS.length) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn(getProvider());
    } catch (err) {
      lastErr = err;
      rpcIndex++;
    }
  }
  throw lastErr;
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function resolveCandidates(uri) {
  if (!uri) return [];
  if (uri.startsWith("ipfs://")) {
    const path = uri.replace("ipfs://", "").replace(/^ipfs\//, "");
    return IPFS_GATEWAYS.map((g) => g + path);
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

async function fetchJsonWithFallback(uri) {
  if (uri.startsWith("data:application/json;base64,")) {
    return JSON.parse(Buffer.from(uri.split(",")[1], "base64").toString("utf8"));
  }
  if (uri.startsWith("data:application/json,")) {
    return JSON.parse(decodeURIComponent(uri.split(",")[1]));
  }
  const candidates = resolveCandidates(uri);
  let lastErr;
  for (const url of candidates) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await fetchOnce(url, 12000);
      } catch (err) {
        lastErr = err;
        if (attempt === 0) await sleep(300 + Math.random() * 300);
      }
    }
  }
  throw lastErr || new Error("No se pudo resolver " + uri);
}

async function mapWithConcurrency(items, limit, fn, onEach) {
  let idx = 0;
  let done = 0;
  async function worker() {
    while (idx < items.length) {
      const cur = idx++;
      await fn(items[cur], cur);
      done++;
      onEach && onEach(done, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

async function getTotalSupply() {
  try {
    const erc721 = new ethers.Contract(NFT_CONTRACT_ADDRESS, ERC721_ABI, getProvider());
    const n = Number(await erc721.totalSupply());
    if (n > 0 && n < 200000) return n;
  } catch {
    /* algunos contratos no exponen totalSupply públicamente */
  }
  return NFT_TOTAL_SUPPLY_HINT;
}

async function multicallTokenURIs(ids) {
  const iface = new ethers.Interface(ERC721_ABI);
  const calls = ids.flatMap((id) => [
    {
      target: NFT_CONTRACT_ADDRESS,
      allowFailure: true,
      callData: iface.encodeFunctionData("tokenURI", [id]),
    },
    {
      target: NFT_CONTRACT_ADDRESS,
      allowFailure: true,
      callData: iface.encodeFunctionData("ownerOf", [id]),
    },
  ]);

  return withRetry(async (prov) => {
    const multicall = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, prov);
    const results = await multicall.aggregate3.staticCall(calls);
    const out = [];

    for (let i = 0; i < ids.length; i++) {
      const tokenResult = results[i * 2];
      const ownerResult = results[i * 2 + 1];
      let uri = null;
      let tokenUriReadable = false;
      let ownerReadable = false;

      if (tokenResult.success) {
        try {
          [uri] = iface.decodeFunctionResult("tokenURI", tokenResult.returnData);
          tokenUriReadable = Boolean(uri);
        } catch {
          tokenUriReadable = false;
        }
      }

      if (ownerResult.success) {
        try {
          iface.decodeFunctionResult("ownerOf", ownerResult.returnData);
          ownerReadable = true;
        } catch {
          ownerReadable = false;
        }
      }

      // Si ownerOf también revierte, el ID no existe actualmente (por ejemplo,
      // fue quemado). Si ownerOf existe pero tokenURI falla, no ocultamos el
      // problema: ese token está activo y el build debe fallar.
      out.push({
        id: ids[i],
        uri: tokenUriReadable ? uri : null,
        exists: ownerReadable,
        tokenUriReadable,
      });
    }

    return out;
  });
}

function computeRarity(items) {
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
      score += n / (freq.get(key) || 1);
    }
    it.rarityScore = Math.round(score * 100) / 100;
  }
  const sorted = [...items].sort((a, b) => b.rarityScore - a.rarityScore);
  sorted.forEach((it, idx) => {
    const percentile = (idx + 1) / n;
    const tier = TIERS.find((t) => percentile <= t.topPercent) || TIERS[TIERS.length - 1];
    it.rarityTier = tier.key;
    it.rarityRank = idx + 1;
  });
  return items;
}

function extFromContentType(ct) {
  if (!ct) return "img";
  if (ct.includes("png")) return "png";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("gif")) return "gif";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("svg")) return "svg";
  return "img";
}

/**
 * Descarga la imagen de un token UNA VEZ, aquí (en los servidores de
 * GitHub, con conexión limpia), y la guarda como archivo normal dentro
 * de web/data/images/. Por qué esto es necesario y no solo un extra:
 * cuando el juego pide la imagen con crossOrigin="anonymous" (para poder
 * "recortarla" a su silueta), el navegador exige que el gateway de IPFS
 * responda con encabezados CORS correctos — y muchos gateways públicos
 * NO los mandan. El resultado es que la imagen nunca carga en el
 * navegador del jugador (se ve en blanco), sin importar timeouts,
 * reintentos ni qué tan buena sea su conexión — es una restricción del
 * propio navegador, no una falla de red.
 *
 * Al descargarla aquí con fetch() normal (sin política CORS de por
 * medio, porque esto no corre en un navegador) y servirla luego como un
 * archivo más del propio sitio (mismo origen), el navegador del jugador
 * ya no depende de esos encabezados para nada: es un archivo local como
 * cualquier otro.
 */
async function downloadImage(tokenId, uri) {
  if (!uri) return "";
  if (uri.startsWith("data:")) {
    const match = uri.match(/^data:([^;,]+)(;base64)?,(.*)$/s);
    if (!match) return "";
    const [, mime, isB64, payload] = match;
    const ext = extFromContentType(mime);
    const buf = isB64 ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload), "utf8");
    const filename = `${tokenId}.${ext}`;
    await writeFile(join(IMAGES_DIR, filename), buf);
    return `data/images/${filename}`;
  }
  const candidates = resolveCandidates(uri);
  for (const url of candidates) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) continue;
      const ct = res.headers.get("content-type") || "";
      const ext = extFromContentType(ct);
      const buf = Buffer.from(await res.arrayBuffer());
      const filename = `${tokenId}.${ext}`;
      await writeFile(join(IMAGES_DIR, filename), buf);
      return `data/images/${filename}`;
    } catch {
      clearTimeout(t);
      // probamos la siguiente candidata (otro gateway)
    }
  }
  return ""; // ninguna candidata funcionó; el build principal abortará y no publicará una colección incompleta
}

function progressLine(label, done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  process.stdout.write(`\r${label} ${done}/${total} (${pct}%)   `);
}

async function main() {
  console.log(`R3 Apocalipsis — construyendo snapshot de la colección r3tards`);
  console.log(`Contrato: ${NFT_CONTRACT_ADDRESS} (Monad mainnet)\n`);

  const totalSupply = await getTotalSupply();
  // totalSupply() es la cantidad ACTUAL de NFTs vivos. La colección tuvo 1033
  // IDs acuñados y puede tener burns, por lo que no podemos usar totalSupply
  // como límite de token IDs: si hay 1031 vivos, #1032/#1033 seguirán siendo
  // IDs válidos históricamente y podríamos omitir un NFT vivo de ID alto.
  const maxTokenId = Math.max(NFT_TOTAL_SUPPLY_HINT, totalSupply);
  console.log(`Total supply actual: ${totalSupply}`);
  console.log(`Máximo token ID a escanear: ${maxTokenId}`);
  const ids = Array.from({ length: maxTokenId }, (_, i) => i + 1);

  // ---- Fase 1: tokenURI() de todos los ids ----
  const uriEntries = [];
  const BATCH = 40;
  for (let i = 0; i < ids.length; i += BATCH) {
    const batchIds = ids.slice(i, i + BATCH);
    let results = [];
    results = await multicallTokenURIs(batchIds);
    for (const r of results) {
      if (r.uri) {
        uriEntries.push(r);
      } else if (r.exists) {
        throw new Error(`El token #${r.id} existe, pero tokenURI() no pudo resolverse. No se publica una colección incompleta.`);
      }
      // exists=false: ID no existente/burned. Se ignora correctamente.
    }
    progressLine("Leyendo tokenURI()  ", Math.min(i + BATCH, ids.length), ids.length);
  }
  console.log(`\n${uriEntries.length} tokens activos con tokenURI de ${totalSupply} en totalSupply().`);

  if (uriEntries.length !== totalSupply) {
    throw new Error(`Integridad on-chain incorrecta: se resolvieron ${uriEntries.length} tokens, pero totalSupply() reporta ${totalSupply}.`);
  }

  // ---- Fase 2: resolver metadata + imagen ----
  const rawItems = [];
  let failed = [];
  const uriById = new Map(uriEntries.map((e) => [e.id, e.uri]));
  async function resolveMetadataBatch(entries) {
    const stillFailed = [];
    await mapWithConcurrency(
      entries,
      8,
      async ({ id, uri }) => {
        try {
          const meta = await fetchJsonWithFallback(uri);
          rawItems.push({
            tokenId: id,
            name: meta.name || `r3tards #${id}`,
            image: meta.image || "",
            attributes: Array.isArray(meta.attributes)
              ? meta.attributes.map((a) => ({ trait_type: a.trait_type || "Rasgo", value: String(a.value) }))
              : [],
          });
        } catch {
          stillFailed.push(id);
        }
      },
      (done, totalDone) => progressLine("Resolviendo metadata", done, totalDone)
    );
    return stillFailed;
  }
  failed = await resolveMetadataBatch(uriEntries);
  // Los gateways públicos de IPFS son flakeados por naturaleza (rate-limit
  // momentáneo, timeout puntual) — un puñado de fallos en la primera pasada
  // no significa que el token esté realmente roto. Antes de rendirnos y
  // abortar TODO el build (y con eso, dejar el sitio sin snapshot rápido),
  // reintentamos SOLO los que fallaron, un par de veces más, con una
  // pausa entre intentos para dejar que el gateway se recupere.
  for (let attempt = 0; attempt < 2 && failed.length > 0; attempt++) {
    console.log(`\nReintentando metadata de ${failed.length} tokens (intento extra ${attempt + 1}/2)…`);
    await sleep(1500);
    const retryEntries = failed.map((id) => ({ id, uri: uriById.get(id) }));
    failed = await resolveMetadataBatch(retryEntries);
  }
  console.log(`\n${rawItems.length} tokens resueltos. ${failed.length} fallaron tras reintentos.`);
  if (failed.length > 0) {
    throw new Error(`Faltan metadatos para ${failed.length} tokens activos: ${failed.join(", ")}`);
  }

  if (rawItems.length === 0) {
    console.error("No se resolvió ningún token. No se escribió collection.json.");
    process.exit(1);
  }

  // ---- Fase 3: descargar y re-alojar cada imagen localmente ----
  // Esto es lo que hace que las imágenes SÍ se vean en el navegador de
  // cada jugador — ver el comentario de downloadImage() más arriba.
  await mkdir(IMAGES_DIR, { recursive: true });
  let imgOk = 0;
  let imgFailedItems = [];
  async function downloadBatch(items) {
    const stillFailed = [];
    await mapWithConcurrency(
      items,
      10,
      async (item) => {
        const localPath = await downloadImage(item.tokenId, item.image);
        if (localPath) {
          item.image = localPath;
          imgOk++;
        } else {
          stillFailed.push(item);
        }
      },
      (done, totalDone) => progressLine("Descargando imágenes", done, totalDone)
    );
    return stillFailed;
  }
  imgFailedItems = await downloadBatch(rawItems);
  // Igual que con la metadata: un gateway de imágenes puede fallar una vez
  // por rate-limit/timeout puntual sin que la imagen esté realmente rota.
  // Reintentamos las que fallaron antes de abortar el build completo.
  for (let attempt = 0; attempt < 2 && imgFailedItems.length > 0; attempt++) {
    console.log(`\nReintentando ${imgFailedItems.length} imágenes (intento extra ${attempt + 1}/2)…`);
    await sleep(1500);
    imgFailedItems = await downloadBatch(imgFailedItems);
  }
  const imgFail = imgFailedItems.length;
  imgFailedItems.forEach((item) => { item.image = ""; });
  console.log(`\n${imgOk} imágenes descargadas y re-alojadas localmente. ${imgFail} fallaron.`);
  if (imgFail > 0) {
    throw new Error(`Faltan ${imgFail} imágenes. No se publica una colección incompleta.`);
  }

  const withRarity = computeRarity(rawItems).sort((a, b) => a.tokenId - b.tokenId);

  const output = {
    contract: NFT_CONTRACT_ADDRESS,
    chainId: CHAIN_ID_DEC,
    generatedAt: new Date().toISOString(),
    totalSupply,
    maxTokenId,
    resolvedCount: withRarity.length,
    items: withRarity,
  };

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(output), "utf8");
  console.log(`\n✅ Listo: ${OUTPUT_PATH}`);
  console.log(`Súbelo junto con el resto de web/ — el juego lo va a usar automáticamente y cargará al instante.`);
}

main().catch((err) => {
  console.error("\nError inesperado:", err);
  process.exit(1);
});
