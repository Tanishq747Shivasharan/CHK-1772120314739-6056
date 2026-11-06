ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'volunteer';

ALTER TABLE profiles
  ALTER COLUMN organization_name DROP NOT NULL;
