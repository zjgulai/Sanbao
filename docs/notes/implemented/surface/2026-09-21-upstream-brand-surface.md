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

## 批二：平台面清扫（同日 11:5x 收口）

批一清的是「常规界面上的文案」；同日深度清点又找到**不渲染在常规界面、但用户翻得到/模型读得到/产出物带得走**的一批：

- **PWA 清单**（`dsh-web-frontend/dist/manifest.webmanifest`）：`"name": "DeepSeek Harness"` / `"short_name": "DSH"`；
- **favicon**（同 dist）：官方鲸鱼图形（标签页/PWA 图标）；
- **原生窗口标题**（`lib/src-*.js` 的 `windowTitle`）；**局域网 HTTPS 的 CA CommonName**；
- **第三方 bridge 插件**（`@agents-anywhere/dsh-bridge-next`）的用户可见中文错误串；
- **系统提示三处**（`dsh-system-prompt`「powered by …」/ `dsh-web-app` Web GUI 指代 / `dsh-app-boot` 源码检出说明）——不改的话模型会自称 DeepSeek Harness；
- **CLI 帮助描述**（`dsh --help` 首行）；
- **`dsh-badge` 技能**（`dsh-skill-badge` 内置 asset）：指示模型往用户文档/PR 贴「powered by dsh」徽章（shields.io + deepseek logo + 上游仓库链接），且明令「不得替换颜色/logo/文案/项目 URL」——**产出物上的水印**，用户裁决停用；
- **profile 影子副本**（`node_modules/@deepseek-ai/dsh-client-ui-layout|settings-models`）：仍是官方串；当前被 app 副本按加载器规则压着，但**profile 版本一旦更高就会夺权**（潜在复发面）。

决策（用户四项拍板）：① 批二整批现在执行（含退出/重签/重启）；② `dsh-badge` **删掉这支技能**（provider `list()` 返回空清单——模型与用户都调不到它）；③ 系统提示三处 + CLI 描述**改 Sanbao 口径**；④ CA 名**现在就换**（接受「新 CA、所有设备需重新信任」）。

实现 `dsh-patches/upstream-brand-surface/apply-extras.sh`（与批一同目录、同纪律：锚点唯一 + 写后残留 0 + `.orig-brand-surface-extras` 备份 + 名字读名源）。CA 换名的配套动作：把旧 CA 状态目录 `lan-https` 改名为 `.orig-deepseek-ca`（userData 与 `~/.dsh` 两处都处理），否则新 CN 与旧 CA 材料不匹配、LAN HTTPS 起不来。

**读数**：`verify-patches-v2` 新增 8 条锚点（5 `ck` + 3 `ckn`，46 → **54 锚点**）全部 `OK`，总体 `PATCHES v2 ALL VERIFIED`；`apply-extras.sh --check` 报 `extras OK（平台面 0 处上游名）`；重启后按宿主实际发出的字节复读——`/favicon.svg` 含 `aria-label="SanBao"` 且无官方标记、`/manifest.webmanifest` 为 `"name": "Sanbao"` / `"short_name": "SB"` 且无上游名、页面文本无 `DeepSeek Harness`／探索未至之境／预览版、`document.title = "Sanbao"`；`finalStage=health-commit` / `rendererStatus=healthy`。

**顺带**：`dsh-agent-team-gui-local`（我方包，射程图 S20）六处「请重启 DeepSeek Harness / Restart DeepSeek Harness」改为「请重启三宝 / Restart Sanbao」，构建后同步 vendor 与装载点两面。

**登记为「正确指代上游事实」、本批仍不改**：模型/提供方真名 `DeepSeek`（设置里的线路名）、`@deepseek-ai/*` 包 id、`dsh-session:` URI scheme、上游包 `package.json` 描述与注释/JSDoc、第三方包嵌套 `node_modules/.pnpm|.ignored` 死副本。

**CA 换名后的复验（同日 11:40 取证）**：当日 09:36 / 09:51 / 10:19 / 11:36 四次启动均报 `LAN HTTPS CA private key could not be opened`（早于本批改动，属密封私钥打不开的独立故障）；旧 CA 状态改名之后，11:39:34 启动的这一次**无该报错**，且 11:40:29 由宿主铸出新的 `lan-https/ca.json`——证书主体实测 `CN=Sanbao Local CA`（旧的那份备份在 `lan-https.orig-deepseek-ca`，主体 `CN=DeepSeek Harness Desktop Local CA`）。判据：`node -e` 读 `ca.json` 的 `certificate` 字段取 subject（不触碰 `sealedPrivateKey`）。

**待复核**：新 CA 的密封私钥能否在**下一次启动**被正常打开（本次是「无错启动 → 稍后铸 CA」，真正的开箱发生在下次启动）。判据 = 启动后日志无上述报错句；若复现，说明密封键问题与 CA 换名无关、需单独处理。
