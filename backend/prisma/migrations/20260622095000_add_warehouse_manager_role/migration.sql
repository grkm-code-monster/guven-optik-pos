-- Add new Role enum value: WAREHOUSE_MANAGER
-- Needed for transfer authorization (admin + transfer flows)

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'WAREHOUSE_MANAGER';

