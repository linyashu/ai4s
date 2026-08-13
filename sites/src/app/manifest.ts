import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AI4S — AI 行业动态聚合",
    short_name: "AI4S",
    description:
      "AI4S 每日精选 AI 行业动态：模型发布、产品发布、行业事件、论文、教程与观点。",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f5f6",
    theme_color: "#f4f5f6",
    lang: "zh-CN",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
