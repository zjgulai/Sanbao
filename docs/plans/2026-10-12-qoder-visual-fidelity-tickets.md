# Sanbao → Sage 视觉保真票（先复刻，再超越）

- 日期：2026-10-12
- 状态：草案（待用户批准范围与顺序）
- 前置阅读：[Sanbao → Sage UI 一致性合同](../specs/2026-09-27-sanbao-to-sage-ui-consistency-contract.md)、[tracked 矩阵](../specs/2026-09-27-sanbao-to-sage-ui-state-map.json)、[集成票据](2026-10-05-sanbao-in-sage-integration-tickets.md)、Qoder RE 证据政策（本机 memory，仓外：`~/.claude/projects/-Users-pray-project-Sage-hub-Sage/memory/qoder-re-evidence-policy.md`）
- 目标：用户裁决（2026-10-12）——**先复刻 Qoder 的视觉，再超越它**。本计划把 `visualAcceptance` 从「206 行全 pending」变成有证据、有工具、有 owner 的可执行批次。

## 问题陈述

当前 Sage.app 与 Qoder.app 视觉不像，根因是三层各自为政：

1. **证据层零图像**：观测捕获（QB01–QB20+）只有 AX 树文字与工具截图的目视转述，无可回读原生 PNG 入仓（`vendor/sanbao-prototype` 内 0 张图）；capture 明文「不能声明像素匹配」。
2. **原型层是自造设计**：原型 CSS（如 `settings-models.css` 的 `#4d6c5a`）是「沿既有浅色设计基准」的近似，不是 Qoder 提取物。
3. **Sage 层刻意换肤**：`theme-tokens.ts` 是 Sage-owned palette（brand `#166642` 绿），Qoder 品牌色从未进入；`styles.ts` 仅 440 行，几何尺寸转译自原型而非 Qoder。
4. **合同明文隔离视觉**：一致性合同第 45 行「当前合同不是 GUI、像素……验收」；五维中 `visualAcceptance` 无任何票认领。

而 REA 逆向通道（本机 memory 政策）允许从 `/Applications/Qoder.app`（0.4.4，app.asar 136 MB）静态提取**精确** CSS/色值/间距/字体——这一层至今未做。

## 原则

- **先复刻后超越是两段**：VF（Visual Fidelity）批先做到「同条件截图肉眼难分」；超越（Sage 独有视觉语言）必须在 VF 收敛后另立设计票，不得混批。
- **RE 是设计输入，观察是金标准**：`app.asar` 静态提取的 CSS 给精确值；每个状态的最终视觉事实仍以 Qoder 真机同条件截图为准（版本戳 + 条件记录）。静态锚点不证可达性。
- **视觉验收不降级其他四维**：`visualAcceptance` 闭合不抬升 `ui`/`applicationService`/`hostIntegration`/`electronAcceptance`；反之亦然。
- **不碰红线**：不从 Qoder 提取密钥/凭证；不改 pin 的 `vendor/dsh-desktop`；palette 字面量唯一家仍是 `theme-tokens.ts`（Batch 10 合同）；编辑工具不打破 `file:` 硬链接。
- **行为票优先于视觉票的顺序不变**：VF 批不改任何行为合同（route/intent/kernel 零改动）；正在推进的行为批（T06 合同冻结等）不受阻塞，但 VF 精修应等该状态的 `ui` 行稳定后再做，避免对着会变的结构打磨像素。

## 并行批次

| 批次 | 内容 | 可并行性 | 串行汇合点 |
|---|---|---|---|
| VF-0 证据基建 | Qoder 资产提取管线 + 逐状态截图基线库 + 截图对比工具 | 独立，立即可开 | 提取物入库格式（一次定死） |
| VF-1 设计 token 对齐 | 从提取 CSS 推导 Qoder 语义 token → 映射进 `theme-tokens.ts` | 依赖 VF-0 | token 命名与 Sage 语义层的映射表 |
| VF-2 几何与组件精修 | `styles.ts` 按 Qoder 实测几何重写（间距/圆角/阴影/字号阶梯） | 依赖 VF-1，按状态族并行 | 每 token 唯一语义 |
| VF-3 逐状态视觉验收 | `visualAcceptance` 逐行闭合（截图对比 + 人工回看） | 依赖 VF-2，按状态族并行 | 206 行分母与证据格式 |
| VF-4 超越（另立票） | Sage 独有视觉语言（暗色深化、动效、品牌感） | VF-3 首批收敛后 | 设计票 + 用户确认 |

