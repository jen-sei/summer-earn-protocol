import type { Address } from 'viem'

import type { ChainId } from '../types'

/**
 * Static configuration entry for a token.
 *
 * * source : https://raw.githubusercontent.com/SmolDapp/tokenLists/main/lists/1.json
 * Notes:
 * - `name`, `symbol`, and `decimals` are required.
 */
export interface TokenConfig {
  name?: string
  address: Address
  chainId: ChainId
  symbol: string
  logoURI: string
  decimals: number
}

export type TokenConfigList = TokenConfig[]
