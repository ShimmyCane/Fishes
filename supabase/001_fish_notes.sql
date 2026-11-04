-- Fishes: feedback notes table (Family Supabase project).
-- Apply by hand after test_001_fish_notes_rollback.sql returns its RESULT line.
-- Family-only: anon has no access, and only signed-in family members can read or add notes.

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

create policy "Family can read fish_notes" on public.fish_notes
    for select to authenticated using (true);
create policy "Family can add fish_notes" on public.fish_notes
    for insert to authenticated with check (true);

insert into public.app_table_registry (app, object_name, object_type, access, description, repo)
values ('fishes', 'fish_notes', 'table', 'owner',
        'Feedback notes from the Fishes game: text, level, size, seconds into the run.',
        'ShimmyCane/Index')
on conflict (app, object_name) do nothing;
