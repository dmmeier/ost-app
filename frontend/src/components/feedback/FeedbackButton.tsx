"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!feedback.trim()) return;
    setIsSubmitting(true);

    try {
      // Capture screenshot
      let screenshotDataUrl: string | null = null;
      try {
        const html2canvas = (await import("html2canvas")).default;
        const canvas = await html2canvas(document.body, {
          scale: 1,
          useCORS: true,
          logging: false,
        });
        screenshotDataUrl = canvas.toDataURL("image/png");
      } catch {
        // Screenshot capture is optional
      }

      // Send to API
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1"}/feedback/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: feedback,
            screenshot: screenshotDataUrl,
            url: window.location.href,
            timestamp: new Date().toISOString(),
          }),
        }
      );

      if (res.ok) {
        setSubmitted(true);
        setFeedback("");
        setTimeout(() => {
          setSubmitted(false);
          setOpen(false);
        }, 2000);
      }
    } catch {
      // Silently fail — feedback is non-critical
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="fixed top-1/2 -translate-y-1/2 right-0 z-50 bg-gray-300 hover:bg-gray-400 text-gray-600 rounded-l py-2 px-0.5 flex flex-col items-center justify-center shadow-sm text-[9px] font-medium"
          style={{ writingMode: "vertical-rl" }}
          title="Send feedback"
        >
          Feedback
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send Feedback</DialogTitle>
        </DialogHeader>
        {submitted ? (
          <div className="text-center py-4 text-green-600 font-medium">
            Thanks for your feedback!
          </div>
        ) : (
          <div className="space-y-3 pt-2">
            <Textarea
              placeholder="Describe the issue, suggestion, or idea..."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={4}
            />
            <p className="text-xs text-gray-500">
              A screenshot will be captured automatically.
            </p>
            <Button
              onClick={handleSubmit}
              disabled={!feedback.trim() || isSubmitting}
              className="w-full"
            >
              {isSubmitting ? "Sending..." : "Send Feedback"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
