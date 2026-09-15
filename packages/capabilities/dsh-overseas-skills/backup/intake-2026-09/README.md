# intake-2026-09 · 第三方技能入库回滚留底

> 依据：`docs/maintenance-sop.md` §12.6（回滚）、§12.9（P5）。

## 内容

| 目录 | 内容 | 为什么留 |
| --- | --- | --- |
| `presets-before-p3/` | 通用技能线接线**之前**的 52 份 `agent.cordis.yml` | 接线是**改写**已有 preset 的动作。`generate.mjs` 幂等重跑可复原，但「复原成什么」需要一个基线；只留 `agent.cordis.yml`（1.0 MB）而不是整个 preset 目录（4.0 MB）——后者的绝大部分是 `preset.yml` 里的 base64 头像，那是可以重新生成的机器状态，不是回滚材料 |
| `overwritten/` | 被择优覆盖的已装技能原件 | §12.6：覆盖前逐个 `ditto` 备份 |

完整 preset 快照（含头像）另存于本机 `/tmp/p3-presets-full-backup/`，**不进仓库**：
那是机器状态快照，不是交付物。

## 怎么用

```bash
# 逐字节确认接线只增不减（把备份与实际对比）
diff <(grep -o "skills: \[[^]]*\]" presets-before-p3/agt-001/agent.cordis.yml) \
     <(grep -o "skills: \[[^]]*\]" ~/.dsh/.agent-presets/agt-001/agent.cordis.yml)

# 回滚某个 preset
cp presets-before-p3/agt-001/agent.cordis.yml ~/.dsh/.agent-presets/agt-001/agent.cordis.yml
```

**注意**：直接 `cp` 会打破 `file:` 硬链接（架构红线 4）。预设目录不在 profile 的 `file:` 依赖里，
所以 `cp` 在这里是安全的；但技能目录与包产物一律走 `node scripts/sync-profile.mjs --apply`。
