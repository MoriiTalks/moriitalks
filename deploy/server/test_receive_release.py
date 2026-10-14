"""Local receiver tests, no SSH, real service restart, provider, or deployment host calls."""

import gzip
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location("receive_release", Path(__file__).with_name("receive-release.py"))
receiver = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = receiver
SPEC.loader.exec_module(receiver)


def fixture_files():
    header = bytearray(64)
    header[:6] = b"\x7fELF\x02\x01"
    header[18:20] = b"\x3e\x00"
    sources = b"0" * 64 + b"  fixture-source\n"
    files = {
        "api": bytes(header),
        "source-files.sha256": sources,
        "source-status.txt": b"",
        "web/index.html": b"<html>Home</html>",
        "web/talk.html": b"<html>Talk</html>",
        "web/practice.html": b"<html>Practice</html>",
        "web/_expo/static/js/web/main.js": b"console.log('fixture');",
        "web/assets/portrait.png": b"fixture image",
    }
    files["release.json"] = json.dumps({
        "schemaVersion": 1, "gitSha": "a" * 40, "dirty": False,
        "sourceFingerprint": hashlib.sha256(sources).hexdigest(),
        "target": "linux/amd64", "frontendAPI": "same-origin",
    }, indent=2).encode() + b"\n"
    files["SHA256SUMS"] = b"".join(
        (hashlib.sha256(data).hexdigest() + "  ./" + name + "\n").encode()
        for name, data in sorted(files.items())
    )
    return files


def archive_bytes(entries=None):
    if entries is None:
        entries = [("./" + name, data, tarfile.REGTYPE) for name, data in fixture_files().items()]
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w") as archive:
        root = tarfile.TarInfo(".")
        root.type = tarfile.DIRTYPE
        archive.addfile(root)
        for name, data, kind in entries:
            member = tarfile.TarInfo(name)
            member.type = kind
            member.mode = 0o7777
            member.linkname = "../../outside"
            member.size = len(data) if kind in (tarfile.REGTYPE, tarfile.AREGTYPE) else 0
            archive.addfile(member, io.BytesIO(data) if member.isfile() else None)
    return gzip.compress(buffer.getvalue(), mtime=0)


