#!/usr/bin/env node
/**
 * scan-runtime-deps.mjs — 技能运行时前提层（SOP §12.10）
 *
 * 解决的问题：`verify_static.mjs` 只校验「技能引用的 skill id 存在」，不校验
 * 「技能运行前提具备」。结果是假绿——门禁全过、卡片正常、模型一调用就报错。
 *
 * 三种模式：
 *   默认        扫描来件目录（含 zip），抽取每条技能的运行时依赖 → manifest/runtime-deps.json
 *   --probe     逐条实测本机是否具备，输出 {skill, needs[], present[], missing[]}
 *   --check     只读判定：列出「已进 subset 且 missing 非空」的技能，供门禁调用
 *
 * 事实源优先级：manifest/runtime-deps.overrides.json（人工核过）> 自动抽取。
 * 覆盖是**替换**不是合并——人工写过就代表核过，合并会把误报又带回来。
 *
 * 用法：
 *   node scripts/scan-runtime-deps.mjs                          # 扫描（默认 ~/Downloads/skills）
 *   node scripts/scan-runtime-deps.mjs --from /path/to/skills
 *   node scripts/scan-runtime-deps.mjs --skills a,b,c           # 只扫这几条
 *   node scripts/scan-runtime-deps.mjs --probe                  # 扫描 + 实测
 *   node scripts/scan-runtime-deps.mjs --probe --json           # 机器可读
 *   node scripts/scan-runtime-deps.mjs --check                  # 门禁判定
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { join, dirname, basename, extname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { collectUnits as collectUnitsFrom, listUnit, readEntry, innerPath, INTAKE_SOURCE_PLACEHOLDER, dshHomePlaceholder } from "./intake-lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const MANIFEST = join(ROOT, "manifest");
const DEPS_FILE = join(MANIFEST, "runtime-deps.json");
const OVERRIDES_FILE = join(MANIFEST, "runtime-deps.overrides.json");

// ─────────────────────────── 配置 ───────────────────────────

/** 受管 venv：Python 依赖不进系统 Python（系统 3.14.7 太新，污染会波及 DSH 自身）。 */
const SKILLS_DIR = process.env.DSH_SKILLS_DIR || join(homedir(), ".dsh", "skills");
const VENV_PY = process.env.DSH_SKILLS_VENV
  ? join(process.env.DSH_SKILLS_VENV, "bin", "python")
  : join(homedir(), ".dsh", "skills-runtime", ".venv", "bin", "python");

/** 来件目录布局：<root>/<batch>/{skills/,skill02/,*.zip}。批次名 → 来源标签。 */
const BATCHES = [
  { dir: "kimi", source: "kimi", nested: "skills" },
  { dir: "Manus", source: "manus", nested: "skill02" },
  { dir: "MinMax", source: "minmax", nested: "skills" },
  { dir: "MinMaxDesign", source: "minmaxdesign", nested: null },
];

/** Python 模块名 ≠ pip 包名的实测对照（只列真的不一样的）。 */
const PIP_NAME = {
  PIL: "Pillow", fitz: "PyMuPDF", docx: "python-docx", pptx: "python-pptx",
  yaml: "PyYAML", cv2: "opencv-python", sklearn: "scikit-learn",
  bs4: "beautifulsoup4", dateutil: "python-dateutil", dotenv: "python-dotenv",
  OpenSSL: "pyOpenSSL", serial: "pyserial", usb: "pyusb", git: "GitPython",
  skimage: "scikit-image", mpl_toolkits: "matplotlib", google: "protobuf",
  jwt: "PyJWT", attr: "attrs", pkg_resources: "setuptools", Crypto: "pycryptodome",
  websocket: "websocket-client", tzlocal: "tzlocal", pandas_profiling: "pandas-profiling",
  pptx_template: "python-pptx", docx2pdf: "docx2pdf", PyPDF2: "PyPDF2",
  pypdf: "pypdf", reportlab: "reportlab", openpyxl: "openpyxl", xlrd: "xlrd",
  xlsxwriter: "XlsxWriter", markdown: "Markdown", jinja2: "Jinja2",
  plotly: "plotly", seaborn: "seaborn", statsmodels: "statsmodels",
  networkx: "networkx", sympy: "sympy", qrcode: "qrcode", tabulate: "tabulate",
  tqdm: "tqdm", requests: "requests", httpx: "httpx", aiohttp: "aiohttp",
  numpy: "numpy", scipy: "scipy", pandas: "pandas", matplotlib: "matplotlib",
  lxml: "lxml", pdfplumber: "pdfplumber", pdf2image: "pdf2image",
  pytesseract: "pytesseract", fitz_utils: "PyMuPDF",
};

