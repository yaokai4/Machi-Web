#!/usr/bin/env python3
"""Durable same-directory JSON replacement for JLPT generation tools."""

from __future__ import annotations

import json
import os
import stat
import tempfile
from pathlib import Path
from typing import Any


def dump_json_atomic(path: str, payload: Any, *, ensure_ascii: bool, indent: int) -> None:
    """Write JSON without exposing a partial/truncated destination on failure."""
    target = Path(path)
    parent = target.parent
    fd, temporary_name = tempfile.mkstemp(
        prefix=f".{target.name}.", suffix=".tmp", dir=str(parent)
    )
    temporary = Path(temporary_name)
    open_fd: int | None = fd
    try:
        mode = stat.S_IMODE(target.stat().st_mode) if target.exists() else 0o644
        os.fchmod(fd, mode)
        with os.fdopen(fd, "w", encoding="utf-8") as output:
            open_fd = None
            json.dump(payload, output, ensure_ascii=ensure_ascii, indent=indent)
            output.flush()
            os.fsync(output.fileno())
        os.replace(str(temporary), str(target))
    except BaseException:
        if open_fd is not None:
            os.close(open_fd)
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass
        raise
