import { type Abi, type Address, createPublicClient, http, erc20Abi } from 'viem'
import { base } from 'viem/chains'

import { type MultistepTask, runMultistepTasks } from '../../multistepMulticall'
import type { ArkHandler, CollateralResult, CollateralMap, TokenDecimalsMap } from './types'

// Super OETH Vault ABI - similar to OETH but on Base
const superOethVaultAbi = [
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
    name: 'getStrategies',
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
] as const satisfies Abi

// Strategy ABI
const strategyAbi = [
  {
    inputs: [],
    name: 'asset',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const satisfies Abi

type SuperOETHContext = {
  vaultAsset?: Address
  vaultTotalAssets?: bigint
  strategies: Address[]
  strategyAssets: Map<Address, Address>
  strategyBalances: Map<Address, bigint>
  tokenDecimals: TokenDecimalsMap
}

type SuperOETHResolution = CollateralResult[]

function buildSuperOETHTask(params: { vault: Address }): MultistepTask<SuperOETHResolution> {
  const { vault } = params

  const ctx: SuperOETHContext = {
    strategies: [],
    strategyAssets: new Map(),
    strategyBalances: new Map(),
    tokenDecimals: new Map(),
  }

  const task: MultistepTask<SuperOETHResolution> = {
    maxStep: 4,

    buildStepCalls(step) {
      if (step === 1) {
        // Step 1: Discover vault structure
        return [
          {
            key: 'vaultAsset',
            target: vault,
            abi: superOethVaultAbi as Abi,
            functionName: 'asset',
          },
          {
            key: 'strategies',
            target: vault,
            abi: superOethVaultAbi as Abi,
            functionName: 'getStrategies',
          },
          {
            key: 'vaultTotalAssets',
            target: vault,
            abi: superOethVaultAbi as Abi,
            functionName: 'totalAssets',
          },
        ]
      }

      if (step === 2) {
        // Step 2: Get asset for each strategy
        if (ctx.strategies.length === 0) {
          return []
        }

        const calls: {
          key: string
          target: Address
          abi: Abi
          functionName: string
        }[] = []

        for (const strategy of ctx.strategies) {
          calls.push({
            key: `strategyAsset_${strategy}`,
            target: strategy,
            abi: strategyAbi as Abi,
            functionName: 'asset',
          })
        }

        return calls
      }

      if (step === 3) {
        // Step 3: Get balances for each strategy
        if (ctx.strategies.length === 0) {
          return []
        }

        const calls: {
          key: string
          target: Address
          abi: Abi
          functionName: string
          args: readonly unknown[]
        }[] = []

        for (const strategy of ctx.strategies) {
          calls.push({
            key: `strategyBalance_${strategy}`,
            target: vault,
            abi: superOethVaultAbi as Abi,
            functionName: 'getStrategyBalance',
            args: [strategy],
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
        for (const result of results) {
          if (result.key === 'vaultAsset') {
            ctx.vaultAsset = result.value as Address
          }
          if (result.key === 'strategies') {
            ctx.strategies = (result.value as Address[]) || []
          }
          if (result.key === 'vaultTotalAssets') {
            ctx.vaultTotalAssets = BigInt(result.value as string | bigint)
          }
        }
      }

      if (step === 2) {
        for (const result of results) {
          if (result.key.startsWith('strategyAsset_')) {
            const strategy = result.key.replace('strategyAsset_', '') as Address
            ctx.strategyAssets.set(strategy, result.value as Address)
          }
        }
      }

      if (step === 3) {
        for (const result of results) {
          if (result.key.startsWith('strategyBalance_')) {
            const strategy = result.key.replace('strategyBalance_', '') as Address
            ctx.strategyBalances.set(strategy, BigInt(result.value as string | bigint))
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

      // Add vault's own asset (superOETH) if it has totalAssets
      if (ctx.vaultAsset && ctx.vaultTotalAssets && ctx.vaultTotalAssets > 0n) {
        const token = ctx.vaultAsset.toLowerCase()
        collateralMap.set(token, {
          amount: ctx.vaultTotalAssets,
          ltv: 8500, // Default 85% LTV for ETH derivatives
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

export const OriginSuperOETHArk: ArkHandler = {
  name: 'Origin Super OETH',

  buildTask(address: string): MultistepTask<CollateralResult[]> {
    return buildSuperOETHTask({ vault: address as Address })
  },

  async getCollateral(address: string): Promise<CollateralResult[]> {
    const client = createPublicClient({
      chain: base,
      transport: http(),
    })

    const task = this.buildTask(address)
    const [resolution] = await runMultistepTasks(client, [task])
    return resolution
  },
}

// E2E TEST (run with bun/pnpm)
// console.log(await OriginSuperOETHArk.getCollateral('0x57cb08bb2dc86c8ec7e1d7da10a62761c2e0d8ee'))
