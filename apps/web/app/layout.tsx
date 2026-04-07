import { Geist, Geist_Mono } from "next/font/google";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { RootProvider } from "fumadocs-ui/provider/next";
import "./globals.css";

const fontSans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const fontMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
	title:
		"better-npm: Every npm package release, vetted before it reaches your node_modules",
	description:
		"An open-source npm registry proxy that scans every package release for malicious code, typosquatting, and supply chain attacks.",
	openGraph: {
		images: [{ url: "/og.png", width: 1200, height: 630 }],
	},
	twitter: {
		card: "summary_large_image",
		images: ["/og.png"],
	},
};

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en" className="dark" suppressHydrationWarning>
			<body
				className={`${fontSans.variable} ${fontMono.variable} font-sans antialiased`}
			>
				<RootProvider
					theme={{ defaultTheme: "dark", enabled: false }}
				>
					{children}
				</RootProvider>
			</body>
		</html>
	);
}
