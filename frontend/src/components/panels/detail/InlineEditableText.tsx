"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function InlineEditableText({
  value,
  onSave,
  className = "",
  multiline = false,
  placeholder = "Click to edit...",
}: {
  value: string;
  onSave: (newValue: string) => Promise<void>;
  className?: string;
  multiline?: boolean;
  placeholder?: string;
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

  if (!editing) {
    return (
      <div
        className={`${className} cursor-pointer hover:bg-gray-50 rounded px-1 -mx-1 transition-colors`}
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        title="Click to edit"
      >
        {value || <span className="text-gray-400 italic">{placeholder}</span>}
      </div>
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
