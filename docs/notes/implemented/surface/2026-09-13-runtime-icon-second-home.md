# 图标有两个家：Finder 图标对了不等于 Dock 图标对了

> 决策：[ADR-0081](../../../adr/ADR-0081.md) · 分类：surface · 生命周期：implemented

## Problem

### 症状：Finder 里是 ROOT，Dock 里是 DSH 原生，而脚本报「全部通过」

`brand-replay.sh` 一直守着一个家：`Contents/Resources/icon.icns`——**Finder** 里看到的那张图。
它是对的，所以脚本报 `BRAND ALL VERIFIED`。而**Dock 与菜单栏托盘**里是另一张图，官方原样。

第二个家是**覆盖**关系，不是补充：`dsh-plugin-desktop` 在启动时显式换掉 Dock 图标——

```
const iconFilename = runtime.platform === "darwin" ? "app-icon-mac.png" : "app-icon.png"
app.dock?.setIcon(fileURLToPath(new URL(`../build/${iconFilename}`, …)))
```

取的是 `app.asar.unpacked/build/` 里那一套，而那一套**从未被品牌化**。读数上它本来就看得出来：
`app-icon-mac.png` 是 2.2 MB 的官方图标，而 ROOT 的 `icon.icns` 只有 47 KB。

这就是 P-02（仪器假绿）与 P-07（一条事实多个家，只改了其中一处）叠在一起的样子：
检查报绿、用户看到的是官方图标，而**没有任何一处会说「还有一个家」**。

### 第二个坑：`--apply` 量的是目标，不是资产

把第二个家补上时，表写成了三列：**目标 : 资产 : 尺寸**。落笔前会量**目标**的尺寸并拒绝与声明
不符的（尺寸不符意味着基座换了图标规格，静默覆盖会把 Dock 图标换成一张模糊图）。

但**资产**自己错了没人管：资产是 512×512 而表里写 1024×1024 时，目标（1024）与声明相符、
`cp` 照落——Dock 图标成了一张放大的模糊图，而**所有读数都是绿的**。这与上面那个缺陷是同一
形状：**仪器量错了对象**。所以判据要补在资产那一侧，而不是再补一句「记得核对资产」。

### 第三个坑：`app.asar.unpacked/**` 在封条之内

补落已装 app 时要改的正是这个目录。它就地在代码签名封条之内——就地改 = seal 破损，
而 seal 破损不只是「签名难看」：TCC 判定要求时做代码有效性校验，seal 一坏，已授的辅助功能 /
屏幕录制会被**静默拒绝**（ADR-0068 的「假的已开启」）。所以补落之后必须用**同一个身份**重签
（指定要求是 `identifier + certificate leaf`，与字节无关，故授权延续，ADR-0063）。

而这个补落脚本自己的安全闸——「动手前确认没有实例在跑」——用的是一条 `pgrep -f`，
**在 DSH 运行时它读数为空，闸没有拦住**。那件事的修复是 [ADR-0080](../../../adr/ADR-0080.md)
（判据收成一家），本 Note 记录的是同一场会话的另一半。

## Decision

1. **运行时图标资产入库**：`packaging/assets/brand-icons/`（7 个 PNG：`icon-1024` ×1、
   托盘彩色 16/20/24/32 ×4、托盘模板 16/32 ×2）。与 `app-icon.icns` 同一模式——
   真相源在 `.dsh-root-brand-preview/root-icon/`（不进仓库），仓库里放**可分发副本**。
2. **`brand-replay.sh` 第 5 块**：一张 `ICON_PAIRS` 三列表同时管核对与落笔；
   `--check` 报 `DRIFT`，`--apply` 量目标尺寸并拒绝不符的，**资产缺失判红而不是静默跳过**。
3. **`assemble.sh` 随包分发** `brand-icons/` 到载荷 `tools/`，并以 `BRAND_ICONS_DIR` 把
   仓库侧资产传给重放脚本——不让同一批字节在仓库里存第二份。
4. **门禁 `brand-icons`**：表 ↔ 资产目录**两向**逐名对照 + **资产实际像素 = 声明像素**
   （直接读 PNG 的 IHDR）+ 目标名唯一 + 动态半核对已装 app 的目标文件名。
5. **`refresh-app-brand.sh`**：把品牌补落到已装 app 并重签；动手前的闸调
   `dsh-running.sh`，拿到 `4`（判不了）时中止。

## Alternatives considered

- **只品牌化 `icon.icns`（维持现状）**。否决：Dock 与托盘是用户日常看到的那张图，而
  `setIcon()` 会把它覆盖掉——「品牌化了」这句话在一半的面上是假的。
- **用 `sips -g pixelWidth` 读资产尺寸**。否决：外部工具不可用时判据会变成「读不出 → 无违规」，
  这正是本项要防的静默。IHDR 就在 PNG 第 16–24 字节，直接读。
- **把资产放进 `dsh-patches/brand-icons/`**。否决：那会造出第二个「资产在哪」的家；
  它与 `packaging/assets/app-icon.icns` 同类，放一起。
- **让 `refresh-app-brand.sh` 自己实现「在不在跑」**。否决：那会是同一条判据的第三个家，
  而它原来的那份实测**没有拦住**（ADR-0080）。
- **等下一版重装，不做已装 app 的补落**。否决：这次修复的可见收益正是「Dock 里那张图」，
  让它等一版没有道理；而补落的代价（一次同身份重签，授权延续）是可控且可验证的。

## Consequences

- 本机实测：`refresh-app-brand.sh --check` 报 9 处 OK（`icon.icns` + 8 个运行时图标），
  `BRAND ALL VERIFIED`。
- 闸有效：在 DSH 运行中跑 `--apply` → 退出码 **3**、在**任何写入之前**拒绝，
  已装 app 的图标字节 sha256 前后相同（一个字节未动）。
- 升级即自愈：基座升级覆盖 `build/` 那一套字节后，`--check` 报 8 处 `DRIFT`，
  跑 `--apply` 修复；装配时由 `assemble.sh` 自动重放。
- 门禁 `brand-icons` 的读数常显分母（表内 N 对 / 资产 M 个 / 目标侧已核 K 个），
  目标侧不在射程时报 `skip` 而不是通过。

**诚实划界（判不出的部分）**

- **Dock 上现在显示的是哪张图，没有任何静态判据能回答**：它由 LaunchServices 缓存与
  `app.dock.setIcon()` 的运行时调用共同决定。能判的只有「磁盘字节是不是品牌态」（哈希）与
  「缓存刷新动作有没有跑」（脚本步骤）。与 ADR-0078 同一处边界。
- 门禁不核「图案对不对」，只核尺寸与清单；`.icns` 那一半家不在 `ICON_PAIRS` 表里
  （ICNS 容器的尺寸规格由容器自己描述），本项不覆盖它。
