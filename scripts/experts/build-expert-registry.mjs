#!/usr/bin/env node
// EP-0 (ADR-0341 D3/D6): build the Sage expert registry as a read-only projection of the
// AI-organization design assets (3 MGT + 50 AGT). The projection carries catalogue facts only —
// id/identity/mission/personality/principle/group/avatar path + the design-only status — never
// the full soul/playbook bodies, and never a production-authorization claim
// (production_authorized=false stays in the source; `designStatus: 'design_only'` here).
// Usage: node scripts/experts/build-expert-registry.mjs --source <ai-org-repo> --out <dir> [--check]
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

function parseArgs(argv) {
  const args = { check: false }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--source') args.source = resolve(argv[++i])
    else if (argv[i] === '--out') args.out = resolve(argv[++i])
    else if (argv[i] === '--check') args.check = true
  }
  if (!args.source || !args.out) {
    console.error('usage: build-expert-registry.mjs --source <ai-org-repo> --out <dir> [--check]')
    process.exit(2)
  }
  return args
}

const args = parseArgs(process.argv.slice(2))
const rel = (p) => join(args.source, p)

const catalog = JSON.parse(readFileSync(rel('docs/05-agents/role-catalog.json'), 'utf8'))
const managementRaw = JSON.parse(readFileSync(rel('docs/04-organization/management/management-catalog.json'), 'utf8'))
const visuals = JSON.parse(readFileSync(rel('dist/data/visual-identities.json'), 'utf8'))

const visualByRole = new Map()
for (const entry of [...(visuals.management ?? []), ...(visuals.visuals ?? [])]) {
  visualByRole.set(entry.role_id, entry)
}

function avatarFor(roleId) {
  const entry = visualByRole.get(roleId)
  const list = entry?.visual?.assets?.light?.list
  if (typeof list !== 'string' || list === '') return null
  // list = ./assets/visual-identities/<release>/<role>/light/list-64.webp — keep
  // <role>/light/list-64.webp under our avatars/ tree.
  const parts = list.split('/')
  return `avatars/${parts.slice(-3).join('/')}`
}

function soulDigest(roleId, roleKind) {
  const soulDir = roleKind === 'MGT'
    ? 'docs/04-organization/management/souls'
    : 'docs/05-agents/roles/souls'
  const soulPath = rel(`${soulDir}/${roleId}.soul.md`)
  if (!existsSync(soulPath)) return null
  const text = readFileSync(soulPath, 'utf8')
  // The soul files are titled "# <alias>｜<id> Soul"; the identity self-statement lives under
  // "## 我是谁". Take that paragraph — catalogue-level identity digest only, not the full soul.
  const match = /##\s*我是谁\s*\n+([\s\S]{0,400}?)(?:\n##|$)/.exec(text)
  return match ? match[1].trim().replace(/\s+/g, ' ') : null
}

function projectRole(role, roleKind) {
  return {
    id: role.id,
    roleKind,
    group: role.group ?? null,
    alias: role.alias ?? null,
    title: role.title ?? null,
    mission: role.mission ?? null,
    personality: role.personality ?? null,
    principle: typeof role.principle === 'string' ? role.principle : null,
    skillsCatalogued: Array.isArray(role.skills) ? role.skills.length : 0,
    avatar: avatarFor(role.id),
    soulDigest: soulDigest(role.id, roleKind),
    designStatus: 'design_only',
    productionAuthorized: role.production_authorized === true,
    sourceRefs: {
      roleDoc: `docs/05-agents/roles/${role.id}.md`,
      soul: `docs/05-agents/roles/souls/${role.id}.soul.md`,
      playbook: `docs/06-playbooks/role-playbooks/${role.id}.md`,
      presetBlueprint: `docs/10-platform/deepseek-harness/preset-blueprints/${role.id}.json`,
    },
  }
}

const agents = (catalog.roles ?? []).map((role) => projectRole(role, 'AGT'))
const managersSrc = managementRaw.roles ?? managementRaw.managers ?? managementRaw ?? []
const managers = (Array.isArray(managersSrc) ? managersSrc : []).map((role) => projectRole(role, 'MGT'))

const registry = {
  schemaVersion: 'sage.expert-registry.v1',
  designStatus: 'design_only',
  sourceProject: 'AI组织变革（仓库外设计资产；本文件为只读投影，不承载生产授权）',
  counts: { agents: agents.length, managers: managers.length, total: agents.length + managers.length },
  groups: [...new Set(agents.map((a) => a.group).filter(Boolean))],
  experts: [...managers, ...agents],
}

if (args.check) {
  const current = JSON.parse(readFileSync(join(args.out, 'expert-registry.json'), 'utf8'))
  if (JSON.stringify(current) !== JSON.stringify(registry)) {
    console.error('expert-registry.json is stale — rerun without --check')
    process.exit(1)
  }
  console.log(`expert-registry up to date (${registry.counts.total} experts)`)
  process.exit(0)
}

mkdirSync(args.out, { recursive: true })
mkdirSync(join(args.out, 'avatars'), { recursive: true })

// Copy avatars referenced by the projection (list-64 webp only — the grid-facing size).
let copied = 0
for (const expert of registry.experts) {
  if (expert.avatar === null) continue
  const relFile = expert.avatar.replace('avatars/', '')
  const srcFile = rel(`dist/assets/visual-identities/vir-sanbao-web-2026-09-24-r1/${relFile}`)
  if (!existsSync(srcFile)) throw new Error(`avatar missing: ${srcFile}`)
  const destFile = join(args.out, expert.avatar)
  mkdirSync(destFile.slice(0, destFile.lastIndexOf('/')), { recursive: true })
  copyFileSync(srcFile, destFile)
  copied += 1
}

writeFileSync(join(args.out, 'expert-registry.json'), JSON.stringify(registry, null, 1) + '\n')

console.log(`expert-registry.json written: ${registry.counts.total} experts (${registry.counts.managers} MGT + ${registry.counts.agents} AGT), ${copied} avatars`)
