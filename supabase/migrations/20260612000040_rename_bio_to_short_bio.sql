-- Migration 040: rename bio → short_bio across profiles table
ALTER TABLE profiles RENAME COLUMN bio TO short_bio;
