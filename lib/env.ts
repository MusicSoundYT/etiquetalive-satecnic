function required(name: string): string {
  const value = process.env[name];
  if (!value || value.includes("TODO_PENDIENTE")) {
    throw new Error(`Falta la variable de entorno obligatoria: ${name}`);
  }
  return value;
}

export const env = {
  supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL"),
  supabasePublishableKey: required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  sessionSecret: required("SESSION_SECRET"),
  appUrl: required("APP_URL"),
  smtp: {
    host: required("SMTP_HOST"),
    port: Number(required("SMTP_PORT")),
    secure: process.env.SMTP_SECURE === "true",
    user: required("SMTP_USER"),
    pass: required("SMTP_PASS"),
  },
} as const;

export function requireTikTokShopEnv() {
  return {
    appKey: required("TIKTOK_APP_KEY"),
    appSecret: required("TIKTOK_APP_SECRET"),
    serviceId: required("TIKTOK_SERVICE_ID"),
  };
}

export function requireStripeEnv() {
  return {
    secretKey: required("STRIPE_SECRET_KEY"),
    webhookSecret: required("STRIPE_WEBHOOK_SECRET"),
  };
}

// Compartido por todas las rutas de cron (exportación a Caja TikTok, resumen
// de impresiones...) — no depende de ninguna integración concreta.
export function requireCronSecret(): string {
  return required("CRON_SECRET");
}

// Proyecto Supabase del hermano "Caja TikTok" (cajatiktok), completamente
// aparte del nuestro — se escribe ahí con la service_role key porque el
// cron corre sin ninguna sesión de usuario que RLS pueda reconocer.
export function requireCajaTikTokExportEnv() {
  return {
    supabaseUrl: required("CAJATIKTOK_SUPABASE_URL"),
    supabaseServiceRoleKey: required("CAJATIKTOK_SUPABASE_SERVICE_ROLE_KEY"),
    cronSecret: requireCronSecret(),
  };
}
