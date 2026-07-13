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

export function requireStripeEnv() {
  return {
    secretKey: required("STRIPE_SECRET_KEY"),
    webhookSecret: required("STRIPE_WEBHOOK_SECRET"),
  };
}
