#!/usr/bin/env python3
"""
Kanban Python Backend Server.

Zero-dependency pure Python 3 HTTP server providing static asset serving and a
RESTful JSON datastore API with multi-database support and isolated Git auto-commits
to the `private_data` branch.
"""

import copy
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import re
import signal
import subprocess
import sys
import threading
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import parse_qs, urlparse

PORT: int = int(os.environ.get("PORT", "8080"))
ROOT_DIR: str = os.path.dirname(os.path.abspath(__file__))
DATA_DIR: str = os.path.join(ROOT_DIR, "data")
DATA_FILE: str = os.path.join(DATA_DIR, "board.json")
PRIVATE_DATA_BRANCH: str = "private_data"
PROTECTED_DB_NAMES: Tuple[str, ...] = ("default", "board")

os.makedirs(DATA_DIR, exist_ok=True)

# Re-entrant lock for thread-safe file & git operations
DATA_MUTEX = threading.RLock()

# Git commit batch configuration: defaults to 12 (every dozen changes), configurable via ENV or /api/config
git_commit_batch_size: int = int(os.environ.get("GIT_COMMIT_BATCH_SIZE", "12"))
pending_change_count: int = 0

# Agent and Model details included in all git submits
AGENT_MODEL_DETAILS: str = "Agent: Antigravity\nModel: Gemini 4 Argon (Medium)"


