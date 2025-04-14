import path from 'node:path'
import process from 'node:process'

import type { UnpluginFactory } from 'unplugin'
import { createUnplugin } from 'unplugin'
import { findStaticImports, parseStaticImport } from 'mlly'

import nodeApi from '@stencil/core/sys/node/index.js'
import type * as CoreCompiler from '@stencil/core/compiler'
import { createCompiler } from '@stencil/core/compiler/stencil.js'

import { STENCIL_IMPORT } from './constants.js'
import { createStencilConfigFile, getRootDir } from './utils.js'
import type { Options } from './types.js'

let compiler: CoreCompiler.Compiler | undefined

export const unpluginFactory: UnpluginFactory<Options | undefined> = (options = {}) => ({
  name: 'unplugin-stencil',
  enforce: 'pre',
  /**
   * This hook is called when the build starts. It is a good place to initialize
   */
  async buildStart() {
    const configPath = await createStencilConfigFile(options)
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
    const outputPath = result.outputs.find(o => o.type === 'dist-custom-elements')?.files.find((f) => {
      return path.basename(f) === path.basename(id).replace('.tsx', '.js')
    })

    if (!outputPath)
      throw new Error('Could not find the output file')

    const transformedCode = await compiler.sys.readFile(outputPath)
    return {
      code: transformedCode,
      inputFilePath: id,
    }
  },
})

export const unplugin = /* #__PURE__ */ createUnplugin(unpluginFactory)

export default unplugin
