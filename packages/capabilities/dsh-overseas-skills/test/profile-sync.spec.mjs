/**
 * R6：硬链接陷阱的守卫，以及**守卫本身**被测住。
 *
 * 事实链（都是本仓库付过代价的）：
 *   · `pnpm file:` 装出来的是**硬链接**：仓库那份与 profile 装载点是同一个 inode；
 *   · 编辑工具落盘一律 tmp+mv（新 inode）⇒ 硬链接当场断开，此后构建只写进仓库那一份，
 *     装载点停在旧字节（ADR-0054）；
 *   · 把它接回去的时候还有第二个杀招：两份又是同一 inode 时，`cat src > dst`
 *     先截断 dst，而 dst 与 src 同 inode ⇒ **源文件一起归零**。
 *     实测发生过：`lib/catalog.js` 被这样「硬链接双杀」。
 *
 * 所以本文件做三件事，缺一件都不算数：
 *   ① **复现陷阱** —— 在临时目录里真的 `cat src > dst`，断言两个文件都变成 0 字节。
 *      不靠文档声称，靠当场跑出来的读数。同时它是一枚反向控制：如果这条断言成立，
 *      那么「守卫拦下 direct 写」就不是过度防御。
 *   ② **跑真入口** —— `spawnSync('bash', [scripts/sync-profile-files.sh, …])` 加夹具，
 *      不 import 任何库函数。判据全在脚本里，测库函数等于没测（台账 #25）。
 *   ③ **变异** —— 把脚本里的 `-ef` 判据改坏、把 tmp+mv 换成 `cat >`，各跑一遍，
 *      断言同一批用例会失败。守卫的第一条 selftest 就是「把门禁自己改坏，看它报不报」。
 *
 * 全部用例都在 `mkdtempSync` 出来的临时目录里跑，仓库与 profile 一个字节都不碰。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PKG = join(HERE, '..')
const GUARD = join(PKG, 'scripts', 'sync-profile-files.sh')

/** 临时工作区；每个用例一个，用完即删。 */
const sandboxes = []
function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'profile-sync-'))
  mkdirSync(join(dir, 'src'))
  mkdirSync(join(dir, 'dst'))
  sandboxes.push(dir)
  return dir
}

/** 跑一次守卫入口（真 CLI，不 import 库函数）。 */
function runGuard(dir, files, env = {}) {
  return runGuardAt(join(dir, 'src'), join(dir, 'dst'), files, env)
}

/**
 * 指定源/目标目录跑守卫。
 *
 * 包名对账看的是 `dirname(src)` / `dirname(dst)` 里的 `package.json`，所以「两个不同的包」
 * 必须是**两个不同的父目录**（`<dir>/a/lib` 与 `<dir>/b/lib`）。第一版把两份 package.json
 * 都放在同一个 `<dir>` 下，于是源与目标解析到同一份、名字当然相等 —— 用例绿得毫无意义。
 * @param {string} srcDir 源 lib 目录
 * @param {string} dstDir 目标 lib 目录
 * @param {string[]} files 文件名
 * @param {Record<string,string>} [env] 额外环境变量
 */
function runGuardAt(srcDir, dstDir, files, env = {}) {
  return spawnSync('bash', [GUARD, dstDir, ...files], {
    cwd: PKG,
    encoding: 'utf8',
    env: { ...process.env, PROFILE_SRC_LIB: srcDir, ...env },
  })
}

/** 造一对各自的包目录（`<dir>/<name>/package.json` + `<dir>/<name>/lib/`）。 */
function pkgPair(srcName, dstName, srcContent, dstContent) {
  const dir = sandbox()
  for (const [sub, pkgName, content] of [['src', srcName, srcContent], ['dst', dstName, dstContent]]) {
    mkdirSync(join(dir, sub, 'lib'), { recursive: true })
    writeFileSync(join(dir, sub, 'package.json'), JSON.stringify({ name: pkgName }), 'utf8')
    writeFileSync(join(dir, sub, 'lib', 'index.js'), content, 'utf8')
  }
  return { dir, srcDir: join(dir, 'src', 'lib'), dstDir: join(dir, 'dst', 'lib'), dst: join(dir, 'dst', 'lib', 'index.js') }
}

/** 造一个「仓库源 + 装载点副本」的硬链接对（`pnpm file:` 装出来的形态）。 */
function linkPair(dir, name, content) {
  const src = join(dir, 'src', name)
  const dst = join(dir, 'dst', name)
  writeFileSync(src, content, 'utf8')
  spawnSync('ln', ['-f', src, dst])
  return { src, dst, content }
}

