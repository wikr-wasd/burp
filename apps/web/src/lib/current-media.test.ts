import { describe, expect, it } from "vitest";
import { currentMedia, type MediaRow } from "./current-media";

const row = (over: Partial<MediaRow>): MediaRow => ({
  id: "a",
  status: "PENDING",
  created_at: "2026-09-01T10:00:00Z",
  ...over,
});

describe("currentMedia", () => {
  it("ger null när restaurangen inte laddat upp något", () => {
    expect(currentMedia([])).toBeNull();
  });

  it("väljer den godkända före en nyare som väntar", () => {
    // Annars justerar ägaren en bild som ingen gäst ser.
    const picked = currentMedia([
      row({ id: "vantande", status: "PENDING", created_at: "2026-09-02T10:00:00Z" }),
      row({ id: "godkand", status: "APPROVED", created_at: "2026-08-01T10:00:00Z" }),
    ]);
    expect(picked?.id).toBe("godkand");
  });

  it("väljer den nyaste när ingen är godkänd", () => {
    const picked = currentMedia([
      row({ id: "gammal", created_at: "2026-08-01T10:00:00Z" }),
      row({ id: "ny", created_at: "2026-09-01T10:00:00Z" }),
    ]);
    expect(picked?.id).toBe("ny");
  });

  it("läser justeringen ur raden", () => {
    const picked = currentMedia([row({ focal_y: 20, brightness: 110 })]);
    expect(picked?.adjust.focalY).toBe(20);
    expect(picked?.adjust.brightness).toBe(110);
  });

  it("ger orörda värden när kolumnerna är tomma", () => {
    const picked = currentMedia([row({ focal_x: null, brightness: null })]);
    expect(picked?.adjust.focalX).toBe(50);
    expect(picked?.adjust.brightness).toBe(100);
  });
});
