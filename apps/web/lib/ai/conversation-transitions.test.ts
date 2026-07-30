import { ConversationStateSchema } from "@autoradar/domain";
import { describe, expect, it } from "vitest";

import {
  applyIntentTransition,
  confirmVehicleTransition,
} from "./conversation-transitions";

describe("conversation runtime transitions", () => {
  it("creates an exact article draft without asking AI to rewrite the number", () => {
    const state = applyIntentTransition(
      ConversationStateSchema.parse({}),
      {
        mode: "part_number",
        rawText: "Найди OX 339/2D",
        rawPartNumber: "OX 339/2D",
        normalizedPartNumber: "OX3392D",
        confidence: "high",
      },
      {
        vehicleConfirmationPending: false,
        symptomDialogueEnabled: true,
      },
    );

    expect(state.readiness).toBe("ready");
    expect(state.searchDraft?.part.rawPartNumber).toBe("OX 339/2D");
    expect(state.searchDraft?.part.normalizedPartNumber).toBe("OX3392D");
  });

  it("does not confirm a VIN candidate until the user confirms full vehicle fields", () => {
    const pending = applyIntentTransition(
      ConversationStateSchema.parse({}),
      {
        mode: "vehicle_part",
        rawText: "VIN скрыт",
        confidence: "high",
      },
      {
        vehicleConfirmationPending: true,
        symptomDialogueEnabled: true,
      },
    );
    expect(pending.activeVehicle).toBeNull();
    expect(pending.readiness).toBe("needs_vehicle_confirmation");

    const confirmed = confirmVehicleTransition(pending, {
      make: "Peugeot",
      model: "308",
      year: 2014,
    });
    expect(confirmed.activeVehicle?.model).toBe("308");
    expect(confirmed.readiness).toBe("collecting");
  });
});
