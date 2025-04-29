import type { Config } from '@stencil/core'

export const STENCIL_BUILD_DIR = '.stencil'
export const STENCIL_IMPORT = '@stencil/core'
export const DEFAULT_STENCIL_CONFIG: Config = {
  watch: false,
  outputTargets: [
    {
      type: 'dist-custom-elements',
      externalRuntime: true,
      customElementsExportBehavior: 'auto-define-custom-elements',
    },
  ],
}

export const COMPONENT_CLASS_DEFINITION = '/*@__PURE__*/ proxyCustomElement(class '
