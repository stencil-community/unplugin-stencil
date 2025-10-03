import path from 'node:path';
import { defineConfig } from 'vitest/config';
import stencil from './src/vite';

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      include: [
        'src/**/*.ts',
        'playground/components/**/*.tsx',
      ],
    },
    projects: [
      {
        test: {
          name: 'unplugin',
          include: ['test/**/*.test.ts'],
        },
      },
      {
        plugins: [
          stencil({
            rootPath: path.join(__dirname, 'playground')
          })
        ],
        test: {
          dir: './playground',
          name: 'playground',
          include: ['**/*.spec.{ts,tsx}'],
          browser: {
            enabled: true,
            provider: 'playwright',
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
