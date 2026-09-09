# R3 APOCALIPSIS

Juego on-chain sobre la colección **r3tards** (Monad Mainnet). Los jugadores conectan su wallet, pagan **10 MON** por partida y disparan el orbe de Monad contra los NFTs que van cayendo — entre más raro es el NFT, más grande, más resistente y más puntos vale.

Esta guía asume que **no tienes experiencia con hosting ni con despliegue de contratos**. Ve paso a paso, en orden. No necesitas instalar nada en tu computadora.

---

## 0) Lo que ya está listo

- `contracts/R3Apocalipsis.sol` → el contrato que cobra la entrada (10 MON) y guarda los fondos hasta que tú los retiras.
- `web/` → el sitio completo del juego (HTML/CSS/JS). Es un sitio **estático**: no necesita servidor, base de datos ni backend. Por eso se puede alojar gratis y "siempre activo" en GitHub Pages.
- `tools/` → el script que precarga la colección (`build-collection.mjs`) para que el juego arranque al instante en vez de leer la cadena cada vez.
- `.github/workflows/deploy.yml` → hace que lo anterior pase **solo, automáticamente**, cada vez que subes archivos: genera la precarga y publica el sitio, sin que tengas que correr nada en tu computadora (paso 4).
- Todo ya está configurado para la colección `r3tardsnft` (contrato `0x200723A706de0013316E5cd8EBa2b3f53DD90c29`) y para que los fondos terminen en la wallet:
  `0xA320dAA989Ae8d6D7813340697f4f9e75f5B78E8`

Lo único que falta para que funcione de verdad es **desplegar el contrato de pago** y pegar su dirección en la configuración. Son los pasos 1 y 2. Luego el paso 4 publica todo (y lo precarga) de forma automática.

---

## 1) Desplegar el contrato de pago (con tu propia wallet)

Yo no puedo desplegar el contrato por ti — desplegar significa firmar una transacción real con tu wallet y gastar MON de gas, y eso solo lo puedes hacer tú, desde tu propia wallet. Usaremos **Remix**, una herramienta gratuita que corre en el navegador, sin instalar nada.

1. Abre **https://remix.ethereum.org**
2. En el panel izquierdo (ícono de carpeta), crea un archivo nuevo llamado `R3Apocalipsis.sol` y pega adentro **todo** el contenido del archivo `contracts/R3Apocalipsis.sol` de esta carpeta.
3. Ve a la pestaña **Solidity Compiler** (ícono de "S"). Elige la versión `0.8.24` (o cualquier `0.8.2x`) y dale clic a **Compile R3Apocalipsis.sol**.
   - Remix descargará automáticamente las dependencias de OpenZeppelin (`@openzeppelin/contracts`) — es normal, tómalo un momento.
4. Ve a la pestaña **Deploy & Run Transactions** (ícono de Ethereum).
   - En **Environment**, elige **"Injected Provider - MetaMask"** (o el nombre de tu wallet). Se abrirá tu wallet pidiendo conectar — acéptalo.
   - **Verifica que tu wallet esté en la red Monad Mainnet (chainId 143)** antes de continuar. Si no la tienes agregada, en el paso 3 de la parte web el sitio te la agrega automáticamente, pero para desplegar el contrato necesitas tenerla ya en tu wallet — agrégala manualmente si hace falta con estos datos:
     - Nombre: `Monad Mainnet`
     - RPC: `https://rpc.monad.xyz`
     - Chain ID: `143`
     - Símbolo: `MON`
     - Explorador: `https://monadscan.com`
   - En el desplegable de contratos, elige **R3Apocalipsis**.
   - Junto al botón naranja **Deploy**, verás un campo para el parámetro `initialOwner`. Pega ahí tu wallet (la que va a recibir los fondos):
     `0xA320dAA989Ae8d6D7813340697f4f9e75f5B78E8`
   - Dale clic a **Deploy** y confirma la transacción en tu wallet (vas a pagar una pequeña cantidad de MON de gas — normal, es el costo de crear el contrato).
5. Cuando confirme, Remix mostrará el contrato desplegado en la parte de abajo. **Copia su dirección** (empieza con `0x…`) — la vas a necesitar en el siguiente paso.
6. (Opcional pero recomendado) Verifica el contrato en https://monadscan.com pegando su dirección, para que cualquiera pueda leer el código on-chain y confirmar que es exactamente este contrato. Esto le da confianza a tus jugadores.

**Seguridad del contrato:**
- Solo tú (el `initialOwner`) puedes retirar fondos (`withdraw`) o cambiar el precio (`setPlayPrice`).
- No pide `approve` de ningún token, no puede tocar NFTs, no puede mover más MON del que el jugador paga voluntariamente en `playGame()`.
- Tiene `pause()` por si alguna vez necesitas detener los pagos temporalmente.

---

## 2) Configurar el sitio con la dirección del contrato

1. Abre `web/js/config.js` en cualquier editor de texto.
2. Busca la línea:
   ```js
   GAME_CONTRACT_ADDRESS: "0x0000000000000000000000000000000000dEaD",
   ```
   y reemplázala por la dirección real que copiaste de Remix en el paso anterior.
3. Si en algún momento cambias el precio con `setPlayPrice()` en el contrato, actualiza también:
   ```js
   El precio se lee directamente de `playPrice()` del contrato; no se duplica en el frontend.
   ```
   en este mismo archivo (deben coincidir siempre).
4. Guarda el archivo.

Eso es todo lo que hay que tocar para que el cobro funcione. El resto del juego ya lee la colección r3tards directo desde la cadena, así que no hace falta subir imágenes ni metadata a mano — pero eso también es lo que hace que la primera carga sea lenta (siguiente paso, para arreglarlo).

---

