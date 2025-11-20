import dotenv from 'dotenv'
import { type Address, type Chain, createPublicClient, http } from 'viem'
import { arbitrum, base, mainnet, optimism, polygon } from 'viem/chains'

import { resolveMorphoVaultsBulk } from '../src/handlers/morphoVault'

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

function formatTable(data: Array<{ [key: string]: string | number }>) {
  if (data.length === 0) {
    console.log('No data to display')
    return
  }

  // Get all keys from the first row
  const keys = Object.keys(data[0])
  const columnWidths = new Map<string, number>()

  // Calculate column widths
  keys.forEach((key) => {
    let maxWidth = key.length
    data.forEach((row) => {
      const value = String(row[key] ?? '')
      if (value.length > maxWidth) {
        maxWidth = value.length
      }
    })
    columnWidths.set(key, maxWidth)
  })

  // Print header
  const headerRow = keys.map((key) => key.padEnd(columnWidths.get(key)!)).join(' | ')
  console.log(headerRow)
  console.log(keys.map((key) => '-'.repeat(columnWidths.get(key)!)).join('-|-'))

  // Print data rows
  data.forEach((row) => {
    const dataRow = keys
      .map((key) => String(row[key] ?? '').padEnd(columnWidths.get(key)!))
      .join(' | ')
    console.log(dataRow)
  })
}

function formatAddress(address: Address, length = 8): string {
  if (address.length <= length * 2 + 2) return address
  return `${address.slice(0, length + 2)}...${address.slice(-length)}`
}

async function main() {
  // Parse arguments: vault addresses (space or comma separated) and optional chainId
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.error(
      'Usage: tsx scripts/resolveMorphoVault.ts <vaultAddress1> [vaultAddress2 ...] [chainId]',
    )
    console.error('Example: tsx scripts/resolveMorphoVault.ts 0x1234...5678 1')
    console.error('Example: tsx scripts/resolveMorphoVault.ts 0x1234...5678 0xabcd...efgh 1')
    process.exit(1)
  }

  // Last argument might be chainId if it's a number, otherwise it's a vault address
  let chainId = 1
  const vaultAddresses: Address[] = []

  for (const arg of args) {
    const parsedChainId = parseInt(arg, 10)
    if (!isNaN(parsedChainId) && arg === parsedChainId.toString()) {
      // This is a chainId
      chainId = parsedChainId
    } else {
      // This is a vault address
      vaultAddresses.push(arg as Address)
    }
  }

  if (vaultAddresses.length === 0) {
    console.error('Error: No vault addresses provided')
    process.exit(1)
  }

  const client = getClient(chainId)
  if (!client) {
    console.error(`Failed to create client for chainId=${chainId}`)
    process.exit(1)
  }

  console.log(`Resolving ${vaultAddresses.length} Morpho vault(s) on chain ${chainId}`)
  console.log(`Chain: ${client.chain?.name}`)
  vaultAddresses.forEach((vault, idx) => {
    console.log(`  ${idx + 1}. ${vault}`)
  })
  console.log('')

  const start = Date.now()

  try {
    const resolutions = await resolveMorphoVaultsBulk({
      client,
      vaults: vaultAddresses,
    })

    const end = Date.now()
    console.log(`Resolved ${resolutions.length} vault(s) in ${end - start}ms`)
    console.log('')

    // Display results for each vault
    resolutions.forEach((resolution, vaultIndex) => {
      const vaultAddress = vaultAddresses[vaultIndex]
      const vaultDisplay = formatAddress(vaultAddress, 10)

      console.log('═'.repeat(80))
      console.log(`Vault ${vaultIndex + 1}/${resolutions.length}: ${vaultDisplay}`)
      console.log('═'.repeat(80))

      if (resolution.markets.length === 0) {
        console.log('No markets found in supply queue')
        console.log('')
        return
      }

      // Calculate total supply shares for percentage calculation
      const totalSupplyShares = resolution.markets.reduce(
        (sum, market) => sum + market.supplyShares,
        0n,
      )

      // Prepare table data
      const tableData = resolution.markets
        .filter((market) => market.supplyShares > 0n || market.collateral > 0n)
        .map((market, index) => {
          const percentage =
            totalSupplyShares > 0n
              ? (Number(market.supplyShares) / Number(totalSupplyShares)) * 100
              : 0

          // Format market ID for display
          const marketIdDisplay =
            market.marketId.length > 14
              ? `${market.marketId.slice(0, 10)}...${market.marketId.slice(-6)}`
              : market.marketId

          return {
            '#': index + 1,
            'Market ID': marketIdDisplay,
            'Loan Token':
              market.loanTokenSymbol ||
              `${market.loanToken.slice(0, 6)}...${market.loanToken.slice(-4)}`,
            'Collateral Token':
              market.collateralTokenSymbol ||
              `${market.collateralToken.slice(0, 6)}...${market.collateralToken.slice(-4)}`,
            'Supply Shares': market.supplyShares.toString(),
            Collateral: market.collateral.toString(),
            '%': percentage.toFixed(2) + '%',
          }
        })

      // Display table
      formatTable(tableData)

      console.log('')
      console.log(`Total Supply Shares: ${totalSupplyShares.toString()}`)
      console.log(`Markets with positions: ${tableData.length}`)
      console.log('')
    })

    // Summary
    const totalMarkets = resolutions.reduce((sum, r) => sum + r.markets.length, 0)
    const totalMarketsWithPositions = resolutions.reduce(
      (sum, r) => sum + r.markets.filter((m) => m.supplyShares > 0n || m.collateral > 0n).length,
      0,
    )

    console.log('═'.repeat(80))
    console.log('Summary:')
    console.log(`  Total vaults resolved: ${resolutions.length}`)
    console.log(`  Total markets found: ${totalMarkets}`)
    console.log(`  Markets with positions: ${totalMarketsWithPositions}`)
    console.log('═'.repeat(80))
  } catch (err) {
    console.error('Failed to resolve Morpho vaults:', err)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
