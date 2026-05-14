"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
} from "lucide-react";

interface RichTextEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  minRows?: number;
  onBlur?: () => void;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "",
  disabled = false,
  className = "",
  minRows = 2,
  onBlur,
}: RichTextEditorProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onBlurRef = useRef(onBlur);
  onBlurRef.current = onBlur;

  const [focused, setFocused] = useState(false);

  // Track the last value emitted by onChange to avoid feedback loops
  const lastEmittedRef = useRef(value);
  // Suppress onChange during programmatic setContent to avoid dirty-flag race conditions
  const isProgrammaticRef = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        code: false,
        strike: false,
        horizontalRule: false,
      }),
      Placeholder.configure({ placeholder }),
      Markdown.configure({
        html: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: value,
    editable: !disabled,
    onUpdate: ({ editor: ed }) => {
      if (isProgrammaticRef.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const md = (ed.storage as any).markdown.getMarkdown();
      lastEmittedRef.current = md;
      onChangeRef.current(md);
    },
    onFocus: () => {
      setFocused(true);
    },
    onBlur: ({ event }) => {
      // Don't fire blur if user clicked a toolbar button inside the wrapper
      const related = (event as FocusEvent).relatedTarget as HTMLElement | null;
      if (related && wrapperRef.current?.contains(related)) {
        return;
      }
      setFocused(false);
      onBlurRef.current?.();
    },
    editorProps: {
      attributes: {
        class: "outline-none",
        style: `min-height: ${minRows * 1.5}em`,
      },
    },
    immediatelyRender: false,
  });

  // Sync content from props only when value differs from what we last emitted
  // (i.e., an external source changed the value, not our own onChange)
  useEffect(() => {
    if (!editor) return;
    if (value === lastEmittedRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const currentMd = (editor.storage as any).markdown.getMarkdown();
    if (currentMd !== value) {
      isProgrammaticRef.current = true;
      editor.commands.setContent(value);
      isProgrammaticRef.current = false;
      lastEmittedRef.current = value;
    }
  }, [editor, value]);

  // Sync editable state
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  const ToolbarButton = useCallback(
    ({
      active,
      onClick,
      children,
      title,
    }: {
      active: boolean;
      onClick: () => void;
      children: React.ReactNode;
      title: string;
    }) => (
      <button
        type="button"
        tabIndex={-1}
        onMouseDown={(e) => {
          e.preventDefault(); // prevent editor blur
          onClick();
        }}
        className={`p-1 rounded transition-colors ${
          active
            ? "bg-teal-100 text-teal-700"
            : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        } ${disabled ? "opacity-40 pointer-events-none" : ""}`}
        title={title}
      >
        {children}
      </button>
    ),
    [disabled]
  );

  if (!editor) return null;

  return (
    <div
      ref={wrapperRef}
      className={`tiptap-editor border border-gray-200 rounded text-sm focus-within:ring-1 focus-within:ring-[#0d9488] ${
        disabled ? "bg-gray-50 cursor-not-allowed" : ""
      } ${className}`}
    >
      {/* Toolbar — only visible when editor is focused */}
      {focused && !disabled && (
        <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-gray-100">
          <ToolbarButton
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Bold (Ctrl+B)"
          >
            <Bold size={14} />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Italic (Ctrl+I)"
          >
            <Italic size={14} />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive("underline")}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            title="Underline (Ctrl+U)"
          >
            <UnderlineIcon size={14} />
          </ToolbarButton>
          <div className="w-px h-4 bg-gray-200 mx-1" />
          <ToolbarButton
            active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="Bullet List"
          >
            <List size={14} />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title="Ordered List"
          >
            <ListOrdered size={14} />
          </ToolbarButton>
        </div>
      )}

      {/* Editor content */}
      <div className="px-2 py-1.5">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
