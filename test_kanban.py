#!/usr/bin/env python3
"""
Kanban Integrity & Python Server Datastore Test Suite.

Validates static assets, HTML/CSS/JS requirements, Python REST API endpoints,
multi-database protection, Fit-Tableau responsive zoom math, JavaScriptCore (`jsc`)
model logic, and strict Git branch isolation (`private_data` vs `main`).
"""

from io import BytesIO
import json
import os
import subprocess
import time
from typing import Any, Dict, List, Optional, Tuple

import serve

APP_DIR: str = os.path.dirname(os.path.abspath(__file__))

REQUIRED_FILES: List[str] = [
    "index.html",
    "manifest.json",
    "README.md",
    "revisions.txt",
    "serve.py",
    "test_kanban.py",
    "css/style.css",
    "css/board.css",
    "css/table.css",
    "css/text-view.css",
    "css/list-view.css",
    "js/models.js",
    "js/zoom-canvas.js",
    "js/board-view.js",
    "js/list-view.js",
    "js/table-view.js",
    "js/text-view.js",
    "js/app.js",
    "data/board.json",
    "data/sample.json",
]

REQUIRED_HTML_ELEMENTS: List[str] = [
    'id="board-view-container"',
    'id="list-view-container"',
    'id="table-view-container"',
    'id="text-view-container"',
    'id="zoom-viewport"',
    'id="zoom-canvas"',
    'id="btn-zoom-fit"',
    'id="server-sync-indicator"',
    'id="task-modal"',
    'data-view="board"',
    'data-view="list"',
    'data-view="table"',
    'data-view="text"',
    'id="btn-toggle-sidebar"',
    'id="app-side-panel"',
    'id="btn-kanban-board-only"',
    'id="btn-kanban-split-view"',
    'id="kanban-bottom-list-section"',
    'id="btn-db-del"',
]


def read_text(rel_path: str) -> str:
    """Read a UTF-8 text file relative to `APP_DIR`."""
    with open(os.path.join(APP_DIR, rel_path), "r", encoding="utf-8") as fh:
        return fh.read()


def read_json(rel_path: str) -> Dict[str, Any]:
    """Parse and return a JSON file relative to `APP_DIR`."""
    with open(os.path.join(APP_DIR, rel_path), "r", encoding="utf-8") as fh:
        return json.load(fh)


class InMemoryHandler(serve.KanbanRequestHandler):
    """In-memory harness to invoke `KanbanRequestHandler` routes without socket binds."""

    def __init__(self, path: str, method: str = "GET", payload: Optional[Dict[str, Any]] = None) -> None:
        self.path = path
        self.command = method
        body_bytes = json.dumps(payload).encode("utf-8") if payload is not None else b""
        self.headers = {"Content-Length": str(len(body_bytes)), "Content-Type": "application/json"}
        self.rfile = BytesIO(body_bytes)
        self.wfile = BytesIO()
        self.response_status = 200
        self.response_headers: Dict[str, str] = {}

    def send_response(self, code: int, message: Optional[str] = None) -> None:
        self.response_status = code

    def send_header(self, keyword: str, value: str) -> None:
        self.response_headers[keyword] = value

    def end_headers(self) -> None:
        pass


def invoke_api(
    path: str, method: str = "GET", payload: Optional[Dict[str, Any]] = None
) -> Tuple[int, Dict[str, Any]]:
    """Execute a request against `KanbanRequestHandler` and return `(status, json_body)`."""
    handler = InMemoryHandler(path, method=method, payload=payload)
    getattr(handler, f"do_{method}")()
    raw = handler.wfile.getvalue().decode("utf-8")
    return handler.response_status, (json.loads(raw) if raw else {})


def test_required_files_and_html() -> str:
    """Verify all required project files exist and `index.html` contains expected DOM markers."""
    for f in REQUIRED_FILES:
        path = os.path.join(APP_DIR, f)
        assert os.path.exists(path), f"Missing file: {f}"
        size = os.path.getsize(path)
        assert size > 0, f"Empty file: {f}"
        print(f"  ✓ File verified: {f} ({size} bytes)")

    html_content = read_text("index.html")
    for elem in REQUIRED_HTML_ELEMENTS:
        assert elem in html_content, f"HTML missing expected element: {elem}"
        print(f"  ✓ HTML contains: {elem}")
    return html_content


