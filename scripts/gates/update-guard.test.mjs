/**
 * `update-guard` 的反向自测（P-03：判据自己也要被证伪）。
 *
 * 本文件里最要紧的一条是「闸排在副作用之后」：那种形态下**消息串仍然在文件里**，
 * 所以 `packaging/verify-patches-v2.sh` 的 `ck` 与任何按串判的实现都会判绿。
 * 它正是本判据存在的理由，也是恒真桩突变的靶子（见末条）。
 *
 * 夹具取自 2026-09-18 装机 app 的真实字节
 * （`/Applications/DSH Desktop.app/Contents/Resources/app/lib/electron-runtime-IsgfTki1.js`，
 * 守卫命中位置 110553），保留了嵌套花括号、模板字符串与 `shell.openPath` 的里层包裹，
 * 好让「字符串感知配对」这件事真的被测到。
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { GUARD_ENV, checkUpdateGuard } from './update-guard.mjs'

/** 装机字节的等价缩样：结构、缩进形态与真实 bundle 一致。 */
const REAL = `class DesktopUpdateController {
	async showManualUpdateCheckResult(result) {
		await dialog.showMessageBox({
			type: "info",
			title: copy.updateAvailableTitle,
			message: copy.updateAvailableMessage(result.latestVersion),
			detail: copy.installerUnavailable,
			buttons: [copy.ok],
			defaultId: 0,
			noLink: true
		});
	}
	/** Download a confirmed installer and hand it to the native installation flow. */
	async downloadAndOpenUpdate(version, signal, channel = "stable") {
		if (process.env.${GUARD_ENV} !== "0") throw new Error("Update installation is disabled for security (unsigned payload risk). Set ${GUARD_ENV}=0 to override.");
		const copy = desktopNativeCopy(this.currentLocale);
		const platform = this.platformStrategy.updateDownloadPlatform;
		if (platform === void 0) throw new Error(\`dsh-plugin-desktop: updates are unavailable on \${this.platform}\`);
		const destinationPath = await this.chooseUpdateDestination(version, channel);
		if (destinationPath === void 0) return;
		signal.throwIfAborted();
		const artifactPath = await downloadDesktopUpdate({
			platform,
			version,
			...channel === "stable" ? {} : { channel },
			destinationPath,
			request: (url, init) => net.fetch(url, init),
			signal
		});
		signal.throwIfAborted();
		if (platform === "darwin") {
			const openError = await shell.openPath(artifactPath);
			if (openError !== "") throw new Error(\`dsh-plugin-desktop: failed to open update disk image: \${openError}\`);
		}
	}
	wire() {
		return {
			downloadAndOpen: (version, signal, channel) => this.downloadAndOpenUpdate(version, signal, channel)
		};
	}
}
`

test('装机真实字节：闸在位且排在副作用之前 → 绿', () => {
  const result = checkUpdateGuard(REAL)
  assert.equal(result.passed, true, result.violations.join('；'))
  assert.equal(result.unverifiable, false)
  assert.match(result.note, /闸在位/)
})

test('读不到正文（空串）必须判红，不得静默跳过', () => {
  const result = checkUpdateGuard('')
  assert.equal(result.passed, false)
  assert.equal(result.unverifiable, false)
  assert.match(result.violations[0], /读不到正文/)
})

test('定义被改名 → 红（保护面不可定位，不得静默通过）', () => {
  const renamed = REAL.replace(
    'async downloadAndOpenUpdate(',
    'async downloadAndInstallUpdate(',
  ).replace('this.downloadAndOpenUpdate(', 'this.downloadAndOpenInstallUpdate(')
  const result = checkUpdateGuard(renamed)
  assert.equal(result.passed, false)
  assert.match(result.violations[0], /找不到/)
})

test(`闸判据本身消失（${GUARD_ENV} 被删）→ 红`, () => {
  const stripped = REAL.replace(
    `if (process.env.${GUARD_ENV} !== "0") throw new Error("Update installation is disabled for security (unsigned payload risk). Set ${GUARD_ENV}=0 to override.");`,
    '',
  )
  const result = checkUpdateGuard(stripped)
  assert.equal(result.passed, false)
  assert.ok(result.violations.some((v) => /找不到 `DSH_DISABLE_UPDATE_INSTALL` 判据/.test(v)))
})

test('闸只判不拦（后面没有 throw）→ 红', () => {
  const toothless = REAL.replace(
    'throw new Error("Update installation is disabled for security',
    'console.warn("Update installation is disabled for security',
  )
  const result = checkUpdateGuard(toothless)
  assert.equal(result.passed, false)
  assert.ok(result.violations.some((v) => /没有 `throw`/.test(v)))
})

