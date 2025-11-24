import { type Abi, type Address, createPublicClient, http, erc20Abi } from 'viem'
import { mainnet } from 'viem/chains'

import { type MultistepTask, runMultistepTasks } from '../../multistepMulticall'
import type { ArkHandler, CollateralResult, CollateralMap, TokenDecimalsMap } from './types'

// Silo Finance V2 Managed Vault ABI
const siloManagedVaultAbi = [
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
    name: 'getLTV',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const satisfies Abi

// Silo Router/Lens ABI for fetching market data
const siloLensAbi = [
  {
    inputs: [{ internalType: 'address', name: 'asset', type: 'address' }],
    name: 'getLiquidityData',
    outputs: [
      {
        components: [
          { internalType: 'uint256', name: 'totalDeposits', type: 'uint256' },
          { internalType: 'uint256', name: 'totalBorrows', type: 'uint256' },
          { internalType: 'uint256', name: 'ltv', type: 'uint256' },
        ],
        internalType: 'struct LiquidityData',
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const satisfies Abi

type SiloManagedVaultContext = {
  vaultAsset?: Address
  vaultTotalAssets?: bigint
  assets: Address[]
  assetBalances: Map<Address, bigint>
  assetLTVs: Map<Address, bigint>
  tokenDecimals: TokenDecimalsMap
}

type SiloManagedVaultResolution = CollateralResult[]

function buildSiloManagedVaultTask(params: {
  vault: Address
}): MultistepTask<SiloManagedVaultResolution> {
  const { vault } = params

  const ctx: SiloManagedVaultContext = {
    assets: [],
    assetBalances: new Map(),
    assetLTVs: new Map(),
    tokenDecimals: new Map(),
  }

  const task: MultistepTask<SiloManagedVaultResolution> = {
    maxStep: 4,

    buildStepCalls(step) {
      if (step === 1) {
        // Step 1: Discover vault structure
        return [
          {
            key: 'vaultAsset',
            target: vault,
            abi: siloManagedVaultAbi as Abi,
            functionName: 'asset',
          },
          {
            key: 'assets',
            target: vault,
            abi: siloManagedVaultAbi as Abi,
            functionName: 'getAssets',
          },
          {
            key: 'vaultTotalAssets',
            target: vault,
            abi: siloManagedVaultAbi as Abi,
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
            abi: siloManagedVaultAbi as Abi,
            functionName: 'getAssetBalance',
            args: [asset],
          })
        }

        return calls
      }

      if (step === 3) {
        // Step 3: Get LTV for each asset
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
          // Try getLTV first, fallback handled in consumeStepResults
          calls.push({
            key: `assetLTV_${asset}`,
            target: vault,
            abi: siloManagedVaultAbi as Abi,
            functionName: 'getLTV',
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
          if (result.key.startsWith('assetLTV_')) {
            const asset = result.key.replace('assetLTV_', '') as Address
            ctx.assetLTVs.set(asset, BigInt(result.value as string | bigint))
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

      // Aggregate asset balances with their LTVs
      for (const asset of ctx.assets) {
        const balance = ctx.assetBalances.get(asset) || 0n
        if (balance > 0n) {
          const token = asset.toLowerCase()
          const ltvRaw = ctx.assetLTVs.get(asset)
          // Convert LTV from basis points or wei to our format
          let ltv = 7500 // Default 75% LTV
          if (ltvRaw !== undefined) {
            if (ltvRaw > 10000n) {
              // Likely in wei format, convert: (ltvRaw / 1e18) * 10000
              ltv = Number((ltvRaw * 10000n) / 10n ** 18n)
            } else {
              ltv = Number(ltvRaw)
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

export const SiloManagedVaultArk: ArkHandler = {
  name: 'Silo Finance V2 Managed Vault',

  buildTask(address: string): MultistepTask<CollateralResult[]> {
    return buildSiloManagedVaultTask({ vault: address as Address })
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
// console.log(await SiloManagedVaultArk.getCollateral('0x5362D5086FDef73450145492a66F8EBF210c5B9C'))
