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
    // Patrón con comodín (no la versión exacta) para no tener que actualizar
    // este archivo cada vez que se sube de versión la carpeta de la extensión.
    "etiquetalive-chrome-extension-*/**",
  ]),
]);

export default eslintConfig;
