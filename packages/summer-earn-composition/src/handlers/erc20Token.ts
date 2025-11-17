import { type Abi, type Address, type PublicClient, erc20Abi } from 'viem'

import { type MultistepTask, runMultistepTasks } from '../multistepMulticall'
import type { ProtocolHandler, ProtocolHandlerContext } from '../registry'
import type { ProductComposition, ProductDescriptor } from '../types'

type Erc20Context = {
  symbol?: string
  decimals?: number
  balance?: bigint
}

export interface Erc20TokenResolution {
  symbol?: string
  decimals?: number
  balance?: bigint
}

type Erc20Task = MultistepTask<Erc20TokenResolution>

function buildErc20Task(params: { token: Address; owner?: Address }): Erc20Task {
  const { token, owner } = params
  const ctx: Erc20Context = {}
  const hasOwner = !!owner

  const task: Erc20Task = {
    maxStep: 1,

    buildStepCalls(step) {
      if (step !== 1) return []

      const calls: {
        key: string
        target: Address
        abi: Abi
        functionName: string
        args?: readonly unknown[]
      }[] = [
        {
          key: 'symbol',
          target: token,
          abi: erc20Abi as Abi,
          functionName: 'symbol',
        },
        {
          key: 'decimals',
          target: token,
          abi: erc20Abi as Abi,
          functionName: 'decimals',
        },
      ]

      if (hasOwner && owner) {
        calls.push({
          key: 'balance',
          target: token,
          abi: erc20Abi as Abi,
          functionName: 'balanceOf',
          args: [owner],
        })
      }

      return calls
    },

    consumeStepResults(step, results) {
      if (step !== 1) return

      for (const result of results) {
        if (result.key === 'symbol') {
          ctx.symbol = result.value as string
        }
        if (result.key === 'decimals') {
          ctx.decimals = Number(result.value as bigint | number)
        }
        if (result.key === 'balance') {
          ctx.balance = BigInt(result.value as string | bigint)
        }
      }
    },

    finalize() {
      return {
        symbol: ctx.symbol,
        decimals: ctx.decimals,
        balance: ctx.balance,
      }
    },
  }

  return task
}

export async function resolveErc20Token(params: {
  client: PublicClient
  token: Address
  owner?: Address
}): Promise<Erc20TokenResolution> {
  const { client, token, owner } = params
  const task = buildErc20Task({ token, owner })
  const [resolution] = await runMultistepTasks(client, [task])
  return resolution
}

export async function resolveErc20TokensBulk(params: {
  client: PublicClient
  entries: { token: Address; owner?: Address }[]
}): Promise<Erc20TokenResolution[]> {
  const { client, entries } = params
  if (entries.length === 0) return []

  const tasks = entries.map((entry) => buildErc20Task({ token: entry.token, owner: entry.owner }))
  console.log('running', tasks.length, 'tasks')
  return runMultistepTasks(client, tasks)
}

export class Erc20TokenHandler implements ProtocolHandler {
  supports(product: ProductDescriptor): boolean {
    return product.protocol === 'Erc20'
  }

  async getComposition(params: {
    product: ProductDescriptor
    owner: Address
    context: ProtocolHandlerContext
  }): Promise<ProductComposition> {
    const { product, owner, context } = params

    const resolution = await resolveErc20Token({
      client: context.client,
      token: product.positionToken,
      owner,
    })

    const amount = resolution.balance ?? 0n

    return {
      type: 'single-token',
      underlying: {
        tokenAddress: product.positionToken,
        amount,
      },
    }
  }
}
