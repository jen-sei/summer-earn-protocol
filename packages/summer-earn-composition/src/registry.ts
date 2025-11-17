import type { Address, PublicClient } from 'viem'

import type { ProductDescriptor, ProductComposition } from './types'

export interface ProtocolHandlerContext {
  client: PublicClient
}

export interface ProtocolHandler {
  /**
   * Returns true if this handler can resolve composition for the given product.
   * Implementations can match on protocol name, chain id, and/or position token.
   */
  supports(product: ProductDescriptor): boolean

  /**
   * Compute the composition for a given product and user balance.
   *
   * @param product - Descriptor of the product/token.
   * @param owner - Address for which we want to compute composition.
   */
  getComposition(params: {
    product: ProductDescriptor
    owner: Address
    context: ProtocolHandlerContext
  }): Promise<ProductComposition>
}

const handlers: ProtocolHandler[] = []

export function registerHandler(handler: ProtocolHandler): void {
  handlers.push(handler)
}

export function getHandlerForProduct(product: ProductDescriptor): ProtocolHandler | undefined {
  return handlers.find((handler) => handler.supports(product))
}
