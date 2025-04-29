import type * as CoreCompiler from '@stencil/core/compiler'
import type { UnpluginFactory } from 'unplugin'

import type { Options } from './types.js'
import path from 'node:path'
import process from 'node:process'

import { OutputTargetDistCustomElements } from '@stencil/core/internal'
import { createCompiler } from '@stencil/core/compiler/stencil.js'
import nodeApi from '@stencil/core/sys/node/index.js'
import { findStaticImports, parseStaticImport } from 'mlly'

import { createUnplugin } from 'unplugin'
import { STENCIL_IMPORT } from './constants.js'
import { getRootDir, getStencilConfigFile, parseTagConfig, transformCompiledCode } from './utils.js'

let compiler: CoreCompiler.Compiler | undefined
const DCE_OUTPUT_TARGET_NAME = 'dist-custom-elements'

async function cleanup() {
  await compiler?.destroy()
  compiler = undefined
  process.exit(1)
}
process.on('SIGTERM', cleanup)
process.on('SIGINT', cleanup)

export const unpluginFactory: UnpluginFactory<Options | undefined> = (options = {}) => {
  const nodeLogger = nodeApi.createNodeLogger()
  let distCustomElementsOptions: OutputTargetDistCustomElements | undefined
  let compilerPromise: Promise<void> | undefined

  return {
    name: 'unplugin-stencil',
    enforce: 'pre',
    /**
     * This hook is called when the build starts. It is a good place to initialize
     */
    async buildStart() {
      const configPath = await getStencilConfigFile(options)
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

      distCustomElementsOptions = validated.config.outputTargets.find(o => o.type === DCE_OUTPUT_TARGET_NAME) as OutputTargetDistCustomElements
      if (!distCustomElementsOptions)
        throw new Error(`Could not find "${DCE_OUTPUT_TARGET_NAME}" output target`)

      compiler = await createCompiler(validated.config)
      const watcher = await compiler.createWatcher()

      function onChange() {
        nodeLogger.info(`[unplugin-stencil] Compiling...`)
        compilerPromise = new Promise((resolve) => compiler?.build().finally(() => resolve()))
      }
      watcher.on('fileAdd', onChange)
      watcher.on('fileDelete', onChange)
      watcher.on('fileUpdate', onChange)
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
      const imports = staticImports
        .filter(imp => imp.specifier === STENCIL_IMPORT)
        .map(imp => parseStaticImport(imp))
      const isStencilComponent = imports.some(imp => 'Component' in (imp.namedImports || {}))

      /**
       * if file doesn't define a Stencil component
       */
      if (!compiler || !distCustomElementsOptions || !distCustomElementsOptions.dir || (!isStencilComponent && !id.endsWith('.css')))
        return { code }

      if (compilerPromise) {
        nodeLogger.info(`[unplugin-stencil] Waiting for compiler to finish...`)
        await compilerPromise
      }

      const componentTag = parseTagConfig(code)
      const compilerFilePath = path.resolve(distCustomElementsOptions.dir, `${componentTag}.js`)
      const compilerFileExists = await compiler.sys.access(compilerFilePath)

      if (!compilerFileExists)
        throw new Error('Could not find the output file')

      const transformedCode = await transformCompiledCode(
        await compiler.sys.readFile(compilerFilePath),
        compilerFilePath,
      )

      return {
        code: transformedCode,
        inputFilePath: id,
      }
    },
  }
}

export const unplugin = /* #__PURE__ */ createUnplugin(unpluginFactory)

export default unplugin
