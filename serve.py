#!/usr/bin/env python3
"""
Kanban Python Backend Server
Zero-dependency pure Python 3 HTTP server providing static files + REST datastore API.
"""

from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import re
import signal
import subprocess
import sys
import threading
from urllib.parse import parse_qs, urlparse

PORT = int(os.environ.get("PORT", "8080"))
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT_DIR, "data")
DATA_FILE = os.path.join(DATA_DIR, "board.json")
PRIVATE_DATA_BRANCH = "private_data"

os.makedirs(DATA_DIR, exist_ok=True)

# Re-entrant lock for thread-safe datastore operations
DATA_MUTEX = threading.RLock()

# Git commit batch configuration: defaults to 12 (every dozen changes), configurable via ENV or /api/config
git_commit_batch_size = int(os.environ.get("GIT_COMMIT_BATCH_SIZE", "12"))
pending_change_count = 0

# Agent and Model details included in all git submits
AGENT_MODEL_DETAILS = "Agent: Antigravity\nModel: Gemini 4 Argon (Medium)"


def utc_now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


SAMPLE_SEED = {
    "version": 1,
    "database": "sample",
    "updatedAt": utc_now_iso(),
    "columns": [
        {"id": "backlog", "title": "Backlog", "color": "#64748b", "icon": "📥", "showInBoard": True},
        {"id": "in_progress", "title": "In Progress", "color": "#3b82f6", "icon": "⚡", "showInBoard": True},
        {"id": "in_review", "title": "In Review", "color": "#eab308", "icon": "🔍", "showInBoard": True},
        {"id": "done", "title": "Done", "color": "#22c55e", "icon": "✅", "showInBoard": True},
        {"id": "pending", "title": "Pending", "color": "#f59e0b", "icon": "⏳", "showInBoard": False},
        {"id": "archive", "title": "Archive", "color": "#475569", "icon": "📦", "showInBoard": False},
        {"id": "abandoned", "title": "Abandoned", "color": "#64748b", "icon": "🚫", "showInBoard": False},
    ],
    "tags": {
        "career": "#ec4899",
        "finance": "#10b981",
        "server": "#3b82f6",
        "mobile": "#8b5cf6",
        "responsive": "#06b6d4",
        "ux": "#f59e0b",
        "sync": "#6366f1",
    },
    "trash": [],
    "tasks": [
        {
            "id": "task-server-1",
            "title": "Server-Hosted Persistent Data Store",
            "description": "Store all columns and tasks in centralized backend JSON datastore with RESTful API for multi-device sync.",
            "columnId": "done",
            "priority": "urgent",
            "dueDate": "2026-10-16",
            "assignee": "Backend Team",
            "tags": ["server", "storage", "rest-api"],
        },
        {
            "id": "task-1",
            "title": "Pinch-to-zoom Whole Tableau Gesture",
            "description": "Implement multi-touch pinch gesture on mobile to scale the entire Kanban board so all columns fit on phone and iPad screens.",
            "columnId": "done",
            "priority": "urgent",
            "dueDate": "2026-10-15",
            "assignee": "Mobile Team",
            "tags": ["mobile", "gestures", "ux"],
        },
        {
            "id": "task-2",
            "title": "Text-Only Accessible View & Outline Editor",
            "description": "Support pure text rendering of all tasks and states with 2-way sync so users can edit or copy plain-text task lists.",
            "columnId": "done",
            "priority": "high",
            "dueDate": "2026-10-16",
            "assignee": "Frontend Team",
            "tags": ["accessibility", "text-only", "markdown"],
        },
        {
            "id": "task-3",
            "title": "Tabular List View with Real-time State Changes",
            "description": "Render responsive data table of all tasks with sorting, filtering, and instant dropdown state transitions.",
            "columnId": "done",
            "priority": "high",
            "dueDate": "2026-10-17",
            "assignee": "Data Team",
            "tags": ["table", "filtering", "views"],
        },
        {
            "id": "task-4",
            "title": "Responsive Breakpoints for Phone and iPad",
            "description": "Ensure smooth layout transitions between mobile phone portrait, iPad/tablet horizontal, and widescreen desktop.",
            "columnId": "in_progress",
            "priority": "high",
            "dueDate": "2026-10-18",
            "assignee": "UI Architect",
            "tags": ["responsive", "ipad", "css"],
        },
        {
            "id": "task-5",
            "title": 'One-Tap "Fit Tableau" Overview Mode',
            "description": "Calculate optimal zoom scale based on viewport dimensions to fit all columns cleanly in viewport.",
            "columnId": "in_progress",
            "priority": "medium",
            "dueDate": "2026-10-19",
            "assignee": "UX Lead",
            "tags": ["ux", "zoom", "canvas"],
        },
        {
            "id": "task-6",
            "title": "Multi-Device Background Sync & Polling",
            "description": "Auto-sync updates across phone, tablet, and desktop clients via server-hosted datastore polling.",
            "columnId": "in_progress",
            "priority": "medium",
            "dueDate": "2026-10-20",
            "assignee": "Fullstack Lead",
            "tags": ["sync", "realtime"],
        },
        {
            "id": "task-7",
            "title": "Dark / High-Contrast Mode Toggle",
            "description": "Provide eye-friendly dark mode and crisp high-contrast theme for low-light mobile environments.",
            "columnId": "backlog",
            "priority": "low",
            "dueDate": "2026-10-22",
            "assignee": "Design",
            "tags": ["theme", "dark-mode"],
        },
    ],
}

