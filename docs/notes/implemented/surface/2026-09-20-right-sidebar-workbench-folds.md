# 决策记录：右侧栏「工作台」——一个面板装 7 个可折叠分组，折叠照 Qoder CN

- 日期：2026-09-20
- 状态：implemented
- 对应 ADR：[ADR-0143](../../../adr/ADR-0143.md)（本条的实施记录）、[ADR-0141](../../../adr/ADR-0141.md)（被取代：折叠不在左栏）、[ADR-0140](../../../adr/ADR-0140.md)（D1 左栏扁平保持、D4 面板交互被修订）
- 涉及包：`packages/surfaces/dsh-right-sidebar-local`
- 前置记录：[2026-09-20-workbench-group-retired](2026-09-20-workbench-group-retired.md)（左栏折叠组退役；本条把折叠放到了右侧面板）

## Problem

用户给出新的参照并要求「折叠功能照 Qoder CN 的右侧栏设计」。同时要求排查一件事：
**此前的质感改版在实机上没有任何效果**（外层边框、圆角、定位都看不到）。

排查（真机 CDP 读数，不是读源码）发现两处同源缺陷：

1. `packages/surfaces/dsh-right-sidebar-local` 里存在**两份** `right-sidebar.module.css`：
   `styles/`（13356B，质感版：`position: fixed` / 30px 圆角 / 1.2px 边框 / 440px 宽）与
   `src/styles/`（8994B，旧版：`position: fixed` / 380px / 1px 左边框）。
2. `src/client/modules/common/panel-shell.tsx` 比同目录的模块组件**多一层目录**，其
   `'../../../styles/right-sidebar.module.css'` 解析到 `src/styles/`（旧版）；模块组件
   （`src/client/modules/*.tsx`）解析到 `styles/`（新版）。

后果是**面板壳用旧样式、模块内容用新样式**。实况读数（`.dsh-right-sidebar-root` 的首个子元素）：
`position: static`、`border-radius: 0px`、`border-width: 0px`、`width: 1368px`、`y=923`
——一个渲染在视口下方的裸 div。注入的 `<style data-plugin="dsh-right-sidebar-local">` 里
同时有 `._7kP-uW_panelRoot{…}`（新）与 `.GqBeGq_panelRoot{…}`（旧）两套规则，而 DOM 上的类名是
`GqBeGq_`：**类名映射与 CSS 文本来自两个不同的家**，谁都没报错。

## Decision

1. **删掉副本、修好导入**：`src/styles/right-sidebar.module.css` 删除；`panel-shell.tsx` 与
   `sidebar-entry.ts` 的导入改指 `styles/right-sidebar.module.css`（也是 `sidebar-row-axis`
   门禁登记的那份）。此后面板壳与模块内容共用一份样式，加载后只有一个哈希前缀（实测 `_7kP-uW_`）。
2. **面板改成「一个工作台 + 7 个可折叠分组」**：面板标题「工作台」（副标题显示模块数），
   7 个分组按 ADR-0140 D2 的顺序排列；左栏 7 行不变（仍扁平，行轴契约不动）。
   点左栏某行 = 打开面板 + 展开该分组 + `scrollIntoView({block:'nearest'})`。
3. **折叠机制照 Qoder CN**：表头整行是唯一的开关（`<button aria-expanded aria-controls>`），
   chevron 展开朝下/折叠朝右，内容用 `grid-template-rows: 0fr↔1fr` 过渡（**不用 `max-height`**，
   旧实现的 `max-height: 1200px` 会让更长的内容静默截断）。折叠状态写
   `localStorage['dsh-right-sidebar:collapsed-groups']`；`prefers-reduced-motion` 下过渡归零。
4. **分组内容按需挂载、折叠后保留**：首次展开才挂载（`opened` 集合），之后折叠只切高度不卸载
   ——保住列表滚动位置与未提交的输入。
5. **模块目录只留一份**：`sidebar-entry.ts` 的 `MODULES`（id / 注入行属性 / 图标 / 文案 / 顺序）
   是唯一副本，分组表头与左栏行都从它取；`rowAttribute` / `position` 字面继续留在该文件，
   因为 `sidebar-row-axis` 门禁按该文件文本发现注入行。7 个模块组件随之改为「只有内容」
   （`TodoPanel` → `TodoContent` 等，`onClose` 与各自的 `icon` 副本删除），`panel-shell.tsx`
   删除（面板壳由工作台组件直接渲染）。
6. **外框线按渲染值写**：面板与分组卡声明 **1.5px**。原因是渲染器把边框宽度吸附到整设备像素
   ——2x 屏上声明 1.2px 实测渲染 1px（比用户要求更细）。契约是「渲染出来 ≥1.2px」，钉在
   `getComputedStyle` 的读数上。颜色一律改走 `--dsw-alias-*` / `--dsw-specific-*` 语义 token
   （此前面板壳写的是 `rgba(32,34,40,.97)` 这类字面色，换肤不跟随）。
7. **验收探针**：`scripts/acceptance/right-sidebar-workbench-live.mjs`（npm 脚本
   `accept:right-sidebar`）经 CDP 连真渲染进程：打开面板 → 读几何 → 读 7 分组结构与
   `aria-controls` → 点表头读折叠前后高度与 `aria-expanded` → 读记忆键。前置缺失报 exit 2
   并打印候选清单，判据不过报 exit 1。

## Alternatives considered

- **保留副本、只把两处导入改成绝对路径**：副本仍在，下一次「改哪份」还是要靠记性；P-07 的
  形态不解决。
- **把 `panel-shell.tsx` 上移一级目录**：能用目录深度消掉这次的具体错配，但「导入深浅决定用哪份
  样式」这个性质仍在——下一个人把文件挪回去就复发。
- **面板内做 Tab 切换 / 抽屉 / 模态**：ADR-0140 已比较过（Tab 增加点击次数、模态阻塞工作流），
  本轮用户要的是一屏看全并可自行折叠。
- **默认只展开被点开的分组**：更省资源，但与参照形态（多组同时可见）不符；先按「默认全展开 +
  记忆折叠」落地，把开销问题留给真机观察。
- **折叠用 `max-height` + 足够大的常量**：旧实现的做法，代价是超过常量的内容被静默截断。

## Consequences

- 面板第一次真正按设计渲染：实测 `position: fixed`、圆角 30px、外框 1.5px、面板在视口内
  （y=14、h=895、视口高 923）；分组卡 20px 圆角、1.5px 边框。
- 折叠行为可证：`aria-expanded` 与 `data-expanded` 同步翻转，内容高度 119px → 0 → 774px
  （展开时变高是因为 git 状态异步到达，不是折叠缺陷——探针因此不比较「与初始高度相等」）。
- 面板打开即触发 7 个模块各自取数（环境信息 5s 轮询、后台进程 2s 轮询仍在各自组件内）；
  折叠过的分组不再挂载，但默认全展开时等同于全量加载。
- 折叠记忆在 localStorage，不随 profile 迁移。
- 验收探针会退出应用重启（需要 `--remote-debugging-port`，且该参数只在应用未运行时生效），
  并在渲染进程里点一下入口、折叠并展开一个分组（其余只读）。
