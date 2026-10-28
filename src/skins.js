// Каталог кастомизации: цвета кузова и «крутые» машины за монеты.
// Скин id уезжает в сеть — соперники строят такие же машины у себя.

export const CAR_COLORS = [
  { id: 'red', hex: '#c9403a', color: 0xc9403a },
  { id: 'blue', hex: '#3a8fc9', color: 0x3a8fc9 },
  { id: 'green', hex: '#3ac96f', color: 0x3ac96f },
  { id: 'sand', hex: '#c9a13a', color: 0xc9a13a },
  { id: 'violet', hex: '#9a3ac9', color: 0x9a3ac9 },
  { id: 'pink', hex: '#c93a8f', color: 0xc93a8f },
  { id: 'white', hex: '#e6e8ee', color: 0xe6e8ee },
  { id: 'dark', hex: '#2b2f3a', color: 0x2b2f3a },
];

// Скины: 'stock' — обычная машина (цвет выбирается бесплатно), остальные за монеты.
// hasColors: можно ли выбрать цвет кузова (у «мороженого» и «радуги» — нет).
export const SKINS = [
  { id: 'stock', name: 'СТОК', price: 0, desc: 'Обычная машина', hasColors: true },
  { id: 'taxi', name: 'ТАКСИ', price: 40, desc: 'Жёлтый, с шашечками', hasColors: false },
  { id: 'icecream', name: 'МОРОЖЕНОЕ', price: 90, desc: 'Фургон с мороженым', hasColors: false },
  { id: 'neon', name: 'НЕОН', price: 160, desc: 'Светится в темноте', hasColors: true },
  { id: 'police', name: 'ПОЛИЦИЯ', price: 260, desc: 'С мигалкой', hasColors: false },
  { id: 'rainbow', name: 'РАДУГА', price: 400, desc: 'Переливается всеми цветами', hasColors: false },
];

export const DEFAULT_SKIN = 'stock';
export const DEFAULT_COLOR = CAR_COLORS[0].hex;

export function skinById(id) {
  return SKINS.find((s) => s.id === id) || SKINS[0];
}
export function colorById(id) {
  return CAR_COLORS.find((c) => c.id === id) || CAR_COLORS[0];
}
// '#rrggbb' -> 0xrrggbb (для three.js)
export function hexToInt(hex) {
  const v = parseInt(String(hex || '').replace('#', ''), 16);
  return Number.isFinite(v) ? v : 0xc9403a;
}
// Проверка «свой/чужой» вход — чтобы в сеть не прилетело что попало.
export function isValidSkin(id) {
  return SKINS.some((s) => s.id === id);
}
export function isValidColor(id) {
  return CAR_COLORS.some((c) => c.id === id);
}
