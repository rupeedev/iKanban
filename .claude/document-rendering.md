# Document Content Rendering Implementation

**Last Updated:** 2026-01-27
**Implemented In:** IKA-307
**Context:** This document details how document content is rendered in the iKanban frontend.

---

## Overview

All text-based document content in iKanban is rendered through the `MarkdownViewer` component to ensure proper formatting of Markdown syntax, regardless of file extension.

## Problem This Solves

Before IKA-307, documents displayed raw Markdown syntax (e.g., `# Heading`, `**bold**`, `[link](url)`) instead of formatted content. Users saw:

```
# Migration to Postgres
## Overview
- Item 1
- Item 2
| Column A | Column B |
| -------- | -------- |
```

Instead of the properly formatted HTML rendering with styled headings, lists, and tables.

## Architecture

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `DocsContent` | `vibe-frontend/src/pages/documents/DocsContent.tsx` | Main document viewer with content type detection |
| `MarkdownViewer` | `vibe-frontend/src/components/documents/MarkdownViewer.tsx` | Markdown-to-HTML renderer with styling |
| `PdfViewer` | `vibe-frontend/src/components/documents/PdfViewer.tsx` | Binary PDF rendering |
| `CsvViewer` | `vibe-frontend/src/components/documents/CsvViewer.tsx` | Tabular data grid |
| `ImageViewer` | `vibe-frontend/src/components/documents/ImageViewer.tsx` | Image display |

### Content Type Detection

`DocsContent.tsx` determines which viewer to use based on `file_type` and `content_type`:

```typescript
const fileType = content?.file_type?.toLowerCase() || '';
const contentType = content?.content_type || '';

const isPdf = fileType === 'pdf';
const isMarkdown = fileType === 'md' || fileType === 'markdown';
const isCsv = contentType === 'csv';
const isImage = contentType === 'image_base64';
const isText = contentType === 'text' || contentType === 'pdf_text';
```

### Rendering Logic

**Lines 250-286 in DocsContent.tsx:**

```typescript
{/* Markdown files - explicit .md extension */}
{isMarkdown && content && (
  <MarkdownViewer
    content={content.content || ''}
    showOutline={false}
    className="flex-1"
  />
)}

{/* PDF files - binary rendering */}
{isPdf && fileUrl && (
  <PdfViewer fileUrl={fileUrl} className="h-full rounded-lg" />
)}

{/* CSV files - tabular grid */}
{isCsv && content?.csv_data && (
  <CsvViewer data={content.csv_data} />
)}

{/* Images - base64 or URL */}
{isImage && content && (
  <ImageViewer
    src={content.content}
    alt={document.title}
    className="max-w-full"
  />
)}

{/* Text content (may contain Markdown) - CRITICAL LINE */}
{isText && !isMarkdown && content && (
  <MarkdownViewer
    content={content.content || ''}
    showOutline={false}
    className="flex-1"
  />
)}
```

**Key Decision:** Lines 280-286 ensure that **all text content** goes through `MarkdownViewer`, not just files with `.md` extension. This handles:
- Plain text files
- PDF text extraction (may have structure)
- Any text content without explicit Markdown extension

## Why MarkdownViewer for All Text?

### Markdown Gracefully Handles Plain Text

`MarkdownViewer` uses `react-markdown` which treats plain text as paragraphs:

```
Plain text without any Markdown
```

Renders as:

```html
<p>Plain text without any Markdown</p>
```

### But Also Formats Markdown Syntax

If the text contains Markdown syntax, it's properly formatted:

```
# Heading
## Subheading
**bold** and *italic*
```

Renders as:

```html
<h1>Heading</h1>
<h2>Subheading</h2>
<p><strong>bold</strong> and <em>italic</em></p>
```

### This Matches Claude API Docs Behavior

The Claude API documentation (which inspired this implementation) uses a similar approach:
- All text content rendered through Markdown viewer
- Gracefully handles both plain text and Markdown syntax
- Consistent reading experience

## MarkdownViewer Implementation

### Dependencies

Located in `vibe-frontend/src/components/documents/MarkdownViewer.tsx`:

```typescript
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';             // GitHub-flavored Markdown
import rehypeHighlight from 'rehype-highlight'; // Syntax highlighting
import 'highlight.js/styles/github.css';
```

### Supported Markdown Features

| Syntax | Output | Styling |
|--------|--------|---------|
| `# H1` | `<h1>` | `text-3xl font-bold mt-8 mb-4 pb-2 border-b` |
| `## H2` | `<h2>` | `text-2xl font-semibold mt-6 mb-3 pb-1 border-b` |
| `### H3` | `<h3>` | `text-xl font-semibold mt-5 mb-2` |
| `**bold**` | `<strong>` | Default browser bold |
| `*italic*` | `<em>` | Default browser italic |
| `` `code` `` | `<code>` | `px-1.5 py-0.5 rounded bg-muted font-mono text-sm` |
| ` ```code``` ` | `<pre><code>` | Syntax-highlighted with highlight.js |
| `[link](url)` | `<a>` | `text-primary underline hover:no-underline` |
| `| table |` | `<table>` | Bordered table with muted header |
| `- list` | `<ul><li>` | Bulleted list with spacing |
| `1. list` | `<ol><li>` | Numbered list with spacing |
| `> quote` | `<blockquote>` | Left border + italic + muted text |
| `![alt](img)` | `<img>` | `max-w-full rounded-lg shadow-md` |
| `---` | `<hr>` | `my-6 border-border` |

