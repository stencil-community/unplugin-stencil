import type { Compiler } from '@stencil/core/compiler'
import { describe, expect, it, vi } from 'vitest'
import { stencilBuildEvents } from '../src/build-events'
import { BuildQueue } from '../src/build-queue'

describe('stencilBuildEvents', () => {
  it('forwards buildFinished from BuildQueue', async () => {
    const buildResults = { buildId: 1, hasError: false } as Awaited<
      ReturnType<Compiler['build']>
    >
    const compiler = {
      build: vi.fn().mockResolvedValue(buildResults),
      sys: {
        stat: vi.fn().mockRejectedValue(new Error('missing')),
        readFile: vi.fn(),
      },
    } as unknown as Compiler

    const queue = new BuildQueue(compiler)
    const onFinished = vi.fn()
    stencilBuildEvents.on('buildFinished', onFinished)

    await queue.getLatestBuild('/src/cmp.tsx', '/dist/cmp.js')

    expect(onFinished).toHaveBeenCalledWith(buildResults)
    stencilBuildEvents.off('buildFinished', onFinished)
  })
})
