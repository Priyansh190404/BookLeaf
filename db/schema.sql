-- BookLeaf Author Support Portal schema. Idempotent: safe to run repeatedly.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('author', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ticket_status AS ENUM ('Open', 'In Progress', 'Resolved', 'Closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ticket_priority AS ENUM ('Critical', 'High', 'Medium', 'Low');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ticket_category AS ENUM (
    'Royalty & Payments',
    'ISBN & Metadata Issues',
    'Printing & Quality',
    'Distribution & Availability',
    'Book Status & Production Updates',
    'General Inquiry'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Where a classification came from: the model, a keyword fallback, an admin, or not yet set.
DO $$ BEGIN
  CREATE TYPE triage_source AS ENUM ('ai', 'fallback', 'admin', 'pending');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Business profile of an author (from the BookLeaf dataset).
CREATE TABLE IF NOT EXISTS authors (
  id           TEXT PRIMARY KEY,               -- e.g. AUTH001
  name         TEXT NOT NULL,
  email        TEXT NOT NULL UNIQUE,
  phone        TEXT,
  city         TEXT,
  joined_date  DATE
);

-- Login identity. Admins have no author profile.
CREATE TABLE IF NOT EXISTS users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  role           user_role NOT NULL,
  name           TEXT NOT NULL,
  author_id      TEXT UNIQUE REFERENCES authors(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT author_role_has_profile CHECK ((role = 'author') = (author_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS books (
  id                        TEXT PRIMARY KEY,  -- e.g. BK001
  author_id                 TEXT NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
  title                     TEXT NOT NULL,
  isbn                      TEXT,
  genre                     TEXT,
  publication_date          DATE,              -- NULL while in production
  status                    TEXT NOT NULL,
  mrp                       INTEGER,           -- NULL until priced
  author_royalty_per_copy   INTEGER,
  total_copies_sold         INTEGER NOT NULL DEFAULT 0,
  total_royalty_earned      INTEGER NOT NULL DEFAULT 0,
  royalty_paid              INTEGER NOT NULL DEFAULT 0,
  royalty_pending           INTEGER NOT NULL DEFAULT 0,
  last_royalty_payout_date  DATE,
  print_partner             TEXT,
  available_on              TEXT[] NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_books_author ON books(author_id);

CREATE SEQUENCE IF NOT EXISTS ticket_number_seq START 1001;

CREATE TABLE IF NOT EXISTS tickets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number     INTEGER NOT NULL UNIQUE DEFAULT nextval('ticket_number_seq'),
  author_id         TEXT NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
  book_id           TEXT REFERENCES books(id) ON DELETE SET NULL,  -- NULL = General / Account Level
  subject           TEXT NOT NULL,
  description       TEXT NOT NULL,
  status            ticket_status NOT NULL DEFAULT 'Open',

  category          ticket_category,
  category_source   triage_source NOT NULL DEFAULT 'pending',
  priority          ticket_priority NOT NULL DEFAULT 'Medium',
  priority_source   triage_source NOT NULL DEFAULT 'pending',
  ai_rationale      TEXT,                           -- one-line "why" shown to admins

  assigned_to       UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Cached AI draft so reopening a ticket never re-bills the model.
  ai_draft          TEXT,
  ai_draft_at       TIMESTAMPTZ,
  ai_draft_msg_count INTEGER,                       -- thread length when drafted; detects staleness

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_tickets_author   ON tickets(author_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_queue    ON tickets(status, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_tickets_category ON tickets(category);

-- One table for the conversation AND internal notes; is_internal gates author visibility.
CREATE TABLE IF NOT EXISTS ticket_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  sender_id    UUID NOT NULL REFERENCES users(id),
  sender_role  user_role NOT NULL,
  body         TEXT NOT NULL,
  is_internal  BOOLEAN NOT NULL DEFAULT FALSE,
  ai_assisted  BOOLEAN NOT NULL DEFAULT FALSE,      -- reply started from an AI draft (for measuring draft usefulness)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT internal_only_admin CHECK (NOT is_internal OR sender_role = 'admin')
);
CREATE INDEX IF NOT EXISTS idx_messages_ticket ON ticket_messages(ticket_id, created_at);

-- Early versions stored only file names on the ticket; real files now live in ticket_attachments.
ALTER TABLE tickets DROP COLUMN IF EXISTS attachment_names;

-- Files are stored in Postgres (bytea) so uploads work on any host, including serverless with an
-- ephemeral filesystem. Capped at 5 MB x 5 files per ticket (see lib/attachments.ts). For
-- larger volumes, move `data` to S3/R2 and keep this table as the metadata index.
CREATE TABLE IF NOT EXISTS ticket_attachments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  uploaded_by  UUID NOT NULL REFERENCES users(id),
  filename     TEXT NOT NULL,
  mime_type    TEXT NOT NULL,
  size_bytes   INTEGER NOT NULL,
  data         BYTEA NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attachments_ticket ON ticket_attachments(ticket_id);
