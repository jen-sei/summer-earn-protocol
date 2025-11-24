import { type Address } from 'viem'

import { type MultistepTask } from '../../multistepMulticall'

/**
 * Standardized collateral result format.
 * All Ark handlers return this format.
 */
export type CollateralResult = {
  token: string
  amount: bigint
  ltv: number // 4 decimals, e.g. 8050 = 80.50%
}

/**
 * Standard Ark handler interface.
 * All handlers must implement this interface.
 */
export interface ArkHandler {
  readonly name: string
  /**
   * Build a multistep task for resolving collateral.
   * This allows aggregating multiple handlers into a single multicall execution.
   */
  buildTask(address: string, ...args: unknown[]): MultistepTask<CollateralResult[]>
  /**
   * Execute the handler and return collateral results.
   * Internally uses buildTask and runs it with a client.
   */
  getCollateral(address: string, ...args: unknown[]): Promise<CollateralResult[]>
}

/**
 * Internal collateral aggregation map.
 * Used during finalize() to aggregate amounts and LTVs by token.
 */
export type CollateralMap = Map<string, { amount: bigint; ltv: number }>

/**
 * Common context pattern: token decimals cache.
 * Most handlers track decimals for all tokens encountered.
 */
export type TokenDecimalsMap = Map<Address, number>
