-- $1 target_flow_path
-- $2 mean
-- $3 per_case
-- $4 verdict
insert into eval_baseline (target_flow_path, mean, per_case, verdict, recorded_at)
values ($1::text, $2::double precision, $3::jsonb, $4::text, now())
on conflict (target_flow_path) do update
set mean = excluded.mean,
    per_case = excluded.per_case,
    verdict = excluded.verdict,
    recorded_at = now()