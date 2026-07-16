import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Material de referencia del cliente (no forma parte de esta app Next.js):
    "etiquetalive-legacy-server-current/**",
    "etiquetalive-chrome-extension-prod-v1.6.16/**",
  ]),
]);

export default eslintConfig;
