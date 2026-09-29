-- Seed roles (system roles). Screens and grants come from code (permissions-sync).
BEGIN;

WITH role_seed(name) AS (
  VALUES
    ('super-admin'),
    ('owner'),
    ('back_office'),
    ('floor_supervisor'),
    ('operator'),
    ('qa_inspector'),
    ('die_designer')
)
INSERT INTO roles (name)
SELECT name
FROM role_seed
ON CONFLICT (name) DO NOTHING;

COMMIT;
