"use client";

import { useEffect, useState } from "react";
import { api, SettingsResponse } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI (GPT)",
  google: "Google (Gemini)",
};

const KEY_FIELDS: Record<string, { field: "anthropic_api_key" | "openai_api_key" | "google_api_key"; hasKey: keyof SettingsResponse }> = {
  anthropic: { field: "anthropic_api_key", hasKey: "has_anthropic_key" },
  openai: { field: "openai_api_key", hasKey: "has_openai_key" },
  google: { field: "google_api_key", hasKey: "has_google_key" },
};

export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({
    anthropic_api_key: "",
    openai_api_key: "",
    google_api_key: "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const s = await api.settings.get();
      setSettings(s);
    } catch (err) {
      console.error("Failed to fetch settings:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchSettings();
  }, [open]);

  const handleProviderChange = async (provider: string) => {
    setSaving(true);
    try {
      const updated = await api.settings.update({ llm_provider: provider });
      setSettings(updated);
    } catch (err) {
      console.error("Failed to update provider:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleModelChange = async (model: string) => {
    setSaving(true);
    try {
      const updated = await api.settings.update({ llm_model: model });
      setSettings(updated);
    } catch (err) {
      console.error("Failed to update model:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveKeys = async () => {
    setSaving(true);
    try {
      const update: Record<string, string> = {};
      for (const [key, value] of Object.entries(apiKeys)) {
        if (value.trim()) update[key] = value.trim();
      }
      if (Object.keys(update).length > 0) {
        const updated = await api.settings.update(update);
        setSettings(updated);
        setApiKeys({ anthropic_api_key: "", openai_api_key: "", google_api_key: "" });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (err) {
      console.error("Failed to save API keys:", err);
    } finally {
      setSaving(false);
    }
  };

  const models = settings?.provider_models[settings.llm_provider] ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-xs h-8 px-2">
          Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        {loading || !settings ? (
          <div className="py-4 text-center text-gray-500 text-sm">Loading...</div>
        ) : (
          <div className="space-y-5">
            {/* Provider selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">AI Provider</label>
              <div className="flex gap-2">
                {settings.available_providers.map((p) => {
                  const keyInfo = KEY_FIELDS[p];
                  const hasKey = settings[keyInfo.hasKey] as boolean;
                  return (
                    <button
                      key={p}
                      onClick={() => handleProviderChange(p)}
                      disabled={saving}
                      className={`flex-1 text-xs rounded-md border px-3 py-2 transition-colors ${
                        settings.llm_provider === p
                          ? "border-blue-500 bg-blue-50 text-blue-700 font-medium"
                          : "border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      <div>{PROVIDER_LABELS[p]}</div>
                      {hasKey ? (
                        <Badge variant="outline" className="text-[9px] mt-1 text-green-600 border-green-300">
                          key set
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[9px] mt-1 text-amber-600 border-amber-300">
                          no key
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Model selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Model</label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={settings.llm_model}
                onChange={(e) => handleModelChange(e.target.value)}
                disabled={saving}
              >
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {/* API Keys */}
            <div className="space-y-3">
              <label className="text-sm font-medium">API Keys</label>
              <p className="text-xs text-gray-500">
                Keys are stored in server memory only (not persisted to disk).
              </p>

              {settings.available_providers.map((p) => {
                const keyInfo = KEY_FIELDS[p];
                const hasKey = settings[keyInfo.hasKey] as boolean;
                return (
                  <div key={p} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-600">{PROVIDER_LABELS[p]}</span>
                      {hasKey && (
                        <Badge variant="outline" className="text-[9px] text-green-600 border-green-300">
                          configured
                        </Badge>
                      )}
                    </div>
                    <Input
                      type="password"
                      placeholder={hasKey ? "••••••••  (update to change)" : `Enter ${p} API key...`}
                      value={apiKeys[keyInfo.field]}
                      onChange={(e) =>
                        setApiKeys((prev) => ({ ...prev, [keyInfo.field]: e.target.value }))
                      }
                      className="text-sm"
                    />
                  </div>
                );
              })}

              <Button
                onClick={handleSaveKeys}
                disabled={
                  saving ||
                  !Object.values(apiKeys).some((v) => v.trim())
                }
                size="sm"
                className="w-full"
              >
                {saved ? "Saved!" : saving ? "Saving..." : "Save API Keys"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
