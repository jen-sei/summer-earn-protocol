import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'

import type { ProductDescriptor } from '../src'
import { StakedStablesHandler } from '../src/handlers/stakedStables'

describe('StakedStablesHandler', () => {
  const handler = new StakedStablesHandler()

  it('supports mainnet sDAI position tokens', () => {
    const product: ProductDescriptor = {
      chainId: 1,
      protocol: 'Staked Stables',
      positionToken: '0x83F20F44975D03b1b09e64809B757c47f942BEeA' as Address,
    }

    expect(handler.supports(product)).toBe(true)
  })

  it('does not support non-sDAI tokens', () => {
    const product: ProductDescriptor = {
      chainId: 1,
      protocol: 'Staked Stables',
      positionToken: '0x0000000000000000000000000000000000000001' as Address,
    }

    expect(handler.supports(product)).toBe(false)
  })
})
