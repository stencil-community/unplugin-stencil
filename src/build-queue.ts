import type * as CoreCompiler from '@stencil/core/compiler'
import { EventEmitter } from 'node:events'

export class BuildQueue extends EventEmitter {
  #compiler: CoreCompiler.Compiler
  #isBuilding = false
  #pending = false

  constructor(compiler: CoreCompiler.Compiler) {
    super()
    this.#compiler = compiler
  }

  /**
   * Queues a build process. If a build is already in progress, set a pending flag and skip the build. Other vice initiates another build afterward
   */
  #queueBuild() {
    if (this.#isBuilding) {
      this.#pending = true
      return
    }
    this.#runBuild()
  }

  /**
   * Executes the build process. If a build is already in progress, sets a pending flag to queue another build upon completion.
   * @private
   */
  async #runBuild() {
    this.#isBuilding = true
    this.emit('buildStart')
    try {
      await this.#compiler.build()
    }
    catch (err) {
      this.emit('buildError', err)
      throw err
    }
    finally {
      this.#isBuilding = false
      if (this.#pending) {
        this.#pending = false
        await this.#runBuild()
      }
      else {
        this.emit('buildFinished')
      }
    }
  }

  async getLatestBuild(srcPath: string, distPath: string) {
    try {
      const [srcStats, distStats] = await Promise.all([
        this.#compiler?.sys.stat(srcPath),
        this.#compiler?.sys.stat(distPath),
      ])

      if (
        distStats?.mtimeMs
        && srcStats?.mtimeMs
        && distStats.mtimeMs >= srcStats.mtimeMs
      ) {
        return
      }
    }
    catch {}

    this.#queueBuild()

    if (!this.#isBuilding && !this.#pending)
      return

    await new Promise(resolve => this.once('buildFinished', resolve))
    return this.#compiler!.sys.readFile(distPath)
  }
}
