import type * as CoreCompiler from '@stencil/core/compiler'
import type { OutputTargetDistCustomElements } from '@stencil/core/internal'

import type { UnpluginFactory } from 'unplugin'
import type { Options } from './types.js'
import path from 'node:path'

import process from 'node:process'
import { createCompiler } from '@stencil/core/compiler'
import nodeApi from '@stencil/core/sys/node'
import { findStaticImports, parseStaticImport } from 'mlly'

import { createUnplugin } from 'unplugin'
import { BuildQueue } from './build-queue'
import { STENCIL_IMPORT } from './constants.js'
import { getRootDir, getStencilConfigFile, parseTagConfig, transformCompiledCode } from './utils.js'

const DCE_OUTPUT_TARGET_NAME = 'dist-custom-elements'

let compiler: CoreCompiler.Compiler | undefined
let buildQueue: BuildQueue | undefined

async function cleanup() {
  await compiler?.destroy()
  compiler = undefined
  process.exit(1)
}
process.on('SIGTERM', cleanup)
process.on('SIGINT', cleanup)

export const unpluginFactory: UnpluginFactory<Options | undefined> = (options = {}) => {
  const isWatchMode = process.env.NODE_ENV !== 'production' || process.argv.includes('--watch')
  const nodeLogger = nodeApi.createNodeLogger()
  let distCustomElementsOptions: OutputTargetDistCustomElements | undefined

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
      buildQueue = new BuildQueue(compiler)
    },
    closeBundle() {
      if (!isWatchMode) {
        process.exit(0)
      }
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
     * try to resolve any dynamic imported file through the compiler output directory
     * @param id the id to resolve
     * @returns the resolved id or null if not found
     */
    resolveId(id) {
      if (id.startsWith('.') && compiler && distCustomElementsOptions?.dir) {
        const compiledPath = path.resolve(distCustomElementsOptions.dir, id)
        try {
          const exists = compiler.sys.accessSync(compiledPath)
          if (exists) {
            return compiledPath
          }
        }
        catch {
          return null
        }
      }
      return null
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
       * don't compile the file if:
       */
      if (
        /**
         * something with the setup failed and some of the primitives we need
         * to compile the file are missing
         */
        !compiler || !buildQueue
        /**
         * the output directory is not set
         */
        || !distCustomElementsOptions || !distCustomElementsOptions.dir
        /**
         * the file is not a Stencil component and not a CSS file
         */
        || (!isStencilComponent && !id.endsWith('.css'))
      ) {
        return
      }

      const componentTag = parseTagConfig(code)
      const compilerFilePath = path.resolve(distCustomElementsOptions.dir, `${componentTag}.js`)

      const raw = await buildQueue.getLatestBuild(id, compilerFilePath)

      const exists = await compiler.sys.access(compilerFilePath)
      if (!exists)
        throw new Error('Could not find the output file')

      const transformedCode = await transformCompiledCode(
        raw,
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
