import type * as CoreCompiler from '@stencil/core/compiler'
import type { UnpluginFactory } from 'unplugin'

import type { Options } from './types.js'
import path from 'node:path'
import process from 'node:process'

import { createCompiler } from '@stencil/core/compiler/stencil.js'
import nodeApi from '@stencil/core/sys/node/index.js'
import { findStaticImports, parseStaticImport } from 'mlly'

import { createUnplugin } from 'unplugin'
import { STENCIL_IMPORT } from './constants.js'
import { getRootDir, getStencilConfigFile, parseTagConfig } from './utils.js'

let compiler: CoreCompiler.Compiler | undefined

async function cleanup() {
  await compiler?.destroy()
  compiler = undefined
  process.exit(1)
}
process.on('SIGTERM', cleanup)
process.on('SIGINT', cleanup)

export const unpluginFactory: UnpluginFactory<Options | undefined> = (options = {}) => ({
  name: 'unplugin-stencil',
  enforce: 'pre',
  /**
   * This hook is called when the build starts. It is a good place to initialize
   */
  async buildStart() {
    const configPath = await getStencilConfigFile(options)
    const nodeLogger = nodeApi.createNodeLogger()
    const nodeSys = nodeApi.createNodeSys({ process, logger: nodeLogger })
    nodeApi.setupNodeProcess({ process, logger: nodeLogger })
    const coreCompiler = await nodeSys.dynamicImport!(nodeSys.getCompilerExecutingPath()) as { loadConfig: typeof CoreCompiler.loadConfig }
    const validated = await coreCompiler.loadConfig({
      config: {
        rootDir: getRootDir(options),
        tsCompilerOptions: {
          skipLibCheck: true,
        },
        flags: {
          task: 'build' as const,
          args: [],
          knownArgs: [],
          unknownArgs: [],
        },
      },
      configPath,
      logger: nodeLogger,
      sys: nodeSys,
    })
    compiler = await createCompiler(validated.config)
  },
  /**
   * `transformInclude` is called for every file that is being transformed.
   * If it returns `true`, the file will be transformed.
   * @param id path of the file
   * @returns whether the file should be transformed
   */
  transformInclude(id) {
    return id.endsWith('.tsx')
  },
  /**
   * This hook is called when a file is being transformed.
   * @param code the source code of the file
   * @param id path of the file
   * @returns the transformed code
   */
  async transform(code, id) {
    const staticImports = findStaticImports(code)
    const stencilImports = staticImports
      .filter(imp => imp.specifier === STENCIL_IMPORT)
      .map(imp => parseStaticImport(imp))
    const isStencilComponent = stencilImports.some(imp => 'Component' in (imp.namedImports || {}))

    /**
     * if file doesn't define a Stencil component
     */
    if (!compiler || (!isStencilComponent && !id.endsWith('.css')))
      return { code }

    const result = await compiler.build()
    const componentTag = parseTagConfig(code)
    const outputPath = result.outputs.find(o => o.type === 'dist-custom-elements')?.files.find((f) => {
      /**
       * the output file name is the component tag
       */
      return componentTag && path.basename(f) === `${componentTag}.js`
    })

    if (!outputPath)
      throw new Error('Could not find the output file')

    let transformedCode = await compiler.sys.readFile(outputPath)

    /**
     * make relative imports absolute to Vite can pick up the correct path
     */
    const outputDir = path.dirname(outputPath)
    const relativeImports = findStaticImports(transformedCode).filter(imp => imp.specifier.startsWith('./'))
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
       * the new import will be:
       *
       * ```js
       * import { f as format } from '/path/to/project/dist/components/utils.js';
       * ```
       */
      const newImport = imp.code.replace(imp.specifier, path.resolve(outputDir, imp.specifier))
      transformedCode = transformedCode.replace(imp.code, newImport)
    }

    return {
      code: transformedCode,
      inputFilePath: id,
    }
  },
})

export const unplugin = /* #__PURE__ */ createUnplugin(unpluginFactory)

export default unplugin
