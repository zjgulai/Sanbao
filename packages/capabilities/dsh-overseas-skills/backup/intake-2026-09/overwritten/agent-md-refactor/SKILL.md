---
name: "agent-md-refactor"
title: "Agent 指令重构"
description: "把臃肿的 AGENTS.md、CLAUDE.md 按渐进式披露重构：找矛盾、留必需、归类、建链接文件结构、标可删除项，把根文件压到 50 行以内。触发词：重构 AGENTS.md、CLAUDE.md 太长、拆分 agent 指令、渐进式披露、指令文件整理、agent-md-refactor。何时不用：用在已有指令文件已经臃肿、要做结构拆分时；从零学怎么写 agent 文档用 writing-for-agents，README 这类项目门面文档用 crafting-effective-readmes。"
enabled: "true"
disable-model-invocation: false
user-invocable: true
---
# Agent 指令文件重构

把臃肿的 agent 指令文件（AGENTS.md、CLAUDE.md、COPILOT.md 等）重构成遵循**渐进式披露原则**的结构——根文件只留必需内容，其余归类后拆进互相链接的文件。

---

## 触发场景

以下情况使用本技能：
- 「重构我的 AGENTS.md」/「重构我的 CLAUDE.md」
- 「把我的 agent 指令拆开」
- 「整理我的 CLAUDE.md」
- 「我的 AGENTS.md 太长了」
- 「给我的指令做渐进式披露」
- 「清理我的 agent 配置」

---

## 速查表

| 阶段 | 动作 | 产出 |
|-------|--------|--------|
| 1. 分析 | 找出互相矛盾的指令 | 待解决的冲突清单 |
| 2. 提取 | 识别必需内容 | 根文件的核心指令 |
| 3. 归类 | 把其余指令分组 | 逻辑类别 |
| 4. 结构化 | 建立文件层级 | 根文件 + 被链接的文件 |
| 5. 精简 | 标出可删除项 | 冗余或含糊的指令 |

---

## 流程

### 阶段 1：找出矛盾

找出彼此冲突的指令。

**找这些：**
- 互相矛盾的风格约定（例如「要写分号」与「不要写分号」）
- 冲突的流程指令
- 不兼容的工具偏好
- 互斥的写法

**每找到一处矛盾，按这个格式登记：**
```markdown
## Contradiction Found

**Instruction A:** [quote]
**Instruction B:** [quote]

**Question:** Which should take precedence, or should both be conditional?
```

先请用户裁定，再往下走。

---

### 阶段 2：识别必需内容

只提取真正该留在根 agent 文件里的内容。根文件应当极简——只放**每一个任务**都适用的信息。

**必需内容（留在根文件）：**
| 类别 | 示例 |
|----------|---------|
| 项目描述 | 一句话："A React dashboard for analytics" |
| 包管理器 | 仅在不是 npm 时写（例如 "Uses pnpm"） |
| 非标准命令 | 自定义的 build/test/typecheck 命令 |
| 关键覆盖项 | 必须覆盖默认行为的规定 |
| 通用规则 | 100% 的任务都适用 |

**非必需内容（移到被链接的文件）：**
- 语言专属约定
- 测试指引
- 代码风格细节
- 框架写法
- 文档规范
- Git 工作流细节

---

### 阶段 3：归类其余内容

把剩余指令整理进逻辑清晰的类别。

**常见类别：**
| 类别 | 内容 |
|----------|----------|
| `typescript.md` | TS 约定、类型写法、严格模式规则 |
| `testing.md` | 测试框架、覆盖率、mock 写法 |
| `code-style.md` | 格式化、命名、注释、结构 |
| `git-workflow.md` | 提交、分支、PR、评审 |
| `architecture.md` | 架构写法、目录结构、依赖 |
| `api-design.md` | REST/GraphQL 约定、错误处理 |
| `security.md` | 鉴权写法、输入校验、密钥 |
| `performance.md` | 优化规则、缓存、懒加载 |

**归类规则：**
1. 每个文件在自己的主题内应当自洽完整
2. 目标 3–8 个文件（别太碎，也别太笼统）
3. 文件名要清楚：`{topic}.md`
4. 只放可执行的指令

---

### 阶段 4：建立文件结构

