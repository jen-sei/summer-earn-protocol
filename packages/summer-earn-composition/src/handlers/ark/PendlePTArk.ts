import { type Abi, type Address, createPublicClient, http, erc20Abi } from 'viem'
import { mainnet } from 'viem/chains'

import { type MultistepTask, runMultistepTasks } from '../../multistepMulticall'
import type { ArkHandler, CollateralResult, CollateralMap, TokenDecimalsMap } from './types'

// Pendle PT (Principal Token) Market ABI
const pendleMarketAbi = [
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'SY',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'PT',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'YT',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getTotalLocked',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const satisfies Abi

// Pendle SY (Standardized Yield) ABI
const pendleSYAbi = [
  {
    inputs: [],
    name: 'assetInfo',
    outputs: [
      {
        components: [
          { internalType: 'address', name: 'asset', type: 'address' },
          { internalType: 'uint8', name: 'assetDecimals', type: 'uint8' },
        ],
        internalType: 'struct AssetInfo',
        name: '',
        type: 'tuple',
      },
    ],
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

// Pendle PT Token ABI
const pendlePTAbi = [
  {
    inputs: [],
    name: 'underlyingAsset',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const satisfies Abi

type PendlePTContext = {
  sy?: Address
  pt?: Address
  yt?: Address
  totalLocked?: bigint
  underlyingAsset?: Address
  tokenDecimals: TokenDecimalsMap
}

type PendlePTResolution = CollateralResult[]

function buildPendlePTTask(params: { market: Address }): MultistepTask<PendlePTResolution> {
  const { market } = params

  const ctx: PendlePTContext = {
    tokenDecimals: new Map(),
  }

  const task: MultistepTask<PendlePTResolution> = {
    maxStep: 4,

    buildStepCalls(step) {
      if (step === 1) {
        // Step 1: Discover market structure
        return [
          {
            key: 'sy',
            target: market,
            abi: pendleMarketAbi as Abi,
            functionName: 'SY',
          },
          {
            key: 'pt',
            target: market,
            abi: pendleMarketAbi as Abi,
            functionName: 'PT',
          },
          {
            key: 'totalLocked',
            target: market,
            abi: pendleMarketAbi as Abi,
            functionName: 'getTotalLocked',
          },
        ]
      }

      if (step === 2) {
        // Step 2: Get underlying asset from SY
        if (!ctx.sy) {
          return []
        }

        return [
          {
            key: 'assetInfo',
            target: ctx.sy,
            abi: pendleSYAbi as Abi,
            functionName: 'assetInfo',
          },
        ]
      }

      if (step === 3) {
        // Step 3: Get underlying asset from PT (alternative method)
        if (!ctx.pt) {
          return []
        }

        return [
          {
            key: 'underlyingAsset',
            target: ctx.pt,
            abi: pendlePTAbi as Abi,
            functionName: 'underlyingAsset',
          },
        ]
      }

      if (step === 4) {
        // Step 4: Get decimals for underlying asset
        const uniqueTokens = new Set<Address>()
        if (ctx.underlyingAsset) {
          uniqueTokens.add(ctx.underlyingAsset)
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
          if (result.key === 'sy') {
            ctx.sy = result.value as Address
          }
          if (result.key === 'pt') {
            ctx.pt = result.value as Address
          }
          if (result.key === 'totalLocked') {
            ctx.totalLocked = BigInt(result.value as string | bigint)
          }
        }
      }

      if (step === 2) {
        for (const result of results) {
          if (result.key === 'assetInfo') {
            const info = result.value as { asset: Address; assetDecimals: number }
            ctx.underlyingAsset = info.asset
            ctx.tokenDecimals.set(info.asset, info.assetDecimals)
          }
        }
      }

      if (step === 3) {
        for (const result of results) {
          if (result.key === 'underlyingAsset') {
            ctx.underlyingAsset = result.value as Address
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

      // Pendle PT markets lock underlying assets
      // The totalLocked represents the underlying collateral
      if (ctx.underlyingAsset && ctx.totalLocked && ctx.totalLocked > 0n) {
        const token = ctx.underlyingAsset.toLowerCase()
        // PT tokens represent future value, LTV depends on time to maturity
        // For simplicity, use a conservative LTV (70-80%)
        collateralMap.set(token, {
          amount: ctx.totalLocked,
          ltv: 7500, // Default 75% LTV for PT tokens
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

export const PendlePTArk: ArkHandler = {
  name: 'Pendle PT Market',

  buildTask(address: string): MultistepTask<CollateralResult[]> {
    return buildPendlePTTask({ market: address as Address })
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
// console.log(await PendlePTArk.getCollateral('0x1A6fCc85557BC4fB7B534ed835a03EF056552D52'))
