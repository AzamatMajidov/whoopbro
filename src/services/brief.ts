import { DayData } from '../types/whoop';
import { t, formatDate, formatDuration, type Lang } from '../i18n';

export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

export interface TelegramMessage {
  text: string;
  keyboard?: InlineKeyboardButton[][];
}

function recoveryEmoji(score: number | null): string {
  if (score === null) return '\uD83D\uDD34';
  if (score >= 67) return '\uD83D\uDFE2';
  if (score >= 34) return '\uD83D\uDFE1';
  return '\uD83D\uDD34';
}

function defaultKeyboard(lang: Lang): InlineKeyboardButton[][] {
  return [
    [
      { text: t(lang, 'btn_detail'), callback_data: 'detail' },
      { text: t(lang, 'btn_ask'), callback_data: 'ask' },
      { text: t(lang, 'btn_whynot'), callback_data: 'whynot' },
    ],
  ];
}

export function composeBrief(data: DayData, aiText: string, isStale: boolean, lang: Lang = 'uz', causalBlock?: string | null): TelegramMessage {
  const lines: string[] = [];

  lines.push(`\uD83D\uDCC5 ${formatDate(data.date, lang)}`);

  if (isStale) {
    lines.push(t(lang, 'brief_stale_notice'));
  }

  if (!data.woreDevice) {
    lines.push('');
    lines.push(t(lang, 'no_device_msg'));
    lines.push('');
    lines.push(aiText);
    lines.push('');
    lines.push(t(lang, 'brief_footer'));
    return { text: lines.join('\n'), keyboard: defaultKeyboard(lang) };
  }

  // Recovery block
  lines.push('');
  const score = data.recovery.recoveryScore;
  if (score !== null) {
    lines.push(`${recoveryEmoji(score)} ${t(lang, 'brief_recovery_label')}: ${score}%`);
  }
  if (data.recovery.hrv !== null) {
    const hrvPart = `\uD83D\uDC93 ${t(lang, 'brief_hrv_label')}: ${Number(data.recovery.hrv).toFixed(1)} ms`;
    if (data.recovery.rhr !== null) {
      lines.push(`${hrvPart}  |  \u2764\uFE0F ${t(lang, 'brief_rhr_label')}: ${data.recovery.rhr} ${t(lang, 'urish_min')}`);
    } else {
      lines.push(hrvPart);
    }
  } else if (data.recovery.rhr !== null) {
    lines.push(`\u2764\uFE0F ${t(lang, 'brief_rhr_label')}: ${data.recovery.rhr} ${t(lang, 'urish_min')}`);
  }
  if (data.recovery.spo2 !== null) {
    lines.push(`\uD83E\uDEC1 SpO\u2082: ${Number(data.recovery.spo2).toFixed(1)}%`);
  }

  // Sleep block
  lines.push('');
  if (data.sleep.durationMinutes !== null) {
    const dur = formatDuration(data.sleep.durationMinutes, lang);
    if (data.sleep.performancePct !== null) {
      lines.push(`\uD83D\uDE34 ${t(lang, 'brief_sleep_label')}: ${dur} (${data.sleep.performancePct}% ${t(lang, 'brief_sleep_efficiency')})`);
    } else {
      lines.push(`\uD83D\uDE34 ${t(lang, 'brief_sleep_label')}: ${dur}`);
    }
  }

  const sleepStages: string[] = [];
  if (data.sleep.remMinutes !== null) sleepStages.push(`\uD83E\uDDE0 ${t(lang, 'brief_rem_label')}: ${data.sleep.remMinutes} ${t(lang, 'daq')}`);
  if (data.sleep.deepMinutes !== null) sleepStages.push(`\uD83D\uDD35 ${t(lang, 'brief_deep_label')}: ${data.sleep.deepMinutes} ${t(lang, 'daq')}`);
  if (data.sleep.lightMinutes !== null) sleepStages.push(`\uD83D\uDCA4 ${t(lang, 'brief_light_label')}: ${data.sleep.lightMinutes} ${t(lang, 'daq')}`);
  if (sleepStages.length > 0) {
    lines.push(sleepStages.join('  |  '));
  }

  // AI block
  lines.push('');
  lines.push(aiText);

  if (causalBlock) {
    lines.push('');
    lines.push('🔍 *Sabab:* ' + causalBlock);
  }

  lines.push('');
  lines.push(t(lang, 'brief_footer'));

  return { text: lines.join('\n'), keyboard: defaultKeyboard(lang) };
}