/** Python 标准库（出现不算依赖）。 */
const STDLIB = new Set([
  "re", "os", "sys", "json", "math", "time", "datetime", "random", "string", "io",
  "pathlib", "subprocess", "argparse", "importlib", "base64", "zipfile", "tempfile",
  "warnings", "traceback", "typing", "collections", "itertools", "functools", "csv",
  "glob", "shutil", "hashlib", "uuid", "logging", "textwrap", "copy", "enum", "abc",
  "dataclasses", "decimal", "fractions", "statistics", "urllib", "http", "socket",
  "threading", "multiprocessing", "asyncio", "concurrent", "contextlib", "inspect",
  "struct", "unicodedata", "difflib", "pprint", "sqlite3", "unittest", "platform",
  "getpass", "getopt", "configparser", "secrets", "signal", "tarfile", "gzip",
  "binascii", "codecs", "email", "html", "xml", "ast", "builtins", "operator",
  "pickle", "queue", "sched", "select", "ssl", "stat", "token", "types", "weakref",
  "webbrowser", "venv", "zipimport", "zlib", "cProfile", "pstats", "__future__",
  "importlib.metadata", "typing_extensions", "os.path", "sys.path", "fileinput",
  "shlex", "fnmatch", "locale", "numbers", "datetime.datetime", "pathlib.Path",
  "colorsys", "calendar", "cmath", "copyreg", "dis", "graphlib", "imaplib",
  "ipaddress", "keyword", "mailbox", "mimetypes", "mmap", "netrc", "nis",
  "optparse", "pdb", "pipes", "plistlib", "poplib", "profile", "pstats",
  "pty", "readline", "resource", "rlcompleter", "runpy", "smtplib", "sndhdr",
  "spwd", "sre_compile", "sre_constants", "sre_parse", "symtable", "sysconfig",
  "tabnanny", "telnetlib", "termios", "tkinter", "tokenize", "trace", "tracemalloc",
  "tty", "turtle", "uu", "winsound", "wsgiref", "xdrlib", "zipapp", "zoneinfo",
]);

/** 外部 CLI 白名单（避免把正文里的普通英文单词当命令）。bin → brew 公式。 */
const CLI_BREW = {
  pandoc: "pandoc", typst: "typst", libreoffice: "libreoffice", soffice: "libreoffice",
  magick: "imagemagick", convert: "imagemagick", wkhtmltopdf: "wkhtmltopdf",
  ffmpeg: "ffmpeg", qpdf: "qpdf", gs: "ghostscript", tesseract: "tesseract",
  imagemagick: "imagemagick", node: null, npx: null,
  python3: null, pip3: null, uv: "uv", git: null, docker: null, csvkit: null,
  jq: "jq", sqlite3: null, "rsvg-convert": "librsvg", inkscape: "inkscape",
  gnuplot: "gnuplot", plantuml: "plantuml", graphviz: "graphviz", dot: "graphviz",
  mmdc: null, "mermaid-cli": null, "pandoc-crossref": "pandoc-crossref",
};

/** 不需要探测的：本机必然有、或由 DSH 自身提供。 */
const CLI_IGNORE = new Set(["node", "npx", "python3", "pip3", "git", "docker", "sqlite3"]);

/** Node 包 → 探测方式。npx 型走 npx --no-install。 */
const NODE_KNOWN = new Set([
  "playwright", "@playwright/test", "puppeteer", "sharp", "mermaid", "@mermaid-js/mermaid-cli",
  "mmdc", "docx", "pptxgenjs", "exceljs", "pdf-lib", "pdfkit", "marked", "markdown-it",
  "pandoc", "typescript", "tsx", "esbuild", "vite", "next", "react", "vue", "svelte",
  "d3", "chart.js", "echarts", "vega", "vega-lite", "obsidian", "canvas", "jsdom",
]);

