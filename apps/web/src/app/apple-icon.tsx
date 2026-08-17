import { ImageResponse } from "next/og";
import { BurpGlyph } from "@/lib/brand-glyph";

/**
 * Ikonen iOS använder när gästen lägger Burp på hemskärmen.
 *
 * Safari beskär inte bort hörnen själv utan lägger på sin egen mask, så plattan
 * ritas fylld ut i kanterna. Ingen genomskinlighet — en transparent apple-icon
 * blir svart på hemskärmen.
 */

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<BurpGlyph size={size.width} />, size);
}
