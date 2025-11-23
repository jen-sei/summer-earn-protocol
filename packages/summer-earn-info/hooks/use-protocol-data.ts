import type { FleetMetric, ArkMetric, CollateralExposure } from '@/lib/types'

// Mock Data Generator
// In a real app, this would use wagmi/viem to fetch from contracts

const MOCK_FLEET_DATA: FleetMetric = {
  tvl: 12500000, // $12.5M
  sharePrice: 1.045,
  depositUtilization: 82.5, // %
  bufferHealth: 95.0, // %
  tipRate: 0.05, // 5%
  totalArks: 4,
}

const MOCK_ARKS_DATA: ArkMetric[] = [
  {
    id: 'buffer-ark',
    name: 'Liquid Buffer',
    allocation: 1250000,
    weight: 10,
    depositCap: 2000000,
    maxDepositPercentage: 20,
    maxRebalanceInflow: 500000,
    maxRebalanceOutflow: 1000000,
    status: 'buffer',
    apy: 3.2,
  },
  {
    id: 'ark-morpho-wbtc',
    name: 'Morpho Blue / WBTC',
    allocation: 5625000,
    weight: 45,
    depositCap: 10000000,
    maxDepositPercentage: 50,
    maxRebalanceInflow: 1000000,
    maxRebalanceOutflow: 2000000,
    status: 'active',
    apy: 8.5,
  },
  {
    id: 'ark-morpho-eth',
    name: 'Morpho Blue / wstETH',
    allocation: 3750000,
    weight: 30,
    depositCap: 8000000,
    maxDepositPercentage: 40,
    maxRebalanceInflow: 800000,
    maxRebalanceOutflow: 1500000,
    status: 'active',
    apy: 6.8,
  },
  {
    id: 'ark-idle-usdc',
    name: 'Idle USDC Strategy',
    allocation: 1875000,
    weight: 15,
    depositCap: 5000000,
    maxDepositPercentage: 25,
    maxRebalanceInflow: 500000,
    maxRebalanceOutflow: 1000000,
    status: 'active',
    apy: 4.5,
  },
]

const MOCK_COLLATERAL_DATA: CollateralExposure[] = [
  {
    asset: 'WBTC',
    amount: 5625000,
    percentage: 45,
    riskLTV: 75,
    associatedArks: ['ark-morpho-wbtc'],
  },
  {
    asset: 'wstETH',
    amount: 3750000,
    percentage: 30,
    riskLTV: 80,
    associatedArks: ['ark-morpho-eth'],
  },
  {
    asset: 'USDC (Cash)',
    amount: 1250000,
    percentage: 10,
    riskLTV: 0,
    associatedArks: ['buffer-ark'],
  },
  {
    asset: 'Treasury Bills',
    amount: 1875000,
    percentage: 15,
    riskLTV: 0,
    associatedArks: ['ark-idle-usdc'],
  },
]

export function useProtocolData() {
  // Simulate data fetching delay if needed, but for now return directly
  const fleetMetrics = MOCK_FLEET_DATA
  const arks = MOCK_ARKS_DATA
  const collateralExposure = MOCK_COLLATERAL_DATA

  const isLoading = false
  const isError = false

  return {
    fleetMetrics,
    arks,
    collateralExposure,
    isLoading,
    isError,
  }
}
