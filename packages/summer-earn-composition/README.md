## @summerfi/summer-earn-composition

**Goal:** given a Summer Earn product (e.g. sDAI, Morpho vault share, Pendle PT/LP),
return its on-chain composition: underlying tokens and amounts.

### High-level API

```ts
import { getProductComposition, type ProductDescriptor } from '@summerfi/summer-earn-composition'

const product: ProductDescriptor = {
  chainId: 1,
  protocol: 'Morpho',
  positionToken: '0x...',
}

const composition = await getProductComposition({
  product,
  owner: '0xUser...',
})
```

### Design notes

- **Protocols** mirror the configuration in `@summerfi/summer-earn-rates-subgraph`.
- **Types** are generic enough to handle:
  - single-token wrappers (e.g. sDAI → DAI),
  - vault-style tokens (e.g. ERC-4626, Morpho vaults),
  - structured positions (e.g. Pendle PT / LP with deposited + yield token),
  - protocol-specific multi-market compositions (e.g. Morpho markets).
- **Handlers**:
  - A `ProtocolHandler` is registered per protocol/product family.
  - Each handler uses `viem` to query the necessary on-chain state and
    returns a `ProductComposition`.

### Multistep multicall executor

For vertical scaling across many products on one chain, the package exposes a
small step-based multicall executor:

- **`MultistepTask<TResult>`**:
  - `maxStep`: highest step index this task will use (1-based).
  - `buildStepCalls(step)`: returns the calls needed for a given step.
  - `consumeStepResults(step, results)`: receives results for that step and
    updates internal state.
  - `finalize()`: produces the final `TResult` once all steps are processed.
- **`runMultistepTasks(client, tasks)`**:
  - Iterates `step = 1..maxStep`.
  - Collects all calls for that step from every task.
  - Executes a single `client.multicall({ contracts })`.
  - Routes results back to tasks by `key`.

Example (two-step ERC4626 pipeline, simplified):

```ts
const task: MultistepTask<ProductComposition> = {
  maxStep: 2,
  buildStepCalls(step) {
    if (step === 1) {
      return [{ key: 'totalAssets', target: vault, abi: erc4626Abi, functionName: 'totalAssets' }]
    }
    if (step === 2) {
      return [{ key: 'asset', target: vault, abi: erc4626Abi, functionName: 'asset' }]
    }
    return []
  },
  consumeStepResults(step, results) {
    // update local context based on `results`
  },
  finalize() {
    // return a ProductComposition
  },
}

const results = await runMultistepTasks(client, [task])
```

`StepCall.args` are intentionally untyped in the executor; they are validated
where you build the `contracts` array for `viem`'s `multicall`, using concrete
ABIs (see tests under `tests/` for live examples).

### Next steps / TODO

- Implement concrete handlers:
  - sDAI / staked stables
  - Morpho vaults → underlying markets
  - Pendle PT / LP → deposited token and balances
  - Aave, Compound, Euler, etc. as needed
- Wire handlers to the `summer-earn-rates-subgraph` configuration so
  product descriptors can be derived automatically.



