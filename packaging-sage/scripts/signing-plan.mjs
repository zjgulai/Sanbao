import { existsSync, lstatSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { assertDirectory, loadConfig, nativeBinaryKind, walkTree } from './lib.mjs'

const app = process.argv[2]
if (app === undefined) {
  process.stderr.write('usage: node signing-plan.mjs <Sage.app>\n')
  process.exit(2)
}

function depth(path) {
  return path.split('/').length
}

function safeRelativePath(path, label) {
  if (path === '' || path.startsWith('/') || /[\u0000-\u001f\u007f]/u.test(path)
    || path.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error(`${label} produced an unsafe signing path: ${JSON.stringify(path)}`)
  }
  return path
}

function isMachO(path) {
  return nativeBinaryKind(path) === 'mach-o'
}

function findBundles(root, searchRoot, suffix) {
  const rows = []
  const visit = (path) => {
    for (const name of readdirSync(path).sort()) {
      const absolute = join(path, name)
      const entry = lstatSync(absolute)
      if (entry.isSymbolicLink()) continue
      if (!entry.isDirectory()) continue
      if (name.endsWith(suffix)) {
        rows.push(safeRelativePath(relative(root, absolute).split(sep).join('/'), `${suffix} bundle discovery`))
      }
      else visit(absolute)
    }
  }
  visit(searchRoot)
  return rows
}

try {
  loadConfig()
  const root = assertDirectory(app, 'Sage app')
  const rows = walkTree(root)
  const machos = rows
    .filter((row) => row.kind === 'file' && isMachO(row.absolute))
    .map((row) => safeRelativePath(row.relative, 'Mach-O discovery'))
    .sort((left, right) => depth(right) - depth(left) || left.localeCompare(right))
  const frameworksRoot = join(root, 'Contents', 'Frameworks')
  const frameworks = existsSync(frameworksRoot)
    ? findBundles(root, frameworksRoot, '.framework').sort((left, right) => depth(right) - depth(left) || left.localeCompare(right))
    : []
  const helpers = existsSync(frameworksRoot)
    ? findBundles(root, frameworksRoot, '.app').sort((left, right) => depth(right) - depth(left) || left.localeCompare(right))
    : []
  const emitted = [...machos, ...frameworks, ...helpers]
  if (new Set(emitted).size !== emitted.length) throw new Error('signing plan contains duplicate targets')
  for (const path of machos) process.stdout.write(`mach-o\t${path}\n`)
  for (const path of frameworks) process.stdout.write(`framework\t${path}\n`)
  for (const path of helpers) process.stdout.write(`helper\t${path}\n`)
  process.stdout.write('app\t.\n')
} catch (error) {
  process.stderr.write(`[sage-packaging] ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