export function composeFallbackBrief(data: DayData, isStale: boolean, lang: Lang = 'uz'): TelegramMessage {
  const lines: string[] = [];

  lines.push(`\uD83D\uDCC5 ${formatDate(data.date, lang)}`);

  if (isStale) {
    lines.push(t(lang, 'brief_stale_notice'));
  }

  if (!data.woreDevice) {
    lines.push('');
    lines.push(t(lang, 'no_device_msg'));
    lines.push('');
    lines.push(t(lang, 'brief_footer'));
    return { text: lines.join('\n'), keyboard: defaultKeyboard(lang) };
  }

  // Recovery block
  lines.push('');
  const score = data.recovery.recoveryScore;
  if (score !== null) {
    lines.push(`${recoveryEmoji(score)} ${t(lang, 'brief_recovery_label')}: ${score}%`);
  }
  if (data.recovery.hrv !== null) {
    const hrvPart = `\uD83D\uDC93 ${t(lang, 'brief_hrv_label')}: ${Number(data.recovery.hrv).toFixed(1)} ms`;
    if (data.recovery.rhr !== null) {
      lines.push(`${hrvPart}  |  \u2764\uFE0F ${t(lang, 'brief_rhr_label')}: ${data.recovery.rhr} ${t(lang, 'urish_min')}`);
    } else {
      lines.push(hrvPart);
    }
  } else if (data.recovery.rhr !== null) {
    lines.push(`\u2764\uFE0F ${t(lang, 'brief_rhr_label')}: ${data.recovery.rhr} ${t(lang, 'urish_min')}`);
  }
  if (data.recovery.spo2 !== null) {
    lines.push(`\uD83E\uDEC1 SpO\u2082: ${Number(data.recovery.spo2).toFixed(1)}%`);
  }

  // Sleep block
  lines.push('');
  if (data.sleep.durationMinutes !== null) {
    const dur = formatDuration(data.sleep.durationMinutes, lang);
    if (data.sleep.performancePct !== null) {
      lines.push(`\uD83D\uDE34 ${t(lang, 'brief_sleep_label')}: ${dur} (${data.sleep.performancePct}% ${t(lang, 'brief_sleep_efficiency')})`);
    } else {
      lines.push(`\uD83D\uDE34 ${t(lang, 'brief_sleep_label')}: ${dur}`);
    }
  }

  const sleepStages: string[] = [];
  if (data.sleep.remMinutes !== null) sleepStages.push(`\uD83E\uDDE0 ${t(lang, 'brief_rem_label')}: ${data.sleep.remMinutes} ${t(lang, 'daq')}`);
  if (data.sleep.deepMinutes !== null) sleepStages.push(`\uD83D\uDD35 ${t(lang, 'brief_deep_label')}: ${data.sleep.deepMinutes} ${t(lang, 'daq')}`);
  if (data.sleep.lightMinutes !== null) sleepStages.push(`\uD83D\uDCA4 ${t(lang, 'brief_light_label')}: ${data.sleep.lightMinutes} ${t(lang, 'daq')}`);
  if (sleepStages.length > 0) {
    lines.push(sleepStages.join('  |  '));
  }

  // Static tips based on recovery
  lines.push('');
  if (score !== null && score >= 67) {
    lines.push(t(lang, 'fallback_high'));
  } else if (score !== null && score >= 34) {
    lines.push(t(lang, 'fallback_mid'));
  } else {
    lines.push(t(lang, 'fallback_low'));
  }

  lines.push('');
  lines.push(t(lang, 'brief_footer'));

  return { text: lines.join('\n'), keyboard: defaultKeyboard(lang) };
}

