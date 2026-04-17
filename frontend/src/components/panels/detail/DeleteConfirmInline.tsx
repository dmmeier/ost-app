"use client";

import { Button } from "@/components/ui/button";

export function DeleteConfirmInline({
  node,
  childCount,
  onDelete,
  onCancel,
}: {
  node: { title: string };
  childCount: number;
  onDelete: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-2 border border-red-200 rounded-md p-3 bg-red-50">
      <p className="text-sm font-medium text-red-800">Delete this node?</p>
      <p className="text-xs text-red-600">
        &quot;{node.title.slice(0, 50)}{node.title.length > 50 ? "..." : ""}&quot;
        {childCount > 0 && ` and its ${childCount} descendant${childCount > 1 ? "s" : ""}`}
        {" "}will be permanently removed.
      </p>
      <div className="flex gap-2">
        <Button
          variant="destructive"
          size="sm"
          className="flex-1"
          onClick={onDelete}
        >
          Yes, delete
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
