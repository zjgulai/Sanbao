# 2026-09-16 · 门禁必须说明分母，live preset 的每条 row 必须有身份与结论

关联：[ADR-0094](../../../adr/ADR-0094.md)、[P-02 / P-03](../../../pitfalls-playbook.md#p-02--仪器假绿)

## Problem

开工前的 Red 有两层。总门禁拒绝 `--json` 与 `--require-no-skip`（均以用法错误退出），checker 之间只有
`passed/skipped/note` 的松散约定；`catalog-fresh` 在必备文件读不到时返回 pass，profile、技能环境和 staging
的可选射程缺失也有多处分支没有显式 skip。调用方无法回答“预期多少、发现多少、核对多少”。

`live-presets` 的旧扫描报告 53 个 preset / 1,590 行，但同一批文件里实际有 1,642 个 row；差值正好是
52 条裸 `dsh-skill-subset`。旧启发式把“不像路径”的裸包排除在 row 之外，未知 `!!js` 又被当作 truthy
disabled。删掉这 52 条中的任何一条，分母随发现数一起缩小，门禁仍可退出 0。

## Decision

先把结论层与业务判据层拆开。`gate-result.mjs` 负责 canonical schema、守恒验证、checker throw、legacy
adapter、汇总和 strict 退出码；`gate.mjs` 只负责选择 checks 与渲染同一份文本/JSON。legacy adapter 明确只按
一个 gate 单元记账，不推测业务对象分母；后续 QG 卡迁移各自对象时再移除对应 legacy 输出。

`live-presets` 则直接给出对象级事实。实现参考 pinned `dsh-agent-presets` 的 composition inventory、discovery 与
specifier 分类，但根包没有可复用 YAML runtime，因此采用窄化 parser：顶层 list、group nested config、单行
scalar、明确的 win32 表达式。普通 config 与 block scalar 中的 `name:` 不算 row；无法解释就失败。

仅做逐次扫描仍挡不住“删一条，分母一起变小”，所以增加 `live-presets.expected.json`：每个 preset 保存 row
数量与 `stableId + name + kind` 的 SHA-256。清单不保存 config、persona 或凭证；`--print-inventory` 只打印候选，
不会自动覆盖治理文件。任何更新都要先看结构 diff，再用 patch 入库。

## Alternatives considered

- 继续把 `note` 当审计信息：note 没有可机读守恒，也不能驱动 strict，否决。
- 把 disabled 计入 checked：会让“宿主根本不加载此 row”冒充已执行检查，否决；在 canonical 层记 typed skip。
- 写死 53 / 1,642 / 52：这些只是迁移证据，会随合法结构变化；正式判据使用 inventory 推导，否决硬编码。
- 把每条完整 row 写进 inventory：会复制用户配置面；按 preset 聚合身份摘要已能检测增删改，暴露更少，采用摘要。

## Consequences

- L1：parser/计数/canonical/inventory 负例覆盖裸包、六类 specifier、nested group、未知表达式、重复 ID、
  错误缩进、缺文件、零 row、缺/坏 inventory；定向 suite 全绿。
- L2：临时 preset 树中删除一条裸包，或替换成另一个**同样可解析**的包，resolver 本身仍绿而 inventory 必红。
- L3：真实用户根只读重采 53/53 个文件、1,642 rows；1,483 checked、159 platform-disabled、0 failed，
  52 条裸包全部进入分母，inventory 匹配。此读数是本机 acceptance，不是 CI、DMG 或生产证明。
- 普通 quick gate 可带 typed skip 退出 0；`--require-no-skip` 对同一结果退出 1。三份全 gate 并行时观察到
  既有共享 fixture 干扰，串行复跑稳定；并发收口继续由 QG-006B 负责。
- 没有写入真实 preset、没有重启 DSH、没有 UI/DMG 验收，也没有 commit/push。
