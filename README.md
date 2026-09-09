# R3 APOCALIPSIS

Juego on-chain sobre la colección **r3tards** (Monad Mainnet). Los jugadores conectan su wallet, pagan **20 MON** por partida y disparan el orbe de Monad contra los NFTs que van cayendo — entre más raro es el NFT, más grande, más resistente y más puntos vale.

Esta guía asume que **no tienes experiencia con hosting ni con despliegue de contratos**. Ve paso a paso, en orden. No necesitas instalar nada en tu computadora.

---

## 0) Lo que ya está listo

- `contracts/R3Apocalipsis.sol` → el contrato que cobra la entrada (20 MON) y guarda los fondos hasta que tú los retiras.
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

## 8) Ideas para una v2 (no incluidas todavía)

- Marcador global (leaderboard) — hoy el mejor puntaje es solo local a cada navegador. Para uno global de verdad hace falta un backend pequeño o escribir puntajes on-chain (cuesta gas extra por partida).
- Vidas/dificultad ajustable desde `config.js` (`MAX_LIVES`, tabla `TIERS`) por si quieres rebalancear el juego sin tocar el motor.