**产出结构：**
```
project-root/
├── CLAUDE.md (or AGENTS.md)     # Minimal root with links
└── .claude/                      # Or docs/agent-instructions/
    ├── typescript.md
    ├── testing.md
    ├── code-style.md
    ├── git-workflow.md
    └── architecture.md
```

**根文件模板：**
```markdown
# Project Name

One-sentence description of the project.

## Quick Reference

- **Package Manager:** pnpm
- **Build:** `pnpm build`
- **Test:** `pnpm test`
- **Typecheck:** `pnpm typecheck`

## Detailed Instructions

For specific guidelines, see:
- [TypeScript Conventions](.claude/typescript.md)
- [Testing Guidelines](.claude/testing.md)
- [Code Style](.claude/code-style.md)
- [Git Workflow](.claude/git-workflow.md)
- [Architecture Patterns](.claude/architecture.md)
```

**每个被链接文件的模板：**
```markdown
# {Topic} Guidelines

## Overview
Brief context for when these guidelines apply.

## Rules

### Rule Category 1
- Specific, actionable instruction
- Another specific instruction

### Rule Category 2
- Specific, actionable instruction

## Examples

### Good
\`\`\`typescript
// Example of correct pattern
\`\`\`

### Avoid
\`\`\`typescript
// Example of what not to do
\`\`\`
```

---

### 阶段 5：标出可删除项

找出应当整条删掉的指令。

**满足以下条件就删：**
| 判定标准 | 示例 | 为什么删 |
|-----------|---------|------------|
| 冗余 | "Use TypeScript"（在 .ts 项目里） | agent 本来就知道 |
| 过于含糊 | "Write clean code" | 不可执行 |
| 过于显然 | "Don't introduce bugs" | 白占上下文 |
| 属于默认行为 | "Use descriptive variable names" | 本来就是通行做法 |
| 已过时 | 引用了已废弃的 API | 不再适用 |

**登记格式：**
```markdown
## Flagged for Deletion

| Instruction | Reason |
|-------------|--------|
| "Write clean, maintainable code" | Too vague to be actionable |
| "Use TypeScript" | Redundant - project is already TS |
| "Don't commit secrets" | Agent already knows this |
| "Follow best practices" | Meaningless without specifics |
```

---

## 执行清单

```
[ ] Phase 1: All contradictions identified and resolved
[ ] Phase 2: Root file contains ONLY essentials
[ ] Phase 3: All remaining instructions categorized
[ ] Phase 4: File structure created with proper links
[ ] Phase 5: Redundant/vague instructions removed
[ ] Verify: Each linked file is self-contained
[ ] Verify: Root file is under 50 lines
[ ] Verify: All links work correctly
```

---

## 反模式

| 反模式 | 为什么不行 | 应该怎么做 |
|-------|-----|---------|
| 什么都塞在根文件里 | 臃肿、难维护 | 拆进被链接的文件 |
| 类别开得太多 | 内容被切碎 | 合并相关主题 |
| 指令含糊 | 白耗 token，没有价值 | 写具体，或者删掉 |
| 重复默认行为 | agent 本来就知道 | 只在需要覆盖时写 |
| 层级嵌得太深 | 难以导航 | 用扁平结构加链接 |

---

## 示例

### 重构前（臃肿的根文件）
```markdown
# CLAUDE.md

This is a React project.

## Code Style
- Use 2 spaces
- Use semicolons
- Prefer const over let
- Use arrow functions
... (200 more lines)

## Testing
- Use Jest
- Coverage > 80%
... (100 more lines)

## TypeScript
- Enable strict mode
... (150 more lines)
```

### 重构后（渐进式披露）
```markdown
# CLAUDE.md

React dashboard for real-time analytics visualization.

## Commands
- `pnpm dev` - Start development server
- `pnpm test` - Run tests with coverage
- `pnpm build` - Production build

## Guidelines
- [Code Style](.claude/code-style.md)
- [Testing](.claude/testing.md)
- [TypeScript](.claude/typescript.md)
```

---

## 验收

重构完成后，逐项核对：

1. **根文件极简** —— 50 行以内，只放通用信息
2. **链接可用** —— 被引用的文件都存在
3. **没有矛盾** —— 指令彼此一致
4. **内容可执行** —— 每条指令都足够具体
5. **覆盖完整** —— 没有指令丢失（被标为可删除的除外）
6. **文件自洽** —— 每个被链接的文件都能独立读懂

---