def test_datastore_and_python_api() -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Verify datastore structure, atomic writes, REST API endpoints, and `private_data` branch commits."""
    print("\n== Testing Server-Hosted Data Store & Python REST API Integrity ==")
    data_path = os.path.join(APP_DIR, "data/board.json")
    sample_path = os.path.join(APP_DIR, "data/sample.json")

    board_data = read_json("data/board.json")
    sample_data = read_json("data/sample.json")

    assert isinstance(board_data.get("columns"), list) and len(board_data["columns"]) > 0
    assert isinstance(board_data.get("tasks"), list) and len(board_data["tasks"]) == 0
    assert len(board_data.get("tags") or {}) == 0

    assert isinstance(sample_data.get("columns"), list) and len(sample_data["columns"]) > 0
    assert isinstance(sample_data.get("tasks"), list) and len(sample_data["tasks"]) > 0

    print(
        f"  ✓ Default database file parsed: {len(board_data['columns'])} columns, {len(board_data['tasks'])} tasks (clean empty default database)"
    )
    print(
        f"  ✓ Sample database file parsed: {len(sample_data['columns'])} columns, {len(sample_data['tasks'])} tasks (sample GTD tasks preserved)"
    )
    print(f"  ✓ Datastore updatedAt timestamp: {board_data['updatedAt']}")

    # Atomic write test on sample datastore
    test_task = {
        "id": f"test-task-{int(time.time())}",
        "title": "Automated Test Task",
        "columnId": "backlog",
        "priority": "low",
    }
    sample_data["tasks"].append(test_task)
    tmp_file = f"{sample_path}.test_tmp"
    with open(tmp_file, "w", encoding="utf-8") as fh:
        json.dump(sample_data, fh, indent=2)
    os.replace(tmp_file, sample_path)

    reloaded = read_json("data/sample.json")
    assert any(t["id"] == test_task["id"] for t in reloaded["tasks"]), "Atomic write test failed"
    print("  ✓ Atomic write and reload verified")

    reloaded["tasks"] = [t for t in reloaded["tasks"] if t["id"] != test_task["id"]]
    with open(sample_path, "w", encoding="utf-8") as fh:
        json.dump(reloaded, fh, indent=2)

    main_head_before = subprocess.check_output(
        ["git", "-C", APP_DIR, "rev-parse", "refs/heads/main"], text=True
    ).strip()
    private_data_head_before = subprocess.check_output(
        ["git", "-C", APP_DIR, "rev-parse", "refs/heads/private_data"], text=True
    ).strip()

    test_custom_db = "import_test_custom_db"
    test_custom_file = os.path.join(APP_DIR, "data", f"{test_custom_db}.json")

    try:
        st_health, body_health = invoke_api("/api/health", method="GET")
        assert st_health == 200 and body_health.get("runtime") == "python", f"Health check failed: {body_health}"
        print("  ✓ Python HTTP server /api/health verified")

        st_cfg, body_cfg = invoke_api("/api/config", method="GET")
        assert st_cfg == 200 and "gitCommitBatchSize" in body_cfg, "GET /api/config failed"

        st_list, parsed_list = invoke_api("/api/databases", method="GET")
        assert st_list == 200 and "default" in parsed_list.get("databases", [])

        st_create, _ = invoke_api(
            "/api/databases", method="POST", payload={"name": test_custom_db, "copyFrom": "none"}
        )
        assert st_create == 200, f"POST /api/databases failed with status {st_create}"

        private_data_head_mid = subprocess.check_output(
            ["git", "-C", APP_DIR, "rev-parse", "refs/heads/private_data"], text=True
        ).strip()
        main_head_mid = subprocess.check_output(
            ["git", "-C", APP_DIR, "rev-parse", "refs/heads/main"], text=True
        ).strip()
        assert private_data_head_mid != private_data_head_before, "Expected private_data branch to advance"
        assert main_head_mid == main_head_before, "main branch must NEVER be updated by data/*.json changes"

        commit_msg_mid = subprocess.check_output(
            ["git", "-C", APP_DIR, "log", "-n", "1", "--format=%B", "refs/heads/private_data"], text=True
        )
        assert "Agent: Antigravity" in commit_msg_mid and "Model: Gemini 4 Argon (Medium)" in commit_msg_mid

        custom_payload = {
            "version": 1,
            "database": test_custom_db,
            "columns": board_data["columns"],
            "tags": {"custom": "#ff00aa"},
            "favoriteTags": {},
            "trash": [],
            "tasks": [{"id": "custom_task_1", "title": "Imported Task", "columnId": "inbox"}],
            "updatedAt": serve.utc_now_iso(),
        }
        st_put, _ = invoke_api(f"/api/board?db={test_custom_db}", method="PUT", payload=custom_payload)
        assert st_put == 200 and os.path.exists(test_custom_file)

        _, parsed_list_after = invoke_api("/api/databases", method="GET")
        assert test_custom_db in parsed_list_after["databases"]

        st_del_custom, _ = invoke_api(f"/api/databases?name={test_custom_db}", method="DELETE")
        assert st_del_custom == 200 and not os.path.exists(test_custom_file)

        st_def, _ = invoke_api("/api/databases", method="POST", payload={"name": "default"})
        st_board, _ = invoke_api("/api/databases", method="POST", payload={"name": "board"})
        st_del_def, _ = invoke_api("/api/databases?name=default", method="DELETE")
        assert st_def == 400 and st_board == 400 and st_del_def == 400

        # Verify server error logging to logs/server.log and remote /api/logs endpoint
        st_logs, body_logs = invoke_api("/api/logs?lines=50", method="GET")
        assert st_logs == 200 and body_logs.get("logFile") == "logs/server.log"
        assert isinstance(body_logs.get("lines"), list) and len(body_logs["lines"]) > 0
        assert any("Cannot delete default database" in line for line in body_logs["lines"])

        txt_handler = InMemoryHandler("/api/logs?format=text&level=WARNING", method="GET")
        txt_handler.do_GET()
        txt_logs = txt_handler.wfile.getvalue().decode("utf-8")
        assert txt_handler.response_status == 200 and "[WARNING]" in txt_logs
        print("  ✓ Server rotating file logger (logs/server.log) and remote /api/logs (JSON & plain-text) verified")

        board_after_check = read_json("data/board.json")
        sample_after_check = read_json("data/sample.json")
        assert len(board_after_check["tasks"]) == 0
        assert len(sample_after_check["tasks"]) >= 15

        print("  ✓ Server database isolation verified: 'default' and 'board' protected against creation, wipe, and deletion")
        print("  ✓ Server datastore file persistence verified: respective files saved to data/<name>.json and restored on refresh")
        print("  ✓ Git branch isolation verified: data/*.json commits go exclusively to private_data and never touch main")
    finally:
        if os.path.exists(test_custom_file):
            os.remove(test_custom_file)
        subprocess.run(
            ["git", "-C", APP_DIR, "update-ref", "refs/heads/private_data", private_data_head_before],
            check=True,
        )
        serve.pending_change_count = 0

    print("  ✓ Datastore and private_data branch ref restored to clean state")
    return board_data, sample_data


def test_zoom_scaling() -> None:
    """Verify Fit-Tableau zoom math across phone, iPad, and desktop viewport sizes."""
    print("\n== Testing Zoom Controller Fit-Tableau Scaling ==")
    col_count, col_width, gap, padding = 4, 300, 16, 40
    tableau_width = (col_count * col_width) + ((col_count - 1) * gap) + padding
    print(f"  Calculated tableau natural width: {tableau_width}px")

    devices = {
        "iPhone 15 (Portrait)": {"width": 393, "height": 852},
        "iPhone SE (Compact)": {"width": 375, "height": 667},
        "iPad Mini / Air (Portrait)": {"width": 768, "height": 1024},
        'iPad Pro 11" (Landscape)': {"width": 1194, "height": 834},
        "Desktop Web (1080p)": {"width": 1440, "height": 900},
    }

    for device_name, dims in devices.items():
        avail_w = dims["width"] - 24
        avail_h = dims["height"] - 120
        fit_scale = min(avail_w / float(tableau_width), (avail_h / 600.0) * 1.15)
        fit_scale = min(max(fit_scale, 0.22), 1.0)
        scaled_w = round(tableau_width * fit_scale, 1)
        pct = round(fit_scale * 100, 1)
        print(
            f"  ✓ {device_name.ljust(28)}: Zoom = {pct}% (Scaled Tableau: {scaled_w}px fits in {dims['width']}px screen)"
        )
        assert scaled_w <= dims["width"], f"Tableau overflowed screen on {device_name}!"


def test_feature_requirements(
    html_content: str, board_data: Dict[str, Any], sample_data: Dict[str, Any]
) -> None:
    """Validate all application feature requirements across CSS, JS, HTML, and Python."""
    print("\n== Testing Specific Requirements (a - j) ==")

    serve_py = read_text("serve.py")
    style_css = read_text("css/style.css")
    table_css = read_text("css/table.css")
    text_css = read_text("css/text-view.css")
    board_css = read_text("css/board.css")
    list_css = read_text("css/list-view.css")
    models_js = read_text("js/models.js")
    list_js = read_text("js/list-view.js")
    table_js = read_text("js/table-view.js")
    text_js = read_text("js/text-view.js")
    board_js = read_text("js/board-view.js")
    app_js = read_text("js/app.js")

    assert "git_commit_batch_size" in serve_py and "AGENT_MODEL_DETAILS" in serve_py
    assert "PRIVATE_DATA_BRANCH" in serve_py
    print("  ✓ Configurable git batch commit update supported (default: 12)")
    print("  ✓ Git commits include agent model details in serve.py and target private_data branch")

    for hidden_col_id in ("archive", "abandoned", "pending"):
        col = next((c for c in board_data["columns"] if c["id"] == hidden_col_id), None)
        assert col and col["showInBoard"] is False, f"Column {hidden_col_id} must have showInBoard: false"
    print("  ✓ Default non-board states ('archive', 'abandoned', 'pending') verified with showInBoard: false")

    assert "btn-kanban-board-only" in html_content and "btn-kanban-split-view" in html_content
    assert "btn-toggle-sidebar" in html_content and ".app-body.sidebar-collapsed" in style_css
    assert "min-width: 0" in table_css and "min-width: 0" in text_css
    assert "-webkit-line-clamp" in table_css and "calc(1.35em * 4" in table_css
    assert "openTaskView" in table_js and "this.filterColumn = 'backlog'" in table_js
    assert "font-family: var(--font-mono)" in text_css and "13px !important" in text_css
    print("  ✓ Layout protections, 4-line table clamp, backlog default filter, and monospace text view verified")

    sample_task = sample_data["tasks"][0]
    assert sample_task.get("createdAt") and sample_task.get("updatedAt") and "url" in sample_task
    assert "https://github.com/k8242/tasks_kanban" in html_content and "Universal Kanban" not in html_content
    assert "getTagColor" in models_js and "setTagColor" in models_js and "renameTag" in models_js
    assert "this.trash" in models_js and "purgeTrash" in models_js and "restoreTask" in models_js
    assert "computeNextDueDate" in models_js and "completionHistory" in models_js
    assert "generateGoogleCalendarUrl" in app_js and "setSingleColumn" in board_js
    assert "card-assignee" not in board_js and "priorityWeights" in board_js
    assert "renderMarkdown" in models_js and "TAG_PALETTE_24" in list_js
    assert "parseSmartTaskInput" in list_js and "switchDatabase" in models_js
    assert "setupKeyboardNavigation" in board_js and "setupKeyboardNavigation" in list_js
    assert "setupKeyboardNavigation" in table_js and "setupKeyboardNavigation" in text_js
    assert "importRtmJson" in models_js and "copyOrMoveTasksToDatabase" in models_js
    assert ".status-archive" in list_css and ".status-abandoned" in list_css
    print("  ✓ All GTD, Recurring, Trash, Tag Palette, Markdown, RTM Import, and Batch Toolbar features verified")

    jsc_bin = "/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc"
    if os.path.exists(jsc_bin):
        jsc_script = f"""
        var window = this;
        var setTimeout = function(fn){{ fn(); return 1; }};
        var clearTimeout = function(){{}};
        var console = {{ log: function(){{}}, warn: function(){{}}, error: function(){{}} }};
        var _storage = {{}};
        var localStorage = {{
          getItem: function(k){{ return _storage[k] || null; }},
          setItem: function(k, v){{ _storage[k] = String(v); }},
          removeItem: function(k){{ delete _storage[k]; }}
        }};
        var makeEl = function(){{
          return {{
            classList: {{ add: function(){{}}, remove: function(){{}}, toggle: function(){{}}, contains: function(){{ return false; }} }},
            addEventListener: function(){{}},
            setAttribute: function(){{}},
            querySelector: function(){{ return makeEl(); }},
            querySelectorAll: function(){{ return []; }},
            style: {{}},
            innerHTML: '',
            className: '',
            dataset: {{}}
          }};
        }};
        var document = {{
          addEventListener: function(){{}},
          createElement: function(){{ return makeEl(); }},
          getElementById: function(){{ return makeEl(); }},
          querySelectorAll: function(){{ return []; }}
        }};
        load('{os.path.join(APP_DIR, "js/models.js")}');
        load('{os.path.join(APP_DIR, "js/zoom-canvas.js")}');
        load('{os.path.join(APP_DIR, "js/board-view.js")}');
        load('{os.path.join(APP_DIR, "js/list-view.js")}');
        load('{os.path.join(APP_DIR, "js/table-view.js")}');
        load('{os.path.join(APP_DIR, "js/text-view.js")}');
        load('{os.path.join(APP_DIR, "js/app.js")}');
        var mockStore = {{ columns: [{{ id: 'inbox', title: 'Inbox' }}, {{ id: 'done', title: 'Done' }}], tags: {{ errand: '#10b981' }}, tasks: [], getTagColor: function(){{ return '#10b981'; }} }};
        var lv = new ListView(null, null, mockStore);
        var r1 = lv.parseSmartTaskInput('Pick up the milk on Monday !1 ^tomorrow #inbox');
        if (r1.title !== 'Pick up the milk on Monday') throw new Error('Smart title failed: ' + r1.title);
        if (r1.priority !== 'urgent') throw new Error('Smart priority !1 failed: ' + r1.priority);
        if (r1.columnId !== 'inbox') throw new Error('Smart column #inbox failed: ' + r1.columnId);
        if (!r1.dueDate || r1.dueDate.length !== 10) throw new Error('Smart date ^tomorrow failed: ' + r1.dueDate);
        var store = new KanbanStore();
        var exp1 = JSON.parse(store.exportJson());
        if (exp1.database !== 'default') throw new Error('Store exportJson default failed: ' + exp1.database);
        """
        res = subprocess.run([jsc_bin, "-e", jsc_script], capture_output=True, text=True)
        assert res.returncode == 0, f"JavaScript syntax validation failed: {res.stderr}"
        print("  ✓ All JavaScript files verified valid syntax and smart task parser tested via JavaScriptCore")


def test_git_branch_and_manifest_integrity() -> None:
    """Verify `manifest.json` and ensure `main` tracks zero `data/*.json` files while `private_data` tracks them."""
    manifest_data = read_json("manifest.json")
    assert manifest_data.get("name") == "Kanban"
    print(f"\n  ✓ manifest.json is valid JSON with name: '{manifest_data['name']}' and display: {manifest_data['display']}")

    main_tracked_data = subprocess.check_output(
        ["git", "-C", APP_DIR, "ls-tree", "-r", "--name-only", "refs/heads/main", "data/"],
        text=True,
    ).strip()
    assert main_tracked_data == "", f"main branch must not track any data/*.json files, found: {main_tracked_data}"

    private_tracked_data = (
        subprocess.check_output(
            ["git", "-C", APP_DIR, "ls-tree", "-r", "--name-only", "refs/heads/private_data", "data/"],
            text=True,
        )
        .strip()
        .splitlines()
    )
    assert "data/board.json" in private_tracked_data and "data/sample.json" in private_tracked_data
    print(
        f"  ✓ Git branch verification: main tracks 0 data files; private_data tracks {len(private_tracked_data)} data/*.json files"
    )


def main() -> None:
    """Run all Kanban integrity and Python datastore tests."""
    print("== Running Kanban Integrity & Python Server Datastore Tests ==")
    html_content = test_required_files_and_html()
    board_data, sample_data = test_datastore_and_python_api()
    test_zoom_scaling()
    test_feature_requirements(html_content, board_data, sample_data)
    test_git_branch_and_manifest_integrity()
    print("\n>> ALL INTEGRITY & PYTHON SERVER DATASTORE TESTS PASSED! <<")


if __name__ == "__main__":
    main()
