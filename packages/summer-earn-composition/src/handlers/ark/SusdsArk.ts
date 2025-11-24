import { type Abi, type Address, createPublicClient, http, erc20Abi } from 'viem'
import { mainnet } from 'viem/chains'

import { type MultistepTask, runMultistepTasks } from '../../multistepMulticall'
import type { ArkHandler, CollateralResult, CollateralMap, TokenDecimalsMap } from './types'

// sUSDS (Spark USD Savings) ABI
const susdsAbi = [
  {
    inputs: [],
    name: 'totalAssets',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'asset',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getCollateralAssets',
    outputs: [{ internalType: 'address[]', name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'asset', type: 'address' }],
    name: 'getCollateralBalance',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const satisfies Abi

type SusdsContext = {
  vaultAsset?: Address
  vaultTotalAssets?: bigint
  collateralAssets: Address[]
  collateralBalances: Map<Address, bigint>
  tokenDecimals: TokenDecimalsMap
}

type SusdsResolution = CollateralResult[]

function buildSusdsTask(params: { vault: Address }): MultistepTask<SusdsResolution> {
  const { vault } = params

  const ctx: SusdsContext = {
    collateralAssets: [],
    collateralBalances: new Map(),
    tokenDecimals: new Map(),
  }

  const task: MultistepTask<SusdsResolution> = {
    maxStep: 4,

    buildStepCalls(step) {
      if (step === 1) {
        // Step 1: Discover vault structure
        return [
          {
            key: 'vaultAsset',
            target: vault,
            abi: susdsAbi as Abi,
            functionName: 'asset',
          },
          {
            key: 'collateralAssets',
            target: vault,
            abi: susdsAbi as Abi,
            functionName: 'getCollateralAssets',
          },
          {
            key: 'vaultTotalAssets',
            target: vault,
            abi: susdsAbi as Abi,
            functionName: 'totalAssets',
          },
        ]
      }

      if (step === 2) {
        // Step 2: Get balances for each collateral asset
        if (ctx.collateralAssets.length === 0) {
          return []
        }

        const calls: {
          key: string
          target: Address
          abi: Abi
          functionName: string
          args: readonly unknown[]
        }[] = []

        for (const asset of ctx.collateralAssets) {
          calls.push({
            key: `collateralBalance_${asset}`,
            target: vault,
            abi: susdsAbi as Abi,
            functionName: 'getCollateralBalance',
            args: [asset],
          })
        }

        return calls
      }

      if (step === 3) {
        // Step 3: Placeholder for additional data fetching if needed
        return []
      }

      if (step === 4) {
        // Step 4: Get decimals for all unique tokens
        const uniqueTokens = new Set<Address>()
        if (ctx.vaultAsset) {
          uniqueTokens.add(ctx.vaultAsset)
        }
        for (const asset of ctx.collateralAssets) {
          uniqueTokens.add(asset)
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
          if (result.key === 'vaultAsset') {
            ctx.vaultAsset = result.value as Address
          }
          if (result.key === 'collateralAssets') {
            ctx.collateralAssets = (result.value as Address[]) || []
          }
          if (result.key === 'vaultTotalAssets') {
            ctx.vaultTotalAssets = BigInt(result.value as string | bigint)
          }
        }
      }

      if (step === 2) {
        for (const result of results) {
          if (result.key.startsWith('collateralBalance_')) {
            const asset = result.key.replace('collateralBalance_', '') as Address
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

      // Aggregate collateral balances
      // sUSDS is backed by stablecoins, typically high LTV
      for (const asset of ctx.collateralAssets) {
        const balance = ctx.collateralBalances.get(asset) || 0n
        if (balance > 0n) {
          const token = asset.toLowerCase()
          // Default 90% LTV for stablecoin-backed stablecoins
          const ltv = 9000

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

export const SusdsArk: ArkHandler = {
  name: 'sUSDS (Spark USD Savings)',

  buildTask(address: string): MultistepTask<CollateralResult[]> {
    return buildSusdsTask({ vault: address as Address })
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
// console.log(await SusdsArk.getCollateral('0xa393473d9Ed3b3a13e2A72aA5dB3d2E7A0b5c7f9'))
