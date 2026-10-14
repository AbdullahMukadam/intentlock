import { EditorView } from "codemirror";

export const editorTheme = EditorView.theme({
  "&": {
    backgroundColor: "var(--background)",
    color: "var(--foreground)",
    fontSize: "12px",
    border: "1px solid var(--border)",
  },
  ".cm-content": {
    fontFamily: "var(--font-geist-mono), monospace",
    caretColor: "var(--foreground)",
  },
  ".cm-gutters": {
    backgroundColor: "var(--muted)",
    color: "var(--muted-foreground)",
    borderRight: "1px solid var(--border)",
  },
  ".cm-activeLine, .cm-activeLineGutter": {
    backgroundColor: "color-mix(in oklab, var(--muted) 60%, transparent)",
  },
  "&.cm-focused": { outline: "1px solid var(--ring)" },
});
