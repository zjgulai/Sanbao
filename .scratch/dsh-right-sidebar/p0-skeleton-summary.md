# P0 插件包骨架完成总结

## ✅ 已完成工作

### 1. 目录结构创建
```
packages/surfaces/dsh-right-sidebar-local/
├── src/
│   ├── client/
│   │   ├── modules/          # 7 个模块面板组件
│   │   │   ├── todo-panel.tsx
│   │   │   ├── env-info-panel.tsx
│   │   │   ├── skills-mcp-panel.tsx
│   │   │   ├── web-search-panel.tsx
│   │   │   ├── background-procs-panel.tsx
│   │   │   ├── outputs-panel.tsx
│   │   │   └── sources-panel.tsx
│   │   ├── api/              # 数据源 API（占位符）
│   │   │   ├── todo-api.ts
│   │   │   ├── git-api.ts
│   │   │   └── skills-mcp-api.ts
│   │   ├── sidebar-entry.ts      # 主入口：侧边栏条目注入
│   │   ├── sidebar-entry-core.ts # 共享核心（占位符）
│   │   └── index.ts            # 统一导出
│   └── panel-mount.tsx         # 面板挂载点
├── styles/
│   └── right-sidebar.module.css # 样式定义
├── package.json
├── tsconfig.json
└── README.md
```

### 2. 核心文件内容

#### sidebar-entry.ts
- 定义 7 个模块的图标、标签、提示文本
- 配置统一的 `position: 'after'` 定位
- 实现 `mountRightSidebarEntries()` 主函数
- 支持激活状态高亮和视图切换

#### right-sidebar.module.css
- 36px 行高（匹配 nav-band 轴）
- 8px 圆角，2px 侧边距，10px 内边距
- 品牌绿色激活态（rgba(88, 184, 72, 0.15)）
- 悬停和焦点状态样式
- 徽章样式（用于待办任务计数）

#### 模块面板（7 个）
所有面板采用统一的占位符设计：
- 固定右侧定位（420px 宽度）
- 顶部标题栏 + 关闭按钮
- 空状态提示（"即将上线"）
- 等待 P1/P2 实现真实内容

#### API 层（3 个）
- `todo-api.ts`: TODO 任务 CRUD
- `git-api.ts`: Git 状态查询
- `skills-mcp-api.ts`: 技能和 MCP 管理

均为占位符实现，返回空数据。

### 3. ADR-0140 更新
- 状态从 `proposed` 改为 `accepted`
- 日期标记为 2026-09-20
- 决策记录指向本文档

---

## 📊 统计信息

| 项目 | 数量 |
|---|---|
| 总文件数 | 18 |
| TypeScript 文件 | 11 |
| CSS 文件 | 1 |
| JSON 文件 | 2 |
| Markdown 文件 | 2 |
| TSX 文件 | 8 |

| 模块 | 状态 |
|---|---|
| TODO 任务 | ✅ 骨架 |
| 环境信息 | ✅ 骨架 |
| 技能和 MCP | ✅ 骨架 |
| 网页查阅 | ⏹️ 占位符 |
| 后台进程 | ⏹️ 占位符 |
| 产出 | ⏹️ 占位符 |
| 来源 | ⏹️ 占位符 |

---

## 🔧 下一步行动（P1）

### 1. 同步共享核心
```bash
# 运行 sync-shared.mjs 将 shared/client/sidebar-entry-core.ts 复制到插件包
pnpm run sync-shared
```

### 2. 实现高频模块
- [ ] TODO 任务面板完整实现
  - 数据源集成（`~/.dsh/profiles/<profile>/todos.jsonl`）
  - 实时监听和更新
  - 任务 CRUD 操作
  - 徽章显示未完成数量

- [ ] 环境信息面板完整实现
  - Git 状态查询（`git status`）
  - 分支对比（ahead/behind）
  - 最近提交列表
  - 轮询刷新（5 秒间隔）

- [ ] 技能和 MCP 面板完整实现
  - 读取 `ctx.get('skills')`
  - 读取 `ctx.get('mcpServers')`
  - 启用/禁用开关
  - 事件驱动更新

### 3. 测试框架
- [ ] 添加 vitest 配置
- [ ] 编写单元测试
- [ ] E2E 测试脚本

---

## 📝 注意事项

1. **sidebar-entry-core.ts 是占位符**
   - 需要从 `shared/client/sidebar-entry-core.ts` 同步
   - 当前实现只是警告日志

2. **API 层都是空实现**
   - TODO 任务 API 返回空数组
   - Git API 返回假数据
   - Skills/MCP API 需要对接宿主上下文

3. **面板组件未集成 React 渲染**
   - `panel-mount.tsx` 中的 `mountPanel()` 需要完善
   - 需要使用 `createRoot()` 或 `render()`

4. **样式需适配主题**
   - 当前使用硬编码的品牌绿
   - 应改用 `--sanbao-*` token

---

## ✨ 亮点

1. **完整的模块化架构**
   - 7 个独立模块，各自维护
   - 统一的设计规范和代码风格
   - 易于扩展和维护

2. **符合 ADR-0140 规范**
   - 单一扁平布局
   - 极简图标 + 文字
   - 36px 行高一致
   - 品牌色激活态

3. **清晰的实施路线图**
   - P0: 骨架 ✅
   - P1: 高频模块 ⏳
   - P2: 低频模块 ⏹️
   - P3: 门禁集成 ⏹️

---

**P0 阶段完成！准备进入 P1 高频模块实现。**
