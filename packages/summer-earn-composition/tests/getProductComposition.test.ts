import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'

import { getProductComposition, type ProductDescriptor } from '../src'

describe('@summerfi/summer-earn-composition:getProductComposition', () => {
  it('throws a clear error when no handler is registered for a protocol', async () => {
    const product: ProductDescriptor = {
      chainId: 1,
      protocol: 'AaveV3',
      positionToken: '0x0000000000000000000000000000000000000001' as Address,
    }

    await expect(
      getProductComposition({
        product,
        owner: '0x0000000000000000000000000000000000000002' as Address,
      }),
    ).rejects.toThrow(/No protocol handler registered/)
  })
})
