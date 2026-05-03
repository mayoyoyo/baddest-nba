create table if not exists users (
  id text primary key,
  username text not null unique,
  pin_hash text not null,
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz not null,
  last_active_at timestamptz,
  failed_login_count integer not null default 0,
  locked_until timestamptz
);

create table if not exists sessions (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null,
  ip_hash text
);

create index if not exists idx_sessions_user_id on sessions(user_id);
create index if not exists idx_sessions_expires_at on sessions(expires_at);

create table if not exists images (
  id text primary key,
  r2_key_original text not null,
  r2_key_display text not null,
  width integer not null,
  height integer not null,
  mime_type text not null,
  sort_order integer not null default 0,
  status text not null default 'active' check (status in ('active', 'hidden')),
  uploaded_by text not null references users(id) on delete restrict,
  created_at timestamptz not null
);

create index if not exists idx_images_status_sort_order
  on images(status, sort_order, created_at);

create table if not exists vote_events (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  winner_image_id text not null references images(id) on delete cascade,
  loser_image_id text not null references images(id) on delete cascade,
  context text not null default 'shared_pool_vote' check (context in ('shared_pool_vote')),
  created_at timestamptz not null,
  check (winner_image_id <> loser_image_id)
);

create index if not exists idx_vote_events_user_id_created_at
  on vote_events(user_id, created_at desc);
create index if not exists idx_vote_events_created_at
  on vote_events(created_at desc);
create index if not exists idx_vote_events_winner_image_id
  on vote_events(winner_image_id);
create index if not exists idx_vote_events_loser_image_id
  on vote_events(loser_image_id);

create table if not exists personal_image_state (
  user_id text not null references users(id) on delete cascade,
  image_id text not null references images(id) on delete cascade,
  rating double precision not null default 1200,
  comparisons integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  confidence double precision not null default 0,
  last_compared_at timestamptz,
  primary key (user_id, image_id)
);

create index if not exists idx_personal_image_state_user_id_rating
  on personal_image_state(user_id, rating desc);
create index if not exists idx_personal_image_state_user_id_last_compared_at
  on personal_image_state(user_id, last_compared_at);

create table if not exists shared_image_state (
  image_id text primary key references images(id) on delete cascade,
  aggregate_score double precision not null default 0,
  rank_position integer,
  effective_voter_weight double precision not null default 0,
  confidence double precision not null default 0,
  updated_at timestamptz not null
);

create index if not exists idx_shared_image_state_rank_position
  on shared_image_state(rank_position);
create index if not exists idx_shared_image_state_score
  on shared_image_state(aggregate_score desc);

create table if not exists user_state (
  user_id text primary key references users(id) on delete cascade,
  total_votes_cast integer not null default 0,
  ranking_confidence double precision not null default 0,
  recent_pair_cache text,
  updated_at timestamptz not null
);

create table if not exists auth_attempts (
  key text primary key,
  attempts integer not null default 0,
  window_started_at timestamptz not null,
  blocked_until timestamptz
);

create index if not exists idx_auth_attempts_blocked_until
  on auth_attempts(blocked_until);