class ReceiverTests(unittest.TestCase):
    def setUp(self):
        self.work = tempfile.TemporaryDirectory()
        self.addCleanup(self.work.cleanup)
        self.base = Path(self.work.name)
        self.layout = receiver.Layout(self.base / "releases", self.base / "current", self.base / "previous")
        self.layout.releases.mkdir()
        self.restarts = []
        self.verified = []

    def release(self, character):
        path = self.layout.releases / (character * 64)
        path.mkdir()
        (path / "api").write_bytes(b"legacy fixture")
        return path

    def restart(self):
        self.restarts.append(receiver.linked_release(self.layout.current, self.layout.releases))

    def receive(self, payload=None, **options):
        payload = archive_bytes() if payload is None else payload
        arguments = {
            "layout": self.layout, "verify": self.verified.append,
            "restart": self.restart, "healthy": lambda: True,
        }
        arguments.update(options)
        return receiver.receive_release(io.BytesIO(payload), hashlib.sha256(payload).hexdigest(), **arguments)

    def assert_staging_clean(self):
        self.assertEqual(list(self.layout.releases.glob(".receive-*")), [])

    def test_only_one_deploy_hash_command_is_accepted(self):
        self.assertEqual(receiver.command_hash("deploy " + "A" * 64), "a" * 64)
        for command in ("", "deploy", "deploy " + "a" * 63, "deploy " + "g" * 64,
                        "deploy " + "a" * 64 + "; id", "deploy " + "a" * 64 + "\n",
                        "deploy  " + "a" * 64, "rollback " + "a" * 64, "deploy ../outside"):
            with self.subTest(command=command), self.assertRaises(receiver.DeploymentError):
                receiver.command_hash(command)

    def test_archive_hash_is_checked_before_extract_or_verification(self):
        with self.assertRaisesRegex(receiver.DeploymentError, "checksum"):
            receiver.receive_release(io.BytesIO(archive_bytes()), "0" * 64, self.layout,
                                     verify=self.verified.append, restart=self.restart, healthy=lambda: True)
        self.assertEqual(self.verified, [])
        self.assertEqual(self.restarts, [])
        self.assert_staging_clean()

    def test_compressed_expanded_and_entry_limits_fail_closed(self):
        for limits in (receiver.Limits(compressed=64), receiver.Limits(expanded=1024), receiver.Limits(entries=2)):
            with self.subTest(limits=limits), self.assertRaises(receiver.DeploymentError):
                self.receive(limits=limits)
            self.assert_staging_clean()
        self.assertEqual(self.verified, [])

    def test_gzip_tail_is_drained_even_after_tar_end(self):
        payload = archive_bytes() + gzip.compress(b"0" * (1024 * 1024))
        with self.assertRaisesRegex(receiver.DeploymentError, "Expanded"):
            self.receive(payload, limits=receiver.Limits(expanded=128 * 1024))
        self.assert_staging_clean()

    def test_declared_large_file_is_rejected_without_allocating_its_contents(self):
        member = tarfile.TarInfo("api")
        member.size = 513 * 1024 * 1024
        payload = gzip.compress(member.tobuf())
        with self.assertRaisesRegex(receiver.DeploymentError, "Expanded"):
            self.receive(payload)
        self.assert_staging_clean()

    def test_malformed_truncated_and_missing_root_archives_are_rejected(self):
        for payload in (b"not gzip", archive_bytes()[:-6], archive_bytes([])):
            with self.subTest(size=len(payload)), self.assertRaises(receiver.DeploymentError):
                self.receive(payload)
            self.assert_staging_clean()

    def test_traversal_absolute_controls_unknown_roots_and_duplicates_are_rejected(self):
        valid = [(name, data, tarfile.REGTYPE) for name, data in fixture_files().items()]
        for name in ("../outside", "/outside", "web/../../outside", "./web/../outside", "web/./file",
                     "web//file", "web\\outside", "web/file\nname", "web/file\rname", "web/file\x7fname",
                     "unknown", "api/child", "././api", "SHA256SUMS/child", "api"):
            with self.subTest(name=name), self.assertRaises((receiver.DeploymentError, OSError)):
                self.receive(archive_bytes(valid + [(name, b"unsafe", tarfile.REGTYPE)]))
            self.assert_staging_clean()
        with self.assertRaisesRegex(receiver.DeploymentError, "Duplicate"):
            self.receive(archive_bytes(valid + [("./api", b"duplicate", tarfile.REGTYPE)]))
        self.assertFalse((self.base / "outside").exists())
        self.assertEqual(self.verified, [])

    def test_symlinks_hardlinks_devices_fifos_and_sparse_entries_are_rejected(self):
        valid = [(name, data, tarfile.REGTYPE) for name, data in fixture_files().items()]
        for kind in (tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.CHRTYPE, tarfile.BLKTYPE,
                     tarfile.FIFOTYPE, tarfile.GNUTYPE_SPARSE):
            with self.subTest(kind=kind), self.assertRaises(receiver.DeploymentError):
                self.receive(archive_bytes(valid + [("web/special", b"", kind)]))
            self.assert_staging_clean()

    def test_untrusted_modes_are_normalized_and_staging_is_removed_on_success(self):
        self.assertEqual(self.receive(), "activated")
        current = self.layout.current.resolve()
        self.assertEqual(current.name, hashlib.sha256(archive_bytes()).hexdigest())
        self.assertEqual((current / "api").read_bytes(), fixture_files()["api"])
        if os.name == "posix":
            self.assertEqual(stat.S_IMODE((current / "api").stat().st_mode), 0o755)
            self.assertEqual(stat.S_IMODE((current / "release.json").stat().st_mode), 0o644)
            self.assertEqual(stat.S_IMODE((current / "web").stat().st_mode), 0o755)
        self.assertEqual(self.restarts, [current])
        self.assertFalse(self.layout.previous.exists())
        self.assert_staging_clean()

    def test_previous_changes_to_last_current_only_after_valid_payload(self):
        older, current = self.release("0"), self.release("1")
        receiver.replace_link(self.layout.previous, older)
        receiver.replace_link(self.layout.current, current)
        self.receive()
        self.assertEqual(self.layout.previous.resolve(), current)
        self.assertNotEqual(self.layout.current.resolve(), current)
        self.assert_staging_clean()

    def test_verifier_failure_preserves_existing_pointers(self):
        older, current = self.release("0"), self.release("1")
        receiver.replace_link(self.layout.previous, older)
        receiver.replace_link(self.layout.current, current)
        def fail(_path):
            raise receiver.DeploymentError("Fixture verification failed")
        with self.assertRaises(receiver.DeploymentError):
            self.receive(verify=fail)
        self.assertEqual(self.layout.current.resolve(), current)
        self.assertEqual(self.layout.previous.resolve(), older)
        self.assertEqual(self.restarts, [])
        self.assert_staging_clean()

    def test_failed_health_restores_both_pointers_and_restarts_last_good_api_only_release(self):
        older, current = self.release("0"), self.release("1")
        receiver.replace_link(self.layout.previous, older)
        receiver.replace_link(self.layout.current, current)
        health = iter([False, True])
        with self.assertRaisesRegex(receiver.DeploymentError, "restored and is healthy"):
            self.receive(healthy=lambda: next(health))
        self.assertEqual(self.layout.current.resolve(), current)
        self.assertEqual(self.layout.previous.resolve(), older)
        self.assertEqual(self.restarts[-1], current)
        self.assertEqual(len(self.restarts), 2)
        self.assert_staging_clean()

    def test_restart_exception_rolls_back_and_rollback_failure_is_reported(self):
        current = self.release("1")
        receiver.replace_link(self.layout.current, current)
        def first_restart_fails():
            self.restart()
            if len(self.restarts) == 1:
                raise OSError("Fixture restart failure")
        with self.assertRaisesRegex(receiver.DeploymentError, "restored and is healthy"):
            self.receive(restart=first_restart_fails)
        self.assertEqual(self.layout.current.resolve(), current)
        self.restarts.clear()
        def rollback_restart_fails():
            self.restart()
            if len(self.restarts) == 2:
                raise OSError("Fixture rollback failure")
        with self.assertRaisesRegex(receiver.DeploymentError, "Operator recovery"):
            self.receive(restart=rollback_restart_fails, healthy=lambda: False)
        self.assertEqual(self.layout.current.resolve(), current)
        self.assert_staging_clean()

    def test_first_bootstrap_failure_removes_current_and_does_not_claim_a_rollback(self):
        with self.assertRaisesRegex(receiver.DeploymentError, "no previous release"):
            self.receive(healthy=lambda: False)
        self.assertFalse(self.layout.current.is_symlink())
        self.assertFalse(self.layout.previous.is_symlink())
        self.assertEqual(len(self.restarts), 2)
        self.assertIsNone(self.restarts[-1])
        self.assert_staging_clean()

    def test_same_hash_is_verified_and_idempotent_without_unnecessary_restart(self):
        payload = archive_bytes()
        self.assertEqual(self.receive(payload), "activated")
        current = self.layout.current.resolve()
        before = (current / "api").stat().st_mtime_ns
        self.assertEqual(self.receive(payload), "unchanged")
        self.assertEqual(len(self.restarts), 1)
        self.assertEqual((current / "api").stat().st_mtime_ns, before)
        self.assertEqual(self.verified[-1], current)
        (current / "SHA256SUMS").write_bytes(b"conflict")
        with self.assertRaisesRegex(receiver.DeploymentError, "conflicting"):
            self.receive(payload)
        self.assertEqual(self.layout.current.resolve(), current)
        self.assert_staging_clean()

    def test_existing_pointer_outside_release_directory_is_never_replaced(self):
        outside = self.base / ("e" * 64)
        outside.mkdir()
        self.layout.current.symlink_to(outside, target_is_directory=True)
        with self.assertRaisesRegex(receiver.DeploymentError, "leaves"):
            self.receive()
        self.assertEqual(self.layout.current.resolve(), outside)
        self.assertEqual(self.restarts, [])
        self.assert_staging_clean()

    def test_atomic_pointer_failure_restores_previous_without_leaving_temporary_links(self):
        older, current = self.release("0"), self.release("1")
        receiver.replace_link(self.layout.previous, older)
        receiver.replace_link(self.layout.current, current)
        original = os.replace
        failed = False
        def replace(source, destination):
            nonlocal failed
            if destination == self.layout.current and not failed:
                failed = True
                raise OSError("Fixture rename failure")
            return original(source, destination)
        with patch.object(receiver.os, "replace", replace), self.assertRaises(receiver.DeploymentError):
            self.receive()
        self.assertEqual(self.layout.current.resolve(), current)
        self.assertEqual(self.layout.previous.resolve(), older)
        self.assertEqual(list(self.base.glob(".current.*")), [])
        self.assertEqual(list(self.base.glob(".previous.*")), [])
        self.assert_staging_clean()

    def test_verifier_and_restart_commands_are_fixed_and_do_not_inherit_environment(self):
        with patch.object(receiver.subprocess, "run") as run:
            receiver.verify_release(self.base)
            receiver.restart_service()
        verify, restart = run.call_args_list
        self.assertEqual(verify.args[0], ["/usr/bin/bash", "--noprofile", "--norc",
                                        "/usr/local/libexec/moriitalks-verify-release", str(self.base)])
        self.assertEqual(restart.args[0], ["/usr/bin/sudo", "-n", "/usr/bin/systemctl", "restart", "moriitalks-api.service"])
        self.assertEqual(verify.kwargs["env"], receiver.SAFE_ENV)
        self.assertEqual(restart.kwargs["env"], receiver.SAFE_ENV)
        self.assertNotIn("BASH_ENV", verify.kwargs["env"])

    def test_health_requires_both_correct_service_and_enabled_device_configuration(self):
        class Response(io.BytesIO):
            status = 200
        class Opener:
            def __init__(self, documents):
                self.documents = iter(documents)
                self.urls = []
            def open(self, url, timeout):
                self.urls.append(url)
                return Response(json.dumps(next(self.documents)).encode())
        for enabled in (True, False):
            opener = Opener([{"status": "ok", "service": "moriitalks-api"}, {"version": 2, "enabled": enabled}])
            with patch.object(receiver, "build_opener", return_value=opener):
                self.assertEqual(receiver.probe_once(), enabled)
            self.assertEqual(opener.urls, ["http://127.0.0.1:8080/healthz", "http://127.0.0.1:8080/v2/device-talk/config"])
        self.assertIsNone(receiver.NoRedirect().redirect_request(None, None, 302, "", {}, "https://untrusted.example"))

    @unittest.skipUnless(os.name == "posix", "Production receiver uses Linux flock")
    def test_flock_excludes_a_second_deployment(self):
        import fcntl
        with receiver.release_lock(self.layout.lock):
            descriptor = os.open(self.layout.lock, os.O_RDWR)
            try:
                with self.assertRaises(BlockingIOError):
                    fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
            finally:
                os.close(descriptor)


if __name__ == "__main__":
    unittest.main()
