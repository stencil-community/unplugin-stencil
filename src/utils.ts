import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import type { Config as StencilConfig } from '@stencil/core'
import type { ParsedStaticImport } from 'mlly'

import type { Options } from './types.js'

import { DEFAULT_STENCIL_CONFIG, STENCIL_BUILD_DIR } from './constants.js'

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
export async function createStencilConfigFile(options: Options): Promise<string> {
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
