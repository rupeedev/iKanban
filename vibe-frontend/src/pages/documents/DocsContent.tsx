import { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import {
  FileText,
  ChevronRight,
  Copy,
  Edit,
  Check,
  ChevronDown,
} from 'lucide-react';
import { MarkdownViewer } from '@/components/documents/MarkdownViewer';
import { PdfViewer } from '@/components/documents/PdfViewer';
import { CsvViewer } from '@/components/documents/CsvViewer';
import { ImageViewer } from '@/components/documents/ImageViewer';
import { Loader } from '@/components/ui/loader';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { Document, DocumentContentResponse } from 'shared/types';

interface DocsContentProps {
  document: Document | null;
  content: DocumentContentResponse | null;
  isLoading: boolean;
  fileUrl: string | null;
  className?: string;
  onEdit?: (doc: Document) => void;
}

interface HeadingItem {
  id: string;
  text: string;
  level: number;
}

// Extract headings for the right sidebar
function extractHeadings(content: string): HeadingItem[] {
  const items: HeadingItem[] = [];
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const text = match[2].trim();
      const id = `heading-${index}-${text.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      items.push({ id, text, level });
    }
  });

  return items;
}

export function DocsContent({
  document,
  content,
  isLoading,
  fileUrl,
  className,
  onEdit,
}: DocsContentProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);

  // Extract headings for "On this page" sidebar
  const headings = useMemo(() => {
    if (!content?.content) return [];
    return extractHeadings(content.content);
  }, [content?.content]);

  // Handle TOC click - scroll to heading within the content container
  const handleTocClick = useCallback(
    (e: React.MouseEvent, headingId: string) => {
      e.preventDefault();
      const element = window.document.getElementById(headingId);
      if (element && contentRef.current) {
        // Scroll the content container, not the window
        const container = contentRef.current;
        const elementTop = element.offsetTop;
        container.scrollTo({
          top: elementTop - 80, // Account for header
          behavior: 'smooth',
        });
        // Update URL hash without scrolling
        window.history.pushState(null, '', `#${headingId}`);
        setActiveHeadingId(headingId);
      }
    },
    []
  );

  // Track active heading on scroll
  useEffect(() => {
    const container = contentRef.current;
    if (!container || headings.length === 0) return;

    const handleScroll = () => {
      const scrollTop = container.scrollTop;
      let currentHeading: string | null = null;

      for (const heading of headings) {
        const element = window.document.getElementById(heading.id);
        if (element) {
          const elementTop = element.offsetTop - 100;
          if (scrollTop >= elementTop) {
            currentHeading = heading.id;
          }
        }
      }
      setActiveHeadingId(currentHeading);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [headings]);

  // Scroll to hash on initial load
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash && contentRef.current) {
      // Wait for content to render
      setTimeout(() => {
        const element = window.document.getElementById(hash);
        if (element && contentRef.current) {
          contentRef.current.scrollTo({
            top: element.offsetTop - 80,
            behavior: 'smooth',
          });
          setActiveHeadingId(hash);
        }
      }, 100);
    }
  }, [content]);

  // Copy document as markdown
  const handleCopyMarkdown = useCallback(async () => {
    if (!content?.content) return;
    try {
      await navigator.clipboard.writeText(content.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [content?.content]);

  // Handle edit click
  const handleEdit = useCallback(() => {
    if (document && onEdit) {
      onEdit(document);
    }
  }, [document, onEdit]);

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center h-full', className)}>
        <Loader message="Loading document..." size={32} />
      </div>
    );
  }

  // No document selected - show welcome
  if (!document) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center h-full text-center px-8',
          className
        )}
      >
        <FileText className="h-16 w-16 text-muted-foreground/50 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Welcome to Documentation</h2>
        <p className="text-muted-foreground max-w-md">
          Select a document from the sidebar to start reading, or use{' '}
          <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono text-xs">
            Cmd+K
          </kbd>{' '}
          to search.
        </p>
      </div>
    );
  }

  const fileType = content?.file_type?.toLowerCase() || '';
  const contentType = content?.content_type || '';

  const isPdf = fileType === 'pdf';
  const isMarkdown = fileType === 'md' || fileType === 'markdown';
  const isCsv = contentType === 'csv';
  const isImage = contentType === 'image_base64';
  const isText = contentType === 'text' || contentType === 'pdf_text';

  return (
    <div className={cn('flex h-full', className)}>
      {/* Main content area */}
      <div ref={contentRef} className="flex-1 min-w-0 overflow-auto">
        {/* Header with breadcrumb and actions */}
        <div className="px-8 pt-6 pb-2 flex items-center justify-between">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Docs</span>
            <ChevronRight className="h-4 w-4" />
            <span className="text-foreground font-medium">
              {document.title}
            </span>
          </div>

          {/* Document actions menu */}
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  {copied ? (
                    <>
                      <Check className="h-4 w-4" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      <span>Copy page</span>
                      <ChevronDown className="h-3 w-3" />
                    </>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleCopyMarkdown}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy page as Markdown
                </DropdownMenuItem>
                {onEdit && (
                  <DropdownMenuItem onClick={handleEdit}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit document
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Content rendering based on type */}
        {isMarkdown && content && (
          <MarkdownViewer
            content={content.content || ''}
            showOutline={false}
            className="flex-1"
          />
        )}

        {isPdf && fileUrl && (
          <div className="h-full px-8 pb-8">
            <PdfViewer fileUrl={fileUrl} className="h-full rounded-lg" />
          </div>
        )}

        {isCsv && content?.csv_data && (
          <div className="px-8 pb-8">
            <CsvViewer data={content.csv_data} />
          </div>
        )}

        {isImage && content && (
          <div className="px-8 pb-8 flex justify-center">
            <ImageViewer
              src={content.content}
              alt={document.title}
              className="max-w-full"
            />
          </div>
        )}

        {isText && !isMarkdown && content && (
          <MarkdownViewer
            content={content.content || ''}
            showOutline={false}
            className="flex-1"
          />
        )}
      </div>

      {/* Right sidebar - On this page */}
      {headings.length > 0 && (isMarkdown || isText) && (
        <aside className="w-64 shrink-0 border-l overflow-y-auto overflow-x-hidden hidden lg:block">
          <div className="sticky top-0 py-6 px-4 min-w-0">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="inline-block w-1 h-1 bg-muted-foreground rounded-full" />
              On this page
            </h4>
            <nav className="space-y-1 min-w-0">
              {headings.map((heading) => (
                <button
                  key={heading.id}
                  onClick={(e) => handleTocClick(e, heading.id)}
                  title={heading.text}
                  className={cn(
                    'block w-full text-left text-sm py-1 transition-colors hover:text-foreground',
                    'overflow-hidden text-ellipsis whitespace-nowrap max-w-full',
                    heading.level === 1
                      ? 'font-medium'
                      : heading.level === 2
                        ? 'pl-2'
                        : 'pl-4 text-xs',
                    activeHeadingId === heading.id
                      ? 'text-primary font-medium'
                      : 'text-muted-foreground'
                  )}
                >
                  {heading.text}
                </button>
              ))}
            </nav>
          </div>
        </aside>
      )}
    </div>
  );
}

export default DocsContent;
