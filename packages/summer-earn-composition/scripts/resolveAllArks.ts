/**
 * Resolve All Ark Handlers Script
 *
 * Executes all Ark handlers in a single aggregated multicall execution per chain.
 * All handlers' tasks are batched together, minimizing multicall rounds
 * to the maximum maxStep across all handlers (typically 4 steps).
 *
 * Handlers are grouped by chain (mainnet/base) and executed separately.
 *
 * Usage:
 *   npm run resolve-all-arks
 *   npm run resolve-all-arks -- --OriginOETH=0x... --Morpho=0x...
 *
 * Environment:
 *   Requires MAINNET_RPC_URL (and BASE_RPC_URL for Base handlers) in .env
 */

import dotenv from 'dotenv'
import { type Address, createPublicClient, http } from 'viem'
import { base, mainnet } from 'viem/chains'

import { runMultistepTasks } from '../src/multistepMulticall'
import {
  AaveV3Ark,
  AeraArk,
  CompoundV3Ark,
  FluidVaultArk,
  MoonwellArk,
  MorphoArk,
  OriginOETHArk,
  OriginSuperOETHArk,
  PendlePTArk,
  Psm3Ark,
  SiloManagedVaultArk,
  SiUSDArk,
  SparkLendArk,
  StargateV2Ark,
  SusdsArk,
  SyrupArk,
} from '../src/handlers/ark'
import type { ArkHandler, CollateralResult } from '../src/handlers/ark'

dotenv.config({ path: '../../.env' })

// Default addresses (Nov 2025 mainnet)
const DEFAULT_ADDRESSES: Record<string, Address> = {
  OriginOETH: '0x39254033945AA2E4809Cc2977E7087BEE48bd7Ab' as Address,
  OriginSuperOETH: '0x57cb08bb2dc86c8ec7e1d7da10a62761c2e0d8ee' as Address,
  SiUSD: '0xdBDC1Ef57537E34680B898E1FEBD3D68c7389bCB' as Address,
  SiloManaged: '0x5362D5086FDef73450145492a66F8EBF210c5B9C' as Address,
  SyrupUSDC: '0x643C4E15d7d62Ad0aBeC4a9BD4b001aA3Ef52d66' as Address,
  Aera: '0x47fe8Ab9eE47DD65c24df52324181790b9F47EfC' as Address,
  SparkLend: '0x5a0b54d5dc17e0aadc383d2db43b0a0d3e029c4c' as Address,
  Susds: '0xa393473d9Ed3b3a13e2A72aA5dB3d2E7A0b5c7f9' as Address,
  Psm3: '0x02C3eA4e34C0cBd694D2adFa2c690EECbC1793eE' as Address,
  PendlePT: '0x1A6fCc85557BC4fB7B534ed835a03EF056552D52' as Address,
  Fluid: '0x6f40d4a6237c257fff2db00fa0510deeecd303eb' as Address,
  AaveV3: '0x87870Bca3F3fD6335C3f4Ce8392D69350b4fA4E2' as Address,
  CompoundV3: '0xc3d688B66703497DAA19211EEdff47f25384CdC3' as Address,
  StargateV2: '0xc026395860Db2d07ee33e05fE50ed7bD583189C7' as Address,
  Moonwell: '0xfBb21d0380beE3312b33c4353c8936a0F13EF26C' as Address,
  Morpho: '0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB' as Address,
}

interface HandlerConfig {
  handler: ArkHandler
  address: Address
  chain: 'mainnet' | 'base'
}

function formatAddress(address: string, length = 8): string {
  if (address.length <= length * 2 + 2) return address
  return `${address.slice(0, length + 2)}...${address.slice(-length)}`
}

function formatAmount(amount: bigint, decimals = 18): string {
  const divisor = 10n ** BigInt(decimals)
  const whole = amount / divisor
  const fractional = amount % divisor
  if (fractional === 0n) {
    return whole.toString()
  }
  const fractionalStr = fractional.toString().padStart(Number(decimals), '0')
  const trimmed = fractionalStr.replace(/0+$/, '')
  return trimmed ? `${whole}.${trimmed}` : whole.toString()
}

