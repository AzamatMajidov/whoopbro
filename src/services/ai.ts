import { GoogleGenerativeAI } from '@google/generative-ai';
import { User, DailySnapshot } from '@prisma/client';
import { config } from '../config';
import { DayData } from '../types/whoop';

// Custom errors
export class AITimeoutError extends Error {
  constructor() {
    super('AI generation timed out');
    this.name = 'AITimeoutError';
  }
}

export class AIRefusalError extends Error {
  constructor(public response: string) {
    super('AI refused to generate content');
    this.name = 'AIRefusalError';
  }
}

const REFUSAL_PATTERNS = [
  'I cannot',
  'I am unable',
  'As an AI',
  'I\'m not able',
  'I can\'t provide',
  'I must decline',
];

export function buildSystemPrompt(language: 'uz' | 'ru'): string {
  const outputLang = language === 'ru'
    ? 'Russian. Never use any other language.'
    : "Uzbek (o'zbek tili). Everyday conversational Uzbek — not formal or bookish. Never use English or Russian words.";

  return `You are a personal health coach. You speak like a warm, direct friend — not a doctor, not a robot.

OUTPUT LANGUAGE: ${outputLang}

FORMAT (strict):
- Exactly 2 paragraphs, separated by a blank line
- Paragraph 1: 1-2 short sentences — what is happening with the body right now
- Paragraph 2: 1-2 concrete actions for today
- Total: maximum 4 sentences
- 1-2 emojis max
- No long words, no filler, no disclaimers`;
}

