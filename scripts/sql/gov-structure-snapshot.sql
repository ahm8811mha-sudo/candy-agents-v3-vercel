-- The shape of every gov_ table production actually holds, so later changes
-- are designed against it instead of guessed. Structure only: this output is
-- written to a public run summary, so it never lists access rules.
begin transaction read only;

select c.table_name, c.column_name, c.data_type, c.is_nullable
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name like 'gov\_%'
order by c.table_name, c.ordinal_position;

rollback;
