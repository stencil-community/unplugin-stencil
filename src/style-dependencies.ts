import type { CompilerSystem, Config } from '@stencil/core/internal'
import path from 'node:path'
import process from 'node:process'
import ts from 'typescript'

export interface ComponentStyleDependencies {
  /** absolute .tsx path → absolute style file paths */
  byComponent: Map<string, Set<string>>
  /** absolute style path → consuming .tsx paths */
  byStyle: Map<string, Set<string>>
  /** resolved Config.globalStyle, if set */
  globalStyle: string | undefined
}

let cached: ComponentStyleDependencies | null = null

const EMPTY_DEPS: ComponentStyleDependencies = {
  byComponent: new Map(),
  byStyle: new Map(),
  globalStyle: undefined,
}

export function setGlobalStyleFromConfig(config: Config): void {
  if (!cached) {
    cached = {
      byComponent: new Map(),
      byStyle: new Map(),
      globalStyle: resolveGlobalStyle(config),
    }
  }
  else {
    cached = {
      ...cached,
      globalStyle: resolveGlobalStyle(config),
    }
  }
}

function resolveGlobalStyle(config: Config): string | undefined {
  if (!config.globalStyle)
    return undefined
  return path.resolve(config.rootDir ?? process.cwd(), config.globalStyle)
}

export function clearStyleDependencies(): void {
  cached = null
}

export function getComponentStyleDependencies(): ComponentStyleDependencies {
  if (!cached)
    return copyDeps(EMPTY_DEPS)

  return copyDeps(cached)
}

function copyDeps(
  deps: ComponentStyleDependencies,
): ComponentStyleDependencies {
  const byComponent = new Map<string, Set<string>>()
  for (const [component, styles] of deps.byComponent)
    byComponent.set(component, new Set(styles))

  const byStyle = new Map<string, Set<string>>()
  for (const [style, components] of deps.byStyle)
    byStyle.set(style, new Set(components))

  return {
    byComponent,
    byStyle,
    globalStyle: deps.globalStyle,
  }
}

export async function rebuildStyleMap(
  sys: CompilerSystem,
  config: Config,
): Promise<void> {
  const byComponent = new Map<string, Set<string>>()
  const byStyle = new Map<string, Set<string>>()
  const globalStyle = resolveGlobalStyle(config)
  const scanRoot = path.resolve(
    config.rootDir ?? process.cwd(),
    config.srcDir ?? '.',
  )

  const tsxFiles = await collectTsxFiles(sys, scanRoot)
  for (const filePath of tsxFiles) {
    const content = await sys.readFile(filePath)
    if (!content)
      continue

    const stylePaths = extractStylePathsFromSource(filePath, content)
    if (stylePaths.length === 0)
      continue

    const normalizedComponent = path.resolve(filePath)
    let componentStyles = byComponent.get(normalizedComponent)
    if (!componentStyles) {
      componentStyles = new Set()
      byComponent.set(normalizedComponent, componentStyles)
    }

    for (const stylePath of stylePaths) {
      componentStyles.add(stylePath)
      let consumers = byStyle.get(stylePath)
      if (!consumers) {
        consumers = new Set()
        byStyle.set(stylePath, consumers)
      }
      consumers.add(normalizedComponent)
    }
  }

  cached = { byComponent, byStyle, globalStyle }
}

async function collectTsxFiles(
  sys: CompilerSystem,
  dir: string,
): Promise<string[]> {
  const files: string[] = []
  let entries: string[]
  try {
    entries = await sys.readDir(dir)
  }
  catch {
    return files
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry)
    let stat: { isDirectory: boolean, isFile: boolean } | undefined
    try {
      stat = await sys.stat(fullPath)
    }
    catch {
      continue
    }

    if (stat?.isDirectory) {
      files.push(...(await collectTsxFiles(sys, fullPath)))
    }
    else if (stat?.isFile && fullPath.endsWith('.tsx')) {
      files.push(fullPath)
    }
  }

  return files
}

export function extractStylePathsFromSource(
  componentFilePath: string,
  content: string,
): string[] {
  const sourceFile = ts.createSourceFile(
    componentFilePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )

  const stylePaths: string[] = []
  const componentDir = path.dirname(componentFilePath)

  function visit(node: ts.Node) {
    if (ts.isClassDeclaration(node) && ts.canHaveDecorators(node)) {
      const decorators = ts.getDecorators(node)
      if (decorators) {
        for (const decorator of decorators) {
          collectStylesFromComponentDecorator(
            decorator,
            componentDir,
            stylePaths,
          )
        }
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return stylePaths
}

function collectStylesFromComponentDecorator(
  decorator: ts.Decorator,
  componentDir: string,
  stylePaths: string[],
) {
  const call = decorator.expression
  if (!ts.isCallExpression(call) || call.arguments.length === 0)
    return

  const arg = call.arguments[0]
  if (!ts.isObjectLiteralExpression(arg))
    return

  const callee = call.expression
  if (!ts.isIdentifier(callee) || callee.text !== 'Component')
    return

  for (const prop of arg.properties) {
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name))
      continue

    const name = prop.name.text
    if (name === 'styleUrl')
      collectStringLiterals(prop.initializer, componentDir, stylePaths)
    else if (name === 'styleUrls')
      collectStyleUrlsValue(prop.initializer, componentDir, stylePaths)
  }
}

function collectStyleUrlsValue(
  node: ts.Expression,
  componentDir: string,
  stylePaths: string[],
) {
  if (ts.isArrayLiteralExpression(node)) {
    for (const el of node.elements)
      collectStringLiterals(el, componentDir, stylePaths)
  }
  else if (ts.isObjectLiteralExpression(node)) {
    for (const prop of node.properties) {
      if (ts.isPropertyAssignment(prop))
        collectStyleUrlsValue(prop.initializer, componentDir, stylePaths)
      else if (ts.isShorthandPropertyAssignment(prop))
        collectStringLiterals(prop.name, componentDir, stylePaths)
    }
  }
  else {
    collectStringLiterals(node, componentDir, stylePaths)
  }
}

function collectStringLiterals(
  node: ts.Node,
  componentDir: string,
  stylePaths: string[],
) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    const resolved = path.resolve(componentDir, node.text)
    stylePaths.push(resolved)
    return
  }

  if (ts.isArrayLiteralExpression(node)) {
    for (const el of node.elements)
      collectStringLiterals(el, componentDir, stylePaths)
  }
}
