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
import { STENCIL_IMPORT } from './constants.js'
import { getRootDir, getStencilConfigFile, parseTagConfig, transformCompiledCode } from './utils.js'

const DCE_OUTPUT_TARGET_NAME = 'dist-custom-elements'
const transformedCache = new Map<string, { version: number, code: string }>()

let compiler: CoreCompiler.Compiler | undefined
let compilerPromise: Promise<void> | undefined
let latestRequestedVersion = 0

async function cleanup() {
  await compiler?.destroy()
  compiler = undefined
  process.exit(1)
}
process.on('SIGTERM', cleanup)
process.on('SIGINT', cleanup)

/**
 * Queue a build so that:
 *   1. Only one build runs at a time
 *   2. Rapid successive calls collapse into a single build
 *
 */
function queueBuild() {
  latestRequestedVersion++
  compilerPromise = (compilerPromise ?? Promise.resolve()).then(async () => {
    await compiler?.build()
    transformedCache.clear()
  })
  return compilerPromise
}

/**
 * Ensure that the compiled dist file is at least as new as the corresponding source file before we read it.
 *
 * @param srcPath Absolute path to the component’s **source** file (`.tsx`).
 * @param distPath Absolute path to the compiled **dist** file (`dist-custom-elements/<tag>.js`).
 */
async function ensureFreshBuild(srcPath: string, distPath: string) {
  try {
    const [srcStats, distStats] = await Promise.all([
      compiler?.sys.stat(srcPath),
      compiler?.sys.stat(distPath),
    ])

    if (
      distStats?.mtimeMs
      && srcStats?.mtimeMs
      && distStats.mtimeMs >= srcStats.mtimeMs
    ) {
      return
    }
  }
  catch {}

  await queueBuild()
  await waitForLatestBuild()
}

/**
 * Waits until the most recent Stencil build chain has completed
 */
async function waitForLatestBuild(): Promise<void> {
  while (true) {
    const pending = compilerPromise
    if (pending)
      await pending
    if (compilerPromise === pending)
      return
  }
}

export const unpluginFactory: UnpluginFactory<Options | undefined> = (options = {}) => {
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
      const watcher = await compiler.createWatcher()

      function onChange() {
        nodeLogger.info(`[unplugin-stencil] Compiling...`)
        compilerPromise = new Promise(resolve => compiler?.build().finally(() => resolve()))
      }
      watcher.on('fileAdd', onChange)
      watcher.on('fileDelete', onChange)
      watcher.on('fileUpdate', onChange)

      /**
       * trigger compiler once on build start
       */
      onChange()
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
       * if file doesn't define a Stencil component
       */
      if (!compiler || !distCustomElementsOptions || !distCustomElementsOptions.dir || (!isStencilComponent && !id.endsWith('.css')))
        return

      const componentTag = parseTagConfig(code)
      const compilerFilePath = path.resolve(distCustomElementsOptions.dir, `${componentTag}.js`)

      await ensureFreshBuild(id, compilerFilePath)

      await waitForLatestBuild()

      const exists = await compiler.sys.access(compilerFilePath)
      if (!exists)
        throw new Error('Could not find the output file')

      const raw = await compiler!.sys.readFile(compilerFilePath)
      const transformedCode = await transformCompiledCode(
        raw,
        compilerFilePath,
      )
      transformedCache.set(id, { version: latestRequestedVersion, code: transformedCode })

      return {
        code: transformedCode,
        inputFilePath: id,
      }
    },
  }
}

export const unplugin = /* #__PURE__ */ createUnplugin(unpluginFactory)

export default unplugin
