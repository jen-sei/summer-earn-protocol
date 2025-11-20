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
] as const satisfies Abi

type MarketId = `0x${string}`

type MorphoVaultContext = {
  supplyQueueLength?: bigint
  marketIds: MarketId[]
  marketParams: Map<MarketId, { loanToken: Address; collateralToken: Address }>
  positions: Map<MarketId, { supplyShares: bigint; collateral: bigint }>
  tokenSymbols: Map<Address, string>
}

export interface MorphoVaultResolution {
  markets: Array<{
    marketId: MarketId
    loanToken: Address
    collateralToken: Address
    loanTokenSymbol?: string
    collateralTokenSymbol?: string
    supplyShares: bigint
    collateral: bigint
  }>
}

type MorphoVaultTask = MultistepTask<MorphoVaultResolution>

function buildMorphoVaultTask(params: { vault: Address }): MorphoVaultTask {
  const { vault } = params

  const ctx: MorphoVaultContext = {
    marketIds: [],
    marketParams: new Map(),
    positions: new Map(),
    tokenSymbols: new Map(),
  }

  const task: MorphoVaultTask = {
    maxStep: 4,

    buildStepCalls(step) {
      if (step === 1) {
        // Step 1: Get supplyQueueLength
        return [
          {
            key: 'supplyQueueLength',
            target: vault,
            abi: metaMorphoAbi as Abi,
            functionName: 'supplyQueueLength',
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
        // Step 3: Get market params and positions for each market ID
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
          )
        }

        return calls
      }

      if (step === 4) {
        // Step 4: Get ERC20 symbols for all unique tokens
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
            key: `symbol_${token}`,
            target: token,
            abi: erc20Abi as Abi,
            functionName: 'symbol',
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
            const params = result.value as { loanToken: Address; collateralToken: Address }
            ctx.marketParams.set(marketId, {
              loanToken: params.loanToken,
              collateralToken: params.collateralToken,
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
        }
      }

      if (step === 4) {
        for (const result of results) {
          if (result.key.startsWith('symbol_')) {
            const token = result.key.replace('symbol_', '') as Address
            const symbol = result.value as string
            ctx.tokenSymbols.set(token, symbol)
          }
        }
      }
    },

    finalize() {
      const markets = ctx.marketIds.map((marketId) => {
        const params = ctx.marketParams.get(marketId)
        const position = ctx.positions.get(marketId)

        if (!params || !position) {
          throw new Error(`Missing data for market ${marketId}`)
        }

        return {
          marketId,
          loanToken: params.loanToken,
          collateralToken: params.collateralToken,
          loanTokenSymbol: ctx.tokenSymbols.get(params.loanToken),
          collateralTokenSymbol: ctx.tokenSymbols.get(params.collateralToken),
          supplyShares: position.supplyShares,
          collateral: position.collateral,
        }
      })

      return { markets }
    },
  }

  return task
}

/**
 * Low-level Morpho vault resolver.
 *
 * Resolves all markets in a Morpho vault's supply queue:
 * - Step 1: Get supplyQueueLength
 * - Step 2: Get all market IDs from supplyQueue
 * - Step 3: Get market params and positions for each market
 * - Step 4: Get ERC20 symbols for human-readable token names
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
        amount: market.supplyShares, // Note: This is shares, not assets. May need conversion.
      }))

    return {
      type: 'morpho-market',
      positions,
    }
  }
}
