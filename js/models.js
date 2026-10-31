/**
 * Kanban Models & Store
 * Features Server-Hosted Data Store with offline-first localStorage fallback and multi-device polling sync.
 */

const STORAGE_KEY = 'universal_kanban_data_v1';
const API_BASE = '/api/board';

const TAG_PALETTE = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#14b8a6', // teal
  '#f97316', // orange
  '#6366f1', // indigo
  '#84cc16', // lime
  '#64748b'  // slate
];

const DEFAULT_COLUMNS = [
  { id: 'backlog', title: 'Backlog', color: '#64748b', icon: '📥', showInBoard: true },
  { id: 'in_progress', title: 'In Progress', color: '#3b82f6', icon: '⚡', showInBoard: true },
  { id: 'in_review', title: 'In Review', color: '#eab308', icon: '🔍', showInBoard: true },
  { id: 'done', title: 'Done', color: '#22c55e', icon: '✅', showInBoard: true },
  { id: 'pending', title: 'Pending', color: '#f59e0b', icon: '⏳', showInBoard: false },
  { id: 'archive', title: 'Archive', color: '#475569', icon: '📦', showInBoard: false },
  { id: 'abandoned', title: 'Abandoned', color: '#64748b', icon: '🚫', showInBoard: false }
];

const INITIAL_TASKS = [
  {
    id: 'task-server-1',
    title: 'Server-Hosted Persistent Data Store',
    description: 'Store all columns and tasks in centralized backend JSON datastore with RESTful API for multi-device sync.',
    columnId: 'done',
    priority: 'urgent',
    dueDate: '2026-10-16',
    assignee: 'Backend Team',
    tags: ['server', 'storage', 'rest-api'],
    createdAt: '2026-10-15T12:00:00.000Z',
    updatedAt: '2026-10-16T14:30:00.000Z'
  },
  {
    id: 'task-1',
    title: 'Pinch-to-zoom Whole Tableau Gesture',
    description: 'Implement multi-touch pinch gesture on mobile to scale the entire Kanban board so all columns fit on phone and iPad screens.',
    columnId: 'done',
    priority: 'urgent',
    dueDate: '2026-10-15',
    assignee: 'Mobile Team',
    tags: ['mobile', 'gestures', 'ux'],
    createdAt: '2026-10-15T12:00:00.000Z',
    updatedAt: '2026-10-16T14:30:00.000Z'
  },
  {
    id: 'task-2',
    title: 'Text-Only Accessible View & Outline Editor',
    description: 'Support pure text rendering of all tasks and states with 2-way sync so users can edit or copy plain-text task lists.',
    columnId: 'done',
    priority: 'high',
    dueDate: '2026-10-16',
    assignee: 'Frontend Team',
    tags: ['accessibility', 'text-only', 'markdown'],
    createdAt: '2026-10-15T12:00:00.000Z',
    updatedAt: '2026-10-16T14:30:00.000Z'
  },
  {
    id: 'task-3',
    title: 'Tabular List View with Real-time State Changes',
    description: 'Render responsive data table of all tasks with sorting, filtering, and instant dropdown state transitions.',
    columnId: 'done',
    priority: 'high',
    dueDate: '2026-10-17',
    assignee: 'Data Team',
    tags: ['table', 'filtering', 'views'],
    createdAt: '2026-10-15T12:00:00.000Z',
    updatedAt: '2026-10-16T14:30:00.000Z'
  },
  {
    id: 'task-4',
    title: 'Responsive Breakpoints for Phone and iPad',
    description: 'Ensure smooth layout transitions between mobile phone portrait, iPad/tablet horizontal, and widescreen desktop.',
    columnId: 'in_progress',
    priority: 'high',
    dueDate: '2026-10-18',
    assignee: 'UI Architect',
    tags: ['responsive', 'ipad', 'css'],
    createdAt: '2026-10-15T12:00:00.000Z',
    updatedAt: '2026-10-16T14:30:00.000Z'
  },
  {
    id: 'task-5',
    title: 'One-Tap "Fit Tableau" Overview Mode',
    description: 'Calculate optimal zoom scale based on viewport dimensions to fit all columns cleanly in viewport.',
    columnId: 'in_progress',
    priority: 'medium',
    dueDate: '2026-10-19',
    assignee: 'UX Lead',
    tags: ['ux', 'zoom', 'canvas'],
    createdAt: '2026-10-15T12:00:00.000Z',
    updatedAt: '2026-10-16T14:30:00.000Z'
  },
  {
    id: 'task-6',
    title: 'Multi-Device Background Sync & Polling',
    description: 'Auto-sync updates across phone, tablet, and desktop clients via server-hosted datastore polling.',
    columnId: 'in_progress',
    priority: 'medium',
    dueDate: '2026-10-20',
    assignee: 'Fullstack Lead',
    tags: ['sync', 'realtime'],
    createdAt: '2026-10-15T12:00:00.000Z',
    updatedAt: '2026-10-16T14:30:00.000Z'
  },
  {
    id: 'task-7',
    title: 'Dark / High-Contrast Mode Toggle',
    description: 'Provide eye-friendly dark mode and crisp high-contrast theme for low-light mobile environments.',
    columnId: 'backlog',
    priority: 'low',
    dueDate: '2026-10-22',
    assignee: 'Design',
    tags: ['theme', 'dark-mode'],
    createdAt: '2026-10-15T12:00:00.000Z',
    updatedAt: '2026-10-16T14:30:00.000Z'
  }
];

class KanbanStore {
  constructor() {
    this.columns = [];
    this.tasks = [];
    this.tags = {};
    this.favoriteTags = {};
    this.trash = [];
    this.listeners = [];
    this.syncListeners = [];

    // Multi-Database State
    this.currentDb = 'default';
    this.databases = ['default', 'sample'];
    try {
      if (typeof localStorage !== 'undefined') {
        const savedList = localStorage.getItem('kanban_database_list');
        if (savedList) {
          const parsed = JSON.parse(savedList);
          if (Array.isArray(parsed) && parsed.length > 0) {
            this.databases = Array.from(new Set(['default', 'sample', ...parsed]));
          }
        }
        const savedDb = localStorage.getItem('kanban_active_db');
        if (savedDb) this.currentDb = savedDb.toLowerCase().replace(/[^a-z0-9_\-]/g, '') || 'default';
        if (!this.databases.includes(this.currentDb)) {
          this.databases.push(this.currentDb);
        }
      }
    } catch (e) {}

    // Sync State
    this.syncStatus = 'connecting'; // 'connecting' | 'synced' | 'saving' | 'local' | 'error'
    this.serverAvailable = null;
    this.lastUpdatedAt = null;
    this.saveTimeout = null;
    this.isSaving = false;

    // Load fast from localStorage first
    this.loadFromLocalStorage(this.currentDb);

    // Then connect to server datastore
    this.initServerSync();
  }

  getStorageKey(dbName = this.currentDb) {
    const clean = (dbName || 'default').toLowerCase().replace(/[^a-z0-9_\-]/g, '') || 'default';
    return `kanban_board_${clean}`;
  }

  loadFromLocalStorage(dbName = this.currentDb) {
    const cleanDb = (dbName || 'default').toLowerCase().replace(/[^a-z0-9_\-]/g, '') || 'default';
    try {
      const key = this.getStorageKey(cleanDb);
      let saved = (typeof localStorage !== 'undefined') ? localStorage.getItem(key) : null;
      if (!saved && (cleanDb === 'default' || cleanDb === 'board') && typeof localStorage !== 'undefined') {
        saved = localStorage.getItem(STORAGE_KEY);
      }
      if (saved) {
        const parsed = JSON.parse(saved);
        this.columns = parsed.columns || DEFAULT_COLUMNS;
        if (!this.columns.some(c => c.id === 'pending')) {
          this.columns.push({ id: 'pending', title: 'Pending', color: '#f59e0b', icon: '⏳', showInBoard: false });
        }
        if (!this.columns.some(c => c.id === 'archive')) {
          this.columns.push({ id: 'archive', title: 'Archive', color: '#475569', icon: '📦', showInBoard: false });
        }
        if (!this.columns.some(c => c.id === 'abandoned')) {
          this.columns.push({ id: 'abandoned', title: 'Abandoned', color: '#64748b', icon: '🚫', showInBoard: false });
        }
        this.tasks = Array.isArray(parsed.tasks) ? parsed.tasks.map(t => this.normalizeTask(t)) : [];
        this.tags = parsed.tags || {};
        this.favoriteTags = parsed.favoriteTags || {};
        this.trash = Array.isArray(parsed.trash) ? parsed.trash.map(t => this.normalizeTask(t)) : [];
        this.purgeTrash(30);
        this.lastUpdatedAt = parsed.updatedAt || new Date().toISOString();
        return;
      }
    } catch (e) {
      console.warn('LocalStorage error, using defaults', e);
    }
    this.columns = [...DEFAULT_COLUMNS];
    this.tasks = (cleanDb === 'sample') ? INITIAL_TASKS.map(t => this.normalizeTask(t)) : [];
    this.tags = {};
    this.favoriteTags = {};
    this.trash = [];
    this.lastUpdatedAt = new Date().toISOString();
  }

