# 047 外观八项：一条 v2 记录、两入口同值、失败回退在各入口

> 决策与规则见 [ADR-0216](../../../adr/ADR-0216.md)。

## Problem

020 只持久化三项显示偏好（主题/语言/密度），而 FW-039/US-220 要求把可持久化外观项**扩为八项**
（+字体风格/内容宽度/终端主题/文件图标/图标外观），仍由同一偏好端口持有；US-221 点名"设置页与快捷菜单
读写同值并订阅变更"，任一处保存失败不得显示为已生效；US-222 要求清单外项（快捷键/语音/监控浮层布局）
显式标注、不留可交互控件。原型还给出值域证据（外观页六下拉 + 图标外观；快捷菜单的即时选项）。

## Decision

- `DisplayPreferenceValues` 八项（contracts 单一 home）；存储升 `sage.preferences.v2`；
  路由校验器与存储 `readValues` 共用同一键/值白名单；v1 三值记录不半采纳（默认值 + savedAt null）。
- 设置页外观段（`#settings-appearance`）一次提交八项 patch；顶栏快捷菜单逐项即时单键 patch；
  两处只读 `state.preferences`、只写 `/.sage/preferences`；失败以入口为单位回退并挂本地提示（不被轮询覆盖）。
- 重启断言：同目录第二实例读回八项已存值；`system` 的 `effectiveTheme` 由重启时观察解析，无观察=null。
- 清单外三行标 `不可配置`、内置浏览器开关标 `不迁入`（D-036）；块内零控件，控件 aria-label 不得出现这些词。
- `panel-settings` 重划为"外观段（唯一可保存面）+ 叶子页只读组"；046 的面板级零控件断言重划到
  `id="settings-leaf-section"` 切片（逐页来源/零写入口断言未动）；nav 标签改"设置"。
- 默认值单一 home：`DEFAULT_DISPLAY_PREFERENCE_VALUES` 供存储与 unavailable-first 回退同源。

## Alternatives considered

- 保留 v1 版本号直接加宽字段：旧记录会以"部分已知"混进新读路径，否决；换版本 + 拒绝旧版。
- v1→v2 迁移：迁移语义是新决策、本票未要求；拒绝读回默认是更小的诚实面，否决迁移。
- 快捷菜单也做一次八项+保存：违背"快捷"的即时语义、破坏 020 已演示行为，否决。
- 外观卡留个人资料面板：US-221 点名的两入口是"设置页与快捷菜单"，个人资料只留身份，否决。

## Consequences

- 五项验收各有机器断言：八项默认/回读/重启解析、两入口逐项同值同变、8 键与单键 patch、成功才"已保存"、
  两入口各自失败回退、清单外标注+零控件（含 aria-label 扫描）。
- 046 断言只动切片起点一处；composition 20 端口精确钉未变（savePreferences 端口形状未变）。
- 已知未闭：真机 Electron 未跑（nativeTheme 仍注入值证明）；八项视觉 token 应用与对比度属 §7.10。
