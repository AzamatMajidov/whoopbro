import { Markup } from 'telegraf';
import type { Lang } from '../i18n';

export function mainKeyboard(lang: Lang) {
  if (lang === 'ru') {
    return Markup.keyboard([
      ['📊 Статус', '⚙️ Настройки'],
      ['💳 Подписка', '❓ Помощь'],
    ]).resize();
  }
  return Markup.keyboard([
    ['📊 Holat', '⚙️ Sozlamalar'],
    ['💳 Obuna', '❓ Yordam'],
  ]).resize();
}
