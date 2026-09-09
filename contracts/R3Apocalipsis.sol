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

    constructor(address initialOwner) Ownable(initialOwner) {}

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
