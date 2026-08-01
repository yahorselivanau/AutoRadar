import { describe, expect, it } from "vitest";

import {
  createHttpVinResolver,
  resolveVinWithSources,
} from "@autoradar/search-actor/vin-resolver";

const VIN = "VF3LBBHZHES123456";

describe("VIN resolver", () => {
  it("parses a structured source response without returning the raw VIN", async () => {
    const source = createHttpVinResolver("auto1", {
      baseUrl: "https://auto1.by/",
      fetchImpl: async () =>
        new Response(`
          <html><head><script type="application/ld+json">
            {"@type":"Car","manufacturer":{"name":"PEUGEOT"},"model":"308","modelDate":"2014","vehicleEngine":{"name":"1.6 HDi"}}
          </script></head><body></body></html>
        `),
    });

    const result = await resolveVinWithSources(
      VIN,
      [source],
      new Date("2026-08-01T12:00:00.000Z"),
    );

    expect(result.status).toBe("resolved");
    expect(result.source).toBe("auto1");
    expect(result.maskedVin).toBe("VF3••••••••••3456");
    expect(result.candidates[0]).toMatchObject({
      make: "PEUGEOT",
      model: "308",
      year: 2014,
      engine: "1.6 HDi",
    });
    expect(JSON.stringify(result)).not.toContain(VIN);
  });

  it("falls back after a blocked source and keeps a partial candidate", async () => {
    const blocked = createHttpVinResolver("auto1", {
      baseUrl: "https://auto1.by/",
      fetchImpl: async () => new Response("blocked", { status: 403 }),
    });
    const fallback = createHttpVinResolver("zap", {
      baseUrl: "https://zap.by/",
      fetchImpl: async () =>
        new Response(
          `<main><div data-make="BMW"></div><div data-model="3"></div></main>`,
        ),
    });

    const result = await resolveVinWithSources(VIN, [blocked, fallback]);

    expect(result.status).toBe("partial");
    expect(result.source).toBe("zap");
    expect(result.candidates[0]).toMatchObject({ make: "BMW", model: "3" });
    expect(result.warnings[0]).toContain("auto1");
    expect(JSON.stringify(result)).not.toContain(VIN);
  });

  it("uses the confirmed public source paths", async () => {
    const calls: string[] = [];
    const fetcher = async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response("<html></html>");
    };
    await createHttpVinResolver("auto1", {
      baseUrl: "https://auto1.by/",
      fetchImpl: fetcher,
    }).resolve(VIN);
    await createHttpVinResolver("zap", {
      baseUrl: "https://zap.by/",
      fetchImpl: fetcher,
    }).resolve(VIN);

    expect(calls[0]).toBe(
      "https://auto1.by/Oem/Find?vinFrame=VF3LBBHZHES123456",
    );
    expect(calls[1]).toBe("https://zap.by/carparts/search/VF3LBBHZHES123456");
  });
});
