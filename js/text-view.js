/**
 * Text-Only View
 * Provides a clean, accessible plain-text outline of all tasks and states,
 * with copy, download, and bidirectional plain-text editing/syncing.
 */

class TextView {
  constructor(containerEl, store) {
    this.container = containerEl;
    this.store = store;
    this.isRawEditMode = false;
  }

  render() {
    this.container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'text-view-wrapper';

    // Text view action toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'text-toolbar';
    toolbar.innerHTML = `
      <div class="text-toolbar-left">
        <span class="text-view-title">📄 Plain Text & Outline Representation</span>
        <span class="text-badge">${this.store.tasks.length} Total Tasks</span>
      </div>
      <div class="text-toolbar-right">
        <button class="btn btn-secondary btn-copy-text" title="Copy to clipboard">📋 Copy Text</button>
        <button class="btn btn-secondary btn-download-text" title="Download text report">💾 Download .txt</button>
        <button class="btn btn-primary btn-toggle-mode">
          ${this.isRawEditMode ? '👁️ Switch to Outline View' : '✏️ Edit as Plain Text'}
        </button>
      </div>
    `;

    const contentArea = document.createElement('div');
    contentArea.className = 'text-content-area';

    const plainText = this.generatePlainText();

    if (this.isRawEditMode) {
      // Raw textarea editor
      contentArea.innerHTML = `
        <div class="raw-text-editor-container">
          <div class="editor-help-banner">
            💡 <strong>Interactive Text Sync:</strong> You can edit tasks or states below directly as text, or paste tasks, then click <strong>"Apply Text to Board"</strong> to sync with the Kanban board.
          </div>
          <textarea class="raw-text-textarea" spellcheck="false">${plainText}</textarea>
          <div class="raw-editor-actions">
            <button class="btn btn-success btn-apply-text">✅ Apply Text to Board</button>
            <button class="btn btn-secondary btn-reset-text">🔄 Reset Text</button>
          </div>
        </div>
      `;

      // Hook apply button
      contentArea.querySelector('.btn-apply-text').addEventListener('click', () => {
        const textVal = contentArea.querySelector('.raw-text-textarea').value;
        const success = this.parseAndApplyText(textVal);
        if (success) {
          alert('Kanban board successfully updated from plain text!');
          this.isRawEditMode = false;
          this.render();
        } else {
          alert('Could not parse text. Ensure columns start with "## COLUMN_NAME" and tasks start with "- "');
        }
      });

      const textarea = contentArea.querySelector('.raw-text-textarea');
      if (textarea) {
        textarea.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') textarea.blur();
        });
      }

