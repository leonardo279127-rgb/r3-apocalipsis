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

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract R3Apocalipsis is Ownable, Pausable, ReentrancyGuard {
    /// @notice Precio actual de una partida, en wei (1 MON = 1e18 wei, igual que ETH).
    uint256 public playPrice = 10 ether; // 10 MON

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

    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice Pone o cambia tu alias público (se muestra en el ranking en
    /// vez de tu dirección completa). Se puede cambiar cuantas veces quieras.
    function setAlias(string calldata newAlias) external {
        bytes memory b = bytes(newAlias);
        require(b.length > 0 && b.length <= MAX_ALIAS_LENGTH, "R3: alias debe tener entre 1 y 20 caracteres");
        playerAlias[msg.sender] = newAlias;
        emit AliasSet(msg.sender, newAlias);
    }

    /// @notice Guarda un nuevo mejor puntaje propio, solo si supera el
    /// anterior (así nadie paga gas de más por un puntaje que no mejora nada).
    function submitScore(uint256 score) external {
        require(score > bestScore[msg.sender], "R3: no supera tu propio mejor puntaje");
        bestScore[msg.sender] = score;
        emit ScoreSubmitted(msg.sender, score, block.timestamp);
    }

    /// @notice Marca uno o varios logros como desbloqueados de una sola vez
    /// (para no pagar gas por transacción por cada uno). Los que ya estaban
    /// desbloqueados se ignoran en silencio, nunca emiten el evento dos veces.
    function unlockAchievements(uint8[] calldata ids) external {
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