/** 写一个夹具文件（非硬链接）。 */
function plainPair(dir, name, srcContent, dstContent) {
  const src = join(dir, 'src', name)
  const dst = join(dir, 'dst', name)
  writeFileSync(src, srcContent, 'utf8')
  writeFileSync(dst, dstContent, 'utf8')
  return { src, dst }
}

const sameInode = (a, b) => statSync(a).ino === statSync(b).ino && statSync(a).dev === statSync(b).dev
const size = (p) => statSync(p).size

test.after(() => { for (const dir of sandboxes.splice(0)) rmSync(dir, { recursive: true, force: true }) })

test('陷阱是真的：同一 inode 上用 `cat src > dst` 同步会把两个文件一起截成 0 字节', () => {
  const dir = sandbox()
  const { src, dst, content } = linkPair(dir, 'catalog.js', 'module.exports = { big: 1 }\n')
  assert.ok(content.length > 0)
  assert.ok(sameInode(src, dst), '夹具必须真的是同一 inode，否则这条复现证明不了任何事')

  // 朴素同步：先 truncate 目标，再从**同一个 inode** 读。
  const res = spawnSync('bash', ['-c', `cat "${src}" > "${dst}"`], { encoding: 'utf8' })
  assert.equal(res.status, 0, `cat 同步本身不应报错：${res.stderr}`)

  assert.equal(size(dst), 0, '被截断的是目标 —— 这是「cat > 会先 truncate」那一半')
  assert.equal(size(src), 0, '源文件也被截成 0 字节 —— 同一 inode，这就是「硬链接双杀」')
  assert.ok(sameInode(src, dst), '双杀之后两者仍是同一 inode（链接关系没变，内容没了）')
})

test('守卫放行 tmp+mv：同一 inode 的硬链接对上同步成功，两份内容一致且非空', () => {
  const dir = sandbox()
  const { src, dst, content } = linkPair(dir, 'client.js', 'export const v = 2\n')
  // 装载点这一份故意是旧内容（硬链接断了之后重建出来的形态由下面的非链接用例覆盖；
  // 这里保持同 inode 是为了测「接回去」那条路径）。
  const res = runGuard(dir, ['client.js'])

  assert.equal(res.status, 0, `tmp+mv 必须成功：stdout=${res.stdout} stderr=${res.stderr}`)
  assert.match(res.stdout, /守卫：.*同 inode/, '同 inode 必须被点名报出来，不能静默处理')
  assert.equal(readFileSync(dst, 'utf8'), content, '装载点必须是源的内容')
  assert.equal(readFileSync(src, 'utf8'), content, '源文件必须完好（没被截断）')
  assert.ok(size(src) > 0 && size(dst) > 0)
  // 断链是有意的：接回去之后两者不再共享 inode，下一次构建不会再互相牵连。
  assert.ok(!sameInode(src, dst), 'tmp+mv 之后必须已断链（否则下次同步又要靠守卫救）')
})

test('守卫放行 tmp+mv：硬链接已断开（副本是旧字节）时同样同步成功', () => {
  const dir = sandbox()
  const { src, dst } = plainPair(dir, 'index.js', 'new\n', 'old\n')
  assert.ok(!sameInode(src, dst))

  const res = runGuard(dir, ['index.js'])
  assert.equal(res.status, 0, `必须成功：${res.stderr}`)
  assert.doesNotMatch(res.stdout, /同 inode/, '非硬链接不该报守卫告警（否则告警会退化成背景噪声）')
  assert.equal(readFileSync(dst, 'utf8'), 'new\n')
})

test('守卫拦下直写：同一 inode 上要求 `direct` ⇒ 退出码 1，且两个文件一个字节都没被写', () => {
  const dir = sandbox()
  const { src, dst, content } = linkPair(dir, 'catalog.js', 'module.exports = { big: 1 }\n')

  const res = runGuard(dir, ['catalog.js'], { PROFILE_SYNC_MODE: 'direct' })

  assert.equal(res.status, 1, `必须被守卫拦下（退出码 1），实际 ${res.status}：stdout=${res.stdout} stderr=${res.stderr}`)
  assert.match(res.stderr, /守卫拦下/, '必须说明是被守卫拦下的，而不是别的原因')
  assert.match(res.stderr, /同一 inode/, '必须点名同 inode 这个事实')
  assert.match(res.stderr, /双杀/, '必须点出后果（硬链接双杀），否则读者不知道为何不能用 cat >')
  // 关键：拒绝发生在**写盘之前**。源与副本都还是原内容，一个字节没丢。
  assert.equal(size(src), content.length, '源文件必须原样')
  assert.equal(size(dst), content.length, '副本必须原样（拒绝写盘，而不是写坏了再报错）')
  assert.equal(readFileSync(src, 'utf8'), content)
  assert.ok(sameInode(src, dst), '被拒绝时链接关系也不该被动过')
})

