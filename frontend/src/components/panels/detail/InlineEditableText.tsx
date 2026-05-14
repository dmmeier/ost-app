"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/ui/RichTextEditor";

/** Simple markdown-to-HTML for display mode (bold, italic, underline, lists) */
function markdownToHtml(md: string): string {
  if (!md) return "";
  let html = md
    // Bold: **text** or __text__
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    // Italic: *text* or _text_
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>")
    .replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, "<em>$1</em>");

  // Process lines for lists
  const lines = html.split("\n");
  const result: string[] = [];
  let inUl = false;
  let inOl = false;

  for (const line of lines) {
    const ulMatch = line.match(/^[\-\*]\s+(.*)/);
    const olMatch = line.match(/^\d+\.\s+(.*)/);

    if (ulMatch) {
      if (!inUl) { result.push("<ul>"); inUl = true; }
      if (inOl) { result.push("</ol>"); inOl = false; }
      result.push(`<li>${ulMatch[1]}</li>`);
    } else if (olMatch) {
      if (!inOl) { result.push("<ol>"); inOl = true; }
      if (inUl) { result.push("</ul>"); inUl = false; }
      result.push(`<li>${olMatch[1]}</li>`);
    } else {
      if (inUl) { result.push("</ul>"); inUl = false; }
      if (inOl) { result.push("</ol>"); inOl = false; }
      result.push(line);
    }
  }
  if (inUl) result.push("</ul>");
  if (inOl) result.push("</ol>");

  return result.join("\n");
}

export function InlineEditableText({
  value,
  onSave,
  className = "",
  multiline = false,
  richText = false,
  placeholder = "Click to edit...",
  disabled = false,
}: {
  value: string;
  onSave: (newValue: string) => Promise<void>;
  className?: string;
  multiline?: boolean;
  richText?: boolean;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (draft === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } catch {
      setDraft(value);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const displayHtml = useMemo(() => {
    if (!richText || !value) return "";
    return markdownToHtml(value);
  }, [richText, value]);

  if (!editing) {
    if (richText && value) {
      return (
        <div
          className={`${className} ${disabled ? "" : "cursor-pointer hover:bg-gray-50"} rounded px-1 -mx-1 transition-colors rich-text-display`}
          onClick={disabled ? undefined : () => {
            setDraft(value);
            setEditing(true);
          }}
          title={disabled ? undefined : "Click to edit"}
          dangerouslySetInnerHTML={{ __html: displayHtml }}
        />
      );
    }

    return (
      <div
        className={`${className} ${disabled ? "" : "cursor-pointer hover:bg-gray-50"} rounded px-1 -mx-1 transition-colors`}
        onClick={disabled ? undefined : () => {
          setDraft(value);
          setEditing(true);
        }}
        title={disabled ? undefined : "Click to edit"}
      >
        {value || <span className="text-gray-400 italic">{placeholder}</span>}
      </div>
    );
  }

  if (richText && multiline) {
    return (
      <RichTextEditor
        value={draft}
        onChange={setDraft}
        placeholder={placeholder}
        disabled={saving}
        onBlur={handleSave}
        minRows={3}
      />
    );
  }

  if (multiline) {
    return (
      <Textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
        disabled={saving}
        className={`${className} text-sm`}
        rows={3}
      />
    );
  }

  return (
    <Input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={handleSave}
      onKeyDown={(e) => {
        if (e.key === "Enter") handleSave();
        if (e.key === "Escape") { setDraft(value); setEditing(false); }
      }}
      disabled={saving}
      className={`${className}`}
    />
  );
}
