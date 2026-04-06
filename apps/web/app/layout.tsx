import { Geist, Geist_Mono } from "next/font/google";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const fontSans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const fontMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "better-npm — npm, but vetted",
  description:
    "Every npm package release, vetted before it reaches your node_modules.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(t){document.documentElement.className=t}}catch(e){}})()`;

  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${fontSans.variable} ${fontMono.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