  normalizeTask(task) {
    const now = new Date().toISOString();
    let existingCreatedAt = null;
    if (this.tasks && Array.isArray(this.tasks) && task && task.id) {
      const existing = this.tasks.find(t => t && t.id === task.id);
      if (existing && existing.createdAt) {
        existingCreatedAt = existing.createdAt;
      }
    }
    const createdAt = task.createdAt || existingCreatedAt || now;
    return {
      id: task.id || ('task-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4)),
      title: task.title ? task.title.trim() : 'Untitled Task',
      description: task.description ? task.description.trim() : '',
      isMarkdown: Boolean(task.isMarkdown),
      columnId: task.columnId || (this.columns[0] ? this.columns[0].id : 'backlog'),
      priority: task.priority || 'medium',
      dueDate: task.dueDate || '',
      assignee: task.assignee ? task.assignee.trim() : '',
      tags: Array.isArray(task.tags) ? task.tags : (task.tags ? task.tags.split(',').map(s => s.trim()).filter(Boolean) : []),
      url: task.url ? task.url.trim() : '',
      createdAt: createdAt,
      updatedAt: task.updatedAt || createdAt,
      completedAt: task.completedAt || null,
      abandonedAt: task.abandonedAt || null,
      deletedAt: task.deletedAt || null,
      repeat: typeof task.repeat === 'object' && task.repeat ? task.repeat : { type: (typeof task.repeat === 'string' ? task.repeat : 'none') },
      completionHistory: Array.isArray(task.completionHistory) ? [...task.completionHistory].sort() : []
    };
  }

  saveToLocalStorage() {
    try {
      if (typeof localStorage === 'undefined') return;
      const cleanDb = (this.currentDb || 'default').toLowerCase().replace(/[^a-z0-9_\-]/g, '') || 'default';
      const key = this.getStorageKey(cleanDb);
      const data = {
        version: 1,
        database: cleanDb,
        columns: this.columns,
        tasks: this.tasks,
        tags: this.tags,
        favoriteTags: this.favoriteTags,
        trash: this.trash,
        updatedAt: this.lastUpdatedAt
      };
      localStorage.setItem(key, JSON.stringify(data));
      if (cleanDb === 'default' || cleanDb === 'board') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      }
    } catch (e) {
      console.error('LocalStorage save error', e);
    }
  }

  getApiEndpoint(customPath = '/api/board', includeDb = true) {
    let base = customPath;
    if (typeof window !== 'undefined' && window.location) {
      if (!window.location.protocol.startsWith('http')) {
        base = `http://localhost:8080${customPath}`;
      }
    } else {
      base = `http://localhost:8080${customPath}`;
    }
    if (includeDb && this.currentDb) {
      const sep = base.includes('?') ? '&' : '?';
      return `${base}${sep}db=${encodeURIComponent(this.currentDb)}`;
    }
    return base;
  }

  async initServerSync() {
    console.log('[Kanban Datastore] Initializing server datastore sync...');
    await this.fetchFromServer();
    await this.listDatabases();
    this.notify();

    // Periodically poll server every 12 seconds to detect changes from other devices
    if (typeof window !== 'undefined') {
      setInterval(() => {
        if (this.serverAvailable) {
          this.pollServerUpdates();
        }
      }, 12000);

      window.addEventListener('focus', () => {
        if (this.serverAvailable) {
          this.pollServerUpdates();
        }
      });
    }
  }

  async fetchFromServer() {
    const endpoint = this.getApiEndpoint();
    this.setSyncStatus('connecting', 'Connecting to Server...');

    // Use AbortController to guarantee fetch never hangs if server is offline
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 15000) : null;

