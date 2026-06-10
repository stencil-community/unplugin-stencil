import type { CompilerBuildResults } from '@stencil/core/internal'
import { EventEmitter } from 'node:events'

export const stencilBuildEvents = new EventEmitter()

export interface StencilBuildEvents {
  buildFinished: (results: CompilerBuildResults) => void
  buildError: (err: unknown) => void
}
