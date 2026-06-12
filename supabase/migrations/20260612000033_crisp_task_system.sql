-- Migration 033: CRISP task system
CREATE TABLE IF NOT EXISTS tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title        TEXT NOT NULL CHECK (length(trim(title)) >= 3),
  description  TEXT,
  deadline     TIMESTAMPTZ NOT NULL,
  scope        TEXT NOT NULL DEFAULT 'all' CHECK (scope IN ('all', 'specific')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS task_assignments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  junior_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'not_started'
             CHECK (status IN ('not_started', 'in_process', 'completed')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, junior_id)
);

CREATE OR REPLACE FUNCTION task_assignments_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER task_assignments_updated_at
  BEFORE UPDATE ON task_assignments
  FOR EACH ROW EXECUTE FUNCTION task_assignments_set_updated_at();

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crisp_create_tasks" ON tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    creator_id = auth.uid()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_crisp = true)
  );

CREATE POLICY "crisp_read_own_tasks" ON tasks
  FOR SELECT TO authenticated
  USING (
    creator_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM task_assignments
      WHERE task_id = tasks.id AND junior_id = auth.uid()
    )
  );

CREATE POLICY "crisp_update_own_tasks" ON tasks
  FOR UPDATE TO authenticated
  USING (creator_id = auth.uid())
  WITH CHECK (creator_id = auth.uid());

CREATE POLICY "crisp_delete_own_tasks" ON tasks
  FOR DELETE TO authenticated
  USING (creator_id = auth.uid());

CREATE POLICY "crisp_manage_assignments" ON task_assignments
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM tasks WHERE id = task_id AND creator_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM tasks WHERE id = task_id AND creator_id = auth.uid())
  );

CREATE POLICY "junior_read_own_assignments" ON task_assignments
  FOR SELECT TO authenticated
  USING (junior_id = auth.uid());

CREATE POLICY "junior_update_own_status" ON task_assignments
  FOR UPDATE TO authenticated
  USING (junior_id = auth.uid())
  WITH CHECK (junior_id = auth.uid());

CREATE OR REPLACE FUNCTION create_task(
  p_title       TEXT,
  p_description TEXT DEFAULT NULL,
  p_deadline    TIMESTAMPTZ DEFAULT NULL,
  p_scope       TEXT DEFAULT 'all',
  p_junior_ids  UUID[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_task_id UUID;
  v_count   INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_crisp = true) THEN
    RETURN jsonb_build_object('error', 'Forbidden: CRISP only');
  END IF;
  IF p_deadline IS NULL THEN
    RETURN jsonb_build_object('error', 'deadline is required');
  END IF;
  INSERT INTO tasks (creator_id, title, description, deadline, scope)
  VALUES (auth.uid(), trim(p_title), p_description, p_deadline, p_scope)
  RETURNING id INTO v_task_id;
  IF p_scope = 'all' THEN
    INSERT INTO task_assignments (task_id, junior_id)
    SELECT v_task_id, p.id
    FROM   profiles p
    WHERE  p.mentor_id = auth.uid()
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSIF p_scope = 'specific' AND p_junior_ids IS NOT NULL THEN
    INSERT INTO task_assignments (task_id, junior_id)
    SELECT v_task_id, unnest(p_junior_ids)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSE
    v_count := 0;
  END IF;
  RETURN jsonb_build_object('ok', true, 'task_id', v_task_id, 'assigned_count', v_count);
END;
$$;

CREATE OR REPLACE FUNCTION update_task_status(
  p_task_id UUID,
  p_status  TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF p_status NOT IN ('not_started', 'in_process', 'completed') THEN
    RETURN jsonb_build_object('error', 'Invalid status');
  END IF;
  UPDATE task_assignments
  SET status = p_status
  WHERE task_id = p_task_id AND junior_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Assignment not found');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;
