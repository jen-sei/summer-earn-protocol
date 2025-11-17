import dotenv from 'dotenv'
import { type Address, type Chain, createPublicClient, http } from 'viem'
import { arbitrum, base, mainnet, optimism, polygon } from 'viem/chains'

import type { TokenConfig, TokenConfigList } from '../src/config/tokens'
import tokensJson from '../src/config/tokens.json' assert { type: 'json' }
import { Erc20TokenResolution, resolveErc20TokensBulk } from '../src/handlers/erc20Token'

dotenv.config({ path: '../../.env' })

const chainConfig: Record<number, { chain: Chain; envVar: string }> = {
  1: { chain: mainnet, envVar: 'MAINNET_RPC_URL' },
  42161: { chain: arbitrum, envVar: 'ARBITRUM_RPC_URL' },
  10: { chain: optimism, envVar: 'OPTIMISM_RPC_URL' },
  8453: { chain: base, envVar: 'BASE_RPC_URL' },
  137: { chain: polygon, envVar: 'POLYGON_RPC_URL' },
}

function getClient(chainId: number) {
  const cfg = chainConfig[chainId]
  if (!cfg) {
    console.warn(`No chain config for chainId=${chainId}, skipping`)
    return null
  }

  const rpcUrl = process.env[cfg.envVar]
  if (!rpcUrl) {
    console.warn(`Missing RPC URL env var ${cfg.envVar} for chainId=${chainId}, skipping`)
    return null
  }

  return createPublicClient({
    chain: cfg.chain,
    transport: http(rpcUrl),
  })
}

async function main() {
  const owner = process.argv[2] as Address | undefined
  if (!owner) {
    console.error('Usage: tsx scripts/resolveTokensForOwner.ts <ownerAddress>')
    process.exit(1)
  }

  const tokens = tokensJson as TokenConfigList

  const tokensByChain = new Map<number, TokenConfig[]>()
  for (const token of tokens) {
    // Require at least address and decimals to be present
    if (!token.address || token.decimals === undefined || token.decimals === null) continue
    const list = tokensByChain.get(token.chainId) ?? []
    list.push(token)
    tokensByChain.set(token.chainId, list)
  }

  const results: Array<{ token: TokenConfig; resolution: Erc20TokenResolution }> = []
  const start = Date.now()

  const chainPromises = Array.from(tokensByChain.entries()).map(async ([chainId, chainTokens]) => {
    const client = getClient(chainId)
    if (!client) return

    try {
      const resolutions = await resolveErc20TokensBulk({
        client,
        entries: chainTokens.map((token) => ({ token: token.address, owner })),
      })

      resolutions.forEach((resolution, index) => {
        const token = chainTokens[index]
        results.push({ token, resolution: resolution as Erc20TokenResolution })
      })
    } catch (err) {
      console.warn(`Failed to resolve ERC20 tokens for chainId=${chainId}:`, err)
    }
  })

  await Promise.all(chainPromises)

  const end = Date.now()
  console.log('total time', end - start, 'ms')
  console.log('tokens resolved', results.length)

  // log all resolutions with balance and balance > 0
  // console.log(results.filter((result) => result.resolution.balance && result.resolution.balance > 0))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
