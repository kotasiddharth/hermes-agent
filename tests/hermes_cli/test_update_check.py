"""Tests for the update check mechanism in hermes_cli.banner."""

import json
import os
import threading
import time
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest


def test_check_for_updates_uses_cache(tmp_path, monkeypatch):
    """When cache is fresh, check_for_updates should return cached value without calling git."""
    from hermes_cli.banner import check_for_updates
    from hermes_cli import __version__

    # Create a fake git repo and fresh cache
    repo_dir = tmp_path / "hermes-agent"
    repo_dir.mkdir()
    (repo_dir / ".git").mkdir()

    cache_file = tmp_path / ".update_check"
    cache_file.write_text(
        json.dumps({"schema": 2, "ts": time.time(), "behind": 3, "ver": __version__})
    )

    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    with patch("hermes_cli.banner.subprocess.run") as mock_run:
        result = check_for_updates()

    assert result == 3
    mock_run.assert_not_called()


def test_release_update_target_uses_newest_published_tag(tmp_path, monkeypatch):
    """A detached release checkout checks releases, never unreleased main."""
    import hermes_cli.banner as banner

    def fake_git_stdout(args, *, cwd, timeout=5):
        assert cwd == tmp_path
        if args[:3] == ["tag", "--points-at", "HEAD"]:
            return "v2026.8.3"
        raise AssertionError(f"unexpected git command: {args}")

    monkeypatch.setattr(banner, "_git_stdout", fake_git_stdout)
    monkeypatch.setattr(
        banner.subprocess,
        "run",
        lambda *args, **kwargs: MagicMock(
            returncode=0,
            stdout=(
                "a refs/tags/v2026.7.30\n"
                "b refs/tags/v2026.8.3\n"
                "c refs/tags/v2026.8.10\n"
            ),
        ),
    )

    assert banner.release_update_target(tmp_path) == ("v2026.8.3", "v2026.8.10")


def test_release_checkout_is_current_when_its_tag_is_latest(tmp_path, monkeypatch):
    """Latest tagged releases must not be flagged behind origin/main."""
    import hermes_cli.banner as banner

    monkeypatch.setattr(
        banner,
        "release_update_target",
        lambda repo_dir: ("v2026.8.3", "v2026.8.3"),
    )

    assert banner._check_via_local_git(tmp_path) == 0


def test_release_checkout_reports_only_when_a_newer_tag_exists(tmp_path, monkeypatch):
    """A release checkout reports availability for a newer published tag."""
    import hermes_cli.banner as banner

    monkeypatch.setattr(
        banner,
        "release_update_target",
        lambda repo_dir: ("v2026.8.3", "v2026.8.10"),
    )

    assert banner._check_via_local_git(tmp_path) == banner.UPDATE_AVAILABLE_NO_COUNT


def test_prefetch_non_blocking():
    """prefetch_update_check() should return immediately without blocking."""
    import hermes_cli.banner as banner

    # Reset module state
    banner._update_result = None
    banner._update_check_done = threading.Event()

    with patch.object(banner, "check_for_updates", return_value=5):
        start = time.monotonic()
        banner.prefetch_update_check()
        elapsed = time.monotonic() - start

        # Should return almost immediately (well under 1 second)
        assert elapsed < 1.0

        # Wait for the background thread to finish
        banner._update_check_done.wait(timeout=5)
        assert banner._update_result == 5
