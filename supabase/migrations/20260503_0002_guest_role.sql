-- Allow 'guest' as a third user role. Guests are lazily created on
-- their first vote, hold their own ELO history, and are filtered out
-- of the shared leaderboard. On signup they get promoted in place
-- (role flips to 'user'), preserving every vote.

alter table users drop constraint users_role_check;
alter table users
  add constraint users_role_check
  check (role in ('admin', 'user', 'guest'));

-- pin_hash stays NOT NULL; guests get a sentinel value 'guest:no-login'
-- that cannot match any real PIN hash, so the login path naturally
-- rejects them.
