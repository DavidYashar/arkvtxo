-- RenameIndex
DO $$
BEGIN
	-- This migration was created to align index naming with Prisma's default naming.
	-- Depending on migration ordering, the original index may not exist yet.
	IF to_regclass('public.idempotency_key_route_scope') IS NOT NULL
		 AND to_regclass('public.idempotency_keys_key_route_scope_key') IS NULL THEN
		ALTER INDEX "idempotency_key_route_scope" RENAME TO "idempotency_keys_key_route_scope_key";
	END IF;
END $$;
