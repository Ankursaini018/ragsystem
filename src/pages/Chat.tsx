import { useState } from "react";
import { Link } from "react-router-dom";
import { RAGChat } from "@/components/RAGChat";
import { DocumentUpload } from "@/components/DocumentUpload";
import { DocumentList } from "@/components/DocumentList";
import { Database, Menu, X, Home, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const Chat = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleUploadComplete = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  return (
    <div className="flex h-screen bg-gradient-dark overflow-hidden">
      {/* Background glow effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
      </div>

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:relative z-20 h-full min-w-0 overflow-hidden bg-sidebar border-r border-sidebar-border transition-all duration-300 will-change-transform",
          sidebarOpen ? "w-80 translate-x-0" : "w-0 -translate-x-[20rem]"
        )}
      >
        <div className="flex flex-col h-full w-full overflow-hidden">
          {/* Sidebar header */}
          <div className="p-4 border-b border-sidebar-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Database className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h1 className="font-semibold text-sm">RAG System</h1>
                  <p className="text-xs text-muted-foreground">Knowledge Base</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setSidebarOpen(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Sidebar content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <DocumentUpload onUploadComplete={handleUploadComplete} />
            <div className="glass-card p-4">
              <DocumentList refreshTrigger={refreshTrigger} />
            </div>
          </div>

          {/* Sidebar footer */}
          <div className="p-4 border-t border-sidebar-border">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="w-3 h-3 text-primary" />
              <span>Powered by Lovable AI</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-10 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 relative z-0">
        {/* Header */}
        <header className="relative z-30 flex items-center justify-between p-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <Menu className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="font-semibold">
                <span className="text-gradient">RAG Assistant</span>
              </h1>
              <p className="text-xs text-muted-foreground">
                Ask questions about your documents
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/">
              <Button variant="ghost" size="sm" className="gap-2">
                <Home className="w-4 h-4" />
                Home
              </Button>
            </Link>
          </div>
        </header>

        {/* Chat area */}
        <div className="flex-1 overflow-hidden">
          <RAGChat />
        </div>
      </main>
    </div>
  );
};

export default Chat;
