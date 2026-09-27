# Sage

Sage 是面向跨境电商经营的桌面 AgenticOS。当前仓库以自有 `apps/sage-shell/` 为产品壳，通过 Capability Adapter 消费 Harness runtime；Sanbao 原型提供交互输入，Career 提供经营事项语义，历史插件暂时隔离、按需重新接入。

> 当前开发状态：**Sage P0 本机工程基线，尚未形成可发布 Sage.app**。BASE-01～05 的恢复与隔离边界见 [ADR-0160](docs/adr/ADR-0160.md)。
>
> 历史本地制品最高见 **v2.5.0**（DSH 2.0.10 / runtime 0.1.5-rc.2）；其正式发布状态与唯一分发渠道仍待核验。相关 DMG、安装说明、插件和打包流水线是 legacy / deferred 资产，不代表 Sage 已完成发布。

## 当前主线

| 模块 | 目录 | 当前边界 |
| --- | --- | --- |
| Sage 产品壳 | `apps/sage-shell/` | Electron 壳、产品状态、Capability Adapter、独立 profile / 数据根；本批不新增 UI |
| Sage 候选资产 | `assets/sage/` | 仅供内部工程验收；权属、商标、视觉批准和 release gate 仍未通过 |
| Harness runtime 参照 | `vendor/dsh-desktop/` | pin 的只读能力底座，不拥有 Sage 产品 UI |
| 产品决策 | `docs/adr/ADR-0159.md`、`docs/adr/ADR-0160.md` | 自有桌面端、活动仓基线、历史能力隔离与验收边界 |

## Legacy / deferred 能力

| 模块 | 目录 | 说明 |
| --- | --- | --- |
| 出海技能 | `packages/capabilities/dsh-overseas-skills/` | 历史技能体系；默认不接入 Sage 启动链 |
| 出海工具 | `packages/capabilities/dsh-overseas-tools/` | 历史外部工具能力；凭证与运行边界需重新验收 |
| 万物互联 | `packages/capabilities/dsh-wanzh-hulian/` | 历史 MCP / API / 企业应用 / 知识库集合；后续按 Sage 业务闭环选择性接入 |
| 技能子集 | `packages/capabilities/dsh-skill-subset/` | 历史预设技能白名单契约 |
| 宿主补丁集 | `dsh-patches/` | 宿主层补丁与 lint 工具 |
| 支撑插件 | `packages/**/dsh-*-local/` 等 | 历史 profile 插件；未明确启用前均为隔离状态 |
| 打包工程 | `packaging/` | 历史 DSH/LUTE DMG 流水线；尚未成为 Sage.app 发布链 |
| 文档 | `docs/`（ADR/架构/发布流程/白屏排查手册）、`doc/`（HTML 文档站）、`_doc-notes/` | 决策与知识资产 |

## 历史安装资料（非 Sage.app）

### 客户安装（DMG）

1. 从 [Releases](https://github.com/zjgulai/lute-dsh-platform/releases) 下载 `DSH-Desktop-LUTE-<版本>-mac-arm64.dmg`
2. 双击挂载 → 终端 `cd "/Volumes/DSH Desktop LUTE <版本>" && bash install.sh`；或双击 `LUTE Setup.app` 走向导
3. 安装后重启 DSH Desktop，重新授权 TCC：只需 **辅助功能** 与 **屏幕录制** 两项
   （不要授「输入监控」，它并非必需；「自动化」同样不生效）

> 仅支持 Apple 芯片 Mac（arm64，macOS 13+）。签名身份为固定自签证书（`LUTE Code Signing`）但**未公证**，
> 首启会被 Gatekeeper 拦（右键 → 打开）；**未公证与签名身份是两件事**：前者决定放行，后者决定 TCC 授权能否跨版本存活。
> 逐步操作、Gatekeeper 处置表、授权两项、完整性校验与常见问题一律见 [安装手册](packaging/INSTALL-GUIDE.md)（速查：[安装卡](packaging/INSTALL-CARD.md)）。

### Legacy profile 本机装配

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd ~/.dsh/profiles/desktop
pnpm add "file:${REPO_ROOT}/packages/capabilities/dsh-overseas-skills"
# 并在 package.json 的 dsh.profile.bundles 追加插件名
```

详细维护与生效语义见 `docs/architecture.md` 与各插件 docs/。
- 故障排查：`docs/dsh-desktop-white-screen-playbook.md`（DSH Desktop 白屏等二次开发常见故障速查，索引见 `docs/README.md`）。

## 历史版本与发布

- 版本：平台侧使用单一版本 `vX.Y.Z`（git tag = 打包版本）；`CHANGELOG.md`（根）与 `packaging/CHANGELOG.md`（打包）双轨汇总。
- 插件版本现状：各插件 `package.json` 保留自身版本，实测分布于 9 个取值（`0.0.3-alpha.1-port` … `1.0.1`），**尚未与平台版本对齐**；对齐机制与债务由 [ADR-0003](docs/adr/ADR-0003.md)、[ADR-0012](docs/adr/ADR-0012.md) 与门禁 `package-identity` 接管。
- 发布：`packaging/` 构建 DMG → **GitHub Releases 附件**（二进制不进 git）+ **入库清单** `release/<version>.sha256`（DMG 哈希 + 源凭据，由流水线生成、**先于 tag 提交**；[ADR-0058](docs/adr/ADR-0058.md)）+ [安装卡](packaging/INSTALL-CARD.md) 客户安装卡。
- 交付形态：**DMG 单一格式**（挂载 → 终端 `install.sh` 或 `LUTE Setup.app`）；BUILD 号标识每次打包（防同名多代混淆）。
- 流程 SOP：`docs/release-process.md`。

## 开发与验收

```bash
pnpm run gate               # Sage BASE 提交前门禁：壳质量、边界、数据隔离、路径与 ADR
pnpm run gate:full          # Sage BASE 推送前门禁；当前与 quick 使用同一必跑集合
pnpm run test:gate          # Sage BASE 门禁自身的反向测试
pnpm run gate:legacy        # 仅在明确进入历史平台任务时运行全量 legacy quick
pnpm run gate:legacy:full   # 历史平台完整门禁；不代表 Sage.app 已可发布
```

规则与分层见 [AGENTS.md](AGENTS.md)；门禁校验项与阻塞级别见 [docs/architecture.md](docs/architecture.md) 第 0 节。

## 决策与贡献

- 架构决策：`docs/adr/`（ADR-NNNN，模板与索引见目录内 README）。
- 贡献：PR 制（main 分支保护），Conventional Commits，PR 模板见 `.github/`。
- 安全红线：凭证不进仓库（.env/credentials 已被 .gitignore），提交前执行 secret 扫描。

## License

[MIT](LICENSE)
