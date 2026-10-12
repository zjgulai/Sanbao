---
title: 跨代重观测重发——发布器 refresh 模式与矩阵 pair 失配修复
doc_type: architecture
module: sage-shell
topic: cross-generation-republish
status: stable
created: 2026-10-12
updated: 2026-10-12
owner: self
source: human+ai
---

# 跨代重观测重发

## Problem

v7 装机实测走查步骤 7（发送）：`protected-effect-unavailable`，装版探针（`SAGE_DISPATCH_PROBE=1`）落点 `stage: compatibility`；逐层探针（`admitDeviceAggregateRead` 无关——此处是 protected-effect 链）定位到 `matrix-pair-not-found`：

- live Host `runtimeDescriptorDigest = db60b818…`（= produce 的 `artifactSetDigest 09c1ae99…` 派生）；
- 装版矩阵规则声明的 pair = `208b273e…`（旧 profile 世代，录制于重物化之前）；
- 全 descriptor 唯一差异 = `host/harness.artifactDigest`。

**生产发送的 compatibility 步结构性失败**——冷启动死锁（ADR-0324）遮蔽至今，真实发送从未跑通过。发布器 `publish-session-controls.mjs` 为一次性迁移器：base 已是 controls 世代即拒绝，无跨代重发路径（ADR-0285 D4 那代为手工重锚）。

## Decision

见 ADR-0326（D1-D4）：

1. 发布器新增 `--refresh` + `--fixture`：refresh 下生成守卫改判「须为 v1 基座」，两条 v1-round-trip 检查显式跳过（跨代重发必移该 pair）。
2. **等价性外部证明**替换被跳过的检查：用上一版 fixture（`git show HEAD:…`）干跑，与已装出版物逐字节比对——本次三件全部 IDENTICAL，证明组合保真。
3. 程序：`git checkout 3d074f09^ -- publications/` 恢复 v1 → `inventory-probe` 对 `~/Library/Application Support/Sage` 重录制（与 live 同源）→ 等价证明 → `--refresh --fixture <new> --write`。
4. spec 重锚：`MATRIX_ID/BUNDLE_ID/TARGET_SEMANTIC_DIGEST`（compatibility）、`TARGET_SEMANTIC_DIGEST`（persistence）按加载器现值；窗口/生效期前提改录制驱动（`observedAt+Δ`）、默认窗镜像 shipped 窗。

## Alternatives considered

- 手改 sealed 矩阵字节：跳过 kernel 校验；否决。
- produce 链内自动重录制：给「出货即配对」假安全感；否决。
- 放宽 kernel pair 匹配：拆证据链；否决。
- 无外部证明直接重发：被跳过检查无补位；否决。

## Consequences

- 净变更：矩阵包（4 规则 runtime pair `208b273e…→db60b818…`、prompt 语义重导 `a9a0feb0…→429a9a34…`）+ fixture + 发布器 + 4 个 spec 文件；requirement/registry 逐字节不变。
- 全套件 236 文件 2089 passed；跨代重发成为可复用程序（每次 profile 世代变化执行一次）。
- v8 装机后发送实测 = 端到端验收（本记录不替代）。

## 证据

- 装版矩阵拒绝：`[compat-matrix-denied] {…"code":"matrix-pair-not-found"…}`。
- live vs fixture descriptor diff：仅 `host/harness.artifactDigest`（09c1ae99 vs 692994b9）。
- 等价证明：dry（旧 fixture）三件 `IDENTICAL`。
- 重录制：`descriptor=…db60b818…`（与装版探针一致）。
