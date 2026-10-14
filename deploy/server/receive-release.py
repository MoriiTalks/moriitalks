#!/usr/bin/env python3
"""Receive a bounded release over a restricted, unprivileged SSH command."""

from contextlib import contextmanager
from dataclasses import dataclass
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import stat
import subprocess
import sys
import tarfile
import tempfile
import time
from typing import BinaryIO, Callable
from urllib.error import URLError
from urllib.request import HTTPRedirectHandler, ProxyHandler, build_opener
import uuid


BASE = Path("/opt/moriitalks")
VERIFIER = Path("/usr/local/libexec/moriitalks-verify-release")
SERVICE = "moriitalks-api.service"
CHUNK = 1024 * 1024
HASH = re.compile(r"[0-9a-f]{64}")
ROOT_FILES = {"api", "release.json", "source-files.sha256", "source-status.txt", "SHA256SUMS"}
SAFE_ENV = {"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LANG": "C", "LC_ALL": "C"}


class DeploymentError(Exception):
    """A deployment failed without exposing payload or environment contents."""


@dataclass(frozen=True)
class Limits:
    compressed: int = 256 * 1024 * 1024
    expanded: int = 512 * 1024 * 1024
    entries: int = 20000


@dataclass(frozen=True)
class Layout:
    releases: Path
    current: Path
    previous: Path

    @property
    def lock(self):
        return self.current.parent / ".deploy.lock"


PRODUCTION = Layout(BASE / "releases", BASE / "current", BASE / "previous")


def command_hash(command: str) -> str:
    match = re.fullmatch(r"deploy ([0-9a-fA-F]{64})", command)
    if match is None:
        raise DeploymentError("Only deploy followed by one SHA-256 digest is accepted.")
    return match[1].lower()


