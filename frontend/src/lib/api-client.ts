import { Project, ProjectCreate, ProjectUpdate, ProjectWithTrees, Tree, TreeCreate, TreeUpdate, TreeWithNodes, Node, NodeCreate, NodeUpdate, EdgeHypothesis, ValidationReport, TreeSnapshot, SnapshotDetail, ChatHistoryMessage, Tag, BubbleDefaults, GitStatusResponse, GitCommitResponse, GitAuthor, GitCommitLog, User, UserWithToken, AuthStatus, ActivityLog, ProjectMember } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("ost_token");
}

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const isFormData = options?.body instanceof FormData;
  const headers: Record<string, string> = isFormData
    ? {}
    : { "Content-Type": "application/json" };

  // Inject auth token if available
  const token = getAuthToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    headers: { ...headers, ...options?.headers },
    ...options,
  });

  // Handle 401: clear token and redirect to login
  if (res.status === 401) {
    if (typeof window !== "undefined") {
      localStorage.removeItem("ost_token");
      localStorage.removeItem("ost_user");
      // Only redirect if not already on login page
      if (!window.location.pathname.includes("/login")) {
        window.location.href = "/login";
      }
    }
    const error = await res.json().catch(() => ({ detail: "Authentication required" }));
    throw new ApiError(error.detail || "Authentication required", 401);
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(error.detail || `API error: ${res.status}`, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  auth: {
    register: (email: string, display_name: string, password: string) =>
      fetchAPI<UserWithToken>("/auth/register", { method: "POST", body: JSON.stringify({ email, display_name, password }) }),
    login: (email: string, password: string) =>
      fetchAPI<UserWithToken>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
    me: () => fetchAPI<User>("/auth/me"),
    status: () => fetchAPI<AuthStatus>("/auth/status"),
  },
  projects: {
    list: () => fetchAPI<Project[]>("/projects/"),
    get: (id: string) => fetchAPI<ProjectWithTrees>(`/projects/${id}`),
    create: (data: ProjectCreate) => fetchAPI<Project>("/projects/", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: ProjectUpdate) => fetchAPI<Project>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => fetchAPI<void>(`/projects/${id}`, { method: "DELETE" }),
    getBubbleDefaults: (id: string) => fetchAPI<BubbleDefaults>(`/projects/${id}/bubble-defaults`),
    updateBubbleDefaults: (id: string, data: BubbleDefaults) =>
      fetchAPI<Project>(`/projects/${id}/bubble-defaults`, { method: "PUT", body: JSON.stringify(data) }),
  },
  trees: {
    list: (projectId?: string) => {
      const params = projectId ? `?project_id=${projectId}` : "";
      return fetchAPI<Tree[]>(`/trees/${params}`);
    },
    get: (id: string) => fetchAPI<TreeWithNodes>(`/trees/${id}`),
    exportTree: (id: string) => fetchAPI<Record<string, unknown>>(`/trees/${id}/export`),
    getVersion: (id: string) => fetchAPI<{ version: number }>(`/trees/${id}/version`),
    create: (data: TreeCreate) => fetchAPI<Tree>("/trees/", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: TreeUpdate) => fetchAPI<Tree>(`/trees/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => fetchAPI<void>(`/trees/${id}`, { method: "DELETE" }),
    importTree: (projectId: string, file: File, name?: string) => {
      const formData = new FormData();
      formData.append("file", file);
      const params = new URLSearchParams({ project_id: projectId });
      if (name) params.append("name", name);
      return fetchAPI<TreeWithNodes>(`/trees/import?${params}`, {
        method: "POST",
        body: formData,
      });
    },
  },
  nodes: {
    get: (id: string) => fetchAPI<Node>(`/nodes/${id}`),
    create: (treeId: string, data: NodeCreate) =>
      fetchAPI<Node>(`/nodes/?tree_id=${treeId}`, { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: NodeUpdate) =>
      fetchAPI<Node>(`/nodes/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => fetchAPI<void>(`/nodes/${id}`, { method: "DELETE" }),
    move: (id: string, newParentId: string) =>
      fetchAPI<void>(`/nodes/${id}/move`, { method: "POST", body: JSON.stringify({ new_parent_id: newParentId }) }),
    reorder: (id: string, direction: "left" | "right") =>
      fetchAPI<void>(`/nodes/${id}/reorder`, { method: "POST", body: JSON.stringify({ direction }) }),
    children: (id: string) => fetchAPI<Node[]>(`/nodes/${id}/children`),
  },
  edges: {
    get: (parentId: string, childId: string) => fetchAPI<EdgeHypothesis>(`/edges/${parentId}/${childId}`),
    create: (data: { parent_node_id: string; child_node_id: string; hypothesis: string; hypothesis_type: string; is_risky?: boolean; evidence?: string }) =>
      fetchAPI<EdgeHypothesis>("/edges/", { method: "POST", body: JSON.stringify(data) }),
    update: (edgeId: string, data: { hypothesis?: string; hypothesis_type?: string; is_risky?: boolean; status?: string; evidence?: string; thickness?: number }) =>
      fetchAPI<EdgeHypothesis>(`/edges/${edgeId}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (edgeId: string) =>
      fetchAPI<void>(`/edges/${edgeId}`, { method: "DELETE" }),
  },
  tags: {
    list: (projectId: string) => fetchAPI<Tag[]>(`/tags/project/${projectId}`),
    create: (projectId: string, data: { name: string; color?: string; fill_style?: string; font_light?: boolean }) =>
      fetchAPI<Tag>(`/tags/project/${projectId}`, { method: "POST", body: JSON.stringify(data) }),
    update: (tagId: string, data: { color?: string; fill_style?: string | null; font_light?: boolean }) =>
      fetchAPI<Tag>(`/tags/${tagId}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (tagId: string) => fetchAPI<{ status: string; was_used_on: number }>(`/tags/${tagId}`, { method: "DELETE" }),
    addToNode: (nodeId: string, tagName: string) =>
      fetchAPI<Tag>(`/tags/node/${nodeId}`, { method: "POST", body: JSON.stringify({ tag_name: tagName }) }),
    removeFromNode: (nodeId: string, tagId: string) =>
      fetchAPI<void>(`/tags/node/${nodeId}/${tagId}`, { method: "DELETE" }),
  },
  validation: {
    validate: (treeId: string) => fetchAPI<ValidationReport>(`/validation/${treeId}/validate`, { method: "POST" }),
  },
  snapshots: {
    list: (treeId: string) => fetchAPI<TreeSnapshot[]>(`/trees/${treeId}/snapshots`),
    create: (treeId: string, message: string) =>
      fetchAPI<TreeSnapshot>(`/trees/${treeId}/snapshots`, { method: "POST", body: JSON.stringify({ message }) }),
    get: (treeId: string, snapshotId: string) =>
      fetchAPI<SnapshotDetail>(`/trees/${treeId}/snapshots/${snapshotId}`),
    restore: (treeId: string, snapshotId: string) =>
      fetchAPI<any>(`/trees/${treeId}/restore`, { method: "POST", body: JSON.stringify({ snapshot_id: snapshotId }) }),
  },
  chatHistory: {
    get: (treeId: string, limit: number = 100) =>
      fetchAPI<ChatHistoryMessage[]>(`/trees/${treeId}/chat-history?limit=${limit}`),
    clear: (treeId: string) =>
      fetchAPI<void>(`/trees/${treeId}/chat-history`, { method: "DELETE" }),
  },
  settings: {
    get: () => fetchAPI<SettingsResponse>("/settings/"),
    update: (data: SettingsUpdate) =>
      fetchAPI<SettingsResponse>("/settings/", { method: "PATCH", body: JSON.stringify(data) }),
  },
  chat: {
    send: (treeId: string, messages: ChatMessage[], provider?: string, mode?: string) =>
      fetchAPI<ChatResponse>("/chat/", {
        method: "POST",
        body: JSON.stringify({ tree_id: treeId, messages, provider, mode }),
      }),
  },
  git: {
    status: (projectId: string) => fetchAPI<GitStatusResponse>(`/git/status/${projectId}`),
    updateConfig: (projectId: string, data: { remote_url?: string; branch?: string }) =>
      fetchAPI<GitStatusResponse>(`/git/config/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    commit: (treeId: string, commitMessage: string, authorName?: string, authorEmail?: string) =>
      fetchAPI<GitCommitResponse>("/git/commit", {
        method: "POST",
        body: JSON.stringify({
          tree_id: treeId,
          commit_message: commitMessage,
          author_name: authorName || "",
          author_email: authorEmail || "",
        }),
      }),
    authors: (projectId: string) => fetchAPI<GitAuthor[]>(`/git/authors/${projectId}`),
    history: (projectId: string, limit: number = 50) =>
      fetchAPI<GitCommitLog[]>(`/git/history/${projectId}?limit=${limit}`),
  },
  activity: {
    forTree: (treeId: string, limit: number = 50) =>
      fetchAPI<ActivityLog[]>(`/trees/${treeId}/activity?limit=${limit}`),
    forProject: (projectId: string, limit: number = 50) =>
      fetchAPI<ActivityLog[]>(`/projects/${projectId}/activity?limit=${limit}`),
  },
  members: {
    list: (projectId: string) =>
      fetchAPI<ProjectMember[]>(`/projects/${projectId}/members`),
    add: (projectId: string, email: string, role: string) =>
      fetchAPI<ProjectMember>(`/projects/${projectId}/members`, {
        method: "POST",
        body: JSON.stringify({ email, role }),
      }),
    updateRole: (projectId: string, userId: string, role: string) =>
      fetchAPI<{ status: string }>(`/projects/${projectId}/members/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }),
    remove: (projectId: string, userId: string) =>
      fetchAPI<void>(`/projects/${projectId}/members/${userId}`, {
        method: "DELETE",
      }),
  },
};

export interface ChatMessage {
  role: string;
  content?: string;
  text?: string;
  tool_calls?: { id: string; name: string; arguments: Record<string, unknown> }[];
  tool_use_id?: string;
  tool_name?: string;
}

export interface ChatResponse {
  messages: ChatMessage[];
  final_text: string;
  mode?: string;
  system_prompt?: string;
}

export interface SettingsResponse {
  llm_provider: string;
  llm_model: string;
  has_anthropic_key: boolean;
  has_openai_key: boolean;
  has_google_key: boolean;
  available_providers: string[];
  provider_models: Record<string, string[]>;
}

export interface SettingsUpdate {
  llm_provider?: string;
  llm_model?: string;
  anthropic_api_key?: string;
  openai_api_key?: string;
  google_api_key?: string;
}
