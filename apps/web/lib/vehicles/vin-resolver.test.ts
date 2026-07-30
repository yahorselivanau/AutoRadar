import { describe, expect, it, vi } from "vitest";

import { parseVpicResponse, resolveVinWithVpic } from "./vin-resolver";

const VIN = "VF3LBBHZHES123456";

describe("VIN resolver", () => {
  it("maps a complete vPIC response into an unconfirmed candidate", () => {
    const result = parseVpicResponse(
      VIN,
      {
        Results: [
          {
            Make: "PEUGEOT",
            Model: "308",
            ModelYear: "2014",
            BodyClass: "Hatchback/Liftback/Notchback",
            DisplacementL: "1.6",
            FuelTypePrimary: "Diesel",
            Doors: "5",
            ErrorCode: "0",
          },
        ],
      },
      new Date("2026-07-30T12:00:00.000Z"),
    );

    expect(result.status).toBe("resolved");
    expect(result.maskedVin).toBe("VF3••••••••••3456");
    expect(JSON.stringify(result)).not.toContain(VIN);
    expect(result.candidates[0]).toMatchObject({
      make: "PEUGEOT",
      model: "308",
      year: 2014,
      doors: 5,
    });
  });

  it("returns a partial candidate instead of inventing missing fields", () => {
    const result = parseVpicResponse(VIN, {
      Results: [
        {
          Make: "PEUGEOT",
          ErrorCode: "1",
          ErrorText: `Partial decode ${VIN}`,
        },
      ],
    });

    expect(result.status).toBe("partial");
    expect(result.candidates[0]?.model).toBeUndefined();
    expect(result.warnings).toContain(
      "Данные vPIC неполные — проверьте и дополните автомобиль вручную.",
    );
    expect(JSON.stringify(result)).not.toContain(VIN);
  });

  it("calls the official endpoint without logging or returning the raw VIN", async () => {
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void input;
        void init;
        return new Response(
          JSON.stringify({
            Results: [{ Make: "PEUGEOT", Model: "308", ModelYear: "2014" }],
          }),
          { status: 200 },
        );
      },
    );
    const result = await resolveVinWithVpic(VIN, fetcher as typeof fetch);

    expect(fetcher).toHaveBeenCalledOnce();
    expect(String(fetcher.mock.calls[0]?.[0])).toContain(
      "vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/",
    );
    expect(JSON.stringify(result)).not.toContain(VIN);
  });
});
