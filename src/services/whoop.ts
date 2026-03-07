import axios, { AxiosInstance } from 'axios';
import { PrismaClient } from '@prisma/client';
import { config } from '../config';
import { encrypt, decrypt } from '../utils/crypto';
import { DayData, WhoopRecovery, WhoopSleep, WhoopStrain } from '../types/whoop';

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

export class WhoopService {
  private api: AxiosInstance;

  constructor(private db: PrismaClient) {
    this.api = axios.create({
      baseURL: WHOOP_API_BASE,
      timeout: 10_000,
    });
  }

  async getValidToken(userId: bigint): Promise<string> {
    const token = await this.db.whoopToken.findUnique({ where: { userId } });

    if (!token) throw new WhoopNotConnectedError();

    // Refresh if expires within 5 minutes
    if (token.expiresAt < new Date(Date.now() + 5 * 60 * 1000)) {
      return this.refreshToken(userId);
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
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
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

  /**
   * Build date range for Tashkent timezone (UTC+5).
   * For a Tashkent date, midnight-to-midnight is:
   *   start: (date-1)T19:00:00.000Z
   *   end:   dateT18:59:59.999Z
   */
  private getDateRange(date: string): { start: string; end: string } {
    const d = new Date(`${date}T00:00:00+05:00`);
    const start = new Date(d.getTime());
    const end = new Date(d.getTime() + 24 * 60 * 60 * 1000 - 1);
    return {
      start: start.toISOString(),
      end: end.toISOString(),
    };
  }

  async fetchRecovery(userId: bigint, date: string): Promise<WhoopRecovery | null> {
    const accessToken = await this.getValidToken(userId);
    const { start, end } = this.getDateRange(date);

    try {
      const response = await this.api.get('/v1/recovery', {
        params: { start, end },
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const records = response.data?.records;
      if (!records?.length) return null;

      const rec = records[0];
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
    const { start, end } = this.getDateRange(date);

    try {
      const response = await this.api.get('/v1/activity/sleep', {
        params: { start, end },
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const records = response.data?.records;
      if (!records?.length) return null;

      // Use the longest sleep record
      const sleep = records.reduce((longest: any, current: any) => {
        const longestDuration = longest?.score?.stage_summary?.total_in_bed_time_milli ?? 0;
        const currentDuration = current?.score?.stage_summary?.total_in_bed_time_milli ?? 0;
        return currentDuration > longestDuration ? current : longest;
      }, records[0]);

      const stages = sleep.score?.stage_summary;
      return {
        durationMinutes: stages?.total_in_bed_time_milli ? Math.round(stages.total_in_bed_time_milli / 60000) : null,
        performancePct: sleep.score?.sleep_performance_percentage ?? null,
        efficiencyPct: sleep.score?.sleep_efficiency_percentage ?? null,
        remMinutes: stages?.total_rem_sleep_time_milli ? Math.round(stages.total_rem_sleep_time_milli / 60000) : null,
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
        calories: cycle.score?.kilojoule ? Math.round(cycle.score.kilojoule * 0.239006) : null,
      };
    } catch (err: any) {
      if (err?.response?.status === 401) throw new WhoopTokenExpiredError();
      if (err?.response?.status >= 500) throw new WhoopApiError('Whoop API server error', err.response.status);
      return null;
    }
  }

  async fetchDayData(userId: bigint, date: string): Promise<DayData> {
    const [recovery, sleep, strain] = await Promise.all([
      this.fetchRecovery(userId, date),
      this.fetchSleep(userId, date),
      this.fetchStrain(userId, date),
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
      workouts: [],
      woreDevice: sleep !== null,
      date,
    };
  }
}
