import type { Config as StencilConfig } from '@stencil/core'
import type { ParsedStaticImport } from 'mlly'
import type { Options } from './types.js'
import fs from 'node:fs/promises'

import path from 'node:path'
import process from 'node:process'

import { findStaticImports, parseStaticImport } from 'mlly'

import { COMPONENT_CLASS_DEFINITION, DEFAULT_STENCIL_CONFIG, STENCIL_BUILD_DIR } from './constants.js'

/**
 * StencilJS does not import the `h` or `Fragment` function by default. We need to add it so the user
 * doesn't need to.
 */
export function injectStencilImports(code: string, imports: ParsedStaticImport[]) {
  const hasRenderFunctionImport = imports.some(imp => 'h' in (imp.namedImports || {}))
  if (!hasRenderFunctionImport)
    code = `import { h } from '@stencil/core/internal/client';\n${code}`
  const hasFragmentImport = imports.some(imp => 'Fragment' in (imp.namedImports || {}))
  if (!hasFragmentImport)
    code = `import { Fragment } from '@stencil/core/internal/client';\n${code}`
  return code
}

interface CompilerOptions {
  baseUrl?: string
  paths?: Record<string, string[]>
  target?: string
}

let _tsCompilerOptions: CompilerOptions | null = null

/**
 * Read the TypeScript compiler configuration file from disk
 * @param ts the TypeScript module
 * @param rootDir the location to search for the config file
 * @returns the configuration, or `null` if the file cannot be found
 */
export function getCompilerOptions(ts: any, rootDir: string): CompilerOptions | null {
  if (_tsCompilerOptions)
    return _tsCompilerOptions

  if (typeof rootDir !== 'string')
    return null

  const tsconfigFilePath = ts.findConfigFile(rootDir, ts.sys.fileExists)
  if (!tsconfigFilePath)
    return null

  const tsconfigResults = ts.readConfigFile(tsconfigFilePath, ts.sys.readFile)

  if (tsconfigResults.error)
    throw new Error(tsconfigResults.error)

  const parseResult = ts.parseJsonConfigFileContent(
    tsconfigResults.config,
    ts.sys,
    rootDir,
    undefined,
    tsconfigFilePath,
  )

  _tsCompilerOptions = parseResult.options
  return _tsCompilerOptions
}

/**
 * compile root directory of the project
 * @param options the options to use
 * @returns the path to the created config file
 */
export function getRootDir(options: Options): string {
  return options.rootPath || process.cwd()
}

/**
 * create a temporary config file for StencilJS
 * @param options the options to use
 * @returns the path to the created config file
 */
export async function getStencilConfigFile(options: Options): Promise<string> {
  /**
   * first check if a default config file exists
   */
  if (options.rootPath) {
    const configFilePath = path.resolve(options.rootPath, 'stencil.config.ts')
    if (await fs.stat(configFilePath).catch(() => false))
      return configFilePath
  }

  const rootPath = getRootDir(options)
  const namespace = path.basename(rootPath)
  const stencilDir = path.resolve(rootPath, STENCIL_BUILD_DIR)
  await fs.mkdir(stencilDir, { recursive: true })

  const configFilePath = path.resolve(stencilDir, `${namespace}.stencil.config.ts`)
  const config: StencilConfig = {
    ...DEFAULT_STENCIL_CONFIG,
    namespace,
    ...options.stencilConfig,
  }

  const configCode = [
    `import type { Config } from '@stencil/core'\n`,
    `export const config: Config = ${JSON.stringify(config, null, 2)}`,
  ].join('\n')
  await fs.writeFile(configFilePath, configCode)
  return configFilePath
}

/**
 * Parse the tag config from the code
 * @param code the code to parse the tag config from
 * @returns the tag config, or `undefined` if no tag config is found
 */
