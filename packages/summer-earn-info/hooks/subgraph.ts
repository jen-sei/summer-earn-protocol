import { gql, GraphQLClient } from 'graphql-request'
import { NETWORKS } from '../config/networks'

export function getSubgraphClient(chainId: number) {
  const network = NETWORKS[chainId]
  if (!network) {
    throw new Error(`Network ${chainId} not supported`)
  }
  return new GraphQLClient(network.subgraphUrl)
}

export const GET_FLEET_QUERY = gql`
  query GetFleet($id: ID!) {
    vault(id: $id) {
      id
      name
      totalValueLockedUSD
      inputToken {
        id
        symbol
        decimals
      }
      outputTokenPriceUSD
      depositCap
      minimumBufferBalance
      tipRate
      inputTokenBalance
      outputTokenSupply
      withdrawableTotalAssets
      bufferArk {
        id
        name
        inputTokenBalance
        totalValueLockedUSD
        productId
      }
      arks {
        id
        name
        inputTokenBalance
        totalValueLockedUSD
        productId
      }
    }
  }
`

export const GET_ALL_FLEETS_QUERY = gql`
  query GetAllFleets {
    vaults {
      id
      name
      totalValueLockedUSD
      inputToken {
        id
        symbol
        decimals
      }
    }
  }
`

export type SubgraphToken = {
  id: string
  symbol: string
  decimals: number
}

export type SubgraphArk = {
  id: string
  name: string | null
  inputTokenBalance: string
  totalValueLockedUSD: string
  productId: string | null
}

export type SubgraphVault = {
  id: string
  name: string
  totalValueLockedUSD: string
  inputToken: SubgraphToken
  outputTokenPriceUSD: string | null
  depositCap: string
  minimumBufferBalance: string
  tipRate: string
  inputTokenBalance: string
  outputTokenSupply: string
  withdrawableTotalAssets: string
  bufferArk: SubgraphArk | null
  arks: SubgraphArk[]
}
