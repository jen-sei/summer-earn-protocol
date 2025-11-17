import { type Abi, type Address, erc4626Abi } from 'viem'
import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'
import { describe, expect, it } from 'vitest'

const MAINNET_RPC_URL = process.env.MAINNET_RPC_URL

// sUSDS (ERC4626) on mainnet
const SUSDS_VAULT = '0xa3931d71877c0e7a3148cb7eb4463524fec27fbd' as Address

// Morpho USDC ERC4626 vault on mainnet
const MORPHO_USDC_VAULT = '0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB' as Address

if (!MAINNET_RPC_URL) {
  // We deliberately skip these tests when no mainnet RPC is configured,
  // to avoid failing local/unit runs.
  describe('mainnet ERC4626 e2e', () => {
    it('skipped because MAINNET_RPC_URL is not set', () => {
      expect(true).toBe(true)
    })
  })
} else {
  const client = createPublicClient({
    chain: mainnet,
    transport: http(MAINNET_RPC_URL),
  })

  describe('mainnet ERC4626 e2e', () => {
    it('calls totalAssets and asset on both ERC4626 vaults via multicall', async () => {
      const contracts = [
        {
          address: SUSDS_VAULT,
          abi: erc4626Abi as Abi,
          functionName: 'totalAssets',
        },
        {
          address: SUSDS_VAULT,
          abi: erc4626Abi as Abi,
          functionName: 'asset',
        },
        {
          address: MORPHO_USDC_VAULT,
          abi: erc4626Abi as Abi,
          functionName: 'totalAssets',
        },
        {
          address: MORPHO_USDC_VAULT,
          abi: erc4626Abi as Abi,
          functionName: 'asset',
        },
      ]

      const results = await client.multicall({
        contracts,
        allowFailure: true,
      })

      const [susdsTotalAssets, susdsAsset, morphoTotalAssets, morphoAsset] = results

      // Sanity checks – we mainly care that the calls succeed and return sensible values.
      expect(susdsTotalAssets.status).toBe('success')
      expect(morphoTotalAssets.status).toBe('success')

      const susdsAssetsValue = susdsTotalAssets.result as bigint
      const morphoAssetsValue = morphoTotalAssets.result as bigint

      expect(susdsAssetsValue).toBeGreaterThan(0n)
      expect(morphoAssetsValue).toBeGreaterThan(0n)

      const susdsUnderlying = susdsAsset.result as Address
      const morphoUnderlying = morphoAsset.result as Address

      expect(susdsUnderlying).toMatch(/^0x[0-9a-fA-F]{40}$/)
      expect(morphoUnderlying).toMatch(/^0x[0-9a-fA-F]{40}$/)
    })
  })
}
