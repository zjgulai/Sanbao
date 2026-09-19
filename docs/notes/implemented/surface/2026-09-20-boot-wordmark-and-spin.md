# 006 启动字标与旋转周期修订

关联：[ADR-0136 D2/D5/D6](../../../adr/ADR-0136.md)、[工单 006](../../../../.scratch/sanbao-reskin/tickets/006-示踪弹-C.md)。

## Problem

启动词标旧检查把 `ROOT` 文本当作完成，当前基座没有独立 brandMark 节点，SVG 载荷不会被消费。启动 CSS 的原始周期为 0.8s；2026-09-20 用户明确要求改为 2s，不能只修改测试期望而不改变实际产物。

## Decision

字标由现有名源、固定提交采入的 Inter SemiBold 字体及中性占位标生成。CoreText 提取路径，SVG 不含运行时字体与独立文本字标。名源尚未迁移，仍输出其当前值，不提前更改应用名称或路径。

bundle 重放对唯一 wordmark 构造注入完整 SVG，并仅将启动 spinner 的 CSS 周期改为 2s。保留 spin keyframes、进度逻辑、conic 主题颜色引用；不改 vendor 源码。缺失/重复锚点拒绝，写入采用保留权限的临时文件替换。

浏览器验证消费真实 BootPage 构造、实际 CSS 与真实主题供给；分别验证亮暗状态、持续旋转、2s 时长与弧色。对禁用动画、错误时长和错误颜色施加独立突变。CSS Modules 派生的 spin 名称属于同一动画，不以完整散列类名作锚。

## Alternatives considered

- 修改 vendor：违反只读 pin 约束。
- 只改判据为 2s：真实 CSS 仍为 0.8s，浏览器 Red 已证明该做法无效。
- 在预览页额外覆盖时长但不重放产品：预览绿而出货仍旧，不采用。
- 先改所有品牌名字：与本票名源消费范围及用户要求不符，留给名字迁移批次。

## Consequences

生成期依赖 macOS Swift/CoreText，最终 SVG 不依赖用户字体；OFL 随输入入仓。安装修改 JS/CSS 前必须停机、备份启动资源、重签并重新验收；本记录不把隔离浏览器通过等同于真机已经完成。最终读数在工单回执中登记。
