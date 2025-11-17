import { type Abi, type Address, erc20Abi, erc4626Abi } from 'viem'
import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'
import { describe, expect, it } from 'vitest'

import { type MultistepTask, runMultistepTasks } from '../src/multistepMulticall'
import type { ProductComposition } from '../src/types'

const MAINNET_RPC_URL = process.env.MAINNET_RPC_URL

const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F' as Address
const SUSDS_VAULT = '0xa3931d71877c0e7a3148cb7eb4463524fec27fbd' as Address

if (!MAINNET_RPC_URL) {
  describe('heterogeneous multistep multicall mainnet e2e', () => {
    it('skipped because MAINNET_RPC_URL is not set', () => {
      expect(true).toBe(true)
    })
  })
} else {
  const client = createPublicClient({
    chain: mainnet,
    transport: http(MAINNET_RPC_URL),
  })

  describe('heterogeneous multistep multicall mainnet e2e', () => {
    it('handles tasks with different maxStep counts (ERC20 vs ERC4626)', async () => {
      type Erc20Ctx = { totalSupply?: bigint; decimals?: number }
      type Erc4626Ctx = { totalAssets?: bigint; asset?: Address; decimals?: number }

      // ERC20 task: 2 steps (totalSupply, decimals)
      const makeErc20Task = (): MultistepTask<ProductComposition> => {
        const ctx: Erc20Ctx = {}

        return {
          maxStep: 2,

          buildStepCalls(step) {
            if (step === 1) {
              return [
                {
                  key: 'totalSupply',
                  target: DAI,
                  abi: erc20Abi,
                  functionName: 'totalSupply',
                },
              ]
            }
            if (step === 2) {
              return [
                {
                  key: 'decimals',
                  target: DAI,
                  abi: erc20Abi,
                  functionName: 'decimals',
                },
              ]
            }
            return []
          },

          consumeStepResults(step, results) {
            for (const result of results) {
              if (step === 1 && result.key === 'totalSupply') {
                ctx.totalSupply = BigInt(result.value as string | bigint)
              }
              if (step === 2 && result.key === 'decimals') {
                ctx.decimals = Number(result.value as bigint | number)
              }
            }
          },

          finalize() {
            if (ctx.totalSupply === undefined || ctx.decimals === undefined) {
              throw new Error('ERC20 task incomplete context in finalize')
            }

            return {
              type: 'single-token',
              underlying: {
                tokenAddress: DAI,
                amount: ctx.totalSupply,
              },
            }
          },
        }
      }

      // ERC4626 task: 3 steps (totalAssets, asset, decimals)
      const makeErc4626Task = (vault: Address): MultistepTask<ProductComposition> => {
        const ctx: Erc4626Ctx = {}

        return {
          maxStep: 3,

          buildStepCalls(step) {
            if (step === 1) {
              return [
                {
                  key: 'totalAssets',
                  target: vault,
                  abi: erc4626Abi as Abi,
                  functionName: 'totalAssets',
                },
              ]
            }
            if (step === 2) {
              return [
                {
                  key: 'asset',
                  target: vault,
                  abi: erc4626Abi as Abi,
                  functionName: 'asset',
                },
              ]
            }
            if (step === 3) {
              return [
                {
                  key: 'decimals',
                  target: vault,
                  abi: erc4626Abi as Abi,
                  functionName: 'decimals',
                },
              ]
            }
            return []
          },

          consumeStepResults(step, results) {
            for (const result of results) {
              if (step === 1 && result.key === 'totalAssets') {
                ctx.totalAssets = BigInt(result.value as string | bigint)
              }
              if (step === 2 && result.key === 'asset') {
                ctx.asset = result.value as Address
              }
              if (step === 3 && result.key === 'decimals') {
                ctx.decimals = Number(result.value as bigint | number)
              }
            }
          },

          finalize() {
            if (!ctx.totalAssets || !ctx.asset) {
              throw new Error('ERC4626 task incomplete context in finalize')
            }

            return {
              type: 'single-token',
              underlying: {
                tokenAddress: ctx.asset,
                amount: ctx.totalAssets,
              },
            }
          },
        }
      }

      const tasks: MultistepTask<ProductComposition>[] = [
        // 5 ERC20 tasks (maxStep=2)
        makeErc20Task(),
        makeErc20Task(),
        makeErc20Task(),
        makeErc20Task(),
        makeErc20Task(),
        // 5 ERC4626 tasks (maxStep=3)
        makeErc4626Task(SUSDS_VAULT),
        makeErc4626Task(SUSDS_VAULT),
        makeErc4626Task(SUSDS_VAULT),
        makeErc4626Task(SUSDS_VAULT),
        makeErc4626Task(SUSDS_VAULT),
      ]

      const results = await runMultistepTasks(client, tasks)

      expect(results).toHaveLength(10)

      for (const composition of results) {
        if (composition.type !== 'single-token') {
          throw new Error('expected single-token composition')
        }

        expect(composition.underlying.amount).toBeGreaterThan(0n)
        expect(composition.underlying.tokenAddress).toMatch(/^0x[0-9a-fA-F]{40}$/)
      }
    })
  })
}
