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
  {
    /*
     * `src/vendor/**` adalah kode spicy-lyrics yang DISALIN apa adanya
     * (AGPL-3.0, lihat header tiap file + LICENSE-AGPL-3.0 di sana). Upstream
     * dikompilasi dengan `strict: false` dan `strictNullChecks: false`, lalu
     * dilint dengan oxlint — jadi gayanya sah di repo mereka tapi menembak
     * aturan kita: `any` di kontrak AnimatorStore, `@ts-ignore` untuk paket
     * `cubic-spline` yang tanpa @types, variabel sisa eksperimen yang tidak
     * dipakai, dan ternary-sebagai-pernyataan untuk menambah kelas CSS.
     *
     * Mematikannya HANYA di path ini jauh lebih murah daripada "merapikan"
     * file vendor. Tujuan vendoring justru supaya animasi dan penempatan
     * hurufnya berperilaku sama seperti aplikasi asal; makin dekat ke upstream,
     * makin murah menarik perbaikan mereka berikutnya. Kode LARAS di luar sini
     * tetap tunduk pada aturan penuh.
     */
    files: ["src/vendor/**/*.{ts,tsx}"],
    linterOptions: {
      // Sebagian file upstream membawa `eslint-disable` untuk aturan yang tidak
      // kita nyalakan. Direktif yang "tidak terpakai" itu bukan masalah kita,
      // dan menghapusnya berarti mengubah file vendor tanpa alasan.
      reportUnusedDisableDirectives: "off",
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "@typescript-eslint/ban-ts-comment": "off",
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
