# N1 决策票 · 侧边导航四带契约

- 日期：2026-09-18
- 状态：**待裁决**（未签字项一律不作为实现依据）
- 出票：agent · 裁决人：用户（lute）
- 取证底账见 §4，每条断言可在本机重跑

## 1. 本轮已裁决（你在本轮会话里的原话）

| 编号 | 议题 | 裁决 | 对实现的即时影响 |
|---|---|---|---|
| S-1 | 收口范围 | 一次把四带契约全部裁决 | 6 条开放项同批裁决，冻成一份契约 |
| S-2 | 侧栏宽度 | 仍要更窄，目标 252pt（比照 Qoder） | **与基座硬约束冲突，需重述** → T-1 |
| S-3 | split 分列模式 | 保留 split 作为可选形态 | **P0 已删除该实现，需恢复** → T-2 |
| S-4 | 启动带行高 | 维持 36px | 与已实现一致，P0 无需改动 |

## 2. 取证：两条裁决触碰到的硬约束

### 2.1 宽度：252pt 在基座夹逼区间之外（新事实）

```js
function clampWidth(px, min, max) { return Math.min(max, Math.max(min, Math.round(px))) }
const s = sidebar === 0 ? 56 : clampWidth(sidebar, 264, 420)   // computeColumns
d.layoutInfo.sidebar = clampWidth(px, 264, 420)                // setSidebar（拖拽写入路径）
```

来源：`/Applications/DSH Desktop.app/Contents/Resources/app/node_modules/@deepseek-ai/dsh-client-ui-layout/lib/client.js:25,37,362`

- 侧栏宽度是**可拖拽的用户偏好**，硬性范围 **[264, 420] px**；收起态 56px；契约默认 280。
- 像素实测 279pt ≈ 契约默认 280 → 你看到的宽度**就是默认值**，不是被拖过的。
- **252 < 264 → 写偏好这条正规路径到不了 252。** 要到 252，只能覆盖壳施加在 frame 上的
  **inline** `style.gridTemplateColumns`。代价：`DragHandle` 的 `left: cols.sidebar` 与拖拽基数
  `sidebarBase = cols.sidebar` 仍按存储值算 → **手柄位置与实际渲染宽度脱钩，一拖就跳**；
  且这是对官方 UI inline 样式的强改，须在真实应用里取证（ADR-0019 同族风险）。
- 252 与 264 的实际差别：**12pt**。Qoder 的 252pt 是它自己的窗口与字号下的结果，不是可移植常量。

### 2.2 split：P0 删掉的是一整条形态分支（清单）

`shared/client/sidebar-entry-core.ts`（+ 两个表面各一份副本，共 3 份），净 `+100 / −122`：

- `position: 'before' | 'after' | 'split'` → `'before' | 'after' | 'stacked'`（联合类型改名）
- 删除 `applySplitGeometry()`、`SPLIT_COLLAPSED_MAX_WIDTH`、`SPLIT_COLLAPSED_LIMIT`
- 删除 split 分支及其 `ResizeObserver` 条件（并排几何是「根渲染宽度」的函数，必须观察 resize）
- 契约测试 `sidebar-entry-split.spec.ts` 被 `git mv` 成 `-stacked.spec.ts`（原测试内容已不存在）
- 门禁 `scripts/gates/sidebar-row-axis.mjs`：`split` 列退役 → `nav-band` 列（ADR-0124 D5）

**恢复「可选形态」的真实工作量**：核心恢复两种几何 + 联合类型容纳四值 + 恢复/重写 split 契约测试
（三份副本逐字节一致的同步约束仍在）+ 门禁要能**同时**断言两种形态的行轴（否则「可选」只有一半在射程内）。
**且 ADR-0124 的 D5「split 列退役」必须修订**——它不是坏决策，但它的前提（split 不再存在）变了。

## 3. 待裁决（6 条）

**T-1 宽度终值**
- A. **264px** —— 基座允许的最小值，走正规路径（偏好/拖拽可达），无 hack、无拖拽脱钩。比现状窄 16pt。〔建议〕
- B. **252px** —— 精确比照 Qoder；需 CSS 强改 inline 网格轨道，拖拽脱钩，须在真实应用取证并接受该 UX 代价。
- C. **维持 280px** —— 不动。

**T-2 split 的「可选」载体**
- A. **API 可选**：`position` 容纳 `'split'` 与 `'stacked'`，默认 `'stacked'`，宿主继续传 stacked。〔最小代价，建议〕
- B. **用户可切**：设置页或侧栏菜单给开关 + 偏好持久化 + 两种形态各自验收。
- C. 恢复原行为（宽时并排、窄时堆叠）—— 回到 P0 之前。

**T-3 四带结构是否成立**：启动带 / 能力带 / 内容带 / 系统带作为侧栏的四层视图
- A. 成立，照此冻结。〔建议〕
- B. 只冻结前三带，系统带（设置/帮助/账号）本轮不纳入。

**T-4 能力带收编方式**（任务板 / SSH / 技能中心 / 岗位矩阵）
- A. 收进「工作台 ▸」折叠组（L1 一个入口 + L2 四项）。〔建议〕
- B. 保持四个平铺行（不加折叠层）。
- 代价差别：A 省 3 行高度、多一层点击与一个展开状态；B 一眼可见、侧栏更长。

**T-5 内容带增项与次序**（会话 / 工作区为主体）
- A. P1 加「置顶」，搜索行放 P2。〔建议〕
- B. P1 加「搜索行」，置顶放 P2。
- C. 两个都进 P1。

**T-6 插件入口纪律是否升门禁**
- A. 升：把「官方 UI 改写锚禁止钉哈希」+「同列同行轴清单」写成契约 ADR + 门禁。〔建议〕
- B. 只写 ADR 不升门禁。

## 4. 取证底账（可重跑）

```bash
# 宽度硬约束
awk 'index($0,"clampWidth"){printf "%d| %s\n",NR,substr($0,1,120)}' \
  "/Applications/DSH Desktop.app/Contents/Resources/app/node_modules/@deepseek-ai/dsh-client-ui-layout/lib/client.js"
# 像素实测（设备像素 ÷2 = pt）
./scanrow shots/d01-dsh.png 500 0 3600 10 30      # 侧栏 106…663 → 557px → 279pt
./scanrow shots/w10-qoder.png 912 0 2864 10 30    # 侧栏 112…615 → 504px → 252pt
# split 删除面
git diff --stat -- shared/client/sidebar-entry-core.ts
```

## 5. 边界（诚实划界）

- Qoder 的 252pt 由同批截图实测；四款参照的 pt 换算依赖 2x retina 假设（由契约默认 280 与实测 279 互证）。
- 侧栏宽度**没有门禁**守着（`gate:sidebar-row-axis` 只守行轴）。T-6 若选 A，这是首个该纳入的判据。
- 本票未签字前，P0 代码不进入任何提交（R3 未授权）。
