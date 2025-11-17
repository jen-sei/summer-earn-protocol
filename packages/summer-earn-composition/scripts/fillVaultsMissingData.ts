import dotenv from 'dotenv'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Chain } from 'viem'
import { createPublicClient, http, type PublicClient } from 'viem'
import { arbitrum, base, mainnet, optimism, polygon } from 'viem/chains'

import type { VaultConfig, VaultConfigList } from '../src/config/vaults'
import vaultsJson from '../src/config/vaults.json' assert { type: 'json' }
import { resolveErc4626Vault } from '../src/handlers/erc4626Vault'

dotenv.config({ path: '../../.env' })
const vaultsPath = resolve(__dirname, '../src/config/vaults.json')

const chainConfig: Record<number, { chain: Chain; envVar: string }> = {
  1: { chain: mainnet, envVar: 'MAINNET_RPC_URL' },
  42161: { chain: arbitrum, envVar: 'ARBITRUM_RPC_URL' },
  10: { chain: optimism, envVar: 'OPTIMISM_RPC_URL' },
  8453: { chain: base, envVar: 'BASE_RPC_URL' },
  137: { chain: polygon, envVar: 'POLYGON_RPC_URL' },
}

function getClient(chainId: number): PublicClient | null {
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

async function fillVault(vault: VaultConfig, client: PublicClient): Promise<boolean> {
  let changed = false

  try {
    const resolution = await resolveErc4626Vault({
      client,
      vault: vault.address,
    })

    const { metadata } = resolution

    if (!vault.decimals && metadata.decimals !== undefined) {
      vault.decimals = metadata.decimals
      changed = true
    }

    if ((!vault.name || vault.name.trim() === '') && metadata.symbol) {
      vault.name = metadata.symbol
      changed = true
    }

    if (!vault.assetAddress && metadata.underlyingAsset) {
      vault.assetAddress = metadata.underlyingAsset
      changed = true
    }
  } catch (err) {
    console.warn(
      `Failed to fill vault metadata for ${vault.address} on chainId=${vault.chainId}:`,
      err,
    )
  }

  return changed
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const vaults = vaultsJson as VaultConfigList

  const clients = new Map<number, PublicClient | null>()

  let anyChanged = false

  for (const vault of vaults) {
    const needsFill =
      !vault.name || vault.name.trim() === '' || !vault.decimals || !vault.assetAddress

    if (!needsFill) continue

    let client = clients.get(vault.chainId)
    if (client === undefined) {
      client = getClient(vault.chainId)
      clients.set(vault.chainId, client)
    }

    if (!client) continue

    const changed = await fillVault(vault, client)
    anyChanged = anyChanged || changed
  }

  if (!anyChanged) {
    console.log('No changes needed; vaults.json is already populated.')
    return
  }

  if (dryRun) {
    console.log('Dry run complete; changes were not written to disk.')
    return
  }

  const updated = JSON.stringify(vaults, null, 2)
  writeFileSync(vaultsPath, updated)
  console.log('Updated vaults.json with filled metadata.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
