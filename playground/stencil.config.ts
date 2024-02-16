import type { Config } from '@stencil/core'
import { reactOutputTarget } from '@stencil/react-output-target'

export const config: Config = {
  namespace: 'crypto',
  outputTargets: [
    {
      type: 'dist-custom-elements',
    },
    // reactOutputTarget({
    //   proxiesFile: './src/index.ts',
    // }),
  ],
  testing: {
    browserHeadless: 'new',
  },
}
