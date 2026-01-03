-- Add full-text search vector column to document_chunks
ALTER TABLE public.document_chunks ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Create index for full-text search
CREATE INDEX IF NOT EXISTS idx_chunks_search_vector ON public.document_chunks USING gin(search_vector);

-- Function to update search vector on insert/update
CREATE OR REPLACE FUNCTION public.update_chunk_search_vector()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', COALESCE(NEW.content, ''));
  RETURN NEW;
END;
$$;

-- Create trigger to auto-update search vector
DROP TRIGGER IF EXISTS chunks_search_vector_trigger ON public.document_chunks;
CREATE TRIGGER chunks_search_vector_trigger
  BEFORE INSERT OR UPDATE ON public.document_chunks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_chunk_search_vector();

-- Create full-text search function
CREATE OR REPLACE FUNCTION public.search_chunks_fulltext(
  search_query TEXT,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  content TEXT,
  chunk_index INTEGER,
  metadata JSONB,
  rank REAL
)
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dc.id,
    dc.document_id,
    dc.content,
    dc.chunk_index,
    dc.metadata,
    ts_rank(dc.search_vector, plainto_tsquery('english', search_query)) as rank
  FROM public.document_chunks dc
  WHERE dc.search_vector @@ plainto_tsquery('english', search_query)
  ORDER BY rank DESC
  LIMIT match_count;
END;
$$;