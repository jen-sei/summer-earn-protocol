import { createPublicClient, http, PublicClient } from 'viem'
import { NETWORKS } from '../config/networks'

const clients: Record<number, PublicClient> = {}

export function getPublicClient(chainId: number): PublicClient {
  if (!clients[chainId]) {
    const network = NETWORKS[chainId]
    if (!network) {
      throw new Error(`Network ${chainId} not supported`)
    }
    clients[chainId] = createPublicClient({
      chain: network.chain,
      transport: http(),
    })
  }
  return clients[chainId]
}

export const publicClient = getPublicClient(8453) // Default to Base for backward compatibility if needed
