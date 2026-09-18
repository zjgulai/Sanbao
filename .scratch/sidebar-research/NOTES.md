# 侧边栏导航对标研究 · 取证底账（2026-09-18）

> 目的：为 DSH Desktop 侧边栏重构提供参照物证据。方法：`screencapture -l<windowId>` 截单窗 + Vision OCR 取文案与几何 + Swift 像素采样取色。截屏在 `shots/`（d01=DSH 全屏基准，w02/w10/w11/w12=四参照物单窗）。

## 参照物可得性
- Codex.app 本机无独立包；实为 **ChatGPT.app (v153.0.8010.36) 内的 Codex Framework 视图**，进程实测。
- Qoder CN v0.2.5 · MiniMax Design v3.0.15 · Accio (AccioWork) v0.32.6，均 Electron，实测主窗。

## 实测侧栏结构（OCR 逐行，非印象）

### Codex（ChatGPT Mac 的 Codex 视图）窗 900pt
1. `Codex ⌄`（产品线上下文切换器）+ 右侧 搜索/设置 图标
2. 动作 nav 行（**纯文本行，无按钮 chrome**）：新对话 / Pull Request / 定时任务 / 插件
3. `置顶` 分区（1 项）
4. `项目` 分区：按项目分组的线程（codex-research / Magpie-Horch / AI组织变革 / VOA / 爆款复刻）+ 展开显示
5. `最近` 分区：扁平近 14 条会话
6. 底部：`OpenAI`（账户）
- 其「设置」窗导航 22 项扁平：常规/导入/外观/语音/配置/个性化/宠物/键盘快捷键/账户 | 集成:电脑操控/应用快照/插件/浏览器/编码/钩子/连接/Git/环境/Worktrees | 已归档

### Qoder CN 窗 660pt
1. 顶部 `编程` tab（带计数?）+ 侧栏开关图标行
2. `新的任务` / `搜索`（动作行，文本形态）
3. `工作区` header + 行内 `+`
4. 任务列表（当前「暂无任务数据：）」）
5. 底部：知识中心 / 自动化 / 扩展 / 用户(周健来了) / 设置

### MiniMax Design 窗 640pt
1. `MiniMax Design` 标题
2. `开始创作`（动作行）/ `项目库` / `技能·连接器` / `ComfyUI 工作流`(Beta 徽章)
3. `项目 ⌄` 分组
4. 底部：版本更新卡（New Version Available, v3.0.15→3.0.16, 下载完成 + 重启升级按钮）+ 用户 PrayChow

### Accio (AccioWork) 窗 765pt，侧栏实测最窄
1. `Accio Work` + `新任务` / `智能体` / `插件` / `定时任务` / `消息渠道` / `移动端 Beta` / `知识库`
2. `任务` 分区（SEO-GEO 助手）/ `群聊`
3. 底部：分享赚积分卡（最高 1,200 积分，增长位）+ Accio user + 升级

## 实测几何（OCR 文本框推算 pitch，retina px ÷2 = pt；宽度为文本范围估算，标 ⚠️估算）
| 产品 | 启动动作形态 | nav 行 pitch(估算) | 会话行 pitch(估算) | 侧栏宽(**实测**) | 侧栏底色(实测) |
|---|---|---|---|---|---|
| Codex | 文本行 | ~30–33pt | ~30pt | **275pt** | #FEFEFE |
| Qoder | 文本行 | ~32–35pt | — | **252pt** | #F1F2F2 |
| Minimax | 文本行 | ~33–38pt | — | **272pt** | #F1F1F3 |
| Accio | 文本行 | **恒定 30pt** | 30pt | **280pt（反而最宽）** | #E6E8E8 |
| **DSH** | **38pt 双胶囊按钮**（500 字重+描边+elevated填色） | 插件行 ~36.5pt | 会话行 34pt | **279pt** | #191C1A（当前暗主题） |

> **2026-09-18 勘误**：「侧栏宽」列原为截图 OCR **文本框范围估算**（误差最大 60%：Accio 记 175pt、实测 280pt），已按像素行扫描实测改写（仪器 `.scratch/sidebar-research/scanrow.swift`，每图 2–3 行复核）。pitch 两列**仍为估算，未复核**。

## 关键结论
1. 四个参照物的启动动作**全部是无 chrome 的文本 nav 行**；「两个并排大按钮」在参照系中不存在。用户「调小」的直觉方向对，但根治是「去按钮化」。
2. 「颜色不搭」根源（代码已证）：split 双按钮照抄官方 elevated-fill+border-l3 token 形成双份 chrome；新应用 active 态另用 LUTE 品牌绿（newapp.module.css:624），一对按钮两套色彩体系。
3. ~~DSH 侧栏是四家之最宽~~（**2026-09-18 已证伪**，见下勘误与 spec.md §7：实测 279pt，落在参照带 252–280pt 内）；工作区与会话行 pitch(34pt) 偏松、顶部按钮却最重——**「视觉权重与使用频率倒挂」这一条仍成立**。
4. 共性可偷：单一轻启动行、异步能力进一级 nav（PR/定时任务/自动化）、项目-会话两级分组、置顶、账户沉底、Beta 徽章语义化。
5. 不要偷：Codex 设置 22 项扁平 nav、MiniMax 版本更新卡塞侧栏、Accio 分享赚积分增长位。
