-- Migration 030: profile enrichment — UG degree + domain-of-interest fields
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS ug_degree TEXT,
  ADD COLUMN IF NOT EXISTS domain_1  TEXT,
  ADD COLUMN IF NOT EXISTS domain_2  TEXT;

COMMENT ON COLUMN profiles.ug_degree IS 'Free-text undergraduate degree, e.g. "B.Tech CS, IIT Delhi"';
COMMENT ON COLUMN profiles.domain_1  IS 'Primary domain of interest (FUNCTION_TAGS value)';
COMMENT ON COLUMN profiles.domain_2  IS 'Secondary domain of interest (FUNCTION_TAGS value)';