    try {
      console.log('[Kanban Datastore] Fetching from endpoint:', endpoint);
      const res = await fetch(endpoint, {
        headers: { 'Accept': 'application/json' },
        cache: 'no-cache',
        signal: controller ? controller.signal : undefined
      });

      if (timeoutId) clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status} (${res.statusText})`);
      }

      const data = await res.json();
      if (data && Array.isArray(data.tasks)) {
        const resDb = (data.database || 'default').toLowerCase().replace(/[^a-z0-9_\-]/g, '') || 'default';
        const expectedDb = (this.currentDb || 'default').toLowerCase().replace(/[^a-z0-9_\-]/g, '') || 'default';
        const normalizeDb = d => (d === 'board' ? 'default' : d);
        if (normalizeDb(resDb) !== normalizeDb(expectedDb)) {
          console.warn(`[Kanban Datastore] Ignoring mismatched server payload for [${resDb}], expected [${expectedDb}]`);
          return false;
        }
        this.columns = data.columns || this.columns;
        if (!this.columns.some(c => c.id === 'pending')) {
          this.columns.push({ id: 'pending', title: 'Pending', color: '#f59e0b', icon: '⏳', showInBoard: false });
        }
        if (!this.columns.some(c => c.id === 'archive')) {
          this.columns.push({ id: 'archive', title: 'Archive', color: '#475569', icon: '📦', showInBoard: false });
        }
        if (!this.columns.some(c => c.id === 'abandoned')) {
          this.columns.push({ id: 'abandoned', title: 'Abandoned', color: '#64748b', icon: '🚫', showInBoard: false });
        }
        this.trash = Array.isArray(data.trash) ? data.trash.map(t => this.normalizeTask(t)) : [];
        this.purgeTrash(30);

        // Protect deleted tasks in trash from resurrecting
        const trashIds = new Set(this.trash.map(t => t.id));
        this.tasks = data.tasks
          .filter(t => !trashIds.has(t.id))
          .map(t => this.normalizeTask(t));
        this.tags = (data.tags && typeof data.tags === 'object') ? data.tags : {};
        this.favoriteTags = (data.favoriteTags && typeof data.favoriteTags === 'object') ? data.favoriteTags : {};
        this.lastUpdatedAt = data.updatedAt || new Date().toISOString();
        this.serverAvailable = true;
        this.saveToLocalStorage();
        this.setSyncStatus('synced', 'Server Datastore Synced 🟢');
        this.notify();
        console.log(`[Kanban Datastore] Successfully loaded ${data.tasks.length} tasks from server for [${this.currentDb}].`);
        return true;
      } else {
        throw new Error('Invalid JSON datastore format received from server');
      }
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId);
      const isTimeout = err.name === 'AbortError';
      const reason = isTimeout ? 'Connection timed out' : err.message;
      console.warn(`[Kanban Datastore] Server unavailable (${reason}). Operating in Local Storage Mode.`);

      this.serverAvailable = false;
      this.setSyncStatus('local', 'Local Storage Mode 🟡');
    }
    return false;
  }

  async pollServerUpdates() {
    // Prevent polling if a local save is currently scheduled or in-flight
    if (this.isSaving || this.saveTimeout !== null) {
      return;
    }
    const endpoint = this.getApiEndpoint();
    try {
      const res = await fetch(endpoint, { cache: 'no-cache' });
      if (!res.ok) return;
      const data = await res.json();

      // Guard again against concurrent local save while fetching
      if (this.isSaving || this.saveTimeout !== null) {
        return;
      }

      const resDb = (data.database || 'default').toLowerCase().replace(/[^a-z0-9_\-]/g, '') || 'default';
      const expectedDb = (this.currentDb || 'default').toLowerCase().replace(/[^a-z0-9_\-]/g, '') || 'default';
      const normalizeDb = d => (d === 'board' ? 'default' : d);
      if (normalizeDb(resDb) !== normalizeDb(expectedDb)) {
        return;
      }

      if (data.updatedAt && data.updatedAt !== this.lastUpdatedAt) {
        if (Array.isArray(data.tasks)) {
          this.columns = data.columns || this.columns;
        if (!this.columns.some(c => c.id === 'pending')) {
          this.columns.push({ id: 'pending', title: 'Pending', color: '#f59e0b', icon: '⏳', showInBoard: false });
        }
        if (!this.columns.some(c => c.id === 'archive')) {
          this.columns.push({ id: 'archive', title: 'Archive', color: '#475569', icon: '📦', showInBoard: false });
        }
        if (!this.columns.some(c => c.id === 'abandoned')) {
          this.columns.push({ id: 'abandoned', title: 'Abandoned', color: '#64748b', icon: '🚫', showInBoard: false });
        }
          this.trash = Array.isArray(data.trash) ? data.trash.map(t => this.normalizeTask(t)) : [];
          this.purgeTrash(30);

          // Protect deleted tasks in trash from resurrecting
          const trashIds = new Set(this.trash.map(t => t.id));
          this.tasks = data.tasks
            .filter(t => !trashIds.has(t.id))
            .map(t => this.normalizeTask(t));

          this.tags = (data.tags && typeof data.tags === 'object') ? data.tags : {};
          this.favoriteTags = (data.favoriteTags && typeof data.favoriteTags === 'object') ? data.favoriteTags : {};
          this.lastUpdatedAt = data.updatedAt;
          this.saveToLocalStorage();
          this.setSyncStatus('synced', 'Synced with Server 🟢');
          this.notify();
          console.log('[Kanban Datastore] Pulled remote update from server.');
        }
      }
    } catch (e) {
      // Silent poll fail
    }
  }

  save(immediate = false) {
    this.lastUpdatedAt = new Date().toISOString();
    // Instant local save
    this.saveToLocalStorage();
    this.notify();

    // Server-hosted sync
    if (this.serverAvailable !== false) {
      if (immediate) {
        if (typeof clearTimeout !== 'undefined' && this.saveTimeout !== null) {
          clearTimeout(this.saveTimeout);
          this.saveTimeout = null;
        }
        this.pushToServer();
      } else {
        this.scheduleServerSave();
      }
    }
  }

  scheduleServerSave() {
    this.setSyncStatus('saving', 'Saving to Server... 🔄');
    if (this.saveTimeout !== null) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    const targetDb = this.currentDb || 'default';
    const snapshot = {
      database: targetDb,
      columns: JSON.parse(JSON.stringify(this.columns)),
      tasks: JSON.parse(JSON.stringify(this.tasks)),
      tags: JSON.parse(JSON.stringify(this.tags)),
      favoriteTags: JSON.parse(JSON.stringify(this.favoriteTags)),
      trash: JSON.parse(JSON.stringify(this.trash))
    };
    this.saveTimeout = setTimeout(async () => {
      this.saveTimeout = null;
      await this.pushToServer(targetDb, snapshot);
    }, 300);
  }

  async pushToServer(dbToSave = this.currentDb, snapshotData = null) {
    if (this.saveTimeout !== null) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    this.isSaving = true;

    const targetDb = (dbToSave || this.currentDb || 'default').toLowerCase().replace(/[^a-z0-9_\-]/g, '') || 'default';
    const endpoint = this.getApiEndpoint('/api/board', false) + `?db=${encodeURIComponent(targetDb)}`;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 30000) : null;

    try {
      let payload;
      if (snapshotData) {
        payload = {
          database: targetDb,
          columns: snapshotData.columns || this.columns,
          tasks: snapshotData.tasks || [],
          tags: snapshotData.tags || {},
          favoriteTags: snapshotData.favoriteTags || {},
          trash: snapshotData.trash || []
        };
      } else if (targetDb === (this.currentDb || 'default')) {
        payload = {
          database: targetDb,
          columns: JSON.parse(JSON.stringify(this.columns)),
          tasks: JSON.parse(JSON.stringify(this.tasks)),
          tags: JSON.parse(JSON.stringify(this.tags)),
          favoriteTags: JSON.parse(JSON.stringify(this.favoriteTags)),
          trash: JSON.parse(JSON.stringify(this.trash))
        };
      } else {
        const storageKey = this.getStorageKey(targetDb);
        let stored = (typeof localStorage !== 'undefined') ? localStorage.getItem(storageKey) : null;
        if (!stored && (targetDb === 'default' || targetDb === 'board') && typeof localStorage !== 'undefined') {
          stored = localStorage.getItem(STORAGE_KEY);
        }
        if (stored) {
          const parsed = JSON.parse(stored);
          payload = {
            database: targetDb,
            columns: parsed.columns || this.columns,
            tasks: parsed.tasks || [],
            tags: parsed.tags || {},
            favoriteTags: parsed.favoriteTags || {},
            trash: parsed.trash || []
          };
        } else {
          console.warn(`[Kanban Datastore] Skipping pushToServer for mismatched DB [${targetDb}] with no local data`);
          this.isSaving = false;
          if (timeoutId) clearTimeout(timeoutId);
          return;
        }
      }

      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller ? controller.signal : undefined
      });

      if (timeoutId) clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
      const result = await res.json();
      if (result.updatedAt) {
        this.lastUpdatedAt = result.updatedAt;
      }
      this.isSaving = false;
      this.serverAvailable = true;
      this.setSyncStatus('synced', 'Saved to Server 🟢');
    } catch (e) {
      if (timeoutId) clearTimeout(timeoutId);
      this.isSaving = false;
      console.warn('[Kanban Datastore] Server save failed, saved to local storage:', e.message);
      this.serverAvailable = false;
      this.setSyncStatus('local', 'Local Storage Mode 🟡');
    }
  }

  setSyncStatus(status, message) {
    this.syncStatus = status;
    this.syncMessage = message || this.getSyncMessage();
    this.syncListeners.forEach(fn => fn(this.syncStatus, this.syncMessage));
  }

  onSyncChange(fn) {
    this.syncListeners.push(fn);
    fn(this.syncStatus, this.syncMessage || this.getSyncMessage());
  }

  getSyncMessage() {
    switch (this.syncStatus) {
      case 'synced': return 'Server Datastore Synced 🟢';
      case 'saving': return 'Saving to Server... 🔄';
      case 'connecting': return 'Connecting to Server...';
      case 'local': return 'Local Storage Mode 🟡';
      case 'error': return 'Server Sync Error ⚠️';
      default: return '';
    }
  }

  async resetToDefaults() {
    this.columns = JSON.parse(JSON.stringify(DEFAULT_COLUMNS));
    this.tasks = JSON.parse(JSON.stringify(INITIAL_TASKS)).map(t => this.normalizeTask(t));
    this.save();

    if (this.serverAvailable && window.location.protocol.startsWith('http')) {
      try {
        await fetch('/api/reset', { method: 'POST' });
      } catch (e) {
        // ignore
      }
    }
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notify() {
    this.listeners.forEach(fn => fn(this));
  }

  getTasksByColumn(columnId) {
    return this.tasks.filter(t => t.columnId === columnId);
  }

  getTask(id) {
    return this.tasks.find(t => t.id === id);
  }

  addTask(taskData) {
    const now = new Date().toISOString();
    const newTask = {
      id: taskData.id || ('task-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4)),
      title: taskData.title ? taskData.title.trim() : 'Untitled Task',
      description: taskData.description ? taskData.description.trim() : '',
      isMarkdown: Boolean(taskData.isMarkdown),
      columnId: taskData.columnId || (this.columns[0] ? this.columns[0].id : 'backlog'),
      priority: taskData.priority || 'medium',
      dueDate: taskData.dueDate || '',
      assignee: taskData.assignee ? taskData.assignee.trim() : '',
      tags: Array.isArray(taskData.tags) ? taskData.tags : (taskData.tags ? taskData.tags.split(',').map(s => s.trim()).filter(Boolean) : []),
      url: taskData.url ? taskData.url.trim() : '',
      createdAt: taskData.createdAt || now,
      updatedAt: taskData.updatedAt || now,
      repeat: typeof taskData.repeat === 'object' && taskData.repeat ? taskData.repeat : { type: (typeof taskData.repeat === 'string' ? taskData.repeat : 'none') },
      completionHistory: Array.isArray(taskData.completionHistory) ? [...taskData.completionHistory].sort() : []
    };
    this.tasks.push(newTask);
    this.save();
    return newTask;
  }

  updateTask(id, updates) {
    const index = this.tasks.findIndex(t => t.id === id);
    if (index === -1) return null;
    
    // Explicitly protect createdAt: creation time must NEVER be modified through any edit action
    const originalCreatedAt = this.tasks[index].createdAt || new Date().toISOString();
    delete updates.createdAt;

    const currentTask = this.tasks[index];
    const isRepeating = (updates.repeat && updates.repeat.type && updates.repeat.type !== 'none') ||
      (!updates.repeat && currentTask.repeat && currentTask.repeat.type && currentTask.repeat.type !== 'none');

    if (updates.columnId === 'done') {
      const today = new Date().toISOString().slice(0, 10);
      let history = Array.isArray(updates.completionHistory)
        ? updates.completionHistory
        : (Array.isArray(currentTask.completionHistory) ? [...currentTask.completionHistory] : []);
      if (!history.includes(today)) {
        history.push(today);
      }
      history.sort();
      updates.completionHistory = history;
      updates.completedAt = updates.completedAt || currentTask.completedAt || new Date().toISOString();

      if (isRepeating) {
        const repConfig = updates.repeat || currentTask.repeat;
        const dueRef = updates.dueDate !== undefined ? updates.dueDate : currentTask.dueDate;
        const nextDue = this.computeNextDueDate(repConfig, dueRef);
        updates.dueDate = nextDue;
        updates.columnId = 'pending'; // Resurrect back into Pending!
        if (typeof window !== 'undefined' && window.kanbanApp && window.kanbanApp.showNotification) {
          window.kanbanApp.showNotification(`🔁 Recurring task completed! Resurrected into Pending with next due date: ${nextDue}`);
        }
      }
    } else if (updates.columnId && updates.columnId !== 'done' && currentTask.columnId === 'done') {
      updates.completedAt = null;
    }

    if (updates.columnId === 'abandoned') {
      updates.abandonedAt = updates.abandonedAt || currentTask.abandonedAt || new Date().toISOString();
    } else if (updates.columnId && updates.columnId !== 'abandoned' && currentTask.columnId === 'abandoned') {
      updates.abandonedAt = null;
    }

    if (typeof updates.tags === 'string') {
      updates.tags = updates.tags.split(',').map(s => s.trim()).filter(Boolean);
    }
    if (updates.url !== undefined) {
      updates.url = updates.url ? updates.url.trim() : '';
    }
    if (updates.repeat !== undefined) {
      updates.repeat = typeof updates.repeat === 'object' && updates.repeat ? updates.repeat : { type: (typeof updates.repeat === 'string' ? updates.repeat : 'none') };
    }
    if (updates.completionHistory !== undefined && Array.isArray(updates.completionHistory)) {
      updates.completionHistory = [...updates.completionHistory].sort();
    }
    updates.updatedAt = new Date().toISOString();

    this.tasks[index] = { ...this.tasks[index], ...updates, createdAt: originalCreatedAt };
    this.save();
    return this.tasks[index];
  }

  getTaskCompletionDate(task) {
    if (!task) return null;
    if (task.completedAt) {
      return String(task.completedAt).slice(0, 10);
    }
    if (Array.isArray(task.completionHistory) && task.completionHistory.length > 0) {
      const valid = task.completionHistory.filter(Boolean).sort();
      if (valid.length > 0) return valid[valid.length - 1];
    }
    if ((task.columnId === 'done' || task.columnId === 'archive') && task.updatedAt) {
      return String(task.updatedAt).slice(0, 10);
    }
    return null;
  }

  getTaskAbandonedDate(task) {
    if (!task) return null;
    if (task.abandonedAt) {
      return String(task.abandonedAt).slice(0, 10);
    }
    if (task.columnId === 'abandoned' && task.updatedAt) {
      return String(task.updatedAt).slice(0, 10);
    }
    return null;
  }

  computeNextDueDate(repeat, currentDueDate) {
    const todayStr = new Date().toISOString().slice(0, 10);
    let base = currentDueDate ? new Date(currentDueDate + 'T00:00:00') : new Date();
    if (isNaN(base.getTime())) base = new Date();

    const next = new Date(base.getTime());
    const repeatType = (typeof repeat === 'object' ? repeat.type : repeat) || 'weekly';

    if (repeatType === 'weekly') {
      next.setDate(next.getDate() + 7);
      while (next.toISOString().slice(0, 10) <= todayStr) {
        next.setDate(next.getDate() + 7);
      }
    } else if (repeatType === 'monthly') {
      next.setMonth(next.getMonth() + 1);
      while (next.toISOString().slice(0, 10) <= todayStr) {
        next.setMonth(next.getMonth() + 1);
      }
    } else if (repeatType === 'annually') {
      next.setFullYear(next.getFullYear() + 1);
      while (next.toISOString().slice(0, 10) <= todayStr) {
        next.setFullYear(next.getFullYear() + 1);
      }
    }
    return next.toISOString().slice(0, 10);
  }

  moveTask(id, targetColumnId, newIndex = null) {
    const taskIndex = this.tasks.findIndex(t => t.id === id);
    if (taskIndex === -1) return;
    const task = this.tasks[taskIndex];

    // Recurring task completion check: auto-save completion history & resurrect with next due date into Pending!
    if (targetColumnId === 'done' && task.repeat && task.repeat.type && task.repeat.type !== 'none') {
      const today = new Date().toISOString().slice(0, 10);
      if (!Array.isArray(task.completionHistory)) task.completionHistory = [];
      if (!task.completionHistory.includes(today)) {
        task.completionHistory.push(today);
      }
      task.completionHistory.sort();
      task.completedAt = new Date().toISOString();

      const nextDue = this.computeNextDueDate(task.repeat, task.dueDate);
      task.dueDate = nextDue;
      task.columnId = 'pending'; // Resurrect back into Pending!
      task.updatedAt = new Date().toISOString();

      if (typeof window !== 'undefined' && window.kanbanApp && window.kanbanApp.showNotification) {
        window.kanbanApp.showNotification(`🔁 Recurring task completed! Resurrected into Pending with next due date: ${nextDue}`);
      }
    } else {
      if (targetColumnId === 'done') {
        const today = new Date().toISOString().slice(0, 10);
        task.completedAt = task.completedAt || new Date().toISOString();
        if (!Array.isArray(task.completionHistory)) task.completionHistory = [];
        if (!task.completionHistory.includes(today)) {
          task.completionHistory.push(today);
        }
        task.completionHistory.sort();
      } else if (task.columnId === 'done' && targetColumnId !== 'done') {
        task.completedAt = null;
      }
      if (targetColumnId === 'abandoned') {
        task.abandonedAt = task.abandonedAt || new Date().toISOString();
      } else if (task.columnId === 'abandoned' && targetColumnId !== 'abandoned') {
        task.abandonedAt = null;
      }
      task.columnId = targetColumnId;
      task.updatedAt = new Date().toISOString();
    }

    if (newIndex !== null) {
      this.tasks.splice(taskIndex, 1);
      const otherTargetTasks = this.tasks.filter(t => t.columnId === targetColumnId);
      const insertBeforeTask = otherTargetTasks[newIndex];
      if (insertBeforeTask) {
        const destIndex = this.tasks.indexOf(insertBeforeTask);
        this.tasks.splice(destIndex, 0, task);
      } else {
        this.tasks.push(task);
      }
    }
    this.save();
  }

  deleteTask(id) {
    const taskIndex = this.tasks.findIndex(t => t.id === id);
    if (taskIndex !== -1) {
      const task = this.tasks[taskIndex];
      this.tasks.splice(taskIndex, 1);
      task.deletedAt = new Date().toISOString();
      if (!this.trash) this.trash = [];
      this.trash = this.trash.filter(t => t.id !== id);
      this.trash.unshift(task);
      this.save(true);
      return task;
    }
    return null;
  }

  restoreTask(id) {
    if (!this.trash) return null;
    const trashIndex = this.trash.findIndex(t => t.id === id);
    if (trashIndex === -1) return null;

    const task = this.trash.splice(trashIndex, 1)[0];
    delete task.deletedAt;
    task.updatedAt = new Date().toISOString();
    
    // Verify target column exists, else fallback to first column
    if (!this.columns.some(c => c.id === task.columnId)) {
      task.columnId = this.columns[0] ? this.columns[0].id : 'backlog';
    }

    this.tasks.push(task);
    this.save(true);
    return task;
  }

  permanentlyDeleteTask(id) {
    if (!this.trash) return;
    this.trash = this.trash.filter(t => t.id !== id);
    this.save(true);
  }

  emptyTrash() {
    this.trash = [];
    this.save();
  }

  purgeTrash(maxAgeDays = 30) {
    if (!this.trash || !this.trash.length) return 0;
    const cutoff = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
    const initialLen = this.trash.length;
    this.trash = this.trash.filter(t => {
      if (!t.deletedAt) return true;
      return new Date(t.deletedAt).getTime() > cutoff;
    });
    return initialLen - this.trash.length;
  }

  getTagColor(tag) {
    if (!tag) return '#3b82f6';
    const rawTag = tag.replace(/^#/, '').trim();
    if (!rawTag) return '#3b82f6';
    const cleanLower = rawTag.toLowerCase();

    if (this.tags) {
      if (this.tags[rawTag]) return this.tags[rawTag];
      const existingKey = Object.keys(this.tags).find(k => k.toLowerCase() === cleanLower);
      if (existingKey) return this.tags[existingKey];
    }

    // Deterministic palette selection
    let hash = 0;
    for (let i = 0; i < cleanLower.length; i++) {
      hash = cleanLower.charCodeAt(i) + ((hash << 5) - hash);
    }
    const color = TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length];
    if (!this.tags) this.tags = {};
    this.tags[rawTag] = color;
    return color;
  }

  setTagColor(tag, color) {
    if (!tag || !color) return;
    const rawTag = tag.replace(/^#/, '').trim();
    const cleanLower = rawTag.toLowerCase();
    if (!this.tags) this.tags = {};
    const existingKey = Object.keys(this.tags).find(k => k.toLowerCase() === cleanLower) || rawTag;
    this.tags[existingKey] = color;
    this.save();
  }

  renameTag(oldName, newName) {
    if (!oldName || !newName) return;
    const rawOld = oldName.replace(/^#/, '').trim();
    const rawNew = newName.replace(/^#/, '').trim();
    const oldLower = rawOld.toLowerCase();
    const newLower = rawNew.toLowerCase();
    if (oldLower === newLower && rawOld === rawNew) return;

    if (!this.tags) this.tags = {};
    const existingOldKey = Object.keys(this.tags).find(k => k.toLowerCase() === oldLower) || rawOld;
    const color = this.tags[existingOldKey] || this.getTagColor(rawOld);
    delete this.tags[existingOldKey];
    this.tags[rawNew] = color;

    // Rename across all tasks
    this.tasks.forEach(task => {
      if (Array.isArray(task.tags)) {
        task.tags = task.tags.map(t => {
          return t.replace(/^#/, '').trim().toLowerCase() === oldLower ? rawNew : t;
        });
      }
    });

    if (this.favoriteTags) {
      const favKey = Object.keys(this.favoriteTags).find(k => k.toLowerCase() === oldLower);
      if (favKey) {
        delete this.favoriteTags[favKey];
        this.favoriteTags[rawNew] = true;
      }
    }

    this.save();
  }

  deleteTag(tag) {
    if (!tag) return;
    const cleanLower = tag.replace(/^#/, '').trim().toLowerCase();
    if (this.tags) {
      const keysToDelete = Object.keys(this.tags).filter(k => k.toLowerCase() === cleanLower);
      keysToDelete.forEach(k => delete this.tags[k]);
    }
    if (this.favoriteTags) {
      const favKeys = Object.keys(this.favoriteTags).filter(k => k.toLowerCase() === cleanLower);
      favKeys.forEach(k => delete this.favoriteTags[k]);
    }
    this.tasks.forEach(task => {
      if (Array.isArray(task.tags)) {
        task.tags = task.tags.filter(t => t.replace(/^#/, '').trim().toLowerCase() !== cleanLower);
      }
    });
    this.save(true);
  }

  isFavoriteTag(tag) {
    if (!tag || !this.favoriteTags) return false;
    const cleanLower = tag.replace(/^#/, '').trim().toLowerCase();
    return Object.keys(this.favoriteTags || {}).some(k => k.toLowerCase() === cleanLower && this.favoriteTags[k]);
  }

  toggleFavoriteTag(tag) {
    if (!tag) return false;
    const rawTag = tag.replace(/^#/, '').trim();
    const cleanLower = rawTag.toLowerCase();
    if (!this.favoriteTags) this.favoriteTags = {};
    const existingKey = Object.keys(this.favoriteTags).find(k => k.toLowerCase() === cleanLower);
    if (existingKey) {
      delete this.favoriteTags[existingKey];
      this.save();
      return false;
    } else {
      this.favoriteTags[rawTag] = true;
      this.save();
      return true;
    }
  }

  exportJson() {
    return JSON.stringify({
      version: 1,
      database: this.currentDb || 'default',
      exportedAt: new Date().toISOString(),
      columns: this.columns,
      tasks: this.tasks,
      tags: this.tags,
      favoriteTags: this.favoriteTags,
      trash: this.trash
    }, null, 2);
  }

  async switchDatabase(dbName, forceReload = false, skipPush = false) {
    if (!dbName) return;
    const cleanName = dbName.toLowerCase().replace(/[^a-z0-9_\-]/g, '') || 'default';
    if (this.currentDb === cleanName && !forceReload) return;

    // 1. Flush any pending saves for current database BEFORE switching pointers
    if (this.saveTimeout !== null) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }

    const prevDb = this.currentDb || 'default';
    // Only push previous DB if not skipping push and prevDb is an existing valid database
    if (!skipPush && prevDb !== cleanName && this.databases.includes(prevDb)) {
      this.saveToLocalStorage();
      const prevSnapshot = {
        database: prevDb,
        columns: JSON.parse(JSON.stringify(this.columns)),
        tasks: JSON.parse(JSON.stringify(this.tasks)),
        tags: JSON.parse(JSON.stringify(this.tags)),
        favoriteTags: JSON.parse(JSON.stringify(this.favoriteTags)),
        trash: JSON.parse(JSON.stringify(this.trash))
      };

      if (this.serverAvailable !== false && typeof fetch !== 'undefined') {
        this.pushToServer(prevDb, prevSnapshot).catch(e => console.warn(e));
      }
    }

    // 2. Switch currentDb pointer
    this.currentDb = cleanName;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('kanban_active_db', cleanName);
      }
    } catch (e) {}

    // 3. Load instantly from local storage for seamless transition
    this.loadFromLocalStorage(cleanName);
    this.notify();

    // 4. Pull database data from server if online
    if (this.serverAvailable !== false && typeof fetch !== 'undefined') {
      await this.fetchFromServer();
      this.notify();
    }
  }

  async createDatabase(dbName, copyFrom = 'none') {
    if (!dbName) return false;
    const cleanName = dbName.toLowerCase().replace(/[^a-z0-9_\-]/g, '');
    if (!cleanName || cleanName === 'default' || cleanName === 'board') return false;

    // 1. Flush any pending saves for current database before switching or creating
    if (this.saveTimeout !== null) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    this.saveToLocalStorage();
    const prevDb = this.currentDb || 'default';
    const prevSnapshot = {
      database: prevDb,
      columns: JSON.parse(JSON.stringify(this.columns)),
      tasks: JSON.parse(JSON.stringify(this.tasks)),
      tags: JSON.parse(JSON.stringify(this.tags)),
      favoriteTags: JSON.parse(JSON.stringify(this.favoriteTags)),
      trash: JSON.parse(JSON.stringify(this.trash))
    };
    if (this.serverAvailable !== false && typeof fetch !== 'undefined') {
      this.pushToServer(prevDb, prevSnapshot).catch(e => console.warn(e));
    }

    let initialColumns = (this.columns && this.columns.length > 0) ? JSON.parse(JSON.stringify(this.columns)) : JSON.parse(JSON.stringify(DEFAULT_COLUMNS));
    let initialTasks = [];
    let initialTags = {};
    let initialFavoriteTags = {};
    let initialTrash = [];

    const key = this.getStorageKey(cleanName);
    if (copyFrom && copyFrom !== 'none') {
      const cleanCopy = (copyFrom || '').toLowerCase().replace(/[^a-z0-9_\-]/g, '') || 'default';
      const sourceKey = this.getStorageKey(cleanCopy);
      let sourceSaved = (typeof localStorage !== 'undefined') ? localStorage.getItem(sourceKey) : null;
      if (!sourceSaved && (cleanCopy === 'default' || cleanCopy === 'board') && typeof localStorage !== 'undefined') {
        sourceSaved = localStorage.getItem(STORAGE_KEY);
      }
      if (sourceSaved) {
        try {
          const parsed = JSON.parse(sourceSaved);
          initialColumns = parsed.columns || initialColumns;
          initialTasks = Array.isArray(parsed.tasks) ? parsed.tasks.map(t => this.normalizeTask(t)) : [];
          initialTags = parsed.tags || {};
          initialFavoriteTags = parsed.favoriteTags || {};
          initialTrash = [];
        } catch (e) {}
      } else if (cleanCopy === this.currentDb) {
        initialColumns = JSON.parse(JSON.stringify(this.columns));
        initialTasks = this.tasks.map(t => this.normalizeTask(t));
        initialTags = { ...this.tags };
        initialFavoriteTags = { ...this.favoriteTags };
        initialTrash = [];
      }
    }

    const seedData = {
      version: 1,
      database: cleanName,
      columns: initialColumns,
      tasks: initialTasks,
      tags: initialTags,
      favoriteTags: initialFavoriteTags,
      trash: initialTrash,
      updatedAt: new Date().toISOString()
    };

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(key, JSON.stringify(seedData));
      } catch (e) {}
    }

    if (typeof fetch !== 'undefined') {
      try {
        const endpoint = this.getApiEndpoint('/api/databases', false);
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: cleanName, copyFrom: copyFrom || 'none' })
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.databases)) {
            this.databases = data.databases;
          }
        }
      } catch (e) {
        console.warn('Could not register database with server, continuing locally', e);
      }
    }

    if (!this.databases.includes(cleanName)) {
      this.databases.push(cleanName);
    }
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('kanban_database_list', JSON.stringify(this.databases));
      } catch (e) {}
    }

    // Set active state immediately in memory and notify
    this.currentDb = cleanName;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('kanban_active_db', cleanName);
      }
    } catch (e) {}

    this.columns = initialColumns;
    this.tasks = initialTasks;
    this.tags = initialTags;
    this.favoriteTags = initialFavoriteTags;
    this.trash = initialTrash;
    this.lastUpdatedAt = seedData.updatedAt;
    this.notify();

    // Push state to server to ensure empty seed is committed
    if (this.serverAvailable !== false && typeof fetch !== 'undefined') {
      await this.pushToServer(cleanName, seedData);
    }
    this.notify();

    return true;
  }

  async listDatabases() {
    try {
      const endpoint = this.getApiEndpoint('/api/databases', false);
      const res = await fetch(endpoint, { cache: 'no-cache' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.databases)) {
          this.databases = data.databases;
          if (typeof localStorage !== 'undefined') {
            try {
              localStorage.setItem('kanban_database_list', JSON.stringify(this.databases));
            } catch (e) {}
          }
          return this.databases;
        }
      }
    } catch (e) {
      // offline or unsupported
    }
    return this.databases;
  }

  async deleteDatabase(dbName) {
    const cleanName = (dbName || '').toLowerCase().replace(/[^a-z0-9_\-]/g, '');
    if (!cleanName || cleanName === 'default' || cleanName === 'board') return false;

    // 1. Cancel any pending saves immediately
    if (this.saveTimeout !== null) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }

    // 2. Remove from local databases array and local storage immediately
    this.databases = this.databases.filter(d => d !== cleanName);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(this.getStorageKey(cleanName));
        localStorage.setItem('kanban_database_list', JSON.stringify(this.databases));
      } catch (e) {}
    }

    // 3. Send DELETE request to server
    try {
      const endpoint = `${this.getApiEndpoint('/api/databases', false)}?name=${encodeURIComponent(cleanName)}`;
      const res = await fetch(endpoint, { method: 'DELETE' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.databases)) {
          this.databases = data.databases.filter(d => d !== cleanName);
          if (typeof localStorage !== 'undefined') {
            try {
              localStorage.setItem('kanban_database_list', JSON.stringify(this.databases));
            } catch (e) {}
          }
        }
      }
    } catch (e) {
      console.warn('Server error deleting database', e);
    }

    // 4. If currentDb was the deleted database, switch to default with skipPush = true!
    if (this.currentDb === cleanName) {
      await this.switchDatabase('default', true, true);
    }

    this.notify();
    return true;
  }

  async copyOrMoveTasksToDatabase(taskIds, targetDb, action = 'move') {
    if (!taskIds || taskIds.length === 0) {
      return { success: false, error: 'No tasks selected' };
    }
    const cleanTarget = (targetDb || '').toLowerCase().replace(/[^a-z0-9_\-]/g, '');
    const currentClean = (this.currentDb || 'default').toLowerCase().replace(/[^a-z0-9_\-]/g, '');
    if (!cleanTarget || cleanTarget === currentClean) {
      return { success: false, error: 'Destination database must be different from active database' };
    }

    const taskIdSet = new Set(taskIds);
    const tasksToTransfer = this.tasks.filter(t => taskIdSet.has(t.id));
    if (tasksToTransfer.length === 0) {
      return { success: false, error: 'Selected tasks not found in active database' };
    }

    // 1. Fetch or initialize target database data
    let targetData = null;

    // Check server first if available
    if (this.serverAvailable !== false && typeof fetch !== 'undefined') {
      try {
        const endpoint = `${this.getApiEndpoint('/api/board', false)}?db=${encodeURIComponent(cleanTarget)}`;
        const res = await fetch(endpoint, { cache: 'no-cache' });
        if (res.ok) {
          const json = await res.json();
          if (json && Array.isArray(json.tasks)) {
            targetData = json;
          }
        }
      } catch (e) {
        console.warn('Could not fetch target database from server, checking local storage', e);
      }
    }

    // Fallback to local storage
    if (!targetData && typeof localStorage !== 'undefined') {
      try {
        const key = this.getStorageKey(cleanTarget);
        let stored = localStorage.getItem(key);
        if (!stored && (cleanTarget === 'default' || cleanTarget === 'board')) {
          stored = localStorage.getItem(STORAGE_KEY);
        }
        if (stored) {
          targetData = JSON.parse(stored);
        }
      } catch (e) {}
    }

    // If still null, create empty target structure
    if (!targetData) {
      targetData = {
        version: 1,
        database: cleanTarget,
        columns: JSON.parse(JSON.stringify(this.columns && this.columns.length > 0 ? this.columns : DEFAULT_COLUMNS)),
        tasks: [],
        tags: {},
        favoriteTags: {},
        trash: [],
        updatedAt: new Date().toISOString()
      };
    }

    if (!Array.isArray(targetData.tasks)) targetData.tasks = [];
    if (!targetData.tags || typeof targetData.tags !== 'object') targetData.tags = {};
    if (!Array.isArray(targetData.columns) || targetData.columns.length === 0) {
      targetData.columns = JSON.parse(JSON.stringify(DEFAULT_COLUMNS));
    }

    if (!targetData.columns.some(c => c.id === 'pending')) {
      targetData.columns.push({ id: 'pending', title: 'Pending', color: '#f59e0b', icon: '⏳', showInBoard: false });
    }
    if (!targetData.columns.some(c => c.id === 'archive')) {
      targetData.columns.push({ id: 'archive', title: 'Archive', color: '#475569', icon: '📦', showInBoard: false });
    }
    if (!targetData.columns.some(c => c.id === 'abandoned')) {
      targetData.columns.push({ id: 'abandoned', title: 'Abandoned', color: '#64748b', icon: '🚫', showInBoard: false });
    }

    // Destination columns check
    const targetColIds = new Set(targetData.columns.map(c => c.id));
    const fallbackColId = targetData.columns[0].id || 'backlog';

    // 2. Clone/Prepare tasks for target
    const nowIso = new Date().toISOString();
    const existingTargetIds = new Set(targetData.tasks.map(t => t.id));

    tasksToTransfer.forEach(task => {
      const cloned = JSON.parse(JSON.stringify(task));
      if (action === 'copy') {
        cloned.id = `task-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        cloned.updatedAt = nowIso;
      } else {
        // Move: keep id unless collision
        if (existingTargetIds.has(cloned.id)) {
          cloned.id = `task-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        }
        cloned.updatedAt = nowIso;
      }

      // Column mapping
      if (!targetColIds.has(cloned.columnId)) {
        cloned.columnId = fallbackColId;
      }

      // Preserve tag colors into destination
      if (Array.isArray(cloned.tags)) {
        cloned.tags.forEach(tag => {
          if (!targetData.tags[tag]) {
            targetData.tags[tag] = this.getTagColor(tag);
          }
        });
      }

      targetData.tasks.push(cloned);
      existingTargetIds.add(cloned.id);
    });

    targetData.updatedAt = nowIso;

    // 3. Save target database to localStorage and server
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(this.getStorageKey(cleanTarget), JSON.stringify(targetData));
      } catch (e) {}
    }

    // Register cleanTarget in this.databases if not present
    if (!this.databases.includes(cleanTarget)) {
      this.databases.push(cleanTarget);
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('kanban_database_list', JSON.stringify(this.databases));
        } catch (e) {}
      }
    }

    if (this.serverAvailable !== false && typeof fetch !== 'undefined') {
      await this.pushToServer(cleanTarget, targetData);
    }

    // 4. If action is move, remove tasks from active database
    if (action === 'move') {
      this.tasks = this.tasks.filter(t => !taskIdSet.has(t.id));
      this.save(true);
    }

    this.notify();
    return {
      success: true,
      action,
      count: tasksToTransfer.length,
      targetDb: cleanTarget
    };
  }

  isRtmJson(data) {
    if (!data || typeof data !== 'object') return false;
    return (
      (data.config && Array.isArray(data.lists) && Array.isArray(data.tasks)) ||
      (Array.isArray(data.tasks) && data.tasks.some(t => t && t.series_id !== undefined && t.name !== undefined))
    );
  }

  convertRtmToKanban(rtmData) {
    if (!rtmData || !Array.isArray(rtmData.tasks)) {
      throw new Error('Invalid Remember The Milk JSON structure: missing tasks array');
    }

    // 1. Build lookup tables
    const listsById = {};
    let inboxListId = null;
    (rtmData.lists || []).forEach(l => {
      if (l && l.id) {
        listsById[String(l.id)] = l.name || 'List';
        if (String(l.name).toLowerCase() === 'inbox') {
          inboxListId = String(l.id);
        }
      }
    });

    const locationsById = {};
    (rtmData.locations || []).forEach(loc => {
      if (loc && loc.id) {
        locationsById[String(loc.id)] = loc.name || '';
      }
    });

    const notesBySeries = {};
    (rtmData.notes || []).forEach(n => {
      if (n && n.series_id) {
        const sid = String(n.series_id);
        if (!notesBySeries[sid]) notesBySeries[sid] = [];
        notesBySeries[sid].push(n);
      }
    });

    const tasksById = {};
    (rtmData.tasks || []).forEach(t => {
      if (t && t.id) {
        tasksById[String(t.id)] = t;
      }
    });

    // 2. Build Canonical Tag Name Registry to prevent duplicate lowercase copies of mixed-case tags
    // User requirement: "Remember The Milk JSON importer should not duplicate mixed case tags with lowercase copies."
    const canonicalTagByLower = new Map();
    const tagColorByLower = {};

    // A. Read RTM color definitions from rtmData.tags
    (rtmData.tags || []).forEach(t => {
      if (!t) return;
      const rawTag = (t.name || t.id || '').replace(/^#/, '').trim();
      if (!rawTag) return;
      const lower = rawTag.toLowerCase();
      canonicalTagByLower.set(lower, rawTag);
      if (t.background_color) {
        tagColorByLower[lower] = t.background_color;
      }
    });

    // Helper to register tags, preferring mixed-case versions over all-lowercase
    const registerTag = (raw) => {
      if (!raw) return;
      const clean = String(raw).replace(/^#/, '').trim();
      if (!clean) return;
      const lower = clean.toLowerCase();
      const existing = canonicalTagByLower.get(lower);
      if (!existing) {
        canonicalTagByLower.set(lower, clean);
      } else if (existing === lower && clean !== lower) {
        // Prefer mixed-case version (e.g. "3.Mind" over "3.mind")
        canonicalTagByLower.set(lower, clean);
      }
    };

    // B. Scan all tasks, custom lists, and locations to discover mixed-case tags
    (rtmData.tasks || []).forEach(t => {
      if (!t) return;
      (t.tags || []).forEach(registerTag);
      const listName = listsById[String(t.list_id)];
      if (listName && listName.toLowerCase() !== 'inbox' && listName.toLowerCase() !== 'sent') {
        registerTag(listName);
      }
      const locName = locationsById[String(t.location_id)];
      if (locName) registerTag(locName);
    });

    const getCanonicalTag = (raw) => {
      if (!raw) return '';
      const clean = String(raw).replace(/^#/, '').trim();
      if (!clean) return '';
      return canonicalTagByLower.get(clean.toLowerCase()) || clean;
    };

    // Build tagsMap with ONLY canonical names (never duplicate lowercase copies)
    const tagsMap = {};
    canonicalTagByLower.forEach((canonicalName, lower) => {
      const color = tagColorByLower[lower] || this.getTagColor(canonicalName);
      tagsMap[canonicalName] = color;
    });

    // 3. Process Tasks: Separate repeated tasks for consolidation vs non-repeated tasks
    const kanbanTasks = [];
    const trashTasks = [];

    const repeatGroups = new Map();
    const nonRepeatTasks = [];

    rtmData.tasks.forEach(t => {
      if (!t) return;
      if (t.repeat && String(t.repeat).trim().length > 0) {
        const nameKey = (t.name || 'Untitled').trim().toLowerCase();
        if (!repeatGroups.has(nameKey)) {
          repeatGroups.set(nameKey, []);
        }
        repeatGroups.get(nameKey).push(t);
      } else {
        nonRepeatTasks.push(t);
      }
    });

    // Helper to format date
    const formatDateYMD = (epochMs) => {
      if (!epochMs) return '';
      const d = new Date(Number(epochMs));
      if (isNaN(d.getTime())) return '';
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    // A. Process Consolidated Repeated Tasks
    // Requirement: Earliest creation timed instance is the basis; newer repeated tasks add their completion times.
    // Notes in newer repeated tasks have date stamps added in descending order by date.
    repeatGroups.forEach((instances, nameKey) => {
      if (!instances || instances.length === 0) return;

      // Sort instances ascending by date_created (earliest first)
      const sorted = [...instances].sort((a, b) => (Number(a.date_created) || 0) - (Number(b.date_created) || 0));
      const basis = sorted[0];
      const isBasisTrashed = Boolean(basis.date_trashed);

      // Collect all completion times from all instances
      const completionSet = new Set();
      sorted.forEach(inst => {
        if (inst.date_completed) {
          const dt = formatDateYMD(inst.date_completed);
          if (dt) completionSet.add(dt);
        }
      });
      const completionHistory = Array.from(completionSet).sort();

      // Collect all notes across all instances with timestamp
      const allNotes = [];
      const seenNoteIds = new Set();
      sorted.forEach(inst => {
        const seriesNotes = notesBySeries[String(inst.series_id)] || [];
        seriesNotes.forEach(n => {
          if (n && n.id && !seenNoteIds.has(String(n.id))) {
            seenNoteIds.add(String(n.id));
            const noteTime = Number(n.date_created || n.date_modified || inst.date_created || 0);
            const dateStr = formatDateYMD(noteTime) || 'Undated';
            allNotes.push({
              time: noteTime,
              dateStr,
              title: n.title ? n.title.trim() : '',
              content: n.content ? n.content.trim() : ''
            });
          }
        });
      });

      // Sort notes in descending order by date (newest first)
      allNotes.sort((a, b) => b.time - a.time);

      // Build merged description with date stamps
      const descParts = [];
      if (basis.parent_id && tasksById[String(basis.parent_id)]) {
        const parentTask = tasksById[String(basis.parent_id)];
        descParts.push(`> **Subtask of:** ${parentTask.name || 'Parent Task'}`);
      }
      allNotes.forEach(n => {
        const header = n.title ? `### [${n.dateStr}] ${n.title}` : `**[${n.dateStr}]**`;
        descParts.push(`${header}\n${n.content}`);
      });
      const description = descParts.join('\n\n---\n\n');

      // Check if any instance is currently active (not completed)
      const activeInst = sorted.find(inst => !inst.date_completed && !inst.date_trashed);
      let columnId = 'archive';
      let dueDate = '';
      let priority = 'low';

      if (activeInst) {
        const activeListName = listsById[String(activeInst.list_id)] || '';
        const isArchiveList = activeListName.toLowerCase().includes('archive');
        const isAbandonedList = activeListName.toLowerCase().includes('abandon');
        if (isAbandonedList) {
          columnId = 'abandoned';
        } else if (isArchiveList) {
          columnId = 'archive';
        } else {
          // Bugfix: Remember The Milk JSON importer should default incomplete tasks as state Pending
          columnId = 'pending';
        }

        dueDate = formatDateYMD(activeInst.date_due) || formatDateYMD(basis.date_due);
        const prioVal = activeInst.priority || basis.priority;
        if (prioVal === 'P1') priority = 'urgent';
        else if (prioVal === 'P2') priority = 'high';
        else if (prioVal === 'P3') priority = 'medium';
      } else {
        columnId = 'archive';
        dueDate = formatDateYMD(basis.date_due);
        if (basis.priority === 'P1') priority = 'urgent';
        else if (basis.priority === 'P2') priority = 'high';
        else if (basis.priority === 'P3') priority = 'medium';
      }

      // Collect tags from all instances so custom lists and locations are preserved
      const taskTagSet = new Set();
      sorted.forEach(inst => {
        (inst.tags || []).forEach(t => {
          const canonical = getCanonicalTag(t);
          if (canonical) taskTagSet.add(canonical);
        });
        const instListName = listsById[String(inst.list_id)] || '';
        if (instListName && instListName.toLowerCase() !== 'inbox' && instListName.toLowerCase() !== 'sent') {
          const canonical = getCanonicalTag(instListName);
          if (canonical) taskTagSet.add(canonical);
        }
        const locName = locationsById[String(inst.location_id)];
        if (locName) {
          const canonical = getCanonicalTag(locName);
          if (canonical) taskTagSet.add(canonical);
        }
      });
      const taskTags = Array.from(taskTagSet);

      // Determine recurrence pattern
      let repeat = { type: 'weekly' };
      const repStr = (activeInst && activeInst.repeat) || basis.repeat || '';
      if (repStr.includes('FREQ=WEEKLY')) repeat = { type: 'weekly' };
      else if (repStr.includes('FREQ=MONTHLY')) repeat = { type: 'monthly' };
      else if (repStr.includes('FREQ=YEARLY')) repeat = { type: 'annually' };
      else if (repStr.includes('FREQ=DAILY')) repeat = { type: 'weekly' };

      const now = new Date().toISOString();
      const createdAt = basis.date_created ? new Date(Number(basis.date_created)).toISOString() : now;
      const latestModified = sorted.reduce((max, inst) => Math.max(max, Number(inst.date_modified || 0)), Number(basis.date_modified || basis.date_created || 0));
      const updatedAt = latestModified ? new Date(latestModified).toISOString() : createdAt;
      const deletedAt = isBasisTrashed ? (basis.date_trashed ? new Date(Number(basis.date_trashed)).toISOString() : now) : null;

      const kTask = this.normalizeTask({
        id: `rtm_${basis.id}`,
        title: (basis.name || 'Untitled Task').trim(),
        description,
        isMarkdown: true,
        columnId,
        priority,
        dueDate,
        assignee: '',
        tags: taskTags,
        url: (basis.url || (activeInst && activeInst.url) || '').trim(),
        createdAt,
        updatedAt,
        deletedAt,
        repeat,
        completionHistory
      });

      if (basis.parent_id) {
        kTask.parentId = `rtm_${basis.parent_id}`;
      }

      if (isBasisTrashed) {
        trashTasks.push(kTask);
      } else {
        kanbanTasks.push(kTask);
      }
    });

    // B. Process Non-Repeated Tasks
    nonRepeatTasks.forEach(t => {
      if (!t) return;
      const isTrashed = Boolean(t.date_trashed);

      // Priority mapping
      let priority = 'low';
      if (t.priority === 'P1') priority = 'urgent';
      else if (t.priority === 'P2') priority = 'high';
      else if (t.priority === 'P3') priority = 'medium';

      // Status / Column mapping: completed tasks go to archive, incomplete tasks default to Pending
      const isCompleted = Boolean(t.date_completed);
      const listName = listsById[String(t.list_id)] || '';
      const isArchiveList = listName.toLowerCase().includes('archive');
      const isAbandonedList = listName.toLowerCase().includes('abandon');
      const isInboxList = String(t.list_id) === inboxListId || listName.toLowerCase() === 'inbox';

      let columnId = 'pending';
      if (isAbandonedList) {
        columnId = 'abandoned';
      } else if (isCompleted || isArchiveList) {
        columnId = 'archive';
      } else {
        // Bugfix: Remember The Milk JSON importer should default incomplete tasks as state Pending
        columnId = 'pending';
      }

      // Tags: user requirement: "custom lists should be preserved as tags", deduplicated with canonical casing
      const taskTagSet = new Set();
      (t.tags || []).forEach(tag => {
        const canonical = getCanonicalTag(tag);
        if (canonical) taskTagSet.add(canonical);
      });
      if (listName && !isInboxList && listName.toLowerCase() !== 'sent') {
        const canonical = getCanonicalTag(listName);
        if (canonical) taskTagSet.add(canonical);
      }
      const locName = locationsById[String(t.location_id)];
      if (locName) {
        const canonical = getCanonicalTag(locName);
        if (canonical) taskTagSet.add(canonical);
      }
      const taskTags = Array.from(taskTagSet);

      // Notes / Markdown Description & Parent Subtask reference
      const descParts = [];
      if (t.parent_id && tasksById[String(t.parent_id)]) {
        const parentTask = tasksById[String(t.parent_id)];
        descParts.push(`> **Subtask of:** ${parentTask.name || 'Parent Task'}`);
      }

      const seriesNotes = notesBySeries[String(t.series_id)] || [];
      seriesNotes.forEach(n => {
        if (n.title && n.title.trim()) {
          descParts.push(`### ${n.title.trim()}\n${n.content || ''}`);
        } else if (n.content && n.content.trim()) {
          descParts.push(n.content.trim());
        }
      });
      const description = descParts.join('\n\n---\n\n');

      // Due Date
      const dueDate = formatDateYMD(t.date_due);

      // Completion History
      const completionHistory = [];
      if (isCompleted && t.date_completed) {
        const dt = formatDateYMD(t.date_completed);
        if (dt) completionHistory.push(dt);
      }

      const repeat = { type: 'none' };

      // Timestamps
      const now = new Date().toISOString();
      const createdAt = t.date_created ? new Date(Number(t.date_created)).toISOString() : now;
      const updatedAt = t.date_modified ? new Date(Number(t.date_modified)).toISOString() : createdAt;
      const deletedAt = isTrashed ? (t.date_trashed ? new Date(Number(t.date_trashed)).toISOString() : now) : null;

      const kTask = this.normalizeTask({
        id: `rtm_${t.id}`,
        title: (t.name || 'Untitled Task').trim(),
        description,
        isMarkdown: true,
        columnId,
        priority,
        dueDate,
        assignee: '',
        tags: taskTags,
        url: (t.url || '').trim(),
        createdAt,
        updatedAt,
        deletedAt,
        repeat,
        completionHistory
      });

      if (t.parent_id) {
        kTask.parentId = `rtm_${t.parent_id}`;
      }

      if (isTrashed) {
        trashTasks.push(kTask);
      } else {
        kanbanTasks.push(kTask);
      }
    });

    return {
      columns: this.columns && this.columns.length > 0 ? this.columns : [...DEFAULT_COLUMNS],
      tasks: kanbanTasks,
      tags: tagsMap,
      trash: trashTasks
    };
  }

  importRtmJson(dataOrString, targetDbName = null) {
    try {
      // 1. Flush any pending saves to current database before switching or importing
      if (this.saveTimeout !== null) {
        clearTimeout(this.saveTimeout);
        this.saveTimeout = null;
      }
      this.saveToLocalStorage();
      const prevDb = this.currentDb || 'default';
      const prevSnapshot = {
        database: prevDb,
        columns: JSON.parse(JSON.stringify(this.columns)),
        tasks: JSON.parse(JSON.stringify(this.tasks)),
        tags: JSON.parse(JSON.stringify(this.tags)),
        favoriteTags: JSON.parse(JSON.stringify(this.favoriteTags)),
        trash: JSON.parse(JSON.stringify(this.trash))
      };
      if (this.serverAvailable !== false && typeof fetch !== 'undefined') {
        this.pushToServer(prevDb, prevSnapshot).catch(e => console.warn(e));
      }

      const cleanDb = (targetDbName || this.currentDb || 'default').toLowerCase().replace(/[^a-z0-9_\-]/g, '') || 'default';
      this.currentDb = cleanDb;
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem('kanban_active_db', cleanDb);
      } catch (e) {}

      if (!this.databases.includes(cleanDb)) {
        this.databases.push(cleanDb);
      }
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('kanban_database_list', JSON.stringify(this.databases));
        } catch (e) {}
      }

      const data = typeof dataOrString === 'string' ? JSON.parse(dataOrString) : dataOrString;
      const converted = this.convertRtmToKanban(data);
      if (converted && Array.isArray(converted.tasks)) {
        if (Array.isArray(converted.columns) && converted.columns.length > 0) {
          this.columns = converted.columns;
        } else {
          this.columns = JSON.parse(JSON.stringify(DEFAULT_COLUMNS));
        }
        this.tasks = converted.tasks.map(t => this.normalizeTask(t));
        // Isolate tags strictly to the imported database! Do NOT merge with old tags
        this.tags = (converted.tags && typeof converted.tags === 'object') ? { ...converted.tags } : {};
        this.favoriteTags = {};
        this.trash = Array.isArray(converted.trash) ? converted.trash.map(t => this.normalizeTask(t)) : [];
        this.lastUpdatedAt = new Date().toISOString();

        this.saveToLocalStorage();
        this.notify();

        let savePromise = null;
        if (this.serverAvailable !== false && typeof fetch !== 'undefined') {
          const importSnapshot = {
            database: cleanDb,
            columns: this.columns,
            tasks: this.tasks,
            tags: this.tags,
            favoriteTags: this.favoriteTags,
            trash: this.trash
          };
          savePromise = this.pushToServer(cleanDb, importSnapshot).catch(e => console.warn('RTM import server push error:', e));
          this.lastImportPromise = savePromise;
        }

        return { success: true, count: this.tasks.length, trashCount: this.trash.length, database: this.currentDb, savePromise };
      }
      return { success: false, error: 'Failed to convert Remember The Milk data' };
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) console.error('RTM Import error', e);
      return { success: false, error: e.message };
    }
  }

  importJson(jsonString, targetDbName = null) {
    try {
      // 1. Flush any pending saves to current database before switching or importing
      if (this.saveTimeout !== null) {
        clearTimeout(this.saveTimeout);
        this.saveTimeout = null;
      }
      this.saveToLocalStorage();
      const prevDb = this.currentDb || 'default';
      const prevSnapshot = {
        database: prevDb,
        columns: JSON.parse(JSON.stringify(this.columns)),
        tasks: JSON.parse(JSON.stringify(this.tasks)),
        tags: JSON.parse(JSON.stringify(this.tags)),
        favoriteTags: JSON.parse(JSON.stringify(this.favoriteTags)),
        trash: JSON.parse(JSON.stringify(this.trash))
      };
      if (this.serverAvailable !== false && typeof fetch !== 'undefined') {
        this.pushToServer(prevDb, prevSnapshot).catch(e => console.warn(e));
      }

      const cleanDb = (targetDbName || this.currentDb || 'default').toLowerCase().replace(/[^a-z0-9_\-]/g, '') || 'default';
      this.currentDb = cleanDb;
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem('kanban_active_db', cleanDb);
      } catch (e) {}

      if (!this.databases.includes(cleanDb)) {
        this.databases.push(cleanDb);
      }
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('kanban_database_list', JSON.stringify(this.databases));
        } catch (e) {}
      }

      const data = JSON.parse(jsonString);
      if (this.isRtmJson(data)) {
        const res = this.importRtmJson(data, cleanDb);
        return res && res.success;
      }
      if (Array.isArray(data.tasks)) {
        if (Array.isArray(data.columns) && data.columns.length > 0) {
          this.columns = data.columns;
        } else {
          this.columns = JSON.parse(JSON.stringify(DEFAULT_COLUMNS));
        }
        this.tasks = data.tasks.map(t => this.normalizeTask(t));
        this.tags = (data.tags && typeof data.tags === 'object') ? { ...data.tags } : {};
        this.favoriteTags = (data.favoriteTags && typeof data.favoriteTags === 'object') ? { ...data.favoriteTags } : {};
        this.trash = Array.isArray(data.trash) ? data.trash.map(t => this.normalizeTask(t)) : [];
        this.lastUpdatedAt = data.updatedAt || new Date().toISOString();

        this.saveToLocalStorage();
        this.notify();

        let savePromise = null;
        if (this.serverAvailable !== false && typeof fetch !== 'undefined') {
          const importSnapshot = {
            database: cleanDb,
            columns: this.columns,
            tasks: this.tasks,
            tags: this.tags,
            favoriteTags: this.favoriteTags,
            trash: this.trash
          };
          savePromise = this.pushToServer(cleanDb, importSnapshot).catch(e => console.warn('JSON import server push error:', e));
          this.lastImportPromise = savePromise;
        }
        return true;
      }
      return false;
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) console.error('Import error', e);
      return false;
    }
  }
}

// Markdown Rendering Utility
function renderMarkdown(md) {
  if (!md) return '';
  var html = String(md)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  // Code blocks: ```code```
  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

  // Inline code: `code`
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headings: #, ##, ###
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // Bold & Italics
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

  // Strikethrough
  html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  // Links: [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Lists: group consecutive <li> items into <ul>
  html = html.replace(/^\s*[-*]\s+(.*)$/gim, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]*?<\/li>(?:\s*<li>[\s\S]*?<\/li>)*)/g, '<ul>$1</ul>');

  // Newlines handling outside <pre>
  var parts = html.split(/(<pre[\s\S]*?<\/pre>)/g);
  for (var i = 0; i < parts.length; i++) {
    if (!parts[i].startsWith('<pre')) {
      parts[i] = parts[i].replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
    }
  }
  return parts.join('');
}

KanbanStore.renderMarkdown = renderMarkdown;
if (typeof window !== 'undefined') {
  window.renderMarkdown = renderMarkdown;
}

// Export singleton
window.kanbanStore = new KanbanStore();
