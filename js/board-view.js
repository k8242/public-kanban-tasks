/**
 * Kanban Board View Renderer
 * Renders columns, cards, and handles drag-and-drop & touch quick moves.
 */

class BoardView {
  constructor(containerEl, store, onCardClick, onAddTask, onEditTask) {
    this.container = containerEl;
    this.store = store;
    this.onCardClick = onCardClick;
    this.onAddTask = onAddTask;
    this.onEditTask = onEditTask || onCardClick;
    this.draggedTaskId = null;
    this.singleColumnId = 'all';
    this.onStateChange = null;
  }

  setSingleColumn(colId) {
    this.singleColumnId = colId || 'all';
    this.render();
  }

  render() {
    this.container.innerHTML = '';

    // Hide columns that do not appear on the board (e.g. pending/archive)
    const boardColumns = this.store.columns.filter(col => col.showInBoard !== false);
    const isSingleState = Boolean(this.singleColumnId) && this.singleColumnId !== 'all';
    const visibleColumns = this.getVisibleColumns(boardColumns, isSingleState);

    const boardEl = document.createElement('div');
    boardEl.className = `kanban-board-tableau ${isSingleState ? 'single-state-view' : ''}`;

    visibleColumns.forEach(col => {
      boardEl.appendChild(this.renderColumn(col, boardColumns, isSingleState));
    });

    this.container.appendChild(boardEl);
    this.setupKeyboardNavigation(boardEl);
    this.bindAddTaskButtons();
  }

  getVisibleColumns(boardColumns, isSingleState) {
    if (!isSingleState) return boardColumns;
    const selected = boardColumns.find(c => c.id === this.singleColumnId);
    return selected ? [selected] : boardColumns;
  }

  getSortedColumnTasks(columnId) {
    // Most important first: urgent at top, low at bottom
    const priorityWeights = { urgent: 4, high: 3, medium: 2, low: 1 };
    return this.store.getTasksByColumn(columnId)
      .sort((a, b) => (priorityWeights[b.priority] || 0) - (priorityWeights[a.priority] || 0));
  }

  renderColumn(col, boardColumns, isSingleState) {
    const tasks = this.getSortedColumnTasks(col.id);

    const colEl = document.createElement('div');
    colEl.className = 'kanban-column';
    colEl.dataset.columnId = col.id;

    colEl.appendChild(this.renderColumnHeader(col, tasks.length));
    if (isSingleState) {
      colEl.appendChild(this.renderSingleStateNav(col, boardColumns));
    }
    colEl.appendChild(this.renderCardsList(col, tasks));
    return colEl;
  }

  renderColumnHeader(col, taskCount) {
    const headerEl = document.createElement('div');
    headerEl.className = 'column-header';
    headerEl.style.borderTopColor = col.color;
    headerEl.innerHTML = `
      <div class="column-title-group">
        <span class="column-icon">${col.icon}</span>
        <h3 class="column-title">${col.title}</h3>
        <span class="column-count">${taskCount}</span>
      </div>
      <button class="btn-icon add-column-task-btn" title="Add task to ${col.title}" data-col="${col.id}">＋</button>
    `;
    return headerEl;
  }

