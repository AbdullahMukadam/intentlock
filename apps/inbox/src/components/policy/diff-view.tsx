"use client";

import { yaml } from "@codemirror/lang-yaml";
import { MergeView } from "@codemirror/merge";
import { EditorView, minimalSetup } from "codemirror";
import { useEffect, useRef } from "react";

import { editorTheme } from "@/components/policy/editor-theme";

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

  useEffect(() => {
    if (!parent.current) return;
    const extensions = [minimalSetup, yaml(), editorTheme, EditorView.editable.of(false)];
    const merge = new MergeView({
      parent: parent.current,
      a: { doc: before, extensions },
      b: { doc: after, extensions },
      collapseUnchanged: { margin: 3, minSize: 6 },
    });
    return () => merge.destroy();
  }, [before, after]);

  return (
    <div className="grid gap-1">
      <div className="grid grid-cols-2 text-xs text-muted-foreground">
        <span>{beforeLabel}</span>
        <span>{afterLabel}</span>
      </div>
      <div ref={parent} />
    </div>
  );
}
