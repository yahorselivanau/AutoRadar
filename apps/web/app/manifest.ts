import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Авто Радар",
    short_name: "Авто Радар",
    description: "Умный поиск и сравнение цен на автозапчасти в Беларуси.",
    start_url: "/",
    display: "standalone",
    background_color: "#F8F8F6",
    theme_color: "#F8F8F6",
    icons: [
      {
        src: "/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
