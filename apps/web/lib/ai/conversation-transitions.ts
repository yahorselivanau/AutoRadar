import {
  ConversationStateSchema,
  type ConversationState,
  type SearchIntent,
  type VehicleContext,
} from "@autoradar/domain";

export function applyIntentTransition(
  state: ConversationState,
  intent: SearchIntent | null,
  options: {
    vehicleConfirmationPending: boolean;
    symptomDialogueEnabled: boolean;
  },
): ConversationState {
  if (!intent) return ConversationStateSchema.parse(state);
  const pendingReadiness = options.vehicleConfirmationPending
    ? "needs_vehicle_confirmation"
    : null;

  if (intent.mode === "part_number" && intent.rawPartNumber) {
    return ConversationStateSchema.parse({
      ...state,
      searchDraft: {
        query: intent.rawText,
        vehicle: state.activeVehicle ?? undefined,
        part: {
          name: `Деталь по артикулу ${intent.rawPartNumber}`,
          rawPartNumber: intent.rawPartNumber,
          normalizedPartNumber: intent.normalizedPartNumber,
        },
      },
      readiness: pendingReadiness ?? "ready",
      pendingClarification: null,
      symptomAssessment: null,
    });
  }
  if (intent.mode === "symptom" && options.symptomDialogueEnabled) {
    return ConversationStateSchema.parse({
      ...state,
      readiness: pendingReadiness ?? "needs_part_confirmation",
    });
  }
  return ConversationStateSchema.parse({
    ...state,
    readiness: pendingReadiness ?? state.readiness,
  });
}

export function confirmVehicleTransition(
  state: ConversationState,
  vehicle: VehicleContext,
): ConversationState {
  return ConversationStateSchema.parse({
    ...state,
    activeVehicle: vehicle,
    vehicleDraft: null,
    readiness: state.searchDraft ? "ready" : "collecting",
  });
}
