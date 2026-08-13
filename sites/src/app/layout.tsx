import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { siteUrl } from "@/lib/site-url";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export function generateMetadata(): Metadata {
  const base = siteUrl();
  return {
    title: "AI4S — AI 行业动态聚合 · 每日精选",
    description:
      "AI4S 每日精选 AI 行业动态：模型发布、产品发布、行业事件、论文、教程与观点。今天有什么 AI 新闻，一站看全。",
    metadataBase: new URL(base),
    applicationName: "AI4S",
    manifest: "/manifest.webmanifest",
    icons: {
      icon: "/icon.svg",
      apple: "/icon.svg",
    },
    appleWebApp: {
      capable: true,
      title: "AI4S",
      statusBarStyle: "default",
    },
    openGraph: {
      title: "AI4S — AI 行业动态聚合 · 每日精选",
      description:
        "AI4S 每日精选 AI 行业动态：模型发布、产品发布、行业事件、论文、教程与观点。",
      locale: "zh_CN",
      type: "website",
    },
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  const siteUrlValue = siteUrl();
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteUrlValue}/#organization`,
        name: "AI4S",
        url: siteUrlValue,
        description:
          "AI4S 每日精选 AI 行业动态：模型发布、产品发布、行业事件、论文、教程与观点。",
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrlValue}/#website`,
        url: siteUrlValue,
        name: "AI4S",
        description:
          "AI4S 每日精选 AI 行业动态：模型发布、产品发布、行业事件、论文、教程与观点。",
        inLanguage: "zh-CN",
        publisher: { "@id": `${siteUrlValue}/#organization` },
      },
    ],
  };
  return (
    <html lang="zh-CN" className={`${geistSans.variable} ${geistMono.variable}`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
