import path from 'node:path'
import process from 'node:process'

import type { UnpluginFactory } from 'unplugin'
import { createUnplugin } from 'unplugin'
import { findStaticImports, parseStaticImport } from 'mlly'

import nodeApi from '@stencil/core/sys/node'
import type * as CoreCompiler from '@stencil/core/compiler'

import { createCompiler } from '@stencil/core/compiler/stencil.js'

import type { Options } from './types'

const STENCIL_IMPORT = '@stencil/core'

let compiler: CoreCompiler.Compiler | undefined

export const unpluginFactory: UnpluginFactory<Options | undefined> = () => ({
  name: 'unplugin-starter',
  enforce: 'pre',
  async buildStart() {
    const nodeLogger = nodeApi.createNodeLogger({ process })
    // @ts-expect-error see https://github.com/ionic-team/stencil/pull/5375
    const nodeSys = nodeApi.createNodeSys({ process, logger: nodeLogger })
    // @ts-expect-error see https://github.com/ionic-team/stencil/pull/5375
    nodeApi.setupNodeProcess({ process, logger: nodeLogger })
    const coreCompiler = await nodeSys.dynamicImport!(nodeSys.getCompilerExecutingPath()) as { loadConfig: typeof CoreCompiler.loadConfig }
    const validated = await coreCompiler.loadConfig({
      config: {
        flags: {
          task: 'build' as const,
          args: [],
          knownArgs: [],
          unknownArgs: [],
        },
      },
      configPath: '/Users/christian.bromann/Sites/Ionic/projects/unplugin-stencil/playground/stencil.config.ts',
      logger: nodeLogger,
      sys: nodeSys,
    })
    compiler = await createCompiler(validated.config)
  },
  transformInclude(id) {
    return id.endsWith('main.ts') || id.endsWith('.tsx')
  },
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

    let transformedCode = await compiler.sys.readFile(outputPath!).catch((err) => {
      console.log('error', err)
      return 'class MyComponent extends HTMLElement {}'
    })

    // const rootDir = '/Users/christian.bromann/Sites/Ionic/projects/unplugin-stencil/playground'
    // const tsCompilerOptions = getCompilerOptions(ts, rootDir)
    // const opts = {
    //   componentExport: 'module',
    //   componentMetadata: 'compilerstatic',
    //   coreImportPath: '@stencil/core/internal/client',
    //   currentDirectory: rootDir,
    //   file: path.basename(id),
    //   module: 'esm',
    //   sourceMap: 'inline',
    //   style: 'static',
    //   proxy: 'defineproperty',
    //   styleImportData: 'queryparams',
    //   transformAliasedImportPaths: false,
    //   target: tsCompilerOptions?.target || 'es2018',
    //   paths: tsCompilerOptions?.paths,
    //   baseUrl: tsCompilerOptions?.baseUrl,
    // } as const

    // const transpiledCode = transpileSync(code, opts)

    /**
     * StencilJS applies only a getter to the component without having a setter defined.
     * This causes issue in the browser as there is a check that the setter is defined
     * if the getter is defined. We can work around this by defining a setter.
     */
    // let transformedCode = transpiledCode.code.replace(
    //   'static get style()',
    //   'static set style(_) {}\n    static get style()',
    // )

    // /**
    //  * StencilJS does not import the `h` or `Fragment` function by default. We need to add it so the user
    //  * doesn't need to.
    //  */
    // transformedCode = injectStencilImports(transformedCode, stencilImports)

    /**
     * register the component to registry
     */
    transformedCode += '\ncustomElements.define("my-component", MyComponent)'

    return {
      // ...transpiledCode,
      code: transformedCode,
      inputFilePath: id,
    }
  },
})

export const unplugin = /* #__PURE__ */ createUnplugin(unpluginFactory)

export default unplugin
