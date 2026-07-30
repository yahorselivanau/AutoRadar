const MAKE_ALIASES = {
  ACURA: ["АКУРА"],
  "ALFA ROMEO": ["АЛЬФА РОМЕО"],
  AUDI: ["АУДИ"],
  BAIC: ["БАИК", "БЕЙК"],
  BMW: ["БМВ"],
  BUICK: ["БЬЮИК", "БЮИК"],
  BYD: ["БИД", "БИ УАЙ ДИ"],
  CADILLAC: ["КАДИЛЛАК"],
  CHANGAN: ["ЧАНГАН"],
  CHERY: ["ЧЕРИ"],
  CHEVROLET: ["ШЕВРОЛЕ"],
  CHRYSLER: ["КРАЙСЛЕР"],
  CITROEN: ["СИТРОЕН", "СИТРОЁН"],
  DACIA: ["ДАЧИЯ"],
  DAEWOO: ["ДЭУ", "ДЭВО"],
  DAIHATSU: ["ДАЙХАТСУ"],
  DODGE: ["ДОДЖ"],
  DONGFENG: ["ДОНГФЕНГ", "ДОНФЕНГ"],
  EXEED: ["ЭКСИД"],
  FAW: ["ФАВ"],
  FIAT: ["ФИАТ"],
  FORD: ["ФОРД"],
  GAC: ["ГАК"],
  GAZ: ["ГАЗ"],
  GEELY: ["ДЖИЛИ", "ГИЛИ"],
  GENESIS: ["ГЕНЕЗИС"],
  "GREAT WALL": ["ГРЕЙТ ВОЛЛ", "ГРЕЙТ ВОЛ"],
  HAVAL: ["ХАВАЛ"],
  HONDA: ["ХОНДА"],
  HONGQI: ["ХОНЧИ", "ХОНГКИ"],
  HUMMER: ["ХАММЕР"],
  HYUNDAI: ["ХЕНДАЙ", "ХУНДАЙ", "ХЁНДЭ", "ХЕНДЭ"],
  INFINITI: ["ИНФИНИТИ"],
  ISUZU: ["ИСУЗУ"],
  IVECO: ["ИВЕКО"],
  JAC: ["ДЖАК", "ЖАК"],
  JAGUAR: ["ЯГУАР"],
  JEEP: ["ДЖИП"],
  JETOUR: ["ДЖЕТУР"],
  KIA: ["КИА"],
  LADA: ["ЛАДА", "ВАЗ", "VAZ"],
  LANCIA: ["ЛЯНЧА", "ЛАНЧА"],
  "LAND ROVER": ["ЛЕНД РОВЕР", "ЛЭНД РОВЕР"],
  LEXUS: ["ЛЕКСУС"],
  LIFAN: ["ЛИФАН"],
  LINCOLN: ["ЛИНКОЛЬН"],
  MASERATI: ["МАЗЕРАТИ"],
  MAZDA: ["МАЗДА"],
  "MERCEDES-BENZ": ["MERCEDES", "МЕРСЕДЕС", "МЕРСЕДЕС БЕНЦ", "МЕРСЕДЕС-БЕНЦ"],
  MG: ["ЭМ ДЖИ"],
  MINI: ["МИНИ"],
  MITSUBISHI: ["МИЦУБИСИ", "МИТСУБИСИ", "МИЦУБИШИ"],
  MOSKVICH: ["МОСКВИЧ"],
  NISSAN: ["НИССАН", "НИСАН"],
  OMODA: ["ОМОДА"],
  OPEL: ["ОПЕЛЬ"],
  PEUGEOT: ["ПЕЖО"],
  PORSCHE: ["ПОРШЕ"],
  RENAULT: ["РЕНО"],
  ROVER: ["РОВЕР"],
  SAAB: ["СААБ"],
  SEAT: ["СЕАТ"],
  SKODA: ["ШКОДА"],
  SMART: ["СМАРТ"],
  SSANGYONG: ["ССАНГЙОНГ", "САНГ ЕНГ", "САНГЙОНГ"],
  SUBARU: ["СУБАРУ"],
  SUZUKI: ["СУЗУКИ"],
  TESLA: ["ТЕСЛА"],
  TOYOTA: ["ТОЙОТА", "ТАЁТА"],
  UAZ: ["УАЗ"],
  VOLKSWAGEN: ["ФОЛЬКСВАГЕН", "ФОЛЬЦВАГЕН", "VW"],
  VOLVO: ["ВОЛЬВО"],
  ZAZ: ["ЗАЗ"],
  ZEEKR: ["ЗИКР"],
} as const;

function comparableMake(value: string): string {
  return value
    .toLocaleUpperCase("ru")
    .replaceAll("Ё", "Е")
    .replace(/[^A-ZА-Я0-9]+/g, "");
}

const canonicalByAlias = new Map<string, string>();
for (const [canonical, aliases] of Object.entries(MAKE_ALIASES)) {
  for (const value of [canonical, ...aliases]) {
    canonicalByAlias.set(comparableMake(value), canonical);
  }
}

export function canonicalVehicleMake(value: string): string {
  return canonicalByAlias.get(comparableMake(value)) ?? value.trim();
}

export function vehicleMakesMatch(left: string, right: string): boolean {
  return (
    comparableMake(canonicalVehicleMake(left)) ===
    comparableMake(canonicalVehicleMake(right))
  );
}
