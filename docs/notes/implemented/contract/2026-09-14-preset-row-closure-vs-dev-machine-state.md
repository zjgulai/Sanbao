# 出货 preset 的行级闭合：判据的事实一旦来自本机状态，它就会随着那半事实被抹掉而失明

- 日期：2026-09-14
- 分类：contract（`packaging/` 出货面）
- 相关：[ADR-0084](../../../adr/ADR-0084.md)、[ADR-0056](../../../adr/ADR-0056.md)、
  [ADR-0061](../../../adr/ADR-0061.md)、[ADR-0073](../../../adr/ADR-0073.md)、
  总账 [P-02](../../../pitfalls-playbook.md)、[P-08](../../../pitfalls-playbook.md)、[P-10](../../../pitfalls-playbook.md)

## Problem

客户在第二台机器上装完 2.4.0 后打开 DSH：**「结伴 · 达人与联盟合作」（`agt-033`）这个 preset 加载失败。**

### 读数（每一条都是命令输出，不是推断）

1. **出货字节里确实有那一行。** 解开 2.4.0 payload 的 `skills-presets.tar.gz`：

   ```
   presets/agt-033/agent.cordis.yml:168:  - id: product-kol-hunter
   presets/agt-033/agent.cordis.yml:169:    name: 'dsh-kol-hunter-local'
   ```

   全量清点：51 个出货预设里，`name` 不以 `@deepseek-ai` 开头的行只有两种——50 个预设有
   `dsh-skill-subset`，**1 个预设多出 `dsh-kol-hunter-local`**。后者就是那一行。

2. **出货面里没有这个包。** 载荷内嵌 profile 的 `dsh.profile.bundles` 无 `dsh-kol-hunter-local`，
   `node_modules` 里也没有该目录（`ls … | grep -i kol` 为空）。行在、包不在 → 解析不到 →
   preset 加载失败，与客户看到的现象一致。

3. **那一行是 ADR-0061 的「本机装配」。** 本机 `~/.dsh/.agent-presets/agt-033/agent.cordis.yml`
   第 165-169 行，注释写着「这条只在本机 profile 生效，不进仓库出货物」。而那个目录**同时是出货源**。

### 真正的问题：判据的真值由开发机此刻的状态决定

`strip-local-products.mjs` 的预设行处理是这样判的：先在暂存 profile 的 `file:` 依赖里算出
「外部产品名」，再拿这个名字去删补丁行。于是同一份出货副本、同一台机器、**只换本机 profile 的状态**，
结论相反：

```
# 本机依赖还在时（用 09-13 的 profile 备份）
$ node packaging/scripts/strip-local-products.mjs --profile desktop.pre-lute-20260913-161125 \
      --presets <出货副本> --node-modules … --dry-run
[strip] 移除 补丁行: agt-033/agent.cordis.yml: - id: product-kol-hunter —— 条目自身引用了外部产品
[strip] 外部产品 1 个（dsh-kol-hunter-local），移除动作 6 处

# 2.4.0 装配时的那份 profile（依赖与 bundle 已在 09-13 的安装里被抹掉）
$ node packaging/scripts/strip-local-products.mjs --profile desktop \
      --presets <出货副本> --node-modules … --dry-run
[strip] 外部产品 0 个（无），移除动作 0 处
[strip] ✓ 出货面没有本机装配的外部产品          ← 那一版就是这么发的
```

第二行输出是**诚实的**：脚本没撒谎，它确实看不见「外部产品」。它只是把「本机 profile 的依赖」
当成了「出货面里有什么」的唯一来源。而那半事实会随每一次安装消失——本地装配的另外两半
（依赖、bundle）早就没了，只剩 preset 里这一行，也就是这个缺陷的**签名**。

同族的另一处盲区：`dsh-preset-lint-local` 在启动时逐个 lint 全部预设，对这份坏字节报的是
`agt-033/agent.cordis.yml OK（2 警告）`——它校验的是组合词汇的静态形态，不含「这一行能不能被解析」。

## Decision

