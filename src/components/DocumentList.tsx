import { useEffect, useState } from "react";
import { FileText, Link, Trash2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Document {
  id: string;
  title: string;
  source_type: string;
  source_url: string | null;
  created_at: string;
  summary: string | null;
  chunk_count?: number;
}

interface DocumentListProps {
  refreshTrigger: number;
  selectedDocumentId?: string;
  onSelectDocument?: (id: string) => void;
}

export function DocumentList({ refreshTrigger, selectedDocumentId, onSelectDocument }: DocumentListProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchDocuments = async () => {
    setIsLoading(true);
    try {
      // Fetch documents with chunk counts
      const { data: docs, error: docsError } = await supabase
        .from("documents")
        .select("id, title, source_type, source_url, created_at, summary")
        .order("created_at", { ascending: false });

      if (docsError) throw docsError;

      // Get chunk counts for each document
      const docsWithCounts = await Promise.all(
        (docs || []).map(async (doc) => {
          const { count } = await supabase
            .from("document_chunks")
            .select("*", { count: "exact", head: true })
            .eq("document_id", doc.id);
          return { ...doc, chunk_count: count || 0 };
        })
      );

      setDocuments(docsWithCounts);
    } catch (error) {
      console.error("Error fetching documents:", error);
      toast({
        title: "Error",
        description: "Failed to fetch documents",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [refreshTrigger]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    console.log("[DocumentList] delete start", { id });

    try {
      // Delete chunks first to avoid FK constraint errors
      const { data: deletedChunks, error: chunksError } = await supabase
        .from("document_chunks")
        .delete()
        .eq("document_id", id)
        .select("id");
      if (chunksError) throw chunksError;

      const { data: deletedDocs, error: docError } = await supabase
        .from("documents")
        .delete()
        .eq("id", id)
        .select("id");
      if (docError) throw docError;

      // Some backends may respond with 204/no body even if the delete succeeded.
      // If we didn't get rows back, verify by checking if the document still exists.
      let docDeleted = (deletedDocs?.length ?? 0) > 0;
      if (!docDeleted) {
        const { data: stillThere, error: checkError } = await supabase
          .from("documents")
          .select("id")
          .eq("id", id)
          .maybeSingle();
        if (checkError) throw checkError;
        docDeleted = !stillThere;
      }

      if (!docDeleted) {
        toast({
          title: "Delete failed",
          description:
            "The document could not be removed. Please log in and try again.",
          variant: "destructive",
        });
        return;
      }

      await fetchDocuments();

      toast({
        title: "Document deleted",
        description: `Removed document and ${deletedChunks?.length ?? 0} chunk(s).`,
      });
    } catch (error) {
      const details =
        error && typeof error === "object"
          ? JSON.stringify(error, Object.getOwnPropertyNames(error))
          : String(error);

      console.error("[DocumentList] delete failed", error);
      toast({
        title: "Delete failed",
        description: details,
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const getSourceIcon = (sourceType: string) => {
    switch (sourceType) {
      case "url":
        return <Link className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No documents yet</p>
        <p className="text-xs mt-1">Upload documents to get started</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Your Documents</h3>
        <Button
          variant="ghost"
          size="icon"
          className="w-6 h-6"
          onClick={fetchDocuments}
        >
          <RefreshCw className="w-3 h-3" />
        </Button>
      </div>
      <ScrollArea className="h-[300px] w-full">
        <div className="space-y-2 pr-8">
          {documents.map((doc) => (
            <div
              key={doc.id}
              onClick={() => onSelectDocument?.(doc.id === selectedDocumentId ? "all" : doc.id)}
              className={cn(
                "doc-card w-full p-3 rounded-lg border cursor-pointer transition-colors",
                doc.id === selectedDocumentId
                  ? "bg-primary/10 border-primary/50 ring-1 ring-primary/30"
                  : "bg-muted/30 border-border/50 hover:bg-muted/50"
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-start gap-2 min-w-0 flex-1">
                  <span className="text-primary mt-0.5 shrink-0">
                    {getSourceIcon(doc.source_type)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate" title={doc.title}>
                      {doc.title}
                    </p>
                    {doc.summary && (
                      <p className="text-xs text-muted-foreground/80 mt-0.5 line-clamp-2">
                        {doc.summary}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {doc.chunk_count} chunks • {formatDate(doc.created_at)}
                    </p>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="w-8 h-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(doc.id)}
                  disabled={deletingId === doc.id}
                  aria-label={`Delete ${doc.title}`}
                >
                  {deletingId === doc.id ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