test('反向控制：非硬链接上允许 `direct` —— 守卫不许退化成「一律拒绝」', () => {
  const dir = sandbox()
  const { src, dst } = plainPair(dir, 'templates.js', 'new\n', 'old\n')
  assert.ok(!sameInode(src, dst))

  const res = runGuard(dir, ['templates.js'], { PROFILE_SYNC_MODE: 'direct' })

  assert.equal(res.status, 0, `非同 inode 的直写应当放行，实际 ${res.status}：${res.stderr}`)
  assert.equal(readFileSync(dst, 'utf8'), 'new\n')
  assert.equal(readFileSync(src, 'utf8'), 'new\n')
})

test('包名对账：源包与目标包不同名 ⇒ 退出码 3，且目标一个字节都没被写', () => {
  // 这条判据来自本脚本作者自己踩的坑：给另一个包同步时 `PROFILE_SRC_LIB` 给了相对路径，
  // 于是**本包**的 `index.js` / `client.js` 被写进了那个包的装载点 —— 两个包文件名
  // 完全一样，`cp` 不会报错，尺寸也只差一点，肉眼看不出来。装载点于是跑起了隔壁包的代码。
  const { srcDir, dstDir, dst } = pkgPair('pkg-source', 'pkg-target', 'from-source\n', 'from-target\n')

  const res = runGuardAt(srcDir, dstDir, ['index.js'])

  assert.equal(res.status, 3, `包名对不上必须 exit 3，实际 ${res.status}：${res.stdout}${res.stderr}`)
  assert.match(res.stderr, /拒绝把 pkg-source 的产物写进 pkg-target 的装载点/)
  assert.equal(readFileSync(dst, 'utf8'), 'from-target\n', '拒绝必须发生在写盘之前')
})

test('包名对账的反向控制：同名则放行（判据不许退化成「一律拒绝」）', () => {
  const { srcDir, dstDir, dst } = pkgPair('pkg-same', 'pkg-same', 'new\n', 'old\n')

  const res = runGuardAt(srcDir, dstDir, ['index.js'])
  assert.equal(res.status, 0, `同名应当放行，实际 ${res.status}：${res.stderr}`)
  assert.match(res.stdout, /包名对账：pkg-same = pkg-same/)
  assert.equal(readFileSync(dst, 'utf8'), 'new\n')
})

test('包名对账：夹具没有 package.json 时跳过，但必须把「跳过了」打出来', () => {
  // 静默跳过等于把这条判据换成一句空话 —— 「没测到」和「测了是好的」必须能分开。
  const dir = sandbox()
  const { dst } = plainPair(dir, 'index.js', 'new\n', 'old\n')
  const res = runGuard(dir, ['index.js'])
  assert.equal(res.status, 0)
  assert.match(res.stdout, /包名对账：跳过/)
  assert.equal(readFileSync(dst, 'utf8'), 'new\n')
})

test('变异：把包名对账改成恒通过 ⇒ 隔壁包的产物会被写进本包的装载点', () => {
  const { srcDir, dstDir, dst } = pkgPair('pkg-source', 'pkg-target', 'from-source\n', 'from-target\n')

  const mutated = mutateScript([['if [ "$s_name" != "$d_name" ]; then', 'if [ "x" != "x" ]; then']])
  try {
    const res = runScript(mutated, srcDir, dstDir, ['index.js'])
    // 先证明变异真的改了行为：判据没了，写盘照常发生。
    assert.equal(res.status, 0, '变异体应当放行')
    assert.equal(readFileSync(dst, 'utf8'), 'from-source\n', '变异体把源包的内容写进了目标包')
    assert.throws(() => {
      assert.equal(res.status, 3, '包名对不上必须 exit 3')
    })
  } finally {
    rmSync(dirname(mutated), { recursive: true, force: true })
  }
})

test('输入没拿到 ⇒ 退出码 2（≠ 通过）：源文件不存在时必须响亮失败', () => {
  const dir = sandbox()
  const res = runGuard(dir, ['does-not-exist.js'])
  assert.equal(res.status, 2, `源不存在必须 exit 2，实际 ${res.status}：${res.stderr}`)
  assert.match(res.stderr, /源不存在/)
})

