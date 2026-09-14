/**
 * 「文档相对链接可达性」校验项。
 *
 * ## 为什么需要它
 *
 * `AGENTS.md` 的常驻规则写着「链接可达性由门禁校验（ADR-0009）」——而在本项落地之前，
 * 真正被校验的只有 ADR ↔ Note 那一条链路。其余文档的链接**从来没有读者之外的人检查过**，
 * 于是 2026-09-13 实测 419 条相对链接里有 6 条是死的，且全部是同一个形态：**层级写错**。
 *
 * 最刺眼的一组：同一天、同一模板写出的 5 篇 Note，其中 4 篇把
 * `docs/adr/ADR-00XX.md` 写成了 `../../adr/ADR-00XX.md`——Note 住在
 * `docs/notes/<lifecycle>/<class>/` 下，ADR 在 `docs/adr/`，正确的上溯是**三层**。
 * 这类错误的危害不在于「点不开」，而在于它**看起来是指路**：读者看到「对应 ADR：[ADR-0067]」
 * 会以为背后有决策事实，实际上那是一条通向空地址的路。死指针会把「没有依据」伪装成
 * 「有依据，只是我没点」。
 *
 * 这正是本仓库那篇总账里 P-03 的形状：模板的层级深度是一条**事实**，它当时只活在写字人的
 * 脑子里，没有进入任何判据。写进文档不算拦住，**能判红才算**。
 *
 * ## 本项**不**检查什么（诚实写清楚，免得被当成全覆盖）
 *
 * 1. **代码块与行内代码里的链接不校验**。模板占位符（`docs/adr/README.md` 里的
 *    `../notes/{lifecycle}/{class}/YYYY-MM-DD-topic.md`）与写法示例本来就不是链接目标；
 *    把它们判红，会让这项校验很快被当成噪声关掉——**一项会误报的校验比没有校验更坏**。
 *    这条「哪段文字算链接」的规则本身住在 `checks.mjs` 的 `collectDocLinks`，本项只消费它：
 *    2026-09-14 发现它在 `pitfalls-playbook.mjs` 里还有第二份拷贝（那份不跳代码块），
 *    而分叉恰好让**逐字引用坏链接写成的总账条目**被判红——同一份实现出现两次，
 *    下次分叉时照旧没有东西会说话（总账 P-07）。
 * 2. **扫描范围限于 `docs/` 与仓库根的两份 Markdown**（`AGENTS.md` / `README.md`）。
 *    包内文档（各包的 `docs/` 目录、`packaging/` 下的 Markdown）是另一个面，未纳入，
 *    故本项不构成「全仓链接都可达」的证明。
 * 3. **锚点（`#section`）不解析**。只校验路径存在，不校验标题锚点在文档里真的存在。
 * @module
 */
import { collectDocLinks, resolveDocLink } from './checks.mjs'

/**
 * 校验文档里的相对 Markdown 链接都指向真实存在的位置。
 *
 * 纯函数：文档正文与存在性判断都由调用方提供，便于用固定文本做正反例。
 * @param {{
 *   docs: Array<{path: string, text: string}>,
 *   fileExists: (repoRelativePath: string) => boolean,
 * }} input `path` 为仓库根相对路径；链接以**所在文档的目录**为基准解析。
 * @returns {{passed: boolean, violations: string[]}}
 */
export function checkDocsLinkIntegrity({ docs, fileExists }) {
  const violations = []
  // 空输入必须是红灯：这是本项**唯一**的真空绿路径——收集器一旦失效（路径写错、
  // 目录改名），本项会以「零违规」的样子通过，而它看上去和「全仓链接都可达」一模一样。
  if (docs.length === 0) {
    return { passed: false, violations: ['未扫到任何文档——收集器失效时本项会真空绿，故此处判红'] }
  }
  for (const doc of docs) {
    for (const { line, link } of collectDocLinks(doc.text)) {
      // 外链、页内锚点、绝对路径不由本仓库门禁负责（后者另属部署约定）。
      if (/^[a-z][a-z0-9+.-]*:/i.test(link) || link.startsWith('#') || link.startsWith('/')) continue
      const target = resolveDocLink(doc.path, link.split('#')[0])
      if (target === '' || fileExists(target)) continue
      violations.push(
        `${doc.path}:${line}: 链接不可达（${link} → ${target}）——`
          + '相对链接以本文件所在目录为基准，层级写错时它不是「点不开」而是「看起来有依据」',
      )
    }
  }
  return { passed: violations.length === 0, violations }
}