export function buildUserPrompt(data: DayData, user: User, history: DailySnapshot[]): string {
  const lang = user.language === 'ru' ? 'ru' : 'uz';

  if (!data.woreDevice) {
    if (lang === 'ru') {
      return 'Сегодня пользователь не носил устройство Whoop. Дай советы по отдыху, восстановлению и общему здоровью. Пиши только на русском.';
    }
    return `Bugun foydalanuvchi Whoop qurilmasini kiymagan. Dam olish, tiklanish va umumiy salomatlik bo'yicha maslahatlar ber. Faqat o'zbek tilida yoz. Hech qanday ingliz so'zlari ishlatma.`;
  }

  const lines: string[] = [];

  // Calculate 7-day averages if we have enough history
  let avgRecovery: number | null = null;
  let avgHrv: number | null = null;
  let avgSleepDuration: number | null = null;

  if (history.length >= 2) {
    const recentHistory = history.slice(0, 7);

    const recoveryVals = recentHistory.map(s => s.recoveryScore).filter((v): v is number => v !== null);
    const hrvVals = recentHistory.map(s => s.hrv).filter((v): v is number => v !== null);
    const sleepVals = recentHistory.map(s => s.sleepDuration).filter((v): v is number => v !== null);

    if (recoveryVals.length > 0) avgRecovery = Math.round(recoveryVals.reduce((a, b) => a + b, 0) / recoveryVals.length);
    if (hrvVals.length > 0) avgHrv = Math.round(hrvVals.reduce((a, b) => a + b, 0) / hrvVals.length);
    if (sleepVals.length > 0) avgSleepDuration = Math.round(sleepVals.reduce((a, b) => a + b, 0) / sleepVals.length);
  }

  if (lang === 'uz') {
    lines.push(`Sana: ${data.date}`);
    lines.push('');

    // Recovery
    lines.push('TIKLANISH:');
    if (data.recovery.recoveryScore !== null) {
      let recoveryLine = `Tiklanish balli: ${data.recovery.recoveryScore}%`;
      if (avgRecovery !== null) {
        const delta = data.recovery.recoveryScore - avgRecovery;
        recoveryLine += ` (${delta >= 0 ? '+' : ''}${delta}% dan o'rtachaga nisbatan)`;
      }
      lines.push(recoveryLine);
    }
    if (data.recovery.hrv !== null) {
      let hrvLine = `HRV: ${data.recovery.hrv}ms`;
      if (avgHrv !== null) {
        const delta = Math.round(data.recovery.hrv - avgHrv);
        hrvLine += ` (${delta >= 0 ? '+' : ''}${delta}ms dan o'rtachaga nisbatan)`;
      }
      lines.push(hrvLine);
    }
    if (data.recovery.rhr !== null) lines.push(`Tinch yurak urishi: ${data.recovery.rhr} urish/min`);
    if (data.recovery.spo2 !== null) lines.push(`SpO₂: ${data.recovery.spo2}%`);

    lines.push('');
    lines.push('UYQU:');
    if (data.sleep.durationMinutes !== null) {
      const h = Math.floor(data.sleep.durationMinutes / 60);
      const m = data.sleep.durationMinutes % 60;
      let sleepLine = `Uyqu davomiyligi: ${h}s ${m}d`;
      if (avgSleepDuration !== null) {
        const delta = data.sleep.durationMinutes - avgSleepDuration;
        const dh = Math.floor(Math.abs(delta) / 60);
        const dm = Math.abs(delta) % 60;
        sleepLine += ` (${delta >= 0 ? '+' : '-'}${dh}s ${dm}d dan o'rtachaga nisbatan)`;
      }
      lines.push(sleepLine);
    }
    if (data.sleep.performancePct !== null) lines.push(`Uyqu samaradorligi: ${data.sleep.performancePct}%`);
    if (data.sleep.efficiencyPct !== null) lines.push(`Uyqu effektivligi: ${data.sleep.efficiencyPct}%`);
    if (data.sleep.remMinutes !== null) lines.push(`REM uyqu: ${data.sleep.remMinutes} daqiqa`);
    if (data.sleep.deepMinutes !== null) lines.push(`Chuqur uyqu: ${data.sleep.deepMinutes} daqiqa`);
    if (data.sleep.lightMinutes !== null) lines.push(`Yengil uyqu: ${data.sleep.lightMinutes} daqiqa`);
    if (data.sleep.respiratoryRate !== null) lines.push(`Nafas olish tezligi: ${data.sleep.respiratoryRate} nafas/min`);

    lines.push('');
    lines.push(`ZO'RIQISH:`);
    if (data.strain.strainScore !== null) lines.push(`Zo'riqish balli: ${data.strain.strainScore}`);
    if (data.strain.calories !== null) lines.push(`Kaloriya: ${data.strain.calories} kkal`);

    if (data.workouts.length > 0) {
      lines.push('');
      lines.push('MASHQLAR:');
      for (const w of data.workouts) {
        lines.push(`- ${w.sport}: ${w.durationMinutes} daqiqa, zo'riqish: ${w.strainScore}`);
      }
    }

    lines.push('');
    lines.push(`Faqat o'zbek tilida yoz. Hech qanday ingliz so'zlari ishlatma.`);
  } else {
    lines.push(`Дата: ${data.date}`);
    lines.push('');
    lines.push('ВОССТАНОВЛЕНИЕ:');
    if (data.recovery.recoveryScore !== null) {
      let recoveryLine = `Балл восстановления: ${data.recovery.recoveryScore}%`;
      if (avgRecovery !== null) {
        const delta = data.recovery.recoveryScore - avgRecovery;
        recoveryLine += ` (${delta >= 0 ? '+' : ''}${delta}% от среднего)`;
      }
      lines.push(recoveryLine);
    }
    if (data.recovery.hrv !== null) {
      let hrvLine = `HRV: ${data.recovery.hrv}ms`;
      if (avgHrv !== null) {
        const delta = Math.round(data.recovery.hrv - avgHrv);
        hrvLine += ` (${delta >= 0 ? '+' : ''}${delta}ms от среднего)`;
      }
      lines.push(hrvLine);
    }
    if (data.recovery.rhr !== null) lines.push(`ЧСС покоя: ${data.recovery.rhr} уд/мин`);
    if (data.recovery.spo2 !== null) lines.push(`SpO₂: ${data.recovery.spo2}%`);

    lines.push('');
    lines.push('СОН:');
    if (data.sleep.durationMinutes !== null) {
      const h = Math.floor(data.sleep.durationMinutes / 60);
      const m = data.sleep.durationMinutes % 60;
      let sleepLine = `Длительность сна: ${h}ч ${m}м`;
      if (avgSleepDuration !== null) {
        const delta = data.sleep.durationMinutes - avgSleepDuration;
        const dh = Math.floor(Math.abs(delta) / 60);
        const dm = Math.abs(delta) % 60;
        sleepLine += ` (${delta >= 0 ? '+' : '-'}${dh}ч ${dm}м от среднего)`;
      }
      lines.push(sleepLine);
    }
    if (data.sleep.performancePct !== null) lines.push(`Производительность сна: ${data.sleep.performancePct}%`);
    if (data.sleep.efficiencyPct !== null) lines.push(`Эффективность сна: ${data.sleep.efficiencyPct}%`);
    if (data.sleep.remMinutes !== null) lines.push(`REM сон: ${data.sleep.remMinutes} мин`);
    if (data.sleep.deepMinutes !== null) lines.push(`Глубокий сон: ${data.sleep.deepMinutes} мин`);
    if (data.sleep.lightMinutes !== null) lines.push(`Лёгкий сон: ${data.sleep.lightMinutes} мин`);
    if (data.sleep.respiratoryRate !== null) lines.push(`Частота дыхания: ${data.sleep.respiratoryRate} в/мин`);

    lines.push('');
    lines.push('НАГРУЗКА:');
    if (data.strain.strainScore !== null) lines.push(`Балл нагрузки: ${data.strain.strainScore}`);
    if (data.strain.calories !== null) lines.push(`Калории: ${data.strain.calories} ккал`);

    if (data.workouts.length > 0) {
      lines.push('');
      lines.push('ТРЕНИРОВКИ:');
      for (const w of data.workouts) {
        lines.push(`- ${w.sport}: ${w.durationMinutes} мин, нагрузка: ${w.strainScore}`);
      }
    }

    lines.push('');
    lines.push('Пиши только на русском языке. Никаких английских слов.');
  }

  return lines.join('\n');
}