export function composeFullDetail(data: DayData, lang: Lang = 'uz'): string {
  const lines: string[] = [];

  lines.push(`\uD83D\uDCCA ${t(lang, 'detail_title')} \u2014 ${formatDate(data.date, lang)}`);

  if (!data.woreDevice) {
    lines.push('');
    lines.push(t(lang, 'no_device_detail'));
    return lines.join('\n');
  }

  // Recovery
  lines.push('');
  lines.push(`📌 ${t(lang, 'detail_recovery').toUpperCase()}`);
  lines.push('');
  if (data.recovery.recoveryScore !== null) lines.push(`${recoveryEmoji(data.recovery.recoveryScore)} ${t(lang, 'brief_recovery_label')}: ${data.recovery.recoveryScore}%`);
  if (data.recovery.hrv !== null) lines.push(`💓 ${t(lang, 'brief_hrv_label')}: ${Number(data.recovery.hrv).toFixed(1)} ms`);
  if (data.recovery.rhr !== null) lines.push(`❤️ ${t(lang, 'brief_rhr_label')}: ${data.recovery.rhr} ${t(lang, 'urish_min')}`);
  if (data.recovery.spo2 !== null) lines.push(`🫁 SpO₂: ${Number(data.recovery.spo2).toFixed(1)}%`);

  // Sleep
  lines.push('');
  lines.push(`📌 ${t(lang, 'detail_sleep').toUpperCase()}`);
  lines.push('');
  if (data.sleep.durationMinutes !== null) lines.push(`😴 ${t(lang, 'detail_duration')}: ${formatDuration(data.sleep.durationMinutes, lang)}`);
  if (data.sleep.performancePct !== null) lines.push(`📈 ${t(lang, 'detail_efficiency')}: ${data.sleep.performancePct}%`);
  if (data.sleep.efficiencyPct !== null) lines.push(`⚡ ${t(lang, 'detail_effectiveness')}: ${Math.round(data.sleep.efficiencyPct)}%`);
  if (data.sleep.remMinutes !== null) lines.push(`🧠 ${t(lang, 'brief_rem_label')}: ${data.sleep.remMinutes} ${t(lang, 'daqiqa')}`);
  if (data.sleep.deepMinutes !== null) lines.push(`🔵 ${t(lang, 'brief_deep_label')}: ${data.sleep.deepMinutes} ${t(lang, 'daqiqa')}`);
  if (data.sleep.lightMinutes !== null) lines.push(`💤 ${t(lang, 'brief_light_label')}: ${data.sleep.lightMinutes} ${t(lang, 'daqiqa')}`);
  if (data.sleep.respiratoryRate !== null) lines.push(`🫁 ${t(lang, 'detail_respiratory')}: ${Number(data.sleep.respiratoryRate).toFixed(1)} ${t(lang, 'nafas_min')}`);

  // Strain
  lines.push('');
  lines.push(`📌 ${t(lang, 'detail_strain').toUpperCase()}`);
  lines.push('');
  if (data.strain.strainScore !== null) lines.push(`🔥 ${t(lang, 'detail_strain_label')}: ${Number(data.strain.strainScore).toFixed(1)}`);
  if (data.strain.calories !== null) lines.push(`🔋 ${t(lang, 'detail_calories')}: ${data.strain.calories} ${t(lang, 'kkal')}`);

  // Workouts
  if (data.workouts.length > 0) {
    lines.push('');
    lines.push(`📌 ${t(lang, 'detail_workouts').toUpperCase()}`);
  lines.push('');
    for (const w of data.workouts) {
      lines.push(`🏋️ ${w.sport} — ${w.durationMinutes} ${t(lang, 'daqiqa')} (${t(lang, 'detail_strain').toLowerCase()}: ${Number(w.strainScore).toFixed(1)})`);
    }
  }

  return lines.join('\n');
}

export function composePaywall(recoveryScore: number | null, lang: Lang = 'uz'): TelegramMessage {
  const emoji = recoveryEmoji(recoveryScore);
  const scoreLine = recoveryScore !== null
    ? `${emoji} ${t(lang, 'brief_recovery_label')}: ${recoveryScore}%`
    : `${emoji} ${t(lang, 'paywall_no_recovery')}`;

  const text = `${scoreLine}\n\n${t(lang, 'paywall_msg')}`;

  return {
    text,
    keyboard: [[{ text: t(lang, 'btn_subscribe_paywall'), callback_data: 'subscribe' }]],
  };
}

export function composeNoDevice(lang: Lang = 'uz'): TelegramMessage {
  return {
    text: t(lang, 'no_device_msg'),
    keyboard: defaultKeyboard(lang),
  };
}
