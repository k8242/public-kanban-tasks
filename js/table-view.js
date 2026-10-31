/**
 * Tabular List View
 * Interactive data table of all tasks and states with sorting, filtering,
 * inline status changes, and view modal inspection.
 */

class TableView {
  constructor(containerEl, store, onEditTask, onDeleteTask, onViewTask) {
    this.container = containerEl;
    this.store = store;
    this.onEditTask = onEditTask;
    this.onDeleteTask = onDeleteTask;
    this.onViewTask = onViewTask;

    this.sortField = 'columnId';
    this.sortAsc = true;
    this.filterSearch = '';
    this.filterColumn = 'backlog';
    this.filterPriority = 'all';
  }

  // -------------------------------------------------------------
  // Primary View Orchestration
  // -------------------------------------------------------------

  render() {
    this.container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'table-view-wrapper';

    const toolbar = this.renderToolbar();
    wrapper.appendChild(toolbar);

    const tableContainer = this.renderTable();
    wrapper.appendChild(tableContainer);

    this.container.appendChild(wrapper);
  }

  // -------------------------------------------------------------
  // Toolbar Component
  // -------------------------------------------------------------

  renderToolbar() {
    const toolbar = document.createElement('div');
    toolbar.className = 'table-toolbar';

    const colOptions = this.store.columns
      .map(c => `<option value="${c.id}" ${this.filterColumn === c.id ? 'selected' : ''}>${c.icon} ${c.title}</option>`)
      .join('');

    toolbar.innerHTML = `
      <div class="table-search-group">
        <span class="search-icon">🔍</span>
        <input type="text" class="table-search-input" placeholder="Filter tasks by name, assignee, tag..." value="${this.escapeHtml(this.filterSearch)}">
      </div>
      <div class="table-filters-group">
        <select class="table-filter-select filter-column">
          <option value="all" ${this.filterColumn === 'all' ? 'selected' : ''}>All States</option>
          ${colOptions}
        </select>
        <select class="table-filter-select filter-priority">
          <option value="all" ${this.filterPriority === 'all' ? 'selected' : ''}>All Priorities</option>
          <option value="urgent" ${this.filterPriority === 'urgent' ? 'selected' : ''}>Urgent</option>
          <option value="high" ${this.filterPriority === 'high' ? 'selected' : ''}>High</option>
          <option value="medium" ${this.filterPriority === 'medium' ? 'selected' : ''}>Medium</option>
          <option value="low" ${this.filterPriority === 'low' ? 'selected' : ''}>Low</option>
        </select>
        <span class="table-count-badge" id="table-row-count"></span>
      </div>
    `;

    this.attachToolbarEvents(toolbar);
    return toolbar;
  }

