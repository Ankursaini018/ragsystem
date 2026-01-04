import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Database, MessageSquare, FileText, Search, Sparkles, ArrowRight, Upload, Brain, CheckCircle } from "lucide-react";
import { Scene3D } from "@/components/Scene3D";

const Landing = () => {
  return (
    <div className="min-h-screen bg-gradient-dark overflow-x-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 backdrop-blur-md bg-background/80">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Database className="w-4 h-4 text-primary" />
            </div>
            <span className="font-semibold text-gradient">RAG System</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#home" className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:block">Home</a>
            <a href="#about" className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:block">About</a>
            <a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:block">How it Works</a>
            <Link to="/chat">
              <Button size="sm" className="gap-2">
                <MessageSquare className="w-4 h-4" />
                Start Chat
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section with 3D Background */}
      <section id="home" className="relative min-h-screen flex items-center justify-center">
        <Scene3D />
        
        <div className="relative z-10 text-center px-4 pt-20">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6 backdrop-blur-sm animate-fade-in">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm text-primary">AI-Powered Knowledge Base</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-bold mb-6 animate-fade-in" style={{ animationDelay: "0.1s" }}>
            <span className="text-gradient">Chat with Your</span>
            <br />
            <span className="text-gradient">Documents</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto animate-fade-in" style={{ animationDelay: "0.2s" }}>
            Upload your documents and get instant, accurate answers powered by advanced RAG technology. 
            Your personal AI assistant that understands your content.
          </p>
          <div className="flex items-center justify-center gap-4 animate-fade-in" style={{ animationDelay: "0.3s" }}>
            <Link to="/chat">
              <Button size="lg" className="gap-2 shadow-lg shadow-primary/25">
                Get Started <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <a href="#how-it-works">
              <Button variant="outline" size="lg" className="backdrop-blur-sm">
                Learn More
              </Button>
            </a>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 animate-bounce">
          <div className="w-6 h-10 rounded-full border-2 border-muted-foreground/30 flex justify-center pt-2">
            <div className="w-1 h-2 rounded-full bg-primary" />
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="relative z-10 py-24 px-4 border-t border-border/50 bg-background/95 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              <span className="text-gradient">About RAG System</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              A powerful Retrieval-Augmented Generation system that transforms how you interact with your documents.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="glass-card p-6 text-center group hover:scale-105 transition-transform duration-300">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4 group-hover:bg-primary/20 transition-colors">
                <FileText className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Multiple Formats</h3>
              <p className="text-muted-foreground text-sm">
                Support for PDF, TXT, and web URLs. Upload any document type and start chatting immediately.
              </p>
            </div>
            
            <div className="glass-card p-6 text-center group hover:scale-105 transition-transform duration-300">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4 group-hover:bg-primary/20 transition-colors">
                <Search className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Smart Search</h3>
              <p className="text-muted-foreground text-sm">
                Advanced semantic search finds the most relevant information from your documents instantly.
              </p>
            </div>
            
            <div className="glass-card p-6 text-center group hover:scale-105 transition-transform duration-300">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4 group-hover:bg-primary/20 transition-colors">
                <Brain className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">AI-Powered</h3>
              <p className="text-muted-foreground text-sm">
                Leverages cutting-edge AI to provide accurate, contextual answers with source citations.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section id="how-it-works" className="relative z-10 py-24 px-4 border-t border-border/50 bg-background/90 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              <span className="text-gradient">How it Works</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Get started in three simple steps
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="relative group">
              <div className="glass-card p-6 hover:scale-105 transition-transform duration-300">
                <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold mb-4">
                  1
                </div>
                <div className="flex items-center gap-3 mb-3">
                  <Upload className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-semibold">Upload Documents</h3>
                </div>
                <p className="text-muted-foreground text-sm">
                  Upload your PDF files, text documents, or paste URLs to web pages you want to analyze.
                </p>
              </div>
              <div className="hidden md:block absolute top-1/2 -right-4 w-8 h-0.5 bg-primary/30" />
            </div>
            
            <div className="relative group">
              <div className="glass-card p-6 hover:scale-105 transition-transform duration-300">
                <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold mb-4">
                  2
                </div>
                <div className="flex items-center gap-3 mb-3">
                  <Brain className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-semibold">AI Processing</h3>
                </div>
                <p className="text-muted-foreground text-sm">
                  Our AI automatically processes and indexes your documents, creating a searchable knowledge base.
                </p>
              </div>
              <div className="hidden md:block absolute top-1/2 -right-4 w-8 h-0.5 bg-primary/30" />
            </div>
            
            <div className="glass-card p-6 hover:scale-105 transition-transform duration-300">
              <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold mb-4">
                3
              </div>
              <div className="flex items-center gap-3 mb-3">
                <MessageSquare className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-semibold">Ask Questions</h3>
              </div>
              <p className="text-muted-foreground text-sm">
                Chat naturally with your documents. Get accurate answers with citations pointing to the source.
              </p>
            </div>
          </div>

          {/* Features list */}
          <div className="mt-16 glass-card p-8">
            <h3 className="text-xl font-semibold mb-6 text-center">Key Features</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                "Semantic search across all documents",
                "Source citations for every answer",
                "Support for PDF, TXT, and URLs",
                "Real-time document processing",
                "Confidence scores for answers",
                "Chat history preservation"
              ].map((feature, index) => (
                <div key={feature} className="flex items-center gap-3 animate-fade-in" style={{ animationDelay: `${index * 0.1}s` }}>
                  <CheckCircle className="w-5 h-5 text-primary flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">{feature}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative z-10 py-24 px-4 border-t border-border/50 bg-background/95 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
          <p className="text-muted-foreground mb-8">
            Upload your first document and experience the power of AI-driven document chat.
          </p>
          <Link to="/chat">
            <Button size="lg" className="gap-2 shadow-lg shadow-primary/25">
              Start Chatting Now <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/50 py-8 px-4 bg-background">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="w-4 h-4 text-primary" />
            <span>Powered by Lovable AI</span>
          </div>
          <div className="text-sm text-muted-foreground">
            © 2026 RAG System
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
