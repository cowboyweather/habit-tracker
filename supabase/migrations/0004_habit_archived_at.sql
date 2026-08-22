-- Precise "was this habit active on day D" queries (used by Insights'
-- calendar shading and weekday stats) need to know exactly when a habit
-- was archived, not just that it currently is. archived boolean alone
-- can't answer that for historical days.

alter table habits
  add column archived_at timestamptz;
