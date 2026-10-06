# Sanbao Logo Kit 源（品牌源资产）

原始 SVG 的唯一本地副本；`scripts/generate-sage-assets.mjs` 用它再生成 `assets/sage/` 交付资产。

- 文件：`A_StarSail_Product_symbol.svg`
- SHA-256：`9a90f439f48b597c4afc9459836cd036371705880573f1749970cae78631a4d1`（与生成器内 `expectedSourceSha256` 逐字节一致）
- 来源：2026-10-06 收纳自迁移前 Sanbao 同级快照的 `SanBao_Logo_Kit/svg/`（同目录另有 `_light` 变体，**不是**生成器输入）
- 再生成：`node scripts/generate-sage-assets.mjs --source assets/sanbao-logo-kit/A_StarSail_Product_symbol.svg --out assets/sage`
- 位置说明：本目录刻意放在 `assets/sage/` **之外**——`sage-assets-generated` 对 `assets/sage/` 做「目录 ↔ manifest outputs」精确对账，任何多余条目都会判红（2026-10-06 实测）。
- 权属 / 商标 / 视觉批准状态仍以 `assets/sage/manifest.json` 为准（当前为 unapproved）；本文件收纳不改变该状态。
