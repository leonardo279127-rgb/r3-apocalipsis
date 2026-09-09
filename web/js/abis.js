/**
 * ABIs mínimas (solo las funciones que realmente usamos).
 * Mantenerlas mínimas reduce superficie de error y es más fácil de auditar
 * a simple vista.
 */
window.R3_ABIS = {
  GAME: [
    "function playGame() payable",
    "function playPrice() view returns (uint256)",
    "function paused() view returns (bool)",
    "event GamePaid(address indexed player, uint256 amountPaid, uint256 gameId, uint256 timestamp)",
  ],

  ERC721: [
    "function tokenURI(uint256 tokenId) view returns (string)",
    "function ownerOf(uint256 tokenId) view returns (address)",
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address owner) view returns (uint256)",
  ],

  MULTICALL3: [
    "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[] returnData)",
  ],
};