  attachToolbarEvents(toolbar) {
    const searchInput = toolbar.querySelector('.table-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.filterSearch = e.target.value;
        this.render();
        const newSearch = this.container.querySelector('.table-search-input');
        if (newSearch) {
          newSearch.focus();
          newSearch.setSelectionRange(this.filterSearch.length, this.filterSearch.length);
        }
      });
    }

    const colSelect = toolbar.querySelector('.filter-column');
    if (colSelect) {
      colSelect.addEventListener('change', (e) => {
        this.filterColumn = e.target.value;
        this.render();
      });
    }

    const prioritySelect = toolbar.querySelector('.filter-priority');
    if (prioritySelect) {
      prioritySelect.addEventListener('change', (e) => {
        this.filterPriority = e.target.value;
        this.render();
      });
    }
  }

  // -------------------------------------------------------------
  // Table & Header Component
  // -------------------------------------------------------------

  renderTable() {
    const filteredTasks = this.getFilteredAndSortedTasks();

    // Update count badge in toolbar if present
    const countBadge = this.container.querySelector('#table-row-count');
    if (countBadge) {
      countBadge.textContent = `${filteredTasks.length} / ${this.store.tasks.length} tasks`;
    }

    const tableContainer = document.createElement('div');
    tableContainer.className = 'table-scroll-container';

    const table = document.createElement('table');
    table.className = 'kanban-data-table';

    this.renderTableHeader(table);

    const tbody = document.createElement('tbody');
    if (filteredTasks.length === 0) {
      this.renderEmptyState(tbody);
    } else {
      filteredTasks.forEach(task => {
        this.renderTableRow(tbody, task);
      });
    }

    table.appendChild(tbody);
    this.setupKeyboardNavigation(table, tbody);
    tableContainer.appendChild(table);

    return tableContainer;
  }

  renderTableHeader(table) {
    const getSortIndicator = (field) => {
      if (this.sortField !== field) return '<span class="sort-icon">↕</span>';
      return `<span class="sort-icon active">${this.sortAsc ? '▲' : '▼'}</span>`;
    };

    table.innerHTML = `
      <thead>
        <tr>
          <th class="th-sortable" data-sort="title">Task Title ${getSortIndicator('title')}</th>
          <th class="th-sortable" data-sort="columnId">State / Status ${getSortIndicator('columnId')}</th>
          <th class="th-sortable" data-sort="priority">Priority ${getSortIndicator('priority')}</th>
          <th class="th-sortable" data-sort="dueDate">Due Date ${getSortIndicator('dueDate')}</th>
          <th class="th-sortable" data-sort="assignee">Assignee ${getSortIndicator('assignee')}</th>
          <th>Tags</th>
          <th class="th-actions">Actions</th>
        </tr>
      </thead>
    `;

    table.querySelectorAll('th.th-sortable').forEach(th => {
      th.addEventListener('click', () => {
        const field = th.dataset.sort;
        if (this.sortField === field) {
          this.sortAsc = !this.sortAsc;
        } else {
          this.sortField = field;
          this.sortAsc = true;
        }
        this.render();
      });
    });
  }

  // -------------------------------------------------------------
  // Row & Cell Builders
  // -------------------------------------------------------------

  renderEmptyState(tbody) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = `
      <td colspan="7" class="table-empty-cell">
        <div class="table-empty-state">
          <span>🔍 No matching tasks found</span>
        </div>
      </td>
    `;
    tbody.appendChild(emptyRow);
  }

  renderTableRow(tbody, task) {
    const isDoneOrArchive = task.columnId === 'done' || task.columnId === 'archive';
    const isAbandoned = task.columnId === 'abandoned';
    const isTerminated = isDoneOrArchive || isAbandoned;
    const tr = document.createElement('tr');
    tr.className = `table-row priority-row-${task.priority} ${isTerminated ? 'is-done status-done' : ''} ${isDoneOrArchive ? 'status-archive' : ''} ${isAbandoned ? 'status-abandoned' : ''}`;
    tr.dataset.taskId = task.id;
    tr.setAttribute('tabindex', '0');

    tr.innerHTML = `
      <td class="td-title">${this.buildTitleCell(task)}</td>
      <td class="td-state">${this.buildStateCell(task)}</td>
      <td class="td-priority"><span class="badge-${task.priority} priority-pill">${task.priority}</span></td>
      <td class="td-due">${task.dueDate || '<span class="text-muted">—</span>'}</td>
      <td class="td-assignee">${task.assignee ? `👤 ${this.escapeHtml(task.assignee)}` : '<span class="text-muted">—</span>'}</td>
      <td class="td-tags"><div class="table-tags-wrapper">${this.buildTagsHtml(task) || '<span class="text-muted">—</span>'}</div></td>
      <td class="td-actions">${this.buildActionsCell(task)}</td>
    `;

    this.attachRowEvents(tr, task);
    tbody.appendChild(tr);
  }

  buildTitleCell(task) {
    const isDoneOrArchive = task.columnId === 'done' || task.columnId === 'archive';
    const isAbandoned = task.columnId === 'abandoned';
    const compDate = (this.store && this.store.getTaskCompletionDate) ? this.store.getTaskCompletionDate(task) : (task.completedAt ? String(task.completedAt).slice(0, 10) : null);
    const abandonedDate = (this.store && this.store.getTaskAbandonedDate) ? this.store.getTaskAbandonedDate(task) : (task.abandonedAt ? String(task.abandonedAt).slice(0, 10) : null);

    let statusDateHtml = '';
    let statusTooltip = '';
    if (isAbandoned && abandonedDate) {
      statusDateHtml = ` · <span class="table-abandoned-date" style="color: var(--text-muted); font-weight: 500;">🚫 Abandoned: ${abandonedDate}</span>`;
      statusTooltip = `&#10;Abandoned: ${abandonedDate}`;
    } else if (isDoneOrArchive && compDate) {
      statusDateHtml = ` · <span class="table-completed-date" style="color: var(--accent-success, #22c55e); font-weight: 500;">✓ Completed: ${compDate}</span>`;
      statusTooltip = `&#10;Completed: ${compDate}`;
    }

    const urlHtml = task.url
      ? `<a href="${this.escapeHtml(task.url)}" target="_blank" rel="noopener noreferrer" class="table-link-badge" title="Open ${this.escapeHtml(task.url)}" onclick="event.stopPropagation()">🔗 Link</a>`
      : '';
    const repeatHtml = (task.repeat && task.repeat.type && task.repeat.type !== 'none')
      ? `<button type="button" class="table-repeat-badge badge-repeat-trigger" data-task-id="${task.id}" title="Recurring: ${task.repeat.type} (Click to view completion history)" onclick="event.stopPropagation()">🔁 ${task.repeat.type}</button>`
      : '';

    const createdDateStr = task.createdAt ? new Date(task.createdAt).toLocaleDateString() : '';
    const updatedDateStr = task.updatedAt ? new Date(task.updatedAt).toLocaleDateString() : createdDateStr;

    const cleanDesc = this.formatDescriptionText(task.description);
    const descHtml = cleanDesc
      ? `<span class="task-desc-sub" title="${this.escapeHtml(task.description)}">${this.escapeHtml(cleanDesc)}</span>`
      : '';

    return `
      <div class="task-title-cell">
        <div class="task-title-row">
          <strong>${this.escapeHtml(task.title)}</strong>
          ${urlHtml}
          ${repeatHtml}
        </div>
        ${descHtml}
        <div class="task-timestamps-sub" title="Created: ${task.createdAt || 'N/A'}&#10;Edited: ${task.updatedAt || 'N/A'}${statusTooltip}">
          <span>Created: ${createdDateStr || '—'}</span> · <span>Edited: ${updatedDateStr || '—'}</span>${statusDateHtml}
        </div>
      </div>
    `;
  }

  buildStateCell(task) {
    const statusOptions = this.store.columns
      .map(col => `<option value="${col.id}" ${col.id === task.columnId ? 'selected' : ''}>${col.icon} ${col.title}</option>`)
      .join('');
    return `
      <select class="table-inline-status" data-task-id="${task.id}">
        ${statusOptions}
      </select>
    `;
  }

  buildTagsHtml(task) {
    return (task.tags || []).map(t => {
      const color = this.store.getTagColor ? this.store.getTagColor(t) : '#3b82f6';
      return `<span class="table-tag" style="background-color: ${color}20; color: ${color}; border: 1px solid ${color}55;">#${this.escapeHtml(t)}</span>`;
    }).join(' ');
  }

  buildActionsCell(task) {
    return `
      <button class="btn-table-action btn-gcal btn-gcal-trigger" title="Add to Google Calendar" data-task-id="${task.id}">📅</button>
      <button class="btn-table-action btn-edit" title="Edit Task" data-id="${task.id}">✏️</button>
      <button class="btn-table-action btn-delete" title="Delete Task" data-id="${task.id}">🗑️</button>
    `;
  }

  // -------------------------------------------------------------
  // Row Interaction Events
  // -------------------------------------------------------------

  attachRowEvents(tr, task) {
    // 1. Inline state change dropdown
    const statusSelect = tr.querySelector('.table-inline-status');
    if (statusSelect) {
      statusSelect.addEventListener('change', (e) => {
        e.stopPropagation();
        this.store.moveTask(task.id, e.target.value);
      });
    }

    // 2. Edit button
    const editBtn = tr.querySelector('.btn-edit');
    if (editBtn) {
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onEditTask) this.onEditTask(task);
      });
    }

    // 3. Delete button
    const deleteBtn = tr.querySelector('.btn-delete');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Delete task "${task.title}"?`)) {
          if (this.onDeleteTask) this.onDeleteTask(task.id);
        }
      });
    }

    // 4. Row click opens task in view mode (unless clicking an interactive child)
    tr.addEventListener('click', (e) => {
      if (e.target.closest('button, select, input, a, .btn-table-action, .table-inline-status, .table-link-badge, .table-repeat-badge')) {
        return;
      }
      this.openTaskView(task);
    });
  }

  // -------------------------------------------------------------
  // Filtering & Sorting Logic
  // -------------------------------------------------------------

  getFilteredAndSortedTasks() {
    let tasks = [...this.store.tasks];

    // Filter by search
    if (this.filterSearch.trim()) {
      const q = this.filterSearch.toLowerCase();
      tasks = tasks.filter(t => {
        return (
          t.title.toLowerCase().includes(q) ||
          (t.description && t.description.toLowerCase().includes(q)) ||
          (t.assignee && t.assignee.toLowerCase().includes(q)) ||
          (t.tags && t.tags.some(tag => tag.toLowerCase().includes(q)))
        );
      });
    }

    // Filter by Column / State
    if (this.filterColumn !== 'all') {
      tasks = tasks.filter(t => t.columnId === this.filterColumn);
    }

    // Filter by Priority
    if (this.filterPriority !== 'all') {
      tasks = tasks.filter(t => t.priority === this.filterPriority);
    }

    // Sort
    const priorityWeight = { urgent: 4, high: 3, medium: 2, low: 1 };
    tasks.sort((a, b) => {
      let valA = a[this.sortField] || '';
      let valB = b[this.sortField] || '';

      if (this.sortField === 'priority') {
        valA = priorityWeight[valA] || 0;
        valB = priorityWeight[valB] || 0;
      } else if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      }

      if (valA < valB) return this.sortAsc ? -1 : 1;
      if (valA > valB) return this.sortAsc ? 1 : -1;
      return 0;
    });

    return tasks;
  }

  // -------------------------------------------------------------
  // Keyboard Navigation
  // -------------------------------------------------------------

  setupKeyboardNavigation(table, tbody) {
    if (!table || !tbody) return;
    table.addEventListener('keydown', (e) => {
      const activeRow = document.activeElement ? document.activeElement.closest('tbody tr') : null;
      if (!activeRow) {
        if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
          const firstRow = tbody.querySelector('tr');
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

      const rows = Array.from(tbody.querySelectorAll('tr'));
      const idx = rows.indexOf(activeRow);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (idx < rows.length - 1) rows[idx + 1].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (idx > 0) rows[idx - 1].focus();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const taskId = activeRow.dataset.taskId;
        const task = this.store.getTask(taskId);
        if (task) {
          this.openTaskView(task);
        } else {
          const editBtn = activeRow.querySelector('.btn-edit');
          if (editBtn) editBtn.click();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        activeRow.blur();
      }
    });
  }

  // -------------------------------------------------------------
  // View Modal & Format Utilities
  // -------------------------------------------------------------

  openTaskView(task) {
    if (!task) return;
    if (this.onViewTask) {
      this.onViewTask(task);
    } else if (typeof window !== 'undefined' && window.app && typeof window.app.openTaskDetailModal === 'function') {
      window.app.openTaskDetailModal(task);
    } else if (typeof window !== 'undefined' && window.kanbanApp && typeof window.kanbanApp.openTaskDetailModal === 'function') {
      window.kanbanApp.openTaskDetailModal(task);
    } else if (this.onEditTask) {
      this.onEditTask(task);
    }
  }

  formatDescriptionText(desc) {
    if (!desc) return '';
    return String(desc)
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^\s*[-*+]\s+/gm, '• ')
      .replace(/---|\*\*\*|___/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_~`]/g, '')
      .replace(/\r?\n\s*\r?\n/g, ' · ')
      .replace(/\r?\n/g, ' ')
      .trim();
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

window.TableView = TableView;
