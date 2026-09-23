/**
 * 安全契约清单登记表（SEC-RT-010 / ADR-0119）。
 * 
 * 映射 SEC-RT-001 ~ SEC-RT-009 与 SEC-RT-003A 的静态契约、测试套件、故障注入点与防御边界。
 * 每一个登记项具备：
 * - id: 任务唯一标识 (contract id)
 * - name: 契约人可读名称
 * - owner: 责任人
 * - targetFiles: 核心受保护源文件
 * - testFiles: 对应的 Green 测试用例或验证套件
 * - faultPoints: 故障注入与变异断言描述
 * - runTier: 'quick' | 'full'
 *   'quick' = gate.mjs 有判据无条件点名执行该 testFile（每轮 quick 必跑）；
 *   'full'  = 无无条件 quick 入口，实际覆盖 = changed-packages 条件执行
 *   （本包进改动射程时 quick 跑其 test 脚本）+ scripts-runnable 在 full 无条件跑。
 *   残余 gap（quick 抓不到跨包回归，full 推送前仍抓）2026-09-23 经 DA-29 处置
 *   A 拍板接受：宁要登记与事实一致，不要声明 quick 却没有无条件入口。
 * - releaseBlocker: 是否为发布阻塞项 (P0/P1)
 */

export const SECURITY_CONTRACT_REGISTRY = [
  {
    id: 'SEC-RT-001',
    name: 'Shopify hostname 规范化与凭证外传阻断',
    owner: 'lute',
    targetFiles: [
      'packages/capabilities/dsh-wanzh-hulian/lib/host-util.js',
    ],
    testFiles: [
      'packages/capabilities/dsh-wanzh-hulian/test/wanzh-hulian.spec.mjs',
    ],
    faultPoints: [
      '非法 hostname 绕过 I/O 校验',
      '绝对 URL / network-path 改写已验证 origin',
      '重定向被允许追随 (follow redirect)',
      '错误信息回显 secret canary',
    ],
    runTier: 'quick',
    releaseBlocker: true,
  },
  {
    id: 'SEC-RT-002',
    name: '外部执行物与技能不可变供应链',
    owner: 'lute',
    targetFiles: [
      'packages/capabilities/dsh-wanzh-hulian/lib/index.js',
      'packages/capabilities/dsh-loopx-plugin/lib/init-command.js',
      'packages/capabilities/dsh-overseas-skills/scripts/third-party-source-inventory.json',
      'packages/capabilities/dsh-overseas-skills/scripts/fetch-third-party-skills.mjs',
      'packages/capabilities/dsh-overseas-skills/scripts/import-fullstack.mjs',
    ],
    testFiles: [
      'packages/capabilities/dsh-wanzh-hulian/test/supply-chain-integrity.spec.mjs',
      'packages/capabilities/dsh-loopx-plugin/test/supply-chain-pinned.spec.mjs',
      'packages/capabilities/dsh-overseas-skills/test/immutable-supply-chain.spec.mjs',
      'scripts/gates/immutable-supply-chain.test.mjs',
    ],
    faultPoints: [
      'MCP 配置出现浮动 npx -y 或 @latest',
      'LoopX 包含 loopx>= 范围声明或 --upgrade',
      '第三方技能缺失 40 位 hex commit',
      'fetch 脚本出现 trees/HEAD 或 /HEAD/ 浮动指针',
      'import-fullstack 出现 /tmp 回退',
    ],
    runTier: 'full',
    releaseBlocker: true,
  },
  {
    id: 'SEC-RT-003',
    name: '子进程环境变量 allowlist 与 LoopX 启动隔离',
    owner: 'lute',
    targetFiles: [
      'packages/capabilities/dsh-loopx-plugin/lib/env-policy.js',
    ],
    testFiles: [
      'packages/capabilities/dsh-loopx-plugin/test/env-policy.test.mjs',
    ],
    faultPoints: [
      '父进程 OPENAI_API_KEY / GITHUB_TOKEN 逃逸泄漏至子进程',
      'NODE_OPTIONS 危险环境变量渗透',
      'extraEnv 注入非允许的 secret 前缀变量',
    ],
    runTier: 'full',
    releaseBlocker: true,
  },
  {
    id: 'SEC-RT-003A',
    name: '破坏性 preset/skill 操作的路径封闭与全批事务',
    owner: 'lute',
    targetFiles: [
      'scripts/lib/preset-skill-paths.mjs',
      'scripts/lib/preset-skill-transaction.mjs',
    ],
    testFiles: [
      'scripts/lib/preset-skill-paths.test.mjs',
      'scripts/lib/preset-skill-transaction.test.mjs',
      'scripts/gates/session-refs-fail-closed.test.mjs',
      'scripts/gates/preset-maintenance-transaction.test.mjs',
    ],
    faultPoints: [
      '路径穿越 ../ 逃逸出用户目录',
      'symlink / hardlink 导致目标被篡改',
      '批处理中途故障缺少 journal 回滚',
      '非原子写入导致半提交或坏文件状态',
    ],
    runTier: 'quick',
    releaseBlocker: true,
  },
  {
    id: 'SEC-RT-004',
    name: 'Team Hub 插件 HTTP 路由 default-deny 与多用户隔离',
    owner: 'lute',
    targetFiles: [
      'packages/infra/dsh-team-hub/src/route-guard.mjs',
      'packages/infra/dsh-team-hub/src/server.mjs',
    ],
    testFiles: [
      'packages/infra/dsh-team-hub/test/route-guard.test.mjs',
      'packages/infra/dsh-team-hub/test/plugin-routes.test.mjs',
    ],
    faultPoints: [
      '未在白名单中的插件路由被普通 member 越权访问',
      'URL 编码绕过路径规范化',
      'admin 端点缺乏管理权限拦截',
    ],
    runTier: 'full',
    releaseBlocker: true,
  },
  {
    id: 'SEC-RT-005',
    name: 'HTTP body 大小、时间和解析边界 (有界读取器)',
    owner: 'lute',
    targetFiles: [
      'packages/capabilities/dsh-wanzh-hulian/lib/bounded-body.js',
      'packages/infra/dsh-team-hub/src/bounded-body.mjs',
    ],
    testFiles: [
      'packages/capabilities/dsh-wanzh-hulian/test/bounded-body.spec.mjs',
      'packages/infra/dsh-team-hub/test/bounded-body.test.mjs',
    ],
    faultPoints: [
      '超大请求体导致内存溢出 (DoS 攻击)',
      '慢速请求连接挂起超时',
      '畸形 JSON 请求体导致进程崩溃',
    ],
    runTier: 'full',
    releaseBlocker: true,
  },
  {
    id: 'SEC-RT-006',
    name: 'Wanzh 配置与 token 原子持久化与 fail-closed',
    owner: 'lute',
    targetFiles: [
      'packages/capabilities/dsh-wanzh-hulian/lib/atomic-store.js',
    ],
    testFiles: [
      'packages/capabilities/dsh-wanzh-hulian/test/atomic-store.spec.mjs',
      'packages/capabilities/dsh-wanzh-hulian/test/persistence.spec.mjs',
      'packages/capabilities/dsh-wanzh-hulian/test/persistence-failclosed.spec.mjs',
      'packages/capabilities/dsh-wanzh-hulian/test/persistence-inventory.spec.mjs',
    ],
    faultPoints: [
      '直接非原子覆盖目标文件导致断电损坏',
      '权限位被置为全局可读 (未设 0600)',
      '损坏或畸形状态文件未触发 fail-closed 并保护原现场',
    ],
    runTier: 'quick',
    releaseBlocker: true,
  },
  {
    id: 'SEC-RT-007',
    name: 'OAuth flow 生命周期、超时和 disposer 清理',
    owner: 'lute',
    targetFiles: [
      'packages/capabilities/dsh-wanzh-hulian/lib/oauth-flow.js',
    ],
    testFiles: [
      'packages/capabilities/dsh-wanzh-hulian/test/oauth-flow.spec.mjs',
      'packages/capabilities/dsh-wanzh-hulian/test/oauth-routes.spec.mjs',
    ],
    faultPoints: [
      '并发启动多个 OAuth 回调监听器',
      '超时未释放端口与回调资源',
      '插件卸载时未回收活跃连接',
    ],
    runTier: 'quick',
    releaseBlocker: true,
  },
  {
    id: 'SEC-RT-008',
    name: 'Team Hub session 原子存储、性能与损坏归档',
    owner: 'lute',
    targetFiles: [
      'packages/infra/dsh-team-hub/src/session-store.mjs',
    ],
    testFiles: [
      'packages/infra/dsh-team-hub/test/session-store.test.mjs',
      'packages/infra/dsh-team-hub/test/policy.test.mjs',
    ],
    faultPoints: [
      '高并发写入丢失 session',
      '损坏 session.json 未经备份直接抹去',
      '内存缓存与磁盘未原子对齐',
    ],
    runTier: 'full',
    releaseBlocker: true,
  },
  {
    id: 'SEC-RT-009',
    name: 'Team Hub 暴露模式、TLS、cookie 与防暴力破解',
    owner: 'lute',
    targetFiles: [
      'packages/infra/dsh-team-hub/src/config.mjs',
      'packages/infra/dsh-team-hub/src/login-limiter.mjs',
      'packages/infra/dsh-team-hub/src/server.mjs',
    ],
    testFiles: [
      'packages/infra/dsh-team-hub/test/security-hardening.test.mjs',
    ],
    faultPoints: [
      'lan 模式在 0.0.0.0 上使用明文 HTTP 启动',
      '非受信代理 X-Forwarded-* 头被采信',
      'HTTPS 缺少 Secure; HttpOnly; SameSite Cookie 标识',
      '跨域伪造状态修改请求 (CSRF 漏洞)',
      '恶意高频登录未触发 429 与指数退避',
    ],
    runTier: 'full',
    releaseBlocker: true,
  },
  {
    id: 'SEC-RT-011',
    name: '对象库不得承载超大对象与 repack 垃圾残留',
    owner: 'lute',
    targetFiles: [
      'scripts/gates/object-store-hygiene.mjs',
    ],
    testFiles: [
      'scripts/gates/object-store-hygiene.test.mjs',
    ],
    faultPoints: [
      '6.8 GB 的 ~/.dsh 全量快照（内含活凭证 .credentials.yaml）被 git add 后经 codex checkpoint 的 write-tree 静默写入对象库（2026-09-18 实测，已移除）',
      '被中断的 repack 留下 tmp_pack_* 垃圾包，因 gc 的 2 周 pruneExpire 而长期滞留',
      '单对象体积阈值被「拆成多块」绕过',
      '对象库总量未设上限，只在磁盘告急时才发现',
    ],
    runTier: 'quick',
    releaseBlocker: true,
  },
]
