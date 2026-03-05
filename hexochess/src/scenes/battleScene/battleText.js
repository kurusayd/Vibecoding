export const PLAYER_KING_DISPLAY_NAME = 'Devis J. Jones';
export const ENEMY_KING_DISPLAY_NAME = 'Enemy King';

export const UI_TEXT = {
  START_GAME: '\u041d\u0410\u0427\u0410\u0422\u042c \u0418\u0413\u0420\u0423',
  TEST_SCENE: '\u0422\u0435\u0441\u0442\u043e\u0432\u0430\u044f \u0441\u0446\u0435\u043d\u0430',
  ROUND: '\u0420\u0430\u0443\u043d\u0434',
  PREP: '\u041f\u043e\u0434\u0433\u043e\u0442\u043e\u0432\u043a\u0430',
  BATTLE: '\u0421\u0440\u0430\u0436\u0435\u043d\u0438\u0435',
  VICTORY: '\u041f\u041e\u0411\u0415\u0414\u0410',
  DEFEAT: '\u041f\u041e\u0420\u0410\u0416\u0415\u041d\u0418\u0415',
  DRAW: '\u041d\u0418\u0427\u042c\u042f',
  COIN_INCOME: '\u0414\u043e\u0445\u043e\u0434 \u0437\u0430 \u0440\u0430\u0443\u043d\u0434',
  WIN_BONUS: '\u0411\u043e\u043d\u0443\u0441 \u0437\u0430 \u043f\u043e\u0431\u0435\u0434\u0443',
  WIN_STREAK_BONUS: '\u0411\u043e\u043d\u0443\u0441 \u0437\u0430 \u0441\u0435\u0440\u0438\u044e \u043f\u043e\u0431\u0435\u0434',
  LOSE_STREAK_BONUS: '\u0411\u043e\u043d\u0443\u0441 \u0437\u0430 \u0441\u0435\u0440\u0438\u044e \u043f\u043e\u0440\u0430\u0436\u0435\u043d\u0438\u0439',
  EXPECTED_ROUND_INCOME: '\u041e\u0436\u0438\u0434\u0430\u0435\u043c\u044b\u0439 \u0434\u043e\u0445\u043e\u0434 \u0440\u0430\u0443\u043d\u0434\u0430',
  FROM_NEXT_WIN: '(\u0441\u043e \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0435\u0439 \u043f\u043e\u0431\u0435\u0434\u043e\u0439)',
  FROM_NEXT_LOSS: '(\u0441\u043e \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0435\u0433\u043e \u043f\u043e\u0440\u0430\u0436\u0435\u043d\u0438\u044f)',
};

export const ABILITY_KIND_LABEL = {
  active: 'АКТИВНАЯ',
  passive: 'ПАССИВНАЯ',
  none: 'БЕЗ СПОСОБНОСТИ',
};

export const ABILITY_DESC_BY_KEY = {
  skeleton_archer_bounce: 'Попадание отскакивает в еще одну цель в радиусе 2 клеток и наносит 50% урона.',
  ghost_evasion: '50% шанс увернуться от любой успешно попавшей атаки.',
  undertaker_active: 'Раз в 4 секунды призывает Simple Skeleton в ближайшую свободную соседнюю клетку.',
  worm_swallow: 'При атаке с шансом 50% проглатывает цель на 6 секунд. Если Worm умирает раньше, цель вылезает с 50% HP от значения в момент проглатывания.',
};
