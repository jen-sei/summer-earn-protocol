import { NextResponse } from 'next/server'
import { getSubgraphClient, GET_FLEET_QUERY, SubgraphVault } from '@/hooks/subgraph'
import { getPublicClient } from '@/hooks/client'
import { resolveMorphoVaultsBulk, MorphoVaultResolution } from '@summerfi/summer-earn-composition'
import { Address, formatUnits, getAddress } from 'viem'
import { FLEET_COMMANDER_ABI, ARK_ABI, MORPHO_VAULT_ARK_ABI } from '@/hooks/abis'
import { FleetMetric, ArkMetric, CollateralExposure } from '@/hooks/types'

const TTL_MS = 30 * 1000 // 30 seconds cache
const cache = new Map<string, { data: unknown; expiry: number }>()

export async function GET(
  request: Request,
  { params }: { params: { chainId: string; fleetId: string } },
) {
  try {
    const { chainId, fleetId } = params
    const chainIdNum = parseInt(chainId, 10)

    // Check cache
    const cacheKey = `${chainId}:${fleetId}`
    const now = Date.now()
    const cached = cache.get(cacheKey)
    if (cached && cached.expiry > now) {
      return NextResponse.json(cached.data)
    }

    const client = getSubgraphClient(chainIdNum)
    const publicClient = getPublicClient(chainIdNum)

    // 1. Get Fleet Data from Subgraph
    const data = await client.request(GET_FLEET_QUERY, { id: fleetId })
    // @ts-ignore
    const fleetData = data.vault as SubgraphVault

    if (!fleetData) {
      return NextResponse.json({ error: 'Fleet not found' }, { status: 404 })
    }

    const fleetAddress = getAddress(fleetData.id)

    // 2. Fetch Fleet On-Chain Data
    const fleetContract = {
      address: fleetAddress,
      abi: FLEET_COMMANDER_ABI,
    }

    const [totalAssets, totalSupply, activeArks, bufferArkRes] = await publicClient.multicall({
      contracts: [
        { ...fleetContract, functionName: 'totalAssets' },
        { ...fleetContract, functionName: 'totalSupply' },
        { ...fleetContract, functionName: 'getActiveArks' },
        { ...fleetContract, functionName: 'bufferArk' },
      ],
      allowFailure: false,
    })

    const sharePrice = totalSupply === BigInt(0) ? 1 : Number(totalAssets) / Number(totalSupply)
    const tvl = Number(formatUnits(totalAssets, fleetData.inputToken.decimals))
    const realBufferArkAddress = bufferArkRes as Address

    const activeArkAddresses = activeArks as Address[]

    // Phase 1: Get Basic Ark Data
    const arkCalls = activeArkAddresses.flatMap((ark) => [
      { address: ark, abi: ARK_ABI, functionName: 'totalAssets' },
      { address: ark, abi: ARK_ABI, functionName: 'getConfig' },
    ])

    const arkResults = await publicClient.multicall({
      contracts: arkCalls,
      allowFailure: true,
    })

    const arksMeta = activeArkAddresses.map((address, i) => {
      const assetsRes = arkResults[i * 2]
      const configRes = arkResults[i * 2 + 1]

      const totalAssets = assetsRes.status === 'success' ? (assetsRes.result as bigint) : 0n
      // @ts-ignore
      const config =
        configRes.status === 'success' ? configRes.result : { name: 'Unknown', details: '' }

      const isBuffer = address === realBufferArkAddress
      const name = config.name || (isBuffer ? 'Buffer Ark' : 'Unknown Ark')
      let protocol = 'unknown'
      if (isBuffer) protocol = 'buffer'
      else if (name.toLowerCase().includes('morpho')) protocol = 'morpho'

      return {
        address,
        name,
        protocol,
        totalAssets,
        assetsNum: Number(formatUnits(totalAssets, fleetData.inputToken.decimals)),
      }
    })

    // Phase 2: Fetch MetaMorpho Addresses
    const morphoArks = arksMeta.filter((a) => a.protocol === 'morpho')
    const metaMorphoCalls = morphoArks.map((a) => ({
      address: a.address,
      abi: MORPHO_VAULT_ARK_ABI,
      functionName: 'metaMorpho',
    }))

    const metaMorphoResults = await publicClient.multicall({
      contracts: metaMorphoCalls,
      allowFailure: true,
    })

    const vaultAddressMap = new Map<Address, Address>()
    const vaultsToResolve = new Set<Address>()

    morphoArks.forEach((ark, i) => {
      if (metaMorphoResults[i].status === 'success') {
        const vault = metaMorphoResults[i].result as Address
        vaultAddressMap.set(ark.address, vault)
        vaultsToResolve.add(vault)
      }
    })

    // Phase 3: Bulk Resolve Morpho Vaults
    const uniqueVaults = Array.from(vaultsToResolve)
    let morphoResolutions: MorphoVaultResolution[] = []

    if (uniqueVaults.length > 0) {
      try {
        morphoResolutions = await resolveMorphoVaultsBulk({
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

    const payload = {
      fleetMetrics,
      arks: arkMetrics,
      collateralExposure,
    }

    // Cache the result
    cache.set(cacheKey, { data: payload, expiry: now + TTL_MS })

    return NextResponse.json(payload)
  } catch (error) {
    console.error('Error fetching fleet data:', error)
    return NextResponse.json({ error: 'Failed to fetch fleet data' }, { status: 500 })
  }
}
