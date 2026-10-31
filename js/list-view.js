/**
/**
 * GTD Inbox & Lists View Controller & Persistent Side Panel
 * Features Left Sidebar (Inbox, Today, Tomorrow, This Week, Lists, Tags)
 * and Task Stream with quick-add, completion checkboxes, priority stripes, and Incomplete/Completed filter.
 */

const TAG_PALETTE_24 = [
  '#d0e1fd', '#e0ecfd', '#ede7f6', '#f3e5f5', '#fce4ec', '#ffebee',
  '#2196f3', '#2979ff', '#0000ff', '#512da8', '#7b3f52', '#d50000',
  '#ffe0b2', '#ffcc80', '#ffe082', '#fff9c4', '#e8f5e9', '#f1f8e9',
  '#f57c00', '#b26a00', '#b78103', '#556b2f', '#2e7d32', '#006400'
];

class ListView {
  constructor(containerEl, sidebarEl, store, onEditTask, onAddTask, onFilterSelect) {
    this.container = containerEl;
    this.sidebarEl = sidebarEl;
    this.store = store;
    this.onEditTask = onEditTask;
    this.onAddTask = onAddTask;
    this.onFilterSelect = onFilterSelect;

    this.activeFilter = 'inbox'; // 'inbox' | 'all' | 'today' | 'tomorrow' | 'this_week' | 'completed' | 'col:<id>' | 'tag:<tag>'
    this.statusFilter = 'incomplete'; // 'incomplete' | 'completed' | 'all'

    // Multi-task selection state for batch editing
    this.selectedTaskIds = new Set();
    this.lastSelectedTaskId = null;

    // Cache tag colors
    this.tagColors = ['tag-color-0', 'tag-color-1', 'tag-color-2', 'tag-color-3', 'tag-color-4', 'tag-color-5', 'tag-color-6'];

    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('click', (e) => {
        if (!e.target || (!e.target.closest('#active-tag-menu-popup') && !e.target.closest('.btn-tag-menu'))) {
          this.closeTagMenuPopup();
        }
        if (!e.target || !e.target.closest('.gtd-batch-btn-group')) {
          this.closeBatchDropdowns();
        }
      });
      document.addEventListener('keydown', (e) => {
        if (e && e.key === 'Escape') {
          this.closeTagMenuPopup();
          this.closeBatchDropdowns();
        }
      });
    }
  }

  // Render the persistent side panel (Shared across ALL views)
  renderSidebar() {
    if (!this.sidebarEl) return;
    this.sidebarEl.innerHTML = '';

    // 1. Sidebar Header with Title & Collapse Button
    const headerBar = document.createElement('div');
    headerBar.className = 'sidebar-header-bar';
    headerBar.innerHTML = `
      <span class="sidebar-brand-title">Views & Lists</span>
      <button class="btn-collapse-sidebar" id="btn-collapse-sidebar" title="Hide Side Panel (◀)" aria-label="Collapse Navigation Side Panel">◀</button>
    `;

    headerBar.querySelector('#btn-collapse-sidebar').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (window.kanbanApp && window.kanbanApp.toggleSidebar) {
        window.kanbanApp.toggleSidebar(false);
      }
    });

    const content = document.createElement('div');
    content.className = 'gtd-sidebar-content';

    // Calculate Counts
    const counts = this.calculateCounts();

    // System Section: Inbox, All Tasks, Today, Tomorrow, This Week, Completed
    const systemSection = document.createElement('div');
    systemSection.className = 'sidebar-section';

    const systemItems = [
      { id: 'inbox', label: 'Inbox', icon: '📥', count: counts.inbox },
      { id: 'all', label: 'All Tasks', icon: '📋', count: counts.all },
      { id: 'today', label: 'Today', icon: '🌟', count: counts.today },
      { id: 'tomorrow', label: 'Tomorrow', icon: '🌅', count: counts.tomorrow },
      { id: 'this_week', label: 'This Week', icon: '📅', count: counts.thisWeek },
      { id: 'completed', label: 'Completed', icon: '✅', count: counts.completed },
      { id: 'trash', label: 'Trash', icon: '🗑️', count: (this.store.trash || []).length }
    ];

    systemItems.forEach(item => {
      const el = document.createElement('div');
      el.className = `sidebar-item ${this.activeFilter === item.id ? 'active' : ''}`;
      el.dataset.filter = item.id;
      el.innerHTML = `
        <div class="sidebar-item-left">
          <span class="sidebar-item-icon">${item.icon}</span>
          <span>${item.label}</span>
        </div>
        ${item.count > 0 ? `<span class="sidebar-badge">${item.count}</span>` : ''}
      `;
      el.addEventListener('click', () => {
        this.setFilter(item.id);
        if (this.onFilterSelect) this.onFilterSelect(item.id);
      });
      systemSection.appendChild(el);
    });

    // Lists Section (Kanban Columns - including Archive and custom columns)
    const listsSection = document.createElement('div');
    listsSection.className = 'sidebar-section';
    listsSection.innerHTML = `
      <div class="sidebar-section-header">
        <span class="section-title">▾ Lists</span>
        <button class="btn-section-add" title="New Column" id="btn-sidebar-add-col">＋</button>
      </div>
    `;

    this.store.columns.forEach(col => {
      const allColTasks = this.store.getTasksByColumn(col.id);
      const colBadgeCount = (col.id === 'done' || col.id === 'archive' || col.id === 'abandoned') ? allColTasks.length : allColTasks.filter(t => t.columnId !== 'done' && t.columnId !== 'abandoned').length;
      const el = document.createElement('div');
      el.className = `sidebar-item ${this.activeFilter === `col:${col.id}` ? 'active' : ''}`;
      el.dataset.filter = `col:${col.id}`;
      el.innerHTML = `
        <div class="sidebar-item-left">
          <span class="sidebar-item-icon">${col.icon || '📁'}</span>
          <span>${this.escapeHtml(col.title)}</span>
        </div>
        ${colBadgeCount > 0 ? `<span class="sidebar-badge">${colBadgeCount}</span>` : ''}
      `;
      el.addEventListener('click', () => {
        this.setFilter(`col:${col.id}`);
        if (this.onFilterSelect) this.onFilterSelect(`col:${col.id}`);
      });
      listsSection.appendChild(el);
    });

    // Tags Section
    const tagsSection = document.createElement('div');
    tagsSection.className = 'sidebar-section';
    tagsSection.innerHTML = `
      <div class="sidebar-section-header">
        <span class="section-title">▾ Tags</span>
        <button class="btn-section-add" title="New Tag" id="btn-sidebar-add-tag">＋</button>
      </div>
    `;

    // Sort tags alphabetically
    const tagEntries = Object.entries(counts.tags).sort((a, b) => {
      return a[0].localeCompare(b[0], undefined, { sensitivity: 'base', numeric: true }) || a[0].localeCompare(b[0]);
    });
    if (tagEntries.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'sidebar-item text-muted';
      emptyEl.style.fontSize = '12px';
      emptyEl.textContent = 'No tags created';
      tagsSection.appendChild(emptyEl);
    } else {
      tagEntries.forEach(([tag, count]) => {
        const tagColor = this.store.getTagColor(tag);
        const isFav = this.store.isFavoriteTag(tag);
        const el = document.createElement('div');
        el.className = `sidebar-item sidebar-tag-item ${this.activeFilter === `tag:${tag}` ? 'active' : ''}`;
        el.dataset.filter = `tag:${tag}`;
        el.innerHTML = `
          <div class="sidebar-item-left">
            <span class="tag-color-swatch" style="background-color: ${tagColor};" title="Tag #${this.escapeHtml(tag)}"></span>
            <span class="tag-name-label">${isFav ? '<span class="tag-fav-star">★</span> ' : ''}#${this.escapeHtml(tag)}</span>
          </div>
          <div class="sidebar-tag-actions">
            <span class="sidebar-badge">${count}</span>
            <button type="button" class="btn-tag-action btn-tag-menu" title="Tag options for #${this.escapeHtml(tag)}" data-tag="${this.escapeHtml(tag)}">▾</button>
          </div>
        `;

        // Menu button triggers options popup
        const menuBtn = el.querySelector('.btn-tag-menu');
        if (menuBtn) {
          menuBtn.addEventListener('click', (e) => {
            this.openTagMenuPopup(tag, menuBtn, e);
          });
        }

        const swatch = el.querySelector('.tag-color-swatch');
        if (swatch) {
          swatch.addEventListener('click', (e) => {
            this.openTagMenuPopup(tag, menuBtn || swatch, e);
          });
        }

        el.addEventListener('click', () => {
          this.setFilter(`tag:${tag}`);
          if (this.onFilterSelect) this.onFilterSelect(`tag:${tag}`);
        });
        tagsSection.appendChild(el);
      });
    }

    content.appendChild(systemSection);
    content.appendChild(listsSection);
    content.appendChild(tagsSection);

    this.sidebarEl.appendChild(headerBar);
    this.sidebarEl.appendChild(content);

    // Add list/tag listeners
    const addColBtn = listsSection.querySelector('#btn-sidebar-add-col');
    if (addColBtn) {
      addColBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const title = prompt('Enter new list/column name:');
        if (title && title.trim()) {
          const id = 'col-' + Date.now();
          this.store.columns.push({ id, title: title.trim(), color: '#6366f1', icon: '📁', showInBoard: true });
          this.store.save();
          this.renderSidebar();
          this.render();
        }
      });
    }

    const addTagBtn = tagsSection.querySelector('#btn-sidebar-add-tag');
    if (addTagBtn) {
      addTagBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tag = prompt('Enter new tag name:');
        if (tag && tag.trim()) {
          const cleanTag = tag.trim().replace(/^#/, '');
          this.store.getTagColor(cleanTag); // Auto-assigns palette color
          this.store.save();
          this.setFilter(`tag:${cleanTag}`);
          if (this.onFilterSelect) this.onFilterSelect(`tag:${cleanTag}`);
          this.renderSidebar();
          this.render();
        }
      });
    }

    // GitHub repository link footer
    const footerEl = document.createElement('div');
    footerEl.className = 'sidebar-footer';
    footerEl.innerHTML = `
      <a href="https://github.com/k8242/tasks_kanban" target="_blank" rel="noopener noreferrer" class="sidebar-github-link" title="View Source on GitHub (k8242/tasks_kanban)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 4px;">
          <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
        </svg>
        <span>GitHub Repository</span>
      </a>
    `;
    this.sidebarEl.appendChild(footerEl);
  }

  // Render the task stream in the Lists View
  render() {
    this.renderSidebar();
    if (!this.container) return;
    this.container.innerHTML = '';

    const mainContent = this.createMainContent();
    this.container.appendChild(mainContent);
  }

  createMainContent() {
    const main = document.createElement('div');
    main.className = 'gtd-main-content';

    // 1. Top Bar
    const topBar = document.createElement('div');
    topBar.className = 'gtd-top-bar';

    const filterTitle = this.getFilterDisplayName();
    const filteredTasks = this.getFilteredTasks();
    const isTrash = this.activeFilter === 'trash';

    topBar.innerHTML = `
      <div class="gtd-header-left">
        <h2 class="gtd-current-title">
          <span>${filterTitle}</span>
          <span class="gtd-filter-pill-count">${filteredTasks.length}</span>
        </h2>
      </div>

      <div class="gtd-header-actions">
        ${isTrash ? `
          <button class="btn btn-danger btn-empty-trash" ${filteredTasks.length === 0 ? 'disabled style="opacity: 0.5;"' : ''} title="Permanently empty trash">🗑️ Empty Trash</button>
        ` : `
          <!-- Segmented Incomplete / Completed Toggle -->
          <div class="gtd-segmented-filter">
            <button class="filter-segment-btn ${this.statusFilter === 'incomplete' ? 'active' : ''}" data-status="incomplete">Incomplete</button>
            <button class="filter-segment-btn ${this.statusFilter === 'completed' ? 'active' : ''}" data-status="completed">Completed</button>
            <button class="filter-segment-btn ${this.statusFilter === 'all' ? 'active' : ''}" data-status="all">All</button>
          </div>

          <button class="btn-icon btn-print-tasks" title="Print Task List">🖨️</button>
        `}
      </div>
    `;

    // 2. Quick Add Bar or Trash Banner
    let bannerOrAddBar = null;
    if (isTrash) {
      bannerOrAddBar = document.createElement('div');
      bannerOrAddBar.className = 'gtd-trash-banner';
      bannerOrAddBar.innerHTML = `
        <span class="gtd-trash-banner-icon">ℹ️</span>
        <div class="gtd-trash-banner-text">
          <strong>30-Day Retention Trash List:</strong> Deleted tasks stay in trash and are automatically purged after 30 days. You can restore any task back to the Kanban board or delete it forever.
        </div>
      `;
    } else {
      bannerOrAddBar = document.createElement('div');
      bannerOrAddBar.className = 'gtd-quick-add-bar';
      bannerOrAddBar.innerHTML = `
        <div class="gtd-quick-add-input-wrapper">
          <span class="gtd-quick-add-icon">＋</span>
          <input type="text" class="gtd-quick-add-input" placeholder="Add a task... Type ^ for dates, ! for priorities, # for tags (Enter to save)" autocomplete="off" />
          <div class="quick-add-autocomplete" style="display: none;"></div>
        </div>
        <div class="quick-add-hint">
          <span><kbd>^</kbd> Due date (^today, ^tomorrow, ^mon)</span>
          <span><kbd>!</kbd> Priority (!1 urgent, !2 high, !3 medium)</span>
          <span><kbd>#</kbd> List or tag (#work, #done)</span>
        </div>
      `;
    }

    // 3. Task List Stream
    const taskStream = document.createElement('div');
    taskStream.className = 'gtd-task-list-stream';

    if (filteredTasks.length === 0) {
      taskStream.innerHTML = `
        <div class="gtd-empty-state">
          <span class="gtd-empty-icon">${isTrash ? '🗑️' : '🎉'}</span>
          <strong>${isTrash ? 'Trash is empty' : 'No tasks in this list'}</strong>
          <span style="font-size: 13px;">${isTrash ? 'Deleted tasks will appear here for 30 days before being purged.' : 'Type in "Add a task..." above or choose another list from the sidebar.'}</span>
        </div>
      `;
    } else {
      filteredTasks.forEach(task => {
        const row = isTrash ? this.createTrashTaskRow(task) : this.createTaskRow(task, filteredTasks);
        taskStream.appendChild(row);
      });
    }

    main.appendChild(topBar);
    if (!isTrash) {
      const batchToolbar = this.createBatchToolbar(filteredTasks);
      main.appendChild(batchToolbar);
      this.setupBatchToolbarEvents(batchToolbar, filteredTasks);
    }
    if (bannerOrAddBar) main.appendChild(bannerOrAddBar);
    main.appendChild(taskStream);

    // Keyboard navigation (arrows, enter, space, escape)
    this.setupKeyboardNavigation(taskStream);

    // Event listeners
    if (isTrash) {
      const emptyBtn = topBar.querySelector('.btn-empty-trash');
      if (emptyBtn && filteredTasks.length > 0) {
        emptyBtn.addEventListener('click', () => {
          if (confirm('Permanently delete all tasks in trash? This cannot be undone.')) {
            this.store.emptyTrash();
            this.render();
          }
        });
      }
    } else {
      topBar.querySelectorAll('.filter-segment-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          this.statusFilter = btn.dataset.status;
          this.selectedTaskIds.clear();
          this.render();
        });
      });

      topBar.querySelector('.btn-print-tasks').addEventListener('click', () => {
        window.print();
      });

      const quickInput = bannerOrAddBar.querySelector('.gtd-quick-add-input');
      const autocompleteEl = bannerOrAddBar.querySelector('.quick-add-autocomplete');
      if (quickInput && autocompleteEl) {
        this.setupQuickAddAutocomplete(quickInput, autocompleteEl);
      }
    }

    return main;
  }

  // Multi-Task Batch Editing Toolbar matching Remember The Milk Screenshot
  createBatchToolbar(filteredTasks) {
    const toolbar = document.createElement('div');
    toolbar.className = 'gtd-batch-toolbar';

    const selectedCount = this.selectedTaskIds.size;
    const isAnySelected = selectedCount > 0;
    const isAllSelected = filteredTasks.length > 0 && selectedCount === filteredTasks.length;
    const selectIcon = isAllSelected ? '☑' : (selectedCount > 0 ? '[-] ' : '☐');

    toolbar.innerHTML = `
      <div class="gtd-batch-actions-left">
        <!-- Master Selection Dropdown -->
        <div class="gtd-batch-btn-group">
          <button type="button" class="gtd-batch-btn btn-batch-select" title="Selection options">
            <span class="batch-select-icon">${selectIcon}</span>
            <span class="batch-arrow">▾</span>
          </button>
          <div class="gtd-batch-dropdown-menu menu-batch-select" style="display: none;">
            <button type="button" class="batch-menu-item" data-action="all">All</button>
            <button type="button" class="batch-menu-item" data-action="none">None</button>
            <button type="button" class="batch-menu-item" data-action="incomplete">Incomplete</button>
            <button type="button" class="batch-menu-item" data-action="completed">Completed</button>
            <button type="button" class="batch-menu-item" data-action="invert">Invert</button>
          </div>
        </div>

        <!-- Assignee Button -->
        <div class="gtd-batch-btn-group">
          <button type="button" class="gtd-batch-btn btn-batch-assignee" title="Assign Contact" ${!isAnySelected ? 'disabled' : ''}>
            <span class="batch-btn-icon">👤</span>
            <span class="batch-arrow">▾</span>
          </button>
          <div class="gtd-batch-dropdown-menu menu-batch-assignee" style="display: none;">
            <!-- Populated dynamically -->
          </div>
        </div>

        <!-- Priority Button -->
        <div class="gtd-batch-btn-group">
          <button type="button" class="gtd-batch-btn btn-batch-priority" title="Set Priority" ${!isAnySelected ? 'disabled' : ''}>
            <span class="batch-btn-icon" style="font-weight: 700;">!</span>
            <span class="batch-arrow">▾</span>
          </button>
          <div class="gtd-batch-dropdown-menu menu-batch-priority" style="display: none;">
            <button type="button" class="batch-menu-item" data-priority="urgent"><span style="color: #ef4444; font-size: 15px;">●</span> Priority 1 (Urgent)</button>
            <button type="button" class="batch-menu-item" data-priority="high"><span style="color: #f97316; font-size: 15px;">●</span> Priority 2 (High)</button>
            <button type="button" class="batch-menu-item" data-priority="medium"><span style="color: #3b82f6; font-size: 15px;">●</span> Priority 3 (Medium)</button>
            <button type="button" class="batch-menu-item" data-priority="low"><span style="color: #94a3b8; font-size: 15px;">●</span> Priority 4 / None (Low)</button>
          </div>
        </div>

        <!-- Due Date Picker Button -->
        <div class="gtd-batch-btn-group">
          <button type="button" class="gtd-batch-btn btn-batch-due" title="Set Due Date" ${!isAnySelected ? 'disabled' : ''}>
            <span class="batch-btn-icon">1📅</span>
            <span class="batch-arrow">▾</span>
          </button>
          <div class="gtd-batch-dropdown-menu menu-batch-due" style="display: none;">
            <div class="batch-menu-custom-date" style="padding: 6px 10px;">
              <label style="font-size: 11px; font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 4px;">Pick Date:</label>
              <div style="display: flex; gap: 4px;">
                <input type="date" class="batch-date-input" style="flex: 1; font-size: 12px; padding: 3px 6px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-primary); color: var(--text-primary);" />
                <button type="button" class="btn btn-sm btn-primary btn-apply-batch-date">Set</button>
              </div>
            </div>
            <div class="batch-menu-divider"></div>
            <button type="button" class="batch-menu-item" data-date="today">Today</button>
            <button type="button" class="batch-menu-item" data-date="tomorrow">Tomorrow</button>
            <button type="button" class="batch-menu-item" data-date="end_of_week">End of Week</button>
            <button type="button" class="batch-menu-item" data-date="next_week">Next Week</button>
            <button type="button" class="batch-menu-item" data-date="clear">Clear Due Date</button>
          </div>
        </div>

        <!-- Move to List / Column Button -->
        <div class="gtd-batch-btn-group">
          <button type="button" class="gtd-batch-btn btn-batch-list" title="Move to List / State" ${!isAnySelected ? 'disabled' : ''}>
            <span class="batch-btn-icon">📋</span>
            <span class="batch-arrow">▾</span>
          </button>
          <div class="gtd-batch-dropdown-menu menu-batch-list" style="display: none;">
            <!-- Populated dynamically -->
          </div>
        </div>

        <!-- Tags Button -->
        <div class="gtd-batch-btn-group">
          <button type="button" class="gtd-batch-btn btn-batch-tags" title="Edit Tags" ${!isAnySelected ? 'disabled' : ''}>
            <span class="batch-btn-icon">🏷️</span>
            <span class="batch-arrow">▾</span>
          </button>
          <div class="gtd-batch-dropdown-menu menu-batch-tags" style="display: none;">
            <!-- Populated dynamically -->
          </div>
        </div>

        <!-- Copy or Move to Database Button -->
        <div class="gtd-batch-btn-group">
          <button type="button" class="gtd-batch-btn btn-batch-database" title="Copy or Move to Another Database">
            <span class="batch-btn-icon">🗄️</span>
            <span class="batch-arrow">▾</span>
          </button>
          <div class="gtd-batch-dropdown-menu menu-batch-database" style="display: none;">
            <!-- Populated dynamically -->
          </div>
        </div>

        <!-- More Actions Button -->
        <div class="gtd-batch-btn-group">
          <button type="button" class="gtd-batch-btn btn-batch-more" title="More Actions" ${!isAnySelected ? 'disabled' : ''}>
            <span class="batch-btn-icon">•••</span>
            <span class="batch-arrow">▾</span>
          </button>
          <div class="gtd-batch-dropdown-menu menu-batch-more" style="display: none;">
            <button type="button" class="batch-menu-item btn-batch-more-transfer" data-action="transfer">🗄️ Copy or Move to Database...</button>
            <div class="batch-menu-divider"></div>
            <button type="button" class="batch-menu-item danger" data-action="delete">🗑️ Delete Selected Tasks</button>
            <button type="button" class="batch-menu-item" data-action="duplicate">📋 Duplicate Selected Tasks</button>
          </div>
        </div>
      </div>

      <div class="gtd-batch-selection-info" style="${isAnySelected ? '' : 'display: none;'}">
        <span class="batch-count-badge">${selectedCount} selected</span>
      </div>
    `;

    return toolbar;
  }

  setupBatchToolbarEvents(toolbar, filteredTasks) {
    if (!toolbar) return;

    const toggleMenu = (btnEl, menuEl) => {
      const isOpen = menuEl.style.display !== 'none';
      this.closeBatchDropdowns();
      if (!isOpen && !btnEl.disabled) {
        menuEl.style.display = 'flex';
      }
    };

    // 1. Master Selection Dropdown
    const selectBtn = toolbar.querySelector('.btn-batch-select');
    const selectMenu = toolbar.querySelector('.menu-batch-select');
    if (selectBtn && selectMenu) {
      selectBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMenu(selectBtn, selectMenu);
      });

      selectMenu.querySelectorAll('.batch-menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          const action = item.dataset.action;
          if (action === 'all') {
            filteredTasks.forEach(t => this.selectedTaskIds.add(t.id));
          } else if (action === 'none') {
            this.selectedTaskIds.clear();
          } else if (action === 'incomplete') {
            this.selectedTaskIds.clear();
            filteredTasks.forEach(t => {
              if (t.columnId !== 'done' && t.columnId !== 'archive' && t.columnId !== 'abandoned') this.selectedTaskIds.add(t.id);
            });
          } else if (action === 'completed') {
            this.selectedTaskIds.clear();
            filteredTasks.forEach(t => {
              if (t.columnId === 'done' || t.columnId === 'archive') this.selectedTaskIds.add(t.id);
            });
          } else if (action === 'invert') {
            filteredTasks.forEach(t => {
              if (this.selectedTaskIds.has(t.id)) this.selectedTaskIds.delete(t.id);
              else this.selectedTaskIds.add(t.id);
            });
          }
          this.closeBatchDropdowns();
          this.render();
        });
      });
    }

    // 2. Assignee Dropdown
    const assigneeBtn = toolbar.querySelector('.btn-batch-assignee');
    const assigneeMenu = toolbar.querySelector('.menu-batch-assignee');
    if (assigneeBtn && assigneeMenu) {
      assigneeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const currentAssignees = Array.from(new Set(this.store.tasks.map(t => (t.assignee || '').trim()).filter(Boolean))).sort();
        let html = '';
        currentAssignees.forEach(assignee => {
          html += `<button type="button" class="batch-menu-item" data-assignee="${this.escapeHtml(assignee)}">👤 ${this.escapeHtml(assignee)}</button>`;
        });
        if (currentAssignees.length > 0) {
          html += '<div class="batch-menu-divider"></div>';
        }
        html += '<button type="button" class="batch-menu-item" data-action="new">＋ New Assignee...</button>';
        html += '<button type="button" class="batch-menu-item" data-action="clear">🚫 Clear Assignee</button>';
        assigneeMenu.innerHTML = html;

        assigneeMenu.querySelectorAll('.batch-menu-item').forEach(item => {
          item.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (item.dataset.action === 'new') {
              const name = prompt('Enter assignee name:');
              if (name && name.trim()) {
                this.batchSetAssignee(name.trim());
              }
            } else if (item.dataset.action === 'clear') {
              this.batchSetAssignee('');
            } else if (item.dataset.assignee) {
              this.batchSetAssignee(item.dataset.assignee);
            }
            this.closeBatchDropdowns();
          });
        });

        toggleMenu(assigneeBtn, assigneeMenu);
      });
    }

    // 5. Priority Dropdown
    const priorityBtn = toolbar.querySelector('.btn-batch-priority');
    const priorityMenu = toolbar.querySelector('.menu-batch-priority');
    if (priorityBtn && priorityMenu) {
      priorityBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMenu(priorityBtn, priorityMenu);
      });

      priorityMenu.querySelectorAll('.batch-menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          this.batchSetPriority(item.dataset.priority);
          this.closeBatchDropdowns();
        });
      });
    }

    // 6. Due Date Dropdown
    const dueBtn = toolbar.querySelector('.btn-batch-due');
    const dueMenu = toolbar.querySelector('.menu-batch-due');
    if (dueBtn && dueMenu) {
      dueBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMenu(dueBtn, dueMenu);
      });

      const applyDateBtn = dueMenu.querySelector('.btn-apply-batch-date');
      const dateInput = dueMenu.querySelector('.batch-date-input');
      if (applyDateBtn && dateInput) {
        applyDateBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (dateInput.value) {
            this.batchSetDueDate(dateInput.value);
            this.closeBatchDropdowns();
          }
        });
      }

      dueMenu.querySelectorAll('.batch-menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          const dAction = item.dataset.date;
          const today = new Date();
          let targetDateStr = '';
          if (dAction === 'today') {
            targetDateStr = today.toISOString().slice(0, 10);
          } else if (dAction === 'tomorrow') {
            const tom = new Date();
            tom.setDate(tom.getDate() + 1);
            targetDateStr = tom.toISOString().slice(0, 10);
          } else if (dAction === 'end_of_week') {
            const eow = new Date();
            const diff = 7 - eow.getDay();
            eow.setDate(eow.getDate() + diff);
            targetDateStr = eow.toISOString().slice(0, 10);
          } else if (dAction === 'next_week') {
            const nw = new Date();
            nw.setDate(nw.getDate() + 7);
            targetDateStr = nw.toISOString().slice(0, 10);
          } else if (dAction === 'clear') {
            targetDateStr = '';
          }
          this.batchSetDueDate(targetDateStr);
          this.closeBatchDropdowns();
        });
      });
    }

    // 7. List / Column Dropdown
    const listBtn = toolbar.querySelector('.btn-batch-list');
    const listMenu = toolbar.querySelector('.menu-batch-list');
    if (listBtn && listMenu) {
      listBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        let html = '';
        (this.store.columns || []).forEach(col => {
          html += `<button type="button" class="batch-menu-item" data-column-id="${this.escapeHtml(col.id)}"><span>${col.icon || '📁'}</span> ${this.escapeHtml(col.title)}</button>`;
        });
        listMenu.innerHTML = html;

        listMenu.querySelectorAll('.batch-menu-item').forEach(item => {
          item.addEventListener('click', (ev) => {
            ev.stopPropagation();
            this.batchSetColumn(item.dataset.columnId);
            this.closeBatchDropdowns();
          });
        });

        toggleMenu(listBtn, listMenu);
      });
    }

    // 8. Tags Dropdown
    const tagsBtn = toolbar.querySelector('.btn-batch-tags');
    const tagsMenu = toolbar.querySelector('.menu-batch-tags');
    if (tagsBtn && tagsMenu) {
      tagsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const selectedTasks = this.store.tasks.filter(t => this.selectedTaskIds.has(t.id));
        const tagsOnSelected = new Set();
        selectedTasks.forEach(t => (t.tags || []).forEach(tag => tagsOnSelected.add(tag)));

        const allStoreTags = Object.keys(this.store.tags || {}).sort();

        let html = '<button type="button" class="batch-menu-item" data-action="add_custom">＋ Add New Tag...</button>';

        if (allStoreTags.length > 0) {
          html += '<div class="batch-menu-divider"></div>';
          html += '<div style="font-size: 10px; font-weight: 700; color: var(--text-muted); padding: 4px 12px; text-transform: uppercase;">Add Existing Tag</div>';
          allStoreTags.forEach(tag => {
            const color = this.store.getTagColor(tag);
            html += `<button type="button" class="batch-menu-item" data-action="add_tag" data-tag="${this.escapeHtml(tag)}"><span style="display:inline-block; width:10px; height:10px; border-radius:2px; background:${color};"></span> #${this.escapeHtml(tag)}</button>`;
          });
        }

        if (tagsOnSelected.size > 0) {
          html += '<div class="batch-menu-divider"></div>';
          html += '<div style="font-size: 10px; font-weight: 700; color: var(--text-muted); padding: 4px 12px; text-transform: uppercase;">Remove Tag</div>';
          Array.from(tagsOnSelected).sort().forEach(tag => {
            html += `<button type="button" class="batch-menu-item danger" data-action="remove_tag" data-tag="${this.escapeHtml(tag)}">✕ #${this.escapeHtml(tag)}</button>`;
          });
          html += '<button type="button" class="batch-menu-item danger" data-action="clear_all">🚫 Clear All Tags</button>';
        }

        tagsMenu.innerHTML = html;

        tagsMenu.querySelectorAll('.batch-menu-item').forEach(item => {
          item.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const action = item.dataset.action;
            if (action === 'add_custom') {
              const name = prompt('Enter tag name:');
              if (name && name.trim()) {
                this.batchAddTag(name.trim());
              }
            } else if (action === 'add_tag') {
              this.batchAddTag(item.dataset.tag);
            } else if (action === 'remove_tag') {
              this.batchRemoveTag(item.dataset.tag);
            } else if (action === 'clear_all') {
              this.batchClearTags();
            }
            this.closeBatchDropdowns();
          });
        });

        toggleMenu(tagsBtn, tagsMenu);
      });
    }

    // 8. Copy or Move to Database Dropdown
    const dbBtn = toolbar.querySelector('.btn-batch-database');
    const dbMenu = toolbar.querySelector('.menu-batch-database');
    if (dbBtn && dbMenu) {
      dbBtn.addEventListener('click', (e) => {
        e.stopPropagation();

        if (this.selectedTaskIds.size === 0) {
          this.showNotification('Please select one or more tasks first to copy or move to another database');
          return;
        }

        // Gather all existing database names synchronously
        const dbsSet = new Set(this.store.databases || ['default']);
        if (typeof localStorage !== 'undefined') {
          try {
            const saved = localStorage.getItem('kanban_database_list');
            if (saved) {
              const parsed = JSON.parse(saved);
              if (Array.isArray(parsed)) parsed.forEach(d => dbsSet.add(d));
            }
          } catch (err) {}
        }
        if (typeof document !== 'undefined') {
          const selectEl = document.getElementById('db-select');
          if (selectEl && selectEl.options) {
            for (let i = 0; i < selectEl.options.length; i++) {
              if (selectEl.options[i].value) dbsSet.add(selectEl.options[i].value);
            }
          }
        }
        if (this.store.currentDb) dbsSet.add(this.store.currentDb);

        const currentDb = (this.store.currentDb || 'default').toLowerCase();
        const otherDbs = Array.from(dbsSet).filter(d => d && d.toLowerCase() !== currentDb).sort();
        const selectedCount = this.selectedTaskIds.size;

        let html = `
          <div style="padding: 6px 12px 4px 12px; font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">
            Transfer ${selectedCount} Task${selectedCount > 1 ? 's' : ''}
          </div>
          <div class="batch-db-mode-toggle" style="padding: 4px 12px 6px 12px; display: flex; gap: 14px; font-size: 12px; border-bottom: 1px solid var(--border-color);">
            <label style="display: flex; align-items: center; gap: 4px; cursor: pointer; font-weight: 600;">
              <input type="radio" name="batch-db-mode" class="batch-db-mode-radio" value="move" checked />
              <span>➡️ Move</span>
            </label>
            <label style="display: flex; align-items: center; gap: 4px; cursor: pointer; font-weight: 600;">
              <input type="radio" name="batch-db-mode" class="batch-db-mode-radio" value="copy" />
              <span>📋 Copy</span>
            </label>
          </div>
        `;

        if (otherDbs.length > 0) {
          otherDbs.forEach(db => {
            html += `
              <button type="button" class="batch-menu-item btn-db-dest-item" data-db="${this.escapeHtml(db)}">
                🗄️ <span class="db-mode-text">Move to</span> <strong>"${this.escapeHtml(db)}"</strong>
              </button>
            `;
          });
        } else {
          html += `<div style="padding: 8px 12px; font-size: 12px; color: var(--text-muted); font-style: italic;">No other databases yet</div>`;
        }

        html += `
          <div class="batch-menu-divider"></div>
          <button type="button" class="batch-menu-item btn-db-new-dialog">
            ✨ <span class="db-mode-text">Move to</span> New Database...
          </button>
        `;

        dbMenu.innerHTML = html;

        // Mode switch updates label text
        const radios = dbMenu.querySelectorAll('.batch-db-mode-radio');
        radios.forEach(r => {
          r.addEventListener('click', (ev) => ev.stopPropagation());
          r.addEventListener('change', () => {
            const mode = dbMenu.querySelector('.batch-db-mode-radio:checked')?.value || 'move';
            const modeWord = mode === 'copy' ? 'Copy to' : 'Move to';
            dbMenu.querySelectorAll('.db-mode-text').forEach(el => {
              el.textContent = modeWord;
            });
          });
        });

        // Click on destination DB
        dbMenu.querySelectorAll('.btn-db-dest-item').forEach(item => {
          item.addEventListener('click', async (ev) => {
            ev.stopPropagation();
            const targetDb = item.dataset.db;
            const mode = dbMenu.querySelector('.batch-db-mode-radio:checked')?.value || 'move';
            await this.batchCopyOrMove(targetDb, mode);
          });
        });

        // Click on new database dialog option
        const newDbBtn = dbMenu.querySelector('.btn-db-new-dialog');
        if (newDbBtn) {
          newDbBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const mode = dbMenu.querySelector('.batch-db-mode-radio:checked')?.value || 'move';
            this.openBatchTransferModal(mode);
            this.closeBatchDropdowns();
          });
        }

        toggleMenu(dbBtn, dbMenu);
      });
    }

    // 9. More Actions Dropdown
    const moreBtn = toolbar.querySelector('.btn-batch-more');
    const moreMenu = toolbar.querySelector('.menu-batch-more');
    if (moreBtn && moreMenu) {
      moreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMenu(moreBtn, moreMenu);
      });

      moreMenu.querySelectorAll('.batch-menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          const action = item.dataset.action;
          if (action === 'delete') {
            this.batchDeleteTasks();
          } else if (action === 'duplicate') {
            this.batchDuplicateTasks();
          } else if (action === 'transfer') {
            if (this.selectedTaskIds.size === 0) {
              this.showNotification('Please select one or more tasks first to copy or move to another database');
            } else {
              this.openBatchTransferModal('move');
            }
          }
          this.closeBatchDropdowns();
        });
      });
    }
  }

  closeBatchDropdowns() {
    if (typeof document === 'undefined') return;
    const menus = document.querySelectorAll ? document.querySelectorAll('.gtd-batch-dropdown-menu') : [];
    if (menus && menus.forEach) {
      menus.forEach(m => {
        m.style.display = 'none';
      });
    }
  }

  toggleTaskSelection(taskId, isShift = false, visibleTasks = []) {
    if (!taskId) return;
    if (isShift && this.lastSelectedTaskId && visibleTasks && visibleTasks.length > 0) {
      const idx1 = visibleTasks.findIndex(t => t.id === this.lastSelectedTaskId);
      const idx2 = visibleTasks.findIndex(t => t.id === taskId);
      if (idx1 !== -1 && idx2 !== -1) {
        const start = Math.min(idx1, idx2);
        const end = Math.max(idx1, idx2);
        for (let i = start; i <= end; i++) {
          this.selectedTaskIds.add(visibleTasks[i].id);
        }
      } else {
        if (this.selectedTaskIds.has(taskId)) {
          this.selectedTaskIds.delete(taskId);
        } else {
          this.selectedTaskIds.add(taskId);
        }
      }
    } else {
      if (this.selectedTaskIds.has(taskId)) {
        this.selectedTaskIds.delete(taskId);
      } else {
        this.selectedTaskIds.add(taskId);
      }
    }
    this.lastSelectedTaskId = taskId;
    this.updateBatchSelectionState(visibleTasks);
  }

  updateBatchSelectionState(visibleTasks = null) {
    if (!this.container) return;
    const tasks = visibleTasks || this.getFilteredTasks();
    const count = this.selectedTaskIds.size;
    const isAll = tasks.length > 0 && count === tasks.length;
    const isAny = count > 0;

    const selectIconEl = this.container.querySelector('.batch-select-icon');
    if (selectIconEl) {
      selectIconEl.textContent = isAll ? '☑' : (count > 0 ? '[-] ' : '☐');
    }

    const countBadge = this.container.querySelector('.gtd-batch-selection-info');
    if (countBadge) {
      countBadge.style.display = isAny ? 'block' : 'none';
      const textEl = countBadge.querySelector('.batch-count-badge');
      if (textEl) textEl.textContent = `${count} selected`;
    }

    const batchBtns = this.container.querySelectorAll('.gtd-batch-actions-left button:not(.btn-batch-select)');
    batchBtns.forEach(btn => {
      btn.disabled = !isAny;
    });

    const rows = this.container.querySelectorAll('.gtd-task-row');
    rows.forEach(row => {
      const tId = row.dataset.taskId;
      const isSelected = this.selectedTaskIds.has(tId);
      const chk = row.querySelector('.gtd-task-checkbox');

      if (isSelected) {
        row.classList.add('is-selected');
        if (chk) {
          chk.classList.add('checked', 'is-selected');
          chk.title = 'Deselect task';
        }
      } else {
        row.classList.remove('is-selected');
        if (chk) {
          chk.classList.remove('checked', 'is-selected');
          chk.title = 'Select task';
        }
      }
    });
  }

  batchComplete() {
    if (this.selectedTaskIds.size === 0) return;
    const isCompletedView = this.statusFilter === 'completed';
    const targetCol = isCompletedView ? (this.store.columns[0] ? this.store.columns[0].id : 'backlog') : 'done';

    this.selectedTaskIds.forEach(id => {
      this.store.moveTask(id, targetCol);
    });

    this.selectedTaskIds.clear();
    this.store.save(true);
    this.render();
  }

  batchPostpone(daysOrSpecial) {
    if (this.selectedTaskIds.size === 0) return;
    this.selectedTaskIds.forEach(id => {
      const t = this.store.tasks.find(x => x.id === id);
      if (!t) return;
      if (daysOrSpecial === 'clear') {
        t.dueDate = '';
      } else if (daysOrSpecial === 'today') {
        t.dueDate = new Date().toISOString().slice(0, 10);
      } else {
        const days = parseInt(daysOrSpecial, 10) || 1;
        const base = t.dueDate ? new Date(t.dueDate + 'T00:00:00') : new Date();
        base.setDate(base.getDate() + days);
        t.dueDate = base.toISOString().slice(0, 10);
      }
      t.updatedAt = new Date().toISOString();
    });
    this.store.save(true);
    this.render();
  }

  batchSetPriority(priority) {
    if (this.selectedTaskIds.size === 0) return;
    this.selectedTaskIds.forEach(id => {
      const t = this.store.tasks.find(x => x.id === id);
      if (t) {
        t.priority = priority;
        t.updatedAt = new Date().toISOString();
      }
    });
    this.store.save(true);
    this.render();
  }

  batchSetDueDate(dateStr) {
    if (this.selectedTaskIds.size === 0) return;
    this.selectedTaskIds.forEach(id => {
      const t = this.store.tasks.find(x => x.id === id);
      if (t) {
        t.dueDate = dateStr || '';
        t.updatedAt = new Date().toISOString();
      }
    });
    this.store.save(true);
    this.render();
  }

  batchSetColumn(colId) {
    if (this.selectedTaskIds.size === 0) return;
    this.selectedTaskIds.forEach(id => {
      this.store.moveTask(id, colId);
    });
    this.selectedTaskIds.clear();
    this.store.save(true);
    this.render();
  }

  batchSetAssignee(assignee) {
    if (this.selectedTaskIds.size === 0) return;
    this.selectedTaskIds.forEach(id => {
      const t = this.store.tasks.find(x => x.id === id);
      if (t) {
        t.assignee = assignee || '';
        t.updatedAt = new Date().toISOString();
      }
    });
    this.store.save(true);
    this.render();
  }

  batchAddTag(tagName) {
    if (!tagName || this.selectedTaskIds.size === 0) return;
    const clean = tagName.replace(/^#/, '').trim();
    if (!clean) return;
    const lower = clean.toLowerCase();
    const existingKey = Object.keys(this.store.tags || {}).find(k => k.toLowerCase() === lower);
    const canonicalTag = existingKey || clean;
    if (!this.store.tags[canonicalTag]) {
      this.store.tags[canonicalTag] = this.store.getTagColor(canonicalTag);
    }
    this.selectedTaskIds.forEach(id => {
      const t = this.store.tasks.find(x => x.id === id);
      if (t) {
        if (!Array.isArray(t.tags)) t.tags = [];
        if (!t.tags.some(x => x.replace(/^#/, '').trim().toLowerCase() === lower)) {
          t.tags.push(canonicalTag);
          t.updatedAt = new Date().toISOString();
        }
      }
    });
    this.store.save(true);
    this.render();
  }

  batchRemoveTag(tagName) {
    if (!tagName || this.selectedTaskIds.size === 0) return;
    const lower = tagName.replace(/^#/, '').trim().toLowerCase();
    this.selectedTaskIds.forEach(id => {
      const t = this.store.tasks.find(x => x.id === id);
      if (t && Array.isArray(t.tags)) {
        t.tags = t.tags.filter(x => x.replace(/^#/, '').trim().toLowerCase() !== lower);
        t.updatedAt = new Date().toISOString();
      }
    });
    this.store.save(true);
    this.render();
  }

  batchClearTags() {
    if (this.selectedTaskIds.size === 0) return;
    this.selectedTaskIds.forEach(id => {
      const t = this.store.tasks.find(x => x.id === id);
      if (t) {
        t.tags = [];
        t.updatedAt = new Date().toISOString();
      }
    });
    this.store.save(true);
    this.render();
  }

  batchDeleteTasks() {
    const count = this.selectedTaskIds.size;
    if (count === 0) return;
    if (confirm(`Move ${count} selected tasks to trash?`)) {
      this.selectedTaskIds.forEach(id => {
        this.store.deleteTask(id);
      });
      this.selectedTaskIds.clear();
      this.store.save(true);
      this.render();
    }
  }

  batchDuplicateTasks() {
    const count = this.selectedTaskIds.size;
    if (count === 0) return;
    this.selectedTaskIds.forEach(id => {
      const t = this.store.tasks.find(x => x.id === id);
      if (t) {
        const dup = {
          ...t,
          id: undefined,
          title: `${t.title} (Copy)`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        this.store.addTask(dup);
      }
    });
    this.selectedTaskIds.clear();
    this.store.save(true);
    this.render();
  }

  async batchCopyOrMove(targetDb, action = 'move') {
    if (!targetDb || this.selectedTaskIds.size === 0) {
      return { success: false, error: 'No tasks or database specified' };
    }
    const taskIds = Array.from(this.selectedTaskIds);
    const res = await this.store.copyOrMoveTasksToDatabase(taskIds, targetDb, action);
    if (res && res.success) {
      this.selectedTaskIds.clear();
      this.closeBatchDropdowns();
      this.render();
      const actionWord = action === 'copy' ? 'Copied' : 'Moved';
      this.showNotification(`${actionWord} ${res.count} task(s) to database "${targetDb}"`);
      if (typeof window !== 'undefined' && window.app && typeof window.app.updateDatabaseSelector === 'function') {
        window.app.updateDatabaseSelector();
      }
    }
    return res;
  }

  openBatchTransferModal(defaultMode = 'move') {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('batch-transfer-modal');
    if (!modal) return;

    const sourceDbEl = document.getElementById('batch-transfer-source-db');
    const destSelect = document.getElementById('batch-transfer-dest-db');
    const newDbGroup = document.getElementById('batch-transfer-new-db-group');
    const newDbInput = document.getElementById('batch-transfer-new-db-name');
    const submitBtn = document.getElementById('btn-submit-batch-transfer');
    const cancelBtn = document.getElementById('btn-cancel-batch-transfer');
    const closeBtn = document.getElementById('btn-close-batch-transfer');
    const form = document.getElementById('batch-transfer-form');
    const radioMove = document.getElementById('transfer-mode-move');
    const radioCopy = document.getElementById('transfer-mode-copy');

    if (defaultMode === 'copy' && radioCopy) {
      radioCopy.checked = true;
    } else if (radioMove) {
      radioMove.checked = true;
    }

    const currentDb = this.store.currentDb || 'default';
    if (sourceDbEl) sourceDbEl.textContent = currentDb;

    const updateSubmitText = () => {
      const mode = (radioCopy && radioCopy.checked) ? 'copy' : 'move';
      if (submitBtn) {
        submitBtn.textContent = mode === 'copy' ? 'Copy Tasks' : 'Move Tasks';
      }
    };
    updateSubmitText();

    if (radioMove) radioMove.onchange = updateSubmitText;
    if (radioCopy) radioCopy.onchange = updateSubmitText;

    // Populate destSelect with other databases
    if (destSelect) {
      const allDbs = Array.from(new Set(this.store.databases || ['default'])).sort();
      const otherDbs = allDbs.filter(d => d.toLowerCase() !== currentDb.toLowerCase());

      let opts = otherDbs.map(d => `<option value="${this.escapeHtml(d)}">🗄️ ${this.escapeHtml(d)}</option>`).join('');
      opts += `<option value="__new__">＋ Create new database...</option>`;
      destSelect.innerHTML = opts;

      const toggleNewGroup = () => {
        if (newDbGroup) {
          newDbGroup.style.display = destSelect.value === '__new__' ? 'block' : 'none';
          if (destSelect.value === '__new__' && newDbInput) {
            setTimeout(() => newDbInput.focus(), 50);
          }
        }
      };
      destSelect.onchange = toggleNewGroup;
      toggleNewGroup();
    }

    const closeModal = () => {
      modal.classList.remove('open');
    };

    if (cancelBtn) cancelBtn.onclick = closeModal;
    if (closeBtn) closeBtn.onclick = closeModal;

    if (form) {
      form.onsubmit = async (e) => {
        e.preventDefault();
        const mode = (radioCopy && radioCopy.checked) ? 'copy' : 'move';
        let targetDb = destSelect ? destSelect.value : '';

        if (targetDb === '__new__') {
          const rawName = newDbInput ? newDbInput.value.trim() : '';
          const cleanName = rawName.toLowerCase().replace(/[^a-z0-9_\-]/g, '');
          if (!cleanName) {
            alert('Please enter a valid database name (letters, numbers, hyphens, and underscores only).');
            if (newDbInput) newDbInput.focus();
            return;
          }
          targetDb = cleanName;
        }

        if (!targetDb) {
          alert('Please choose a destination database.');
          return;
        }

        closeModal();
        await this.batchCopyOrMove(targetDb, mode);
      };
    }

    modal.classList.add('open');
  }

  showNotification(msg) {
    if (typeof window !== 'undefined' && window.app && typeof window.app.showNotification === 'function') {
      window.app.showNotification(msg);
      return;
    }
    if (typeof document === 'undefined') return;
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

  setupKeyboardNavigation(taskStream) {
    if (!taskStream) return;
    taskStream.addEventListener('keydown', (e) => {
      const activeRow = document.activeElement ? document.activeElement.closest('.gtd-task-row') : null;
      if (!activeRow) {
        if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
          const firstRow = taskStream.querySelector('.gtd-task-row');
          if (firstRow) {
            e.preventDefault();
            firstRow.focus();
          }
        }
        return;
      }

      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
        if (e.key === 'Escape') e.target.blur();
        return;
      }

      const rows = Array.from(taskStream.querySelectorAll('.gtd-task-row'));
      const idx = rows.indexOf(activeRow);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (idx < rows.length - 1) rows[idx + 1].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (idx > 0) rows[idx - 1].focus();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        activeRow.click();
      } else if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        const chk = activeRow.querySelector('.gtd-task-checkbox');
        if (chk) chk.click();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        activeRow.blur();
      }
    });
  }

  createTrashTaskRow(task) {
    const row = document.createElement('div');
    row.className = `gtd-task-row gtd-trash-row priority-${task.priority}`;
    row.dataset.taskId = task.id;
    row.setAttribute('tabindex', '0');
    row.setAttribute('role', 'button');

    const tagsHtml = (task.tags || []).map(t => {
      const color = this.store.getTagColor(t);
      return `<span class="gtd-tag-chip" style="background-color: ${color}22; color: ${color}; border: 1px solid ${color}55;">#${this.escapeHtml(t)}</span>`;
    }).join(' ');

    const deletedDate = task.deletedAt ? new Date(task.deletedAt) : new Date();
    const daysAgo = Math.floor((Date.now() - deletedDate.getTime()) / (24 * 3600 * 1000));
    const daysLeft = Math.max(0, 30 - daysAgo);

    const origCol = this.store.columns.find(c => c.id === task.columnId);
    const origColTitle = origCol ? origCol.title : 'Board';

    row.innerHTML = `
      <div class="gtd-row-left">
        <span class="gtd-trash-icon" style="font-size: 16px; opacity: 0.7;">🗑️</span>
        <div class="gtd-row-title-area">
          <div class="gtd-trash-title-line">
            <span class="gtd-row-title" style="text-decoration: line-through; opacity: 0.75;">${this.escapeHtml(task.title)}</span>
            <span class="gtd-trash-origin-badge">Origin: ${origColTitle}</span>
          </div>
          <div class="gtd-trash-meta">
            <span class="gtd-trash-purge-info">Deleted ${daysAgo === 0 ? 'today' : `${daysAgo}d ago`} · Auto-purges in <strong>${daysLeft}d</strong></span>
            ${tagsHtml ? `<span class="gtd-row-tags">${tagsHtml}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="gtd-row-right">
        <div class="gtd-trash-actions">
          <button class="btn btn-secondary btn-restore-task" title="Restore task back to board" data-id="${task.id}">↩️ Restore</button>
          <button class="btn btn-danger btn-purge-task" title="Delete forever" data-id="${task.id}">✕ Delete Forever</button>
        </div>
      </div>
    `;

    const restoreBtn = row.querySelector('.btn-restore-task');
    if (restoreBtn) {
      restoreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.store.restoreTask(task.id);
        this.render();
      });
    }

    const purgeBtn = row.querySelector('.btn-purge-task');
    if (purgeBtn) {
      purgeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Permanently delete "${task.title}"? This cannot be undone.`)) {
          this.store.permanentlyDeleteTask(task.id);
          this.render();
        }
      });
    }

    return row;
  }

  createTaskRow(task, filteredTasks = []) {
    const isDone = task.columnId === 'done' || task.columnId === 'archive';
    const isArchive = task.columnId === 'archive';
    const isAbandoned = task.columnId === 'abandoned';
    const isTerminated = isDone || isAbandoned;
    const isSelected = this.selectedTaskIds.has(task.id);
    const recentCompletion = isDone ? this.getMostRecentCompletionDate(task) : null;
    const recentAbandoned = isAbandoned ? this.getMostRecentAbandonedDate(task) : null;
    const row = document.createElement('div');
    row.className = `gtd-task-row priority-${task.priority} ${isTerminated ? 'is-done' : ''} ${isArchive ? 'status-archive' : ''} ${isAbandoned ? 'status-abandoned' : ''} ${isSelected ? 'is-selected' : ''}`;
    row.dataset.taskId = task.id;
    row.setAttribute('tabindex', '0');
    row.setAttribute('role', 'button');

    const tagsHtml = (task.tags || []).map(t => {
      const color = this.store.getTagColor(t);
      return `<span class="gtd-tag-chip" style="background-color: ${color}22; color: ${color}; border: 1px solid ${color}55;">#${this.escapeHtml(t)}</span>`;
    }).join(' ');

    const dueInfo = this.formatDueDate(task.dueDate, isDone);
    const urlHtml = task.url ? `<a href="${this.escapeHtml(task.url)}" target="_blank" rel="noopener noreferrer" class="gtd-link-badge" onclick="event.stopPropagation()">🔗 Link</a>` : '';
    const repeatHtml = (task.repeat && task.repeat.type && task.repeat.type !== 'none')
      ? `<button type="button" class="gtd-repeat-badge badge-repeat-trigger" data-task-id="${task.id}" title="Recurring: ${task.repeat.type} (Click to view completion history)" onclick="event.stopPropagation()">🔁 ${task.repeat.type}</button>`
      : '';
    const timeTooltip = `Created: ${task.createdAt || 'N/A'}&#10;Edited: ${task.updatedAt || 'N/A'}${isAbandoned ? (recentAbandoned ? `&#10;Abandoned: ${recentAbandoned}` : '') : (recentCompletion ? `&#10;Completed: ${recentCompletion}` : '')}`;

    row.innerHTML = `
      <div class="gtd-row-left" title="${timeTooltip}">
        <button type="button" class="gtd-task-checkbox ${isSelected ? 'checked is-selected' : ''} ${isArchive ? 'checkbox-archive' : ''} ${isAbandoned ? 'checkbox-abandoned' : ''}" title="${isSelected ? 'Deselect task' : 'Select task'}" aria-label="Select task"></button>
        <div class="gtd-row-title-area">
          <span class="gtd-row-title">${this.escapeHtml(task.title)}</span>
          ${urlHtml}
          ${repeatHtml}
          ${tagsHtml ? `<span class="gtd-row-tags">${tagsHtml}</span>` : ''}
        </div>
      </div>
      <div class="gtd-row-right">
        ${isAbandoned && recentAbandoned
          ? `<span class="gtd-row-abandoned" title="Abandoned on: ${recentAbandoned}">🚫 Abandoned: ${recentAbandoned}</span>`
          : (recentCompletion ? `<span class="gtd-row-completed" title="Completed on: ${recentCompletion}">✓ Completed: ${recentCompletion}</span>` : '')}
        ${dueInfo ? `<span class="gtd-row-due ${dueInfo.cls}">${dueInfo.text}</span>` : ''}
        <div class="gtd-row-actions">
          <button type="button" class="btn-gtd-row-gcal btn-gcal-trigger" data-task-id="${task.id}" title="Add to Google Calendar with link back">📅</button>
          <button type="button" class="btn-gtd-row-del" title="Delete Task">🗑️</button>
        </div>
      </div>
    `;

    const chk = row.querySelector('.gtd-task-checkbox');
    chk.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleTaskSelection(task.id, e.shiftKey, filteredTasks);
    });

    const delBtn = row.querySelector('.btn-gtd-row-del');
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Delete "${task.title}"?`)) {
        this.selectedTaskIds.delete(task.id);
        this.store.deleteTask(task.id);
        this.render();
      }
    });

    row.addEventListener('click', (e) => {
      if (e.target.closest('.gtd-task-checkbox') || e.target.closest('.btn-gtd-row-del') || e.target.closest('.btn-gcal-trigger') || e.target.closest('.badge-repeat-trigger') || e.target.closest('a')) {
        return;
      }
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        this.toggleTaskSelection(task.id, e.shiftKey, filteredTasks);
        return;
      }
      if (this.onEditTask) this.onEditTask(task);
    });

    return row;
  }

  // Render the bottom tasks list for Kanban Split Mode
  renderBottomList(containerEl, filterColId = 'all') {
    if (!containerEl) return;
    containerEl.innerHTML = '';

    let tasks = [...this.store.tasks];
    if (filterColId && filterColId !== 'all') {
      tasks = tasks.filter(t => t.columnId === filterColId);
    }

    const countBadge = document.getElementById('kanban-bottom-list-count');
    if (countBadge) {
      countBadge.textContent = `${tasks.length} task${tasks.length === 1 ? '' : 's'}`;
    }

    if (tasks.length === 0) {
      containerEl.innerHTML = `
        <div class="gtd-empty-state" style="padding: 24px;">
          <span>📋</span>
          <span style="font-size: 13px;">No tasks found in this column</span>
        </div>
      `;
      return;
    }

    tasks.forEach(task => {
      const isDone = task.columnId === 'done' || task.columnId === 'archive';
      const isArchive = task.columnId === 'archive';
      const isAbandoned = task.columnId === 'abandoned';
      const isTerminated = isDone || isAbandoned;
      const recentCompletion = isDone ? this.getMostRecentCompletionDate(task) : null;
      const recentAbandoned = isAbandoned ? this.getMostRecentAbandonedDate(task) : null;
      const row = document.createElement('div');
      row.className = `gtd-task-row priority-${task.priority} ${isTerminated ? 'is-done' : ''} ${isArchive ? 'status-archive' : ''} ${isAbandoned ? 'status-abandoned' : ''}`;
      row.style.cursor = 'pointer';

      const colObj = this.store.columns.find(c => c.id === task.columnId);
      const colTitle = colObj ? colObj.title : task.columnId;

      const moveOptionsHtml = this.store.columns
        .map(col => `<option value="${col.id}" ${col.id === task.columnId ? 'selected' : ''}>${col.icon || '📁'} ${this.escapeHtml(col.title)}</option>`)
        .join('');

      row.innerHTML = `
        <div class="gtd-row-left" style="gap: 10px;">
          <button class="gtd-task-checkbox ${isTerminated ? 'checked' : ''} ${isArchive ? 'checkbox-archive' : ''} ${isAbandoned ? 'checkbox-abandoned' : ''}" title="${isTerminated ? 'Mark Incomplete' : 'Mark Complete'}"></button>
          <div class="gtd-row-title-area">
            <span class="gtd-row-title">${this.escapeHtml(task.title)}</span>
            <span class="text-meta" style="font-size: 11px; color: var(--text-muted);">${isAbandoned && recentAbandoned ? `<span style="color: var(--text-muted); font-weight: 500;">🚫 Abandoned: ${recentAbandoned}</span> · ` : (recentCompletion ? `<span style="color: var(--success-color); font-weight: 500;">✓ Completed: ${recentCompletion}</span> · ` : '')}${task.assignee ? `👤 ${this.escapeHtml(task.assignee)} · ` : ''}${task.dueDate ? `📅 ${task.dueDate}` : ''}</span>
          </div>
        </div>
        <div class="gtd-row-right" style="gap: 8px;">
          <select class="table-inline-status form-select-sm" title="Change column state">
            ${moveOptionsHtml}
          </select>
          <div class="gtd-row-actions" style="display: flex;">
            <button class="btn-gtd-row-del" title="Delete Task">🗑️</button>
          </div>
        </div>
      `;

      // Status change
      const select = row.querySelector('.table-inline-status');
      select.addEventListener('click', (e) => e.stopPropagation());
      select.addEventListener('change', (e) => {
        e.stopPropagation();
        this.store.moveTask(task.id, select.value);
      });

      // Checkbox
      const chk = row.querySelector('.gtd-task-checkbox');
      chk.addEventListener('click', (e) => {
        e.stopPropagation();
        const nextCol = isDone ? this.store.columns[0].id : 'done';
        this.store.moveTask(task.id, nextCol);
      });

      // Delete
      const del = row.querySelector('.btn-gtd-row-del');
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Delete "${task.title}"?`)) {
          this.store.deleteTask(task.id);
        }
      });

      row.addEventListener('click', () => {
        if (this.onEditTask) this.onEditTask(task);
      });

      containerEl.appendChild(row);
    });
  }

  setupQuickAddAutocomplete(inputEl, dropdownEl) {
    if (!inputEl || !dropdownEl) return;

    let selectedIndex = 0;
    let currentMatches = [];
    let currentTrigger = null;
    let currentRange = null;

    const hideDropdown = () => {
      dropdownEl.style.display = 'none';
      dropdownEl.innerHTML = '';
      selectedIndex = 0;
      currentMatches = [];
      currentTrigger = null;
      currentRange = null;
    };

    const applySelection = (item) => {
      if (!currentRange || !item) return;
      const val = inputEl.value;
      const before = val.slice(0, currentRange.start);
      const after = val.slice(currentRange.end);
      const replacement = `${item.trigger}${item.value} `;
      inputEl.value = before + replacement + after;
      const newCursorPos = before.length + replacement.length;
      inputEl.setSelectionRange(newCursorPos, newCursorPos);
      inputEl.focus();
      hideDropdown();
    };

    const detectToken = () => {
      const val = inputEl.value;
      const cursorPos = inputEl.selectionStart || 0;
      const textBeforeCursor = val.slice(0, cursorPos);

      // Match trailing ^query, !query, or #query before cursor
      const match = textBeforeCursor.match(/(\^|!|#)([^\s]*)$/);
      if (!match) {
        hideDropdown();
        return;
      }

      const trigger = match[1];
      const query = match[2].toLowerCase();
      const matchStart = cursorPos - match[0].length;
      const matchEnd = cursorPos;

      currentTrigger = trigger;
      currentRange = { start: matchStart, end: matchEnd };
      currentMatches = this.getAutocompleteSuggestions(trigger, query);

      if (currentMatches.length === 0) {
        hideDropdown();
        return;
      }

      selectedIndex = 0;
      this.renderAutocompleteDropdown(dropdownEl, currentMatches, selectedIndex, (item) => {
        applySelection(item);
      });
      dropdownEl.style.display = 'flex';
    };

    inputEl.addEventListener('input', detectToken);
    inputEl.addEventListener('click', detectToken);

    inputEl.addEventListener('keydown', (e) => {
      if (dropdownEl.style.display !== 'none' && currentMatches.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          selectedIndex = (selectedIndex + 1) % currentMatches.length;
          this.highlightAutocompleteItem(dropdownEl, selectedIndex);
          return;
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          selectedIndex = (selectedIndex - 1 + currentMatches.length) % currentMatches.length;
          this.highlightAutocompleteItem(dropdownEl, selectedIndex);
          return;
        } else if (e.key === 'Enter' || e.key === 'Tab') {
          if (selectedIndex >= 0 && selectedIndex < currentMatches.length) {
            e.preventDefault();
            e.stopPropagation();
            applySelection(currentMatches[selectedIndex]);
            return;
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          hideDropdown();
          return;
        }
      }

      if (e.key === 'Enter') {
        const val = inputEl.value.trim();
        if (!val) return;
        this.handleQuickAddTask(val);
        inputEl.value = '';
        hideDropdown();
      }
    });

    // Close when clicking outside
    const handleDocumentClick = (e) => {
      if (!inputEl.contains(e.target) && !dropdownEl.contains(e.target)) {
        hideDropdown();
      }
    };
    document.addEventListener('click', handleDocumentClick);
  }

  getAutocompleteSuggestions(trigger, query) {
    const list = [];
    const now = new Date();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    const formatSub = (d) => `${months[d.getMonth()]} ${d.getDate()}`;

    if (trigger === '^') {
      // 1. Today
      const todayDate = new Date(now);
      list.push({
        trigger: '^',
        value: 'today',
        label: 'Today',
        subtext: formatSub(todayDate),
        icon: '📅'
      });

      // 2. Tomorrow
      const tomorrowDate = new Date(now);
      tomorrowDate.setDate(tomorrowDate.getDate() + 1);
      list.push({
        trigger: '^',
        value: 'tomorrow',
        label: 'Tomorrow',
        subtext: formatSub(tomorrowDate),
        icon: '🌅'
      });

      // 3. Upcoming Days
      for (let i = 2; i <= 6; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() + i);
        const dayName = days[d.getDay()];
        list.push({
          trigger: '^',
          value: dayName.toLowerCase(),
          label: dayName,
          subtext: formatSub(d),
          icon: '📆'
        });
      }

      // 4. Next Week
      const nextWeekDate = new Date(now);
      nextWeekDate.setDate(nextWeekDate.getDate() + 7);
      list.push({
        trigger: '^',
        value: 'next-week',
        label: 'Next week',
        subtext: formatSub(nextWeekDate),
        icon: '🗓️'
      });

      if (query) {
        const filtered = list.filter(item =>
          item.label.toLowerCase().includes(query) ||
          item.value.toLowerCase().includes(query) ||
          item.subtext.toLowerCase().includes(query)
        );
        if (filtered.length > 0) return filtered;

        // Custom typed date
        return [{
          trigger: '^',
          value: query,
          label: query,
          subtext: 'Custom date',
          icon: '📅'
        }];
      }
      return list;
    }

    if (trigger === '!') {
      const priorities = [
        { value: '1', label: 'Priority 1', subtext: 'Urgent', color: '#ef4444' },
        { value: '2', label: 'Priority 2', subtext: 'High', color: '#f97316' },
        { value: '3', label: 'Priority 3', subtext: 'Medium', color: '#3b82f6' },
        { value: '4', label: 'Priority 4', subtext: 'Low', color: '#64748b' }
      ];

      const items = priorities.map(p => ({
        trigger: '!',
        value: p.value,
        label: p.label,
        subtext: p.subtext,
        color: p.color
      }));

      if (query) {
        return items.filter(item =>
          item.label.toLowerCase().includes(query) ||
          item.value.toLowerCase().includes(query) ||
          item.subtext.toLowerCase().includes(query)
        );
      }
      return items;
    }

    if (trigger === '#') {
      // Columns / Lists
      const cols = ((this.store && this.store.columns) || []).map(col => ({
        trigger: '#',
        value: col.id,
        label: col.title,
        subtext: 'List',
        icon: col.icon || '📁'
      }));

      // Existing Tags (deduplicated case-insensitively, preferring mixed-case)
      const tagByLower = new Map();
      if (this.store && this.store.tags) {
        Object.keys(this.store.tags).forEach(t => {
          const lower = t.toLowerCase();
          if (!tagByLower.has(lower) || t !== lower) {
            tagByLower.set(lower, t);
          }
        });
      }
      if (this.store && this.store.tasks) {
        this.store.tasks.forEach(task => {
          (task.tags || []).forEach(t => {
            const lower = t.toLowerCase();
            if (!tagByLower.has(lower) || t !== lower) {
              tagByLower.set(lower, t);
            }
          });
        });
      }

      const tags = Array.from(tagByLower.values()).sort((a, b) => a.localeCompare(b)).map(t => ({
        trigger: '#',
        value: t,
        label: t,
        subtext: 'Tag',
        tagColor: this.store && this.store.getTagColor ? this.store.getTagColor(t) : '#3b82f6'
      }));

      const allItems = [...cols, ...tags];

      if (query) {
        const matched = allItems.filter(item =>
          item.label.toLowerCase().includes(query) ||
          item.value.toLowerCase().includes(query)
        );
        const exact = allItems.some(item => item.value.toLowerCase() === query);
        if (!exact && query.trim()) {
          matched.push({
            trigger: '#',
            value: query.trim(),
            label: `Create tag "${query.trim()}"`,
            subtext: 'New Tag',
            tagColor: this.store && this.store.getTagColor ? this.store.getTagColor(query.trim()) : '#3b82f6'
          });
        }
        return matched;
      }
      return allItems;
    }

    return [];
  }

  renderAutocompleteDropdown(dropdownEl, items, selectedIndex, onSelect) {
    dropdownEl.innerHTML = '';
    items.forEach((item, index) => {
      const el = document.createElement('div');
      el.className = `autocomplete-item ${index === selectedIndex ? 'selected' : ''}`;

      let iconHtml = '';
      if (item.color) {
        iconHtml = `<span class="priority-swatch-bar" style="background-color: ${item.color};"></span>`;
      } else if (item.tagColor) {
        iconHtml = `<span class="tag-color-swatch" style="background-color: ${item.tagColor}; width: 12px; height: 12px; border-radius: 3px; display: inline-block;"></span>`;
      } else if (item.icon) {
        iconHtml = `<span class="autocomplete-item-icon">${item.icon}</span>`;
      }

      el.innerHTML = `
        <div class="autocomplete-item-left">
          ${iconHtml}
          <span>${this.escapeHtml(item.label)}</span>
        </div>
        ${item.subtext ? `<span class="autocomplete-subtext">${this.escapeHtml(item.subtext)}</span>` : ''}
      `;

      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        onSelect(item);
      });

      dropdownEl.appendChild(el);
    });
  }

  highlightAutocompleteItem(dropdownEl, index) {
    const items = dropdownEl.querySelectorAll('.autocomplete-item');
    items.forEach((item, idx) => {
      if (idx === index) {
        item.classList.add('selected');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('selected');
      }
    });
  }

  parseSmartTaskInput(rawText) {
    if (!rawText) return { title: '', dueDate: '', priority: 'medium', columnId: null, tags: [] };

    let text = rawText;
    let dueDate = '';
    let priority = 'medium';
    let columnId = null;
    const tags = [];

    const now = new Date();
    const daysMap = {
      sunday: 0, sun: 0,
      monday: 1, mon: 1,
      tuesday: 2, tue: 2,
      wednesday: 3, wed: 3,
      thursday: 4, thu: 4,
      friday: 5, fri: 5,
      saturday: 6, sat: 6
    };

    // 1. Extract dates: ^token
    const dateRegex = /\^([a-zA-Z0-9_\-\/]+|"[^"]+")/g;
    let dateMatch;
    while ((dateMatch = dateRegex.exec(rawText)) !== null) {
      const rawVal = dateMatch[1].replace(/^"|"$/g, '').toLowerCase();
      if (rawVal === 'today') {
        dueDate = now.toISOString().slice(0, 10);
      } else if (rawVal === 'tomorrow') {
        const d = new Date(now);
        d.setDate(d.getDate() + 1);
        dueDate = d.toISOString().slice(0, 10);
      } else if (rawVal === 'next-week' || rawVal === 'nextweek' || rawVal === 'next_week') {
        const d = new Date(now);
        d.setDate(d.getDate() + 7);
        dueDate = d.toISOString().slice(0, 10);
      } else if (daysMap[rawVal] !== undefined) {
        const targetDay = daysMap[rawVal];
        const currentDay = now.getDay();
        let daysToAdd = targetDay - currentDay;
        if (daysToAdd <= 0) daysToAdd += 7;
        const d = new Date(now);
        d.setDate(d.getDate() + daysToAdd);
        dueDate = d.toISOString().slice(0, 10);
      } else {
        const parsed = new Date(rawVal);
        if (!isNaN(parsed.getTime())) {
          dueDate = parsed.toISOString().slice(0, 10);
        } else {
          dueDate = rawVal;
        }
      }
    }
    text = text.replace(dateRegex, ' ');

    // 2. Extract priority: !token
    const priorityRegex = /!([a-zA-Z0-9_\-]+)/g;
    let prioMatch;
    while ((prioMatch = priorityRegex.exec(rawText)) !== null) {
      const val = prioMatch[1].toLowerCase();
      if (val === '1' || val === 'urgent' || val === 'p1') {
        priority = 'urgent';
      } else if (val === '2' || val === 'high' || val === 'p2') {
        priority = 'high';
      } else if (val === '3' || val === 'medium' || val === 'med' || val === 'p3') {
        priority = 'medium';
      } else if (val === '4' || val === 'low' || val === 'p4') {
        priority = 'low';
      }
    }
    text = text.replace(priorityRegex, ' ');

    // 3. Extract lists & tags: #token
    const tagRegex = /#([a-zA-Z0-9_\-]+|"[^"]+")/g;
    let tagMatch;
    while ((tagMatch = tagRegex.exec(rawText)) !== null) {
      const val = tagMatch[1].replace(/^"|"$/g, '').trim();
      const lower = val.toLowerCase();

      // Check if it matches a column
      const matchedCol = ((this.store && this.store.columns) || []).find(c =>
        c.id.toLowerCase() === lower ||
        c.title.toLowerCase() === lower ||
        c.id.toLowerCase() === lower.replace(/-/g, '_')
      );

      if (matchedCol) {
        columnId = matchedCol.id;
      } else {
        const cleanTag = lower;
        if (cleanTag && !tags.includes(cleanTag)) {
          tags.push(cleanTag);
          if (this.store && this.store.getTagColor) {
            this.store.getTagColor(cleanTag);
          }
        }
      }
    }
    text = text.replace(tagRegex, ' ');

    // 4. Clean task title
    let title = text.replace(/\s+/g, ' ').trim();
    if (!title) {
      title = 'New task';
    }

    return { title, dueDate, priority, columnId, tags };
  }

  handleQuickAddTask(inputString) {
    const parsed = this.parseSmartTaskInput(inputString);

    const todayStr = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    let columnId = parsed.columnId;
    let dueDate = parsed.dueDate;
    let priority = parsed.priority || 'medium';
    const tags = [...parsed.tags];

    if (!columnId) {
      if (this.activeFilter.startsWith('col:')) {
        columnId = this.activeFilter.replace('col:', '');
      } else if (this.activeFilter === 'today') {
        columnId = 'in_progress';
      } else {
        columnId = this.store.columns[0]?.id || 'inbox';
      }
    }

    if (!dueDate) {
      if (this.activeFilter === 'today') {
        dueDate = todayStr;
      } else if (this.activeFilter === 'tomorrow') {
        dueDate = tomorrowStr;
      } else if (this.activeFilter === 'this_week') {
        dueDate = todayStr;
      }
    }

    if (this.activeFilter.startsWith('tag:')) {
      const filterTag = this.activeFilter.replace('tag:', '');
      if (!tags.includes(filterTag)) {
        tags.push(filterTag);
      }
    }

    this.store.addTask({
      title: parsed.title,
      columnId,
      dueDate,
      priority,
      tags
    });

    this.render();
  }

  calculateCounts() {
    const todayStr = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);

    const counts = {
      inbox: 0,
      all: 0,
      today: 0,
      tomorrow: 0,
      thisWeek: 0,
      completed: 0,
      tags: {}
    };

    // Case-insensitive registry to map lowercase tags to canonical mixed-case display tags
    const canonicalTagByLower = new Map();
    if (this.store.tags) {
      Object.keys(this.store.tags).forEach(tag => {
        const lower = tag.toLowerCase();
        if (!canonicalTagByLower.has(lower) || tag !== lower) {
          canonicalTagByLower.set(lower, tag);
        }
      });
    }

    this.store.tasks.forEach(t => {
      const isDone = t.columnId === 'done' || t.columnId === 'archive' || t.columnId === 'abandoned';
      if (!isDone) {
        counts.all++;
        if (t.columnId === 'backlog' || !t.dueDate) {
          counts.inbox++;
        }
        if (t.dueDate) {
          if (t.dueDate <= todayStr) counts.today++;
          if (t.dueDate === tomorrowStr) counts.tomorrow++;
          if (t.dueDate >= todayStr && t.dueDate <= weekEndStr) counts.thisWeek++;
        }
      } else if (t.columnId === 'done') {
        counts.completed++;
      }

      (t.tags || []).forEach(tag => {
        const lower = tag.toLowerCase();
        const canonical = canonicalTagByLower.get(lower) || tag;
        canonicalTagByLower.set(lower, canonical);
        counts.tags[canonical] = (counts.tags[canonical] || 0) + 1;
      });
    });

    if (this.store.tags) {
      Object.keys(this.store.tags).forEach(tag => {
        const lower = tag.toLowerCase();
        const canonical = canonicalTagByLower.get(lower) || tag;
        if (counts.tags[canonical] === undefined) {
          counts.tags[canonical] = 0;
        }
      });
    }

    return counts;
  }

  getFilteredTasks() {
    if (this.activeFilter === 'trash') {
      return this.store.trash || [];
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);

    let tasks = [...this.store.tasks];

    if (this.activeFilter === 'col:abandoned') {
      tasks = tasks.filter(t => t.columnId === 'abandoned');
    } else if (this.statusFilter === 'incomplete') {
      tasks = tasks.filter(t => t.columnId !== 'done' && t.columnId !== 'archive' && t.columnId !== 'abandoned');
    } else if (this.statusFilter === 'completed') {
      if (this.activeFilter === 'completed') {
        tasks = tasks.filter(t => t.columnId === 'done');
      } else if (this.activeFilter === 'col:archive') {
        tasks = tasks.filter(t => t.columnId === 'archive');
      } else if (this.activeFilter === 'col:done') {
        tasks = tasks.filter(t => t.columnId === 'done');
      } else {
        tasks = tasks.filter(t => t.columnId === 'done' || t.columnId === 'archive');
      }
    }

    if (this.activeFilter === 'inbox') {
      tasks = tasks.filter(t => (t.columnId === 'backlog' || !t.dueDate) && t.columnId !== 'done' && t.columnId !== 'archive' && t.columnId !== 'abandoned');
    } else if (this.activeFilter === 'today') {
      tasks = tasks.filter(t => t.dueDate && t.dueDate <= todayStr);
    } else if (this.activeFilter === 'tomorrow') {
      tasks = tasks.filter(t => t.dueDate === tomorrowStr);
    } else if (this.activeFilter === 'this_week') {
      tasks = tasks.filter(t => t.dueDate && t.dueDate >= todayStr && t.dueDate <= weekEndStr);
    } else if (this.activeFilter === 'completed') {
      tasks = tasks.filter(t => t.columnId === 'done');
    } else if (this.activeFilter.startsWith('col:')) {
      const colId = this.activeFilter.replace('col:', '');
      tasks = tasks.filter(t => t.columnId === colId);
    } else if (this.activeFilter.startsWith('tag:')) {
      const tag = this.activeFilter.replace('tag:', '');
      tasks = tasks.filter(t => (t.tags || []).includes(tag));
    }

    const pWeight = { urgent: 4, high: 3, medium: 2, low: 1 };
    tasks.sort((a, b) => {
      if (a.dueDate && b.dueDate) {
        if (a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      } else if (a.dueDate) return -1;
      else if (b.dueDate) return 1;

      return (pWeight[b.priority] || 0) - (pWeight[a.priority] || 0);
    });

    return tasks;
  }

  getFilterDisplayName() {
    if (this.activeFilter === 'inbox') return '📥 Inbox';
    if (this.activeFilter === 'all') return '📋 All Tasks';
    if (this.activeFilter === 'today') return '🌟 Today';
    if (this.activeFilter === 'tomorrow') return '🌅 Tomorrow';
    if (this.activeFilter === 'this_week') return '📅 This Week';
    if (this.activeFilter === 'completed') return '✅ Completed';
    if (this.activeFilter === 'trash') return '🗑️ Trash (30-day Purge)';
    if (this.activeFilter.startsWith('col:')) {
      const colId = this.activeFilter.replace('col:', '');
      const col = this.store.columns.find(c => c.id === colId);
      return col ? `${col.icon || '📁'} ${col.title}` : 'List';
    }
    if (this.activeFilter.startsWith('tag:')) {
      return `🏷️ #${this.activeFilter.replace('tag:', '')}`;
    }
    return 'Tasks';
  }

  formatDueDate(dateStr, isCompleted = false) {
    if (!dateStr) return null;
    if (isCompleted) {
      return { text: `Due: ${dateStr}`, cls: 'due-normal' };
    }
    const todayStr = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    if (dateStr < todayStr) {
      return { text: `Overdue: ${dateStr}`, cls: 'due-urgent' };
    } else if (dateStr === todayStr) {
      return { text: 'Today', cls: 'due-today' };
    } else if (dateStr === tomorrowStr) {
      return { text: 'Tomorrow', cls: 'due-future' };
    } else {
      return { text: dateStr, cls: 'due-future' };
    }
  }

  getMostRecentCompletionDate(task) {
    if (!task) return null;
    if (Array.isArray(task.completionHistory) && task.completionHistory.length > 0) {
      const valid = task.completionHistory.filter(Boolean).sort();
      if (valid.length > 0) return valid[valid.length - 1];
    }
    if (task.completedAt) {
      return String(task.completedAt).slice(0, 10);
    }
    const isDone = task.columnId === 'done' || task.columnId === 'archive';
    if (isDone && task.updatedAt) {
      return String(task.updatedAt).slice(0, 10);
    }
    return null;
  }

  getMostRecentAbandonedDate(task) {
    if (!task) return null;
    if (this.store && this.store.getTaskAbandonedDate) {
      return this.store.getTaskAbandonedDate(task);
    }
    if (task.abandonedAt) {
      return String(task.abandonedAt).slice(0, 10);
    }
    if (task.columnId === 'abandoned' && task.updatedAt) {
      return String(task.updatedAt).slice(0, 10);
    }
    return null;
  }

  setFilter(filterId) {
    this.activeFilter = filterId;
    this.selectedTaskIds.clear();
    this.closeBatchDropdowns();
    if (filterId === 'completed' || filterId === 'col:done' || filterId === 'col:archive') {
      this.statusFilter = 'completed';
    } else if (filterId === 'col:abandoned') {
      this.statusFilter = 'all';
    } else if (this.statusFilter === 'completed') {
      this.statusFilter = 'incomplete';
    }

    // On mobile, close drawer after picking filter
    const sidebar = document.getElementById('app-side-panel');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (sidebar) sidebar.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');

    this.render();
    this.renderSidebar();
  }

  closeTagMenuPopup() {
    if (typeof document === 'undefined') return;
    const existing = document.getElementById ? document.getElementById('active-tag-menu-popup') : null;
    if (existing && existing.remove) {
      existing.remove();
    }
    if (document.querySelectorAll) {
      const activeBtns = document.querySelectorAll('.btn-tag-menu.active');
      if (activeBtns && activeBtns.forEach) {
        activeBtns.forEach(b => {
          if (b.classList && b.classList.remove) b.classList.remove('active');
        });
      }
    }
  }

  getContrastingColor(hex) {
    if (!hex) return '#ffffff';
    const c = hex.replace('#', '');
    const r = parseInt(c.substr(0, 2), 16) || 0;
    const g = parseInt(c.substr(2, 2), 16) || 0;
    const b = parseInt(c.substr(4, 2), 16) || 0;
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 150) ? '#1f2937' : '#ffffff';
  }

  openTagMenuPopup(tag, buttonEl, e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (typeof document === 'undefined' || !document.createElement) return;

    // Toggle: if already open on this button, close it
    const existing = document.getElementById ? document.getElementById('active-tag-menu-popup') : null;
    if (existing && existing.dataset && existing.dataset.tag === tag) {
      this.closeTagMenuPopup();
      return;
    }
    this.closeTagMenuPopup();

    const tagColor = this.store.getTagColor(tag);
    const isFav = this.store.isFavoriteTag(tag);

    const popup = document.createElement('div');
    popup.className = 'tag-menu-popup';
    popup.id = 'active-tag-menu-popup';
    popup.dataset.tag = tag;

    // 1. Rename tag
    const renameItem = document.createElement('div');
    renameItem.className = 'tag-menu-item btn-tag-menu-rename';
    renameItem.innerHTML = `<span class="tag-menu-icon">✏️</span><span>Rename tag</span>`;
    renameItem.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.closeTagMenuPopup();
      const newName = prompt(`Rename tag #${tag} to:`, tag);
      if (newName && newName.trim() && newName.trim() !== tag) {
        this.store.renameTag(tag, newName.trim());
        if (this.activeFilter === `tag:${tag}`) {
          this.activeFilter = `tag:${newName.trim().replace(/^#/, '')}`;
        }
        this.renderSidebar();
        this.render();
      }
    });
    popup.appendChild(renameItem);

    // 2. 24-Color palette grid (4 rows x 6 columns)
    const paletteGrid = document.createElement('div');
    paletteGrid.className = 'tag-palette-grid';

    const cleanActive = tagColor.toLowerCase();
    TAG_PALETTE_24.forEach(color => {
      const cell = document.createElement('div');
      cell.className = 'tag-palette-cell';
      cell.style.backgroundColor = color;
      cell.title = color;

      if (cleanActive === color.toLowerCase()) {
        const check = document.createElement('span');
        check.className = 'palette-check-icon';
        check.style.color = this.getContrastingColor(color);
        check.textContent = '✓';
        cell.appendChild(check);
      }

      cell.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.store.setTagColor(tag, color);
        this.closeTagMenuPopup();
        this.renderSidebar();
        this.render();
      });

      paletteGrid.appendChild(cell);
    });
    popup.appendChild(paletteGrid);

    // Divider
    const div1 = document.createElement('div');
    div1.className = 'tag-menu-divider';
    popup.appendChild(div1);

    // 3. Add to Favorites / Remove from Favorites
    const favItem = document.createElement('div');
    favItem.className = 'tag-menu-item btn-tag-menu-favorite';
    favItem.innerHTML = `<span class="tag-menu-icon">${isFav ? '★' : '☆'}</span><span>${isFav ? 'Remove from Favorites' : 'Add to Favorites'}</span>`;
    favItem.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.store.toggleFavoriteTag(tag);
      this.closeTagMenuPopup();
      this.renderSidebar();
    });
    popup.appendChild(favItem);

    // Divider
    const div2 = document.createElement('div');
    div2.className = 'tag-menu-divider';
    popup.appendChild(div2);

    // 4. Remove tag
    const removeItem = document.createElement('div');
    removeItem.className = 'tag-menu-item danger btn-tag-menu-remove';
    removeItem.innerHTML = `<span class="tag-menu-icon">🗑️</span><span>Remove tag</span>`;
    removeItem.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.closeTagMenuPopup();
      if (confirm(`Remove tag #${tag} from all tasks?`)) {
        this.store.deleteTag(tag);
        if (this.activeFilter === `tag:${tag}`) {
          this.setFilter('inbox');
        }
        this.renderSidebar();
        this.render();
      }
    });
    popup.appendChild(removeItem);

    const actionsContainer = buttonEl.closest('.sidebar-tag-actions') || buttonEl.parentElement;
    if (actionsContainer && actionsContainer.appendChild) {
      actionsContainer.appendChild(popup);
    }
    if (buttonEl.classList && buttonEl.classList.add) {
      buttonEl.classList.add('active');
    }

    popup.addEventListener('click', (ev) => ev.stopPropagation());
  }

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

window.ListView = ListView;
