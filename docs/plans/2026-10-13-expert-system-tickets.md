# 专家体系集成票（Accio UX × AI组织变革 3+50 内容源）

- 日期：2026-10-13
- 状态：执行基线（待用户批准排期）
- 决策：[ADR-0341](../adr/ADR-0341.md)
- 逆向证据：本文档「逆向发现」节；截图（0.24.1 智能体网格 / 0.34.4 专家会话）存于会话记录，正式入仓随 EP-1 批
- 内容源：AI组织变革项目（仓库外 `~/project/Sage_hub/AI组织变革/`）——`docs/05-agents/role-catalog.json`（50 AGT）、`management-catalog.json`（3 MGT）、`souls/*.soul.md`、`preset-blueprints/*.json`、`dist/data/visual-identities.json` + webp 头像资产

## 逆向发现（关键面）

- **Accio 专家数据模型**：name/avatar/agentType（9 内置 persona）/model{provider,name,reasoningEffort}/systemPrompt/**soulMd**（Soul+Identity markdown 人设文档）/allowedTools/mcpServers/defaultProject。0.34.4 增专家团（teamId）、会话场景 tab、内置专家注册表、tone 枚举。
- **知识库**：文件上传 + folder + `<knowledge_base_refs>` 会话注入 + RAG。**插件**：自由市场安装全生命周期。
- **UI 形态**（0.24.1 智能体列表 = Sage 第一期模板）：标题+计数 tabs（我的智能体 N / 任务衍生）+ 搜索 + 新建虚线卡 + 卡片网格（头像/名称/描述/对话主按钮/创建团队次按钮）。
- **UI 形态**（0.34.4 专家会话）：侧栏专家树（当前专家+全部专家）+ 品牌区（像素头像+标题+副题）+ composer（插件/场景/权限/模型选择内嵌）+ 场景 tab 行 + 内容卡片行。

## 与 Sage 底座的映射（兼容性结论）

| Accio | Sage 对应 | 状态 |
|---|---|---|
| soulMd/systemPrompt | 岗位 soul.md + Role Playbook（3+50 已有 50 套） | ✅ 内容现成 |
| model{provider,name,reasoningEffort} | ADR-0339 model-config | ✅ 并行会话已落地 |
| allowedTools | Capability Registry approved 面（只读消费） | ✅ 治理底座在 |
| defaultProject | 工作区 custody（T03/T04） | ✅ |
| 专家团 teamId | L1-B 事项分组（已落地 admission） | ⏳ 后置 |
| 知识库 | 知识中心（OBS02 未接存储 provider，T12 射程） | ❌ 后置 |
| 插件自由安装 | Registry 治理模型 | ⚠️ 只复刻浏览形态 |

## 批次

| 批 | 内容 | 依赖 | 矩阵射程 |
|---|---|---|---|
| EP-0 资产投影 | 3+50 目录 → Sage 内置专家静态投影（role-catalog/soul/头像路径打包进 sage-assets 或独立 assets 面；design 状态语义保留） | 无 | 无（新数据面） |
| EP-1 专家列表 UI | 「专家」页：卡片网格 + 计数 tabs + 搜索 + 新建虚线卡（复刻 0.24.1 形态 + VF-2 几何体系）；数据=EP-0 投影；创建/对话按钮具名禁用 | EP-0 | 新产品面（矩阵外，需登记） |
| EP-2 ExpertProfile 存储面 | Application Service 批：ExpertProfile DTO/intent/存储 owner/幂等回执（unavailable-first） | EP-1、行为线射程 | 同上 |
| EP-3 创建/编辑流 | 身份+prompt+model（ADR-0339 面板）+工具白名单（Registry approved 只读）+默认工作区选择 | EP-2 | 同上 |
| EP-4 对话直通 | 卡片「对话」按钮 → 新建事项走既有 session send admission；专家 prompt 面注入 sealed context | EP-3、T05/T06 合同 | 同上 |
| EP-5 专家团 | teamId 语义 → L1-B 分组绑定 | L1-B 成熟 | 后置 |
| EP-6 知识库绑定 | ExpertProfile × 知识中心 | T12 存储 provider | 后置 |

## 边界

- Expert 是**新产品面**（矩阵 206 行之外）——EP-1 起需在 tracked matrix 登记新组（catalog 扩展批），不冒充任何现有行。
- 工具白名单创建时不产生新授权（ADR-0171 fail-closed）。
- 岗位资产 `production_authorized=false` 语义全程保留：Expert 投影是配置内容，不是生产行为授权。
- Accio 文案不逐字照搬；交互复刻、文案走 Sage 治理调性。
- UI 几何沿用 VF-2 体系（白卡/发丝线/24px 标题/品牌区/头像 tile）。

## 验收方式

- 每批真实命令输出（tsc/vitest/gate）；EP-2 起按 Application Service 批标准（route admission 测试 + 拒绝路径负例）。
- EP-1 的卡片网格与 VF-3 视觉验收管线衔接（对比工具 + 截图对）。
