import axios, { AxiosInstance } from 'axios';
import { PrismaClient } from '@prisma/client';
import { config } from '../config';
import { encrypt, decrypt } from '../utils/crypto';
import { DayData, WhoopRecovery, WhoopSleep, WhoopStrain, WhoopWorkout } from '../types/whoop';

// Custom errors
export class WhoopNotConnectedError extends Error {
  constructor() {
    super('Whoop account not connected');
    this.name = 'WhoopNotConnectedError';
  }
}

export class WhoopTokenExpiredError extends Error {
  constructor() {
    super('Whoop token expired — user must reconnect');
    this.name = 'WhoopTokenExpiredError';
  }
}

export class WhoopApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
  ) {
    super(message);
    this.name = 'WhoopApiError';
  }
}

const WHOOP_API_BASE = 'https://api.prod.whoop.com/developer';
const TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';

// Whoop's cycle boundary in Tashkent: sleep typically ends by ~11:00 (+05:00)
// We match a record to a date by checking if its cycle/sleep start falls within
// the 24h window of that date in Tashkent time.
function isForDate(isoTimestamp: string, date: string): boolean {
  const recordDate = new Date(isoTimestamp)
    .toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' }); // YYYY-MM-DD
  // Allow same date OR previous date (cycle starts night before)
  const prev = new Date(`${date}T00:00:00+05:00`);
  prev.setDate(prev.getDate() - 1);
  const prevDate = prev.toISOString().split('T')[0];
  return recordDate === date || recordDate === prevDate;
}

export class WhoopService {
  private api: AxiosInstance;
  private refreshLocks = new Map<string, Promise<string>>();