@contextmanager
def release_lock(path: Path):
    import fcntl

    descriptor = os.open(path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        if not stat.S_ISREG(os.fstat(descriptor).st_mode):
            raise DeploymentError("Deployment lock is not a regular file.")
        fcntl.flock(descriptor, fcntl.LOCK_EX)
        yield
    finally:
        os.close(descriptor)


def spool_archive(source: BinaryIO, destination: Path, expected: str, limit: int):
    digest = hashlib.sha256()
    total = 0
    with destination.open("xb") as output:
        while True:
            chunk = source.read(min(CHUNK, limit - total + 1))
            if not chunk:
                break
            total += len(chunk)
            if total > limit:
                raise DeploymentError("Compressed release exceeds its size limit.")
            digest.update(chunk)
            output.write(chunk)
    if digest.hexdigest() != expected:
        raise DeploymentError("Release archive checksum does not match.")


class ExpansionBudget:
    def __init__(self, source: BinaryIO, limit: int):
        self.source = source
        self.limit = limit
        self.total = 0

    def read(self, size=-1):
        amount = min(CHUNK, self.limit - self.total + 1)
        if size >= 0:
            amount = min(amount, size)
        value = self.source.read(amount)
        self.total += len(value)
        if self.total > self.limit:
            raise DeploymentError("Expanded release exceeds its size limit.")
        return value


def member_path(member: tarfile.TarInfo) -> str:
    name = member.name
    if len(name) > 1024 or "\\" in name or any(ord(char) < 32 or ord(char) == 127 for char in name):
        raise DeploymentError("Unsafe archive path.")
    if name in (".", "./") and member.isdir():
        return "."
    if name.startswith("./"):
        name = name[2:]
    if member.isdir() and name.endswith("/"):
        name = name[:-1]
    parts = name.split("/")
    if any(part in ("", ".", "..") for part in parts) or name.startswith("/"):
        raise DeploymentError("Unsafe archive path.")
    root = parts[0]
    if root == "web":
        if len(parts) == 1 and not member.isdir():
            raise DeploymentError("The web entry must be a directory.")
    elif len(parts) != 1 or root not in ROOT_FILES or not member.isfile():
        raise DeploymentError("Unexpected release root entry.")
    return name


def extract_archive(archive_path: Path, staging: Path, limits: Limits):
    staging.mkdir(mode=0o700)
    seen = set()
    declared = 0
    try:
        with gzip.open(archive_path, "rb") as compressed:
            stream = ExpansionBudget(compressed, limits.expanded)
            with tarfile.open(fileobj=stream, mode="r|") as archive:
                for count, member in enumerate(archive, 1):
                    if count > limits.entries:
                        raise DeploymentError("Release contains too many archive entries.")
                    if member.type not in (tarfile.REGTYPE, tarfile.AREGTYPE, tarfile.DIRTYPE) or member.sparse is not None:
                        raise DeploymentError("Links, sparse files, and special archive entries are forbidden.")
                    name = member_path(member)
                    if name in seen:
                        raise DeploymentError("Duplicate archive path.")
                    seen.add(name)
                    if member.size < 0 or (member.isdir() and member.size != 0):
                        raise DeploymentError("Invalid archive entry size.")
                    declared += member.size
                    if declared > limits.expanded:
                        raise DeploymentError("Expanded release exceeds its size limit.")
                    if name == ".":
                        continue
                    target = staging / name
                    if member.isdir():
                        target.mkdir(mode=0o700, parents=True, exist_ok=True)
                        continue
                    target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                    payload = archive.extractfile(member)
                    if payload is None:
                        raise DeploymentError("Archive file has no payload.")
                    written = 0
                    with payload, target.open("xb") as output:
                        while True:
                            chunk = payload.read(CHUNK)
                            if not chunk:
                                break
                            output.write(chunk)
                            written += len(chunk)
                        output.flush()
                        os.fsync(output.fileno())
                    if written != member.size:
                        raise DeploymentError("Archive file is truncated.")
            # Drain the gzip tail to enforce expansion limits and validate its checksum too.
            while stream.read(CHUNK):
                pass
    except (tarfile.TarError, EOFError, gzip.BadGzipFile) as error:
        raise DeploymentError("Release is not a complete gzip tar archive.") from error
    if any(not (staging / name).is_file() for name in ROOT_FILES) or not (staging / "web").is_dir():
        raise DeploymentError("Release is missing a required root entry.")
    for directory, directories, files in os.walk(staging):
        Path(directory).chmod(0o755)
        for name in directories:
            (Path(directory) / name).chmod(0o755)
        for name in files:
            path = Path(directory) / name
            path.chmod(0o755 if path == staging / "api" else 0o644)


def verify_release(directory: Path):
    try:
        subprocess.run(
            ["/usr/bin/bash", "--noprofile", "--norc", str(VERIFIER), str(directory)],
            check=True, timeout=60, env=SAFE_ENV, stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
    except (OSError, subprocess.SubprocessError) as error:
        raise DeploymentError("Release verification failed.") from error


def restart_service():
    subprocess.run(
        ["/usr/bin/sudo", "-n", "/usr/bin/systemctl", "restart", SERVICE],
        check=True, timeout=30, env=SAFE_ENV, stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def probe_once() -> bool:
    opener = build_opener(ProxyHandler({}), NoRedirect())
    try:
        documents = []
        for path in ("/healthz", "/v2/device-talk/config"):
            with opener.open("http://127.0.0.1:8080" + path, timeout=2) as response:
                payload = response.read(65537)
                if response.status != 200 or len(payload) > 65536:
                    return False
                documents.append(json.loads(payload))
        health, config = documents
        return (
            isinstance(health, dict) and health.get("status") == "ok"
            and health.get("service") == "moriitalks-api"
            and isinstance(config, dict) and config.get("version") == 2
            and config.get("enabled") is True
        )
    except (OSError, URLError, ValueError):
        return False


def wait_healthy() -> bool:
    deadline = time.monotonic() + 30
    while True:
        if probe_once():
            return True
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return False
        time.sleep(min(0.5, remaining))


def sync_directory(path: Path):
    if os.name == "posix":
        descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)


def linked_release(link: Path, releases: Path) -> Path | None:
    if not link.is_symlink():
        if link.exists():
            raise DeploymentError("A release pointer is not a symlink.")
        return None
    try:
        target = link.resolve(strict=True)
    except OSError as error:
        raise DeploymentError("A release pointer is dangling.") from error
    if target.parent != releases.resolve() or HASH.fullmatch(target.name) is None or not target.is_dir():
        raise DeploymentError("A release pointer leaves the releases directory.")
    return target


def replace_link(link: Path, target: Path | None):
    if link.exists() and not link.is_symlink():
        raise DeploymentError("A release pointer is not a symlink.")
    if target is None:
        link.unlink(missing_ok=True)
    else:
        temporary = link.parent / ("." + link.name + "." + uuid.uuid4().hex)
        try:
            temporary.symlink_to(target, target_is_directory=True)
            os.replace(temporary, link)
        finally:
            temporary.unlink(missing_ok=True)
    sync_directory(link.parent)


def activate_release(
    layout: Layout, release: Path, restart: Callable[[], None], healthy: Callable[[], bool],
) -> str:
    old_current = linked_release(layout.current, layout.releases)
    old_previous = linked_release(layout.previous, layout.releases)
    if old_current == release and healthy():
        return "unchanged"
    last_good = old_current if old_current != release else old_previous
    if last_good is None:
        last_good = old_previous
    try:
        if old_current is not None and old_current != release:
            replace_link(layout.previous, old_current)
        replace_link(layout.current, release)
        restart()
        if not healthy():
            raise DeploymentError("The activated release did not become healthy.")
    except Exception as error:
        restored = False
        pointers_restored = False
        try:
            replace_link(layout.current, last_good)
            restored = True
            replace_link(layout.previous, old_previous)
            pointers_restored = True
        except (OSError, DeploymentError):
            pass
        rollback_healthy = False
        if restored:
            try:
                # With no earlier release, restart also stops a failed bootstrap process.
                restart()
                rollback_healthy = last_good is not None and healthy()
            except Exception:
                pass
        if pointers_restored and rollback_healthy:
            raise DeploymentError("Activation failed, the previous release was restored and is healthy.") from error
        if last_good is None and pointers_restored:
            raise DeploymentError("Initial activation failed, no previous release exists and current was removed.") from error
        raise DeploymentError("Activation failed, rollback could not be verified. Operator recovery is required.") from error
    return "activated"


def receive_release(
    source: BinaryIO, expected: str, layout: Layout = PRODUCTION, limits: Limits = Limits(),
    verify: Callable[[Path], None] = verify_release,
    restart: Callable[[], None] = restart_service,
    healthy: Callable[[], bool] = wait_healthy,
) -> str:
    if HASH.fullmatch(expected) is None:
        raise DeploymentError("Invalid release digest.")
    if not layout.releases.is_dir() or layout.releases.is_symlink():
        raise DeploymentError("The releases directory must be provisioned first.")
    with release_lock(layout.lock):
        with tempfile.TemporaryDirectory(prefix=".receive-", dir=layout.releases) as work:
            archive = Path(work) / "payload.tar.gz"
            staging = Path(work) / "release"
            spool_archive(source, archive, expected, limits.compressed)
            extract_archive(archive, staging, limits)
            verify(staging)
            destination = layout.releases / expected
            if destination.is_symlink() or (destination.exists() and not destination.is_dir()):
                raise DeploymentError("The immutable release path is not a directory.")
            if destination.exists():
                verify(destination)
                if (destination / "SHA256SUMS").read_bytes() != (staging / "SHA256SUMS").read_bytes():
                    raise DeploymentError("An existing immutable release has conflicting contents.")
            else:
                staging.rename(destination)
                sync_directory(layout.releases)
            return activate_release(layout, destination, restart, healthy)


def interrupted(_number, _frame):
    raise DeploymentError("Deployment was interrupted or exceeded its time limit.")


def main() -> int:
    try:
        import pwd

        if len(sys.argv) != 1 or os.geteuid() == 0 or pwd.getpwuid(os.geteuid()).pw_name != "morii-deploy":
            raise DeploymentError("Receiver must run as the restricted morii-deploy user.")
        expected = command_hash(os.environ.get("SSH_ORIGINAL_COMMAND", ""))
        for name in ("SIGHUP", "SIGINT", "SIGTERM", "SIGALRM"):
            signal.signal(getattr(signal, name), interrupted)
        signal.alarm(600)
        result = receive_release(sys.stdin.buffer, expected)
        print("Release " + expected + " " + result + ".")
        return 0
    except DeploymentError as error:
        print("Deployment rejected: " + str(error), file=sys.stderr)
        return 1
    except (OSError, ValueError, subprocess.SubprocessError):
        print("Deployment rejected: a filesystem or service operation failed.", file=sys.stderr)
        return 1
    finally:
        if hasattr(signal, "alarm"):
            signal.alarm(0)


if __name__ == "__main__":
    raise SystemExit(main())
