import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { CookieBanner } from "@/components/cookie-banner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Etiqueta Live",
  description: "Impresión de etiquetas para pedidos de subastas TikTok Live",
};

// Se ejecuta antes de que React hidrate, para fijar el tema (claro/oscuro/
// automático, guardado por components/theme-toggle.tsx) sin que se vea un
// parpadeo del tema equivocado al cargar la página.
const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem('el_theme')||'auto';var d=p==='dark'||(p==='auto'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <div className="flex flex-1 flex-col">{children}</div>
        <SiteFooter />
        <CookieBanner />
      </body>
    </html>
  );
}
