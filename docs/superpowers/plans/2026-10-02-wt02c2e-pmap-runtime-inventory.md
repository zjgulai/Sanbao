# WT-02C.2E-PMAP / E.0 · PMAP 合同与静态层 producers（实施计划）

日期：2026-10-02 · 关联 spec：[2026-10-02-wt02c2e-pmap-runtime-inventory-design.md](../specs/2026-10-02-wt02c2e-pmap-runtime-inventory-design.md) · 上游：[ADR-0165](../../adr/ADR-0165.md) / [ADR-0166](../../adr/ADR-0166.md) / [Host live inventory](../../notes/proposed/architecture/2026-09-28-host-live-inventory.md)

## 任务分解（串行，红→绿→变异）

**T1 · producers 内核（`src/main/runtime-inventory-pmap.ts`）**
- 注入面：`{ harnessHome, profileDir, readFile, listDir, now }`（零模块级 I/O）；canonical JSON（键序显式）+ `urn:sage:pmap-*:sha256:*` digest。
- 组件实现：preset（双 root、first-root-wins per id、`agent.cordis.yml`/`preset.yml` bytes 清单 digest、broken=文件级）、provider/model（settings 名空间 `agent-default-model` 白名单三字段；absent=用户面未配置）、agent（`@deepseek-ai/dsh-agent` 包身份 + exports canonical）。
- settings 读取（零依赖纪律，`deps: {}` 不破）：`.json` 形态 → 原生解析取白名单字段；`.yaml/.yml` 形态 → **不引入 YAML 解析依赖**，文件按存在性/扩展名/bytes 进入 evidence，字段级选择如实 absent（稳定 reason：`settings-not-statically-parsed`，字段级解析通道留后续票裁决）；文档存在但 JSON 解析失败 → broken。实现前先勘察 Sage 组合（bundle 层）是否实际挂载 `dsh-settings-file` 及其路径，未挂载则 provider/model 按 absent（reason：`settings-provider-not-mounted` 语义）——如实，不读未被运行时采信的文档。
- 变异：digest 面互换 → 红；first-root-wins 破坏 → 红；absent/broken 混淆 → 红。

**T2 · 测试（`test/runtime-inventory-pmap.spec.ts`）**
- fixture 根合成（tmp 目录）：shipped+user 双 root 组合、settings 三态（缺失/有效/破损）、包解析成败；goldens 手写 canonical/digest；hostile（`agent.cordis.yml` 为目录、越界 symlink、settings 注入非白名单字段被丢弃）。
- 真实 root 双跑：读本机 active generation + harness root，断言 4 shipped presets / 无 user presets / settings absent 的如实读数（存在性检查 → 不存在时按 absent 断言，不做静默跳过而是断言真实形态）。

**T3 · 全量回归与留痕**
- `npm run typecheck && npm test && npx tsc && npm run smoke`；`pnpm run gate`。
- Note（`docs/notes/implemented/security/2026-10-02-wt02c2e-pmap-runtime-inventory.md`）+ ADR-0187 + ledger；spec/plan 入库。
- 提交：feat + docs 两批（按既有节奏推送）。

## 验证命令（收口）

```bash
cd apps/sage-shell && npm run typecheck && npm test && npx tsc && npm run smoke
cd /Users/lute/project/Sage && pnpm run gate
```

## 边界（不做）

`RuntimeDescriptorV2` / `RuntimeInventoryEvidenceV2` 汇合（C2E.2）、capabilities、运行态 effective 观测与 Host protocol 扩展、Registry、Matrix、UI、任何写入。
