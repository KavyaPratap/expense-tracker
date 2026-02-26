-- ============================================================
-- Smart Transaction Import Pipeline — Database Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. import_jobs — tracks each import operation
CREATE TABLE IF NOT EXISTS import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','processing','ready','failed','completed')),
  file_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INT,
  total_rows INT DEFAULT 0,
  processed_rows INT DEFAULT 0,
  ai_tokens_used INT DEFAULT 0,
  ai_cost_estimate NUMERIC DEFAULT 0,
  error_message TEXT,
  import_engine_version TEXT DEFAULT 'v2.0',
  processing_time_ms INT,
  discarded BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- 2. import_transactions — staging table for preview before commit
CREATE TABLE IF NOT EXISTS import_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  date DATE NOT NULL,
  merchant TEXT NOT NULL,
  note TEXT,
  category TEXT,
  confidence NUMERIC DEFAULT 0.5,
  unique_hash TEXT UNIQUE,
  is_duplicate BOOLEAN DEFAULT false,
  is_selected BOOLEAN DEFAULT true,
  raw_payload JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. user_merchant_map — merchant → category learning for repeat recognition
CREATE TABLE IF NOT EXISTS user_merchant_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  merchant TEXT NOT NULL,
  category TEXT NOT NULL,
  confidence NUMERIC DEFAULT 0.8,
  usage_count INT DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, merchant)
);

-- 4. Add source + unique_hash columns to existing transactions table
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS unique_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_unique_hash
  ON transactions(unique_hash) WHERE unique_hash IS NOT NULL;

-- 5. Concurrency Index — fast active-job check per user
CREATE INDEX IF NOT EXISTS idx_import_jobs_user_active
  ON import_jobs(user_id)
  WHERE status IN ('queued','processing');

-- 6. RLS Policies
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_merchant_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own import_jobs" ON import_jobs
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own import_transactions" ON import_transactions
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own user_merchant_map" ON user_merchant_map
  FOR ALL USING (auth.uid() = user_id);
