CREATE TABLE IF NOT EXISTS email_auth_tokens (
  tokenhash TEXT PRIMARY KEY,
  useraddress TEXT NOT NULL REFERENCES users(address) ON DELETE CASCADE,
  email TEXT NOT NULL,
  purpose TEXT NOT NULL,
  expiresat BIGINT NOT NULL,
  createdat BIGINT NOT NULL,
  consumedat BIGINT,
  metadatajson TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_email_auth_tokens_useraddress_createdat ON email_auth_tokens(useraddress, createdat DESC);
CREATE INDEX IF NOT EXISTS idx_email_auth_tokens_email_purpose_createdat ON email_auth_tokens(email, purpose, createdat DESC);
