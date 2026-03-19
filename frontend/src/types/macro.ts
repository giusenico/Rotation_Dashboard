export interface MacroRankingEntry {
  rank: number;
  symbol: string;
  name: string;
  wins: number;
  net_edge: number;
  side: "risk_on" | "risk_off";
}

export interface MacroDominance {
  dominance_score: number;
  risk_on_win_fraction: number;
  pairs_count: number;
  dominant_side: "Risk-ON" | "Risk-OFF";
}

export interface MacroUnified {
  value: number;
  ma_fast: number;
  ma_slow: number;
  ma_state: "RISK-ON" | "RISK-OFF";
  roc: number;
}

export interface MacroRotation {
  rank_rotation: number;
  pairwise_velocity: number;
  emd_rotation: number;
  edge_now: number;
  edge_then: number;
  delta_to_risk_on: number;
}

export interface MacroTopKChurn {
  jaccard: number;
  entered: string[];
  exited: string[];
}

export interface MacroScenarios {
  bear: number;
  base: number;
  bull: number;
  confidence: "high" | "medium" | "low";
  n_transitions: number;
}

export interface MacroDuration {
  days_in_regime: number;
  avg_duration: number;
  avg_durations_all: Record<string, number>;
  transitions: Record<string, Record<string, number>>;
  scenarios: MacroScenarios;
}

export interface MacroMatrix {
  symbols: string[];
  display_names: string[];
  values: number[][];
}

export type MacroRegime = "Defensive" | "Fragile" | "Recovery" | "Expansion";

export interface MacroHeroResponse {
  regime: MacroRegime;
  composite_score: number;
  period: number;
  as_of_date: string;
  dominance: MacroDominance;
  unified: MacroUnified;
  z_score: number;
  signals: string[];
  rotation: MacroRotation;
  ranking: MacroRankingEntry[];
  topk_churn: MacroTopKChurn;
  duration: MacroDuration;
  matrix: MacroMatrix;
}

export interface MacroUnifiedPoint {
  date: string;
  unified: number;
  ma_fast: number | null;
  ma_slow: number | null;
  z: number | null;
  signals?: string[];
}

export interface MacroRotationPoint {
  date: string;
  rank_rotation: number;
  delta_to_risk_on: number;
}

export interface MacroRegimePoint {
  date: string;
  regime: MacroRegime;
  composite_score: number;
}

export interface MacroHistoryResponse {
  unified_series: MacroUnifiedPoint[];
  rotation_series: MacroRotationPoint[];
  regime_history: MacroRegimePoint[];
  as_of_date: string;
}
