export const LOCALE_EN = 'EN';
export const LOCALE_RU = 'RU';
export const DEFAULT_LOCALE = LOCALE_EN;

// Localization table with explicit EN/RU columns.
export const LOCALIZATION_TABLE = [
  { key: 'MENU_PLAY', EN: 'Play', RU: 'Играть' },
  { key: 'MENU_SHOP', EN: 'Shop', RU: 'Магазин' },
  { key: 'MENU_STORY', EN: 'Story', RU: 'История' },
  { key: 'MENU_COLLECTION', EN: 'Collection', RU: 'Коллекция' },
  { key: 'MENU_TEST_SCENE', EN: 'Test Scene', RU: 'Тестовая' },
  { key: 'JOIN_CTA', EN: 'Join', RU: 'Вступай' },
  { key: 'LANG_EN', EN: 'EN', RU: 'EN' },
  { key: 'LANG_RU', EN: 'RU', RU: 'RU' },
];

const LOCALIZATION_BY_KEY = Object.fromEntries(
  LOCALIZATION_TABLE.map((row) => [String(row.key), row])
);

export function normalizeLocale(locale) {
  return String(locale ?? DEFAULT_LOCALE).toUpperCase() === LOCALE_RU ? LOCALE_RU : LOCALE_EN;
}

export function t(locale, key) {
  const row = LOCALIZATION_BY_KEY[String(key)];
  if (!row) return String(key);
  const loc = normalizeLocale(locale);
  return String(row[loc] ?? row[DEFAULT_LOCALE] ?? key);
}

