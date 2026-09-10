// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * R3 APOCALIPSIS — contrato del juego (pago por partida + progreso on-chain)
 * ----------------------------------------------------------------
 * Qué hace:
 *   - El jugador paga el precio actual en MON para jugar una partida
 *     (playGame() — hoy el precio es 0, es decir GRATIS: solo se paga el
 *     gas normal de la red. El owner puede subirlo después con
 *     setPlayPrice(), sin volver a desplegar nada).
 *   - Alias público por wallet (setAlias/playerAlias), para que el
 *     ranking muestre un nombre en vez de una dirección larga.
 *   - Guardado automático de progreso al terminar cada partida, en una
 *     sola transacción: recordMatch(puntaje, logros nuevos, r3tards
 *     matados) — reemplaza los antiguos submitScore()/unlockAchievements()
 *     separados. Revierte con "nada nuevo que guardar" solo si NINGUNA de
 *     las tres cosas aporta algo nuevo, para no gastar gas de más.
 *   - Registro GLOBAL y permanente de qué r3tards han muerto alguna vez
 *     (de cualquier jugador, para siempre) — everKilledGloballyBitmap +
 *     isEverKilledGlobally() + evento TokenKilled — guardado en un bitmap
 *     empaquetado (256 tokenIds por casilla de storage) a propósito, para
 *     que la tarifa alta de la PRIMERA escritura en una casilla nueva se
 *     pague pocas veces en total y no una vez por cada r3tard.
 *   - Tarjeta de jugador: un NFT (ERC-721) intransferible por wallet, que
 *     se mintea solo la primera vez que guardas algo, y cuya imagen/JSON
 *     se genera al momento reflejando tu alias/puntaje/logros actuales
 *     (tokenURI) — nunca hay que "actualizarla" a mano.
 *   - El contrato solo recibe y guarda el pago de las partidas hasta que
 *     el dueño lo retira (withdraw/withdrawPartial). No custodia NFTs de
 *     la colección r3tards, no pide aprobaciones (approve) de ningún
 *     token, no puede mover fondos del jugador aparte del pago exacto que
 *     él mismo envía.
 *
 * Por qué el resultado de cada partida (aparte de lo que se guarda arriba)
 * vive en el navegador del jugador y no on-chain: no hay premio en dinero
 * ligado al puntaje/logros, así que no vale la pena el costo/complejidad
 * de validar cada jugada on-chain — ver el comentario de "limitación
 * honesta anti-trampa" más abajo, junto a recordMatch().
 *
 * Deploy: Remix + tu wallet, red Monad Mainnet (chainId 143). Tú eres el
 * owner (el deployer) automáticamente. Compilar con optimizador Y
 * "Enable viaIR" activados (ver comentario junto a tokenURI()).
 */

// Versión de OpenZeppelin FIJADA a propósito (@5.1.0, no "la última"): las
// versiones más nuevas de esta librería (5.6+) usan internamente el opcode
// MCOPY (de la actualización "Cancun" de Ethereum) en utilidades que este
// contrato sí necesita (Base64/Strings) — y no hay forma de confirmar con
// certeza que Monad Mainnet ya lo soporte. Fijando 5.1.0 evitamos ese
// riesgo por completo: es una versión estable, bien probada, que no toca
// ningún opcode "nuevo". Si Remix descarga otra versión por accidente,
// COMPÁRALO con esto — no lo cambies sin una buena razón.
import "@openzeppelin/contracts@5.1.0/access/Ownable.sol";
import "@openzeppelin/contracts@5.1.0/utils/Pausable.sol";
import "@openzeppelin/contracts@5.1.0/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts@5.1.0/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts@5.1.0/utils/Base64.sol";
import "@openzeppelin/contracts@5.1.0/utils/Strings.sol";

