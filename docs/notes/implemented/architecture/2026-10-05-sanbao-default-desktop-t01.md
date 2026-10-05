# Sanbao 默认桌面接入：T01

- 日期：2026-10-05
- 决策：[ADR-0265](../../../adr/ADR-0265.md)
- 状态：T01 默认桌面及响应处理切片已通过本地测试、实机复验、独立复核与 Sage quick gate；未提交、未推送。完整后端接入目标仍未完成。

## Problem

用户要求现有 Sanbao 原型成为 Sage 默认桌面 UI，并完成真实后端接入。历史第二窗口承载与状态挂载检查没有满足此要求。另一个问题是原型完整桌面夹带了示例任务/账号/活动数据，以及发送后立即清空草稿的模拟行为。

## Decision

按 ADR-0265，将默认文档服务纳入既有 main 的 `dsh-app://app/index.html`，保留 createSageWindow、FramePolicy 与 Application Service。新组件与 bundle 独立于旧 renderer 的 parked 改动；取消正常启动中的附加窗。首片只读取当前服务状态并处理真实拒绝，成功聊天写链仍未接通。

### 受控复用来源

原型 clean HEAD：`b861d046013fb8bee9a1f3224ed0965efcf42111`。以下路径相对 Sanbao 的 `repository-snapshot/apps/sanbao-prototype/`；不作为运行时引用。

| 来源 | Sage 本地消费 | 改动原因 |
| --- | --- | --- |
| `src/pages/ProductPages.tsx:31–40,73–75` | `src/product/app/desktop/page.tsx`、`icons.tsx` | 保留完整侧栏/首页/装饰几何，移除示例账户、额度、任务和活动事实。 |
| `src/components/Controls.tsx:5–37,199–234` | `icons.tsx`、`page.tsx` | 复用 SVG、工具条、上下文栏；草稿受控，不立即清空。 |
| `src/styles/prototype.css:1,7`、`session.css:1` | `styles.ts` | 沿用桌面几何，改用现有 Sage 语义 token；补320px reflow。 |

组件不以 query 参数、观察状态号或时间驱动业务进度。侧栏后续族入口显示准确未接通说明，不声称已经实现其服务。

## Alternatives considered

- 原型另窗或目录嵌入：不满足默认桌面替换。
- 原样挂 App、隐藏目录：仍有模拟数据和流程，不能当作业务状态。
- 重新设计首页：不必要；直接复用已完成的桌面结构。
- 绕过 main 的授权链直连 Host：不接受；界面接入不授予执行权。

## Consequences

- 默认主窗口现为 Sanbao 复刻结构；旧 renderer 字节及 staged index 保持不变，仍保留其回归测试。
- 当前 production `/.sage/state` 返回 `projection-read-unavailable`。新界面确实收到并处理该响应，但这不证明登录、模型或成功聊天已接通。
- 完整规划与206行矩阵位于仓根 `.birdview/2026-10-05-sanbao-in-sage-integration-{spec,tickets}.md` 和 `.birdview/2026-10-05-sanbao-sage-integration-matrix.csv`；本片不提高完整集成计数。
- T02 系统入口、T03 独立读取策略、T04 custody、T05 首条消息、T06 追加/停止/恢复及功能族 T07–T14 均保持未完成。DMG、签名和资产发布独立验收。

## Verification

证据目录：`.birdview/evidence/sanbao-desktop-t01-2026-10-05/`。

- 初次缺模块属于装载失败、零测试，不算行为红。补接口后主入口/客户端为7条具名失败；UI组件在最小挂载上获得13条行为失败，之后20/20通过。
- 独立审查发现编码路径回落旧界面、成功投影被丢弃、空bundle未阻启动、GUI继承Node模式。分别补反例；最后一次聚焦测试为5文件40通过，typecheck/build exit 0。
- 正常服务响应测试使用实际 composition 输出；拒绝集成测试使用实际 service route，验证独立策略缺席时没有读取 workspace provider。真实生产请求仍是拒绝，不把测试中的成功响应当生产成功。
- 真实主入口实例：独立数据根、无 fixture；仅一个 `dsh-app://app/index.html` 产品窗；标题 Sage、首页“不止于编程”、完整侧栏和任务输入存在、无目录 chrome。
- 真实 GET `/.sage/state` 返回200 denial；重读只发GET，输入跨 Enter、导航与重读保留；上下文菜单 Escape 返回原按钮；无业务写请求、无页面异常。
- 首轮320px失败（document宽656px）定位到活动区 aspect-ratio 与84px最小高度。临时 width:100% 对照得到656→320→656，随后落源码修复。第二进程复验1440/660/320px的scrollWidth分别为1440/660/320，inputWidth分别714/433/254。
- 实际应用内 `/%69ndex.html`、`/index%2ehtml`、`/unknown` 均404，未返回旧/新文档。CSP原值保持。
- 浅/深色与窄宽截图已生成；主题仅以浏览器媒体条件模拟，root权威主题仍unknown，不宣称持久化偏好链已接通；重启只验证默认界面与响应，不宣称草稿跨进程持久化。
- 最终 `pnpm run gate` exit 0：27/27（quick，expected/discovered/checked=84，skipped=0，failed=0）。这包含 Sage Shell typecheck/build/test；门禁对象的零skip不代表全部测试用例无skip。
- 第二次独立复核确认四项Important问题已修复，额外只读内存探针20项断言通过，没有新Important；它未重跑GUI。真实GUI证据来自本记录的主控探针。Enter、导航、Escape已走CDP输入；Shift+Enter/IME仅组件事件测试，未冒充完整原生输入法验收。
- 旧renderer四文件差异及完整staged index与开工前保存的patch逐字节相同。本轮没有commit/push。未运行的成功聊天/模型调用不计为通过。

## 下一停点：T02

新增 `GET /.sage/bootstrap` 前须批准本机读取分类与门禁扩展：仅runtime状态枚举、auth.status以及必要theme/density字段，不包含名字、令牌、session引用、配置值、工作区或业务内容；校验默认主窗caller、ready且未污染的frame及读前后新鲜度。现有route-authority门禁固定58条及四种分类，需同步修改检查器、自测和矩阵，不能绕过其源码发现规则。获准前不实施新读取入口，原业务读写权限保持。

## 操作入口

从 Sage 仓根运行 `pnpm --dir apps/sage-shell dev:debug`，默认构建并启动一个产品主窗。隔离验证可用 `--root <独立开发根> --inspect-port 9239 --cdp-port 9232`；不要使用生产根。

在实例就绪后从仓根运行 `node apps/sage-shell/test/support/desktop-live-check.mjs .birdview/evidence/sanbao-desktop-t01-2026-10-05 9232`。该工具会输入合成草稿、切导航和浏览器媒体条件，产出JSON与PNG；exit 0只覆盖该工具列明的默认桌面/拒绝/输入/焦点/reflow，不覆盖成功业务执行。
