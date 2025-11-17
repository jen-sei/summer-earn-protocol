import { type Abi, type Address, type PublicClient, erc20Abi, erc4626Abi } from 'viem'

import { type MultistepTask, runMultistepTasks } from '../multistepMulticall'
import type { ProtocolHandler, ProtocolHandlerContext } from '../registry'
import type { ProductComposition, ProductDescriptor } from '../types'

type Erc4626Context = {
  symbol?: string
  decimals?: number
  balance?: bigint
  maxWithdraw?: bigint
  maxRedeem?: bigint
  assets?: bigint
  underlyingAsset?: Address
}

export interface Erc4626VaultResolution {
  metadata: {
    symbol?: string
    decimals?: number
    underlyingAsset?: Address
    maxWithdraw?: bigint
    maxRedeem?: bigint
  }
  position?: {
    balance?: bigint
    assets?: bigint
  }
}

type Erc4626Task = MultistepTask<Erc4626VaultResolution>

function buildErc4626Task(params: { vault: Address; owner?: Address }): Erc4626Task {
  const { vault, owner } = params

  const ctx: Erc4626Context = {}
  const hasOwner = !!owner

  const task: Erc4626Task = {
    maxStep: hasOwner ? 2 : 1,

    buildStepCalls(step) {
      if (step === 1) {
        const calls: {
          key: string
          target: Address
          abi: Abi
          functionName: string
          args?: readonly unknown[]
        }[] = [
          {
            key: 'symbol',
            target: vault,
            abi: erc20Abi as Abi,
            functionName: 'symbol',
          },
          {
            key: 'decimals',
            target: vault,
            abi: erc20Abi as Abi,
            functionName: 'decimals',
          },
          {
            key: 'asset',
            target: vault,
            abi: erc4626Abi as Abi,
            functionName: 'asset',
          },
        ]

        if (hasOwner && owner) {
          calls.push(
            {
              key: 'balance',
              target: vault,
              abi: erc20Abi as Abi,
              functionName: 'balanceOf',
              args: [owner],
            },
            {
              key: 'maxWithdraw',
              target: vault,
              abi: erc4626Abi as Abi,
              functionName: 'maxWithdraw',
              args: [owner],
            },
            {
              key: 'maxRedeem',
              target: vault,
              abi: erc4626Abi as Abi,
              functionName: 'maxRedeem',
              args: [owner],
            },
          )
        }

        return calls
      }

      if (step === 2 && hasOwner) {
        if (ctx.balance === undefined) {
          return []
        }

        return [
          {
            key: 'assets',
            target: vault,
            abi: erc4626Abi as Abi,
            functionName: 'convertToAssets',
            args: [ctx.balance],
          },
        ]
      }

      return []
    },

    consumeStepResults(step, results) {
      for (const result of results) {
        if (step === 1) {
          if (result.key === 'symbol') {
            ctx.symbol = result.value as string
          }
          if (result.key === 'decimals') {
            ctx.decimals = Number(result.value as bigint | number)
          }
          if (result.key === 'asset') {
            ctx.underlyingAsset = result.value as Address
          }
          if (hasOwner) {
            if (result.key === 'balance') {
              ctx.balance = BigInt(result.value as string | bigint)
            }
            if (result.key === 'maxWithdraw') {
              ctx.maxWithdraw = BigInt(result.value as string | bigint)
            }
            if (result.key === 'maxRedeem') {
              ctx.maxRedeem = BigInt(result.value as string | bigint)
            }
          }
        }

        if (step === 2 && result.key === 'assets') {
          ctx.assets = BigInt(result.value as string | bigint)
        }
      }
    },

    finalize() {
      return {
        metadata: {
          symbol: ctx.symbol,
          decimals: ctx.decimals,
          underlyingAsset: ctx.underlyingAsset,
          maxWithdraw: ctx.maxWithdraw,
          maxRedeem: ctx.maxRedeem,
        },
        position: hasOwner
          ? {
              balance: ctx.balance,
              assets: ctx.assets,
            }
          : undefined,
      }
    },
  }

  return task
}

/**
 * Low-level ERC4626 resolver used by both the handler and scripts.
 *
 * If `owner` is provided:
 * - runs full 2-step pipeline (including balance/maxWithdraw/maxRedeem and convertToAssets).
 *
 * If `owner` is omitted:
 * - runs metadata-only step (symbol/decimals/asset), skipping owner-dependent calls.
 */
export async function resolveErc4626Vault(params: {
  client: PublicClient
  vault: Address
  owner?: Address
}): Promise<Erc4626VaultResolution> {
  const { client, vault, owner } = params
  const task = buildErc4626Task({ vault, owner })
  const [resolution] = await runMultistepTasks(client, [task])
  return resolution
}

export async function resolveErc4626VaultsBulk(params: {
  client: PublicClient
  entries: { vault: Address; owner?: Address }[]
}): Promise<Erc4626VaultResolution[]> {
  const { client, entries } = params
  if (entries.length === 0) return []

  const tasks = entries.map((entry) => buildErc4626Task({ vault: entry.vault, owner: entry.owner }))

  return runMultistepTasks(client, tasks)
}

/**
 * Generic ERC4626 vault handler.
 *
 * Step 1 (metadata and limits):
 * - symbol (share token)
 * - decimals (share token)
 * - balanceOf(owner)
 * - maxWithdraw(owner)
 * - maxRedeem(owner)
 * - asset() -> underlying ERC20
 *
 * Step 2 (composition):
 * - convertToAssets(balanceOf(owner))
 */
export class Erc4626VaultHandler implements ProtocolHandler {
  supports(product: ProductDescriptor): boolean {
    return product.protocol === 'Erc4626'
  }

  async getComposition(params: {
    product: ProductDescriptor
    owner: Address
    context: ProtocolHandlerContext
  }): Promise<ProductComposition> {
    const { product, owner, context } = params

    const resolution = await resolveErc4626Vault({
      client: context.client,
      vault: product.positionToken,
      owner,
    })

    if (!resolution.metadata.underlyingAsset || !resolution.position?.assets) {
      throw new Error('Erc4626VaultHandler: missing resolved assets or underlying asset')
    }

    return {
      type: 'single-token',
      underlying: {
        tokenAddress: resolution.metadata.underlyingAsset,
        amount: resolution.position.assets,
      },
    }
  }
}
