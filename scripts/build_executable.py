from __future__ import annotations

import platform
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SEPARATOR = ";" if platform.system() == "Windows" else ":"


def main() -> int:
    dist_dir = ROOT / "dist"
    if not dist_dir.exists():
        raise SystemExit("Сначала соберите фронтенд командой `npm run build`.")

    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--name",
        "szi-optimizer",
        "--onefile",
        "--add-data",
        f"{dist_dir}{SEPARATOR}dist",
        "launcher.py",
    ]
    return subprocess.call(cmd, cwd=ROOT)


if __name__ == "__main__":
    raise SystemExit(main())
