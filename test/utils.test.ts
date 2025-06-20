import type path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCompilerOptions, getRootDir, injectStencilImports, parseTagConfig, transformCompiledCode } from '../src/utils'

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

describe('parseTagConfig', () => {
  it('should return the tag config', () => {
    expect(parseTagConfig('@Component({ tag: "test" })')).toBe('test')
    expect(parseTagConfig('@Component({ tag: \'test\' })')).toBe('test')
    expect(parseTagConfig('@Component({tag:`test`, \n\nstyleUrl: "test.css"})')).toBe('test')
  })

  it('should return undefined if no tag config is found', () => {
    expect(parseTagConfig('@Component({})')).toBe(undefined)
  })
})

const sourceCode = `import { B as Button, d as defineCustomElement$1 } from './components/button.js';

import { f as format } from './utils.js';

const IonButton = Button
const defineCustomElement = defineCustomElement$1

export { defineCustomElement, IonButton }
`

describe('transformCompiledCode', () => {
  const mockedPlatform: { name: typeof process.platform } = vi.hoisted(() => ({
    name: 'linux',
  }))

  vi.mock('node:path', async () => {
    const actual = await vi.importActual<typeof path>('node:path')

    const getPlatformPath = () => mockedPlatform.name === 'win32'
      ? actual.win32
      : actual.posix

    const obj = {
      ...actual,
      dirname: (path: string) => getPlatformPath().dirname(path),
      resolve: (...paths: string[]) => getPlatformPath().resolve(...paths),
      get sep() {
        return getPlatformPath().sep
      },
    }

    return {
      ...obj,
      default: obj,
    }
  })

  afterEach(() => {
    vi.resetModules()
  })

  describe('on a POSIX system', () => {
    it('should transform the compiled code', () => {
      mockedPlatform.name = 'linux'

      expect(transformCompiledCode(sourceCode, '/foo/bar/loo/test.js')).toMatchInlineSnapshot(`
        "import { B as Button, d as defineCustomElement$1 } from '/foo/bar/loo/components/button.js';

        import { f as format } from '/foo/bar/loo/utils.js';

        const IonButton = Button
        const defineCustomElement = defineCustomElement$1

        export { defineCustomElement, IonButton }

        export { B as Button } from '/foo/bar/loo/components/button.js';
        "
      `)
    })
  })

  describe('on a WIN32 system', () => {
    it('should transform the compiled code', () => {
      mockedPlatform.name = 'win32'

      expect(transformCompiledCode(sourceCode, 'C:\\foo\\bar\\loo\\test.js')).toMatchInlineSnapshot(`
        "import { B as Button, d as defineCustomElement$1 } from 'C:/foo/bar/loo/components/button.js';

        import { f as format } from 'C:/foo/bar/loo/utils.js';

        const IonButton = Button
        const defineCustomElement = defineCustomElement$1

        export { defineCustomElement, IonButton }

        export { B as Button } from 'C:/foo/bar/loo/components/button.js';
        "
      `)
    })
  })
})
