-- Phase 0: Safety baseline (reports + blocks)

CREATE TABLE IF NOT EXISTS user_blocks (
  blocker TEXT NOT NULL,
  blocked TEXT NOT NULL,
  createdAt BIGINT NOT NULL,
  signature TEXT NOT NULL,
  message TEXT NOT NULL,
  PRIMARY KEY (blocker, blocked)
);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON user_blocks(blocker);

CREATE TABLE IF NOT EXISTS reports (
  id BIGSERIAL PRIMARY KEY,
  reporter TEXT,
  targetType TEXT NOT NULL,
  targetId TEXT NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  createdAt BIGINT NOT NULL,
  reporterIp TEXT
);

CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(targetType, targetId);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports(reporter);
