CREATE TABLE IF NOT EXISTS users (
  address TEXT PRIMARY KEY,
  displayName TEXT,
  bio TEXT,
  avatarCid TEXT,
  createdAt BIGINT NOT NULL,
  updatedAt BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_nonces (
  address TEXT NOT NULL,
  nonce TEXT NOT NULL,
  expiresAt BIGINT NOT NULL,
  createdAt BIGINT NOT NULL,
  consumedAt BIGINT,
  PRIMARY KEY (address, nonce)
);

CREATE INDEX IF NOT EXISTS idx_auth_nonces_address ON auth_nonces(address);
CREATE INDEX IF NOT EXISTS idx_auth_nonces_expiresat ON auth_nonces(expiresAt);

CREATE TABLE IF NOT EXISTS conversations (
  id BIGSERIAL PRIMARY KEY,
  listingId TEXT,
  createdBy TEXT NOT NULL,
  createdAt BIGINT NOT NULL,
  updatedAt BIGINT NOT NULL,
  FOREIGN KEY(listingId) REFERENCES listings(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_conversations_listingid ON conversations(listingId);
CREATE INDEX IF NOT EXISTS idx_conversations_updatedat ON conversations(updatedAt DESC);

CREATE TABLE IF NOT EXISTS conversation_participants (
  conversationId BIGINT NOT NULL,
  participant TEXT NOT NULL,
  createdAt BIGINT NOT NULL,
  PRIMARY KEY (conversationId, participant),
  FOREIGN KEY(conversationId) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conversation_participants_participant ON conversation_participants(participant);

CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  conversationId BIGINT NOT NULL,
  sender TEXT NOT NULL,
  body TEXT NOT NULL,
  createdAt BIGINT NOT NULL,
  FOREIGN KEY(conversationId) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_conversationid_createdat ON messages(conversationId, createdAt DESC, id DESC);