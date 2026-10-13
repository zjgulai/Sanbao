---
title: 018 收口 A1——凭据 unset、模型行编辑与语义名单归位（ADR-0342）
doc_type: architecture
module: sage-shell
topic: credential-unset-and-route-edit
status: stable
created: 2026-10-13
updated: 2026-10-13
owner: self
source: ai
---

# 018 收口 A1（ADR-0342）

## Problem

018 未闭项三处：凭据 unset UX、既有路由编辑（baseURL/模型回填）、主端口语义名单漏改（固定名单让 18 声明的 `*_API_KEY` 引用不可寻址——批次 D 全程用固定名走查，路径从未跑到）。

## Decision

按 [ADR-0342](../../../adr/ADR-0342.md) 四项：语义名单归宿主（主端口只过文法、describe 按请求名）；`credentials/unset`（只读源具名拒）+ 路由 `'unset'` + `removed` 态；行操作收敛 `…` 菜单（编辑/测试连接/清除凭据/删除）；编辑态（供应商锁定、端点/模型预填、expectedRevision 冲突具名、**key 留空保留现有凭据**）。

## Alternatives considered

见 ADR-0342 备选表（逐个加名、省守卫、key 必填、改名编辑——逐条否决）。

## Consequences

- 声明引用名全链可寻址；编辑不漂移路由身份；未触碰字段绝不覆盖。
- 018 余项：pi-ai 段表单（A2）、D7 inventory overlayPolicyDigest。
- unset 实机复验随下轮 staging 重烤（sage-16 专家批占用 staging 验收窗口；本批单元/集成已覆盖）。

## Verification

真实运行（2026-10-13）：

- 全量 2194 passed（1 skip）；`gate` 32/32（sage-16 绿灯窗口内执行）。
- 新增 spec：host +1（unset 三态：正常/只读源/缺 provider）、route +1（unset 合法体）、
  端口 +1（unset 透传）、渲染 +3（编辑预填与留空保凭据、新 key 覆盖一次+冲突留窗、清除凭据与「凭据未设置」）；主端口原先的「名单拒绝」spec 重写为转发语义。
- 实机（打包 staging）：编辑弹窗逐字核对（「编辑模型 · openai-api-deepseek-com」、Model ID 预填 `deepseek-chat`、key 注记「留空则保留现有凭据」）；保存后 settings 文档行出现第二个模型、行显「模型 2 个」——编辑全链持久化实证。
- 实机反例（修复动机）：THROWAWAY 声明名在旧端口被 `credential-name-unavailable` 挡下——归位后由宿主按声明放行（单元三态覆盖）。
- **实机闭环（2026-10-13，v19 installed 副本，登录态 CDP）**：目录行「清除凭据」→ 具名回执「已清除凭据（DEEPSEEK_API_KEY）」+ 行转「凭据 未设置」；「编辑」→ 仅 Key 弹窗（无端点字段）→ 输值保存 →「配置与凭据已保存」+ 行转「凭据 已设置」——留空保留与覆盖两态、unset 全链均实测。证据：`docs/notes/implemented/packaging/evidence/2026-10-13-sage-v19-model-live-verify.json`。
