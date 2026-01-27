import { useCallback, useEffect, useState, useRef } from 'react';
import { Search, Command, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { NavItem, ViewMode } from './types';
import type { Document } from 'shared/types';

interface DocsHeaderProps {
  teamName: string;
  teamIcon?: string;
  categories: NavItem[];
  activeCategory: NavItem | null;
  onCategoryChange: (category: NavItem | null) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchResults: Document[];
  onSearchSelect: (doc: Document) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  className?: string;
}

export function DocsHeader({
  teamName,
  teamIcon,
  categories,
  activeCategory,
  onCategoryChange,
  searchQuery,
  onSearchChange,
  searchResults,
  onSearchSelect,
  viewMode,
  onViewModeChange,
  className,
}: DocsHeaderProps) {
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Show dropdown when input is focused and there's a query
  const showDropdown = isSearchFocused && searchQuery.length > 0;

  // Handle keyboard shortcut for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsSearchFocused(true);
      }
      // Close on Escape
      if (e.key === 'Escape' && isSearchFocused) {
        inputRef.current?.blur();
        setIsSearchFocused(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchFocused]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsSearchFocused(false);
      }
    };

    if (isSearchFocused) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isSearchFocused]);

  const handleSearchSelect = useCallback(
    (doc: Document) => {
      onSearchSelect(doc);
      setIsSearchFocused(false);
      onSearchChange('');
    },
    [onSearchSelect, onSearchChange]
  );

  return (
    <header
      className={cn('border-b bg-background/95 backdrop-blur', className)}
    >
      {/* Top bar with logo and search */}
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="text-xl">{teamIcon || '📚'}</span>
          <h1 className="text-lg font-semibold">{teamName} Docs</h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Inline search with dropdown */}
          <div ref={containerRef} className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                ref={inputRef}
                placeholder="Search documentation..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                className="w-[200px] sm:w-[280px] pl-9 pr-16 h-9 text-sm"
              />
              <kbd className="absolute right-2 top-1/2 -translate-y-1/2 hidden sm:inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground pointer-events-none">
                <Command className="h-3 w-3" />K
              </kbd>
            </div>

            {/* Search results dropdown */}
            {showDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg z-50 max-h-[300px] overflow-y-auto">
                {searchResults.length === 0 && (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    No results found for "{searchQuery}"
                  </div>
                )}
                {searchResults.map((doc) => (
                  <button
                    key={doc.id}
                    onClick={() => handleSearchSelect(doc)}
                    className="w-full flex items-start gap-3 p-3 hover:bg-accent text-left border-b last:border-b-0"
                  >
                    <Search className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium truncate">{doc.title}</div>
                      {doc.content && (
                        <div className="text-sm text-muted-foreground line-clamp-1">
                          {doc.content.slice(0, 100)}...
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* View mode toggle */}
          <Button
            variant={viewMode === 'manage' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() =>
              onViewModeChange(viewMode === 'reader' ? 'manage' : 'reader')
            }
            title={
              viewMode === 'reader'
                ? 'Switch to manage mode'
                : 'Switch to reader mode'
            }
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex items-center gap-1 px-6 pb-0 overflow-x-auto">
        {categories.map((category) => (
          <button
            key={category.id}
            onClick={() => onCategoryChange(category)}
            className={cn(
              'px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2',
              activeCategory?.id === category.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            )}
          >
            {category.name}
          </button>
        ))}
      </div>

    </header>
  );
}

export default DocsHeader;
