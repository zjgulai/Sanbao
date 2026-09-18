这些文件是 2026-09-17 外观页 P1 的**一次性渲染验收仪器**（用完从包里删除，存档在此）。

复跑方式（必须放回包内，否则 react/react-dom 解析不到）：

```bash
cd packages/platform/dsh-theme-local
mkdir -p .harness && cp ../../../.scratch/appearance-revamp/harness/* .harness/
node_modules/.bin/tsdown --config .harness/tsdown.config.ts
node .harness/render-check.mjs   # 32 项：结构/交互/派生/偏好/分享/几何
```

读数与截图：`.scratch/appearance-revamp/render/`（render-check.json + 4 张 PNG）。
