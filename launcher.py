from __future__ import annotations

import threading
import time
import webbrowser
from pathlib import Path

from waitress import serve

from server import app


HOST = "127.0.0.1"
PORT = 8000


def _run_server() -> None:
    serve(app, host=HOST, port=PORT)


if __name__ == "__main__":
    dist_dir = Path(__file__).resolve().parent / "dist"
    if not dist_dir.exists():
        raise SystemExit("Сначала соберите фронтенд: npm install && npm run build")

    thread = threading.Thread(target=_run_server, daemon=True)
    thread.start()
    time.sleep(1.0)
    webbrowser.open(f"http://{HOST}:{PORT}", new=2)

    try:
        while thread.is_alive():
            time.sleep(1.0)
    except KeyboardInterrupt:
        pass
