import { type Abi, type Address, createPublicClient, http, erc20Abi } from 'viem'
import { mainnet } from 'viem/chains'

import { type MultistepTask, runMultistepTasks } from '../../multistepMulticall'
import type { ArkHandler, CollateralResult, CollateralMap } from './types'

// Stargate V2 Pool ABI
const stargateV2PoolAbi = [
  {
    inputs: [],
    name: 'totalLiquidity',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'token',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const satisfies Abi

type StargateV2Context = {
  token?: Address
  totalLiquidity?: bigint
  totalSupply?: bigint
  tokenDecimals?: number
}

type StargateV2Resolution = CollateralResult[]

function buildStargateV2Task(params: { pool: Address }): MultistepTask<StargateV2Resolution> {
  const { pool } = params

  const ctx: StargateV2Context = {}

  const task: MultistepTask<StargateV2Resolution> = {
    maxStep: 3,

    buildStepCalls(step) {
      if (step === 1) {
        // Step 1: Discover pool structure
        return [
          {
            key: 'token',
            target: pool,
            abi: stargateV2PoolAbi as Abi,
            functionName: 'token',
          },
          {
            key: 'totalLiquidity',
            target: pool,
            abi: stargateV2PoolAbi as Abi,
            functionName: 'totalLiquidity',
          },
          {
            key: 'totalSupply',
            target: pool,
            abi: stargateV2PoolAbi as Abi,
            functionName: 'totalSupply',
          },
        ]
      }

      if (step === 2) {
        // Step 2: Get decimals for token
        if (!ctx.token) {
          return []
        }

        return [
          {
            key: 'decimals',
            target: ctx.token,
            abi: erc20Abi as Abi,
            functionName: 'decimals',
          },
        ]
      }

      if (step === 3) {
        // Step 3: Placeholder for additional data if needed
        return []
      }

      return []
    },

    consumeStepResults(step, results) {
      if (step === 1) {
        for (const result of results) {
          if (result.key === 'token') {
            ctx.token = result.value as Address
          }
          if (result.key === 'totalLiquidity') {
            ctx.totalLiquidity = BigInt(result.value as string | bigint)
          }
          if (result.key === 'totalSupply') {
            ctx.totalSupply = BigInt(result.value as string | bigint)
          }
        }
      }

      if (step === 2) {
        for (const result of results) {
          if (result.key === 'decimals') {
            ctx.tokenDecimals = result.value as number
          }
        }
      }
    },

    finalize() {
      const collateralMap: CollateralMap = new Map()

      // Stargate V2 pools hold underlying tokens as liquidity
      // totalLiquidity represents the collateral
      if (ctx.token && ctx.totalLiquidity && ctx.totalLiquidity > 0n) {
        const token = ctx.token.toLowerCase()
        // Stargate pools are typically stablecoin pools, high LTV
        collateralMap.set(token, {
          amount: ctx.totalLiquidity,
          ltv: 9000, // Default 90% LTV for stablecoin pools
        })
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

export const StargateV2Ark: ArkHandler = {
  name: 'Stargate V2',

  buildTask(address: string): MultistepTask<CollateralResult[]> {
    return buildStargateV2Task({ pool: address as Address })
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
// console.log(await StargateV2Ark.getCollateral('0xc026395860Db2d07ee33e05fE50ed7bD583189C7'))
