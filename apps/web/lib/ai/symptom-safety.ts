export type SymptomSafetyResult = {
  severity: "none" | "service_soon" | "stop_driving";
  message: string | null;
  matchedArea: string | null;
};

const STOP_DRIVING_AREAS: Array<{
  area: string;
  pattern: RegExp;
  message: string;
}> = [
  {
    area: "brakes",
    pattern: /(?:тормоз\w*|педал\w*\s+провал|brake)/i,
    message:
      "Не продолжайте движение: возможна неисправность тормозной системы. Нужна безопасная эвакуация и диагностика.",
  },
  {
    area: "steering",
    pattern: /(?:рулев\w*|руль\s+заклин|не\s+поворачивает|steering)/i,
    message:
      "Не продолжайте движение: возможна неисправность рулевого управления. Нужна диагностика в сервисе.",
  },
  {
    area: "airbag",
    pattern: /(?:подушк\w*\s+безопасност|airbag|srs)/i,
    message:
      "Не пытайтесь самостоятельно разбирать систему SRS. Обратитесь в сервис для безопасной диагностики.",
  },
  {
    area: "high-voltage",
    pattern:
      /(?:высоковольт\w*|тягов\w*\s+батаре|гибрид\w*\s+батаре|ev\s+battery)/i,
    message:
      "Не прикасайтесь к высоковольтным компонентам и прекратите эксплуатацию до проверки специалистом.",
  },
  {
    area: "overheating",
    pattern:
      /(?:перегрев\w*|закипел\w*|температур\w*\s+(?:красн|максим)|кипит\s+антифриз)/i,
    message:
      "Остановитесь в безопасном месте и заглушите двигатель. Не открывайте горячую систему охлаждения.",
  },
  {
    area: "fuel",
    pattern:
      /(?:запах\s+бензин|теч\w*\s+топлив|топлив\w*\s+теч|fuel\s+leak|пахнет\s+бензин)/i,
    message:
      "Заглушите двигатель, исключите источники огня и не продолжайте движение из-за риска возгорания.",
  },
];

export function assessSymptomSafety(text: string): SymptomSafetyResult {
  const match = STOP_DRIVING_AREAS.find(({ pattern }) => pattern.test(text));
  if (match) {
    return {
      severity: "stop_driving",
      message: match.message,
      matchedArea: match.area,
    };
  }

  if (
    /(?:масл\w*|охлаждающ\w*\s+жидк|антифриз\w*).*(?:теч|нет|низк)/i.test(text)
  ) {
    return {
      severity: "service_soon",
      message:
        "Проверьте уровень жидкости по инструкции автомобиля и не продолжайте поездку при аварийном предупреждении или быстром падении уровня.",
      matchedArea: "critical-fluid",
    };
  }

  return { severity: "none", message: null, matchedArea: null };
}
