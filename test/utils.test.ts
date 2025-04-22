import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { getCompilerOptions, getRootDir, injectStencilImports } from '../src/utils'

const __dirname = path.dirname(new URL(import.meta.url).pathname)

vi.mock('node:fs/promises', () => ({
  default: {
    mkdir: vi.fn(),
    writeFile: vi.fn(),
  },
}))

describe('injectStencilImports', () => {
  it('should inject the right imports', () => {
    const code = 'import { Component } from "mlly";\n'
    const imports: any = [{ module: 'mlly', namedImports: { Component: true } }]
    expect(injectStencilImports(code, imports)).toBe([
      'import { Fragment } from \'@stencil/core/internal/client\';',
      'import { h } from \'@stencil/core/internal/client\';',
      'import { Component } from "mlly";\n',
    ].join('\n'))

    imports.push({ module: '@stencil/core', namedImports: { h: true } })
    expect(injectStencilImports(code, imports)).toBe([
      'import { Fragment } from \'@stencil/core/internal/client\';',
      'import { Component } from "mlly";\n',
    ].join('\n'))

    imports.push({ module: '@stencil/core', namedImports: { Fragment: true } })
    expect(injectStencilImports(code, imports)).toBe([
      'import { Component } from "mlly";\n',
    ].join('\n'))
  })
})

describe('getCompilerOptions', () => {
  it('should return null if no rootDir is given', () => {
    expect(getCompilerOptions({}, null as any)).toEqual(null)
  })

  it('should return null if no tsconfig file is found', () => {
    const ts = {
      findConfigFile: () => null,
      sys: { fileExist: () => false },
    }
    expect(getCompilerOptions(ts, '/')).toEqual(null)
  })

  it('should throw if the tsconfig file is invalid', () => {
    const ts = {
      findConfigFile: () => '/tsconfig.json',
      readConfigFile: () => ({ error: 'error' }),
      sys: { fileExist: () => true },
    }
    expect(() => getCompilerOptions(ts, '/')).toThrow()
  })

  it('should return the compiler options', () => {
    const ts = {
      findConfigFile: () => '/tsconfig.json',
      readConfigFile: () => ({ config: {} }),
      parseJsonConfigFileContent: () => ({ options: { skipLibCheck: true } }),
      sys: { fileExist: () => true },
    }
    expect(getCompilerOptions(ts, '/')).toEqual({ skipLibCheck: true })
  })

  it('should cache the result', () => {
    expect(getCompilerOptions({} as any, null as any)).toEqual({ skipLibCheck: true })
  })
})

describe('getRootDir', () => {
  it('should return the root path', () => {
    expect(getRootDir({ rootPath: '/test' })).toBe('/test')
    expect(getRootDir({})).toBe(process.cwd())
  })
})
