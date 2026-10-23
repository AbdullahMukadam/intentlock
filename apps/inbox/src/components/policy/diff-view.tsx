"use client";

import { yaml } from "@codemirror/lang-yaml";
import { MergeView, unifiedMergeView } from "@codemirror/merge";
import { EditorView, minimalSetup } from "codemirror";
import { useEffect, useRef, useSyncExternalStore } from "react";

import { editorTheme } from "@/components/policy/editor-theme";

const NARROW = "(max-width: 639px)";
const COLLAPSE = { margin: 3, minSize: 6 };

function subscribe(onChange: () => void) {
  const query = window.matchMedia(NARROW);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function DiffView({
  before,
  after,
  beforeLabel,
  afterLabel,
}: {
  before: string;
  after: string;
  beforeLabel: string;
  afterLabel: string;
}) {
  const parent = useRef<HTMLDivElement>(null);
  const narrow = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(NARROW).matches,
    () => false,
  );

  useEffect(() => {
    if (!parent.current) return;
    const extensions = [minimalSetup, yaml(), editorTheme, EditorView.editable.of(false)];
    if (narrow) {
      const view = new EditorView({
        parent: parent.current,
        doc: after,
        extensions: [
          ...extensions,
          unifiedMergeView({
            original: before,
            mergeControls: false,
            gutter: true,
            collapseUnchanged: COLLAPSE,
          }),
        ],
      });
      return () => view.destroy();
    }
    const merge = new MergeView({
      parent: parent.current,
      a: { doc: before, extensions },
      b: { doc: after, extensions },
      collapseUnchanged: COLLAPSE,
    });
    return () => merge.destroy();
  }, [before, after, narrow]);

  return (
    <div className="grid min-w-0 gap-1">
      {narrow ? (
        <div className="text-xs text-muted-foreground">
          {beforeLabel} → {afterLabel}
        </div>
      ) : (
        <div className="grid grid-cols-2 text-xs text-muted-foreground">
          <span>{beforeLabel}</span>
          <span>{afterLabel}</span>
        </div>
      )}
      <div ref={parent} className="min-w-0" />
    </div>
  );
}
