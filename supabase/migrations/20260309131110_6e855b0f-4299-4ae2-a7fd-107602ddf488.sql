
-- Add user_id to documents (nullable for backward compatibility with existing docs)
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id to chat_sessions
ALTER TABLE public.chat_sessions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Drop existing permissive policies
DROP POLICY IF EXISTS "Public documents access" ON public.documents;
DROP POLICY IF EXISTS "Public chunks access" ON public.document_chunks;
DROP POLICY IF EXISTS "Public sessions access" ON public.chat_sessions;
DROP POLICY IF EXISTS "Public messages access" ON public.chat_messages;

-- Documents: users see only their own docs (+ docs with no user_id for legacy)
CREATE POLICY "Users can view own documents" ON public.documents
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users can insert own documents" ON public.documents
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own documents" ON public.documents
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own documents" ON public.documents
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- Anon users can view documents with no user_id (guest/demo)
CREATE POLICY "Anon can view unowned documents" ON public.documents
  FOR SELECT TO anon
  USING (user_id IS NULL);

CREATE POLICY "Anon can insert unowned documents" ON public.documents
  FOR INSERT TO anon
  WITH CHECK (user_id IS NULL);

CREATE POLICY "Anon can delete unowned documents" ON public.documents
  FOR DELETE TO anon
  USING (user_id IS NULL);

-- Document chunks: inherit access from parent document
CREATE POLICY "Users can view chunks of own documents" ON public.document_chunks
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_id AND (d.user_id = auth.uid() OR d.user_id IS NULL)
    )
  );

CREATE POLICY "Users can insert chunks" ON public.document_chunks
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_id AND d.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete chunks of own documents" ON public.document_chunks
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_id AND d.user_id = auth.uid()
    )
  );

CREATE POLICY "Anon can view unowned chunks" ON public.document_chunks
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_id AND d.user_id IS NULL
    )
  );

CREATE POLICY "Anon can insert unowned chunks" ON public.document_chunks
  FOR INSERT TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_id AND d.user_id IS NULL
    )
  );

CREATE POLICY "Anon can delete unowned chunks" ON public.document_chunks
  FOR DELETE TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_id AND d.user_id IS NULL
    )
  );

-- Chat sessions: users see own sessions
CREATE POLICY "Users can manage own sessions" ON public.chat_sessions
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL)
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Anon can manage unowned sessions" ON public.chat_sessions
  FOR ALL TO anon
  USING (user_id IS NULL)
  WITH CHECK (user_id IS NULL);

-- Chat messages: inherit from session
CREATE POLICY "Users can manage own messages" ON public.chat_messages
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_sessions s
      WHERE s.id = session_id AND (s.user_id = auth.uid() OR s.user_id IS NULL)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_sessions s
      WHERE s.id = session_id AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Anon can manage unowned messages" ON public.chat_messages
  FOR ALL TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_sessions s
      WHERE s.id = session_id AND s.user_id IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_sessions s
      WHERE s.id = session_id AND s.user_id IS NULL
    )
  );
