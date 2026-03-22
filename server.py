from __future__ import annotations

import argparse
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

from backend.solver import DEFUZZ_METHODS, SolverError, solve_problem


DIST_DIR = Path(__file__).resolve().parent / "dist"
app = Flask(__name__, static_folder=str(DIST_DIR), static_url_path="")


@app.get("/api/meta")
def api_meta():
    return jsonify(
        {
            "defuzz_methods": [
                {"value": key, "label": value} for key, value in DEFUZZ_METHODS.items()
            ]
        }
    )


@app.post("/api/solve")
def api_solve():
    payload = request.get_json(silent=True) or {}
    try:
        return jsonify(solve_problem(payload))
    except SolverError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:  # pragma: no cover - defensive fallback
        return jsonify({"error": f"Непредвиденная ошибка сервера: {exc}"}), 500


@app.get("/")
def index():
    if DIST_DIR.exists():
        return send_from_directory(DIST_DIR, "index.html")
    return jsonify(
        {
            "message": "Фронтенд ещё не собран. Выполните `npm install && npm run build`, затем перезапустите сервер."
        }
    )


@app.get("/<path:path>")
def static_proxy(path: str):
    if DIST_DIR.exists() and (DIST_DIR / path).exists():
        return send_from_directory(DIST_DIR, path)
    if DIST_DIR.exists():
        return send_from_directory(DIST_DIR, "index.html")
    return index()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Сервер решателя задачи внедрения СЗИ")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=8000, type=int)
    args = parser.parse_args()
    app.run(host=args.host, port=args.port, debug=False)
