import { type Abi, type Address, createPublicClient, http, erc20Abi } from 'viem'
import { mainnet } from 'viem/chains'

import { type MultistepTask, runMultistepTasks } from '../../multistepMulticall'
import type { ArkHandler, CollateralResult, CollateralMap, TokenDecimalsMap } from './types'

// Syrup (Maple) Vault ABI
const syrupVaultAbi = [
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

type SyrupContext = {
  vaultAsset?: Address
  vaultTotalAssets?: bigint
  collateralAssets: Address[]
  collateralBalances: Map<Address, bigint>
  collateralFactors: Map<Address, bigint>
  tokenDecimals: TokenDecimalsMap
}

type SyrupResolution = CollateralResult[]

function buildSyrupTask(params: { vault: Address }): MultistepTask<SyrupResolution> {
  const { vault } = params

  const ctx: SyrupContext = {
    collateralAssets: [],
    collateralBalances: new Map(),
    collateralFactors: new Map(),
    tokenDecimals: new Map(),
  }

  const task: MultistepTask<SyrupResolution> = {
    maxStep: 4,

    buildStepCalls(step) {
      if (step === 1) {
        // Step 1: Discover vault structure
        return [
          {
            key: 'vaultAsset',
            target: vault,
            abi: syrupVaultAbi as Abi,
            functionName: 'asset',
          },
          {
            key: 'collateralAssets',
            target: vault,
            abi: syrupVaultAbi as Abi,
            functionName: 'getCollateralAssets',
          },
          {
            key: 'vaultTotalAssets',
            target: vault,
            abi: syrupVaultAbi as Abi,
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
            abi: syrupVaultAbi as Abi,
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
          calls.push({
            key: `collateralFactor_${asset}`,
            target: vault,
            abi: syrupVaultAbi as Abi,
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

      if (step === 3) {
        for (const result of results) {
          if (result.key.startsWith('collateralFactor_')) {
            const asset = result.key.replace('collateralFactor_', '') as Address
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
          let ltv = 8000 // Default 80% LTV for stablecoins
          if (factor !== undefined) {
            if (factor > 10000n) {
              // Likely in wei format
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

export const SyrupArk: ArkHandler = {
  name: 'Syrup by Maple',

  buildTask(address: string): MultistepTask<CollateralResult[]> {
    return buildSyrupTask({ vault: address as Address })
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
// console.log(await SyrupArk.getCollateral('0x643C4E15d7d62Ad0aBeC4a9BD4b001aA3Ef52d66'))
// console.log(await SyrupArk.getCollateral('0xB7844e289d0b5a8a5A2E6fD0d7b40e9E6E26207a'))