依赖图：

```text
VF-0 ──> VF-1 ──> VF-2 ──> VF-3 ──> (VF-4 超越，另立票)
          │                           │
          └── 截图工具可提前服务 VF-3 ──┘
```

## Task VF-0 · Qoder 资产提取与截图基线库

- 矩阵 owner：0 行；全 VF 前置
- 依赖：无（Qoder.app 0.4.4 本机在位，REA 6.4.0 可用）

验收：

- **资产提取**：REA（`npx rea-agents@latest analyze-javascript-application`）+ asar 解包，从 `app.asar` 提取全部样式表与设计资源（CSS、theme JSON、字体清单、图标 SVG 资产名册）；产物带版本戳（0.4.4 + build 号）与文件锚点，落 `drafts/analysis/qoder-re/`（转正前）或 `assets/qoder-reference/`（转正后，格式见下）。
- **提取物转正格式**：每条视觉事实 = `{token候选, 字面值, 来源文件:行, 消费者数, qoder版本}`；禁止整文件照搬（Qoder CSS 里混着 Sage 没有的业务选择器，照搬即引入死样式）。
- **真机截图库**：对 tracked 矩阵已 observed 的状态，在 Qoder 真机逐状态截图（固定条件：窗口尺寸、主题、字体缩放、内容种子，全部记录）；条件记录与图像同入 `assets/qoder-reference/screenshots/<stateId>/`。截图由受控脚本产出（复用 DMG-06 的 CDP 截图管线模式），不用手工随意截。
- **对比工具**：像素 diff + 布局 diff（元素盒模型对齐率）脚本入 `scripts/visual-fidelity/`，接入方式与 gate 解耦（视觉门禁是 VF-3 的独立判据，不进 `pnpm run gate` 基线，避免无 Qoder 环境的机器红）。
- 证据：提取清单（文件×选择器×token 候选数）、截图库索引（stateId×条件×sha256）、对比工具的 Red/Green 各一例。

明确不做：不提取/存储任何 Qoder 凭据或用户数据；不逆向 Qoder 后端；不做 Sage 侧任何样式修改（那是 VF-1/2）。

## Task VF-1 · 设计 token 对齐

- 矩阵 owner：0 行；全 VF 语义前置
- 依赖：VF-0

验收：

- 从 VF-0 提取物推导 **Qoder 语义 token 表**（画布/侧栏/面板/正文/次级/边框/强调/状态色/圆角/阴影/字号阶梯/间距尺度——与现有 `SAGE_THEME_TOKEN_NAMES` 对齐命名），每条带来源锚点与同条件截图互证。
- 映射决策入 `theme-tokens.ts`：light/dark 两主题逐 token 重定值（Qoder 实测值）；**文件仍是唯一 palette 家**（Batch 10 合同不破）；Sage 品牌差异点（若有意保留）单独登记为「有意偏离清单」，逐条给理由，默认零偏离。
- 字体栈、字号阶梯、行高按提取值落 token；reduced-motion 与 focus 环的视觉形态对齐 Qoder（可访问性不回退：对比度逐对复算，不达标值记「有意偏离 + 理由」）。
- density 几何（`--sage-density-*`）按 Qoder 紧凑/舒适实测值重定。
- 验证：token 变更后全量 settings/桌面截图重拍，与 VF-0 基线并排人工回看；主题合同测试（Batch 10/11）真实运行。
- 证据：映射表文档（token×Qoder 值×Sage 旧值×偏离理由）、对比度复算表、真实 tsc/vitest/截图输出。

明确不做：不动组件布局（VF-2）；不引入第三个主题（旧 2026-09-20 三主题计划属旧壳 `dsh-theme-local`，与 Sage 壳无关，不继承）。

## Task VF-2 · 几何与组件精修

- 矩阵 owner：0 行；按状态族并行
- 依赖：VF-1

验收：

