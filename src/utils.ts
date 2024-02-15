import type { ParsedStaticImport } from 'mlly'

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
