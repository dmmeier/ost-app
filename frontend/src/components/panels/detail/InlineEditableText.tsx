"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { markdownToHtml } from "@/lib/markdown-to-html";

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