test('变异：把 `-ef` 判据改成恒假 ⇒ 守卫用例当场失败', () => {
  const dir = sandbox()
  const { src, dst, content } = linkPair(dir, 'catalog.js', 'module.exports = { big: 1 }\n')

  const mutated = mutateScript([['[ "$s" -ef "$d" ]', '[ "x" = "y" ]']])
  try {
    const res = runScript(mutated, join(dir, 'src'), join(dir, 'dst'), ['catalog.js'], { PROFILE_SYNC_MODE: 'direct' })
    // 先证明变异真的改了行为：守卫不再拦下，直写落地……
    assert.equal(res.status, 0, '变异体应当放行（恒假判据 = 没有判据）')
    // ……而两个文件**都被归零** —— 这正是守卫存在的原因，也正是原用例会失败的地方。
    assert.equal(size(src), 0)
    assert.equal(size(dst), 0)
    assert.ok(content.length > 0)
    // 同一批断言在变异体上失败：
    assert.throws(() => {
      assert.equal(res.status, 1, '必须被守卫拦下（退出码 1）')
    })
  } finally {
    rmSync(dirname(mutated), { recursive: true, force: true })
  }
})

test('变异：把 tmp+mv 换成 `cat >` 且去掉断链 ⇒ 「源文件完好」那条断言当场失败', () => {
  const dir = sandbox()
  const { src, dst, content } = linkPair(dir, 'client.js', 'export const v = 2\n')

  // 两处一起改：这才是历史形态（既没有守卫，也没有原子替换）。
  // 只把 `cp/mv` 换成 `cat >` 是**不够的** —— 上面那句 `rm -f "$d"` 已经先断了链，
  // 于是 `cat >` 落在新 inode 上、源文件毫发无伤。第一版就是这么写的，当场被这条
  // 断言抓住：变异没施上力时，「变异测试通过」是一句空话。
  const mutated = mutateScript([
    ['    rm -f "$d"', '    : # 变异：去掉断链'],
    ['cp "$s" "$d.tmp" && mv -f "$d.tmp" "$d"', 'cat "$s" > "$d"'],
  ])
  try {
    const res = runScript(mutated, join(dir, 'src'), join(dir, 'dst'), ['client.js'])
    assert.equal(res.status, 0, '变异体本身不该报错（它只是一次朴素写）')
    assert.equal(size(src), 0, '变异体把源文件也归零了')
    assert.equal(size(dst), 0)
    assert.ok(content.length > 0)
    // 同一批断言在变异体上失败：这正是「守卫放行 tmp+mv」那条用例的核心。
    assert.throws(() => {
      assert.equal(readFileSync(src, 'utf8'), content, '源文件必须完好（没被截断）')
    })
    assert.throws(() => {
      assert.ok(size(dst) > 0, '装载点必须非空')
    })
  } finally {
    rmSync(dirname(mutated), { recursive: true, force: true })
  }
})

/**
 * 写一份被改坏的守卫脚本到临时目录，返回其路径。
 *
 * 锚点必须**恰好出现一次**：一次都没匹配上会产出与原文相同的「变异体」，
 * 于是「变异测试通过」变成一句空话（`run_phase6_gates.py --mutate` 的真实缺陷）。
 * @param {Array<[string,string]>} replacements 字面替换对
 * @returns {string} 变异脚本的绝对路径
 */
function mutateScript(replacements) {
  let source = readFileSync(GUARD, 'utf8')
  for (const [from, to] of replacements) {
    const hits = source.split(from).length - 1
    assert.equal(hits, 1, `变异锚点必须恰好出现一次，实际 ${hits} 次：${from.slice(0, 50)}`)
    source = source.replace(from, to)
  }
  const dir = mkdtempSync(join(tmpdir(), 'profile-sync-mutant-'))
  const file = join(dir, 'sync-profile-files.sh')
  writeFileSync(file, source, 'utf8')
  return file
}

/**
 * 跑一份指定的守卫脚本（原文或变异体）。
 *
 * ⚠️ 脚本第一件事是 `cd "$(dirname "$0")/.."` —— 变异体的 `$0` 在临时目录，
 * 所以 `PROFILE_SRC_LIB` 必须是**绝对路径**（它本来就是）。这条恰好也是一次
 * 「变异体真的被跑过」的证明：若脚本没跑起来，退出码不会是 0。
 * @param {string} script 脚本路径
 * @param {string} srcDir 源 lib 目录（绝对路径）
 * @param {string} dstDir 目标 lib 目录
 * @param {string[]} files 文件名
 * @param {Record<string,string>} [env] 额外环境变量
 */
function runScript(script, srcDir, dstDir, files, env = {}) {
  return spawnSync('bash', [script, dstDir, ...files], {
    cwd: PKG,
    encoding: 'utf8',
    env: { ...process.env, PROFILE_SRC_LIB: srcDir, ...env },
  })
}
