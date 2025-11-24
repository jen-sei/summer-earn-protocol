import { type Address, erc20Abi } from 'viem'
import { type Abi } from 'viem'

import type { CollateralMap, CollateralResult } from './types'

/**
 * Convert LTV from various formats to our standardized format (basis points × 100).
 *
 * Handles:
 * - Wei format (e.g., 0.8e18 = 80% → 8000)
 * - Basis points (e.g., 8000 = 80% → 8000)
 * - Already in our format (e.g., 8050 = 80.50%)
 *
 * @param ltvRaw - Raw LTV value from contract
 * @param defaultLtv - Default LTV if conversion fails (default: 7500 = 75%)
 * @returns LTV in our format (4 decimals, e.g., 8050 = 80.50%)
 */
export function normalizeLTV(ltvRaw: bigint | undefined, defaultLtv = 7500): number {
  if (ltvRaw === undefined || ltvRaw === 0n) {
    return defaultLtv
  }

  // If > 10000, likely in wei format (e.g., 0.8e18)
  if (ltvRaw > 10000n) {
    return Number((ltvRaw * 10000n) / 10n ** 18n)
  }

  // Otherwise assume it's already in basis points
  return Number(ltvRaw)
}

/**
 * Aggregate collateral into a map, summing amounts and taking max LTV per token.
 *
 * @param map - The collateral map to update
 * @param token - Token address (will be lowercased)
 * @param amount - Amount to add
 * @param ltv - LTV for this token
 */
export function aggregateCollateral(
  map: CollateralMap,
  token: Address | string,
  amount: bigint,
  ltv: number,
): void {
  if (amount === 0n) {
    return
  }

  const tokenLower = typeof token === 'string' ? token.toLowerCase() : token.toLowerCase()
  const existing = map.get(tokenLower) || { amount: 0n, ltv: 0 }
  map.set(tokenLower, {
    amount: existing.amount + amount,
    ltv: Math.max(existing.ltv, ltv),
  })
}

/**
 * Convert collateral map to standardized array format.
 *
 * @param map - The collateral map
 * @returns Array of CollateralResult
 */
export function collateralMapToArray(map: CollateralMap): CollateralResult[] {
  return Array.from(map.entries()).map(([token, data]) => ({
    token,
    amount: data.amount,
    ltv: data.ltv,
  }))
}

/**
 * Build calls to fetch decimals for a set of tokens.
 * Common pattern used in step 4 of most handlers.
 *
 * @param tokens - Set of token addresses
 * @returns Array of StepCall-like objects for fetching decimals
 */
export function buildDecimalsCalls(tokens: Set<Address> | Address[]): Array<{
  key: string
  target: Address
  abi: Abi
  functionName: string
}> {
  const uniqueTokens = Array.from(tokens instanceof Set ? tokens : new Set(tokens))
  return uniqueTokens.map((token) => ({
    key: `decimals_${token}`,
    target: token,
    abi: erc20Abi as Abi,
    functionName: 'decimals',
  }))
}

/**
 * Consume decimals results from step results.
 * Common pattern used in step 4 of most handlers.
 *
 * @param results - Step results from multicall
 * @param decimalsMap - Map to populate with token decimals
 */
export function consumeDecimalsResults(
  results: Array<{ key: string; value: unknown }>,
  decimalsMap: Map<Address, number>,
): void {
  for (const result of results) {
    if (result.key.startsWith('decimals_')) {
      const token = result.key.replace('decimals_', '') as Address
      decimalsMap.set(token, result.value as number)
    }
  }
}
