# DA-38 · 29 包 × 5 组归属审计

- 优先级：P1
- 状态：`open`
- 依赖：无
- 估算：M
- 来源：2026-09-22 诊断读数⑤（图谱 10 层分析器视角 vs package.json 归属声明视角，零对账）

## Problem

「卡位是否正确」有两个视角从未对过账：

- **声明视角**：包在 `packages/<组>/<包>` 的物理位置（ADR-0011 五组：capabilities/surfaces/platform/contract/infra）；
- **分析器视角**：图谱 10 层（capabilities 569 节点 / surfaces 303 / platform 111 / contract 12 / infra 54
  / shared-runtime 6 / engineering-delivery 205 / documentation 256 / dsh-patches 298 / historical-artifacts 228）。

两个视角各自存在，但「某包物理在 platform 组、图谱行为特征却全是 UI 面」这类错位从未被检出。
卡位错位的代价：改动射程误判（changed-packages 按组归类治理规则）、职责蔓延无人察觉。

## 动作

1. 产出对账矩阵：29 包 × {物理组 / 图谱主要层 / 依赖方向（导入方向、服务消费方向）/ 治理性质
   （luteOrigin/luteOwner/lutePublish）}；
2. 判错位：物理组与行为特征系统性不符的包点名（例：dsh-theme-local 在 platform，但其 8 个导入方
   全在 surfaces 侧消费——是「平台服务」还是「UI 供给」要判）；
3. 每个错位包三选一：**迁移**（物理组挪位，改路径 + 同步 pin/profile + 门禁）/ **登记豁免**
   （理由写清）/ **改图谱分层口径**（若错的是分析器）；
4. shared-runtime 层仅 6 节点、contract 层仅 12 节点——顺带判这两组是否名存实亡（并组提案走 ADR）。

## 验收

- 对账矩阵落盘，29 包每包有归类结论；
- 迁移项完成（若执行）或登记豁免期限；并组提案（若提出）落 ADR 草案交用户拍板；
- 门禁 `package-identity` / `package-layout` 相关项复验绿。

## 注意

- 迁移是高扰动动作（file: 路径、profile 同步、vendor 分组全要跟）——错位但无害的，
  豁免登记优先于物理迁移；
- 图谱分层口径本身是 LLM 分析产物，先怀疑分析器再怀疑代码（P-01：别把分析误差钉成架构债）。
