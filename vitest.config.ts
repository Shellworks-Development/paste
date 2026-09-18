import { fileURLToPath } from "node:url";

import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vite-plus";

export default defineConfig(async () => {
  const migrations = await readD1Migrations(
    fileURLToPath(new URL("./migrations", import.meta.url)),
  );

  const alias = {
    "@": fileURLToPath(new URL("./src", import.meta.url)),
    "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
  };

  return {
    resolve: { alias },
    test: {
      projects: [
        {
          resolve: { alias },
          plugins: [
            cloudflareTest({
              wrangler: { configPath: "./wrangler.jsonc" },
              miniflare: {
                bindings: {
                  TEST_MIGRATIONS: migrations,
                  ADMIN_TOKEN: "test-admin-token",
                  TOKEN_COOLDOWN_SECONDS: "60",
                },
              },
            }),
          ],
          test: {
            name: "workers",
            setupFiles: ["./test/setup.ts"],
            include: ["test/**/*.spec.ts"],
            exclude: ["test/client/**"],
          },
        },
        {
          resolve: { alias },
          test: {
            name: "client",
            environment: "jsdom",
            include: ["test/client/**/*.spec.ts"],
          },
        },
      ],
    },
  };
});
