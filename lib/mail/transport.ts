import "server-only";
import nodemailer from "nodemailer";
import { env } from "@/lib/env";

export const mailTransport = nodemailer.createTransport({
  host: env.smtp.host,
  port: env.smtp.port,
  secure: env.smtp.secure,
  auth: { user: env.smtp.user, pass: env.smtp.pass },
});

export async function sendMail(opts: { to: string; subject: string; html: string }) {
  await mailTransport.sendMail({
    from: `"Etiqueta Live" <${env.smtp.user}>`,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
}
