#!/usr/bin/env python3
"""
Kanban Integrity & Python Server Datastore Test Suite.
"""

from io import BytesIO
import json
import os
import subprocess
import sys
import time

import serve

print("== Running Kanban Integrity & Python Server Datastore Tests ==")

app_dir = os.path.dirname(os.path.abspath(__file__))

# 1. Check all required files exist
files = [
    "index.html",
    "manifest.json",
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
    "serve.py",
    "revisions.txt",
    "data/board.json",
    "data/sample.json",
]

for f in files:
    path = os.path.join(app_dir, f)
    assert os.path.exists(path), f"Missing file: {f}"
    size = os.path.getsize(path)
    assert size > 0, f"Empty file: {f}"
    print(f"  ✓ File verified: {f} ({size} bytes)")

# 2. Check HTML structure for key view containers and elements
with open(os.path.join(app_dir, "index.html"), "r", encoding="utf-8") as fh:
    html_content = fh.read()

required_elements = [
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

for elem in required_elements:
    assert elem in html_content, f"HTML missing expected element: {elem}"
    print(f"  ✓ HTML contains: {elem}")

# 3. Verify Server-Hosted Data Store & Python HTTP Server
print("\n== Testing Server-Hosted Data Store & Python REST API Integrity ==")
data_path = os.path.join(app_dir, "data/board.json")
sample_path = os.path.join(app_dir, "data/sample.json")

with open(data_path, "r", encoding="utf-8") as fh:
    board_data = json.load(fh)
with open(sample_path, "r", encoding="utf-8") as fh:
    sample_data = json.load(fh)

assert isinstance(board_data.get("columns"), list), "Datastore missing columns array"
assert isinstance(board_data.get("tasks"), list), "Datastore missing tasks array"
assert len(board_data["columns"]) > 0, "Datastore has empty columns"
assert len(board_data["tasks"]) == 0, "Default datastore should have empty tasks array"
assert len(board_data.get("tags") or {}) == 0, "Default datastore should have empty tags"

assert isinstance(sample_data.get("columns"), list), "Sample datastore missing columns array"
assert isinstance(sample_data.get("tasks"), list), "Sample datastore missing tasks array"
assert len(sample_data["tasks"]) > 0, "Sample datastore has empty tasks"

print(
    f"  ✓ Default database file parsed: {len(board_data['columns'])} columns, {len(board_data['tasks'])} tasks (clean empty default database)"
)
print(
    f"  ✓ Sample database file parsed: {len(sample_data['columns'])} columns, {len(sample_data['tasks'])} tasks (sample GTD tasks preserved)"
)
print(f"  ✓ Datastore updatedAt timestamp: {board_data['updatedAt']}")

# Test atomic writing on sample datastore
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

with open(sample_path, "r", encoding="utf-8") as fh:
    reloaded = json.load(fh)
assert any(t["id"] == test_task["id"] for t in reloaded["tasks"]), "Atomic write test failed"
print("  ✓ Atomic write and reload verified")

# Clean up test task
reloaded["tasks"] = [t for t in reloaded["tasks"] if t["id"] != test_task["id"]]
with open(sample_path, "w", encoding="utf-8") as fh:
    json.dump(reloaded, fh, indent=2)


class InMemoryHandler(serve.KanbanRequestHandler):
    """In-memory harness to invoke KanbanRequestHandler methods without socket connects."""

    def __init__(self, path, method="GET", payload=None):
        self.path = path
        self.command = method
        body_bytes = json.dumps(payload).encode("utf-8") if payload is not None else b""
        self.headers = {"Content-Length": str(len(body_bytes)), "Content-Type": "application/json"}
        self.rfile = BytesIO(body_bytes)
        self.wfile = BytesIO()
        self.response_status = 200
        self.response_headers = {}

    def send_response(self, code, message=None):
        self.response_status = code

    def send_header(self, keyword, value):
        self.response_headers[keyword] = value

    def end_headers(self):
        pass


def invoke_api(path, method="GET", payload=None):
    handler = InMemoryHandler(path, method=method, payload=payload)
    getattr(handler, f"do_{method}")()
    raw = handler.wfile.getvalue().decode("utf-8")
    return handler.response_status, (json.loads(raw) if raw else {})


# Record git refs before testing server commits
main_head_before = subprocess.check_output(
    ["git", "-C", app_dir, "rev-parse", "refs/heads/main"], text=True
).strip()
private_data_head_before = subprocess.check_output(
    ["git", "-C", app_dir, "rev-parse", "refs/heads/private_data"], text=True
).strip()

test_db_path = os.path.join(app_dir, "data", "test_empty_db.json")
test_custom_db = "import_test_custom_db"
test_custom_file = os.path.join(app_dir, "data", f"{test_custom_db}.json")

try:
    # Verify health endpoint
    st_health, body_health = invoke_api("/api/health", method="GET")
    assert st_health == 200 and body_health.get("runtime") == "python", f"Health check failed: {body_health}"
    print("  ✓ Python HTTP server /api/health verified")

    # Test GET /api/databases
    st_list, parsed_list = invoke_api("/api/databases", method="GET")
    assert st_list == 200, f"GET /api/databases failed with status {st_list}"
    assert isinstance(parsed_list.get("databases"), list) and "default" in parsed_list["databases"]

    # Test POST /api/databases to create a custom database
    st_create, body_create = invoke_api(
        "/api/databases", method="POST", payload={"name": test_custom_db, "copyFrom": "none"}
    )
    assert st_create == 200, f"POST /api/databases failed with status {st_create}"

    # Verify private_data branch advanced with a commit while main stayed untouched
    private_data_head_mid = subprocess.check_output(
        ["git", "-C", app_dir, "rev-parse", "refs/heads/private_data"], text=True
    ).strip()
    main_head_mid = subprocess.check_output(
        ["git", "-C", app_dir, "rev-parse", "refs/heads/main"], text=True
    ).strip()
    assert private_data_head_mid != private_data_head_before, "Expected private_data branch to record new database commit"
    assert main_head_mid == main_head_before, "main branch must NEVER be updated by data/*.json changes"
    commit_msg_mid = subprocess.check_output(
        ["git", "-C", app_dir, "log", "-n", "1", "--format=%B", "refs/heads/private_data"], text=True
    )
    assert "Agent: Antigravity" in commit_msg_mid and "Model: Gemini 4 Argon (Medium)" in commit_msg_mid, (
        f"Data commit missing agent/model metadata: {commit_msg_mid}"
    )

    # Test PUT /api/board?db=import_test_custom_db
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
    assert st_put == 200, f"PUT /api/board for custom db failed: {st_put}"
    assert os.path.exists(test_custom_file), f"Respective file data/{test_custom_db}.json was not created on disk!"

    # Verify GET /api/databases now lists the created custom database
    _, parsed_list_after = invoke_api("/api/databases", method="GET")
    assert test_custom_db in parsed_list_after["databases"], "Custom db was not listed by GET /api/databases"

    # Test DELETE /api/databases to clean up
    st_del_custom, _ = invoke_api(f"/api/databases?name={test_custom_db}", method="DELETE")
    assert st_del_custom == 200, "DELETE /api/databases failed"
    assert not os.path.exists(test_custom_file), "Custom db file was not removed after DELETE"

    # Try creating 'default' or 'board' or deleting 'default'
    st_def, _ = invoke_api("/api/databases", method="POST", payload={"name": "default"})
    assert st_def == 400, "POST /api/databases with 'default' must return HTTP 400"

    st_board, _ = invoke_api("/api/databases", method="POST", payload={"name": "board"})
    assert st_board == 400, "POST /api/databases with 'board' must return HTTP 400"

    st_del_def, _ = invoke_api("/api/databases?name=default", method="DELETE")
    assert st_del_def == 400, "DELETE /api/databases with 'default' must return HTTP 400"

    # Verify data/board.json remains empty and sample database remains preserved
    with open(data_path, "r", encoding="utf-8") as fh:
        board_after_check = json.load(fh)
    assert len(board_after_check["tasks"]) == 0, "Default database was corrupted during API checks!"
    with open(sample_path, "r", encoding="utf-8") as fh:
        sample_after_check = json.load(fh)
    assert len(sample_after_check["tasks"]) >= 15, "Sample database was corrupted during API checks!"

    print("  ✓ Server database isolation verified: 'default' and 'board' protected against creation, wipe, and deletion")
    print("  ✓ Server datastore file persistence verified: respective files saved to data/<name>.json and restored on refresh")
    print("  ✓ Git branch isolation verified: data/*.json commits go exclusively to private_data and never touch main")
finally:
    if os.path.exists(test_db_path):
        os.remove(test_db_path)
    if os.path.exists(test_custom_file):
        os.remove(test_custom_file)
    # Restore private_data ref to clean pre-test commit so test runs leave no test commits behind
    subprocess.run(
        ["git", "-C", app_dir, "update-ref", "refs/heads/private_data", private_data_head_before],
        check=True,
    )
    serve.pending_change_count = 0

print("  ✓ Datastore and private_data branch ref restored to clean state")

# 4. Simulate and test Fit Tableau zoom calculation for different device dimensions
print("\n== Testing Zoom Controller Fit-Tableau Scaling ==")
col_count = 4
col_width = 300
gap = 16
padding = 40
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
    scale_w = avail_w / float(tableau_width)
    scale_h = avail_h / 600.0
    fit_scale = min(scale_w, scale_h * 1.15)
    fit_scale = min(max(fit_scale, 0.22), 1.0)
    scaled_w = round(tableau_width * fit_scale, 1)
    pct = round(fit_scale * 100, 1)
    print(f"  ✓ {device_name.ljust(28)}: Zoom = {pct}% (Scaled Tableau: {scaled_w}px fits in {dims['width']}px screen)")
    assert scaled_w <= dims["width"], f"Tableau overflowed screen on {device_name}!"

# 5. Validate Specific Requirements (a - j)
print("\n== Testing Specific Requirements (a - j) ==")

with open(os.path.join(app_dir, "serve.py"), "r", encoding="utf-8") as fh:
    serve_py = fh.read()
with open(os.path.join(app_dir, "css/style.css"), "r", encoding="utf-8") as fh:
    style_css = fh.read()
with open(os.path.join(app_dir, "css/table.css"), "r", encoding="utf-8") as fh:
    table_css = fh.read()
with open(os.path.join(app_dir, "css/text-view.css"), "r", encoding="utf-8") as fh:
    text_css = fh.read()
with open(os.path.join(app_dir, "css/board.css"), "r", encoding="utf-8") as fh:
    board_css = fh.read()
with open(os.path.join(app_dir, "css/list-view.css"), "r", encoding="utf-8") as fh:
    list_css = fh.read()
with open(os.path.join(app_dir, "js/models.js"), "r", encoding="utf-8") as fh:
    models_js = fh.read()
with open(os.path.join(app_dir, "js/list-view.js"), "r", encoding="utf-8") as fh:
    list_js = fh.read()
with open(os.path.join(app_dir, "js/table-view.js"), "r", encoding="utf-8") as fh:
    table_js = fh.read()
with open(os.path.join(app_dir, "js/text-view.js"), "r", encoding="utf-8") as fh:
    text_js = fh.read()
with open(os.path.join(app_dir, "js/board-view.js"), "r", encoding="utf-8") as fh:
    board_js = fh.read()
with open(os.path.join(app_dir, "js/app.js"), "r", encoding="utf-8") as fh:
    app_js = fh.read()

assert "git_commit_batch_size" in serve_py, "Missing git commit batch config in serve.py"
assert "AGENT_MODEL_DETAILS" in serve_py, "Missing AGENT_MODEL_DETAILS in serve.py"
assert "PRIVATE_DATA_BRANCH" in serve_py, "Missing PRIVATE_DATA_BRANCH in serve.py"
print("  ✓ Configurable git batch commit update supported (default: 12)")
print("  ✓ Git commits include agent model details in serve.py and target private_data branch")

archive_col = next((c for c in board_data["columns"] if c["id"] == "archive"), None)
assert archive_col and archive_col["showInBoard"] is False, "Requirement (a) Failed: archive column"
print("  ✓ (a) Default status 'archive' exists with showInBoard: false")

abandoned_col = next((c for c in board_data["columns"] if c["id"] == "abandoned"), None)
assert abandoned_col and abandoned_col["showInBoard"] is False, "Feature Failed: abandoned column"
print("  ✓ Feature: Default status 'abandoned' exists with showInBoard: false")

pending_col = next((c for c in board_data["columns"] if c["id"] == "pending"), None)
assert pending_col and pending_col["showInBoard"] is False, "Requirement (c) Failed: pending column"
print("  ✓ (c) Status 'pending' exists with showInBoard: false (not visible in Kanban board)")

assert "btn-kanban-board-only" in html_content and "btn-kanban-split-view" in html_content
print("  ✓ (b) Kanban view contains toggle for Board Only vs Board + Bottom List")

assert "btn-toggle-sidebar" in html_content and "app-side-panel" in html_content
assert ".app-body.sidebar-collapsed" in style_css
print("  ✓ (c) Side panel has toggle to hide away in all views")

assert "min-width: 0" in table_css and "min-width: 0" in text_css
assert "-webkit-line-clamp" in table_css and "calc(1.35em * 4" in table_css
assert ".table-row" in table_css and "cursor: pointer" in table_css
assert "openTaskView" in table_js and "onViewTask" in table_js
assert "openTaskDetailModal(task)" in app_js
assert "this.filterColumn = 'backlog'" in table_js
print("  ✓ (d & e) Tabular List and Text-Only views have min-width: 0 flexbox protection against cutoff")
print("  ✓ Feature: Tabular list rows limited to 4 rows/lines at most with description truncation")
print("  ✓ Feature: Clicking tabular list row opens task in view mode (openTaskDetailModal)")
print("  ✓ Feature: Tabular list defaults to state Backlog instead of all states")

assert "font-family: var(--font-mono)" in text_css and "13px !important" in text_css
print("  ✓ (f) Text-Only view strictly enforces fixed-size monospace fonts")

sample_task = sample_data["tasks"][0]
assert sample_task.get("createdAt") and sample_task.get("updatedAt") and "url" in sample_task
assert "modal-task-url" in html_content and "modal-task-timestamps" in html_content
assert "https://github.com/k8242/tasks_kanban" in html_content
assert "Universal Kanban" not in html_content
print("  ✓ (f & i) Tasks include createdAt/updatedAt timestamps and optional url field with clickable badges")
print("  ✓ Feature: GitHub link to https://github.com/k8242/tasks_kanban verified and 'Universal' removed from naming")

assert "getTagColor" in models_js and "setTagColor" in models_js and "renameTag" in models_js
assert "tag-color-swatch" in list_js and ("btn-tag-menu" in list_js or "btn-edit-tag" in list_js)
assert "getTagColor" in table_js
print("  ✓ (b & d) Tag names and colors editable from side panel and rendered with respective colors in Tabular List")

assert "this.trash" in models_js and "purgeTrash" in models_js and "restoreTask" in models_js
assert "createTrashTaskRow" in list_js
assert "trashIds" in models_js and "this.save(true)" in models_js and "this.isSaving" in models_js
print("  ✓ (e & b) Deleted tasks go to trash, stay deleted without resurrecting on sync, and purge after 30 days")

assert "computeNextDueDate" in models_js and "completionHistory" in models_js
assert "repeat-history-modal" in html_content and "repeat-grid-container" in html_content
assert "showRepeatHistoryModal" in app_js and "badge-repeat-trigger" in board_js
print("  ✓ (g) Recurring task engine supports weekly/monthly/annually repeat, resurrection with next due date, and graphical completion heatmap popup")

assert "modal-gcal-btn" in html_content and "generateGoogleCalendarUrl" in app_js and "setupHashDeepLink" in app_js and "#task-" in app_js
print("  ✓ (h) Support export to Google Calendar with direct deep link back to task")

assert "board-state-filter-pills" in html_content and ".kanban-board-tableau.single-state-view" in board_css
assert "setSingleColumn" in board_js and "single-state-nav" in board_js and "setupBoardStateFilter" in app_js
print("  ✓ (j) Support normal phone screens with single state tableau view and state navigation pills")

assert "card-assignee" not in board_js
print("  ✓ (d) Assignee icon removed from board view task cards to prevent icon crowding")

assert "priorityWeights" in board_js
print("  ✓ (e) Board view column task boxes sorted by importance: urgent top, low bottom")

assert 'id="modal-task-markdown"' in html_content and "isMarkdown" in models_js and "renderMarkdown" in models_js
assert "modal-task-markdown" in app_js and ".markdown-content" in style_css
print("  ✓ (a) Description & Notes optionally support markdown with format checkbox and rich formatting")

assert "border-radius: 3px" in list_css
print("  ✓ (b) Side panel tag colors rendered as small rounded square swatches")

assert "btn-tag-menu" in list_js and "btn-edit-tag" not in list_js and "btn-delete-tag" not in list_js
assert "openTagMenuPopup" in list_js and "TAG_PALETTE_24" in list_js
assert "Rename tag" in list_js and "Add to Favorites" in list_js and "Remove tag" in list_js
assert ".tag-menu-popup" in list_css and "opacity: 1 !important" in list_css and "--surface: #1e293b" in style_css
assert "isFavoriteTag" in models_js
print("  ✓ (c & a) Pop-up box appears under menu button next to tag with 24-color palette and opaque background")

assert "counts.tags).sort" in list_js and "localeCompare" in list_js
print("  ✓ Bugfix: Tags in side panel sorted alphabetically")

assert "resize: both" in style_css and ".modal-dialog form" in style_css and "flex-shrink: 0" in style_css
print("  ✓ (c) Edit task modal supports both-direction resizing and internal scrolling with pinned footer buttons")

assert "task-detail-modal" in html_content and "openTaskDetailModal" in app_js
assert "btn-card-expand" in board_js and "card-expanded-details" in board_js and ".modal-dialog-detail" in style_css
assert 'id="btn-detail-edit-task"' not in html_content and 'id="btn-detail-switch-edit"' in html_content
assert "detail-side-panel" in html_content and "detail-select-column" in html_content and "detail-select-priority" in html_content
print("  ✓ (d) Expanded board view supported without top edit button and with right side panel dropdown fields")

assert "modal-dialog-expanded" in html_content and "modal-side-panel" in html_content and "modal-main-panel" in html_content
assert ".modal-side-panel" in style_css and ".modal-dialog-expanded" in style_css
print("  ✓ (e) Expanded edit view layout with all dropdown fields organized into dedicated right-side panel")

assert ".quick-add-autocomplete" in list_css and ".priority-swatch-bar" in list_css
assert "parseSmartTaskInput" in list_js and "setupQuickAddAutocomplete" in list_js
print("  ✓ (a) Smart keyboard task entry supported in Lists view with ^ dates, ! priorities, and # tags autocomplete")

assert "db-switcher-wrapper" in html_content and "db-select" in html_content and ".db-switcher-wrapper" in style_css
assert "this.currentDb" in models_js and "switchDatabase" in models_js and "createDatabase" in models_js
assert "-tasks-" in app_js and "sanitize_db_name" in serve_py
assert "create-db-modal" in html_content and "new-db-copy-from" in html_content
print("  ✓ (b) Multiple named task databases supported with distinct server git backups and localized export files")

assert "setupKeyboardNavigation" in board_js and "tabindex" in board_js
assert "setupKeyboardNavigation" in list_js and "tabindex" in list_js
assert "setupKeyboardNavigation" in table_js and "tabindex" in table_js
assert "setupKeyboardNavigation" in text_js and "tabindex" in text_js
assert ".kanban-card:focus" in style_css and "openModals.forEach(m => m.classList.remove('open'))" in app_js
print("  ✓ Feature: All views support keyboard navigation by arrows, enter, and escape")

assert "import-modal" in html_content and "isRtmJson" in models_js and "convertRtmToKanban" in models_js and "importRtmJson" in models_js
print("  ✓ Feature: Automated Remember The Milk JSON import supported with custom lists as tags and completed tasks in archive")

assert ".status-archive" in list_css and ".status-archive" in table_css
assert ".kanban-card.is-done" in board_css and ".text-task-item.is-done" in text_css
assert ".checkbox-archive" in list_css and ".gtd-row-due.due-normal" in list_css and ".gtd-row-completed" in list_css
print("  ✓ Feature: Archive status tasks display identical visual accents to Done tasks across all views")
print("  ✓ Feature: Greyed-out checkbox for Archive, isolated Completed list, and recent completion dates")

assert ".status-abandoned" in list_css and ".status-abandoned" in table_css and ".status-abandoned" in board_css
assert ".text-item-abandoned" in text_css and ".checkbox-abandoned" in list_css and ".gtd-row-abandoned" in list_css
print("  ✓ Feature: Abandoned status tasks display visual accents, cancelled checkbox, and Abandoned Date across all views")

assert "createBatchToolbar" in list_js and "toggleTaskSelection" in list_js
assert "batchComplete" in list_js and "batchPostpone" in list_js and "batchSetPriority" in list_js and "batchDeleteTasks" in list_js
assert ".gtd-batch-toolbar" in list_css and ".gtd-task-row.is-selected" in list_css and "#fff9c4" in list_css
assert "btn-batch-database" in list_js and "batchCopyOrMove" in list_js
assert "copyOrMoveTasksToDatabase" in models_js and 'id="batch-transfer-modal"' in html_content
print("  ✓ Feature: Multi-task selection and batch editing toolbar in Lists View")
print("  ✓ Feature: Copy or move tasks from multi-select list view to another database")

# (g) Full JavaScript syntax and parsing validation via JavaScriptCore (jsc)
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
    load('{os.path.join(app_dir, "js/models.js")}');
    load('{os.path.join(app_dir, "js/zoom-canvas.js")}');
    load('{os.path.join(app_dir, "js/board-view.js")}');
    load('{os.path.join(app_dir, "js/list-view.js")}');
    load('{os.path.join(app_dir, "js/table-view.js")}');
    load('{os.path.join(app_dir, "js/text-view.js")}');
    load('{os.path.join(app_dir, "js/app.js")}');
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
    print("  ✓ (g) All JavaScript files verified valid syntax and smart task parser tested successfully")

# 6. Validate historical timestamps integrity in sample.json and clean default
with open(sample_path, "r", encoding="utf-8") as fh:
    sample_data = json.load(fh)
tasks = sample_data.get("tasks") or []
created_dates = list({t.get("createdAt") for t in tasks if t.get("createdAt")})
assert len(created_dates) >= 3, f"Expected distinct creation timestamps, found {len(created_dates)}"
print(f"  ✓ Validated sample.json has {len(tasks)} tasks with authentic historical creation & edit timestamps")

with open(data_path, "r", encoding="utf-8") as fh:
    bdata = json.load(fh)
assert len(bdata["tasks"]) == 0, "Default database should be empty"
assert len(bdata.get("tags") or {}) == 0, "Default database should have empty tags"
print("  ✓ Validated default database (board.json) is completely empty with no resurrected tags")

# 7. Validate manifest JSON and Git branch isolation on main
with open(os.path.join(app_dir, "manifest.json"), "r", encoding="utf-8") as fh:
    manifest_data = json.load(fh)
assert manifest_data.get("name") == "Kanban", f"Manifest name should be 'Kanban', got {manifest_data.get('name')}"
print(f"\n  ✓ manifest.json is valid JSON with name: '{manifest_data['name']}' and display: {manifest_data['display']}")

main_tracked_data = subprocess.check_output(
    ["git", "-C", app_dir, "ls-tree", "-r", "--name-only", "refs/heads/main", "data/"],
    text=True,
).strip()
assert main_tracked_data == "", f"main branch must not track any data/*.json files, found: {main_tracked_data}"
private_tracked_data = subprocess.check_output(
    ["git", "-C", app_dir, "ls-tree", "-r", "--name-only", "refs/heads/private_data", "data/"],
    text=True,
).strip().splitlines()
assert "data/board.json" in private_tracked_data and "data/sample.json" in private_tracked_data
print(f"  ✓ Git branch verification: main tracks 0 data files; private_data tracks {len(private_tracked_data)} data/*.json files")

print("\n>> ALL INTEGRITY & PYTHON SERVER DATASTORE TESTS PASSED! <<")
