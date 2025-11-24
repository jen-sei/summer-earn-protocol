// Handlers
export { OriginOETHArk } from './OriginOETHArk'
export { OriginSuperOETHArk } from './OriginSuperOETHArk'
export { SiUSDArk } from './SiUSDArk'
export { SiloManagedVaultArk } from './SiloManagedVaultArk'
export { SyrupArk } from './SyrupArk'
export { AeraArk } from './AeraArk'
export { SparkLendArk } from './SparkLendArk'
export { SusdsArk } from './SusdsArk'
export { Psm3Ark } from './Psm3Ark'
export { PendlePTArk } from './PendlePTArk'
export { FluidVaultArk } from './FluidVaultArk'
export { AaveV3Ark } from './AaveV3Ark'
export { CompoundV3Ark } from './CompoundV3Ark'
export { StargateV2Ark } from './StargateV2Ark'
export { MoonwellArk } from './MoonwellArk'
export { MorphoArk } from './MorphoArk'

// Types
export type { CollateralResult, ArkHandler, CollateralMap, TokenDecimalsMap } from './types'

// Utilities
export {
  normalizeLTV,
  aggregateCollateral,
  collateralMapToArray,
  buildDecimalsCalls,
  consumeDecimalsResults,
} from './utils'
