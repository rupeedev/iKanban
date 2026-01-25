import { useMemo } from 'react';
import { FileText, ChevronRight } from 'lucide-react';
import { MarkdownViewer } from '@/components/documents/MarkdownViewer';
import { PdfViewer } from '@/components/documents/PdfViewer';
import { CsvViewer } from '@/components/documents/CsvViewer';
import { ImageViewer } from '@/components/documents/ImageViewer';
import { Loader } from '@/components/ui/loader';
import { cn } from '@/lib/utils';
import type { Document, DocumentContentResponse } from 'shared/types';

interface DocsContentProps {
  document: Document | null;
  content: DocumentContentResponse | null;
  isLoading: boolean;
  fileUrl: string | null;
  className?: string;
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
}: DocsContentProps) {
  // Extract headings for "On this page" sidebar
  const headings = useMemo(() => {
    if (!content?.content) return [];
    return extractHeadings(content.content);
  }, [content?.content]);

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
      <div className="flex-1 min-w-0 overflow-auto">
        {/* Breadcrumb - using document title as simple breadcrumb */}
        <div className="px-8 pt-6 pb-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Docs</span>
            <ChevronRight className="h-4 w-4" />
            <span className="text-foreground font-medium">
              {document.title}
            </span>
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
          <div className="px-8 pb-8">
            <pre className="p-4 bg-muted rounded-lg font-mono text-sm whitespace-pre-wrap overflow-x-auto">
              {content.content}
            </pre>
          </div>
        )}
      </div>

      {/* Right sidebar - On this page */}
      {headings.length > 0 && (isMarkdown || isText) && (
        <aside className="w-56 shrink-0 border-l overflow-y-auto hidden lg:block">
          <div className="sticky top-0 py-6 px-4">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="inline-block w-1 h-1 bg-muted-foreground rounded-full" />
              On this page
            </h4>
            <nav className="space-y-1">
              {headings.map((heading) => (
                <a
                  key={heading.id}
                  href={`#${heading.id}`}
                  className={cn(
                    'block text-sm py-1 transition-colors hover:text-foreground',
                    heading.level === 1
                      ? 'font-medium text-foreground'
                      : heading.level === 2
                        ? 'text-muted-foreground pl-2'
                        : 'text-muted-foreground/70 pl-4 text-xs'
                  )}
                >
                  {heading.text}
                </a>
              ))}
            </nav>
          </div>
        </aside>
      )}
    </div>
  );
}

export default DocsContent;
