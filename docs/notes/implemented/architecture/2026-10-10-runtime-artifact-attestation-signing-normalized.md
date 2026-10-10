# C2A canonicalization v2：安装时 attestation 吸收生产签名变换

- 日期：2026-10-10
- 决策：[ADR-0281](../../../adr/ADR-0281.md)
- 状态：已实施（代码 + 回归测试 + 真实全树终验）；打包链需重跑 producer 记录 v2 摘要后重签。

## Problem

首个打包验收（[DMG 链首跑 note 的十追加](../packaging/2026-10-10-dmg-chain-first-real-run.md)）在 installed-copy 首次启动时红：

```
RuntimeArtifactAttestationError: installed runtime artifact set no longer matches its attestation
  at verifyRuntimeArtifactAttestation (bundled-profile.js:154)
```

全树逐文件对照（输入树 27,716 文件 vs 已签嵌入树）证明差异**恰好** 13 个文件 = sign 阶段重签的 Mach-O 原生件。C2A `artifactSetDigest` 在 producer materialize 时对**签前字节**计算；打包链合法地改写这些字节（`codesign --force` 覆盖 vendor 签名）。更深一层（对 13 个文件逐一 remove-signature 对照）：`codesign --remove-signature` 恢复签名外全部字节，但把 `__LINKEDIT.vmsize` 留在签名期间的布局值（10/13 仅此 1–2 字节之差，可升可降，文件尺寸恒等）。即摘要按现状不可能跨「producer → 打包签名」存活。

## Decision

1. `canonicalizationVersion` v1→v2（既有版本化接缝；v1 attestation 在 v2 下解析即拒绝）。
2. Mach-O 逐文件归一化：私有副本 `codesign --remove-signature`（未签名 no-op）+ `__LINKEDIT.vmsize` 归零后哈希；非 Mach-O 原样。`executable` 位、路径、symlink 拓扑、installer metadata 语义不变；源树不被触碰，TOCTOU 快照校验保持。
3. 非薄片 64 位 LE 抛 `artifact-normalize-failed`（fail closed）。
4. 与 packaging `signing-normalized-tree.mjs` 同语义、两份实现各自测试钉住（无共享包）。
5. 回归夹具必须真实改变签名字节（先 `--remove-signature` 清零基线 + 签名后断言字节已变）——同种 ad-hoc 重签是字节确定的，会假绿（本修复第一版夹具两次踩此坑，见 Verification）。

## Alternatives considered

- 打包链签名后重写 attestation/manifest：写入者易主 + 级联重写 profile-manifest 与 sage-build 归一化摘要 + 自引用风险——否决。
- 校验器跳过 Mach-O 条目：把运行时主体移出内容身份——覆盖损失更大——否决。
- v1 保持 + 打包路径容忍错配：同一根因两侧语义分叉并静默掩盖漂移——否决。

## Consequences

- content identity 对合法签名变换不变；drift 检测仍覆盖全部非签名字节与 topology。
- 摘要不再绑定签名字节：签名有效性与叶身份归 bundle seal 与 `sage.local-signing-receipt.v2`（职责分开，ADR-0167/0271 同向）。
- v1 摘要全部作废：内测链必须重跑 `produce-inputs → assemble → sign`；既有 DMG 保留为 v1 历史读数。
- dev materialize 链行为不变。

## Verification

证据（2026-10-10，全部真实执行）：

- **回归测试**：`apps/sage-shell` `node scripts/test.mjs run test/runtime-artifact-attestation.spec.ts` **11/11**（含新增「重签保持同一 content identity」：清零基线 → 签名 → **断言字节已变** → 摘要不变 → 篡改字节 → 摘要必变）；`test/bundled-profile.spec.ts` **5/5**（含新增「admission 之后 Chromium 写入 session 文件不阻断 install」竞态回归）；`pnpm run typecheck` 退出 0。
- **真实全树终验（v2 修复现场）**：`inspectInstalledArtifactSet`（built lib）对 `staging/input/profile-template/profile`（签前）与已签安装副本的 `sage-profile-template/profile` 计算 `artifactSetDigest`：两侧同为 `sha256:09c1ae99…`，`installerMetadataDigest` 相等，扫描 25s。这正是首启 fresh scan 倒下的那条判据。
- **golden 重新锚定**：两处手写 golden 与 v2 链上的派生值同步——`runtime-inventory-provider.spec.ts` 七条 provenance 摘要与 `runtime-inventory.spec.ts` projection canonical/digest（manifestSha256 等因 manifest 内嵌 attestation 摘要而合法改变；installerMetadataDigest 不变，逐字段核对）；`apps/sage-shell` 全量套件 **EXIT=0（0 fail）**。
- **未运行（需重跑链）**：v2 摘要下的 `produce-inputs → assemble → sign-local → dmg → accept-dmg` 全链读数；重签后 install 的真实首启。
