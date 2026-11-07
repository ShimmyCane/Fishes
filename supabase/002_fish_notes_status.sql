-- Fishes: status for feedback notes (Family Supabase project).
-- Statuses: 'start' (dashed circle: start anew), 'testing' (yellow check: being tested), 'done' (green check).
-- The signed-in family account may change ONLY the status column, not the note text.
-- Apply after test_002_fish_notes_status_rollback.sql returns its RESULT line.

alter table public.fish_notes
    add column if not exists status text not null default 'start'
    check (status in ('start', 'testing', 'done'));

grant update (status) on public.fish_notes to authenticated;

create policy "Family can update fish_notes status" on public.fish_notes
    for update to authenticated using (true) with check (true);
