#!/usr/bin/env node
/**
 * LUTE 门禁入口。退出码即契约（ADR-0014）：
 *   0 = 全部校验通过
 *   1 = 存在失败校验
 *   2 = 用法错误
 *
 * 用法：node scripts/gate.mjs [--mode quick|full] [--list]
 *   quick（默认）提交前使用；full 推送前使用（含变更包 typecheck/test，二期接入 git 钩子后启用）。
 */
import { existsSync, lstatSync, readFileSync, readlinkSync, readdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  checkAdrIndex,
  checkAdrNoteLinks,
  checkCatalogFresh,
  checkChangedPackages,
  checkDependencyLinks,
  checkDmgReadmeTccPanes,
  checkExemptions,
  checkGitignoreWhitelist,
  checkNestedRepositories,
  checkPackageIdentity,
  checkPinConsistency,
  checkReadmeHeredocIsLiteral,
  checkScriptsRunnable,
  checkShellVarAdjacentMultibyte,
  checkTccDeadGrantRule,
  checkTccPaneGuidance,
  checkTrackedIgnored,
} from './gates/checks.mjs'
import { buildOutputRoot, checkDependencyReproducibility, packageScriptOrder } from './gates/dependency-reproducibility.mjs'
import { checkProfileBundleSync, checkProfileFilesSync, checkProfileMetadata } from './gates/sync-profile.mjs'
import { checkSharedSync } from './gates/sync-shared.mjs'
import { checkThemeTokens } from './gates/theme-tokens.mjs'
import { checkWorktableFence } from './gates/worktable-fence.mjs'
import { checkNodeInterpreter } from './gates/node-interpreter.mjs'
import { checkSidebarRowAxis } from './gates/sidebar-row-axis.mjs'
import {
  checkPitfallsPlaybook,
  PLAYBOOK_BACKLINK_PATHS,
  PLAYBOOK_REL_PATH,
} from './gates/pitfalls-playbook.mjs'
import { checkDocsLinkIntegrity } from './gates/docs-links.mjs'
import { checkDeadInstrument, REGISTRY_REL_PATH as DEAD_INSTRUMENTS_PATH } from './gates/dead-instrument.mjs'
import {
  ASSETS_DIR_REL as BRAND_ICONS_ASSETS_DIR,
  checkBrandIcons,
  REPLAY_REL as BRAND_REPLAY_REL,
} from './gates/brand-icons.mjs'
import {
  checkDmgLayout,
  GUIDE_REL_PATH as DMG_LAYOUT_GUIDE_PATH,
  selectLayoutTargets,
  SOP_REL_PATH as DMG_LAYOUT_SOP_PATH,
} from './gates/dmg-layout.mjs'
import { selectAnchorTargets } from './gates/patch-anchor-scope.mjs'
import { selectPublishTargets } from './gates/release-publish-scope.mjs'
import {
  checkChangelogSections,
  PACKAGING_CHANGELOG_REL_PATH,
  ROOT_CHANGELOG_REL_PATH,
} from './gates/changelog-release-sections.mjs'
import { runScript } from './lib/run-script.mjs'
import { nodeCommand } from './lib/real-node.mjs'
import { collectPackages } from './gates/package-collect.mjs'
import { renderCatalog } from './gen-catalog.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const MODES = ['quick', 'full']

/** 不参与包身份校验的目录（无 package.json 或属外部依赖）。 */
const SCAN_SKIP = new Set(['node_modules', 'vendor', '.git', 'packaging', 'docs', '.scratch'])

/**
 * 会教用户授权 TCC 的出货面。清单本身也是判据：新增一处指引而没登记进来，
 * 等于新增一处「写错了也没人说」的地方（2026-09-13 实测：README 改对后，
 * 另外五处仍写着「自动化」，其中包括安装器最后一行提示）。
 */
const TCC_GUIDANCE_SURFACES = [
  'packaging/assemble.sh',
  'packaging/installer/install.sh',
  'packaging/installer/pkg-postinstall.sh',
  'packaging/INSTALL-CARD.md',
  'packaging/INSTALL-GUIDE.md',
  'packaging/README.md',
  'README.md',
]

