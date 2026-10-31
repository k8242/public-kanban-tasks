/**
 * Kanban App Orchestrator
 */

class KanbanApp {
  constructor() {
    this.store = window.kanbanStore;
    this.currentView = 'board'; // 'board' | 'list' | 'table' | 'text'
    this.boardMode = localStorage.getItem('kanban_board_mode') || 'board_only'; // 'board_only' | 'split'
    this.sidebarCollapsed = localStorage.getItem('kanban_sidebar_collapsed') === 'true';

    this.zoomController = null;
    this.boardView = null;
    this.listView = null;
    this.tableView = null;
    this.textView = null;

    this.editingTaskId = null;

    window.kanbanApp = this;
    this.init();
  }

  init() {
    this.setupTheme();
    this.setupDatabaseSwitcher();
    this.setupServerSync();
    this.setupViews();
    this.setupSidePanel();
    this.setupBoardMode();
    this.setupBoardStateFilter();
    this.setupZoom();
    this.setupModal();
    this.setupDetailModal();
    this.setupRepeatHistoryModal();
    this.setupHashDeepLink();
    this.setupNavigation();
    this.setupExportImport();
    this.setupShortcuts();

    // Subscribe to store updates to keep active view refreshed
    this.store.subscribe(() => {
      this.refreshCurrentView();
    });

    // Initial render
    this.switchView('board');
    this.setBoardMode(this.boardMode);

    // On mobile screens (< 768px), auto-fit tableau after layout settles
    setTimeout(() => {
      if (window.innerWidth <= 768 && this.zoomController) {
        this.zoomController.fitTableau(false);
      }
    }, 200);
  }

