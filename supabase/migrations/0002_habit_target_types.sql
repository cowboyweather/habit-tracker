-- Habit target types: daily (existing behavior) vs weekly (N times per week).
-- Existing rows default to daily / target_count 1 — no behavior change.

alter table habits
  add column target_type text not null default 'daily',
  add column target_count integer not null default 1;

alter table habits
  add constraint habits_target_type_check
    check (target_type in ('daily', 'weekly')),
  add constraint habits_target_count_check
    check (target_count between 1 and 7);