/** 校验项注册表：新增校验在此登记，name 会出现在 --list 输出中。 */
const CHECKS = [
  {
    name: 'package-identity',
    remediation: '在每个受管 package.json 补 luteOrigin / luteOwner / lutePublish（ADR-0012）',
    run() {
      return checkPackageIdentity(repoRoot, collectManifests())
    },
  },
  {
    name: 'pin-consistency',
    remediation: '更新 vendor/dsh-desktop.pin 的 harness-submodule 为实际 HEAD（ADR-0008）',
    run() {
      return checkPinConsistency({
        pinText: readIfExists(join(repoRoot, 'vendor', 'dsh-desktop.pin')),
        submoduleSha: submoduleHead() ?? '<未初始化>',
      })
    },
  },
  {
    name: 'gitignore-whitelist',
    remediation: '删除 .gitignore 中指向不存在路径的白名单条目（ADR-0013）',
    run() {
      return checkGitignoreWhitelist({
        gitignoreText: readIfExists(join(repoRoot, '.gitignore')),
        exists: (path) => existsSync(join(repoRoot, path)),
      })
    },
  },
  {
    name: 'adr-index',
    remediation: '修正 docs/adr/README.md 索引与 docs/adr/ADR-NNNN.md 文件的一致性（ADR-0015）',
    run() {
      return checkAdrIndex({
        adrFiles: listAdrFiles(),
        indexText: readIfExists(join(repoRoot, 'docs', 'adr', 'README.md')),
      })
    },
  },
  {
    name: 'adr-note-links',
    remediation: '修正 ADR 的「决策记录」链接或在其 Note 正文回引 ADR 编号（ADR-0015）',
    run() {
      return checkAdrNoteLinks({
        adrDocs: listAdrFiles().map((path) => ({ path, text: readIfExists(join(repoRoot, path)) })),
        // 逐篇读该 ADR 自己指向的那篇 Note（不再写死单一路径）。
        readNote: (path) => readIfExists(join(repoRoot, path)),
        exists: (path) => existsSync(join(repoRoot, path)),
      })
    },
  },
  {
    name: 'catalog-fresh',
    remediation: '运行 node scripts/gen-catalog.mjs 重新生成目录墙（ADR-0011）',
    run() {
      const target = 'docs/catalog/packages.md'
      const current = readIfExists(join(repoRoot, target))
      if (current === '') return { passed: true, violations: [] }
      return checkCatalogFresh({
        current,
        regenerated: renderCatalog({ packages: collectManifests() }),
      })
    },
  },
  {
    name: 'dependency-links',
    remediation: '修复断链：重新安装该包依赖，或把链接目标改为绝对路径（ADR-0016）',
    run() {
      return checkDependencyLinks({ links: collectDependencyLinks() })
    },
  },
  {
    name: 'deps-reproducible',
    remediation: '在该包目录执行 pnpm install 重新生成 pnpm-lock.yaml；机器绝对路径依赖改成注册表版本区间（ADR-0055）',
    run() {
      return checkDependencyReproducibility({
        packages: collectManifests()
          .filter((entry) => entry.dir !== '.')
          .map((entry) => {
            const lockPath = join(repoRoot, entry.dir, 'pnpm-lock.yaml')
            return {
              relPath: entry.dir,
              manifest: entry.manifest,
              lockfileText: existsSync(lockPath) ? readFileSync(lockPath, 'utf8') : null,
            }
          }),
      })
    },
  },
  {
    name: 'nested-repos',
    remediation: '把嵌套仓库纳入 .gitmodules 声明，或折叠为普通目录（ADR-0016）',
    run() {
      const nested = []
      for (const entry of collectManifests()) {
        if (entry.dir === '.') continue
        if (existsSync(join(repoRoot, entry.dir, '.git'))) nested.push(entry.dir)
      }
      const gitmodules = readIfExists(join(repoRoot, '.gitmodules'))
      const declared = [...gitmodules.matchAll(/^\s*path\s*=\s*(.+)$/gm)].map((m) => m[1].trim())
      return checkNestedRepositories({ nestedRepos: nested, declaredSubmodules: declared })
    },
  },
  {
    name: 'index-drift',
    remediation: '结清漂移：git rm --cached 已不在磁盘的条目，或把受管归档纳入 .gitignore 白名单（ADR-0013）',
    run() {
      const output = execFileSync('git', ['-C', repoRoot, 'ls-files', '--cached', '--ignored', '--exclude-standard'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      return checkTrackedIgnored({ trackedIgnored: output.split('\n').filter(Boolean) })
    },
  },
  {
    name: 'profile-metadata-sync',
    remediation: '运行 node scripts/sync-profile.mjs --apply --only-metadata 同步内嵌副本（profile/vendor，非装载点）的 package.json',
    run() {
      // 注意：vendor/ 不是装载点（DSH 从 profile/node_modules 解析包）。本项只保证
      // 内嵌副本的元数据不漂；「改动是否生效」由下面的 profile-bundle-sync 断言。
      const profileVendor = join(process.env.HOME ?? '', '.dsh', 'profiles', 'desktop', 'vendor')
      if (!existsSync(profileVendor)) return { passed: true, violations: [] }
      return checkProfileMetadata(
        collectManifests()
          .filter((entry) => entry.dir !== '.')
          .map((entry) => ({
            name: entry.dir,
            sourceDir: join(repoRoot, entry.dir),
            targetDir: join(profileVendor, entry.dir.split('/').pop()),
          })),
      )
    },
  },
  {
    name: 'profile-files-sync',
    remediation: '按 package.json 的 files 清单修正：陈旧条目从 files 中删除；真缺件用 tmp+mv 语义补齐 profile 副本（勿直接覆盖）',
    run() {
      const profile = join(process.env.HOME ?? '', '.dsh', 'profiles', 'desktop')
      // 盯 node_modules：`file:` 依赖是硬链接实体副本，且这是 DSH 真实装载点
      // （2026-09-11 实测报错路径即 profiles/desktop/node_modules/dsh-preset-lint-local/lib/...）。
      // vendor/ 是另一份命名不同的副本，两份都缺 linter——本项只对装载点断言。
      const target = join(profile, 'node_modules')
      if (!existsSync(target)) return { passed: true, violations: [] }
      const packages = new Map(collectManifests().filter((entry) => entry.dir !== '.').map((entry) => [entry.dir.split('/').pop(), entry]))
      const pairs = []
      for (const [name, spec] of Object.entries(installedProfileDependencies(profile))) {
        if (!spec.startsWith('file:')) continue
        const sourceDir = spec.slice('file:'.length)
        if (!existsSync(join(sourceDir, 'package.json'))) continue
        const entry = packages.get(sourceDir.split('/').pop())
        pairs.push({
          name,
          sourceDir,
          targetDir: join(target, name),
          files: entry?.manifest.files ?? [],
        })
      }
      return checkProfileFilesSync(pairs)
    },
  },
  {
    name: 'profile-bundle-sync',
    remediation: '运行 node scripts/sync-profile.mjs --apply --loadpoint 把仓库产物按 tmp+mv 同步到装载点（否则应用重启后仍跑旧字节）',
    run() {
      const profile = join(process.env.HOME ?? '', '.dsh', 'profiles', 'desktop')
      const target = join(profile, 'node_modules')
      if (!existsSync(target)) return { passed: true, violations: [], note: '装载点不存在，本项未校验任何包' }
      const packages = new Map(collectManifests().filter((entry) => entry.dir !== '.').map((entry) => [entry.dir.split('/').pop(), entry]))
      const pairs = []
      let fileDeps = 0
      for (const [name, spec] of Object.entries(installedProfileDependencies(profile))) {
        if (!spec.startsWith('file:')) continue
        fileDeps += 1
        // `file:` 的基准是**声明它的那份 package.json 所在的目录**（即 profile），
        // 不是本进程的 cwd。2026-09-13 实测：旧实现直接拿 spec 里的相对路径
        // （`./vendor/packages/surfaces/dsh-skill-center-local`）去 `existsSync`，
        // 而门禁是从仓库根跑的，仓库根下没有 `vendor/packages/`——于是 23 个
        // `file:` 依赖**全部**在此被 `continue` 掉，pairs 恒为空、本项恒绿。
        // 这正是 P-02（仪器假绿）：修的是「应用重启后仍跑旧字节」，而它自己
        // 一个包都没对着看过。仓库路径的唯一来源是 collectManifests() 的 dir。
        const entry = packages.get(spec.slice('file:'.length).split('/').pop())
        // 只判本仓库受管的包：别的项目的 file: 依赖漂移是那个项目的事，
        // 挂到这里只会让本仓库门禁为别人的状态变红，然后被加豁免。
        if (entry === undefined) continue
        pairs.push({
          name,
          sourceDir: entry.dir,
          targetDir: join(target, name),
          files: entry.manifest.files ?? [],
        })
      }
      // 空射程必须**自己**报出来，而不是长得和「都一致」一样（P-02 / P-03）。
      // 旧实现里「一个都没对上」与「逐字节全一致」在读数上完全同形，本项就是那次
      // 假绿发生的**位置**；这里让「声明了 file: 依赖却一个都没对上」直接判红。
      const note = `对比 ${pairs.length}/${fileDeps} 个 file: 依赖`
      if (fileDeps > 0 && pairs.length === 0) {
        return {
          passed: false,
          violations: [
            `profile 声明了 ${fileDeps} 个 file: 依赖，但没有任何一个对上本仓库受管的包——`
              + '本项**未校验任何包**，不是「都一致」（P-02：仪器假绿）',
          ],
          note,
        }
      }
      return { ...checkProfileBundleSync(pairs), note }
    },
  },
  {
    name: 'shared-sync',
    remediation: '改共享层请改 shared/ 后跑 node scripts/sync-shared.mjs --write 把改动写回各副本（ADR-0009）',
    run() {
      return checkSharedSync(repoRoot)
    },
  },
  {
    name: 'scripts-runnable',
    modes: ['full'],
    remediation: '补齐脚本依赖（如 devDependencies 加 typescript）或修复脚本本体，使其退出码为 0（ADR-0014）',
    run() {
      const exempted = new Set(JSON.parse(readIfExists(EXEMPTIONS_PATH) || '[]').map((row) => row.package))
      const packages = runPackageScripts().filter((entry) => !exempted.has(entry.relPath))
      return checkScriptsRunnable({ packages })
    },
  },
  {
    name: 'shell-var-multibyte',
    remediation: '把 `$VAR` 写成 `${VAR}`：bash 会把紧跟其后的多字节字符并入变量名，set -u 下直接中断（2026-09-13 实测装配 §5 中断，ADR-0064）',
    run() {
      return checkShellVarAdjacentMultibyte({ files: collectShellScripts() })
    },
  },
  {
    name: 'dmg-readme-tcc-panes',
    remediation:
      '出货 README 的授权段必须写全「辅助功能 / 屏幕录制」两项，且不得把「输入监控」写成待授项：写错一项不报错，用户会照着授了「自动化」而 mac.key/mac.click 静默失败；「输入监控」则根本不需要（post_events 由「辅助功能」承载，ADR-0063 / ADR-0069）',
    run() {
      return checkDmgReadmeTccPanes({
        assembleScript: readIfExists(join(repoRoot, 'packaging', 'assemble.sh')) ?? '',
      })
    },
  },
  {
    name: 'tcc-pane-guidance',
    remediation:
      '把该处授权指引改成「辅助功能 / 屏幕录制」两项：不要写「输入监控」（非必需，post_events 由「辅助功能」承载，ADR-0069），也不要写「自动化」（授了不会让键盘鼠标类能力可用，ADR-0063）；要讲清这两件事就加否定词（「不要授权自动化」「输入监控并非必需」）',
    run() {
      return checkTccPaneGuidance({
        files: TCC_GUIDANCE_SURFACES.map((rel) => ({
          path: rel,
          text: readIfExists(join(repoRoot, rel)) ?? '',
        })),
      })
    },
  },
  {
    name: 'tcc-dead-grant',
    remediation:
      '把「关掉再打开」这句处置写进 packaging/INSTALL-GUIDE.md 与出货 README，并让安装收尾真的调用 tools/tcc-grant-status.sh：换签名身份后，隐私界面会把「绑在旧代码上」的授权显示成「已开启」，界面上看不出异常（ADR-0068）',
    run() {
      return checkTccDeadGrantRule({
        installScript: readIfExists(join(repoRoot, 'packaging', 'installer', 'install.sh')) ?? '',
        assembleScript: readIfExists(join(repoRoot, 'packaging', 'assemble.sh')) ?? '',
        installGuide: readIfExists(join(repoRoot, 'packaging', 'INSTALL-GUIDE.md')) ?? '',
      })
    },
  },
  {
    name: 'tcc-grant-status-selftest',
    remediation:
      '跑 bash packaging/scripts/tcc-grant-status-test.sh 看红在哪条：死授权检出器必须能说「不」（R1 死授权→3、R2 有效→0、R3 封条破损→4 且不误报、R4 无记录→0、R5 要求解不出→4 且不把工具错误文本当要求、R6 非必需项的残留不污染结论、R7 --format=tsv 契约），并在恒真桩突变下失效（M1）。缺签名身份时自测声明跳过，不算失败（ADR-0068）',
    run() {
      const script = join(repoRoot, 'packaging', 'scripts', 'tcc-grant-status-test.sh')
      const result = runScript(repoRoot, `bash "${script}"`, 120000)
      if (result.code === 0) return { passed: true, violations: [] }
      const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
      const lines = text
        .split('\n')
        .filter((line) => /\[FAIL\]/.test(line))
        .map((line) => line.trim())
      const verdict = result.code === null ? '未给出退出码' : `退出码 ${result.code}`
      return {
        passed: false,
        violations: lines.length > 0 ? lines : [`死授权检出器自测失败（${verdict}）`],
      }
    },
  },
  {
    name: 'tcc-form-selftest',
    remediation:
      '跑 bash packaging/scripts/verify-tcc-form-test.sh 看红在哪条：判据⑤（升级不重置授权）能否成立，取决于库里那条要求是**身份型**还是 cdhash 型，而两种形态下 doctor 都报 true。F1/F2 用真实读数做正反例，F5 钉住「非必需项不得污染判决」，F6 钉住「读不懂的格式默认不通过」（ADR-0063 / ADR-0069）',
    run() {
      const script = join(repoRoot, 'packaging', 'scripts', 'verify-tcc-form-test.sh')
      const result = runScript(repoRoot, `bash "${script}"`, 120000)
      if (result.code === 0) return { passed: true, violations: [] }
      const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
      const lines = text
        .split('\n')
        .filter((line) => /\[FAIL\]/.test(line))
        .map((line) => line.trim())
      const verdict = result.code === null ? '未给出退出码' : `退出码 ${result.code}`
      return {
        passed: false,
        violations: lines.length > 0 ? lines : [`要求形态判读自测失败（${verdict}）`],
      }
    },
  },
  {
    name: 'tcc-persistence-selftest',
    remediation:
      '跑 bash packaging/scripts/verify-tcc-persistence-test.sh 看红在哪条：判据⑤（升级不重置授权）在出货前的唯一静态证明，必须同时满足「新版仍被旧授权接受」与「换字节即被拒」——只会说通过的那一支等于没判（ADR-0063）',
    run() {
      const script = join(repoRoot, 'packaging', 'scripts', 'verify-tcc-persistence-test.sh')
      const result = runScript(repoRoot, `bash "${script}"`, 120000)
      if (result.code === 0) return { passed: true, violations: [] }
      const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
      const lines = text
        .split('\n')
        .filter((line) => /\[FAIL\]/.test(line))
        .map((line) => line.trim())
      const verdict = result.code === null ? '未给出退出码' : `退出码 ${result.code}`
      return {
        passed: false,
        violations: lines.length > 0 ? lines : [`判据⑤ 静态证明自测失败（${verdict}）`],
      }
    },
  },
  {
    name: 'readme-heredoc-literal',
    remediation:
      '出货 README 的 heredoc 是 `<<EOF`（未加引号），正文里的裸反引号与 `$(` 会在**打包时**被 shell 执行：2026-09-13 实测两起——`macos-harness doctor` 的原始 JSON 被打进客户 README、`$(basename "$PWD")` 被展开成构建机目录名（客户看到跑不通的 `shasum ../packaging.dmg`）。反引号写成 \\`，命令替换写成 \\$(；`$VERSION` 一类参数展开是有意的，放行（ADR-0069）',
    run() {
      return checkReadmeHeredocIsLiteral({
        assembleScript: readIfExists(join(repoRoot, 'packaging', 'assemble.sh')) ?? '',
      })
    },
  },
  {
    name: 'setup-app-locator',
    remediation:
      '跑 bash packaging/scripts/setup-app-locate-test.sh 看红在哪条：安装器必须能在「同级没有载荷」时从挂载卷找到安装包（从 dmg 里双击就会被 macOS 随机重定位，这是常态），也不得要求 install.sh 有可执行位（脚本是用 /bin/bash 跑的）。缺 swiftc 时先 xcode-select --install（ADR-0066）',
    run() {
      const script = join(repoRoot, 'packaging', 'scripts', 'setup-app-locate-test.sh')
      const result = runScript(repoRoot, `bash "${script}"`, 300000)
      if (result.code === 0) return { passed: true, violations: [] }
      const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
      const lines = text
        .split('\n')
        .filter((line) => /✗|TEST FAILED|缺少 swiftc/.test(line))
        .map((line) => line.trim())
      const verdict = result.code === null ? '未给出退出码' : `退出码 ${result.code}`
      return {
        passed: false,
        violations: lines.length > 0 ? lines : [`安装器定位自测失败（${verdict}）`],
      }
    },
  },
  {
    name: 'release-artifacts-intact',
    remediation:
      '已发布版本的产物不见了：清单（release/<版本>.sha256，已进 git）承诺过那串字节。找回：bash packaging/scripts/release-restore.sh <版本>（从仓库外归档），或 --from <外部副本>（客户/聊天软件里那份，哈希对上才收）。禁止用同一版本号重制（ADR-0057）',
    run() {
      const script = join(repoRoot, 'packaging', 'scripts', 'release-verify.sh')
      const result = runScript(repoRoot, `bash "${script}"`, 300000)
      if (result.code === 0) return { passed: true, violations: [] }
      const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
      const lines = text
        .split('\n')
        .filter((line) => /✗|\[release-verify\]/.test(line))
        .map((line) => line.trim())
      const verdict = result.code === null ? '未给出退出码' : `退出码 ${result.code}`
      return {
        passed: false,
        violations: lines.length > 0 ? lines : [`发布产物核对失败（${verdict}）`],
      }
    },
  },
  {
    name: 'release-published',
    modes: ['full'],
    remediation:
      '入库版本没有分发面，客户拿不到：按 docs/sop/dmg-release.md §6 发布——gh release create "v<版本>" --title … --notes-file … --verify-tag "packaging/release/<版本>/DSH-Desktop-LUTE-<版本>-mac-arm64.dmg" "packaging/release/<版本>/SHA256SUMS"（历史版本另加 --latest=false，免得被创建时间顶成 Latest）。射程 = **既有** release/<版本>.sha256、**又有** v<版本> tag 的版本（ADR-0076）：只有清单没有 tag（如 2.3.2，通过发布判据之前就被取代）与只有 tag 没有清单（如 2.0.1，早于清单机制）都在射程外，不构成红。gh 不可用或未认证时报**跳过**——跳过不算通过',
    run() {
      let releases
      try {
        const raw = execFileSync('gh', ['release', 'list', '--limit', '200', '--json', 'tagName,isDraft'], {
          encoding: 'utf8',
          timeout: 60000,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        releases = JSON.parse(raw).map((row) => ({ tag: row.tagName, isDraft: row.isDraft }))
      } catch (error) {
        // 读不到 ≠ 都发了。三态里这是 skip（ADR-0075 / P-02）。
        const reason = String(error?.stderr ?? error?.message ?? error)
          .split('\n')
          .filter(Boolean)[0]
        return {
          passed: true,
          skipped: true,
          violations: [],
          note: `gh release list 读不到（${reason}）——本项**未核对任何版本**（不是「都发了」）`,
        }
      }
      const scope = selectPublishTargets({
        manifestVersions: publishedManifests(),
        taggedVersions: releasedVersions(),
        releases,
      })
      if (scope.vacuous) {
        return {
          passed: true,
          skipped: true,
          violations: [],
          note: `${scope.note}——本项**未核对任何版本**（不是「都发了」）`,
        }
      }
      const violations = [
        ...scope.missing.map((version) => `v${version} 有入库清单且有 tag，但 GitHub Releases 上没有它`),
        ...scope.drafts.map((version) => `v${version} 的 Release 仍是 draft——对客户不存在`),
      ]
      return { passed: violations.length === 0, violations, note: scope.note }
    },
  },
  {
    name: 'release-published-scope-selftest',
    remediation:
      '跑 node --test scripts/gates/release-publish-scope.test.mjs 看红在哪条：射程判据必须能说「不」——只有清单没有 tag（v2.3.2 的形状）与只有 tag 没有清单（v2.0.1 的形状）都必须出局且不得变成永久红，draft 必须算未发布，射程为空必须报空而不是报通过。重点是恒真桩突变：把 missing 恒置空、把 draft 读成已发布、或把射程换成「所有 release/*.sha256」，用例必须失效（P-02 / P-03）',
    run() {
      return runNodeTestFile('scripts/gates/release-publish-scope.test.mjs', '发布面核对判据的反向自测失败')
    },
  },
  {
    name: 'changelog-release-sections',
    remediation:
      '已发布版本（**既有** release/<版本>.sha256、**又有** v<版本> tag）必须在 CHANGELOG.md 里有它自己的一行 `## [<版本>]`——CHANGELOG 是客户在仓库里读「这版改了什么」的家，没有段就等于那一版在文档里不存在。补段的内容取自该版的 GitHub Release notes（已发布的权威记录，不要凭记忆写），`[Unreleased]` 留在最上面给下一个未发布版本用；写完跑 `pnpm run gate`。射程与 `release-published` 同一把尺（ADR-0076）：只有清单没有 tag 的 2.3.2、只有 tag 没有清单的 2.0.1 都在射程外；git tag 读不到（浅克隆）时射程为空，此时版本段部分报**跳过**（跳过不算通过）。`packaging/CHANGELOG.md` 只查「`## [Unreleased]` 至多一个」——它是流水线细节的账，某版打包面没变化时**合法地**没有段，对它也要求逐版成段只会造出一条会被关掉的噪声规则（P-02 的死法）',
    run() {
      const scope = selectPublishTargets({
        manifestVersions: publishedManifests(),
        taggedVersions: releasedVersions(),
      })
      const readDoc = (relPath, requireVersionSections) => {
        try {
          return { path: relPath, text: readFileSync(join(repoRoot, relPath), 'utf8'), requireVersionSections }
        } catch {
          // 读不到正文交给判据去判红（删空这份账不该是绿的），不在这里静默降级。
          return { path: relPath, text: '', requireVersionSections }
        }
      }
      const result = checkChangelogSections({
        publishedVersions: scope.inScope,
        documents: [
          readDoc(ROOT_CHANGELOG_REL_PATH, true),
          readDoc(PACKAGING_CHANGELOG_REL_PATH, false),
        ],
      })
      // 结构规则（Unreleased 至多一个）与射程无关，所以它**永远**说话：
      // 射程为空时，只有「没有任何违规」才可以报跳过。
      if (result.vacuous && result.violations.length === 0) {
        return {
          passed: true,
          skipped: true,
          violations: [],
          note: `${scope.note}——射程为空，本项**未核对任何版本的版本段**（只查了「Unreleased 至多一个」）`,
        }
      }
      const note = result.vacuous ? `${scope.note}（射程为空，只查了结构规则）` : result.note
      return { passed: result.passed, violations: result.violations, note }
    },
  },
  {
    name: 'changelog-release-sections-selftest',
    remediation:
      '跑 node --test scripts/gates/changelog-release-sections.test.mjs 看红在哪条：版本段判据必须能说「不」——修复前那份真实文本（账停在 Unreleased、2.3.3 与 2.4.0 没有段）必须判红，而补齐后必须判绿；`## [2.4.0-rc.1]` 不得冒充 `## [2.4.0]`，正文里出现版本号但**没有标题**不得算成段，并列多个 `## [Unreleased]` 必须红，账读不到正文必须判红而不是跳过，射程为空必须报 vacuous 而不是通过。重点是恒真桩突变：把判据换成 `text.includes(version)`、或把「读不到」写成 `continue`，对应用例必须失效（P-02 / P-03）',
    run() {
      return runNodeTestFile(
        'scripts/gates/changelog-release-sections.test.mjs',
        'changelog 版本段判据的反向自测失败',
      )
    },
  },
  {
    name: 'release-verify-selftest',
    remediation:
      '跑 bash packaging/scripts/release-verify-test.sh 看红在哪条：「已发布产物不许被删、也不许只剩半截」这条判据必须能说「不」。V2/V3 钉住新增的「字节在、清单不全」红灯（2026-09-13 release-restore 把整目录改名留档却只拷回 dmg，清单滞留在 *.replaced-* 里而无人报错）；V4/V5 钉住「清单在、字节没了」与哈希不符；V6 钉住「本机没发布过」不假红；V7/V8 钉住「豁免会过期」——字节已在位却还留着 .lost 判红（2026-09-13 的 2.3.1 由飞书副本找回后正是这形态），而如实宣告的缺席仍判绿；R1/R2/R3 钉住找回时清单随行、不重复留档、哈希不符拒收（ADR-0057 / ADR-0058）',
    run() {
      const script = join(repoRoot, 'packaging', 'scripts', 'release-verify-test.sh')
      const result = runScript(repoRoot, `bash "${script}"`, 120000)
      if (result.code === 0) return { passed: true, violations: [] }
      const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
      const lines = text
        .split('\n')
        .filter((line) => /\[FAIL\]/.test(line))
        .map((line) => line.trim())
      const verdict = result.code === null ? '未给出退出码' : `退出码 ${result.code}`
      return {
        passed: false,
        violations: lines.length > 0 ? lines : [`发布产物判据自测失败（${verdict}）`],
      }
    },
  },
  {
    name: 'shipped-presets-scope-selftest',
    remediation:
      '跑 bash packaging/scripts/select-presets-test.sh 看红在哪条：「预设出货面只能由白名单决定」这条判据必须能说「不」。S2 是本次缺陷的回归钉——2026-09-13 实测 assemble.sh 的整目录 `cp -R ~/.dsh/.agent-presets/.` 把本机自有的机器人助理智能体预设 bobo-cto 静默发进 2.3.0~2.3.3 的 payload（出货 completeness.json 的 presets = 52 条含它）；S3/S4/S5 钉住「登记了但不存在」「岗位数量不符」「登记不写理由」三种腐烂；P1 钉住入口判定在符号链接路径下不许静默不干活；M1 在恒真桩突变下必须失效（ADR-0073）',
    run() {
      const script = join(repoRoot, 'packaging', 'scripts', 'select-presets-test.sh')
      const result = runScript(repoRoot, `bash "${script}"`, 120000)
      if (result.code === 0) return { passed: true, violations: [] }
      const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
      const lines = text
        .split('\n')
        .filter((line) => /\[FAIL\]/.test(line))
        .map((line) => line.trim())
      const verdict = result.code === null ? '未给出退出码' : `退出码 ${result.code}`
      return {
        passed: false,
        violations: lines.length > 0 ? lines : [`预设出货白名单判据自测失败（${verdict}）`],
      }
    },
  },
  {
    name: 'preset-rows-resolvable-selftest',
    remediation:
      '跑 bash packaging/scripts/check-preset-rows-test.sh 看红在哪条：「出货 preset 的每一行必须在出货面里解析得到」这条判据必须能说「不」。S2 是本次缺陷的回归钉——2026-09-14 实测 2.4.0 的 payload 里 presets/agt-033/agent.cordis.yml 带着本机装配行 dsh-kol-hunter-local，客户机的出货 profile 里没有该包（ADR-0056 要求剥掉）→ 客户打开 DSH 时「结伴 · 达人与联盟合作」preset 加载失败；当时的守卫看不见它，因为那条判据是**反向特征**：先在本机 profile 的 file: 依赖里算「外部产品名」再拿去删行，而装配那一刻本机的那半事实已被上一次安装抹掉，脚本如实报告「✓ 出货面没有本机装配的外部产品」。S4/S5 是同一份字节、只换解析面的一对（结论必须相反）——钉住判据看的是出货面而不是本机状态；S3 钉住已登记的行会被剥掉（含紧贴其上的注释，不留下描述「不存在的行」的话）；S6 钉住路径形态的 name 判红并说清是 ADR-0056 的那种坏法；S7/S8/S9 钉住「解析面读不到」「登记处读不到」「登记不写 why」三种都响亮失败而不是退化成「无发现」；S10 钉住过期登记只告警不判红；P1 钉住入口判定在符号链接路径下不许静默不干活；M1 在恒真桩突变下必须失效（ADR-0084）',
    run() {
      const script = join(repoRoot, 'packaging', 'scripts', 'check-preset-rows-test.sh')
      const result = runScript(repoRoot, `bash "${script}"`, 120000)
      if (result.code === 0) return { passed: true, violations: [] }
      const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
      const lines = text
        .split('\n')
        .filter((line) => /\[FAIL\]/.test(line))
        .map((line) => line.trim())
      const verdict = result.code === null ? '未给出退出码' : `退出码 ${result.code}`
      return {
        passed: false,
        violations: lines.length > 0 ? lines : [`出货预设行解析判据自测失败（${verdict}）`],
      }
    },
  },
  {
    name: 'build-path-rewrite-selftest',
    remediation:
      '跑 bash packaging/scripts/rewrite-build-paths-test.sh 看红在哪条：「出货副本里的构建机路径必须换成占位符」这条判据必须改得动、也必须在改不完时喊。R1 钉住五类已知前缀（含带空格的 Application Support 路径）；R2 钉住未登记形态响亮失败；R3 幂等；R4 二进制不误伤；P1 钉住符号链接路径下的入口判定；M1 抹掉一条映射后 R1 必须失效（ADR-0073）',
    run() {
      const script = join(repoRoot, 'packaging', 'scripts', 'rewrite-build-paths-test.sh')
      const result = runScript(repoRoot, `bash "${script}"`, 120000)
      if (result.code === 0) return { passed: true, violations: [] }
      const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
      const lines = text
        .split('\n')
        .filter((line) => /\[FAIL\]/.test(line))
        .map((line) => line.trim())
      const verdict = result.code === null ? '未给出退出码' : `退出码 ${result.code}`
      return {
        passed: false,
        violations: lines.length > 0 ? lines : [`构建机路径改写判据自测失败（${verdict}）`],
      }
    },
  },
  {
    name: 'machine-path-tarball-selftest',
    remediation:
      '跑 bash packaging/scripts/scan-machine-paths-test.sh 看红在哪条：「守卫能看见 payload tarball 里面」这条判据必须能说「不」。T1 钉住 tarball 内的命中被看见且带 tarball 名前缀——2026-09-13 实测守卫在内嵌 profile 上报 `✓ 无新增（当前 37 条，基线 39 条）`，而同一版出货的 skills-presets.tar.gz 解开再扫是 103 个含构建机路径的文件；T2 钉住干净 tarball 判绿；T3 钉住二进制成员不误报；T4 钉住缺失的 tarball 响亮失败；M1 在恒真桩突变下必须失效（ADR-0073）',
    run() {
      const script = join(repoRoot, 'packaging', 'scripts', 'scan-machine-paths-test.sh')
      const result = runScript(repoRoot, `bash "${script}"`, 120000)
      if (result.code === 0) return { passed: true, violations: [] }
      const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
      const lines = text
        .split('\n')
        .filter((line) => /\[FAIL\]/.test(line))
        .map((line) => line.trim())
      const verdict = result.code === null ? '未给出退出码' : `退出码 ${result.code}`
      return {
        passed: false,
        violations: lines.length > 0 ? lines : [`出货 tarball 机器路径判据自测失败（${verdict}）`],
      }
    },
  },
  {
    name: 'shipped-skills-scope-selftest',
    remediation:
      '跑 bash packaging/scripts/select-skills-test.sh 看红在哪条：「技能出货面 = 引用集 ∪ 产品级白名单 − 受限许可」这条判据必须能说「不」。S1 钉住白名单救回未被引用的技能——2026-09-13 实测排除 bobo-cto 后它引用的 15 个工程技能一并掉出（349 → 334），因为它们从未被产品显式要过；S2/S3/S4/S5 钉住名单的四种腐烂（名字不存在、与受限许可同名、缺 why、文件缺失不得当空名单）；S6/S7/S8 钉住落位树必须逐名等于选择结果（少发与多发同罪）；S9 钉住冗余条目仍须打印；P1 钉住符号链接路径下的入口判定；M1 在恒真桩突变下必须失效（ADR-0074）',
    run() {
      const script = join(repoRoot, 'packaging', 'scripts', 'select-skills-test.sh')
      const result = runScript(repoRoot, `bash "${script}"`, 120000)
      if (result.code === 0) return { passed: true, violations: [] }
      const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
      const lines = text
        .split('\n')
        .filter((line) => /\[FAIL\]/.test(line))
        .map((line) => line.trim())
      const verdict = result.code === null ? '未给出退出码' : `退出码 ${result.code}`
      return {
        passed: false,
        violations: lines.length > 0 ? lines : [`技能出货白名单判据自测失败（${verdict}）`],
      }
    },
  },
  {
    name: 'pitfalls-playbook',
    remediation:
      '按 docs/pitfalls-playbook.md 头部写明的契约补齐：每条 `## P-NN · 标题` 必须有「症状 / 根因类 / 已落地机制 / 下一版默认动作」四段；「已落地机制」必须点名真实存在的 `gate:<名字>`（见 node scripts/gate.mjs --list）或 `script:<路径>`——机制没有名字就等于自我安慰；编号自 P-01 起连续；正文相对链接可达（**逐字引用的坏链写进行内代码或代码块即可**——「哪段文字算链接」与 docs-link-integrity 共用同一份实现，不会因为没有第二份拷贝而冤枉引用缺陷原文的条目）；且 AGENTS.md 与 docs/README.md 都必须链接本账（没入口的总账等于不存在）',
    run() {
      return checkPitfallsPlaybook({
        playbookText: readIfExists(join(repoRoot, PLAYBOOK_REL_PATH)),
        // 注册表的**实时**名字列表：条目点名一个被改名或删掉的门禁，当场红灯。
        gateNames: CHECKS.map((check) => check.name),
        fileExists: (path) => existsSync(join(repoRoot, path)),
        backlinkTexts: Object.fromEntries(
          PLAYBOOK_BACKLINK_PATHS.map((path) => [path, readIfExists(join(repoRoot, path))]),
        ),
      })
    },
  },
  {
    name: 'pitfalls-playbook-selftest',
    remediation:
      '跑 node --test scripts/gates/pitfalls-playbook.test.mjs 看红在哪条：总账校验必须能说「不」。缺段/空段/跳号/重号/链接不可达/缺入口各有一条反例，重点是「恒真桩突变」——把每条机制换成「有门禁守着」这类永远成立的免责话，校验必须失效；链接那半另有一对用例（行内代码里逐字引用的坏链不得判红、同段里真实的坏链仍必须判红——那条钉子防的是把「跳过行内代码」做成「跳过一切」）；只会判绿的清单校验比没有校验更坏（P-02 / P-03 / P-07）',
    run() {
      return runNodeTestFile('scripts/gates/pitfalls-playbook.test.mjs', '总账校验的反向自测失败')
    },
  },
  {
    name: 'docs-link-integrity',
    remediation:
      '按报错里的「链接 → 解析后的路径」改正层级：相对链接以**本文件所在目录**为基准。最常见的一种是 Note（住在 docs/notes/<lifecycle>/<class>/ 下）指向 docs/adr/ 的 ADR 时写成两层上溯——正确的三层是 ../../../adr/ADR-00XX.md；写错时它不会「点不开」，而是把「没有依据」伪装成「有依据」。代码块与行内代码里的链接不校验（模板占位符与示例不算链接）',
    run() {
      return checkDocsLinkIntegrity({
        docs: collectDocFiles(),
        fileExists: (path) => existsSync(join(repoRoot, path)),
      })
    },
  },
  {
    name: 'docs-link-integrity-selftest',
    remediation:
      '跑 node --test scripts/gates/docs-links.test.mjs 看红在哪条：文档链接校验必须能说「不」（层级少写一层要判红并报出解析后的错误路径），也必须不误报（代码块模板占位符、行内代码示例、外链、页内锚点、带锚点的相对链接都不该判红）——会误报的校验很快会被当成噪声关掉（P-02）；「哪段文字算链接」这条规则与 pitfalls-playbook 共用 `scripts/gates/checks.mjs` 的 `collectDocLinks`，本用例是它唯一的钉子（把规则改回「不跳行内代码」，这里必须红）',
    run() {
      return runNodeTestFile('scripts/gates/docs-links.test.mjs', '文档链接校验的反向自测失败')
    },
  },
  {
    name: 'dead-instrument',
    remediation:
      '按报错把那处判据换掉：登记簿（scripts/gates/dead-instruments.json）里每一条都是**实测过会给出空读数**的仪器——空读数被当成结论，是 2026-09-13 白屏那类事故的成因。替代物写在登记项的 useInstead 里（例如「在不在跑」用 script:packaging/scripts/dsh-running.sh，退出码 0/1/2/4，4 = 判不了必须中止）。若该处是**引用**它作反例，把仪器片段写成「…」引用形式即可（仓库约定）。新增一条登记项门槛同 pitfalls-playbook：可复现的命令 + 原始读数 + 替代物，缺一判红（ADR-0080）',
    run() {
      const files = collectPrescriptionSurfaces()
      if (files === null) {
        // 取不到射程必须判红：静默变成「没扫」就等于这条判据不存在（P-02）。
        return {
          passed: false,
          violations: ['git ls-files 取不到射程——本项本次未核对任何文件（不是「都干净」）'],
        }
      }
      return checkDeadInstrument({
        registryText: readIfExists(join(repoRoot, DEAD_INSTRUMENTS_PATH)) ?? '',
        files,
      })
    },
  },
  {
    name: 'dead-instrument-selftest',
    remediation:
      '跑 node --test scripts/gates/dead-instrument.test.mjs 看红在哪条：本项必须能说「不」——**用 2026-09-13 的缺陷原文**（SOP §0 那条 `pgrep -f` 检查项）配**真登记簿**当输入必须判红、围栏代码块里的同一句也必须判红、脚本代码行里的使用必须判红，而「…」引用形式与散文提及必须放行（那是决定，不是遗漏）；空登记簿、登记项缺证据字段、射程为空、判据面抽出 0 行都必须判红。M3 是恒真桩突变：把模式换成永不匹配的串，缺陷原文就必须漏过——否则拦住它的不是登记簿内容（P-02 / P-03）',
    run() {
      return runNodeTestFile('scripts/gates/dead-instrument.test.mjs', '死仪器判据的反向自测失败')
    },
  },
  {
    name: 'dsh-running-selftest',
    remediation:
      '跑 bash packaging/scripts/dsh-running-test.sh 看红在哪条：判据必须能说「不」——R1 造出的真进程在跑时→0，R3 **同一条路径、同一份字节**、进程退出后→1（读数跟着进程在不在变），R2 同目录未运行的邻居必须判 1（防「见谁都算命中」），R4 `ps` 读不出→4 而**不是** 1（读不到 ≠ 没有在跑），R5 用法错误→2，R6a~R6c 用受控进程表钉住 `--any` 的尾锚定，R7 在真实靶子上对照；M1/M2 恒真桩突变证明 R1/R3 有牙（ADR-0080）',
    run() {
      const script = join(repoRoot, 'packaging', 'scripts', 'dsh-running-test.sh')
      const result = runScript(repoRoot, `bash "${script}"`, 120000)
      if (result.code === 0) return { passed: true, violations: [] }
      const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
      const lines = text
        .split('\n')
        .filter((line) => /\[FAIL\]/.test(line))
        .map((line) => line.trim())
      const verdict = result.code === null ? '未给出退出码' : `退出码 ${result.code}`
      return { passed: false, violations: lines.length > 0 ? lines : [`运行中判据自测失败（${verdict}）`] }
    },
  },
  {
    name: 'installer-running-guard-selftest',
    remediation:
      '跑 bash packaging/scripts/installer-running-guard-test.sh 看红在哪条：安装器 0b 闸守白屏红线，必须**正确消费**那条共享判据——T1 没有实例在跑→放行，T2 实例在跑且退不出去→中止（不得继续替换 app bundle），T3 载荷缺 tools/dsh-running.sh→中止（缺判据 ≠ 没有实例在跑），T4 退出码 4（判不了）→中止且不得打印「无运行中的 DSH 实例」，M1 恒真桩突变证明 T4 有牙。抽不出完整的 0b 块同样判红，不静默变成空转（ADR-0080）',
    run() {
      const script = join(repoRoot, 'packaging', 'scripts', 'installer-running-guard-test.sh')
      const result = runScript(repoRoot, `bash "${script}"`, 120000)
      if (result.code === 0) return { passed: true, violations: [] }
      const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
      const lines = text
        .split('\n')
        .filter((line) => /\[FAIL\]|\[自测\]/.test(line))
        .map((line) => line.trim())
      const verdict = result.code === null ? '未给出退出码' : `退出码 ${result.code}`
      return { passed: false, violations: lines.length > 0 ? lines : [`安装器 0b 闸自测失败（${verdict}）`] }
    },
  },
  {
    name: 'brand-icons',
    remediation:
      '按报错对齐三处的**同一张表**（它在 dsh-patches/brand-replay.sh 的 ICON_PAIRS 里）：表 ↔ 资产目录 `packaging/assets/brand-icons/` ↔ 已装 app 的 `app.asar.unpacked/build/`。少一个资产、多一个没被引用的资产、资产的实际像素与声明不符、目标名重复、已装 app 里没有那个目标名——都判红。重点在**资产那一侧**：`brand-replay.sh --apply` 量的是目标尺寸，资产自己错了没人管，`cp` 照落（Dock 图标成一张放大的模糊图而读数全绿，ADR-0081）',
    run() {
      const dir = join(repoRoot, BRAND_ICONS_ASSETS_DIR)
      const assets = existsSync(dir)
        ? readdirSync(dir)
            .sort()
            .map((name) => ({ name, bytes: readFileSync(join(dir, name)) }))
        : []
      // 目标侧（已装 app）：读不到就传 null —— 那是「未核查」，本项会报 skip 而不是通过。
      const buildDir = join(
        '/',
        'Applications',
        'DSH Desktop.app',
        'Contents',
        'Resources',
        'app.asar.unpacked',
        'build',
      )
      let installedBuildDirEntries = null
      try {
        installedBuildDirEntries = readdirSync(buildDir)
      } catch {
        installedBuildDirEntries = null
      }
      return checkBrandIcons({
        replayText: readIfExists(join(repoRoot, BRAND_REPLAY_REL)) ?? '',
        assets,
        installedBuildDirEntries,
      })
    },
  },
  {
    name: 'brand-icons-selftest',
    remediation:
      '跑 node --test scripts/gates/brand-icons.test.mjs 看红在哪条：本项必须能说「不」——资产实际像素与声明不符必须判红（M1 恒真桩突变钉住这一条：只比「声明 vs 声明」的实现会放过它，因为那不是从磁盘字节读出来的）、少一个/多一个资产都判红、目标名重复判红、表解析不出任何一行判红、已装 app 缺目标名判红、非 PNG 读不出尺寸判红，而目标侧不在射程时必须报 skip 且静态半照常说话（ADR-0081 / P-02 / P-07）',
    run() {
      return runNodeTestFile('scripts/gates/brand-icons.test.mjs', '运行时图标资产判据的反向自测失败')
    },
  },
  {
    name: 'brand-replay-selftest',
    remediation:
      '跑 bash packaging/scripts/brand-replay-test.sh 看红在哪条：第 5 块是**写**路径（把 Dock / 托盘图标从官方原样换成品牌态），静态判据只能守表与资产一致，「落笔写了什么字节」只有真跑一次才知道——R1 报出 8 处 DRIFT、R2 落笔 8 处、**R3 逐字节等于资产（sha256）**、R4 重跑幂等全 OK、R5 目标尺寸与声明不符时**拒绝落笔**（那意味着基座换了图标规格）、R6 资产目录为空时判 MISSING（读不到 ≠ 合格），M1 恒真桩突变证明 R3 比的是真资产。夹具是**不完整**的假 app，故只断言 build/ 那几行、不断言收尾判决行与退出码（原因见脚本头部，ADR-0081）',
    run() {
      const script = join(repoRoot, 'packaging', 'scripts', 'brand-replay-test.sh')
      const result = runScript(repoRoot, `bash "${script}"`, 120000)
      if (result.code === 0) return { passed: true, violations: [] }
      const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
      const lines = text
        .split('\n')
        .filter((line) => /\[FAIL\]|\[自测\]/.test(line))
        .map((line) => line.trim())
      const verdict = result.code === null ? '未给出退出码' : `退出码 ${result.code}`
      return { passed: false, violations: lines.length > 0 ? lines : [`品牌重放自测失败（${verdict}）`] }
    },
  },
  {
    name: 'changed-packages',
    remediation: '为本次改动的包补 typecheck 与 test 脚本，或按 ADR-0014 登记豁免（只减不增）',
    run() {
      const manifests = collectManifests().filter((entry) => entry.dir !== '.')
      const exempted = JSON.parse(readIfExists(EXEMPTIONS_PATH) || '[]').map((row) => row.package)
      return checkChangedPackages({
        changed: changedPackages(manifests),
        packages: manifests,
        exempted,
      })
    },
  },
  {
    name: 'exemptions-frozen',
    remediation: '不得新增豁免条目；补齐后请删除条目，期限不可延后（ADR-0014）',
    run() {
      const baselineExists = baselineExemptionsExist()
      return checkExemptions({
        exemptions: JSON.parse(readIfExists(EXEMPTIONS_PATH) || '[]'),
        baseline: baselineExists ? readBaselineExemptions() : [],
        today: new Date().toISOString().slice(0, 10),
        baselineExists,
      })
    },
  },
  {
    name: 'patch-anchors',
    modes: ['full'],
    remediation:
      '运行 packaging/verify-patches-v2.sh 看 MISSING/FAIL 明细；补丁确实丢失时需重打并按 ADR-0018 的教训改用稳定锚（勿依赖内容哈希文件名）。注意本项的**射程**：只量本机 /Applications 与**未打 tag** 的 staging 树——打过 tag 的版本由产物（DMG + 入库清单哈希，ADR-0067）负责，不在这里量（ADR-0075）',
    run() {
      const script = join(repoRoot, 'packaging', 'verify-patches-v2.sh')
      /** 跑一棵 app 树，返回 { tree, passed, lines }。 */
      const checkTree = (tree) => {
        const result = runScript(repoRoot, `DSH_APP="$DSH_APP_TEST" bash "${script}"`, 300000, { DSH_APP_TEST: tree })
        // 两个流都要扫：这里是按正则**过滤**，不存在 ADR-0043 的「体量大的流挤掉小的」
        // 问题——那位移只在按位置截尾时发生。锚点明细写在哪个流由脚本自己决定。
        const lines = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
          .split('\n')
          .filter((line) => /^(MISSING|FAIL)/.test(line))
        const verdict =
          result.code === null
            ? `补丁锚点校验未给出退出码${result.note ? `（${result.note}）` : ''}`
            : `补丁锚点校验失败（退出码 ${result.code}）`
        return { passed: result.code === 0, lines: lines.length > 0 ? lines : [verdict] }
      }
      // 两处 target，判据同一条：
      //   ① 本机 /Applications —— 开发机运行时真值（未安装则不在射程内）；
      //   ② packaging/staging/*/app —— **待发布**的装配产物。加这一处是因为「装配产物里补丁丢了」
      //      与「本机 app 里补丁在」可以同时成立：P0-9(RootOutlet) 曾长期只在本机 app 上，
      //      而 staging 树发的是 pristine（.scratch/pre-dmg-diagnosis B3）。
      //
      // 射程曾经是「staging 下**所有** app 树」，于是它把**随时间单调增长的锚点清单**套到
      // **随时间累积的历史产物**上：任何一棵在「某条锚」出现之前装配的树都永久判红，而这个红
      // 与「本次装配把补丁弄丢了」在输出上不可区分——清理历史于是成了让本项变绿的唯一手段。
      // 而且它的绿也不可信：实测 `staging/2.3.1/app` 在该版发布之后被就地改过（守卫文件 mtime
      // 晚于发布时刻），那棵树的绿不证明任何出厂字节。判据移入 gates/patch-anchor-scope.mjs
      // （纯函数 + 反向自测），射程 = 本机 app ∪ 未打 tag 的树；射程为空时报**跳过**，不报通过。
      const appDir = join('/', 'Applications', 'DSH Desktop.app')
      const appInstalled = existsSync(join(appDir, 'Contents', 'Resources', 'app.asar.unpacked'))
      const stagingRoot = join(repoRoot, 'packaging', 'staging')
      const stagingVersions = existsSync(stagingRoot)
        ? readdirSync(stagingRoot).filter((version) =>
            existsSync(
              join(stagingRoot, version, 'app', 'DSH Desktop.app', 'Contents', 'Resources', 'app.asar.unpacked'),
            ),
          )
        : []
      const scope = selectAnchorTargets({
        stagingVersions,
        taggedVersions: releasedVersions(),
        appInstalled,
      })
      if (scope.vacuous) {
        // 「没量任何东西」与「量了都合格」必须分开报：空射程报 skip（见 ADR-0075 / P-02）。
        return {
          passed: true,
          skipped: true,
          violations: [],
          note: `${scope.note}——本项本次**未校验任何树**（不是「补丁都在」）`,
        }
      }
      const targets = [
        ...(scope.checkInstalledApp ? [appDir] : []),
        ...scope.scanStaging.map((version) => join(stagingRoot, version, 'app', 'DSH Desktop.app')),
      ]
      const violations = []
      for (const tree of targets) {
        const { passed, lines } = checkTree(tree)
        if (!passed) violations.push(...lines.map((line) => `${relative(repoRoot, tree)}: ${line}`))
      }
      return { passed: violations.length === 0, violations, note: scope.note }
    },
  },
  {
    name: 'patch-anchors-scope-selftest',
    remediation:
      '跑 node --test scripts/gates/patch-anchor-scope.test.mjs 看红在哪条：扫描集判据必须能说「不」——已打 tag 的树必须退出扫描、未打 tag 的（含同号重制的新树）必须纳入、射程为空必须报空而不是报通过。重点是恒真桩突变：把过滤换成「无条件纳入」或把空射程恒置 false，用例必须失效；测不出来的判据等于没有判据（P-02 / P-11）',
    run() {
      return runNodeTestFile('scripts/gates/patch-anchor-scope.test.mjs', '补丁锚点扫描集判据的反向自测失败')
    },
  },
  {
    name: 'dmg-layout-doc',
    remediation:
      '按报错改正三选一：①SOP 里又在复述卷内清单（或断言了拖拽式交付形态）→ 把那份清单换掉，改成指向 packaging/INSTALL-GUIDE.md 第 2 节的名字，让本条去做两向对照；②卷与入口表逐名对不上 → 判断哪边是对的那个，然后改另一边（新增载荷文件要登记进手册，手册里写的文件必须真的在卷上）；③手册**正文里**的链接指向未随包的文件（R6）→ 要么把它加进载荷，要么把链接改成指向手册自己的章节——链接在**仓库里**可达不等于**随包**可达（2026-09-14 实测：手册开头的 `[安装卡](INSTALL-CARD.md)` 自 2.2.0 起从未进过任何一版载荷，而所有门禁都绿）。⚠️ 已打 tag 的版本不在射程内（它由产物自己冻结，ADR-0067）——读数里的「不参与」点名了它们是哪些',
    run() {
      // 交付形态是**产物**的属性，不是**文档**的属性（ADR-0077 / P-14）。
      // 2026-09-13 实测：SOP §5 三处描述的是上一版的形态（可拖拽安装盘），而 2.3.3 是离线安装器
      // 载荷——§5.1 的 codesign 路径在那个目录下根本不存在、§5.2 断言卷根有 .app 与 Applications
      // 快捷方式、§5.4 教用户把 app 拖进 /Applications。三处都判不出，因为没有任何判据把
      // 「文档断言的清单」与「产物真实的清单」比过一次。
      const sopText = readIfExists(join(repoRoot, DMG_LAYOUT_SOP_PATH))
      const guideText = readIfExists(join(repoRoot, DMG_LAYOUT_GUIDE_PATH))

      // 射程两处：① 已挂载的交付卷；② packaging/staging/ 下**未打 tag** 的 payload。
      // 与 patch-anchors 同一条规矩：射程跟着 git 走，不跟着磁盘走（ADR-0075 / P-11）。
      const volumes = []
      try {
        for (const name of readdirSync('/Volumes')) {
          if (!name.startsWith('DSH Desktop LUTE ')) continue
          const label = join('/Volumes', name)
          const version = name.slice('DSH Desktop LUTE '.length).trim() || undefined
          volumes.push({ label, version, entries: readdirSync(label) })
        }
      } catch {
        // /Volumes 读不到：不猜，直接当没有卷——射程为空会如实报 skip。
      }
      const stagingRoot = join(repoRoot, 'packaging', 'staging')
      const payloads = existsSync(stagingRoot)
        ? readdirSync(stagingRoot)
            .sort()
            .map((version) => ({ version, dir: join(stagingRoot, version, 'payload') }))
            .filter(({ dir }) => existsSync(dir))
        : []
      // 交付卷的版本号取卷名；payload 的版本号取目录名——两者由同一个 tag 家判「是否已发布」。
      const scope = selectLayoutTargets({
        volumes: volumes.map(({ label, version }) => ({ label, version })),
        payloadVersions: payloads.map(({ version }) => version),
        taggedVersions: releasedVersions(),
      })
      const inScope = [
        ...scope.scanVolumes.map(({ label }) => ({
          label,
          entries: volumes.find((volume) => volume.label === label)?.entries ?? [],
          // R6 要判**嵌套**链接（如 `tools/verify-patches-v2.sh`）是否随包，
          // 顶层条目不够——只给顶层就等于用「tools/ 这个目录在」冒充「那个文件在」。
          files: listFilesRecursive(label),
        })),
        ...scope.scanPayloads.map((version) => {
          const dir = join(stagingRoot, version, 'payload')
          return {
            label: `packaging/staging/${version}/payload`,
            entries: readdirSync(dir),
            files: listFilesRecursive(dir),
          }
        }),
      ]
      const result = checkDmgLayout({ sopText, guideText, artifacts: inScope })
      if (result.skipped) {
        // 「没量到任何东西」与「量了都合格」必须分开报（ADR-0075 / P-02）。
        return { ...result, note: `${result.note}（${scope.note}）` }
      }
      return { ...result, note: result.note ? `${result.note}（${scope.note}）` : scope.note }
    },
  },
  {
    name: 'dmg-layout-doc-selftest',
    remediation:
      '跑 node --test scripts/gates/dmg-layout.test.mjs 看红在哪条：交付卷形态判据必须能说「不」——SOP 没指向安装手册要判红、**用 2026-09-13 缺陷原文**（「应看到 DSH Desktop.app 与 Applications 快捷方式」）当输入必须判红、卷上有手册没登记的文件与手册登记了卷上没有的文件都必须判红、标为「✅ 可点入口」的项不存在必须判红、入口表解析不出条目时必须判红而不是当作「没什么可比的」放行、射程为空必须报 skip 而不是 ok（且静态半仍然说话）。R6 另有四例：手册正文链接的随包文件不在卷上必须判红（**用 2026-09-14 的缺陷原文** `](INSTALL-CARD.md)` 当输入）、外链/锚点/绝对路径必须被忽略而不得误报、嵌套链接必须按递归清单判（给 `tools/` 目录存在而里面的文件不在时必须红）、未给递归清单时嵌套链接必须计入「未核」而不得当作可达。重点是恒真桩突变：一个只检查「SOP 有没有链接安装手册」的实现会放过缺陷原文，一个只看顶层条目的实现会放过嵌套死链——测不出来的判据等于没有判据（P-02 / P-03）',
    run() {
      return runNodeTestFile('scripts/gates/dmg-layout.test.mjs', '交付卷形态判据的反向自测失败')
    },
  },
  {
    name: 'staging-freshness',
    modes: ['full'],
    remediation: '删掉陈旧 staging（rm -rf packaging/staging/<版本>）后重新装配：产物必须与仓库同源，否则「跑的是旧件」——历史两次教训见 packaging/RETROSPECTIVE.md 与 .scratch/pre-dmg-pipeline/spec.md 的 A1',
    run() {
      // 出货工具（payload/tools/*）必须与仓库同源。动机：2026-09-11 的 2.1.0 payload 是
      // 11:05 的快照，而当天 21:29~23:31 才修好 verify-patches-v2 的默认路径、install.sh、
      // sign-and-dmg、smoke——直接对那份 payload 制 dmg，客户跑校验工具默认必红。
      const stagingRoot = join(repoRoot, 'packaging', 'staging')
      if (!existsSync(stagingRoot)) return { passed: true, violations: [] }
      const pairs = [
        ['payload/tools/verify-patches-v2.sh', 'packaging/verify-patches-v2.sh'],
        ['payload/tools/rewrite-file-deps.mjs', 'packaging/scripts/rewrite-file-deps.mjs'],
        ['payload/tools/reloc-aeis.sh', 'packaging/scripts/reloc-aeis.sh'],
        ['payload/tools/dsh-running.sh', 'packaging/scripts/dsh-running.sh'],
        ['payload/install.sh', 'packaging/installer/install.sh'],
      ]
      const violations = []
      for (const version of readdirSync(stagingRoot).sort()) {
        const payload = join(stagingRoot, version, 'payload')
        if (!existsSync(payload)) continue
        for (const [inPayload, inRepo] of pairs) {
          const a = join(payload, inPayload)
          const b = join(repoRoot, inRepo)
          if (!existsSync(a)) continue // 载荷没带这件工具（早代 payload 可能没有）→ 不判
          if (!existsSync(b)) continue
          if (!readFileSync(a).equals(readFileSync(b))) {
            violations.push(`packaging/staging/${version}/${inPayload} 与仓库 ${inRepo} 不同源（陈旧快照，勿据此制 dmg）`)
          }
        }
      }
      return { passed: violations.length === 0, violations }
    },
  },
  {
    name: 'worktable-fence',
    modes: ['full'],
    remediation: '若 dependencies / bundles / node_modules 任一处又出现 dsh-worktable：把它摘掉（ADR-0045）；若报「资产缺失」，从 git 恢复 vendor/dsh-worktable.pin 与 dsh-patches/worktable-fence/（卸载保留资产是为了可逆，不是漏删）',
    run() {
      // 环境相关：vendor 未 clone 时由 checkWorktableFence 自身报告跳过；但**安装面三项
      // 不依赖 vendor**，照判——否则一个漏装的插件正好能让这条判据静默消失。
      return checkWorktableFence({
        repoRoot,
        profileDir: join(homedir(), '.dsh', 'profiles', 'desktop'),
      })
    },
  },
  {
    name: 'node-interpreter',
    remediation: '开发脚本起子进程一律走 scripts/lib/real-node.mjs 的 nodeCommand()——process.execPath 在 pnpm 下是宿主 Electron，子进程会「退出码 0 且没有输出」（ADR-0040）',
    run() {
      return checkNodeInterpreter({ repoRoot })
    },
  },
  {
    name: 'sidebar-row-axis',
    remediation: '把该行的 `box-sizing` / `width` / 水平 `margin` / 水平 `padding` 改成与同列一致（导航列 = 原生侧边栏行轴 `box-sizing: border-box; width: 100%; margin: 2px 0; padding: 0 10px`，实测行框 64…320、标签 x=106）；新增注入行则在 scripts/gates/sidebar-row-axis.mjs 的 REGISTRY 加一行。两行并排却各带一套宽度约定，就是 2026-09-13 那次的形态（P-07）',
    run() {
      return checkSidebarRowAxis({ repoRoot })
    },
  },
  {
    name: 'sidebar-row-axis-selftest',
    remediation:
      '跑 node --test scripts/gates/sidebar-row-axis.test.mjs 看红在哪条：行轴判据必须能说「不」——岗位矩阵退回 `width: calc(100% - 8px)` + `margin: 2px 4px` 必须判红、技能中心丢掉 `box-sizing` 必须判红、两行 `padding-inline` 不同必须判红、新增未登记的注入行必须判红、登记项指向不存在入口必须判红、`position` 从 after 改成 split 必须判红、选择器改名后必须判红而不是静默失去射程、射程为空必须判红而不是报通过。重点是恒真桩突变：一个只核对「登记了没有」的实现会放过行轴漂移——测不出来的判据等于没有判据（P-02 / P-03）',
    run() {
      return runNodeTestFile('scripts/gates/sidebar-row-axis.test.mjs', '注入式侧边栏行轴判据的反向自测失败')
    },
  },
  {
    name: 'theme-tokens',
    modes: ['full'],
    remediation: '改用真实 token（官方主题包或 dsh-theme-local 供给的名字）；存量违规登记在 scripts/gates/theme-tokens-baseline.json，该文件只减不增、条目失效即拒绝（ADR-0014、ADR-0028 的 C2 验收）',
    run() {
      const appDir = join('/', 'Applications', 'DSH Desktop.app')
      // 环境相关：app 未安装时由 checkThemeTokens 自身报告跳过（与 patch-anchors 同一语义）。
      return checkThemeTokens({
        repoRoot,
        appDir,
        baseline: JSON.parse(readIfExists(THEME_TOKENS_BASELINE_PATH) || '[]'),
      })
    },
  },
]

/** 豁免登记文件（仓库根相对路径）。 */
const EXEMPTIONS_PATH = 'scripts/gates/exemptions.json'

/** 幻觉 token 基线（仓库根相对路径，只减不增）。 */
const THEME_TOKENS_BASELINE_PATH = 'scripts/gates/theme-tokens-baseline.json'

/** 扫描时不进入的目录：第三方源码、VCS 元数据与装配产物（本检查只针对仓库自有脚本）。 */
const SHELL_SCAN_SKIP_DIRS = new Set(['node_modules', '.git', 'vendor'])

/**
 * 收集全仓 shell 脚本供 `shell-var-multibyte` 校验（ADR-0064）。
 * 范围 = `*.sh`（排除 `.bak` 备份），跳过 node_modules / .git / vendor / packaging/staging。
 * 只扫 shell：本陷阱是 bash 词法问题，别的语言里同样两个相邻字面量不会出事。
 * @returns {Array<{relPath: string, text: string}>}
 */
function collectShellScripts() {
  const out = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      const rel = relative(repoRoot, full)
      if (entry.isDirectory()) {
        if (SHELL_SCAN_SKIP_DIRS.has(entry.name)) continue
        if (rel === join('packaging', 'staging')) continue
        walk(full)
        continue
      }
      if (!entry.name.endsWith('.sh') || entry.name.endsWith('.bak')) continue
      out.push({ relPath: rel, text: readFileSync(full, 'utf8') })
    }
  }
  walk(repoRoot)
  return out
}

/**
 * 列出 git 索引里的文件（仓库根相对路径）；git 不可用时返回 `null`。
 *
 * 为什么跟着 git 走而不是走磁盘：`packaging/staging/`、`release/`、`.dsh-types/` 这些
 * 产物/生成目录里有几千个同名文件（实测磁盘 4664 个 `*.md`，索引里只有 423 个），
 * 走磁盘会让射程被产物淹没；而「射程跟着 git 走，不跟着磁盘走」是本仓库既有的规矩
 * （ADR-0075 / P-11）。返回 `null` 而不是空数组：调用方必须能把「取不到射程」与
 * 「射程真的是空的」分开（P-02）。
 * @returns {string[]|null}
 */
function gitLsFiles() {
  try {
    const out = execFileSync('git', ['-C', repoRoot, 'ls-files', '-z'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    })
    return out.split('\0').filter(Boolean)
  } catch {
    return null
  }
}

/**
 * 收集「判据面」文件供 `dead-instrument` 校验（ADR-0080）。
 *
 * 判据面 = 会被人**照着跑**的地方 = `*.md`（清单行 + 围栏代码块）与 `*.sh` / `*.bash`
 * （去掉注释后仍有内容的行）。射程取 git 索引（含已 `git add` 的），故草稿不扫。
 * @returns {Array<{relPath: string, text: string}>|null} git 不可用时返回 `null`
 */
function collectPrescriptionSurfaces() {
  const tracked = gitLsFiles()
  if (tracked === null) return null
  return tracked
    .filter((rel) => rel.endsWith('.md') || rel.endsWith('.sh') || rel.endsWith('.bash'))
    .map((rel) => ({ relPath: rel, text: readIfExists(join(repoRoot, rel)) ?? '' }))
}

/**
 * 跑一个 `node:test` 测试文件，把失败用例名抽成门禁的违规明细。
 *
 * 为什么不用 `process.execPath`：在 pnpm 生命周期脚本下它是**宿主 Electron 可执行文件**，
 * Electron 不认为自己在当 node 而是再开一个 app 实例，单实例锁之下立刻以 0 退出——
 * 父进程看到的是「退出码 0、stdout 空」，而 `runScript` 只读退出码，
 * 于是**测试一条都没跑也会判绿**（ADR-0040 / `scripts/lib/real-node.mjs`）。
 * 这正是总账 P-02「仪器假绿」的形状，所以这里必须走 `nodeCommand()`。
 * @param {string} relPath 测试文件的仓库根相对路径
 * @param {string} failureLabel 没有任何可解析失败行时的兜底说明
 * @returns {{passed: boolean, violations: string[]}}
 */
function runNodeTestFile(relPath, failureLabel) {
  const { command, env } = nodeCommand()
  const script = join(repoRoot, relPath)
  const result = runScript(repoRoot, `"${command}" --test "${script}"`, 120000, env)
  if (result.code === 0) return { passed: true, violations: [] }
  const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
  const lines = text
    .split('\n')
    .filter((line) => /^\s*✖/.test(line) || /AssertionError/.test(line))
    .map((line) => line.trim())
  const verdict = result.code === null ? '未给出退出码' : `退出码 ${result.code}`
  return { passed: false, violations: lines.length > 0 ? lines : [`${failureLabel}（${verdict}）`] }
}

/**
 * 收集 `docs-link-integrity` 要校验的文档：`docs/` 全部 Markdown + 仓库根的两份。
 *
 * 范围是刻意的：包内文档（各包的 `docs/`、`packaging/` 下的 Markdown）是另一个面，
 * 未纳入本项。边界写在 `scripts/gates/docs-links.mjs` 的模块注释里。
 * @returns {Array<{path: string, text: string}>}
 */
function collectDocFiles() {
  const out = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.md')) out.push({ path: relative(repoRoot, full), text: readFileSync(full, 'utf8') })
    }
  }
  walk(join(repoRoot, 'docs'))
  for (const rel of ['AGENTS.md', 'README.md']) {
    if (existsSync(join(repoRoot, rel))) out.push({ path: rel, text: readFileSync(join(repoRoot, rel), 'utf8') })
  }
  return out
}

