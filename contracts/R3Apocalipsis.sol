// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * R3 APOCALIPSIS — contrato de "ficha de partida" (pay-to-play)
 * ----------------------------------------------------------------
 * Qué hace:
 *   - El jugador paga un precio fijo en MON para poder jugar una partida.
 *   - El contrato solo recibe y guarda ese pago hasta que el dueño lo retira.
 *   - No custodia NFTs, no pide aprobaciones (approve) de ningún token,
 *     no puede mover fondos del jugador aparte del pago exacto que él mismo envía.
 *
 * Por qué es así de simple:
 *   - Menos código = menos superficie de bugs. Es literalmente una "máquina
 *     recreativa": metes la moneda (MON), se abre la partida.
 *   - El resultado del juego (puntaje, vidas, etc.) vive en el navegador del
 *     jugador — no on-chain — así que este contrato no necesita fiarse de
 *     nada que el cliente le reporte, y no hay incentivo para que alguien
 *     intente falsear un resultado on-chain.
 *
 * Deploy: Remix + tu wallet, red Monad Mainnet (chainId 143). Tú eres el
 * owner (el deployer) automáticamente.
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
    // tenga que mantener. El costo es una transacción chiquita (gas) cada
    // vez que alguien mejora su propio récord o desbloquea un logro nuevo
    // — nunca en cada partida.
    //
    // ⚠️ MISMA LIMITACIÓN YA CONOCIDA que "jugar sin pagar" (ver README):
    // como el juego corre solo en el navegador de cada jugador, sin
    // servidor que verifique nada, alguien técnico PODRÍA llamar
    // submitScore()/unlockAchievements() directo desde la consola con
    // números inventados, sin haber jugado de verdad. No hay forma de
    // cerrar esto al 100% sin un backend propio que valide cada partida
    // (fuera del alcance de este proyecto, ver README). Como no hay
    // ningún premio en dinero ligado al puntaje o a los logros, el peor
    // caso es alguien mintiendo sobre su propio puntaje/logros en un
    // juego gratis de ver — no hay forma de robar fondos ni de afectar a
    // otros jugadores con esto.
    // ------------------------------------------------------------------

    uint256 public constant MAX_ALIAS_LENGTH = 20;

    /// @notice Alias público que cada wallet puede ponerse (para el ranking).
    mapping(address => string) public playerAlias;

    /// @notice Mejor puntaje histórico de cada wallet (solo puede subir).
    mapping(address => uint256) public bestScore;

    /// @notice Logros desbloqueados por wallet, como bitmask (bit N = logro N,
    /// ver web/js/achievements-onchain.js para la lista con nombres/criterios).
    mapping(address => uint256) public achievementsMask;

    event AliasSet(address indexed player, string newAlias);
    event ScoreSubmitted(address indexed player, uint256 score, uint256 timestamp);
    event AchievementUnlocked(address indexed player, uint8 achievementId, uint256 timestamp);

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

    /// @notice Guarda un nuevo mejor puntaje propio, solo si supera el
    /// anterior (así nadie paga gas de más por un puntaje que no mejora nada).
    function submitScore(uint256 score) external {
        require(score > bestScore[msg.sender], "R3: no supera tu propio mejor puntaje");
        _ensureCard(msg.sender);
        bestScore[msg.sender] = score;
        emit ScoreSubmitted(msg.sender, score, block.timestamp);
    }

    /// @notice Marca uno o varios logros como desbloqueados de una sola vez
    /// (para no pagar gas por transacción por cada uno). Los que ya estaban
    /// desbloqueados se ignoran en silencio, nunca emiten el evento dos veces.
    function unlockAchievements(uint8[] calldata ids) external {
        _ensureCard(msg.sender);
        uint256 mask = achievementsMask[msg.sender];
        for (uint256 i = 0; i < ids.length; i++) {
            uint8 id = ids[i];
            uint256 bit = 1 << id;
            if (mask & bit == 0) {
                mask |= bit;
                emit AchievementUnlocked(msg.sender, id, block.timestamp);
            }
        }
        achievementsMask[msg.sender] = mask;
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
