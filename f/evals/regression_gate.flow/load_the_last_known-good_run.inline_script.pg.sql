-- $1 target_flow_path
select mean, per_case
from eval_baseline
where target_flow_path = $1::text