/**
 * 收集受管包 node_modules 顶层作用域内的符号链接及其可达性。
 * @returns {Array<{from: string, target: string, exists: boolean}>}
 */
function collectDependencyLinks() {
  const links = []
  for (const entry of collectManifests()) {
    if (entry.dir === '.') continue
    const modulesDir = join(repoRoot, entry.dir, 'node_modules')
    if (!existsSync(modulesDir)) continue
    for (const scope of readdirSync(modulesDir)) {
      if (!scope.startsWith('@')) continue
      const scopeDir = join(modulesDir, scope)
      if (!statSync(scopeDir).isDirectory()) continue
      for (const pkg of readdirSync(scopeDir)) {
        const linkPath = join(scopeDir, pkg)
        if (!lstatSync(linkPath).isSymbolicLink()) continue
        const target = readlinkSync(linkPath)
        links.push({
          from: `${entry.dir}/node_modules/${scope}/${pkg}`,
          target,
          exists: existsSync(linkPath),
        })
      }
    }
  }
  return links
}

/**
 * 判断仓库里某个路径有没有被 git 跟踪（至少一个文件）。
 * 用于 package-scripts 的顺序判据：产物入库与否决定 build 该在 test 之前还是之后。
 * @param {string} relPath 仓库相对路径
 * @returns {boolean} 是否有被跟踪的文件
 */