按 [ADR-0084](../../../adr/ADR-0084.md)：新增**行级闭合判据** `packaging/scripts/check-preset-rows.mjs`，
判据的事实来源换成**出货面**（出货 profile 的 `node_modules` ∪ app 内嵌 `node_modules` ∪ 登记的
`builtins`）；已登记为本机装配的行（`packaging/local-only-preset-rows.json`）从**出货副本**剥掉并打印，
未登记又解析不到的行 → 装配中止并点名到「文件 + 行 + 包名」。

落地清单：

- 新判据 `packaging/scripts/check-preset-rows.mjs`（判定 / `--strip` 两态）；
- 登记处 `packaging/local-only-preset-rows.json`（`builtins` 与 `localOnly` 两个字段，都必须写 `why`）；
- 反向自测 `packaging/scripts/check-preset-rows-test.sh`（15 条，含恒真桩突变）；
- 门禁 `preset-rows-resolvable-selftest`；
- `assemble.sh` 在 **tar 之前**调用（判的就是即将打包的那份字节）；
- 块切分与「按判定过滤条目块」收进 `packaging/scripts/lib/yaml-rows.mjs`，与 `strip-local-products.mjs`
  共用一份（原先那段逻辑只住在那一个文件里，新判据需要同一套切分——抄一份就是 P-07 说的
  「一条事实两个家」）。重构的行为保持证据：两个夹具上的 `--dry-run` 输出**逐字节相同**。

## Alternatives considered

1. **把该包烘焙进出货面**（让那一行解析得到）。否决：复活 ADR-0056 的机器路径问题，
   客户机没有 `/Users/lute/project/KOL-Hunter`，装了也没用。
2. **把本机装配行从 preset 里搬走**。否决：那一行在本机有用（ADR-0061）。为了出货搬走本机正在用的
   装配，与 ADR-0073 拒绝「把 bobo-cto 移走」同一条理由。
3. **给 `strip-local-products.mjs` 打补丁**。否决方向不对：它的输入天生是本机 profile；要修的是问题
   本身——「这一行能不能被解析」是出货面的性质，所以新判据自己算出货面。
4. **加一条点名 `dsh-kol-hunter-local` 的黑名单**。否决：第二份事实（ADR-0009），只防这一个包名。
5. **只靠「下一版覆盖」收场**。见「后果」里的已知缺口：`install.sh` 对 presets 用 `cp -Rn`，
   已装机器收不到修正。

## Consequences

**实测读数（判据在真实的 2.4.0 字节上跑）**

```
$ node packaging/scripts/check-preset-rows.mjs --presets <2.4.0 出货副本> --node-modules <profile nm> \
      --node-modules <app 内嵌 nm> --config packaging/local-only-preset-rows.json
[preset-rows] 出货面解析：51 个预设 / 1582 条顶层行；解析面 = …（含登记内置 cordis:group）
[preset-rows] · 待剥离本机行: presets/agt-033/agent.cordis.yml:168 - id: product-kol-hunter (dsh-kol-hunter-local) …
[preset-rows] ✓ 51 个预设的 1581 条出货行全部在解析面内（另有 1 条本机装配行待剥离）
```

- 把登记掏空（"未登记"那一态）→ `exit 1`，点名到 `presets/agt-033/agent.cordis.yml:168`；
- `--strip` 落到副本上 → 只动了 `agt-033` 一个文件，顶层行 19 → 18，`diff -rq` 其余全等；
  再跑一次判定 → 1581 条全绿 + 「名单过期」告警（登记与副本已不一致，如实报出）；
- 自测 15/15，恒真桩突变下 S2 失效。

**顺带发现的第二处**：`strip` 的第一版只删行、留下它上面那三行注释，于是出货副本里会留着一句
描述「一条并不存在的行」的话。已改成注释随行一起走（注释属于它所描述的那条行），并在自测 S3 钉住。

**同一根因的另一半：修正要能送到已装机器上（同日决策「改安装器 + 切 2.4.1」）**

`install.sh` 第 5/6 步原先对 presets 用 `cp -Rn`（合并、不覆盖已有）——意味着一台已经装上 2.4.0 的
机器，即使拿到一份干净的下一位版本，那个坏文件也不会被覆盖。这一半已补：

