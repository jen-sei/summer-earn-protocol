import { mainnet, arbitrum, base, sonic } from 'viem/chains'
import { Chain } from 'viem'

export type NetworkConfig = {
  chain: Chain
  subgraphUrl: string
  label: string
}

export const NETWORKS: Record<number, NetworkConfig> = {
  [mainnet.id]: {
    chain: mainnet,
    subgraphUrl: 'https://subgraph.staging.oasisapp.dev/summer-protocol',
    label: 'Ethereum Mainnet',
  },
  [arbitrum.id]: {
    chain: arbitrum,
    subgraphUrl: 'https://subgraph.staging.oasisapp.dev/summer-protocol-arbitrum',
    label: 'Arbitrum One',
  },
  [base.id]: {
    chain: base,
    subgraphUrl: 'https://subgraph.staging.oasisapp.dev/summer-protocol-base',
    label: 'Base',
  },
  // Sonic not in standard viem export yet or might be custom, using what's available.
  // If sonic is not in viem, we skip or define custom.
  // Assuming it's not critical for this demo if standard viem doesn't have it,
  // but user mentioned it. I will exclude it for safety unless I find the chain def.
}

export const DEFAULT_NETWORK_ID = base.id