function hasUzbekContent(text: string): boolean {
  // Check for Uzbek-specific characters/patterns: o', g', sh, ch, ng
  const uzbekPatterns = /[oO]'|[gG]'|sh|ch|ng|[ʻʼ'']/g;
  const matches = text.match(uzbekPatterns) || [];
  // If text is short, even 1-2 matches is enough
  const words = text.split(/\s+/).length;
  return matches.length >= Math.max(2, words * 0.02);
}

function checkRefusal(text: string): boolean {
  return REFUSAL_PATTERNS.some(pattern => text.includes(pattern));
}

async function callGemini(
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
  const genModel = genAI.getGenerativeModel({
    model,
    systemInstruction: systemPrompt,
  });

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new AITimeoutError()), 15_000);
  });

  const generatePromise = genModel.generateContent(userPrompt);

  const result = await Promise.race([generatePromise, timeoutPromise]);
  const text = result.response.text();

  if (!text || text.trim().length === 0) {
    throw new AIRefusalError('Empty response');
  }

  if (checkRefusal(text)) {
    throw new AIRefusalError(text);
  }

  return text.trim();
}

function buildAnomalyFlags(today: DailySnapshot, history: DailySnapshot[]): string[] {
  const flags: string[] = [];

  // HRV drop: today HRV < 7-day avg * 0.8
  if (today.hrv !== null) {
    const hrvVals = history.slice(0, 7).map(s => s.hrv).filter((v): v is number => v !== null);
    if (hrvVals.length > 0) {
      const avg = Math.round(hrvVals.reduce((a, b) => a + b, 0) / hrvVals.length);
      if (today.hrv < avg * 0.8) {
        flags.push(`HRV ${today.hrv}ms — bazadan 20%+ past (avg: ${avg}ms)`);
      }
    }
  }

  // High strain yesterday
  if (history.length > 0 && history[0].strainScore !== null && history[0].strainScore > 15) {
    flags.push(`Kechagi strain yuqori: ${history[0].strainScore}`);
  }

  // Short sleep
  if (today.sleepDuration !== null && today.sleepDuration < 360) {
    const h = Math.floor(today.sleepDuration / 60);
    const m = today.sleepDuration % 60;
    flags.push(`Uyqu qisqa: ${h}soat ${m}daqiqa`);
  }

  // Late workout
  if (today.latestWorkoutTime) {
    const tashkentHour = new Date(today.latestWorkoutTime).toLocaleString('en-US', {
      timeZone: 'Asia/Tashkent',
      hour: 'numeric',
      minute: '2-digit',
      hour12: false,
    });
    const [hStr, mStr] = tashkentHour.split(':');
    const hour = parseInt(hStr, 10);
    if (hour >= 19) {
      flags.push(`Kechki mashg'ulot soat ${hStr}:${mStr}da`);
    }
  }

  return flags;
}

function buildHistoryText(history: DailySnapshot[]): string {
  return history.map(s => {
    const date = s.date.toISOString().split('T')[0];
    const h = s.sleepDuration !== null ? Math.floor(s.sleepDuration / 60) : '?';
    const m = s.sleepDuration !== null ? s.sleepDuration % 60 : '?';
    return `${date}: recovery=${s.recoveryScore ?? '?'}%, hrv=${s.hrv ?? '?'}ms, sleep=${h}h ${m}m, strain=${s.strainScore ?? '?'}`;
  }).join('\n');
}

