# Stencil Unplugin

[![NPM version](https://img.shields.io/npm/v/@stencil-community/unplugin-stencil?color=a1b858&label=)](https://www.npmjs.com/package/@stencil-community/unplugin-stencil)

An unplugin that wraps the [Stencil](https://stenciljs.com/) compiler to be used within Astro, Esbuild, Nuxt, Rollup, rspack, Vite and Webpack etc. environments.

## Install

To install this unplugin, run:

```bash
npm i @stencil-community/unplugin-stencil
```

<details>
<summary>Vite</summary><br>

```ts
// vite.config.ts
import stencil from '@stencil-community/unplugin-stencil/vite'

export default defineConfig({
  plugins: [
    stencil({ /* Stencil configuration overwrites */ }),
  ],
})
```

<br></details>

<details>
<summary>Rollup</summary><br>

```ts
// rollup.config.js
import Starter from '@stencil-community/unplugin-stencil/rollup'

export default {
  plugins: [
    Starter({ /* options */ }),
  ],
}
```

<br></details>

<details>
<summary>Webpack</summary><br>

```ts
// webpack.config.js
module.exports = {
  /* ... */
  plugins: [
    require('@stencil-community/unplugin-stencil/webpack')({ /* options */ })
  ]
}
```

<br></details>

<details>
<summary>Nuxt</summary><br>

```ts
// nuxt.config.js
export default defineNuxtConfig({
  modules: [
    ['@stencil-community/unplugin-stencil/nuxt', { /* options */ }],
  ],
})
```

> This module works for both Nuxt 2 and [Nuxt Vite](https://github.com/nuxt/vite)

<br></details>

<details>
<summary>Vue CLI</summary><br>

```ts
// vue.config.js
module.exports = {
  configureWebpack: {
    plugins: [
      require('@stencil-community/unplugin-stencil/webpack')({ /* options */ }),
    ],
  },
}
```

<br></details>

<details>
<summary>esbuild</summary><br>

```ts
// esbuild.config.js
import Starter from '@stencil-community/unplugin-stencil/esbuild'
import { build } from 'esbuild'

build({
  plugins: [Starter()],
})
```

<br></details>
