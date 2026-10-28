// Все константы игры в одном месте. Крути числа здесь, не в логике.

export const TRACK = {
  STEP: 4,            // шаг выборки центральной линии, м
  HALF_WIDTH: 9,      // половина полной ширины (с обочинами), м
  ROADWAY_HALF: 7,    // половина проезжей части (4 полосы)
  BEHIND: 110,        // сколько дороги держим позади игрока, м
  AHEAD: 540,         // сколько дороги строим впереди, м
  REBUILD_EVERY: 30,  // перестраивать чанки каждые N метров
  TURN_MAX: 0.85,     // максимальный курс трассы от оси Z, рад (~49°)
  CURVE_PERIOD: 260,  // период шума поворотов, м
  ELEVATION_AMP: 5,   // амплитуда высот, м
  ELEV_PERIOD: 170,   // период шума высот, м
  SKIRT_DEPTH: 9,     // глубина обочины-«дамбы» вниз до земли
};

export const PLAYER = {
  MAX_SPEED: 58,      // м/с (~209 км/ч)
  ACCEL: 30,
  BRAKE: 55,
  COAST: 7,
  NITRO_MULT: 1.38,
  NITRO_DRAIN: 0.32,
  STEER_SPEED: 10,
  CENTRIFUGAL: 0.55,
  SHOULDER_DRAG: 5,
  SHOULDER_FRAC: 0.4,
  LENGTH: 4.4,
  WIDTH: 2.0,
};

export const TRAFFIC = {
  COUNT: 14,
  MAX: 30,
  SPAWN_AHEAD_MIN: 320,
  SPAWN_AHEAD_MAX: 540,
  DESPAWN_BEHIND: 60,
  NEAR_MISS_LAT: 3.0,
  NEAR_MISS_NITRO: 0.26,
  NEAR_MISS_SCORE: 120,
  COMBO_TIME: 5,
  AI_BRAKE: 26,           // как резко бот сбрасывает скорость, м/с²
  AI_ACCEL: 8,             // как боты разгоняются, м/с²
  AI_BLOCKED_LANE: 0.9,    // сек тащиться за хвостом до попытки перестроиться
  RAMP_EVERY: 2000,        // бесконечный: +1 машина каждые столько метров
  RAMP_MAX: 25,            // бесконечный: потолок плотности трафика
  LANE_TICK_MIN: 7,        // спонтанные перестроения: пауза между попытками, сек
  LANE_TICK_MAX: 14,
  LANE_TICK_CHANCE: 0.4,   // и шанс, что попытка состоится (чтобы не суетились)
  POLICE_W: 0.07,         // вес полиции при спавне
};

export const BIOME = { LENGTH: 1500, BLEND: 280 };

export const SKY = {
  STAR_COUNT: 900,
  STAR_RADIUS: 1500,
};

export const SNOW = {
  MAX: 900,
  BOX: 34,
  TOP: 20,
};

export const SPEED_LINES = {
  COUNT: 60,
  MIN: 0.55,   // с какой доли скорости включаются линии
};

export const PARTICLES = {
  MAX_ADD: 240,   // аддитивный пул: пламя, искры
  MAX_SOFT: 200,  // обычный пул: дым, пыль
  DEBRIS: 14,     // обломки после аварии
};

export const CITY = {
  BUILDINGS: 80,
  BOARDS: 4,
};

export const PICKUP = {
  COUNT: 4,
  NITRO: 0.45,
};

// Монетки на дороге — валюта для кастомизации машины.
export const COIN = {
  COUNT: 10,        // сколько монет одновременно на дороге
  VALUE: 1,         // сколько монет даёт одна монетка
};

export const GHOST = {
  SAMPLE_S: 5,        // писать точку призрака каждые N метров
  MAX_SAMPLES: 2600,   // ~13 км заезда — хватит с запасом
};

export const MUSIC = { BPM: 110 };

// Сетевая гонка на время
export const RACE = {
  LENGTH: 2000,                      // дистанция до финиша, м
  MILESTONES: [1000, 500, 200, 100], // сколько осталось до финиша — озвучиваем тостами
};

// Управление мышью
export const MOUSE = { GAIN: 1.7 };

// Сетевые тики (сек) — как часто клиент шлёт своё состояние и снапшоты трафика.
// Чем чаще, тем плавнее выглядят чужие машины (ценой трафика по сети).
export const NET = {
  STATE_TICK: 0.025,   // 40 раз/с — позиция игрока
  TRAFFIC_TICK: 0.05,  // 20 раз/с — снапшот трафика (только хост)
};
