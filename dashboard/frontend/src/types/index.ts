export interface Run {
  run_id: string;
  ticker: string;
  trade_date: string;
  path?: string;
  source?: string;
  status?: string;
  created_at?: string;
  [key: string]: any;
}

export interface RunConfig {
  ticker: string;
  trade_date: string;
  selected_analysts: string[];
  deep_think_llm: string;
  quick_think_llm: string;
  llm_provider: string;
  max_debate_rounds: number;
  debug: boolean;
}

export interface AgentStatus {
  name: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  stage: number;
}

export interface ReportSection {
  title: string;
  content: string;
}

export type SSEState = {
  status: string;
  progress: Record<string, any>;
  messages: string[];
  result?: Record<string, any>;
  error?: string;
};
