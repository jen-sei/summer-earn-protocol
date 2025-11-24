import type { Abi, Address, PublicClient } from 'viem'

/**
 * Description of a single on-chain call that belongs to one step of one task.
 *
 * Notes on typing:
 * - `abi` + `functionName` + `args` are intentionally *untyped* here (`unknown[]`).
 * - Type-safety is enforced at the call site when you build the `contracts`
 *   array for viem's `multicall`, e.g.:
 *
 *   const contracts = [
 *     {
 *       address: vault,
 *       abi: erc4626Abi,
 *       functionName: 'convertToAssets',
 *       args: [shares], // type-checked against `erc4626Abi` by viem
 *     } as const,
 *   ]
 *
 * This keeps the executor generic and simple while still allowing strong typing
 * where concrete ABIs are known.
 */
export interface StepCall {
  /** Logical key for this call within the task. Used to route results back. */
  key: string
  /** Target contract address. */
  target: Address
  /** ABI for the contract (used by viem). */
  abi: Abi
  /** Function name to call on the contract. */
  functionName: string
  /** Raw arguments for the call; validated at the viem call-site, not here. */
  args?: readonly unknown[]
}

export interface StepResult {
  key: string
  value: unknown
}

export interface MultistepTask<TResult> {
  /**
   * Highest step index this task will use (1-based).
   */
  maxStep: number

  /**
   * Build all calls needed for a given step.
   * Return an empty array if this task has nothing to do for the step.
   */
  buildStepCalls(step: number): StepCall[]

  /**
   * Consume results for a given step and update internal task state.
   */
  consumeStepResults(step: number, results: StepResult[]): void

  /**
   * Produce the final result for this task once all steps are processed.
   */
  finalize(): TResult
}

/**
 * Simple multi-step multicall executor for a single chain / client.
 *
 * Conceptually:
 * - Each `MultistepTask` is a small state machine with steps 1..maxStep.
 * - For each step, the task returns the calls it needs (`buildStepCalls`).
 * - The executor batches all calls from all tasks for that step into one
 *   `client.multicall` (vertical scaling).
 * - Results are routed back to tasks by `key` so they can update their
 *   internal context (`consumeStepResults`).
 * - After all steps, each task produces a final result via `finalize()`.
 *
 * Scope:
 * - Single chain / single `PublicClient` per call.
 * - No assumptions about what the result type is (`TResult` is generic).
 *
 * Usage:
 * - Define one or more `MultistepTask`s with `maxStep`, `buildStepCalls`,
 *   `consumeStepResults`, and `finalize`.
 * - Pass them, together with a viem `PublicClient`, to `runMultistepTasks`.
 */
export async function runMultistepTasks<TResult>(
  client: PublicClient,
  tasks: MultistepTask<TResult>[],
): Promise<TResult[]> {
  if (tasks.length === 0) return []

  const maxStep = tasks.reduce((max, task) => (task.maxStep > max ? task.maxStep : max), 0)

  for (let step = 1; step <= maxStep; step++) {
    const contracts: {
      address: Address
      abi: Abi
      functionName: string
      args?: readonly unknown[]
    }[] = []

    const mapping: { taskIndex: number; key: string }[] = []

    tasks.forEach((task, taskIndex) => {
      if (step > task.maxStep) return
      const calls = task.buildStepCalls(step)
      console.log('calls', calls)
      for (const call of calls) {
        contracts.push({
          address: call.target,
          abi: call.abi,
          functionName: call.functionName,
          args: call.args,
        })
        mapping.push({ taskIndex, key: call.key })
      }
    })

    if (contracts.length === 0) {
      continue
    }
    console.log(
      'calling multicall with',
      contracts.length,
      'contracts on network',
      client.chain!.name,
      'step',
      step,
    )
    const startTime = Date.now()
    const results = await client.multicall({
      // viem infers types from this tuple; we keep it simple for now.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      contracts: contracts as any,
      allowFailure: true,
      batchSize: 4 * 4096,
    })
    const endTime = Date.now()
    console.log('multicall took', endTime - startTime, 'ms')
    const perTaskResults = new Map<number, StepResult[]>()

    results.forEach((result, index) => {
      const { taskIndex, key } = mapping[index]
      let list = perTaskResults.get(taskIndex)
      if (!list) {
        list = []
        perTaskResults.set(taskIndex, list)
      }
      // When allowFailure=true, viem returns { status, result? } | { status, error }.
      // We skip failed calls but keep indexing aligned via the mapping array.

      if ((result as any).status === 'success') {
        list.push({
          key,

          value: (result as any).result,
        })
      }
    })

    perTaskResults.forEach((resultsForTask, taskIndex) => {
      tasks[taskIndex].consumeStepResults(step, resultsForTask)
    })
  }

  return tasks.map((task) => task.finalize())
}
