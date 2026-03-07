export interface WhoopRecovery {
  recoveryScore: number | null;
  hrv: number | null;
  rhr: number | null;
  spo2: number | null;
}

export interface WhoopSleep {
  durationMinutes: number | null;
  performancePct: number | null;
  efficiencyPct: number | null;
  remMinutes: number | null;
  deepMinutes: number | null;
  lightMinutes: number | null;
  respiratoryRate: number | null;
}

export interface WhoopStrain {
  strainScore: number | null;
  calories: number | null;
}

export interface WhoopWorkout {
  strainScore: number;
  sport: string;
  durationMinutes: number;
}

export interface DayData {
  recovery: WhoopRecovery;
  sleep: WhoopSleep;
  strain: WhoopStrain;
  workouts: WhoopWorkout[];
  woreDevice: boolean;
  date: string;
}
