PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  pin_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TEXT NOT NULL,
  last_active_at TEXT,
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  ip_hash TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE images (
  id TEXT PRIMARY KEY,
  r2_key_original TEXT NOT NULL,
  r2_key_display TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden')),
  uploaded_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX idx_images_status_sort_order ON images(status, sort_order, created_at);

CREATE TABLE vote_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  winner_image_id TEXT NOT NULL,
  loser_image_id TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT 'shared_pool_vote' CHECK (context IN ('shared_pool_vote')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (winner_image_id) REFERENCES images(id) ON DELETE CASCADE,
  FOREIGN KEY (loser_image_id) REFERENCES images(id) ON DELETE CASCADE,
  CHECK (winner_image_id <> loser_image_id)
);

CREATE INDEX idx_vote_events_user_id_created_at ON vote_events(user_id, created_at DESC);
CREATE INDEX idx_vote_events_created_at ON vote_events(created_at DESC);
CREATE INDEX idx_vote_events_winner_image_id ON vote_events(winner_image_id);
CREATE INDEX idx_vote_events_loser_image_id ON vote_events(loser_image_id);

CREATE TABLE personal_image_state (
  user_id TEXT NOT NULL,
  image_id TEXT NOT NULL,
  rating REAL NOT NULL DEFAULT 1200,
  comparisons INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 0,
  last_compared_at TEXT,
  PRIMARY KEY (user_id, image_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
);

CREATE INDEX idx_personal_image_state_user_id_rating
  ON personal_image_state(user_id, rating DESC);
CREATE INDEX idx_personal_image_state_user_id_last_compared_at
  ON personal_image_state(user_id, last_compared_at);

CREATE TABLE shared_image_state (
  image_id TEXT PRIMARY KEY,
  aggregate_score REAL NOT NULL DEFAULT 0,
  rank_position INTEGER,
  effective_voter_weight REAL NOT NULL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
);

CREATE INDEX idx_shared_image_state_rank_position ON shared_image_state(rank_position);
CREATE INDEX idx_shared_image_state_score ON shared_image_state(aggregate_score DESC);

CREATE TABLE user_state (
  user_id TEXT PRIMARY KEY,
  total_votes_cast INTEGER NOT NULL DEFAULT 0,
  ranking_confidence REAL NOT NULL DEFAULT 0,
  recent_pair_cache TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE auth_attempts (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL,
  blocked_until TEXT
);

CREATE INDEX idx_auth_attempts_blocked_until ON auth_attempts(blocked_until);
