import { loadConfig } from './lib.mjs'

const key = process.argv[2]
if (key === undefined || key.trim() === '') {
  process.stderr.write('usage: node config-value.mjs <dot.path>\n')
  process.exit(2)
}

let value = loadConfig()
for (const segment of key.split('.')) {
  if (value === null || typeof value !== 'object' || !(segment in value)) {
    process.stderr.write(`unknown product config key: ${key}\n`)
    process.exit(2)
  }
  value = value[segment]
}
if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
  process.stderr.write(`product config key is not scalar: ${key}\n`)
  process.exit(2)
}
process.stdout.write(`${String(value)}\n`)

