/**
 * Source-level mutation harness for the criterion modules.
 *
 * Why it exists: this repository has caught the same failure four times — an
 * assertion that stays green after the thing it is supposed to guard is deleted
 * (「断言恒真 = 没断言」). A test that reads the page and finds 「未标注」 proves the
 * page said it; it does **not** prove the test would notice if the page stopped.
 * So each criterion ships with its own mutation: take the real source, break
 * exactly the line the criterion rests on, run the broken copy, and show that
 * the criterion's own assertion flips.
 *
 * Mechanics: the mutated copy is transpiled with the package's own `typescript`
 * (already a devDependency), written to a private temp directory together with
 * a one-off runner, and executed by a **real Node process**. Two reasons for the
 * child process rather than an in-process `import`:
 *
 *   - the test runner resolves dynamic imports through Vite, which refuses a
 *     file outside the project root ("Failed to load url … Does the file
 *     exist?"), and its `vm` context has no dynamic-import callback for
 *     eval'd code either;
 *   - more importantly, the mutant should be exercised by the interpreter that
 *     runs the product, not by the transform pipeline that runs the tests.
 *
 * The repository working tree is never touched: mutating in place would race
 * the other spec files, which run in parallel forks.
 *
 * The harness enforces two things rather than trusting them:
 *   1. every replacement must match **exactly once** — otherwise a mutation that
 *      silently matched nothing produces a copy identical to the original and a
 *      green "the test has teeth" claim (the real `--mutate` defect in
 *      `run_phase6_gates.py`, where the anchor text occurred twice and only the
 *      print branch was patched);
 *   2. the runner's exit code is checked, so a mutant that throws is a failure
 *      rather than an unparsed empty result.
 * @module dsh-algo-skills-local/tests/mutate
 */

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import ts from 'typescript'

/** One literal source replacement. */
export type Mutation = readonly [from: string, to: string]

/** A mutation run, and its cleanup. */
export interface MutationRun {
  /** JSON-parsed stdout of the runner. */
  result: unknown
  /** Raw stdout, for a failure message. */
  stdout: string
  /** Temp directory holding the mutant; removed by {@link MutationRun.dispose}. */
  dir: string
  dispose(): void
}

/**
 * Run a mutated copy of one source file in a child Node process.
 *
 * `runner` is the body of an ESM module that imports the mutant as
 * `./mutant.mjs` and prints one line of JSON. Only `import type` is allowed in
 * the mutated file (it is erased by the transpiler); a runtime import would need
 * a mirrored directory tree, and this harness deliberately does not pretend to
 * provide one.
 * @param absSource - absolute path of the source file to mutate.
 * @param mutations - literal `[from, to]` pairs, each required to occur once.
 * @param runner - ESM source that `import`s `./mutant.mjs` and prints JSON.
 * @returns the runner's parsed output, plus its temp directory and disposer.
 * @throws when an anchor does not occur exactly once, when the source has a
 *   runtime import, or when the child process fails.
 */
export function runMutant(
  absSource: string,
  mutations: readonly Mutation[],
  runner: string,
): MutationRun {
  const original = readFileSync(absSource, 'utf8')
  let mutated = original
  for (const [from, to] of mutations) {
    const occurrences = mutated.split(from).length - 1
    if (occurrences !== 1) {
      throw new Error(
        `mutation anchor must occur exactly once in ${basename(absSource)}, found ${String(occurrences)}: ${JSON.stringify(from.slice(0, 60))}`,
      )
    }
    mutated = mutated.replace(from, to)
  }
  if (mutated === original) throw new Error(`mutation changed nothing in ${basename(absSource)}`)
  for (const line of mutated.split('\n')) {
    if (/^\s*import\s+(?!type\b)/u.test(line)) {
      throw new Error(`${basename(absSource)} has a runtime import; the mutant cannot be loaded standalone: ${line.trim()}`)
    }
  }

  const transpiled = ts.transpileModule(mutated, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: absSource,
  })
  const dir = mkdtempSync(join(tmpdir(), 'algo-skills-mutant-'))
  writeFileSync(join(dir, 'mutant.mjs'), transpiled.outputText, 'utf8')
  writeFileSync(join(dir, 'runner.mjs'), runner, 'utf8')
  const child = spawnSync(process.execPath, [join(dir, 'runner.mjs')], { encoding: 'utf8' })
  if (child.status !== 0) {
    rmSync(dir, { recursive: true, force: true })
    throw new Error(`mutant runner failed (exit ${String(child.status)}):\n${child.stderr}`)
  }
  const stdout = child.stdout.trim()
  return {
    result: JSON.parse(stdout) as unknown,
    stdout,
    dir,
    dispose: () => { rmSync(dir, { recursive: true, force: true }) },
  }
}
