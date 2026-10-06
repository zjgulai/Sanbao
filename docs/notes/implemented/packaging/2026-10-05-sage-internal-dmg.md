# Sage 0.1.0 本机自签内测 DMG

- 日期：2026-10-05
- 决策：[ADR-0271](../../../adr/ADR-0271.md)
- 状态：脚本与合同已实施；真实 Sage identity、签名、DMG 与 packaged restart 仍以本页 Verification 的最终读数为准

## Problem

Sage 已有独立产品壳与本地开发入口，但没有产品自有的 production input、first-run profile、bundle identity、签名、DMG 与安装后验收链。旧 DSH/LUTE 发布链的产物和通过记录不能回答 Sage 是否能在空资料根启动，也不能证明设置 GET/save/readback 在安装副本和第二进程中仍成立。

## Decision

1. 新建 `packaging-sage/` 作为唯一 Sage 包装 namespace；`product.json` 固定 `com.lute.sage`、`0.1.0`、build `1`、`arm64`、internal 与 local-self-signed。
2. producer 从 build 后 main entry 求 reachable runtime graph并生成离线 dependency closure，同时在隔离 `SAGE_ROOT` 调用既有 profile materializer；两份输入各自有 schema、manifest、digest、symlink 与 Mach-O 守卫。product-owned build output 拒绝开发材料；第三方 published package 默认完整保留，只有 exact package/version/path 的平台投影可删除。当前唯一投影是 `node-pty@1.2.0-beta.15`：保留 `darwin-arm64`，精确移除已登记的其他平台 payload 与 `third_party/conpty`，未知版本、路径漂移、arm64 目标缺失或投影后的 ELF/PE/非 arm64 Mach-O 一律拒绝。
3. assembler 从 pinned Electron bytes 形成 Sage.app，替换 outer/helper identity 与 icon，保持 runtime unpacked，并拒绝 product-owned 开发文件、外部 symlink、绝对仓路径或错误架构。`sage-build.json` schema v4 分开记录签前 raw input digest 与 assembly signing-normalized digest；normalization 只在私有副本移除 Mach-O signature superblob，其余 bytes、size、mode、path、directory 与 symlink 都进入摘要。
4. signing 与 DMG 都分 plan/execute。签名 identity 必须 exact `Sage Local Code Signing`；`sage.local-signing-receipt.v2` 绑定 signed app tree、签名计划、outer designated requirement 与证书 SHA-256/SHA-1，并按重新生成的计划逐个核对 Mach-O、framework、helper 与 outer app 的同一 signer。DMG 产后从只读挂载点复制安装副本，并以 seal、relocatability 与 tree digest 对钉 staged app。
5. `sign-local.sh` 只为当次执行生成短期证书与私有临时 keychain，不复用其他身份、不进入仓库或 manifest，也不修改用户 keychain search list。macOS SecurityAgent 对增加和移除 code-signing trust 的人工批准是不可绕过的阻塞门；只有 trust 已移除、临时 keychain 已删除后 wrapper 才成功。清理失败时保留权限收紧的恢复材料并判失败，不能把 signer 成功冒充整条生命周期完成。
6. 安装副本必须以 fresh root 首启，再以同一 root 重启；验收同时覆盖设备偏好 exact DTO、八项设置、写后 GET、restart persistence、三档 reflow、Host 与异常面。只有 `sage.packaged-acceptance.v1` 的 `passed=true` 结果、DMG receipt/hash、首启/重启读数、六张截图与 detach/cleanup 证据齐全，才能写 DMG-06 通过。

## Alternatives considered

- 复用 legacy `packaging/`：产品事实与运行时来源不同，否决。
- 直接复制 workspace：出货面不可控并携带开发材料，否决。
- ad-hoc 签名或复用 `LUTE Code Signing`：不能形成 Sage 专属身份边界，否决。
- 本批启用 Developer ID、公证或自动更新：超出“本机自签、仅内测”的授权，后置。

## Consequences

- 本链产物只能作为本机内部安装与联调证据；没有公众 Gatekeeper 信任、公证或外发资格。
- production closure 和 profile 首次物化较慢，但输出可独立审计且不依赖当前用户 profile。
- source commit 只提供 HEAD 上下文；schema v4 会另记相关范围是否含 tracked/untracked dirty。dirty 本机诊断产物可以装配，但不能声称仅凭 commit 可重建；真实 byte provenance 以 input 与 packaging definition digest 为准。
- DMG 与功能矩阵正交：即使 packaged smoke 全绿，206 行也不会自动从 0 提升。
- T05 真实模型调用与 T06 完整主链若缺 authority/provider，必须继续写未完成，不能由 Host ready 或设置页通过替代。

## Verification

截至当前断点，纯合同测试、producer 与装配/签名/DMG/acceptance 必须分别登记，前一步通过不得推断后一步。真实验收尚缺以下读数：

- `Sage Local Code Signing` 临时 identity 的 SecurityAgent trust 增加与移除；
- 成功且复验通过的 `sage.local-signing-receipt.v2`；
- 真实 DMG hash、只读挂载/安装副本 receipt；
- `sage.packaged-acceptance.v1` 且 `passed=true` 的 fresh-root 首启、same-root restart 与六张截图。

在这些读数全部落档前，结论严格保持为“真实 DMG 尚未验收”。
