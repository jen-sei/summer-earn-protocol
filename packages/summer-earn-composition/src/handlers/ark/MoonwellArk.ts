import { type Abi, type Address, createPublicClient, http, erc20Abi } from 'viem'
import { base } from 'viem/chains'

import { type MultistepTask, runMultistepTasks } from '../../multistepMulticall'
import type { ArkHandler, CollateralResult, CollateralMap, TokenDecimalsMap } from './types'

// Moonwell Comptroller ABI (Compound V2 fork)
const moonwellComptrollerAbi = [
  {
    inputs: [],
    name: 'getAllMarkets',
    outputs: [{ internalType: 'address[]', name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const satisfies Abi

// Moonwell Market (cToken) ABI
const moonwellMarketAbi = [
  {
    inputs: [],
    name: 'underlying',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
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
  {
    inputs: [],
    name: 'totalBorrows',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getCash',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const satisfies Abi

// Moonwell Comptroller ABI for collateral factor
const moonwellComptrollerConfigAbi = [
  {
    inputs: [{ internalType: 'address', name: 'cToken', type: 'address' }],
    name: 'markets',
    outputs: [
      {
        components: [
          { internalType: 'bool', name: 'isListed', type: 'bool' },
          { internalType: 'uint256', name: 'collateralFactorMantissa', type: 'uint256' },
          { internalType: 'uint256', name: 'liquidationIncentiveMantissa', type: 'uint256' },
        ],
        internalType: 'struct ComptrollerV2Storage.Market',
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const satisfies Abi

type MoonwellContext = {
  markets: Address[]
  marketUnderlyings: Map<Address, Address>
  marketCash: Map<Address, bigint>
  collateralFactors: Map<Address, bigint>
  tokenDecimals: TokenDecimalsMap
}

type MoonwellResolution = CollateralResult[]

function buildMoonwellTask(params: { comptroller: Address }): MultistepTask<MoonwellResolution> {
  const { comptroller } = params

  const ctx: MoonwellContext = {
    markets: [],
    marketUnderlyings: new Map(),
    marketCash: new Map(),
    collateralFactors: new Map(),
    tokenDecimals: new Map(),
  }

  const task: MultistepTask<MoonwellResolution> = {
    maxStep: 4,

    buildStepCalls(step) {
      if (step === 1) {
        // Step 1: Get all markets
        return [
          {
            key: 'markets',
            target: comptroller,
            abi: moonwellComptrollerAbi as Abi,
            functionName: 'getAllMarkets',
          },
        ]
      }

      if (step === 2) {
        // Step 2: Get underlying and cash for each market
        if (ctx.markets.length === 0) {
          return []
        }

        const calls: {
          key: string
          target: Address
          abi: Abi
          functionName: string
        }[] = []

        for (const market of ctx.markets) {
          calls.push(
            {
              key: `underlying_${market}`,
              target: market,
              abi: moonwellMarketAbi as Abi,
              functionName: 'underlying',
            },
            {
              key: `cash_${market}`,
              target: market,
              abi: moonwellMarketAbi as Abi,
              functionName: 'getCash',
            },
          )
        }

        return calls
      }

      if (step === 3) {
        // Step 3: Get collateral factors for each market
        if (ctx.markets.length === 0) {
          return []
        }

        const calls: {
          key: string
          target: Address
          abi: Abi
          functionName: string
          args: readonly unknown[]
        }[] = []

        for (const market of ctx.markets) {
          calls.push({
            key: `collateralFactor_${market}`,
            target: comptroller,
            abi: moonwellComptrollerConfigAbi as Abi,
            functionName: 'markets',
            args: [market],
          })
        }

        return calls
      }

      if (step === 4) {
        // Step 4: Get decimals for all underlying tokens
        const uniqueTokens = new Set<Address>()
        for (const underlying of ctx.marketUnderlyings.values()) {
          uniqueTokens.add(underlying)
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
          if (result.key === 'markets') {
            ctx.markets = (result.value as Address[]) || []
          }
        }
      }

      if (step === 2) {
        for (const result of results) {
          if (result.key.startsWith('underlying_')) {
            const market = result.key.replace('underlying_', '') as Address
            ctx.marketUnderlyings.set(market, result.value as Address)
          }
          if (result.key.startsWith('cash_')) {
            const market = result.key.replace('cash_', '') as Address
            ctx.marketCash.set(market, BigInt(result.value as string | bigint))
          }
        }
      }

      if (step === 3) {
        for (const result of results) {
          if (result.key.startsWith('collateralFactor_')) {
            const market = result.key.replace('collateralFactor_', '') as Address
            const marketData = result.value as {
              collateralFactorMantissa: bigint | string
            }
            ctx.collateralFactors.set(market, BigInt(marketData.collateralFactorMantissa))
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

      // Aggregate market cash (collateral) with collateral factors
      for (const market of ctx.markets) {
        const cash = ctx.marketCash.get(market) || 0n
        if (cash > 0n) {
          const underlying = ctx.marketUnderlyings.get(market)
          if (underlying) {
            const token = underlying.toLowerCase()
            const factor = ctx.collateralFactors.get(market)
            // collateralFactorMantissa is in wei format (e.g., 0.8e18 = 80%)
            // Convert to basis points: (factor / 1e18) * 10000
            let ltv = 7500 // Default 75% LTV
            if (factor !== undefined) {
              ltv = Number((factor * 10000n) / 10n ** 18n)
            }

            const existing = collateralMap.get(token) || { amount: 0n, ltv: 0 }
            collateralMap.set(token, {
              amount: existing.amount + cash,
              ltv: Math.max(existing.ltv, ltv),
            })
          }
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

export const MoonwellArk: ArkHandler = {
  name: 'Moonwell',

  buildTask(address: string): MultistepTask<CollateralResult[]> {
    return buildMoonwellTask({ comptroller: address as Address })
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
// console.log(await MoonwellArk.getCollateral('0xfBb21d0380beE3312b33c4353c8936a0F13EF26C'))
