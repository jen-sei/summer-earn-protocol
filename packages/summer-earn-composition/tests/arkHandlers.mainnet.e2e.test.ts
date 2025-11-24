import { type Address } from 'viem'
import { describe, expect, it } from 'vitest'

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
import type { CollateralResult } from '../src/handlers/ark'

const MAINNET_RPC_URL = process.env.MAINNET_RPC_URL

// Real mainnet addresses (Nov 2025)
const OETH_VAULT = '0x39254033945AA2E4809Cc2977E7087BEE48bd7Ab' as Address
const SUPEROETH_VAULT = '0x57cb08bb2dc86c8ec7e1d7da10a62761c2e0d8ee' as Address
const SIUSD = '0xdBDC1Ef57537E34680B898E1FEBD3D68c7389bCB' as Address
const IUSD_VAULT = '0x48f9e38f3070AD8945DFEae3FA70987722E3D89c' as Address
const SILO_MANAGED_EXAMPLE = '0x5362D5086FDef73450145492a66F8EBF210c5B9C' as Address
const SYRUP_USDC = '0x643C4E15d7d62Ad0aBeC4a9BD4b001aA3Ef52d66' as Address
const SYRUP_USDT = '0xB7844e289d0b5a8a5A2E6fD0d7b40e9E6E26207a' as Address
const AERA_GAUNTLET_ALPHA = '0x47fe8Ab9eE47DD65c24df52324181790b9F47EfC' as Address
const SPARK_LENDING = '0x5a0b54d5dc17e0aadc383d2db43b0a0d3e029c4c' as Address
const USDS = '0xdC035D45d973E3EC169d2276DDab0642b175D9e0' as Address
const SUSDS = '0xa393473d9Ed3b3a13e2A72aA5dB3d2E7A0b5c7f9' as Address
const PSM_USDC = '0x02C3eA4e34C0cBd694D2adFa2c690EECbC1793eE' as Address
const PENDLE_STETH_MARKET = '0x1A6fCc85557BC4fB7B534ed835a03EF056552D52' as Address
const FLUID_LIQUIDITY_LAYER = '0x6f40d4a6237c257fff2db00fa0510deeecd303eb' as Address
const AAVE_V3_POOL = '0x87870Bca3F3fD6335C3f4Ce8392D69350b4fA4E2' as Address
const COMPOUND_V3_USDC = '0xc3d688B66703497DAA19211EEdff47f25384CdC3' as Address
const STARGATE_V2_USDC_POOL = '0xc026395860Db2d07ee33e05fE50ed7bD583189C7' as Address
const MOONWELL_COMPTROLLER_BASE = '0xfBb21d0380beE3312b33c4353c8936a0F13EF26C' as Address
const MORPHO_USDC_VAULT = '0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB' as Address

