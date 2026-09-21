# DA-08 · 测试纵深计划：四个零覆盖边核心包的最低测试面

- 优先级：P1
- 状态：`local-done`（2026-09-21：无语料最低测试面、LoopX 默认套件接线及独立评审通过；未合入主树）
- 依赖：无
- 估算：L
- 来源：本次图谱实测；报告 TOP20 #8

## Problem

图谱 `tested_by` 边仅 85 条，且以下包生产节点与测试之间**零覆盖边**：
- `dsh-browser-local`（52 文件 / 88 函数）
- `dsh-paper2skills`（49 文件 / 107 函数）
- `dsh-algo-skills-local`（41 文件 / 53 函数）
- `dsh-loopx-plugin`（23 文件 / 50 函数）
注意：这些包**都有** test 脚本（28 包全部齐备、豁免清空），缺口是「测试触达生产代码的纵深」而非存在性；`changed-packages` 门禁只管脚本存在。

## 动作

1. 为每个包定「最低测试面清单」：纯函数优先（协议解析 / 路径归一 / 状态机 / frontmatter 处理）；
2. 随该包**下次改动**顺带落地（不为补测试而补测试）；
3. p2s 双树（`p2s-two-trees` 在飞工作）优先；
4. 每条新用例遵守 P-16 的教训：**不依赖本机语料**（无语料机器上必须同样跑）。

## 验收

- 每包 ≥1 条不依赖本机语料的最小用例进入该包 test 套件；
- 用例带「该判红的状态」负例（P-25：写不出该红的状态说明没有射程）；
- 更新本表结算栏并记录各包覆盖增量。

## 注意

不为覆盖率数字写空白测试；优先覆盖「错了会静默」的逻辑（解析、归一、生成）。

## 最低测试面复核（2026-09-21）

**图谱没有 `tested_by` 边，不等于代码没有测试。** 四包已有直接调用生产逻辑的正反用例；
前三包不再重复造测试，最低测试面以如下实际执行及反证为准。当前覆盖增量尚未结算。

| 包 | 最低行为契约 / 既有用例 | 无语料副本原版 | 单点破坏后的结果 |
| --- | --- | --- | --- |
| dsh-browser-local | `tests/protocol.spec.ts` → `src/protocol.ts`：有效握手保留协议字段；坏形状拒绝 | 11/11，exit 0 | 让 hello 分支恒拒绝：2 failed / 9 passed，exit 1 |
| dsh-paper2skills | `test/html-text.spec.mjs` → `lib/html-text.js`：pre 缩进保真；script/style 剔除；实体不二次解码 | 11/11，exit 0 | 对还原的 pre 再压平空白：缩进/保真断言失败，exit 1 |
| dsh-algo-skills-local | `tests/frontmatter.spec.ts` → `src/frontmatter.ts`：双向切换幂等；正文逐字保留；无 frontmatter 拒写 | 20/20，exit 0 | 无 frontmatter 返回原文而非 null：1 failed / 19 passed，exit 1 |
| dsh-loopx-plugin | `test/env-policy.test.mjs` + `test/runfile-isolation.test.mjs`：真实子进程不继承哨兵凭证；显式危险注入拒绝 | 独立执行 3/3；**默认套件未收集** | 让 `buildSanitizedChildEnv` 直接展开父环境：这三例 exit 1，**默认套件仍 7/7、exit 0** |

执行口径：前三包的临时目录只复制表内源文件/测试文件及最小 ESM 声明，不复制本机语料。
Vitest 两包只复用只读依赖目录，显式配置仅收集表内测试；paper2skills 使用 `node --test`。
每个副本先跑原版，再只改表内一个行为，断言原版 exit 0、突变版 exit 1；仓库生产文件未修改。
LoopX 复制包内容（不带 node_modules），仅将生产隔离函数的最终返回改成全量透传，分别运行
`node --test test/*.spec.mjs` 与 `node --test test/env-policy.test.mjs test/runfile-isolation.test.mjs`。

同日额外基线：browser 包正常套件 111/111；algo 包正常套件 154/154（有依赖 sourcemap/localStorage
告警，不声称输出洁净或全套不依赖语料）；paper2skills 的 html + secret-scrub 两文件 24/24；LoopX 默认 7/7。

**本轮实际改动**：LoopX 默认命令已同时收集 `.spec.mjs` 与 `.test.mjs`；新增实际执行的迷你套件回归，
验证两个后缀都执行且任一失败均非零，哨兵用例通过 `t.after` 恢复此前环境。未改生产隔离策略。

本地结算：默认套件从 7 项到 11 项（3 项既有隔离用例接入、1 项收集回归）；原版 11/11、
隔离函数全量透传突变 3 failed / 8 passed。前三包新增用例为 0，已对既有最低面做无语料红绿反证。
独立评审规格/质量均通过；尚未合入主树，不将此工作区结果写成远端已生效。
