import type { Address } from 'viem'

import type { ChainId } from '../types'

/**
 * Static configuration entry for a yield vault.
 *
 * Notes:
 * - `name`, `assetAddress`, and `decimals` may be missing for some entries.
 *   The fill script can derive them on-chain for ERC4626-compatible vaults.
 */
export interface VaultConfig {
  name?: string
  address: Address
  chainId: ChainId
  assetAddress?: Address
  decimals?: number
}

export type VaultConfigList = VaultConfig[]