function formatLTV(ltv: number): string {
  return `${(ltv / 100).toFixed(2)}%`
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

async function main() {
  const args = process.argv.slice(2)

  // Parse addresses from args or use defaults
  const addresses: Record<string, Address> = { ...DEFAULT_ADDRESSES }

  // Allow override via args: --handler=address format
  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=')
      if (value && key in DEFAULT_ADDRESSES) {
        addresses[key] = value as Address
      }
    }
  }

  console.log('═'.repeat(100))
  console.log('Resolving All Ark Handlers (Aggregated Multicall)')
  console.log('═'.repeat(100))
  console.log('')

  // Group handlers by chain
  const mainnetHandlers: HandlerConfig[] = [
    { handler: OriginOETHArk, address: addresses.OriginOETH, chain: 'mainnet' },
    // { handler: SiUSDArk, address: addresses.SiUSD, chain: 'mainnet' },
    // { handler: SiloManagedVaultArk, address: addresses.SiloManaged, chain: 'mainnet' },
    // { handler: SyrupArk, address: addresses.SyrupUSDC, chain: 'mainnet' },
    // { handler: AeraArk, address: addresses.Aera, chain: 'mainnet' },
    // { handler: SparkLendArk, address: addresses.SparkLend, chain: 'mainnet' },
    // { handler: SusdsArk, address: addresses.Susds, chain: 'mainnet' },
    // { handler: Psm3Ark, address: addresses.Psm3, chain: 'mainnet' },
    // { handler: PendlePTArk, address: addresses.PendlePT, chain: 'mainnet' },
    // { handler: FluidVaultArk, address: addresses.Fluid, chain: 'mainnet' },
    // { handler: AaveV3Ark, address: addresses.AaveV3, chain: 'mainnet' },
    // { handler: CompoundV3Ark, address: addresses.CompoundV3, chain: 'mainnet' },
    // { handler: StargateV2Ark, address: addresses.StargateV2, chain: 'mainnet' },
    // { handler: MorphoArk, address: addresses.Morpho, chain: 'mainnet' },
  ]

  const baseHandlers: HandlerConfig[] = [
    // { handler: OriginSuperOETHArk, address: addresses.OriginSuperOETH, chain: 'base' },
    // { handler: MoonwellArk, address: addresses.Moonwell, chain: 'base' },
  ]

  const MAINNET_RPC_URL = process.env.MAINNET_RPC_URL
  const BASE_RPC_URL = process.env.BASE_RPC_URL || MAINNET_RPC_URL

  if (!MAINNET_RPC_URL) {
    console.error('Error: MAINNET_RPC_URL environment variable is required')
    process.exit(1)
  }

  const start = Date.now()
  const allResults: Array<{
    handlerName: string
    address: string
    chain: string
    collateral: CollateralResult[]
    error?: Error
  }> = []

  try {
    // Execute mainnet handlers in a single aggregated multicall
    if (mainnetHandlers.length > 0) {
      console.log(`Building ${mainnetHandlers.length} mainnet handler tasks...`)
      const mainnetTasks = mainnetHandlers.map((config) => config.handler.buildTask(config.address))
      console.log('mainnetTasks', mainnetTasks)
      const maxStep = Math.max(...mainnetTasks.map((task) => task.maxStep))
      console.log(`  Max steps: ${maxStep}`)
      console.log(`  Expected multicall rounds: ${maxStep}`)
      console.log('')

      const mainnetClient = createPublicClient({
        chain: mainnet,
        transport: http(MAINNET_RPC_URL),
      })

      console.log('Executing aggregated multicall for mainnet handlers...')
      const mainnetResults = await runMultistepTasks(mainnetClient, mainnetTasks)
      console.log('mainnetResults', mainnetResults)
      for (let i = 0; i < mainnetHandlers.length; i++) {
        allResults.push({
          handlerName: mainnetHandlers[i].handler.name,
          address: mainnetHandlers[i].address,
          chain: 'mainnet',
          collateral: mainnetResults[i],
        })
      }
    }

    // Execute base handlers in a single aggregated multicall
    if (baseHandlers.length > 0 && BASE_RPC_URL) {
      console.log(`Building ${baseHandlers.length} base handler tasks...`)
      const baseTasks = baseHandlers.map((config) => config.handler.buildTask(config.address))

      const maxStep = Math.max(...baseTasks.map((task) => task.maxStep))
      console.log(`  Max steps: ${maxStep}`)
      console.log(`  Expected multicall rounds: ${maxStep}`)
      console.log('')

      const baseClient = createPublicClient({
        chain: base,
        transport: http(BASE_RPC_URL!),
      })

      console.log('Executing aggregated multicall for base handlers...')
      // @ts-expect-error - viem type incompatibility between mainnet and base chains
      const baseResults = await runMultistepTasks(baseClient, baseTasks)

      for (let i = 0; i < baseHandlers.length; i++) {
        allResults.push({
          handlerName: baseHandlers[i].handler.name,
          address: baseHandlers[i].address,
          chain: 'base',
          collateral: baseResults[i],
        })
      }
    }

    const end = Date.now()
    const duration = end - start

    // Separate successful and failed results
    const successful = allResults.filter((r) => !r.error)
    const errors = allResults.filter((r) => r.error)

    // Display errors first
    if (errors.length > 0) {
      console.log('═'.repeat(100))
      console.log(`Errors (${errors.length}):`)
      console.log('═'.repeat(100))
      for (const { handlerName, address, error } of errors) {
        console.log(`❌ ${handlerName}`)
        console.log(`   Address: ${formatAddress(address)}`)
        console.log(`   Error: ${error?.message}`)
        console.log('')
      }
    }

    // Display per-handler results
    console.log('═'.repeat(100))
    console.log('Per-Handler Results:')
    console.log('═'.repeat(100))
    console.log('')

    for (const result of successful) {
      console.log(`📊 ${result.handlerName} (${result.chain})`)
      console.log(`   Address: ${formatAddress(result.address)}`)
      console.log(`   Collateral Assets: ${result.collateral.length}`)

      if (result.collateral.length > 0) {
        const tableData = result.collateral.map((c, idx) => ({
          '#': idx + 1,
          Token: formatAddress(c.token, 6),
          Amount: formatAmount(c.amount),
          LTV: formatLTV(c.ltv),
        }))
        formatTable(tableData)
      } else {
        console.log('   No collateral found')
      }
      console.log('')
    }

    // Aggregate by token across all handlers
    const tokenAggregation = new Map<
      string,
      { totalAmount: bigint; maxLTV: number; handlers: string[] }
    >()

    for (const result of successful) {
      for (const collateral of result.collateral) {
        const existing = tokenAggregation.get(collateral.token) || {
          totalAmount: 0n,
          maxLTV: 0,
          handlers: [],
        }
        tokenAggregation.set(collateral.token, {
          totalAmount: existing.totalAmount + collateral.amount,
          maxLTV: Math.max(existing.maxLTV, collateral.ltv),
          handlers: [...existing.handlers, result.handlerName],
        })
      }
    }

    // Display aggregated results
    if (tokenAggregation.size > 0) {
      console.log('═'.repeat(100))
      console.log('Aggregated Collateral (All Handlers):')
      console.log('═'.repeat(100))
      console.log('')

      const aggregatedTable = Array.from(tokenAggregation.entries())
        .sort((a, b) => {
          // Sort by total amount descending
          if (b[1].totalAmount > a[1].totalAmount) return 1
          if (b[1].totalAmount < a[1].totalAmount) return -1
          return 0
        })
        .map(([token, data], idx) => ({
          '#': idx + 1,
          Token: formatAddress(token, 6),
          'Total Amount': formatAmount(data.totalAmount),
          'Max LTV': formatLTV(data.maxLTV),
          Handlers: data.handlers.length.toString(),
          'Handler List': data.handlers.join(', '),
        }))

      formatTable(aggregatedTable)
      console.log('')
    }

    // Summary
    const totalCollateralAssets = successful.reduce((sum, r) => sum + r.collateral.length, 0)
    const uniqueTokens = tokenAggregation.size
    const totalAmount = Array.from(tokenAggregation.values()).reduce(
      (sum, data) => sum + data.totalAmount,
      0n,
    )

    console.log('═'.repeat(100))
    console.log('Summary:')
    console.log('═'.repeat(100))
    console.log(`  Total handlers executed: ${allResults.length}`)
    console.log(`  Successful: ${successful.length}`)
    console.log(`  Failed: ${errors.length}`)
    console.log(`  Total collateral assets found: ${totalCollateralAssets}`)
    console.log(`  Unique tokens: ${uniqueTokens}`)
    console.log(`  Total amount (aggregated): ${formatAmount(totalAmount)}`)
    console.log(`  Execution time: ${duration}ms`)
    console.log(
      `  Multicall efficiency: All handlers batched into ${Math.max(...[mainnetHandlers.length > 0 ? Math.max(...mainnetHandlers.map((c) => c.handler.buildTask(c.address).maxStep)) : 0, baseHandlers.length > 0 ? Math.max(...baseHandlers.map((c) => c.handler.buildTask(c.address).maxStep)) : 0])} rounds per chain`,
    )
    console.log('═'.repeat(100))
  } catch (err) {
    console.error('Failed to resolve Ark handlers:', err)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
