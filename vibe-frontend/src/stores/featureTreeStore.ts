import { create } from 'zustand';

interface FeatureTreeState {
  /** Map of featureId to expanded state */
  expanded: Record<string, boolean>;
  /** Toggle expanded state for a specific feature */
  toggleFeature: (featureId: string) => void;
  /** Expand a specific feature */
  expandFeature: (featureId: string) => void;
  /** Collapse a specific feature */
  collapseFeature: (featureId: string) => void;
  /** Reset all expanded states */
  clear: () => void;
}

/**
 * Store for managing expanded/collapsed state of feature tree items.
 * Features are collapsed by default.
 */
export const useFeatureTreeStore = create<FeatureTreeState>((set) => ({
  expanded: {},

  toggleFeature: (featureId) =>
    set((state) => ({
      expanded: {
        ...state.expanded,
        [featureId]: !state.expanded[featureId],
      },
    })),

  expandFeature: (featureId) =>
    set((state) => ({
      expanded: {
        ...state.expanded,
        [featureId]: true,
      },
    })),

  collapseFeature: (featureId) =>
    set((state) => ({
      expanded: {
        ...state.expanded,
        [featureId]: false,
      },
    })),

  clear: () => set({ expanded: {} }),
}));

/**
 * Hook to get expanded state for a specific feature.
 * Returns a tuple of [isExpanded, toggle].
 */
export function useFeatureExpanded(featureId: string): [boolean, () => void] {
  const isExpanded = useFeatureTreeStore((s) => s.expanded[featureId] ?? false);
  const toggleFeature = useFeatureTreeStore((s) => s.toggleFeature);

  return [isExpanded, () => toggleFeature(featureId)];
}
