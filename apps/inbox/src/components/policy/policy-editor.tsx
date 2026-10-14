"use client";

import { yaml } from "@codemirror/lang-yaml";
import { lintGutter, linter } from "@codemirror/lint";
import { unifiedMergeView } from "@codemirror/merge";
import { basicSetup, EditorView } from "codemirror";
import { useEffect, useRef } from "react";

import { editorTheme } from "@/components/policy/editor-theme";
import { policyDiagnostics } from "@/lib/policy-lint";

export function PolicyEditor({
  value,
  onChange,
  readOnly,
  original,
}: {
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
  original?: string;
}) {
  const parent = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const doc = useRef(value);
  const changed = useRef(onChange);

  useEffect(() => {
    changed.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!parent.current) return;
    const editor = new EditorView({
      parent: parent.current,
      doc: doc.current,
      extensions: [
        basicSetup,
        yaml(),
        linter((v) => policyDiagnostics(v.state.doc.toString()), { delay: 300 }),
        lintGutter(),
        editorTheme,
        EditorView.editable.of(!readOnly),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          const next = update.state.doc.toString();
          if (next === doc.current) return;
          doc.current = next;
          changed.current(next);
        }),
        ...(original === undefined
          ? []
          : [unifiedMergeView({ original, mergeControls: false, gutter: true })]),
      ],
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
  }, [readOnly, original]);

  useEffect(() => {
    const editor = view.current;
    if (!editor || value === editor.state.doc.toString()) return;
    doc.current = value;
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
  }, [value]);

  return <div ref={parent} aria-label="Policy YAML" />;
}
