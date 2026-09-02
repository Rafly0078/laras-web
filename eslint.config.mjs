import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    /*
     * Harness CDP di `scripts/` adalah skrip Node CommonJS: dijalankan langsung
     * lewat `node scripts/verify-*.cjs`, tanpa bundler dan di luar app. Di sana
     * `require()` justru satu-satunya bentuk yang benar, jadi aturan TypeScript
     * yang melarangnya tidak berlaku.
     */
    files: ["scripts/**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
