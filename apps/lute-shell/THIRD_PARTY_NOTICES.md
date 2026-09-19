# Third-party notices · lute-shell

本壳（`apps/lute-shell`）的代码 100% 由 LUTE 撰写，但有两处与第三方的关系需要署名：一处是**改写自**第三方源码，一处是**只在包边界调用**第三方发布的包。下面分别说明。

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

## 3. 运行时消费的 harness 包：只在包边界调用，未复制源码

本壳运行时消费两个 harness 包：

- `@deepseek-ai/dsh-host-webserver`
- `@deepseek-ai/dsh-web-frontend`

二者在**本壳实际锁定的版本 `0.1.5-rc.2`** 上以 **MIT** 发布（npm `license` 字段实测）。本壳只按包边界调用它们的公开导出——`dsh-host-webserver` 的 `renderIndexInjections`、`dsh-web-frontend` 的 `dist/index.html`——没有复制它们的任何源码，故此处不附带其许可全文。若将来改为复制源码或内联其构建产物，必须在本节补上对应署名。

**测量口径（防止把错的许可钉进来）**：这两个包的 npm `latest` dist-tag 仍指向最早的 `0.0.1-rc.*`（`dsh-host-webserver` = `0.0.1-rc.1`，`dsh-web-frontend` = `0.0.1-rc.5`），而那批版本声明的是 `BSD-3-Clause`。所以不带版本号跑 `npm view <pkg> license` 会读到 `BSD-3-Clause`——那不是本壳消费的那一版。当前发布线（`0.1.5-rc.1` 到 `0.1.6-alpha.2`）逐版实测均为 `MIT`，`next` dist-tag = `0.1.5-rc.2`，正是本壳锁定的版本。核对许可必须带版本号：

```sh
npm view @deepseek-ai/dsh-host-webserver@0.1.5-rc.2 license
npm view @deepseek-ai/dsh-web-frontend@0.1.5-rc.2 license
```

升级这两个包时重跑上面两条，许可变了就改本节。
