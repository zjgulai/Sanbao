import { createHash } from 'node:crypto'
import {
  closeSync,
  createReadStream,
  existsSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  readlinkSync,
  realpathSync,
} from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const packagingRoot = fileURLToPath(new URL('../', import.meta.url))
export const configPath = join(packagingRoot, 'product.json')

const DEVELOPMENT_DIRECTORY_NAMES = new Set([
  '.changeset',
  '.circleci',
  '.github',
  '.gitlab',
  '__tests__',
  'benchmark',
  'benchmarks',
  'coverage',
  'doc',
  'docs',
  'example',
  'examples',
  'script',
  'scripts',
  'src',
  'test',
  'tests',
])

/** Production dependency inputs are executable bytes and runtime assets, not source, tests,
 *  repository automation, declarations, source maps, or package prose. Licences and notices are
 *  deliberately retained. */
export function isDevelopmentArtifactPath(relativePath, kind = 'file') {
  const parts = relativePath.split('/')
  if (parts.some(part => DEVELOPMENT_DIRECTORY_NAMES.has(part.toLowerCase()))) return true
  if (kind !== 'file') return false
  const name = parts.at(-1) ?? ''
  if (/^(?:licen[cs]e|notice|copying)(?:\.|$)/iu.test(name)) return false
  return /\.(?:[cm]?ts|tsx|map|md|markdown)$/iu.test(name)
    || /^(?:readme|changelog|history|contributing|security)(?:\.|$)/iu.test(name)
}

/** Product-owned payloads must stay release-only, while a retained third-party package keeps the
 * complete content published by that package. Package authors may legitimately use `src/`,
 * `scripts/`, TypeScript, source maps, or prose as runtime inputs; a generic directory-name prune
 * cannot distinguish those from development leftovers. */
export function isProductDevelopmentArtifactPath(relativePath, kind = 'file') {
  if (relativePath.split('/').includes('node_modules')) return false
  return isDevelopmentArtifactPath(relativePath, kind)
}

function object(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value
}

export function loadConfig() {
  const value = object(JSON.parse(readFileSync(configPath, 'utf8')), 'product config')
  const signing = object(value.signing, 'product config signing')
  const dmg = object(value.dmg, 'product config dmg')
  const requiredStrings = [
    ['productName', value.productName],
    ['bundleId', value.bundleId],
    ['version', value.version],
    ['build', value.build],
    ['arch', value.arch],
    ['distribution', value.distribution],
    ['electronVersion', value.electronVersion],
    ['icon', value.icon],
    ['signing.mode', signing.mode],
    ['signing.identityCommonName', signing.identityCommonName],
    ['dmg.format', dmg.format],
    ['dmg.volumeName', dmg.volumeName],
    ['dmg.fileName', dmg.fileName],
  ]
  for (const [label, item] of requiredStrings) {
    if (typeof item !== 'string' || item.trim() === '' || item !== item.trim()) {
      throw new Error(`${label} must be a nonempty trimmed string`)
    }
  }
  if (value.schemaVersion !== 1) throw new Error('product config schemaVersion must be 1')
  if (value.productName !== 'Sage') throw new Error('productName is fixed to Sage for this packaging namespace')
  if (value.bundleId !== 'com.lute.sage') throw new Error('bundleId is fixed to com.lute.sage')
  if (value.version !== '0.1.0' || value.build !== '1') throw new Error('version/build are fixed to 0.1.0/1')
  if (value.arch !== 'arm64' || value.distribution !== 'internal') throw new Error('this batch is arm64 internal only')
  if (signing.mode !== 'local-self-signed' || signing.identityCommonName !== 'Sage Local Code Signing') {
    throw new Error('this batch requires the Sage-specific local self-signed identity')
  }
  if (signing.hardenedRuntime !== false || signing.appSandbox !== false || signing.notarized !== false) {
    throw new Error('internal batch must keep hardened runtime, app sandbox, and notarization disabled')
  }
  if (dmg.format !== 'UDZO') throw new Error('internal DMG format is fixed to UDZO')
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.dmg$/u.test(dmg.fileName) || dmg.fileName.includes('..')) {
    throw new Error('dmg.fileName must be a safe .dmg basename')
  }
  if (/[\/\u0000-\u001f]/u.test(dmg.volumeName)) throw new Error('dmg.volumeName contains an unsafe character')
  if (isAbsolute(value.icon) || value.icon.includes('\\')
    || value.icon.split('/').some(part => part === '' || part === '.' || part === '..')) {
    throw new Error('icon must be a safe repository-relative path')
  }
  return Object.freeze(value)
}

export function assertDirectory(path, label) {
  if (!existsSync(path)) throw new Error(`${label} is missing: ${path}`)
  const entry = lstatSync(path)
  if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Error(`${label} must be a real directory: ${path}`)
  return realpathSync(path)
}