if (!MAINNET_RPC_URL) {
  describe('Ark handlers mainnet e2e', () => {
    it('skipped because MAINNET_RPC_URL is not set', () => {
      expect(true).toBe(true)
    })
  })
} else {
  describe('Ark handlers mainnet e2e', () => {
    // Helper function to validate collateral results
    function validateCollateralResults(results: CollateralResult[], minResults = 0) {
      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBeGreaterThanOrEqual(minResults)

      for (const result of results) {
        expect(result).toHaveProperty('token')
        expect(result).toHaveProperty('amount')
        expect(result).toHaveProperty('ltv')

        expect(typeof result.token).toBe('string')
        expect(result.token).toMatch(/^0x[0-9a-fA-F]{40}$/)
        expect(typeof result.amount).toBe('bigint')
        expect(result.amount).toBeGreaterThanOrEqual(0n)
        expect(typeof result.ltv).toBe('number')
        expect(result.ltv).toBeGreaterThanOrEqual(0)
        expect(result.ltv).toBeLessThanOrEqual(10000) // Max 100% (10000 basis points)
      }
    }

    describe('Origin OETH', () => {
      it('should extract collateral from Origin OETH vault', async () => {
        const results = await OriginOETHArk.getCollateral(OETH_VAULT)
        console.log(`Origin OETH: Found ${results.length} collateral assets`)
        validateCollateralResults(results)
        console.log(`Origin OETH: Found ${results.length} collateral assets`)
      })
    })

    describe('Origin Super OETH', () => {
      it('should extract collateral from Origin Super OETH vault', async () => {
        const results = await OriginSuperOETHArk.getCollateral(SUPEROETH_VAULT)
        console.log(`Origin Super OETH: Found ${results.length} collateral assets`)
        validateCollateralResults(results)
      })
    })

    describe('InfiniFi siUSD', () => {
      it('should extract collateral from siUSD vault', async () => {
        const results = await SiUSDArk.getCollateral(SIUSD)
        validateCollateralResults(results)
      })

      it('should extract collateral from IUSD vault', async () => {
        const results = await SiUSDArk.getCollateral(IUSD_VAULT)
        validateCollateralResults(results)
      })
    })

    describe('Silo Finance V2', () => {
      it('should extract collateral from Silo managed vault', async () => {
        const results = await SiloManagedVaultArk.getCollateral(SILO_MANAGED_EXAMPLE)
        validateCollateralResults(results)
      })
    })

    describe('Syrup by Maple', () => {
      it('should extract collateral from Syrup USDC vault', async () => {
        const results = await SyrupArk.getCollateral(SYRUP_USDC)
        validateCollateralResults(results)
      })

      it('should extract collateral from Syrup USDT vault', async () => {
        const results = await SyrupArk.getCollateral(SYRUP_USDT)
        validateCollateralResults(results)
      })
    })

    describe('Aera by Gauntlet', () => {
      it('should extract collateral from Aera vault', async () => {
        const results = await AeraArk.getCollateral(AERA_GAUNTLET_ALPHA)
        validateCollateralResults(results)
      })
    })

    describe('SparkLend (Sky Ecosystem)', () => {
      it('should extract collateral from SparkLend pool', async () => {
        const results = await SparkLendArk.getCollateral(SPARK_LENDING)
        validateCollateralResults(results)
      })
    })

    describe('sUSDS (Spark USD Savings)', () => {
      it('should extract collateral from sUSDS vault', async () => {
        const results = await SusdsArk.getCollateral(SUSDS)
        validateCollateralResults(results)
      })
    })

    describe('PSM (Peg Stability Module)', () => {
      it('should extract collateral from PSM USDC', async () => {
        const results = await Psm3Ark.getCollateral(PSM_USDC)
        validateCollateralResults(results)
      })
    })

    describe('Pendle PT', () => {
      it('should extract collateral from Pendle stETH market', async () => {
        const results = await PendlePTArk.getCollateral(PENDLE_STETH_MARKET)
        validateCollateralResults(results)
      })
    })

    describe('Fluid Vault', () => {
      it('should extract collateral from Fluid Liquidity Layer', async () => {
        const results = await FluidVaultArk.getCollateral(FLUID_LIQUIDITY_LAYER)
        validateCollateralResults(results)
      })
    })

    describe('Aave V3', () => {
      it('should extract collateral from Aave V3 pool', async () => {
        const results = await AaveV3Ark.getCollateral(AAVE_V3_POOL)
        validateCollateralResults(results)
      })
    })

    describe('Compound V3', () => {
      it('should extract collateral from Compound V3 Comet', async () => {
        const results = await CompoundV3Ark.getCollateral(COMPOUND_V3_USDC)
        validateCollateralResults(results)
      })
    })

    describe('Stargate V2', () => {
      it('should extract collateral from Stargate V2 USDC pool', async () => {
        const results = await StargateV2Ark.getCollateral(STARGATE_V2_USDC_POOL)
        validateCollateralResults(results)
      })
    })

    describe('Moonwell', () => {
      it('should extract collateral from Moonwell Comptroller', async () => {
        const results = await MoonwellArk.getCollateral(MOONWELL_COMPTROLLER_BASE)
        validateCollateralResults(results)
      })
    })

    describe('Morpho Vault', () => {
      it('should extract collateral from Morpho vault', async () => {
        const results = await MorphoArk.getCollateral(MORPHO_USDC_VAULT)
        validateCollateralResults(results)
      })
    })

    describe('Batch testing', () => {
      it('should handle multiple vaults in parallel', async () => {
        const promises = [
          OriginOETHArk.getCollateral(OETH_VAULT),
          SiUSDArk.getCollateral(SIUSD),
          SyrupArk.getCollateral(SYRUP_USDC),
          AaveV3Ark.getCollateral(AAVE_V3_POOL),
        ]

        const results = await Promise.all(promises)

        expect(results).toHaveLength(4)
        for (const result of results) {
          validateCollateralResults(result)
        }
      })
    })

    describe('Error handling', () => {
      it('should handle invalid addresses gracefully', async () => {
        const invalidAddress = '0x0000000000000000000000000000000000000000' as Address

        // Some handlers might throw, others might return empty arrays
        // We test that they don't crash the test suite
        try {
          const results = await OriginOETHArk.getCollateral(invalidAddress)
          // If it doesn't throw, it should return an array (possibly empty)
          expect(Array.isArray(results)).toBe(true)
        } catch (error) {
          // If it throws, that's also acceptable - the error should be meaningful
          expect(error).toBeInstanceOf(Error)
        }
      })
    })
  })
}
