import type { MetadataRoute } from "next";

/** Lets vendors add Quán to their phone's home screen and open the editor like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Quán · Thực đơn QR",
    short_name: "Quán",
    description: "Thực đơn QR 4 thứ tiếng cho quán ăn, quán cà phê và nhà hàng.",
    lang: "vi",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#eef2ef",
    theme_color: "#14211c",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
