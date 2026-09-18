# P0 Thin-Shell Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify that LUTE can consume deepseek-harness runtime packages from npm and boot a cordis host independently of `anywhere-labs/dsh-desktop`, proving the thin-shell architecture viable.

**Architecture:** A throwaway Node.js project in `/tmp/lute-shell-spike/` installs harness packages from npm, boots a cordis host using the same dependency set as the harness's own `apps/desktop-host`, loads one LUTE plugin (`dsh-theme-local`), and verifies pnpm patch works against a harness package. Results are recorded as PASS/FAIL with command output evidence.

**Tech Stack:** Node.js 22+, pnpm 10, `@deepseek-ai/dsh` 0.1.5-rc.2, `@deepseek-ai/cordis`, `@deepseek-ai/dsh-app-boot`

**Spec:** `docs/superpowers/specs/2026-09-19-base-decoupling-design.md` §4

## Global Constraints

- All work happens in `/tmp/lute-shell-spike/` — the Magpie-Horch repo is NOT modified (except the final research doc).
- No Electron window, no branding, no packaging.
- Reference source: `~/project/Magpie-Horch/vendor/dsh-desktop/deepseek-harness/` (read-only submodule).
- The spike project is throwaway; only the research doc survives.
- pnpm version must match the harness's `packageManager` field (pnpm 10.x).

---

### Task 1: Verify npm registry availability

**Files:**
- Create: `/tmp/lute-shell-spike/package.json`
- Output: evidence captured in terminal

**Interfaces:**
- Consumes: nothing
- Produces: PASS/FAIL verdict for premise #1; list of available `@deepseek-ai/*` packages and versions

- [ ] **Step 1: Create spike directory and init project**

```bash
rm -rf /tmp/lute-shell-spike && mkdir -p /tmp/lute-shell-spike && cd /tmp/lute-shell-spike
pnpm init
```

- [ ] **Step 2: Query npm registry for key harness packages**

```bash
cd /tmp/lute-shell-spike
npm view @deepseek-ai/dsh versions --json 2>&1 | tail -5
npm view @deepseek-ai/dsh-app-boot versions --json 2>&1 | tail -5
npm view @deepseek-ai/cordis versions --json 2>&1 | tail -5
npm view @deepseek-ai/dsh-host-webserver versions --json 2>&1 | tail -3
npm view @deepseek-ai/dsh-client-connection versions --json 2>&1 | tail -3
npm view @deepseek-ai/dsh-launch-environment versions --json 2>&1 | tail -3
```

Expected: each command returns a version array containing `0.1.5-rc.2` or similar. If any returns 404, record FAIL and note which package is missing.

- [ ] **Step 3: Install the core dependency set**

```bash
cd /tmp/lute-shell-spike
pnpm add @deepseek-ai/dsh@0.1.5-rc.2 @deepseek-ai/dsh-app-boot @deepseek-ai/cordis @deepseek-ai/dsh-host-webserver @deepseek-ai/dsh-client-connection @deepseek-ai/dsh-launch-environment @deepseek-ai/cordis-plugin-include @deepseek-ai/dsh-client-modules @deepseek-ai/dsh-api-gateway @deepseek-ai/dsh-cmdline @deepseek-ai/dsh-web-frontend
```

Expected: install succeeds, `node_modules/@deepseek-ai/dsh/` exists. If version `0.1.5-rc.2` is not available for some packages, use the latest available rc version and record the deviation.

- [ ] **Step 4: Verify installed versions**

```bash
cd /tmp/lute-shell-spike
node -e "const p = require('./node_modules/@deepseek-ai/dsh/package.json'); console.log(p.name, p.version)"
ls node_modules/@deepseek-ai/ | wc -l
```

Expected: prints `@deepseek-ai/dsh 0.1.5-rc.2` (or the version installed); count ≥ 10 packages.

- [ ] **Step 5: Record verdict**

Write PASS or FAIL for premise #1 with the evidence (version numbers, package count, any 404s).

---

### Task 2: Boot a cordis host independently

**Files:**
- Create: `/tmp/lute-shell-spike/boot.mjs`
- Reference (read-only): `~/project/Magpie-Horch/vendor/dsh-desktop/deepseek-harness/apps/desktop-host/lib/index.js`