- **技能**：保持合并不覆盖。技能文件里住着**用户状态**——算法技能页的开关就写在 `SKILL.md` 的
  frontmatter 上（ADR-0083），覆盖它等于把用户的选择洗掉。
- **预设**：载荷里的那些按**产品内容**处理——有差异先备份到 `.agent-presets.pre-lute-<stamp>`
  再整体替换；内容一致就不动它、也不堆同内容副本；**载荷里没有的预设一律不动**（客户自建/本机自建的
  预设不是产品内容）。语义与第 2/6 步对 profile 的 `OWNED` 项一致，并接上回滚
  （`RESTORE_PRESETS` 指向备份目录，失败时逐个搬回）。
- 自测 `packaging/scripts/installer-preset-update-test.sh`（7 条）按哨兵**逐字节抽出** 5/6 那一段、
  配桩运行：T1 替换 + 备份、**T2 技能那一半没有被一起改成覆盖**、T3 客户自建预设原地不动、
  T4/T5「一致就不动 / 新增项装上」、T6 回滚接线、M1 把替换退回 `cp -Rn` 后 T1 必须失效。
  挂在门禁 `installer-preset-update-selftest`。
- 写这段时**当场被本仓库已有的判据咬了一口**：`say "…替换 $PRESET_REPLACED、新增 …"` 里
  `$VAR` 紧跟全角顿号会被 bash 并入变量名，`set -u` 下直接中断（ADR-0064 那一类）——
  自测第一轮的读数就是 `PRESET_REPLACED<坏字节>: unbound variable`，改成 `${VAR}` 后通过。

交付纪律：判据保证「不再发出坏字节」，安装器保证「下一版能覆盖到已装机器」，但**要真正送到客户机上
仍需切一版**（2.4.1）——本次交付的不是「旧机器自动变好」。

### 端到端实测（在**真实的**字节上，不是夹具）

2.4.1 装配完成后，用**载荷里那份** `install.sh` 的 5/6 段，对一台「装着 2.4.0 发出的坏文件」的假机器跑了一遍：

```
装前：1 处命中那条行，顶层行 19        （客户机现状 = 2.4.0 payload 里那份 agt-033）
      + 一个客户自建预设 my-own
[say] 5/6 预设：替换 1、新增 50、未变 0（载荷里没有的预设一律不动）
[say]      被替换项的旧副本在 ~/.dsh/.agent-presets.pre-lute-<stamp>（回滚时从这里搬回）
装后：0 处命中，顶层行 18，注释也一起走了
客户自建预设：mine（原样）
备份：1 条（只有被替换的那一个），旧副本里那条行仍在
```

配套的打包侧读数（`assemble.sh` 自己打的，tar 之前）：

```
[preset-rows] 出货面解析：51 个预设 / 1582 条顶层行；解析面 = <出货 profile>/node_modules + <app>/…/node_modules（含登记内置 cordis:group）
[preset-rows] · 已剥离本机行: presets/agt-033/agent.cordis.yml:168 - id: product-kol-hunter (dsh-kol-hunter-local) —— …
[preset-rows] ✓ 51 个预设的 1581 条出货行全部在解析面内（另有 1 条本机装配行已剥离）
```

出货副本与 2.4.0 逐行 diff：只少了那条行与它的三行注释（19 → 18）。

**人工修复（客户机 / 本机都可以直接用）**

```bash
# 只删那条解析不到的本机装配行（连注释一起），preset 立刻恢复正常加载
python3 - <<'PY'
import re, pathlib
p = pathlib.Path.home()/'.dsh/.agent-presets/agt-033/agent.cordis.yml'
lines = p.read_text(encoding='utf-8').split('\n')
out, i = [], 0
while i < len(lines):
    if lines[i].strip() == '- id: product-kol-hunter':
        while out and out[-1].lstrip().startswith('#'):
            out.pop()
        i += 2                                  # 连带它的 name 行
        continue
    out.append(lines[i]); i += 1
p.write_text(re.sub(r'\n{3,}', '\n\n', '\n'.join(out)), encoding='utf-8')
PY
```
