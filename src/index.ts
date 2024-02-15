import path from 'node:path'

import type { UnpluginFactory } from 'unplugin'
import { createUnplugin } from 'unplugin'
import { findStaticImports, parseStaticImport } from 'mlly'

// @ts-expect-error foo
import { transpileSync, ts } from '@stencil/core/compiler/stencil.js'

import { getCompilerOptions, injectStencilImports } from './utils.js'
import type { Options } from './types'

const STENCIL_IMPORT = '@stencil/core'

export const unpluginFactory: UnpluginFactory<Options | undefined> = () => ({
  name: 'unplugin-starter',
  enforce: 'pre',
  transformInclude(id) {
    return id.endsWith('main.ts') || id.endsWith('.tsx')
  },
  transform(code, id) {
    const staticImports = findStaticImports(code)
    const stencilImports = staticImports
      .filter(imp => imp.specifier === STENCIL_IMPORT)
      .map(imp => parseStaticImport(imp))
    const isStencilComponent = stencilImports.some(imp => 'Component' in (imp.namedImports || {}))

    /**
     * if file doesn't define a Stencil component
     */
    if (!isStencilComponent && !id.endsWith('.css'))
      return { code }

    const rootDir = '/Users/christian.bromann/Sites/Ionic/projects/unplugin-stencil/playground'
    const tsCompilerOptions = getCompilerOptions(ts, rootDir)
    const opts = {
      componentExport: 'module',
      componentMetadata: 'compilerstatic',
      coreImportPath: '@stencil/core/internal/client',
      currentDirectory: rootDir,
      file: path.basename(id),
      module: 'esm',
      sourceMap: 'inline',
      style: 'static',
      proxy: 'defineproperty',
      styleImportData: 'queryparams',
      transformAliasedImportPaths: false,
      target: tsCompilerOptions?.target || 'es2018',
      paths: tsCompilerOptions?.paths,
      baseUrl: tsCompilerOptions?.baseUrl,
    } as const

    const transpiledCode = transpileSync(code, opts)

    /**
     * StencilJS applies only a getter to the component without having a setter defined.
     * This causes issue in the browser as there is a check that the setter is defined
     * if the getter is defined. We can work around this by defining a setter.
     */
    let transformedCode = transpiledCode.code.replace(
      'static get style()',
      'static set style(_) {}\n    static get style()',
    )

    /**
     * StencilJS does not import the `h` or `Fragment` function by default. We need to add it so the user
     * doesn't need to.
     */
    transformedCode = injectStencilImports(transformedCode, stencilImports)

    /**
     * register the component to registry
     */
    transformedCode += '\ncustomElements.define("my-component", MyComponent)'

    return {
      ...transpiledCode,
      code: transformedCode,
      inputFilePath: id,
    }
  },
})

export const unplugin = /* #__PURE__ */ createUnplugin(unpluginFactory)

export default unplugin
