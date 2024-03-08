import type { Config } from '@stencil/core/internal'

export interface Options {
  /**
   * root directory of the project
   * @default process.cwd()
   */
  rootPath?: string
  /**
   * Stencil configuration
   */
  stencilConfig?: Config
}