def utc_now_iso() -> str:
    """Return current UTC timestamp formatted in ISO-8601 (`YYYY-MM-DDTHH:MM:SSZ`)."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


SAMPLE_SEED: Dict[str, Any] = {
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

DEFAULT_SEED: Dict[str, Any] = {
    "version": 1,
    "database": "default",
    "updatedAt": utc_now_iso(),
    "columns": copy.deepcopy(SAMPLE_SEED["columns"]),
    "tags": {},
    "trash": [],
    "tasks": [],
}


def sanitize_db_name(name: Optional[Any]) -> str:
    """Sanitize a database identifier to lowercase alphanumeric, underscore, or hyphen."""
    raw = str(name or "").strip().lower()
    clean = re.sub(r"[^a-z0-9_\-]", "", raw)
    return clean if clean else "default"


def normalize_db_alias(name: Optional[Any]) -> str:
    """Normalize 'board' or empty database names to 'default'."""
    clean = sanitize_db_name(name)
    return "default" if clean == "board" else clean


def db_file_path(name: Optional[Any]) -> str:
    """Resolve the JSON datastore path for the given database name."""
    clean = sanitize_db_name(name)
    if clean in PROTECTED_DB_NAMES:
        default_json = os.path.join(DATA_DIR, "default.json")
        return default_json if os.path.exists(default_json) else DATA_FILE
    return os.path.join(DATA_DIR, f"{clean}.json")


def list_databases() -> List[str]:
    """List all available JSON databases in `data/`, always including `'default'`."""
    names = {"default"}
    if os.path.isdir(DATA_DIR):
        for fname in os.listdir(DATA_DIR):
            if not fname.endswith(".json") or ".tmp." in fname:
                continue
            base = fname[:-5]
            if base in PROTECTED_DB_NAMES:
                names.add("default")
            else:
                names.add(base)
    return sorted(names)


def build_empty_database_seed(db_name: str) -> Dict[str, Any]:
    """Construct a clean empty database seed dictionary for `db_name`."""
    return {
        "version": 1,
        "database": db_name,
        "columns": copy.deepcopy(DEFAULT_SEED["columns"]),
        "tags": {},
        "favoriteTags": {},
        "trash": [],
        "tasks": [],
        "updatedAt": utc_now_iso(),
    }


def record_git_commit(message: str, target_file: Optional[str] = None) -> Optional[str]:
    """
    Commit `data/*.json` changes exclusively to the `private_data` branch without
    modifying the `main` branch or the default working tree index.
    """
    git_dir = os.path.join(ROOT_DIR, ".git")
    if not os.path.isdir(git_dir):
        return None
    try:
        file_to_commit = os.path.abspath(target_file or DATA_FILE)
        rel_path = os.path.relpath(file_to_commit, ROOT_DIR)
        idx_file = os.path.join(git_dir, "private_data.index")
        env = os.environ.copy()
        env["GIT_INDEX_FILE"] = idx_file

        ref_name = f"refs/heads/{PRIVATE_DATA_BRANCH}"
        parent_res = subprocess.run(
            ["git", "-C", ROOT_DIR, "rev-parse", "--verify", "-q", ref_name],
            env=env,
            capture_output=True,
            text=True,
        )
        parent_commit = parent_res.stdout.strip() if parent_res.returncode == 0 else None

        if parent_commit:
            subprocess.run(
                ["git", "-C", ROOT_DIR, "read-tree", parent_commit],
                env=env,
                capture_output=True,
                check=False,
            )
        elif os.path.exists(idx_file):
            os.remove(idx_file)

        if os.path.exists(file_to_commit):
            subprocess.run(
                ["git", "-C", ROOT_DIR, "add", "-f", "--", rel_path],
                env=env,
                capture_output=True,
                check=False,
            )
        else:
            subprocess.run(
                ["git", "-C", ROOT_DIR, "rm", "-f", "--ignore-unmatch", "--cached", "--", rel_path],
                env=env,
                capture_output=True,
                check=False,
            )

        tree_res = subprocess.run(
            ["git", "-C", ROOT_DIR, "write-tree"],
            env=env,
            capture_output=True,
            text=True,
            check=True,
        )
        new_tree = tree_res.stdout.strip()

        if parent_commit:
            parent_tree_res = subprocess.run(
                ["git", "-C", ROOT_DIR, "rev-parse", f"{parent_commit}^{{tree}}"],
                env=env,
                capture_output=True,
                text=True,
            )
            if parent_tree_res.returncode == 0 and parent_tree_res.stdout.strip() == new_tree:
                return parent_commit

        full_message = f"{message}\n\n{AGENT_MODEL_DETAILS}"
        commit_cmd = ["git", "-C", ROOT_DIR, "commit-tree", new_tree]
        if parent_commit:
            commit_cmd.extend(["-p", parent_commit])
        commit_cmd.extend(["-m", full_message])

        commit_res = subprocess.run(
            commit_cmd,
            env=env,
            capture_output=True,
            text=True,
            check=True,
        )
        new_commit = commit_res.stdout.strip()
        subprocess.run(
            ["git", "-C", ROOT_DIR, "update-ref", ref_name, new_commit],
            env=env,
            capture_output=True,
            check=True,
        )
        return new_commit
    except Exception:
        # Non-fatal if git is unavailable or encounters an error
        return None


def read_board_data(db_name: str = "default") -> Dict[str, Any]:
    """Load board JSON data for `db_name`, initializing its seed file if missing."""
    clean = normalize_db_alias(db_name)
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
            seed = copy.deepcopy(SAMPLE_SEED)
        elif clean == "default":
            seed = copy.deepcopy(DEFAULT_SEED)
        else:
            seed = build_empty_database_seed(clean)
        seed["database"] = clean
        write_board_data(seed, f"Initialize database [{clean}]", force_commit=True, db_name=clean)
        return seed


def write_board_data(
    data: Dict[str, Any],
    commit_msg: Optional[str] = None,
    force_commit: bool = False,
    db_name: str = "default",
) -> Dict[str, Any]:
    """Atomically write `data` to disk and conditionally record a Git commit on `private_data`."""
    global pending_change_count
    clean = normalize_db_alias(db_name)
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
    """HTTP request handler serving both REST API endpoints and static frontend files."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=ROOT_DIR, **kwargs)

    def log_message(self, format: str, *args: Any) -> None:
        """Suppress per-request stdout noise during normal operation and tests."""
        pass

    def send_cors_headers(self) -> None:
        """Attach permissive CORS headers for local and cross-device access."""
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def send_json(self, status_code: int, payload: Dict[str, Any]) -> None:
        """Serialize `payload` as UTF-8 JSON and write the HTTP response."""
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_body_text(self) -> str:
        """Read and decode the request body according to `Content-Length`."""
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            return ""
        return self.rfile.read(length).decode("utf-8")

    def parse_url(self) -> Tuple[str, Dict[str, str]]:
        """Parse `self.path` into a normalized route path and single-value query dict."""
        parsed = urlparse(self.path)
        clean_path = parsed.path.rstrip("/") or "/"
        query_raw = parse_qs(parsed.query, keep_blank_values=True)
        query = {k: v[0] if v else "" for k, v in query_raw.items()}
        return clean_path, query

    def do_OPTIONS(self) -> None:
        """Handle CORS preflight requests."""
        self.send_response(204)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self) -> None:
        """Route GET requests for API endpoints or fall back to static file serving."""
        path, query = self.parse_url()
        if path == "/api/board":
            db_name = query.get("db") or "default"
            self.send_json(200, read_board_data(db_name))
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

    def do_POST(self) -> None:
        """Route POST requests for board save, database creation, reset, and config."""
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
                    copy.deepcopy(DEFAULT_SEED),
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

    def do_PUT(self) -> None:
        """Route PUT requests to save board state."""
        path, query = self.parse_url()
        if path == "/api/board":
            self.handle_save_board(query)
            return
        self.send_json(404, {"error": "Not found"})

    def do_DELETE(self) -> None:
        """Route DELETE requests to remove a non-default database."""
        path, query = self.parse_url()
        if path == "/api/databases":
            self.handle_delete_database(query)
            return
        self.send_json(404, {"error": "Not found"})

    def handle_save_board(self, query: Dict[str, str]) -> None:
        """Validate and persist an updated board payload for the target database."""
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
            clean_db = normalize_db_alias(raw_db)
            target_file = db_file_path(clean_db)

            with DATA_MUTEX:
                current: Dict[str, Any] = {}
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

    def handle_create_database(self, query: Dict[str, str]) -> None:
        """Create a new named database (either empty or copied from an existing database)."""
        try:
            body_text = self.read_body_text()
            payload = json.loads(body_text) if body_text.strip() else {}
            raw_name = str(payload.get("name") or query.get("name") or "").strip()
            name = re.sub(r"[^a-z0-9_\-]", "", raw_name.lower())
            if not name or name in PROTECTED_DB_NAMES:
                self.send_json(
                    400,
                    {"error": "Invalid database name: cannot create or overwrite 'default' database"},
                )
                return

            copy_from = payload.get("copyFrom") or query.get("copyFrom")
            with DATA_MUTEX:
                if copy_from and copy_from != "none" and str(copy_from).strip() != "":
                    clean_copy = normalize_db_alias(copy_from)
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
                        "columns": copy.deepcopy(source_data.get("columns") or DEFAULT_SEED["columns"]),
                        "tags": copy.deepcopy(source_data.get("tags") or {}),
                        "favoriteTags": copy.deepcopy(source_data.get("favoriteTags") or {}),
                        "trash": [],
                        "tasks": [copy.deepcopy(t) for t in (source_data.get("tasks") or [])],
                        "updatedAt": utc_now_iso(),
                    }
                    write_board_data(
                        seed,
                        f"Kanban create database [{name}] (copied from {clean_copy})",
                        force_commit=True,
                        db_name=name,
                    )
                else:
                    seed = build_empty_database_seed(name)
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

    def handle_delete_database(self, query: Dict[str, str]) -> None:
        """Delete a custom named database while protecting `'default'` and `'board'`."""
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
        if not name or name in PROTECTED_DB_NAMES:
            self.send_json(400, {"error": "Cannot delete default database"})
            return

        target_file = db_file_path(name)
        with DATA_MUTEX:
            if os.path.exists(target_file):
                os.remove(target_file)
                record_git_commit(f"Kanban delete database [{name}]", target_file)

        self.send_json(200, {"success": True, "name": name, "databases": list_databases()})

    def handle_update_config(self) -> None:
        """Update server Git batch size or trigger an immediate manual commit."""
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


def run_server() -> None:
    """Bind to an available port starting from `PORT` and start serving HTTP requests."""
    desired_port = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    server: Optional[ThreadingHTTPServer] = None
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

    def handle_shutdown(signum: int, frame: Any) -> None:
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
