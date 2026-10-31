# Kanban App (Python Backend Edition)

GitHub Repository: [https://github.com/k8242/tasks_kanban](https://github.com/k8242/tasks_kanban)

A cross-platform Kanban application supporting **Mobile (Phones), iPad/Tablets, and Desktop Web**, powered by a **zero-dependency Python 3 backend** (`serve.py`):
- **Server-Hosted Data Store**: Centralized backend JSON datastore (`data/board.json` and multi-database `data/<name>.json`) with a REST API for automatic multi-device synchronization and persistence.
- **Branch-Isolated Private Data Versioning (`private_data`)**: All `data/*.json` files are tracked and auto-committed exclusively to the `private_data` Git branch while `main` tracks only application source code and documentation.
- **Kanban Board with Mobile Pinch-and-Zoom**: Multi-touch pinch gesture allows shrinking the entire multi-column Kanban board to see the **whole tableau** on small screens at once, or switching to a single-state mobile view.
- **GTD Lists View**: Smart keyboard entry (`^dates`, `!priorities`, `#tags`), multi-task batch editing, cross-database copy/move, and 24-color tag palette.
- **Tabular List View**: Comprehensive data table of all tasks, states, priorities, assignees, and dates with sorting, search filtering, 4-line row clamp, and inline state transitions.
- **Text-Only View**: Clean, accessible fixed-width monospace outline of all tasks and states, complete with 2-way plain text batch sync and one-click copy/export.
- **Offline-First Resilience**: Transparently caches to `localStorage` and falls back to local storage if running disconnected, re-syncing when connected.

---

## Quick Start (Python Server-Hosted Datastore)

Launch the server using Python 3 (zero external dependencies required):

```bash
cd /Users/k8242/Coding/antigravity2-local/kanban_py
python3 serve.py
```

Open **[http://localhost:8080](http://localhost:8080)** on any phone, tablet, or computer on your network.

### Running the Test Suite

```bash
cd /Users/k8242/Coding/antigravity2-local/kanban_py
python3 test_kanban.py
```

---

## Git-Backed Versioning & `private_data` Branch Isolation

The application uses a strict two-branch Git architecture:

1. **Application Code (`main` branch)**:
   - Tracks `serve.py`, `test_kanban.py`, `index.html`, `manifest.json`, `css/`, `js/`, `README.md`, and `revisions.txt`.
   - `.gitignore` excludes `data/*.json` so user task data never appears on `main`.

2. **Private Datastore Commits (`private_data` branch)**:
   - Whenever changes are made to any database (tasks created, moved, edited, databases created/deleted, or batch threshold reached), `serve.py` uses Git plumbing with a dedicated `.git/private_data.index` to stage and commit `data/*.json` directly to `refs/heads/private_data` without switching branches or touching `main`.
   - View datastore commit history with:
     ```bash
     git log -p private_data -- data/
     ```
   - Restore a datastore file from `private_data` with:
     ```bash
     git show private_data:data/board.json > data/board.json
     ```

---

## Features & Usage

### 1. Board View & Pinch-and-Zoom Whole Tableau
- **Multi-Touch Pinch (Phones & iPads):** Pinch with two fingers to smoothly zoom out from 100% down to 25%. This shrinks the entire 4-column board so you can see all tasks across all columns at a glance.
- **One-Tap "Fit Tableau":** Tap the **⛶ Fit Tableau** button in the floating bottom toolbar or press `F` on desktop. The app automatically calculates viewport dimensions and fits the entire board with margins.
- **Single-State Mobile Mode:** Filter the board to any single column state for compact phone screens.
- **Drag & Drop / Quick Move:** Drag cards with mouse/touch or use the inline column selector on each card to change states with 1 tap.

### 2. GTD Lists View & Multi-Database Management
- **Smart Keyboard Task Entry:** Add tasks rapidly using `^today`, `^tomorrow`, `!1`..`!4` priorities, and `#tag` autocomplete.
- **Batch Selection Toolbar:** Select multiple tasks to batch-complete, postpone, change priority/due date/list/tags, delete, or copy/move across databases.
- **Remember The Milk (RTM) Import:** Automatically import RTM JSON exports with custom lists mapped to tags, consolidated recurring task history, and completed tasks placed in `Archive`.

### 3. Tabular List of Tasks and State
- **View all tasks in a structured grid:** Title, State/Status, Priority, Due Date, Assignee, Tags, and Actions.
- **Inline State Modification:** Change the state of any task directly from the table dropdown to instantly update the server datastore and board.
- **Sort & Filter:** Click column headers to sort ascending/descending. Filter by search query, state (defaults to `Backlog`), or priority.

### 4. Text-Only View & Two-Way Sync
- **Accessible Plain-Text Outline:** Fixed-size monospace hierarchical view of tasks grouped by column state (`## IN PROGRESS (2 tasks)`), with priority tags, assignees, and due dates.
- **Interactive Text Sync:** Click **"✏️ Edit as Plain Text"**, add/modify tasks directly as text, and click **"✅ Apply Text to Board"** to batch-update the server datastore.
- **Copy & Download:** One-click copy formatted text report to clipboard or download as a `.txt` file.

### 5. Keyboard Shortcuts
- `1`: Switch to Board View
- `2`: Switch to GTD Lists View
- `3`: Switch to Tabular List View
- `4`: Switch to Text-Only View
- `F`: Fit Tableau to Screen
- `N`: Create New Task
- `Arrow Keys` / `Enter` / `Esc`: Navigate cards/rows, open task details, or close open modals
