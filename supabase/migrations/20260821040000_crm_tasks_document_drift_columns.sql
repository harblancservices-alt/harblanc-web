-- 20260821040000_crm_tasks_document_drift_columns.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Documents schema that already exists live but was never committed as a
-- migration: crm_tasks.contact_id, .task_type, .deleted_at have been used
-- throughout the app (tasks/actions.ts, followupTask.ts, every task query)
-- since commits a81f0fe/5de3a5e, but only the original foundation columns
-- were ever migrated. This file brings the committed schema in line with
-- production — it does not change production, which already has these
-- columns. Idempotent so it's safe to run against a database that already
-- has them.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.crm_tasks
  ADD COLUMN IF NOT EXISTS contact_id uuid,
  ADD COLUMN IF NOT EXISTS task_type text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crm_tasks_contact_id_fkey') THEN
    ALTER TABLE public.crm_tasks ADD CONSTRAINT crm_tasks_contact_id_fkey
      FOREIGN KEY (contact_id) REFERENCES public.crm_contacts(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS crm_tasks_contact_idx
  ON public.crm_tasks USING btree (contact_id) WHERE contact_id IS NOT NULL;
