import { type Abi, type Address, createPublicClient, http, erc20Abi } from 'viem'
import { mainnet } from 'viem/chains'

import { type MultistepTask, runMultistepTasks } from '../../multistepMulticall'
import type { ArkHandler, CollateralResult, CollateralMap, TokenDecimalsMap } from './types'

// SparkLend Pool ABI (Aave V3 fork)
const sparkLendPoolAbi = [
  {
    inputs: [],
    name: 'getReservesList',
    outputs: [{ internalType: 'address[]', name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'asset', type: 'address' }],
    name: 'getReserveData',
    outputs: [
      {
        components: [
          { internalType: 'uint256', name: 'totalAToken', type: 'uint256' },
          { internalType: 'uint256', name: 'totalStableDebt', type: 'uint256' },
          { internalType: 'uint256', name: 'totalVariableDebt', type: 'uint256' },
          { internalType: 'uint256', name: 'liquidityIndex', type: 'uint256' },
          { internalType: 'uint256', name: 'variableBorrowIndex', type: 'uint256' },
          { internalType: 'uint256', name: 'currentLiquidityRate', type: 'uint256' },
          { internalType: 'uint256', name: 'currentVariableBorrowRate', type: 'uint256' },
          { internalType: 'uint256', name: 'currentStableBorrowRate', type: 'uint256' },
          { internalType: 'uint40', name: 'lastUpdateTimestamp', type: 'uint40' },
          { internalType: 'uint16', name: 'id', type: 'uint16' },
          { internalType: 'address', name: 'aTokenAddress', type: 'address' },
          { internalType: 'address', name: 'stableDebtTokenAddress', type: 'address' },
          { internalType: 'address', name: 'variableDebtTokenAddress', type: 'address' },
          { internalType: 'address', name: 'interestRateStrategyAddress', type: 'address' },
          { internalType: 'uint128', name: 'accruedToTreasury', type: 'uint128' },
          { internalType: 'uint128', name: 'unbacked', type: 'uint128' },
          { internalType: 'uint128', name: 'isolationModeTotalDebt', type: 'uint128' },
        ],
        internalType: 'struct DataTypes.ReserveData',
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const satisfies Abi

// SparkLend PoolAddressesProvider ABI for getting configuration
const sparkConfigAbi = [
  {
    inputs: [{ internalType: 'address', name: 'asset', type: 'address' }],
    name: 'getConfiguration',
    outputs: [
      {
        components: [{ internalType: 'uint256', name: 'data', type: 'uint256' }],
        internalType: 'struct DataTypes.ReserveConfigurationMap',
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const satisfies Abi

// AToken ABI for balance checking
const aTokenAbi = [
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
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
] as const satisfies Abi

type SparkLendContext = {
  reserves: Address[]
  reserveData: Map<Address, { aTokenAddress: Address; totalAToken: bigint }>
  reserveBalances: Map<Address, bigint>
  reserveLTVs: Map<Address, number>
  tokenDecimals: TokenDecimalsMap
}

type SparkLendResolution = CollateralResult[]

function buildSparkLendTask(params: {
  pool: Address
  user?: Address
}): MultistepTask<SparkLendResolution> {
  const { pool, user } = params

  const ctx: SparkLendContext = {
    reserves: [],
    reserveData: new Map(),
    reserveBalances: new Map(),
    reserveLTVs: new Map(),
    tokenDecimals: new Map(),
  }

  const task: MultistepTask<SparkLendResolution> = {
    maxStep: 4,

    buildStepCalls(step) {
      if (step === 1) {
        // Step 1: Get list of reserves
        return [
          {
            key: 'reservesList',
            target: pool,
            abi: sparkLendPoolAbi as Abi,
            functionName: 'getReservesList',
          },
        ]
      }

      if (step === 2) {
        // Step 2: Get reserve data for each reserve (includes aToken address and total supply)
        if (ctx.reserves.length === 0) {
          return []
        }

        const calls: {
          key: string
          target: Address
          abi: Abi
          functionName: string
          args: readonly unknown[]
        }[] = []

        for (const reserve of ctx.reserves) {
          calls.push({
            key: `reserveData_${reserve}`,
            target: pool,
            abi: sparkLendPoolAbi as Abi,
            functionName: 'getReserveData',
            args: [reserve],
          })
        }

        return calls
      }

      if (step === 3) {
        // Step 3: Get balances for user (if provided) or use total supply
        if (ctx.reserves.length === 0) {
          return []
        }

        const calls: {
          key: string
          target: Address
          abi: Abi
          functionName: string
          args?: readonly unknown[]
        }[] = []

        for (const reserve of ctx.reserves) {
          const reserveData = ctx.reserveData.get(reserve)
          if (reserveData?.aTokenAddress) {
            if (user) {
              calls.push({
                key: `balance_${reserve}`,
                target: reserveData.aTokenAddress,
                abi: aTokenAbi as Abi,
                functionName: 'balanceOf',
                args: [user],
              })
            } else {
              calls.push({
                key: `totalSupply_${reserve}`,
                target: reserveData.aTokenAddress,
                abi: aTokenAbi as Abi,
                functionName: 'totalSupply',
              })
            }
          }
        }

        return calls
      }

      if (step === 4) {
        // Step 4: Get decimals and LTV for all reserves
        const calls: {
          key: string
          target: Address
          abi: Abi
          functionName: string
          args?: readonly unknown[]
        }[] = []

        for (const reserve of ctx.reserves) {
          calls.push(
            {
              key: `decimals_${reserve}`,
              target: reserve,
              abi: erc20Abi as Abi,
              functionName: 'decimals',
            },
            // Note: LTV extraction from configuration requires bit manipulation
            // For now, we'll use default values or fetch from a separate call if available
          )
        }

        return calls
      }

      return []
    },

    consumeStepResults(step, results) {
      if (step === 1) {
        for (const result of results) {
          if (result.key === 'reservesList') {
            ctx.reserves = (result.value as Address[]) || []
          }
        }
      }

      if (step === 2) {
        for (const result of results) {
          if (result.key.startsWith('reserveData_')) {
            const reserve = result.key.replace('reserveData_', '') as Address
            const data = result.value as {
              totalAToken: bigint | string
              aTokenAddress: Address
            }
            ctx.reserveData.set(reserve, {
              aTokenAddress: data.aTokenAddress,
              totalAToken: BigInt(data.totalAToken),
            })
          }
        }
      }

      if (step === 3) {
        for (const result of results) {
          if (result.key.startsWith('balance_') || result.key.startsWith('totalSupply_')) {
            const reserve = result.key
              .replace('balance_', '')
              .replace('totalSupply_', '') as Address
            ctx.reserveBalances.set(reserve, BigInt(result.value as string | bigint))
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

      // Aggregate reserves with balances
      for (const reserve of ctx.reserves) {
        const balance = ctx.reserveBalances.get(reserve) || 0n
        if (balance > 0n) {
          const token = reserve.toLowerCase()
          // Default LTVs for common assets (can be enhanced with config fetching)
          // ETH: 80%, stETH: 75%, USDC/USDT: 85%, etc.
          const ltv = ctx.reserveLTVs.get(reserve) || 8000 // Default 80%

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

export const SparkLendArk: ArkHandler = {
  name: 'SparkLend',

  buildTask(address: string, user?: string): MultistepTask<CollateralResult[]> {
    return buildSparkLendTask({
      pool: address as Address,
      user: user as Address | undefined,
    })
  },

  async getCollateral(address: string, user?: string): Promise<CollateralResult[]> {
    const client = createPublicClient({
      chain: mainnet,
      transport: http(),
    })

    const task = this.buildTask(address, user)
    const [resolution] = await runMultistepTasks(client, [task])
    return resolution
  },
}

// E2E TEST (run with bun/pnpm)
// console.log(await SparkLendArk.getCollateral('0x5a0b54d5dc17e0aadc383d2db43b0a0d3e029c4c'))
