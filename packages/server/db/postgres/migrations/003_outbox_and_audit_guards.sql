ALTER TABLE outbox_messages ADD COLUMN max_attempts integer NOT NULL DEFAULT 10;
ALTER TABLE outbox_messages ADD CONSTRAINT outbox_max_attempts_positive
  CHECK (max_attempts > 0);

CREATE OR REPLACE FUNCTION reject_admin_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_log is append-only';
END;
$$;

CREATE TRIGGER admin_audit_log_append_only
BEFORE UPDATE OR DELETE ON admin_audit_log
FOR EACH ROW EXECUTE FUNCTION reject_admin_audit_mutation();
