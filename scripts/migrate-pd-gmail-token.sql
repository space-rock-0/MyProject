CREATE TABLE IF NOT EXISTS career_ops_pd_gmail_tokens (
  singleton boolean PRIMARY KEY DEFAULT TRUE CHECK (singleton = TRUE),
  oauth_token jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
