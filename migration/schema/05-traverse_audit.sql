-- target: traverse_audit
-- Database exists after 01-create-databases.sh. Tables are created by
-- audit-service EnsureCreated() (hash-chained audit.immutable_events).
-- This file only grants so a dedicated role can use the DB before first boot.

GRANT ALL ON SCHEMA public TO CURRENT_USER;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ams_user') THEN
        GRANT ALL ON SCHEMA public TO ams_user;
        GRANT ALL ON ALL TABLES IN SCHEMA public TO ams_user;
        GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ams_user;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ams_user;
    END IF;
    RAISE NOTICE 'traverse_audit grants applied; tables come from audit-service';
END $$;
