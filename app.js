(() => {
  'use strict';

  const TASKS_KEY = 'luma.tasks.v1';
  const NOTES_KEY = 'luma.notes.v1';
  const NOTIFIED_KEY = 'luma.notifications.sent.v1';
  const CATEGORIES = {
    personal: 'Personal',
    trabajo: 'Trabajo',
    hogar: 'Hogar',
    bienestar: 'Bienestar',
    otros: 'Otros'
  };
  const PRIORITIES = {
    important: 'Importante',
    urgent: 'Prioritaria'
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const taskList = $('#taskList');
  const taskDialog = $('#taskDialog');
  const taskForm = $('#taskForm');
  const noteDialog = $('#noteDialog');
  const noteForm = $('#noteForm');
  const helpDialog = $('#helpDialog');
  let tasks = loadTasks();
  let notes = loadNotes();
  let currentView = 'today';
  let currentStatus = 'pending';
  let searchTerm = '';
  let editingId = null;
  let editingNoteId = null;
  let noteImages = [];
  let birthdayPhotoDataUrl = '';
  let dateSource = 'default';
  let toastTimer;
  let deferredInstallPrompt = null;
  let calendarYear = new Date().getFullYear();
  let selectedBdayDayKey = null;
  const DB_NAME = 'luma_db';
  const DB_VERSION = 1;

  function getIDB() {
    return new Promise((resolve) => {
      if (!('indexedDB' in window)) return resolve(null);
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('tasks')) db.createObjectStore('tasks', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('notes')) db.createObjectStore('notes', { keyPath: 'id' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
  }

  async function saveToIDB(storeName, items) {
    const db = await getIDB();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        store.clear();
        items.forEach(item => store.put(item));
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (_) {
        resolve(false);
      }
    });
  }

  async function loadFromIDB(storeName) {
    const db = await getIDB();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
        req.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
  }

  function loadTasks() {
    try {
      const saved = JSON.parse(localStorage.getItem(TASKS_KEY) || '[]');
      return Array.isArray(saved) ? saved.filter(item => item && typeof item.title === 'string') : [];
    } catch (error) {
      console.warn('No se pudieron leer las actividades guardadas.', error);
      return [];
    }
  }

  function persistTasks() {
    saveToIDB('tasks', tasks);
    try {
      localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
      return true;
    } catch (error) {
      // Si falla localStorage por tamaño, IndexedDB ya guarda el respaldo completo
      return true;
    }
  }

  function loadNotes() {
    try {
      const saved = JSON.parse(localStorage.getItem(NOTES_KEY) || '[]');
      return Array.isArray(saved) ? saved.filter(note => note && typeof note === 'object' && typeof note.body === 'string') : [];
    } catch (error) {
      console.warn('No se pudieron leer las notas guardadas.', error);
      return [];
    }
  }

  function persistNotes() {
    saveToIDB('notes', notes);
    try {
      localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
      return true;
    } catch (error) {
      // Con IndexedDB como respaldo seguro no interrumpimos el flujo del usuario
      return true;
    }
  }

  function localISO(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function dateFromISO(value) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day, 12, 0, 0, 0);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function isoFromDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  const WEEKDAYS = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
  const MONTHS = { enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11 };

  function normalizeDateText(value) {
    return String(value || '').toLocaleLowerCase('es-CO').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[,.!?¿¡]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function shiftDate(date, days) {
    const result = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
    result.setDate(result.getDate() + days);
    return isoFromDate(result);
  }

  function parseSmartDate(value) {
    const text = normalizeDateText(value);
    if (!text) return null;
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
    if (/^(?:hoy|para hoy|el dia de hoy)$/.test(text)) return isoFromDate(start);
    if (/^(?:pasado manana|despues de manana)$/.test(text)) return shiftDate(start, 2);
    if (/^(?:manana|para manana)$/.test(text)) return shiftDate(start, 1);
    const inDays = text.match(/^(?:en\s+)?(\d{1,3})\s+dias?$/);
    if (inDays) {
      const amount = Number(inDays[1]);
      return amount <= 365 ? shiftDate(start, amount) : null;
    }
    if (/^(?:en )?(?:una semana|una semana despues)$/.test(text) || /^(?:la )?proxima semana$/.test(text)) return shiftDate(start, 7);

    const numeric = text.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?$/);
    if (numeric) {
      const day = Number(numeric[1]);
      const month = Number(numeric[2]);
      let year = numeric[3] ? Number(numeric[3]) : start.getFullYear();
      let candidate = new Date(year, month - 1, day, 12);
      if (candidate.getDate() !== day || candidate.getMonth() !== month - 1) return null;
      if (!numeric[3] && candidate < start) {
        year += 1;
        candidate = new Date(year, month - 1, day, 12);
        if (candidate.getDate() !== day || candidate.getMonth() !== month - 1) return null;
      }
      return isoFromDate(candidate);
    }

    const writtenDate = text.match(/^(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(\d{4}))?$/);
    if (writtenDate && Object.prototype.hasOwnProperty.call(MONTHS, writtenDate[2])) {
      const day = Number(writtenDate[1]);
      const month = MONTHS[writtenDate[2]];
      let year = writtenDate[3] ? Number(writtenDate[3]) : start.getFullYear();
      let candidate = new Date(year, month, day, 12);
      if (candidate.getDate() !== day || candidate.getMonth() !== month) return null;
      if (!writtenDate[3] && candidate < start) {
        year += 1;
        candidate = new Date(year, month, day, 12);
        if (candidate.getDate() !== day || candidate.getMonth() !== month) return null;
      }
      return isoFromDate(candidate);
    }

    const weekdayMatch = text.match(/\b(?:(?:el|para|este|proximo|proxima|siguiente)\s+)*(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/);
    if (weekdayMatch) {
      const targetDay = WEEKDAYS[weekdayMatch[1]];
      let offset = (targetDay - start.getDay() + 7) % 7;
      if (offset === 0 && /\b(?:proximo|proxima|siguiente)\b/.test(text)) offset = 7;
      return shiftDate(start, offset);
    }
    return null;
  }

  function extractDatePhrase(value) {
    const text = normalizeDateText(value);
    const patterns = [
      /\bpasado\s+manana\b/,
      /\ben\s+\d{1,3}\s+dias?\b/,
      /\bproxima\s+semana\b/,
      /\b(?:el\s+)?proximo\s+(?:domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/,
      /\b(?:el\s+)?siguiente\s+(?:domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/,
      /\b(?:el\s+)?este\s+(?:domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/,
      /\b(?:el\s+)?(?:domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/,
      /\bmanana\b/,
      /\bhoy\b/,
      /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{4})?\b/,
      /\b\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+de\s+\d{4})?\b/
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && parseSmartDate(match[0])) return match[0];
    }
    return null;
  }

  function formatLongDate(iso) {
    const date = dateFromISO(iso);
    return date ? new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }).format(date) : '';
  }

  function birthdayDateInYear(year, month, day) {
    // Si el año no es bisiesto, conservamos el cumpleaños del 29 de febrero el día 28.
    const safeDay = month === 2 && day === 29 && !((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) ? 28 : day;
    return new Date(year, month - 1, safeDay, 12, 0, 0, 0);
  }

  function nextBirthdayISO(value) {
    const parts = (value || '').split('-').map(Number);
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return value || null;
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    let candidate = birthdayDateInYear(today.getFullYear(), parts[1], parts[2]);
    if (candidate < todayStart) candidate = birthdayDateInYear(today.getFullYear() + 1, parts[1], parts[2]);
    return isoFromDate(candidate);
  }

  function effectiveDate(task) {
    if (!task || !task.date) return null;
    if (task.type === 'birthday' && task.repeatYearly) return nextBirthdayISO(task.date);
    return task.date;
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function capitalize(value) {
    return value ? value.charAt(0).toLocaleUpperCase('es-CO') + value.slice(1) : value;
  }

  function formatShortDate(iso, includeWeekday = false) {
    const date = dateFromISO(iso);
    if (!date) return '';
    const options = includeWeekday
      ? { weekday: 'short', day: 'numeric', month: 'short' }
      : { day: 'numeric', month: 'short' };
    return new Intl.DateTimeFormat('es-CO', options).format(date).replace(/\.$/, '');
  }

  function formatRelative(iso, birthday = false) {
    if (!iso) return 'Sin fecha';
    const today = localISO();
    if (iso === today) return birthday ? '¡Hoy!' : 'Hoy';
    const date = dateFromISO(iso);
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
    const distance = Math.round((date - todayMidnight) / 86400000);
    if (distance === 1) return birthday ? 'Mañana' : 'Mañana';
    if (distance > 1 && distance <= 7) return `En ${distance} días`;
    if (distance < 0) return `Vencida · ${formatShortDate(iso)}`;
    return formatShortDate(iso, true);
  }

  function formatTaskDate(task) {
    const iso = effectiveDate(task);
    if (!iso) return 'Sin fecha';
    const today = localISO();
    const dueTime = task.time || '';
    const now = new Date();
    const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const overdue = iso < today || (iso === today && dueTime && dueTime < nowTime && !task.completed);
    if (overdue) return `Vencida · ${formatShortDate(iso)}`;
    const relative = formatRelative(iso, task.type === 'birthday');
    if (relative === 'Hoy' && task.type === 'birthday') return 'Cumpleaños · hoy';
    if (relative.startsWith('En ') && distanceDays(iso) > 7) return formatShortDate(iso, true);
    return relative;
  }

  function distanceDays(iso) {
    const date = dateFromISO(iso);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
    return Math.round((date - today) / 86400000);
  }

  function compareTasks(a, b) {
    const dateA = effectiveDate(a) || '9999-12-31';
    const dateB = effectiveDate(b) || '9999-12-31';
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    const timeA = a.time || '99:99';
    const timeB = b.time || '99:99';
    if (timeA !== timeB) return timeA.localeCompare(timeB);
    return (a.createdAt || '').localeCompare(b.createdAt || '');
  }

  function getBaseTasks() {
    const today = localISO();
    return tasks.filter(task => {
      const date = effectiveDate(task);
      switch (currentView) {
        case 'today': return Boolean(date && date <= today);
        case 'upcoming': return Boolean(date && date > today);
        case 'birthdays': return task.type === 'birthday';
        case 'completed': return Boolean(task.completed);
        case 'all':
        default: return true;
      }
    });
  }

  function viewInfo() {
    const info = {
      today: ['TU RITMO', 'Para hoy', 'Lo importante, sin prisa.'],
      upcoming: ['MÁS ADELANTE', 'Próximas actividades', 'Un vistazo tranquilo a lo que viene.'],
      birthdays: ['MOMENTOS BONITOS', 'Cumpleaños', 'Fechas que merecen un abrazo.'],
      all: ['TU LISTA', 'Todas las actividades', 'Todo lo que quieres tener presente.'],
      completed: ['LO QUE YA LOGRASTE', 'Completadas', 'Mira todo lo que has avanzado.'],
      notes: ['IDEAS Y RECUERDOS', 'Mis notas', 'Tus listas, ideas e imágenes en un rincón personal.']
    };
    return info[currentView] || info.today;
  }

  function categoryIcon(category) {
    const icons = { personal: 'i-heart', trabajo: 'i-grid', hogar: 'i-home', bienestar: 'i-leaf', otros: 'i-tag' };
    return icons[category] || 'i-tag';
  }

  function renderTask(task, index) {
    const isBirthday = task.type === 'birthday';
    const date = effectiveDate(task);
    const overdue = Boolean(date && !task.completed && (date < localISO() || (date === localISO() && task.time && task.time < `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`)));
    const priority = PRIORITIES[task.priority] || '';
    const timeText = task.time ? task.time : '';
    const dateText = formatTaskDate(task);
    const category = isBirthday ? 'Cumpleaños' : (CATEGORIES[task.category] || 'Personal');
    const badge = isBirthday
      ? '<span class="priority-tag birthday-tag">✦ Cumpleaños</span>'
      : (priority ? `<span class="priority-tag ${task.priority === 'urgent' ? 'urgent' : ''}">${escapeHTML(priority)}</span>` : '');
    const note = task.notes ? `<p class="task-notes">${escapeHTML(task.notes)}</p>` : '';
    const avatar = isBirthday && task.photoDataUrl ? `<span class="task-photo-thumb"><img src="${escapeHTML(task.photoDataUrl)}" alt="Foto de ${escapeHTML(task.title)}"></span>` : '';
    const timeMeta = timeText ? `<span class="task-meta-item"><svg><use href="#i-clock"/></svg>${escapeHTML(timeText)}</span>` : '';
    const reminderMeta = task.reminderMinutes !== null && task.reminderMinutes !== undefined && task.date
      ? `<span class="task-meta-item" title="Tiene aviso"><svg><use href="#i-bell"/></svg>aviso</span>` : '';
    return `
      <article class="task-card ${task.completed ? 'is-completed' : ''} ${isBirthday ? 'birthday-task' : ''}" data-id="${escapeHTML(task.id)}" style="animation-delay:${Math.min(index * 45, 270)}ms">
        <button class="task-check" data-action="toggle" aria-label="${task.completed ? 'Marcar como pendiente' : 'Marcar como completada'}" aria-pressed="${Boolean(task.completed)}"><svg><use href="#i-check"/></svg></button>
        ${avatar}
        <div class="task-body">
          <div class="task-heading"><h3 class="task-title">${escapeHTML(task.title)}</h3>${badge}</div>
          ${note}
          <div class="task-meta">
            <span class="task-meta-item ${overdue ? 'is-overdue' : ''}"><svg><use href="#i-calendar"/></svg>${escapeHTML(dateText)}</span>
            ${timeMeta}
            <span class="task-category ${isBirthday ? 'birthday-category' : ''}"><svg><use href="#${categoryIcon(task.category)}"/></svg>${escapeHTML(category)}</span>
            ${reminderMeta}
          </div>
        </div>
        <div class="task-actions">
          <button class="task-action" data-action="edit" aria-label="Editar ${escapeHTML(task.title)}" title="Editar"><svg><use href="#i-edit"/></svg></button>
          <button class="task-action delete" data-action="delete" aria-label="Eliminar ${escapeHTML(task.title)}" title="Eliminar"><svg><use href="#i-trash"/></svg></button>
        </div>
      </article>`;
  }

  function render() {
    const [eyebrow, title, subtitle] = viewInfo();
    $('#viewEyebrow').textContent = eyebrow;
    $('#viewTitle').innerHTML = `${escapeHTML(title)} <span class="title-spark">✦</span>`;
    $('#viewSubtitle').textContent = subtitle;
    $$('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === currentView));
    const notesMode = currentView === 'notes';
    const birthdaysMode = currentView === 'birthdays';
    $('#tasksContent').hidden = notesMode || birthdaysMode;
    $('#notesContent').hidden = !notesMode;
    const bdayContainer = $('#birthdaysContent');
    if (bdayContainer) bdayContainer.hidden = !birthdaysMode;

    $('#searchInput').placeholder = notesMode ? 'Buscar en mis notas...' : birthdaysMode ? 'Buscar cumpleaños...' : 'Buscar actividad...';
    if (notesMode) {
      renderNotes();
      renderIndicators();
      renderAgenda();
      renderBirthdays();
      updateNotificationUI();
      return;
    }
    if (birthdaysMode) {
      renderBirthdaysCalendar();
      renderIndicators();
      renderAgenda();
      renderBirthdays();
      updateNotificationUI();
      return;
    }

    const base = getBaseTasks().sort(compareTasks);
    const pendingCount = base.filter(task => !task.completed).length;
    const doneCount = base.filter(task => task.completed).length;
    $('#pendingCount').textContent = pendingCount;
    $('#doneCount').textContent = doneCount;
    const toggle = $('.view-toggle');
    toggle.hidden = currentView === 'completed';
    $$('.toggle-option').forEach(button => button.classList.toggle('selected', button.dataset.status === currentStatus));

    let visible = base.filter(task => currentView === 'completed' ? task.completed : (currentStatus === 'done' ? task.completed : !task.completed));
    if (searchTerm) {
      const term = searchTerm.toLocaleLowerCase('es-CO');
      visible = visible.filter(task => `${task.title} ${task.notes || ''} ${CATEGORIES[task.category] || ''}`.toLocaleLowerCase('es-CO').includes(term));
    }
    visible.sort(compareTasks);
    const summary = searchTerm
      ? `${visible.length} ${visible.length === 1 ? 'resultado' : 'resultados'}`
      : currentView === 'completed' || currentStatus === 'done'
        ? `${visible.length} ${visible.length === 1 ? 'actividad lista' : 'actividades listas'}`
        : `${visible.length} ${visible.length === 1 ? 'actividad pendiente' : 'actividades pendientes'}`;
    $('#listSummary').textContent = summary;
    taskList.innerHTML = visible.map(renderTask).join('');
    const empty = visible.length === 0;
    $('#emptyState').hidden = !empty;
    taskList.hidden = empty;
    updateEmptyState();
    renderIndicators();
    renderAgenda();
    renderBirthdays();
    updateNotificationUI();
  }

  function updateEmptyState() {
    const title = $('#emptyTitle');
    const copy = $('#emptyCopy');
    const button = $('#emptyAddButton');
    if (searchTerm) {
      title.textContent = 'No encontramos coincidencias';
      copy.textContent = 'Prueba con otras palabras o limpia tu búsqueda para volver a ver la lista.';
      button.innerHTML = 'Limpiar búsqueda <svg><use href="#i-arrow"/></svg>';
      return;
    }
    if (currentView === 'birthdays' && currentStatus !== 'done') {
      title.textContent = 'Aún no hay fechas para celebrar';
      copy.textContent = 'Guarda un cumpleaños y te ayudaremos a tenerlo presente cada año.';
      button.innerHTML = 'Añadir un cumpleaños <svg><use href="#i-arrow"/></svg>';
      return;
    }
    if (currentView === 'upcoming' && currentStatus !== 'done') {
      title.textContent = 'No hay nada apurándote';
      copy.textContent = 'Cuando agregues actividades para más adelante, aparecerán aquí.';
      button.innerHTML = 'Planear algo <svg><use href="#i-arrow"/></svg>';
      return;
    }
    if (currentView === 'completed' || currentStatus === 'done') {
      title.textContent = 'Todo logro empieza con un paso';
      copy.textContent = 'Cuando completes alguna actividad, la encontrarás aquí para celebrarla.';
      button.innerHTML = 'Volver a pendientes <svg><use href="#i-arrow"/></svg>';
      return;
    }
    if (currentView === 'today') {
      title.textContent = 'Un espacio para empezar';
      copy.textContent = 'No hay actividades para hoy. Agrega una y haz que el día cuente, sin prisa.';
    } else {
      title.textContent = 'Tu lista empieza aquí';
      copy.textContent = 'Agrega tus actividades y ten todo lo importante en un solo lugar.';
    }
    button.innerHTML = 'Crear mi primera actividad <svg><use href="#i-arrow"/></svg>';
  }

  function renderIndicators() {
    const today = localISO();
    const active = tasks.filter(task => !task.completed);
    const todayCount = active.filter(task => {
      const d = effectiveDate(task);
      return d && d <= today;
    }).length;
    const upcomingCount = active.filter(task => {
      const d = effectiveDate(task);
      return d && d > today;
    }).length;
    const birthdayCount = active.filter(task => task.type === 'birthday').length;
    $('#countToday').textContent = todayCount;
    $('#countUpcoming').textContent = upcomingCount;
    $('#countBirthdays').textContent = birthdayCount;
    $('#countNotes').textContent = notes.length;

    const todayTasks = tasks.filter(task => effectiveDate(task) === today);
    const doneToday = todayTasks.filter(task => task.completed).length;
    const totalToday = todayTasks.length;
    $('#progressCount').textContent = totalToday ? `${doneToday} de ${totalToday}` : 'Listo para empezar';
    $('#progressLabel').textContent = totalToday ? 'Tu progreso de hoy' : 'Un día para empezar a tu manera';
    $('#progressBar').style.width = totalToday ? `${Math.round(doneToday / totalToday * 100)}%` : '0%';

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);
    const doneThisWeek = tasks.filter(task => task.completed && task.completedAt && new Date(task.completedAt) >= sevenDaysAgo).length;
    $('#weekDone').textContent = doneThisWeek;
    $('#weekBar').style.width = `${Math.min(100, doneThisWeek * 10)}%`;
    $('#weekNote').textContent = doneThisWeek ? 'Mira todo lo que has avanzado ✨' : 'Cada pequeño paso cuenta ✨';
  }

  function renderAgenda() {
    const today = localISO();
    const upcoming = tasks
      .filter(task => !task.completed && task.type !== 'birthday' && effectiveDate(task) && effectiveDate(task) >= today)
      .sort(compareTasks)
      .slice(0, 3);
    const target = $('#agendaList');
    if (!upcoming.length) {
      target.innerHTML = '<p class="rail-empty">Tu agenda está despejada. Aquí aparecerá lo próximo que quieras recordar.</p>';
      return;
    }
    target.innerHTML = upcoming.map((task, index) => {
      const date = dateFromISO(effectiveDate(task));
      const day = date ? date.getDate() : '—';
      const month = date ? new Intl.DateTimeFormat('es-CO', { month: 'short' }).format(date).replace('.', '') : '';
      const when = formatRelative(effectiveDate(task));
      const time = task.time || '';
      return `<div class="agenda-item" style="animation-delay:${index * 65}ms">
        <div class="agenda-date"><strong>${day}</strong><span>${escapeHTML(month)}</span></div>
        <div class="agenda-details"><strong>${escapeHTML(task.title)}</strong><span>${escapeHTML(when)}${task.category ? ` · ${escapeHTML(CATEGORIES[task.category] || 'Personal')}` : ''}</span></div>
        ${time ? `<span class="agenda-time">${escapeHTML(time)}</span>` : ''}
      </div>`;
    }).join('');
  }

  function renderBirthdays() {
    const birthdays = tasks
      .filter(task => !task.completed && task.type === 'birthday' && task.date)
      .sort(compareTasks)
      .slice(0, 3);
    const target = $('#birthdayList');
    if (!birthdays.length) {
      target.innerHTML = '<p class="rail-empty birthday-empty">Aún no guardas cumpleaños. Siempre hay alguien especial que recordar.</p>';
      return;
    }
    target.innerHTML = birthdays.map(task => {
      const when = formatRelative(effectiveDate(task), true);
      const dateText = formatShortDate(effectiveDate(task));
      return `<div class="birthday-item">
        <span class="birthday-emoji ${task.photoDataUrl ? 'has-photo' : ''}">${task.photoDataUrl ? `<img src="${escapeHTML(task.photoDataUrl)}" alt="">` : '<svg><use href="#i-cake"/></svg>'}</span>
        <div class="birthday-details"><strong>${escapeHTML(task.title)}</strong><span>${escapeHTML(dateText)}${task.time ? ` · ${escapeHTML(task.time)}` : ''}</span></div>
        <span class="birthday-when">${escapeHTML(when)}</span>
      </div>`;
    }).join('');
  }

  const BALLOON_PALETTES = [
    { bg: '#e05a47', text: '#fff' },
    { bg: '#339c73', text: '#fff' },
    { bg: '#8359b3', text: '#fff' },
    { bg: '#259bb8', text: '#fff' },
    { bg: '#df8926', text: '#fff' },
    { bg: '#cf4578', text: '#fff' },
    { bg: '#2b75bd', text: '#fff' },
    { bg: '#6b9231', text: '#fff' },
    { bg: '#bf4538', text: '#fff' },
    { bg: '#8d4f9e', text: '#fff' },
    { bg: '#209e90', text: '#fff' },
    { bg: '#cf5d46', text: '#fff' }
  ];

  function getBirthdayBalloonStyle(task) {
    let hash = 0;
    const str = (task.id || '') + (task.title || '');
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    const index = Math.abs(hash) % BALLOON_PALETTES.length;
    return BALLOON_PALETTES[index];
  }

  function getBirthdayInitial(task) {
    const clean = (task.title || '')
      .replace(/^cumpleaños\s+de\s+/i, '')
      .replace(/^cumple\s+de\s+/i, '')
      .trim();
    return clean.charAt(0).toUpperCase() || '🎂';
  }

  function getBirthdayDisplayName(task) {
    return (task.title || '')
      .replace(/^cumpleaños\s+de\s+/i, '')
      .replace(/^cumple\s+de\s+/i, '')
      .trim() || task.title;
  }

  const MONTH_NAMES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  const WEEKDAY_NAMES_SHORT = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];
  const WEEKDAY_NAMES_FULL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

  function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  }

  function daysInMonth(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0).getDate();
  }

  function startDayOfWeek(year, monthIndex) {
    const jsDay = new Date(year, monthIndex, 1).getDay();
    return (jsDay + 6) % 7;
  }

  function getDayOfWeekName(year, monthIndex, day) {
    const jsDay = new Date(year, monthIndex, day).getDay();
    const col = (jsDay + 6) % 7;
    return WEEKDAY_NAMES_FULL[col];
  }

  function getBirthdaysMap() {
    const map = new Map();
    const term = searchTerm.toLocaleLowerCase('es-CO');
    tasks.filter(t => t.type === 'birthday' && t.date).forEach(task => {
      if (term && !task.title.toLocaleLowerCase('es-CO').includes(term)) return;
      const parts = task.date.split('-').map(Number);
      if (parts.length >= 3) {
        let m = parts[1];
        let d = parts[2];
        if (m === 2 && d === 29 && !isLeapYear(calendarYear)) d = 28;
        const key = `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(task);
      }
    });
    return map;
  }

  function calculateTurningAge(task, targetYear) {
    if (!task.date) return null;
    const [birthYear] = task.date.split('-').map(Number);
    if (birthYear && birthYear > 1900 && birthYear < targetYear) {
      return targetYear - birthYear;
    }
    return null;
  }

  function renderBirthdaysCalendar() {
    const grid = $('#birthdaysCalendarGrid');
    if (!grid) return;

    const bdayTasks = tasks.filter(t => t.type === 'birthday' && t.date);
    const bdaysMap = getBirthdaysMap();
    const today = new Date();
    const currentYear = today.getFullYear();
    const todayMonth = today.getMonth();
    const todayDate = today.getDate();

    const yearNumEl = $('#calendarYearNumber');
    if (yearNumEl) yearNumEl.textContent = calendarYear;
    const sumYearEl = $('#summaryYearLabel');
    if (sumYearEl) sumYearEl.textContent = calendarYear;

    const diffYears = calendarYear - currentYear;
    const yearBadgeEl = $('#calendarYearBadge');
    if (yearBadgeEl) {
      yearBadgeEl.textContent = diffYears === 0 ? 'Año actual' : (diffYears > 0 ? `+${diffYears} ${diffYears === 1 ? 'año' : 'años'}` : `${diffYears} ${diffYears === -1 ? 'año' : 'años'}`);
    }
    const totalCountEl = $('#bdayTotalCount');
    if (totalCountEl) totalCountEl.textContent = bdayTasks.length;

    let gridHTML = '';
    for (let m = 0; m < 12; m++) {
      const monthName = MONTH_NAMES[m];
      const daysCount = daysInMonth(calendarYear, m);
      const startOffset = startDayOfWeek(calendarYear, m);

      let monthBdayCount = 0;
      for (let d = 1; d <= daysCount; d++) {
        const key = `${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        if (bdaysMap.has(key)) monthBdayCount += bdaysMap.get(key).length;
      }

      let daysHTML = '';
      for (let s = 0; s < startOffset; s++) {
        daysHTML += '<span class="bday-day-cell is-empty"></span>';
      }

      for (let d = 1; d <= daysCount; d++) {
        const key = `${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const hasBirthdays = bdaysMap.has(key);
        const isToday = calendarYear === currentYear && m === todayMonth && d === todayDate;
        const isSelected = selectedBdayDayKey === key;

        if (hasBirthdays) {
          const list = bdaysMap.get(key);
          const first = list[0];
          const color = getBirthdayBalloonStyle(first);
          const initial = getBirthdayInitial(first);
          const photo = first.photoDataUrl;
          const multipleBadge = list.length > 1 ? `<span class="bday-balloon-cluster-badge">+${list.length}</span>` : '';
          const tooltip = `${d} de ${monthName}: ${list.map(t => getBirthdayDisplayName(t)).join(', ')}`;
          const content = photo ? `<img src="${escapeHTML(photo)}" alt="">` : escapeHTML(initial);

          daysHTML += `
            <div class="bday-day-cell has-birthday ${isToday ? 'is-today-circle' : ''}" data-bday-key="${key}" title="${escapeHTML(tooltip)}">
              <span class="bday-balloon-wrap ${isSelected ? 'is-active-day' : ''} ${list.length > 1 ? 'is-cluster' : ''}" style="--balloon-bg: ${color.bg}; --balloon-color: ${color.text}">
                <span class="bday-balloon-bubble">${content}</span>
                <span class="bday-balloon-tail"></span>
                ${multipleBadge}
              </span>
            </div>`;
        } else {
          daysHTML += `<span class="bday-day-cell ${isToday ? 'is-today-circle' : ''}" title="${d} de ${monthName} (${getDayOfWeekName(calendarYear, m, d)})">${d}</span>`;
        }
      }

      gridHTML += `
        <article class="bday-month-card">
          <div class="bday-month-header">
            <h3 class="bday-month-title">${monthName}</h3>
            ${monthBdayCount > 0 ? `<span class="bday-month-badge">${monthBdayCount} ${monthBdayCount === 1 ? 'fecha' : 'fechas'}</span>` : ''}
          </div>
          <div class="bday-weekdays-row">
            ${WEEKDAY_NAMES_SHORT.map(w => `<span>${w}</span>`).join('')}
          </div>
          <div class="bday-days-grid">
            ${daysHTML}
          </div>
        </article>`;
    }

    grid.innerHTML = gridHTML;
    renderBirthdayDetailPanel(bdaysMap);
    renderBirthdaySummaryList(bdayTasks);
  }

  function renderBirthdayDetailPanel(bdaysMap) {
    const panel = $('#bdayDetailPanel');
    const card = $('#bdayDetailCard');
    if (!panel || !card) return;

    if (!selectedBdayDayKey || !bdaysMap.has(selectedBdayDayKey)) {
      panel.hidden = true;
      return;
    }

    const [mStr, dStr] = selectedBdayDayKey.split('-');
    const m = Number(mStr) - 1;
    const d = Number(dStr);
    const monthName = MONTH_NAMES[m];
    const weekdayName = getDayOfWeekName(calendarYear, m, d);
    const list = bdaysMap.get(selectedBdayDayKey);

    card.innerHTML = `
      <div class="bday-detail-header">
        <div class="bday-detail-date-title">
          <svg><use href="#i-cake"/></svg>
          <span>${weekdayName}, ${d} de ${monthName} de ${calendarYear}</span>
        </div>
        <button class="bday-detail-close-btn" id="closeBdayDetailBtn" aria-label="Cerrar detalle"><svg><use href="#i-close"/></svg></button>
      </div>
      <div class="bday-detail-items">
        ${list.map(task => {
          const color = getBirthdayBalloonStyle(task);
          const initial = getBirthdayInitial(task);
          const name = getBirthdayDisplayName(task);
          const age = calculateTurningAge(task, calendarYear);
          const ageText = age !== null ? `<span class="bday-detail-age-tag">🎂 Cumple ${age} años en ${calendarYear}</span>` : '';
          const avatar = task.photoDataUrl
            ? `<span class="bday-detail-avatar" style="--item-bg:${color.bg}"><img src="${escapeHTML(task.photoDataUrl)}" alt=""></span>`
            : `<span class="bday-detail-avatar" style="--item-bg:${color.bg}">${escapeHTML(initial)}</span>`;
          return `
            <div class="bday-detail-item" data-id="${escapeHTML(task.id)}">
              ${avatar}
              <div class="bday-detail-info">
                <h4>${escapeHTML(name)}</h4>
                <div class="bday-detail-meta">
                  <span class="bday-detail-weekday-tag">Cae un ${weekdayName}</span>
                  ${ageText}
                  ${task.notes ? `<span>· ${escapeHTML(task.notes)}</span>` : ''}
                </div>
              </div>
              <div class="bday-detail-actions">
                <button class="task-action" data-bday-action="edit" data-id="${escapeHTML(task.id)}" title="Editar"><svg><use href="#i-edit"/></svg></button>
                <button class="task-action delete" data-bday-action="delete" data-id="${escapeHTML(task.id)}" title="Eliminar"><svg><use href="#i-trash"/></svg></button>
              </div>
            </div>`;
        }).join('')}
      </div>`;

    panel.hidden = false;
  }

  function renderBirthdaySummaryList(bdayTasks) {
    const listEl = $('#bdaySummaryList');
    const emptyEl = $('#bdayEmptyState');
    if (!listEl) return;

    const term = searchTerm.toLocaleLowerCase('es-CO');
    const filtered = bdayTasks.filter(t => !term || t.title.toLocaleLowerCase('es-CO').includes(term));

    if (filtered.length === 0) {
      listEl.innerHTML = '';
      if (emptyEl) emptyEl.hidden = false;
      const countEl = $('#summaryCountLabel');
      if (countEl) countEl.textContent = '0 personas';
      return;
    }
    if (emptyEl) emptyEl.hidden = true;

    const sorted = filtered.slice().sort((a, b) => {
      const partsA = a.date.split('-').map(Number);
      const partsB = b.date.split('-').map(Number);
      const keyA = (partsA[1] || 0) * 100 + (partsA[2] || 0);
      const keyB = (partsB[1] || 0) * 100 + (partsB[2] || 0);
      return keyA - keyB;
    });

    const countEl = $('#summaryCountLabel');
    if (countEl) countEl.textContent = `${sorted.length} ${sorted.length === 1 ? 'persona' : 'personas'}`;

    listEl.innerHTML = sorted.map(task => {
      const parts = task.date.split('-').map(Number);
      let m = (parts[1] || 1) - 1;
      let d = parts[2] || 1;
      if (m === 1 && d === 29 && !isLeapYear(calendarYear)) d = 28;
      const monthName = MONTH_NAMES[m];
      const weekdayName = getDayOfWeekName(calendarYear, m, d);
      const color = getBirthdayBalloonStyle(task);
      const initial = getBirthdayInitial(task);
      const name = getBirthdayDisplayName(task);
      const age = calculateTurningAge(task, calendarYear);
      const ageText = age !== null ? ` · Cumple ${age} años` : '';
      const avatar = task.photoDataUrl
        ? `<span class="bday-summary-avatar" style="--summary-bg:${color.bg}"><img src="${escapeHTML(task.photoDataUrl)}" alt=""></span>`
        : `<span class="bday-summary-avatar" style="--summary-bg:${color.bg}">${escapeHTML(initial)}</span>`;
      const key = `${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

      return `
        <div class="bday-summary-item" data-bday-key="${key}" data-id="${escapeHTML(task.id)}">
          ${avatar}
          <div class="bday-summary-text">
            <strong>${escapeHTML(name)}</strong>
            <span>${d} de ${monthName} · <b class="bday-summary-weekday">Cae ${weekdayName}</b>${escapeHTML(ageText)}</span>
          </div>
          <div class="task-actions" style="opacity: 0.9">
            <button class="task-action" data-bday-action="edit" data-id="${escapeHTML(task.id)}" title="Editar"><svg><use href="#i-edit"/></svg></button>
            <button class="task-action delete" data-bday-action="delete" data-id="${escapeHTML(task.id)}" title="Eliminar"><svg><use href="#i-trash"/></svg></button>
          </div>
        </div>`;
    }).join('');
  }

  function noteDateLabel(note) {
    const timestamp = note.updatedAt || note.createdAt;
    const date = timestamp ? new Date(timestamp) : new Date();
    if (Number.isNaN(date.getTime())) return '';
    if (localISO(date) === localISO()) return 'Hoy';
    return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' }).format(date).replace(/\.$/, '');
  }

  function renderNotes() {
    const term = searchTerm.toLocaleLowerCase('es-CO');
    const visible = notes.slice().sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''))
      .filter(note => !term || `${note.title || ''} ${note.body || ''}`.toLocaleLowerCase('es-CO').includes(term));
    $('#notesSummary').textContent = term
      ? `${visible.length} ${visible.length === 1 ? 'resultado' : 'resultados'}`
      : `${visible.length} ${visible.length === 1 ? 'nota' : 'notas'}`;
    const grid = $('#notesGrid');
    grid.innerHTML = visible.map((note, index) => {
      const title = note.title?.trim() || 'Nota sin título';
      const body = note.body?.trim() || '';
      const imageList = Array.isArray(note.images) ? note.images.slice(0, 3) : [];
      const images = imageList.length ? `<div class="note-card-images">${imageList.map((image, i) => `<img src="${escapeHTML(image)}" alt="Imagen ${i + 1} de ${escapeHTML(title)}" loading="lazy">`).join('')}</div>` : '';
      const text = body ? `<p class="note-card-text">${escapeHTML(body)}</p>` : '<p class="note-card-text is-empty">Solo imágenes, listas para volver a mirar.</p>';
      return `<article class="note-card" data-note-id="${escapeHTML(note.id)}" style="animation-delay:${Math.min(index * 45, 240)}ms">
        <div class="note-card-head"><span class="note-sticker"><svg><use href="#i-note"/></svg></span><div class="note-card-title-group"><h3 class="note-card-title">${escapeHTML(title)}</h3><time class="note-card-date">${escapeHTML(noteDateLabel(note))}</time></div><div class="note-card-actions"><button class="task-action" data-note-action="edit" aria-label="Editar nota ${escapeHTML(title)}" title="Editar nota"><svg><use href="#i-edit"/></svg></button><button class="task-action delete" data-note-action="delete" aria-label="Eliminar nota ${escapeHTML(title)}" title="Eliminar nota"><svg><use href="#i-trash"/></svg></button></div></div>
        ${text}${images}
      </article>`;
    }).join('');
    const empty = visible.length === 0;
    grid.hidden = empty;
    $('#notesEmpty').hidden = !empty;
    if (term) {
      $('#notesEmptyTitle').textContent = 'No encontramos notas';
      $('#notesEmptyCopy').textContent = 'Prueba con otras palabras o limpia la búsqueda para ver todas tus notas.';
      $('#addFirstNoteButton').innerHTML = 'Limpiar búsqueda <svg><use href="#i-arrow"/></svg>';
    } else {
      $('#notesEmptyTitle').textContent = 'Un rincón para tus ideas';
      $('#notesEmptyCopy').textContent = 'Escribe una nota, guarda una lista o añade imágenes para recordar lo importante.';
      $('#addFirstNoteButton').innerHTML = 'Crear mi primera nota <svg><use href="#i-arrow"/></svg>';
    }
  }

  function openNoteDialog(note = null) {
    editingNoteId = note?.id || null;
    noteForm.reset();
    $('#noteTitle').value = note?.title || '';
    $('#noteBody').value = note?.body || '';
    noteImages = Array.isArray(note?.images) ? note.images.slice(0, 3) : [];
    $('#noteDialogTitle').textContent = note ? 'Edita tu nota' : 'Escribe tu nota';
    $('#noteDialogEyebrow').textContent = note ? 'UN PENSAMIENTO QUE SIGUE' : 'UNA IDEA PARA GUARDAR';
    $('#saveNoteLabel').textContent = note ? 'Guardar cambios' : 'Guardar nota';
    renderNoteImagePreviews();
    if (typeof noteDialog.showModal === 'function') noteDialog.showModal();
    else noteDialog.setAttribute('open', '');
    window.setTimeout(() => $('#noteTitle').focus(), 70);
  }

  function closeNoteDialog() {
    if (noteDialog.open) noteDialog.close();
    editingNoteId = null;
    noteImages = [];
  }

  function renderNoteImagePreviews() {
    const target = $('#noteImagePreviews');
    target.innerHTML = noteImages.map((image, index) => `<div class="note-image-preview"><img src="${escapeHTML(image)}" alt="Imagen ${index + 1} adjunta"><button class="note-image-remove" type="button" data-remove-image="${index}" aria-label="Quitar imagen ${index + 1}"><svg><use href="#i-close"/></svg></button></div>`).join('');
    $('#addNoteImageButton').disabled = noteImages.length >= 3;
    $('#addNoteImageButton').title = noteImages.length >= 3 ? 'Máximo 3 imágenes por nota' : 'Añadir una imagen';
  }

  function dataUrlBytes(dataUrl) {
    const comma = dataUrl.indexOf(',');
    return comma < 0 ? dataUrl.length : Math.ceil((dataUrl.length - comma - 1) * 3 / 4);
  }

  async function compressImage(file, maxSide = 960, maxBytes = 150 * 1024) {
    if (!file || !file.type?.startsWith('image/')) throw new Error('Elige un archivo de imagen.');
    if (file.size > 18 * 1024 * 1024) throw new Error('La imagen original debe pesar menos de 18 MB.');
    const sourceUrl = URL.createObjectURL(file);
    let image;
    try {
      image = await new Promise((resolve, reject) => {
        const item = new Image();
        item.onload = () => resolve(item);
        item.onerror = () => reject(new Error('No se pudo abrir esa imagen.'));
        item.src = sourceUrl;
      });
    } finally {
      URL.revokeObjectURL(sourceUrl);
    }
    const originalWidth = image.naturalWidth || image.width;
    const originalHeight = image.naturalHeight || image.height;
    if (!originalWidth || !originalHeight) throw new Error('La imagen no tiene un tamaño válido.');
    let scale = Math.min(1, maxSide / Math.max(originalWidth, originalHeight));
    for (let attempt = 0; attempt < 7; attempt++) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(originalWidth * scale));
      canvas.height = Math.max(1, Math.round(originalHeight * scale));
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('No se pudo preparar la imagen en este navegador.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.82, 0.74, 0.66, 0.58, 0.50]) {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        if (dataUrlBytes(dataUrl) <= maxBytes) {
          canvas.width = 1;
          canvas.height = 1;
          return dataUrl;
        }
      }
      canvas.width = 1;
      canvas.height = 1;
      scale *= 0.76;
    }
    throw new Error('No se pudo comprimir esa imagen lo suficiente. Prueba con otra foto.');
  }

  function renderBirthdayPhotoPreview() {
    const preview = $('#birthdayPhotoPreview');
    preview.innerHTML = birthdayPhotoDataUrl
      ? `<img src="${escapeHTML(birthdayPhotoDataUrl)}" alt="Vista previa de la foto del cumpleaños">`
      : '<svg><use href="#i-image"/></svg>';
    $('#removeBirthdayPhoto').hidden = !birthdayPhotoDataUrl;
    $('#birthdayPhotoButtonLabel').textContent = birthdayPhotoDataUrl ? 'Cambiar foto' : 'Añadir foto';
  }

  async function handleBirthdayPhoto(file) {
    if (!file) return;
    try {
      birthdayPhotoDataUrl = await compressImage(file, 520, 115 * 1024);
      renderBirthdayPhotoPreview();
      showToast('Foto lista y optimizada para tu dispositivo.');
    } catch (error) {
      showToast(error.message || 'No se pudo procesar esa foto.');
    } finally {
      $('#birthdayPhotoInput').value = '';
    }
  }

  async function addNoteImages(files) {
    const remaining = 3 - noteImages.length;
    const selected = [...(files || [])];
    if (!selected.length) return;
    if (selected.length > remaining) showToast(`Puedes adjuntar hasta 3 imágenes. Añadiremos ${remaining} de las seleccionadas.`);
    for (const file of selected.slice(0, remaining)) {
      try {
        const compressed = await compressImage(file, 960, 150 * 1024);
        noteImages.push(compressed);
        renderNoteImagePreviews();
      } catch (error) {
        showToast(error.message || `No se pudo añadir ${file.name || 'esa imagen'}.`);
      }
    }
    $('#noteImagesInput').value = '';
  }

  function saveNote(event) {
    event.preventDefault();
    const body = $('#noteBody').value.trim();
    let title = $('#noteTitle').value.trim();
    if (!title) title = body.split(/\r?\n/)[0].slice(0, 90).trim();
    if (!title && !body && !noteImages.length) {
      $('#noteBody').focus();
      showToast('Escribe algo o añade una imagen para guardar tu nota.');
      return;
    }
    title = title || 'Nota sin título';
    const previous = editingNoteId ? notes.find(note => note.id === editingNoteId) : null;
    const now = new Date().toISOString();
    const note = {
      id: previous?.id || generateImportId(),
      title,
      body,
      images: noteImages.slice(0, 3),
      createdAt: previous?.createdAt || now,
      updatedAt: now
    };
    const updatedNotes = previous ? notes.map(item => item.id === previous.id ? note : item) : [note, ...notes];
    const previousNotes = notes;
    notes = updatedNotes;
    if (!persistNotes()) {
      notes = previousNotes;
      return;
    }
    closeNoteDialog();
    currentView = 'notes';
    currentStatus = 'pending';
    render();
    showToast(previous ? 'Nota actualizada.' : 'Nota guardada en tu dispositivo.');
  }

  function handleNoteAction(event) {
    const removeImage = event.target.closest('[data-remove-image]');
    if (removeImage) {
      noteImages.splice(Number(removeImage.dataset.removeImage), 1);
      renderNoteImagePreviews();
      return;
    }
    const button = event.target.closest('[data-note-action]');
    if (!button) return;
    const card = button.closest('.note-card');
    const note = notes.find(item => item.id === card?.dataset.noteId);
    if (!note) return;
    if (button.dataset.noteAction === 'edit') openNoteDialog(note);
    if (button.dataset.noteAction === 'delete') {
      if (!window.confirm(`¿Eliminar la nota “${note.title || 'Nota sin título'}”?`)) return;
      card.classList.add('is-removing');
      window.setTimeout(() => {
        const previousNotes = notes;
        notes = notes.filter(item => item.id !== note.id);
        if (!persistNotes()) notes = previousNotes;
        render();
        showToast('Nota eliminada.');
      }, 190);
    }
  }

  function showToast(message, actionCallback = null, actionLabel = 'Actualizar') {
    $('#toastMessage').textContent = message;
    const toast = $('#toast');
    let actionBtn = toast.querySelector('.toast-action');
    if (actionCallback) {
      if (!actionBtn) {
        actionBtn = document.createElement('button');
        actionBtn.className = 'toast-action save-button';
        actionBtn.style.padding = '3px 9px';
        actionBtn.style.minHeight = '28px';
        actionBtn.style.fontSize = '11px';
        actionBtn.style.marginLeft = '8px';
        toast.appendChild(actionBtn);
      }
      actionBtn.textContent = actionLabel;
      actionBtn.onclick = () => {
        actionCallback();
        toast.classList.remove('show');
      };
      actionBtn.hidden = false;
    } else if (actionBtn) {
      actionBtn.hidden = true;
    }
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), actionCallback ? 8000 : 2700);
  }

  function setSmartDateFeedback(message, state = '') {
    const feedback = $('#smartDateFeedback');
    feedback.textContent = message;
    feedback.classList.toggle('is-success', state === 'success');
    feedback.classList.toggle('is-error', state === 'error');
  }

  function syncTitleDate() {
    if (dateSource === 'manual' || dateSource === 'smart') return;
    const phrase = extractDatePhrase($('#taskTitle').value);
    if (phrase) {
      const parsed = parseSmartDate(phrase);
      if (parsed) {
        $('#taskDate').value = parsed;
        $('#taskSmartDate').value = phrase;
        dateSource = 'title';
        setSmartDateFeedback(`Fecha detectada: ${capitalize(formatLongDate(parsed))}.`, 'success');
        return;
      }
    }
    if (dateSource === 'title') {
      dateSource = 'default';
      $('#taskDate').value = localISO();
      $('#taskSmartDate').value = '';
      setSmartDateFeedback('Escribe «lunes», «mañana» o «en 3 días» y pondré la fecha por ti.');
    }
  }

  function handleSmartDateInput() {
    const phrase = $('#taskSmartDate').value.trim();
    if (!phrase) {
      if (dateSource === 'smart') {
        dateSource = 'default';
        $('#taskDate').value = localISO();
      }
      setSmartDateFeedback('Escribe «lunes», «mañana» o «en 3 días» y pondré la fecha por ti.');
      return;
    }
    const date = parseSmartDate(phrase);
    if (!date) {
      setSmartDateFeedback('Aún no reconozco esa fecha. Prueba «lunes», «mañana» o «18/10».');
      return;
    }
    $('#taskDate').value = date;
    dateSource = 'smart';
    setSmartDateFeedback(`Perfecto: ${capitalize(formatLongDate(date))}. La fecha ya está puesta.`, 'success');
  }

  function openTaskDialog(type = 'task', task = null) {
    editingId = task ? task.id : null;
    dateSource = task ? 'manual' : 'default';
    taskForm.reset();
    $('#taskTitle').value = task?.title || '';
    $('#taskNotes').value = task?.notes || '';
    $('#taskType').value = task?.type || type;
    $('#taskDate').value = task?.date || localISO();
    $('#taskSmartDate').value = '';
    $('#taskTime').value = task?.time || '';
    $('#taskCategory').value = task?.category || 'personal';
    $('#taskPriority').value = task?.priority || 'normal';
    $('#taskReminder').value = task ? (task.reminderMinutes === null || task.reminderMinutes === undefined ? '' : String(task.reminderMinutes)) : '10';
    $('#repeatYearly').checked = task?.repeatYearly !== undefined ? Boolean(task.repeatYearly) : true;
    birthdayPhotoDataUrl = task?.photoDataUrl || '';
    renderBirthdayPhotoPreview();
    setSmartDateFeedback(task?.date ? `Fecha actual: ${capitalize(formatLongDate(task.date))}. Escribe otra para cambiarla rápido.` : 'Escribe «lunes», «mañana» o «en 3 días» y pondré la fecha por ti.');
    $('#dialogTitle').textContent = task ? 'Ajustemos los detalles' : '¿Qué tienes en mente?';
    $('#dialogEyebrow').textContent = task ? 'EDITAR ACTIVIDAD' : 'UN NUEVO PASITO';
    $('#saveButtonLabel').textContent = task ? 'Guardar cambios' : 'Guardar actividad';
    updateBirthdayOptions();
    if (typeof taskDialog.showModal === 'function') taskDialog.showModal();
    else taskDialog.setAttribute('open', '');
    window.setTimeout(() => $('#taskTitle').focus(), 70);
  }

  function closeTaskDialog() {
    if (taskDialog.open) taskDialog.close();
    editingId = null;
  }

  function updateBirthdayOptions() {
    const isBirthday = $('#taskType').value === 'birthday';
    $('#birthdayOptions').hidden = !isBirthday;
    if (isBirthday && !$('#taskDate').value) $('#taskDate').value = localISO();
    renderBirthdayPhotoPreview();
  }

  function saveTask(event) {
    event.preventDefault();
    const title = $('#taskTitle').value.trim();
    if (!title) {
      $('#taskTitle').focus();
      return;
    }
    const type = $('#taskType').value;
    const date = $('#taskDate').value || null;
    if (type === 'birthday' && !date) {
      showToast('Elige la fecha del cumpleaños para poder recordarlo.');
      $('#taskDate').focus();
      return;
    }
    const existing = editingId ? tasks.find(task => task.id === editingId) : null;
    const reminderValue = $('#taskReminder').value;
    const task = {
      id: existing?.id || generateImportId(),
      title,
      notes: $('#taskNotes').value.trim(),
      type,
      date,
      time: $('#taskTime').value || null,
      category: $('#taskCategory').value,
      priority: $('#taskPriority').value,
      reminderMinutes: reminderValue === '' ? null : Number(reminderValue),
      repeatYearly: type === 'birthday' ? $('#repeatYearly').checked : false,
      photoDataUrl: type === 'birthday' ? birthdayPhotoDataUrl : null,
      completed: existing?.completed || false,
      completedAt: existing?.completedAt || null,
      createdAt: existing?.createdAt || new Date().toISOString()
    };
    const previousTasks = tasks;
    if (existing) tasks = tasks.map(item => item.id === existing.id ? task : item);
    else tasks = [task, ...tasks];
    if (!persistTasks()) {
      tasks = previousTasks;
      return;
    }
    closeTaskDialog();
    birthdayPhotoDataUrl = '';
    render();
    showToast(existing ? 'Cambios guardados con cariño.' : type === 'birthday' ? 'Cumpleaños guardado. ¡A celebrar!' : 'Actividad guardada. Un paso a la vez.');
    checkReminders();
  }

  function handleTaskAction(event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const card = button.closest('.task-card');
    const task = tasks.find(item => item.id === card?.dataset.id);
    if (!task) return;
    const action = button.dataset.action;
    if (action === 'toggle') {
      task.completed = !task.completed;
      task.completedAt = task.completed ? new Date().toISOString() : null;
      persistTasks();
      const shouldExitPending = task.completed && currentView !== 'completed' && currentStatus === 'pending';
      if (shouldExitPending) {
        card.classList.add('is-completed');
        button.setAttribute('aria-pressed', 'true');
        button.setAttribute('aria-label', 'Marcar como pendiente');
        showToast('¡Una menos! Celebra ese pequeño logro.');
        setTimeout(render, 520);
      } else {
        render();
        showToast(task.completed ? '¡Una menos! Celebra ese pequeño logro.' : 'Volvió a tu lista de pendientes.');
      }
    } else if (action === 'edit') {
      openTaskDialog('task', task);
    } else if (action === 'delete') {
      const confirmed = window.confirm(`¿Eliminar “${task.title}”? Esta acción no se puede deshacer.`);
      if (!confirmed) return;
      card.classList.add('is-removing');
      setTimeout(() => {
        tasks = tasks.filter(item => item.id !== task.id);
        persistTasks();
        render();
        showToast('Actividad eliminada.');
      }, 210);
    }
  }

  function updateNotificationUI() {
    const button = $('#notificationButton');
    const enabled = 'Notification' in window && Notification.permission === 'granted';
    button.classList.toggle('is-enabled', enabled);
    button.title = enabled ? 'Notificaciones activadas' : 'Activar notificaciones';
    button.setAttribute('aria-label', enabled ? 'Notificaciones activadas' : 'Activar notificaciones');
    const copy = $('.reminder-copy p');
    if (enabled) copy.textContent = 'Los avisos de tus actividades están activados en este dispositivo.';
  }

  async function enableNotifications() {
    if (!('Notification' in window)) {
      showToast('Este navegador no permite notificaciones. Puedes instalar Luma en otro navegador compatible.');
      return;
    }
    if (Notification.permission === 'granted') {
      showToast('Las notificaciones ya están activadas. Elige un aviso al crear cada actividad.');
      return;
    }
    if (Notification.permission === 'denied') {
      showToast('El permiso está bloqueado. Puedes habilitarlo desde los ajustes del navegador.');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      updateNotificationUI();
      if (permission === 'granted') {
        showToast('Notificaciones activadas. Elige un aviso en tus actividades.');
        checkReminders();
      } else {
        showToast('No se activaron los avisos. Puedes cambiarlo cuando quieras en el navegador.');
      }
    } catch (error) {
      showToast('No fue posible activar notificaciones en este navegador.');
    }
  }

  function readNotified() {
    try {
      return JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '[]');
    } catch (_) {
      return [];
    }
  }

  function getReminderTime(task) {
    if (!task.date || task.reminderMinutes === null || task.reminderMinutes === undefined) return null;
    const iso = effectiveDate(task);
    if (!iso) return null;
    const [year, month, day] = iso.split('-').map(Number);
    const [hour, minute] = (task.time || '09:00').split(':').map(Number);
    const due = new Date(year, month - 1, day, hour || 0, minute || 0, 0, 0);
    return due.getTime() - Number(task.reminderMinutes) * 60000;
  }

  async function sendNotification(task, key) {
    const when = task.time ? ` · ${task.time}` : '';
    const body = task.type === 'birthday' ? `Hoy es el día de ${task.title.replace(/^Cumpleaños de\s+/i, '')} 🎂` : `${task.title}${when}`;
    const options = {
      body,
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: `luma-${key}`,
      renotify: false,
      data: { url: './' }
    };
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        if (registration.showNotification) {
          await registration.showNotification(task.type === 'birthday' ? 'Un cumpleaños para celebrar 🎂' : 'Un recordatorio de Luma', options);
          return;
        }
      }
      new Notification(task.type === 'birthday' ? 'Un cumpleaños para celebrar 🎂' : 'Un recordatorio de Luma', options);
    } catch (error) {
      console.warn('No se pudo mostrar la notificación.', error);
    }
  }

  function checkReminders() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const now = Date.now();
    const alreadySent = readNotified();
    let changed = false;
    tasks.filter(task => !task.completed).forEach(task => {
      const reminderTime = getReminderTime(task);
      if (!reminderTime) return;
      const delay = now - reminderTime;
      const key = `${task.id}:${effectiveDate(task)}`;
      // La ventana corta evita avisos inesperados al reabrir la app horas después.
      if (delay >= 0 && delay <= 10 * 60 * 1000 && !alreadySent.includes(key)) {
        alreadySent.push(key);
        changed = true;
        sendNotification(task, key);
      }
    });
    if (changed) {
      try { localStorage.setItem(NOTIFIED_KEY, JSON.stringify(alreadySent.slice(-250))); } catch (_) { /* sin acción */ }
    }
  }

  function openHelp(destination = '') {
    if (!helpDialog.open) {
      if (typeof helpDialog.showModal === 'function') helpDialog.showModal();
      else helpDialog.setAttribute('open', '');
    }
    updateInstallCopy();
    const target = destination === 'backup' ? $('#backupPanel') : destination === 'install' ? $('#installInstructions') : null;
    if (target) window.setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 90);
  }

  function updateInstallButton() {
    const button = $('#installAppButton');
    const installed = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
    if (installed) {
      button.hidden = true;
      return;
    }
    button.hidden = false;
    const label = button.querySelector('span');
    if (deferredInstallPrompt) {
      button.title = 'Instalar Luma en este dispositivo';
      button.setAttribute('aria-label', 'Instalar Luma en este dispositivo');
      if (label) label.textContent = window.innerWidth <= 390 ? 'Instalar' : 'Instalar app';
    } else {
      button.title = 'Ver cómo instalar Luma';
      button.setAttribute('aria-label', 'Ver cómo instalar Luma en este dispositivo');
      if (label) label.textContent = window.innerWidth <= 390 ? 'Instalar' : 'Instalar app';
    }
  }

  function makeBackup() {
    const payload = {
      format: 'luma-backup',
      version: 2,
      app: 'Luma',
      exportedAt: new Date().toISOString(),
      tasks,
      notes
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `luma-respaldo-${localISO()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    showToast(`Respaldo descargado: ${tasks.length} actividades y ${notes.length} notas.`);
  }

  function generateImportId() {
    return globalThis.crypto?.randomUUID?.() || `luma-import-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function normalizeImageDataUrl(value, description = 'imagen') {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'string' || !/^data:image\/(?:jpeg|png|webp);base64,/i.test(value)) throw new Error(`La ${description} del respaldo no es válida.`);
    if (value.length > 360000) throw new Error(`La ${description} ocupa demasiado espacio. Vuelve a exportar desde Luma para comprimirla.`);
    return value;
  }

  function normalizeImportedTask(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('El archivo contiene una actividad con formato incorrecto.');
    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    if (!title) throw new Error('Cada actividad del respaldo debe tener un nombre.');

    const date = raw.date === null || raw.date === undefined || raw.date === '' ? null : String(raw.date);
    if (date) {
      const parsed = dateFromISO(date);
      if (!parsed || isoFromDate(parsed) !== date) throw new Error(`La fecha «${date}» no es válida.`);
    }
    const type = raw.type === 'birthday' ? 'birthday' : 'task';
    if (type === 'birthday' && !date) throw new Error(`El cumpleaños «${title}» no tiene fecha.`);
    const time = raw.time === null || raw.time === undefined || raw.time === '' ? null : String(raw.time);
    if (time && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error(`La hora de «${title}» no es válida.`);
    const allowedReminders = [0, 10, 30, 60, 1440];
    const reminderMinutes = raw.reminderMinutes === null || raw.reminderMinutes === undefined || raw.reminderMinutes === '' ? null : Number(raw.reminderMinutes);
    if (reminderMinutes !== null && !allowedReminders.includes(reminderMinutes)) throw new Error(`El aviso de «${title}» no es compatible.`);
    const category = Object.keys(CATEGORIES).includes(raw.category) ? raw.category : 'personal';
    const priority = ['normal', 'important', 'urgent'].includes(raw.priority) ? raw.priority : 'normal';
    const id = typeof raw.id === 'string' && /^[A-Za-z0-9._:-]{1,120}$/.test(raw.id) ? raw.id : generateImportId();
    const completed = Boolean(raw.completed);
    const completedAt = completed && typeof raw.completedAt === 'string' && !Number.isNaN(Date.parse(raw.completedAt)) ? raw.completedAt : null;
    const createdAt = typeof raw.createdAt === 'string' && !Number.isNaN(Date.parse(raw.createdAt)) ? raw.createdAt : new Date().toISOString();
    return {
      id, title, notes: typeof raw.notes === 'string' ? raw.notes : '', type, date, time, category, priority, reminderMinutes,
      repeatYearly: type === 'birthday' ? raw.repeatYearly !== false : false,
      photoDataUrl: type === 'birthday' ? normalizeImageDataUrl(raw.photoDataUrl, 'foto del cumpleaños') : null,
      completed, completedAt, createdAt
    };
  }

  function normalizeImportedNote(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('El archivo contiene una nota con formato incorrecto.');
    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    const body = typeof raw.body === 'string' ? raw.body : '';
    if (!title && !body && !Array.isArray(raw.images)) throw new Error('Cada nota del respaldo debe tener texto o una imagen.');
    const images = Array.isArray(raw.images) ? raw.images.slice(0, 3).map((image, index) => normalizeImageDataUrl(image, `imagen ${index + 1} de la nota`)) : [];
    if (Array.isArray(raw.images) && raw.images.length > 3) throw new Error('Una nota del respaldo supera el máximo de 3 imágenes.');
    const createdAt = typeof raw.createdAt === 'string' && !Number.isNaN(Date.parse(raw.createdAt)) ? raw.createdAt : new Date().toISOString();
    const updatedAt = typeof raw.updatedAt === 'string' && !Number.isNaN(Date.parse(raw.updatedAt)) ? raw.updatedAt : createdAt;
    const id = typeof raw.id === 'string' && /^[A-Za-z0-9._:-]{1,120}$/.test(raw.id) ? raw.id : generateImportId();
    return { id, title, body, images, createdAt, updatedAt };
  }

  function mergeRecords(existingRows, incomingRows) {
    const map = new Map(existingRows.map(item => [item.id, item]));
    let added = 0;
    let updated = 0;
    for (const item of incomingRows) {
      if (map.has(item.id)) updated++;
      else added++;
      map.set(item.id, item);
    }
    return { rows: [...map.values()], added, updated };
  }

  function ensureUniqueIds(rows, description) {
    const ids = new Set();
    for (const row of rows) {
      if (ids.has(row.id)) throw new Error(`El respaldo repite identificadores de ${description}.`);
      ids.add(row.id);
    }
  }

  async function importBackup(file) {
    if (!file) return;
    if (file.size > 30 * 1024 * 1024) {
      showToast('El archivo supera el límite de 30 MB.');
      return;
    }
    try {
      const payload = JSON.parse(await file.text());
      const importedRows = Array.isArray(payload) ? payload : payload?.tasks;
      const importedNoteRows = Array.isArray(payload?.notes) ? payload.notes : [];
      if (!Array.isArray(importedRows)) throw new Error('No encontramos una lista de actividades en ese archivo.');
      if (importedRows.length > 10000 || importedNoteRows.length > 10000) throw new Error('El respaldo supera el máximo de 10.000 elementos.');
      if (payload?.format === 'luma-backup' && Number(payload.version) > 2) throw new Error('Este respaldo se creó con una versión más reciente de Luma.');

      const incomingTasks = importedRows.map(normalizeImportedTask);
      const incomingNotes = importedNoteRows.map(normalizeImportedNote);
      ensureUniqueIds(incomingTasks, 'actividades');
      ensureUniqueIds(incomingNotes, 'notas');
      const mergedTasks = mergeRecords(tasks, incomingTasks);
      const mergedNotes = mergeRecords(notes, incomingNotes);
      const message = `Se agregarán ${mergedTasks.added} actividades y ${mergedNotes.added} notas. Las coincidencias se actualizarán; el resto de tus datos se conservará. ¿Continuar?`;
      if (!window.confirm(message)) return;

      const oldTasks = tasks;
      const oldNotes = notes;
      tasks = mergedTasks.rows;
      notes = mergedNotes.rows;
      if (!persistTasks() || !persistNotes()) {
        tasks = oldTasks;
        notes = oldNotes;
        persistTasks();
        persistNotes();
        return;
      }
      render();
      showToast(`Respaldo importado: ${mergedTasks.added} actividades y ${mergedNotes.added} notas nuevas.`);
    } catch (error) {
      showToast(error instanceof SyntaxError ? 'Ese archivo no parece ser un JSON válido.' : (error.message || 'No se pudo importar el respaldo.'));
    } finally {
      $('#importInput').value = '';
    }
  }

  function closeHelp() {
    if (helpDialog.open) helpDialog.close();
  }

  function updateInstallCopy() {
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const copy = $('#installCopy');
    if (deferredInstallPrompt) {
      copy.textContent = 'Instala Luma en este dispositivo para abrirla desde tu pantalla de inicio y usarla como app.';
    } else if (isIOS) {
      copy.textContent = 'Abre esta página por HTTPS en Safari, toca Compartir y luego «Añadir a pantalla de inicio». Así podrás abrir Luma como una app.';
    } else {
      copy.textContent = 'La página debe estar abierta por HTTPS o localhost. En Chrome o Edge, usa el icono de instalación de la barra o el menú → «Instalar Luma». En iPhone/iPad: abre en Safari → Compartir → Añadir a pantalla de inicio.';
    }
  }

  async function installApp() {
    if (!deferredInstallPrompt) {
      openHelp('install');
      updateInstallCopy();
      return;
    }
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    updateInstallButton();
    closeHelp();
    showToast(choice?.outcome === 'accepted' ? 'Luma se está instalando en tu dispositivo.' : 'Puedes instalar Luma más adelante.');
  }

  function selectView(view) {
    currentView = view;
    currentStatus = view === 'completed' ? 'done' : 'pending';
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setHeaderDate() {
    const now = new Date();
    const full = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
    $('#topDate').textContent = capitalize(full);
    const weekday = new Intl.DateTimeFormat('es-CO', { weekday: 'long' }).format(now).toLocaleUpperCase('es-CO');
    const month = new Intl.DateTimeFormat('es-CO', { month: 'long' }).format(now).toLocaleUpperCase('es-CO');
    $('#heroDate').textContent = `HOY · ${weekday} ${now.getDate()} DE ${month}`;
  }

  // Navegación y accesos rápidos
  $$('.nav-item').forEach(button => button.addEventListener('click', () => selectView(button.dataset.view)));
  $$('[data-view-link]').forEach(button => button.addEventListener('click', event => {
    event.preventDefault();
    selectView(button.dataset.viewLink);
  }));
  $$('.toggle-option').forEach(button => button.addEventListener('click', () => {
    currentStatus = button.dataset.status;
    render();
  }));
  $('#addTaskButton').addEventListener('click', () => openTaskDialog());
  $('#addNoteButton').addEventListener('click', () => openNoteDialog());
  $('#addFirstNoteButton').addEventListener('click', () => {
    if (searchTerm) { searchTerm = ''; $('#searchInput').value = ''; render(); }
    else openNoteDialog();
  });
  $('#topAddButton').addEventListener('click', () => currentView === 'notes' ? openNoteDialog() : currentView === 'birthdays' ? openTaskDialog('birthday') : openTaskDialog());
  $('#emptyAddButton').addEventListener('click', () => {
    if (searchTerm) {
      searchTerm = '';
      $('#searchInput').value = '';
      render();
    } else if (currentView === 'completed' || currentStatus === 'done') {
      currentView = 'all';
      currentStatus = 'pending';
      render();
    } else {
      openTaskDialog(currentView === 'birthdays' ? 'birthday' : 'task');
    }
  });

  // Controles del calendario anual de cumpleaños
  $('#prevYearBtn')?.addEventListener('click', () => {
    calendarYear--;
    selectedBdayDayKey = null;
    renderBirthdaysCalendar();
  });
  $('#nextYearBtn')?.addEventListener('click', () => {
    calendarYear++;
    selectedBdayDayKey = null;
    renderBirthdaysCalendar();
  });
  $('#todayYearBtn')?.addEventListener('click', () => {
    calendarYear = new Date().getFullYear();
    selectedBdayDayKey = null;
    renderBirthdaysCalendar();
  });
  $('#addBirthdayCalendarButton')?.addEventListener('click', () => openTaskDialog('birthday'));
  $('#emptyAddBirthdayBtn')?.addEventListener('click', () => openTaskDialog('birthday'));

  $('#birthdaysCalendarGrid')?.addEventListener('click', event => {
    const cell = event.target.closest('[data-bday-key]');
    if (!cell) return;
    const key = cell.dataset.bdayKey;
    selectedBdayDayKey = selectedBdayDayKey === key ? null : key;
    renderBirthdaysCalendar();
  });

  $('#bdayDetailPanel')?.addEventListener('click', event => {
    if (event.target.closest('#closeBdayDetailBtn')) {
      selectedBdayDayKey = null;
      renderBirthdaysCalendar();
      return;
    }
    const editBtn = event.target.closest('[data-bday-action="edit"]');
    if (editBtn) {
      const task = tasks.find(t => t.id === editBtn.dataset.id);
      if (task) openTaskDialog('birthday', task);
      return;
    }
    const delBtn = event.target.closest('[data-bday-action="delete"]');
    if (delBtn) {
      const task = tasks.find(t => t.id === delBtn.dataset.id);
      if (task) {
        if (!window.confirm(`¿Eliminar el cumpleaños de “${getBirthdayDisplayName(task)}”?`)) return;
        tasks = tasks.filter(t => t.id !== task.id);
        persistTasks();
        selectedBdayDayKey = null;
        render();
        showToast('Cumpleaños eliminado.');
      }
    }
  });

  $('#bdaySummaryList')?.addEventListener('click', event => {
    const editBtn = event.target.closest('[data-bday-action="edit"]');
    if (editBtn) {
      event.stopPropagation();
      const task = tasks.find(t => t.id === editBtn.dataset.id);
      if (task) openTaskDialog('birthday', task);
      return;
    }
    const delBtn = event.target.closest('[data-bday-action="delete"]');
    if (delBtn) {
      event.stopPropagation();
      const task = tasks.find(t => t.id === delBtn.dataset.id);
      if (task) {
        if (!window.confirm(`¿Eliminar el cumpleaños de “${getBirthdayDisplayName(task)}”?`)) return;
        tasks = tasks.filter(t => t.id !== task.id);
        persistTasks();
        selectedBdayDayKey = null;
        render();
        showToast('Cumpleaños eliminado.');
      }
      return;
    }
    const item = event.target.closest('.bday-summary-item');
    if (item && item.dataset.bdayKey) {
      selectedBdayDayKey = item.dataset.bdayKey;
      renderBirthdaysCalendar();
      const panel = $('#bdayDetailPanel');
      if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });
  taskList.addEventListener('click', handleTaskAction);
  $('#notesGrid').addEventListener('click', handleNoteAction);
  $('#noteImagePreviews').addEventListener('click', handleNoteAction);
  $('#closeDialog').addEventListener('click', closeTaskDialog);
  $('#cancelDialog').addEventListener('click', closeTaskDialog);
  $('#taskType').addEventListener('change', updateBirthdayOptions);
  $('#taskTitle').addEventListener('input', syncTitleDate);
  $('#taskSmartDate').addEventListener('input', handleSmartDateInput);
  $('#taskDate').addEventListener('change', () => {
    dateSource = 'manual';
    $('#taskSmartDate').value = '';
    setSmartDateFeedback($('#taskDate').value ? `Fecha elegida: ${capitalize(formatLongDate($('#taskDate').value))}.` : 'Escribe «lunes», «mañana» o «en 3 días» y pondré la fecha por ti.', $('#taskDate').value ? 'success' : '');
  });
  $('#birthdayPhotoInput').addEventListener('change', event => handleBirthdayPhoto(event.target.files?.[0]));
  $('#removeBirthdayPhoto').addEventListener('click', () => { birthdayPhotoDataUrl = ''; renderBirthdayPhotoPreview(); });
  taskForm.addEventListener('submit', saveTask);
  noteForm.addEventListener('submit', saveNote);
  $('#addNoteImageButton').addEventListener('click', () => $('#noteImagesInput').click());
  $('#noteImagesInput').addEventListener('change', event => addNoteImages(event.target.files));
  $('#closeNoteDialog').addEventListener('click', closeNoteDialog);
  $('#cancelNoteDialog').addEventListener('click', closeNoteDialog);
  noteDialog.addEventListener('click', event => { if (event.target === noteDialog) closeNoteDialog(); });
  noteDialog.addEventListener('close', () => { editingNoteId = null; });
  taskDialog.addEventListener('click', event => { if (event.target === taskDialog) closeTaskDialog(); });
  taskDialog.addEventListener('close', () => { editingId = null; });

  $('#searchInput').addEventListener('input', event => {
    searchTerm = event.target.value.trim();
    render();
  });
  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      $('#searchInput').focus();
    }
    if (event.key === 'Escape' && helpDialog.open) closeHelp();
  });

  $('#notificationButton').addEventListener('click', enableNotifications);
  $('#railNotificationButton').addEventListener('click', enableNotifications);
  $('#helpButton').addEventListener('click', openHelp);
  $('#backupQuickButton').addEventListener('click', () => openHelp('backup'));
  $('#installAppButton').addEventListener('click', installApp);
  window.addEventListener('resize', updateInstallButton);
  $('#exportButton').addEventListener('click', makeBackup);
  $('#importButton').addEventListener('click', () => $('#importInput').click());
  $('#importInput').addEventListener('change', event => importBackup(event.target.files?.[0]));
  $('#closeHelp').addEventListener('click', closeHelp);
  $('#closeHelpSecondary').addEventListener('click', closeHelp);
  $('#installButton').addEventListener('click', installApp);
  helpDialog.addEventListener('click', event => { if (event.target === helpDialog) closeHelp(); });

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    updateInstallCopy();
    updateInstallButton();
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    updateInstallButton();
    showToast('Luma quedó instalada. ¡Qué bueno tenerte por aquí!');
  });

  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkReminders(); });
  window.addEventListener('focus', checkReminders);

  setHeaderDate();
  updateInstallButton();
  render();

  // Sincronización transparente con IndexedDB (migración y carga sin límite de 5MB)
  (async () => {
    try {
      const idbTasks = await loadFromIDB('tasks');
      const idbNotes = await loadFromIDB('notes');
      let changed = false;
      if (Array.isArray(idbTasks) && idbTasks.length > 0) {
        tasks = idbTasks;
        changed = true;
      } else if (tasks.length > 0) {
        saveToIDB('tasks', tasks);
      }
      if (Array.isArray(idbNotes) && idbNotes.length > 0) {
        notes = idbNotes;
        changed = true;
      } else if (notes.length > 0) {
        saveToIDB('notes', notes);
      }
      if (changed) {
        render();
      }
    } catch (e) {
      console.warn('Sincronización IndexedDB omitida.', e);
    }
  })();

  if ('serviceWorker' in navigator && /^https?:$/.test(window.location.protocol)) {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showToast('Hay una nueva versión de Luma disponible.', () => {
                newWorker.postMessage({ type: 'SKIP_WAITING' });
              }, 'Actualizar');
            }
          });
        }
      });
    }).catch(error => console.warn('No se pudo activar el modo sin conexión.', error));

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }
  checkReminders();
  window.setInterval(checkReminders, 20000);
})();