- `styles.ts`（当前 440 行）按状态族拆批重写：每族的布局、间距、对齐、组件形态（按钮/弹窗/菜单/输入/列表）对齐 VF-0 基线截图；几何参考从「原型转译」升级为「Qoder 实测」。
- 状态族划分沿用矩阵分组（P06 设置族、P13/O05–O07 工作区族、S11–S13 会话控制族、T10 模型/插件族……），每族一张子批，改完即跑该族已有 tracked-test 回归 + 截图对比。
- 布局 diff 工具给出每族对齐率数字；人工回看记录入族子批报告。
- 零行为改动：DOM 结构、aria、交互合同不动（结构已由行为批闭合）；只动 CSS/几何。若发现结构必须改才能对齐视觉，该情况单独立缺陷票回行为线，不在 VF-2 顺手改。
- 证据：每族 before/after 截图并排 + 对齐率 + 回归测试真实输出。

## Task VF-3 · 逐状态视觉验收闭合

- 矩阵 owner：**206 行 `visualAcceptance` 维度**（本票唯一动矩阵的批）
- 依赖：VF-2（族级依赖：该族 VF-2 完成即可开验，不必等全量）

验收：

- 逐行闭合 `visualAcceptance`：Sage 真机（DMG 或 dev 装载）同条件截图 vs VF-0 Qoder 基线，对比工具出数字，人工逐状态回看签字；检查项按规格定义（布局、主题、density、焦点、键盘、窄宽 320px、必要可访问性）。
- 证据 tracked：每行 evidenceRefs 挂截图对（Sage/Qoder）+ 对比工具输出 + 回看记录；证据格式与矩阵 gate 兼容（tracked 文件路径，kind 命名走 `visual-readings`，登记进 gate 白名单）。
- N/A 行（如 Sage 无此面的状态）按矩阵惯例给 tracked 决策与 rationale，不静默跳过。
- Qoder 侧版本漂移处理：基线锁 0.4.4；Qoder 升级后基线不自动跟（「先复刻」的对象是已采样的 0.4.4），漂移感知另记。
- 证据：矩阵 `visualAcceptance` verified 行数从 0 → 目标值；generator + gate 真实退出码。

## Task VF-4 · 超越（占位，另立票）

- 依赖：VF-3 首个收敛族 + 用户对「超越什么」的明确指示
- 方向候选（届时用户裁决）：Sage 品牌感深化、动效语言、暗色体验超越 Qoder、信息密度优化、Qoder 没有的状态面的视觉首创。
- 本计划只占位不定义；防止「复刻未收敛就开始发挥」。

## 与既有票的关系

- **集成票据（T01–T14）**：行为线继续独立推进；VF 批不改其验收判据。T14 的 206 行收敛要求「五维全 verified」——VF-3 是 `visualAcceptance` 那一维的实际执行者，T14 依赖 VF-3。
- **DMG 内测链**：VF-2/3 每族收敛后可随下一版 DMG 发布实测；DMG-06 验收截图（1440/660/320）自动成为 VF-3 的 Sage 侧证据源之一。
- **旧三主题计划（2026-09-20）**：属旧壳（`dsh-theme-local`/`sanbao-tokens.ts`），不继承、不冲突、不合并；Sage 壳的视觉语言以本计划为准。

## 风险与边界

1. **Qoder 0.4.4 的 CSS 可能是构建产物（压缩/混淆/运行时注入）**：提取层需先做可行性探针（VF-0 第一周动作）——若主题值是运行时计算（JS 动态注入 CSS 变量），RE 静态提取降级为「结构线索」，精确值必须全部改走真机取色（CDP `getComputedStyle` 逐 token 读取），VF-0 验收标准相应切换。此风险在 VF-0 内消化，不阻塞立项。
2. **零偏离 vs 可访问性冲突**：Qoder 某些对比度可能不达 WCAG。默认逐对复算、不达标记「有意偏离清单」交用户裁决；不静默修正（修正即不是复刻）。
3. **工作量**：206 状态 × 2 侧截图 + 人工回看是本计划最大成本；VF-3 按族推进、允许长期分批，`visualAcceptance` 是五维中唯一可以「最后集中闭合」的维度，与行为线无互锁。
4. **Qoder 停更/换版**：基线锁 0.4.4 快照，RE 提取物与截图库共同构成不可变参照，Qoder 后续变化不影响已采证据。

## 执行顺序建议

1. **VF-0 立即开工**（无依赖、纯增量、不碰 Sage 代码）；第一周先出「提取可行性探针」结论（风险 1 的裁决输入）。
2. VF-0 交付截图工具后，可与行为线并行逐族推进 VF-1→2→3。
3. 行为线（T06 冻结、T13-models 等在途批）不受阻；VF 对某状态的精修等该行 `ui` 稳定后启动。
