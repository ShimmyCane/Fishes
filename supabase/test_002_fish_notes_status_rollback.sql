-- Rolled-back test for 002_fish_notes_status.sql. Run this FIRST, in the Family project's SQL editor.
-- It runs the migration on the real table inside a DO block and always ends with an exception, so nothing persists.
-- Expected result message (in the error output):
--   RESULT (rolled back): status_default=t status_updated=t note_change_denied=t bad_status_rejected=t

do $$
declare
  status_default boolean := false; status_updated boolean := false;
  note_change_denied boolean := false; bad_status_rejected boolean := false;
  any_id uuid;
begin
  execute $sql$
alter table public.fish_notes add column if not exists status text not null default 'start'
    check (status in ('start', 'testing', 'done'));
grant update (status) on public.fish_notes to authenticated;
create policy "Family can update fish_notes status" on public.fish_notes
    for update to authenticated using (true) with check (true);
$sql$;

  insert into public.fish_notes (note, level, size, seconds) values ('test note', 9, 14.0, 152)
    returning id into any_id;
  select status = 'start' into status_default from public.fish_notes where id = any_id;

  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f002","role":"authenticated"}', true);

  update public.fish_notes set status = 'testing' where id = any_id;
  status_updated := (select status from public.fish_notes where id = any_id) = 'testing';

  begin
    update public.fish_notes set note = 'changed' where id = any_id;
  exception when insufficient_privilege then note_change_denied := true;
  end;

  begin
    update public.fish_notes set status = 'bogus' where id = any_id;
  exception when check_violation then bad_status_rejected := true;
  end;

  reset role;
  raise exception 'RESULT (rolled back): status_default=% status_updated=% note_change_denied=% bad_status_rejected=%',
    status_default, status_updated, note_change_denied, bad_status_rejected;
end $$;
