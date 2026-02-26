-- ============================================================
-- Smart Transaction Import Pipeline — Production Hardening
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Add file_path to import_jobs (for Supabase Storage)
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS file_path TEXT;

-- 2. Create the Storage Bucket for import files (private)
-- Note: Supabase's storage schema is in the 'storage' schema.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'import_files',
  'import_files',
  false,
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'application/pdf', 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
ON CONFLICT (id) DO UPDATE SET 
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'application/pdf', 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];

-- 3. Storage RLS Policies
-- Enable RLS on storage.objects if not already enabled (usually is by default)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to avoid conflict
DROP POLICY IF EXISTS "Users can only upload their own import files" ON storage.objects;
DROP POLICY IF EXISTS "Users can only read their own import files" ON storage.objects;
DROP POLICY IF EXISTS "Users can only delete their own import files" ON storage.objects;
DROP POLICY IF EXISTS "Service role access" ON storage.objects;

-- Create restrictive policies (users can only access files in their own folder: user_id/*)
CREATE POLICY "Users can only upload their own import files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'import_files' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can only read their own import files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'import_files' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can only delete their own import files" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'import_files' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow service role full access to the bucket
CREATE POLICY "Service role access" ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'import_files')
  WITH CHECK (bucket_id = 'import_files');


-- 4. Atomic Commit RPC Function
-- This function atomicaly inserts checked transactions and updates the merchant map.
CREATE OR REPLACE FUNCTION commit_import_job(p_job_id UUID, p_user_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job_status TEXT;
  v_inserted_count INT := 0;
BEGIN
  -- 1. Check job exists and is ready
  SELECT status INTO v_job_status
  FROM import_jobs
  WHERE id = p_job_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found';
  END IF;

  IF v_job_status = 'completed' THEN
    RAISE EXCEPTION 'Job already completed';
  END IF;

  IF v_job_status != 'ready' THEN
    RAISE EXCEPTION 'Job is not ready for commit';
  END IF;

  -- 2. Insert selected, non-duplicate transactions
  WITH inserted AS (
    INSERT INTO transactions (user_id, date, merchant, amount, category, type, status, note, source, unique_hash)
    SELECT 
      user_id, 
      date, 
      merchant, 
      amount, 
      COALESCE(category, 'Others'), 
      'debit', 
      'completed', 
      note, 
      'import', 
      unique_hash
    FROM import_transactions
    WHERE job_id = p_job_id 
      AND user_id = p_user_id
      AND is_selected = true 
      AND is_duplicate = false
    RETURNING id
  )
  SELECT count(*) INTO v_inserted_count FROM inserted;

  -- 3. Upsert merchant mappings (lowercased)
  INSERT INTO user_merchant_map (user_id, merchant, category, confidence, usage_count, updated_at)
  SELECT 
    p_user_id,
    lower(trim(merchant)),
    COALESCE(category, 'Others'),
    0.85,
    1,
    now()
  FROM import_transactions
  WHERE job_id = p_job_id 
    AND user_id = p_user_id
    AND is_selected = true 
    AND is_duplicate = false
    AND category IS NOT NULL
  ON CONFLICT (user_id, merchant) 
  DO UPDATE SET 
    category = EXCLUDED.category,
    confidence = LEAST(user_merchant_map.confidence + 0.05, 1.0),
    usage_count = user_merchant_map.usage_count + 1,
    updated_at = now();

  -- 4. Mark job as completed
  UPDATE import_jobs
  SET status = 'completed', completed_at = now()
  WHERE id = p_job_id AND user_id = p_user_id;

  RETURN v_inserted_count;
END;
$$;
