import { createRequire } from 'node:module'

const require = createRequire(new URL('../../packages/platform/dsh-theme-local/package.json', import.meta.url))
const ts = require('typescript')

export function extractBootPreview(source) {
  const ast = ts.createSourceFile('boot.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const classes = []
  const visit = (node) => {
    if (ts.isClassExpression(node) && node.getText(ast).includes('this.wordmark=') && node.getText(ast).includes('dshBootSpinner')) classes.push(node)
    ts.forEachChild(node, visit)
  }
  visit(ast)
  if (classes.length !== 1) throw new Error(`BootPage class count: ${classes.length}`)
  let wordmark
  const findWordmark = (node) => {
    if (ts.isBinaryExpression(node) && node.left.getText(ast) === 'this.wordmark' && ts.isCallExpression(node.right)) wordmark = node.right
    ts.forEachChild(node, findWordmark)
  }
  findWordmark(classes[0])
  if (!wordmark || !ts.isIdentifier(wordmark.expression) || !ts.isPropertyAccessExpression(wordmark.arguments[0])) throw new Error('BootPage wordmark seam missing')
  const helperName = wordmark.expression.text
  const mapName = wordmark.arguments[0].expression.getText(ast)
  const declarations = new Map()
  let helper
  for (const statement of ast.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === helperName) helper = statement.getText(ast)
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) declarations.set(declaration.name.getText(ast), declaration.initializer)
    }
  }
  const map = declarations.get(mapName)
  if (!helper || !map || !ts.isObjectLiteralExpression(map)) throw new Error('BootPage CSS map or div helper missing')
  const css = {}
  for (const property of map.properties) {
    if (!ts.isPropertyAssignment(property)) throw new Error('Unexpected CSS map property')
    const value = ts.isIdentifier(property.initializer) ? declarations.get(property.initializer.text) : property.initializer
    if (!value || !ts.isStringLiteral(value)) throw new Error('CSS map value is not a string')
    css[property.name.getText(ast)] = value.text
  }
  return `const ${mapName}=${JSON.stringify(css)};${helper};const BootPreview=${classes[0].getText(ast)};window.__bootPage=new BootPreview(document.getElementById('host'));`
}
