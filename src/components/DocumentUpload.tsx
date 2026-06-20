import { useState, useRef } from "react";
import { Upload, Link, FileText, Loader2, X, CheckCircle, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ingestDocument, fetchUrlContent, extractHandwriting } from "@/lib/rag-api";

interface DocumentUploadProps {
  onUploadComplete: () => void;
}

export function DocumentUpload({ onUploadComplete }: DocumentUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [textTitle, setTextTitle] = useState("");
  const [textContent, setTextContent] = useState("");
  const [url, setUrl] = useState("");
  const [handwritingTitle, setHandwritingTitle] = useState("");
  const [uploadResult, setUploadResult] = useState<{
    title: string;
    chunks: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handwritingInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleTextUpload = async () => {
    if (!textTitle.trim() || !textContent.trim()) {
      toast({
        title: "Missing information",
        description: "Please provide both a title and content.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      const result = await ingestDocument(textTitle, textContent, "text");
      setUploadResult({ title: textTitle, chunks: result.chunksCreated });
      setTextTitle("");
      setTextContent("");
      toast({
        title: "Document uploaded",
        description: `Created ${result.chunksCreated} chunks from "${textTitle}"`,
      });
      onUploadComplete();
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleUrlUpload = async () => {
    if (!url.trim()) {
      toast({
        title: "Missing URL",
        description: "Please enter a URL to fetch.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      // Fetch URL content
      const urlData = await fetchUrlContent(url);
      
      // Ingest the content
      const result = await ingestDocument(
        urlData.title,
        urlData.content,
        "url",
        urlData.url
      );
      
      setUploadResult({ title: urlData.title, chunks: result.chunksCreated });
      setUrl("");
      toast({
        title: "URL content ingested",
        description: `Created ${result.chunksCreated} chunks from "${urlData.title}"`,
      });
      onUploadComplete();
    } catch (error) {
      toast({
        title: "URL fetch failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const loadPdfJs = (): Promise<any> => {
    return new Promise((resolve, reject) => {
      if ((window as any).pdfjsLib) {
        resolve((window as any).pdfjsLib);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      script.onload = () => {
        const lib = (window as any).pdfjsLib;
        if (lib) {
          lib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
          resolve(lib);
        } else {
          reject(new Error("pdf.js failed to load"));
        }
      };
      script.onerror = () => reject(new Error("Failed to load pdf.js from CDN"));
      document.head.appendChild(script);
    });
  };

  const renderPdfPagesToImages = async (file: File, maxPages = 20): Promise<string[]> => {
    const pdfjsLib = await loadPdfJs();
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const images: string[] = [];
    const total = Math.min(pdf.numPages, maxPages);
    for (let i = 1; i <= total; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      await page.render({ canvasContext: ctx, viewport }).promise;
      images.push(canvas.toDataURL("image/jpeg", 0.85));
    }
    return images;
  };

  const extractPdfText = async (file: File): Promise<string> => {
    const pdfjsLib = await loadPdfJs();

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const textParts: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item: any) => item.str)
        .join(" ");
      if (pageText.trim()) {
        textParts.push(pageText);
      }
    }

    const fullText = textParts.join("\n\n");
    if (fullText.trim().length < 20) {
      // Fallback: scanned / handwritten PDF — OCR pages via vision model.
      toast({
        title: "Scanned PDF detected",
        description: "Running handwriting/OCR on pages — this can take a moment...",
      });
      const images = await renderPdfPagesToImages(file);
      if (images.length === 0) {
        throw new Error("Could not render PDF pages for OCR.");
      }
      const ocrText = await extractHandwriting(images);
      if (ocrText.trim().length < 20) {
        throw new Error("OCR could not read this PDF.");
      }
      return ocrText;
    }
    return fullText;
  };

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });

  const handleHandwritingUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const invalid = files.find((f) => !f.type.startsWith("image/"));
    if (invalid) {
      toast({
        title: "Unsupported file",
        description: "Please upload image files only (JPG, PNG, WEBP, HEIC).",
        variant: "destructive",
      });
      if (handwritingInputRef.current) handwritingInputRef.current.value = "";
      return;
    }

    const title = handwritingTitle.trim() || files[0].name.replace(/\.[^.]+$/, "") || "Handwritten note";

    setIsUploading(true);
    try {
      const images = await Promise.all(files.map(fileToDataUrl));
      const text = await extractHandwriting(images);
      const result = await ingestDocument(title, text, "text");
      setUploadResult({ title, chunks: result.chunksCreated });
      setHandwritingTitle("");
      toast({
        title: "Handwriting transcribed",
        description: `Created ${result.chunksCreated} chunks from "${title}"`,
      });
      onUploadComplete();
    } catch (error) {
      toast({
        title: "Handwriting OCR failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (handwritingInputRef.current) handwritingInputRef.current.value = "";
    }
  };


  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isPdf = file.type === "application/pdf" || file.name.endsWith(".pdf");
    const isText = file.type.includes("text") || file.name.endsWith(".txt") || file.name.endsWith(".md");

    if (!isPdf && !isText) {
      toast({
        title: "Unsupported file type",
        description: "Supported formats: PDF, TXT, MD",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      let content: string;

      if (isPdf) {
        content = await extractPdfText(file);
      } else {
        content = await file.text();
        if (!content.trim()) {
          throw new Error("No text content found in file");
        }
      }

      // Always send as "text" since we extracted text client-side
      const result = await ingestDocument(file.name, content, isPdf ? "pdf" : "text");
      setUploadResult({ title: file.name, chunks: result.chunksCreated });
      toast({
        title: isPdf ? "PDF uploaded" : "File uploaded",
        description: `Created ${result.chunksCreated} chunks from "${file.name}"`,
      });
      onUploadComplete();
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="glass-card p-4">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Upload className="w-4 h-4 text-primary" />
        Add Documents
      </h3>

      {uploadResult && (
        <div className="mb-4 p-3 rounded-lg bg-success/10 border border-success/20 flex items-start gap-2">
          <CheckCircle className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-success">Upload successful</p>
            <p className="text-xs text-muted-foreground truncate">
              {uploadResult.title} • {uploadResult.chunks} chunks
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="w-6 h-6 text-muted-foreground hover:text-foreground"
            onClick={() => setUploadResult(null)}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      )}

      <Tabs defaultValue="text" className="w-full">
        <TabsList className="w-full grid grid-cols-4 bg-muted/50">
          <TabsTrigger value="text" className="text-xs">
            <FileText className="w-3 h-3 mr-1" />
            Text
          </TabsTrigger>
          <TabsTrigger value="file" className="text-xs">
            <Upload className="w-3 h-3 mr-1" />
            File
          </TabsTrigger>
          <TabsTrigger value="handwriting" className="text-xs">
            <PenLine className="w-3 h-3 mr-1" />
            Notes
          </TabsTrigger>
          <TabsTrigger value="url" className="text-xs">
            <Link className="w-3 h-3 mr-1" />
            URL
          </TabsTrigger>
        </TabsList>

        <TabsContent value="text" className="space-y-3 mt-3">
          <Input
            placeholder="Document title"
            value={textTitle}
            onChange={(e) => setTextTitle(e.target.value)}
            disabled={isUploading}
          />
          <Textarea
            placeholder="Paste your document content here..."
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            disabled={isUploading}
            className="min-h-[100px] resize-none"
          />
          <Button
            onClick={handleTextUpload}
            disabled={isUploading || !textTitle.trim() || !textContent.trim()}
            className="w-full"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              "Add Document"
            )}
          </Button>
        </TabsContent>

        <TabsContent value="file" className="mt-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.md,application/pdf,text/*"
            onChange={handleFileUpload}
            className="hidden"
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="w-full h-20 border-dashed"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <Upload className="w-5 h-5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  Click to upload PDF, TXT, or MD files
                </span>
              </div>
            )}
          </Button>
        </TabsContent>

        <TabsContent value="url" className="space-y-3 mt-3">
          <Input
            placeholder="https://example.com/article"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={isUploading}
            type="url"
          />
          <Button
            onClick={handleUrlUpload}
            disabled={isUploading || !url.trim()}
            className="w-full"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Fetching...
              </>
            ) : (
              "Fetch & Add"
            )}
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}
