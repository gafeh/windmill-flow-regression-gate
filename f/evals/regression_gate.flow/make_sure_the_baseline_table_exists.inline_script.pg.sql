create table if not exists eval_baseline (
  target_flow_path text primary key,
  mean double precision not null,
  per_case jsonb not null,
  verdict text not null,
  recorded_at timestamptz not null default now()
)