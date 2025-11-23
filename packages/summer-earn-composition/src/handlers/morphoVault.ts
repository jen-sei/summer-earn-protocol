import { type Abi, type Address, type PublicClient, erc20Abi } from 'viem'

import { type MultistepTask, runMultistepTasks } from '../multistepMulticall'
import type { ProtocolHandler, ProtocolHandlerContext } from '../registry'
import type { ProductComposition, ProductDescriptor } from '../types'

// Hardcoded Morpho address as specified
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
  tokenSymbols: Map<Address, string>
  tokenDecimals: Map<Address, number>
}

export interface MorphoVaultResolution {
  vaultTotalAssets: bigint
  markets: Array<{
    marketId: MarketId
    loanToken: Address
    collateralToken: Address
    loanTokenSymbol?: string
    collateralTokenSymbol?: string
    collateralTokenDecimals?: number
    supplyShares: bigint
    supplyAssets: bigint
    collateral: bigint
    lltv: bigint
  }>
}

type MorphoVaultTask = MultistepTask<MorphoVaultResolution>

function buildMorphoVaultTask(params: { vault: Address }): MorphoVaultTask {
  const { vault } = params

  const ctx: MorphoVaultContext = {
    marketIds: [],
    marketParams: new Map(),
    positions: new Map(),
    marketState: new Map(),
    tokenSymbols: new Map(),
    tokenDecimals: new Map(),
  }

  const task: MorphoVaultTask = {
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
        // Step 4: Get ERC20 symbols and decimals for all unique tokens
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
          calls.push(
            {
              key: `symbol_${token}`,
              target: token,
              abi: erc20Abi as Abi,
              functionName: 'symbol',
            },
            {
              key: `decimals_${token}`,
              target: token,
              abi: erc20Abi as Abi,
              functionName: 'decimals',
            },
          )
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
          if (result.key.startsWith('symbol_')) {
            const token = result.key.replace('symbol_', '') as Address
            const symbol = result.value as string
            ctx.tokenSymbols.set(token, symbol)
          }
          if (result.key.startsWith('decimals_')) {
            const token = result.key.replace('decimals_', '') as Address
            const decimals = result.value as number
            ctx.tokenDecimals.set(token, decimals)
          }
        }
      }
    },

    finalize() {
      const markets = ctx.marketIds.map((marketId) => {
        const params = ctx.marketParams.get(marketId)
        const position = ctx.positions.get(marketId)
        const state = ctx.marketState.get(marketId)

        if (!params || !position || !state) {
          // Might fail if multicall partial failure wasn't handled or data missing
          // But here we assume strict success or throw
          throw new Error(`Missing data for market ${marketId}`)
        }

        // Convert Shares to Assets
        // assets = shares * totalAssets / totalShares
        const supplyAssets =
          state.totalSupplyShares === 0n
            ? 0n
            : (position.supplyShares * state.totalSupplyAssets) / state.totalSupplyShares

        return {
          marketId,
          loanToken: params.loanToken,
          collateralToken: params.collateralToken,
          loanTokenSymbol: ctx.tokenSymbols.get(params.loanToken),
          collateralTokenSymbol: ctx.tokenSymbols.get(params.collateralToken),
          collateralTokenDecimals: ctx.tokenDecimals.get(params.collateralToken),
          supplyShares: position.supplyShares,
          supplyAssets,
          collateral: position.collateral,
          lltv: params.lltv,
        }
      })
      // Filter out empty positions to keep result clean?
      // Or keep them to show full queue?
      // Usually for risk we only care about where money IS.
      // But user might want to know empty capacity.
      // Let's filter for now to reduce noise, or leave it to the consumer.
      // The previous implementation filtered for supplyShares > 0.
      // I'll leave all in, and let consumer filter.

      return {
        vaultTotalAssets: ctx.vaultTotalAssets || 0n,
        markets,
      }
    },
  }

  return task
}

/**
 * Low-level Morpho vault resolver.
 *
 * Resolves all markets in a Morpho vault's supply queue:
 * - Step 1: Get supplyQueueLength and vaultTotalAssets
 * - Step 2: Get all market IDs from supplyQueue
 * - Step 3: Get market params, positions, and state for each market
 * - Step 4: Get ERC20 symbols/decimals for human-readable token names
 */
export async function resolveMorphoVault(params: {
  client: PublicClient
  vault: Address
}): Promise<MorphoVaultResolution> {
  const { client, vault } = params
  const task = buildMorphoVaultTask({ vault })
  const [resolution] = await runMultistepTasks(client, [task])
  return resolution
}

export async function resolveMorphoVaultsBulk(params: {
  client: PublicClient
  vaults: Address[]
}): Promise<MorphoVaultResolution[]> {
  const { client, vaults } = params
  if (vaults.length === 0) return []

  const tasks = vaults.map((vault) => buildMorphoVaultTask({ vault }))

  return runMultistepTasks(client, tasks)
}

/**
 * Generic Morpho vault handler.
 */
export class MorphoVaultHandler implements ProtocolHandler {
  supports(product: ProductDescriptor): boolean {
    return product.protocol === 'Morpho'
  }

  async getComposition(params: {
    product: ProductDescriptor
    owner: Address
    context: ProtocolHandlerContext
  }): Promise<ProductComposition> {
    const { product, context } = params

    const resolution = await resolveMorphoVault({
      client: context.client,
      vault: product.positionToken,
    })

    const positions = resolution.markets
      .filter((market) => market.supplyShares > 0n || market.collateral > 0n)
      .map((market) => ({
        marketAddress: MORPHO_ADDRESS,
        underlyingToken: market.loanToken,
        amount: market.supplyAssets, // Using Assets now
        // Note: We might want to expose collateral info here too, but ProductComposition type
        // is generic. For risk dashboard we might use resolveMorphoVault directly.
      }))

    return {
      type: 'morpho-market',
      positions,
    }
  }
}
