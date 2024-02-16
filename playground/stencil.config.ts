import type { Config } from '@stencil/core'

export const config: Config = {
  namespace: 'crypto',
  outputTargets: [
    {
      type: 'dist-custom-elements',
    },
  ],
  testing: {
    browserHeadless: 'new',
  },
}
