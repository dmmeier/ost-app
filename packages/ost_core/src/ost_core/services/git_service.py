"""Git export service — commit tree JSONs to a remote git repo."""

import json
import re
import shutil
import subprocess
from pathlib import Path
from urllib.parse import urlparse

from pydantic import BaseModel

from ost_core.exceptions import (
    GitAuthenticationError,
    GitNotConfiguredError,
    GitOperationError,
    GitPushConflictError,
)


class GitCommitResult(BaseModel):
    commit_sha: str
    file_path: str  # relative path in repo
    branch: str
    pushed: bool
    no_changes: bool = False


def slugify(name: str) -> str:
    """Convert a name into a filesystem-safe slug."""
    s = name.lower().strip()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[\s_-]+", "-", s)
    s = s.strip("-")
    return s or "unnamed"


_AUTH_ERROR_PATTERNS = [
    "authentication failed",
    "invalid credentials",
    "could not read username",
    "terminal prompts disabled",
    "fatal: could not read password",
    "403",
    "401",
    "remote: invalid username or password",
    "support for password authentication was removed",
]


def _detect_auth_error(stderr: str) -> bool:
    """Check if git stderr output indicates an authentication failure."""
    lower = stderr.lower()
    return any(pat in lower for pat in _AUTH_ERROR_PATTERNS)


