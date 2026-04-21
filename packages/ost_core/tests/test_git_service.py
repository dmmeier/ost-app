"""Tests for the git export service."""

import subprocess
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from ost_core.config import Settings
from ost_core.exceptions import (
    GitNotConfiguredError,
    GitOperationError,
    GitPushConflictError,
)
from ost_core.services.git_service import (
    GitCommitResult,
    _apply_token_to_url,
    _repo_dir_for_url,
    commit_tree_to_git,
    slugify,
)


class TestSlugify:
    def test_simple_name(self):
        assert slugify("My Project") == "my-project"

    def test_special_characters(self):
        assert slugify("Hello, World! (2024)") == "hello-world-2024"

    def test_multiple_spaces_and_dashes(self):
        assert slugify("a---b   c__d") == "a-b-c-d"

    def test_trailing_leading_dashes(self):
        assert slugify("--hello--") == "hello"

    def test_empty_string(self):
        assert slugify("") == "unnamed"

    def test_only_special_chars(self):
        assert slugify("!!!") == "unnamed"

    def test_unicode(self):
        assert slugify("über cool") == "über-cool"

    def test_numbers(self):
        assert slugify("Tree 42") == "tree-42"


class TestApplyTokenToUrl:
    def test_https_with_token(self):
        url = "https://github.com/myorg/repo.git"
        result = _apply_token_to_url(url, "ghp_abc123")
        assert result == "https://ghp_abc123@github.com/myorg/repo.git"

    def test_https_without_token(self):
        url = "https://github.com/myorg/repo.git"
        result = _apply_token_to_url(url, "")
        assert result == url

    def test_ssh_url_unchanged(self):
        url = "git@github.com:myorg/repo.git"
        result = _apply_token_to_url(url, "ghp_abc123")
        assert result == url

    def test_ssh_url_without_token(self):
        url = "git@github.com:myorg/repo.git"
        result = _apply_token_to_url(url, "")
        assert result == url


class TestRepoDirForUrl:
    def test_https_url(self):
        url = "https://github.com/myorg/ost-trees.git"
        result = _repo_dir_for_url(url)
        assert result == Path.home() / ".ost-app" / "git-repos" / "ost-trees"

    def test_ssh_url(self):
        url = "git@github.com:myorg/my-repo.git"
        result = _repo_dir_for_url(url)
        assert result == Path.home() / ".ost-app" / "git-repos" / "my-repo"