  setupTheme() {
    const savedTheme = localStorage.getItem('kanban_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    const themeToggleBtn = document.getElementById('btn-toggle-theme');
    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('kanban_theme', next);
        themeToggleBtn.textContent = next === 'dark' ? '🌙' : '☀️';
      });
      themeToggleBtn.textContent = savedTheme === 'dark' ? '🌙' : '☀️';
    }
  }

  setupServerSync() {
    const pill = document.getElementById('server-sync-indicator');
    if (!pill) return;

    const text = pill.querySelector('.sync-text');

    this.store.onSyncChange((status, message) => {
      pill.className = `sync-status-pill status-${status}`;
      if (text) text.textContent = message;
    });

    pill.addEventListener('click', () => {
      if (text) text.textContent = 'Syncing... 🔄';
      this.store.fetchFromServer();
    });
  }

  setupViews() {
    const boardContainer = document.getElementById('zoom-canvas');
    const listContainer = document.getElementById('list-view-container');
    const tableContainer = document.getElementById('table-view-container');
    const textContainer = document.getElementById('text-view-container');
    const sidePanelEl = document.getElementById('app-side-panel');

    this.boardView = new BoardView(
      boardContainer,
      this.store,
      (task) => this.openTaskDetailModal(task),
      (colId) => this.openTaskModal(null, colId),
      (task) => this.openTaskModal(task)
    );
    this.boardView.onStateChange = (newColId) => this.setBoardStateFilter(newColId);

    this.listView = new ListView(
      listContainer,
      sidePanelEl,
      this.store,
      (task) => this.openTaskModal(task),
      (colId) => this.openTaskModal(null, colId),
      (filterId) => {
        // When clicking a sidebar filter, switch to Lists view to inspect it
        if (this.currentView !== 'list') {
          this.switchView('list');
        }
      }
    );

    this.tableView = new TableView(
      tableContainer,
      this.store,
      (task) => this.openTaskModal(task),
      (id) => this.store.deleteTask(id),
      (task) => this.openTaskDetailModal(task)
    );

    this.textView = new TextView(
      textContainer,
      this.store
    );

    // Initial render of the shared side panel
    this.listView.renderSidebar();
  }

  setupSidePanel() {
    const appBody = document.getElementById('app-body');
    const sidebar = document.getElementById('app-side-panel');
    const toggleBtn = document.getElementById('btn-toggle-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');

    // Apply saved collapsed state
    if (this.sidebarCollapsed) {
      if (appBody) appBody.classList.add('sidebar-collapsed');
      if (sidebar) sidebar.classList.add('collapsed');
      if (toggleBtn) toggleBtn.classList.remove('active');
    } else {
      if (appBody) appBody.classList.remove('sidebar-collapsed');
      if (sidebar) sidebar.classList.remove('collapsed');
      if (toggleBtn) toggleBtn.classList.add('active');
    }

    if (toggleBtn) {
      toggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggleSidebar();
      });
    }

    if (backdrop) {
      backdrop.addEventListener('click', () => {
        this.toggleSidebar(false);
      });
    }
  }

  toggleSidebar(forceOpen) {
    const appBody = document.getElementById('app-body');
    const sidebar = document.getElementById('app-side-panel');
    const backdrop = document.getElementById('sidebar-backdrop');
    const toggleBtn = document.getElementById('btn-toggle-sidebar');
    if (!appBody || !sidebar) return;

    // Check if currently collapsed
    const isCurrentlyCollapsed = appBody.classList.contains('sidebar-collapsed') || sidebar.classList.contains('collapsed');
    
    // Determine target open state (if forceOpen specified, true = open, false = collapsed)
    const shouldBeOpen = forceOpen !== undefined ? forceOpen : isCurrentlyCollapsed;

    if (shouldBeOpen) {
      appBody.classList.remove('sidebar-collapsed');
      sidebar.classList.remove('collapsed');
      if (window.innerWidth <= 768) {
        sidebar.classList.add('open');
        if (backdrop) backdrop.classList.add('open');
      }
      this.sidebarCollapsed = false;
      localStorage.setItem('kanban_sidebar_collapsed', 'false');
      if (toggleBtn) toggleBtn.classList.add('active');
    } else {
      appBody.classList.add('sidebar-collapsed');
      sidebar.classList.add('collapsed');
      sidebar.classList.remove('open');
      if (backdrop) backdrop.classList.remove('open');
      this.sidebarCollapsed = true;
      localStorage.setItem('kanban_sidebar_collapsed', 'true');
      if (toggleBtn) toggleBtn.classList.remove('active');
    }

    // When side panel toggles, notify zoom controller to recalculate viewport dimensions
    if (this.currentView === 'board' && this.zoomController) {
      setTimeout(() => this.zoomController.updateCanvasDimensions(), 100);
    }
  }

  setupBoardMode() {
    const btnBoardOnly = document.getElementById('btn-kanban-board-only');
    const btnSplit = document.getElementById('btn-kanban-split-view');
    const btnCloseBottom = document.getElementById('btn-close-bottom-list');
    const filterSelect = document.getElementById('kanban-bottom-list-filter');

    if (btnBoardOnly) {
      btnBoardOnly.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.setBoardMode('board_only');
      });
    }
    if (btnSplit) {
      btnSplit.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.setBoardMode('split');
      });
    }
    if (btnCloseBottom) {
      btnCloseBottom.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.setBoardMode('board_only');
      });
    }

    if (filterSelect) {
      filterSelect.addEventListener('change', () => {
        const streamContainer = document.getElementById('kanban-bottom-list-stream');
        if (this.listView && streamContainer) {
          this.listView.renderBottomList(streamContainer, filterSelect.value);
        }
      });
    }
  }

  setBoardMode(mode) {
    this.boardMode = mode;
    localStorage.setItem('kanban_board_mode', mode);

    const btnBoardOnly = document.getElementById('btn-kanban-board-only');
    const btnSplit = document.getElementById('btn-kanban-split-view');
    const splitContainer = document.getElementById('board-split-container');
    const bottomSection = document.getElementById('kanban-bottom-list-section');
    const streamContainer = document.getElementById('kanban-bottom-list-stream');

    if (btnBoardOnly) btnBoardOnly.classList.toggle('active', mode === 'board_only');
    if (btnSplit) btnSplit.classList.toggle('active', mode === 'split');

    if (splitContainer) {
      splitContainer.classList.toggle('mode-board-only', mode === 'board_only');
      splitContainer.classList.toggle('mode-split', mode === 'split');
    }

    if (bottomSection) {
      if (mode === 'split') {
        bottomSection.style.display = 'flex';
        bottomSection.removeAttribute('hidden');
      } else {
        bottomSection.style.display = 'none';
        bottomSection.setAttribute('hidden', '');
      }
    }

    if (mode === 'split' && streamContainer && this.listView) {
      const filterSelect = document.getElementById('kanban-bottom-list-filter');
      const colFilter = filterSelect ? filterSelect.value : 'all';
      this.listView.renderBottomList(streamContainer, colFilter);
    }

    if (this.zoomController) {
      setTimeout(() => {
        this.zoomController.updateCanvasDimensions();
      }, 50);
    }
  }

  setupBoardStateFilter() {
    this.boardStateFilter = 'all';
    this.renderBoardStateFilterPills();
  }

  renderBoardStateFilterPills() {
    const pillsContainer = document.getElementById('board-state-filter-pills');
    if (!pillsContainer) return;

    pillsContainer.innerHTML = '';

    // 'All Columns' pill (Whole Tableau)
    const allPill = document.createElement('button');
    allPill.type = 'button';
    allPill.className = `state-filter-pill ${this.boardStateFilter === 'all' ? 'active' : ''}`;
    allPill.innerHTML = `<span>⛶</span> All Columns`;
    allPill.addEventListener('click', () => {
      this.setBoardStateFilter('all');
    });
    pillsContainer.appendChild(allPill);

    // Columns that appear on board
    const boardCols = this.store.columns.filter(c => c.showInBoard !== false);
    boardCols.forEach(col => {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = `state-filter-pill ${this.boardStateFilter === col.id ? 'active' : ''}`;
      pill.innerHTML = `<span>${col.icon || '📁'}</span> ${col.title}`;
      pill.addEventListener('click', () => {
        this.setBoardStateFilter(col.id);
      });
      pillsContainer.appendChild(pill);
    });
  }

  setBoardStateFilter(colId) {
    this.boardStateFilter = colId;
    this.renderBoardStateFilterPills();

    if (this.boardView) {
      this.boardView.setSingleColumn(colId);
    }

    if (this.zoomController) {
      if (colId === 'all') {
        if (window.innerWidth <= 768) {
          setTimeout(() => this.zoomController.fitTableau(false), 60);
        } else {
          setTimeout(() => this.zoomController.updateCanvasDimensions(), 60);
        }
      } else {
        // Reset zoom to 1.0 (100%) so cards fill screen width comfortably on phone without shrinking
        this.zoomController.resetZoom();
        setTimeout(() => this.zoomController.updateCanvasDimensions(), 60);
      }
    }
  }

  setupZoom() {
    const viewport = document.getElementById('zoom-viewport');
    const canvas = document.getElementById('zoom-canvas');
    const zoomHud = document.getElementById('zoom-hud-percent');

    this.zoomController = new ZoomCanvasController(viewport, canvas, {
      minScale: 0.22,
      maxScale: 2.2,
      onZoomChange: (state) => {
        if (zoomHud) {
          zoomHud.textContent = state.isFitted ? `Fit: ${state.percentage}%` : `${state.percentage}%`;
        }
      }
    });

    // Wire zoom buttons
    const btnFit = document.getElementById('btn-zoom-fit');
    const btnReset = document.getElementById('btn-zoom-reset');
    const btnIn = document.getElementById('btn-zoom-in');
    const btnOut = document.getElementById('btn-zoom-out');

    if (btnFit) btnFit.addEventListener('click', () => this.zoomController.fitTableau());
    if (btnReset) btnReset.addEventListener('click', () => this.zoomController.resetZoom());
    if (btnIn) btnIn.addEventListener('click', () => this.zoomController.zoomIn());
    if (btnOut) btnOut.addEventListener('click', () => this.zoomController.zoomOut());
  }

  switchView(viewName) {
    this.currentView = viewName;

    // View containers
    const boardContainer = document.getElementById('board-view-container');
    const listContainer = document.getElementById('list-view-container');
    const tableContainer = document.getElementById('table-view-container');
    const textContainer = document.getElementById('text-view-container');
    const zoomControls = document.getElementById('zoom-controls-bar');

    boardContainer.classList.toggle('active', viewName === 'board');
    if (listContainer) listContainer.classList.toggle('active', viewName === 'list');
    tableContainer.classList.toggle('active', viewName === 'table');
    textContainer.classList.toggle('active', viewName === 'text');

    // Show zoom controls bar specifically in board view
    if (zoomControls) {
      zoomControls.style.display = viewName === 'board' ? 'flex' : 'none';
    }

    // Update active nav button
    document.querySelectorAll('.view-nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    // Render active view
    this.refreshCurrentView();

    // If switching to board on mobile, auto fit tableau
    if (viewName === 'board' && window.innerWidth <= 768 && this.zoomController) {
      setTimeout(() => this.zoomController.fitTableau(false), 50);
    }
  }

  refreshCurrentView() {
    if (this.listView) {
      this.listView.renderSidebar();
    }

    if (this.currentView === 'board') {
      this.boardView.render();
      this.renderBoardStateFilterPills();
      if (this.boardMode === 'split') {
        const streamContainer = document.getElementById('kanban-bottom-list-stream');
        const filterSelect = document.getElementById('kanban-bottom-list-filter');
        const colFilter = filterSelect ? filterSelect.value : 'all';
        if (this.listView && streamContainer) {
          this.listView.renderBottomList(streamContainer, colFilter);
        }
      }
    } else if (this.currentView === 'list') {
      this.listView.render();
    } else if (this.currentView === 'table') {
      this.tableView.render();
    } else if (this.currentView === 'text') {
      this.textView.render();
    }
  }

  setupNavigation() {
    // View tabs (Header and Mobile Bottom Bar)
    document.querySelectorAll('.view-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        this.switchView(view);
      });
    });

    // Add Task Button
    const btnAddTask = document.getElementById('btn-add-task');
    if (btnAddTask) {
      btnAddTask.addEventListener('click', () => this.openTaskModal());
    }
  }

  setupModal() {
    const modal = document.getElementById('task-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const modalCancelBtn = document.getElementById('modal-cancel-btn');
    const modalDeleteBtn = document.getElementById('modal-delete-btn');
    const form = document.getElementById('task-form');

    const closeModal = () => {
      modal.classList.remove('open');
      this.editingTaskId = null;
      form.reset();
    };

    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
    if (modalCancelBtn) modalCancelBtn.addEventListener('click', closeModal);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    if (modalDeleteBtn) {
      modalDeleteBtn.addEventListener('click', () => {
        if (this.editingTaskId) {
          if (confirm('Delete this task?')) {
            this.store.deleteTask(this.editingTaskId);
            closeModal();
          }
        }
      });
    }

    const modalGcalBtn = document.getElementById('modal-gcal-btn');
    if (modalGcalBtn) {
      modalGcalBtn.addEventListener('click', () => {
        if (this.editingTaskId) {
          const task = this.store.getTask(this.editingTaskId);
          if (task) {
            const url = this.generateGoogleCalendarUrl(task);
            window.open(url, '_blank', 'noopener,noreferrer');
          }
        }
      });
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const title = document.getElementById('modal-task-title').value.trim();
      if (!title) return;

      const description = document.getElementById('modal-task-desc').value.trim();
      const columnId = document.getElementById('modal-task-column').value;
      const priority = document.getElementById('modal-task-priority').value;
      const dueDate = document.getElementById('modal-task-due').value;
      const assignee = document.getElementById('modal-task-assignee').value.trim();
      const tags = document.getElementById('modal-task-tags').value.trim();
      const url = document.getElementById('modal-task-url') ? document.getElementById('modal-task-url').value.trim() : '';
      const isMarkdown = document.getElementById('modal-task-markdown') ? document.getElementById('modal-task-markdown').checked : false;
      const repeatSelect = document.getElementById('modal-task-repeat');
      const repeatType = repeatSelect ? repeatSelect.value : 'none';
      const repeat = { type: repeatType };

      const taskData = { title, description, isMarkdown, columnId, priority, dueDate, assignee, tags, url, repeat };

      if (this.editingTaskId) {
        this.store.updateTask(this.editingTaskId, taskData);
      } else {
        this.store.addTask(taskData);
      }

      closeModal();
    });
  }

  setupDetailModal() {
    const modal = document.getElementById('task-detail-modal');
    if (!modal) return;
    const closeBtn = document.getElementById('detail-modal-close-btn');
    const bottomCloseBtn = document.getElementById('btn-detail-close');
    const switchEditBtn = document.getElementById('btn-detail-switch-edit');
    const gcalBtn = document.getElementById('btn-detail-gcal');
    const colSelect = document.getElementById('detail-select-column');
    const priSelect = document.getElementById('detail-select-priority');
    const repSelect = document.getElementById('detail-select-repeat');
    const repHistoryBtn = document.getElementById('btn-detail-view-repeat-history');

    const closeDetail = () => {
      modal.classList.remove('open');
      this.viewingTask = null;
    };

    if (closeBtn) closeBtn.addEventListener('click', closeDetail);
    if (bottomCloseBtn) bottomCloseBtn.addEventListener('click', closeDetail);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeDetail();
    });

    const triggerEdit = () => {
      if (this.viewingTask) {
        const taskToEdit = this.viewingTask;
        closeDetail();
        this.openTaskModal(taskToEdit);
      }
    };

    if (switchEditBtn) switchEditBtn.addEventListener('click', triggerEdit);

    if (colSelect) {
      colSelect.addEventListener('change', () => {
        if (this.viewingTask) {
          this.store.updateTask(this.viewingTask.id, { columnId: colSelect.value });
          this.viewingTask = this.store.getTask(this.viewingTask.id) || this.viewingTask;
          this.updateDetailBadges(this.viewingTask);
          this.updateDetailTimestamps(this.viewingTask);
          this.refreshCurrentView();
        }
      });
    }

    if (priSelect) {
      priSelect.addEventListener('change', () => {
        if (this.viewingTask) {
          this.store.updateTask(this.viewingTask.id, { priority: priSelect.value });
          this.viewingTask = this.store.getTask(this.viewingTask.id) || this.viewingTask;
          this.updateDetailBadges(this.viewingTask);
          this.updateDetailTimestamps(this.viewingTask);
          this.refreshCurrentView();
        }
      });
    }

    if (repSelect) {
      repSelect.addEventListener('change', () => {
        if (this.viewingTask) {
          const repType = repSelect.value;
          const currentRepeat = typeof this.viewingTask.repeat === 'object' ? this.viewingTask.repeat : { type: 'none' };
          this.store.updateTask(this.viewingTask.id, { repeat: { ...currentRepeat, type: repType } });
          this.viewingTask = this.store.getTask(this.viewingTask.id) || this.viewingTask;
          this.updateDetailTimestamps(this.viewingTask);
          const repWrapper = document.getElementById('detail-repeat-history-btn-wrapper');
          if (repWrapper) repWrapper.style.display = (repType !== 'none') ? 'block' : 'none';
          this.refreshCurrentView();
        }
      });
    }

    if (repHistoryBtn) {
      repHistoryBtn.addEventListener('click', () => {
        if (this.viewingTask) {
          this.showRepeatHistoryModal(this.viewingTask);
        }
      });
    }

    if (gcalBtn) {
      gcalBtn.addEventListener('click', () => {
        if (this.viewingTask) {
          const url = this.generateGoogleCalendarUrl(this.viewingTask);
          window.open(url, '_blank', 'noopener,noreferrer');
        }
      });
    }
  }

  openRepeatHistoryModal(task) {
    return this.showRepeatHistoryModal(task);
  }

  updateDetailBadges(task) {
    if (!task) return;
    const colBadge = document.getElementById('detail-task-column-badge');
    const priBadge = document.getElementById('detail-task-priority-badge');
    const col = this.store.columns.find(c => c.id === task.columnId);

    if (colBadge) {
      colBadge.textContent = col ? `${col.icon || ''} ${col.title}` : task.columnId;
      colBadge.style.borderColor = col ? col.color : 'var(--border-color)';
    }

    if (priBadge) {
      priBadge.textContent = task.priority ? task.priority.toUpperCase() : 'MEDIUM';
      priBadge.className = `detail-badge detail-priority-badge badge-${task.priority || 'medium'}`;
    }
  }

  updateDetailTimestamps(task) {
    if (!task) return;
    const createdEl = document.getElementById('detail-created-time');
    const updatedEl = document.getElementById('detail-updated-time');
    const compEl = document.getElementById('detail-completed-time');
    const compGroup = document.getElementById('detail-completed-group');
    const compValue = document.getElementById('detail-task-completed');
    if (createdEl) {
      createdEl.textContent = task.createdAt ? `Created: ${new Date(task.createdAt).toLocaleString()}` : '';
    }
    if (updatedEl) {
      const updatedDate = task.updatedAt || task.createdAt;
      updatedEl.textContent = updatedDate ? `Last edited: ${new Date(updatedDate).toLocaleString()}` : '';
    }

    const isDoneOrArchive = task.columnId === 'done' || task.columnId === 'archive';
    const isAbandoned = task.columnId === 'abandoned';
    const compDate = (this.store && this.store.getTaskCompletionDate) ? this.store.getTaskCompletionDate(task) : (task.completedAt ? String(task.completedAt).slice(0, 10) : null);
    const abandonedDate = (this.store && this.store.getTaskAbandonedDate) ? this.store.getTaskAbandonedDate(task) : (task.abandonedAt ? String(task.abandonedAt).slice(0, 10) : null);
    const compLabel = compGroup ? compGroup.querySelector('label') : null;

    if (isAbandoned && abandonedDate) {
      if (compEl) {
        compEl.style.display = 'inline';
        compEl.textContent = `Abandoned: ${abandonedDate}`;
      }
      if (compGroup) compGroup.style.display = 'block';
      if (compLabel) compLabel.textContent = 'Abandoned Date';
      if (compValue) {
        compValue.textContent = `🚫 ${abandonedDate}`;
        compValue.style.color = 'var(--text-muted, #64748b)';
      }
    } else if (isDoneOrArchive && compDate) {
      if (compEl) {
        compEl.style.display = 'inline';
        compEl.textContent = `Completed: ${compDate}`;
      }
      if (compGroup) compGroup.style.display = 'block';
      if (compLabel) compLabel.textContent = 'Completed Date';
      if (compValue) {
        compValue.textContent = `✅ ${compDate}`;
        compValue.style.color = 'var(--accent-success, #22c55e)';
      }
    } else {
      if (compEl) compEl.style.display = 'none';
      if (compGroup) compGroup.style.display = 'none';
    }
  }

  openTaskDetailModal(task) {
    if (!task) return;
    task = (task.id ? this.store.getTask(task.id) : null) || task;
    this.viewingTask = task;
    const modal = document.getElementById('task-detail-modal');
    if (!modal) return;

    // Header Badges
    this.updateDetailBadges(task);

    // Title
    const titleEl = document.getElementById('detail-task-title');
    if (titleEl) titleEl.textContent = task.title || 'Untitled Task';

    // Right-Side Dropdown Fields & Properties
    const colSelect = document.getElementById('detail-select-column');
    if (colSelect) {
      colSelect.innerHTML = this.store.columns
        .map(c => `<option value="${c.id}" ${c.id === task.columnId ? 'selected' : ''}>${c.icon || '📁'} ${this.escapeHtml(c.title)}</option>`)
        .join('');
    }

    const priSelect = document.getElementById('detail-select-priority');
    if (priSelect) {
      priSelect.value = task.priority || 'medium';
    }

    const repSelect = document.getElementById('detail-select-repeat');
    const repWrapper = document.getElementById('detail-repeat-history-btn-wrapper');
    const repType = (typeof task.repeat === 'object' && task.repeat ? task.repeat.type : task.repeat) || 'none';
    const hasHistory = Array.isArray(task.completionHistory) && task.completionHistory.length > 0;
    if (repSelect) repSelect.value = repType;
    if (repWrapper) repWrapper.style.display = (repType !== 'none' || hasHistory) ? 'block' : 'none';

    const dueEl = document.getElementById('detail-task-due');
    if (dueEl) dueEl.textContent = task.dueDate ? `📅 ${task.dueDate}` : '—';

    const assEl = document.getElementById('detail-task-assignee');
    if (assEl) assEl.textContent = task.assignee ? `👤 ${task.assignee}` : '—';

    const urlEl = document.getElementById('detail-task-url');
    if (urlEl) {
      if (task.url) {
        urlEl.innerHTML = `<a href="${this.escapeHtml(task.url)}" target="_blank" rel="noopener noreferrer" style="color: var(--accent-primary); text-decoration: underline;">🔗 ${this.escapeHtml(task.url)}</a>`;
      } else {
        urlEl.textContent = '—';
      }
    }

    // Tags
    const tagsContainer = document.getElementById('detail-task-tags');
    const tagsSection = document.getElementById('detail-tags-section');
    if (tagsContainer) {
      if (task.tags && task.tags.length > 0) {
        if (tagsSection) tagsSection.style.display = 'block';
        tagsContainer.innerHTML = task.tags.map(t => {
          const color = this.store.getTagColor ? this.store.getTagColor(t) : '#3b82f6';
          return `<span class="card-tag" style="background-color: ${color}20; color: ${color}; border: 1px solid ${color}55; font-size: 11px; padding: 2px 8px;">#${this.escapeHtml(t)}</span>`;
        }).join('');
      } else {
        if (tagsSection) tagsSection.style.display = 'none';
        tagsContainer.innerHTML = '';
      }
    }

    // Description & Notes
    const descEl = document.getElementById('detail-task-desc');
    if (descEl) {
      if (task.description) {
        if (task.isMarkdown && typeof window !== 'undefined' && window.renderMarkdown) {
          descEl.innerHTML = window.renderMarkdown(task.description);
        } else {
          descEl.textContent = task.description;
        }
      } else {
        descEl.innerHTML = '<span style="color: var(--text-muted); font-style: italic;">No description or notes provided for this task.</span>';
      }
    }

    // Timestamps
    this.updateDetailTimestamps(task);

    modal.classList.add('open');
  }

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  openTaskModal(task = null, defaultColumnId = null) {
    if (task && task.id) {
      task = this.store.getTask(task.id) || task;
    }
    const modal = document.getElementById('task-modal');
    const modalTitle = document.getElementById('modal-heading');
    const modalDeleteBtn = document.getElementById('modal-delete-btn');
    const modalGcalBtn = document.getElementById('modal-gcal-btn');
    const columnSelect = document.getElementById('modal-task-column');
    const timestampsContainer = document.getElementById('modal-task-timestamps');
    const createdTimeEl = document.getElementById('modal-created-time');
    const updatedTimeEl = document.getElementById('modal-updated-time');
    const repeatSelect = document.getElementById('modal-task-repeat');
    const repeatHistoryBtnWrapper = document.getElementById('modal-repeat-history-btn-wrapper');
    const repeatHistoryBtn = document.getElementById('btn-view-repeat-history');

    // Populate column options (Includes all columns: Backlog, In Progress, In Review, Done, Archive)
    columnSelect.innerHTML = this.store.columns
      .map(c => `<option value="${c.id}">${c.icon || '📁'} ${c.title}</option>`)
      .join('');

    if (repeatSelect) {
      repeatSelect.onchange = () => {
        if (repeatHistoryBtnWrapper) {
          repeatHistoryBtnWrapper.style.display = (task && repeatSelect.value !== 'none') ? 'block' : 'none';
        }
      };
    }

    columnSelect.onchange = () => {
      const selectedCol = columnSelect.value;
      const modalCompTimeEl = document.getElementById('modal-completed-time');
      const modalCompGroup = document.getElementById('modal-completed-group');
      const modalCompValue = document.getElementById('modal-task-completed');
      const modalCompLabel = modalCompGroup ? modalCompGroup.querySelector('label') : null;

      if (selectedCol === 'abandoned') {
        const aDate = (task && (task.abandonedAt || (task.columnId === 'abandoned' && task.updatedAt)))
          ? String(task.abandonedAt || task.updatedAt).slice(0, 10)
          : new Date().toISOString().slice(0, 10);
        if (modalCompTimeEl) {
          modalCompTimeEl.style.display = 'inline';
          modalCompTimeEl.textContent = `Abandoned: ${aDate}`;
        }
        if (modalCompGroup) modalCompGroup.style.display = 'block';
        if (modalCompLabel) modalCompLabel.textContent = 'Abandoned Date';
        if (modalCompValue) {
          modalCompValue.textContent = `🚫 ${aDate}`;
          modalCompValue.style.color = 'var(--text-muted, #64748b)';
        }
      } else if (selectedCol === 'done' || selectedCol === 'archive') {
        const cDate = (task && this.store.getTaskCompletionDate(task)) || new Date().toISOString().slice(0, 10);
        if (modalCompTimeEl) {
          modalCompTimeEl.style.display = 'inline';
          modalCompTimeEl.textContent = `Completed: ${cDate}`;
        }
        if (modalCompGroup) modalCompGroup.style.display = 'block';
        if (modalCompLabel) modalCompLabel.textContent = 'Completed Date';
        if (modalCompValue) {
          modalCompValue.textContent = `✅ ${cDate}`;
          modalCompValue.style.color = 'var(--accent-success, #22c55e)';
        }
      } else {
        if (modalCompTimeEl) modalCompTimeEl.style.display = 'none';
        if (modalCompGroup) modalCompGroup.style.display = 'none';
      }
    };

    if (task) {
      this.editingTaskId = task.id;
      modalTitle.textContent = 'Edit Task';
      modalDeleteBtn.style.display = 'inline-flex';
      if (modalGcalBtn) modalGcalBtn.style.display = 'inline-flex';

      document.getElementById('modal-task-title').value = task.title || '';
      document.getElementById('modal-task-desc').value = task.description || '';
      const markdownCheckbox = document.getElementById('modal-task-markdown');
      if (markdownCheckbox) markdownCheckbox.checked = Boolean(task.isMarkdown);
      document.getElementById('modal-task-column').value = task.columnId || this.store.columns[0].id;
      document.getElementById('modal-task-priority').value = task.priority || 'medium';
      document.getElementById('modal-task-due').value = task.dueDate || '';
      document.getElementById('modal-task-assignee').value = task.assignee || '';
      document.getElementById('modal-task-tags').value = (task.tags || []).join(', ');
      const urlInput = document.getElementById('modal-task-url');
      if (urlInput) urlInput.value = task.url || '';

      const taskRepeatType = (task.repeat && task.repeat.type) ? task.repeat.type : 'none';
      if (repeatSelect) repeatSelect.value = taskRepeatType;

      if (repeatHistoryBtnWrapper) {
        repeatHistoryBtnWrapper.style.display = taskRepeatType !== 'none' ? 'block' : 'none';
      }
      if (repeatHistoryBtn) {
        repeatHistoryBtn.onclick = () => {
          this.showRepeatHistoryModal(task);
        };
      }

      if (timestampsContainer) {
        timestampsContainer.style.display = 'flex';
        const createdStr = task.createdAt ? new Date(task.createdAt).toLocaleString() : 'Earlier';
        const updatedStr = task.updatedAt ? new Date(task.updatedAt).toLocaleString() : createdStr;
        if (createdTimeEl) createdTimeEl.textContent = `Created: ${createdStr}`;
        if (updatedTimeEl) updatedTimeEl.textContent = `Last edited: ${updatedStr}`;
      }

      const modalCompTimeEl = document.getElementById('modal-completed-time');
      const modalCompGroup = document.getElementById('modal-completed-group');
      const modalCompValue = document.getElementById('modal-task-completed');
      const modalCompLabel = modalCompGroup ? modalCompGroup.querySelector('label') : null;
      const isDoneOrArchive = task.columnId === 'done' || task.columnId === 'archive';
      const isAbandoned = task.columnId === 'abandoned';
      const compDate = (this.store && this.store.getTaskCompletionDate) ? this.store.getTaskCompletionDate(task) : (task.completedAt ? String(task.completedAt).slice(0, 10) : null);
      const abandonedDate = (this.store && this.store.getTaskAbandonedDate) ? this.store.getTaskAbandonedDate(task) : (task.abandonedAt ? String(task.abandonedAt).slice(0, 10) : null);

      if (isAbandoned && abandonedDate) {
        if (modalCompTimeEl) {
          modalCompTimeEl.style.display = 'inline';
          modalCompTimeEl.textContent = `Abandoned: ${abandonedDate}`;
        }
        if (modalCompGroup) modalCompGroup.style.display = 'block';
        if (modalCompLabel) modalCompLabel.textContent = 'Abandoned Date';
        if (modalCompValue) {
          modalCompValue.textContent = `🚫 ${abandonedDate}`;
          modalCompValue.style.color = 'var(--text-muted, #64748b)';
        }
      } else if (isDoneOrArchive && compDate) {
        if (modalCompTimeEl) {
          modalCompTimeEl.style.display = 'inline';
          modalCompTimeEl.textContent = `Completed: ${compDate}`;
        }
        if (modalCompGroup) modalCompGroup.style.display = 'block';
        if (modalCompLabel) modalCompLabel.textContent = 'Completed Date';
        if (modalCompValue) {
          modalCompValue.textContent = `✅ ${compDate}`;
          modalCompValue.style.color = 'var(--accent-success, #22c55e)';
        }
      } else {
        if (modalCompTimeEl) modalCompTimeEl.style.display = 'none';
        if (modalCompGroup) modalCompGroup.style.display = 'none';
      }
    } else {
      this.editingTaskId = null;
      modalTitle.textContent = 'Create New Task';
      modalDeleteBtn.style.display = 'none';
      if (modalGcalBtn) modalGcalBtn.style.display = 'none';

      document.getElementById('task-form').reset();
      const markdownCheckbox = document.getElementById('modal-task-markdown');
      if (markdownCheckbox) markdownCheckbox.checked = false;
      const urlInput = document.getElementById('modal-task-url');
      if (urlInput) urlInput.value = '';
      if (repeatSelect) repeatSelect.value = 'none';
      if (repeatHistoryBtnWrapper) repeatHistoryBtnWrapper.style.display = 'none';
      if (timestampsContainer) timestampsContainer.style.display = 'none';

      const modalCompTimeEl = document.getElementById('modal-completed-time');
      const modalCompGroup = document.getElementById('modal-completed-group');
      if (modalCompTimeEl) modalCompTimeEl.style.display = 'none';
      if (modalCompGroup) modalCompGroup.style.display = 'none';

      if (defaultColumnId) {
        document.getElementById('modal-task-column').value = defaultColumnId;
      }
    }

    modal.classList.add('open');
    setTimeout(() => {
      document.getElementById('modal-task-title').focus();
    }, 100);
  }

  setupRepeatHistoryModal() {
    const modal = document.getElementById('repeat-history-modal');
    const closeBtn = document.getElementById('repeat-history-close-btn');
    const doneBtn = document.getElementById('repeat-history-done-btn');
    const closeModal = () => {
      if (modal) modal.classList.remove('open');
    };

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (doneBtn) doneBtn.addEventListener('click', closeModal);
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });
    }

    // Global listener for clicking on any repeat badge
    document.addEventListener('click', (e) => {
      const trigger = e.target.closest('.badge-repeat-trigger');
      if (trigger && trigger.dataset.taskId) {
        e.stopPropagation();
        e.preventDefault();
        const task = this.store.getTask(trigger.dataset.taskId);
        if (task) {
          this.showRepeatHistoryModal(task);
        }
      }
    });
  }

  showRepeatHistoryModal(task) {
    const modal = document.getElementById('repeat-history-modal');
    if (!modal) return;

    const subtitleEl = document.getElementById('repeat-history-subtitle');
    const statsEl = document.getElementById('repeat-history-stats');
    const chartTitleEl = document.getElementById('repeat-history-chart-title');
    const gridEl = document.getElementById('repeat-history-grid');
    const listEl = document.getElementById('repeat-history-list');

    const repeatType = (task.repeat && task.repeat.type) || 'weekly';
    const history = (task.completionHistory || []).slice().sort();
    const totalCompletions = history.length;
    const lastCompleted = history.length > 0 ? history[history.length - 1] : 'Never';
    const nextDue = task.dueDate || 'Unscheduled';

    if (subtitleEl) {
      subtitleEl.textContent = `Task: "${task.title}" · Repeat Cadence: ${repeatType.toUpperCase()}`;
    }

    if (statsEl) {
      statsEl.innerHTML = `
        <div class="repeat-stat-card">
          <span class="stat-value">${totalCompletions}</span>
          <span class="stat-label">Completions</span>
        </div>
        <div class="repeat-stat-card">
          <span class="stat-value">${lastCompleted}</span>
          <span class="stat-label">Last Done</span>
        </div>
        <div class="repeat-stat-card">
          <span class="stat-value">${nextDue}</span>
          <span class="stat-label">Next Due</span>
        </div>
      `;
    }

    if (gridEl) {
      gridEl.innerHTML = '';

      if (repeatType === 'weekly') {
        if (chartTitleEl) chartTitleEl.textContent = 'Weekly Completion Matrix (Past 12 Weeks)';
        const now = new Date();
        const weeks = [];
        for (let i = 11; i >= 0; i--) {
          const d = new Date(now.getTime() - (i * 7 * 86400000));
          const weekStart = new Date(d.getTime() - (d.getDay() * 86400000));
          const weekEnd = new Date(weekStart.getTime() + (6 * 86400000));
          const startStr = weekStart.toISOString().slice(0, 10);
          const endStr = weekEnd.toISOString().slice(0, 10);
          
          const match = history.find(cDate => cDate >= startStr && cDate <= endStr);
          weeks.push({
            label: `W-${i === 0 ? 'Now' : i}`,
            dateRange: `${startStr.slice(5)} to ${endStr.slice(5)}`,
            completed: !!match,
            completedDate: match
          });
        }

        weeks.forEach(wk => {
          const cell = document.createElement('div');
          cell.className = `repeat-grid-cell ${wk.completed ? 'completed' : 'empty'}`;
          cell.title = wk.completed ? `Completed: ${wk.completedDate} (${wk.dateRange})` : `No completion recorded (${wk.dateRange})`;
          cell.innerHTML = `
            <span class="cell-label">${wk.label}</span>
            <span class="cell-status">${wk.completed ? '✓' : '—'}</span>
          `;
          gridEl.appendChild(cell);
        });

      } else if (repeatType === 'monthly') {
        if (chartTitleEl) chartTitleEl.textContent = 'Monthly Completion Matrix (Past 12 Months)';
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const now = new Date();
        const months = [];
        for (let i = 11; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const yearMonth = d.toISOString().slice(0, 7);
          const mLabel = `${monthNames[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
          const match = history.find(cDate => cDate.startsWith(yearMonth));
          months.push({
            label: mLabel,
            completed: !!match,
            completedDate: match
          });
        }

        months.forEach(m => {
          const cell = document.createElement('div');
          cell.className = `repeat-grid-cell ${m.completed ? 'completed' : 'empty'}`;
          cell.title = m.completed ? `Completed: ${m.completedDate}` : `No completion recorded in ${m.label}`;
          cell.innerHTML = `
            <span class="cell-label">${m.label}</span>
            <span class="cell-status">${m.completed ? '✓' : '—'}</span>
          `;
          gridEl.appendChild(cell);
        });

      } else if (repeatType === 'annually') {
        if (chartTitleEl) chartTitleEl.textContent = 'Annual Completion Matrix (Past 6 Years)';
        const curYear = new Date().getFullYear();
        const years = [];
        for (let y = curYear - 5; y <= curYear; y++) {
          const match = history.find(cDate => cDate.startsWith(String(y)));
          years.push({
            label: String(y),
            completed: !!match,
            completedDate: match
          });
        }

        years.forEach(yr => {
          const cell = document.createElement('div');
          cell.className = `repeat-grid-cell ${yr.completed ? 'completed' : 'empty'}`;
          cell.title = yr.completed ? `Completed in ${yr.label}: ${yr.completedDate}` : `No completion recorded in ${yr.label}`;
          cell.innerHTML = `
            <span class="cell-label">${yr.label}</span>
            <span class="cell-status">${yr.completed ? '✓' : '—'}</span>
          `;
          gridEl.appendChild(cell);
        });
      }
    }

    if (listEl) {
      if (history.length === 0) {
        listEl.innerHTML = `<div class="text-muted" style="font-size: 12px; text-align: center; padding: 12px;">No past completions recorded yet. When you complete this task, it will automatically record the completion date in chronological order and resurrect with the next due date.</div>`;
      } else {
        const listItems = history.map((date, idx) => `
          <div class="history-list-item">
            <span class="history-check">✓</span>
            <span class="history-num">#${idx + 1}</span>
            <span class="history-date">${date}</span>
            <span class="history-cycle">${repeatType} cycle</span>
          </div>
        `).join('');
        listEl.innerHTML = `
          <div class="history-list-header">Completion History (Chronological)</div>
          <div class="history-items-container">${listItems}</div>
        `;
      }
    }

    modal.classList.add('open');
  }

  showNotification(msg) {
    const toast = document.createElement('div');
    toast.className = 'kanban-toast-notification';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('visible'), 10);
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 350);
    }, 4000);
  }

  showToast(msg) {
    this.showNotification(msg);
  }

  updateDatabaseSelector() {
    const select = document.getElementById('db-select');
    if (!select) return;
    const current = this.store.currentDb || 'default';
    const dbs = Array.from(new Set([...(this.store.databases || ['default']), current])).sort();
    select.innerHTML = '';
    dbs.forEach(db => {
      const opt = document.createElement('option');
      opt.value = db;
      opt.textContent = `DB: ${db}`;
      if (db === current) opt.selected = true;
      select.appendChild(opt);
    });
    select.value = current;

    const btnDel = document.getElementById('btn-db-del');
    if (btnDel) {
      if (current === 'default' || current === 'board') {
        btnDel.style.display = 'none';
      } else {
        btnDel.style.display = 'inline-flex';
        btnDel.title = `Delete Database "${current}"`;
      }
    }
  }

  setupDatabaseSwitcher() {
    const select = document.getElementById('db-select');
    const btnAdd = document.getElementById('btn-db-add');
    const btnDel = document.getElementById('btn-db-del');
    const modal = document.getElementById('create-db-modal');
    const closeBtn = document.getElementById('btn-close-create-db');
    const cancelBtn = document.getElementById('btn-cancel-create-db');
    const form = document.getElementById('create-db-form');
    const nameInput = document.getElementById('new-db-name');
    const copySelect = document.getElementById('new-db-copy-from');

    this.updateDatabaseSelector();

    if (select) {
      select.addEventListener('change', async (e) => {
        const chosen = e.target.value;
        if (chosen && chosen !== this.store.currentDb) {
          await this.store.switchDatabase(chosen);
          this.updateDatabaseSelector();
          this.refreshCurrentView();
          this.showToast(`Switched to database: ${chosen}`);
        }
      });
    }

    if (btnDel) {
      btnDel.addEventListener('click', async () => {
        const current = this.store.currentDb || 'default';
        if (current === 'default' || current === 'board') {
          alert('Cannot delete the default database.');
          return;
        }
        if (confirm(`Are you sure you want to permanently delete database "${current}"?\n\nThis will remove all tasks and server data for this database.`)) {
          await this.store.deleteDatabase(current);
          await this.store.listDatabases();
          this.updateDatabaseSelector();
          this.refreshCurrentView();
          this.showToast(`Database "${current}" deleted`);
        }
      });
    }

    const renderExistingDbs = () => {
      const listEl = document.getElementById('existing-dbs-list');
      if (!listEl) return;
      const allDbs = Array.from(new Set([...(this.store.databases || ['default'])])).sort();
      listEl.innerHTML = allDbs.map(db => {
        const isProtected = db === 'default' || db === 'board';
        const isCurrent = db === (this.store.currentDb || 'default');
        return `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; font-size: 13px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span>🗄️</span>
              <strong style="${isCurrent ? 'color: var(--accent-primary);' : ''}">${this.escapeHtml(db)}</strong>
              ${isCurrent ? '<span style="font-size: 10px; padding: 2px 6px; background: rgba(59,130,246,0.15); color: var(--accent-primary); border-radius: 4px; font-weight: 600;">ACTIVE</span>' : ''}
            </div>
            <div>
              ${!isProtected ? `<button type="button" class="btn btn-sm btn-danger btn-delete-db-entry" data-db="${this.escapeHtml(db)}" style="padding: 2px 8px; font-size: 11px;">🗑️ Delete</button>` : '<span style="font-size: 11px; color: var(--text-muted); font-style: italic;">Protected</span>'}
            </div>
          </div>
        `;
      }).join('');

      listEl.querySelectorAll('.btn-delete-db-entry').forEach(b => {
        b.addEventListener('click', async (e) => {
          e.stopPropagation();
          const targetDb = b.dataset.db;
          if (confirm(`Are you sure you want to delete database "${targetDb}"?`)) {
            await this.store.deleteDatabase(targetDb);
            await this.store.listDatabases();
            this.updateDatabaseSelector();
            this.refreshCurrentView();
            renderExistingDbs();
            this.showToast(`Database "${targetDb}" deleted`);
          }
        });
      });
    };

    const openCreateModal = () => {
      if (!modal) return;
      if (nameInput) nameInput.value = '';
      if (copySelect) {
        const dbs = Array.from(new Set([...(this.store.databases || ['default']), this.store.currentDb || 'default'])).sort();
        copySelect.innerHTML = `
          <option value="none">Empty Database (No tasks)</option>
          ${dbs.map(d => `<option value="${d}">Copy from: ${d}</option>`).join('')}
        `;
      }
      renderExistingDbs();
      modal.classList.add('open');
      if (nameInput) setTimeout(() => nameInput.focus(), 50);
    };

    const closeCreateModal = () => {
      if (modal) modal.classList.remove('open');
    };

    if (btnAdd) {
      btnAdd.addEventListener('click', openCreateModal);
    }
    if (closeBtn) closeBtn.addEventListener('click', closeCreateModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeCreateModal);
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeCreateModal();
      });
    }

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const rawName = nameInput ? nameInput.value : '';
        const clean = (rawName || '').trim().toLowerCase().replace(/[^a-z0-9_\-]/g, '');
        if (!clean || clean === 'default' || clean === 'board') {
          alert('Invalid database name. Please use a unique alphanumeric name (cannot use "default" or "board").');
          return;
        }
        const copyFrom = copySelect ? copySelect.value : 'none';
        closeCreateModal();
        await this.store.createDatabase(clean, copyFrom);
        this.updateDatabaseSelector();
        this.refreshCurrentView();
        const desc = (copyFrom && copyFrom !== 'none') ? `copied from "${copyFrom}"` : 'empty of tasks';
        this.showToast(`Created database "${clean}" (${desc})`);
      });
    }

    this.store.subscribe(() => {
      this.updateDatabaseSelector();
    });
  }

  setupExportImport() {
    const btnExport = document.getElementById('btn-export-json');
    const btnImport = document.getElementById('btn-import-json');
    const fileInput = document.getElementById('import-file-input');
    const btnResetData = document.getElementById('btn-reset-data');

    const importModal = document.getElementById('import-modal');
    const btnCloseImport = document.getElementById('btn-close-import-modal');
    const btnCancelImport = document.getElementById('btn-cancel-import-modal');
    const btnTriggerPick = document.getElementById('btn-trigger-file-pick');
    const importForm = document.getElementById('import-tasks-form');
    const fileNameLabel = document.getElementById('import-file-name-label');
    const formatPreview = document.getElementById('import-format-preview');
    const detectedTitle = document.getElementById('import-detected-title');
    const detectedDetails = document.getElementById('import-detected-details');
    const rtmOptionsInfo = document.getElementById('import-rtm-options-info');
    const btnSubmitImport = document.getElementById('btn-submit-import');
    const activeDbLabel = document.getElementById('import-active-db-label');

    let loadedFileContent = null;
    let loadedParsedData = null;
    let isRtmDetected = false;

    if (btnExport) {
      btnExport.addEventListener('click', () => {
        const json = this.store.exportJson();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const dbName = this.store.currentDb || 'default';
        a.download = `${dbName}-tasks-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      });
    }

    const openImportModal = () => {
      if (!importModal) return;
      loadedFileContent = null;
      loadedParsedData = null;
      isRtmDetected = false;
      if (fileNameLabel) fileNameLabel.textContent = 'No file chosen';
      if (formatPreview) formatPreview.style.display = 'none';
      if (rtmOptionsInfo) rtmOptionsInfo.style.display = 'none';
      if (btnSubmitImport) btnSubmitImport.disabled = true;
      if (activeDbLabel) activeDbLabel.textContent = this.store.currentDb || 'default';
      importModal.classList.add('open');
    };

    const closeImportModal = () => {
      if (importModal) importModal.classList.remove('open');
    };

    if (btnImport) {
      btnImport.addEventListener('click', () => {
        openImportModal();
      });
    }

    if (btnCloseImport) btnCloseImport.addEventListener('click', closeImportModal);
    if (btnCancelImport) btnCancelImport.addEventListener('click', closeImportModal);
    if (importModal) {
      importModal.addEventListener('click', (e) => {
        if (e.target === importModal) closeImportModal();
      });
    }

    if (btnTriggerPick && fileInput) {
      btnTriggerPick.addEventListener('click', () => fileInput.click());
    }

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (fileNameLabel) fileNameLabel.textContent = file.name;

        // Auto-derive database name from file name
        const rawBase = file.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9_\-]/g, '');
        const targetDbInput = document.getElementById('import-target-db-name');
        const radioNew = document.getElementById('import-dest-new');
        if (targetDbInput) {
          if (rawBase && rawBase !== 'board' && rawBase !== 'default') {
            targetDbInput.value = rawBase;
          } else {
            targetDbInput.value = 'imported';
          }
        }
        if (radioNew) {
          radioNew.checked = true;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
          loadedFileContent = event.target.result;
          try {
            loadedParsedData = JSON.parse(loadedFileContent);
            if (this.store.isRtmJson(loadedParsedData)) {
              isRtmDetected = true;
              if (formatPreview) formatPreview.style.display = 'block';
              if (detectedTitle) {
                detectedTitle.textContent = '🥛 Remember The Milk Export Detected';
                detectedTitle.style.color = '#3b82f6';
              }
              if (detectedDetails) {
                const taskCount = loadedParsedData.tasks ? loadedParsedData.tasks.length : 0;
                const listCount = loadedParsedData.lists ? loadedParsedData.lists.length : 0;
                const noteCount = loadedParsedData.notes ? loadedParsedData.notes.length : 0;
                detectedDetails.textContent = `Found ${taskCount.toLocaleString()} tasks across ${listCount} lists with ${noteCount.toLocaleString()} notes.`;
              }
              if (rtmOptionsInfo) rtmOptionsInfo.style.display = 'block';
              if (btnSubmitImport) btnSubmitImport.disabled = false;
            } else if (loadedParsedData && Array.isArray(loadedParsedData.tasks)) {
              isRtmDetected = false;
              if (formatPreview) formatPreview.style.display = 'block';
              if (detectedTitle) {
                detectedTitle.textContent = '📋 Native Kanban Backup Detected';
                detectedTitle.style.color = '#10b981';
              }
              if (detectedDetails) {
                detectedDetails.textContent = `Found ${loadedParsedData.tasks.length} tasks and ${(loadedParsedData.columns || []).length} columns.`;
              }
              if (rtmOptionsInfo) rtmOptionsInfo.style.display = 'none';
              if (btnSubmitImport) btnSubmitImport.disabled = false;
            } else {
              isRtmDetected = false;
              if (formatPreview) formatPreview.style.display = 'block';
              if (detectedTitle) {
                detectedTitle.textContent = '⚠️ Unrecognized JSON Format';
                detectedTitle.style.color = '#ef4444';
              }
              if (detectedDetails) {
                detectedDetails.textContent = 'This file does not match a Kanban backup or Remember The Milk export schema.';
              }
              if (rtmOptionsInfo) rtmOptionsInfo.style.display = 'none';
              if (btnSubmitImport) btnSubmitImport.disabled = true;
            }
          } catch (err) {
            if (formatPreview) formatPreview.style.display = 'block';
            if (detectedTitle) {
              detectedTitle.textContent = '⚠️ Invalid JSON';
              detectedTitle.style.color = '#ef4444';
            }
            if (detectedDetails) detectedDetails.textContent = 'Error parsing JSON: ' + err.message;
            if (btnSubmitImport) btnSubmitImport.disabled = true;
          }
        };
        reader.readAsText(file);
      });
    }

    const targetDbInput = document.getElementById('import-target-db-name');
    if (targetDbInput) {
      targetDbInput.addEventListener('focus', () => {
        const radio = document.getElementById('import-dest-new');
        if (radio) radio.checked = true;
      });
      targetDbInput.addEventListener('input', () => {
        const radio = document.getElementById('import-dest-new');
        if (radio) radio.checked = true;
      });
    }

    if (importForm) {
      importForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!loadedFileContent && !loadedParsedData) return;

        const isNewDb = document.getElementById('import-dest-new')?.checked;
        const newDbInput = document.getElementById('import-target-db-name');
        let targetDb = this.store.currentDb || 'default';

        if (isNewDb && newDbInput) {
          const rawName = newDbInput.value || '';
          targetDb = rawName.trim().toLowerCase().replace(/[^a-z0-9_\-]/g, '');
          if (!targetDb || targetDb === 'default' || targetDb === 'board') {
            targetDb = 'imported';
          }
          const existingDbs = this.store.databases || ['default'];
          if (!existingDbs.includes(targetDb)) {
            await this.store.createDatabase(targetDb, 'none');
          } else {
            await this.store.switchDatabase(targetDb);
          }
        }

        if (btnSubmitImport) {
          btnSubmitImport.disabled = true;
          btnSubmitImport.textContent = 'Importing & Saving... 🔄';
        }

        let resultSuccess = false;
        let summaryMsg = '';

        try {
          let savePromise = null;
          if (isRtmDetected) {
            const res = this.store.importRtmJson(loadedParsedData, targetDb);
            resultSuccess = res && res.success;
            savePromise = res && res.savePromise;
            summaryMsg = `Successfully imported ${res ? res.count : 0} tasks into database [${targetDb}] and saved to server!`;
          } else {
            resultSuccess = Boolean(this.store.importJson(loadedFileContent, targetDb));
            savePromise = this.store.lastImportPromise;
            summaryMsg = `Successfully imported Kanban backup into database [${targetDb}] and saved to server!`;
          }

          if (savePromise) {
            try {
              await savePromise;
            } catch (saveErr) {
              console.warn('Failed to await server save after import', saveErr);
            }
          }
        } finally {
          if (btnSubmitImport) {
            btnSubmitImport.disabled = false;
            btnSubmitImport.textContent = 'Import Tasks';
          }
        }

        this.store.currentDb = targetDb;
        closeImportModal();
        await this.store.listDatabases();
        this.updateDatabaseSelector();
        this.refreshCurrentView();

        if (resultSuccess) {
          this.showToast(summaryMsg);
        } else {
          setTimeout(() => alert('Failed to import file. Invalid data.'), 50);
        }
      });
    }

    if (btnResetData) {
      btnResetData.addEventListener('click', () => {
        if (confirm('Reset board to default sample tasks? Any unsaved edits will be replaced.')) {
          this.store.resetToDefaults();
          this.refreshCurrentView();
        }
      });
    }
  }

  setupShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Global Escape handler across all views, modals, and popups
      if (e.key === 'Escape') {
        const openModals = document.querySelectorAll('.modal-overlay.open');
        if (openModals.length > 0) {
          e.preventDefault();
          openModals.forEach(m => m.classList.remove('open'));
          if (document.activeElement && typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
          }
          return;
        }

        const tagPopups = document.querySelectorAll('.tag-menu-popup');
        if (tagPopups.length > 0) {
          e.preventDefault();
          tagPopups.forEach(p => p.remove());
        }

        const smartPopups = document.querySelectorAll('.smart-suggestions');
        smartPopups.forEach(p => p.style.display = 'none');

        if (document.activeElement && typeof document.activeElement.blur === 'function') {
          document.activeElement.blur();
        }
        return;
      }

      // Don't trigger view switches or quick add if user is typing inside an input or textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        this.toggleSidebar();
        return;
      }

      if (e.key === '1') this.switchView('board');
      if (e.key === '2') this.switchView('list');
      if (e.key === '3') this.switchView('table');
      if (e.key === '4') this.switchView('text');
      if (e.key === 'f' || e.key === 'F') {
        if (this.currentView === 'board' && this.zoomController) {
          this.zoomController.fitTableau();
        }
      }
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        this.openTaskModal();
      }
    });
  }

  generateGoogleCalendarUrl(task) {
    const origin = (typeof window !== 'undefined' && window.location && window.location.origin)
      ? `${window.location.origin}${window.location.pathname}`
      : 'http://localhost:8080/';
    const taskLink = `${origin}#task-${task.id}`;

    const title = encodeURIComponent(task.title || 'Kanban Task');
    let descriptionText = '';
    if (task.description) {
      descriptionText += `${task.description}\n\n`;
    }
    if (task.priority) {
      descriptionText += `Priority: ${task.priority.toUpperCase()}\n`;
    }
    if (task.assignee) {
      descriptionText += `Assignee: ${task.assignee}\n`;
    }
    if (task.url) {
      descriptionText += `Reference URL: ${task.url}\n`;
    }
    if (task.repeat && task.repeat.type && task.repeat.type !== 'none') {
      descriptionText += `Repeat: ${task.repeat.type}\n`;
    }
    descriptionText += `\n🔗 Link back to task:\n${taskLink}`;
    const details = encodeURIComponent(descriptionText);

    let dates = '';
    if (task.dueDate) {
      const cleanDate = task.dueDate.replace(/-/g, '');
      const d = new Date(task.dueDate + 'T00:00:00');
      d.setDate(d.getDate() + 1);
      const nextDay = d.toISOString().slice(0, 10).replace(/-/g, '');
      dates = `&dates=${cleanDate}/${nextDay}`;
    }

    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}${dates}`;
  }

  setupHashDeepLink() {
    const checkHash = () => {
      const hash = window.location.hash;
      if (hash && hash.startsWith('#task-')) {
        const taskId = hash.slice(6);
        const task = this.store.getTask(taskId);
        if (task) {
          setTimeout(() => this.openTaskModal(task), 150);
        }
      }
    };

    window.addEventListener('hashchange', checkHash);
    setTimeout(checkHash, 300);

    // Global listener for quick gcal trigger buttons
    document.addEventListener('click', (e) => {
      const trigger = e.target.closest('.btn-gcal-trigger');
      if (trigger && trigger.dataset.taskId) {
        e.stopPropagation();
        e.preventDefault();
        const task = this.store.getTask(trigger.dataset.taskId);
        if (task) {
          const url = this.generateGoogleCalendarUrl(task);
          window.open(url, '_blank', 'noopener,noreferrer');
        }
      }
    });
  }
}

// Start app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new KanbanApp();
});
