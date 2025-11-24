import { type Abi, type Address, createPublicClient, http, erc20Abi } from 'viem'
import { mainnet } from 'viem/chains'

import { type MultistepTask, runMultistepTasks } from '../../multistepMulticall'
import type { ArkHandler, CollateralResult, CollateralMap, TokenDecimalsMap } from './types'

// PSM (Peg Stability Module) ABI - MakerDAO/Sky
const psmAbi = [
  {
    inputs: [],
    name: 'tin',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'tout',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'gemJoin',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'dai',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const satisfies Abi

// GemJoin ABI for getting collateral balance
const gemJoinAbi = [
  {
    inputs: [],
    name: 'gem',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'vat',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const satisfies Abi

// Vat ABI for getting collateral balance
const vatAbi = [
  {
    inputs: [
      { internalType: 'address', name: 'ilk', type: 'address' },
      { internalType: 'address', name: 'urn', type: 'address' },
    ],
    name: 'gem',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const satisfies Abi

type Psm3Context = {
  gemJoin?: Address
  gem?: Address
  dai?: Address
  gemBalance?: bigint
  tokenDecimals: TokenDecimalsMap
}

type Psm3Resolution = CollateralResult[]

function buildPsm3Task(params: { psm: Address }): MultistepTask<Psm3Resolution> {
  const { psm } = params

  const ctx: Psm3Context = {
    tokenDecimals: new Map(),
  }

  const task: MultistepTask<Psm3Resolution> = {
    maxStep: 4,

    buildStepCalls(step) {
      if (step === 1) {
        // Step 1: Discover PSM structure
        return [
          {
            key: 'gemJoin',
            target: psm,
            abi: psmAbi as Abi,
            functionName: 'gemJoin',
          },
          {
            key: 'dai',
            target: psm,
            abi: psmAbi as Abi,
            functionName: 'dai',
          },
        ]
      }

      if (step === 2) {
        // Step 2: Get gem address from gemJoin
        if (!ctx.gemJoin) {
          return []
        }

        return [
          {
            key: 'gem',
            target: ctx.gemJoin,
            abi: gemJoinAbi as Abi,
            functionName: 'gem',
          },
        ]
      }

      if (step === 3) {
        // Step 3: Get gem balance from PSM
        // PSM typically holds collateral (gem) directly
        if (!ctx.gem) {
          return []
        }

        return [
          {
            key: 'gemBalance',
            target: ctx.gem,
            abi: erc20Abi as Abi,
            functionName: 'balanceOf',
            args: [psm],
          },
        ]
      }

      if (step === 4) {
        // Step 4: Get decimals for tokens
        const uniqueTokens = new Set<Address>()
        if (ctx.gem) {
          uniqueTokens.add(ctx.gem)
        }
        if (ctx.dai) {
          uniqueTokens.add(ctx.dai)
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
          if (result.key === 'gemJoin') {
            ctx.gemJoin = result.value as Address
          }
          if (result.key === 'dai') {
            ctx.dai = result.value as Address
          }
        }
      }

      if (step === 2) {
        for (const result of results) {
          if (result.key === 'gem') {
            ctx.gem = result.value as Address
          }
        }
      }

      if (step === 3) {
        for (const result of results) {
          if (result.key === 'gemBalance') {
            ctx.gemBalance = BigInt(result.value as string | bigint)
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

      // PSM holds collateral (gem) 1:1 with DAI
      // LTV is effectively 100% for PSM (1:1 peg)
      if (ctx.gem && ctx.gemBalance && ctx.gemBalance > 0n) {
        const token = ctx.gem.toLowerCase()
        collateralMap.set(token, {
          amount: ctx.gemBalance,
          ltv: 10000, // 100% LTV for PSM (1:1 peg)
        })
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

export const Psm3Ark: ArkHandler = {
  name: 'PSM (Peg Stability Module)',

  buildTask(address: string): MultistepTask<CollateralResult[]> {
    return buildPsm3Task({ psm: address as Address })
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
// console.log(await Psm3Ark.getCollateral('0x02C3eA4e34C0cBd694D2adFa2c690EECbC1793eE'))
