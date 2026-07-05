-- 20260558000000_repair_log_migrate_data.sql
-- One-time data migration: legacy maintenance_* → new repair_* model.
--
-- Preserves ALL existing maintenance data (nothing is dropped):
--   * every non-deleted maintenance_item      → a repair_reminders row
--   * every maintenance_log row                → a repair_entries row
--   * every maintenance_attachments row        → a repair_attachments row
--   * each log's maintenance_expenses lines    → folded into the entry's cost
--                                                (sum) + notes (line detail)
--
-- The legacy tables are NOT modified. Each INSERT is guarded by NOT EXISTS on
-- the target so re-running the migration is a safe no-op.

-- 1. Reminders ← every non-deleted interval item. part_group = the item name
--    (the same value stamped onto its entries in step 2, so they link up).
--    last_service_odo/date become the anchor baseline (used until the first
--    entry exists for the group).
insert into public.repair_reminders
  (label, part_group, interval_miles, anchor_odo, anchor_date, created_at, updated_at)
select
  mi.name,
  mi.name,
  mi.interval_miles,
  mi.last_service_odo,
  mi.last_service_date,
  mi.created_at,
  mi.created_at
from public.maintenance_items mi
where mi.deleted_at is null
  and not exists (
    select 1 from public.repair_reminders rr where rr.part_group = mi.name
  );

-- 2. Entries ← every logged service. The legacy log id is REUSED as the entry
--    id so step 3 can carry receipts across by id. Rules:
--      description = service_name, else the item name, else 'Service'
--      cost        = total_cost, else the summed expense lines
--      notes       = original notes + a folded "Parts / lines" list from the
--                    expense line items (so per-line detail survives)
--      part_group  = the item name when the item is still active (ties to the
--                    reminder / set); null for custom one-offs & deleted items
insert into public.repair_entries
  (id, created_at, updated_at, description, odometer, service_date, cost, notes, position, part_group)
select
  ml.id,
  ml.created_at,
  ml.created_at,
  coalesce(nullif(btrim(ml.service_name), ''), mi.name, 'Service'),
  ml.service_odo,
  coalesce(ml.service_date, ml.created_at::date, current_date),
  coalesce(
    ml.total_cost,
    (select sum(me.amount) from public.maintenance_expenses me where me.log_id = ml.id)
  ),
  nullif(
    concat_ws(
      E'\n',
      nullif(btrim(coalesce(ml.notes, '')), ''),
      (
        select case when count(*) > 0 then
          'Parts / lines:' || string_agg(
            E'\n• ' || coalesce(nullif(btrim(me.description), ''), 'Item')
              || case when me.amount is not null
                   then ' — $' || to_char(me.amount, 'FM999999990.00')
                   else '' end,
            '' order by me.created_at
          )
        else null end
        from public.maintenance_expenses me where me.log_id = ml.id
      )
    ),
    ''
  ),
  null,
  case when mi.id is not null and mi.deleted_at is null then mi.name else null end
from public.maintenance_log ml
left join public.maintenance_items mi on mi.id = ml.item_id
where not exists (
  select 1 from public.repair_entries re where re.id = ml.id
);

-- 3. Attachments ← every legacy receipt. entry_id = the reused log id. The
--    storage objects in the maintenance-receipts bucket are shared (paths are
--    copied as-is), so signed URLs keep working with no file moves.
insert into public.repair_attachments
  (entry_id, file_path, thumb_path, file_name, content_type, size_bytes, created_at)
select
  ma.log_id,
  ma.file_path,
  ma.thumb_path,
  ma.file_name,
  ma.content_type,
  ma.size_bytes,
  ma.created_at
from public.maintenance_attachments ma
where exists (select 1 from public.repair_entries re where re.id = ma.log_id)
  and not exists (
    select 1 from public.repair_attachments ra
    where ra.entry_id = ma.log_id and ra.file_path = ma.file_path
  );