class TestCommitTreeToGit:
    """Tests for the main commit_tree_to_git function with mocked subprocess."""

    def _make_settings(self, **overrides) -> Settings:
        defaults = {
            "git_remote_url": "https://github.com/myorg/ost-trees.git",
            "git_branch": "main",
            "git_token": "",
            "user_name": "Test User",
            "user_email": "test@example.com",
        }
        defaults.update(overrides)
        return Settings(**defaults)

    @patch("ost_core.services.git_service._check_git_available")
    @patch("ost_core.services.git_service._ensure_clone")
    @patch("ost_core.services.git_service._run_git")
    @patch("subprocess.run")
    def test_happy_path(self, mock_subprocess_run, mock_run_git, mock_clone, mock_check):
        """Successful clone + commit + push."""
        # git diff --cached --quiet returns 1 (there are changes)
        mock_subprocess_run.return_value = MagicMock(returncode=1)

        # _run_git calls: config name, config email, pull, add, commit, push, rev-parse
        mock_run_git.side_effect = [
            MagicMock(),  # config user.name
            MagicMock(),  # config user.email
            MagicMock(),  # pull --rebase
            MagicMock(),  # add
            MagicMock(),  # commit
            MagicMock(),  # push
            MagicMock(stdout="abc123def456\n"),  # rev-parse HEAD
        ]

        settings = self._make_settings()
        result = commit_tree_to_git(
            tree_json={"name": "Test Tree", "nodes": []},
            project_name="My Project",
            tree_name="Test Tree",
            commit_message="Update tree",
            settings=settings,
        )

        assert isinstance(result, GitCommitResult)
        assert result.commit_sha == "abc123def456"
        assert result.file_path == "my-project/test-tree.json"
        assert result.branch == "main"
        assert result.pushed is True
        assert result.no_changes is False

    @patch("ost_core.services.git_service._check_git_available")
    @patch("ost_core.services.git_service._ensure_clone")
    @patch("ost_core.services.git_service._run_git")
    @patch("subprocess.run")
    def test_no_changes(self, mock_subprocess_run, mock_run_git, mock_clone, mock_check):
        """Tree JSON is already identical — no commit needed."""
        # git diff --cached --quiet returns 0 (no changes)
        mock_subprocess_run.return_value = MagicMock(returncode=0)

        mock_run_git.side_effect = [
            MagicMock(),  # config user.name
            MagicMock(),  # config user.email
            MagicMock(),  # pull --rebase
            MagicMock(),  # add
            MagicMock(stdout="abc123def456\n"),  # rev-parse HEAD
        ]

        settings = self._make_settings()
        result = commit_tree_to_git(
            tree_json={"name": "Test"},
            project_name="Proj",
            tree_name="Test",
            commit_message="Update",
            settings=settings,
        )

        assert result.no_changes is True
        assert result.pushed is False

    def test_not_configured(self):
        """Raises GitNotConfiguredError when git_remote_url is empty."""
        settings = self._make_settings(git_remote_url="")
        with pytest.raises(GitNotConfiguredError):
            commit_tree_to_git(
                tree_json={},
                project_name="P",
                tree_name="T",
                commit_message="msg",
                settings=settings,
            )

    @patch("ost_core.services.git_service._check_git_available")
    @patch("ost_core.services.git_service._ensure_clone")
    @patch("ost_core.services.git_service._run_git")
    @patch("subprocess.run")
    def test_push_conflict_retry_succeeds(self, mock_subprocess_run, mock_run_git, mock_clone, mock_check):
        """Push fails once, retry (pull --rebase + push) succeeds."""
        mock_subprocess_run.return_value = MagicMock(returncode=1)  # has changes

        push_fail = GitOperationError("push failed")
        mock_run_git.side_effect = [
            MagicMock(),  # config name
            MagicMock(),  # config email
            MagicMock(),  # pull
            MagicMock(),  # add
            MagicMock(),  # commit
            push_fail,    # first push fails
            MagicMock(),  # retry pull
            MagicMock(),  # retry push succeeds
            MagicMock(stdout="def456\n"),  # rev-parse
        ]

        # Need to handle that _run_git raises on push but succeeds on retry
        call_count = [0]
        original_side_effects = [
            MagicMock(),  # config name
            MagicMock(),  # config email
            MagicMock(),  # pull
            MagicMock(),  # add
            MagicMock(),  # commit
        ]

        def push_side_effect(*args, **kwargs):
            call_count[0] += 1
            if call_count[0] <= 5:
                return original_side_effects[call_count[0] - 1]
            elif call_count[0] == 6:
                raise GitOperationError("push failed")  # first push
            elif call_count[0] == 7:
                return MagicMock()  # retry pull
            elif call_count[0] == 8:
                return MagicMock()  # retry push
            else:
                return MagicMock(stdout="def456\n")  # rev-parse

        mock_run_git.side_effect = push_side_effect

        settings = self._make_settings()
        result = commit_tree_to_git(
            tree_json={"name": "T"},
            project_name="P",
            tree_name="T",
            commit_message="msg",
            settings=settings,
        )
        assert result.pushed is True
        assert result.commit_sha == "def456"

    @patch("ost_core.services.git_service._check_git_available")
    @patch("ost_core.services.git_service._ensure_clone")
    @patch("ost_core.services.git_service._run_git")
    @patch("subprocess.run")
    def test_push_conflict_retry_fails(self, mock_subprocess_run, mock_run_git, mock_clone, mock_check):
        """Push fails and retry also fails — raises GitPushConflictError."""
        mock_subprocess_run.return_value = MagicMock(returncode=1)  # has changes

        call_count = [0]

        def side_effect(*args, **kwargs):
            call_count[0] += 1
            if call_count[0] <= 5:
                return MagicMock()  # config, pull, add, commit
            elif call_count[0] == 6:
                raise GitOperationError("push failed")  # first push
            elif call_count[0] == 7:
                return MagicMock()  # retry pull
            else:
                raise GitOperationError("push failed again")  # retry push

        mock_run_git.side_effect = side_effect

        settings = self._make_settings()
        with pytest.raises(GitPushConflictError):
            commit_tree_to_git(
                tree_json={"name": "T"},
                project_name="P",
                tree_name="T",
                commit_message="msg",
                settings=settings,
            )