def _run_git(args: list[str], cwd: Path, timeout: int = 60) -> subprocess.CompletedProcess:
    """Run a git command and return the result. Raises GitOperationError on failure."""
    cmd = ["git"] + args
    try:
        result = subprocess.run(
            cmd,
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        if result.returncode != 0:
            if _detect_auth_error(result.stderr):
                raise GitAuthenticationError(
                    f"Git authentication failed for `git {' '.join(args)}`. "
                    "Set GIT_TOKEN in .env for HTTPS authentication, "
                    "or configure SSH keys for SSH URLs."
                )
            raise GitOperationError(
                f"`git {' '.join(args)}` failed (rc={result.returncode}): {result.stderr.strip()}"
            )
        return result
    except subprocess.TimeoutExpired:
        raise GitOperationError(f"`git {' '.join(args)}` timed out after {timeout}s")
    except FileNotFoundError:
        raise GitOperationError("git is not installed or not on PATH")
    except (GitAuthenticationError, GitOperationError, GitPushConflictError):
        raise  # re-raise our own exceptions


def _apply_token_to_url(url: str, token: str) -> str:
    """Rewrite an HTTPS URL to embed a token for authentication.

    SSH URLs are returned unchanged since they use key-based auth.
    """
    if not token:
        return url
    # Only modify HTTPS URLs
    if url.startswith("https://"):
        parsed = urlparse(url)
        return f"https://{token}@{parsed.hostname}{parsed.path}"
    return url


def _check_git_available() -> None:
    """Verify that git is available on PATH."""
    try:
        subprocess.run(
            ["git", "--version"],
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        raise GitOperationError("git is not installed or not on PATH")


def _repo_dir_for_url(remote_url: str) -> Path:
    """Compute the local repo directory from a remote URL."""
    slug = slugify(remote_url.rstrip("/").split("/")[-1].replace(".git", ""))
    return Path.home() / ".ost-app" / "git-repos" / slug


def _ensure_clone(remote_url: str, branch: str, repo_dir: Path, token: str) -> None:
    """Clone the repo if it doesn't exist locally; verify .git/ if it does."""
    if repo_dir.exists():
        git_dir = repo_dir / ".git"
        if not git_dir.is_dir():
            raise GitOperationError(
                f"Directory {repo_dir} exists but is not a git repo (no .git/)"
            )
        # Ensure we're on the right branch
        try:
            _run_git(["checkout", branch], cwd=repo_dir)
        except GitOperationError:
            # Branch doesn't exist locally — create it
            try:
                _run_git(["checkout", "-b", branch], cwd=repo_dir)
            except GitOperationError:
                pass  # Already on it or other benign failure
        return

    repo_dir.parent.mkdir(parents=True, exist_ok=True)
    auth_url = _apply_token_to_url(remote_url, token)

    # Try cloning with specific branch first; fall back to default branch
    # for empty repos or repos where the target branch doesn't exist yet
    try:
        result = subprocess.run(
            ["git", "clone", "--branch", branch, "--single-branch", auth_url, str(repo_dir)],
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode != 0:
            if _detect_auth_error(result.stderr):
                raise GitAuthenticationError(
                    "Git clone authentication failed. "
                    "Set GIT_TOKEN in .env for HTTPS authentication."
                )
            # Branch not found or empty repo — try cloning without --branch
            if repo_dir.exists():
                shutil.rmtree(repo_dir)
            result2 = subprocess.run(
                ["git", "clone", auth_url, str(repo_dir)],
                capture_output=True,
                text=True,
                timeout=120,
            )
            if result2.returncode != 0:
                if _detect_auth_error(result2.stderr):
                    raise GitAuthenticationError(
                        "Git clone authentication failed. "
                        "Set GIT_TOKEN in .env for HTTPS authentication."
                    )
                # Might be a completely empty repo — init locally and add remote
                if "empty" in result2.stderr.lower() or "warning" in result2.stderr.lower() or result2.stderr.strip() == "":
                    repo_dir.mkdir(parents=True, exist_ok=True)
                    subprocess.run(["git", "init"], cwd=str(repo_dir), capture_output=True, text=True)
                    subprocess.run(["git", "remote", "add", "origin", auth_url], cwd=str(repo_dir), capture_output=True, text=True)
                else:
                    raise GitOperationError(f"git clone failed: {result2.stderr.strip()}")
            # Now checkout or create the target branch
            if (repo_dir / ".git").is_dir():
                try:
                    _run_git(["checkout", branch], cwd=repo_dir)
                except GitOperationError:
                    try:
                        _run_git(["checkout", "-b", branch], cwd=repo_dir)
                    except GitOperationError:
                        pass  # Already on it
    except subprocess.TimeoutExpired:
        raise GitOperationError("git clone timed out after 120s")
    except FileNotFoundError:
        raise GitOperationError("git is not installed or not on PATH")
    except (GitAuthenticationError, GitOperationError):
        raise

    if not (repo_dir / ".git").is_dir():
        raise GitOperationError(f"Clone appeared to succeed but {repo_dir}/.git not found")


def commit_tree_to_git(
    tree_json: dict,
    project_name: str,
    tree_name: str,
    commit_message: str,
    remote_url: str,
    branch: str = "main",
    token: str = "",
    author_name: str = "",
    author_email: str = "",
) -> GitCommitResult:
    """Export a tree as JSON and commit + push to the configured git remote.

    Flow:
    1. Validate config
    2. Clone or verify local repo
    3. Pull latest
    4. Write JSON file
    5. Stage, commit, push (with one retry on push conflict)
    """
    if not remote_url:
        raise GitNotConfiguredError()

    _check_git_available()

    repo_dir = _repo_dir_for_url(remote_url)

    # 1. Clone or verify
    _ensure_clone(remote_url, branch, repo_dir, token)

    # 2. Configure author for this repo
    if author_name:
        _run_git(["config", "user.name", author_name], cwd=repo_dir)
    if author_email:
        _run_git(["config", "user.email", author_email], cwd=repo_dir)

    # 3. Pull latest with rebase
    try:
        _run_git(["pull", "--rebase", "origin", branch], cwd=repo_dir)
    except GitOperationError:
        # Pull may fail if remote branch has no commits yet — that's OK
        pass

    # 4. Write JSON file
    project_slug = slugify(project_name)
    tree_slug = slugify(tree_name)
    rel_path = f"{project_slug}/{tree_slug}.json"
    abs_path = repo_dir / rel_path

    abs_path.parent.mkdir(parents=True, exist_ok=True)
    abs_path.write_text(json.dumps(tree_json, indent=2, ensure_ascii=False) + "\n")

    # 5. Stage
    _run_git(["add", rel_path], cwd=repo_dir)

    # 6. Check for actual changes
    diff_result = subprocess.run(
        ["git", "diff", "--cached", "--quiet"],
        cwd=str(repo_dir),
        capture_output=True,
    )
    if diff_result.returncode == 0:
        # No changes
        head = _run_git(["rev-parse", "HEAD"], cwd=repo_dir)
        return GitCommitResult(
            commit_sha=head.stdout.strip(),
            file_path=rel_path,
            branch=branch,
            pushed=False,
            no_changes=True,
        )

    # 7. Commit
    author_flag = []
    if author_name and author_email:
        author_flag = ["--author", f"{author_name} <{author_email}>"]

    _run_git(["commit"] + author_flag + ["-m", commit_message], cwd=repo_dir)

    # 8. Push (with one retry; use -u to create remote branch if needed)
    try:
        _run_git(["push", "-u", "origin", branch], cwd=repo_dir)
    except GitAuthenticationError:
        raise  # Don't retry auth failures
    except GitOperationError:
        # Retry: pull --rebase then push again
        try:
            _run_git(["pull", "--rebase", "origin", branch], cwd=repo_dir)
            _run_git(["push", "-u", "origin", branch], cwd=repo_dir)
        except GitAuthenticationError:
            raise
        except GitOperationError as e:
            raise GitPushConflictError(
                f"Push failed after retry: {e}. Manual resolution may be required."
            )

    # 9. Get commit SHA
    head = _run_git(["rev-parse", "HEAD"], cwd=repo_dir)
    return GitCommitResult(
        commit_sha=head.stdout.strip(),
        file_path=rel_path,
        branch=branch,
        pushed=True,
    )
