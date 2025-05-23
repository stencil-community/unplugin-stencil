import type * as CoreCompiler from '@stencil/core/compiler'

export class BuildQueue {
  #compiler: CoreCompiler.Compiler
  #isBuilding = false
  #pending = false

  constructor(compiler: CoreCompiler.Compiler) {
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
    try {
      await this.#compiler.build()
    }
    finally {
      this.#isBuilding = false
      if (this.#pending) {
        this.#pending = false
        await this.#runBuild()
      }
    }
  }

  async ensureFreshBuild(srcPath: string, distPath: string) {
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
    while (this.#isBuilding || this.#pending) await new Promise(r => setTimeout(r, 25))
  }
}
