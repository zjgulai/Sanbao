import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const [app, plan] = process.argv.slice(2)
if (app === undefined || plan === undefined) {
  process.stderr.write('usage: node validate-signing-plan.mjs <Sage.app> <signing-plan.tsv>\n')
  process.exit(2)
}

try {
  const generator = fileURLToPath(new URL('./signing-plan.mjs', import.meta.url))
  const expected = execFileSync(process.execPath, [generator, app], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const observed = readFileSync(plan, 'utf8')
  if (observed !== expected) throw new Error('signing plan does not exactly match the current app inventory')
  const lines = observed.split('\n')
  if (lines.at(-1) !== '') throw new Error('signing plan must end with one newline')
  lines.pop()
  if (lines.length === 0 || lines.at(-1) !== 'app\t.') {
    throw new Error('signing plan must terminate at the outer app')
  }
  for (const line of lines) {
    const fields = line.split('\t')
    if (fields.length !== 2 || !['mach-o', 'framework', 'helper', 'app'].includes(fields[0])) {
      throw new Error(`invalid signing plan row: ${JSON.stringify(line)}`)
    }
  }
  process.stdout.write('[sage-packaging] signing plan verified against candidate inventory\n')
} catch (error) {
  process.stderr.write(`[sage-packaging] ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
