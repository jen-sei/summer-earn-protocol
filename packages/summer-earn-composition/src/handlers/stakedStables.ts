import { type Abi, type Address, type PublicClient, erc20Abi, erc4626Abi } from 'viem'

import { type MultistepTask, runMultistepTasks } from '../multistepMulticall'
import type { ProtocolHandler, ProtocolHandlerContext } from '../registry'
import type { ProductComposition, ProductDescriptor } from '../types'

const MAINNET_CHAIN_ID = 1

// sDAI mainnet
const SDAI_MAINNET = '0x83F20F44975D03b1b09e64809B757c47f942BEeA' as Address
const DAI_MAINNET = '0x6B175474E89094C44Da98b954EedeAC495271d0F' as Address

type StakedStablesContext = {
  shares?: bigint
  assets?: bigint
}

export interface StakedStablesResolution {
  metadata: {
    underlyingAsset: Address
  }
  position?: {
    shares?: bigint
    assets?: bigint
  }
}

type StakedStablesTask = MultistepTask<StakedStablesResolution>

function buildStakedStablesTask(params: { vault: Address; owner?: Address }): StakedStablesTask {
  const { vault, owner } = params

  const ctx: StakedStablesContext = {}
  const hasOwner = !!owner

  const task: StakedStablesTask = {
    maxStep: hasOwner ? 2 : 0,

    buildStepCalls(step) {
      if (step === 1 && hasOwner && owner) {
        return [
          {
            key: 'shares',
            target: vault,
            abi: erc20Abi as Abi,
            functionName: 'balanceOf',
            args: [owner],
          },
        ]
      }

      if (step === 2 && hasOwner) {
        if (ctx.shares === undefined) {
          return []
        }

        return [
          {
            key: 'assets',
            target: vault,
            abi: erc4626Abi as Abi,
            functionName: 'convertToAssets',
            args: [ctx.shares],
          },
        ]
      }

      return []
    },

    consumeStepResults(step, results) {
      for (const result of results) {
        if (step === 1 && result.key === 'shares') {
          ctx.shares = BigInt(result.value as string | bigint)
        }
        if (step === 2 && result.key === 'assets') {
          ctx.assets = BigInt(result.value as string | bigint)
        }
      }
    },

    finalize() {
      return {
        metadata: {
          underlyingAsset: DAI_MAINNET,
        },
        position: hasOwner
          ? {
              shares: ctx.shares,
              assets: ctx.assets,
            }
          : undefined,
      }
    },
  }

  return task
}

export async function resolveStakedStables(params: {
  client: PublicClient
  vault: Address
  owner?: Address
}): Promise<StakedStablesResolution> {
  const { client, vault, owner } = params
  const task = buildStakedStablesTask({ vault, owner })
  const [resolution] = await runMultistepTasks(client, [task])
  return resolution
}

export async function resolveStakedStablesBulk(params: {
  client: PublicClient
  entries: { vault: Address; owner?: Address }[]
}): Promise<StakedStablesResolution[]> {
  const { client, entries } = params
  if (entries.length === 0) return []

  const tasks = entries.map((entry) =>
    buildStakedStablesTask({ vault: entry.vault, owner: entry.owner }),
  )

  return runMultistepTasks(client, tasks)
}

export class StakedStablesHandler implements ProtocolHandler {
  supports(product: ProductDescriptor): boolean {
    if (product.chainId !== MAINNET_CHAIN_ID) return false
    if (product.protocol !== 'Staked Stables') return false
    return product.positionToken.toLowerCase() === SDAI_MAINNET.toLowerCase()
  }

  async getComposition(params: {
    product: ProductDescriptor
    owner: Address
    context: ProtocolHandlerContext
  }): Promise<ProductComposition> {
    const { product, owner, context } = params

    const resolution = await resolveStakedStables({
      client: context.client,
      vault: product.positionToken,
      owner,
    })

    if (!resolution.position?.assets) {
      throw new Error('StakedStablesHandler: assets not computed before finalize()')
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
