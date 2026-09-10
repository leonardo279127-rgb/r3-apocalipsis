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

    // Ranking global, logros y r3tards cazados (guardados on-chain a
    // propósito, ver contracts/R3Apocalipsis.sol y
    // web/js/achievements-onchain.js). Las tres cosas se guardan juntas,
    // en una sola transacción automática al terminar cada partida, con
    // recordMatch() — ver web/js/wallet.js.
    "function setAlias(string newAlias)",
    "function playerAlias(address) view returns (string)",
    "function bestScore(address) view returns (uint256)",
    "function recordMatch(uint256 score, uint8[] newAchievementIds, uint256[] killedTokenIds, uint8[] killedTiers)",
    "function hasAchievement(address player, uint8 id) view returns (bool)",
    "function achievementsMask(address) view returns (uint256)",
    "function isEverKilledGlobally(uint256 tokenId) view returns (bool)",
    "event AliasSet(address indexed player, string newAlias)",
    "event ScoreSubmitted(address indexed player, uint256 score, uint256 timestamp)",
    "event AchievementUnlocked(address indexed player, uint8 achievementId, uint256 timestamp)",
    "event TokenKilled(uint256 indexed tokenId, address indexed firstKiller, uint8 tier, uint256 timestamp)",
    "event MatchRecorded(address indexed player, uint256 score, uint256 newAchievements, uint256 newGlobalKills)",

    // Tarjeta de jugador (NFT ERC-721 intransferible) — ver
    // contracts/R3Apocalipsis.sol. Se mintea sola (gratis) la primera vez
    // que se guarda un alias/puntaje/logro, o a mano con mintCard().
    "function mintCard()",
    "function hasCard(address player) view returns (bool)",
    "function tokenIdOf(address player) pure returns (uint256)",
    "function tokenURI(uint256 tokenId) view returns (string)",
    "event CardMinted(address indexed player, uint256 indexed tokenId)",
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
