import { defineConfig } from "vitest/config";
import stencil from "./src/vite";
import path from "node:path";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unplugin",
          include: ["test/**/*.test.ts"],
        },
      },
      {
        plugins: [
          stencil({
            rootPath: path.join(__dirname, 'playground')
          })
        ],
        test: {
          dir: "./playground",
          name: "playground",
          include: ["**/*.spec.{ts,tsx}"],
          browser: {
            enabled: true,
            provider: "playwright",
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
