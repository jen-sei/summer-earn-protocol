import dotenv from 'dotenv'
import { type Address, type Chain, createPublicClient, http } from 'viem'
import { arbitrum, base, mainnet, optimism, polygon } from 'viem/chains'

import type { VaultConfig, VaultConfigList } from '../src/config/vaults'
import vaultsJson from '../src/config/vaults.json' assert { type: 'json' }
import { resolveErc4626VaultsBulk } from '../src/handlers/erc4626Vault'
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
    console.error('Usage: tsx scripts/resolveVaultsForOwner.ts <ownerAddress>')
    process.exit(1)
  }

  const vaults = vaultsJson as VaultConfigList

  // Group vaults by chain to batch-resolve per chain.
  const vaultsByChain = new Map<number, VaultConfig[]>()
  for (const vault of vaults) {
    if (!vault.assetAddress || !vault.decimals) continue
    const list = vaultsByChain.get(vault.chainId) ?? []
    list.push(vault)
    vaultsByChain.set(vault.chainId, list)
  }

  const results: Array<{
    vault: VaultConfig
    composition: unknown
  }> = []
  const start = Date.now()

  const chainPromises = Array.from(vaultsByChain.entries()).map(async ([chainId, chainVaults]) => {
    const client = getClient(chainId)
    if (!client) return

    try {
      const resolutions = await resolveErc4626VaultsBulk({
        client,
        entries: chainVaults.map((vault) => ({
          vault: vault.address,
          owner,
        })),
      })

      resolutions.forEach((resolution, index) => {
        const vault = chainVaults[index]
        results.push({
          vault,
          composition: resolution,
        })
      })
    } catch (err) {
      console.warn(`Failed to resolve compositions for chainId=${chainId}:`, err)
    }
  })

  await Promise.all(chainPromises)

  const end = Date.now()
  console.log('total time', end - start, 'ms')
  console.log('total vaults resolved', results.length)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