**Interfaces:**
- Consumes: `@deepseek-ai/dsh-app-boot`, `@deepseek-ai/cordis`, `@deepseek-ai/dsh-host-webserver` from Task 1's install
- Produces: PASS/FAIL for premise #2; a running cordis root process (or crash log explaining why not)

- [ ] **Step 1: Read the reference boot sequence**

```bash
cat ~/project/Magpie-Horch/vendor/dsh-desktop/deepseek-harness/apps/desktop-host/lib/index.js
```

Identify: what function/class is imported from `@deepseek-ai/dsh-app-boot`, what arguments it takes, what services it registers. Note the minimal boot path (ignore desktop-specific things like window management, tray, native dialogs).

- [ ] **Step 2: Write minimal boot script**

Create `/tmp/lute-shell-spike/boot.mjs` based on what Step 1 revealed. The script should:
1. Import the boot entry from `@deepseek-ai/dsh-app-boot`
2. Create a cordis root
3. Register the webserver service (headless, no Electron renderer needed)
4. Log success and exit (or hang with a "host ready" message)

The exact code depends on Step 1's findings. If `dsh-app-boot` exports a `boot()` or `createHost()` function, call it with minimal config. If it requires a profile path, create a minimal profile:

```bash
mkdir -p /tmp/lute-shell-spike/profile
cat > /tmp/lute-shell-spike/profile/package.json << 'EOF'
{
  "name": "lute-spike-profile",
  "private": true,
  "type": "module",
  "dependencies": {}
}
EOF
```

- [ ] **Step 3: Run the boot script**

```bash
cd /tmp/lute-shell-spike
node boot.mjs
```

Expected: process starts, logs indicate cordis root created and services registered, no crash. A timeout of 10 seconds with no crash = PASS. If it crashes with "cannot find module X", install the missing package and retry (record each missing dep as a finding).

- [ ] **Step 4: If boot fails, diagnose and retry**

Common failure modes:
- Missing peer dependency → `pnpm add <missing>` and retry
- Requires Electron APIs → stub them or find the headless alternative in the harness
- Requires a specific profile structure → copy the minimal profile from `~/.dsh/profiles/desktop/package.json` (just the dependency declarations, not the full 25-package set)

Record each retry and its outcome.

- [ ] **Step 5: Record verdict**

PASS if cordis root boots and stays alive for 10s without crash. FAIL with diagnosis if it cannot boot even after retries.

---

### Task 3: Load a LUTE plugin in the new host

**Files:**
- Modify: `/tmp/lute-shell-spike/profile/package.json` (add dsh-theme-local as file: dep)
- Modify: `/tmp/lute-shell-spike/boot.mjs` (if needed, to point at profile)
- Reference: `~/project/Magpie-Horch/packages/platform/dsh-theme-local/`

**Interfaces:**
- Consumes: working cordis host from Task 2
- Produces: PASS/FAIL for premise #3; list of services the plugin needs that the host must provide

- [ ] **Step 1: Add dsh-theme-local to spike profile**

```bash
cd /tmp/lute-shell-spike/profile
pnpm add dsh-theme@file:/Users/lute/project/Magpie-Horch/packages/platform/dsh-theme-local
```

If pnpm refuses due to the package being `private: true`, use:
```bash
cd /tmp/lute-shell-spike/profile
mkdir -p node_modules
ln -s /Users/lute/project/Magpie-Horch/packages/platform/dsh-theme-local node_modules/dsh-theme
```

- [ ] **Step 2: Declare the plugin in cordis.patch.yml**

```bash
cat > /tmp/lute-shell-spike/profile/cordis.patch.yml << 'EOF'
plugins:
  - dsh-theme
EOF
```

Or if the host uses a different plugin declaration mechanism (discovered in Task 2 Step 1), use that instead.

- [ ] **Step 3: Boot with the plugin**

```bash
cd /tmp/lute-shell-spike
node boot.mjs
```

Expected: logs show `dsh-theme` loaded and activated. Look for cordis lifecycle messages like `[plugin] dsh-theme activated` or absence of `pending (waiting for service)`.

- [ ] **Step 4: If plugin fails to activate, diagnose**

Check logs for:
- `failed to import loader entry` → the plugin's `lib/index.js` has an unmet import; install the missing dep
- `pending (waiting for service X)` → the host doesn't provide service X; record X as a "thin shell must implement" item
- `does not provide an export named Y` → version mismatch between plugin expectation and installed harness

Record each missing service/export as a finding for the design doc.

- [ ] **Step 5: Record verdict**

