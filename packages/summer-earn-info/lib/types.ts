export interface FleetMetric {
  tvl: number
  sharePrice: number
  depositUtilization: number
  bufferHealth: number
  tipRate: number
  totalArks: number
}

export interface ArkMetric {
  id: string
  name: string
  allocation: number // in USD
  weight: number // percentage
  depositCap: number
  maxDepositPercentage: number
  maxRebalanceInflow: number
  maxRebalanceOutflow: number
  status: "active" | "inactive" | "buffer"
  apy: number
}

export interface CollateralExposure {
  asset: string
  amount: number // in USD
  percentage: number
  riskLTV: number
  associatedArks: string[] // Ark IDs
}

export interface MarketRisk {
  marketName: string
  collateralAsset: string
  supplyQueueIndex: number
  ltv: number
  allocation: number
}
