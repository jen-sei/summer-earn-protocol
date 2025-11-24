import { type Abi, type Address, createPublicClient, http, erc20Abi } from 'viem'
import { mainnet } from 'viem/chains'

import { type MultistepTask, runMultistepTasks } from '../../multistepMulticall'
import type { ArkHandler, CollateralResult, CollateralMap, TokenDecimalsMap } from './types'

// Compound V3 Comet ABI
const compoundV3CometAbi = [
  {
    inputs: [],
    name: 'getAssetInfo',
    outputs: [
      {
        components: [
          { internalType: 'address', name: 'asset', type: 'address' },
          { internalType: 'address', name: 'priceFeed', type: 'address' },
          { internalType: 'uint64', name: 'borrowCollateralFactor', type: 'uint64' },
          { internalType: 'uint64', name: 'liquidateCollateralFactor', type: 'uint64' },
          { internalType: 'uint64', name: 'liquidationFactor', type: 'uint64' },
          { internalType: 'uint128', name: 'supplyCap', type: 'uint128' },
        ],
        internalType: 'struct CometCore.AssetInfo',
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'numAssets',
    outputs: [{ internalType: 'uint8', name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint8', name: 'i', type: 'uint8' }],
    name: 'getAssetInfoByIndex',
    outputs: [
      {
        components: [
          { internalType: 'address', name: 'asset', type: 'address' },
          { internalType: 'address', name: 'priceFeed', type: 'address' },
          { internalType: 'uint64', name: 'borrowCollateralFactor', type: 'uint64' },
          { internalType: 'uint64', name: 'liquidateCollateralFactor', type: 'uint64' },
          { internalType: 'uint64', name: 'liquidationFactor', type: 'uint64' },
          { internalType: 'uint128', name: 'supplyCap', type: 'uint128' },
        ],
        internalType: 'struct CometCore.AssetInfo',
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'asset', type: 'address' }],
    name: 'getCollateralReserves',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const satisfies Abi

type CompoundV3Context = {
  numAssets?: number
  assetInfos: Map<Address, { borrowCollateralFactor: bigint }>
  collateralBalances: Map<Address, bigint>
  tokenDecimals: TokenDecimalsMap
}

type CompoundV3Resolution = CollateralResult[]

function buildCompoundV3Task(params: { comet: Address }): MultistepTask<CompoundV3Resolution> {
  const { comet } = params

  const ctx: CompoundV3Context = {
    assetInfos: new Map(),
    collateralBalances: new Map(),
    tokenDecimals: new Map(),
  }

  const task: MultistepTask<CompoundV3Resolution> = {
    maxStep: 4,

    buildStepCalls(step) {
      if (step === 1) {
        // Step 1: Get number of assets
        return [
          {
            key: 'numAssets',
            target: comet,
            abi: compoundV3CometAbi as Abi,
            functionName: 'numAssets',
          },
        ]
      }

      if (step === 2) {
        // Step 2: Get asset info for each asset
        if (ctx.numAssets === undefined) {
          return []
        }

        const calls: {
          key: string
          target: Address
          abi: Abi
          functionName: string
          args: readonly unknown[]
        }[] = []

        for (let i = 0; i < ctx.numAssets; i++) {
          calls.push({
            key: `assetInfo_${i}`,
            target: comet,
            abi: compoundV3CometAbi as Abi,
            functionName: 'getAssetInfoByIndex',
            args: [i],
          })
        }

        return calls
      }

      if (step === 3) {
        // Step 3: Get collateral reserves for each asset
        if (ctx.assetInfos.size === 0) {
          return []
        }

        const calls: {
          key: string
          target: Address
          abi: Abi
          functionName: string
          args: readonly unknown[]
        }[] = []

        for (const asset of ctx.assetInfos.keys()) {
          calls.push({
            key: `collateralReserves_${asset}`,
            target: comet,
            abi: compoundV3CometAbi as Abi,
            functionName: 'getCollateralReserves',
            args: [asset],
          })
        }

        return calls
      }

      if (step === 4) {
        // Step 4: Get decimals for all assets
        const calls: {
          key: string
          target: Address
          abi: Abi
          functionName: string
        }[] = []

        for (const asset of ctx.assetInfos.keys()) {
          calls.push({
            key: `decimals_${asset}`,
            target: asset,
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
          if (result.key === 'numAssets') {
            ctx.numAssets = Number(result.value as string | bigint)
          }
        }
      }

      if (step === 2) {
        for (const result of results) {
          if (result.key.startsWith('assetInfo_')) {
            const info = result.value as {
              asset: Address
              borrowCollateralFactor: bigint | string
            }
            ctx.assetInfos.set(info.asset, {
              borrowCollateralFactor: BigInt(info.borrowCollateralFactor),
            })
          }
        }
      }

      if (step === 3) {
        for (const result of results) {
          if (result.key.startsWith('collateralReserves_')) {
            const asset = result.key.replace('collateralReserves_', '') as Address
            ctx.collateralBalances.set(asset, BigInt(result.value as string | bigint))
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

      // Aggregate collateral balances with their LTV factors
      for (const [asset, info] of ctx.assetInfos.entries()) {
        const balance = ctx.collateralBalances.get(asset) || 0n
        if (balance > 0n) {
          const token = asset.toLowerCase()
          // borrowCollateralFactor is in basis points (e.g., 8000 = 80%)
          const ltv = Number(info.borrowCollateralFactor)

          const existing = collateralMap.get(token) || { amount: 0n, ltv: 0 }
          collateralMap.set(token, {
            amount: existing.amount + balance,
            ltv: Math.max(existing.ltv, ltv),
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

export const CompoundV3Ark: ArkHandler = {
  name: 'Compound V3',

  buildTask(address: string): MultistepTask<CollateralResult[]> {
    return buildCompoundV3Task({ comet: address as Address })
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
// console.log(await CompoundV3Ark.getCollateral('0xc3d688B66703497DAA19211EEdff47f25384CdC3'))
