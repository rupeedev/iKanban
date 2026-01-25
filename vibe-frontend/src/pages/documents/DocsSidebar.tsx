import { ChevronRight, FileText, Folder } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NavItem } from './types';

interface DocsSidebarProps {
  items: NavItem[];
  activeCategory: NavItem | null;
  selectedDocId: string | null;
  expandedIds: Set<string>;
  onSelect: (item: NavItem) => void;
  onToggle: (id: string) => void;
  className?: string;
}

interface NavItemRowProps {
  item: NavItem;
  depth: number;
  selectedDocId: string | null;
  expandedIds: Set<string>;
  onSelect: (item: NavItem) => void;
  onToggle: (id: string) => void;
}

function NavItemRow({
  item,
  depth,
  selectedDocId,
  expandedIds,
  onSelect,
  onToggle,
}: NavItemRowProps) {
  const isExpanded = expandedIds.has(item.id);
  const isSelected = selectedDocId === item.id || selectedDocId === item.slug;
  const hasChildren = item.children.length > 0;
  const isFolder = item.type === 'folder';

  const handleClick = () => {
    if (isFolder && hasChildren) {
      onToggle(item.id);
    } else if (item.type === 'document') {
      onSelect(item);
    }
  };

  return (
    <div>
      <button
        onClick={handleClick}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors text-left',
          'hover:bg-accent',
          isSelected && 'bg-accent font-medium text-primary',
          !isSelected && 'text-muted-foreground hover:text-foreground'
        )}
        style={{ paddingLeft: `${12 + depth * 12}px` }}
      >
        {isFolder && hasChildren && (
          <ChevronRight
            className={cn(
              'h-3.5 w-3.5 shrink-0 transition-transform',
              isExpanded && 'rotate-90'
            )}
          />
        )}
        {isFolder && !hasChildren && (
          <Folder className="h-3.5 w-3.5 shrink-0 opacity-50" />
        )}
        {!isFolder && <FileText className="h-3.5 w-3.5 shrink-0 opacity-50" />}
        <span className="truncate">{item.name}</span>
      </button>

      {isFolder && hasChildren && isExpanded && (
        <div>
          {item.children.map((child) => (
            <NavItemRow
              key={child.id}
              item={child}
              depth={depth + 1}
              selectedDocId={selectedDocId}
              expandedIds={expandedIds}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function DocsSidebar({
  items,
  activeCategory,
  selectedDocId,
  expandedIds,
  onSelect,
  onToggle,
  className,
}: DocsSidebarProps) {
  // Filter items to show only those in the active category
  const visibleItems = activeCategory
    ? items.filter((item) => item.id === activeCategory.id)
    : items;

  return (
    <nav className={cn('py-4 space-y-1', className)}>
      {/* Category section headers */}
      {visibleItems.map((category) => (
        <div key={category.id}>
          {/* Section header - only show if it's a folder with children */}
          {category.type === 'folder' && (
            <div className="px-3 mb-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {category.name}
              </h4>
            </div>
          )}

          {/* Children */}
          {category.type === 'folder' && category.children.length > 0 && (
            <div className="space-y-0.5">
              {category.children.map((item) => (
                <NavItemRow
                  key={item.id}
                  item={item}
                  depth={0}
                  selectedDocId={selectedDocId}
                  expandedIds={expandedIds}
                  onSelect={onSelect}
                  onToggle={onToggle}
                />
              ))}
            </div>
          )}

          {/* If root documents exist outside folders */}
          {category.type === 'document' && (
            <NavItemRow
              item={category}
              depth={0}
              selectedDocId={selectedDocId}
              expandedIds={expandedIds}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          )}
        </div>
      ))}

      {/* Root-level documents (not in any folder) */}
      {activeCategory === null &&
        items
          .filter((item) => item.type === 'document')
          .map((doc) => (
            <NavItemRow
              key={doc.id}
              item={doc}
              depth={0}
              selectedDocId={selectedDocId}
              expandedIds={expandedIds}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
    </nav>
  );
}

export default DocsSidebar;
