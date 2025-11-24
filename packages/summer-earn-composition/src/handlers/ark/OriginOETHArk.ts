import { type Abi, type Address, createPublicClient, http, erc20Abi } from 'viem'
import { mainnet } from 'viem/chains'

import { type MultistepTask, runMultistepTasks } from '../../multistepMulticall'
import type { ArkHandler, CollateralResult, CollateralMap, TokenDecimalsMap } from './types'

// OETH Vault ABI - minimal interface for discovery and asset fetching
const oethVaultAbi = [
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalAssets',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getAllAssets',
    outputs: [{ internalType: 'address[]', name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getAllStrategies',
    outputs: [{ internalType: 'address[]', name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'strategy', type: 'address' }],
    name: 'getStrategyBalance',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getAllAssets',
    outputs: [{ internalType: 'address[]', name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const satisfies Abi

// Strategy ABI - for fetching underlying assets from strategies
const strategyAbi = [
  {
    inputs: [],
    name: 'asset',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const satisfies Abi

type OriginOETHContext = {
  vaultAsset?: Address
  strategies: Address[]
  strategyAssets: Map<Address, Address>
  strategyBalances: Map<Address, bigint>
  tokenDecimals: TokenDecimalsMap
}

type OriginOETHResolution = CollateralResult[]

function buildOriginOETHTask(params: { vault: Address }): MultistepTask<OriginOETHResolution> {
  const { vault } = params

  const ctx: OriginOETHContext = {
    strategies: [],
    strategyAssets: new Map(),
    strategyBalances: new Map(),
    tokenDecimals: new Map(),
  }

  const task: MultistepTask<OriginOETHResolution> = {
    maxStep: 4,

    buildStepCalls(step) {
      if (step === 1) {
        // Step 1: Discover vault structure - get asset and strategies
        return [
          {
            key: 'vaultAsset',
            target: vault,
            abi: oethVaultAbi as Abi,
            functionName: 'getAllAssets',
          },
          {
            key: 'strategies',
            target: vault,
            abi: oethVaultAbi as Abi,
            functionName: 'getAllStrategies',
          },
        ]
      }

      if (step === 2) {
        // Step 2: Get asset for each strategy and their balances
        if (ctx.strategies.length === 0) {
          return []
        }

        const calls: {
          key: string
          target: Address
          abi: Abi
          functionName: string
          args?: unknown[]
        }[] = []

        for (const strategy of ctx.strategies) {
          calls.push(
            {
              key: `strategyAsset_${strategy}`,
              target: strategy,
              abi: strategyAbi as Abi,
              functionName: 'asset',
            },
            {
              key: `strategyBalance_${strategy}`,
              target: vault,
              abi: oethVaultAbi as Abi,
              functionName: 'getStrategyBalance',
              args: [strategy],
            },
          )
        }

        return calls
      }

      if (step === 3) {
        // Step 3: Get totalAssets for the vault (OETH itself)
        if (!ctx.vaultAsset) {
          return []
        }

        return [
          {
            key: 'vaultTotalAssets',
            target: vault,
            abi: oethVaultAbi as Abi,
            functionName: 'totalAssets',
          },
        ]
      }

      if (step === 4) {
        // Step 4: Get decimals for all unique tokens
        const uniqueTokens = new Set<Address>()
        if (ctx.vaultAsset) {
          uniqueTokens.add(ctx.vaultAsset)
        }
        for (const asset of ctx.strategyAssets.values()) {
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
        console.log('results', results)
        for (const result of results) {
          if (result.key === 'vaultAsset') {
            ctx.vaultAsset = (result.value as Address[])[0]
          }
          if (result.key === 'strategies') {
            ctx.strategies = (result.value as Address[]) || []
          }
        }
      }

      if (step === 2) {
        for (const result of results) {
          if (result.key.startsWith('strategyAsset_')) {
            const strategy = result.key.replace('strategyAsset_', '') as Address
            ctx.strategyAssets.set(strategy, result.value as Address)
          }
          if (result.key.startsWith('strategyBalance_')) {
            const strategy = result.key.replace('strategyBalance_', '') as Address
            ctx.strategyBalances.set(strategy, BigInt(result.value as string | bigint))
          }
        }
      }

      if (step === 3) {
        // Results consumed in finalize
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

      // Add vault's own asset (OETH) if it has totalAssets
      if (ctx.vaultAsset) {
        const token = ctx.vaultAsset.toLowerCase()
        const existing = collateralMap.get(token) || { amount: 0n, ltv: 0 }
        // For OETH vault, the asset itself is the collateral
        // LTV for ETH derivatives is typically high (80-90%)
        collateralMap.set(token, {
          amount: existing.amount,
          ltv: Math.max(existing.ltv, 8500), // Default 85% LTV for ETH derivatives
        })
      }

      // Aggregate strategy balances by underlying asset
      for (const [strategy, asset] of ctx.strategyAssets.entries()) {
        const balance = ctx.strategyBalances.get(strategy) || 0n
        if (balance > 0n) {
          const token = asset.toLowerCase()
          const existing = collateralMap.get(token) || { amount: 0n, ltv: 0 }
          collateralMap.set(token, {
            amount: existing.amount + balance,
            ltv: Math.max(existing.ltv, 8500), // Default 85% LTV
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

export const OriginOETHArk: ArkHandler = {
  name: 'Origin OETH',

  buildTask(address: string): MultistepTask<CollateralResult[]> {
    return buildOriginOETHTask({ vault: address as Address })
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
// console.log(await OriginOETHArk.getCollateral('0x39254033945AA2E4809Cc2977E7087BEE48bd7Ab'))
