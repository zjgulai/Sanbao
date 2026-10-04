# Third-party notices · sage-shell

本壳（`apps/sage-shell`）包含自有代码、基于 DeepSeek Harness 的改写，以及通过包边界消费的运行时。以下分别说明来源与许可。

## 1. 帧协议：改写自 MIT 许可的 DeepSeek Harness

`src/protocol.ts` 的帧格式与编解码实现改写自 DeepSeek Harness 的 Electron Desktop Host 管道传输层。参照的两个文件是：

- `apps/desktop-host/src/wire.ts`（Host 侧：编码响应帧、解码请求帧）
- `apps/desktop/src/host-protocol.ts`（Desktop 侧：编码请求帧、解码响应帧）

参照副本在本仓的只读 submodule `vendor/dsh-desktop/deepseek-harness/`（pin 契约见 `vendor/dsh-desktop.pin`；ADR-0008：只 pin 不改）。

改写过来的帧格式是 13 字节 header 加变长 payload：

| 偏移 | 宽度 | 字段 |
| --- | --- | --- |
| 0 | `u32BE` | magic `0x44534833` |
| 4 | `u8` | type |
| 5 | `u32BE` | streamId |
| 9 | `u32BE` | payloadLength |

- 请求帧 type 1-4 = `start` / `data` / `end` / `cancel`
- 响应帧 type 1-4 = `start` / `data` / `end` / `error`
- 数据帧 payload ≤ 64 KiB（`64 * 1024`）；控制帧 payload ≤ 1 MiB（`1024 * 1024`）

## 2. MIT License 全文

上面那处改写依据的许可条款，逐字复制自 `vendor/dsh-desktop/deepseek-harness/LICENSE`：

MIT License

Copyright (c) 2026 DeepSeek

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## 3. 运行时包边界：Sage 自有页面不再服务上游 UI

P0-2 的自有页面由 `src/product/renderer.ts` 输出，并仅通过 `src/adapter/` 的固定状态与 action 合同访问宿主。壳仍按包边界使用 Cordis、`dsh-app-boot`、cmdline、launch-environment 与 connection 类型；没有复制这些包的源码。

`@deepseek-ai/dsh-host-webserver` 与 `@deepseek-ai/dsh-web-frontend` 可能仍因 profile 的锁定依赖图存在，但 Sage 不再调用前者的 index 注入，也不再从 Sage 的资产或路由层服务、注入或改写后者的页面、客户端 bundle 或 Conversation slot。保留依赖图不等于保留产品 UI 消费面；依赖删减需在后续单独审计后进行，不能凭名称盲删。

已移除的 Composer 兼容适配、上游客户端 fixture 与默认 onboarding 不再属于 Sage 的运行时或测试物化面。因此本 notice 不再把它们陈述为当前消费事实；本文件第 1–2 节的 MIT 许可与只读 vendor 参照仍完整保留。

## 4. 渲染器 bundle：React（MIT）与构建期工具

`src/product/app/` 的 Sage 自有渲染器应用使用 React，并由 esbuild 在构建期把 react/react-dom 代码打包进 `lib/product/app-bundle.js`（单文件内联进 Sage 文档，ADR-0261）。以下包以精确版本锁在 `apps/sage-shell/package.json` 的 devDependencies：

| 包 | 性质 | 许可 |
| --- | --- | --- |
| `react`、`react-dom` | 代码随 bundle 分发进产品文档 | MIT（Copyright (c) Meta Platforms, Inc. and affiliates.；条款全文同 §2） |
| `esbuild` | 仅构建期使用，不随产品分发 | MIT |
| `jsdom` | 仅测试期使用，不随产品分发 | MIT |
| `@types/react`、`@types/react-dom` | DefinitelyTyped 类型声明，仅编译期使用 | MIT |
