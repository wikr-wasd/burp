import { ImageResponse } from "next/og";

/**
 * Favicon. Genereras i stället för att checkas in som binärfil, så att
 * märkesfärgen bara står på ett ställe och ikonen inte kan glida isär från
 * resten av gränssnittet.
 */

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // Samma ton som `themeColor` i layouten och `burp-600` i temat.
          background: "#c2410c",
          color: "#ffffff",
          fontSize: 22,
          fontWeight: 700,
        }}
      >
        B
      </div>
    ),
    size,
  );
}
