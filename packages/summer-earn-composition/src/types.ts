import type { Address } from 'viem'

export type ChainId = number

export type ProtocolName =
  | 'AaveV3'
  | 'CompoundV3'
  | 'Euler'
  | 'Fluid'
  | 'Gearbox'
  | 'InfiniFi'
  | 'LRT'
  | 'Morpho'
  | 'Origin'
  | 'Pendle'
  | 'Sky'
  | 'Silo'
  | 'Staked Stables'
  | 'Syrup'
  | 'Term'
  | 'Erc4626'
  | 'Erc20'

export interface TokenAmount {
  tokenAddress: Address
  /**
   * Amount in the token's native units (no decimals normalization)
   */
  amount: bigint
}

export interface MarketPosition {
  marketAddress: Address
  underlyingToken: Address
  /**
   * Amount in the underlying token's native units
   */
  amount: bigint
}

export type ProductComposition =
  | {
      type: 'single-token'
      underlying: TokenAmount
    }
  | {
      type: 'multi-token'
      underlyings: TokenAmount[]
    }
  | {
      type: 'morpho-market'
      positions: MarketPosition[]
    }
  | {
      type: 'pendle-position'
      /**
       * For PT/LP positions we want both the deposited token and any yield-bearing representation.
       */
      depositedToken: TokenAmount
      yieldToken?: TokenAmount
    }

export interface ProductDescriptor {
  chainId: ChainId
  protocol: ProtocolName
  /**
   * The address of the token representing the position (e.g. sDAI, vault share token,
   * PT token, LP token, etc.).
   */
  positionToken: Address
}
