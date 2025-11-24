import { type Abi, type Address, createPublicClient, http, erc20Abi } from 'viem'
import { mainnet } from 'viem/chains'

import { type MultistepTask, runMultistepTasks } from '../../multistepMulticall'
import type { ArkHandler, CollateralResult, CollateralMap, TokenDecimalsMap } from './types'

// siUSD Vault ABI
const siusdVaultAbi = [
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
  {
    inputs: [{ internalType: 'address', name: 'asset', type: 'address' }],
    name: 'collateralFactor',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const satisfies Abi

// IUSD Vault ABI (if different interface)
const iusdVaultAbi = [
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

type SiUSDContext = {
  vaultAsset?: Address
  collateralAssets: Address[]
  collateralBalances: Map<Address, bigint>
  collateralFactors: Map<Address, bigint>
  tokenDecimals: TokenDecimalsMap
}

type SiUSDResolution = CollateralResult[]

function buildSiUSDTask(params: {
  vault: Address
  isIUSD?: boolean
}): MultistepTask<SiUSDResolution> {
  const { vault, isIUSD = false } = params
  const vaultAbi = isIUSD ? iusdVaultAbi : siusdVaultAbi

  const ctx: SiUSDContext = {
    collateralAssets: [],
    collateralBalances: new Map(),
    collateralFactors: new Map(),
    tokenDecimals: new Map(),
  }

  const task: MultistepTask<SiUSDResolution> = {
    maxStep: 4,

    buildStepCalls(step) {
      if (step === 1) {
        // Step 1: Discover vault structure - get asset and collateral assets
        return [
          {
            key: 'vaultAsset',
            target: vault,
            abi: vaultAbi as Abi,
            functionName: 'asset',
          },
          {
            key: 'collateralAssets',
            target: vault,
            abi: vaultAbi as Abi,
            functionName: 'getCollateralAssets',
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
            abi: vaultAbi as Abi,
            functionName: 'getCollateralBalance',
            args: [asset],
          })
        }

        return calls
      }

      if (step === 3) {
        // Step 3: Get collateral factors (LTV) for each asset
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
          // Try to get collateralFactor if available
          calls.push({
            key: `collateralFactor_${asset}`,
            target: vault,
            abi: siusdVaultAbi as Abi,
            functionName: 'collateralFactor',
            args: [asset],
          })
        }

        return calls
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

      if (step === 3) {
        for (const result of results) {
          if (result.key.startsWith('collateralFactor_')) {
            const asset = result.key.replace('collateralFactor_', '') as Address
            // collateralFactor is typically in basis points (e.g., 8000 = 80%)
            // Convert to our format (4 decimals, e.g., 8050 = 80.50%)
            const factor = BigInt(result.value as string | bigint)
            ctx.collateralFactors.set(asset, factor)
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
      for (const asset of ctx.collateralAssets) {
        const balance = ctx.collateralBalances.get(asset) || 0n
        if (balance > 0n) {
          const token = asset.toLowerCase()
          const factor = ctx.collateralFactors.get(asset)
          // Convert factor from basis points to our format (assuming factor is in basis points)
          // If factor is 8000 (80%), convert to 8000 (same)
          // If factor is 0.8e18 (80%), convert to 8000
          let ltv = 7500 // Default 75% LTV for stablecoins
          if (factor !== undefined) {
            // Assume factor is in basis points (e.g., 8000 = 80%)
            // If it's larger, it might be in wei format (0.8e18)
            if (factor > 10000n) {
              // Likely in wei format, convert: (factor / 1e18) * 10000
              ltv = Number((factor * 10000n) / 10n ** 18n)
            } else {
              ltv = Number(factor)
            }
          }

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

export const SiUSDArk: ArkHandler = {
  name: 'InfiniFi siUSD',

  buildTask(address: string): MultistepTask<CollateralResult[]> {
    // Determine if this is IUSD vault or siUSD vault
    const isIUSD =
      address.toLowerCase() === '0x48f9e38f3070AD8945DFEae3FA70987722E3D89c'.toLowerCase()
    return buildSiUSDTask({ vault: address as Address, isIUSD })
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
// console.log(await SiUSDArk.getCollateral('0xdBDC1Ef57537E34680B898E1FEBD3D68c7389bCB'))
// console.log(await SiUSDArk.getCollateral('0x48f9e38f3070AD8945DFEae3FA70987722E3D89c'))
