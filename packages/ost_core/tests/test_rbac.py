"""Tests for Role-Based Access Control (RBAC): membership, permissions, auth-required mode."""

import os

import pytest

from ost_core.exceptions import PermissionDeniedError
from ost_core.models import ProjectCreate, UserCreate


# Set a test JWT secret before any tests run
os.environ.setdefault("OST_JWT_SECRET", "test-secret-key-for-testing")


def _register(service, email, name="Test User"):
    """Helper to register a user and return (user, token)."""
    return service.register(
        UserCreate(email=email, display_name=name, password="password123")
    )


class TestProjectOwnership:
    def test_create_project_adds_owner(self, service):
        """When create_project is called with user_id, that user becomes owner."""
        user, _ = _register(service, "owner@example.com", "Owner")
        project = service.create_project(
            ProjectCreate(name="My Project", description="desc"),
            user_id=str(user.id),
        )
        role = service.repo.get_user_role(str(user.id), str(project.id))
        assert role == "owner"


class TestEditorPermissions:
    def test_editor_can_add_node(self, service):
        """An editor should pass the permission check for 'editor' min_role."""
        owner, _ = _register(service, "owner@example.com", "Owner")
        editor, _ = _register(service, "editor@example.com", "Editor")
        project = service.create_project(
            ProjectCreate(name="Team Project", description="desc"),
            user_id=str(owner.id),
        )
        service.add_member(str(owner.id), str(project.id), "editor@example.com", "editor")

        # Should NOT raise -- editor meets the "editor" min_role requirement
        service.check_project_permission(str(editor.id), str(project.id), "editor")


class TestViewerPermissions:
    def test_viewer_cannot_add_node(self, service):
        """A viewer should fail the permission check for 'editor' min_role."""
        owner, _ = _register(service, "owner@example.com", "Owner")
        viewer, _ = _register(service, "viewer@example.com", "Viewer")
        project = service.create_project(
            ProjectCreate(name="Read-Only Project", description="desc"),
            user_id=str(owner.id),
        )
        service.add_member(str(owner.id), str(project.id), "viewer@example.com", "viewer")

        with pytest.raises(PermissionDeniedError):
            service.check_project_permission(str(viewer.id), str(project.id), "editor")


class TestNoRoleAccess:
    def test_no_role_cannot_see_project(self, service):
        """A user with no role on a project should get PermissionDeniedError."""
        owner, _ = _register(service, "owner@example.com", "Owner")
        stranger, _ = _register(service, "stranger@example.com", "Stranger")
        project = service.create_project(
            ProjectCreate(name="Private Project", description="desc"),
            user_id=str(owner.id),
        )

        with pytest.raises(PermissionDeniedError):
            service.check_project_permission(str(stranger.id), str(project.id), "viewer")


