import { type Abi, type Address, createPublicClient, http, erc20Abi } from 'viem'
import { mainnet } from 'viem/chains'

import { type MultistepTask, runMultistepTasks } from '../../multistepMulticall'
import type { ArkHandler, CollateralResult, CollateralMap, TokenDecimalsMap } from './types'

// Aera Vault ABI (Gauntlet)
const aeraVaultAbi = [
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
    name: 'getAssets',
    outputs: [{ internalType: 'address[]', name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'asset', type: 'address' }],
    name: 'getAssetBalance',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'asset', type: 'address' }],
    name: 'getCollateralFactor',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const satisfies Abi

type AeraContext = {
  vaultAsset?: Address
  vaultTotalAssets?: bigint
  assets: Address[]
  assetBalances: Map<Address, bigint>
  collateralFactors: Map<Address, bigint>
  tokenDecimals: TokenDecimalsMap
}

type AeraResolution = CollateralResult[]

function buildAeraTask(params: { vault: Address }): MultistepTask<AeraResolution> {
  const { vault } = params

  const ctx: AeraContext = {
    assets: [],
    assetBalances: new Map(),
    collateralFactors: new Map(),
    tokenDecimals: new Map(),
  }

  const task: MultistepTask<AeraResolution> = {
    maxStep: 4,

    buildStepCalls(step) {
      if (step === 1) {
        // Step 1: Discover vault structure
        return [
          {
            key: 'vaultAsset',
            target: vault,
            abi: aeraVaultAbi as Abi,
            functionName: 'asset',
          },
          {
            key: 'assets',
            target: vault,
            abi: aeraVaultAbi as Abi,
            functionName: 'getAssets',
          },
          {
            key: 'vaultTotalAssets',
            target: vault,
            abi: aeraVaultAbi as Abi,
            functionName: 'totalAssets',
          },
        ]
      }

      if (step === 2) {
        // Step 2: Get balances for each asset
        if (ctx.assets.length === 0) {
          return []
        }

        const calls: {
          key: string
          target: Address
          abi: Abi
          functionName: string
          args: readonly unknown[]
        }[] = []

        for (const asset of ctx.assets) {
          calls.push({
            key: `assetBalance_${asset}`,
            target: vault,
            abi: aeraVaultAbi as Abi,
            functionName: 'getAssetBalance',
            args: [asset],
          })
        }

        return calls
      }

      if (step === 3) {
        // Step 3: Get collateral factors for each asset
        if (ctx.assets.length === 0) {
          return []
        }

        const calls: {
          key: string
          target: Address
          abi: Abi
          functionName: string
          args: readonly unknown[]
        }[] = []

        for (const asset of ctx.assets) {
          calls.push({
            key: `collateralFactor_${asset}`,
            target: vault,
            abi: aeraVaultAbi as Abi,
            functionName: 'getCollateralFactor',
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
        for (const asset of ctx.assets) {
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
          if (result.key === 'assets') {
            ctx.assets = (result.value as Address[]) || []
          }
          if (result.key === 'vaultTotalAssets') {
            ctx.vaultTotalAssets = BigInt(result.value as string | bigint)
          }
        }
      }

      if (step === 2) {
        for (const result of results) {
          if (result.key.startsWith('assetBalance_')) {
            const asset = result.key.replace('assetBalance_', '') as Address
            ctx.assetBalances.set(asset, BigInt(result.value as string | bigint))
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

      // Aggregate asset balances with their collateral factors
      for (const asset of ctx.assets) {
        const balance = ctx.assetBalances.get(asset) || 0n
        if (balance > 0n) {
          const token = asset.toLowerCase()
          const factor = ctx.collateralFactors.get(asset)
          let ltv = 8000 // Default 80% LTV
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

export const AeraArk: ArkHandler = {
  name: 'Aera by Gauntlet',

  buildTask(address: string): MultistepTask<CollateralResult[]> {
    return buildAeraTask({ vault: address as Address })
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
// console.log(await AeraArk.getCollateral('0x47fe8Ab9eE47DD65c24df52324181790b9F47EfC'))
