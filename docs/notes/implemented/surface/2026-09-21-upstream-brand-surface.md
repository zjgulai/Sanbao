# 上游平台名 `DeepSeek Harness` 从可见 UI 面清出（brand-surface 补丁）

- 日期：2026-09-21
- 相关：[ADR-0150](../../../adr/ADR-0150.md)（本轮决策）、[ADR-0147](../../../adr/ADR-0147.md)（改名四步；其 D2 的平台名例外）、[ADR-0080](../../../adr/ADR-0080.md)（运行中替换 app bundle 红线）、[ADR-0068](../../../adr/ADR-0068.md)（签名身份与 TCC）
- 制品：`dsh-patches/upstream-brand-surface/apply-fixes.sh`、`packaging/verify-patches-v2.sh`（+6 判据）、`packaging/assemble.sh`（`--staged` 调用与载荷拷贝）、`dsh-patches/patches-manifest-v3.md`、`packaging/README.md`（40 → 46 锚点）

## Problem

改名四步（ADR-0147）落地后，用户翻页面仍能逐处指认上游平台名 `DeepSeek Harness`：

- **页眉左侧与窗口标题**：layout 的 `productTitle` 常量把 SPA 的 `<title>Sanbao</title>` 在运行期覆写成上游名；
- **设置 → 模型页的内测声明**：一段用户可见文案里有 4 处平台名；
- **主进程「远程控制」对话框**：「从其他设备使用这台电脑上的 DeepSeek Harness」。

三处都在扫描式品牌重放的射程之外：`brand-replay-strings.py` 的扫描面排除 `node_modules`，
且 ADR-0147 D2 明确「基座平台名不替换——很多地方在正确指代上游事实」。两条都对，但合起来留下一个
**没人管的可见缺口**：既不会被扫描替换波及，也没有任何判据看着它。

另外两处**不是**问题、本补丁也不碰：`dsh/lib/bin.js` 的 CLI 描述、三方包描述与 fixture 数据——
那些位置在正确指代上游事实（ADR-0147 D2 的保留面）。

## Decision

**D1 逐处点名三处可见 UI 面**（页眉常量 / 内测声明段 / 远程控制对话框），不扩大到手写清单之外。

**D2 独立补丁 `dsh-patches/upstream-brand-surface/`**：逐文件声明**期望命中数**并断言唯一
（layout ×1、settings-models ×4、electron-runtime ×4 且该分块必须恰一份），锚点不唯一即拒绝落笔，
写后断言上游名残留为 0；替换名从名源 `brand-payload-name.txt` 读（不新增第二份家）。

**D3 注册三处**：`verify-patches-v2.sh` 增 6 条判据（3 条肯定 + 3 条**否定**——「上游名必须缺席」，
三文件各一）；`assemble.sh` 以 `--staged` 对暂存 app 调用（缺脚本即硬失败）；manifest 行 + README 锚点数（40 → 46）。

**D4 生效判据 = 重启后「服务端实际发出的字节」**：宿主对 app 内客户端 bundle 按**引导期快照**发送，
运行中改盘不重读。按 `window.__DSH_BOOT__` 的 `entries[].url` 取回字节，断言上游名归零、
`const productTitle = "Sanbao"` 命中 1。**盘上改了不算生效**——这一条是本轮最贵的一课（见 Consequences）。

## Alternatives considered

- **A 并入扫描式品牌重放（放宽扫描面）**：否决——扫描面排除 `node_modules`；放宽会把「正确指代上游」
  的位置一并改写（ADR-0147 D2 明确排除）。
- **B 只改页眉（最小集）**：否决——用户逐处点名三处；漏掉两处会让「清干净」与事实不符。
- **C 运行期 DOM 注入改写**：否决——页眉在 React 渲染内、对话框在主进程原生面，注入既晚（首屏闪烁）
  又脆（重渲染即丢），且与「锚点不钉哈希」的纪律冲突。
- **D 重打包/改 asar 二进制**：否决——超出点名范围，且触及签名与身份面（ADR-0068）。

## Consequences

- 正面：三处可见面清零，且**否定式判据**（上游名缺席）与肯定式判据同批登记——「改到了」与
  「没漏」两个面都有读数；补丁锚点漂移在升级后由 `--check` 显式报出，不靠人记得。
- 负面/代价：新补丁需随上游版本重放；`node_modules` 内其余三方包品牌串仍是已知边界（需 vendor 化，
  不在本片射程）。
- **最贵的一课（P-15 类假绿的活样本）**：补丁最初在**应用运行中**落在盘上，`--check` 与
  `verify-patches-v2` 双双翻绿——但宿主服务出去的仍是**补丁前字节**（引导期快照），用户页面上
  三处照旧。用旁路取证（本机铸 cookie + 独立无头 Chrome 读 `__DSH_BOOT__` 逐包取字节）才把
  「盘上改了」与「服务端发出什么」分开。整重启后复读：layout `productTitle = "Sanbao"` ×1 / 上游名 ×0、
  settings-models 内测声明 ×1 / 上游名 ×0、`document.title = "Sanbao"`、品牌座与 hero 均为自有品牌；
  `finalStage=health-commit` 无白屏；`tcc-grant-status.sh` 两项授权仍有效；
  `verify-patches-v2` 翻 `PATCHES v2 ALL VERIFIED`（46 锚点）。判据面由此固定为「重启后服务端字节」。