export function parseTagConfig(code: string): string | undefined {
  const componentRegex = /@Component\(\s*(\{[\s\S]*?\})\s*\)/
  const match = code.match(componentRegex)
  const configStr = match?.[1]

  if (!configStr) {
    return
  }

  // Extract tag property
  const tagMatch = configStr.match(/tag\s*:\s*['"`]([^'"`]+)['"`]/)
  if (!tagMatch?.[1]) {
    return
  }

  return tagMatch[1]
}

/**
 * transform the compiled code in amend the following:
 * - make relative imports absolute
 * - export the original component class
 *
 * @param code the code to transform
 * @param outputPath the path to the where the compiler outputs dist-custom-elements
 * @returns the transformed code
 */
export function transformCompiledCode(code: string, outputPath: string) {
  const staticImports = findStaticImports(code)
  const imports = staticImports.map(imp => parseStaticImport(imp))

  /**
   * make relative imports absolute to Vite can pick up the correct path
   */
  const outputDir = path.dirname(outputPath)
  const relativeImports = findStaticImports(code).filter(imp => imp.specifier.startsWith('./'))
  for (const imp of relativeImports) {
    /**
     * replace relative import with absolute import, e.g. given `transformedCode` has
     * a relative import such as:
     *
     * ```js
     * import { f as format } from './utils.js';
     * ```
     *
     * and given the value of `imp` is determined to be:
     *
     * ```
     * {
     *   type: 'static',
     *   imports: '{ f as format } ',
     *   specifier: './utils.js',
     *   code: "import { f as format } from './utils.js';\n\n",
     *   start: 84,
     *   end: 127
     * }
     * ```
     *
     * if on a POSIX system, the new import will be:
     *
     * ```js
     * import { f as format } from '/path/to/project/dist/components/utils.js';
     * ```
     *
     * or, if on a WIN32 system:
     *
     * ```js
     * import { f as format } from 'C:/path/to/project/dist/components/utils.js';
     * ```
     */
    const localizedOutputPath = path.resolve(outputDir, imp.specifier)
    const newImport = imp.code.replace(imp.specifier, localizedOutputPath.split(path.sep).join(path.posix.sep))
    code = code.replace(imp.code, newImport)
  }

  /**
   * Make sure the original component class export is preserved, e.g.
   * given the component is defined within the file:
   *
   * ```ts
   * import { proxyCustomElement, HTMLElement, h, Host } from '@stencil/core/internal/client';
   * // ...
   * const Accordion = \/*@__PURE__*\/ proxyCustomElement(class Accordion extends HTMLElement {
   *   // ...
   * }, [...]);
   * // ...
   * const IonAccordion = Accordion;
   * const defineCustomElement = defineCustomElement$1;
   * export { IonAccordion, defineCustomElement };
   * ```
   *
   * then we have to export the original component class:
   *
   * ```ts
   * import { proxyCustomElement, HTMLElement, h, Host } from '@stencil/core/internal/client';
   * // ...
   * export const Accordion = \/*@__PURE__*\/ proxyCustomElement(class Accordion extends HTMLElement {
   *   // ...
   * }, [...]);
   * // ...
   * const IonAccordion = Accordion;
   * const defineCustomElement = defineCustomElement$1;
   * export { IonAccordion, defineCustomElement };
   * ```
   */
  if (code.includes(COMPONENT_CLASS_DEFINITION)) {
    code = code.split('\n').map((l: string) => (
      l.includes(COMPONENT_CLASS_DEFINITION) ? `export ${l}` : l
    )).join('\n')
  }
  /**
   * or if the component is defined outside of the file:
   *
   * ```ts
   * import { B as Button, d as defineCustomElement$1 } from '/path/to/project/dist/components/button.js';
   *
   * const IonButton = Button;
   * const defineCustomElement = defineCustomElement$1;
   *
   * export { IonButton, defineCustomElement };
   * ```
   *
   * the new import will be:
   *
   * ```ts
   * import { B as Button, d as defineCustomElement$1 } from '/path/to/project/dist/components/button.js';
   *
   * const IonButton = Button;
   * const defineCustomElement = defineCustomElement$1;
   *
   * export { IonButton, defineCustomElement };
   * export { Button } from '/path/to/project/dist/components/button.js'
   * ```
   */
  else {
    const componentImport = imports.find(imp => Object.values(imp.namedImports || {}).find((i: string) => i.startsWith('defineCustomElement')))
    /**
     * this assumes that the first named import is the component name
     */
    const namedImport = Object.entries(componentImport?.namedImports || {})[0]
    if (namedImport && componentImport) {
      const localizedOutputPath = path.resolve(outputDir, componentImport.specifier)
      code += `\nexport { ${namedImport.join(' as ')} } from '${localizedOutputPath.split(path.sep).join(path.posix.sep)}';\n`
    }
  }

  return code
}