contract R3Apocalipsis is Ownable, Pausable, ReentrancyGuard, ERC721 {
    /// @notice Precio actual de una partida, en wei (1 MON = 1e18 wei, igual que ETH).
    // Pedido explícito: el juego arranca GRATIS (0 MON, solo pagas el gas
    // normal de la transacción) — antes arrancaba en 10 MON por defecto.
    // El owner puede subirlo cuando quiera con setPlayPrice(), sin volver
    // a desplegar nada.
    uint256 public playPrice = 0;

    /// @notice Total histórico de partidas pagadas.
    uint256 public totalGamesPaid;

    /// @notice Total histórico recaudado (informativo; el balance real es address(this).balance).
    uint256 public totalCollected;

    event GamePaid(address indexed player, uint256 amountPaid, uint256 gameId, uint256 timestamp);
    event PriceUpdated(uint256 oldPrice, uint256 newPrice);
    event Withdrawn(address indexed to, uint256 amount);

    // ------------------------------------------------------------------
    // Ranking global y logros — guardados en la propia cadena a propósito:
    // el sitio es 100% estático (sin servidor propio), así que esta es la
    // única forma de que el ranking y los logros sean de VERDAD globales
    // (que los vea cualquiera) sin depender de un backend que alguien
    // tenga que mantener. Todo esto se guarda con UNA sola transacción
    // automática al terminar cada partida (ver recordMatch más abajo) —
    // el jugador ya no tiene que apretar botones aparte para "guardar".
    //
    // ⚠️ MISMA LIMITACIÓN YA CONOCIDA que "jugar sin pagar" (ver README):
    // como el juego corre solo en el navegador de cada jugador, sin
    // servidor que verifique nada, alguien técnico PODRÍA llamar
    // recordMatch() directo desde la consola con números inventados, sin
    // haber jugado de verdad. No hay forma de cerrar esto al 100% sin un
    // backend propio que valide cada partida (fuera del alcance de este
    // proyecto, ver README). Como no hay ningún premio en dinero ligado
    // al puntaje, los logros o los r3tards "cazados", el peor caso es
    // alguien mintiendo sobre su propio historial en un juego gratis de
    // ver — no hay forma de robar fondos ni de afectar a otros jugadores
    // con esto.
    // ------------------------------------------------------------------

    uint256 public constant MAX_ALIAS_LENGTH = 20;

    /// @notice Tope defensivo de cuántos r3tards distintos se pueden reportar
    /// matados en UNA sola llamada a recordMatch() — una partida real de
    /// 10 minutos no debería acercarse a esto ni de lejos; existe solo para
    /// que nadie pueda armar una transacción absurdamente grande (y cara de
    /// procesar) a propósito.
    uint256 public constant MAX_KILLS_PER_MATCH = 300;

    /// @notice Alias público que cada wallet puede ponerse (para el ranking).
    mapping(address => string) public playerAlias;

    /// @notice Mejor puntaje histórico de cada wallet (solo puede subir).
    mapping(address => uint256) public bestScore;

    /// @notice Logros desbloqueados por wallet, como bitmask (bit N = logro N,
    /// ver web/js/achievements-onchain.js para la lista con nombres/criterios).
    mapping(address => uint256) public achievementsMask;

    /// @notice ¿Ya murió este r3tard (tokenId) AL MENOS UNA VEZ, en manos de
    /// CUALQUIER jugador, alguna vez? Para siempre y para cualquiera que
    /// quiera consultarlo — es lo que alimenta la página de "colección"
    /// (r3tards a color si ya los cazó alguien, oscuros si nadie todavía).
    ///
    /// Guardado como BITMAP empaquetado (256 tokenIds por "palabra" de
    /// storage) en vez de un booleano por token — con ~1033 tokenIds eso
    /// son nada más que 5 palabras en total. Esto importa de verdad para
    /// el gas: la primera vez que se escribe CUALQUIER bit de una palabra
    /// (0 → algo) cuesta el precio caro de "slot nuevo" (~20000 gas), pero
    /// esa palabra cubre 256 tokenIds — así que ese costo caro se paga
    /// como mucho 5 veces en TODA la vida del juego, nunca por cada
    /// r3tard. Escribir un bit más en una palabra que ya tenía otros bits
    /// prendidos (lo normal después de las primeras partidas) es mucho
    /// más barato. Guardar un `mapping(uint256 => bool)` en cambio le
    /// cobraría el precio caro A CADA TOKEN NUEVO, para siempre — con 50
    /// r3tards nuevos en una sola partida eso solo del guardado ya sale
    /// más de 1 millón de gas (medido antes de este cambio); empaquetado
    /// en palabras, la misma partida sale una fracción de eso.
    mapping(uint256 => uint256) public everKilledGloballyBitmap;

    /// @notice ¿Ya murió este r3tard (tokenId) alguna vez, en manos de
    /// cualquier jugador? Lectura directa y gratis (view) del bitmap de
    /// arriba, sin tener que leer/decodificar eventos a mano.
    function isEverKilledGlobally(uint256 tokenId) public view returns (bool) {
        uint256 word = tokenId / 256;
        uint256 bit = tokenId % 256;
        return (everKilledGloballyBitmap[word] >> bit) & 1 == 1;
    }

    event AliasSet(address indexed player, string newAlias);
    event ScoreSubmitted(address indexed player, uint256 score, uint256 timestamp);
    event AchievementUnlocked(address indexed player, uint8 achievementId, uint256 timestamp);
    /// @notice Se emite SOLO la primera vez que este tokenId muere en manos
    /// de cualquier jugador — `firstKiller` queda para siempre como quien
    /// se lo "quedó" primero.
    event TokenKilled(uint256 indexed tokenId, address indexed firstKiller, uint8 tier, uint256 timestamp);
    /// @notice Un resumen de qué guardó realmente cada llamada a
    /// recordMatch() — útil para depurar/mostrar en el frontend sin tener
    /// que releer los otros eventos.
    event MatchRecorded(address indexed player, uint256 score, uint256 newAchievements, uint256 newGlobalKills);

    // ------------------------------------------------------------------
    // Tarjeta de jugador (NFT ERC-721, INTRANSFERIBLE) — a partir de aquí.
    //
    // La idea: en vez de mintear un NFT nuevo cada vez que juegas, cada
    // wallet tiene COMO MUCHO una tarjeta, mintida automáticamente y
    // GRATIS (sin costo aparte del gas) la primera vez que guardas un
    // alias, un puntaje o un logro. La tarjeta nunca se "actualiza" con
    // una transacción propia: su imagen se genera al momento de
    // consultarla (tokenURI), leyendo en ese instante tu alias/puntaje/
    // logros actuales — así que la próxima vez que juegues y mejores tu
    // récord, la MISMA tarjeta ya se ve distinta, sin mintear otra ni
    // pagar nada extra.
    //
    // Es INTRANSFERIBLE a propósito (ver _update más abajo): no se puede
    // vender ni regalar. Así el historial que muestra siempre corresponde
    // a quien de verdad jugó, en vez de convertirse en un coleccionable
    // que alguien pueda comprar ya "avanzado".
    //
    // El tokenId de la tarjeta de una wallet es simplemente esa dirección
    // convertida a número (ver tokenIdOf) — así no hace falta un contador
    // aparte ni guardar wallet->tokenId: el tokenId YA ES la wallet.
    // ------------------------------------------------------------------

    event CardMinted(address indexed player, uint256 indexed tokenId);

    /// @notice El tokenId que le corresponde (exista o no todavía) a una wallet.
    function tokenIdOf(address player) public pure returns (uint256) {
        return uint256(uint160(player));
    }

    /// @notice ¿Esta wallet ya tiene su tarjeta minteada?
    function hasCard(address player) public view returns (bool) {
        return _ownerOf(tokenIdOf(player)) != address(0);
    }

    /// @dev Mintea la tarjeta de `player` si todavía no la tiene. Se llama
    /// sola desde setAlias/submitScore/unlockAchievements — nunca hace
    /// falta pedirle al jugador una transacción aparte solo para esto.
    function _ensureCard(address player) internal {
        if (!hasCard(player)) {
            uint256 tokenId = tokenIdOf(player);
            _mint(player, tokenId); // _mint (no _safeMint): el destino siempre es una wallet real (msg.sender), no hace falta el chequeo de receiver de contrato.
            emit CardMinted(player, tokenId);
        }
    }

    /// @notice Mintea tu tarjeta directamente, sin necesidad de guardar
    /// antes un alias/puntaje/logro. Gratis (solo el gas). No hace nada
    /// si ya tenías una — nunca revierte por eso, simplemente no repite.
    function mintCard() external {
        _ensureCard(msg.sender);
    }

    /// @dev Punto único por el que pasan TODOS los mint/transfer/burn en
    /// ERC721 (OpenZeppelin v5). Lo usamos para bloquear cualquier
    /// transferencia real (de una wallet a otra) — solo se permite el
    /// mint (`from == address(0)`). Intentar transferFrom/safeTransferFrom
    /// la tarjeta de alguien revierte aquí.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            revert("R3: la tarjeta de jugador es intransferible");
        }
        return super._update(to, tokenId, auth);
    }

    /// @dev Sin approve/setApprovalForAll: la tarjeta nunca se puede mover,
    /// así que "aprobarla" para alguien más no tiene ningún sentido —
    /// mejor un mensaje claro aquí que dejar que parezca que sí funcionó.
    function approve(address, uint256) public pure override {
        revert("R3: la tarjeta de jugador es intransferible");
    }

    function setApprovalForAll(address, bool) public pure override {
        revert("R3: la tarjeta de jugador es intransferible");
    }

    /// @dev Cuenta cuántos logros tiene desbloqueados una wallet (bits
    /// prendidos en su achievementsMask). 32 bits alcanzan para muchos
    /// años de logros nuevos sin tener que tocar esto — hoy solo se usan
    /// los ids 0-10 (ver web/js/achievements-onchain.js).
    function _achievementCount(uint256 mask) internal pure returns (uint256 count) {
        for (uint256 i = 0; i < 32; i++) {
            if ((mask >> i) & 1 == 1) count++;
        }
    }

    /// @dev Solo el SVG de la tarjeta — separado de tokenURI() en su propia
    /// función para no acumular demasiadas variables locales a la vez
    /// (Solidity revienta con "stack too deep" si una sola función arma
    /// tanto el SVG como el JSON de metadata juntos).
    function _cardSvg(string memory aliasStr, string memory scoreStr, string memory achStr, string memory addrStr)
        internal
        pure
        returns (bytes memory)
    {
        return
            abi.encodePacked(
                '<svg xmlns="http://www.w3.org/2000/svg" width="350" height="350" viewBox="0 0 350 350">',
                '<rect width="350" height="350" fill="#0b0710"/>',
                '<rect x="8" y="8" width="334" height="334" rx="20" fill="none" stroke="#6e54ff" stroke-width="3"/>',
                '<text x="175" y="58" font-family="monospace" font-size="22" font-weight="bold" fill="#ffd166" text-anchor="middle">R3 APOCALIPSIS</text>',
                '<text x="175" y="82" font-family="monospace" font-size="12" fill="#cdc3ec" text-anchor="middle">TARJETA DE JUGADOR &#183; INTRANSFERIBLE</text>',
                '<text x="175" y="150" font-family="monospace" font-size="20" font-weight="bold" fill="#f1ecff" text-anchor="middle">',
                aliasStr,
                "</text>",
                '<text x="175" y="190" font-family="monospace" font-size="14" fill="#f1ecff" text-anchor="middle">Mejor puntaje: ',
                scoreStr,
                "</text>",
                '<text x="175" y="216" font-family="monospace" font-size="14" fill="#f1ecff" text-anchor="middle">Logros desbloqueados: ',
                achStr,
                "</text>",
                '<text x="175" y="312" font-family="monospace" font-size="9" fill="#cdc3ec" text-anchor="middle">',
                addrStr,
                "</text>",
                "</svg>"
            );
    }

    /// @dev El JSON de metadata completo (con la imagen ya embebida como
    /// SVG en base64 adentro) — separado de tokenURI() por la misma razón
    /// que _cardSvg.
    function _cardJson(string memory aliasStr, string memory scoreStr, string memory achStr, bytes memory svg)
        internal
        pure
        returns (bytes memory)
    {
        return
            abi.encodePacked(
                '{"name":"R3 Apocalipsis - Tarjeta de ',
                aliasStr,
                '","description":"Tarjeta de jugador de R3 Apocalipsis (Monad Mainnet). Intransferible: pertenece para siempre a quien jugo. Se actualiza sola con tu progreso, sin transacciones extra.",',
                '"image":"data:image/svg+xml;base64,',
                Base64.encode(svg),
                '","attributes":[{"trait_type":"Alias","value":"',
                aliasStr,
                '"},{"trait_type":"Mejor puntaje","value":',
                scoreStr,
                '},{"trait_type":"Logros","value":',
                achStr,
                "}]}"
            );
    }

    /// @notice Metadata + imagen de la tarjeta, generadas al momento (100%
    /// on-chain, sin depender de ningún servidor): siempre refleja tu
    /// alias/puntaje/logros MÁS RECIENTES, aunque la tarjeta nunca reciba
    /// una transacción propia de "actualizar".
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        address player = address(uint160(tokenId));

        string memory aliasStr = bytes(playerAlias[player]).length > 0 ? playerAlias[player] : "Sin alias";
        string memory scoreStr = Strings.toString(bestScore[player]);
        string memory achStr = Strings.toString(_achievementCount(achievementsMask[player]));

        bytes memory svg = _cardSvg(aliasStr, scoreStr, achStr, Strings.toHexString(player));
        bytes memory json = _cardJson(aliasStr, scoreStr, achStr, svg);

        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(json)));
    }

    constructor(address initialOwner) Ownable(initialOwner) ERC721("R3 Apocalipsis - Tarjeta de Jugador", "R3CARD") {}

    /// @notice Pone o cambia tu alias público (se muestra en el ranking en
    /// vez de tu dirección completa). Se puede cambiar cuantas veces quieras.
    function setAlias(string calldata newAlias) external {
        bytes memory b = bytes(newAlias);
        require(b.length > 0 && b.length <= MAX_ALIAS_LENGTH, "R3: alias debe tener entre 1 y 20 caracteres");
        _ensureCard(msg.sender);
        playerAlias[msg.sender] = newAlias;
        emit AliasSet(msg.sender, newAlias);
    }

    /**
     * @notice Guarda TODO el progreso de la partida que acaba de terminar,
     * en una sola transacción (así el jugador firma UNA vez, no tres):
     *   1) Puntaje: solo se actualiza (y emite ScoreSubmitted) si `score`
     *      supera tu récord anterior. Si no lo supera, simplemente no hace
     *      nada con el puntaje — NUNCA revierte por esto.
     *   2) Logros: cada id de `newAchievementIds` que todavía no tenías se
     *      desbloquea (y emite AchievementUnlocked). Los que ya tenías se
     *      ignoran en silencio, nunca duplica el evento.
     *   3) R3tards cazados: cada tokenId de `killedTokenIds` que sea la
     *      PRIMERA VEZ que muere en manos de cualquier jugador (nunca antes,
     *      de nadie) se marca para siempre en everKilledGloballyBitmap y emite
     *      TokenKilled. Si ese tokenId ya había muerto antes (lo normal con
     *      el tiempo), no hace nada — así re-matar r3tards ya "cazados" es
     *      prácticamente gratis.
     * Se llama SOLA desde el frontend apenas termina cada partida (si ya
     * hay wallet conectada) — el jugador ya no tiene que apretar ningún
     * botón de "guardar". Revierte solo si de verdad no hay NADA nuevo que
     * guardar (evita transacciones inútiles).
     * @param killedTiers mismo largo que killedTokenIds — el índice de tier
     * (0=común, 1=poco común, 2=raro, 3=épico, 4=legendario, ver
     * TIER_CHAIN_CODE en web/js/config.js) de cada tokenId, en el mismo orden.
     */
    function recordMatch(
        uint256 score,
        uint8[] calldata newAchievementIds,
        uint256[] calldata killedTokenIds,
        uint8[] calldata killedTiers
    ) external whenNotPaused {
        require(killedTokenIds.length == killedTiers.length, "R3: killedTokenIds/killedTiers no coinciden en largo");
        require(killedTokenIds.length <= MAX_KILLS_PER_MATCH, "R3: demasiados r3tards en una sola partida");

        bool didSomething = false;

        if (score > bestScore[msg.sender]) {
            bestScore[msg.sender] = score;
            emit ScoreSubmitted(msg.sender, score, block.timestamp);
            didSomething = true;
        }

        uint256 mask = achievementsMask[msg.sender];
        uint256 newAchCount = 0;
        for (uint256 i = 0; i < newAchievementIds.length; i++) {
            uint8 id = newAchievementIds[i];
            uint256 bit = 1 << id;
            if (mask & bit == 0) {
                mask |= bit;
                newAchCount++;
                emit AchievementUnlocked(msg.sender, id, block.timestamp);
            }
        }
        if (newAchCount > 0) {
            achievementsMask[msg.sender] = mask;
            didSomething = true;
        }

        uint256 newGlobalKills = 0;
        for (uint256 i = 0; i < killedTokenIds.length; i++) {
            uint256 tokenId = killedTokenIds[i];
            uint256 word = tokenId / 256;
            uint256 bit = 1 << (tokenId % 256);
            uint256 bits = everKilledGloballyBitmap[word];
            if (bits & bit == 0) {
                everKilledGloballyBitmap[word] = bits | bit;
                emit TokenKilled(tokenId, msg.sender, killedTiers[i], block.timestamp);
                newGlobalKills++;
                didSomething = true;
            }
        }

        require(didSomething, "R3: nada nuevo que guardar");

        _ensureCard(msg.sender);
        emit MatchRecorded(msg.sender, score, newAchCount, newGlobalKills);
    }

    /// @notice ¿Esta wallet ya tiene el logro `id`?
    function hasAchievement(address player, uint8 id) external view returns (bool) {
        return (achievementsMask[player] & (1 << id)) != 0;
    }

    /**
     * @notice Paga el precio de la partida y desbloquea el juego en el frontend.
     * @dev El frontend escucha el evento GamePaid (o simplemente el éxito del tx)
     *      para arrancar el juego. No se guarda ningún estado de "sesión" on-chain
     *      a propósito: mantiene el contrato barato en gas y sin lógica que auditar.
     */
    function playGame() external payable whenNotPaused nonReentrant {
        require(msg.value == playPrice, "R3: envia exactamente playPrice en MON");

        totalGamesPaid += 1;
        totalCollected += msg.value;

        emit GamePaid(msg.sender, msg.value, totalGamesPaid, block.timestamp);
    }

    /// @notice Cambia el precio de la partida (solo el dueño).
    function setPlayPrice(uint256 newPrice) external onlyOwner {
        require(newPrice > 0, "R3: precio invalido");
        uint256 old = playPrice;
        playPrice = newPrice;
        emit PriceUpdated(old, newPrice);
    }

    /// @notice Pausa los pagos (por ejemplo si detectas algo raro). No afecta fondos ya recaudados.
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Retira TODO el balance del contrato a una dirección elegida por el owner.
    function withdraw(address payable to) external onlyOwner nonReentrant {
        require(to != address(0), "R3: destino invalido");
        uint256 bal = address(this).balance;
        require(bal > 0, "R3: nada que retirar");
        (bool ok, ) = to.call{value: bal}("");
        require(ok, "R3: fallo el envio");
        emit Withdrawn(to, bal);
    }

    /// @notice Igual que withdraw(), pero retira solo una parte.
    function withdrawPartial(address payable to, uint256 amount) external onlyOwner nonReentrant {
        require(to != address(0), "R3: destino invalido");
        require(amount > 0 && amount <= address(this).balance, "R3: monto invalido");
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "R3: fallo el envio");
        emit Withdrawn(to, amount);
    }

    /// @dev Bloquea depositos accidentales que no pasen por playGame().
    receive() external payable {
        revert("R3: usa playGame()");
    }

    fallback() external payable {
        revert("R3: funcion no reconocida");
    }
}