function isGitTracked(relPath) {
  try {
    const out = execFileSync('git', ['-C', repoRoot, 'ls-files', '--', relPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return out.trim() !== ''
  } catch {
    return false
  }
}

/**
 * 逐个运行受管包声明的 typecheck / test / build 脚本，收集真实退出码。
 * 只用于 full 模式：逐包执行耗时较长，且需要各包 node_modules 已安装。
 *
 * 顺序不是固定的：产物（main 指向的根目录，通常 lib/）未入库时按
 * typecheck → build → test，已入库时按 typecheck → test → build。
 * 判据与实测见 ADR-0055 与 scripts/gates/dependency-reproducibility.mjs 的 packageScriptOrder。
 * @returns {Array<{relPath: string, scripts: Record<string, string>, results: Record<string, {code: number|null, stdout: string, stderr: string, note?: string}>}>}
 */
function runPackageScripts() {
  const timeoutMs = 180000
  return collectManifests()
    .filter((entry) => entry.dir !== '.')
    .map((entry) => {
      const scripts = entry.manifest.scripts ?? {}
      const results = {}
      const order = packageScriptOrder({
        hasBuild: Boolean(scripts.build),
        buildOutputTracked: isGitTracked(join(entry.dir, buildOutputRoot(entry.manifest))),
      })
      for (const key of order) {
        if (!scripts[key]) continue
        results[key] = runScript(join(repoRoot, entry.dir), scripts[key], timeoutMs)
      }
      return { relPath: entry.dir, scripts, results }
    })
    .filter((entry) => Object.keys(entry.results).length > 0)
}

/**
 * 找出本次改动涉及的受管包（未提交改动 ∪ 与 main 的差异）。
 * @param {Array<{dir: string}>} manifests 受管包清单
 * @returns {string[]} 包相对路径
 */
function changedPackages(manifests) {
  const files = new Set()
  for (const args of [
    ['diff', '--name-only', 'HEAD'],
    ['diff', '--name-only', '--cached'],
    ['diff', '--name-only', 'main...HEAD'],
  ]) {
    try {
      const out = execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      for (const line of out.split('\n')) if (line) files.add(line)
    } catch {
      // main 不存在或仓库无该引用时忽略该来源
    }
  }
  const changed = new Set()
  for (const entry of manifests) {
    const prefix = `${entry.dir}/`
    if ([...files].some((file) => file === entry.dir || file.startsWith(prefix))) changed.add(entry.dir)
  }
  return [...changed]
}

/**
 * 判断豁免登记文件是否已存在于 git HEAD（未入库即处于初始登记引导期）。
 * @returns {boolean}
 */
function baselineExemptionsExist() {
  try {
    execFileSync('git', ['-C', repoRoot, 'cat-file', '-e', `HEAD:${EXEMPTIONS_PATH}`], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/**
 * 从 git HEAD 读取豁免登记基线；文件尚未入库或仓库尚无提交时返回空数组。
 * @returns {Array<Record<string, unknown>>}
 */
function readBaselineExemptions() {
  try {
    const text = execFileSync('git', ['-C', repoRoot, 'show', `HEAD:${EXEMPTIONS_PATH}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return JSON.parse(text)
  } catch {
    return []
  }
}

/** 列出 docs/adr 下的 ADR 文件（仓库根相对路径）。 */
function listAdrFiles() {
  const dir = join(repoRoot, 'docs', 'adr')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => /^ADR-\d{4}\.md$/.test(name))
    .sort()
    .map((name) => `docs/adr/${name}`)
}

/**
 * 收集仓库根与全部受管包的清单（根包自身也受身份契约约束）。
 * 与目录墙生成器共用 collectPackages，避免两侧包集合分叉。
 * @returns {Array<{dir: string, manifest: Record<string, unknown>}>}
 */
function collectManifests() {
  const { rootManifest, packages } = collectPackages(repoRoot)
  return [
    { relPath: '.', dir: '.', manifest: rootManifest },
    ...packages.map((entry) => ({
      relPath: entry.relPath,
      dir: entry.relPath,
      group: entry.group,
      manifest: entry.manifest,
    })),
  ]
}

/** 读取子模块实际 HEAD；未初始化或不可读时返回 undefined。 */
function submoduleHead() {
  const path = join(repoRoot, 'vendor', 'dsh-desktop', 'deepseek-harness')
  try {
    return execFileSync('git', ['-C', path, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return undefined
  }
}

function readIfExists(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

/**
 * 已打 tag 的版本号（去掉 `v` 前缀）。
 *
 * 这是「某版本已发布」的**权威家**（ADR-0058：清单入库 → 打 tag，tag 才担保得住字节），
 * 给 `patch-anchors` 定射程用：打过 tag 的版本不再由发布前门禁度量。
 *
 * 读不到 tag（浅克隆、新克隆、git 不可用）时返回空数组——**默认错误方向选「多量」**：
 * 判据宁可多量几棵已发布的树，也不能因为读不到 tag 而把一棵待发布的新树放行。
 *
 * @returns {string[]}
 */
function releasedVersions() {
  try {
    return execFileSync('git', ['-C', repoRoot, 'tag', '--list', 'v*'], { encoding: 'utf8' })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((tag) => tag.replace(/^v/, ''))
  } catch {
    return []
  }
}

/**
 * 已入库的发布清单里的版本号（`release/<版本>.sha256`，进 git，ADR-0058）。
 * 缺失或不可读时返回空数组——调用方据此判「射程为空」（ADR-0076）。
 */
function publishedManifests() {
  try {
    const dir = join(repoRoot, 'release')
    if (!existsSync(dir)) return []
    return readdirSync(dir)
      .filter((name) => /^[0-9]+\.[0-9]+\.[0-9]+\.sha256$/.test(name))
      .map((name) => name.replace(/\.sha256$/, ''))
  } catch {
    return []
  }
}

/**
 * 递归列出目录下的文件（相对路径），供 `dmg-layout-doc` 的 R6 判嵌套链接是否随包。
 *
 * 深度上限 6 层：交付载荷最多两层（`tools/`、`LUTE Setup.app/Contents/…`），
 * 而挂载卷上不该有更深的树。读不到的那一支返回空数组——**不猜**，
 * 由判据那边如实计入「未核」，而不是拿「顶层目录在」冒充「里面的文件在」。
 * @param {string} root 目录（挂载卷或 payload 根）
 * @param {string} [relPrefix] 当前相对前缀
 * @param {number} [depth] 当前深度
 * @returns {string[]} 相对路径列表（文件，不含目录本身）
 */
function listFilesRecursive(root, relPrefix = '', depth = 0) {
  if (depth > 6) return []
  let entries
  try {
    entries = readdirSync(join(root, relPrefix), { withFileTypes: true })
  } catch {
    return []
  }
  const out = []
  for (const entry of entries) {
    const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name
    // 符号链接按文件算（`isDirectory()` 对链接返回 false）——交付载荷里没有链接目录。
    if (entry.isDirectory()) out.push(...listFilesRecursive(root, rel, depth + 1))
    else out.push(rel)
  }
  return out
}

/**
 * 读取 live profile 的已安装依赖表（package.json 的 dependencies）。
 * 返回空对象表示该 profile 未安装或不可读——调用方据此跳过校验。
 */
function installedProfileDependencies(profileDir) {
  const manifest = join(profileDir, 'package.json')
  if (!existsSync(manifest)) return {}
  try {
    return JSON.parse(readFileSync(manifest, 'utf8')).dependencies ?? {}
  } catch {
    return {}
  }
}

function parseArgs(argv) {
  let mode = 'quick'
  let list = false
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--list') list = true
    else if (argv[i] === '--mode') {
      mode = argv[i + 1]
      i += 1
    } else {
      return { error: `未知参数：${argv[i]}` }
    }
  }
  if (!MODES.includes(mode)) return { error: `未知模式：${mode}（可用：${MODES.join(' / ')}）` }
  return { mode, list }
}

/**
 * 某包入库的 lib/types 文件清单。
 * @param {string} dir 包相对路径
 * @returns {string[]}
 */
function trackedTypeFiles(dir) {
  const output = execFileSync('git', ['-C', repoRoot, 'ls-files', `${dir}/lib/types`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  return output.split('\n').filter(Boolean)
}

/** 程序入口：解析参数、跑校验、按失败数设置退出码。 */
function main() {
  const { mode, list, error } = parseArgs(process.argv.slice(2))
  if (error) {
    process.stderr.write(`${error}\n`)
    process.exitCode = 2
    return
  }
  if (list) {
    process.stdout.write(`${CHECKS.map((check) => check.name).join('\n')}\n`)
    return
  }

  const active = CHECKS.filter((check) => !check.modes || check.modes.includes(mode))
  let failed = 0
  let skipped = 0
  for (const check of active) {
    const result = check.run()
    // 三种读数，不许合并：`ok` / `skip`（射程为空——本项**没量到任何东西**）/ `fail`。
    // 先前这里把 `note` 丢掉，于是「跳过」与「校验通过」在读数上完全同形：
    // 几处 check 的注释写着「环境不存在时跳过，不假绿也不假红」，而输出里两者都是
    // `ok contract <名字>`。模型里有这个区分、读数里没有，等于没有（P-02 的第二种形态）。
    if (result.skipped) {
      skipped += 1
      process.stdout.write(`skip contract ${check.name}${result.note ? `（${result.note}）` : ''}\n`)
      continue
    }
    if (result.passed) {
      process.stdout.write(`ok   contract ${check.name}${result.note ? `（${result.note}）` : ''}\n`)
      continue
    }
    failed += 1
    process.stdout.write(`fail contract ${check.name}\n`)
    for (const violation of result.violations) process.stdout.write(`     - ${violation}\n`)
    process.stdout.write(`     → ${check.remediation}\n`)
  }

  // 通过数不再把跳过算进去：`40/41` 里的 41 是「参与本模式的项数」，跳过项单列出来。
  const passed = active.length - failed - skipped
  const skipTail = skipped > 0 ? `，跳过 ${skipped}` : ''
  process.stdout.write(
    failed === 0
      ? `ok ${passed}/${active.length} 项通过（mode=${mode}${skipTail}）\n`
      : `fail ${passed}/${active.length} 项通过（mode=${mode}${skipTail}）\n`,
  )
  process.exitCode = failed === 0 ? 0 : 1
}

main()