export async function generateCausalBlock(
  today: DailySnapshot,
  history: DailySnapshot[],
  lang: 'uz' | 'ru',
): Promise<string | null> {
  if (history.length < 2) return null;

  const flags = buildAnomalyFlags(today, history);
  if (flags.length === 0 && today.recoveryScore !== null && today.recoveryScore >= 67) return null;

  const historyText = buildHistoryText(history.slice(0, 7));

  const outputLang = lang === 'ru' ? 'Russian' : "Uzbek (conversational, not formal)";
  const systemPrompt = `You are a health coach. Explain the cause briefly — 1-2 simple sentences. Output language: ${outputLang}. No filler.`;

  const userPrompt = (flags.length > 0 ? 'Bugun nima ko\'zga tashlanadi:\n' + flags.join('\n') + '\n\n' : '')
    + '7 kunlik ko\'rsatkichlar:\n' + historyText
    + '\n\nNima uchun bugun shunday? 1-2 gapda, oddiy tilda ayt.';

  try {
    const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.1-flash-lite-preview',
      systemInstruction: systemPrompt,
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('causal timeout')), 8_000);
    });
    const generatePromise = model.generateContent(userPrompt);
    const result = await Promise.race([generatePromise, timeoutPromise]);
    const text = result.response.text().trim();
    return text || null;
  } catch {
    return null;
  }
}

export async function generateWhyNotResponse(
  today: DailySnapshot,
  history: DailySnapshot[],
  question: string,
  lang: 'uz' | 'ru',
): Promise<string> {
  const historyText = buildHistoryText(history);

  const outputLang = lang === 'ru' ? 'Russian' : "Uzbek (conversational, not formal)";
  const systemPrompt = `You are a personal health coach. Explain Whoop data like a friend, not a doctor.

OUTPUT LANGUAGE: ${outputLang}.

FORMAT:
- 2-3 short paragraphs, separated by blank lines
- Each paragraph = 1-2 sentences
- Use specific numbers from the data
- End with 1 practical tip
- No filler, no disclaimers`;

  const userQuestion = question || (lang === 'ru' ? "Почему сегодня такие показатели?" : "Bugungi ko'rsatkichlar nima uchun bunday?");
  const userPrompt = 'Tarix:\n' + historyText + '\n\nSavol: ' + userQuestion;

  try {
    const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.1-flash-lite-preview',
      systemInstruction: systemPrompt,
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('whynot timeout')), 12_000);
    });
    const generatePromise = model.generateContent(userPrompt);
    const result = await Promise.race([generatePromise, timeoutPromise]);
    const text = result.response.text().trim();
    return text || (lang === 'ru' ? 'Анализ не удался. Попробуйте позже.' : "Tahlil amalga oshmadi. Keyinroq urinib ko'ring.");
  } catch {
    return lang === 'ru' ? 'Анализ не удался. Попробуйте позже.' : "Tahlil amalga oshmadi. Keyinroq urinib ko'ring.";
  }
}

export async function generateBrief(
  data: DayData,
  user: User,
  history: DailySnapshot[],
): Promise<string> {
  const lang = (user.language === 'ru' ? 'ru' : 'uz') as 'uz' | 'ru';
  const systemPrompt = buildSystemPrompt(lang);
  const userPrompt = buildUserPrompt(data, user, history);

  const models = ['gemini-3.1-flash-lite-preview', 'gemini-2.5-flash'] as const;

  for (const model of models) {
    try {
      let text = await callGemini(model, systemPrompt, userPrompt);

      // Language validation for Uzbek
      if (lang === 'uz' && !hasUzbekContent(text)) {
        // Retry with stronger language instruction
        const strongerPrompt = userPrompt + `\n\nMUHIM ESLATMA: Javobni FAQAT O'ZBEK TILIDA yoz! Inglizcha so'z bo'lsa, o'zbek tiliga tarjima qil. O'zbek tilida "o'", "g'", "sh", "ch" harflarini ishlatishni unutma.`;
        text = await callGemini(model, systemPrompt, strongerPrompt);
      }

      return text;
    } catch (err) {
      if (err instanceof AITimeoutError || err instanceof AIRefusalError) {
        // Try fallback model
        if (model === models[0]) continue;
        throw err;
      }
      // For other errors, try fallback model
      if (model === models[0]) continue;
      throw err;
    }
  }

  // Should not reach here, but just in case
  throw new AITimeoutError();
}
