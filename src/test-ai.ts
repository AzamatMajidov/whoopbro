import { generateBrief, buildSystemPrompt, buildUserPrompt } from './services/ai';
import { composeBrief, composeFallbackBrief, composeFullDetail, composePaywall, composeNoDevice } from './services/brief';
import { DayData } from './types/whoop';
import { User } from '@prisma/client';

const testData: DayData = {
  recovery: {
    recoveryScore: 42,
    hrv: 57,
    rhr: 61,
    spo2: 94,
  },
  sleep: {
    durationMinutes: 554,
    performancePct: 80,
    efficiencyPct: 85,
    remMinutes: 171,
    deepMinutes: 96,
    lightMinutes: 271,
    respiratoryRate: 15.2,
  },
  strain: {
    strainScore: 6.75,
    calories: 1406,
  },
  workouts: [],
  woreDevice: true,
  date: '2026-03-07',
};

const testUser = {
  id: BigInt(45118778),
  username: 'testuser',
  firstName: 'Test',
  language: 'uz',
  briefTime: '07:00',
  whoopConnected: true,
  whoopUserId: 'whoop123',
  createdAt: new Date(),
  lastActiveAt: new Date(),
} as User;

async function main() {
  console.log('=== System Prompt ===');
  console.log(buildSystemPrompt('uz'));
  console.log('\n=== User Prompt ===');
  console.log(buildUserPrompt(testData, testUser, []));

  console.log('\n=== Generating AI Brief ===');
  try {
    const aiText = await generateBrief(testData, testUser, []);
    console.log('\n--- AI Output ---');
    console.log(aiText);

    console.log('\n=== Composed Brief ===');
    const brief = composeBrief(testData, aiText, false);
    console.log(brief.text);
    console.log('\nKeyboard:', JSON.stringify(brief.keyboard));

    console.log('\n=== Composed Brief (stale) ===');
    const staleBrief = composeBrief(testData, aiText, true);
    console.log(staleBrief.text);
  } catch (err) {
    console.error('AI generation failed:', err);
    console.log('\n=== Fallback Brief ===');
    const fallback = composeFallbackBrief(testData, false);
    console.log(fallback.text);
  }

  console.log('\n=== Full Detail ===');
  console.log(composeFullDetail(testData));

  console.log('\n=== Paywall ===');
  const paywall = composePaywall(42);
  console.log(paywall.text);
  console.log('Keyboard:', JSON.stringify(paywall.keyboard));

  console.log('\n=== No Device ===');
  const noDevice = composeNoDevice();
  console.log(noDevice.text);
}

main().catch(console.error);
