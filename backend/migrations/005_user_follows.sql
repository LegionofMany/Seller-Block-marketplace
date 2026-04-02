CREATE TABLE IF NOT EXISTS user_follows (
  follower TEXT NOT NULL,
  followed TEXT NOT NULL,
  createdAt BIGINT NOT NULL,
  PRIMARY KEY (follower, followed),
  CHECK (follower <> followed),
  FOREIGN KEY(follower) REFERENCES users(address) ON DELETE CASCADE,
  FOREIGN KEY(followed) REFERENCES users(address) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_follows_followed ON user_follows(followed, createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_user_follows_follower ON user_follows(follower, createdAt DESC);