class TestMemberManagement:
    def test_owner_can_add_member(self, service):
        """An owner should be able to add a member successfully."""
        owner, _ = _register(service, "owner@example.com", "Owner")
        new_user, _ = _register(service, "new@example.com", "New User")
        project = service.create_project(
            ProjectCreate(name="Project", description="desc"),
            user_id=str(owner.id),
        )

        member = service.add_member(
            str(owner.id), str(project.id), "new@example.com", "editor"
        )
        assert member.email == "new@example.com"
        assert member.role == "editor"
        assert member.project_id == project.id

    def test_editor_cannot_add_member(self, service):
        """An editor should NOT be able to add members (requires owner)."""
        owner, _ = _register(service, "owner@example.com", "Owner")
        editor, _ = _register(service, "editor@example.com", "Editor")
        outsider, _ = _register(service, "outsider@example.com", "Outsider")
        project = service.create_project(
            ProjectCreate(name="Project", description="desc"),
            user_id=str(owner.id),
        )
        service.add_member(str(owner.id), str(project.id), "editor@example.com", "editor")

        with pytest.raises(PermissionDeniedError):
            service.add_member(
                str(editor.id), str(project.id), "outsider@example.com", "viewer"
            )

    def test_remove_member(self, service):
        """An owner should be able to remove a member."""
        owner, _ = _register(service, "owner@example.com", "Owner")
        member, _ = _register(service, "member@example.com", "Member")
        project = service.create_project(
            ProjectCreate(name="Project", description="desc"),
            user_id=str(owner.id),
        )
        service.add_member(str(owner.id), str(project.id), "member@example.com", "editor")

        # Confirm user has a role before removal
        assert service.repo.get_user_role(str(member.id), str(project.id)) == "editor"

        service.remove_member(str(owner.id), str(project.id), str(member.id))

        # After removal, user should have no role
        assert service.repo.get_user_role(str(member.id), str(project.id)) is None

    def test_cannot_remove_last_owner(self, service):
        """Removing the only owner should raise PermissionDeniedError."""
        owner, _ = _register(service, "owner@example.com", "Owner")
        _register(service, "extra@example.com", "Extra")  # Need 2 users for RBAC to activate
        project = service.create_project(
            ProjectCreate(name="Project", description="desc"),
            user_id=str(owner.id),
        )

        with pytest.raises(PermissionDeniedError, match="last owner"):
            service.remove_member(str(owner.id), str(project.id), str(owner.id))

    def test_change_role(self, service):
        """An owner should be able to change a member's role."""
        owner, _ = _register(service, "owner@example.com", "Owner")
        member, _ = _register(service, "member@example.com", "Member")
        project = service.create_project(
            ProjectCreate(name="Project", description="desc"),
            user_id=str(owner.id),
        )
        service.add_member(str(owner.id), str(project.id), "member@example.com", "editor")

        # Change from editor to viewer
        service.update_member_role(str(owner.id), str(project.id), str(member.id), "viewer")

        role = service.repo.get_user_role(str(member.id), str(project.id))
        assert role == "viewer"

    def test_list_project_members(self, service):
        """list_members should return all members with correct roles."""
        owner, _ = _register(service, "owner@example.com", "Owner")
        editor, _ = _register(service, "editor@example.com", "Editor")
        viewer, _ = _register(service, "viewer@example.com", "Viewer")
        project = service.create_project(
            ProjectCreate(name="Project", description="desc"),
            user_id=str(owner.id),
        )
        service.add_member(str(owner.id), str(project.id), "editor@example.com", "editor")
        service.add_member(str(owner.id), str(project.id), "viewer@example.com", "viewer")

        members = service.list_members(str(project.id))

        assert len(members) == 3
        roles_by_email = {m.email: m.role for m in members}
        assert roles_by_email["owner@example.com"] == "owner"
        assert roles_by_email["editor@example.com"] == "editor"
        assert roles_by_email["viewer@example.com"] == "viewer"


class TestProjectFiltering:
    def test_list_user_projects_filters(self, service):
        """A user should only see projects they have a role on."""
        user_a, _ = _register(service, "a@example.com", "User A")
        user_b, _ = _register(service, "b@example.com", "User B")

        project_a = service.create_project(
            ProjectCreate(name="Project A", description="A's project"),
            user_id=str(user_a.id),
        )
        project_b = service.create_project(
            ProjectCreate(name="Project B", description="B's project"),
            user_id=str(user_b.id),
        )

        # User A should only see Project A
        a_projects = service.list_projects(user_id=str(user_a.id))
        a_project_ids = {p.id for p in a_projects}
        assert project_a.id in a_project_ids
        assert project_b.id not in a_project_ids

        # User B should only see Project B
        b_projects = service.list_projects(user_id=str(user_b.id))
        b_project_ids = {p.id for p in b_projects}
        assert project_b.id in b_project_ids
        assert project_a.id not in b_project_ids


class TestOpenMode:
    def test_null_user_id_raises_permission_error(self, service):
        """When user_id is None, permission checks should raise PermissionDeniedError."""
        owner, _ = _register(service, "owner@example.com", "Owner")
        project = service.create_project(
            ProjectCreate(name="Open Project", description="desc"),
            user_id=str(owner.id),
        )

        # None user_id should always raise — authentication is required
        with pytest.raises(PermissionDeniedError, match="Authentication required"):
            service.check_project_permission(None, str(project.id), "viewer")
        with pytest.raises(PermissionDeniedError, match="Authentication required"):
            service.check_project_permission(None, str(project.id), "editor")
        with pytest.raises(PermissionDeniedError, match="Authentication required"):
            service.check_project_permission(None, str(project.id), "owner")


class TestSingleUserMode:
    def test_single_user_is_implicit_owner(self, service):
        """When only 1 user exists, permission checks pass for everything."""
        user, _ = _register(service, "solo@example.com", "Solo User")
        project = service.create_project(
            ProjectCreate(name="Solo Project", description="desc"),
        )  # Deliberately NOT passing user_id, so no membership row

        # Single user => implicit owner, all checks pass
        service.check_project_permission(str(user.id), str(project.id), "viewer")
        service.check_project_permission(str(user.id), str(project.id), "editor")
        service.check_project_permission(str(user.id), str(project.id), "owner")
