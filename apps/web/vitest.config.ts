import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Enhetstester för webbappens rena moduler.
 *
 * Route handlers och server components testas inte här — de kräver en riktig
 * databas och en körande server, och täcks av `scripts/smoke.sh`. Det som
 * ligger här är logik som går att köra fristående och som är dyr att ha fel:
 * skyddet mot öppen vidarebefordran, rate limitern och JSON-LD-escapningen.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@burp/core": fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url)),
    },
  },
});