test('★ 闸的条件被抽走（`!== "0"` → `false`）→ 红', () => {
  // 这一条是 2026-09-18 对**装机真实字节**做突变 M3 时实测发现的边界：条件换成 `false` 后，
  // env 只剩消息串里那一次出现，而紧跟的 platform 检查也带 `throw`、落在 THROW_WINDOW 内，
  // 「判后有 throw」照样成立——判据当时判**绿**。补了「条件必须还在比较 0」之后才转红。
  const toothlessCondition = REAL.replace(`process.env.${GUARD_ENV} !== "0"`, 'false')
  assert.notEqual(toothlessCondition, REAL, '夹具前提：条件必须能被替换')
  const result = checkUpdateGuard(toothlessCondition)
  assert.equal(result.passed, false, '条件被抽走的形态不得判绿')
  assert.ok(
    result.violations.some((v) => /没有紧跟与 `0` 的比较/.test(v)),
    `应报「没有紧跟与 0 的比较」，实际：${result.violations.join('；')}`,
  )
})

test('★ 闸被挪到副作用之后 → 红（消息串仍在文件里，按串判的判据看不见这一形态）', () => {
  const guard = `\t\tif (process.env.${GUARD_ENV} !== "0") throw new Error("Update installation is disabled for security (unsigned payload risk). Set ${GUARD_ENV}=0 to override.");\n`
  // 先摘掉闸，再把它插到 `downloadDesktopUpdate(` 之后——下载已经发生，闸才判。
  const withoutGuard = REAL.replace(guard, '')
  assert.notEqual(withoutGuard, REAL, '夹具前提：闸必须能被摘掉')
  const moved = withoutGuard.replace(
    'const artifactPath = await downloadDesktopUpdate({',
    `const artifactPath = await downloadDesktopUpdate({\n${guard.replace(/^\t\t/, '\t\t')}guardWasHere: true,`,
  )
  const result = checkUpdateGuard(moved)
  assert.equal(result.passed, false)
  assert.ok(
    result.violations.some((v) => /闸排在副作用之后/.test(v)),
    `应报「闸排在副作用之后」，实际：${result.violations.join('；')}`,
  )
  // 这一形态的证据面：消息串确实还在，所以按串判的实现会说 ok。
  assert.ok(moved.includes('Update installation is disabled for security'))
})

test('恒真桩突变：把判据换成「文件里有那句文案」会放过上一条的形态', () => {
  const guard = `\t\tif (process.env.${GUARD_ENV} !== "0") throw new Error("Update installation is disabled for security (unsigned payload risk). Set ${GUARD_ENV}=0 to override.");\n`
  const withoutGuard = REAL.replace(guard, '')
  const moved = withoutGuard.replace(
    'const artifactPath = await downloadDesktopUpdate({',
    `const artifactPath = await downloadDesktopUpdate({\n${guard}`,
  )
  // 天真实现（= verify-patches-v2.sh 的 ck 形态）：只问串在不在。
  const naivePasses = moved.includes('Update installation is disabled for security')
  const realVerdict = checkUpdateGuard(moved)
  assert.equal(naivePasses, true, '天真实现在这一形态下确实判绿——这正是要证伪的东西')
  assert.equal(realVerdict.passed, false, '本判据必须拦住天真实现放过的那一形态')
})

test('已知副作用全都不见了（上游改了调用形态）→ 红', () => {
  const reShaped = REAL
    .replace('await downloadDesktopUpdate({', 'await fetchUpdateArchive({')
    .replace('await shell.openPath(artifactPath)', 'await handOffToInstaller(artifactPath)')
  const result = checkUpdateGuard(reShaped)
  assert.equal(result.passed, false)
  assert.ok(result.violations.some((v) => /找不到任何已知副作用/.test(v)))
})

test('只有定义、没有调用点（闸是死代码）→ 红', () => {
  const orphan = REAL.replace(
    'downloadAndOpen: (version, signal, channel) => this.downloadAndOpenUpdate(version, signal, channel)',
    'downloadAndOpen: (version, signal, channel) => this.downloadAndOpenUpdateOther(version, signal, channel)',
  )
  const result = checkUpdateGuard(orphan)
  assert.equal(result.passed, false)
  assert.ok(result.violations.some((v) => /只有定义、没有调用点/.test(v)))
})

test('字符串里带花括号不得让方法体配对错位（否则是假红/假绿的共用入口）', () => {
  const withBracesInStrings = REAL.replace(
    'const copy = desktopNativeCopy(this.currentLocale);',
    'const copy = desktopNativeCopy(this.currentLocale, "} not a brace {", `also } { and \\` backtick`);',
  )
  const result = checkUpdateGuard(withBracesInStrings)
  assert.equal(result.passed, true, result.violations.join('；'))
})

test('花括号不闭合 → unverifiable（判定失败，不是红也不是绿）', () => {
  const truncated = REAL.slice(0, REAL.indexOf('const artifactPath = await downloadDesktopUpdate'))
  const result = checkUpdateGuard(truncated)
  assert.equal(result.unverifiable, true, '读不出方法体必须报 unverifiable')
  assert.equal(result.passed, false)
  assert.match(result.violations[0], /读不出/)
})