PASS if plugin reaches `activated` state. PARTIAL PASS if plugin loads but some features are inactive due to missing services (list them). FAIL if plugin cannot load at all.

---

### Task 4: Verify pnpm patch on a harness package

**Files:**
- Modify: `/tmp/lute-shell-spike/package.json` (pnpm.patchedDependencies)
- Create: `/tmp/lute-shell-spike/patches/@deepseek-ai+dsh-llm@*.patch`

**Interfaces:**
- Consumes: `@deepseek-ai/dsh-llm` installed from npm (Task 1)
- Produces: PASS/FAIL for premise #4; a working .patch file demonstrating the mechanism

- [ ] **Step 1: Install dsh-llm if not already present**

```bash
cd /tmp/lute-shell-spike
pnpm add @deepseek-ai/dsh-llm
```

- [ ] **Step 2: Create a patch**

```bash
cd /tmp/lute-shell-spike
pnpm patch @deepseek-ai/dsh-llm
```

pnpm will print a temp directory path. In that directory, make a trivial change:

```bash
# Replace <TEMP_DIR> with the path pnpm printed
echo "// LUTE spike was here" >> <TEMP_DIR>/package.json
```

Then commit the patch:

```bash
pnpm patch-commit <TEMP_DIR>
```

- [ ] **Step 3: Verify patch applies on fresh install**

```bash
cd /tmp/lute-shell-spike
rm -rf node_modules
pnpm install
grep "LUTE spike was here" node_modules/@deepseek-ai/dsh-llm/package.json
```

Expected: grep finds the marker string, proving the patch was applied during install.

- [ ] **Step 4: Verify patch conflict detection**

Bump the package to a different version (if available) and observe pnpm's error:

```bash
cd /tmp/lute-shell-spike
pnpm add @deepseek-ai/dsh-llm@latest
```

If a newer version exists and the patch conflicts, pnpm should report `ERR_PNPM_PATCH_NOT_APPLIED`. If no newer version exists, this step is informational only — record that conflict detection was not testable with current versions.

- [ ] **Step 5: Record verdict**

PASS if patch applies cleanly on fresh install. FAIL if pnpm patch mechanism doesn't work with these packages.

---

### Task 5: Write the research doc

**Files:**
- Create: `~/project/Magpie-Horch/docs/research/17-thin-shell-spike.md`

**Interfaces:**
- Consumes: verdicts from Tasks 1-4
- Produces: the permanent spike record in the repo

- [ ] **Step 1: Write the research doc**

Create `docs/research/17-thin-shell-spike.md` with this structure:

```markdown
# 薄壳 Spike 验证报告（P0）

> 日期：2026-09-19
> 状态：spike 完结
> 关联：[设计 spec](../superpowers/specs/2026-09-19-base-decoupling-design.md) §4
> 证据级别：Fact = 命令输出实截；Inference = 推断需后续验证

## 总结

| # | 前提 | 结论 | 关键证据 |
|---|---|---|---|
| 1 | npm 可安装 | PASS/FAIL | 版本号、包数量 |
| 2 | 独立 boot | PASS/FAIL | 启动日志/崩溃栈 |
| 3 | 插件加载 | PASS/PARTIAL/FAIL | 激活日志/缺失服务清单 |
| 4 | pnpm patch | PASS/FAIL | grep 输出 |

## 1. npm 可用性

[命令输出证据]

## 2. 独立 Boot

[boot.mjs 源码 + 运行日志]

### 发现的额外依赖

[如果 boot 过程中需要安装额外包，列在这里]

## 3. 插件加载

[激活日志]

### 薄壳必须实现的服务清单

[如果 PARTIAL PASS，列出缺失服务]

## 4. pnpm patch

[patch 文件内容 + grep 验证输出]

## 5. 结论与下一步

[基于四项结果，给出「走 A 路径」或「退回 B/C」的建议]
```

Fill in each section with actual command output from Tasks 1-4.

- [ ] **Step 2: Commit the research doc**

```bash
cd ~/project/Magpie-Horch
git add docs/research/17-thin-shell-spike.md
git commit -m "docs(research): 薄壳 spike 验证报告——npm 可用性/独立 boot/插件加载/pnpm patch 四项前提"
```

- [ ] **Step 3: Clean up spike directory**

```bash
rm -rf /tmp/lute-shell-spike
```

The spike directory is throwaway. Only the research doc persists.
