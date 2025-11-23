import { NextResponse } from 'next/server'
import {
  getSubgraphClient,
  GET_ALL_FLEETS_QUERY,
  GET_FLEET_QUERY,
  SubgraphVault,
} from '@/hooks/subgraph'
import { getPublicClient } from '@/hooks/client'
import { resolveMorphoVaultsBulk, MorphoVaultResolution } from '@summerfi/summer-earn-composition'
import { Address, formatUnits, getAddress } from 'viem'
// No longer need ABIs - all data comes from subgraph
import { FleetMetric, ArkMetric, CollateralExposure } from '@/hooks/types'

const TTL_MS = 30 * 1000 // 30 seconds cache
const cache = new Map<string, { data: unknown; expiry: number }>()

async function fetchFleetDetails(
  chainIdNum: number,
  fleetId: string,
  fleetData: SubgraphVault,
): Promise<{
  fleetMetrics: FleetMetric
  arks: ArkMetric[]
  collateralExposure: CollateralExposure[]
}> {
  const publicClient = getPublicClient(chainIdNum)

  // Use subgraph data instead of on-chain calls
  const totalAssets = BigInt(fleetData.inputTokenBalance)
  const totalSupply = BigInt(fleetData.outputTokenSupply)
  const sharePrice = totalSupply === BigInt(0) ? 1 : Number(totalAssets) / Number(totalSupply)
  const tvl = Number(formatUnits(totalAssets, fleetData.inputToken.decimals))

  // Get active ark addresses from subgraph (ark.id is the smart contract address)
  const activeArkAddresses = fleetData.arks.map((ark) => getAddress(ark.id)) as Address[]
  const realBufferArkAddress = fleetData.bufferArk ? getAddress(fleetData.bufferArk.id) : null

  // Helper function to extract protocol from productId
  // productId format: `${protocol}-${assetAddress}-${poolAddress}-${normalizedChainId}`
  const extractProtocolFromProductId = (
    productId: string | null | undefined,
    name: string | null | undefined,
  ): string => {
    // Buffer ark doesn't have a productId or has a special name
    if (!productId || name?.toLowerCase().includes('buffer')) {
      return 'buffer'
    }

    const parts = productId.split('-')
    if (parts.length >= 1) {
      return parts[0].toLowerCase()
    }

    return 'unknown'
  }

  // Create a map of ark addresses to subgraph data for quick lookup
  const arkSubgraphMap = new Map<
    Address,
    { name: string; protocol: string; inputTokenBalance: string; productId?: string }
  >()
  fleetData.arks.forEach((ark) => {
    const address = getAddress(ark.id)
    const protocol = extractProtocolFromProductId(ark.productId, ark.name)
    arkSubgraphMap.set(address, {
      name: ark.name || 'Unknown Ark',
      protocol,
      inputTokenBalance: ark.inputTokenBalance,
      productId: ark.productId,
    })
  })
  if (fleetData.bufferArk) {
    const bufferAddress = getAddress(fleetData.bufferArk.id)
    const protocol = extractProtocolFromProductId(
      fleetData.bufferArk.productId,
      fleetData.bufferArk.name,
    )
    arkSubgraphMap.set(bufferAddress, {
      name: fleetData.bufferArk.name || 'Buffer Ark',
      protocol,
      inputTokenBalance: fleetData.bufferArk.inputTokenBalance || '0',
      productId: fleetData.bufferArk.productId,
    })
  }

  // Use subgraph data for ark totalAssets (inputTokenBalance)
  const arksMeta = activeArkAddresses.map((address) => {
    const subgraphData = arkSubgraphMap.get(address)
    const name = subgraphData?.name || 'Unknown Ark'
    const protocol = subgraphData?.protocol || 'unknown'
    const totalAssets = subgraphData?.inputTokenBalance
      ? BigInt(subgraphData.inputTokenBalance)
      : BigInt(0)

    return {
      address,
      name,
      protocol,
      totalAssets,
      assetsNum: Number(formatUnits(totalAssets, fleetData.inputToken.decimals)),
      productId: subgraphData?.productId,
    }
  })

  // Phase 2: Extract MetaMorpho Addresses from productId
  // productId format: `${protocol}-${assetAddress}-${poolAddress}-${normalizedChainId}`
  // For Morpho arks, poolAddress (3rd part) is the MetaMorpho vault address
  const morphoArks = arksMeta.filter((a) => a.protocol === 'morpho')
  const vaultAddressMap = new Map<Address, Address>()
  const vaultsToResolve = new Set<Address>()

  morphoArks.forEach((ark) => {
    if (ark.productId) {
      const parts = ark.productId.split('-')
      if (parts.length >= 3) {
        try {
          const metaMorphoAddress = getAddress(parts[2]) // poolAddress is the 3rd part
          vaultAddressMap.set(ark.address, metaMorphoAddress)
          vaultsToResolve.add(metaMorphoAddress)
        } catch (e) {
          console.warn(`Failed to parse MetaMorpho address from productId ${ark.productId}:`, e)
        }
      }
    }
  })

  // Phase 3: Bulk Resolve Morpho Vaults
  const uniqueVaults = Array.from(vaultsToResolve)
  let morphoResolutions: MorphoVaultResolution[] = []

  if (uniqueVaults.length > 0) {
    try {
      morphoResolutions = await resolveMorphoVaultsBulk({
        // @ts-expect-error - viem version mismatch between packages (2.39.0 vs 2.39.3)
        client: publicClient,
        vaults: uniqueVaults,
      })
    } catch (e) {
      console.error('Bulk Morpho resolution failed', e)
    }
  }

  const resolutionMap = new Map<Address, MorphoVaultResolution>()
  uniqueVaults.forEach((vault, i) => {
    if (morphoResolutions[i]) {
      resolutionMap.set(vault, morphoResolutions[i])
    }
  })

  // Phase 4: Aggregate Data
  const arkMetrics: ArkMetric[] = []
  const riskMap: Record<string, { amount: number; symbol: string; arks: string[] }> = {}

  for (const ark of arksMeta) {
    if (ark.protocol === 'morpho') {
      const vaultAddr = vaultAddressMap.get(ark.address)
      const resolution = vaultAddr ? resolutionMap.get(vaultAddr) : undefined

      if (resolution && resolution.vaultTotalAssets > BigInt(0)) {
        resolution.markets.forEach((market) => {
          if (market.supplyAssets === BigInt(0)) return
          const exposureBigInt =
            (market.supplyAssets * ark.totalAssets) / resolution.vaultTotalAssets
          const exposureNum = Number(formatUnits(exposureBigInt, fleetData.inputToken.decimals))

          const key = market.collateralTokenSymbol || 'Unknown'
          if (!riskMap[key]) riskMap[key] = { amount: 0, symbol: key, arks: [] }

          riskMap[key].amount += exposureNum
          if (!riskMap[key].arks.includes(ark.name)) riskMap[key].arks.push(ark.name)
        })
      } else {
        const key = `${ark.name} (Unknown Risk)`
        if (!riskMap[key]) riskMap[key] = { amount: 0, symbol: key, arks: [] }
        riskMap[key].amount += ark.assetsNum
        riskMap[key].arks.push(ark.name)
      }
    } else {
      const key = ark.protocol === 'buffer' ? 'Cash (Buffer)' : `${ark.name}`
      if (!riskMap[key]) riskMap[key] = { amount: 0, symbol: key, arks: [] }
      riskMap[key].amount += ark.assetsNum
      riskMap[key].arks.push(ark.name)
    }

    arkMetrics.push({
      id: ark.address,
      name: ark.name,
      allocation: ark.assetsNum,
      weight: tvl > 0 ? (ark.assetsNum / tvl) * 100 : 0,
      depositCap: 0,
      maxDepositPercentage: 0,
      maxRebalanceInflow: 0,
      maxRebalanceOutflow: 0,
      status: ark.protocol === 'buffer' ? 'buffer' : 'active',
      apy: 0,
    })
  }

  const collateralExposure: CollateralExposure[] = Object.values(riskMap)
    .map((r) => ({
      asset: r.symbol,
      amount: r.amount,
      percentage: tvl > 0 ? (r.amount / tvl) * 100 : 0,
      riskLTV: 0,
      associatedArks: r.arks,
    }))
    .sort((a, b) => b.amount - a.amount)

  const fleetMetrics: FleetMetric = {
    tvl,
    sharePrice,
    depositUtilization:
      Number(fleetData.depositCap) > 0
        ? (Number(fleetData.totalValueLockedUSD) / Number(fleetData.depositCap)) * 100
        : 0,
    bufferHealth: 100,
    tipRate: (Number(fleetData.tipRate) / 1e18) * 100,
    totalArks: activeArkAddresses.length,
  }

  return { fleetMetrics, arks: arkMetrics, collateralExposure }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ chainId: string }> | { chainId: string } },
) {
  try {
    // Handle Next.js 15+ where params might be a Promise
    const resolvedParams = await Promise.resolve(params)
    const { chainId } = resolvedParams

    if (!chainId) {
      return NextResponse.json({ error: 'chainId parameter is required' }, { status: 400 })
    }

    const chainIdNum = parseInt(chainId, 10)

    if (isNaN(chainIdNum)) {
      return NextResponse.json({ error: `Invalid chainId: ${chainId}` }, { status: 400 })
    }

    const url = new URL(request.url)
    const fleetId = url.searchParams.get('fleetId')

    const client = getSubgraphClient(chainIdNum)

    // Fetch fleet list
    const data = await client.request(GET_ALL_FLEETS_QUERY)

    // @ts-ignore
    const fleets = (data.vaults || []).map((vault: any) => ({
      id: vault.id,
      name: vault.name,
      totalValueLockedUSD: vault.totalValueLockedUSD,
      inputToken: {
        symbol: vault.inputToken?.symbol || 'Unknown',
      },
    }))

    // If fleetId is provided, also fetch detailed data
    let fleetDetails = null
    if (fleetId) {
      // Check cache
      const cacheKey = `${chainId}:${fleetId}`
      const now = Date.now()
      const cached = cache.get(cacheKey)

      if (cached && cached.expiry > now) {
        fleetDetails = cached.data
      } else {
        // Fetch detailed fleet data
        const fleetDataResponse = await client.request(GET_FLEET_QUERY, { id: fleetId })
        // @ts-ignore
        const fleetData = fleetDataResponse.vault as SubgraphVault

        if (fleetData) {
          fleetDetails = await fetchFleetDetails(chainIdNum, fleetId, fleetData)
          cache.set(cacheKey, { data: fleetDetails, expiry: now + TTL_MS })
        }
      }
    }

    return NextResponse.json({
      fleets,
      fleetDetails,
    })
  } catch (error) {
    console.error('Error fetching fleets:', error)
    return NextResponse.json({ error: 'Failed to fetch fleets' }, { status: 500 })
  }
}
