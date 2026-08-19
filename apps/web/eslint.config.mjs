import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import tseslint from "typescript-eslint";

/**
 * ESLint, platt konfiguration.
 *
 * Filen använde tidigare `FlatCompat` för att låna `next/core-web-vitals` från
 * den gamla eslintrc-världen. Paketet som innehåller den — `eslint-config-next`
 * — är inte installerat, och `compat.extends` kraschade då inne i eslintrc:s
 * felformaterare med "Converting circular structure to JSON". Felet såg ut att
 * komma från vår kod men var ett trasigt beroende, och det dolde varje riktig
 * lint-varning bakom sig.
 *
 * `@next/eslint-plugin-next` finns installerat och bär samma regler. Den
 * används direkt här i stället, utan kompatibilitetslagret.
 */
export default tseslint.config(
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts"],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    // next.config.js är CommonJS och körs i Node. Utan det här blir `module`
    // en odefinierad variabel enligt webbläsarens globaler.
    files: ["*.config.js", "*.config.mjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { module: "writable", require: "readonly", process: "readonly" },
    },
  },

  {
    /*
     * Service workern körs varken i en webbläsarflik eller i Node.
     *
     * `self`, `clients` och `registration` är globaler som bara finns i en
     * worker. Utan den här raden rapporterar ESLint varje rad i filen som en
     * odefinierad variabel — och den bruskaskaden döljer riktiga varningar i
     * resten av kodbasen.
     */
    files: ["public/sw.js"],
    languageOptions: {
      globals: { self: "readonly", clients: "readonly", registration: "readonly" },
    },
  },

  {
    plugins: { "@next/next": nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,

      /*
       * Vanlig <img> är ett medvetet val, inte ett slarv.
       *
       * Bilderna kommer från tre håll: Supabase Storage i molnet, samma sak på
       * 127.0.0.1 lokalt, och den genererade SVG-platshållaren under /bild/.
       * `next/image` kräver att varje värd står i remotePatterns och optimerar
       * inte SVG utan `dangerouslyAllowSVG` — vi skulle stänga av ett skydd för
       * att få tillbaka det vi redan har. Se components/media/food-image.tsx.
       */
      "@next/next/no-img-element": "off",

      // Oanvända argument som börjar med _ är avsiktliga — signaturen krävs av
      // ramverket även när värdet inte används.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
