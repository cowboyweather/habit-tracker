import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Habit Tracker",
    short_name: "Habit Tracker",
    start_url: "/",
    display: "standalone",
    background_color: "#E8F1F0",
    theme_color: "#E8F1F0",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
