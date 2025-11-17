import { registerHandler } from '../registry'
import { Erc20TokenHandler } from './erc20Token'
import { Erc4626VaultHandler } from './erc4626Vault'
import { StakedStablesHandler } from './stakedStables'

let builtInHandlersRegistered = false

export function registerBuiltInHandlers(): void {
  if (builtInHandlersRegistered) return
  builtInHandlersRegistered = true

  registerHandler(new Erc4626VaultHandler())
  registerHandler(new StakedStablesHandler())
  registerHandler(new Erc20TokenHandler())
}
