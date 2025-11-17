import type { Address, Chain as ViemChain, PublicClient } from 'viem'
import { createPublicClient, http } from 'viem'

import { registerBuiltInHandlers } from './handlers'
import { getHandlerForProduct, type ProtocolHandlerContext } from './registry'
import type { ChainId, ProductComposition, ProductDescriptor } from './types'

export * from './types'

export interface GetProductCompositionParams {
  product: ProductDescriptor
  owner: Address
  balance?: bigint
  client?: PublicClient
  chain?: ViemChain
  transportRpcUrl?: string
}

function createClientIfNeeded(
  chainId: ChainId,
  client?: PublicClient,
  chain?: ViemChain,
  transportRpcUrl?: string,
): PublicClient {
  if (client) return client
  if (!chain) {
    throw new Error(
      `createClientIfNeeded: either an existing client or a viem Chain must be provided (chainId=${chainId})`,
    )
  }
  return createPublicClient({
    chain,
    transport: http(transportRpcUrl),
  })
}

export async function getProductComposition(
  params: GetProductCompositionParams,
): Promise<ProductComposition> {
  const { product, owner, balance, client, chain, transportRpcUrl } = params

  // Ensure built-in protocol handlers are registered before resolving.
  registerBuiltInHandlers()

  const handler = getHandlerForProduct(product)
  if (!handler) {
    throw new Error(
      `No protocol handler registered for protocol=${product.protocol}, chainId=${product.chainId}`,
    )
  }

  const publicClient = createClientIfNeeded(product.chainId, client, chain, transportRpcUrl)

  const context: ProtocolHandlerContext = {
    client: publicClient,
  }

  return handler.getComposition({
    product,
    owner,
    context,
  })
}
