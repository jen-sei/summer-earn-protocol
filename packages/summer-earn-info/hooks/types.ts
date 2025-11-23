export type FleetMetric = {
  tvl: number
  sharePrice: number
  depositUtilization: number
  bufferHealth: number
  tipRate: number
  totalArks: number
}

export type ArkMetric = {
  id: string
  name: string
  allocation: number
  weight: number
  depositCap: number
  maxDepositPercentage: number
  maxRebalanceInflow: number
  maxRebalanceOutflow: number
  status: string // "buffer" | "active"
  apy: number
}

export type CollateralExposure = {
  asset: string
  amount: number
  percentage: number
  riskLTV: number
  associatedArks: string[]
}
