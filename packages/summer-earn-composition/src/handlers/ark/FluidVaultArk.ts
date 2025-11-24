import { type Abi, type Address, createPublicClient, http, erc20Abi } from 'viem'
import { mainnet } from 'viem/chains'

import { type MultistepTask, runMultistepTasks } from '../../multistepMulticall'
import type { ArkHandler, CollateralResult, CollateralMap, TokenDecimalsMap } from './types'

// Fluid Liquidity Layer ABI
const fluidLiquidityLayerAbi = [
  {
    inputs: [],
    name: 'getSupportedAssets',
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
] as const satisfies Abi

// Fluid Vault ABI (fUSDC-lite example)
const fluidVaultAbi = [
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

type FluidVaultContext = {
  vaultAsset?: Address
  vaultTotalAssets?: bigint
  collateralAssets: Address[]
  collateralBalances: Map<Address, bigint>
  tokenDecimals: TokenDecimalsMap
}

type FluidVaultResolution = CollateralResult[]

function buildFluidVaultTask(params: {
  vault: Address
  isLiquidityLayer?: boolean
}): MultistepTask<FluidVaultResolution> {
  const { vault, isLiquidityLayer = false } = params
  const vaultAbi = isLiquidityLayer ? fluidLiquidityLayerAbi : fluidVaultAbi

  const ctx: FluidVaultContext = {
    collateralAssets: [],
    collateralBalances: new Map(),
    tokenDecimals: new Map(),
  }

  const task: MultistepTask<FluidVaultResolution> = {
    maxStep: 4,

    buildStepCalls(step) {
      if (step === 1) {
        // Step 1: Discover vault structure
        if (isLiquidityLayer) {
          return [
            {
              key: 'supportedAssets',
              target: vault,
              abi: vaultAbi as Abi,
              functionName: 'getSupportedAssets',
            },
          ]
        } else {
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
            {
              key: 'vaultTotalAssets',
              target: vault,
              abi: vaultAbi as Abi,
              functionName: 'totalAssets',
            },
          ]
        }
      }

      if (step === 2) {
        // Step 2: Get balances for each asset
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
          if (isLiquidityLayer) {
            calls.push({
              key: `assetBalance_${asset}`,
              target: vault,
              abi: vaultAbi as Abi,
              functionName: 'getAssetBalance',
              args: [asset],
            })
          } else {
            calls.push({
              key: `collateralBalance_${asset}`,
              target: vault,
              abi: vaultAbi as Abi,
              functionName: 'getCollateralBalance',
              args: [asset],
            })
          }
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
          if (result.key === 'collateralAssets' || result.key === 'supportedAssets') {
            ctx.collateralAssets = (result.value as Address[]) || []
          }
          if (result.key === 'vaultTotalAssets') {
            ctx.vaultTotalAssets = BigInt(result.value as string | bigint)
          }
        }
      }

      if (step === 2) {
        for (const result of results) {
          if (
            result.key.startsWith('assetBalance_') ||
            result.key.startsWith('collateralBalance_')
          ) {
            const asset = result.key
              .replace('assetBalance_', '')
              .replace('collateralBalance_', '') as Address
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

      // Aggregate asset balances
      // Fluid vaults typically have high LTV for stablecoins
      for (const asset of ctx.collateralAssets) {
        const balance = ctx.collateralBalances.get(asset) || 0n
        if (balance > 0n) {
          const token = asset.toLowerCase()
          // Default 85% LTV for Fluid vaults
          const ltv = 8500

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

export const FluidVaultArk: ArkHandler = {
  name: 'Fluid Vault',

  buildTask(address: string): MultistepTask<CollateralResult[]> {
    // Determine if this is Liquidity Layer or regular vault
    const isLiquidityLayer =
      address.toLowerCase() === '0x6f40d4a6237c257fff2db00fa0510deeecd303eb'.toLowerCase()
    return buildFluidVaultTask({ vault: address as Address, isLiquidityLayer })
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
// console.log(await FluidVaultArk.getCollateral('0x6f40d4a6237c257fff2db00fa0510deeecd303eb'))
// console.log(await FluidVaultArk.getCollateral('0x9e0caD1d8c6d4d2b1b3f6b4d8c6e4f2a1b3c4d5e'))
