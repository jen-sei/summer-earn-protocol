# Ark Handlers

Multi-step content-based multicall solvers for extracting real underlying collateral from complex DeFi vaults.

## Architecture

All Ark handlers follow a consistent pattern:

1. **Multi-step multicall discovery** - Dynamically discover vault structure
2. **Batch asset fetching** - Efficiently fetch per-asset amounts
3. **LTV extraction** - Fetch loan-to-value ratios for each collateral
4. **Aggregation** - Dedupe by token, sum amounts, take max/weighted LTV
5. **Standardized output** - Return `CollateralResult[]`

## Common Types

### `CollateralResult`
```typescript
{
  token: string      // Lowercase address
  amount: bigint     // Raw token units (not USD, not shares)
  ltv: number        // 4 decimals, e.g. 8050 = 80.50%
}
```

### `ArkHandler` Interface
```typescript
interface ArkHandler {
  readonly name: string
  getCollateral(address: string, ...args: unknown[]): Promise<CollateralResult[]>
}
```

## Shared Utilities

### `normalizeLTV(ltvRaw, defaultLtv?)`
Converts LTV from various formats (wei, basis points) to standardized format.

### `aggregateCollateral(map, token, amount, ltv)`
Aggregates collateral into a map, summing amounts and taking max LTV per token.

### `collateralMapToArray(map)`
Converts collateral map to standardized array format.

### `buildDecimalsCalls(tokens)`
Builds calls to fetch decimals for a set of tokens (common step 4 pattern).

### `consumeDecimalsResults(results, decimalsMap)`
Consumes decimals results from step results (common step 4 pattern).

## Handler Pattern

Each handler follows this structure:

```typescript
export const [Protocol]Ark: ArkHandler = {
  name: 'Protocol Name',
  
  async getCollateral(address: string): Promise<CollateralResult[]> {
    const client = createPublicClient({ chain, transport: http() })
    const task = buildTask({ vault: address as Address })
    const [resolution] = await runMultistepTasks(client, [task])
    return resolution
  },
}
```

## Available Handlers

- `OriginOETHArk` - Origin OETH vault (Ethereum)
- `OriginSuperOETHArk` - Origin Super OETH vault (Base)
- `SiUSDArk` - InfiniFi siUSD/IUSD vaults
- `SiloManagedVaultArk` - Silo Finance V2 managed vaults
- `SyrupArk` - Syrup by Maple
- `AeraArk` - Aera by Gauntlet
- `SparkLendArk` - SparkLend Pool
- `SusdsArk` - sUSDS (Spark USD Savings)
- `Psm3Ark` - PSM (Peg Stability Module)
- `PendlePTArk` - Pendle PT markets
- `FluidVaultArk` - Fluid vaults & Liquidity Layer
- `AaveV3Ark` - Aave V3 Pool
- `CompoundV3Ark` - Compound V3 Comet
- `StargateV2Ark` - Stargate V2 pools
- `MoonwellArk` - Moonwell Comptroller (Base)
- `MorphoArk` - Morpho vaults

## Usage

```typescript
import { OriginOETHArk } from './handlers/ark'

const collateral = await OriginOETHArk.getCollateral('0x...')
// Returns: [{ token: '0x...', amount: 1000000000000000000n, ltv: 8500 }]
```

## Refactoring Opportunities

Handlers can be refactored to use shared utilities:

- Replace manual `collateralMap` creation with `new Map<string, { amount: bigint; ltv: number }>()`
- Replace manual aggregation with `aggregateCollateral()`
- Replace manual array conversion with `collateralMapToArray()`
- Replace manual LTV conversion with `normalizeLTV()`
- Replace manual decimals fetching with `buildDecimalsCalls()` and `consumeDecimalsResults()`

