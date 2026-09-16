# SEC-RT-001 · Shopify host 规范化与凭证外传阻断

- 优先级：P0
- 状态：`local-complete / live-deferred`
- 所属批次：[BATCH-001](../batches/BATCH-001-boundary-and-shopify.md)
- 依赖：`BASE-001`、`BASE-002`
- 风险类型：SSRF / client secret 与 access token exfiltration

## Problem

当前 `dsh-wanzh-hulian` 将用户保存的 `shopify_domain` 直接插入：

- `https://${domain}/admin/oauth/access_token`
- `https://${domain}/admin/api/2026-04/shop.json`

保存路径只检查非空，历史凭证读取只做 `trim()`。攻击者或脏历史值可把 Shopify client secret/access token 发送到任意可构造 host。

## Official constraint

本任务采用 Shopify 官方 client credentials 文档的最小兼容面：请求目标是商店的 `{shop}.myshopify.com` Admin API host；access token 通过 `X-Shopify-Access-Token` 使用。该 grant 只适用于同一 Shopify organization 下的 app/store，但组织授权范围不是本卡的网络 host 修复范围。

- [Client credentials grant](https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant)
- [Access tokens](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens)

## Contract

### `normalizeShopifyHost(raw)`

成功返回：

```js
{ ok: true, host: 'example-shop.myshopify.com' }
```

失败返回：

```js
{ ok: false, error: '可公开显示且不包含输入 secret 的错误' }
```

规则：

- 输入必须是 string，允许首尾空白和 ASCII 大小写，输出 `trim().toLowerCase()`；
- 完整 host 必须恰好是一个 shop label 加 `.myshopify.com`；
- label 长度 1–63，只允许 ASCII `a-z0-9-`，首尾不能是 `-`；
- 拒绝 `xn--` label，避免在当前无 IDN 产品需求下接受 Unicode/Punycode 混淆；
- 拒绝 scheme、userinfo、path、query、fragment、port、IP、尾随点、空 label、额外子域和伪后缀；
- 不自动从 URL 中抽取 host，不猜测用户意图。

### Safe network boundary

- token exchange 和 Admin API probe 必须共用一个 safe request helper；
- helper 在**每次 I/O 前**重新调用 normalizer，历史脏值不能绕过保存时检查；
- URL 使用 `new URL(pathname, 'https://' + validatedHost)` 从已验证 host 构造；
- 强制 `redirect: 'error'`，调用方不能恢复 `follow`，避免 307/308 将 body 或 token header 带到第二个 origin；
- 非法输入返回结构化失败，`fetch` 调用数必须为 0；
- error/log 不回显 client secret/access token。

### Save/read behavior

- 保存 `shopify_domain` 时先规范化，只落规范化 host；非法输入返回 400，不能调用 credential store；
- 读取历史 domain 时再规范化；非法旧值标记为未配置，并给出重新填写提示；
- 不迁移、不删除、不猜测修复历史值。

## Test matrix

### Positive

- `example-shop.myshopify.com`
- `  EXAMPLE-Shop.MyShopify.Com  ` → `example-shop.myshopify.com`
- `a.myshopify.com`
- 63 字符合法 label

### Negative

- empty / non-string
- `https://shop.myshopify.com`
- `user@shop.myshopify.com`
- `shop.myshopify.com/path`
- `shop.myshopify.com?x=1`
- `shop.myshopify.com#x`
- `shop.myshopify.com:443`
- `shop.myshopify.com.`
- `.myshopify.com`
- `a.b.myshopify.com`
- `shop.myshopify.com.evil.example`
- `shop-myshopify.com`
- `127.0.0.1` / `[::1]`
- leading/trailing hyphen、underscore、Unicode full stop、Unicode label、`xn--...`
- 64 字符 label

每个 negative case 都要同时断言 normalizer 失败和 mock fetch count 为 0。

## Implementation plan

- [x] 在 `host-util.js` 添加纯 normalizer 和 safe fetch helper；未新增 dependency。
- [x] 先加入测试并取得真实 Red。
- [x] `index.js` 保存路径改用 normalizer。
- [x] 历史读取路径 fail-closed。
- [x] token exchange 与 Admin API probe 改用 safe helper。
- [x] 包测试、typecheck、diff check 通过。
- [x] 记录 E1/E2 与未验证边界。

## Acceptance

### Automated

- [x] 正负矩阵完整；invalid fetch count=0。
- [x] 合法 token URL 精确为 `https://<shop>.myshopify.com/admin/oauth/access_token`。
- [x] 合法 Admin URL 精确为预期 `/admin/api/2026-04/shop.json`。
- [x] 两条网络路径没有未验证字符串插值。
- [x] package test/typecheck 退出码 0。
- [x] 三目标文件以外无本批产品代码变化。

### Deferred

- [ ] 测试店铺保存和只读连接（需真实凭证/外部操作授权）。
- [ ] live profile/loadpoint 与 DSH restart 后验收。
- [ ] clean-machine/DMG/release/production 验收。

## Rollback

若发现官方合法商店 host 被拒绝，只能根据官方证据扩充规则并添加 case。紧急回退是禁用 Shopify 连接；不得恢复接受任意 host，也不得把 access token/client secret 发给用户提供的 URL。

## Evidence

- Red：首次目标测试 exit 1，ESM 报告 `fetchShopifyAdmin` export 不存在。
- Green：`node --test test/*.spec.mjs` 为 17/17 pass；包含 25 个非法 host、两条合法 Admin URL、三类 path origin bypass、redirect override 和 secret canary。
- Type：`tsc -p tsconfig.json --pretty false` exit 0。
- Hygiene：目标 package `git diff --check` exit 0。
- 未验证：真实测试店铺、live DSH/profile/loadpoint、clean machine、CI、DMG、Release、canary、production。