  // Prev/next state pills shown on phone-sized single-state view
  renderSingleStateNav(col, boardColumns) {
    const curIdx = boardColumns.findIndex(c => c.id === col.id);
    const prevCol = boardColumns[(curIdx - 1 + boardColumns.length) % boardColumns.length];
    const nextCol = boardColumns[(curIdx + 1) % boardColumns.length];

    const navEl = document.createElement('div');
    navEl.className = 'single-state-nav';
    navEl.innerHTML = `
      <button type="button" class="btn-state-nav btn-prev-state" title="Go to ${prevCol.title}">‹ ${prevCol.icon} ${prevCol.title}</button>
      <span class="single-state-indicator" style="font-size: 11px; color: var(--text-muted);">${curIdx + 1} of ${boardColumns.length}</span>
      <button type="button" class="btn-state-nav btn-next-state" title="Go to ${nextCol.title}">${nextCol.icon} ${nextCol.title} ›</button>
    `;

    const bindNav = (selector, targetCol) => {
      navEl.querySelector(selector).addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onStateChange) this.onStateChange(targetCol.id);
      });
    };
    bindNav('.btn-prev-state', prevCol);
    bindNav('.btn-next-state', nextCol);

    return navEl;
  }

  renderCardsList(col, tasks) {
    const cardsListEl = document.createElement('div');
    cardsListEl.className = 'cards-list';
    cardsListEl.dataset.columnId = col.id;

    this.setupDropZone(cardsListEl, col.id);
    tasks.forEach(task => {
      cardsListEl.appendChild(this.createCardElement(task, this.store.columns));
    });
    return cardsListEl;
  }

  bindAddTaskButtons() {
    this.container.querySelectorAll('.add-column-task-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onAddTask) this.onAddTask(btn.dataset.col);
      });
    });
  }

  setupKeyboardNavigation(boardEl) {
    boardEl.addEventListener('keydown', (e) => {
      const activeCard = document.activeElement ? document.activeElement.closest('.kanban-card') : null;
      if (!activeCard) {
        if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
          const firstCard = boardEl.querySelector('.kanban-card');
          if (firstCard) {
            e.preventDefault();
            firstCard.focus();
          }
        }
        return;
      }

      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
        if (e.key === 'Escape') e.target.blur();
        return;
      }

      const currentColumn = activeCard.closest('.kanban-column');
      if (!currentColumn) return;

      const columnCards = Array.from(currentColumn.querySelectorAll('.kanban-card'));
      const cardIdxInCol = columnCards.indexOf(activeCard);

      const allColumns = Array.from(boardEl.querySelectorAll('.kanban-column'));
      const colIdx = allColumns.indexOf(currentColumn);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (cardIdxInCol < columnCards.length - 1) {
          columnCards[cardIdxInCol + 1].focus();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (cardIdxInCol > 0) {
          columnCards[cardIdxInCol - 1].focus();
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (colIdx < allColumns.length - 1) {
          const nextColCards = Array.from(allColumns[colIdx + 1].querySelectorAll('.kanban-card'));
          if (nextColCards.length > 0) {
            const targetIdx = Math.min(cardIdxInCol, nextColCards.length - 1);
            nextColCards[targetIdx].focus();
          }
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (colIdx > 0) {
          const prevColCards = Array.from(allColumns[colIdx - 1].querySelectorAll('.kanban-card'));
          if (prevColCards.length > 0) {
            const targetIdx = Math.min(cardIdxInCol, prevColCards.length - 1);
            prevColCards[targetIdx].focus();
          }
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        activeCard.click();
      } else if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        const expandBtn = activeCard.querySelector('.btn-card-expand');
        if (expandBtn) {
          expandBtn.click();
        } else {
          activeCard.click();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        activeCard.blur();
      }
    });
  }

  createCardElement(task, allColumns) {
    const isDoneOrArchive = task.columnId === 'done' || task.columnId === 'archive';
    const isAbandoned = task.columnId === 'abandoned';
    const isTerminated = isDoneOrArchive || isAbandoned;
    const card = document.createElement('div');
    card.className = `kanban-card priority-${task.priority} ${isTerminated ? 'is-done card-done' : ''} ${isAbandoned ? 'status-abandoned' : ''}`;
    card.dataset.taskId = task.id;
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.draggable = true;

    // Drag events for desktop
    card.addEventListener('dragstart', (e) => {
      this.draggedTaskId = task.id;
      card.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', task.id);
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('is-dragging');
      this.draggedTaskId = null;
      document.querySelectorAll('.cards-list').forEach(el => el.classList.remove('drop-active'));
    });

    // Card click opens edit modal
    card.addEventListener('click', (e) => {
      // If user clicked quick move select or delete, ignore card modal
      if (e.target.closest('.card-quick-move, .btn-card-del')) return;
      if (this.onCardClick) this.onCardClick(task);
    });

    // Priority badge
    const priorityLabels = {
      urgent: 'Urgent',
      high: 'High',
      medium: 'Medium',
      low: 'Low'
    };

    // Tags HTML with custom or assigned tag colors
    const tagsHtml = (task.tags || [])
      .map(tag => {
        const color = this.store.getTagColor ? this.store.getTagColor(tag) : '#3b82f6';
        return `<span class="card-tag" style="background-color: ${color}20; color: ${color}; border: 1px solid ${color}55;">#${this.escapeHtml(tag)}</span>`;
      })
      .join('');

    // URL, Repeat, and Timestamp badges
    const urlHtml = task.url ? `<a href="${this.escapeHtml(task.url)}" target="_blank" rel="noopener noreferrer" class="card-link-badge" title="Open ${this.escapeHtml(task.url)}" onclick="event.stopPropagation()">🔗 Link</a>` : '';
    const repeatHtml = (task.repeat && task.repeat.type && task.repeat.type !== 'none')
      ? `<button type="button" class="card-repeat-badge badge-repeat-trigger" data-task-id="${task.id}" title="Recurring: ${task.repeat.type} (Click to view completion history)" onclick="event.stopPropagation()">🔁 ${task.repeat.type}</button>`
      : '';
    const completedDate = (this.store && this.store.getTaskCompletionDate) ? this.store.getTaskCompletionDate(task) : (task.completedAt ? String(task.completedAt).slice(0, 10) : null);
    const abandonedDate = (this.store && this.store.getTaskAbandonedDate) ? this.store.getTaskAbandonedDate(task) : (task.abandonedAt ? String(task.abandonedAt).slice(0, 10) : null);

    let statusDateHtml = '';
    if (isAbandoned && abandonedDate) {
      statusDateHtml = `<span class="card-abandoned-date" style="color: var(--text-muted, #64748b); font-size: 11px; font-weight: 600;" title="Abandoned: ${abandonedDate}">🚫 ${abandonedDate}</span>`;
    } else if (isDoneOrArchive && completedDate) {
      statusDateHtml = `<span class="card-completed-date" style="color: var(--accent-success, #22c55e); font-size: 11px; font-weight: 600;" title="Completed: ${completedDate}">✓ ${completedDate}</span>`;
    }

    const updatedDateStr = task.updatedAt ? new Date(task.updatedAt).toLocaleDateString() : '';
    const timeTooltip = `Created: ${task.createdAt || 'N/A'}&#10;Edited: ${task.updatedAt || 'N/A'}${isAbandoned ? (abandonedDate ? `&#10;Abandoned: ${abandonedDate}` : '') : (completedDate ? `&#10;Completed: ${completedDate}` : '')}`;

    // Quick move options for mobile & touch access
    const moveOptionsHtml = allColumns
      .map(col => `<option value="${col.id}" ${col.id === task.columnId ? 'selected' : ''}>→ ${col.title}</option>`)
      .join('');

    const descHtml = task.description
      ? (task.isMarkdown && typeof window !== 'undefined' && window.renderMarkdown
          ? `<div class="card-desc markdown-content">${window.renderMarkdown(task.description)}</div>`
          : `<p class="card-desc">${this.escapeHtml(task.description)}</p>`)
      : '';

    const currentCol = allColumns.find(c => c.id === task.columnId);

    card.innerHTML = `
      <div class="card-top">
        <span class="card-priority badge-${task.priority}">${priorityLabels[task.priority] || task.priority}</span>
        <div class="card-top-actions">
          <button type="button" class="btn-card-expand" title="Expand card on board" data-task-id="${task.id}" onclick="event.stopPropagation()">⤢</button>
          <select class="card-quick-move" title="Quick Move Status" data-task-id="${task.id}">
            ${moveOptionsHtml}
          </select>
        </div>
      </div>
      <h4 class="card-title">${this.escapeHtml(task.title)}</h4>
      ${descHtml}
      <div class="card-meta">
        ${tagsHtml ? `<div class="card-tags">${tagsHtml}</div>` : ''}
        <div class="card-footer-info">
          ${urlHtml}
          ${repeatHtml}
          ${statusDateHtml}
          ${task.dueDate ? `<span class="card-due-date" title="Due Date">📅 ${task.dueDate}</span>` : ''}
          <button type="button" class="card-gcal-btn btn-gcal-trigger" data-task-id="${task.id}" title="Add to Google Calendar with link back" onclick="event.stopPropagation()">📅</button>
          ${updatedDateStr ? `<span class="card-time-edited" title="${timeTooltip}">🕒 ${updatedDateStr}</span>` : ''}
        </div>
      </div>
      <div class="card-expanded-details">
        ${task.assignee ? `<div class="card-expanded-row"><span>Assignee:</span><strong>👤 ${this.escapeHtml(task.assignee)}</strong></div>` : ''}
        ${isAbandoned && abandonedDate ? `<div class="card-expanded-row" style="color: var(--text-muted, #64748b);"><span>Abandoned:</span><strong>🚫 ${abandonedDate}</strong></div>` : (completedDate ? `<div class="card-expanded-row" style="color: var(--accent-success, #22c55e);"><span>Completed:</span><strong>✅ ${completedDate}</strong></div>` : '')}
        ${task.dueDate ? `<div class="card-expanded-row"><span>Due Date:</span><strong>📅 ${task.dueDate}</strong></div>` : ''}
        ${task.url ? `<div class="card-expanded-row"><span>URL:</span><a href="${this.escapeHtml(task.url)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">🔗 ${this.escapeHtml(task.url)}</a></div>` : ''}
        <div class="card-expanded-row"><span>Column:</span><strong>${currentCol ? `${currentCol.icon || ''} ${currentCol.title}` : task.columnId}</strong></div>
        <div class="card-expanded-row" style="color: var(--text-muted);"><span>Last edited:</span><span>${updatedDateStr || 'Recently'}</span></div>
        <div class="card-expanded-footer">
          <button type="button" class="btn btn-sm btn-secondary btn-card-open-details" data-task-id="${task.id}" onclick="event.stopPropagation()">Full View</button>
          <button type="button" class="btn btn-sm btn-primary btn-card-quick-edit" data-task-id="${task.id}" onclick="event.stopPropagation()">✏️ Edit</button>
        </div>
      </div>
    `;

    // In-place expand toggle button
    const expandBtn = card.querySelector('.btn-card-expand');
    if (expandBtn) {
      expandBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isExp = card.classList.toggle('is-expanded');
        expandBtn.textContent = isExp ? '⤡' : '⤢';
        expandBtn.title = isExp ? 'Collapse card on board' : 'Expand card on board';
      });
    }

    // Quick edit button inside expanded card
    const quickEditBtn = card.querySelector('.btn-card-quick-edit');
    if (quickEditBtn) {
      quickEditBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onEditTask) {
          this.onEditTask(task);
        } else if (this.onCardClick) {
          this.onCardClick(task);
        }
      });
    }

    // Full view button inside expanded card
    const fullDetailsBtn = card.querySelector('.btn-card-open-details');
    if (fullDetailsBtn) {
      fullDetailsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onCardClick) this.onCardClick(task);
      });
    }

    // Hook quick move change
    const selectEl = card.querySelector('.card-quick-move');
    if (selectEl) {
      selectEl.addEventListener('change', (e) => {
        e.stopPropagation();
        const targetCol = e.target.value;
        this.store.moveTask(task.id, targetCol);
      });
    }

    return card;
  }

  setupDropZone(zoneEl, columnId) {
    zoneEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      zoneEl.classList.add('drop-active');
    });

    zoneEl.addEventListener('dragleave', (e) => {
      if (!zoneEl.contains(e.relatedTarget)) {
        zoneEl.classList.remove('drop-active');
      }
    });

    zoneEl.addEventListener('drop', (e) => {
      e.preventDefault();
      zoneEl.classList.remove('drop-active');
      const taskId = e.dataTransfer.getData('text/plain') || this.draggedTaskId;
      if (taskId) {
        this.store.moveTask(taskId, columnId);
      }
    });
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

window.BoardView = BoardView;
