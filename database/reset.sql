drop table if exists external_sync_logs cascade;
drop table if exists activity_logs cascade;
drop table if exists notifications cascade;
drop table if exists approvals cascade;
drop table if exists daily_logs cascade;
drop table if exists task_comments cascade;
drop table if exists tasks cascade;
drop table if exists projects cascade;
drop table if exists employees cascade;
drop table if exists departments cascade;

-- After running this file, run schema.sql then policies.sql then seed.sql.
