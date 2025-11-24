import { type Abi, type Address, createPublicClient, http, erc20Abi } from 'viem'
import { mainnet } from 'viem/chains'

import { type MultistepTask, runMultistepTasks } from '../../multistepMulticall'
import type { ArkHandler, CollateralResult, CollateralMap, TokenDecimalsMap } from './types'

// Hardcoded Morpho address
const MORPHO_ADDRESS = '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb' as Address

// IMetaMorpho ABI - minimal interface for supplyQueueLength and supplyQueue
const metaMorphoAbi = [
  {
    inputs: [],
    name: 'supplyQueueLength',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    name: 'supplyQueue',
    outputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalAssets',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const satisfies Abi

// IMorpho ABI - minimal interface for idToMarketParams and position
const morphoAbi = [
  {
    inputs: [{ internalType: 'bytes32', name: 'id', type: 'bytes32' }],
    name: 'idToMarketParams',
    outputs: [
      {
        components: [
          { internalType: 'address', name: 'loanToken', type: 'address' },
          { internalType: 'address', name: 'collateralToken', type: 'address' },
          { internalType: 'address', name: 'oracle', type: 'address' },
          { internalType: 'address', name: 'irm', type: 'address' },
          { internalType: 'uint256', name: 'lltv', type: 'uint256' },
        ],
        internalType: 'struct MarketParams',
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'bytes32', name: 'id', type: 'bytes32' },
      { internalType: 'address', name: 'user', type: 'address' },
    ],
    name: 'position',
    outputs: [
      {
        components: [
          { internalType: 'uint128', name: 'supplyShares', type: 'uint128' },
          { internalType: 'uint128', name: 'borrowShares', type: 'uint128' },
          { internalType: 'uint128', name: 'collateral', type: 'uint128' },
        ],
        internalType: 'struct Position',
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'bytes32', name: 'id', type: 'bytes32' }],
    name: 'market',
    outputs: [
      {
        components: [
          { internalType: 'uint128', name: 'totalSupplyAssets', type: 'uint128' },
          { internalType: 'uint128', name: 'totalSupplyShares', type: 'uint128' },
          { internalType: 'uint128', name: 'totalBorrowAssets', type: 'uint128' },
          { internalType: 'uint128', name: 'totalBorrowShares', type: 'uint128' },
          { internalType: 'uint128', name: 'lastUpdate', type: 'uint128' },
          { internalType: 'uint128', name: 'fee', type: 'uint128' },
        ],
        internalType: 'struct Market',
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const satisfies Abi

type MarketId = `0x${string}`

type MorphoVaultContext = {
  vaultTotalAssets?: bigint
  supplyQueueLength?: bigint
  marketIds: MarketId[]
  marketParams: Map<MarketId, { loanToken: Address; collateralToken: Address; lltv: bigint }>
  positions: Map<MarketId, { supplyShares: bigint; collateral: bigint }>
  marketState: Map<MarketId, { totalSupplyAssets: bigint; totalSupplyShares: bigint }>
  tokenDecimals: TokenDecimalsMap
}

type MorphoVaultResolution = CollateralResult[]

function buildMorphoVaultTask(params: { vault: Address }): MultistepTask<MorphoVaultResolution> {
  const { vault } = params

  const ctx: MorphoVaultContext = {
    marketIds: [],
    marketParams: new Map(),
    positions: new Map(),
    marketState: new Map(),
    tokenDecimals: new Map(),
  }

  const task: MultistepTask<MorphoVaultResolution> = {
    maxStep: 4,

    buildStepCalls(step) {
      if (step === 1) {
        // Step 1: Get supplyQueueLength and vaultTotalAssets
        return [
          {
            key: 'supplyQueueLength',
            target: vault,
            abi: metaMorphoAbi as Abi,
            functionName: 'supplyQueueLength',
          },
          {
            key: 'vaultTotalAssets',
            target: vault,
            abi: metaMorphoAbi as Abi,
            functionName: 'totalAssets',
          },
        ]
      }

      if (step === 2) {
        // Step 2: Get all market IDs from supplyQueue
        if (ctx.supplyQueueLength === undefined) {
          return []
        }

        const calls: {
          key: string
          target: Address
          abi: Abi
          functionName: string
          args: readonly unknown[]
        }[] = []

        for (let i = 0; i < Number(ctx.supplyQueueLength); i++) {
          calls.push({
            key: `supplyQueue_${i}`,
            target: vault,
            abi: metaMorphoAbi as Abi,
            functionName: 'supplyQueue',
            args: [BigInt(i)],
          })
        }

        return calls
      }

      if (step === 3) {
        // Step 3: Get market params, positions, and market state for each market ID
        if (ctx.marketIds.length === 0) {
          return []
        }

        const calls: {
          key: string
          target: Address
          abi: Abi
          functionName: string
          args: readonly unknown[]
        }[] = []

        for (const marketId of ctx.marketIds) {
          calls.push(
            {
              key: `marketParams_${marketId}`,
              target: MORPHO_ADDRESS,
              abi: morphoAbi as Abi,
              functionName: 'idToMarketParams',
              args: [marketId],
            },
            {
              key: `position_${marketId}`,
              target: MORPHO_ADDRESS,
              abi: morphoAbi as Abi,
              functionName: 'position',
              args: [marketId, vault],
            },
            {
              key: `market_${marketId}`,
              target: MORPHO_ADDRESS,
              abi: morphoAbi as Abi,
              functionName: 'market',
              args: [marketId],
            },
          )
        }

        return calls
      }

      if (step === 4) {
        // Step 4: Get ERC20 decimals for all unique tokens
        const uniqueTokens = new Set<Address>()
        for (const params of ctx.marketParams.values()) {
          uniqueTokens.add(params.loanToken)
          uniqueTokens.add(params.collateralToken)
        }

        const calls: {
          key: string
          target: Address
          abi: Abi
          functionName: string
        }[] = []

        for (const token of uniqueTokens) {
          calls.push({
            key: `decimals_${token}`,
            target: token,
            abi: erc20Abi as Abi,
            functionName: 'decimals',
          })
        }

        return calls
      }

      return []
    },

    consumeStepResults(step, results) {
      if (step === 1) {
        for (const result of results) {
          if (result.key === 'supplyQueueLength') {
            ctx.supplyQueueLength = BigInt(result.value as string | bigint)
          }
          if (result.key === 'vaultTotalAssets') {
            ctx.vaultTotalAssets = BigInt(result.value as string | bigint)
          }
        }
      }

      if (step === 2) {
        for (const result of results) {
          if (result.key.startsWith('supplyQueue_')) {
            const marketId = result.value as MarketId
            ctx.marketIds.push(marketId)
          }
        }
      }

      if (step === 3) {
        for (const result of results) {
          if (result.key.startsWith('marketParams_')) {
            const marketId = result.key.replace('marketParams_', '') as MarketId
            const params = result.value as {
              loanToken: Address
              collateralToken: Address
              lltv: bigint
            }
            ctx.marketParams.set(marketId, {
              loanToken: params.loanToken,
              collateralToken: params.collateralToken,
              lltv: params.lltv,
            })
          }

          if (result.key.startsWith('position_')) {
            const marketId = result.key.replace('position_', '') as MarketId
            const position = result.value as {
              supplyShares: bigint | string
              borrowShares: bigint | string
              collateral: bigint | string
            }
            ctx.positions.set(marketId, {
              supplyShares: BigInt(position.supplyShares),
              collateral: BigInt(position.collateral),
            })
          }

          if (result.key.startsWith('market_')) {
            const marketId = result.key.replace('market_', '') as MarketId
            const market = result.value as {
              totalSupplyAssets: bigint | string
              totalSupplyShares: bigint | string
            }
            ctx.marketState.set(marketId, {
              totalSupplyAssets: BigInt(market.totalSupplyAssets),
              totalSupplyShares: BigInt(market.totalSupplyShares),
            })
          }
        }
      }

      if (step === 4) {
        for (const result of results) {
          if (result.key.startsWith('decimals_')) {
            const token = result.key.replace('decimals_', '') as Address
            ctx.tokenDecimals.set(token, result.value as number)
          }
        }
      }
    },

    finalize() {
      const collateralMap: CollateralMap = new Map()

      // Aggregate by token: loan tokens (supply assets) and collateral tokens
      for (const marketId of ctx.marketIds) {
        const params = ctx.marketParams.get(marketId)
        const position = ctx.positions.get(marketId)
        const state = ctx.marketState.get(marketId)

        if (!params || !position || !state) {
          continue // Skip incomplete data
        }

        // Convert supply shares to assets
        const supplyAssets =
          state.totalSupplyShares === 0n
            ? 0n
            : (position.supplyShares * state.totalSupplyAssets) / state.totalSupplyShares

        // Convert lltv to LTV (lltv is liquidation LTV, typically higher than max LTV)
        // lltv is in basis points (e.g., 8000 = 80%), convert to our format
        // For Morpho, lltv is the liquidation threshold, so max LTV is typically lower
        // We'll use lltv as a conservative estimate, or use a default if needed
        let ltv = 0
        if (params.lltv > 0n) {
          // lltv is typically in wei format (e.g., 0.8e18 = 80%)
          // If it's > 10000, it's likely in wei format
          if (params.lltv > 10000n) {
            ltv = Number((params.lltv * 10000n) / 10n ** 18n)
          } else {
            ltv = Number(params.lltv)
          }
          // Use a conservative LTV (80% of liquidation threshold)
          ltv = Math.floor(ltv * 0.8)
        } else {
          ltv = 7500 // Default 75% LTV
        }

        // Aggregate loan tokens (supply assets)
        if (supplyAssets > 0n) {
          const loanToken = params.loanToken.toLowerCase()
          const existing = collateralMap.get(loanToken) || { amount: 0n, ltv: 0 }
          collateralMap.set(loanToken, {
            amount: existing.amount + supplyAssets,
            ltv: Math.max(existing.ltv, ltv),
          })
        }

        // Aggregate collateral tokens
        if (position.collateral > 0n) {
          const collateralToken = params.collateralToken.toLowerCase()
          // For collateral, use a higher LTV (collateral can be borrowed against)
          const collateralLtv = Math.floor(ltv * 1.1) // 10% higher than loan LTV
          const existing = collateralMap.get(collateralToken) || { amount: 0n, ltv: 0 }
          collateralMap.set(collateralToken, {
            amount: existing.amount + position.collateral,
            ltv: Math.max(existing.ltv, collateralLtv),
          })
        }
      }

      // Convert to array format
      return Array.from(collateralMap.entries()).map(([token, data]) => ({
        token,
        amount: data.amount,
        ltv: data.ltv,
      }))
    },
  }

  return task
}

export const MorphoArk: ArkHandler = {
  name: 'Morpho Vault',

  buildTask(address: string): MultistepTask<CollateralResult[]> {
    return buildMorphoVaultTask({ vault: address as Address })
  },

  async getCollateral(address: string): Promise<CollateralResult[]> {
    const client = createPublicClient({
      chain: mainnet,
      transport: http(),
    })

    const task = this.buildTask(address)
    const [resolution] = await runMultistepTasks(client, [task])
    return resolution
  },
}

// E2E TEST (run with bun/pnpm)
// console.log(await MorphoArk.getCollateral('0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB'))