### Custom Component Overrides

`MarkdownViewer` provides custom React components for each Markdown element (lines 53-300):

```typescript
const components = React.useMemo(() => ({
  h1: ({ children, ...props }) => (
    <h1 id={heading?.id} className="text-3xl font-bold mt-8 mb-4 pb-2 border-b" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 id={heading?.id} className="text-2xl font-semibold mt-6 mb-3 pb-1 border-b" {...props}>
      {children}
    </h2>
  ),
  // ... 12 more component overrides
}), [headings]);
```

Each component:
- Applies consistent Tailwind CSS styling
- Maintains semantic HTML structure
- Adds heading IDs for table of contents navigation

### Table of Contents

`MarkdownViewer` automatically extracts headings (lines 26-41) for navigation:

```typescript
const headings = useMemo(() => {
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
}, [content]);
```

This powers:
- Sidebar "On this page" navigation in `DocsContent.tsx`
- Smooth scrolling to sections
- Active heading highlighting on scroll

## Usage Examples

### Correct Implementation

```typescript
// GOOD - Text content through MarkdownViewer
{isText && content && (
  <MarkdownViewer
    content={content.content || ''}
    showOutline={false}
    className="flex-1"
  />
)}
```

### Anti-Pattern (Pre-IKA-307)

```typescript
// BAD - Shows raw Markdown syntax
{isText && content && (
  <pre className="whitespace-pre-wrap">
    {content.content}
  </pre>
)}
```

## When to Use Each Viewer

| Content Type | Viewer | Condition |
|--------------|--------|-----------|
| `.md`, `.markdown` files | `MarkdownViewer` | `fileType === 'md' \|\| fileType === 'markdown'` |
| Text content (any extension) | `MarkdownViewer` | `contentType === 'text' \|\| contentType === 'pdf_text'` |
| PDF files | `PdfViewer` | `fileType === 'pdf'` |
| CSV files | `CsvViewer` | `contentType === 'csv'` |
| Images | `ImageViewer` | `contentType === 'image_base64'` |

**Rule:** When in doubt, use `MarkdownViewer` for text content. It handles plain text gracefully while also formatting Markdown.

## Testing Checklist

When modifying document rendering:

- [ ] Plain text files display as readable paragraphs
- [ ] Markdown files display formatted headings
- [ ] Tables render as HTML tables with borders
- [ ] Code blocks have syntax highlighting
- [ ] Links are clickable
- [ ] Images display with proper sizing
- [ ] Long documents have working TOC navigation
- [ ] PDF files render in PdfViewer
- [ ] CSV files render in CsvViewer

## Related Issues

- **IKA-307:** Implemented MarkdownViewer for all text content
- **IKA-308:** Added table of contents navigation
- **Issue #49:** Documentation of this implementation

## Coding Guidelines Reference

Full coding guidelines for document rendering are in `.claude/CODING-GUIDELINES.md` lines 806-882:
- Rule 1: ALWAYS render text content through MarkdownViewer
- Rule 2: NEVER use raw `<pre>` tags for document display
- When to use each viewer component
- IKA-307 incident summary

## API Response Format

The backend returns document content in this format:

```typescript
interface DocumentContentResponse {
  content: string;          // Text/Markdown content
  file_type: string;        // 'md', 'pdf', 'csv', 'png', etc.
  content_type: string;     // 'text', 'pdf_text', 'csv', 'image_base64'
  csv_data?: unknown[][];   // For CSV files
}
```

**Critical:** Check `content_type` first, then `file_type`. A `.txt` file has:
- `file_type: 'txt'`
- `content_type: 'text'`

And should render through `MarkdownViewer`.

## Performance Considerations

### Memoization

`MarkdownViewer` uses `useMemo` for expensive operations:

```typescript
// Extract headings once per content change
const headings = useMemo(() => extractHeadings(content), [content]);

// Component overrides once per headings change
const components = React.useMemo(() => ({
  h1: ({ children }) => <h1>{children}</h1>,
  // ...
}), [headings]);
```

### Lazy Loading

`DocsContent.tsx` shows loading state while fetching content:

```typescript
if (isLoading) {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader message="Loading document..." size={32} />
    </div>
  );
}
```

### Code Splitting

`react-markdown` and dependencies are loaded on-demand (not in main bundle).

## Future Enhancements

Potential improvements to document rendering:

1. **Collaborative editing:** Real-time markdown editing with live preview
2. **Export formats:** Export rendered content as PDF, HTML, DOCX
3. **Version history:** View document changes over time
4. **Comments:** Inline comments on specific sections
5. **Search highlighting:** Highlight search terms in rendered content
6. **Custom themes:** User-selectable syntax highlighting themes

---

## Summary

**The golden rule:** All text-based document content MUST be rendered through `MarkdownViewer`, regardless of file extension. This ensures:

1. Markdown syntax is properly formatted
2. Plain text is readable
3. Consistent user experience
4. Future-proof for Markdown adoption

**Never use raw `<pre>` tags for document display.**
