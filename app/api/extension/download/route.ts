import { NextResponse } from "next/server";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import JSZip from "jszip";
import { getSessionUser } from "@/lib/auth/session";

// Busca la carpeta por patrón (no por versión exacta) para que esta ruta
// nunca quede desactualizada al subir de versión la extensión — ya nos pasó
// una vez con el ignore de ESLint por tener la versión escrita a mano.
const EXTENSION_DIR_PATTERN = /^etiquetalive-chrome-extension-prod-v[\d.]+$/;

function findExtensionDir(): { dirPath: string; version: string } | null {
  const entries = readdirSync(process.cwd(), { withFileTypes: true });
  const match = entries.find((e) => e.isDirectory() && EXTENSION_DIR_PATTERN.test(e.name));
  if (!match) return null;
  const version = match.name.replace("etiquetalive-chrome-extension-prod-v", "");
  return { dirPath: path.join(process.cwd(), match.name), version };
}

/** Descarga la extensión de Chrome empaquetada en .zip, generada al vuelo desde la carpeta actual del repo (siempre la última versión desplegada). */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const found = findExtensionDir();
  if (!found) return NextResponse.json({ error: "No se encontró la extensión en el servidor." }, { status: 500 });

  const zip = new JSZip();
  for (const entry of readdirSync(found.dirPath)) {
    const fullPath = path.join(found.dirPath, entry);
    if (statSync(fullPath).isFile()) zip.file(entry, readFileSync(fullPath));
  }

  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="etiquetalive-extension-v${found.version}.zip"`,
    },
  });
}