## 3) ¿Por qué a veces "no carga la colección" o las imágenes se ven en blanco?

Por defecto, cada vez que alguien abre el juego, **su propio navegador** tiene que leer `tokenURI()` de todos los r3tards activos r3tards uno por uno desde Monad y resolver su imagen/nombre desde IPFS. Esto depende de la red de esa persona en ese momento — y algunos proveedores de internet, antivirus o redes corporativas bloquean los dominios de los gateways de IPFS.

Hay un segundo problema, más sutil, que afecta a **todos los jugadores por igual, sin importar su red**: el juego necesita leer los píxeles de cada imagen para "recortarla" a su silueta, y para eso el navegador exige que el gateway de IPFS responda con encabezados CORS correctos. Muchos gateways públicos no los mandan — el resultado es que la imagen se ve en blanco, siempre, sin importar qué tan buena sea la conexión de esa persona.

La solución de raíz no es hacer que cada navegador insista más — es que **ningún jugador tenga que pedirle nada a IPFS en vivo**. Eso es justo lo que hace el paso 4: la colección (nombres, rareza) y **cada imagen** se descargan **una sola vez, en los servidores de GitHub** (que sí tienen conexión limpia y no están sujetos a la política CORS de un navegador), y a cada jugador se le sirve todo ya listo, como cualquier archivo normal de la página. Cero espera, cero imágenes en blanco, cero dependencia de la red de cada persona.

---

## 4) Publicarlo gratis, "siempre activo", con precarga automática — GitHub Pages

No usa Vercel, es gratis, no se apaga nunca y no tiene ningún conflicto con los pagos (los pagos van directo del navegador del jugador a la blockchain — GitHub Pages solo sirve los archivos, no toca dinero). Además, **cada vez que subas o actualices archivos, GitHub va a regenerar la precarga de la colección y publicar el sitio automáticamente** — no necesitas instalar Node.js ni correr nada tú mismo.

1. Crea una cuenta gratis en **https://github.com** si no tienes una.
2. Crea un repositorio nuevo (botón verde **New**), por ejemplo llamado `r3-apocalipsis`. Puede ser público.
3. Sube **todo el contenido** de la carpeta `r3-apocalipsis` que descargaste (no la carpeta en sí, sino lo que está adentro: `web/`, `tools/`, `contracts/`, `.github/`, `README.md`) a la raíz de ese repositorio:
   - En la página del repositorio, botón **Add file → Upload files**.
   - Abre la carpeta `r3-apocalipsis` en tu explorador de archivos, selecciona **todo lo que hay adentro** (Ctrl+A en Windows) y arrástralo a la zona de subida de GitHub. Debe llevarse también la carpeta `.github` — en Windows se ve normal; en Mac está oculta por defecto, así que si no la ves, presiona `Cmd+Shift+.` para mostrar archivos ocultos antes de seleccionar todo.
   - Dale **Commit changes**.
4. Ve a **Settings → Pages** (menú lateral del repositorio).
5. En **Source**, elige **GitHub Actions** (ya no "Deploy from a branch"). No hace falta elegir ninguna plantilla — el repositorio ya trae su propio flujo de trabajo (`.github/workflows/deploy.yml`).
6. Ve a la pestaña **Actions** (arriba del repositorio). Vas a ver un flujo llamado **"Publicar R3 Apocalipsis en GitHub Pages"** corriendo (círculo amarillo). Espera 1–2 minutos hasta que se ponga en verde ✅ — en ese momento ya generó la precarga y publicó el sitio.
7. Vuelve a **Settings → Pages**: ahí va a aparecer la URL pública, algo como:
   `https://tu-usuario.github.io/r3-apocalipsis/`

Esa URL queda **siempre activa** y es la que compartes con la gente. Cada vez que quieras actualizar el juego, sube los archivos nuevos al mismo repositorio (mismo botón **Upload files**) y espera a que el flujo en **Actions** se ponga verde otra vez — todo lo demás (precarga + publicación) pasa solo.

> Si el flujo alguna vez se pone en rojo ❌, entra a la pestaña **Actions**, ábrelo y revisa el mensaje de error — casi siempre es un problema temporal de red al generar la precarga, y el sitio de todas formas se sigue publicando (solo que sin precarga esa vez; el juego cae de respaldo a leer la cadena en vivo, como antes).

> Si más adelante quieres un dominio propio (por ejemplo `r3apocalipsis.com`), en el mismo **Settings → Pages** hay un campo "Custom domain" — cómpralo en cualquier proveedor de dominios y sigue las instrucciones que aparecen ahí.

> **⚠️ Si tu repositorio actual quedó con una carpeta duplicada** (algo como `r3-apocalipsis_1/r3-apocalipsis/web/...` en vez de `web/` directo en la raíz) y el flujo en Actions falla con un error tipo *"An error occurred trying to start process '/usr/bin/bash' with working directory..."* — es EXACTAMENTE este problema: al arrastrar la carpeta completa (en vez de solo lo que hay adentro) a "Upload files", GitHub la mete una carpeta más adentro de lo esperado, y el flujo automático ya no encuentra `tools/`, `web/`, etc. donde los espera. Arréglalo así, es más rápido borrar y volver a subir que mover archivo por archivo:
> 1. Entra al repositorio → **Settings** (al final del menú, casi abajo) → **Danger Zone** → **Delete this repository**. Confírmalo escribiendo el nombre del repo cuando te lo pida.
> 2. Créalo de nuevo con el mismo nombre (botón verde **New** en tu perfil de GitHub).
> 3. Esta vez, antes de subir: en tu computadora, entra **dentro** de la carpeta `r3-apocalipsis` que descargaste (doble clic para abrirla) hasta ver directamente `web`, `tools`, `contracts`, `.github`, `README.md` — NO la carpeta `r3-apocalipsis` en sí. Selecciona esos 5 elementos (Ctrl+A estando ya adentro) y arrástralos a "Add file → Upload files". Así quedan en la raíz del repo, no un nivel más adentro.
> 4. Repite los pasos 4–7 de abajo (Settings → Pages → Source = GitHub Actions, esperar a que Actions se ponga verde).
>
> **Otro motivo del mismo error**: si en algún momento creaste `.github/workflows/deploy.yml` a mano con "Add file → Create new file" y le diste "Commit changes" SIN pegar el contenido adentro (queda como un archivo vacío, con el placeholder gris "Enter file contents here..." — así se ve si nunca escribiste nada ahí), el flujo también falla igual. Para evitarlo, sube `.github` completa arrastrándola con el resto (paso 3 de arriba) en vez de crear ese archivo a mano; si sí necesitas crearlo a mano, asegúrate de pegar TODO el contenido de `.github/workflows/deploy.yml` de esta carpeta antes de darle "Commit changes", y revisa que el archivo no se vea vacío después.

