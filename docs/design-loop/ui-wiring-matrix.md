# UI/UX接线覆盖矩阵 · 分组与页面族工作稿

- 状态：设计讨论中。包含分组索引、页面族/细态静态复核及206源ID交叉索引；不代表逐按钮或接线/运行验收完成。
- 当前推进遵循[用户校准的目标](discussion.md#当前目标与优先级2026-10-01-用户校准)：优先核对每项UI/UX功能需要的Sage后端能力、复用/适配/补建差距及请求/状态/结果链；权限治理细化后置，历史矩阵行不作为继续权限访谈的任务队列。
- 决定真源：[讨论工作稿](discussion.md)；术语：[CONTEXT](CONTEXT.md)。本表只引用决定，不重复其全文。
- 来源：Sanbao原型 `../Sanbao/repository-snapshot/apps/sanbao-prototype/src/catalog-data.json`。
- 本轮只读复算：59组、206条唯一状态、28条多组归属、0条未知/空组引用；catalog SHA-256 `9eaf593a5bdc214ec0d938951e7aaa6859111823c361a2719c736210276398d3`。
- 表中“索引条数”以原始 `groupIds[0]` 作去重记账归属，合计206；此顺序仅用于索引，不推导产品主责或页面归属。跨组关系完整保留在原目录。
- 原型来源等级：123 observed、28 entry-observed、55 static-only；本轮不把来源等级转换成产品完成状态。目录外参数细态仍需另列，不计入206。

## 功能接线首批：输入与会话主链

2026-10-01按用户校准后的目标复核。范围是首页输入、草案整理、正式会话发送、执行反馈、停止、历史及结果入口，不继续权限治理细化。以下是源码证据和接线建议，尚非实施授权；正式首闭环的单店订单摘要、跨设备产品记录及本机执行要求不因本批分层分析而缩减。

### 核心结论与来源

- **基座有会话引擎，Sage尚未接到界面。** Sage当前装配状态见[当前Sage接线基线](#当前sage接线基线更新)；不能将产品port缺失说成整个基座没有能力。
- **基座取证来自pin指定的物化包。** [vendor pin:11-16](../../vendor/dsh-desktop.pin#L11)区分只读submodule与运行源；本批读取`vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/`，session-controller [package.json:1-16](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-session-controller/package.json#L1)为`0.1.5-rc.2`。没有读取机器应用或真实profile替代，也未证明当前Sage profile已挂载每项服务。
- **原型可借交互，不可直接沿用数据行为。** [Controls.tsx:195-198,251-256](../../vendor/sanbao-prototype/src/components/Controls.tsx#L195)发送仅传text并清空；[app.tsx:709](../../vendor/sanbao-prototype/src/app.tsx#L709)只保存prompt并跳回放；[SessionPage.tsx:37-42](../../vendor/sanbao-prototype/src/pages/SessionPage.tsx#L37)以计时器产生后态，产品profile的[89-116](../../vendor/sanbao-prototype/src/pages/SessionPage.tsx#L89)则是固定说明。两种都不是Agent执行。

### 逐功能复用与补建

本表FNC编号是分析行，不是接口、任务或新按钮；拟议方法名不冒充当前Sage route。

| 分析/用户功能 | pin基座已具备的能力 | Sage当前接线与需要实现的部分 |
| --- | --- | --- |
| FNC-01 首页发送后整理需求、提出澄清 | `session.create`创建执行会话，`session.prompt`提交文字；[create:571-598](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L571)、[prompt:736-789](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L736) | **适配＋补建**：本地草案及澄清状态、草案与执行会话关联、限定文字整理的执行配置、结构化候选提取；模型正常回复不自动成为创建字段。原型Composer接草案提交端口，保存与发送结果分开。D-001/004方向已定，不再重问是否先建草案。 |
| FNC-02 确认创建正式事项 | 会话create只创建Harness执行对象，不创建Sage经营事项 | **补建产品能力**：按D-005/083持久保存确认的目标、交付、责任和选附片段，返回正式事项及主对话引用；本地草案→正式记录的转换与失败查回。D-066正式记录托管、D-081草案本机保存保持，不能把一个sessionId当成两个对象的全部实现。 |
| FNC-03 正式主对话发送、继续讨论 | `session.prompt({requestId,sessionId,mode,content})`，mode为`queue`或`steer`，返回accepted只是进入inbox；controller生成user source并去重requestId，[prompt:740-787](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L740) | **复用引擎＋适配**：Sage记录产品消息/待应用状态，维护主对话、Harness session及运行attempt关联；运行Coordinator将具体输入转成prompt。现有[command-contracts.ts:6-13,69-102](../../apps/sage-shell/src/appservice/command-contracts.ts#L6)是标量payload及同步ports，不能靠原样接一个Promise就承载异步发送/订阅；需明确异步会话端口。 |
| FNC-04 实时回复、运行状态与工具卡 | `session.follow`提供snapshot、durable event、assistant-stream；[帧类型:397-486](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-session-controller/lib/types/types.d.ts#L397)区分持久seq与瞬态attemptId/revision/index | **适配＋补建**：桥接Host观察→Sage消息/工具活动投影→renderer增量更新。按持久seq对账，按attempt/index处理文本临时片段，最终消息替换而非重复追加；不直接渲染reasoning或raw工具载荷。初载、重连、断流、失败与正常结束各有真实状态，不再用计时器/100%模拟完成。 |
| FNC-05 停止、运行中补充与后续继续 | `prompt`支持queue/steer；[agent-loop:783-804](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js#L783)分别进入next-turn/next-step；[cancel:872-877](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L872)使用keepInbox:true；[updateQueue:833-861](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L833)可编辑/移除/steer待处理项 | **语义适配**：[FW-002](discussion.md)确认停止后尚未执行输入保留为待继续，可编辑/移除，明确继续才恢复。Sage协调层须保存暂停状态与待处理项，阻止新增派发并核对已提交inbox的消费竞态，不能只转发keepInbox取消或断开观察流；steer不是立即中断，accepted不是停止完成。切页/重连/重开不自动续跑，其他事项不受影响。 |
| FNC-06 列表、打开历史、加载更早消息 | `session.list`合并live/persisted并按活动排序，[list:1829-1857](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L1829)实际无列表分页；`page`按throughSeq/beforeSeq读取，[page:1365-1385](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L1365)；Host公开[inspect:59-73](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-session-controller/lib/types/index.d.ts#L59)不激活Agent | **复用读取能力＋补建产品索引**：历史入口先读取Sage产品对话及固定切面的分页；本机原始日志取证可经Host inspect取得cursor后page，不假造throughSeq。`follow`在[cold snapshot后:1476-1483](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L1476)会启动激活，不能当纯历史读取。跨电脑记录按D-067另同步，列表不能无界透传基座全量。 |
| FNC-07 回复中的文件卡、预览与结果历史 | 基座`workspaceFiles`有stat/read/readBytes/readAll/readRelated/list/changes，[公开API](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-workspace-files/lib/typert.remote-client.d.ts#L10)；实际读取和限制见[实现:399-523](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-workspace-files/lib/index.js#L399) | **复用读取＋补建产物/容器**：接真实文件内容、Sage产物身份/冻结版本/资源清单、预览与下载、D-070同步。`version`是读取前stat的鲜度标记，不是历史快照；changes只来自被观测的文件操作，不覆盖OS全部变更。当前Sage未找到workspaceFiles接线或WebContentsView实例，详见下方文件产物小节，不把基座API存在当产品通过。 |
| FNC-08 切页/重开时保持状态与历史 | 引擎有session持久化及projection cache，[base:110-166](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-base/cordis.patch.yml#L110)；会话状态不依赖原型当前URL | **适配＋补建**：UI导航只换订阅对象，执行生命周期留Coordinator/Host；草案恢复读本地记录，正式历史读产品记录，运行重连对账而不重发prompt。保留已完成文本/产物与运行中状态分别恢复；进程崩溃后的实际继续执行不能由页面重载推定。 |

### 后端接线建议与事件路径

建议采用“**复用基座执行内核，Sage补产品协调与投影**”，不是把原型全部重写成上游客户端，也不是另造一套模型/工具循环。建议新增职责如下，均为候选分工，不代表已创建模块或接口已批准：

1. **草案与正式对话记录**：草案本机保存；正式主对话保存产品可见消息及最终回复，沿已定托管目标同步。正式创建返回可回读的事项和主对话身份，不将未选建项前历史静默转成正式输入。
2. **执行协调与关联**：记录产品对话/消息与本机Harness session/turn/attempt关系，负责创建、发送、取消/继续和接收结果。一个界面对话可跨多个执行轮次，不要求其ID与Harness session、BusinessMatter attempt相等；具体session复用策略另随合同确定。
3. **Host窄会话桥**：Host内可使用公开的[ctx.sessionController:14-35](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-session-controller/lib/types/index.d.ts#L14)及其create/prompt/follow/page/inspect服务；main侧通过明确的会话命令/观察port请求。需验证Sage实际挂载与桥接，不能把raw Context给renderer。复用现有分帧载体是候选，不直接开放被Sage拒绝的`/api/*`。
4. **事件转译与UI状态**：将snapshot/event/assistant-stream转换为Sage公开消息、工具活动、等待/执行/完成/失败、用量及结果引用；把传输状态和业务状态分开。重连必须对账，落盘最终消息与瞬态片段不重复。

基座Remote API公开名为[ctx.remote.session](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-session-controller/lib/typert.remote-client.d.ts#L14)，其Web实现使用POST RPC及`/api/remote.mux`流载体；[流协议:131-159](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-gateway/lib/types/stream-protocol.d.ts#L131)是open/cancel与item/error/end，不是Sage ViewState。Host内直接调用公开服务可避免为复用功能而搬入整个Web客户端；Sage自己面向renderer及托管服务的流协议尚待设计。本轮不选择WebSocket/SSE、不新开连接或修改pin。

目标数据流（未实现）：

```text
首页输入 → 本地草案整理/澄清 → 创建确认
                                  ↓
                   托管正式事项＋产品主对话记录
                                  ↓
                     本机执行协调与会话关联
                                  ↓
             Host窄桥 → Harness session create/prompt
                                  ↓
                snapshot / event / assistant-stream
                                  ↓
                产品消息/工具/运行投影 → 界面更新
                                  ↓
                 最终回复/产物引用记录与获准同步
```

历史查看不发prompt；停止请求不等于关闭事件流；回复结束不等于事项结束。权限细则继续后置，仅保留当前系统边界，不以等待权限方案为由停止功能拆解。

### 已确认衔接与下一功能取舍

[FW-001](discussion.md)已确认**同一工作面衔接**：首页发送后进入对话式草案整理，创建确认在当前工作面展开，服务建项成功后原地切为正式主对话。后端仍分开保存草案、转换请求、正式事项与对话关联；D-083只带入确认结果和选附片段，未选前史留在本地草案回看，不推定同一Harness session或全部上下文沿用。创建失败留在原处修正，结果未知先核对，刷新不重复创建。

[FW-002](discussion.md)已确认**停止后保留为待继续**：Sage持久保存未执行输入和暂停状态，明确继续才恢复；停止不清掉文本、不影响其他事项，也不把已发工具动作当作撤回。pin的[send/cancel:783-804](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js#L783)会唤醒driver，且[kick:870-881](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js#L870)可能处理wakeRequested；因此必须在执行协调/Host桥接边界控制实际派发，不能仅靠UI暂停或keepInbox:true。

| 操作 | 输入与后端处理 | 界面后态与恢复边界 |
| --- | --- | --- |
| 停止当前执行 | 绑定当前事项与执行轮次；先阻止后续输入派发，再请求取消并核对基座inbox/消费状态，记录仍未执行项 | 停止处理中→确认已停/结果待核对；只有确认未执行的条目归待继续，已消费的不重复入队 |
| 编辑/移除待继续输入 | 绑定队列项及所见版本；只改尚未执行项的后续内容，保留原提交/修改关系 | 更新待继续清单，不调用模型、不恢复运行；已被消费或版本变化时返回当前状态而非覆盖 |
| 明确继续 | 读取当前队列与暂停状态，核对停止收口及本次运行条件，再派发当前有效输入 | 已接收继续请求与实际恢复执行分开；重复继续不重复发送，空队列不制造一条空prompt |
| 切页/重连/重开 | 读取产品队列与运行记录并对账；历史读取与激活/派发分开 | 保留暂停与待继续状态，不因订阅恢复、迟到消息或历史入口触发执行 |

验证场景（未运行）：停止时恰有一项被消费、停止后又到一条输入、队列编辑与继续并发、重复继续、Host断开再恢复、只打开历史、已有产物保留。实现需证明既不丢待继续输入，也不重复派发已消费项。

[FW-003](discussion.md)已确认**暂停时新输入加入待继续、仍暂停**：输入服务只保存消息和待处理项，反馈“已收到，尚未执行”，不调用会唤醒Agent的prompt。独立继续入口仍保留；发送与继续并发时核对队列版本/提交范围，不静默带入新内容、不重复入队。暂停相关首批取舍已足够进入接线设计，下一组转向实际文件产物与预览。

后续按功能依赖继续核对模型/工作区选择、附件与结果预览，再扩展自动化、搜索与协作；不从本段启动完整新计划。D-119治理细化仍暂停，不将本批分析编号当成新增用户决定。

### 文件产物与预览接线补核

本次只核对已定位的`@deepseek-ai/dsh-api-workspace-files@0.1.5-rc.2`类型和实现，以及Sage窗口入口；不扩大成全仓研究，也不重复讨论D-034已定的离线交互容器。

| 功能环节 | 可复用依据 | Sage需要补的接线 |
| --- | --- | --- |
| 从生成活动得到真实文件 | `workspaceFiles.changes`给ready/change，stat给version/bytes；[实现:488-523](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-workspace-files/lib/index.js#L488) | 从运行结果/显式交付引用识别候选文件，不能把每个修改文件都当交付；结束前核对实际存在与完整性，变化通知只是线索，不是全盘监听或生成完成回执 |
| 读取内容与关联资源 | [read/readBytes/readAll/readRelated](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-workspace-files/lib/types/index.d.ts#L74)支持文本分页、字节分页、整文件和相对资源 | 文件读取层可复用；需将机器路径转换为Sage内容引用，明确格式、当前版本及缺资源状态。相关读取可走出工作区，不是产物资源闭包，不能直接把任意relativePath交给预览脚本 |
| 固定候选版本、回看与Diff | [WorkspaceFileStat.version](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-workspace-files/lib/types/types.d.ts#L16)为stat时的opaque token；[readAll:443-463](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-workspace-files/lib/index.js#L443)读取的是当时文件 | 补Sage版本封存、内容完整性与所用来源；不能假定stat值提供原子快照或能回取历史。Diff需要两份真实版本内容和比较器，不复用原型固定节选作为结果 |
| 打开侧面预览 | Sage [window.ts:78-103](../../apps/sage-shell/src/main/window.ts#L78)只有主窗口；[ADR-0178:20](../adr/ADR-0178.md#L20)确定未来独立非特权WebContentsView | FW-004就绪事件只更新产物卡；用户点击准确版本→内容读取→main侧面容器→真实ready/error。关闭或改选后旧响应不再展示，不抢焦点；HTML保留离线交互。当前src未找到WebContentsView或workspaceFiles接线 |
| 切换/关闭/重试 | 原型只改panel/local state，B-022～026已有目标语义 | main接窗口/面板边界变化并管理预览内容，关闭回收资源、不停止任务；重试读取同版本不重跑生成，另一个产物完成不能覆盖正在看的版本 |
| 上传到他端查看/下载 | D-070已定候选版本形成后自动同步，D-059导出已有方向 | 补内容存储/完整性/同步状态与下载流；本机已生成、已同步、可打开三态分开，失败只续传/读取，不重跑工具 |

基座默认上限为单次文本/字节页2MiB、完整文件32MiB、5000行、目录2000项（[Config:357-361](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-workspace-files/lib/index.js#L357)）；它们是当前实现默认值，不是已冻结的Sage产品规格。目录`truncated`及文件`eof`必须被消费，超限/缺失/不支持格式不可显示成完整预览。

[FW-004](discussion.md)已确认**产物卡，点击侧面打开**：内容就绪只更新卡片及状态，不创建预览容器；点击指定版本后，由Sage内容端口读取、main加载侧面预览，实际打开/失败分别反馈。新产物不抢焦点或覆盖当前展示，切换与关闭后的迟到响应不得恢复旧选择；同版本重试不重跑生成。已定HTML离线交互及版本原则继续沿用，不重复访谈。

**首批内置预览格式已由FW-005确认。** pin另有[documentpreview包](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-client-ui-sidebar-documentpreview/package.json#L1)，声明Markdown、代码、图片、PDF、HTML及纯文本，并已有[Markdown/HTML注册](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-client-ui-sidebar-documentpreview/lib/client.js#L2176)和[PDF注册](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-client-ui-sidebar-documentpreview/lib/client.js#L26722)。这些是复用候选，不是Sage已接：其[client合同](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-client-ui-sidebar-documentpreview/lib/types/client/index.d.ts#L1)依赖原侧栏tab/slot及资源体系，不能整包挂入Sage产品壳。

[FW-005](discussion.md)已确认首批支持纯文本/Markdown/代码、PNG/JPEG、离线HTML、PDF及CSV表格，以查看为主，HTML保留已定离线交互；CSV需表格解析/展示适配，其他查看器按实际依赖择取。DOCX/XLSX/PPTX原格式内置预览后置，保留文件卡与已有导出路径，不把可下载说成可预览，也不引入自动转换或完整Office编辑。容量与格式子集仍以实施验证确定，不沿用基座默认上限作产品承诺。此决定限定预览范围，不禁止生成或导出Office产物。

### 模型配置与实际选用接线补核

本组沿D-017～019已定的默认模型、事项内改选及不可用时提示替代，不重复讨论权限制度。目标是把模型设置表单、候选列表、事项选择与实际运行模型接起来；本次没有保存配置、读取真实凭据或调用供应商。

| 功能环节 | 基座证据 | Sage适配与补建 |
| --- | --- | --- |
| 读取配置、保存模型条目 | `settings.describe/update/replace/mutate`有[公开签名](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-settings-controller/lib/typert.remote-client.d.ts#L17)；[实现:424-471,532-546](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-settings-controller/lib/index.js#L424)读脱敏值和schema，写后返回新namespace view，expectedRevision可核对冲突 | 原型[SettingsModelsPage.tsx:75,121-136](../../vendor/sanbao-prototype/src/pages/SettingsModelsPage.tsx#L75)只是禁用表单/提示，尚无真实保存。Sage需表单→产品配置命令→对应namespace适配→回读列表；保存配置不等于已验证可调用，不能原样暴露全量settings编辑器 |
| 密钥输入和状态 | `credentials.describe/set/unset`与settings分开，[实现:158-189](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-settings-controller/lib/index.js#L158)只写入值、返回状态描述，不读回秘密 | 可复用provider机制的候选能力，但Sage可信录入与存储接线仍需单独落实；UI只显示已配置/缺失/失败。配置与密钥两步部分失败要可恢复，不以成功toast伪报整项完成 |
| 展示可选模型及当前选择 | `session.modelCatalog()`生成当前可路由目录，[实现:2857-2858](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L2857)；`selectModel`解析provider/model与reasoningEffort | 将基座当前路由目录与Sage产品模型配置投影相接，区分已配置、可选、本事项选中及运行实际使用。没有可用route时显示缺项，不能把原型固定供应商/模型名单当实际目录；本批未证明真实连通性验证端口 |
| 事项内改选及默认值 | [selectModel:605-625](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L605)先写session选择，再尝试`agentDefaultModel.saveSelection`；默认保存失败只记录warning、仍返回selected。选择本身写[model/selection:315-318](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L315)，用于下一请求 | **FW-006已确认只改当前事项**，设置页才显式修改新事项默认值；Host适配必须提供不写默认值的会话选模接点，不能先改默认再还原。[公开请求:265-270](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-session-controller/lib/types/types.d.ts#L265)没有saveDefault开关，内部`selectForNextRequest`也不能冒充已公开的受支持接点，需在实现时核定。运行中沿D-017收口后切换，历史运行实际模型保持。 |

[FW-006](discussion.md)已确认**只改当前事项**：事项选择与新事项默认值分开写入，默认值只在设置页明确修改；已存在事项不受其他事项改选影响。实现需验证“事项A改选→默认不变→新事项仍采用原默认”及“默认修改失败不伪报成功”，当前未运行。

| 操作 | 输入与后端处理 | 回读与功能边界 |
| --- | --- | --- |
| 事项内改选 | 提交事项及当前模型选择版本、候选模型；Sage记录事项选择并通过仅会话级的接点应用 | 返回已保存/待后续运行应用/实际使用的分别状态；不写默认、不改变其他事项，运行中沿既有收口规则 |
| 设置新事项默认 | 设置页明确提交默认值和配置版本，保存后回读 | 影响后续新建事项；现有运行不自动换模，保存失败不将选择框当成持久结果 |
| 重开事项 | 读取该事项模型选择及各历史运行快照 | 当前选择与历史实际模型分开，不按当前默认改写过去 |

[FW-007](discussion.md)已确认**保存与测试分开**：添加模型允许先保存为“已保存、未测试”，真实测试端口当前未证明，实施时按单列状态核定；保存不暗中调用供应商，测试失败保留配置不要求重填。测试结果绑定当次配置及凭据版本，修改连接相关配置后旧成功只留历史、不冒充当前可用。

| 操作 | 输入与后端处理 | 回读与功能边界 |
| --- | --- | --- |
| 保存模型条目 | 提交provider/model/endpoint等配置与凭据引用，settings/credentials分两步写，任一步失败单独反馈、整体可恢复 | 回读显示“已保存、未测试”；保存成功不冒充可调用，不用业务内容做隐藏试调用 |
| 测试连接/试调用 | 显式点击后才发起，用最小非业务样本；发起前记录当次配置与凭据版本，结果绑定该版本 | 测试中/成功/失败/待核对状态单列展示；失败不删配置；超时与异常不伪报成功，重复点击不并行重复测试 |
| 结果回读 | 读取该条目最近一次测试记录及其配置+凭据版本 | 修改连接相关配置或凭据后旧结果标记为历史，不套用新配置显示“可用”；迟到结果不覆盖当前配置状态 |

### 工作区选择与事项绑定接线补核

本组沿D-008（获准目录）、D-090（事项可关联多个工作区、按需取用）、D-091（默认执行环境选定后逐次核验）已定方向推进，不重问权限制度。目标是把工作区列表、目录选择、事项绑定与文件浏览入口接起来；本批未创建真实目录、未采纳真实工作区或运行Host。

[FW-008](discussion.md)已确认**首版只采纳已有目录**：添加工作区仅通过系统目录选择器指定已存在目录，不在首版提供新建空目录入口；`directoryPicker.createDirectory`是基座已有但首版不接入Sage产品面的能力，后置不删除。[FW-009](discussion.md)已确认**事项侧显式建立/解除**：事项内默认只列已关联工作区，添加从获准列表选择、解除为显式操作；工作区详情反向“关联事项”列表后置。

| 功能环节 | 基座证据 | Sage适配与补建 |
| --- | --- | --- |
| 添加工作区（采纳已有目录） | `workspace.create`只接受已有目录并幂等采纳，[实现:196-218](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-workspace-controller/lib/index.js#L196)；目录无效报`workspace/invalid-path`[:210](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-workspace-controller/lib/index.js#L210)，重名报`workspace/name-conflict`[:225](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-workspace-controller/lib/index.js#L225) | Sage需把系统选择器结果接为create输入，失败原因逐项反馈（目录不可用/重名），不自动建目录、不换用其他来源顶替；采纳成功不等于已读取或已发送内容（D-090按需取用） |
| 系统目录选择与应用内浏览 | [directoryPicker](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-workspace-controller/lib/index.js#L423)的`pick`发起Host侧OS选择器（返回绝对路径或null）、`list`支撑应用内逐级浏览、`createDirectory`创建子目录；unavailable/unreadable/exists/create-failed为[独立错误码](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-workspace-controller/lib/types/types.d.ts#L36) | 首版接`pick`（必须）与`list`（浏览体验）；`createDirectory`按FW-008后置。pick取消（null）是正常路径，不报错；Host无该能力时显示`directory-picker/unavailable`而非静默降级 |
| 工作区列表与排序维护 | `workspace.follow`以[baseline+increment](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-workspace-controller/lib/types/types.d.ts#L108)维护状态流；`rename/delete/insertBefore/insertSessionBefore/archiveSession`见[实现:219-292](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-workspace-controller/lib/index.js#L219) | Sage工作区列表视图接follow流（重连以baseline对账）；重命名/删除/排序按既有ProductIntent转Application Service，不绕过受信边界；删除工作区不等于删除目录内容，需在UI区分 |
| 事项与工作区绑定、文件浏览入口 | `workspace.insertSessionBefore`维护会话归属与手动顺序，`archiveSession`归档；文件读取已有[workspaceFiles](ui-wiring-matrix.md#文件产物与预览接线补核)证据 | 事项关联多工作区按D-090落为Sage产品关联记录（基座只有session级归属，没有事项级多关联），执行环境按D-091逐次核验；文件浏览入口复用workspaceFiles，不在本组重造 |

| 操作 | 输入与后端处理 | 回读与功能边界 |
| --- | --- | --- |
| 添加工作区 | pick返回路径→Sage按获准目录核验→workspace.create采纳 | 回读显示采纳结果与目录路径；取消pick不产生半成品；invalid-path/name-conflict分别提示 |
| 事项绑定工作区 | 事项内点“添加”从获准工作区列表选择建立关联；解除为同位置显式操作（FW-009） | 关联/解除均具名可追溯；解除不删工作区与内容，既有引用按D-090处置（不静默换源），本轮不实现真实关联持久化 |
| 浏览工作区文件 | 进入工作区文件面板，list逐级列出、read按需读取 | 只在用户进入时读取，不因绑定而扫描全部资源；读取权限与传输沿D-072/073既有边界 |

### 附件上传接线补核

本组沿B-011～013目标合同与D-072/073既有边界推进，不重问上传治理。基座已有完整附件通道，Sage缺产品接线与事项范围绑定。

[FW-010](discussion.md)已确认**先接上传附件链**：本地引用（B-014起）随后一批。[FW-011](discussion.md)已确认**随消息展示即可**：附件只服务于随消息发送与历史消息内展示，不单设事项附件列表面板，跨消息复用与独立列表后置。

| 功能环节 | 基座证据 | Sage适配与补建 |
| --- | --- | --- |
| 文件选择与候选 | B-011合同要求受控文件选择、返回候选不等于已上传；基座[prompt类型](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-session-controller/lib/types/types.d.ts#L56)的`file` part只收同一会话`uploadFile`的receipt，且至少需要一个文本part或附件[:297](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-session-controller/lib/types/types.d.ts#L297) | Sage需renderer文件选择（经main系统对话框），选择后进入候选态；取消无副作用；选取与上传间内容变化需重选/重核（B-011反例沿用） |
| 上传与回执 | [dsh-client-file-upload](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-client-file-upload/lib/types/protocol.d.ts#L1)提供Remote `upload`（[:204](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-client-file-upload/lib/index.js#L204)编码）与`uploadStream`（[:214](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-client-file-upload/lib/index.js#L214)有界分块、可取消），HTTP路径`/api/session/uploadFileBinary`；提交到[AttachmentStore.saveFile](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-attachment/lib/index.js#L277) | main流式读文件→upload端口→receipt；传输中/内容完整核验/附件关联生效分别反馈（B-012）；部分失败走B-013续传同一封存版本；不把上传成功当模型已读取 |
| 存储与身份 | [FileAttachmentRef](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-attachment/lib/types/types.d.ts#L34)为内容寻址`attachmentId`（永非文件系统路径或bearer URL）+净化文件名+字节长度；无效附件报`session/attachment-invalid`[:190](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-session-controller/lib/types/types.d.ts#L190) | Sage附件记录绑定事项范围与版本（B-012）；机器路径不进跨端数据；图片另有`imageLimits`与[EncodedImageAttachment](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-attachment/lib/types/types.d.ts#L75)准入 |
| 随消息展示 | 消息历史的附件按会话流与历史读取呈现（B-012合同：关联生效后可查看） | 发送后附件卡随消息展示实际状态（传输/核验/生效）；不单设事项附件面板（FW-011）；重开事项沿消息历史回看，不重跑上传 |
| 本地引用（B-014/015首版） | workspaceFiles已有[stat/read/readBytes/readAll/readRelated/list/changes](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-workspace-files/lib/index.js#L399)与[默认上限](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-workspace-files/lib/index.js#L357)；stat.version为opaque token非历史快照 | [FW-012](discussion.md)已确认首版候选仅限已采纳工作区内文件：应用内浏览选文件→候选引用（来源+stat.version）→确认关联；[FW-013](discussion.md)已确认首版实时读取：每次经workspaceFiles重核版本，不建快照，源变化即阻断并提示失效；D-093快照机制后置 |
| 实现核验项 | receipt的“同一会话”绑定语义；attachment store是否按事项隔离；D-072/073传输目的地逐次核验接线 | 均为本批未证明项，实现时核定；不把基座通道存在冒充Sage产品接线完成 |

### 搜索与事项查找接线补核

[FW-014](discussion.md)已确认首版搜索框覆盖**事项标题本地匹配 + 会话内容检索**，两类结果分区展示；事项正文全文检索与跨对象统一排序后置。本批未运行真实检索。

| 功能环节 | 基座证据 | Sage适配与补建 |
| --- | --- | --- |
| 会话内容检索 | `session/search`有[公开签名](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-session-controller/lib/typert.remote-client.d.ts#L50)，[实现:1866起](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L1866)按cursor分页、pageLimit 20、[provider调用预算](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L1728)，仅返回可见（有cwd）会话；[请求/结果类型:244-248](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-session-controller/lib/types/types.d.ts#L244) | Sage经main窄桥调用并投影为分区结果；provider未挂载时显示会话检索不可用，不伪装无结果；signal透传取消 |
| 事项标题匹配 | 无基座对应（BusinessMatter为Sage自有数据） | Sage本地按标题/关键属性匹配，读取经Application Service投影；不因搜到而加载正文或激活执行 |
| 结果呈现与跳转 | [SessionSearchValue](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-session-controller/lib/types/types.d.ts#L248)含分页hasMore | 分区展示事项/会话命中；点击命中才打开对应工作面；滚动加载沿cursor，不并发重复分页 |

### 事项列表与导航状态接线补核

[FW-015](discussion.md)已确认首版列表按**行动需求分区**（待我处理 / 进行中 / 待验收），分区内按最近更新排序；分区是呈现组织，不是新状态存储。沿D-006（事项以主对话承接进度）与D-081/083草案合同，不重问。

| 功能环节 | 现有证据 | Sage适配与补建 |
| --- | --- | --- |
| 事项投影与状态 | Sage有运行状态`running\|blocked\|failed\|succeeded`（[business-matter.ts:139](../../apps/sage-shell/src/domain/business-matter.ts#L139)、[view-state.ts:88](../../apps/sage-shell/src/product/view-state.ts#L88)）与就绪状态`ready\|blocked\|unknown`（[business-matter.ts:60](../../apps/sage-shell/src/domain/business-matter.ts#L60)） | 无单一“行动需求”字段：首版由Application Service从attempt、待验收artifact、blocked/unknown原因及FW-002/003待继续输入推导分区归属，推导规则实现时核定，renderer不自判 |
| 列表读取与更新 | 投影读取经Application Service的ViewState（`/.sage/*`由main终止）；matter投影槽production当前为`null`、fixture须显式开关（ADR-0184） | 列表首屏与增量都走同一投影；无真实authority时保持unavailable-first，不用fixture冒充数据；排序仅按updatedAt呈现，不引入持久自定义顺序 |
| 会话/工作区侧导航 | 基座`session/list`、`session/page`提供会话分页与历史；`workspace/follow`提供工作区baseline+increment | 导航项与事项分区分别来自各自投影，不互相推导；重开事项沿FW-002/003待继续状态，不重复发送 |
| 状态失效与提示 | 就绪`blocked\|unknown`可定位到原因记录 | “待我处理”须可追溯到触发事实；事实变化后分区归属随投影更新，不由界面缓存固定 |

### 偏好持久化接线补核

[FW-016](discussion.md)已确认首版只持久化**主题（含跟随系统）、语言、密度/缩放**三项，经单一Sage偏好读写口保存并订阅；快捷键、语音、任务监控布局偏好后置。此为Sage自有U面，不使用基座settings/credentials namespace。

| 功能环节 | 现有证据 | Sage适配与补建 |
| --- | --- | --- |
| 外观页与菜单共用权威值 | 原型[SettingsAppearancePage.tsx:99-155](../../vendor/sanbao-prototype/src/pages/SettingsAppearancePage.tsx#L99)只改组件state；[UserAppearanceMenu.tsx:131-145](../../vendor/sanbao-prototype/src/components/UserAppearanceMenu.tsx#L131)选值只改菜单state（U01/U02） | 两处都读写同一Sage偏好端口并订阅变更，不允许两份值；页面副标题“立即保存”不等于已持久化（gap码已登记） |
| 保存、生效与失败反馈 | Sage有[renderer.ts:17](../../apps/sage-shell/src/product/renderer.ts#L17)样式基线与[window.ts:78](../../apps/sage-shell/src/main/window.ts#L78)窗口工厂；无据此证明的偏好持久化 | 区分草稿/保存请求/已保存版本/实际生效/失败；需重启项显式标注；保存失败回退显示值并保留可重试 |
| 跟随系统与桌面观察 | 基座与Sage本批均未证明系统明暗观察实现 | main侧桌面主题变化观察属实现核验项；不假设renderer能自行感知系统切换 |
| 后置项边界 | U04快捷键（命令目录/冲突检测/IME）、U05语音（麦克风许可）、R12（布局与运行状态分离） | 首版不提供入口或明确标注不可用，不用state冒充持久化；不迁入“内置浏览器”等与D-036冲突的开关 |

### 运行历史与产物审阅接线补核

[FW-017](discussion.md)已确认重开事项时**运行历史全部列出（倒序分页）、默认只展开最新**，点开旧运行才读详情；两次运行的版本对照后置。产物卡与预览格式沿用FW-004/005，不重复访谈。

| 功能环节 | 基座证据 | Sage适配与补建 |
| --- | --- | --- |
| 历史读取不激活执行 | `session/page`有[公开签名](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-session-controller/lib/typert.remote-client.d.ts#L47)，[实现:1365起](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L1365)为分页历史读取 | 重开事项走page类纯读取；`follow`对冷会话会在快照后促发Agent，不能作为历史入口，两者接点分开 |
| 运行列表与详情 | 会话列表`session/list`[签名:44](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-session-controller/lib/typert.remote-client.d.ts#L44)提供可见会话；运行事实由Sage attempt记录承载 | 列表项来自Sage投影（时间倒序+分页），详情按需读取；不把基座会话列表当事项运行列表 |
| 当时实际模型与版本 | 选择写于[model/selection:315-318](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L315)用于下一请求 | 历史运行显示运行时实际模型快照，与事项当前选择分开呈现；不按当前默认改写过去（FW-006一致） |
| 产物呈现与对照 | FW-004/005已定卡片+侧面预览；FW-017明确两运行版本对照后置 | 点开旧运行才读正文；旧运行不可读时保持缺失，不显示空白成功；对照依赖D-015/016收口后再设计 |

### 提醒与前台可达性接线补核

[FW-018](discussion.md)已确认首版提醒**只做应用内标记**（分区+计数），不发系统通知、不申请授权、不改标题闪烁或程序坞徽章。

| 功能环节 | 现有证据 | Sage适配与补建 |
| --- | --- | --- |
| 应用内提醒 | 分区与行动需求推导见[列表补核](ui-wiring-matrix.md#事项列表与导航状态接线补核)；pin无通知包、Sage源码无`Notification`使用 | 提醒即分区/计数的同一投影结果，不建第二份未读状态；回到应用即随投影更新 |
| 系统通知与徽章 | 无基座承载；Electron main原生能力未取证 | 后置；实现时区分“已投递系统”与“用户已见”，发出通知不等于已读，未聚焦不重复计数 |
| 逐轮/工具级提醒 | U03已登记“不继承自动逐轮通知”取向 | 首版不提供；不因原型存在开关就接入，通知与系统许可分别走main |

### 侧聊与主对话面接线补核

[FW-019](discussion.md)已确认侧聊以基座`session.fork`派生子会话承载，事项只关联主对话；主/侧聊分别投影、可见范围分别沿D-067/086。

| 功能环节 | 基座证据 | Sage适配与补建 |
| --- | --- | --- |
| 派生侧聊 | `fork`[实现:660起](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L660)按`atSeq`（可缺省）派生子会话；`atSeq`非法报gateway/bad-request | Sage提供“就此话题开侧聊”入口并记录父子关系；在途运行中能否fork、截断位置属实现核验项 |
| 主/侧聊呈现 | 子会话历史沿`session/page`读取（见[运行历史补核](ui-wiring-matrix.md#运行历史与产物审阅接线补核)） | 事项详情主对话区只呈主对话；侧聊以派生列表单独打开，不混排进主流 |
| 结论回主对话 | 基座无跨会话合并语义 | 显式动作把侧聊结果作为候选交付带入主对话，沿用既有候选合同，不新造合并机制；默认不向协作者开放侧聊内容 |

### 会话内队列与自动化接线补核

[FW-020](discussion.md)已确认首版只接**会话内多轮队列**，定时与循环自动化后置（依赖D-013/025后台执行主体合同）。

| 功能环节 | 基座证据 | Sage适配与补建 |
| --- | --- | --- |
| 发送时选择排队或转向 | prompt的mode为`queue`或`steer`（[types:296](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-session-controller/lib/types/types.d.ts#L296)） | 输入区提供两种发送方式并说明差别；`steer`在下一步骤边界消费、不是立即中断，界面不得写成“已打断当前步骤” |
| 待处理项查看与变更 | 队列快照项含`placement: queued\|steering\|context`（[types:490](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-session-controller/lib/types/types.d.ts#L490)）；`updateQueue`有[公开签名](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-session-controller/lib/typert.remote-client.d.ts#L52)，[请求/回执:315-321](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-session-controller/lib/types/types.d.ts#L315) | 队列面板消费权威快照；编辑/移除仅针对仍待处理项，回执按操作结果分别显示 |
| 竞态与失效 | 项不存在报`session/queue-item-not-found`（[types:193](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-session-controller/lib/types/types.d.ts#L193)） | 该项已被消费时如实提示“已开始处理”，不静默丢弃，也不重复提交；迟到回执不覆盖新队列状态 |
| 与停止/暂停的关系 | FW-002/003已定：停止后未执行输入保留为待继续、暂停期新输入不唤醒执行 | 队列入口在暂停态只显示待继续，不调用会唤醒Agent的动作；恢复时才按既定顺序派发 |
| 定时自动化 | 无基座承载，Sage无后台执行主体合同 | 首版不提供入口、不做只读空列表；P03原型八态留作后续设计输入 |

### 错误与恢复面接线补核

[FW-021](discussion.md)已确认错误面首版分**确定失败 / 结果未知 / 未就绪**三态，各自动作入口不同，不合并为统一“请重试”。

| 状态 | 现有证据 | 界面与动作入口 |
| --- | --- | --- |
| 确定失败 | 派发前typed denial带code与stage（如[route-skeleton.ts:40](../../apps/sage-shell/src/appservice/route-skeleton.ts#L40)的`invalid-intent`、`retryable:false`）；retry意图解析[:75-81](../../apps/sage-shell/src/appservice/route-skeleton.ts#L75) | 显示原因+可重试同一动作；`retryable:false`的项不给重试按钮，改给补齐前置条件的入口 |
| 结果未知 | 派发结果归一为`outcome-unknown`（[command-pipeline.ts:76-79](../../apps/sage-shell/src/appservice/command-pipeline.ts#L76)） | 只给“核对同一操作状态”入口，不给重试；查到既成事实按事实呈现，未知不等于失败 |
| 未就绪 | production ports全部fail-closed（[composition.ts:11](../../apps/sage-shell/src/appservice/composition.ts#L11)）；ADR-0184下`/.sage/*`恒由main终止、production投影槽恒`null` | 显示unavailable与缺失项，不写成失败、不用fixture或历史绿灯冒充可用 |
| 文案与安全 | denial reason已结构化 | 可读说明不泄露机器路径、凭据或内部堆栈；迟到回执不覆盖当前状态，重复点击不并行发起同一动作 |

### 收尾页面族接线补核

以下六组按FW-022～027的推荐默认收口首版接线，权限与治理细则保持后置。

| 功能组 | 首版接线（界面→Sage后端） | 边界与后置 |
| --- | --- | --- |
| 建项确认（FW-022） | 表单三项必填（目标/交付/责任，责任默认当前身份可改）+项目可选→本地结构校验→创建命令→回执三态 | 只带D-083确认结果与选附片段；责任真实身份依据待Identity/Policy；表单填完不等于已建项 |
| 执行前确认（FW-023） | 外部效果动作给单张确认卡，列对象/动作/资源/范围/时间/前提与费用预估→确认→派发前逐次重验（D-091） | 不做多级审批/代理/队列（D-106～118为后置输入）；前提或版本变化使旧确认失效 |
| 协作与共享（FW-024） | 仅呈现当前可见范围事实（D-084默认创建者+主责） | 不提供邀请、协作管理人、历史开放与主责交接入口；依赖真实组织成员与Policy Provider，整组后置 |
| 知识与引用（FW-025） | 知识/引用面只读列条目+来源+版本，点开才按需读取并重核（FW-012/013） | 不做创建/编辑/晋级发布/退役；候选、已验证知识与偏好记忆保持分离（D-023/024/051） |
| 插件与扩展（FW-026） | 只读展示实际挂载与可观察状态（名称/版本/来源/挂载与否） | 不提供启用/停用/安装/授权写操作；自报、进程存在、工具数量不作权威结论；未挂载不说成已停用 |
| 关于与诊断（FW-027） | 显示可信版本来源、数据根与配置摘要、错误结构化信息（code/stage/correlation） | 不提供检查更新/立即更新入口（Sage发布链未建立）；不导出原始堆栈、机器路径或凭据 |

### MECE补漏页面族接线补核（FW-028～034）

按 Sanbao 原型目录逐组核对后发现的缺口族：读取面按下列接线进首版，写入与治理面统一进规格 §7，本表只做静态取证，全部未运行。

| 功能组 | 首版接线与证据（界面→Sage后端） | 边界与后置 |
| --- | --- | --- |
| 事项修改稿与回写（FW-028） | 修改稿绑定来源工作区文件与所依据版本：版本 token 取自已核的 [WorkspaceFileStat.version](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-workspace-files/lib/types/types.d.ts#L16)，Diff 由内容端口按两个版本比较得出；Sage 侧只有 [artifacts/receipts 投影槽](../../apps/sage-shell/src/product/view-state.ts#L92)，无 diff 实现，需补建修改稿对象与回写命令 | 回写是独立具名动作且首版不自动回写；下载/导出不产生回写效果；Git 提交/推送/分支与 Worktree 写操作无入口（§7）；生成修改稿不称“共享文件已更新”（D-009/010/053） |
| 行动项与项目汇总（FW-029） | 行动项为 Sage 自建对象（基座无对应概念），经 Application Service 读写并回同一事项投影；项目视图只做归属与汇总（D-089）；“另补要求更正”以关联原要求的消息+生效回执表达 | 不做分派给他人、不做跨事项资源调度；执行记录回看关联当时依据版本，不重放未知结果 |
| 归档、重命名与批量（FW-030） | 归档/重命名为具名命令走命令管线接缝S2并回读实际生效值；批量逐项返回结果与权限结论；现有 [BusinessMatterStage 取值](../../apps/sage-shell/src/product/view-state.ts#L120) 无归档态，需补建 | 归档不停止执行、不解除未结责任、不删除保留中的数据；隐藏/归档/停止三者分开显示（D-085 族） |
| 能力目录与 Agent 配置（FW-031） | 只读浏览名称/来源/版本/是否挂载，来源为挂载观察与配置事实；原型已安装扩展页 [ExtensionPages.tsx:19-22](../../vendor/sanbao-prototype/src/pages/ExtensionPages.tsx#L19) 的筛选与菜单均为本地 state，不作数据依据 | “已配置/已启用/可用”三者不合并；安装、更新、启用、停用、撤销、授权与委派/子执行/预算配置全部后置（依赖 ADR-0171 Registry approved 与 provenance） |
| 运行监控、用量与日志（FW-032） | 步骤/预算/设备/后台四轴分别投影，详情与列表读同一投影；[TaskMonitorWorkbench.tsx:49-52](../../vendor/sanbao-prototype/src/pages/TaskMonitorWorkbench.tsx#L49) 的选中与视图切换是本地 state，Sage 需接运行事实；用量区分预留/消耗/账单；P14 运行日志只读、不进普通对话同步 | 折叠或关闭面板不取消运行；设备离线不等于取消或被接管；日志导出按独立权限核验；不做压缩策略配置 |
| 成果与工具结果呈现（FW-033） | 图表/链接/图片/typed 结果由 Sage 自有组件呈现，[ToolResultWorkbench.tsx:60-62](../../vendor/sanbao-prototype/src/pages/ToolResultWorkbench.tsx#L60) 的展开与回放状态不等于真实结果；预览资源沿用[documentpreview 复用候选](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-client-ui-sidebar-documentpreview/lib/client.js#L2176) | 链接不自动联网、结果内不执行脚本、不接受权威动作输入；不支持类型明确拒绝；图片批注与网页成果真实发布后置 |
| 方案、步骤、退出与引导（FW-034） | 方案作为交付呈现（接受≠执行，D-013/014），执行前确认卡另行确认（FW-023）；步骤按动作前提显示就绪/未就绪；退出前影响清单复用 FW-002/021 的在跑与未执行事实；引导与环境只读显示来源 | 未知呈现为阻断而非失败；实验不直通生产；环境装配、跨设备占用与远端执行后置 |

### 状态级补漏页面族接线补核（FW-035～041）

组级三桶穷尽之后，按 206 条状态逐条落账又发现 41 条既无需求也未标后置。本表记录其接线与取证；全部为静态核对，未运行任何构建、测试、浏览器或真实模型。

| 补漏面 | 首版接线与证据（界面→Sage后端） | 边界与后置 |
| --- | --- | --- |
| 澄清问答（FW-035，S02/P09/M01） | 澄清问题→卡片（问题、候选项、所属运行）→回答经 [S2 命令管线](../../apps/sage-shell/src/appservice/command-pipeline.ts)提交所属会话→回执三态；基座侧接点是否存在列为核验项 | 回答未回执不显示“已回答”；等待中停止转待继续（FW-002）；答案不自动写成事项事实 |
| 消息锚点与编辑重发（FW-035，P01/M01/O12） | 锚点定位走[纯历史读取判据 US-024](specs/2026-10-02-uiux-sage-first-release-wiring.md)同一条接点；编辑产生新版本并保留原版本与提交关系，重发沿用同一请求标识 | 不整段载入正文、不激活执行；已消费消息不重复派发；未知只给核对入口 |
| 输入区选择器与模式（FW-036，O02/P06） | 技能/插件列表来自挂载观察（[capability-registry.ts](../../apps/sage-shell/src/security/capability-registry.ts) 与 S3 composition ports 只读面）；模式状态来自服务投影，事项内切换不写全局默认（与 FW-006 同构） | 选择不改变启用状态；站点模板只产生草案输入，创建与发布仍 §7.8 |
| 授权等待与模型排队（FW-037，S03/S05） | 授权与排队事实经 [S8 ViewState 投影](../../apps/sage-shell/src/product/view-state.ts)呈现；依赖未兑现授权的动作保持阻断；就绪不由界面计时器推断 | 不做多级审批（§7.3）；不做排队优先级与自动故障切换 |
| 集成终端与独立窗口（FW-037，P14/P12） | 终端只在工作台侧面板内提供，输出走 [S5 内容读取](../../vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai/dsh-api-workspace-files/lib/index.js)式只读取用；独立窗口与侧容器共用同一版本引用（S7） | 无终端能力显示未就绪；输出不进对话历史与产物列表；窗口不接收权威动作 |
| 设置叶子页只读组（FW-038，P06/OBS04） | 身份与登出取 Electron main 权威投影（[authority-runtime.ts](../../apps/sage-shell/src/main/authority-runtime.ts)、[token-vault.ts](../../apps/sage-shell/src/main/token-vault.ts)），renderer 不自报；其余十页只读显示来源与不可用原因 | 全部写操作无入口；凭据/token/raw subject/机器路径不得出现在任何页面（§7.1/§7.4/§7.5） |
| 外观八项（FW-039）、反馈入口（FW-040）与任务分组（FW-041） | 八项外观值仍由 S9 单一偏好端口持有并在两入口读写同值；反馈只提交文本与结构化诊断（code/stage/correlation）；分组为 Sage 自有组织对象走 S2 | 快捷键/语音/监控布局继续 §7.9；日志上传与崩溃上报不做；分组不改变可见范围与责任 |

### 本批取证与验证边界



- Sage初段两次只读检查为`8b322f9`、无未提交差异；收尾时HEAD前进到`4ce1b6d`，新增仅为文档，所核源码未变。基线读数及旧route/renderer更正统一见[当前基线](#当前sage接线基线更新)，不保证共享仓始终不变。
- 原型HEAD `8883125`，当前仍有24个tracked改动，取证读当前工作树；catalog SHA-256仍为本页来源指纹，59组/206条，不将其当完整页面/按钮总数。本批只读4个主链源码文件，未重新审计全目录或原产品视觉。
- 基座相关materialized包提供源码/类型证据；没有启动Host、创建真实session、读取用户历史/凭据或执行模型/工具。基座API存在、Sage导入接线、产品运行通过是三个独立结论。
- 本批仅更新现有矩阵与讨论节点，未改Sage/Sanbao/pin源码，未运行产品测试、构建、浏览器、GUI或业务验收。后续验证至少需覆盖：发送ack与开始执行分离、流式最终对账、停止不自动续跑队列、冷历史不激活执行、重开不重复发送、产物内容真实可读。

## 读法与主责候选

“主责”是目标合同的逻辑归属，不表示新增独立服务或已经存在的源码模块。公开业务读取/命令仍统一经过Application Service与受信权限边界。

**目标拓扑更新（D-062～066）：** 所有正式事项由Sage托管服务统一裁决，是否共享由独立的访问范围控制，本机负责受控执行与事实记录；分工见 [仓外ADR-0004](adr/0004-shared-matter-service-authority.md)及其后续扩展 [ADR-0005](adr/0005-all-formal-matters-hosted.md)。下表不能被解释为所有逻辑责任都必须运行在Electron main；源仓当前实现仍未迁移，服务部署未获授权。

**同步与处理边界（D-067～083）：** 未确认事项草案仅当前设备安全保存，登出加密锁定，重新登录且获准才恢复，不自动同步或换机接续；D-083建项只带入确认结果及用户选附片段，其余前史不默认上传。主对话、侧聊、候选交付、附件与本地引用分别遵循下文规则。已选择中国内地单一托管数据区，首版云端模型仅支持经核验的内地处理/留存服务；供应商及Sage均不得将业务内容用于通用训练或产品改进。必要安全留存须受限核验，反馈仅主动选附并预览核权；具体服务、天数、反馈接收方等仍未批准。

**协作边界更新（D-084～088）：** 正式事项基本记录与主对话默认限创建者和获准主责；主责可指定获准协作管理人，邀请时明确历史开放范围。首版人员协作仅限事项所属组织有效成员，不自动继承项目权限；常规主责交接须接任确认且条件满足后生效，设备交接另行核验。

**责任分层：** 下表的D/R/F等是逻辑分工，不是微服务清单；同一动作的正式裁决、设备执行和界面呈现须分别定位。双字母表示组内包含多种动作，不表示一个具体命令可有两个最终裁决者。当前源码、已确认目标、待定工程合同与运行验证分开记录。

| 缩写 | 逻辑责任 | 当前证据与缺口 |
| --- | --- | --- |
| U | Sage自有UI/导航/偏好 | 当前字符串component renderer与局部tab已存在；不是完整原型迁移，复杂组件栈与偏好持久化未定 |
| D | 草案/事项/交付与决定 | 有BusinessMatter窄内核；草案、多交付项及分项验收需按D-044演进 |
| R | 运行/委派/指令/用量 | 有Host生命周期与单attempt约束；完整执行协调、后台身份、委派、预算未接线 |
| F | 资料/附件/产物/预览 | 有领域artifact引用；实际blob、版本、Diff回写与隔离预览仍缺完整合同 |
| C | 能力配置/准入/适配 | 有局部security kernels；真实descriptor/provider、Registry entry与operation mapping不得冒充已有 |
| I | 身份/组织政策/访问与治理 | 有纯resolver及治理合同；真实OIDC/Policy、数据生命周期与跨端读取尚有生产门 |
| Q | 受权查询/搜索/待办/通知 | 目标派生读模型，不新增业务状态权威；现有事项store的load/append不能替代全量查询和索引 |
| K | 知识候选/知识资料维护 | 原型只提供本地表单/空态；专业判断、发布、版本与引用治理需补齐 |
| A | 自动化模板/周期/调度 | 原型只模拟；后台执行共用R，调度触发不提供授权 |

复杂度只表示目标相对跨度：低=主要界面行为；中=新增受控查询/配置/本地状态；高=版本/权限/生命周期/原生边界或外部依赖交织；待定=范围尚未批准。不能据此直接换算天数；共享基础只计一次。

## 59组覆盖索引

| 源组 | 索引条数 | 目标工作面/主责候选 | 决定输入 | 接线重点 | 当前设计状态/相对跨度 |
| --- | ---: | --- | --- | --- | --- |
| P01 | 4 | 首页、草案、事项列表与详情 / D,Q | D-001/003/004/005/007/066/081～083 | 草案仅本机保存，登出加密锁定；确认结果与选附片段经预览/核权后幂等建项，其余前史不默认同步 | 保存/转换范围已定，保留与转换后编辑待定 / 高 |
| P02 | 2 | 统一搜索 / Q | D-028/047/067/068/072 | 受权索引、分类分页、摘要安全与定位；本地引用不冒充他端可读附件 | 原则已定 / 高 |
| P03 | 3 | 自动化列表/编辑/周期历史 / A,R | D-025/026/027/054/071 | 版本模板、逐次授权、触发去重、漏跑、绑定设备；事件规则不套每期建项 | 原则已定，调度位置/暂停/删除细则未定 / 高 |
| P04 | 32 | 能力目录、市场与已配置项 / C | D-019/020/021/022/049/050 | 获准准确版本按安装权限自助安装，普通更新确认后安全切换，安全撤销阻止后续派发 | 安装/更新原则已定，卸载与激活合同待定 / 高 |
| P05 | 1 | 插件贡献页与设置 / U,C | D-048；现行唯一产品owner及帧策略 | 经校验的数据/配置声明由Sage自有组件呈现，无插件脚本或平行业务路由 | 统一组件方向已定，声明合同未定 / 高 |
| P06 | 66 | 设置中心及子页 / 按设置对象分责 | D-019/029/031/033/035/041/042/051～054/071/073 | 偏好、秘密、授权、设备和业务数据分别管理，不能统一自动保存 | 部分已定，见设置表 / 中～高 |
| P07 | 1 | 项目/详情/事项行动项 / D,Q | D-007/015/016/060/062/066/084/089 | 事项可独立或最多归属一个项目，受权变更关联，不复制事项；Issue为事项内行动项，项目汇总不自动共享或改变主责 | 项目关联基数已定，变更/历史汇总细则待定 / 高 |
| P08 | 1 | 协作讨论与参与者 / D,I | D-038/062/063/067～069/084～088 | 首版仅事项所属组织的有效成员；默认可见、成员管理、历史开放分别核验；主责交接须接任确认且条件满足，不自动换设备 | 组织边界已定，委派延续/原主责访问/应急交接待定 / 高 |
| P09 | 1 | 我的待办与动态 / Q | D-016/030/038/043/063/097～118 | 关联新轮须另选未参与上一轮审理的合格人员，上一轮仅受权补充说明/证据；待分派/待承接不以旧回执补齐，材料贡献与本轮责任分开 | 上一轮审理回避已定，分派回避扩展、更多历史轮次及通知细则待定 / 中～高 |
| P10 | 1 | Agent/团队配置与运行分工 / C,R | D-022/056/071 | 候选/委派/子执行分别绑定身份和预算；独立步骤并行不等于跨设备任意分发 | 运行原则已定，创作管理未定 / 高 |
| P11 | 1 | 本地运行环境状态与管理 / R,C | D-042/050/071/091 | 事项选定默认环境，运行及派发前重验；不可用不静默替换；装配、占用、设备绑定与交接分开，远端执行后置 | 默认选择已定，环境描述/关键变化/设备协议待定 / 高 |
| P12 | 1 | 独立产物预览 / F,U | D-034/036/070 | 指定版本与资源闭包、独立非特权容器、关闭回收与崩溃 | 内容安全已定，多窗细节未定 / 高 |
| P13 | 4 | 工作区资源集合 / F,I | D-008/009/010/011/072/073/090～095 | 多工作区、环境重验、新版确认与获准快照；移除停后续取用、删除独立；仅移除时既有成果按动作影响核验，不自动作废验收 | 原则已定，影响证据/保留删除及换机细则待定 / 高 |
| P14 | 5 | 事项侧面板、日志、文件和预览 / U,R,F | D-033/034/059/070 | 不做交互Shell；日志不进入普通对话同步，面板切换不取消运行，导出独立核权 | 原则已定 / 中～高 |
| P15 | 1 | 主对话和局部侧聊 / D,R | D-006/039/040/067～069 | 侧聊托管但默认私有，最小上下文、候选分享与采纳分开，不复制全部历史 | 同步范围已定，关闭/成员变更细则待定 / 高 |
| P16 | 2 | 运行监控 / R,Q | D-012/013/030/031/032/056/071 | 步骤/预算/后台/设备状态分轴；设备离线不等于运行已取消或已接管 | 原则已定 / 高 |
| P17 | 1 | 引导与实验入口 / U | 尚未决定 | 引导不能替代登录/授权，实验不能直通生产 | 待决定 / 待定 |
| O01 | 2 | 上下文建议/详情/来源 / F,K,Q | D-023/024/039/072/073/092～094 | 建议/引用/读取/发送分开；新版确认、获准快照；移除后停止后续取用，历史查看仍核权限，删除独立 | 资料边界已定，成果影响与派生传播细则待定 / 中～高 |
| O02 | 8 | 输入区目标/资料/方法/模型 / D,C | D-005/017/019/020/021/023/061/072/073 | 选择不是授权/可信target；方案范围限制与资料目的地授权分别核验 | 部分已定，选择器细则未定 / 高 |
| O03 | 1 | 输入尺寸、方案边界、语音 / U,D | D-004/012/041/061 | 尺寸纯UI；语音转文字确认发送；只做方案用事项范围表达，不增独立模式 | 方案边界已定，语音服务待定 / 中～高 |
| O04 | 1 | 事项重命名/分组/归档/批量 / D,Q | D-029/066 | 正式元数据由服务裁决；批量逐项结果与权限；隐藏/归档/停止不同 | 归档已定，批量/重命名未定 / 中 |
| O05 | 1 | 资料访问申请 / I,F | D-008/011/023/072/073 | 本地选取、系统许可、组织grant与外传范围分开；拒绝不回退全盘或自动上传 | 原则已定，范围表达与UX细则未定 / 高 |
| O06 | 1 | 远端环境连接 / R,I | D-042/071 | 云端任务执行后置；获准本地设备换机交接是另一能力，不能混用 | 远端后置，本地交接协议另定 / 高 |
| O07 | 1 | Git分支/提交/发布 / F,R | D-053 | Git/Worktree真实接线后置，首版保留修改稿与Diff，不自动提交/推送 | 后置 / 高 |
| O08 | 12 | 高级MCP表单/JSON/弃稿 / C | D-020/048/049 | 配置草稿、secret处理、严格解析、transport准入；JSON保存不执行命令 | 入口已定，具体协议未定 / 高 |
| O09 | 1 | 深链安装确认 / C,I | D-049/050 | 深链仅定位候选，核验获准准确版本与安装权限；无安装/启用旁路 | 准入原则已定，深链格式与确认细节待定 / 高 |
| O10 | 1 | 图片预览/批注 / F,U | D-015/038/059/070 | 缩放可纯UI，批注绑定版本/权限，导出独立；生成图片另算能力 | 部分已定，批注合同待定 / 中～高 |
| O11 | 1 | 图表全屏/链接预览 / F,U | D-034/036/070 | 离线资源、全屏焦点恢复、外链经可信显式入口，不自动联网 | 原则已定 / 中～高 |
| O12 | 1 | 行动项执行记录／另补要求更正 / D,R | D-012/057/060/067 | 原型当前承接IssueRun记录（见F05），并非消息更正编辑器；要求更正需新增关联消息与生效回执 | 目标原则已定，原型交互有缺口 / 高 |
| O13 | 1 | 登录/组织/反馈/关于 / I,U | 现行OIDC治理；D-062/065/066/079/080 | 登录不等于授权；反馈默认文字、主动选附并预览核权，不自动截图或上传原始日志 | 反馈方向已定，身份/提交/保留细则未定 / 高 |
| O14 | 1 | 退出/更新/未保存提示 / R,U | D-003/013/014/050 | 退出影响清单；D-050仅约束扩展更新，不冒充应用升级/基座pin策略 | 退出与扩展更新已定，应用更新体验未定 / 高 |
| S01 | 5 | 流式活动与过程摘要 / R,U | D-012/033/067 | 公开事件排序/去重/断流；对话同步不含私有推理或原始工具日志 | 同步范围已定，协议待定 / 高 |
| S02 | 4 | 澄清与待回答 / D | D-001/004/005/012/067 | 答复不等于批准；输入恢复、服务接收和正式生效分开 | 原则已定 / 高 |
| S03 | 1 | 授权申请/外部认证等待 / I,C | D-020/043/073 | 认证、业务批准、系统许可、数据发送和执行权限不互相替代 | 部分已定 / 高 |
| S04 | 1 | 方案预览/确认/未执行 / D,R | D-043/061 | 方案是交付，接受不执行方案；批准并继续针对明确动作分阶段回执 | 纯规划边界已定，组合操作合同待定 / 高 |
| S05 | 1 | 模型排队/恢复/重试 / R,C | D-018/032/073 | 等待与失败区分，确认替代并重核数据去向；未知结果禁止盲重放 | 原则已定 / 高 |
| S06 | 1 | 执行步骤与阻断 / R,D | D-012/022/032/055/056/071 | 按动作前提判断就绪及独立性，同绑定设备受控并行；安全/权限未知阻断 | 方向已定，子执行合同须演进 / 高 |
| S07 | 1 | 运行中追加输入 / R,D | D-012/057/067 | 收到/待应用/生效分开，限制优先，保留更正关联；排序/撤回待定 | 原则已定 / 高 |
| S08 | 3 | 失败/中断/继续 / R,D | D-012/014/018/032/071 | 停止请求/已停止/结果未知分开；恢复重核设备归属、权限与未决操作 | 原则已定，精确状态映射未定 / 高 |
| S09 | 1 | 后台Agent/进程/侧聊 / R | D-013/022/042/071 | 后台主体不依赖已销毁窗口；关闭界面、设备离线和任务停止分开 | 原则已定 / 高 |
| S10 | 2 | 上下文用量/压缩/继承 / R,D | D-031/039/058/067/068/069/073 | 自动整理并提示，按权限载入记录与正式约束，不因压缩泄漏私密侧聊或扩大外传 | 方向已定，容量与一致性合同待验证 / 高 |
| S11 | 1 | 工作区失效/历史缺失 / F,Q | D-008/028/072 | 内部区分损坏/缺失/无权；产品拒绝保持anti-oracle，不泄漏无权对象是否存在 | 待错误合同 / 高 |
| S12 | 1 | 额度/模型/许可/网络错误 / R,I | D-018/031/032/063/071 | 不自动换模型/续费/换机；设备离线与协作服务不可用分别表达 | 主要原则已定，许可产品未定 / 高 |
| S13 | 1 | 局部面板错误与恢复 / U,Q | 现行错误分层；D-028/070 | 重试读取或该版本同步不重跑业务；新鲜状态未知须标明，不静默展示过期成功 | 待恢复合同 / 中 |
| M01 | 8 | 文本/Markdown/过程分组 / U,R | D-033/034/067 | 安全渲染、复制/引用、流式完成≠事项完成、私有推理不显示，受权同步 | 待逐动作合同 / 中～高 |
| M02 | 3 | 文件修改工具活动 / F,R | D-009/010/053/070 | 修改稿、交付同步、源回写分别留痕；不自动Git提交 | 原则已定 / 高 |
| M03 | 1 | 网络/终端工具活动 / R,C | D-033/036/042 | 只显示受控执行信息，点击卡片不新增命令或联网 | 原则已定 / 中～高 |
| M04 | 1 | 专用工具结果UI / U,C | D-048 | typed数据经校验后由Sage组件呈现，不支持类型明确拒绝，无结果脚本或权威动作输入 | 统一组件方向已定，具体结果合同未定 / 高 |
| M05 | 1 | 工具详情/结果图片 / U,F,R | D-033/034/070 | 脱敏详情、安全图片与权限；只有纳入交付的内容才按交付同步，不透传raw payload | 待数据合同 / 中～高 |
| A01 | 4 | 修改稿与Diff / F | D-009/010/053/059 | 非Git依赖的版本比较、确认绑定与独立回写；下载不回写 | 原则已定 / 高 |
| A02 | 2 | 产物卡/方案文件 / F,D | D-015/016/043/061/070/096～118 | 可能改变上一轮结论的关联新再审须另选独立人员，上一轮只受权补充说明/证据；不能通过重新承接裁决自己的前次判断，历史记录与用途限制保留 | 上一轮审理回避已定，分派回避扩展、更多历史轮次与结论适用待定 / 高 |
| A03 | 1 | 表格/文档/缩略图/不支持 / F | D-015/038/047/059/070 | 指定版本解析、字段投影、明细核权；不支持与损坏不同 | 部分已定，格式范围待核 / 高 |
| A04 | 2 | HTML/文本/图片/文件 / F | D-023/034/036/037/059/070/072 | 统一版本记录，上传附件/本地引用/生成成果分开；离线预览与受控导出 | 原则已定 / 高 |
| A05 | 1 | 产物版本/加载/失败 / F,Q | D-009/010/015/063/070/096～118 | 本轮与上一轮参与关系绑定核验，旧轮签署不迁移；本轮人选、承接、结论及独立结束责任均满足回避要求，补充证据不等于本轮裁决 | 上一轮分派权、更多历史关系、跨轮结论适用与控制传播待定 / 高 |
| A06 | 1 | 语音讨论摘要/便签 / F | D-041只含转文字输入 | 不将语音输入决定扩大为录音档案、实时对话或会议纪要 | 未决定/可能后置 / 待定 |
| OBS01 | 1 | 用量浮层 / R,Q | D-031/032/056 | 预留/消耗/最终账单分开，子执行与重试归集到事项，共享预算不重复占用 | 原则已定 / 高 |
| OBS02 | 13 | 知识中心/Wiki/知识卡 / K,Q | D-023/024/051/073 | 资料/候选/验证知识/偏好记忆分开；纳入不自动发布，派生内容同受外传约束 | 部分已定，正式发布/退役待定 / 高 |
| OBS03 | 4 | 网页成果目录 / F,Q | D-037/059/070 | 同源版本与访问限制，已托管交付不等于网站上线；真实发布后置 | 首版职责已定 / 中～高 |
| OBS04 | 9 | 用户菜单与快捷外观 / U,I | 既有身份边界；D-066 | 外观、账号、组织分责；个人可见不表示仅本机存储，菜单不证明session有效 | 外观细则待定 / 低～中 |

> 条数以 Sanbao 原型目录 [catalog-data.json](../../vendor/sanbao-prototype/src/catalog-data.json)（206 条 / 59 组，指纹 9eaf593a5bdc）为准；组可多归属，故各组条数之和大于状态总数。上表曾按人工汇总，已按该文件重算校正 8 组（P04 +11、P06 +6、M01 +5、S01 +3、P13/P14/O02/A04 各 +1）。
## 设置叶页缺口（P06的交叉索引，不另加目录分母）

证据：`src/pages/SettingsLeafWorkbench.tsx:3`列出15个设计型叶；`SettingsVoicePage.tsx:109`、`SettingsModelsPage.tsx:115`等保留已观察结构。15个设计叶各有overview/draft/result参数，不能只按P06单条占位认定覆盖完整。

| 叶/设置类 | 当前方案归属 | 仍需裁定或核对 |
| --- | --- | --- |
| pet | 纯产品偏好候选 | 是否首版需要，不因原型有页自动新增宠物系统 |
| memory | D-051；偏好记忆不等于知识库或事项事实 | 建议后确认保存，明确记住按范围处理；查看/修改/遗忘；作用域、优先级与删除传播待核定 |
| import | 独立数据迁移/维护 | 旧DSH资料继续P0-3B阻断，新附件导入与旧资料迁移分开 |
| hooks | D-054；受控事件规则 | 首版不开放任意脚本，明确事件/动作目录、去重、防循环、权限和失败记录；不与内建通知重复触发 |
| computer-control | D-052；完整设计、真实接线后置 | 首版不启用屏幕读取或键鼠操控；后续单独设计目标窗口、权限、人工接管、停止和误操作恢复 |
| mobile | D-035/062～071 | 合同同步、桌面先接线；托管服务职责已定，移动身份、设备准入和通知仍待定 |
| git | D-053；与O07交叉 | 真实Git接线后置，首版保留非Git依赖的修改稿/Diff；不自动提交或推送 |
| worktrees | D-053；与O07/P13交叉 | 隔离工作目录管理后置，不将资料工作区等同Git Worktree |
| workspace-index | D-028/072/073 | 索引范围/位置、排除规则、进度、删除传播；远端文本/向量传输另核验 |
| connections | D-020/049/050 | 业务连接与高级配置共用校验；真实认证、协议、准入与激活分别明确 |
| security | I及现行治理；D-066/071/073 | 可解释状态和管理权限，设备与数据发送分责，不能前端编辑authoritative结果 |
| archived-tasks | D-029/066 | 服务裁决归档，复用正式事项，不建第二份历史真源 |
| experiments/playground | 与P17交叉 | 研发演示与生产功能分离，首版是否保留入口 |
| network | R,C,I；D-073 | 代理/证书/网络诊断支持范围与owner待定；网络配置不能绕过目的地限制 |
| appearance/basic/shortcuts | U | 主题、系统跟随、密度、快捷键冲突及持久化，未批准字面token |
| profile/account | I；D-062/065/066/082 | OIDC与组织选择、登出即时清token/session；未确认草案加密锁定，重新登录并获准才恢复；正式缓存与运行影响另定 |
| models | D-017/018/019/073/076～078 | 配置/准入/费用/秘密分层；内地处理、禁止供应商训练/改进、必要安全留存受限核验，须展示具体条款与限制，个人Key无例外 |
| voice | D-041 | 仅转文字确认发送；转写供应商、音频目的地与清理未定，不自动纳入实时语音 |

## 数据位置与可见性接线

以下由D-066～073及各对象原决定约束，不是新增schema；同步成功不授予读取、再分享、导出或模型发送权限。

| 数据对象 | 已确认的位置与范围 | 页面表达与接线缺口 |
| --- | --- | --- |
| 建项前事项草案及其未发送输入 | D-003/081/082：仅当前设备隔离安全保存；登出清token/session和可读临时内容，加密草案锁定保留；同账号/组织重新登录且获准后恢复，不自动同步或换机接续 | 需独立版本、密钥管理、保存/清理失败、保留/到期删除及幂等转换合同；不得缓存权限离线打开，正式事项内未发送输入不由本行扩大定义 |
| 正式事项/版本/批准/验收 | D-064/066由托管服务最终裁决；D-084基本记录默认限创建者与获准主责，不按项目自动共享；决定/验收的具体读取仍核权限 | 本地意图/接收/生效分开；需租户隔离、事务/冲突、幂等、历史v1及成员变更失效 |
| 主对话 | D-067同步已提交的产品可见消息/回复/更正；D-084默认限创建者与获准主责；D-086邀请明确范围后可向新成员开放该范围历史，不含私有推理/原始日志 | 当前权限约束历史分页/搜索/订阅；需顺序、续读、权限/删除传播；验收人不默认读全文，读历史不继承旧操作权 |
| 侧聊与候选 | D-068托管同步、默认仅发起者可见；D-069跨范围分享先确认 | 候选生成、分享、主线采纳分开；需要分享权限、内容/目标范围绑定及成员变更失效 |
| 候选交付与预览资源 | D-070形成明确版本后在获准范围自动同步，不扫描工作目录 | 本机已生成/同步中/失败/可远程评审分开；需封存清单、资源闭包、完整性核验与失败续传 |
| 托管附件 | D-023/072明确上传所选版本，默认当前事项及获准参与者 | 上传、解析、引用、AI使用分别呈现；需格式/容量、解析服务、复用与删除传播合同 |
| 本地资料引用 | D-072路径映射留设备、不上传原文件；D-092新版确认，D-093获准快照，D-094移除停后续取用且删除独立 | 不借旧摘要/向量/快照/缓存继续取用；D-095仅移除时已有成果按用途分别核验，历史验收不抹除；影响证据及保留/换机细则待定 |
| 发给模型的文本/图像/摘要/向量 | D-073按资料/用途/目的地/有效期范围授权，逐次核验；政策禁止不能由个人同意覆盖 | 显示实际目的地与范围变化；需在请求构造点强制检查，不能仅在勾选资料时检查 |
| 原始日志/机器路径/秘密 | D-033仅受控诊断投影；D-067/070排除默认同步；现行身份秘密边界保持 | 错误不透传raw payload；需诊断字段allowlist及保留规则，业务连接凭据托管位置未定 |

**地域方向已定。** D-074/075确认首版在中国内地单一托管数据区起步，不提供组织选区；不满足该区要求的组织暂不接入。完整取舍见[ADR-0006](adr/0006-single-mainland-hosting-region.md)。D-076另定首版云端模型仅支持经核验的内地处理/留存服务，个人Key和兼容配置不能绕过；地点未知的服务不可执行。具体城市/供应商未选，单一区域不等于单机或单可用区。备份、日志、运维访问及解析/转写仍需分别核验；只选服务器地域不能证明全部处理留在同一区域。D-077禁止供应商通用训练或产品改进；D-078允许最小必要安全留存经逐项核验与有权批准后准入，具体内容范围、期限、删除条件及其他缓存用途仍待定，真实数据门未解除。

## 正式裁决与设备执行的责任拆分

以下是已确认目标导出的必要分工，不是已批准的新协议；不预选HTTP、WebSocket、队列、租约或数据库。

| 责任 | 目标落点与传递对象 | 必须保留的边界 | 决定依据 |
| --- | --- | --- | --- |
| 正式命令/读取 | 托管服务Application Service裁决；接收具名意图与当前版本，返回最小受权投影及处理回执 | 不接受renderer自报actor/权限，不让客户端成为第二正式写主 | D-064/066、ADR-0004/0005 |
| 设备侧入口 | Electron main绑定受信调用方，提供窄设备操作port | 旧Host-owned route不是目标完成证据；不提供任意远程命令入口 | ADR-0004、现行ADR-0174/0178 |
| 执行绑定/交接 | 服务维护正式绑定；设备核验事项/操作/代次与当前有效归属 | 心跳超时不证明旧动作未执行；换机不能让两端同时有效取得同一执行 | D-071 |
| 实际派发 | 获准设备执行链通过main/Host窄port访问Adapter | 重新核验权限、target、inventory、Registry、preflight、预算和资源；服务批准或设备在线不能替代 | D-042/055/056/071、现行安全合同 |
| 执行事实与上报 | 设备记实际结果；服务核验操作、版本、设备代次与证据后接纳正式记录 | 过期结果不能覆盖新版本；也不能简单丢弃迟到事实后重放可能已发生的动作 | D-012/014/064/071 |
| 交付内容同步 | 设备封存获准版本，托管内容层接收并核验完整性 | 元数据到达不等于可远程验收；重传失败不触发重新生成 | D-070 |
| 验收与整体完成 | 服务记录个人范围结论，按D-099核验齐备条件后确认交付版本接受；事项整体完成独立 | 默认单人/按需会签，发起机无需在线；缺席/修改要求/失效必需结论不放行，无主责重复分项总确认；B-034才确认整个事项 | D-015/016/038/063/066/098/099 |
| 待办/搜索/通知 | 从各自正式记录派生的受权读模型；技术与部署位置待定 | 通知送达、索引命中、页面可见均不授予动作权，也不是第二业务真源 | D-028/030 |

网络中断时至少要区分尚未派发、可能已派发、已知执行结果、已上报待确认。无法证明未派发时进入受治理核对，不能将断线、取消点击或设备交接当作安全重放证明；服务端统一裁决不提供外部操作原子性。

## 首闭环逐交互核对

范围依据D-045～047：单店、单期、只读事实与依据，数据表和摘要报告两交付项；结合D-062/063的正式首版跨电脑验收要求。此表是该切片的历史静态证据与目标合同，不是全206状态逐动作完成清单；其中route、登录和renderer现状以[当前Sage接线基线更新](#当前sage接线基线更新)为准。具体店铺、字段、口径、时间、供应商、凭据和预算仍未选。

源码链接分别指向 [原型src](../../vendor/sanbao-prototype/src) 和 [Sage src](../../apps/sage-shell/src)；行号为当前核对位置。`approvalView`/`planView`/`mobileFlow`是原型参数，不是拟定的Sage接口或产品状态枚举。

| 步骤/目标交互 | 原型证据及实际行为 | Sage现有基础与差距 | 目标请求、反馈及失败边界 |
| --- | --- | --- | --- |
| 1. 输入并整理草案 | `QDR.P01.home.workspace`；[ProductPages.tsx:106](../../vendor/sanbao-prototype/src/pages/ProductPages.tsx#L106)、[Controls.tsx:251](../../vendor/sanbao-prototype/src/components/Controls.tsx#L251)、[app.tsx:709](../../vendor/sanbao-prototype/src/app.tsx#L709)：非空发送清空输入、保存内存prompt并跳会话回放，不生成事项草案 | [view-state.ts:24](../../apps/sage-shell/src/product/view-state.ts#L24)只有动作投影词汇；缺独立草案对象和整理服务 | 提交用户文字→获准模型整理→可编辑候选；自动保存不调用模型，失败保留输入且不建正式事项 |
| 2. 确认正式建项 | **新设计，无对应确认卡**；`QDR.P13.create.empty/ready`是工作区表单，[app.tsx:822](../../vendor/sanbao-prototype/src/app.tsx#L822)只改本地workspace，不能挪作事项创建 | [business-matter.ts:921](../../apps/sage-shell/src/domain/business-matter.ts#L921)创建goal/责任；[event-store.ts:224](../../apps/sage-shell/src/persistence/business-matter-event-store.ts#L224)为本机store端口；缺交付字段、托管创建与转换幂等 | D-083：确认字段含目标/交付/责任/限制/待确认项，加用户选附片段→预览并核权→服务创建→正式ID及转换回执；不上传全部前史，超时先核对，不重复创建或提前清除草案 |
| 3. 核对执行范围及必要批准 | `QDR.S03.scope.unexpanded`的`approvalView=request/waiting/resolved`、`QDR.S04.scope.unexpanded`的`planView=preview/expanded/confirmation/approved/exit`；[ApprovalPlanWorkbench.tsx:43](../../vendor/sanbao-prototype/src/pages/ApprovalPlanWorkbench.tsx#L43)只改回放状态，“模拟已完成”不认证 | [business-matter.ts:1111](../../apps/sage-shell/src/domain/business-matter.ts#L1111)有decision；[action-preview.ts:57](../../apps/sage-shell/src/product/action-preview.ts#L57)始终not-submitted；缺真实组合命令 | 按动作政策判断是否需批准，不强加全量审批；批准成立与请求继续分别回执，设备离线/权限失效则显示已批准未执行 |
| 4. 单店单期只读执行 | **订单场景新设计**；[SessionPage.tsx:37](../../vendor/sanbao-prototype/src/pages/SessionPage.tsx#L37)为通用计时回放，不查询店铺 | [business-matter.ts:1201](../../apps/sage-shell/src/domain/business-matter.ts#L1201)有attempt校验；[view-state.ts:294](../../apps/sage-shell/src/product/view-state.ts#L294)中的订单能力是blocked fixture，不是API | 服务确认操作/设备归属→设备完整核验→受控Adapter查询；完整分页与数据时点必须有据，缺页不能报全量，模型不承担未经验证的数值计算 |
| 5. 形成两交付项并查看 | `QDR.A03.scope.unexpanded`固定映射table-document，[ArtifactWorkspaceWorkbench.tsx:67](../../vendor/sanbao-prototype/src/pages/ArtifactWorkspaceWorkbench.tsx#L67)只切表格/文档内存状态，**没有artifactView参数**；研究模式HTML卡见[SessionPage.tsx:81](../../vendor/sanbao-prototype/src/pages/SessionPage.tsx#L81)，“审阅”仅转Diff | [business-matter.ts:858](../../apps/sage-shell/src/domain/business-matter.ts#L858)首个artifact结束attempt；[1396](../../apps/sage-shell/src/domain/business-matter.ts#L1396)记录引用；数组不是两交付项合同 | 明确数据表/报告各自身份与版本、共同口径和来源→封存候选→获准同步→内容完整后可远程评审；预览不自动验收 |
| 6. 分派并跨电脑验收 | **桌面分项验收新设计**；`mode=product&mobileFlow=review`见[MobileCollaborationPrototype.tsx:111](../../vendor/sanbao-prototype/src/pages/MobileCollaborationPrototype.tsx#L111)，仅设置单个reviewDecision，无交付项/版本；P09“记录本地处置”见[CollaborationCollectionWorkbench.tsx:187](../../vendor/sanbao-prototype/src/pages/CollaborationCollectionWorkbench.tsx#L187)，只转feedback | [business-matter.ts:1431](../../apps/sage-shell/src/domain/business-matter.ts#L1431)只接收最新待验收artifact并结构匹配主责；缺分项责任/权限、共享内容与跨端冲突 | 各验收人以独立真实身份读取获准交付及必要依据，提交指定版本的接受/修改结论；发起机离线可完成，资料不足/版本失配/撤权不得成功 |
| 7. 主责整体完成确认 | **新设计，无对应按钮/状态ID**；`QDR.M01.reply.completed`只是回复结束，见[SessionPage.tsx:75](../../vendor/sanbao-prototype/src/pages/SessionPage.tsx#L75) | [business-matter.ts:877](../../apps/sage-shell/src/domain/business-matter.ts#L877)accepted receipt直接completed；需按D-044受控演进且保留v1解释 | 主责确认→服务检查必要分项验收及其他完成条件→独立整体回执；不能由最后一项接受、下载或模型回复自动触发 |
| 8. 查看后续状态与恢复 | 同一原型回放不能证明跨设备续读；版本失败页[ArtifactWorkspaceWorkbench.tsx:75](../../vendor/sanbao-prototype/src/pages/ArtifactWorkspaceWorkbench.tsx#L75)“重试本地占位”只切ready | main已截获业务前缀，当前retry-only、typed denial及renderer状态消费统一见[当前Sage接线基线](#当前sage接线基线更新)；旧固定503说法不再适用 | 后续正式读取与回执仍未接；预览重载、内容续传、业务重试和未知结果核对分开，不能把当前runtime重读当业务恢复 |

### 首闭环必须验证的反例（本轮均未运行）

- 建项双击/超时重发：同一请求与相同意图只对应一个正式事项；同身份不同意图冲突，不能把新修改吞成旧成功。
- 默认模型不可用或数据目的地不符：不能静默换模型，也不能因有预算就传输资料。
- 批准落库后设备离线：批准仍有记录，执行明确等待；在线验收不因此被阻断。
- 查询缺页、时间边界不清或多币种口径未定：不能生成“完整收入/利润”结论；准确零结果与查询失败必须区分。
- 只生成数据表、报告失败：保留已有交付，不宣称两项完成或自动重跑已知成功部分。
- 内容只上传元数据或资源不完整：远端不得显示可评审；继续同步不重新运行查询和生成。
- 验收人只获数据表权限：不得通过报告摘要、附件引用、搜索计数或通知获得更广内容。
- A在看旧版本、B提交新版本：A的结论不得套用到B版本；具体旧版本是否还能留历史意见待合同，不能静默迁移验收。
- 一项接受、一项要求修改：事项不得整体完成；返工不能覆盖既有验收历史。
- 确认整体完成时责任或权限已变化：服务重新核验，不以打开页面时的状态放行。
- 设备交接后旧结果迟到：不能写入错误代次或将同一操作有效派发两次；未知效果先核对。
- 预览/下载失败：只恢复对应读/导出流程，不能回写文件、重新验收或重放业务操作。

## 共享工作量与反向后端映射

这些是分析工作包，不是新增服务或实施工单。已有基础只说明可复用候选，不能等同生产接线；独立等待真实provider/数据治理/接口输入不计作编码天数。

| 共享工作包 | 主要页面消费者 | 现有证据入口 | 新增工作与难度依据 |
| --- | --- | --- | --- |
| 正式事项与安全产品入口 | 首页、事项详情、审批、分项验收、整体完成 | [ADR-0161](../adr/ADR-0161.md)、[ADR-0174](../adr/ADR-0174.md)、BusinessMatter/store、ViewState/preview | **高**：托管单一裁决、草案转换、交付项/回执演进、幂等、版本冲突、跨端订阅；不能仅替换fetch地址 |
| 身份/组织政策/数据治理 | 登录、共享、验收、搜索、设置及所有受保护操作 | [ADR-0163](../adr/ADR-0163.md)、[ADR-0164](../adr/ADR-0164.md)及其Note | **高**：真实provider、服务与设备身份边界、读/动作分权、范围/目的地核验、保留/hold/删除；纯resolver不足 |
| 兼容性、Registry与Adapter | 模型/MCP/扩展设置、运行就绪、错误诊断 | [ADR-0165](../adr/ADR-0165.md)至[ADR-0171](../adr/ADR-0171.md)及关联Note | **高**：真实描述/provenance、同连接完整观察、可信clock/inventory、approved real entry与准确operation映射；不按页面复制内核 |
| 设备执行与恢复 | 运行、后台、停止、预算、换机、自动化 | Host生命周期、单attempt内核、[ADR-0174](../adr/ADR-0174.md)；目标D-013/025/055/056/071 | **高**：后台主体、设备代次、子执行/资源冲突、预算预留、取消/未知结果核对；服务回执与外部效果不原子 |
| 内容与安全呈现 | 附件、文件、Diff、HTML、表格、导出、网页成果 | artifact引用、[ADR-0178](../adr/ADR-0178.md)、[ADR-0001](adr/0001-offline-interactive-html-preview.md) | **高**：实际内容/版本/完整性、资源闭包、同步、解析、安全WebContentsView、条件回写；帧禁用不等于预览已实现 |
| 派生查询与协作 | 列表、项目、我的待办、搜索、主/侧聊、通知 | 本机store窄读取、ViewState；目标D-007/028/030/062～070 | **高**：对象权限过滤、分页、顺序去重、失效/撤权传播；本机load不是全局搜索或多人协作 |
| 原型组件迁移 | 全部导航、表单、列表、回放状态与错误面板 | [UI一致性合同](../specs/2026-09-27-sanbao-to-sage-ui-consistency-contract.md)、原型React、Sage字符串renderer | **中～高**：组件栈/构建待定，真实数据生命周期与无障碍另验；布局可参考，事件处理与状态不能整体照搬 |

内部证据不必都增加设置页面：安装内容证明、Host boot观察、Registry快照、权限证据和操作幂等键主要支撑可信判断；产品只呈现必要的安全摘要/原因/关联引用。反向表覆盖本次涉及的基础，不是全仓后端模块逐文件闭合清单。

建议依赖顺序仅供后续确认：先冻结托管/设备合同及真实数据门，再建立受权读取与正式创建、绑定设备只读执行、内容同步及跨端验收闭环，最后扩展其余页面族。该顺序不启动实施，也不把已要求首版的能力擅自删减；分批完成与正式首版验收范围分别管理。

## 其余页面族静态接线复核

本节继续核对首闭环以外的页面：从事件处理识别真实的本地行为，再映射目标责任。每行合并同一页面的同类控件，不是每按钮一行；源码可见不等于浏览器实测，所有恢复用例均为待执行的验收要求。下列文件行号均相对原型 `src/`；完整文件名可在同名源码中定位。

“纯UI”只指展开、焦点、布局等行为；一旦涉及保存偏好、业务查询、读取文件、模型处理或操作系统权限，就须转到相应受控端口。目标合同未定的项不自动批准。

本节的状态标签必须按来源分开：只显示（无handler/disabled）、局部变化（state/URL/toast）、模拟异步（计时/手动进后态）、已声明目标（D决定）、真实接线（本轮未证明）。具体行中的“高/中/低”是目标实现相对跨度，不是对原型质量评分；每行最后一列的反例都需要未来实际验证。

共通接线验收还要覆盖：读取时的加载/空/拒绝/不可用，提交时的校验/处理中/冲突/过期/撤销，提交后返回丢失时的受权结果查询；不会改变业务的纯UI动作不应凭空调用业务命令。显示“已保存/已安装/已同步/已完成”必须来自相应owner的确定结果，而不是统一toast、延时器或结果页路由。

### 设置、输入、导航与系统页面

| 编号/源状态或有效参数 | 源码位置与实际动作→后态 | 目标接线责任与新增合同 | 兼容差异/必须验证 |
| --- | --- | --- | --- |
| U01 · `QDR.P06.settings.appearance.*` | `pages/SettingsAppearancePage.tsx:99-155`：主题、七类选择项、玻璃/噪点/链接开关只改组件state和提示；不应用全局主题、不保存或改程序坞 | U：统一偏好读写与订阅，主题/语言/缩放作用域；系统主题变化需桌面观察，程序坞图标另走main原生能力（是否保留未定） | 中；外观页与快捷菜单不能有两份权威值。D-036已定系统浏览器，不能照搬“终端链接使用内置浏览器”开关；重启、系统明暗切换、缩放与焦点另验 |
| U02 · `QDR.OBS04.user.menu.open`、`QDR.OBS04.appearance.*` | `components/UserAppearanceMenu.tsx:131-145`：选值只改菜单state；设置/宠物/手机转入口；登出/关于/更新日志只提示。菜单随窗口尺寸定位，键盘关闭恢复焦点 | U：与U01共用偏好；I：登出经身份边界，菜单只消费状态；关于/更新日志需可信版本来源，外链走显式安全打开 | 低～中（登出高）；不把菜单选中当全局生效，不把“退出登录”当已销毁session；窄窗口、键盘返回与弹窗嵌套另验 |
| U03 · `QDR.P06.settings.general.default`、`.mode.default`、`.task-monitor.default` | `pages/SettingsBasicPages.tsx:75-83`：通用行全部只提示，switch值不变；`mode`仅两套静态显示项，任务监控设置不广播到其他任务 | U：纯显示偏好；R/D：运行输入、目标/轮次和澄清；Q/main：通知及系统许可分开；D-079不使用业务内容做Sage通用训练/产品改进，主动反馈另定 | 中～高；不继承自动空答、20轮、自动低价模型/逐轮通知；**共享改进模式和付费解锁隐私控制不迁入**。隐藏监控不停止任务 |
| U04 · `QDR.P06.settings.shortcuts.*` | `pages/SettingsShortcutsPage.tsx:91-133`：只有精确“语音”与固定测试字串映射筛选；其他词保留输入但仍列全表；发送方式保留Enter；录制只提示、保存disabled，仅“设置”有编辑弹窗 | U/main：命令目录、真实过滤、组合键规范化、冲突检测、作用域、持久化及注册/卸载；命令动作复用原受权入口 | 中；不能把固定词分支当搜索引擎。IME、系统保留键、重复注册、输入框/弹窗优先级、取消不改旧键另验；实时语音/截图反馈快捷键不因存在就进入首版 |
| U05 · `QDR.P06.settings.voice.*` | `pages/SettingsVoicePage.tsx:53,79-145`：设备/音色/速度/时长选值只提示且保留默认；词汇仅内存，添加不保存；快捷键保存disabled；所有音频开关不采集/播放 | D-041：main受控麦克风许可/设备枚举，转写操作、可编辑文字、用户确认发送；本地/云端转写及音频清理/费用待定 | 高；不迁移“自动发送”、声纹、屏幕上下文、实时播报/纪要保存。设备列表是取证快照而非实际枚举；拒权、拔设备、取消转写/迟到结果不得偷偷发送 |
| U06 · `QDR.P06.settings.profile.default` | `pages/SettingsProfilePage.tsx:12-41`：编辑头像/身份/资料/分享/成就、复制邮箱、统计、登出均只提示；统计0与订阅为fixture | I：真实资料最小投影、编辑授权、身份/岗位分离；D-082登出立即清token/session及可读临时内容，未确认草案加密锁定保留；Q/R统计另管，分享/成就/套餐未定 | 高；选身份不改grant，0不冒充零消耗；草案仅同账号/组织重新登录且获准后恢复，正式缓存和后台任务影响仍需独立合同 |
| U07 · `QDR.P06.settings.mobile.partial` / `settings.mobile.entry` | `pages/SettingsMobilePage.tsx:13-57`：partial专页远控/唤醒只改state，下载/配对只提示，预览跳`mobileFlow=start`。`.entry`或侧栏“移动端”可进入U08通用leaf，不能当作专页同一入口 | D-035/062～071：轻协作读取/动作走托管服务，移动身份与设备准入另定；本机执行绑定不能等同手机任意控制 | 高、手机真实接线后置；休眠抑制是原生效果，首版是否提供未定。必须验侧栏→专页→手机流程链，不能仅以partial直达证明入口闭合 |
| U08 · 15类`settingsLeaf`及`settingsLeafView=overview/draft/result` | `pages/SettingsLeafWorkbench.tsx:105-175`：共用提示开关、textarea、结果字符计数、继续编辑/重置；顶部可直接进result，空草稿也可回放“结果”；无typed配置校验/持久化 | 按叶分责见下表，不能建设一个“保存任意设置文本”通用生产端口。`app.tsx:433-443`通过appearance锚点导航；入口锚不定义真实设置对象 | 中～高；result不等于配置保存或执行成功；刷新/换叶丢失由组件/路由重挂载决定，仍需动态验证，不能按文案承诺恢复 |
| U09 · `QDR.P17.scope.unexpanded`＋`entrySystemView=onboarding-intro/onboarding-preview/onboarding-login-prompt` | `pages/EntrySystemWorkbench.tsx:107-109,134-153`：查看预览/提示只切回放，无登录、建项或模型调用 | U：首版是否保留引导未定；如保留，以已批准功能说明及真实可用状态为依据，不新增特殊免鉴权业务通路 | 低～中；登录前demo与真实经营数据分开；跳过引导不能越过真实身份/创建门 |
| U10 · `QDR.O13.scope.unexpanded`＋登录/域名/架构提示诸`entrySystemView` | `pages/EntrySystemWorkbench.tsx:70,110-114,163-187`：域名只正则格式判定后切ready/error，架构不匹配为手动回放 | I：系统浏览器OIDC+PKCE、可信服务发现、组织成员/岗位政策；main受控认证；用户输入域名不成为可信认证地址或SSRF目标 | 高；格式通过不等于组织存在/可访问；取消/超时/回调重放/组织切换/撤权需验，不透出未授权组织存在性 |
| U11 · 同O13＋`feedback-draft/feedback-ready/about` | `pages/EntrySystemWorkbench.tsx:191-208`：反馈最多360字符，仅预览原文本，不发工单；关于不读取实际版本或机器信息 | U/I：D-080默认文字、主动选附已有截图/最小诊断，实际内容预览删减、分享核验与独立提交回执；版本来源由main提供，接收方/保留未定 | 中～高；不继承自动截图；选附件/生成诊断/发送分开，D-079不因反馈产生训练/改进例外，提交未知先查询不重复建单 |
| U12 · `QDR.O14.scope.unexpanded`＋`system-task-exit/system-unsaved-exit/system-update-running/system-cancelled` | `pages/EntrySystemWorkbench.tsx:212-236`：只提供查看其他提示、取消或返回；不保存、不停止、不退出、不更新 | R/main：D-013/014受影响任务清单、停止派发/收口/未知结果、取消真正退出；应用升级另定，不套用扩展更新合同 | 高；关闭窗口≠退出，取消提示≠任务恢复。强退/保存失败/更新中断另验，不因跳到cancelled即宣称已收口 |
| U13 · `QDR.O01.context.menu.open`、`QDR.O02.skills/files/plugins.menu.open` | `components/Controls.tsx:176-227`：过滤固定技能/文件/插件数组；选文件加去重chip，技能加标签，插件只提示，管理项跳目录；`submit():195-198`只发送text并清空选择，不提交这些chip | D/C/F：类型化引用和技能限制随意图传递；正式资料移除按D-094停止后续取用且重建上下文，删除独立；未发送chip移除仍是输入编辑 | 高；标签显示不等于已使用，消失不等于后端已移除；须验旧摘要/缓存不继续取用、移除与派发竞态、发送失败保留输入，建项前仍只整理提交文字 |
| U14 · `QDR.O02.goal.mode.active/plan.mode.active/sites.templates.open` | `components/Controls.tsx:181-205,237-273`：goal/plan互斥标签，产品模式只显示这两项且发送仅text；`ComposerContextExtras.tsx:18-48`仅分类/滚动，使用提示词和预览都只提示 | D-061：只出方案用交付范围与禁止动作表达，不增独立业务模式；模板如纳入须版本化插入可编辑草案，不自动建项/执行；真实发布后置 | 中～高；不能丢掉禁止执行约束，也不能从“站点”标签推导部署授权；模板来源/替换用户输入及取消另验 |
| U15 · 设置导航与通用弹窗（跨状态） | `pages/SettingsAppearancePage.tsx:29-45`：按标题过滤目录，当前项定位标题；`components/Controls.tsx:40-85`有顶部modal焦点/Escape/遮罩关闭处理 | U：路由、焦点与未保存输入保护；敏感表单的关闭需由表单owner决定，不能通用onClose直接丢secret/未提交命令 | 低～中；嵌套弹窗、IME、前进后退、跨页回焦点、保存中关闭与异步迟到回复另验；焦点源码存在不是a11y通过 |
| U16 · 原型目录/证据栏/重置（研究设施） | `components/ReviewShell.tsx:24-103`：过滤catalog、前后项、mode跳转、证据文件链接/CSV下载、通用设计回放；product模式隐藏目录，app仅持久化目录显隐 | 非Sage业务面：研究资产与产品路由分离；保留作开发验证候选，不直接迁移研究文档链接、fixture回放与重置到正式工作台 | 不计业务后端；点击本地证据链接可能加载/下载文件，不宜宣称整个原型绝无I/O。目录全部可打开不证明产品功能完成 |
| U17 · `mode=research/product/catalog`与同state不同呈现 | `content/presentation-profile.ts:70-219`仅research启用研究文案/技术导航；product及默认catalog用产品内容；`components/Controls.tsx:112-116`按profile选择不同输入组件 | U：正式导航与目标功能一一对账，原型研究模式可供取证但不是生产开关；Sage自身是否采用多模式未定，不继承研究工具栏 | 中；同一stateID不保证同一入口/按钮集合，catalog可直达也不代表默认产品导航可达；回归须包含实际mode与入口路径 |

### 通用设置叶必须拆开的责任

下表沿用U08同一壳，仅按已有决定映射目标；15个叶的三个回放view不是45项真实设置操作。

| 叶key | 目标归属与具体接线 | 范围及恢复边界 |
| --- | --- | --- |
| pet | U；桌面形象/显示偏好及可能的原生窗口 | 是否纳入首版未定，不自动启动宠物或旁路操作入口 |
| memory | 偏好记忆专有记录：候选、确认、范围、版本、查看/修改/遗忘（D-051） | 不是通用textarea自动保存；忘记须传播到派生缓存，不能声称抹掉已发生使用 |
| import | 类型化文件导入/校验与治理端口，不是旧DSH数据迁移 | 当前历史数据迁入仍阻断；仅保存“导入说明”不算解析，失败保留原资料 |
| hooks | A：受控事件/动作目录、规则版本/启停、去重与防循环（D-054） | 不允许任意Shell；撤销/事件重复与失败重试不能越权 |
| computer-control | 目标窗口/操作范围、设备权限、接管与停止合同（D-052） | 真实接线后置，不以安全说明开关授予截图/辅助功能 |
| mobile | I/Q：移动身份/准入、轻协作读写；复用U07及手机流程 | 真实接线后置，配对不授设备操控权 |
| git | 受控仓库操作、dirty预检、操作回执与恢复（D-053） | 后置；策略文本不执行命令，不自动提交/推送 |
| worktrees | 隔离目录/归属与生命周期，和Git能力联合设计（D-053） | 后置；资料工作区不是Git Worktree，禁止据回放结果删除目录 |
| workspace-index | F/Q：范围/排除、扫描/解析/索引任务及进度/撤销/删除 | 是否需要远端处理须另核D-073；排除改变要处理旧索引，不只影响下一次扫描 |
| connections | C/I：受治理连接类型、配置/认证/准入/可用分别管理 | 与MCP业务向导共用，不用一行自由文本或连接成功替代准入 |
| security | I：可解释策略读取与具名变更，主体/范围/版本/当前权限 | 不接受前端写入授权结论；来源政策禁令不能用户自批豁免 |
| archived-tasks | D/Q：受权归档查询、归档/恢复和独立删除（D-029/066） | 恢复只回活动列表，不恢复运行；无权/不存在防枚举 |
| experiments | U/C：受控试用功能及数据/副作用隔离 | 是否首版保留未定，实验开关不能解锁真实authority |
| network | main/C/I：经验证的网络配置与有界诊断；影响连接需失效重验 | 代理/证书/secret处理与可修改范围未定，不绕TLS或目的地政策 |
| playground | U：隔离演示与清晰fixture标识 | 是否首版保留未定，演示结果不能写正式事项或冒充真实运行 |

### 模型、MCP、扩展与Agent配置

本页族的现有Sage基础对应前文“兼容性、Registry与Adapter”共享工作包，不把market、installed或configuration三个页面各建一套准入。以下`variant`取自组件/目录，不等于URL参数名；只有显式标出的`configView`、`pluginEntryView`为原型参数。

| 编号/源状态或有效参数 | 源码位置与实际动作→后态 | 目标接线责任与新增合同 | 兼容差异/必须验证 |
| --- | --- | --- | --- |
| C01 · `SettingsModelsPage`的`variant=models/models.add.default/models.provider.open` | `pages/SettingsModelsPage.tsx:63-107`：添加打开默认表单，只有DeepSeek及两种Compatible实际改provider；取消/继续/放弃按provider导航，compatible弃稿用本地布尔值 | C/I：组织模型目录、个人配置政策、版本化候选和管理权限；表单开关纯UI，保存/验证独立具名操作 | 高；供应商名字不证明协议支持；弃稿后清除敏感草稿且不删除已保存配置，返回列表时聚焦添加入口 |
| C02 · 模型/API菜单与凭据字段 | `pages/SettingsModelsPage.tsx:121-142`：模型/全选/API类型只提示；Key、Endpoint、Model ID固定空值readOnly；显示Key/获取Key/添加ID只提示；提交与移除disabled | C/I/R：凭据、验证、准入、默认值与实际运行快照分开；D-076～078约束内地处理、禁止训练/改进及受限必要安全留存，候选与实际发送均核验 | 高；Responses点击不代表已选/验证；个人Key/地址/代理不绕过准入，地域、用途或留存条件未知/漂移即阻断，不自动换供应商 |
| C03 · `QDR.O08.mcp.form.stdio/http/sse`及动态行 | `pages/CustomMcpDialog.tsx:145-212`：表单与JSON为独立草稿不互转；transport改变布局并dirty；编辑命令/目录/地址/Header/env/参数只存内存；每类只演示一动态行 | C/I：业务向导与受限高级候选，共用严格typed校验、秘密字段、命令/路径/地址允许范围；具体transport须正式支持 | 高；JSON未解析、绝对路径文案未校验、一行限制只是fixture。不能将任意stdio文本直接拼Shell，也不能把HTTP/SSE菜单当Sage已支持 |
| C04 · `QDR.O08.mcp.json.default`与`.discard.open` | `pages/CustomMcpDialog.tsx:158-163,197-217`：添加/预览只提示，无预览产物；dirty取消进确认，继续恢复原页签，放弃关闭；改回原值仍dirty | C：编辑草稿/验证结果/保存候选/激活四层；I：秘密处理；R：连接建立、同代完整观察与失效另走受控链 | 高；取消未保存稿不是卸载MCP，表单/JSON冲突不能默默选一份；测试连接不调用业务工具、不能另开第二观察连接 |
| C05 · `QDR.P04.installed.*` | `pages/ExtensionPages.tsx:19-103`：类型切路由、数量恒0；搜索/刷新只提示；插件/技能添加菜单中的创建/上传不读文件；连接器添加转MCP；Agent无添加按钮 | C：受权安装事实查询、配置候选/上传解析及刷新；按exact版本关联Registry和本机安装回执 | 中～高；空态不能冒充真实零安装；已安装≠准入≠可用≠当前授权，安装事实过期需标明，刷新失败不清空真记录 |
| C06 · `QDR.P04.market.*`列表/筛选 | `pages/ExtensionPages.tsx:143-192`：仅特定技能搜索词/固定空词/空串切fixture；精选/最新有条件跳转；少数详情可进，安装/刷新/推荐/更多多为提示 | C/Q：真实分页搜索/排序、受权候选目录、准确版本与安装意图；目录来源不替代批准快照 | 高；非匹配输入仍显示旧列表不是实际命中；网络失败与无结果分开，查询变化时旧结果须防误用 |
| C07 · PPT/研究技能/GitHub详情 | `pages/MarketDetailPages.tsx:10-88`、`pages/ExtensionPages.tsx:197-234`：面包屑可回；安装及关联连接器只提示；示例代码复制/换行/展开也只提示 | C/U：Sage统一详情组件呈现版本/来源/依赖/权限与安全说明；安装前精确校验并返回独立回执 | 中～高；详情中的OAuth/HTTP、安装数、版本不证明实现或准入；说明代码不可自动执行，复制属于独立剪贴板动作 |
| C08 · Superpowers展开、Context7错误 | `pages/MarketDetailPages.tsx:107-160`：6↔14项展示切路由；目录链接只提示；错误页重试只计数+1且持续错误，无请求 | C/Q：依赖详情与稳定错误、安全重读、失效与重试分类 | 中；14项说明不证明14个已装能力；重试读取不能重复安装/激活，失败不能消掉已有安装事实 |
| C09 · `QDR.P05.scope.unexpanded`＋`pluginEntryView=plugin-directory/plugin-page/plugin-document/plugin-unavailable` | `pages/SettingsExtensionWorkbench.tsx:64-140`：过滤3条本地贡献；文档转文本页、其他共用检查页；恢复只切view。选协作摘要也进同一检查页，空搜索仍可能保留旧详情 | U/C：版本化贡献声明→严格解析→Sage自有页面/数据投影，具体动作绑定受权端口 | 高；不能加载插件任意网页/脚本；对象切换必须身份一致，未知类型/被撤销/空列表不得操作残留selected对象 |
| C10 · `pluginEntryView=plugin-settings` | `pages/SettingsExtensionWorkbench.tsx:123-128`：开关仅本页state；说明非空即“预览已生成”，没有配置产物；放弃清空后仍显示表单未通过式结果 | C/U：显示偏好与插件配置/启用分开，typed校验、配置版本冲突、保存和激活反馈 | 中～高；文本非空不代表配置有效，关闭入口不代表插件停止；保存失败/旧版本/撤销应真实回读 |
| C11 · `QDR.O09.scope.unexpanded`＋`pluginEntryView=extension-install/extension-cancelled` | `pages/SettingsExtensionWorkbench.tsx:143-156`：确认仍未安装只提示；取消转页、重开转确认，无下载/实际取消 | C/I/main：深链仅候选定位，获准准确版本和安装权核验、本机物化与回执、普通更新安全切换（D-049/050） | 高；取消不能声称撤销已完成安装；确认后版本/依赖/批准变化需拒绝，卸载与更新完整UI仍缺 |
| C12 · `QDR.P10.scope.unexpanded`＋`configView=agent-list/agent-create/agent-selected/squad-list/squad-create/squad-selected` | `pages/AgentRuntimeWorkbench.tsx:128-225`：创建只改selectedMember，不增列表；Squad成员数组可改，卡片选择共用固定结果；“放弃”只导航不清字段 | C：角色/方法/预设候选及生命周期（尚待定）；D/R：事项委派、范围、子执行身份/预算、来源与结果采纳 | 高；创建配置不自动开始协作或授予角色权限；当前被选对象与展示必须一致，跨任务不能携带旧成员范围，取消的草稿保留语义需明确 |
| C13 · `QDR.P11.scope.unexpanded`/`QDR.O06.scope.unexpanded`＋`configView=runtime-profiles/runtime-create/runtime-connecting/runtime-unavailable/handoff-connection/handoff-unavailable` | `pages/AgentRuntimeWorkbench.tsx:181-186,228-249`：检测仅转connecting，手动模拟到unavailable，重试回原状态；候选类型按钮无handler，无轮询/连接/自动结果 | R/C/main：D-091事项默认环境引用与变更、实际环境回读、运行及派发前fresh核验；本地装配/inventory/preflight与D-071设备交接分别治理 | 高；runtime read/retry不是创建环境能力，默认值不是授权；配置变化或不可用不静默换环境，重试不重放业务，远端执行后置 |

### 执行、自动化、工具与恢复页面

下列`view`通过`app.tsx`的对应参数解析并按源组限定；组件内的paused、selected、stage等不是新增URL参数。所有“模拟”“本地”结果均不能作为真实执行证据。

| 编号/源状态或有效参数 | 源码位置与实际动作→后态 | 目标接线责任与新增合同 | 兼容差异/必须验证 |
| --- | --- | --- | --- |
| R01 · P03基础列表/新建；`automationView=mine/templates/runs` | `pages/ProductPages.tsx:143-181`：research模式过滤/排序内存items，模板预填名称/文字/时间，创建把config传给父组件加列表；product模式只空态+边界提示。补充上下文input不进入config | A/I/R：模板版本、准确周期/时区、有效期、资料/动作/预算范围，启用批准与每次fresh核验；派生实例关联正式事项 | 高；默认`authorize=true`不授权，`merge=true`的跨期合并不能沿用D-026周期交付规则。补充上下文不能显示已采纳却未提交；夏令时、到期、同周期重复/新周期要分别验 |
| R02 · `QDR.P03.list.empty`＋`automationLifecycleView=schedule-edit/pause-confirm/pause-active` | `pages/AutomationLifecycleWorkbench.tsx:49-76,121-123`：保存只跳run-history；暂停/恢复改localStatus；没有模板修订或调度器 | A：模板编辑/生效、暂停/恢复的版本化命令与回执；R：在途运行影响按合同处理；漏跑按D-027汇总确认 | 高；暂停未来触发与取消当前执行分开，恢复不能自动补跑，旧模板在途实例不静默变更；具体暂停语义仍待决定 |
| R03 · 同锚＋`automationLifecycleView=run-history/run-failed/run-detail` | `pages/AutomationLifecycleWorkbench.tsx:124-126`：固定两条记录，失败按钮改status后看详情，详情按当前草稿名和全局status显示，展开固定步骤 | A/Q/R：周期实例、实际operation/attempt/结果、按版本的受权历史读取；失败原因及可用恢复动作来自真实owner | 高；修改模板名不能改历史依据，失败记录不能由页面状态反推；漏跑/排队/已派发未知/真正失败分别处理，不能统一重试 |
| R04 · 同锚＋`automationLifecycleView=delete-confirm/deleted` | `pages/AutomationLifecycleWorkbench.tsx:127-128`：确认只设deleted，重开设ready回编辑，没有删除/重建计划 | A/I：删除或停用模板的权限、依赖/在途影响、保留与回执，历史实例独立保留规则待定 | 高；不能因模板删除抹事项回执、取消未知外部效果；“恢复”是恢复模板还是新版本重建需决定，不能按fixture直接承诺 |
| R05 · `QDR.S05.scope.unexpanded`＋`executionView=queue-pending/queue-retrying/queue-ready/queue-cancelled` | `pages/ExecutionLifecycleWorkbench.tsx:131-135`：队列位置固定，开始重试/手动就绪/取消/恢复只切view，无轮询或请求 | R/C：真实等待/限流/资源槽投影、operation身份、可取消阶段与供应商响应；替代模型沿D-018确认 | 高；未知队列位置不可虚构“第2位”，取消请求不等于外部取消；排队时通过检查不能代替派发前核验 |
| R06 · `QDR.S06.scope.unexpanded`＋`executionView=steps-running/steps-blocked/steps-resumed/steps-cancelled` | `pages/ExecutionLifecycleWorkbench.tsx:146-155`：模拟阻塞/补充/继续/取消切view；StepList按view把前项画成done，无执行事件 | D/R：动作必要证据/依赖就绪、资源冲突、受控并行、分步回执、限制优先与受影响范围恢复 | 高；补充说明≠批准≠就绪，“取消”页标题为暂停不能混成一个正式状态；未受影响动作能否继续由依赖/授权判断 |
| R07 · `QDR.S07.scope.unexpanded`＋`executionView=follow-up-composer/follow-up-queued/follow-up-delivered/follow-up-cancelled` | `pages/ExecutionLifecycleWorkbench.tsx:158-163`：非空文字可进队列，撤回只回输入，送达靠手动按钮且结果不展示所送文本；无消息写入 | D/R：请求身份、文字/更正来源、接收/待应用/生效、安全切换、版本绑定和限制优先 | 高；已送达不得等同生效；撤回与实际应用并发需有确定回执，过时要求不得覆盖新限制；排序/合并细则待定 |
| R08 · S01/S02组占位＋`sessionInteractionView=reply-composing/reply-streaming/clarification-choices/clarification-custom/clarification-submitted` | `pages/SessionInteractionWorkbench.tsx:63-67`：按钮手动切回复，非真实流；自定义回答非空时始终优先于choice，返回选项再提交也可能显示旧custom | D/R：消息/澄清问题身份、当前revision、准确提交答案、流式顺序与最终消息状态 | 高；选择答案和实际发送必须一致，旧custom不截走新选项；澄清不生成批准，断流不得提前显示完成 |
| R09 · S08组占位＋`sessionInteractionView=stop-confirm/reply-stopped/reply-follow-up` | `pages/SessionInteractionWorkbench.tsx:68-70`：确认停止和继续输入均切页面；后续输入按钮直接进reply-actions，无新执行/空值校验 | R/D：停止请求/确认停止/未知结果分层，继续为获准新操作/attempt并保留旧历史 | 高；是否需要停前确认不能从此fixture强加。用户收紧限制及时生效于后续相关派发，既有外部操作不可假称撤回 |
| R10 · S09/S10组占位＋`sessionInteractionView=background-running/context-budget` | `pages/SessionInteractionWorkbench.tsx:71-72`：暂停把进度从68%改42%，上下文12.4k/32k固定，展开只是文本 | R：后台主体与窗口生命周期分离；上下文构建/实际容量、摘要版本与正式约束重装（D-058），用量归集 | 高；暂停不能回退已完成事实，token估计与供应商用量/账单不同；容量不足不能静默丢约束/换模型 |
| R11 · M01/M02组占位＋`sessionInteractionView=reply-actions/reply-feedback/file-writing/edit-expanded` | `pages/SessionInteractionWorkbench.tsx:73-76`：复制/引用仅提示，反馈只state；写入完成仅进度100%，编辑为固定文本而非真实Diff | U/D/F/R：复制/引用与受权来源，反馈独立处理；文件修改稿、实际回写/产物版本和安全日志投影 | 中～高；不把进度100%当文件存在，不把复制/反馈当业务验收，引用须绑定消息/版本而非只复制片段 |
| R12 · `QDR.P16.scope.unexpanded`＋`taskMonitorView=fixed/floating/detail/stopped/recovered` | `pages/TaskMonitorWorkbench.tsx:49-88,145-160`：选择四个固定条目，停止设stoppedId、恢复清空；返回列表仍读固定MONITOR_ITEMS而非停止后状态，浮动仅页面布局 | U/R/Q：布局偏好与运行分开；真实子执行/进程投影、状态订阅、具名取消/核对操作、身份/权限 | 高；详情“已停”而列表仍“运行中”揭示不可共用局部状态。生产需一致对象/版本与事件传播，折叠/关面板不取消运行 |
| R13 · S11/S12/S13组占位＋`sessionRecoveryView`八态 | `pages/SessionResilienceWorkbench.tsx:30-38,87-127`：上下文/配额/模型/许可/网络只展开恢复建议；预览/工具详情只设recovered，不检测或重试 | R/I/F/Q：安全错误分类、影响范围、读重试/业务核对各自端口；权限失效与不存在维持防枚举 | 高；许可证产品未定，不能从页面新增付费门；本机离线不读受保护缓存，恢复占位不能伪装依赖恢复 |
| R14 · M03/M04/M05组占位＋`toolResultView`八态 | `pages/ToolResultWorkbench.tsx:60-124`：展开固定输出，图像选择仅标签；任一ResultRows行都改同一个expanded，只第一行展开；不可用→recovered只显示恢复说明 | U/C/F/R：typed结果、来源operation、字段脱敏/分页/资源权限，Sage组件渲染、局部安全重读 | 中～高；Thinking仅公开阶段摘要，不是私有推理；点击第N条应加载其真实身份，Web/Bash文字不形成网络/命令入口，Widget不运行插件脚本 |
| R15 · `QDR.P14.terminal.entry/sidepanel.entry` | `pages/SessionWorkspaceEntryWorkbench.tsx:18-45`：两主tab及活动/文件/预览仅state，关闭回首页；终端是固定文本无输入 | U/R/F：只读诊断与产物/来源视图，增量日志游标、截断/缺失标记、独立读取授权；D-033不建设PTY | 中～高；无业务权限的日志查询应拒绝，断线续读不重复/漏标事件；打开终端不运行命令，关页不停止任务 |
| R16 · O01/O02/O03/O05/O07组占位＋`composerWorkbenchView=suggestions/context/input/permission/git` | `pages/ComposerDesignWorkbench.tsx:88-159,171-196`：固定建议过滤、单chip、尺寸/规格/语音state；目录/子目录确认只local-result；Git只名称正则和静态分支→确认→结果 | U：尺寸；D/C/F：真实引用与范围约束；I/main：资源授权；语音D-041；Git按D-053后置 | 高（尺寸低）；添加“权限”标签不授权，目录范围不推导递归无限读，所谓语音恢复无设备证据；分支名通过不等于Git有效/可写，发布不自动执行 |
| R17 · `QDR.OBS01.usage.open` / `usageView`刷新细态 | `pages/ProductPages.tsx:184-188`：刷新仅布尔state，292/300、8 Credits及资源包仍固定；明细/Rewards转候选入口 | R/Q：事项/组织/个人计费口径、预留/消耗/账单分开、延迟与新鲜度、重试/委派去重 | 高；刷新失败不把未知显示0，暂停不承诺账单绝对封顶；Rewards/套餐并非已定Sage范围 |

### 查询、项目协作、知识与产物页面

| 编号/源状态或有效参数 | 源码位置与实际动作→后态 | 目标接线责任与新增合同 | 兼容差异/必须验证 |
| --- | --- | --- | --- |
| F01 · 搜索弹窗、P01/P02组占位＋`taskWorkspaceView=tasks/search` | `pages/ProductPages.tsx:112-116`过滤3条固定任务，Enter打开首条；`pages/TaskSearchWorkspaceWorkbench.tsx:50-55,98-99,117-123`过滤固定数组、选中返回列表 | Q：统一受权搜索/列表、对象分类、分页、索引新鲜度、准确定位、删除/撤权传播（D-028） | 高；本地过滤不等于权限过滤，计数/摘要也不可泄漏；重命名后展示用localTitle而搜索仍匹配旧title，生产需同源/明确索引延迟 |
| F02 · `QDR.O04.scope.unexpanded`＋`taskWorkspaceView=actions` | `pages/TaskSearchWorkspaceWorkbench.tsx:80-101,135-139`：bulk只记录IDs，操作面不接收bulk；重命名写单个localTitle且只渲染到prototype；归档一个全局布尔，加入分组只切grouped未设true | D/Q：明确批量目标、逐项权限/版本与结果；服务裁决重命名/归档/恢复，归档不改变执行结论 | 高；**不可沿用批量选择后只操作当前单项**。需验选中A却更新B、部分拒绝、重复提交、归档条件与搜索失效；重命名/分组细则未定 |
| F03 · P13创建与`taskWorkspaceView=workspace` | `pages/ProductPages.tsx:119-123`虚构目录+名称颜色；`pages/TaskSearchWorkspaceWorkbench.tsx:127-131`保存仅布尔，远端非空即“格式检查完成”，归档恢复按钮无handler | F/I：多工作区与环境核验；新版确认、获准快照、移除停取用/删除独立；D-095仅移除时既有成果按用途分别核验，影响证据与传播待定 | 高；快照与所用内容一致，不上传、不借副本/摘要绕过移除；人工可见不等于模型可继续使用，历史验收不自动作废 |
| F04 · P07组占位＋`collaborationSection=projects`、`collaborationView=list/detail/project-draft/feedback` | `pages/CollaborationCollectionWorkbench.tsx:123-193,219,251-258`：固定项目搜索/筛选，创建仅反馈文字不添列表，空名也可“保留草稿” | D/Q/I：D-089事项可独立或最多归属一个项目，受权关联/解除/变更、唯一性与并发校验，聚合读取不复制事项 | 高；项目不提供事项访问权；变更归属不改变责任/执行，历史汇总不能静默重写；创建须回读真实对象而非toast |
| F05 · issues及`QDR.O12.scope.unexpanded`＋`collaborationView=issue-run` | `pages/CollaborationCollectionWorkbench.tsx:187-220,273-278`：查看静态执行记录，可回详情/关列表，无实际执行或重发 | D/R/Q：D-060事项内行动项，关联责任/依赖/执行/结果；项目只聚合；具名历史读取 | 高；**O12当前实现主要是IssueRun记录，不是消息更正编辑器**；D-057更正仍属新增交互，不能拿该页认定已覆盖；行动完成不等于交付验收 |
| F06 · P08/P09组占位＋`discussions/my-work` | `pages/CollaborationCollectionWorkbench.tsx:187-224,262-283`：讨论radio只反馈，固定列表状态未更新；“记录处置”只消息，无发送/通知/审批 | D/I：D-088仅同一事项所属组织有效成员，邀请/分派及历史范围分别核权；Q：待办从正式请求派生，点击按原动作重新核验 | 高；成员资格不等于事项访问权；切换组织/撤权后旧选择失效，“已解决讨论”不代表事项完成，收件箱不能通用改状态 |
| F07 · `QDR.P15.scope.unexpanded`＋`workspaceView=overview/create/confirm-close/closed` | `pages/WorkspaceMultipaneWorkbench.tsx:29-103`：创建用Date.now添标题卡，选择显示摘要，关闭从数组移除并只留最后一项可恢复；没有消息/上下文/分享。宽度按钮/range真改CSS变量 | U：布局；D/I：侧聊独立可见记录、最小上下文、跨范围分享与主线采纳（D-039/068/069）；关闭语义未定 | 高；标题卡不等于独立对话，关闭不自动删除/停模型；恢复不得扩大成员/恢复已撤销权限，同毫秒ID不能作正式身份 |
| F08 · `QDR.OBS02.knowledge.*`创建/筛选 | `pages/KnowledgePages.tsx:73-145,216-247`：名称/用户或工作区范围仅内存；非空可创建但仅提示“未写服务”，列表永为空；视图/工作区筛选改变state不查询 | K/F/I/Q：知识容器/资料/候选分别建合同、受权查询、来源/版本/范围、纳入与复用决定（D-023/024） | 高；用户范围“所有未来工作区可用”不能自动继承，关联工作区不提供资料权限；创建容器≠知识有效或发布 |
| F09 · `QDR.OBS02.repo-wiki.*`与知识卡 | `pages/KnowledgePages.tsx:55-68,188-225`：少数查询/筛选组合切固定empty，项目名进配置；去生成/生成/自动导出/引用只提示，自动更新disabled；知识卡宽阅只布局 | K/F/R：有范围的资料解析/候选整理、来源版本、适用性及更新/退役；如调用模型需数据/预算；实际自动引用须重新核验 | 高；Git增量属于后置能力，不能由Wiki功能偷带；“自动作为智能体上下文”不是默认跨事项授权，生成不证明已验证知识 |
| F10 · `QDR.OBS03.sites.empty/shared.empty/loading` | `pages/KnowledgePages.tsx:260-277`：我的/共享导航、卡片/列表局部切换；loading计时1.4秒后本地空态，刷新只提示；添加转输入区模板 | F/Q：网页型交付的受权聚合、准确版本、同步/安全离线预览和导出；真实发布D-037后置 | 中～高；空态不是服务结果，托管交付不等于网站上线；共享结果必须沿原权限，模板直达在product mode也不保证出现模板 |
| F11 · P04/P06/O08组占位＋`remainingScopeView=market-directory/market-installed/settings-overview/settings-search/mcp-transport/mcp-json/mcp-unsaved` | `pages/RemainingScopeWorkbench.tsx:33-61`：本地过滤、选择、标签及JSON；“已安装”固定显示视觉审阅，与选项无关；放弃JSON只navigate，navigate不清json | 复用C03～C06/U08/U15，不新增第二配置/市场服务；若保留此入口须归到同一对象与状态源 | 高；**放弃未真正清稿、选A显示B、页面ready替代安装**不能迁入；确认关闭与真正保存对象独立，回放文案不等于handler效果 |
| F12 · A01/A02组占位＋`remainingScopeView=diff-summary/diff-review/html-preview/html-unavailable` | `pages/RemainingScopeWorkbench.tsx:62-65`：固定差异，接受/退回都设同一个ready；HTML只是静态div，示例按钮无handler；恢复设ready但未实际重载内容 | F/D：修改稿/源版本差异、受控回写；验收意见需独立verdict和版本；HTML预览由main非特权容器（D-034） | 高；接受与退回不可同一结果，审阅不回写、不Git提交；预览恢复必须证明同版本资源可用，不据绿色标签判成功 |
| F13 · P12/P14/O10/O11与A03～A06组占位 | `pages/ArtifactWorkspaceWorkbench.tsx:20-80`：窗口是内页替身、panel切换、range缩放、CSS全屏；图链接/版本失败手动切状态；表/文档/文本/图片固定内容，语音仅playing布尔 | F/U/main：指定版本/资源闭包、安全图片/文档解码与离线WebContentsView、窗口回收/崩溃、独立导出；日志D-033；语音摘要范围未定 | 高；批注只是说明没有编辑/保存；部分“摘要/定位”按钮无handler；不能把布局全屏、playing或重试占位当OS能力/文件存在/真实播放 |
| F14 · `mode=product&mobileFlow=start/progress/approval/instruction/review/offline/expired/unavailable` | `pages/MobileCollaborationPrototype.tsx:30-68,81-126`：发起/追加只notice并跳progress，固定events不增加；批准/验收各一个布尔式决定无对象版本；离线恢复直接回progress | 手机D-035后置；公共合同复用正式建项/受权进度/审批/补充/分项验收，独立移动身份与在线权限，不复用桌面IPC或token | 高；手机自身离线≠执行电脑离线；D-063允许其他在线成员评审，不能统一“等桌面连接”。本地队列不代表已提交，重连必须重验，审批过期不以路由刷新复活 |

### 本批优先阻止的迁移误读

这些是从原型迁入Sage时必须改变或补证的行为，不是要求修复原型；原型保留观察快照和设计回放有其目的。

| 误读 | 直接证据 | 接线要求 |
| --- | --- | --- |
| 输入区已选资料/技能，所以后端已按选择执行 | U13/U14：发送只传text，chip和mode随后清空 | 必须定义随意图传递的受控引用/限制、后端重新核验与实际使用回读；UI标签不能充当执行证据 |
| 设置副标题写“立即保存”，所以已有持久化 | U01/U03/U05/U08：state或notice，部分开关连值都不变 | 区分草稿、保存请求、已保存版本、实际生效和失败；偏好/业务规则/秘密配置不能共用无类型写口 |
| 候选、详情或“连接中”说明能力可用 | C02/C05/C07/C13：固定选值、fixture清单、手动状态切换 | 目录、安装事实、Registry、兼容、动作授权、availability分别从真实owner取值；缺项blocked |
| 任何“重新尝试”都可接同一个retry命令 | C08/C13、首闭环第8步：原型只是切view或计数 | 读取重试、安装/激活、连接恢复、业务重试、未知结果核对使用各自具名合同；不得靠统一retry重放外部操作 |
| 研究默认行为就是Sage产品规则 | U03/U05/U14/U17：空答跳过/低价模型/语音自动发送/互斥模式/研究profile | 按D-012/018/030/041/061等适配；D-079已否决首版Sage通用训练/产品改进的业务内容共享；屏幕采集和套餐不能从旧页继承 |
| 一个源state即可唯一描述页面 | U17与15个设置叶：mode、有效参数、组件内state共同决定按钮 | 覆盖单位保留mode+源ID+有效细态+动作；禁止把所有任意参数组合都计成有效状态 |

### 兼容性结论与成本拆分口径

“可复用”主要指布局、控件结构和部分焦点处理，不表示原事件处理可以接上fetch就交付。迁移状态与原产品observed/entry-observed/static-only来源等级是两个维度。

| 维度 | 当前证据 | 接线结论 | 主要成本归属 |
| --- | --- | --- | --- |
| 导航/菜单/布局 | 原型React组件和局部state；Sage自有字符串renderer | 结构可参考，框架/构建与设计token仍待定，不能作为仓外运行依赖整体引入 | 前端及桌面视口/键盘验证；不能按每页重复计算基础组件成本 |
| 表单与意图 | 多数保存/安装只notice，部分input只读；输入chip不进入onSend | UI意图模型及提交/回读需重写，不能从现有表单字段推定API已定 | 前端状态机＋Application Service命令合同；真实provider/审批为外部前置 |
| 业务对象 | 工作区、对话、执行回放与正式事项并不等价 | 创建确认、交付项、验收与整体完成需目标对象合同；“空态换真数据”不足 | 领域/存储/演进＋前端对象定位；历史语义与版本验证独立计 |
| 认证/权限 | UI身份标签、域名正则、开关都是本地演示；Sage有resolver和治理 | 真实认证、组织grant、读权限与每次动作授权分开，不使用前端显示值作authority | 服务身份政策＋main调用方绑定＋拒绝/撤权/防枚举验证 |
| 内容与原生能力 | 原型可展示窗口/终端/设备/麦克风入口，但不证明系统能力 | 浏览器原型不能直接证明Electron窗口、麦克风、通知、剪贴板或文件访问安全 | main窄port/OS权限/格式解析＋异步失败和平台验证 |
| 生命周期 | 手动切ready/resolved、计时回放、局部draft与列表各自变化 | 新增durable操作身份、版本、服务/设备回执、取消/未知结果；禁止按动画结束驱动领域完成 | 后端编排与持久化＋前端订阅/恢复＋重复/断线/崩溃测试 |
| 跨设备/数据 | 原型内存及目录偏好不等于共享记录；托管为已定目标 | 服务裁决/设备执行、选择性同步、资料目的地、版本完整性需真正建立 | 托管服务/内容层＋设备同步端口＋两身份两设备集成验收 |
| 原型特有行为 | catalog/research模式、静态取证默认值、重置、固定搜索词 | 隔离为研究验证资产；默认产品mode中隐藏不等于被取消产品需求 | 映射与取证成本，不计成要上线的业务功能；不带入研究凭据/路径 |

相对难度“高”不等于同样工期：纯显示项首先估前端/偏好；原生项另估main/OS；正式命令另估服务、存储与外部接口；各自再列负向验证。provider、具体数据合同和运行环境未定前，不以页面数乘固定人天给出伪精确总工期。

### 本次复用基础的准确边界

| Sage源码/合同 | 本次页面消费者 | 能复用什么 | 不能由此推导什么 |
| --- | --- | --- | --- |
| [renderer.ts:17](../../apps/sage-shell/src/product/renderer.ts#L17) / [window.ts:78](../../apps/sage-shell/src/main/window.ts#L78) | U01/U02/U15/U17、各页导航和原生窗口 | 自有文档renderer、样式基线、安全窗口工厂及帧禁用 | 没有据此证明偏好持久化、全局主题同步、原型React栈或安全预览已实现 |
| [identity-policy.ts:581](../../apps/sage-shell/src/security/identity-policy.ts#L581) | U06/U10、C01～C13及所有受保护页面 | 接收注入clock/identity/policy ports，严格解析并拒绝缺失/失效证据的resolver | 不是OIDC登录页面或真实组织目录，也不是配置保存、账户套餐或资料分享服务 |
| [capability-registry.ts:756](../../apps/sage-shell/src/security/capability-registry.ts#L756) | C05～C13、插件/模型选择和执行就绪 | 候选快照及状态转换校验，批准所需descriptor/mapping/approval条件 | 不是安装器、发布来源证明、生产批准者身份或真实operation mapping；不把可构造字段当已验证来源 |
| [external-capability-availability.ts:485](../../apps/sage-shell/src/security/external-capability-availability.ts#L485) | C13、运行/连接错误与重试面板 | 可用性轴及结构/摘要核验，`actionability`保持blocked | 不是当前连接的健康观测、真实preflight或执行许可，不能把页面从connecting切ready来补齐 |
| [ADR-0174](../adr/ADR-0174.md)与[ADR-0005](adr/0005-all-formal-matters-hosted.md) | 所有正式读写，侧聊/知识/自动化等需各自扩展对象合同 | 唯一产品入口、读/写分权、新鲜求值、幂等、回执/未知结果原则；正式事项托管为前向目标 | 現行main合同没有自行迁移到云端；草案、知识、配置与调度不能伪造matterId套旧业务命令 |

## 当前Sage接线基线更新

本节于功能接线复核时核到HEAD `8b322f9`，收尾时已前进至`4ce1b6d`（2026-10-01；Sage工作区无未提交差异，main相对本地origin/main ahead 9，未fetch）。新增提交只包含OIDC ADR/Note及索引，所核product/main/appservice/host源码相对`8b322f9`无差异；不归属该外部提交，也不声称共享仓被冻结。它替代旧基线中retry固定503、尚无登录入口等描述，不把D-064/066托管服务目标写成已实施；以下为源码调用证据，不是本次运行验收。

| 端口/组件 | 当前源码行为 | 对功能接线的含义 |
| --- | --- | --- |
| 产品文档与请求入口 | [main/index.ts:80-116](../../apps/sage-shell/src/main/index.ts#L80)默认在main截获`/.sage/*`，其他允许路径交`host.fetch`；Host提供自有renderer文档 | 保留现有产品壳和入口，新增会话功能应装配产品port，不搬回基座旧UI |
| 当前公开route | [route-skeleton.ts:20-54](../../apps/sage-shell/src/appservice/route-skeleton.ts#L20)识别GET state、POST actions、GET login、POST logout；[75-81](../../apps/sage-shell/src/appservice/route-skeleton.ts#L75)的actions只解析retry | 创建草案/事项、发送消息、读取对话、停止执行及产物打开都还没有对应产品route；不能把V2类型已存在当成路由已接 |
| service装配 | [composition.ts:10-45](../../apps/sage-shell/src/appservice/composition.ts#L10)的业务ports仍返回undefined，retry进入command pipeline后返回typed denial；state返回service unavailable、runtime和auth，非旧固定503响应 | 核心缺口是装配真实功能ports及运行协调，不是让前端重复调用当前retry |
| 登录/退出 | [main/index.ts:74-109](../../apps/sage-shell/src/main/index.ts#L74)装配内存vault与生产登录adapter；[renderer.ts:311-325](../../apps/sage-shell/src/product/renderer.ts#L311)已有登录/退出调用 | 旧“尚无登录页面/适配器”说法不再适用于该基线；本轮不核验真实登录，不展开权限治理，也不将登录装配等同会话功能装配 |
| 输入及状态消费 | [renderer.ts:253-329](../../apps/sage-shell/src/product/renderer.ts#L253)只在初载/按钮后读取runtime/auth，接导航、retry、login/logout；工作台仍默认fixture | 需要真实Composer、产品会话状态与事件消费；当前没有会话消息流或历史重载入口 |
| main↔Host | [host/index.ts:69-75](../../apps/sage-shell/src/host/index.ts#L69)拒绝`/api*`、`/.dsh/*`等旧入口；`host.fetch`走[host-process.ts:195-235](../../apps/sage-shell/src/main/host-process.ts#L195)分帧管道，已有分块响应 | 不能把基座`/api/session/*`地址直接填进UI；可复用进程/字节传输基础，但会话命令、观察事件及取消需要显式窄桥接 |
| 本地事件存储 | [business-matter-event-store.ts:2450](../../apps/sage-shell/src/persistence/business-matter-event-store.ts#L2450)有真实store实现，composition的rehydrate/persist ports尚未装配 | 有领域存储不等于有会话历史或跨端产品记录；正式事项托管、对话/运行关联及内容同步仍须补建 |

当次源码检索限定于Sage `src`中的product/main/appservice/host/adapter/domain/persistence；未找到调用基座`createSession/createUserMessage`或消息订阅的产品链。此负向结论不适用于pin基座自身；基座能力与Sage接通状态必须分别列证。旧[ADR-0179](../adr/ADR-0179.md)及前面首闭环表中的旧行号/状态保留为历史阶段证据，不能据此声称当前运行已通过。

## 逐源状态接线台账

[source-state-wiring.csv](source-state-wiring.csv)按catalog原顺序逐条记录206个源ID，不增加或重命名源ID。它是静态分类台账，不是API清单、正式状态schema或运行验收记录；与本页的动作分析编号共同阅读。

字段含义：`source_state_id`为源目录ID；`route_case`为下面的实际渲染分支代号；`initial_variant`为干净URL首次进入时的组件判别值（可能是variant、view、kind或初始面板，而非统一URL参数）；`parameter_contract`引用有效细态说明；`analysis_refs`引用本页U/C/R/F/N动作类；`open_gap`标明仍未闭合的主要差距。一个分析编号可被多个源状态引用，共享后端不重复记账。

### 台账差距码的读法

| open_gap | 当前含义与后续收口要求 |
| --- | --- |
| profile-and-effects | 各mode展示不同，按钮结果多为本地回放；须按实际产品mode核对入口和后端效果 |
| query-and-authorization | 查询来自静态数组或有限快照，缺真实受权检索、分页和失效投影 |
| resource-not-matter | 现有工作区表单不是事项创建；只借交互结构，不沿用对象语义 |
| draft-and-create | 缺草案存储/整理、创建确认包、正式建项及结果回读 |
| billing-not-observed | 数字/刷新是fixture，无真实用量和账单证据，不用0或固定值代替未知 |
| entry-not-leaf-evidence | 当前有承接组件，但来源仍仅入口；未证明原产品细态或Sage接线 |
| scope-undecided | 首版产品范围尚未决定；不因回放存在就实施，也不永久删除候选 |
| typed-lifecycle-missing | 只有显示/内存编辑，缺类型化对象、持久化、权限与生命周期 |
| legacy-import-blocked | 旧资料导入仍须独立授权及治理，不能由import叶默认开启 |
| deferred-real-integration | 用户已决定真实接线后置，保留设计覆盖，不计作首版已实现能力 |
| entry-differs-from-partial | mobile.entry走通用leaf，mobile.partial才是专页；需核实际入口串联 |
| fixture-not-business | 组件存在且有本地回放，但无相应真实业务对象/命令/回执 |
| correction-ui-missing | O12实际实现为IssueRun记录，已发送要求更正仍需新增工作面 |
| parameter-required | 干净state直达落GENERIC，只有合法同源参数才进专用回放，不能算无参数可达 |
| profile-controls-absent | 初始目标菜单/标签仅research消费；product/catalog缺该控件或忽略初始选择 |
| preference-not-applied | 选值只state/提示，不证明全局生效、同步、重启恢复或系统设置改变 |
| identity-not-connected | 用户资料/登录状态只是示例，不存在真实认证或岗位授权依据 |
| deferred-publishing | 网页交付管理可设计接线，真实托管发布按D-037后置；“添加站点”不发布 |
| install-not-connected | 详情/安装按钮未接安装器、批准快照、exact版本和运行回执 |
| configuration-not-connected | 表单/菜单不等于保存、验证或激活，秘密/准入/生效合同尚缺 |
| voice-not-connected | 没有真实设备枚举/录音/转写，首版仅D-041已定文字确认发送范围 |

差距码可共用，但不是错误分类接口或完成等级；更细的未决项、主责/共享依赖、难度与恢复验证在`analysis_refs`所指行。全部记录当前都没有Sage真实业务接线通过结论。

### 实际渲染分支字典

只描述合法`state`、没有无关残留设计参数的直接进入。`mode=research`是研究内容；`mode=product`及默认catalog使用产品内容，catalog另外显示目录。具体sourceKind保留源catalog，不把entry或static来源升级。共同路由证据为原型`src/app.tsx:67-250,785-822`；搜索须区分当前state与作为背景的scene。

| route_case | 实际组件/源码证据（原型src） | mode与直接进入的差异 |
| --- | --- | --- |
| AUTO | `pages/ProductPages.tsx:136-165` AutomationPage | research有列表/模板/运行入口；product/catalog仅例行协作空态及说明。P03组占位可进此页，但不是完整生命周期 |
| AUTO-FORM | `pages/ProductPages.tsx:168-181` AutomationDialog，叠加AutomationPage | QB1-02使对话框在所有mode出现；不能从product列表没有创建按钮反推直达无表单 |
| SEARCH | `pages/ProductPages.tsx:112-116` SearchDialog | 直接进入背景为首页；从其他页面打开保留原scene。查询是组件内state，不在URL |
| WORKSPACE-FORM | `pages/ProductPages.tsx:119-123` WorkspaceDialog，叠加HomePage | QB1-04/05触发表单；不是经营事项创建。product/catalog首页内容不同，表单仍可直达 |
| HOME | `pages/ProductPages.tsx:65-109` HomePage及`components/Controls.tsx:112-275` Composer | `initial_variant`表示初始上下文面板/标签；只有research输入组件消费该值，product/catalog忽略这些初始选择 |
| SESSION | `pages/SessionPage.tsx:13-117` SessionPage | research按QB1 observation显示19个已观察会话变体；product/catalog均为固定协作说明，不按这些observation展示相应细态 |
| USAGE | `pages/ProductPages.tsx:184-188` UsageDialog，首页背景 | QB1-16在各mode显示弹窗，但金额均fixture；菜单是否有入口另按mode核对 |
| SET-PROFILE | `pages/SettingsProfilePage.tsx:12-43` | entry或default均落同一专页；entry仍仅入口来源，非原产品叶态取证 |
| SET-BASIC | `pages/SettingsBasicPages.tsx:92-119` | general/mode/task-monitor以`initial_variant`作为section；不同源入口不创造不同设置存储 |
| SET-SHORTCUTS | `pages/SettingsShortcutsPage.tsx:74-135` | .entry强制default组件variant，.default及其他观察态按原variant进入；选值/录制不保存 |
| SET-APPEARANCE | `pages/SettingsAppearancePage.tsx:99-155` | .entry无initialPanel；观察态按列出的initial_variant打开面板。default可被合法settingsLeaf覆盖，详见参数优先级 |
| SET-VOICE | `pages/SettingsVoicePage.tsx:79-147` | .entry强制voice，其余variant来自catalog；音频菜单仍为静态选值 |
| SET-MODELS | `pages/SettingsModelsPage.tsx:63-142` | .entry强制models，观察态按catalog variant；compatible弃稿还含不在URL的布尔state |
| SET-LEAF | `pages/SettingsLeafWorkbench.tsx:3-19,105-178` | 15个entry直接确定leaf；内部导航改用appearance.default加settingsLeaf键；两种入口不能混计为新的原产品状态 |
| SET-INSTALLED | `pages/ExtensionPages.tsx:19-103` InstalledExtensionsPage | .entry强制extensions-plugins，其余按variant；MCP特殊子页另记MCP |
| MCP | `pages/ExtensionPages.tsx:19-103` → `pages/CustomMcpDialog.tsx:32-217` | 在已安装连接器页上打开对应表单；`initial_variant`保留传给父组件的extensions-connectors-mcp-*值 |
| MARKET | `pages/ExtensionPages.tsx:143-192` ExtensionMarketPage | 类型/筛选按catalog variant；不能把固定查询快照等同通用搜索 |
| DETAIL-PPT | `pages/ExtensionPages.tsx:197-234` ExtensionDetailPage | PPT专页，安装仍仅提示 |
| DETAIL | `pages/MarketDetailPages.tsx:10-88` MarketDetailPage | `initial_variant=skill/connector`为传入kind，不是原catalog.variant |
| DETAIL-PLUGIN | `pages/MarketDetailPages.tsx:107-160` PluginMarketDetailPage | Superpowers/Context7详情与Context7错误由列出variant确定 |
| TASK-WORKSPACE | `pages/TaskSearchWorkspaceWorkbench.tsx:6-10,32-104` | 干净URL按源ID选tasks/search/workspace/actions；合法taskWorkspaceView能在这四个源ID之间覆盖默认view |
| REMAINING | `pages/RemainingScopeWorkbench.tsx:15-26,33-65` | 默认选择该源ID的第一项view，合法同源参数可选其他细态；不是GENERIC |
| PLUGIN | `pages/SettingsExtensionWorkbench.tsx:64-156` | P05默认plugin-directory，O09默认extension-install；只允许同源view |
| COLLABORATION | `pages/CollaborationCollectionWorkbench.tsx:16-20,123-228` | section必须与源ID条目匹配；P07默认projects，O12才默认issues，不能任意拼section |
| AGENT-RUNTIME | `pages/AgentRuntimeWorkbench.tsx:128-189` | 按源ID约束configView到Agent/Squad、本机Runtime或远端候选 |
| ARTIFACT | `pages/ArtifactWorkspaceWorkbench.tsx:6-14,20-43` | 源ID直接选固定view；没有artifactView参数，面板/缩放/版本为组件内state |
| MULTIPANE | `pages/WorkspaceMultipaneWorkbench.tsx:29-141` | 仅P15源ID消费workspaceView，默认overview |
| MONITOR | `pages/TaskMonitorWorkbench.tsx:49-115` | 仅P16组占位消费taskMonitorView，默认fixed |
| ENTRY-SYSTEM | `pages/EntrySystemWorkbench.tsx:24-45,72-124` | view与P17/O13/O14源ID配对，默认分别引导、登录网络、退出提示 |
| COMPOSER | `pages/ComposerDesignWorkbench.tsx:12-25,88-159` | O01/O02/O03/O05/O07各对应一个合法顶层view，更多stage是局部state |
| GENERIC | `components/ReviewShell.tsx:75-103` ResearchDetail | S01/S02/S08/S09/S10/M01/M02组占位无合法sessionInteractionView时落通用回放；加同源合法参数才进专门SessionInteractionWorkbench |
| APPROVAL | `pages/ApprovalPlanWorkbench.tsx:16-46` permission | S03默认request，参数缺失/不合法回request；认证演示不是批准业务动作 |
| PLAN | `pages/ApprovalPlanWorkbench.tsx:16-54` plan | S04默认preview，参数缺失/不合法回preview；接受方案不授权执行 |
| EXECUTION | `pages/ExecutionLifecycleWorkbench.tsx:25-41,59-110` | S05/S06/S07按源分别约束queue/steps/follow-up，不接受跨源view |
| RESILIENCE | `pages/SessionResilienceWorkbench.tsx:30-38,62-133` | 同源错误view，缺省取该组第一项；恢复只为fixture状态 |
| TOOL-RESULT | `pages/ToolResultWorkbench.tsx:28-36,60-124` | 同源toolResultView，缺省取该组第一项；不是工具调用 |
| KNOWLEDGE | `pages/KnowledgePages.tsx:55-249` KnowledgePage/RepoWikiSetup | entry无模型/数据请求，强制empty；观察态按variant，局部筛选可影响展示但不写URL |
| SITES | `pages/KnowledgePages.tsx:260-277` SitesPage | entry强制empty，观察态按variant；loading计时后仍保留原URL，可显示空态 |
| SET-MOBILE | `pages/SettingsMobilePage.tsx:13-61` | 仅partial专页；product+合法mobileFlow可被顶层手机原型替代；entry是SET-LEAF，不是此页 |
| WORKSPACE-ENTRY | `pages/SessionWorkspaceEntryWorkbench.tsx:18-45` | 两entry定初始terminal/sidepanel，页内切换不更新URL |
| USER-MENU | `components/UserAppearanceMenu.tsx:39-185`及`pages/ProductPages.tsx:30-62` | research打开对应菜单并以AutomationPage为背景；product/catalog用简化侧栏，不挂载此菜单，只显示产品自动化空态 |

### 有效细态与参数合同

下表的名字是分析引用键，不是新增产品参数。`NONE`不代表没有按钮，只表示没有该对象专属的额外URL细态；各页仍有表单、菜单、选择等局部state。既有catalog.variant无需单独传入URL，不能凭空增加`variant=`或任意交叉组合来膨胀状态数。

| parameter_contract | 有效条件、参数及局部细态 |
| --- | --- |
| NONE | 只用源ID与mode确定初始页；操作细态见analysis_refs，通用覆盖优先级仍适用 |
| AUTO | `automationView=mine/templates/runs`，默认mine；`automationFixture=manual/created/template:<已登记模板ID>`；仅`QDR.P03.list.empty`接受八种`automationLifecycleView`并优先显示生命周期工作面。product页不显示普通研究列表/模板入口 |
| SEARCH | 只有P02.search.empty打开弹窗；query、结果选择为局部state，导航history中的searchBackground决定背景；直接进入缺省首页 |
| HOME | 初始context/skills/goal/plan/sites/files/plugins由源observation/variant导出；research消费，product/catalog忽略；表单文字/选项不自动写URL |
| SESSION | research的19种QB1会话变体；panel、thoughtOpen、fileMenu、replyMenu、anchorOpen等为内存。product/catalog忽略observation，显示固定说明；不存在通用`sessionView`参数 |
| CLARIFICATION | 仅clarification.waiting消费`clarificationView=collapsed`，其他值为展开；自定义选项/文字局部保存；只对research会话可见 |
| REVIEW | 仅P16.review.summary消费`taskReviewView=expanded`，否则折叠；只能展开回顾文本，不查询运行记录 |
| USAGE | 仅OBS01.usage.open消费`usageView=refreshed`，只改刷新标识；金额不变化 |
| TOOL-COLLAPSE | 仅M02.edit.expanded消费`toolView=collapsed`，默认展开；其他会话内toolOpen由自身状态决定 |
| CONTINUATION | `stopView=continued`由continueAfterStop写入并影响重置路径；输入仍仅内存，URL不保存prompt，不证明真实续跑 |
| ENTRY-SETTINGS | .entry强制对应默认组件；点击专页控件可能导航到.default或已观察ID，不要把entry来源等级转成observed |
| LEAF | 15个entry直接选leaf；规范导航锚`state=QDR.P06.settings.appearance.default&settingsLeaf=<15合法键>&settingsLeafView=overview/draft/result`；默认overview。任意非空文本产生fixture结果不表示保存成功 |
| APPEARANCE | initialPanel由源variant导出；选择、随机主题、效果开关为局部state，不改变全局产品/系统偏好 |
| INSTALLED | 类型/add菜单由源variant导出；query局部保存；切MCP仍经InstalledExtensionsPage父层，非新增安装事实 |
| MARKET | 类型、匹配/空查询、精选/最新由源variant及局部query共同决定；只有有限组合有已观察快照，不定义所有筛选笛卡尔积 |
| MCP | transport/json/dirty/returnRoute及动态行局部保存，源variant用于回放对应表单；表单/JSON不自动互转；discard源ID不保证含真实待丢弃输入 |
| MODELS | 源variant决定表单/菜单，provider与compatibleDiscard可为内存；key/endpoint/modelId只读空值；不能把提供商菜单所有名字算作已支持 |
| SHORTCUTS | 源variant决定默认/语音搜索/固定空查询/发送菜单/编辑框；任意输入不对应任意过滤结果，录制保存未实现 |
| VOICE | 源variant决定设备/音色/速度/时长菜单及词汇/快捷键草稿；不枚举真实设备、不录音；词汇任意值不自动构成新来源状态 |
| USER-MENU | research消费initialPanel，后续打开从user开始；选项和三级菜单焦点为局部state，product/catalog不挂载此组件 |
| TASK-WORKSPACE | 四个登记源ID均允许`taskWorkspaceView=tasks/search/workspace/actions`；视图可覆盖源默认，但源标题/分母仍是原ID。重命名/批量/归档、工作区local/remote/archived均为组件内细态 |
| MULTIPANE | P15：`workspaceView=overview/create/confirm-close/closed`；缺省overview；active/pending/lastClosed对象及宽度不在URL，直接进closed不保证有可恢复对象 |
| CONFIG | P10：agent-list/agent-create/agent-selected/squad-list/squad-create/squad-selected；P11：runtime-profiles/runtime-create/runtime-connecting/runtime-unavailable；O06：handoff-connection/handoff-unavailable；键为configView，错误配对回源默认 |
| PLUGIN | P05：`pluginEntryView=plugin-directory/plugin-page/plugin-settings/plugin-document/plugin-unavailable`；O09：extension-install/extension-cancelled；不合法回各源默认 |
| COLLABORATION | P07对应projects，P08对应discussions，P09对应my-work，O12对应issues；键collaborationSection必须匹配。collaborationView共同list/detail/feedback，加projects专属project-draft、discussions专属discussion-status、issues专属issue-run |
| COMPOSER | composerWorkbenchView：O01→suggestions、O02→context、O03→input、O05→permission、O07→git；同源只一个顶层值。permissionStage和gitStage是局部state，不是URL参数 |
| MONITOR | P16组占位：`taskMonitorView=fixed/floating/detail/stopped/recovered`，缺省fixed；选择条目、stoppedId及收折状态局部保存 |
| ENTRY-SYSTEM | entrySystemView：P17为onboarding-intro/onboarding-preview/onboarding-login-prompt；O13为login-network/access-domain/domain-local-error/domain-ready/architecture-mismatch/feedback-draft/feedback-ready/about；O14为system-task-exit/system-unsaved-exit/system-update-running/system-cancelled |
| EXECUTION | executionView：S05为queue-pending/queue-retrying/queue-ready/queue-cancelled；S06为steps-running/steps-blocked/steps-resumed/steps-cancelled；S07为follow-up-composer/follow-up-queued/follow-up-delivered/follow-up-cancelled；缺省分别第一项 |
| APPROVAL | S03：`approvalView=request/waiting/resolved`，缺省request |
| PLAN | S04：`planView=preview/expanded/confirmation/approved/exit`，缺省preview |
| RECOVERY | sessionRecoveryView：S11为workspace-missing/history-missing；S12为quota-exhausted/model-throttled/license-unavailable/network-offline；S13为preview-unavailable/tool-detail-unavailable；缺省各第一项 |
| TOOL-RESULT | toolResultView：M03为web-search/web-fetch/bash-output；M04为task-output/widget/thinking；M05为result-details/result-images；缺省各第一项 |
| SESSION-DESIGN | 必须显式给sessionInteractionView：S01 reply-composing/reply-streaming；S02 clarification-choices/clarification-custom/clarification-submitted；S08 stop-confirm/reply-stopped/reply-follow-up；S09 background-running；S10 context-budget；M01 reply-actions/reply-feedback；M02 file-writing/edit-expanded。缺失或错配返回GENERIC，不进入专页默认态 |
| REMAINING | remainingScopeView：P04 market-directory/market-installed；P06 settings-overview/settings-search；O08 mcp-transport/mcp-json/mcp-unsaved；A01 diff-summary/diff-review；A02 html-preview/html-unavailable；缺省同源第一项 |
| ARTIFACT | 无artifactView键；P12/window、P14/sidepanel、O10/image、O11/diagram、A03/table-document、A04/text-image、A05/version-failed、A06/voice由源ID固定；其他操作只改局部state或导航换源ID |
| KNOWLEDGE | 不新增URL参数：按源variant及局部search/filter/view/name/scope共同决定。entry与观察页共享组件但保留来源等级；Wiki组合受源码限制，不保证所有组合可达 |
| SITES | 无额外对象参数，按empty/shared/loading及局部view/loading布尔显示；计时器结束不清除loading源ID |
| WORKSPACE-ENTRY | 两entry确定初始view，页内terminal/sidepanel及活动/文件/预览切换均为局部state，不更新源ID |
| MOBILE | `mode=product`＋`mobileFlow=start/progress/approval/instruction/review/offline/expired/unavailable`可顶层覆盖主页面；规范导航使用settings.mobile.partial锚。其他mode不消费手机页，即使参数合法也不证明手机流程可见 |

**必须单独核验的覆盖优先级：** `mobileFlow`在product模式可覆盖任意state；`settingsLeaf`解析不限定appearance源ID，但渲染前仍有entry、审批、产物等更高优先级，不能对任意页面简单套用。搜索的id/scene分离又可改变被覆盖背景。台账只给干净直接进入，不宣称已穷举恶意或残留参数组合；后续需验证清参、导航history、输入恢复及前后退，源参数不进入Sage权限输入。

### 补核的会话细态与跨页动作

| 编号 | 已核源码/实际触发和结果 | 所需后端/纯UI归属、差异与验证 |
| --- | --- | --- |
| N01 | `pages/ProductPages.tsx:72-109`首页切活动tab只换文案；快捷建议research直接go(9/18/1)，不是插入用户草案。`components/Controls.tsx:195-198,251-256`非空发送仅text→清空 | D/U：默认草案保存/整理/确认创建按D-081～084；快捷建议应明确是填写草案还是打开已有对象，不能点击示例就生成正式结果；保存/提交失败不丢输入 |
| N02 | `pages/SessionPage.tsx:20-42,75-83`research的running集合为7/8/11/17：定时分别去澄清/完成/产物，elapsed控制固定文本片段；“成功12s/1次迭代”是写死文案 | R/U：真实流式事件、序列/去重/最终消息及错误，从operation投影；断流/停止/权限变化不靠计时器判完成；token、耗时与工具次数不可沿用fixture |
| N03 | `pages/SessionPage.tsx:57,84`选项/自定义/无偏好→onAnswer→app go(11)；折叠仅隐藏卡片，waiting用clarificationView同步 | D：绑定具体问题、revision和选项/答案，收到不等于解除阻断；无偏好不是批准或关键事实。折叠不超时跳过；返回自定义/选项、IME、旧答案与新问题串线须验 |
| N04 | `pages/SessionPage.tsx:83`复制只toast、评价/反馈只本地提示，分支转M01候选，不创建侧聊。原生动作ID并不触发独立完成语义 | U/D：剪贴板需实际结果；引用/分支关联消息与获准上下文，按D-068/069私密与分享；反馈D-080，不改业务验收；从历史消息派生不得执行旧指令 |
| N05 | `pages/SessionPage.tsx:31-36,46-68,84-85`上下文、回顾、锚点是固定数字/文本的开关；P01.anchor.preview的点击/hover导航26，退出回25；右面板关闭只state | U/Q/R：定位及收折纯UI；真实上下文、回顾需受权投影/摘要版本/预算，不能读取私有推理；hover不应提交命令，打开搜索再返回不重置运行或泄漏草稿 |
| N06 | `pages/SessionPage.tsx:81`产物按钮go(20)，查看修改/审阅go(21/23)，文件菜单“在浏览器中打开”也只是go(20)，示例路径toast；撤销只提示。工具列表次数固定1或4 | F/R/U：打开预览、查看Diff、定位、撤销/回写/导出必须分责；显示路径不能暴露真实本机路径。他端必须先内容同步完整；“审阅”不是分项验收，撤销不是改历史或保证反转外部效果 |
| N07 | `pages/SessionPage.tsx:119-123` PreviewPane为React内存待办，非iframe、非读取HTML；勾选/添加/取消只改items/adding/title，file地址仅span文本 | F/main：只能作为离线交互体验参考，D-034的非特权WebContentsView尚需实现；预览内按钮只改变预览自身状态，不调用Sage业务。关/重开是否保留预览临时状态未定；禁止用fixture证明沙箱安全 |
| N08 | `pages/SessionPage.tsx:126-128` DiffPane只画固定节选，无真实文件/比较器；modified=false为创建节选，true为4行前后对；“最后一轮”不是可点击选择器 | F：源/候选/当前版本和格式支持，精确Diff/冲突与D-009/010回写合同；缺失旧版不冒充无变化，不把节选计数当完整差异；选择版本/评论/接受/导出为另行设计动作 |
| N09 | `pages/SessionPage.tsx:21,76,82,84`停止直接go(24)；继续输入经`app.tsx:642-658`设置prompt和stopView后go(25)，未发新运行；reset会据stopView回中断态 | R/D：停止请求、已停止和outcome-unknown分别回执，新attempt重核身份/版本/资源；重置原型不是业务恢复，重连不能重放；product固定说明不能证明停止入口可达 |
| N10 | `app.tsx:208-213,800-809,822`七个session组占位缺省为ResearchDetail，必须合法sessionInteractionView才展示专门回放；`ReviewShell.tsx:79-103`通用输入/启用/结果不承载领域对象 | U：补足生产导航与状态入口而非照搬研究参数；不能以206条直达全有页面就声称206交互已实现。台账显式保留parameter-required，不把通用页算专页通过 |
| N11 | `pages/ApprovalPlanWorkbench.tsx:43-54` S03继续→waiting、模拟完成→resolved；S04展开→confirmation→approved，再可转exit；纯回放 | D/I/R：认证、范围许可、业务批准与接受方案分开；D-043批准后请求继续要分阶段回执，D-061只做方案不执行。返回/取消/超时/过期不得把已生效决定回滚成未发生 |

本节额外闭合的是206个源ID到实际渲染分支、参数合同与动作类的**静态交叉索引**；还没有逐按钮边账、每个局部state组合、浏览器实际可达性或所有目标新页面的完整交互规格，不能将两者等同。

## 后续逐动作合同模板

已开始的第一批详见[逐按钮接线合同](button-wiring-contracts.md)：B-001～B-078覆盖草案/建项、资料/移除、预览/导出、验收/替换、依据复用、分工、更正、原版本再审发起、独立人员分派/本人承接/结论提交、用途恢复核验、结束确认及各结果查询与整体完成；含三个非按钮事件，NP-01～NP-07承接。D-095～118已明确相关原则：关联新再审可能改变上一轮结论时，上一轮人员回避本轮审理，仅受权补充说明与证据；本轮人选、承接、结论及独立结束责任均须核验，旧记录保持。上一轮人员的分派回避、更多历史轮次规则、具体结束责任配置、结论跨轮适用及问题归并仍待定。工作稿不等于正式API、完整按钮覆盖或运行通过。

每条动作记录：`源状态ID + 有效参数/模式 + 页面/组件 + 触发动作 + 前态 → 请求/本地变化 → 回执/事件 → 后态 + 主责 + 数据范围 + 权限 + 失败/取消/过期/重试 + 现有源码/ADR + 新增工作 + 验收路径`。

必须双向检查：

1. 所有目录ID及目录外有效细态均有唯一记账归属，跨组/跨页只引用；不能用无意义参数组合扩张分母。
2. 每个用户动作有纯UI、查询、候选编辑、正式命令或原生特权操作归属；复杂按钮可关联多个明确阶段，但不能隐藏副作用。
3. 已有后端模块映射到消费页面或标记内部职责；未消费的内核不算已接线。
4. 页面状态来自谁、结果如何返回、失败怎样收口三者均有证据或明确待定。
5. 正向路径和拒绝/过期/撤销/重复/冲突/未知结果分别列验证；不会因fixture能点通就抬升运行验收。

本表已有59组索引、首闭环8个分析步骤、61行页面族动作类（U17/C13/R17/F14），本次再补N01～N11细态核对及206源ID的实际渲染分支/参数/动作类索引。32个页面文件与5个共用组件的静态阅读和该逐ID索引，仍不等于每个按钮及全部局部状态组合已验证；没有改变来源目录206的分母。

下一层仍需：将每个具体动作与前后态、对象身份和请求/回执绑定成逐边合同；登记局部state组合、跨页/前后退/重挂载/权限变化；补全目标新增页面及全仓后端方案逐模块反向对账。台账没有把通用回退、参数要求或新设计缺口伪装为已接线。

## 本次文档校验边界

首闭环批次：2026-10-01仅使用Node内存读取目录JSON与仓外Markdown，复核59组/206状态、D-001～073及当时88处本地链接；该读数是当时记录，不作为当前链接总量。

剩余页面批次：2026-10-01复核59组各唯一、计数合计206、73项决定连续；61个U/C/R/F分析编号唯一、66处显式源码路径/行号范围及97处本地链接未发现结构问题。两次对32个pages文件、5个components文件、app.tsx与catalog-data.json组成的39文件排序清单进行SHA-256复算，摘要均为`7025cf2d953ce78150937e144beb7e05278df5d7187ded048b071b1333d6a1a8`；catalog摘要仍为本页开头基线。只证明这两次读取之间该集合字节相同，不证明整个共享仓冻结或内容语义已完整验证；content profile另做静态阅读，不在39文件摘要集合内。

本批有一个能力配置只读代理返回证据，主线程抽读模型/MCP/Agent/插件配置handler核验；执行和协作两代理连接中断未返回可用结果，未记为覆盖，改由主线程读取其分配文件。没有重试业务操作、调整网络或读取其他会话。已核出的具体偏差包括：输入选择未随发送传递、批量选择未传入操作面、接受/退回共用ready、取消JSON未清稿，以及页面状态/列表/历史不一致；均记录为迁移约束，不在本轮修原型。

页面复核阶段只修改既有矩阵与讨论索引；随后恢复逐题对齐，新增D-074/075及仓外ADR-0006，确认中国内地单一区域起步，并在ADR-0005补前向指针；D-076进一步明确首版云端模型仅支持经核验的内地处理/留存服务，已同步模型设置边界。上述73项决定、97处链接的校验读数保留为提问前时点，不代表后续讨论的当前总数。未运行浏览器、构建、测试、门禁、模型或业务调用，未部署、迁移、修改源仓或操作设备；结构检查不证明产品功能、像素、可访问性或发布通过。

逐源ID批次（截至D-094）：新增CSV的206行与catalog逐ID、顺序及唯一性完全匹配，41类渲染分支、40组参数合同、72个动作分析编号和21类差距码均有字典；显式标出七个缺省GENERIC回退。另从组件声明抽取35个默认路由，并结合已读app分支对全部206行静态复算，未发现不一致。这是对源码的静态重述与交叉检查，不是执行React路由、原型测试或独立运行证据。

本次结构检查覆盖59组计数、94项连续决定、121处显式原型源码路径/行号范围及108处本地Markdown链接；检查未发现问题。内存副本上分别移除ID、复制ID、破坏路由键、参数键和动作引用，五种负例均被检出，未改被审文件或源仓。39文件原型摘要与上批相同；Sage源码已按本页当前基线更新，不把共享仓HEAD变化忽略。Read工具部分调用超时后改用本地只读脚本提取指定源码片段；没有通过运行应用或读取其他会话弥补证据。

本批仅新增`source-state-wiring.csv`并更新既有矩阵、讨论稿，不新增产品决定、不修改源码/配置/权限。剩余工作是逐动作边合同、局部状态组合、目标新增页面及真实业务/运行验收，不再将206源ID是否有静态映射列为未完成项。