DEFAULT_SEED = {
    "version": 1,
    "database": "default",
    "updatedAt": utc_now_iso(),
    "columns": [dict(c) for c in SAMPLE_SEED["columns"]],
    "tags": {},
    "trash": [],
    "tasks": [],
}


def sanitize_db_name(name):
    raw = str(name or "").strip().lower()
    clean = re.sub(r"[^a-z0-9_\-]", "", raw)
    return clean if clean else "default"


def db_file_path(name):
    clean = sanitize_db_name(name)
    if clean in ("default", "board"):
        default_json = os.path.join(DATA_DIR, "default.json")
        return default_json if os.path.exists(default_json) else DATA_FILE
    return os.path.join(DATA_DIR, f"{clean}.json")


def list_databases():
    names = {"default"}
    if os.path.isdir(DATA_DIR):
        for fname in os.listdir(DATA_DIR):
            if not fname.endswith(".json") or ".tmp." in fname:
                continue
            base = fname[:-5]
            if base in ("board", "default"):
                names.add("default")
            else:
                names.add(base)
    return sorted(names)


def record_git_commit(message, target_file=None):
    """Placeholder for Git auto-commit engine (enhanced in Commit 3.2)."""
    pass


def read_board_data(db_name="default"):
    clean = sanitize_db_name(db_name)
    if clean == "board":
        clean = "default"
    target_file = db_file_path(clean)
    with DATA_MUTEX:
        if os.path.exists(target_file):
            try:
                with open(target_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                data["database"] = clean
                return data
            except Exception as e:
                sys.stderr.write(f"Error reading {target_file}: {e}. Using default seed.\n")

        if clean == "sample":
            seed = json.loads(json.dumps(SAMPLE_SEED))
        elif clean == "default":
            seed = json.loads(json.dumps(DEFAULT_SEED))
        else:
            seed = {
                "version": 1,
                "database": clean,
                "columns": [dict(c) for c in DEFAULT_SEED["columns"]],
                "tags": {},
                "favoriteTags": {},
                "trash": [],
                "tasks": [],
                "updatedAt": utc_now_iso(),
            }
        seed["database"] = clean
        write_board_data(seed, f"Initialize database [{clean}]", force_commit=True, db_name=clean)
        return seed


def write_board_data(data, commit_msg=None, force_commit=False, db_name="default"):
    global pending_change_count
    clean = sanitize_db_name(db_name)
    if clean == "board":
        clean = "default"
    target_file = db_file_path(clean)
    data["updatedAt"] = utc_now_iso()
    data["database"] = clean
    tmp_file = f"{target_file}.tmp.{os.getpid()}.{threading.get_ident()}"
    with open(tmp_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.replace(tmp_file, target_file)

    pending_change_count += 1

    if force_commit or (git_commit_batch_size > 0 and pending_change_count >= git_commit_batch_size):
        count = pending_change_count
        pending_change_count = 0
        tasks_len = len(data.get("tasks") or [])
        msg = commit_msg or f"Kanban batch update [{clean}] ({count} changes): {tasks_len} tasks ({data['updatedAt']})"
        record_git_commit(msg, target_file)

    return data


class KanbanRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT_DIR, **kwargs)

    def log_message(self, format, *args):
        # Quiet logging like WEBrick WARN level
        pass

    def send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def send_json(self, status_code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_body_text(self):
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            return ""
        return self.rfile.read(length).decode("utf-8")

    def parse_url(self):
        parsed = urlparse(self.path)
        clean_path = parsed.path.rstrip("/") or "/"
        query_raw = parse_qs(parsed.query, keep_blank_values=True)
        query = {k: v[0] if v else "" for k, v in query_raw.items()}
        return clean_path, query

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self):
        path, query = self.parse_url()
        if path == "/api/board":
            db_name = query.get("db") or "default"
            data = read_board_data(db_name)
            self.send_json(200, data)
            return
        if path == "/api/databases":
            dbs = list_databases()
            active = sanitize_db_name(query.get("active") or "default")
            self.send_json(200, {"databases": dbs, "active": active})
            return
        if path == "/api/health":
            data = read_board_data("default")
            self.send_json(
                200,
                {
                    "status": "ok",
                    "mode": "server-hosted",
                    "runtime": "python",
                    "storageFile": "data/board.json",
                    "taskCount": len(data.get("tasks") or []),
                    "columnsCount": len(data.get("columns") or []),
                    "lastUpdated": data.get("updatedAt"),
                },
            )
            return
        if path == "/api/config":
            self.send_json(
                200,
                {
                    "gitCommitBatchSize": git_commit_batch_size,
                    "pendingGitChanges": pending_change_count,
                },
            )
            return
        super().do_GET()

    def do_POST(self):
        path, query = self.parse_url()
        if path == "/api/board":
            self.handle_save_board(query)
            return
        if path == "/api/databases":
            self.handle_create_database(query)
            return
        if path == "/api/reset":
            with DATA_MUTEX:
                write_board_data(
                    json.loads(json.dumps(DEFAULT_SEED)),
                    "Reset board to default seed",
                    force_commit=True,
                    db_name="default",
                )
            self.send_json(200, {"success": True, "message": "Server board reset to default seed"})
            return
        if path == "/api/config":
            self.handle_update_config()
            return
        self.send_json(404, {"error": "Not found"})

    def do_PUT(self):
        path, query = self.parse_url()
        if path == "/api/board":
            self.handle_save_board(query)
            return
        self.send_json(404, {"error": "Not found"})

    def do_DELETE(self):
        path, query = self.parse_url()
        if path == "/api/databases":
            self.handle_delete_database(query)
            return
        self.send_json(404, {"error": "Not found"})

    def handle_save_board(self, query):
        try:
            body_text = self.read_body_text()
            payload = json.loads(body_text)
            if not isinstance(payload, dict) or not isinstance(payload.get("tasks"), list):
                self.send_json(400, {"error": "Invalid payload: tasks array required"})
                return

            raw_db = (
                payload.get("database")
                if payload.get("database") and str(payload.get("database")).strip()
                else query.get("db")
            )
            clean_db = sanitize_db_name(raw_db)
            if clean_db == "board":
                clean_db = "default"
            target_file = db_file_path(clean_db)

            with DATA_MUTEX:
                current = {}
                if os.path.exists(target_file):
                    try:
                        with open(target_file, "r", encoding="utf-8") as f:
                            current = json.load(f)
                    except Exception:
                        current = {}
                columns = payload.get("columns") or current.get("columns") or DEFAULT_SEED["columns"]
                tags = payload["tags"] if "tags" in payload else (current.get("tags") or {})
                fav_tags = payload["favoriteTags"] if "favoriteTags" in payload else (current.get("favoriteTags") or {})
                trash = payload.get("trash") or current.get("trash") or []
                data = {
                    "version": 1,
                    "database": clean_db,
                    "columns": columns,
                    "tasks": payload["tasks"],
                    "tags": tags,
                    "favoriteTags": fav_tags,
                    "trash": trash,
                    "updatedAt": utc_now_iso(),
                }
                updated = write_board_data(data, db_name=clean_db)

            self.send_json(
                200,
                {
                    "success": True,
                    "database": clean_db,
                    "count": len(updated["tasks"]),
                    "updatedAt": updated["updatedAt"],
                },
            )
        except Exception as e:
            self.send_json(500, {"error": str(e)})

    def handle_create_database(self, query):
        try:
            body_text = self.read_body_text()
            payload = json.loads(body_text) if body_text.strip() else {}
            raw_name = str(payload.get("name") or query.get("name") or "").strip()
            name = re.sub(r"[^a-z0-9_\-]", "", raw_name.lower())
            if not name or name in ("default", "board"):
                self.send_json(
                    400,
                    {"error": "Invalid database name: cannot create or overwrite 'default' database"},
                )
                return

            copy_from = payload.get("copyFrom") or query.get("copyFrom")
            with DATA_MUTEX:
                if copy_from and copy_from != "none" and str(copy_from).strip() != "":
                    clean_copy = sanitize_db_name(copy_from)
                    if clean_copy == "board":
                        clean_copy = "default"
                    copy_file = db_file_path(clean_copy)
                    source_data = DEFAULT_SEED
                    if os.path.exists(copy_file):
                        try:
                            with open(copy_file, "r", encoding="utf-8") as f:
                                source_data = json.load(f)
                        except Exception:
                            source_data = DEFAULT_SEED
                    seed = {
                        "version": 1,
                        "database": name,
                        "columns": source_data.get("columns") or DEFAULT_SEED["columns"],
                        "tags": source_data.get("tags") or {},
                        "favoriteTags": source_data.get("favoriteTags") or {},
                        "trash": [],
                        "tasks": [dict(t) if isinstance(t, dict) else t for t in (source_data.get("tasks") or [])],
                        "updatedAt": utc_now_iso(),
                    }
                    write_board_data(
                        seed,
                        f"Kanban create database [{name}] (copied from {clean_copy})",
                        force_commit=True,
                        db_name=name,
                    )
                else:
                    seed = {
                        "version": 1,
                        "database": name,
                        "columns": [dict(c) for c in DEFAULT_SEED["columns"]],
                        "tags": {},
                        "favoriteTags": {},
                        "trash": [],
                        "tasks": [],
                        "updatedAt": utc_now_iso(),
                    }
                    write_board_data(
                        seed,
                        f"Kanban create empty database [{name}]",
                        force_commit=True,
                        db_name=name,
                    )

            self.send_json(
                200,
                {
                    "success": True,
                    "name": name,
                    "copyFrom": copy_from,
                    "databases": list_databases(),
                },
            )
        except Exception as e:
            self.send_json(400, {"error": str(e)})

    def handle_delete_database(self, query):
        raw_name = str(query.get("name") or "").strip()
        if not raw_name:
            body_text = self.read_body_text()
            if body_text.strip():
                try:
                    body_json = json.loads(body_text)
                    raw_name = str(body_json.get("name") or "").strip()
                except Exception:
                    raw_name = ""

        name = re.sub(r"[^a-z0-9_\-]", "", raw_name.lower())
        if not name or name in ("default", "board"):
            self.send_json(400, {"error": "Cannot delete default database"})
            return

        target_file = db_file_path(name)
        with DATA_MUTEX:
            if os.path.exists(target_file):
                os.remove(target_file)
                record_git_commit(f"Kanban delete database [{name}]", target_file)

        self.send_json(200, {"success": True, "name": name, "databases": list_databases()})

    def handle_update_config(self):
        global git_commit_batch_size
        try:
            body_text = self.read_body_text() or "{}"
            payload = json.loads(body_text)
            if "gitCommitBatchSize" in payload:
                new_size = int(payload["gitCommitBatchSize"])
                git_commit_batch_size = max(new_size, 1)
            if payload.get("forceCommit") and pending_change_count > 0:
                with DATA_MUTEX:
                    data = read_board_data("default")
                    write_board_data(data, "Manual forced git commit", force_commit=True, db_name="default")
            self.send_json(
                200,
                {
                    "success": True,
                    "gitCommitBatchSize": git_commit_batch_size,
                    "pendingGitChanges": pending_change_count,
                },
            )
        except Exception as e:
            self.send_json(400, {"error": str(e)})


def run_server():
    desired_port = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    server = None
    active_port = desired_port

    while active_port <= desired_port + 10:
        try:
            server = ThreadingHTTPServer(("0.0.0.0", active_port), KanbanRequestHandler)
            break
        except OSError as e:
            sys.stderr.write(
                f"Notice: Port {active_port} is already in use by another process ({e}). Trying {active_port + 1}...\n"
            )
            active_port += 1

    if not server:
        raise RuntimeError(f"Could not find an available port between {desired_port} and {desired_port + 10}.")

    def handle_shutdown(signum, frame):
        if pending_change_count > 0:
            record_git_commit(f"Final Kanban batch update ({pending_change_count} changes on shutdown)")
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGINT, handle_shutdown)
    signal.signal(signal.SIGTERM, handle_shutdown)

    read_board_data("default")
    read_board_data("sample")

    print("=======================================================")
    print("  Kanban Python Server-Hosted Datastore Ready!")
    print(f"  Access the App at: http://localhost:{active_port}")
    print(f"  Datastore File: {DATA_FILE}")
    print(f"  - REST API: http://localhost:{active_port}/api/board")
    print(f"  - Health Check: http://localhost:{active_port}/api/health")
    print("=======================================================")

    server.serve_forever()


if __name__ == "__main__":
    run_server()
