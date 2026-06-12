-- Migration 032: add function_tag to slot_requests for domain enforcement
ALTER TABLE slot_requests
  ADD COLUMN IF NOT EXISTS function_tag TEXT;

COMMENT ON COLUMN slot_requests.function_tag IS
  'Domain for PI requests. NULL = any domain (typical for GDs). '
  'When set, only seniors whose domain_1 or domain_2 matches can express interest.';
