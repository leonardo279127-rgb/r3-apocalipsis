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

    // Ranking global y logros (guardados on-chain a propósito, ver
    // contracts/R3Apocalipsis.sol y web/js/achievements-onchain.js).
    "function setAlias(string newAlias)",
    "function playerAlias(address) view returns (string)",
    "function submitScore(uint256 score)",
    "function bestScore(address) view returns (uint256)",
    "function unlockAchievements(uint8[] ids)",
    "function hasAchievement(address player, uint8 id) view returns (bool)",
    "function achievementsMask(address) view returns (uint256)",
    "event AliasSet(address indexed player, string newAlias)",
    "event ScoreSubmitted(address indexed player, uint256 score, uint256 timestamp)",
    "event AchievementUnlocked(address indexed player, uint8 achievementId, uint256 timestamp)",
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
