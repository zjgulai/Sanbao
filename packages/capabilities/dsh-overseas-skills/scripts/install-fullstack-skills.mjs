#!/usr/bin/env node
/**
 * Fullstack skill installer.
 *
 * Safety contract:
 * - no mode flag means dry-run;
 * - all names, sources, targets and complete directory trees are preflighted;
 * - --apply uses one journaled directory transaction and never rm/cp over live;
 * - third-party installs remain fail-closed until SEC-RT-002 supplies the
 *   immutable approval/license/digest ledger.
 */
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  FullstackInstallError,
  buildInstallPlan,
  buildInstallReport,
  expectedInstallManifest,
  parseInstallerArgs,
  publicInstallPlan,
  stageInstallItem,
} from './install-fullstack-core.mjs'
import { executeDirectoryTransaction } from '../../../../scripts/lib/preset-skill-transaction.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = path.resolve(HERE, '..')

function readJson(pathname) {
  return JSON.parse(readFileSync(pathname, 'utf8'))
}

function usage() {
  return `用法：
  node scripts/install-fullstack-skills.mjs [--dry-run] [--only existing,mp,pm] [--json]
  node scripts/install-fullstack-skills.mjs --apply [--only existing] [--json]

说明：默认只做 dry-run。第三方 mp/pm 的真实安装在 SEC-RT-002 审批账本完成前拒绝执行。`
}

function makeBatchId() {
  return `skill-${Date.now()}-${randomBytes(4).toString('hex')}`
}

/** @returns {Promise<any>} */
export async function runInstallerCli(argv, environment = {}) {
  const options = parseInstallerArgs(argv)
  if (options.help) {
    environment.stdout?.(usage())
    return { exitCode: 0, help: true }
  }

  const home = environment.home ?? process.env.HOME
  if (!home) throw new FullstackInstallError('HOME_MISSING', 'HOME 未设置，无法定位 skill root')
  const mapping = environment.mapping ?? readJson(path.join(HERE, 'fullstack-mapping.json'))
  const extra = environment.extra ?? readJson(path.join(HERE, 'fullstack-extra.json'))
  const plan = buildInstallPlan({
    mapping,
    extra,
    only: options.only,
    skillsRoot: environment.skillsRoot ?? path.join(home, '.dsh', 'skills'),
    sourceRoots: environment.sourceRoots ?? {
      mp: path.join(PACKAGE_ROOT, 'staging', 'third-party', 'mattpocock__skills'),
      pm: path.join(PACKAGE_ROOT, 'staging', 'third-party', 'phuryn__pm-skills'),
    },
    translationsRoot: environment.translationsRoot
      ?? path.join(PACKAGE_ROOT, 'staging', 'translations'),
  })

  const dry = publicInstallPlan(plan)
  if (!options.apply) {
    const output = options.json ? JSON.stringify(dry, null, 2) : [
      `dry-run：预检 ${dry.selected} 个 skill，未写盘`,
      `skill root：${dry.canonicalSkillsRoot}`,
      `第三方审批依赖：${dry.requiresThirdPartyApproval ? '未满足，--apply 将拒绝' : '不涉及'}`,
      ...dry.items.map((item) => `  ${item.action.padEnd(7)} ${item.name}  ${item.sourceTreeSha256}`),
    ].join('\n')
    environment.stdout?.(output)
    return { exitCode: 0, dryRun: true, plan: dry }
  }

  if (plan.requiresThirdPartyApproval) {
    throw new FullstackInstallError(
      'APPROVAL_LEDGER_MISSING',
      '第三方 skill apply 被拒绝：SEC-RT-002 的不可变审批/license/source digest 账本尚未就绪；可用 --only existing 执行存量更新。',
    )
  }

  const batchId = environment.batchId ?? makeBatchId()
  const workspace = environment.workspace ?? path.join(
    path.dirname(plan.root.path),
    `.${path.basename(plan.root.path)}-transaction-${batchId}`,
  )
  const afterByName = new Map(plan.items.map((item) => [item.name, expectedInstallManifest(item)]))
  const afterFor = (name) => {
    const manifest = afterByName.get(name)
    if (!manifest) throw new FullstackInstallError('AFTER_MANIFEST_MISSING', `${name}: 缺 after manifest`)
    return manifest
  }
  /** @type {any} */
  const transactionPlan = {
    kind: 'skill',
    batchId,
    owner: environment.owner ?? 'install-fullstack-skills',
    root: plan.root,
    workspace,
    items: plan.items.map((item) => ({
      action: 'replace',
      finalName: item.name,
      target: item.target,
      before: item.beforeManifest,
      after: afterFor(item.name),
      stageMode: 'prepared',
    })),
  }

  const result = await executeDirectoryTransaction(transactionPlan, {
    fault: environment.fault,
    prepare({ stageDir }) {
      const staged = {}
      for (const item of plan.items) {
        const manifest = stageInstallItem(item, path.join(stageDir, item.name))
        const expected = afterFor(item.name).treeSha256
        if (manifest.treeSha256 !== expected) {
          throw new FullstackInstallError('STAGE_DIGEST_MISMATCH', `${item.name}: staging digest 与预计算不一致`)
        }
        staged[item.name] = manifest.treeSha256
      }
      return { staged }
    },
  })

  const transactionEvidence = {
    batchId,
    state: result.state,
    items: plan.items.map((item) => ({
      name: item.name,
      afterTreeSha256: afterFor(item.name).treeSha256,
    })),
  }
  const report = buildInstallReport(plan, transactionEvidence)
  const publicResult = {
    state: result.state,
    batchId,
    workspace: result.workspace,
    journalPath: result.journalPath,
    report,
  }
  environment.stdout?.(options.json
    ? JSON.stringify(publicResult, null, 2)
    : `完成：${report.installed.length} 个 skill 已提交；journal=${result.journalPath}`)
  return { exitCode: 0, ...publicResult }
}

const direct = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (direct) {
  runInstallerCli(process.argv.slice(2), { stdout: (text) => console.log(text) }).then(
    (result) => { process.exitCode = result.exitCode },
    (error) => {
      const json = process.argv.includes('--json')
      const details = {
        ok: false,
        code: typeof error?.code === 'string' ? error.code : 'INSTALL_FAILED',
        message: error instanceof Error ? error.message : String(error),
      }
      console.error(json ? JSON.stringify(details, null, 2) : `✗ ${details.code}: ${details.message}`)
      process.exitCode = 2
    },
  )
}
