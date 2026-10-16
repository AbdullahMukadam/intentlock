import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { EditorView } from "codemirror";

const highlight = HighlightStyle.define([
  { tag: [tags.propertyName, tags.definition(tags.propertyName)], color: "var(--code-key)" },
  { tag: [tags.string, tags.special(tags.string), tags.content], color: "var(--code-string)" },
  { tag: tags.number, color: "var(--code-number)" },
  { tag: [tags.bool, tags.null, tags.atom, tags.keyword], color: "var(--code-atom)" },
  { tag: [tags.comment, tags.lineComment], color: "var(--code-comment)", fontStyle: "italic" },
  {
    tag: [tags.punctuation, tags.separator, tags.brace, tags.squareBracket, tags.meta],
    color: "var(--code-punctuation)",
  },
]);

export const editorTheme = [
  EditorView.theme({
    "&": {
      backgroundColor: "var(--card)",
      color: "var(--foreground)",
      fontSize: "12px",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius)",
      overflow: "hidden",
    },
    ".cm-content": {
      fontFamily: "var(--font-mono-code), monospace",
      caretColor: "var(--foreground)",
    },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--foreground)" },
    ".cm-gutters": {
      backgroundColor: "var(--muted)",
      color: "var(--muted-foreground)",
      borderRight: "1px solid var(--border)",
    },
    ".cm-activeLine, .cm-activeLineGutter": {
      backgroundColor: "color-mix(in oklab, var(--muted) 60%, transparent)",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
      backgroundColor: "color-mix(in oklab, var(--info) 22%, transparent)",
    },
    ".cm-matchingBracket": {
      backgroundColor: "color-mix(in oklab, var(--info) 18%, transparent)",
      outline: "none",
    },
    ".cm-foldPlaceholder": {
      backgroundColor: "var(--muted)",
      borderColor: "var(--border)",
      color: "var(--muted-foreground)",
    },
    ".cm-tooltip": {
      backgroundColor: "var(--popover)",
      color: "var(--popover-foreground)",
      border: "1px solid var(--border)",
    },
    "&.cm-focused": { outline: "2px solid color-mix(in oklch, var(--ring) 60%, transparent)" },
  }),
  syntaxHighlighting(highlight),
];
