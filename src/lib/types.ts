
export interface Transaction {
  id: number;
  created_at: string;
  user_id: string;
  date: string;
  merchant: string;
  amount: number;
  category: string;
  status: "completed" | "pending";
  type: "credit" | "debit";
  note?: string;
  groupId?: string;
  groupExpenseId?: string;
  payment_method?: string;
  source?: string;
  unique_hash?: string;
}

export interface Category {
  id: number;
  created_at: string;
  user_id: string;
  name: string;
  icon: string;
  color: string;
  bg_color: string;
  groups: string[];
}

export interface Budget {
  id?: string;
  categoryName: string;
  amount: number;
  spent?: number;
}

export type BudgetSettings = {
  budgets: Record<string, number>;
};

export interface Settings {
  user_id: string;
  notifications: boolean;
  dark_mode: boolean;
  auto_categ: boolean;
  language: string;
  currency: "USD" | "EUR" | "GBP" | "INR" | "PHP" | "RUB";
}

export interface GroupMember {
  uid: string;
  displayName: string;
  photoURL: string;
}

export interface Group {
  id: string;
  created_at: string;
  name: string;
  owner_id: string;
  member_ids: string[];
  members: GroupMember[];
  invite_code: string;
}

export interface GroupExpense {
  id: string;
  created_at: string;
  group_id: string;
  title: string;
  amount: number;
  paid_by: string;
  split_between: string[];
  groupName?: string;
}

export interface ImportJob {
  id: string;
  user_id: string;
  status: 'queued' | 'processing' | 'ready' | 'failed' | 'completed';
  file_type: string;
  file_name: string;
  file_size: number;
  total_rows: number;
  processed_rows: number;
  ai_tokens_used: number;
  ai_cost_estimate: number;
  error_message?: string;
  import_engine_version: string;
  processing_time_ms?: number;
  discarded: boolean;
  created_at: string;
  completed_at?: string;
}

export interface ImportTransaction {
  id: string;
  job_id: string;
  user_id: string;
  amount: number;
  date: string;
  merchant: string;
  note?: string;
  category?: string;
  confidence: number;
  unique_hash: string;
  is_duplicate: boolean;
  is_selected: boolean;
  raw_payload?: Record<string, unknown>;
  created_at: string;
}

export interface UserMerchantMap {
  id: string;
  user_id: string;
  merchant: string;
  category: string;
  confidence: number;
  usage_count: number;
  updated_at: string;
}
