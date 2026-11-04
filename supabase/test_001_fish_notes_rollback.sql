-- Rolled-back test for 001_fish_notes.sql. Run this FIRST, in the Family project's SQL editor.
-- It creates the table inside a DO block and always ends with an exception, so nothing persists.
-- Expected result message (in the error output):
--   RESULT (rolled back): note_saved=t bad_row_rejected=t delete_denied=t anon_denied=t

do $$
declare
  saved_count int; constraint_hit boolean := false; delete_denied boolean := false; anon_denied boolean := false;
begin
  execute $sql$
create table if not exists public.fish_notes (
    id          uuid primary key default gen_random_uuid(),
    created_at  timestamptz not null default timezone('utc', now()),
    note        text not null check (char_length(note) between 1 and 300),
    level       smallint not null check (level between 0 and 20),
    size        numeric(6,1) not null check (size >= 0 and size <= 1000),
    seconds     integer not null check (seconds >= 0 and seconds <= 900)
);
alter table public.fish_notes enable row level security;
revoke all on public.fish_notes from anon, authenticated;
grant select, insert on public.fish_notes to authenticated;
create policy "Family can read fish_notes" on public.fish_notes for select to authenticated using (true);
create policy "Family can add fish_notes" on public.fish_notes for insert to authenticated with check (true);
insert into public.app_table_registry (app, object_name, object_type, access, description, repo)
values ('fishes', 'fish_notes', 'table', 'owner', 'test', 'ShimmyCane/Index')
on conflict (app, object_name) do nothing;
$sql$;

  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f002","role":"authenticated"}', true);

  insert into public.fish_notes (note, level, size, seconds) values ('test note', 9, 14.0, 152);
  select count(*) into saved_count from public.fish_notes;

  begin
    insert into public.fish_notes (note, level, size, seconds) values ('', 99, 1, 1);
  exception when check_violation then constraint_hit := true;
  end;

  begin
    delete from public.fish_notes;
  exception when insufficient_privilege then delete_denied := true;
  end;

  reset role;
  set local role anon;
  begin
    perform 1 from public.fish_notes;
  exception when insufficient_privilege then anon_denied := true;
  end;
  reset role;

  raise exception 'RESULT (rolled back): note_saved=% bad_row_rejected=% delete_denied=% anon_denied=%',
    (saved_count = 1), constraint_hit, delete_denied, anon_denied;
end $$;
