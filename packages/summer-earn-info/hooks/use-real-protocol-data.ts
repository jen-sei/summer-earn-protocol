import { useQuery } from '@tanstack/react-query'
import { FleetMetric, ArkMetric, CollateralExposure } from './types'
import { DEFAULT_NETWORK_ID } from '../config/networks'

const DEFAULT_FLEET: FleetMetric = {
  tvl: 0,
  sharePrice: 0,
  depositUtilization: 0,
  bufferHealth: 0,
  tipRate: 0,
  totalArks: 0,
}

export type FleetSummary = {
  id: string
  name: string
  totalValueLockedUSD: string
  inputToken: { symbol: string }
}

export function useRealProtocolData(
  chainId: number = DEFAULT_NETWORK_ID,
  selectedFleetId?: string,
) {
  // Single query that fetches both fleet list and details
  const { data, isLoading } = useQuery({
    queryKey: ['fleets', chainId, selectedFleetId],
    queryFn: async () => {
      const url = `/api/fleets/${chainId}${selectedFleetId ? `?fleetId=${selectedFleetId}` : ''}`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to fetch fleets')
      return await res.json()
    },
  })

  const fleets = data?.fleets || []
  const fleetId = selectedFleetId || fleets?.[0]?.id
  const fleetDetails = data?.fleetDetails

  return {
    availableFleets: fleets,
    selectedFleetId: fleetId,
    fleetMetrics: fleetDetails?.fleetMetrics || DEFAULT_FLEET,
    arks: fleetDetails?.arks || [],
    collateralExposure: fleetDetails?.collateralExposure || [],
    isLoading,
    isError: false,
  }
}
