import { type Abi, type Address, erc4626Abi } from 'viem'
import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'
import { describe, expect, it } from 'vitest'

import { type MultistepTask, runMultistepTasks } from '../src/multistepMulticall'
import type { ProductComposition } from '../src/types'

const MAINNET_RPC_URL = process.env.MAINNET_RPC_URL

const SUSDS_VAULT = '0xa3931d71877c0e7a3148cb7eb4463524fec27fbd' as Address
const MORPHO_USDC_VAULT = '0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB' as Address

if (!MAINNET_RPC_URL) {
  describe('multistep multicall mainnet e2e', () => {
    it('skipped because MAINNET_RPC_URL is not set', () => {
      expect(true).toBe(true)
    })
  })
} else {
  const client = createPublicClient({
    chain: mainnet,
    transport: http(MAINNET_RPC_URL),
  })

  describe('multistep multicall mainnet e2e', () => {
    it('executes a two-step pipeline against two ERC4626 vaults', async () => {
      type Ctx = { totalAssets?: bigint; asset?: Address }

      const makeTask = (vault: Address): MultistepTask<ProductComposition> => {
        const ctx: Ctx = {}

        return {
          maxStep: 2,

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
            }
          },

          finalize() {
            if (!ctx.totalAssets || !ctx.asset) {
              throw new Error('incomplete context in finalize')
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
        makeTask(SUSDS_VAULT),
        makeTask(MORPHO_USDC_VAULT),
      ]

      const results = await runMultistepTasks(client, tasks)

      expect(results).toHaveLength(2)

      for (const composition of results) {
        // Runtime guard + explicit narrowing for TypeScript.
        if (composition.type !== 'single-token') {
          throw new Error('expected single-token composition')
        }

        expect(composition.underlying.amount).toBeGreaterThan(0n)
        expect(composition.underlying.tokenAddress).toMatch(/^0x[0-9a-fA-F]{40}$/)
      }
    })
  })
}