  constructor(private db: PrismaClient) {
    this.api = axios.create({
      baseURL: WHOOP_API_BASE,
      timeout: 10_000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
  }

  async getValidToken(userId: bigint): Promise<string> {
    const token = await this.db.whoopToken.findUnique({ where: { userId } });

    if (!token) throw new WhoopNotConnectedError();

    // Refresh if expires within 5 minutes
    if (token.expiresAt < new Date(Date.now() + 5 * 60 * 1000)) {
      // Serialize refresh per user — prevent concurrent refresh race condition
      const key = userId.toString();
      const existing = this.refreshLocks.get(key);
      if (existing) return existing;
      const promise = this.refreshToken(userId).finally(() => this.refreshLocks.delete(key));
      this.refreshLocks.set(key, promise);
      return promise;
    }

    return decrypt(token.accessToken);
  }

  async refreshToken(userId: bigint): Promise<string> {
    const token = await this.db.whoopToken.findUnique({ where: { userId } });
    if (!token) throw new WhoopNotConnectedError();

    const refreshToken = decrypt(token.refreshToken);

    try {
      const response = await axios.post(
        TOKEN_URL,
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: config.WHOOP_CLIENT_ID,
          client_secret: config.WHOOP_CLIENT_SECRET,
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' } },
      );

      const { access_token, refresh_token, expires_in } = response.data;

      await this.db.whoopToken.update({
        where: { userId },
        data: {
          accessToken: encrypt(access_token),
          refreshToken: encrypt(refresh_token),
          expiresAt: new Date(Date.now() + expires_in * 1000),
        },
      });

      return access_token;
    } catch (err: any) {
      if (err?.response?.status === 401) {
        // Token permanently revoked — disconnect user
        await this.db.whoopToken.delete({ where: { userId } });
        await this.db.user.update({
          where: { id: userId },
          data: { whoopConnected: false },
        });
        throw new WhoopTokenExpiredError();
      }
      throw new WhoopApiError(`Token refresh failed: ${err.message}`);
    }
  }

  // Fetch up to `pages` pages of paginated results
  private async fetchPaginated(path: string, accessToken: string, limit = 10): Promise<any[]> {
    const records: any[] = [];
    let nextToken: string | undefined;

    do {
      const params: Record<string, any> = { limit };
      if (nextToken) params.nextToken = nextToken;

      const response = await this.api.get(path, {
        params,
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      records.push(...(response.data?.records ?? []));
      nextToken = response.data?.next_token;

      // Safety: max 3 pages
      if (records.length >= limit * 3) break;
    } while (nextToken);

    return records;
  }

  async fetchRecovery(userId: bigint, date: string): Promise<WhoopRecovery | null> {
    const accessToken = await this.getValidToken(userId);

    try {
      const records = await this.fetchPaginated('/v2/recovery', accessToken, 5);
      // Only use records with a finalized score (score_state === 'SCORED')
      const rec = records.find(
        (r: any) => isForDate(r.created_at, date) && r.score_state === 'SCORED',
      );
      if (!rec) return null;

      return {
        recoveryScore: rec.score?.recovery_score ?? null,
        hrv: rec.score?.hrv_rmssd_milli ?? null,
        rhr: rec.score?.resting_heart_rate ?? null,
        spo2: rec.score?.spo2_percentage ?? null,
      };
    } catch (err: any) {
      if (err?.response?.status === 401) throw new WhoopTokenExpiredError();
      if (err?.response?.status >= 500) throw new WhoopApiError('Whoop API server error', err.response.status);
      return null;
    }
  }

  async fetchSleep(userId: bigint, date: string): Promise<WhoopSleep | null> {
    const accessToken = await this.getValidToken(userId);

    try {
      const records = await this.fetchPaginated('/v2/activity/sleep', accessToken, 5);

      // Find non-nap, completed sleep for the requested date
      // Skip ongoing sleep sessions (end === null) — data is not finalized yet
      const sleepRecords = records.filter(
        (r: any) => !r.nap && r.end != null && isForDate(r.start, date),
      );
      if (!sleepRecords.length) return null;

      // Use longest sleep if multiple
      const sleep = sleepRecords.reduce((longest: any, current: any) => {
        const l = longest?.score?.stage_summary?.total_in_bed_time_milli ?? 0;
        const c = current?.score?.stage_summary?.total_in_bed_time_milli ?? 0;
        return c > l ? current : longest;
      }, sleepRecords[0]);

      const stages = sleep.score?.stage_summary;
      return {
        durationMinutes: stages?.total_in_bed_time_milli
          ? Math.round(stages.total_in_bed_time_milli / 60000)
          : null,
        performancePct: sleep.score?.sleep_performance_percentage ?? null,
        efficiencyPct: sleep.score?.sleep_efficiency_percentage ?? null,
        remMinutes: stages?.total_rem_sleep_time_milli
          ? Math.round(stages.total_rem_sleep_time_milli / 60000)
          : null,
        deepMinutes: stages?.total_slow_wave_sleep_time_milli
          ? Math.round(stages.total_slow_wave_sleep_time_milli / 60000)
          : null,
        lightMinutes: stages?.total_light_sleep_time_milli
          ? Math.round(stages.total_light_sleep_time_milli / 60000)
          : null,
        respiratoryRate: sleep.score?.respiratory_rate ?? null,
      };
    } catch (err: any) {
      if (err?.response?.status === 401) throw new WhoopTokenExpiredError();
      if (err?.response?.status >= 500) throw new WhoopApiError('Whoop API server error', err.response.status);
      return null;
    }
  }

  async fetchStrain(userId: bigint, date: string): Promise<WhoopStrain | null> {
    const accessToken = await this.getValidToken(userId);
    const { start, end } = this.getDateRange(date);

    try {
      const response = await this.api.get('/v1/cycle', {
        params: { start, end },
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const records = response.data?.records;
      if (!records?.length) return null;

      const cycle = records[0];
      return {
        strainScore: cycle.score?.strain ?? null,
        calories: cycle.score?.kilojoule
          ? Math.round(cycle.score.kilojoule * 0.239006)
          : null,
      };
    } catch (err: any) {
      if (err?.response?.status === 401) throw new WhoopTokenExpiredError();
      if (err?.response?.status >= 500) throw new WhoopApiError('Whoop API server error', err.response.status);
      return null;
    }
  }

  async fetchWorkouts(userId: bigint, date: string): Promise<WhoopWorkout[]> {
    const accessToken = await this.getValidToken(userId);
    const { start, end } = this.getDateRange(date);

    try {
      const response = await this.api.get('/v1/activity/workout', {
        params: { start, end },
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const records = response.data?.records ?? [];
      return records.map((w: any) => ({
        strainScore: w.score?.strain ?? 0,
        sport: w.sport_id?.toString() ?? 'Unknown',
        durationMinutes: w.start && w.end
          ? Math.round((new Date(w.end).getTime() - new Date(w.start).getTime()) / 60000)
          : 0,
      }));
    } catch (err: any) {
      if (err?.response?.status === 401) throw new WhoopTokenExpiredError();
      // Workouts are optional — return empty on error
      return [];
    }
  }

  /**
   * Build date range for Tashkent timezone (UTC+5).
   * For a Tashkent date, midnight-to-midnight is:
   *   start: (date)T00:00:00+05:00 = (date-1)T19:00:00Z
   *   end:   (date)T23:59:59+05:00 = (date)T18:59:59Z
   */
  private getDateRange(date: string): { start: string; end: string } {
    const d = new Date(`${date}T00:00:00+05:00`);
    const start = d.toISOString();
    const end = new Date(d.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString();
    return { start, end };
  }

  async fetchWorkoutById(
    userId: bigint,
    workoutId: string,
  ): Promise<{ strain: number; sport: string; startTime: Date; endTime: Date } | null> {
    const accessToken = await this.getValidToken(userId);

    try {
      const response = await this.api.get(`/v1/activity/workout/${workoutId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const w = response.data;
      return {
        strain: w.score?.strain ?? 0,
        sport: w.sport_id?.toString() ?? 'unknown',
        startTime: new Date(w.start),
        endTime: new Date(w.end),
      };
    } catch (err: any) {
      if (err?.response?.status === 401) throw new WhoopTokenExpiredError();
      if (err?.response?.status === 404) return null;
      return null;
    }
  }

  /**
   * Backfill historical snapshots for Phase 2 AI insights.
   * Fetches bulk recovery + sleep records and upserts per-date snapshots.
   * Fire-and-forget safe — logs errors per date, never throws.
   */
  async backfillHistory(userId: bigint, days = 30): Promise<void> {
    const accessToken = await this.getValidToken(userId);

    // Fetch bulk records (2 pages of 25 = up to 50 records each)
    const [recoveryRecords, sleepRecords] = await Promise.all([
      this.fetchPaginated('/v2/recovery', accessToken, 25).catch((err) => {
        console.error('[backfill] recovery fetch failed:', err.message);
        return [] as any[];
      }),
      this.fetchPaginated('/v2/activity/sleep', accessToken, 25).catch((err) => {
        console.error('[backfill] sleep fetch failed:', err.message);
        return [] as any[];
      }),
    ]);

    // Build date list: today-1 to today-days
    const dates: string[] = [];
    const now = new Date();
    for (let i = 1; i <= days; i++) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      dates.push(d.toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' }));
    }

    // Check which dates already have READY/STALE snapshots
    const existing = await this.db.dailySnapshot.findMany({
      where: {
        userId,
        date: { in: dates.map((d) => new Date(`${d}T00:00:00Z`)) },
        fetchStatus: { in: ['READY', 'STALE'] },
      },
      select: { date: true },
    });
    const existingDates = new Set(
      existing.map((e) => e.date.toISOString().split('T')[0]),
    );

    for (const date of dates) {
      if (existingDates.has(date)) continue;

      try {
        // Find matching recovery
        const rec = recoveryRecords.find(
          (r: any) => isForDate(r.created_at, date) && r.score_state === 'SCORED',
        );
        const recovery: WhoopRecovery | null = rec
          ? {
              recoveryScore: rec.score?.recovery_score ?? null,
              hrv: rec.score?.hrv_rmssd_milli ?? null,
              rhr: rec.score?.resting_heart_rate ?? null,
              spo2: rec.score?.spo2_percentage ?? null,
            }
          : null;

        // Find matching sleep (non-nap, completed, longest)
        const sleepMatches = sleepRecords.filter(
          (r: any) => !r.nap && r.end != null && isForDate(r.start, date),
        );
        let sleep: WhoopSleep | null = null;
        if (sleepMatches.length) {
          const best = sleepMatches.reduce((longest: any, current: any) => {
            const l = longest?.score?.stage_summary?.total_in_bed_time_milli ?? 0;
            const c = current?.score?.stage_summary?.total_in_bed_time_milli ?? 0;
            return c > l ? current : longest;
          }, sleepMatches[0]);
          const stages = best.score?.stage_summary;
          sleep = {
            durationMinutes: stages?.total_in_bed_time_milli
              ? Math.round(stages.total_in_bed_time_milli / 60000)
              : null,
            performancePct: best.score?.sleep_performance_percentage ?? null,
            efficiencyPct: best.score?.sleep_efficiency_percentage ?? null,
            remMinutes: stages?.total_rem_sleep_time_milli
              ? Math.round(stages.total_rem_sleep_time_milli / 60000)
              : null,
            deepMinutes: stages?.total_slow_wave_sleep_time_milli
              ? Math.round(stages.total_slow_wave_sleep_time_milli / 60000)
              : null,
            lightMinutes: stages?.total_light_sleep_time_milli
              ? Math.round(stages.total_light_sleep_time_milli / 60000)
              : null,
            respiratoryRate: best.score?.respiratory_rate ?? null,
          };
        }

        // Skip if no data at all for this date
        if (!recovery && !sleep) continue;

        const woreDevice = sleep !== null || recovery !== null;
        const dateObj = new Date(`${date}T00:00:00Z`);

        await this.db.dailySnapshot.upsert({
          where: { userId_date: { userId, date: dateObj } },
          create: {
            userId,
            date: dateObj,
            recoveryScore: recovery?.recoveryScore ?? null,
            hrv: recovery?.hrv ?? null,
            rhr: recovery?.rhr ?? null,
            spo2: recovery?.spo2 ?? null,
            sleepDuration: sleep?.durationMinutes ?? null,
            sleepPerf: sleep?.performancePct ?? null,
            sleepEfficiency: sleep?.efficiencyPct ?? null,
            remMinutes: sleep?.remMinutes ?? null,
            deepMinutes: sleep?.deepMinutes ?? null,
            lightMinutes: sleep?.lightMinutes ?? null,
            respiratoryRate: sleep?.respiratoryRate ?? null,
            strainScore: null,
            calories: null,
            woreDevice,
            fetchStatus: 'READY',
            fetchedAt: new Date(),
          },
          update: {
            recoveryScore: recovery?.recoveryScore ?? null,
            hrv: recovery?.hrv ?? null,
            rhr: recovery?.rhr ?? null,
            spo2: recovery?.spo2 ?? null,
            sleepDuration: sleep?.durationMinutes ?? null,
            sleepPerf: sleep?.performancePct ?? null,
            sleepEfficiency: sleep?.efficiencyPct ?? null,
            remMinutes: sleep?.remMinutes ?? null,
            deepMinutes: sleep?.deepMinutes ?? null,
            lightMinutes: sleep?.lightMinutes ?? null,
            respiratoryRate: sleep?.respiratoryRate ?? null,
            woreDevice,
            fetchStatus: 'READY',
            fetchedAt: new Date(),
          },
        });
      } catch (err: any) {
        console.error(`[backfill] date ${date} failed:`, err.message);
      }
    }
  }

  async fetchDayData(userId: bigint, date: string): Promise<DayData> {
    const [recovery, sleep, strain, workouts] = await Promise.all([
      this.fetchRecovery(userId, date),
      this.fetchSleep(userId, date),
      this.fetchStrain(userId, date),
      this.fetchWorkouts(userId, date),
    ]);

    return {
      recovery: recovery ?? { recoveryScore: null, hrv: null, rhr: null, spo2: null },
      sleep: sleep ?? {
        durationMinutes: null,
        performancePct: null,
        efficiencyPct: null,
        remMinutes: null,
        deepMinutes: null,
        lightMinutes: null,
        respiratoryRate: null,
      },
      strain: strain ?? { strainScore: null, calories: null },
      workouts,
      woreDevice: sleep !== null || recovery !== null,
      date,
    };
  }
}
