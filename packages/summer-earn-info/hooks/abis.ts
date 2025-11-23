import { parseAbi } from 'viem'

export const FLEET_COMMANDER_ABI = parseAbi([
  'function totalAssets() view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function convertToAssets(uint256 shares) view returns (uint256)',
  'function config() view returns (address bufferArk, uint256 minimumBufferBalance, uint256 depositCap, uint256 maxRebalanceOperations, address stakingRewardsManager)',
  'function getActiveArks() view returns (address[])',
  'function bufferArk() view returns (address)',
])

export const ARK_ABI = parseAbi([
  'function totalAssets() view returns (uint256)',
  'function getConfig() view returns ((address asset, address commander, address raft, uint256 depositCap, uint256 maxRebalanceOutflow, uint256 maxRebalanceInflow, string name, string details, bool requiresKeeperData, uint256 maxDepositPercentageOfTVL))',
])

export const MORPHO_VAULT_ARK_ABI = parseAbi([
  'function metaMorpho() view returns (address)',
  'function totalAssets() view returns (uint256)',
])

export const META_MORPHO_ABI = parseAbi([
  'function supplyQueueLength() view returns (uint256)',
  'function supplyQueue(uint256) view returns (bytes32)',
  'function totalAssets() view returns (uint256)',
  'function lastTotalAssets() view returns (uint256)',
])

export const MORPHO_BLUE_ABI = parseAbi([
  'function position(bytes32 id, address user) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)',
  'function market(bytes32 id) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)',
  'function idToMarketParams(bytes32 id) view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)',
])

export const ERC20_ABI = parseAbi([
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
])
