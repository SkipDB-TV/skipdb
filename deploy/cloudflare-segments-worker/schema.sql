-- One row per episode. `segments` is a JSON array of all approved segments for
-- that episode; the Worker picks the best per type at query time.
-- `intro_length_estimate_ms` is pre-computed during import (season-wide median).
-- `updated_at` tracks the max segment updated_at so incremental imports only
-- rewrite rows that actually changed.

CREATE TABLE IF NOT EXISTS episodes (
  key                      TEXT PRIMARY KEY,  -- "tt1234567:1:2" or "tt1234567" for movies
  imdb_id                  TEXT NOT NULL,
  season                   INTEGER,           -- NULL for movies
  episode                  INTEGER,           -- NULL for movies
  segments                 TEXT NOT NULL,     -- JSON: [{type,start_ms,end_ms,duration_ms,score,votes_up,votes_down}]
  intro_length_estimate_ms INTEGER,           -- NULL when fewer than 2 consistent samples exist
  updated_at               TEXT NOT NULL      -- max(segment.updated_at) ISO string for this episode
);
