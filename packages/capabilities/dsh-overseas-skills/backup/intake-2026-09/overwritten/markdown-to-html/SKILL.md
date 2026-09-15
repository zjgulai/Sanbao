---
name: "markdown-to-html"
title: "Markdown 转 HTML"
description: "把 Markdown 文档转成 HTML：给出 marked、pandoc、gomarkdown 三条工具链的用法与配置，以及 Jekyll、Hugo 模板系统的转换路径与安全注意项。触发词：markdown 转 html、md 转 html、渲染 markdown、静态站点模板、pandoc、hugo、markdown-to-html。何时不用：只做 Markdown → HTML 的转换、渲染与模板接入，不负责 Markdown 文档写什么：写文档本身用 markdown-mermaid-writing，要出印刷级 PDF 用 minimax-pdf。"
enabled: "true"
disable-model-invocation: false
user-invocable: true
---
# Markdown 转 HTML

把 Markdown 文档转成 HTML 的专业技能：既包括使用 marked.js 库，也包括自己写数据转换脚本——后者类似 [markedJS/marked](https://github.com/markedjs/marked) 仓库里那种脚本。写自定义脚本时知识面并不局限于 `marked.js`：转换方法可借鉴 [pandoc](https://github.com/jgm/pandoc) 与 [gomarkdown/markdown](https://github.com/gomarkdown/markdown)，模板系统可借鉴 [jekyll/jekyll](https://github.com/jekyll/jekyll) 与 [gohugoio/hugo](https://github.com/gohugoio/hugo)。

转换脚本或工具应当支持单文件转换、批量转换以及进阶配置。

## 何时使用本技能

- 用户要求「把 markdown 转成 html」或「转换 md 文件」
- 用户想把「markdown 渲染成」HTML 输出
- 需要从 .md 文件生成 HTML 文档
- 正在用 Markdown 内容搭建静态站点
- 正在搭建把 markdown 转成 html 的模板系统
- 正在为已有模板系统开发工具、组件或自定义模板
- 想预览 Markdown 渲染成 HTML 后的样子

## 把 Markdown 转成 HTML

### 基础转换要点

更多内容见 [basic-markdown-to-html.md](references/basic-markdown-to-html.md)

```text
    ```markdown
    # Level 1
    ## Level 2

    One sentence with a [link](https://example.com), and a HTML snippet like `<p>paragraph tag</p>`.

    - `ul` list item 1
    - `ul` list item 2

    1. `ol` list item 1
    2. `ol` list item 1

    | Table Item | Description |
    | One | One is the spelling of the number `1`. |
    | Two | Two is the spelling of the number `2`. |

    ```js
    var one = 1;
    var two = 2;

    function simpleMath(x, y) {
     return x + y;
    }
    console.log(simpleMath(one, two));
    ```
    ```

    ```html
    <h1>Level 1</h1>
    <h2>Level 2</h2>

    <p>One sentence with a <a href="https://example.com">link</a>, and a HTML snippet like <code>&lt;p&gt;paragraph tag&lt;/p&gt;</code>.</p>

    <ul>
     <li>`ul` list item 1</li>
     <li>`ul` list item 2</li>
    </ul>

    <ol>
     <li>`ol` list item 1</li>
     <li>`ol` list item 2</li>
    </ol>

    <table>
     <thead>
      <tr>
       <th>Table Item</th>
       <th>Description</th>
      </tr>
     </thead>
     <tbody>
      <tr>
       <td>One</td>
       <td>One is the spelling of the number `1`.</td>
      </tr>
      <tr>
       <td>Two</td>
       <td>Two is the spelling of the number `2`.</td>
      </tr>
     </tbody>
    </table>

    <pre>
     <code>var one = 1;
     var two = 2;

     function simpleMath(x, y) {
      return x + y;
     }
     console.log(simpleMath(one, two));</code>
    </pre>
    ```
```

### 代码块转换

更多内容见 [code-blocks-to-html.md](references/code-blocks-to-html.md)

```text

    ```markdown
    your code here
    ```

    ```html
    <pre><code class="language-md">
    your code here
    </code></pre>
    ```

    ```js
    console.log("Hello world");
    ```

    ```html
    <pre><code class="language-js">
    console.log("Hello world");
    </code></pre>
    ```

    ```markdown
      ```

      ```
      visible backticks
      ```

      ```
    ```

    ```html
      <pre><code>
      ```

      visible backticks

      ```
      </code></pre>
    ```
```

### 折叠区块转换

更多内容见 [collapsed-sections-to-html.md](references/collapsed-sections-to-html.md)

```text
    ```markdown
    <details>
    <summary>More info</summary>

    ### Header inside

    - Lists
    - **Formatting**
    - Code blocks

        ```js
        console.log("Hello");
        ```

    </details>
    ```

    ```html
    <details>
    <summary>More info</summary>

    <h3>Header inside</h3>

    <ul>
     <li>Lists</li>
     <li><strong>Formatting</strong></li>
     <li>Code blocks</li>
    </ul>

    <pre>
     <code class="language-js">console.log("Hello");</code>
    </pre>

    </details>
    ```
```

### 数学表达式转换

更多内容见 [writing-mathematical-expressions-to-html.md](references/writing-mathematical-expressions-to-html.md)

```text
    ```markdown
    This sentence uses `$` delimiters to show math inline: $\sqrt{3x-1}+(1+x)^2$
    ```

    ```html
    <p>This sentence uses <code>$</code> delimiters to show math inline:
     <math-renderer><math xmlns="http://www.w3.org/1998/Math/MathML">
      <msqrt><mn>3</mn><mi>x</mi><mo>−</mo><mn>1</mn></msqrt>
      <mo>+</mo><mo>(</mo><mn>1</mn><mo>+</mo><mi>x</mi>
      <msup><mo>)</mo><mn>2</mn></msup>
     </math>
    </math-renderer>
    </p>
    ```

    ```markdown
    **The Cauchy-Schwarz Inequality**\
    $$\left( \sum_{k=1}^n a_k b_k \right)^2 \leq \left( \sum_{k=1}^n a_k^2 \right) \left( \sum_{k=1}^n b_k^2 \right)$$
    ```

    ```html
    <p><strong>The Cauchy-Schwarz Inequality</strong><br>
     <math-renderer>
      <math xmlns="http://www.w3.org/1998/Math/MathML">
       <msup>
        <mrow><mo>(</mo>
         <munderover><mo data-mjx-texclass="OP">∑</mo>
          <mrow><mi>k</mi><mo>=</mo><mn>1</mn></mrow><mi>n</mi>
         </munderover>
         <msub><mi>a</mi><mi>k</mi></msub>
         <msub><mi>b</mi><mi>k</mi></msub>
         <mo>)</mo>
        </mrow>
        <mn>2</mn>
       </msup>
       <mo>≤</mo>
       <mrow><mo>(</mo>
        <munderover><mo>∑</mo>
         <mrow><mi>k</mi><mo>=</mo><mn>1</mn></mrow>
         <mi>n</mi>
        </munderover>
        <msubsup><mi>a</mi><mi>k</mi><mn>2</mn></msubsup>
        <mo>)</mo>
       </mrow>
       <mrow><mo>(</mo>
         <munderover><mo>∑</mo>
          <mrow><mi>k</mi><mo>=</mo><mn>1</mn></mrow>
          <mi>n</mi>
         </munderover>
         <msubsup><mi>b</mi><mi>k</mi><mn>2</mn></msubsup>
         <mo>)</mo>
       </mrow>
      </math>
     </math-renderer></p>
    ```
```

### 表格转换

更多内容见 [tables-to-html.md](references/tables-to-html.md)

```text
    ```markdown
    | First Header  | Second Header |
    | ------------- | ------------- |
    | Content Cell  | Content Cell  |
    | Content Cell  | Content Cell  |
    ```

    ```html
    <table>
     <thead><tr><th>First Header</th><th>Second Header</th></tr></thead>
     <tbody>
      <tr><td>Content Cell</td><td>Content Cell</td></tr>
      <tr><td>Content Cell</td><td>Content Cell</td></tr>
     </tbody>
    </table>
    ```

    ```markdown
    | Left-aligned | Center-aligned | Right-aligned |
    | :---         |     :---:      |          ---: |
    | git status   | git status     | git status    |
    | git diff     | git diff       | git diff      |
    ```

    ```html
    <table>
      <thead>
       <tr>
        <th align="left">Left-aligned</th>
        <th align="center">Center-aligned</th>
        <th align="right">Right-aligned</th>
       </tr>
      </thead>
      <tbody>
       <tr>
        <td align="left">git status</td>
        <td align="center">git status</td>
        <td align="right">git status</td>
       </tr>
       <tr>
        <td align="left">git diff</td>
        <td align="center">git diff</td>
        <td align="right">git diff</td>
       </tr>
      </tbody>
    </table>
    ```
```

## 使用 [`markedJS/marked`](references/marked.md)

### 前置条件

- 已安装 Node.js（用于 CLI 或编程方式调用）
- 全局安装 marked 以使用 CLI：`npm install -g marked`
- 或在本地安装：`npm install marked`

### 快速转换方法

见 [marked.md](references/marked.md) 的 **Quick Conversion Methods**

### 分步工作流

见 [marked.md](references/marked.md) 的 **Step-by-Step Workflows**

### CLI 配置

### 使用配置文件

创建 `~/.marked.json` 保存持久化选项：

```json
{
  "gfm": true,
  "breaks": true
}
```

或使用自定义配置：

```bash
marked -i input.md -o output.html -c config.json
```

### CLI 选项参考

| 选项 | 说明 |
|--------|-------------|
| `-i, --input <file>` | 输入的 Markdown 文件 |
| `-o, --output <file>` | 输出的 HTML 文件 |
| `-s, --string <string>` | 直接解析字符串而不是文件 |
| `-c, --config <file>` | 使用自定义配置文件 |
| `--gfm` | 启用 GitHub Flavored Markdown |
| `--breaks` | 把换行转换成 `<br>` |
| `--help` | 显示全部选项 |

### 安全警告

⚠️ **Marked 不会对输出的 HTML 做净化。** 处理不可信输入时，请使用净化库（sanitizer）：

```javascript
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const unsafeHtml = marked.parse(untrustedMarkdown);
const safeHtml = DOMPurify.sanitize(unsafeHtml);
```

推荐使用的净化库：

- [DOMPurify](https://github.com/cure53/DOMPurify)（推荐）
- [sanitize-html](https://github.com/apostrophecms/sanitize-html)
- [js-xss](https://github.com/leizongmin/js-xss)

### 支持的 Markdown 方言

| 方言 | 支持度 |
|--------|---------|
| 原始 Markdown | 100% |
| CommonMark 0.31 | 98% |
| GitHub Flavored Markdown | 97% |

### 常见问题排查

| 现象 | 解决办法 |
|-------|----------|
| 文件开头出现特殊字符 | 剥离零宽字符：`content.replace(/^[\u200B\u200C\u200D\uFEFF]/,"")` |
| 代码块没有高亮 | 接入 highlight.js 之类的语法高亮器 |
| 表格渲染不出来 | 确认设置了 `gfm: true` 选项 |
| 换行被忽略 | 在选项里设置 `breaks: true` |
| 担心 XSS 漏洞 | 用 DOMPurify 净化输出 |

## 使用 [`pandoc`](references/pandoc.md)

### 前置条件

- 已安装 Pandoc（从 <https://pandoc.org/installing.html> 下载）
- 要输出 PDF：需要安装 LaTeX（macOS 上用 MacTeX，Windows 上用 MiKTeX，Linux 上用 texlive）
- 有可用的终端或命令行

### 快速转换方法

#### 方法 1：CLI 基础转换

```bash
# Convert markdown to HTML
pandoc input.md -o output.html

# Convert with standalone document (includes header/footer)
pandoc input.md -s -o output.html

# Explicit format specification
pandoc input.md -f markdown -t html -s -o output.html
```

#### 方法 2：过滤器模式（交互式）

```bash
# Start pandoc as a filter
pandoc

# Type markdown, then Ctrl-D (Linux/macOS) or Ctrl-Z+Enter (Windows)
Hello *pandoc*!
# Output: <p>Hello <em>pandoc</em>!</p>
```

#### 方法 3：格式转换

```bash
# HTML to Markdown
pandoc -f html -t markdown input.html -o output.md

# Markdown to LaTeX
pandoc input.md -s -o output.tex

# Markdown to PDF (requires LaTeX)
pandoc input.md -s -o output.pdf

# Markdown to Word
pandoc input.md -s -o output.docx
```

### CLI 配置

| 选项 | 说明 |
|--------|-------------|
| `-f, --from <format>` | 输入格式（markdown、html、latex 等） |
| `-t, --to <format>` | 输出格式（html、latex、pdf、docx 等） |
| `-s, --standalone` | 生成带页眉页脚的独立文档 |
| `-o, --output <file>` | 输出文件（按扩展名推断格式） |
| `--mathml` | 把 TeX 数学公式转成 MathML |
| `--metadata title="Title"` | 设置文档元数据 |
| `--toc` | 生成目录 |
| `--template <file>` | 使用自定义模板 |
| `--help` | 显示全部选项 |

### 安全警告

⚠️ **Pandoc 会原样处理输入。** 转换不可信的 markdown 时：

- 使用 `--sandbox` 模式禁用外部文件访问
- 处理前先校验输入
- 若要在浏览器里展示，先净化 HTML 输出

```bash
# Run in sandbox mode for untrusted input
pandoc --sandbox input.md -o output.html
```

### 支持的 Markdown 方言

| 方言 | 支持度 |
|--------|---------|
| Pandoc Markdown | 100%（原生） |
| CommonMark | 完整支持（使用 `-f commonmark`） |
| GitHub Flavored Markdown | 完整支持（使用 `-f gfm`） |
| MultiMarkdown | 部分支持 |

### 常见问题排查

| 现象 | 解决办法 |
|-------|----------|
| 生成 PDF 失败 | 安装 LaTeX（MacTeX、MiKTeX 或 texlive） |
| Windows 上编码出错 | 使用 pandoc 前先执行 `chcp 65001` |
| 缺少独立文档的页眉页脚 | 加 `-s` 参数生成完整文档 |
| 数学公式渲染不出来 | 使用 `--mathml` 或 `--mathjax` 选项 |
| 表格渲染不出来 | 确认表格语法正确（竖线与短横线） |

## 使用 [`gomarkdown/markdown`](references/gomarkdown.md)

### 前置条件

- 已安装 Go 1.18 或更高版本
- 安装该库：`go get github.com/gomarkdown/markdown`
- 要用 CLI 工具：`go install github.com/gomarkdown/mdtohtml@latest`

### 快速转换方法

#### 方法 1：简单转换（Go）

```go
package main

import (
    "fmt"
    "github.com/gomarkdown/markdown"
)

func main() {
    md := []byte("# Hello World\n\nThis is **bold** text.")
    html := markdown.ToHTML(md, nil, nil)
    fmt.Println(string(html))
}
```

#### 方法 2：CLI 工具

```bash
# Install mdtohtml
go install github.com/gomarkdown/mdtohtml@latest

# Convert file
mdtohtml input.md output.html

# Convert file (output to stdout)
mdtohtml input.md
```

#### 方法 3：自定义解析器与渲染器

```go
package main

import (
    "github.com/gomarkdown/markdown"
    "github.com/gomarkdown/markdown/html"
    "github.com/gomarkdown/markdown/parser"
)

func mdToHTML(md []byte) []byte {
    // Create parser with extensions
    extensions := parser.CommonExtensions | parser.AutoHeadingIDs | parser.NoEmptyLineBeforeBlock
    p := parser.NewWithExtensions(extensions)
    doc := p.Parse(md)

    // Create HTML renderer with extensions
    htmlFlags := html.CommonFlags | html.HrefTargetBlank
    opts := html.RendererOptions{Flags: htmlFlags}
    renderer := html.NewRenderer(opts)

    return markdown.Render(doc, renderer)
}
```

### CLI 配置

`mdtohtml` CLI 工具的可选项很少：

```bash
mdtohtml input-file [output-file]
```

需要进阶配置时，就用 Go 库以编程方式设置解析器与渲染器选项：

| 解析器扩展 | 说明 |
|------------------|-------------|
| `parser.CommonExtensions` | 表格、围栏代码、自动链接、删除线等 |
| `parser.AutoHeadingIDs` | 为标题生成 ID |
| `parser.NoEmptyLineBeforeBlock` | 块级元素前不需要空行 |
| `parser.MathJax` | 支持 LaTeX 数学公式的 MathJax |

| HTML 标志 | 说明 |
|-----------|-------------|
| `html.CommonFlags` | 常用的 HTML 输出标志 |
| `html.HrefTargetBlank` | 给链接加上 `target="_blank"` |
| `html.CompletePage` | 生成完整的 HTML 页面 |
| `html.UseXHTML` | 生成 XHTML 输出 |

### 安全警告

⚠️ **gomarkdown 不会对输出的 HTML 做净化。** 处理不可信输入时，请使用 Bluemonday：

```go
import (
    "github.com/microcosm-cc/bluemonday"
    "github.com/gomarkdown/markdown"
)

maybeUnsafeHTML := markdown.ToHTML(md, nil, nil)
html := bluemonday.UGCPolicy().SanitizeBytes(maybeUnsafeHTML)
```

推荐使用的净化库：[Bluemonday](https://github.com/microcosm-cc/bluemonday)

### 支持的 Markdown 方言

| 方言 | 支持度 |
|--------|---------|
| 原始 Markdown | 100% |
| CommonMark | 高（配合扩展） |
| GitHub Flavored Markdown | 高（表格、围栏代码、删除线） |
| MathJax/LaTeX 数学公式 | 通过扩展支持 |
| Mmark | 支持 |

### 常见问题排查

| 现象 | 解决办法 |
|-------|----------|
| Windows/Mac 换行解析不了 | 使用 `parser.NormalizeNewlines(input)` |
| 表格渲染不出来 | 启用 `parser.Tables` 扩展 |
| 代码块没有高亮 | 接入 Chroma 之类的语法高亮器 |
| 数学公式渲染不出来 | 启用 `parser.MathJax` 扩展 |
| XSS 漏洞 | 用 Bluemonday 净化输出 |

## 使用 [`jekyll`](references/jekyll.md)

### 前置条件

- Ruby 2.7.0 或更高版本
- RubyGems
- GCC 与 Make（用于编译原生扩展）
- 安装 Jekyll 与 Bundler：`gem install jekyll bundler`

### 快速转换方法

#### 方法 1：新建站点

```bash
# Create a new Jekyll site
jekyll new myblog

# Change to site directory
cd myblog

# Build and serve locally
bundle exec jekyll serve

# Access at http://localhost:4000
```

#### 方法 2：构建静态站点

```bash
# Build site to _site directory
bundle exec jekyll build

# Build with production environment
JEKYLL_ENV=production bundle exec jekyll build
```

#### 方法 3：实时重载开发

```bash
# Serve with live reload
bundle exec jekyll serve --livereload

# Serve with drafts
bundle exec jekyll serve --drafts
```

### CLI 配置

| 命令 | 说明 |
|---------|-------------|
| `jekyll new <path>` | 新建 Jekyll 站点 |
| `jekyll build` | 构建站点到 `_site` 目录 |
| `jekyll serve` | 本地构建并启动服务 |
| `jekyll clean` | 删除生成的文件 |
| `jekyll doctor` | 检查配置问题 |

| serve 选项 | 说明 |
|---------------|-------------|
| `--livereload` | 内容变化时自动刷新浏览器 |
| `--drafts` | 包含草稿文章 |
| `--port <port>` | 设置服务端口（默认 4000） |
| `--host <host>` | 设置服务主机（默认 localhost） |
| `--baseurl <url>` | 设置基础 URL |

### 安全警告

⚠️ **Jekyll 的安全注意事项：**

- 生产环境避免使用 `safe: false`
- 在 `_config.yml` 里用 `exclude` 阻止敏感文件被发布出去
- 接受外部输入时，对用户生成内容做净化
- 保持 Jekyll 与插件为最新版本

```yaml
# _config.yml security settings
exclude:
  - Gemfile
  - Gemfile.lock
  - node_modules
  - vendor
```

### 支持的 Markdown 方言

| 方言 | 支持度 |
|--------|---------|
| Kramdown（默认） | 100% |
| CommonMark | 通过插件（jekyll-commonmark） |
| GitHub Flavored Markdown | 通过插件（jekyll-commonmark-ghpages） |
| RedCarpet | 通过插件（已废弃） |

在 `_config.yml` 里配置 markdown 处理器：

```yaml
markdown: kramdown
kramdown:
  input: GFM
  syntax_highlighter: rouge
```

### 常见问题排查

| 现象 | 解决办法 |
|-------|----------|
| Ruby 3.0+ 起不了服务 | 执行 `bundle add webrick` |
| Gem 依赖报错 | 执行 `bundle install` |
| 构建很慢 | 使用 `--incremental` 参数 |
| Liquid 语法错误 | 检查内容里有没有未转义的 `{` |
| 插件没被加载 | 把插件加进 `_config.yml` 的 plugins 列表 |

## 使用 [`hugo`](references/hugo.md)

### 前置条件

- 已安装 Hugo（从 <https://gohugo.io/installation/> 下载）
- 已安装 Git（主题与模块推荐使用）
- 已安装 Go（可选，用于 Hugo Modules）

### 快速转换方法

#### 方法 1：新建站点

```bash
# Create a new Hugo site
hugo new site mysite

# Change to site directory
cd mysite

# Add a theme
git init
git submodule add https://github.com/theNewDynamic/gohugo-theme-ananke themes/ananke
echo "theme = 'ananke'" >> hugo.toml

# Create content
hugo new content posts/my-first-post.md

# Start development server
hugo server -D
```

#### 方法 2：构建静态站点

```bash
# Build site to public directory
hugo

# Build with minification
hugo --minify

# Build for specific environment
hugo --environment production
```

#### 方法 3：开发服务器

```bash
# Start server with drafts
hugo server -D

# Start with live reload and bind to all interfaces
hugo server --bind 0.0.0.0 --baseURL http://localhost:1313/

# Start with specific port
hugo server --port 8080
```

### CLI 配置

| 命令 | 说明 |
|---------|-------------|
| `hugo new site <name>` | 新建 Hugo 站点 |
| `hugo new content <path>` | 新建内容文件 |
| `hugo` | 构建站点到 `public` 目录 |
| `hugo server` | 启动开发服务器 |
| `hugo mod init` | 初始化 Hugo Modules |

| 构建选项 | 说明 |
|---------------|-------------|
| `-D, --buildDrafts` | 包含草稿内容 |
| `-E, --buildExpired` | 包含已过期内容 |
| `-F, --buildFuture` | 包含未来日期的内容 |
| `--minify` | 压缩输出 |
| `--gc` | 构建后执行垃圾回收 |
| `-d, --destination <path>` | 输出目录 |

| 服务器选项 | 说明 |
|----------------|-------------|
| `--bind <ip>` | 绑定的网卡地址 |
| `-p, --port <port>` | 端口号（默认 1313） |
| `--liveReloadPort <port>` | 实时重载端口 |
| `--disableLiveReload` | 关闭实时重载 |
| `--navigateToChanged` | 跳转到变化的内容 |

### 安全警告

⚠️ **Hugo 的安全注意事项：**

- 在 `hugo.toml` 里为外部命令配置安全策略
- 公开仓库中谨慎使用 `--enableGitInfo`
- 对用户生成内容要校验 shortcode 参数

```toml
# hugo.toml security settings
[security]
  enableInlineShortcodes = false
  [security.exec]
    allow = ['^go$', '^npx$', '^postcss$']
  [security.funcs]
    getenv = ['^HUGO_', '^CI$']
  [security.http]
    methods = ['(?i)GET|POST']
    urls = ['.*']
```

### 支持的 Markdown 方言

| 方言 | 支持度 |
|--------|---------|
| Goldmark（默认） | 100%（兼容 CommonMark） |
| GitHub Flavored Markdown | 完整支持（表格、删除线、自动链接） |
| CommonMark | 100% |
| Blackfriday（旧版） | 已废弃，不推荐 |

在 `hugo.toml` 里配置 markdown：

```toml
[markup]
  [markup.goldmark]
    [markup.goldmark.extensions]
      definitionList = true
      footnote = true
      linkify = true
      strikethrough = true
      table = true
      taskList = true
    [markup.goldmark.renderer]
      unsafe = false  # Set true to allow raw HTML
```

### 常见问题排查

| 现象 | 解决办法 |
|-------|----------|
| 路径报「Page not found」 | 检查配置里的 `baseURL` |
| 主题没被加载 | 确认主题在 `themes/` 或 Hugo Modules 中 |
| 构建很慢 | 用 `--templateMetrics` 定位瓶颈 |
| 原始 HTML 没被渲染 | 在 goldmark 配置里设置 `unsafe = true` |
| 图片加载不出来 | 检查 `static/` 目录结构 |
| 模块报错 | 执行 `hugo mod tidy` |

## 参考资料

### Markdown 的书写与排版

- [basic-markdown.md](references/basic-markdown.md)
- [code-blocks.md](references/code-blocks.md)
- [collapsed-sections.md](references/collapsed-sections.md)
- [tables.md](references/tables.md)
- [writing-mathematical-expressions.md](references/writing-mathematical-expressions.md)
- Markdown Guide: <https://www.markdownguide.org/basic-syntax/>
- Styling Markdown: <https://github.com/sindresorhus/github-markdown-css>

### [`markedJS/marked`](references/marked.md)

- 官方文档：<https://marked.js.org/>
- 进阶选项：<https://marked.js.org/using_advanced>
- 扩展性：<https://marked.js.org/using_pro>
- GitHub 仓库：<https://github.com/markedjs/marked>

### [`pandoc`](references/pandoc.md)

- 入门指南：<https://pandoc.org/getting-started.html>
- 官方文档：<https://pandoc.org/MANUAL.html>
- 扩展性：<https://pandoc.org/extras.html>
- GitHub 仓库：<https://github.com/jgm/pandoc>

### [`gomarkdown/markdown`](references/gomarkdown.md)

- 官方文档：<https://pkg.go.dev/github.com/gomarkdown/markdown>
- 进阶配置：<https://pkg.go.dev/github.com/gomarkdown/markdown@v0.0.0-20250810172220-2e2c11897d1a/html>
- Markdown 处理：<https://blog.kowalczyk.info/article/cxn3/advanced-markdown-processing-in-go.html>
- GitHub 仓库：<https://github.com/gomarkdown/markdown>

### [`jekyll`](references/jekyll.md)

- 官方文档：<https://jekyllrb.com/docs/>
- 配置选项：<https://jekyllrb.com/docs/configuration/options/>
- 插件：<https://jekyllrb.com/docs/plugins/>
  - [安装](https://jekyllrb.com/docs/plugins/installation/)
  - [生成器](https://jekyllrb.com/docs/plugins/generators/)
  - [转换器](https://jekyllrb.com/docs/plugins/converters/)
  - [命令](https://jekyllrb.com/docs/plugins/commands/)
  - [标签](https://jekyllrb.com/docs/plugins/tags/)
  - [过滤器](https://jekyllrb.com/docs/plugins/filters/)
  - [Hooks](https://jekyllrb.com/docs/plugins/hooks/)
- GitHub 仓库：<https://github.com/jekyll/jekyll>

### [`hugo`](references/hugo.md)

- 官方文档：<https://gohugo.io/documentation/>
- 全部设置项：<https://gohugo.io/configuration/all/>
- 编辑器插件：<https://gohugo.io/tools/editors/>
- GitHub 仓库：<https://github.com/gohugoio/hugo>
