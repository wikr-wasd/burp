/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // @burp/core konsumeras som TypeScript-källa i stället för byggd dist.
  // Ett bygg-steg mindre i utvecklingen, och typerna följer alltid källan.
  transpilePackages: ["@burp/core"],

  experimental: {
    // Delade typer mellan webb och kommande React Native-app kräver att
    // paketet får ligga utanför apps/web i monorepot.
    externalDir: true,
  },

  images: {
    // Menybilder levereras via Supabase Storage-CDN (avsnitt 8.1).
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self), payment=(self)",
          },
        ],
      },
      {
        // QR-sidan får aldrig cachas av mellanliggande proxyer. Två gäster vid
        // olika bord skulle annars kunna få varandras bordssession.
        source: "/t/:token",
        headers: [{ key: "Cache-Control", value: "no-store, private" }],
      },
    ];
  },
};

module.exports = nextConfig;
