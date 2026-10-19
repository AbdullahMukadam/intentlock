import type { CollectionEntry } from "astro:content";

export function pageMarkdown(entry: CollectionEntry<"docs">): string {
  const { title, description } = entry.data;
  const lead = description ? `${description}\n\n` : "";
  return `# ${title}\n\n${lead}${entry.body ?? ""}`;
}

export function markdownPath(entry: CollectionEntry<"docs">): string {
  return `/${entry.id}.md`;
}
