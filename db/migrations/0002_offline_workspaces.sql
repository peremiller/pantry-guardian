-- Apply only to the existing durable D1 database after reviewing deployment
-- configuration. No code path creates or alters production tables implicitly.
CREATE TABLE IF NOT EXISTS pantry_offline_workspaces (
  owner TEXT PRIMARY KEY NOT NULL,
  state TEXT NOT NULL,
  revision TEXT NOT NULL
);