<details>
<summary>¿Ya tenías el sitio publicado con la carpeta `web/` sola, sin este paso? Cómo migrar</summary>

Si publicaste antes siguiendo una versión anterior de esta guía (solo el contenido de `web/`, con **Source: Deploy from a branch**), migra así:

1. En tu repositorio, borra los archivos viejos que subiste sueltos en la raíz (`index.html`, `styles.css`, `js/`, `assets/`, `data/` sueltos en la raíz) — puedes hacerlo desde la web de GitHub, seleccionándolos y usando "Delete files", o simplemente subir la nueva estructura encima y borrar los sueltos que sobren después.
2. Sube la estructura completa como dice el punto 3 de arriba (`web/`, `tools/`, `contracts/`, `.github/`, `README.md`).
3. Ve a **Settings → Pages → Source** y cámbialo de "Deploy from a branch" a **GitHub Actions**.
4. Espera a que el flujo en la pestaña **Actions** se ponga verde. La URL no cambia.

</details>

<details>
<summary>¿Prefieres precargar a mano en tu computadora en vez de que lo haga GitHub? (opcional, ya no hace falta)</summary>

1. Necesitas tener **Node.js** instalado ([nodejs.org](https://nodejs.org), instalador, "Siguiente" hasta terminar).
2. Abre una terminal dentro de la carpeta `tools/` de este proyecto.
3. Corre `npm install` y luego `npm run build`.
4. Se crea `web/data/collection.json` — súbelo junto con el resto.

Esto ya no es necesario si usas el flujo automático del punto 4, que hace exactamente esto por ti en cada publicación.

</details>

---

## 5) Probarlo antes de publicar (opcional)

Si quieres verlo funcionando en tu computadora antes de subirlo:

1. Abre una terminal dentro de la carpeta `web/`.
2. Ejecuta: `python3 -m http.server 8080` (Python casi siempre viene instalado; si no, cualquier "servidor local" sirve — no puede abrirse con doble clic porque el navegador bloquea algunas cosas al abrir `index.html` directo desde el disco).
3. Abre `http://localhost:8080` en tu navegador con la wallet instalada.

---

## 6) Checklist de seguridad antes de compartir el link

- [ ] Ya reemplazaste `GAME_CONTRACT_ADDRESS` en `config.js` por tu contrato real (no el placeholder `0x000…dEaD`). Mientras siga en placeholder, el juego corre solo en "modo prueba" (gratis, sin wallet) — a propósito, para que puedas probarlo antes de cobrar de verdad.
- [ ] Verificaste el contrato en Monadscan y confirmaste que el `owner` es tu wallet.
- [ ] Probaste tú mismo una partida completa (conectar, pagar, jugar, game over) antes de compartirlo públicamente.
- [ ] Guardaste en un lugar seguro la wallet/clave con la que desplegaste el contrato — es la única que puede retirar fondos o pausar el contrato.
- [ ] Revisaste que el precio mostrado en el sitio provenga de `playPrice()` del contrato.
- [ ] En **Settings → Pages → Source** quedó configurado **GitHub Actions** (no "Deploy from a branch"), y el flujo en la pestaña **Actions** está en verde ✅ — así la colección queda precargada y ningún jugador depende de su propia red para cargarla.

---

## 7) Cómo funciona por dentro (resumen técnico)

- **Colección**: `.github/workflows/deploy.yml` corre `tools/build-collection.mjs` en los servidores de GitHub en cada publicación y genera `web/data/collection.json` **y** descarga cada imagen a `web/data/images/`. El juego lo carga directo — casi instantáneo, sin tocar la cadena ni IPFS para nada, y sin depender de que un gateway de IPFS mande los encabezados CORS que el navegador exige para poder recortar la imagen (por eso las imágenes ya no se ven en blanco). Si esos archivos no existieran (por ejemplo, estás probando en tu computadora antes de publicar), cae de respaldo a leer todo en vivo desde Monad (contrato `0x2007…0c29`) usando Multicall3 para `tokenURI()` y varios gateways IPFS para metadata/imágenes. En cualquiera de los dos casos, el resultado se cachea 24h en el `localStorage` del navegador del jugador — no en ningún servidor tuyo.
- **Rareza**: se calcula localmente a partir de qué tan poco frecuente es cada rasgo (trait) dentro de toda la colección. Entre más raros los rasgos de un NFT, más grande cae, más golpes aguanta y más puntos da.
- **Dueño actual**: cuando un NFT específico va a caer en la partida, se consulta `ownerOf()` en vivo — así el "propietario actual" que se muestra siempre es real, no un dato viejo.
- **Recorte de imagen**: el juego intenta quitar el fondo plano de cada imagen automáticamente (comparando colores) para que se vea "recortado" a su silueta; si por CORS del gateway IPFS no se puede leer el píxel, cae de forma automática a un recorte circular — nunca se rompe visualmente.
- **Sonido**: 100% generado por código (Web Audio API), no hay archivos de audio con licencia de por medio.
- **Pago**: una sola función `playGame()` payable. No hay `approve`, no hay firmas de mensajes raras, todo lo que el jugador autoriza es visible en su wallet antes de confirmar.

---

## 7.1) Novedades: avatar móvil, rareza que da miedo y logros

- **Avatar y disparo**: por defecto siempre disparas desde el r3tard **menos raro** de la colección (el "más normal" — siempre el mismo mientras esa colección no cambie). Toca/haz clic en cualquier parte de la pantalla para disparar hacia ahí Y mover al avatar hasta esa columna; si mantienes presionado y arrastras, solo se mueve (no dispara de nuevo), así puedes reposicionarte con calma.
- **Legendarios y épicos, con probabilidad baja e IMPACTO real**: al principio de la partida casi nunca caen (1 entre 1000 al inicio para legendario), y esa probabilidad sube poco a poco con el tiempo real jugado (hasta 1 entre 50 a las 3h) — nunca con el puntaje, para que no se pierda la progresión. Cuando por fin cae uno, tiene una aura mucho más grande e intensa con rayos girando, un destello de pantalla, más vibración de cámara, y un sonido característico propio (`legendarySpawnAlert`) distinto al de un simple "raro".
- **Dificultad por rareza (no solo por tiempo)**: cada tier ahora tiene su propia curva de vida (`hpGrowth` en `config.js`). Los comunes casi no suben de dificultad — siguen muriendo de 1-2 golpes toda la partida. Pero un legendario que cae ya tarde en una sesión larga aguanta muchísimos más golpes que uno que cae al principio (hasta ~15x su vida base a las 3 horas). Así lo raro no solo vale más puntos: se vuelve un verdadero "jefe" cuanto más raro y más tarde aparece.
- **Fondo dinámico**: el fondo del juego ahora es la imagen real de un r3tard de la propia colección (misma fuente que usa el juego para los que caen), ajustada para llenar toda la pantalla sin importar su tamaño/proporción. Va cambiando uno por uno cada 10-20 segundos, empezando por los menos raros y avanzando hacia los más raros a medida que progresa la partida.
- **Página de logros** (`logros.html`, enlazada desde el pie del menú principal): conecta tu wallet ahí y ves la galería de qué r3tards específicos has matado y cuántas veces, con su imagen y su tier. Ojo: esto vive **solo en el navegador donde jugaste** (`localStorage`), no es on-chain — si cambias de computadora o borras datos del sitio, se pierde esa lista (el puntaje en sí tampoco es on-chain, ver sección 8).
- **Teclado**: además de tocar/hacer clic, el avatar se mueve con las flechas ← → o con A/D (mantén presionada la tecla). El disparo sigue siendo con clic/tap — pensado para poder mover con una mano y apuntar con la otra en computadora.

## 7.2) Novedades: movimientos raros, 5 vidas con el logo de Monad, y daño que sube

- **Movimientos distintos según la rareza** (`pickMovementPattern` en `game.js`): los comunes y poco comunes siempre caen derecho (para que sigan siendo fáciles de identificar). Desde "raro" empieza a variar, y "épico"/"legendario" son los que de verdad cuestan:
  - **Zigzag**: se mueven de lado a lado mientras caen (la hitbox real se mueve con ellos, no es solo visual).
  - **Temblor**: tiemblan/vibran rápido — solo visual, pero cuesta más apuntarles bien.
  - **Parpadeo**: aparecen y desaparecen (sigue pudiéndose golpear aunque estén casi invisibles).
  - **"Bonus" horizontal**: en vez de caer, entran por un costado de la pantalla, cruzan, y **se devuelven** por donde vinieron. Si se te escapan por cualquier lado, no pierdes vida — solo te quedas sin sus puntos, es un bonus, no una amenaza.
- **5 vidas, con el logo de Monad** (`MAX_LIVES: 5` en `config.js`): antes eran 3 corazones ❤, ahora son 5 íconos — y tanto esos íconos como el proyectil que disparas usan el mismo archivo `web/assets/monad-orb.svg`. Ahora mismo ese archivo es un orbe morado de diseño propio (para no usar sin permiso el logo real). **Si quieres el logo oficial de Monad ahí**: entra a [monad.xyz/brand-and-media-kit](https://www.monad.xyz/brand-and-media-kit), descarga el ícono/isotipo (no el logo con texto) en SVG, y súbelo a la carpeta `web/assets/` con el mismo nombre `monad-orb.svg` (reemplazando al que ya existe) — no hace falta tocar nada de código, en cuanto subas ese archivo con ese nombre, tanto las vidas como los disparos van a mostrar el logo real automáticamente. Si el brand kit solo te da un PNG y no un SVG, avísame en el chat para ajustar el código a ese formato.
- **El daño sube al matar legendarios**: normalmente cada disparo quita 1 de vida al NFT. Al matar tu **primer legendario** de la partida, el daño de tus disparos sube a **x2** para el resto de la partida (con un aviso grande en pantalla); al matar el **segundo**, sube a **x3** (tope — matar más legendarios ya no sigue subiendo). Para que esto no vuelva la partida demasiado fácil después de ese punto, subí a propósito la vida base de "poco común" en adelante en `config.js` (`TIERS`) — solo "común" se queda igual de fácil siempre.
- **Cada legendario que aparece es más difícil que el anterior**: además de que la vida sube con el tiempo, cada legendario que cae en la partida hace que el SIGUIENTE sea más resistente (hasta un tope de +6 legendarios, para que nunca sea literalmente imposible). El primero sale con su vida normal; el cuarto o quinto que aparezca en una sesión larga ya es un hueso mucho más duro de roer.

## 7.3) Novedades: colores/fuentes oficiales de Monad, y "colección completa" como final del juego

- **Fuentes y colores**: todo el sitio (menú, juego, game-over, y la página de logros) ya usaba las mismas dos fuentes en todas las pantallas — Orbitron para títulos/HUD, Rubik para texto — así que ahí no había nada que arreglar. Lo que sí ajusté fue el morado: antes era un morado propio parecido pero no exacto; ahora es el morado OFICIAL de Monad (`#6E54FF`, verificado directo en [monad.xyz/brand-and-media-kit](https://www.monad.xyz/brand-and-media-kit)), aplicado en `styles.css` (`--purple`) y en todo `game.js` (fondos, disparo, textos) de forma consistente. **Ojo**: no pude revisar pixel por pixel el diseño específico de r3tards.club en esta sesión (no tuve navegador disponible para inspeccionarlo en vivo), así que usé el morado oficial de Monad como base — que es lo que se ve en toda la marca de r3tards de todas formas. Si tienes una captura de pantalla de r3tards.club y quieres que ajuste algo más específico de ahí, mándamela.
- **El juego ahora se puede "completar" de verdad**: además de perder por quedarte sin vidas, ahora también termina la partida si matas, dentro de esa misma sesión, a todos los **r3tards activos de la colección** (no hace falta que sean todos diferentes al mismo tiempo en pantalla — es un contador acumulado de "cuáles ya mataste alguna vez en esta partida"). Al lograrlo se muestra una pantalla de victoria distinta ("¡COLECCIÓN COMPLETA!" en dorado) en vez del game-over normal.
  - Para que esto sea realmente alcanzable (y no una lotería estadística eterna), cuando va a caer un NFT de un tier, el juego prefiere uno que **todavía no hayas matado** en esa partida — solo repite uno ya matado si ya agotaste todos los de ese tier. Comunes, poco comunes, raros, épicos y legendarios se van repitiendo con normalidad mientras tanto (como pediste), pero siempre priorizando avanzar el contador.
  - **Contador en vivo**: el HUD del juego muestra "r3tards distintos: 612/N" mientras juegas.
  - **Log en vivo y transparente**: en la esquina inferior izquierda del juego va apareciendo cada r3tard que matas (tier, nombre, puntos), más reciente arriba, sin tapar el disparo.
  - **¿Cuánto tardaría una partida perfecta (sin perder nunca, matando siempre lo que cae) en completar los 1033?** Simulé 3000 partidas con las probabilidades y tiempos reales del juego: mejor caso observado **≈54 minutos**, caso típico/mediana **≈1h08min**, y percentil 95 (muy desafortunado) **≈1h16min** (el peor caso observado en 3000 corridas fue 1h25min). El cuello de botella real no son los legendarios (son pocos, 10, pero fáciles de "usar" una vez que caen) sino los **comunes** (620 de todos los r3tards activos) — hay tantos que, aunque casi siempre son los que más caen, agotar los 620 distintos toma la mayoría del tiempo. Esto asume que nunca fallas un disparo y nunca pierdes una vida — en la práctica, para un jugador real, tardaría bastante más.

## 7.4) Revisión a fondo: por qué no cargaban rápido los precargados/fondos, y ondas fluorescentes en los raros

Pediste una revisión completa "a prueba de errores" del zip que ya tenías, más que los "raro" en adelante se vieran más impactantes. Esto es lo que encontré y corregí:

- **BUG REAL (el más importante): las imágenes (fondos, NFTs, avatar) podían no aparecer NUNCA, incluso con buena conexión.** El código pedía cada imagen con `crossOrigin="anonymous"` siempre, sin excepción — eso es necesario para poder "recortar" la imagen a su silueta, pero tiene una consecuencia que no estaba cubierta: si el gateway de IPFS de turno (o cualquier fuente) no manda los encabezados CORS exactos que el navegador exige para eso, el navegador **rechaza cargar la imagen por completo**, no solo el recorte — así que ni el fondo ni el NFT ni el avatar se dibujaban, sin importar cuántos gateways alternos se probaran, porque fallaban todos por el mismo motivo. Lo reproduje con una prueba controlada (un servidor de imagen sin CORS) y confirmé el bug y la corrección: ahora cada imagen se intenta primero CON ese permiso (para poder recortarla si se puede) y, si falla, se reintenta la MISMA imagen SIN pedirlo — eso sí funciona siempre para mostrarla (aunque a veces sin el recorte de silueta, solo recortada en círculo). Esto es probablemente la causa real de "no aparecen los precargados/fondos", más allá de cualquier problema de tu repo de GitHub.
- **Bug relacionado en la página de logros**: si una partida se jugó sin el snapshot precargado (ver más abajo), la imagen guardada en tus logros podía quedar como una dirección `ipfs://...` sin resolver — los navegadores no entienden ese protocolo directamente en un `<img>`, así que se veía siempre rota ahí. Ahora se guarda ya convertida a una dirección `https://` real.
- **El flujo de GitHub Actions ya no puede "tumbar todo el sitio" por un tropiezo de red.** Antes, si `build-collection.mjs` fallaba por cualquier motivo al generar la precarga (incluyendo un simple tropiezo pasajero con un gateway de IPFS durante ese minuto), el `deploy.yml` no publicaba el sitio EN ABSOLUTO — ni siquiera el código nuevo. Ahora ese paso está marcado como "no bloqueante": si falla, el resto del sitio se publica igual (con el respaldo de leer la colección en vivo, más lento pero funcional) en vez de dejarte sin sitio publicado.
- **`build-collection.mjs` ahora reintenta antes de rendirse.** Con 1033 tokens y varios gateways públicos de IPFS (que fallan de forma intermitente por naturaleza), bastaba que UNO solo fallara una vez para que la precarga completa se descartara. Ahora, tanto para los nombres/metadata como para las imágenes, si algunos tokens fallan en la primera pasada, se reintentan un par de veces más (con una pequeña pausa) antes de darse por vencido — sin debilitar la regla de "nunca publicar una colección incompleta", solo dándole más oportunidades de completarse en un solo intento.
- **Aviso claro si alguien prueba el juego con doble clic (protocolo `file://`).** Una de tus capturas mostraba justo esto: el juego abierto desde dentro de un `.zip` sin extraer, con la URL empezando en `file:///...` — bajo ese protocolo el navegador bloquea por seguridad la carga de `data/collection.json` (y a veces también el respaldo en vivo), así que se ve exactamente como "no cargan los precargados ni los fondos" sin ninguna pista de por qué. Ahora el juego detecta esto y muestra un aviso explícito en el menú explicando que hay que probarlo desde el link real (GitHub Pages) o un servidor local, nunca abriendo `index.html` directo. **Esto es importante**: para probar el juego en tu computadora, usa el paso 5 de este README (`python3 -m http.server`) — no lo abras haciendo doble clic ni desde dentro del `.zip`.
- **Ondas fluorescentes en "raro" en adelante**, como pediste: ahora "raro", "épico" y "legendario" tienen anillos que ondulan alrededor del NFT (el radio de cada anillo varía con el tiempo y el ángulo, como una llama u ola en vez de un círculo quieto), con colores distintos por tier — turquesa/agua para raro, naranja/fuego para épico, y dorado/rosa (además de los rayos giratorios que ya existían) para legendario. Es puramente visual, no cambia el punto exacto donde se le puede golpear al NFT.

Verificación hecha para este bloque: prueba aislada del bug de CORS (reproducido y confirmado corregido con un servidor de prueba sin encabezados CORS), partida completa vía servidor local con una colección de prueba (precarga instantánea, fondo e imágenes cargando de verdad — confirmado viendo las peticiones de red, no solo la pantalla), movimiento por teclado y disparo sin errores de consola, aviso de `file://` confirmado, y `node --check` en todos los `.js` tocados.

## 7.5) El bug REAL detrás de "los r3tards y fondos tardan/no aparecen" con la colección real de 1033

Después de publicar el sitio real con las 1033 imágenes ya bien generadas (confirmé revisando directamente `data/collection.json` en el link publicado: los 1033 estaban completos y con rutas locales correctas, no era un problema de la precarga ni del repo), el síntoma seguía pasando en el juego: r3tards cayendo como círculos vacíos, fondo que no cambiaba, mejorando "después de un rato". La causa real es otra, y es de las que solo se nota con la colección completa, nunca con una de prueba chica:

- **Cada r3tard que cae se elige al azar entre los ~1033 posibles** (no en orden). Con una colección de prueba de 6 imágenes, para la 2ª caída el navegador YA tiene esa imagen en su caché (la pidió antes) y aparece al instante. Con 1033, casi cada caída es una imagen que el navegador **nunca pidió antes** — tiene que ir a buscarla a la red por primera vez, en paralelo con todas las demás caídas y con el cambio de fondo, todas compitiendo por la misma conexión al mismo tiempo.
- Si esa primera descarga no llega a tiempo antes de que el r3tard toque el piso (o lo mates), su imagen simplemente nunca llegó a mostrarse — se ve como si "no apareciera", aunque el archivo esté perfectamente bien en el repositorio. Con el tiempo, a medida que se repiten algunos (la caché va llenándose), empiezan a aparecer más — que es exactamente lo que describiste ("después de un rato aparecen pocos").
- **Primer intento de corrección (insuficiente)**: adelantar la descarga de las 1033 imágenes en segundo plano, en paralelo con el menú, sin bloquear "Jugar". Esto no resolvió el problema del todo por dos motivos: (1) el aviso de "colección lista ✅" aparecía apenas se leían los NOMBRES/rarezas de la colección, no cuando las IMÁGENES ya estaban descargadas — así que se podía apretar "Jugar" y entrar a la partida con el precargado todavía a la mitad; y (2) esas ~1033 descargas de fondo, si el jugador entraba a jugar mientras seguían en curso, competían por la misma conexión contra las pocas imágenes que sí hacían falta ya mismo (las que iban cayendo), empeorando el problema en vez de resolverlo.
- **Segundo intento (también insuficiente, corregido en 7.7 más abajo)**: el juego esperaba a que terminara de descargar las 1033 imágenes, pero con un tope duro de 25 segundos (por si la conexión era muy lenta). En la práctica, con las imágenes REALES (más pesadas que las de prueba usadas para medir ese número), 25 segundos no alcanzaba ni de cerca para 1033 imágenes — así que al llegar al tope, el jugador entraba a jugar con la GRAN MAYORÍA de las imágenes todavía sin cachear, viendo exactamente el mismo problema (círculos vacíos) pero ahora "disfrazado" de que sí precargó. Ver 7.7 para la corrección real.

## 7.6) Precio a 10 MON, revisión anti-trampa, y estilo visual "r3tards.club"

**Precio de la partida bajado a 10 MON.** Cambié `playPrice = 20 ether` a `playPrice = 10 ether` en `contracts/R3Apocalipsis.sol` (y las menciones de "20 MON" en este README). **Ojo**: como todavía no has desplegado el contrato, esto solo importa para cuando lo despliegues por primera vez — si ya lo tenías desplegado con 20 MON, el precio en la cadena NO cambia solo, tienes que llamar `setPlayPrice(10000000000000000000)` (10 MON en wei) desde tu wallet de owner (en Remix, o en monadscan.com en la pestaña "Write Contract" del contrato ya verificado).

**Revisión anti-trampa — qué SÍ está garantizado y qué NO:**
- El contrato en sí es sólido: `playGame()` exige el pago EXACTO de `playPrice`, ni un wei menos (no hay forma de jugar gratis a través del contrato), y solo el owner puede cambiar el precio o retirar fondos (`onlyOwner` en `setPlayPrice`/`withdraw`/`withdrawPartial`/`pause`). No acepta depósitos por fuera de `playGame()` (el `receive()`/`fallback()` los rechaza), no pide `approve` de tokens, no puede tocar NFTs, y las retiradas usan `nonReentrant`. **Nadie puede engañar al contrato para pagar menos, ni robar los fondos que ya están adentro.**
- **Lo que NO se puede garantizar al 100%, y por qué**: este es un sitio 100% estático (sin servidor propio) — todo el juego corre en el navegador de cada jugador. Eso significa que alguien con conocimientos técnicos (abriendo la consola del navegador) SÍ podría, en teoría, forzar que el juego empiece sin pasar por el pago, ejecutando directamente las funciones del juego. Esto es una limitación de cualquier juego que vive solo en el navegador, sin servidor detrás — no es un bug de este proyecto en particular, y no hay forma de cerrarlo al 100% sin agregar un servidor propio que verifique cada pago (un proyecto bastante más grande que este). Lo importante: como no hay ningún premio ni pago que salga del contrato hacia el jugador (es pay-to-play, no pay-to-win-money), alguien haciendo esto solo consigue jugar gratis él mismo — no puede robar el dinero que ya está en el contrato ni afectar a otros jugadores. Si en algún momento quieres cerrar también esa puerta, se puede armar un backend chico que verifique la transacción antes de dejar jugar — avísame y lo evaluamos como proyecto aparte.

**Estilo visual nuevo, como el de r3tards.club.** Mandaste una captura de su página (cajas negras redondeadas con borde claro, letra tipo marcador/a mano, botones en forma de píldora negra) y pediste usar ese estilo "para todo". Reemplacé las fuentes anteriores (Orbitron/Rubik) por **Kalam** (Google Fonts, la misma familia en todo el sitio: menú, HUD, tags de NFT, banners de "¡legendario cayendo!", pantalla de game over, y la página de logros), y rediseñé todas las cajas/botones a negro sólido con borde claro y esquinas muy redondeadas (píldora en los botones), igual que en tu captura — incluyendo el HUD del juego (puntaje, oleada, contador de distintos, vidas, combo), que antes solo tenía texto flotante y ahora va en su propia "etiqueta" negra para que se lea bien encima de cualquier fondo. Los colores de rareza (turquesa/naranja/dorado) se mantuvieron igual, porque son información real para el jugador (indican qué tan raro es cada NFT), no solo decoración. **Lo que NO cambié**: el fondo del juego en sí sigue siendo el arte real de r3tards de fondo giratorio que ya tenía (es contenido real de la colección, no un mockup) — si además quieres un fondo tipo "empapelado" con caritas de r3tards repetidas como en su web (detrás del menú, no durante la partida), lo puedo agregar usando imágenes reales de tu propia colección una vez que confirmes que quieres eso específicamente.

Verificación: `node --check` en los `.js` tocados, y una partida de prueba completa (colección de prueba local) confirmando que el menú, el HUD durante el juego, los tags de NFT y la página de logros se ven con el estilo nuevo sin romper el layout ni la legibilidad, sin errores de consola.

## 7.7) "Muestra que precarga pero nada pasa" — el tope de 25s no alcanzaba, y un bug nuevo que dejé yo mismo al agregar el botón de emergencia

Reportaste, con captura del juego real: el menú mostraba "Precargando imágenes…", pero al entrar a jugar la mayoría de los r3tards caían como círculos lisos sin la carita adentro (solo el avatar y algún ícono chico sí se veían) — "esto no le puede pasar al usuario final". Tenías razón: el tope de 25 segundos de la corrección anterior (7.5) se calculó con imágenes de PRUEBA muy chicas (unos cientos de bytes cada una); con las 1033 imágenes REALES de la colección, 25 segundos no alcanza para descargarlas todas en una conexión normal — así que el jugador entraba a jugar con la mayoría todavía sin cachear, viendo el mismo problema de siempre.

**Corrección**: quité el tope de tiempo fijo. Ahora el juego espera la descarga REAL y completa de las 1033 imágenes, sin adivinar cuánto debería tardar. Como salida de emergencia para conexiones muy lentas (o alguien que no quiera esperar), a los 15 segundos aparece un botón "⏭️ Jugar ya (algunas imágenes seguirán cargando)" — una decisión visible y explícita del jugador, nunca un cronómetro silencioso que lo mete a una partida rota sin que se dé cuenta.

**Bug que encontré y corregí en el camino (introducido por mí mismo en la ronda anterior, el del estilo visual)**: al probar el botón nuevo, noté que aparecía SIEMPRE desde el arranque, nunca oculto — un bug real en `styles.css`. Al rediseñar los botones le agregué `display: inline-block` a la clase `.btn` (falta hacía para que el botón "Volver al juego" de `logros.html`, que es un link `<a>`, se viera bien) — pero eso sin querer hacía que el atributo HTML `hidden` (que depende de que NADA le gane a `display: none`) dejara de funcionar en CUALQUIER botón oculto por defecto, no solo el nuevo: también afectaba a "🔄 Reintentar carga de la colección" y a "🔌 Conectar wallet" en modo prueba. Lo corregí agregando una regla que hace que `hidden` gane siempre (`.btn[hidden] { display: none; }`) y confirmé con Playwright que todos esos botones vuelven a arrancar ocultos como corresponde.

**Verificación**: colección de prueba con imágenes muy lentas (2 segundos cada una) confirmando que: (1) el botón "Jugar ya" permanece oculto hasta los ~15s; (2) al apretarlo, entra a la partida de inmediato; (3) con una colección que carga rápido, el botón nunca aparece y el flujo normal sigue igual que antes; (4) los botones "Reintentar" y "Conectar wallet" arrancan ocultos correctamente (el bug de arriba, ya corregido).

> **Actualización**: el botón "Jugar ya" de esta sección quedó reemplazado por la estrategia sin espera de 7.8, más abajo. Queda esta sección como registro de por qué se llegó hasta ahí.

## 7.8) Precarga sin esperar (pediste "sin tener que esperar"), por qué las imágenes no pueden ser instantáneas aunque estén en el repo, y dificultad que sube visiblemente cada minuto

**"sin tener que esperar, o usar alguna estrategia para cargar una parte al inicio y luego ir descargando mientras el usuario juega"** — tenías razón en que obligar a esperar (aunque fuera con un botón de salida a los 15s) no era la mejor experiencia. Cambié la estrategia por una de dos tiempos, sin ningún botón ni pantalla de espera larga:

1. Apenas la colección está lista, un empujón CORTO y de duración fija (3.5 segundos) adelanta la descarga de una parte de las ~1033 imágenes.
2. Pasados esos 3.5s, "Jugar" ya está disponible — el resto de las imágenes se sigue descargando SOLO, en segundo plano, mientras el jugador ya está jugando, sin bloquear nada.

Para que ese precargado de fondo no le quite ancho de banda a las imágenes que sí hacen falta YA (un r3tard cayendo, el fondo, el avatar), cada imagen "urgente" se pide con prioridad alta del navegador (`fetchPriority: "high"`) y cada imagen del precargado de fondo con prioridad baja (`fetchPriority: "low"`) — así, si compiten por la misma conexión en un momento dado, el navegador atiende primero a la que hace falta de inmediato.

**"¿Pero por qué no puede simplemente cargar todo desde el repositorio?"** — pregunta justa. Las 1033 imágenes YA están en el repositorio y se sirven directo desde GitHub Pages (nada de IPFS ni gateways externos en este punto). Pero "estar en el repositorio" no es lo mismo que "ya estar en el teléfono/computadora de cada jugador": así como cualquier página web, cada visitante tiene que DESCARGAR esos archivos por internet la primera vez que los necesita, sin importar qué tan rápido o bien organizado esté el repositorio del lado del servidor. No hay forma de que eso tome cero segundos — la única pregunta real es cómo se reparte esa espera, y la respuesta que se implementó es: un empujón cortito y fijo al inicio, y el resto en silencio mientras ya se está jugando.

Verifiqué (con una colección de prueba y un servidor local que simula una conexión lenta) que: el juego queda listo para jugar en los 3.5s fijos sin importar qué tan lenta sea la red; el resto de las imágenes sigue llegando solo mientras el jugador juega, sin errores de consola; y confirmé —con una investigación a fondo, incluyendo instrumentación del código para contar cada acierto/fallo de caché— que los r3tards que van cayendo SÍ muestran su carita real apenas su imagen termina de llegar, tanto si ya estaba precargada como si llegó mientras el jugador ya estaba jugando.

**Dificultad que se note, minuto a minuto — pediste**: *"la dificultad, se tiene que ver que es dificil cada vez, sube cada minuto la velocidad, haciendo calculos que cuando termine sea mas dificil"*. El juego siempre subió la velocidad/frecuencia/rareza con el tiempo real de partida, pero estaba calibrado para llegar al máximo a las 3 horas — en la práctica, el cambio de un minuto a otro era tan chico que no se notaba. Dos cambios:

- **`SPAWN_PROGRESSION.durationMinutes` bajó de 180 a 10** (en `config.js`) — ahora el máximo de dificultad se alcanza a los 10 minutos de partida, no a las 3 horas.
- **La dificultad ahora sube en 10 escalones, uno por cada minuto completo** (antes era un crecimiento continuo y suavísimo). Esto afecta a la vez la velocidad de caída, qué tan seguido caen los r3tards, y la probabilidad de que salga un raro/épico/legendario — todo lo que ya dependía de este cálculo sube igual, en el mismo salto, cada minuto.
- **Nuevo indicador "Dificultad X/10" en el HUD**, con su propia barrita de progreso, que pulsa (una animación breve) cada vez que sube un escalón — para que el aumento se VEA, no solo se sienta jugando.

Al llegar al minuto 10, la dificultad se queda en el máximo para siempre (el juego no tiene fin) — igual que antes, solo que ahora se llega ahí, y se nota el camino, en minutos y no en horas. Si 10 minutos te parece mucho o poco para tu público, es un solo número (`durationMinutes` en `config.js`) — avísame y lo recalibramos.

Verificación: partida de prueba con el reloj del juego acelerado artificialmente (solo para el test, no en el juego real) confirmando que el indicador de dificultad sube de 0 a 10 en los momentos correctos, la barrita y la animación se ven bien, y llega a 10/10 y se queda ahí — sin errores de consola.

## 8) Ideas para una v2 (no incluidas todavía)

- Marcador global (leaderboard) — hoy el mejor puntaje es solo local a cada navegador. Para uno global de verdad hace falta un backend pequeño o escribir puntajes on-chain (cuesta gas extra por partida).
- Vidas/dificultad ajustable desde `config.js` (`MAX_LIVES`, tabla `TIERS`) por si quieres rebalancear el juego sin tocar el motor.
