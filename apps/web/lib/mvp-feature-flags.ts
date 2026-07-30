import "server-only";

function enabled(value: string | undefined, fallback = true): boolean {
  if (value == null) return fallback;
  return value !== "false";
}

export function readMvpFeatureFlags() {
  return {
    deterministicIntent: enabled(process.env.FEATURE_DETERMINISTIC_INTENT, false),
    vinResolver: enabled(process.env.FEATURE_VIN_RESOLVER),
    sourceSearchPlanner: enabled(process.env.FEATURE_SOURCE_SEARCH_PLANNER),
    symptomDialogue: enabled(process.env.FEATURE_SYMPTOM_DIALOGUE),
  } as const;
}