export function assertRegularFile(path, label) {
  if (!existsSync(path)) throw new Error(`${label} is missing: ${path}`)
  const entry = lstatSync(path)
  if (entry.isSymbolicLink() || !entry.isFile()) throw new Error(`${label} must be a regular file: ${path}`)
  return path
}

export function assertInside(root, target, label = 'path') {
  const canonicalRoot = realpathSync(root)
  const canonicalTarget = realpathSync(target)
  const distance = relative(canonicalRoot, canonicalTarget)
  if (distance === '..' || distance.startsWith(`..${sep}`) || isAbsolute(distance)) {
    throw new Error(`${label} escapes its root: ${target}`)
  }
}

export function walkTree(root) {
  const canonicalRoot = assertDirectory(root, 'tree root')
  const rows = []
  const visit = (path) => {
    for (const name of readdirSync(path).sort()) {
      const absolute = join(path, name)
      const entry = lstatSync(absolute)
      const relativePath = relative(canonicalRoot, absolute).split(sep).join('/')
      if (entry.isSymbolicLink()) {
        const target = readlinkSync(absolute)
        const resolved = realpathSync(absolute)
        assertInside(canonicalRoot, resolved, `symlink ${relativePath}`)
        rows.push({ absolute, relative: relativePath, kind: 'symlink', target, mode: entry.mode & 0o777 })
      } else if (entry.isDirectory()) {
        rows.push({ absolute, relative: relativePath, kind: 'directory', mode: entry.mode & 0o777 })
        visit(absolute)
      } else if (entry.isFile()) {
        rows.push({ absolute, relative: relativePath, kind: 'file', size: entry.size, mode: entry.mode & 0o777 })
      } else {
        throw new Error(`unsupported filesystem entry in packaging input: ${relativePath}`)
      }
    }
  }
  visit(canonicalRoot)
  return rows
}

export function validateSymlinkTree(root) {
  const canonicalRoot = assertDirectory(root, 'tree root')
  const rows = []
  const visit = (path) => {
    for (const name of readdirSync(path).sort()) {
      const absolute = join(path, name)
      const entry = lstatSync(absolute)
      const relativePath = relative(canonicalRoot, absolute).split(sep).join('/')
      if (entry.isSymbolicLink()) {
        const target = readlinkSync(absolute)
        if (isAbsolute(target)) throw new Error(`absolute symlink is forbidden: ${relativePath} -> ${target}`)
        const resolved = realpathSync(absolute)
        assertInside(canonicalRoot, resolved, `symlink ${relativePath}`)
        rows.push({ relative: relativePath, target })
      } else if (entry.isDirectory()) {
        visit(absolute)
      } else if (!entry.isFile()) {
        throw new Error(`unsupported filesystem entry: ${relativePath}`)
      }
    }
  }
  visit(canonicalRoot)
  return rows
}

export function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

export function sha256File(path) {
  return sha256Bytes(readFileSync(path))
}

const MACH_O_MAGICS = new Set([
  'feedface',
  'cefaedfe',
  'feedfacf',
  'cffaedfe',
  'cafebabe',
  'bebafeca',
  'cafebabf',
  'bfbafeca',
])

export function isNativeCodeCandidate(relativePath, mode) {
  return (mode & 0o111) !== 0 || /\.(?:dll|dylib|exe|node|so)$/iu.test(relativePath)
}

/** Read only the executable magic. The packaging inventory shares this one classifier so
 * pruning, architecture validation, and the signing plan cannot silently disagree. */
export function nativeBinaryKind(path) {
  const bytes = Buffer.alloc(4)
  const descriptor = openSync(path, 'r')
  let length
  try {
    length = readSync(descriptor, bytes, 0, bytes.length, 0)
  } finally {
    closeSync(descriptor)
  }
  if (length >= 4 && MACH_O_MAGICS.has(bytes.toString('hex'))) return 'mach-o'
  if (length >= 4 && bytes.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) return 'elf'
  if (length >= 2 && bytes[0] === 0x4d && bytes[1] === 0x5a) return 'pe'
  return undefined
}

export async function fileContains(path, needle) {
  const bytes = Buffer.from(needle, 'utf8')
  if (bytes.length === 0) return false
  const stream = createReadStream(path, { highWaterMark: 1024 * 1024 })
  let carry = Buffer.alloc(0)
  for await (const chunk of stream) {
    const combined = carry.length === 0 ? chunk : Buffer.concat([carry, chunk])
    if (combined.indexOf(bytes) !== -1) return true
    carry = combined.subarray(Math.max(0, combined.length - bytes.length + 1))
  }
  return false
}

export function safeOutputPath(output, allowedRoots) {
  const candidate = resolve(output)
  for (const root of allowedRoots.map((item) => resolve(item))) {
    const distance = relative(root, candidate)
    if (distance !== '' && distance !== '..' && !distance.startsWith(`..${sep}`) && !isAbsolute(distance)) return candidate
  }
  throw new Error(`output must be a strict descendant of an owned packaging root: ${output}`)
}
