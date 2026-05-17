from __future__ import annotations

import threading
import time
import webbrowser
from pathlib import Path

from waitress import serve

from server import app


HOST = "127.0.0.1"
PORT = 8080


def _run_server() -> None:
    serve(app, host=HOST, port=PORT)


if __name__ == "__main__":
    dist_dir = Path(__file__).resolve().parent / "dist"
    has_frontend = dist_dir.exists()

    thread = threading.Thread(target=_run_server, daemon=True)
    thread.start()
    time.sleep(1.0)

    target_url = f"http://{HOST}:{PORT}" if has_frontend else f"http://{HOST}:{PORT}/api/meta"
    if not has_frontend:
        print("dist/ не найден: запускаю только API-режим. Для UI выполните: npm install && npm run build")
    webbrowser.open(target_url, new=2)

    try:
        while thread.is_alive():
            time.sleep(1.0)
    except KeyboardInterrupt:
        pass
