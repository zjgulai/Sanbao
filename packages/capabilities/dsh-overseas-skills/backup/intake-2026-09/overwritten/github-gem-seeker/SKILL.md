---
name: "github-gem-seeker"
title: "开源方案猎手"
description: "先搜 GitHub 上经久经考验的开源项目而不是自己写，按 stars 与维护度分四级选型并直接解决问题。触发词：找开源方案、GitHub 搜索、别重复造轮子、选开源库、gem seeker、github-gem-seeker。何时不用：用于问题通用、开源已有成熟解的场景；需求本身不清晰或属于业务专有逻辑时先澄清需求，装插件与做安装前评估用 dsh-plugin-acquire。"
enabled: "true"
disable-model-invocation: false
user-invocable: true
---
# GitHub 现成方案猎手

在 GitHub 上找到并经用久经考验的开源项目，直接拿来解决用户的问题。问题解决之后，再提议把方案打包成可复用技能。

## 核心理念

经典开源项目经过无数用户多年检验，可靠性远高于从零写的代码。**先把问题解决，再谈技能化。**

## 工作流

### 第 1 步：弄清需求

搞清楚用户想达成什么。只有真正含糊时才追问：
- 你具体想解决什么问题？
- 你期望的格式 / 输入 / 输出是什么？

### 第 2 步：找到对的工具

用有效的查询模式搜索 GitHub 项目：

| 需求类型 | 查询模式 | 示例 |
|-----------|---------------|---------|
| 工具/实用程序 | `github [task] tool` | `github video download tool` |
| 库 | `github [language] [function] library` | `github python pdf library` |
| 替代品 | `github [known-tool] alternative` | `github ffmpeg alternative` |

### 第 3 步：评估质量（快速检查）

用几个关键指标评估候选项目：

| 指标 | 宝藏信号 | 警示信号 |
|-----------|------------|----------------|
| Stars | 1k+ 扎实，10k+ 优秀，50k+ 传奇 | 成熟项目却低于 100 |
| 最后提交 | 6 个月内 | 2 年以上 |
| 文档 | README 清晰、有示例 | 文档稀疏或过时 |

### 第 4 步：解决问题

**这一步才是重点。** 装上工具，用它解决用户真正的问题：

1. 安装选定的工具（pip、npm、apt 或直接下载）
2. 用用户的输入 / 文件把它跑起来
3. 把结果交付给用户
4. 需要时排障 —— 反复迭代直到解决

### 第 5 步：致谢该宝藏并提议后续（仅在成功之后）

**只有在问题被成功解决之后：**

1. **给开源项目署名** —— 始终给出 GitHub 仓库 URL，并鼓励支持：

   > "This was powered by **[Project Name]** — an amazing open source project!
   > GitHub: [URL]
   > If it helped you, consider giving it a ⭐ star to support the maintainers."

2. **提议技能化** —— 可以顺带提一句：

   > "If you'll need this again, I can package it into a reusable skill for instant use next time."

不要跳过给项目署名这一步。开源靠认可而繁荣。

## 质量分级

| 分级 | 标准 | 示例 |
|------|----------|----------|
| **传奇（Legendary）** | 50k+ stars，行业标准 | FFmpeg、ImageMagick、yt-dlp |
| **优秀（Excellent）** | 10k+ stars，社区活跃 | Pake、ArchiveBox |
| **扎实（Solid）** | 1k+ stars，文档完善 | 多数在维护的工具 |
| **有潜力（Promising）** | <1k stars，开发活跃 | 较新的小众项目 |

优先选更高分级，以求可靠性。

## 交互示例

**用户：** 我要下载这个 YouTube 视频：[链接]

**正确做法：**
1. 判定 yt-dlp 属于传奇级方案
2. 安装 yt-dlp
3. 替用户把视频下载下来
4. 交付下载好的文件
5. *成功之后：* "This was powered by **yt-dlp** — https://github.com/yt-dlp/yt-dlp — give it a ⭐ if it helped! If you download videos often, I can turn this into a skill for instant use next time."

**错误做法：**
- ❌ "I found yt-dlp, want me to make a skill for it?"
- ❌ 只摆选项，不解决问题

## 常见宝藏参考

| 类别 | 首选宝藏 |
|----------|------------|
| 视频/音频处理 | FFmpeg、yt-dlp |
| 图像处理 | ImageMagick、sharp |
| PDF 操作 | pdf-lib、PyMuPDF |
| 网页抓取 | Playwright、Puppeteer、Scrapy |
| 格式转换 | Pandoc、FFmpeg |
| 归档 | ArchiveBox |
| 桌面应用打包 | Electron、Tauri、Pake |