// ─────────────────────────── 参数 ───────────────────────────

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };

const PROBE = has("--probe");
const CHECK = has("--check");
const AS_JSON = has("--json");
const FROM = val("--from", join(homedir(), "Downloads", "skills"));
const ONLY = (val("--skills", "") || "").split(",").map((s) => s.trim()).filter(Boolean);

// ─────────────────────────── 读取来件 ───────────────────────────
// 来件布局与 zip/目录统一读取都住在 intake-lib.mjs —— 一份事实只有一个家。
// （早期这里有一份本地副本，目录来件的相对路径算错，见 intake-lib 里的注释。）

function collectUnits() {
  return collectUnitsFrom(FROM).filter((u) => !ONLY.length || ONLY.includes(u.name));
}

// ─────────────────────────── 抽取 ───────────────────────────

const SHELL_LANG = /^(bash|sh|zsh|shell|console|terminal|shell-session|cmd|powershell|ps1|bat)$/;
const PY_LANG = /^(python|python3|py|python[23]\.\d+)$/;
const JS_LANG = /^(js|javascript|ts|typescript|mjs|cjs|jsx|tsx|node|json|json5)$/;

/** 无标注代码块按内容猜语言；猜不出就当散文，不做依赖推断。 */
function guessLang(body) {
  if (/"""|'''/.test(body)) return "python";
  if (/^\s*(import\s+\w|from\s+\w+\s+import|def\s+\w+\s*\(|print\s*\()/m.test(body)) return "python";
  if (/^\s*(npm|npx|pnpm|yarn|pip3?|uv|python3?|node|cd|echo|curl|mkdir|cp|mv|rm|git|brew|unzip)\s/m.test(body)) return "shell";
  if (/^\s*\$/m.test(body)) return "shell";
  if (/\b(?:import|require|export)\b[^\n]*['"]/.test(body)) return "js";
  return "text";
}

/**
 * 取文档里的代码块与行内代码（正文散文里的 "from the" 之类不算依赖）。
 * **按语言分流**是精度的关键：同一个词在 shell 块里是命令，在 python 块里是散文。
 * 实测 `"""… ; convert .doc to .docx …"""` 曾被算成 ImageMagick 依赖。
 */
function codeRegions(text) {
  const blocks = [];
  for (const m of text.matchAll(/```([^\n]*)\n([\s\S]*?)```/g)) {
    const tag = m[1].trim().toLowerCase().split(/\s+/)[0];
    const kind = SHELL_LANG.test(tag) ? "shell"
      : PY_LANG.test(tag) ? "python"
      : JS_LANG.test(tag) ? "js"
      : tag ? "other"            // 明确标了 yaml/text/… → 不推断
      : guessLang(m[2]);
    blocks.push({ tag, kind, body: m[2] });
  }
  const inline = [];
  for (const m of text.matchAll(/`([^`\n]{1,200})`/g)) inline.push(m[1]);
  return { blocks, inline };
}

function extractUnit(name, source, unit) {
  const files = listUnit(unit).map((e) => ({ path: e, text: readEntry(e) })).filter((f) => f.text);
  const pyMods = new Map();   // module -> where
  const clis = new Map();     // bin -> where
  const nodePkgs = new Map(); // pkg -> where
  const broken = [];          // 结构体检：坏文件（P1 intake-lint 的输入）

  const note = (map, key, where) => {
    if (!map.has(key)) map.set(key, []);
    if (!map.get(key).includes(where)) map.get(key).push(where);
  };

  for (const f of files) {
    const rel = innerPath(f.path);
    if (/^(\.git|node_modules|__MACOSX)\//.test(rel)) continue;
    const { blocks, inline } = codeRegions(f.text);
    const isJsFile = /\.(m?js|cjs|jsx|ts|mts|cts|tsx)$/.test(rel);
    const shellText = [...blocks.filter((b) => b.kind === "shell").map((b) => b.body), ...inline].join("\n");
    const pyText = blocks.filter((b) => b.kind === "python").map((b) => b.body).join("\n");
    const jsText = blocks.filter((b) => b.kind === "js").map((b) => b.body).join("\n");

    // ① Python import（只认 python 块 / .py 文件）
    const pySrc = /\.py$/.test(rel) ? f.text : pyText;
    if (pySrc) {
      for (const m of pySrc.matchAll(/^[ \t]*(?:import\s+([\w.]+)|from\s+([\w.]+)\s+import)/gm)) {
        const mod = (m[1] || m[2] || "").split(".")[0];
        if (!mod || STDLIB.has(mod)) continue;
        note(pyMods, mod, rel);
      }
    }

    // ② pip / uv pip install（只认 shell 块 + 行内）
    for (const m of shellText.matchAll(/(?:pip3?|python3?\s+-m\s+pip|uv\s+pip)\s+install\s+([^\n`"'；;。|&>]+)/g)) {
      const pkgs = m[1].replace(/--?[\w-]+(=\S+)?/g, " ").replace(/\s*2>\/dev\/null/, " ");
      for (const raw of pkgs.split(/\s+/)) {
        const p = raw.replace(/[<>=[\].].*$/, "").trim();
        if (!p || p.length < 2 || /^(and|or|the|if|then|it|for|to|a|in)$/i.test(p)) continue;
        note(pyMods, `pip:${p}`, rel);
      }
    }

    // ③ npm / npx（只认 shell 块 + 行内）。捕获到 shell 操作符为止，否则 `a && b` 会串味。
    for (const m of shellText.matchAll(/\b(?:npm|pnpm|yarn)[ \t]+(?:i|install|add)[ \t]+(?:-g[ \t]+|--global[ \t]+)?([^\n`"'；;。|&>\\]+)/g)) {
      for (const raw of m[1].split(/\s+/)) {
        const p = raw.replace(/[<>=[\].].*$/, "").trim();
        if (!p || p.startsWith("-") || p.startsWith("@types/")) continue;
        if (/^(install|add|and|or|the|then|npx|npm|pnpm|yarn|it|to|for|a|in)$/i.test(p)) continue;
        note(nodePkgs, p, rel);
      }
    }
    for (const m of shellText.matchAll(/\bnpx\s+(?:--?[\w-]+\s+)*(@?[\w@/.-]+)/g)) {
      const p = m[1];
      if (p && !p.startsWith(".") && NODE_KNOWN.has(p)) note(nodePkgs, p, rel);
    }
    // JS/TS 的 import / require —— 源码文件整文件扫，代码块只扫 js 块
    const jsSrc = isJsFile ? f.text : jsText;
    if (jsSrc) {
      for (const m of jsSrc.matchAll(/\b(?:import\s[^'"]*from\s*|require\(\s*|import\(\s*)['"]([\w@/.-]+)['"]/g)) {
        const p = m[1];
        if (p.startsWith(".") || p.startsWith("node:")) continue;
        const root = p.split("/").slice(0, p.startsWith("@") ? 2 : 1).join("/");
        if (NODE_KNOWN.has(root) || NODE_KNOWN.has(p)) note(nodePkgs, NODE_KNOWN.has(p) ? p : root, rel);
      }
    }

    // ④ 外部 CLI —— 只在**真被当命令调用**处计数（shell 块 + 行内）。
    //    宽松匹配会把英文动词（convert / install / dot）算成 CLI；实测两例误报都出自这里。
    const cliHits = [
      /\[['"]([a-z][a-z0-9-]{1,20})['"]\s*,/g,                              // ['libreoffice', '--headless', …]
      /^[ \t]*(?:sudo[ \t]+)?([a-z][a-z0-9-]{1,20})[ \t]+-{1,2}[\w-]/gm,    // 行首 `pandoc -o out.pdf`
      /(?:\|\||&&|\|)[ \t]*(?:sudo[ \t]+)?([a-z][a-z0-9-]{1,20})[ \t]+\S/g, // `… && magick x.png`
      /\b(?:command[ \t]+-v|which|type)[ \t]+([a-z][a-z0-9-]{1,20})\b/g,    // `command -v pandoc`
    ];
    for (const re of cliHits) {
      for (const m of shellText.matchAll(re)) {
        const bin = m[1];
        if (CLI_BREW[bin] !== undefined && !CLI_IGNORE.has(bin)) note(clis, bin, rel);
      }
    }
    // argv 列表 `['libreoffice', '--headless', …]` 是**无歧义**证据，任何语言的块都算
    // （实测 sn-da-non-spreadsheet-analysis 的调用写在 python 块里，只扫 shell 块会漏掉）
    for (const b of blocks) {
      for (const m of b.body.matchAll(/\[['"]([a-z][a-z0-9-]{1,20})['"]\s*,/g)) {
        const bin = m[1];
        if (CLI_BREW[bin] !== undefined && !CLI_IGNORE.has(bin)) note(clis, bin, rel);
      }
    }
    // 反引号里以命令开头**且带参数**的整段（`pandoc -o out.pdf` 算；`dot` 单字不算——实测是 CSS 术语）
    for (const span of inline) {
      const m = /^[ \t]*(?:sudo[ \t]+)?([a-z][a-z0-9-]{1,20})[ \t]+\S/.exec(span);
      if (m && CLI_BREW[m[1]] !== undefined && !CLI_IGNORE.has(m[1])) note(clis, m[1], rel);
    }

    // ⑤ package.json 的 dependencies —— 比正文散文可靠得多的证据
    if (basename(rel) === "package.json") {
      let pj = null;
      try { pj = JSON.parse(f.text); } catch { broken.push(`${rel}（package.json 解析失败/非文本）`); }
      if (pj) {
        for (const key of ["dependencies", "devDependencies", "peerDependencies"]) {
          for (const dep of Object.keys(pj[key] || {})) note(nodePkgs, dep, rel);
        }
      }
    }
  }

  return {
    name, source, broken,
    python: [...pyMods.entries()].map(([mod, where]) => ({
      module: mod.startsWith("pip:") ? null : mod,
      pip: mod.startsWith("pip:") ? mod.slice(4) : (PIP_NAME[mod] || mod),
      evidence: where.slice(0, 4),
    })),
    cli: [...clis.entries()].map(([bin, where]) => ({
      bin, brew: CLI_BREW[bin] ?? null, evidence: where.slice(0, 4),
    })),
    node: [...nodePkgs.entries()].map(([pkg, where]) => ({ pkg, evidence: where.slice(0, 4) })),
  };
}

// ─────────────────────────── 覆盖 ───────────────────────────

function loadOverrides() {
  if (!existsSync(OVERRIDES_FILE)) return { skills: {} };
  try { return JSON.parse(readFileSync(OVERRIDES_FILE, "utf8")); } catch { return { skills: {} }; }
}

/** 覆盖替换自动抽取（不是合并）。 */
function applyOverride(spec, ov) {
  if (!ov) return { ...spec, overridden: false };
  return {
    name: spec.name,
    source: spec.source,
    overridden: true,
    broken: spec.broken || [],
    note: ov.note || "",
    python: (ov.python || []).map((p) => (typeof p === "string"
      ? { module: Object.keys(PIP_NAME).find((k) => PIP_NAME[k] === p) || null, pip: p, evidence: ["override"] }
      : p)),
    cli: (ov.cli || []).map((c) => (typeof c === "string"
      ? { bin: c, brew: CLI_BREW[c] ?? null, evidence: ["override"] }
      : { bin: c.bin, brew: c.brew ?? CLI_BREW[c.bin] ?? null, optional: !!c.optional, why: c.why || "", evidence: ["override"] })),
    node: (ov.node || []).map((n) => (typeof n === "string" ? { pkg: n, evidence: ["override"] } : n)),
  };
}

// ─────────────────────────── 探测 ───────────────────────────

const probeCache = new Map();

/**
 * Python 探测的解释器口径 —— 这条决定门禁是真是假。
 *
 * 技能最终由**受管 venv** 的解释器执行，所以 venv 一旦存在，探测就必须只看 venv。
 * 若回退到系统 python3，会出现「系统里有 pandas ✓ 但 venv 里没有」——
 * 门禁绿、模型一跑就 ImportError，正是本层要消灭的那种假绿。
 */
const VENV_READY = existsSync(VENV_PY);
const PY_INTERPRETERS = VENV_READY ? [VENV_PY] : ["python3"];

function probePython(module, pip) {
  const key = `py:${pip}`;
  if (probeCache.has(key)) return probeCache.get(key);
  const mods = [module, pip].filter(Boolean);
  let ok = false;
  for (const interp of PY_INTERPRETERS) {
    for (const m of mods) {
      // 用 importlib.util.find_spec：不执行模块本体，比 import 安全也更快
      try {
        execFileSync(interp, ["-c",
          `import importlib.util,sys;sys.exit(0 if importlib.util.find_spec(${JSON.stringify(m.replace(/-/g, "_"))}) else 1)`],
          { stdio: "ignore", timeout: 15000 });
        ok = true; break;
      } catch { /* 未装 */ }
    }
    if (ok) break;
  }
  probeCache.set(key, ok);
  return ok;
}

function probeCli(bin) {
  try { execFileSync("which", [bin], { stdio: "ignore", timeout: 5000 }); return true; }
  catch { return false; }
}

/**
 * Node 包探测 —— **绝不联网**。
 *
 * 原先用 `npx --no-install <pkg> --version`，实测会让门禁跑成 60s+：新版 npm 里
 * `--no-install` 已不是合法选项，npx 会把它当普通参数然后去 registry 拉包。
 * 门禁在网上下载东西是不能接受的：慢、不确定、离线就红。
 *
 * 改为三处本地解析，全部离线：
 *   ① 全局 npm 前缀（`npm ls -g --depth=0 --json`，整轮只跑一次）
 *   ② 技能自己的 node_modules（chart-gen 这类 skill-local 安装）
 *   ③ ~/.dsh/skills-runtime/node_modules（给未来的共享 node 依赖留位）
 */
let _npmGlobal = null;
function npmGlobalPkgs() {
  if (_npmGlobal) return _npmGlobal;
  _npmGlobal = new Set();
  try {
    const out = execFileSync("npm", ["ls", "-g", "--depth=0", "--json"], { encoding: "utf8", timeout: 20000 });
    for (const name of Object.keys(JSON.parse(out).dependencies || {})) _npmGlobal.add(name);
  } catch (e) {
    // npm ls 在有 extraneous/缺 peer 时也会非零退出，但 stdout 仍是可用 JSON
    try {
      const out = String(e.stdout || "");
      for (const name of Object.keys(JSON.parse(out).dependencies || {})) _npmGlobal.add(name);
    } catch { /* 真的拿不到就只靠本地解析 */ }
  }
  return _npmGlobal;
}

function probeNode(pkg, skillName) {
  const key = `node:${pkg}:${skillName || ""}`;
  if (probeCache.has(key)) return probeCache.get(key);
  let ok = npmGlobalPkgs().has(pkg);
  if (!ok && skillName) {
    // skill-local：包装在技能目录里（scripts/ 或技能根）
    for (const sub of ["scripts", ""]) {
      const nm = join(SKILLS_DIR, skillName, sub, "node_modules", pkg);
      if (existsSync(nm)) { ok = true; break; }
    }
  }
  if (!ok) {
    const shared = join(homedir(), ".dsh", "skills-runtime", "node_modules", pkg);
    if (existsSync(shared)) ok = true;
  }
  probeCache.set(key, ok);
  return ok;
}

function probeSkill(spec) {
  const v = spec.python.map((p) => ({ ...p, present: probePython(p.module, p.pip) }));
  const c = spec.cli.map((x) => ({ ...x, present: probeCli(x.bin) }));
  const n = spec.node.map((x) => ({ ...x, present: probeNode(x.pkg, spec.name) }));
  // optional 不计红：缺了不算门禁失败，但要在读数里看得见。
  const hard = (x) => !x.present && !x.optional;
  const soft = (x) => !x.present && x.optional;
  const miss = [
    ...v.filter(hard).map((x) => `python:${x.pip}`),
    ...c.filter(hard).map((x) => `cli:${x.bin}`),
    ...n.filter(hard).map((x) => `node:${x.pkg}@${x.install || "global"}`),
  ];
  const opt = [
    ...v.filter(soft).map((x) => `python:${x.pip}`),
    ...c.filter(soft).map((x) => `cli:${x.bin}`),
    ...n.filter(soft).map((x) => `node:${x.pkg}@${x.install || "global"}`),
  ];
  return {
    ...spec,
    present: [...v, ...c, ...n].filter((x) => x.present).map((x) => x.pip || x.bin || x.pkg),
    missing: [...miss, ...opt.map((m) => `${m}(optional)`)],
    hardMissing: miss,
  };
}

// ─────────────────────────── 主流程 ───────────────────────────

// ── 门禁模式最先分流 ──
// 从 manifest 读，**不重扫来件**：门禁要快、要离线，而且源树（~/Downloads/skills）
// 以后可能不在了 —— 门禁不该依赖它。实测重扫 589 个来件单元要 36s，读 manifest 是毫秒级。
if (CHECK) {
  const target = val("--subset-file", "");
  const inline = val("--subset", "");
  let subsetNames = [];
  if (inline) subsetNames = inline.split(",").map((s) => s.trim()).filter(Boolean);
  else if (target && existsSync(target)) subsetNames = (JSON.parse(readFileSync(target, "utf8")).skills || []);

  if (!subsetNames.length) {
    console.log("[runtime-deps] 未提供 subset（--subset / --subset-file），跳过判定");
    process.exit(0);
  }
  if (!existsSync(DEPS_FILE)) {
    console.error(`[runtime-deps] 缺 ${relative(ROOT, DEPS_FILE)}；先跑 node scripts/scan-runtime-deps.mjs`);
    process.exit(0); // 算不算红交给调用方（verify_static 自己会判）
  }

  const manifest = JSON.parse(readFileSync(DEPS_FILE, "utf8"));
  const specs = Object.entries(manifest.skills || {}).map(([name, s]) => ({
    name, source: s.source, overridden: !!s.overridden,
    python: s.python || [], cli: s.cli || [], node: s.node || [],
  }));
  const scope = specs.filter((s) => subsetNames.includes(s.name)).map(probeSkill);
  const red = scope.filter((s) => (s.hardMissing || []).length);
  const soft = scope.filter((s) => !(s.hardMissing || []).length && (s.missing || []).length);
  if (AS_JSON) {
    console.log(JSON.stringify({
      manifestSkills: specs.length, subset: subsetNames.length, checked: scope.length,
      red: red.map((s) => ({ skill: s.name, missing: s.hardMissing })),
      soft: soft.map((s) => ({ skill: s.name, missing: s.missing })),
    }, null, 2));
  } else {
    console.log(`[runtime-deps] manifest ${specs.length} 条｜subset ${subsetNames.length} 条｜需探测 ${scope.length} 条`);
    for (const s of red) console.log(`  ✗ ${s.name}: 缺 ${s.hardMissing.join(", ")}`);
    for (const s of soft) console.log(`  ~ ${s.name}: 软缺 ${s.missing.join(", ")}`);
    if (!red.length) console.log("  ✓ subset 内技能运行时前提齐备");
  }
  process.exit(red.length ? 1 : 0);
}

const overrides = loadOverrides();
const units = collectUnits().filter((u) => !ONLY.length || ONLY.includes(u.name));

const scanned = [];
const seen = new Set();
for (const u of units) {
  if (seen.has(u.name)) continue;
  seen.add(u.name);
  try {
    const spec = extractUnit(u.name, u.source, u.unit);
    scanned.push(applyOverride(spec, overrides.skills?.[u.name]));
  } catch (e) {
    scanned.push({ name: u.name, source: u.source, error: String(e.message || e), python: [], cli: [], node: [] });
  }
}

// 人工核过「确认零依赖」的条目也要留在表里 —— 那本身是一条事实，不是缺失。
const withDeps = scanned.filter((s) => s.overridden || s.python.length || s.cli.length || s.node.length);

// ── 写 manifest ──
if (!CHECK && !PROBE) {
  const fresh = Object.fromEntries(withDeps.map((s) => [s.name, {
    source: s.source, overridden: !!s.overridden, note: s.note || undefined,
    python: s.python, cli: s.cli, node: s.node,
  }]));

  // ⚠ 局部扫描（--skills）必须**并入**已有 manifest，不能整体覆盖。
  // 实测踩过：为了给 installer 试跑而 `--skills chart-gen,sn-da-excel-workflow`，
  // manifest 从 5 条被缩成 2 条 —— 门禁于是不再检查另外 3 条，**假绿**。
  // 这正是 pitfalls-playbook 里「仪器假绿」那一类：工具自己不报错，只是悄悄少查了东西。
  const partial = ONLY.length > 0;
  let skills = fresh;
  let preserved = 0;
  if (partial && existsSync(DEPS_FILE)) {
    const prev = JSON.parse(readFileSync(DEPS_FILE, "utf8")).skills || {};
    skills = { ...prev, ...fresh };
    preserved = Object.keys(skills).length - Object.keys(fresh).length;
  }

  const out = {
    _meta: {
      generated: new Date().toISOString(),
      generator: "scripts/scan-runtime-deps.mjs",
      // 占位符而不是 FROM / 家目录：构建机事实不进已提交清单（P-48；判据 gate:intake-placeholders）。
      from: INTAKE_SOURCE_PLACEHOLDER,
      partialScan: partial || undefined,
      note: partial
        ? "本次是局部扫描（--skills），已并入既有 manifest。全量重扫请不带 --skills。"
        : "自动抽取的基线。人工核对过的以 manifest/runtime-deps.overrides.json 为准（替换而非合并）。",
      venvPython: dshHomePlaceholder(VENV_PY),
    },
    scan: { units: scanned.length, withDeps: withDeps.length, overridden: scanned.filter((s) => s.overridden).length,
            broken: scanned.filter((s) => (s.broken || []).length).length, preserved },
    broken: Object.fromEntries(scanned.filter((s) => (s.broken || []).length).map((s) => [s.name, s.broken])),
    skills,
  };
  mkdirSync(MANIFEST, { recursive: true });
  writeFileSync(DEPS_FILE, JSON.stringify(out, null, 2) + "\n");
  console.log(`[runtime-deps] 写入 ${relative(ROOT, DEPS_FILE)}${partial ? `（局部并入，保留既有 ${preserved} 条）` : "（全量）"}`);
  console.log(`  manifest 共 ${Object.keys(skills).length} 条｜本次扫描 ${scanned.length} 条，带依赖 ${withDeps.length} 条｜人工覆盖 ${out.scan.overridden} 条`);
  const byKind = { python: 0, cli: 0, node: 0 };
  for (const s of withDeps) { byKind.python += s.python.length; byKind.cli += s.cli.length; byKind.node += s.node.length; }
  console.log(`  本次依赖条目：python ${byKind.python}｜cli ${byKind.cli}｜node ${byKind.node}`);
  process.exit(0);
}

// ── 探测 ──
const probed = withDeps.map(probeSkill);
if (AS_JSON) {
  console.log(JSON.stringify({
    venv: VENV_PY, venvExists: existsSync(VENV_PY),
    scanned: scanned.length, withDeps: withDeps.length,
    skills: probed.map((s) => ({ skill: s.name, source: s.source, overridden: s.overridden, needs: [...s.python.map((p) => p.pip), ...s.cli.map((c) => c.bin), ...s.node.map((n) => n.pkg)], present: s.present, missing: s.missing })),
  }, null, 2));
} else {
  console.log(`受管 venv: ${VENV_PY} ${VENV_READY ? "✓ 存在（探测口径=venv）" : "✗ 不存在 → 当前按系统 python3 探测，仅供参考；先跑 scripts/install-runtime-deps.sh"}`);
  console.log(`来件 ${scanned.length} 条｜带运行时依赖 ${withDeps.length} 条\n`);
  const red = probed.filter((s) => (s.hardMissing || []).length);
  for (const s of probed) {
    const hard = s.hardMissing || [];
    const soft = s.missing.filter((m) => m.endsWith("(optional)"));
    const mark = hard.length ? "✗" : soft.length ? "~" : "✓";
    console.log(`${mark} ${s.name}${s.overridden ? " [override]" : ""}  需要 ${s.present.length + s.missing.length}｜缺 ${s.missing.length}`);
    if (hard.length) console.log(`     硬缺: ${hard.join(", ")}`);
    if (soft.length) console.log(`     软缺: ${soft.join(", ")}`);
  }
  console.log(`\n合计：✓ ${probed.filter((s) => !s.missing.length).length}　~ ${probed.filter((s) => !(s.hardMissing || []).length && s.missing.length).length}　✗ ${red.length}`);
}
process.exit(0);
