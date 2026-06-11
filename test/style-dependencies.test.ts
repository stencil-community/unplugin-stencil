import type { CompilerSystem } from '@stencil/core/internal'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  clearStyleDependencies,
  extractStylePathsFromSource,
  getComponentStyleDependencies,
  rebuildStyleMap,
  setGlobalStyleFromConfig,
} from '../src/style-dependencies'

describe('extractStylePathsFromSource', () => {
  const componentPath = '/project/src/components/my-cmp/my-cmp.tsx'
  const componentDir = path.dirname(componentPath)

  it('extracts styleUrl', () => {
    const code = `
import { Component } from '@stencil/core'

@Component({
  tag: 'my-cmp',
  styleUrl: 'my-cmp.css',
})
export class MyCmp {}
`
    const paths = extractStylePathsFromSource(componentPath, code)
    expect(paths).toEqual([path.resolve(componentDir, 'my-cmp.css')])
  })

  it('extracts styleUrls array', () => {
    const code = `
import { Component } from '@stencil/core'

@Component({
  tag: 'my-cmp',
  styleUrls: ['a.css', 'b.css'],
})
export class MyCmp {}
`
    const paths = extractStylePathsFromSource(componentPath, code)
    expect(paths).toEqual([
      path.resolve(componentDir, 'a.css'),
      path.resolve(componentDir, 'b.css'),
    ])
  })

  it('extracts styleUrls mode object', () => {
    const code = `
import { Component } from '@stencil/core'

@Component({
  tag: 'my-cmp',
  styleUrls: { ios: 'ios.css', md: ['md.css'] },
})
export class MyCmp {}
`
    const paths = extractStylePathsFromSource(componentPath, code)
    expect(paths).toEqual([
      path.resolve(componentDir, 'ios.css'),
      path.resolve(componentDir, 'md.css'),
    ])
  })

  it('returns empty when no @Component styles', () => {
    const code = `export const x = 1`
    expect(extractStylePathsFromSource(componentPath, code)).toEqual([])
  })
})

describe('getComponentStyleDependencies', () => {
  it('returns empty maps before any build', () => {
    clearStyleDependencies()
    const deps = getComponentStyleDependencies()
    expect(deps.byComponent.size).toBe(0)
    expect(deps.byStyle.size).toBe(0)
    expect(deps.globalStyle).toBeUndefined()
  })

  it('returns a defensive copy', () => {
    clearStyleDependencies()
    setGlobalStyleFromConfig({
      rootDir: '/project',
      globalStyle: 'src/global.css',
    })
    const a = getComponentStyleDependencies()
    const b = getComponentStyleDependencies()
    expect(a).not.toBe(b)
    expect(a.globalStyle).toBe(path.resolve('/project', 'src/global.css'))
    a.byComponent.set('/x', new Set(['/y']))
    expect(b.byComponent.size).toBe(0)
  })
})

describe('rebuildStyleMap', () => {
  it('builds byComponent and byStyle inverse map', async () => {
    clearStyleDependencies()

    const rootDir = path.resolve('/project')
    const srcDir = path.join(rootDir, 'src')
    const cmpPath = path.join(srcDir, 'cmp.tsx')
    const cssPath = path.join(srcDir, 'cmp.css')

    const files = new Map<string, string>([
      [
        cmpPath,
        `
import { Component } from '@stencil/core'
@Component({ tag: 'cmp', styleUrl: 'cmp.css' })
export class Cmp {}
`,
      ],
    ])

    const sys = {
      // `sys.readDir` returns full normalized paths, not basenames.
      readDir: async (dir: string) => {
        if (dir === srcDir)
          return [cmpPath]
        return []
      },
      stat: async (p: string) => ({
        isDirectory: p === srcDir,
        isFile: p === cmpPath,
        isSymbolicLink: false,
        size: 0,
        mtimeMs: 0,
        ctimeMs: 0,
        atimeMs: 0,
      }),
      readFile: async (p: string) => files.get(p) ?? '',
    } as unknown as CompilerSystem

    await rebuildStyleMap(sys, { rootDir, srcDir })

    const deps = getComponentStyleDependencies()
    expect(deps.byComponent.get(path.resolve(cmpPath))).toEqual(
      new Set([path.resolve(cssPath)]),
    )
    expect(deps.byStyle.get(path.resolve(cssPath))).toEqual(
      new Set([path.resolve(cmpPath)]),
    )
  })

  it('recurses into nested dirs using absolute paths from sys.readDir', async () => {
    clearStyleDependencies()

    const rootDir = path.resolve('/project')
    const srcDir = path.join(rootDir, 'src')
    const componentsDir = path.join(srcDir, 'components')
    const cmpDir = path.join(componentsDir, 'my-cmp')
    const cmpPath = path.join(cmpDir, 'my-cmp.tsx')
    const cssPath = path.join(cmpDir, 'my-cmp.css')

    const files = new Map<string, string>([
      [
        cmpPath,
        `
import { Component } from '@stencil/core'
@Component({ tag: 'my-cmp', styleUrl: 'my-cmp.css' })
export class MyCmp {}
`,
      ],
    ])

    // sys.readDir returns full normalized paths at every level.
    const dirEntries = new Map<string, string[]>([
      [srcDir, [componentsDir]],
      [componentsDir, [cmpDir]],
      [cmpDir, [cmpPath, cssPath]],
    ])
    const directories = new Set([srcDir, componentsDir, cmpDir])

    const sys = {
      readDir: async (dir: string) => dirEntries.get(dir) ?? [],
      stat: async (p: string) => ({
        isDirectory: directories.has(p),
        isFile: !directories.has(p),
        isSymbolicLink: false,
        size: 0,
        mtimeMs: 0,
        ctimeMs: 0,
        atimeMs: 0,
      }),
      readFile: async (p: string) => files.get(p) ?? '',
    } as unknown as CompilerSystem

    await rebuildStyleMap(sys, { rootDir, srcDir })

    const deps = getComponentStyleDependencies()
    expect(deps.byComponent.get(path.resolve(cmpPath))).toEqual(
      new Set([path.resolve(cssPath)]),
    )
    expect(deps.byStyle.get(path.resolve(cssPath))).toEqual(
      new Set([path.resolve(cmpPath)]),
    )
  })

  it('seeds globalStyle and an empty graph for a component-less scan', async () => {
    clearStyleDependencies()

    const rootDir = path.resolve('/project')
    const srcDir = path.join(rootDir, 'src')

    const sys = {
      readDir: async () => [],
      stat: async () => ({
        isDirectory: false,
        isFile: false,
        isSymbolicLink: false,
        size: 0,
        mtimeMs: 0,
        ctimeMs: 0,
        atimeMs: 0,
      }),
      readFile: async () => '',
    } as unknown as CompilerSystem

    await rebuildStyleMap(sys, {
      rootDir,
      srcDir,
      globalStyle: 'src/global.css',
    })

    const deps = getComponentStyleDependencies()
    expect(deps.byComponent.size).toBe(0)
    expect(deps.byStyle.size).toBe(0)
    expect(deps.globalStyle).toBe(path.resolve(rootDir, 'src/global.css'))
  })
})
