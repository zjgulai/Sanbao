---
title: VF-0 阶段报告：Qoder 真机截图批 1（导航通路 + 5 张基线 + 0.4.4 漂移发现）
doc_type: analysis
module: sage-shell
topic: vf0-live-screenshots
status: draft
created: 2026-10-13
updated: 2026-10-13
owner: self
source: ai
---

# VF-0 阶段报告：Qoder 真机截图批 1

对应票据：[视觉保真票](../../../plans/2026-10-12-qoder-visual-fidelity-tickets.md)（VF-0）

## 已入库截图（`assets/qoder-reference/screenshots/base-20261012/`，全部 2540×1838 @2x，条件：窗口 1270×919、mint-light 主题）

| 文件 | 状态 | sha256 前 12 |
|---|---|---|
| `session-main-mint-light-…png` | 会话主页（三栏全开） | 74c6e0eb8fd2 |
| `settings-profile-mint-light-…png` | 设置·个人资料默认页 | 1d21022e64f9 |
| `settings-search-model-mint-light-…png` | 设置搜索过滤态（搜「模型」） | 9c74eae040de |
| `settings-models-list-mint-light-…png` | 设置·模型**已配置列表态** | a6013b645095 |
| `settings-models-add-dialog-mint-light-…png` | 设置·添加模型弹窗（QB20-02 真身） | 5f338434d0e0 |

## 导航通路结论（可复用）

1. **截图**：`screencapture -x -o -l<CGWindowID>`，离屏/被遮挡窗口也可截（不打断用户）。
2. **导航**（三层通路，按可靠性排序）：
   - **AXFocus + 回车**（✅ 最可靠）：递归 AX 树找到目标 `AXButton` → `set focused of … to true` → `key code 36`。React 合成事件一定收到。
   - AX `set value`（✅ 对文本框有效）：搜索框设值「模型」成功触发过滤；`keystroke` 中文无效（Electron 合成中文输入已知问题）。
   - AXPress / CGEvent 坐标点击（❌ 对侧栏行无效）：AXPress 被 React 吞掉；CGEvent 因 retina 2x + 窗口 origin 的坐标换算复杂且实测未触发路由。
3. **菜单**：`click menu item "设置…"` 打开设置面板有效。

## 关键发现

### 1. 0.4.4 已漂移（capture 是 0.3.4）

- **模型页列表态是 capture 未覆盖的新观测**：14+ 个已配置模型行（DeepSeek V4.1 Flash/V4 Pro、GLM-5.1/5.2、MiniMax-M2.5、GPT-5.6 Terra/Luna、GPT-6 Sol、Hy3/Hy4 preview、Kimi K3/K2.6），每行「模型名 · routing group」+「OpenAI Compatible」副标题 + 开关 + … 菜单。
- capture（batch20）只有空态（虚线框「暂无自定义模型」）。**Sage 矩阵行对应的是空态**，复刻范围无错，但列表态是 VF 的潜在追加观测。
- 「添加模型」按钮从白底边框（capture）变为**实心绿主按钮**（0.4.4）。
- 弹窗本体与 capture 高度一致：供应商（阿里云百炼 - 中国）/类型（Token plan + 右侧「购买 Token Plan ↗」）/模型（选择模型）/API Key（空占位 + 眼睛 + 「获取 API Key ↗」）/取消 + 禁用「校验并添加模型」。**验证了 Sage R17-B 复刻的结构正确性**。

### 2. 主题判定修正

- 真机界面主题是 **mint 系浅色**（画布 `#f9fbf9`、侧栏 `#dff1ea`、选中行 `#cfe0d9`、气泡 `#e6f5f0`、主按钮 `#4fa98f`）。
- 首图文件名已从 `forest-light` 更正为 `mint-light`。

### 3. 弹窗遮罩与浮起

- 弹窗 backdrop 是**重模糊 + 白色叠加**（背景几乎不可见），卡片白底、大圆角、标题左上、右上「?」反馈 + 关闭 ×。
- Sage 的 `settings-modal` 样式（`--sage-shadow` 轻阴影）与真机的重模糊遮罩观感差异大——VF-2 的明确改造点。

## VF-0 剩余

- 逐状态截图继续（常规/模式配置/任务监控/快捷键/语音/外观 + 会话各态），导航通路已定型，可批量。
- Qoder 当前停在设置·模型页（弹窗已关）。如需回主页：点「返回应用」。

## 明确不做

- 不点「校验并添加模型」「获取 API Key」「购买 Token Plan」等外部/写路径（零凭证接触红线）。
- 不改 Qoder 任何设置值。