      contentArea.querySelector('.btn-reset-text').addEventListener('click', () => {
        contentArea.querySelector('.raw-text-textarea').value = this.generatePlainText();
      });

    } else {
      // Structured readable outline
      const outlineEl = document.createElement('div');
      outlineEl.className = 'text-outline-display';

      const columns = this.store.columns;
      let html = `<div class="text-board-header">
        <h1>PROJECT KANBAN TABLEAU</h1>
        <p class="text-meta">Generated: ${new Date().toLocaleString()} | Total Tasks: ${this.store.tasks.length}</p>
      </div>`;

      columns.forEach(col => {
        const tasks = this.store.getTasksByColumn(col.id);
        html += `
          <div class="text-column-section">
            <div class="text-col-title">
              <span class="text-col-marker">##</span>
              <span class="text-col-name">${col.icon} ${col.title.toUpperCase()}</span>
              <span class="text-col-count">(${tasks.length} task${tasks.length === 1 ? '' : 's'})</span>
            </div>
            <ul class="text-task-list">
        `;

        if (tasks.length === 0) {
          html += `<li class="text-task-empty">(No tasks in this state)</li>`;
        } else {
          tasks.forEach(t => {
            const isDoneOrArchive = t.columnId === 'done' || t.columnId === 'archive';
            const isAbandoned = t.columnId === 'abandoned';
            const isTerminated = isDoneOrArchive || isAbandoned;
            const compDate = (this.store && this.store.getTaskCompletionDate) ? this.store.getTaskCompletionDate(t) : (t.completedAt ? String(t.completedAt).slice(0, 10) : null);
            const abandonedDate = (this.store && this.store.getTaskAbandonedDate) ? this.store.getTaskAbandonedDate(t) : (t.abandonedAt ? String(t.abandonedAt).slice(0, 10) : null);

            let statusDateText = '';
            if (isAbandoned && abandonedDate) {
              statusDateText = ` | Abandoned: ${abandonedDate}`;
            } else if (isDoneOrArchive && compDate) {
              statusDateText = ` | Completed: ${compDate}`;
            }

            const tagsText = t.tags && t.tags.length ? `[${t.tags.map(tag => '#' + tag).join(', ')}]` : '';
            const urlText = t.url ? `<span class="text-url">[URL: ${this.escapeHtml(t.url)}]</span>` : '';
            const timeText = `<span class="text-timestamps">[Created: ${t.createdAt ? t.createdAt.slice(0, 10) : '—'} | Edited: ${t.updatedAt ? t.updatedAt.slice(0, 10) : '—'}${statusDateText}]</span>`;
            html += `
              <li class="text-task-item ${isTerminated ? 'is-done' : ''} ${isDoneOrArchive ? 'text-item-done' : ''} ${isAbandoned ? 'text-item-abandoned' : ''}" tabindex="0">
                <div class="text-task-head">
                  <span class="text-bullet">•</span>
                  <span class="text-task-title"><strong>${this.escapeHtml(t.title)}</strong></span>
                  <span class="text-priority-tag tag-${t.priority}">[Priority: ${t.priority.toUpperCase()}]</span>
                  ${t.dueDate ? `<span class="text-due">[Due: ${t.dueDate}]</span>` : ''}
                  ${t.assignee ? `<span class="text-assignee">[@${this.escapeHtml(t.assignee)}]</span>` : ''}
                  ${urlText}
                  ${tagsText ? `<span class="text-tags">${tagsText}</span>` : ''}
                  ${timeText}
                </div>
                ${t.description ? `<div class="text-task-desc ${t.isMarkdown ? 'markdown-content' : ''}">${t.isMarkdown && typeof window !== 'undefined' && window.renderMarkdown ? window.renderMarkdown(t.description) : this.escapeHtml(t.description)}</div>` : ''}
              </li>
            `;
          });
        }

        html += `</ul></div>`;
      });

      outlineEl.innerHTML = html;
      this.setupKeyboardNavigation(outlineEl);
      contentArea.appendChild(outlineEl);
    }

    wrapper.appendChild(toolbar);
    wrapper.appendChild(contentArea);
    this.container.appendChild(wrapper);

    // Toolbar button listeners
    toolbar.querySelector('.btn-toggle-mode').addEventListener('click', () => {
      this.isRawEditMode = !this.isRawEditMode;
      this.render();
    });

    toolbar.querySelector('.btn-copy-text').addEventListener('click', () => {
      const text = this.generatePlainText();
      navigator.clipboard.writeText(text).then(() => {
        const btn = toolbar.querySelector('.btn-copy-text');
        btn.textContent = '✅ Copied!';
        setTimeout(() => { btn.textContent = '📋 Copy Text'; }, 2000);
      }).catch(err => {
        alert('Copied text:\n\n' + text);
      });
    });

    toolbar.querySelector('.btn-download-text').addEventListener('click', () => {
      const text = this.generatePlainText();
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kanban-tableau-${new Date().toISOString().slice(0, 10)}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  generatePlainText() {
    let lines = [];
    lines.push('========================================');
    lines.push('       PROJECT KANBAN TABLEAU');
    lines.push(`       Date: ${new Date().toLocaleDateString()}`);
    lines.push(`       Total Tasks: ${this.store.tasks.length}`);
    lines.push('========================================\n');

    this.store.columns.forEach(col => {
      const tasks = this.store.getTasksByColumn(col.id);
      lines.push(`## ${col.title.toUpperCase()} (${tasks.length})`);
      lines.push('----------------------------------------');

      if (tasks.length === 0) {
        lines.push('  (No tasks in this state)');
      } else {
        tasks.forEach(t => {
          let line = `- ${t.title} | Priority: ${t.priority}`;
          if (t.id) line += ` | ID: ${t.id}`;
          if (t.assignee) line += ` | Assignee: ${t.assignee}`;
          if (t.dueDate) line += ` | Due: ${t.dueDate}`;
          if (t.url) line += ` | URL: ${t.url}`;
          if (t.tags && t.tags.length) line += ` | Tags: ${t.tags.join(', ')}`;
          lines.push(line);
          if (t.description) {
            const descLines = t.description.split('\n');
            descLines.forEach(dl => {
              lines.push(`    ${dl}`);
            });
          }
        });
      }
      lines.push('');
    });

    return lines.join('\n');
  }

  parseAndApplyText(text) {
    try {
      const lines = text.split('\n');
      let currentColumnId = null;
      let newTasks = [];
      let currentTask = null;

      // Map column title to ID
      const colMap = {};
      this.store.columns.forEach(c => {
        colMap[c.title.toUpperCase()] = c.id;
        colMap[c.id.toUpperCase()] = c.id;
      });

      // Keep a reference to existing tasks to preserve ID, createdAt, and metadata
      const remainingExisting = Array.isArray(this.store.tasks) ? [...this.store.tasks] : [];

      for (let rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith('===') || line.startsWith('---')) continue;

        // Check for column header: ## COLUMN_NAME or ## COLUMN_NAME (count)
        if (line.startsWith('##')) {
          const rawColName = line.replace(/^##\s*/, '').replace(/\s*\(\d+\).*$/, '').trim().toUpperCase();
          currentColumnId = colMap[rawColName];
          if (!currentColumnId) {
            // Find fuzzy match
            const found = this.store.columns.find(c => c.title.toUpperCase().includes(rawColName));
            currentColumnId = found ? found.id : this.store.columns[0].id;
          }
          continue;
        }

        // Check for task bullet: - Task Title | ...
        if (line.startsWith('-') || line.startsWith('•') || line.startsWith('*')) {
          if (!currentColumnId) currentColumnId = this.store.columns[0].id;

          const content = line.replace(/^[-•*]\s*/, '');
          const parts = content.split('|').map(p => p.trim());
          const title = parts[0] || 'Untitled Task';

          let priority = 'medium';
          let assignee = '';
          let dueDate = '';
          let url = '';
          let tags = [];
          let parsedId = null;
          let parsedCreatedAt = null;

          for (let i = 1; i < parts.length; i++) {
            const p = parts[i];
            const lower = p.toLowerCase();
            if (lower.startsWith('priority:')) {
              priority = p.split(':')[1].trim().toLowerCase();
            } else if (lower.startsWith('id:')) {
              parsedId = p.substring(p.indexOf(':') + 1).replace(/[\[\]\(\)]/g, '').trim();
            } else if (lower.startsWith('created:')) {
              parsedCreatedAt = p.substring(p.indexOf(':') + 1).replace(/[\[\]\(\)]/g, '').trim();
            } else if (lower.startsWith('assignee:')) {
              assignee = p.split(':')[1].trim();
            } else if (lower.startsWith('due:')) {
              dueDate = p.split(':')[1].trim();
            } else if (lower.startsWith('url:')) {
              url = p.substring(p.indexOf(':') + 1).trim();
            } else if (lower.startsWith('tags:')) {
              tags = p.split(':')[1].split(',').map(s => s.trim().replace(/^#/, '')).filter(Boolean);
            }
          }

          // Match against existing tasks to guarantee createdAt is never modified on edits
          let matchedTask = null;
          if (parsedId) {
            const matchIdx = remainingExisting.findIndex(t => t && String(t.id) === String(parsedId));
            if (matchIdx !== -1) {
              matchedTask = remainingExisting.splice(matchIdx, 1)[0];
            }
          }
          if (!matchedTask && title) {
            const normTitle = title.trim().toLowerCase();
            const matchIdx = remainingExisting.findIndex(t => t && (t.title || '').trim().toLowerCase() === normTitle);
            if (matchIdx !== -1) {
              matchedTask = remainingExisting.splice(matchIdx, 1)[0];
            }
          }

          const now = new Date().toISOString();
          const targetPriority = ['urgent', 'high', 'medium', 'low'].includes(priority) ? priority : 'medium';

          if (matchedTask) {
            // Edit existing task: creation time MUST NOT be modified
            currentTask = {
              ...matchedTask,
              title: title || matchedTask.title || 'Untitled Task',
              description: '',
              columnId: currentColumnId,
              priority: targetPriority,
              dueDate: dueDate !== undefined ? dueDate : (matchedTask.dueDate || ''),
              assignee: assignee !== undefined ? assignee : (matchedTask.assignee || ''),
              tags: tags.length > 0 ? tags : (matchedTask.tags || []),
              url: url !== undefined ? url : (matchedTask.url || ''),
              createdAt: matchedTask.createdAt || parsedCreatedAt || now,
              updatedAt: now
            };
          } else {
            // Genuinely new task
            currentTask = {
              id: parsedId || ('task-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4)),
              title: title || 'Untitled Task',
              description: '',
              isMarkdown: false,
              columnId: currentColumnId,
              priority: targetPriority,
              dueDate,
              assignee,
              tags,
              url,
              createdAt: parsedCreatedAt || now,
              updatedAt: now,
              repeat: { type: 'none' },
              completionHistory: []
            };
          }
          newTasks.push(currentTask);
        } else if (currentTask && rawLine.startsWith('    ')) {
          // Description continuation line
          if (currentTask.description) {
            currentTask.description += '\n' + rawLine.trim();
          } else {
            currentTask.description = rawLine.trim();
          }
        }
      }

      if (newTasks.length > 0) {
        // Move any removed tasks to trash if they were deleted from the text
        if (remainingExisting.length > 0) {
          if (!this.store.trash) this.store.trash = [];
          const now = new Date().toISOString();
          remainingExisting.forEach(removedTask => {
            removedTask.deletedAt = now;
            this.store.trash = this.store.trash.filter(tr => tr.id !== removedTask.id);
            this.store.trash.unshift(removedTask);
          });
        }

        this.store.tasks = newTasks.map(t => this.store.normalizeTask(t));
        this.store.save();
        return true;
      }
      return false;
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('Error parsing plain text', e);
      }
      return false;
    }
  }

  setupKeyboardNavigation(outlineEl) {
    if (!outlineEl) return;
    outlineEl.addEventListener('keydown', (e) => {
      const activeItem = document.activeElement ? document.activeElement.closest('.text-task-item') : null;
      if (!activeItem) {
        if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
          const firstItem = outlineEl.querySelector('.text-task-item');
          if (firstItem) {
            e.preventDefault();
            firstItem.focus();
          }
        }
        return;
      }

      const items = Array.from(outlineEl.querySelectorAll('.text-task-item'));
      const idx = items.indexOf(activeItem);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (idx < items.length - 1) items[idx + 1].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (idx > 0) items[idx - 1].focus();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        activeItem.blur();
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

window.TextView = TextView;
