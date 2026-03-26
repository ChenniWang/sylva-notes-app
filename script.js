// ===== Data =====
function readStorage(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
        console.warn(`Failed to parse localStorage key: ${key}`, e);
        return fallback;
    }
}

let holeNotes   = readStorage('myHoleNotes', []);
let userTasks   = readStorage('myTasks', []);
let noteTags    = readStorage('myNoteTags', readStorage('myTags', []));
let taskTags    = readStorage('myTaskTags', []);
let appSettings = readStorage('mySettings', {
    dark: false,
    themeColor: '#c9a84c',
    font: 'serif',
    display: 'both',
    guideSeen: false
});

let currentViewDate       = new Date();
let currentCalendarMode   = 'date';
let currentSelectedImages = [];
let currentEditingId      = null;   // current note id being edited
let currentEditingTaskId  = null;   // current task id being edited
let pendingCompleteTaskId = null;   // pending task id awaiting completion confirmation
let selectedColorForNewTag = null;
let tagPickerTarget       = 'note'; // 'note' | 'task'
let tagManagerTarget      = 'note'; // 'note' | 'task'
let doneSectionOpen       = false;

// ===== Colors & Fonts =====
const PRESET_COLORS = ['#c98f7c','#d4a84a','#6dab7f','#4f86cf','#a07cbf','#c97891','#7a9e8e','#bf8c5e','#6b7fa3','#a0a87a'];
const THEME_PRESETS = ['#c9a84c','#c98f7c','#6dab7f','#4f86cf','#a07cbf','#c97891'];

const FONTS = [
    { key: 'serif',  label: 'Serif',     preview: 'Noto Serif SC',   className: 'font-serif' },
    { key: 'round',  label: 'Rounded', preview: 'ZCOOL XiaoWei',   className: 'font-round' },
    { key: 'kai',    label: 'Handwritten', preview: 'ZCOOL KuaiLe', className: 'font-kai'   },
    { key: 'system', label: 'System', preview: 'PingFang / SF',   className: 'font-system'},
];

// ===== Initialization =====
if (taskTags.length === 0 && userTasks.some(task => task.tagId != null) && noteTags.length > 0) {
    taskTags = noteTags.map(tag => ({ ...tag }));
}

function getTagsForTarget(target = 'note') {
    return target === 'task' ? taskTags : noteTags;
}

function findTagById(tagId, target = 'note') {
    return getTagsForTarget(target).find(tag => tag.id === tagId);
}

function updateTagModalLabels(target = 'note') {
    const isTask = target === 'task';
    const folderTitle = document.querySelector('#folders-modal .folders-header span');
    const pickerTitle = document.querySelector('#tag-picker-modal .folders-header span');
    const managerTitle = document.querySelector('#tag-manager-modal .folders-header span');
    const managerBtn = document.querySelector('#tag-picker-modal .manage-tags-btn');
    const newTagName = document.getElementById('new-tag-name');
    const clearBtn = document.querySelector('#folders-modal .clear-filter');

    if (folderTitle) folderTitle.innerText = isTask ? 'Task categories' : 'Note tags';
    if (pickerTitle) pickerTitle.innerText = isTask ? 'Select task category' : 'Select note tag';
    if (managerTitle) managerTitle.innerText = isTask ? 'Manage task categories' : 'Manage note tags';
    if (managerBtn) managerBtn.innerText = isTask ? 'Manage task categories' : 'Manage note tags';
    if (newTagName) newTagName.placeholder = isTask ? 'Category name' : 'Tag name';
    if (clearBtn) clearBtn.innerText = isTask ? 'Show all tasks' : 'Show all notes';
}

let currentEditingImages = [];
let hasDrawnRandomNote = false;

const ARCHIVE_TAG_NAME = 'Archive';
const ARCHIVE_TAG_COLOR = '#7a9e8e';

function normalizeSettings(settings = {}) {
    return {
        dark: !!settings.dark,
        themeColor: settings.themeColor || '#c9a84c',
        font: settings.font || 'serif',
        display: settings.display || 'both',
        guideSeen: !!settings.guideSeen
    };
}

appSettings = normalizeSettings(appSettings);

function ensureArchiveTag() {
    let archiveTag = noteTags.find(tag => tag && tag.name === ARCHIVE_TAG_NAME);
    if (!archiveTag) {
        archiveTag = { id: Date.now() + 1, name: ARCHIVE_TAG_NAME, color: ARCHIVE_TAG_COLOR, system: true };
        noteTags.unshift(archiveTag);
    } else if (!archiveTag.color) {
        archiveTag.color = ARCHIVE_TAG_COLOR;
    }
    return archiveTag;
}

function getArchiveTag() {
    return ensureArchiveTag();
}

function getVisibleNotes() {
    return holeNotes.filter(note => !note.archived);
}

function isArchiveTag(tag) {
    return !!tag && tag.name === ARCHIVE_TAG_NAME;
}

function getTagBarColor(tag, fallback = 'var(--border)') {
    return isArchiveTag(tag) ? 'var(--border)' : (tag ? tag.color : fallback);
}

function getTagBadgeMarkup(tag) {
    if (!tag) return '';
    if (isArchiveTag(tag)) {
        return `<span class="item-tag-badge archive-tag-badge">${tag.name}</span>`;
    }
    return `<span class="item-tag-badge" style="background:${tag.color}22;color:${tag.color};border:1px solid ${tag.color}44">${tag.name}</span>`;
}

function getFolderDotStyle(tag) {
    if (!tag || isArchiveTag(tag)) return 'background:var(--border)';
    return `background:${tag.color}`;
}

function getNotesByTag(tag) {
    if (isArchiveTag(tag)) {
        return holeNotes.filter(note => note.archived);
    }
    return getVisibleNotes().filter(note => note.tagId === tag.id);
}

function collectPhotoEntries(notes) {
    const entries = [];
    notes.forEach(note => {
        if (!Array.isArray(note.images)) return;
        note.images.forEach((src, index) => {
            entries.push({
                src,
                noteId: note.id,
                noteDate: note.displayTime,
                index
            });
        });
    });
    return entries;
}

ensureArchiveTag();

function bindInputShortcuts() {
    const noteInput = document.getElementById('note-input');
    if (noteInput && !noteInput.dataset.shortcutBound) {
        noteInput.dataset.shortcutBound = 'true';
        noteInput.addEventListener('keydown', e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveNote(); }
        });
        noteInput.addEventListener('input', function() { autoResizeTextarea(this); });
    }
    if (noteInput) autoResizeTextarea(noteInput);

    const taskInput = document.getElementById('task-input');
    if (taskInput && !taskInput.dataset.shortcutBound) {
        taskInput.dataset.shortcutBound = 'true';
        taskInput.addEventListener('keydown', e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveTask(); }
        });
        taskInput.addEventListener('input', function() { autoResizeTextarea(this); });
    }
    if (taskInput) autoResizeTextarea(taskInput);
}

window.onload = () => {
    applySettings(appSettings);
    ensureArchiveTag();
    renderList(getVisibleNotes());
    renderTaskList();
    renderColorSwatches();
    renderThemePresets();
    renderFontOptions();
    applyDisplayPref(appSettings.display);
    bindInputShortcuts();
    if (!appSettings.guideSeen) {
        setTimeout(() => openGuideModal(), 220);
    }
};

bindInputShortcuts();

// ===== Page Navigation =====
let currentPage = 'diary';

function switchPage(page) {
    currentPage = page;
    const pageDiary = document.getElementById('page-diary');
    const pageTasks = document.getElementById('page-tasks');
    const navDiary = document.getElementById('nav-diary');
    const navTasks = document.getElementById('nav-tasks');

    pageDiary.classList.toggle('active', page === 'diary');
    pageTasks.classList.toggle('active', page === 'tasks');
    navDiary.classList.toggle('active', page === 'diary');
    navTasks.classList.toggle('active', page === 'tasks');
    pageDiary.style.display = page === 'diary' ? 'flex' : 'none';
    pageTasks.style.display = page === 'tasks' ? 'flex' : 'none';

    // Hide note-only actions on the tasks page.
    ['search-toggle-btn','calendar-icon'].forEach(id => {
        document.getElementById(id).style.display = page === 'diary' ? '' : 'none';
    });
    document.getElementById('folders-btn').style.display = '';
    document.getElementById('folders-btn').title = page === 'tasks' ? 'Task categories' : 'Note tags';

    if (page === 'diary') {
        document.getElementById('status-text').innerText = 'All Notes';
    } else {
        document.getElementById('status-text').innerText = 'All Tasks';
    }
}

function goHome() {
    switchPage('diary');
    const searchBar = document.getElementById('search-bar');
    const searchBtn = document.getElementById('search-toggle-btn');
    const searchInput = document.getElementById('search-input');
    if (searchBar && searchBar.classList.contains('open')) searchBar.classList.remove('open');
    if (searchBtn) searchBtn.classList.remove('active');
    if (searchInput) searchInput.value = '';
    showAll();
}

// ===== Save Note =====
function saveNote() {
    const input = document.getElementById('note-input');
    const text = input.value.trim();
    if (!text && currentSelectedImages.length === 0) return;

    const now = new Date();
    const dateKey = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')}`;
    const timeStr = `${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`;

    holeNotes.unshift({ id: Date.now(), text, images: currentSelectedImages, fullDate: dateKey, displayTime: `${dateKey} ${timeStr}`, tagId: null });
    saveToStorage();

    input.value = '';
    autoResizeTextarea(input);
    currentSelectedImages = [];
    const imgBtn = document.getElementById('add-image-btn');
    imgBtn.innerHTML = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg>`;
    imgBtn.classList.remove('has-image');
    showAll(); input.focus();
}

// ===== Save Task =====
function saveTask() {
    const input = document.getElementById('task-input');
    const text = input.value.trim();
    if (!text) return;

    const now = new Date();
    const dateKey = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')}`;
    const timeStr = `${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`;

    userTasks.unshift({ id: Date.now(), title: text, note: '', done: false, fullDate: dateKey, displayTime: `${dateKey} ${timeStr}`, tagId: null });
    saveToStorage();

    input.value = '';
    autoResizeTextarea(input);
    renderTaskList(); input.focus();
}

// ===== Delete Note =====
function deleteCurrentNote() {
    if (!currentEditingId) return;
    if (confirm('Are you sure you want to permanently delete this note?')) {
        holeNotes = holeNotes.filter(n => n.id !== currentEditingId);
        saveToStorage(); closeModal(); showAll(); renderCalendar();
    }
}

// ===== Delete Task =====
function deleteCurrentTask() {
    if (!currentEditingTaskId) return;
    if (confirm('Are you sure you want to delete this task?')) {
        userTasks = userTasks.filter(t => t.id !== currentEditingTaskId);
        saveToStorage(); closeTaskDetail(); renderTaskList();
    }
}

function saveToStorage() {
    try {
        ensureArchiveTag();
        localStorage.setItem('myHoleNotes', JSON.stringify(holeNotes));
        localStorage.setItem('myTasks',     JSON.stringify(userTasks));
        localStorage.setItem('myNoteTags',  JSON.stringify(noteTags));
        localStorage.setItem('myTaskTags',  JSON.stringify(taskTags));
        localStorage.setItem('myTags',      JSON.stringify(noteTags));
        localStorage.setItem('mySettings',  JSON.stringify(appSettings));
    } catch(e) {
        alert('Local storage may be full, especially when there are many images. Consider exporting a .json backup before deleting some images or notes.');
    }
}

// ===== Render Note List =====
function renderList(data) {
    const list = document.getElementById('hole-list');
    list.innerHTML = '';

    if (data.length === 0) {
        list.innerHTML = `<div class="empty-state"><div class="emoji">🌱</div><p>No notes yet<br>Write something and Sylva will save it for you</p></div>`;
        return;
    }

    data.forEach(item => {
        const tag = findTagById(item.tagId, 'note');
        const li = document.createElement('li');
        li.className = 'hole-item';
        li.onclick = () => showDetails(item);

        let imgHtml = '';
        if (item.images && item.images.length > 0) {
            imgHtml = `<div class="image-grid grid-${Math.min(item.images.length,9)}">`;
            item.images.slice(0,9).forEach(src => { imgHtml += `<img src="${src}" class="grid-img">`; });
            imgHtml += `</div>`;
        }

        const tagBadge = getTagBadgeMarkup(tag);

        li.innerHTML = `
            <div class="card-tag-bar" style="background:${getTagBarColor(tag)}"></div>
            <div class="card-body">
                <div class="item-content">${escapeHtml(item.text)}</div>
                ${imgHtml}
                <div class="item-meta"><span class="item-time">🕒 ${item.displayTime}</span>${tagBadge}</div>
            </div>`;
        list.appendChild(li);
    });

    const endMarker = document.createElement('li');
    endMarker.className = 'list-end-marker';
    endMarker.textContent = 'No more notes';
    list.appendChild(endMarker);
    endMarker.textContent = 'No more notes';
}

// ===== Render Task List =====
function renderTaskList() {
    const pending = userTasks.filter(t => !t.done);
    const done    = userTasks
        .filter(t => t.done)
        .sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));

    const taskList = document.getElementById('task-list');
    const doneSection = document.getElementById('done-section');
    const doneList = document.getElementById('done-list');
    taskList.innerHTML = '';

    if (pending.length === 0 && done.length === 0) {
        taskList.innerHTML = `<div class="empty-state"><div class="emoji">📝</div><p>No tasks yet<br>Add your first task below</p></div>`;
    } else {
        pending.forEach(task => taskList.appendChild(createTaskCard(task, false)));
    }

    if (done.length > 0) {
        doneSection.style.display = 'block';
        doneList.innerHTML = '';
        done.forEach(task => doneList.appendChild(createTaskCard(task, true)));
        doneList.style.display = doneSectionOpen ? 'flex' : 'none';
    } else {
        doneSection.style.display = 'none';
        doneList.style.display = 'none';
    }
}

function renderFilteredTaskList(filteredTasks) {
    const pending = filteredTasks.filter(t => !t.done);
    const done = filteredTasks
        .filter(t => t.done)
        .sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));
    const taskList = document.getElementById('task-list');
    const doneSection = document.getElementById('done-section');
    const doneList = document.getElementById('done-list');

    taskList.innerHTML = '';
    if (filteredTasks.length === 0) {
        taskList.innerHTML = `<div class="empty-state"><div class="emoji">📂</div><p>No tasks in this category</p></div>`;
    } else {
        pending.forEach(task => taskList.appendChild(createTaskCard(task, false)));
    }

    if (done.length > 0) {
        doneSection.style.display = 'block';
        doneList.innerHTML = '';
        done.forEach(task => doneList.appendChild(createTaskCard(task, true)));
        doneList.style.display = doneSectionOpen ? 'flex' : 'none';
    } else {
        doneSection.style.display = 'none';
    }
}

function filterTaskByTag(tag) {
    const filtered = userTasks.filter(t => t.tagId === tag.id);
    document.getElementById('status-text').innerText = `Category: ${tag.name}`;
    renderFilteredTaskList(filtered);
}

function createTaskCard(task, isDone) {
    const tag = findTagById(task.tagId, 'task');
    const li = document.createElement('li');
    li.className = isDone ? 'task-done-item' : 'task-item';
    li.dataset.id = task.id;

    const tagBadge = getTagBadgeMarkup(tag);
    const notePreview = task.note ? `<div class="task-note-preview">${escapeHtml(task.note)}</div>` : '';

    if (isDone) {
        li.innerHTML = `
            <div class="card-tag-bar" style="background:${getTagBarColor(tag, '#4caf50')}"></div>
            <div class="task-item-front" onclick="showTaskDetail(${task.id})">
                <div class="task-check-zone">
                    <div class="task-check-circle checked"></div>
                </div>
                <div class="task-body">
                    <div class="task-title done-text">${escapeHtml(task.title)}</div>
                    ${notePreview}
                    <div class="task-meta"><span class="item-time">🕒 ${task.displayTime}</span>${tagBadge}</div>
                </div>
            </div>`;
    } else {
        li.innerHTML = `
            <div class="task-item-bg"><span>✓</span></div>
            <div class="card-tag-bar" style="background:${getTagBarColor(tag)}"></div>
            <div class="task-item-front">
                <div class="task-check-zone" onclick="requestCompleteTask(${task.id})">
                    <div class="task-check-circle"></div>
                </div>
                <div class="task-body" onclick="showTaskDetail(${task.id})">
                    <div class="task-title">${escapeHtml(task.title)}</div>
                    ${notePreview}
                    <div class="task-meta"><span class="item-time">🕒 ${task.displayTime}</span>${tagBadge}</div>
                </div>
            </div>`;

        // Swipe gesture for quick completion.
        addSwipeToComplete(li, task.id);
    }

    return li;
}

// ===== Swipe To Complete =====
function addSwipeToComplete(el, taskId) {
    const front = el.querySelector('.task-item-front');
    let startX = 0, currentX = 0, dragging = false;
    const THRESHOLD = 80;

    function onStart(x) { startX = x; dragging = true; el.classList.add('swiping'); }
    function onMove(x) {
        if (!dragging) return;
        currentX = Math.min(0, x - startX);
        front.style.transform = `translateX(${currentX}px)`;
    }
    function onEnd() {
        if (!dragging) return;
        dragging = false;
        el.classList.remove('swiping');
        if (currentX < -THRESHOLD) {
            front.style.transform = `translateX(-100%)`;
            setTimeout(() => requestCompleteTask(taskId), 180);
        } else {
            front.style.transform = '';
        }
        currentX = 0;
    }

    // Touch
    el.addEventListener('touchstart', e => onStart(e.touches[0].clientX), { passive: true });
    el.addEventListener('touchmove',  e => onMove(e.touches[0].clientX),  { passive: true });
    el.addEventListener('touchend',   onEnd);

    // Mouse
    el.addEventListener('mousedown', e => onStart(e.clientX));
    window.addEventListener('mousemove', e => { if (dragging) onMove(e.clientX); });
    window.addEventListener('mouseup', onEnd);
}

// ===== Completion Confirmation =====
function requestCompleteTask(taskId) {
    const task = userTasks.find(t => t.id === taskId);
    if (!task) return;
    pendingCompleteTaskId = taskId;
    document.getElementById('confirm-task-name').innerText = task.title;
    showModal('complete-confirm-modal');
}

function confirmCompleteTask() {
    const task = userTasks.find(t => t.id === pendingCompleteTaskId);
    hideModal('complete-confirm-modal');
    if (task) {
        task.done = true;
        task.completedAt = new Date().toISOString();
        saveToStorage();
        renderTaskList();
    }
    pendingCompleteTaskId = null;
}

function cancelCompleteTask() {
    hideModal('complete-confirm-modal');
    pendingCompleteTaskId = null;
    renderTaskList(); // Reset card position.
}

// ===== Completed Section =====
function toggleDoneSection() {
    doneSectionOpen = !doneSectionOpen;
    const doneList = document.getElementById('done-list');
    const label    = document.getElementById('done-toggle-label');
    doneList.style.display = doneSectionOpen ? 'flex' : 'none';
    label.innerText = doneSectionOpen ? '▼ Completed' : '▶ Completed';
}

// ===== Task Detail Modal =====
function showTaskDetail(taskId) {
    const task = userTasks.find(t => t.id === taskId);
    if (!task) return;
    currentEditingTaskId = taskId;
    const restoreBtn = document.getElementById('task-restore-btn');

    const tag = findTagById(task.tagId, 'task');
    document.getElementById('task-modal-tag-strip').style.background = getTagBarColor(tag, 'var(--accent-light)');
    document.getElementById('task-modal-title').innerText = task.title;
    document.getElementById('task-modal-note').innerText  = task.note || '';
    document.getElementById('task-modal-time').innerText  = task.displayTime;
    if (restoreBtn) {
        restoreBtn.style.display = task.done ? 'inline-flex' : 'none';
        restoreBtn.innerText = 'Restore';
    }

    document.getElementById('task-view-mode').style.display = 'block';
    document.getElementById('task-edit-mode').style.display = 'none';

    showModal('task-detail-modal');
}

function closeTaskDetail() { hideModal('task-detail-modal'); currentEditingTaskId = null; }

function toggleCurrentTaskDone() {
    const task = userTasks.find(t => t.id === currentEditingTaskId);
    if (!task) return;
    task.done = !task.done;

    if (task.done) {
        task.completedAt = new Date().toISOString();
    } else {
        task.completedAt = null;
    }

    saveToStorage();
    renderTaskList();

    if (task.done) {
        closeTaskDetail();
        return;
    }

    showTaskDetail(task.id);
}

function enterTaskEditMode() {
    const task = userTasks.find(t => t.id === currentEditingTaskId);
    if (!task) return;
    document.getElementById('task-edit-title').value = task.title;
    document.getElementById('task-edit-note').value  = task.note || '';
    document.getElementById('task-view-mode').style.display = 'none';
    document.getElementById('task-edit-mode').style.display = 'block';
    document.getElementById('task-edit-title').focus();
}

function cancelTaskEdit() {
    document.getElementById('task-view-mode').style.display = 'block';
    document.getElementById('task-edit-mode').style.display = 'none';
}

function saveTaskEdit() {
    const task = userTasks.find(t => t.id === currentEditingTaskId);
    if (!task) return;
    const newTitle = document.getElementById('task-edit-title').value.trim();
    if (!newTitle) { alert('Task title cannot be empty.'); return; }
    task.title = newTitle;
    task.note  = document.getElementById('task-edit-note').value.trim();
    saveToStorage();
    document.getElementById('task-modal-title').innerText = task.title;
    document.getElementById('task-modal-note').innerText  = task.note;
    cancelTaskEdit();
    renderTaskList();
}

// ===== Task Tag Picker =====
function openTaskTagPicker() {
    tagPickerTarget = 'task';
    tagManagerTarget = 'task';
    updateTagModalLabels('task');
    const task = userTasks.find(t => t.id === currentEditingTaskId);
    renderTagPickerList(task ? task.tagId : null);
    showModal('tag-picker-modal');
}

// ===== Note Detail Modal =====
function showDetails(note) {
    currentEditingId = note.id;
    const tag = findTagById(note.tagId, 'note');
    const archiveBtn = document.getElementById('modal-archive-btn');
    document.getElementById('modal-tag-strip').style.background = getTagBarColor(tag, 'var(--accent-light)');
    document.getElementById('modal-text').innerText = note.text || '';

    const container = document.getElementById('modal-image-container');
    container.innerHTML = '';
    if (note.images && note.images.length > 0) {
        container.className = 'modal-image-grid';
        note.images.forEach((src, index) => {
            const img = document.createElement('img');
            img.src = src; img.className = 'grid-img'; img.style.cursor = 'zoom-in';
            img.onclick = e => { e.stopPropagation(); openImagePreview(note.images, index); };
            container.appendChild(img);
        });
    } else { container.className = ''; }

    document.getElementById('modal-time').innerText = note.displayTime;
        if (archiveBtn) {
        archiveBtn.disabled = false;
        archiveBtn.innerText = note.archived ? 'Unarchive' : 'Archive';
        archiveBtn.style.opacity = '';
        archiveBtn.style.cursor = '';
    }
    document.getElementById('view-mode').style.display  = 'block';
    document.getElementById('edit-mode').style.display  = 'none';
    showModal('details-modal');
}

function closeModal() { hideModal('details-modal'); currentEditingId = null; }

function archiveCurrentNote() {
    const note = holeNotes.find(n => n.id === currentEditingId);
    if (!note) return;
    if (note.archived) {
        note.archived = false;
        if (isArchiveTag(findTagById(note.tagId, 'note'))) note.tagId = null;
    } else {
        const archiveTag = getArchiveTag();
        note.archived = true;
        note.tagId = archiveTag.id;
    }
    saveToStorage();
    showAll();
    showDetails(note);
}

function enterEditMode() {
    const note = holeNotes.find(n => n.id === currentEditingId);
    if (!note) return;
    document.getElementById('edit-textarea').value = note.text;
    currentEditingImages = Array.isArray(note.images) ? [...note.images] : [];
    renderEditImageList();
    document.getElementById('view-mode').style.display = 'none';
    document.getElementById('edit-mode').style.display = 'block';
    document.getElementById('edit-textarea').focus();
}

function cancelEdit() {
    currentEditingImages = [];
    document.getElementById('view-mode').style.display = 'block';
    document.getElementById('edit-mode').style.display = 'none';
}

function saveEdit() {
    const note = holeNotes.find(n => n.id === currentEditingId);
    if (!note) return;
    note.text = document.getElementById('edit-textarea').value.trim();
    note.images = [...currentEditingImages];
    saveToStorage();
    document.getElementById('modal-text').innerText = note.text;
    cancelEdit();
    showAll();
}

function renderEditImageList() {
    const sorter = document.getElementById('edit-image-sorter');
    const list = document.getElementById('edit-image-list');
    if (!sorter || !list) return;

    if (!currentEditingImages || currentEditingImages.length === 0) {
        sorter.style.display = 'none';
        list.innerHTML = '';
        return;
    }

    sorter.style.display = 'block';
    list.innerHTML = '';

    currentEditingImages.forEach((src, index) => {
        const item = document.createElement('div');
        item.className = 'edit-image-item';
        item.innerHTML = `
            <img class="edit-image-thumb" src="${src}" alt="image-${index + 1}">
            <div class="edit-image-meta">
                <div class="edit-image-index">Image ${index + 1}</div>
                <div class="edit-image-name">Adjust the display order</div>
            </div>
            <div class="edit-image-actions">
                <button class="edit-image-move-btn" type="button" ${index === 0 ? 'disabled' : ''} onclick="moveEditImage(${index}, -1)">←</button>
                <button class="edit-image-move-btn" type="button" ${index === currentEditingImages.length - 1 ? 'disabled' : ''} onclick="moveEditImage(${index}, 1)">→</button>
            </div>
        `;
        list.appendChild(item);
    });
}

function moveEditImage(index, direction) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= currentEditingImages.length) return;
    [currentEditingImages[index], currentEditingImages[nextIndex]] = [currentEditingImages[nextIndex], currentEditingImages[index]];
    renderEditImageList();
}

// ===== Search =====
function toggleSearch() {
    const bar = document.getElementById('search-bar');
    const btn = document.getElementById('search-toggle-btn');
    const isOpen = bar.classList.contains('open');
    if (isOpen) {
        bar.classList.remove('open'); btn.classList.remove('active');
        document.getElementById('search-input').value = ''; showAll();
    } else {
        bar.classList.add('open'); btn.classList.add('active');
        setTimeout(() => document.getElementById('search-input').focus(), 350);
    }
}

function handleSearch(query) {
    const q = query.trim().toLowerCase();
    if (!q) { showAll(); return; }
    const filtered = getVisibleNotes().filter(n => (n.text && n.text.toLowerCase().includes(q)) || (n.displayTime && n.displayTime.includes(q)));
    document.getElementById('status-text').innerText = `Search "${query}" · ${filtered.length}`;
    renderList(filtered);
}

function clearSearch() { document.getElementById('search-input').value = ''; handleSearch(''); }

// ===== Note Tag Picker =====
function openTagPicker() {
    tagPickerTarget = 'note';
    tagManagerTarget = 'note';
    updateTagModalLabels('note');
    const note = holeNotes.find(n => n.id === currentEditingId);
    renderTagPickerList(note ? note.tagId : null);
    showModal('tag-picker-modal');
}

function renderTagPickerList(currentTagId) {
    const list = document.getElementById('tag-picker-list');
    list.innerHTML = '';

    const noTag = document.createElement('div');
    noTag.className = 'tag-picker-item' + (!currentTagId ? ' selected' : '');
    noTag.innerHTML = `<div class="folder-dot" style="background:#ddd"></div><span class="folder-name">No tag</span>`;
    noTag.onclick = () => { applyTag(null); closeTagPicker(); };
    list.appendChild(noTag);

    const tags = getTagsForTarget(tagPickerTarget);
    tags.forEach(tag => {
        const div = document.createElement('div');
        const isSystemArchive = tagManagerTarget === 'note' && isArchiveTag(tag);
        div.className = 'tag-picker-item' + (currentTagId === tag.id ? ' selected' : '');
        div.innerHTML = `<div class="folder-dot" style="${getFolderDotStyle(tag)}"></div><span class="folder-name">${escapeHtml(tag.name)}</span>`;
        div.onclick = () => { applyTag(tag.id); closeTagPicker(); };
        list.appendChild(div);
    });

    if (tags.length === 0) {
        list.innerHTML += `<p style="font-size:13px;color:var(--text-muted);text-align:center;padding:10px 0;">No tags yet. Create one first.</p>`;
    }
}

function applyTag(tagId) {
    if (tagPickerTarget === 'note') {
        const note = holeNotes.find(n => n.id === currentEditingId);
        if (!note) return;
        const selectedTag = findTagById(tagId, 'note');
        note.tagId = tagId;
        note.archived = isArchiveTag(selectedTag);
        if (note.archived) note.tagId = getArchiveTag().id;
        saveToStorage();
        const tag = findTagById(note.tagId, 'note');
        document.getElementById('modal-tag-strip').style.background = getTagBarColor(tag, 'var(--accent-light)');
        showAll();
    } else {
        const task = userTasks.find(t => t.id === currentEditingTaskId);
        if (!task) return;
        task.tagId = tagId; saveToStorage();
        const tag = findTagById(tagId, 'task');
        document.getElementById('task-modal-tag-strip').style.background = getTagBarColor(tag, 'var(--accent-light)');
        renderTaskList();
    }
}

function closeTagPicker() { hideModal('tag-picker-modal'); }

// ===== Folders =====
function toggleFolders() {
    const m = document.getElementById('folders-modal');
    const target = currentPage === 'tasks' ? 'task' : 'note';
    if (m.classList.contains('show')) { hideModal('folders-modal'); }
    else {
        tagManagerTarget = target;
        updateTagModalLabels(target);
        renderFolders(target);
        showModal('folders-modal');
    }
}

function renderFolders(target = 'note') {
    const list = document.getElementById('folders-list');
    const tags = getTagsForTarget(target);
    list.innerHTML = '';
    if (tags.length === 0) {
        list.innerHTML = `<p style="font-size:13px;color:var(--text-muted);text-align:center;padding:16px 0;">No tags yet.<br>Use the button below to create one.</p>`;
        return;
    }
    tags.forEach(tag => {
        const count = target === 'task' ? userTasks.filter(t => t.tagId === tag.id).length : getNotesByTag(tag).length;
        const div = document.createElement('div');
        div.className = 'folder-item';
        div.innerHTML = `<div class="folder-dot" style="${getFolderDotStyle(tag)}"></div><span class="folder-name">${escapeHtml(tag.name)}</span><span class="folder-count">${count}</span>`;
        div.onclick = () => {
            if (target === 'task') filterTaskByTag(tag);
            else filterByTag(tag);
            hideModal('folders-modal');
        };
        list.appendChild(div);
    });
}

function filterByTag(tag) {
    const filtered = getNotesByTag(tag);
    document.getElementById('status-text').innerText = `Tag ${tag.name} · ${filtered.length}`;
    renderList(filtered);
}

// ===== Tag Management =====
function openTagManager(target = tagManagerTarget) {
    tagManagerTarget = target;
    updateTagModalLabels(target);
    renderTagManager();
    showModal('tag-manager-modal');
}
function closeTagManager() { hideModal('tag-manager-modal'); }

function renderTagManager() {
    const list = document.getElementById('existing-tags-list');
    const tags = getTagsForTarget(tagManagerTarget);
    list.innerHTML = '';
    if (tags.length === 0) {
        list.innerHTML = `<p style="font-size:13px;color:var(--text-muted);padding:8px 0 14px;">No tags yet. Create one below.</p>`;
        return;
    }
    tags.forEach(tag => {
        const div = document.createElement('div');
        div.className = 'existing-tag-row';
        div.innerHTML = `<div class="existing-tag-dot" style="${getFolderDotStyle(tag)}"></div><span class="existing-tag-name">${escapeHtml(tag.name)}</span><button class="delete-tag-btn" onclick="deleteTag(${tag.id})">✕</button>`;
        list.appendChild(div);
    });
}

function deleteTag(tagId) {
    if (!confirm('Deleting this tag will untag any notes and tasks that use it. Are you sure?')) return;
    if (tagManagerTarget === 'task') {
        taskTags = taskTags.filter(t => t.id !== tagId);
        userTasks.forEach(t => { if (t.tagId === tagId) t.tagId = null; });
    } else {
        const tagToDelete = noteTags.find(t => t.id === tagId);
        if (isArchiveTag(tagToDelete)) {
            alert('Archive is a system folder and cannot be deleted.');
            return;
        }
        noteTags = noteTags.filter(t => t.id !== tagId);
        holeNotes.forEach(n => { if (n.tagId === tagId) n.tagId = null; });
    }
    saveToStorage(); renderTagManager(); showAll(); renderTaskList();
}

function renderColorSwatches() {
    const container = document.getElementById('color-swatches');
    container.innerHTML = '';
    PRESET_COLORS.forEach(color => {
        const div = document.createElement('div');
        div.className = 'color-swatch'; div.style.background = color;
        div.onclick = () => {
            document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
            div.classList.add('selected'); selectedColorForNewTag = color;
        };
        container.appendChild(div);
    });
}

function createNewTag() {
    const name = document.getElementById('new-tag-name').value.trim();
    const tags = getTagsForTarget(tagManagerTarget);
    if (!name) { alert('Please enter a tag name.'); return; }
    if (!selectedColorForNewTag) { alert('Please select a color.'); return; }
    if (tags.some(t => t.name === name)) { alert('A tag with this name already exists.'); return; }
    tags.push({ id: Date.now(), name, color: selectedColorForNewTag });
    saveToStorage();
    document.getElementById('new-tag-name').value = '';
    selectedColorForNewTag = null;
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
    renderTagManager();
}

// ===== Time Deck System =====
let currentCardIndex = 0;
const DECK_CARD_COUNT = 4;

function toggleCalendar() {
    const m = document.getElementById('calendar-modal');
    if (m.classList.contains('show')) {
        hideModal('calendar-modal');
    } else {
        showModal('calendar-modal');
        try {
            renderCalendar();
            goToCard(0, false);
            renderStats();
            initDeckSwipe();
        } catch (e) {
            console.error('toggleCalendar failed', e);
        }
    }
}

function goToCard(index, animate = true) {
    currentCardIndex = Math.max(0, Math.min(index, DECK_CARD_COUNT - 1));
    const track = document.getElementById('deck-track');
    if (track) {
        const viewportWidth = track.parentElement?.clientWidth || 0;
        track.classList.remove('dragging');
        track.style.transition = animate ? '' : 'none';
        if (viewportWidth) track.style.transform = `translate3d(${-currentCardIndex * viewportWidth}px, 0, 0)`;
        else track.style.transform = `translateX(${-currentCardIndex * 100}%)`;
        if (!animate) requestAnimationFrame(() => { track.style.transition = ''; });
    }
    document.querySelectorAll('.deck-dot').forEach((d, i) => d.classList.toggle('active', i === currentCardIndex));

    // Render only the active card when needed.
    if (currentCardIndex === 1) renderOnThisDayView();
    if (currentCardIndex === 2) resetRandomNoteDisplay();
    if (currentCardIndex === 3) renderStats();
}

function initDeckSwipe() {
    const track = document.getElementById('deck-track');
    const surface = document.querySelector('#calendar-modal .timeless-shell');
    if (!track || !surface || surface._swipeInit) return;
    surface._swipeInit = true;

    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let pointerDown = false;
    let horizontalLocked = false;
    let verticalLocked = false;
    let gestureStartTime = 0;
    let startedOnInteractive = false;

    const getViewportWidth = () => track.parentElement?.clientWidth || surface.clientWidth || 0;
    const isInteractiveTarget = target => !!target?.closest?.('button, input, textarea, select, label, a');
    const isAtBoundary = deltaX =>
        (currentCardIndex === 0 && deltaX > 0) ||
        (currentCardIndex === DECK_CARD_COUNT - 1 && deltaX < 0);

    const applyDrag = deltaX => {
        const viewportWidth = getViewportWidth();
        if (!viewportWidth) return;
        const dampedDelta = isAtBoundary(deltaX) ? deltaX * 0.35 : deltaX;
        const baseOffset = -currentCardIndex * viewportWidth;
        track.classList.add('dragging');
        track.style.transform = `translate3d(${baseOffset + dampedDelta}px, 0, 0)`;
    };

    const resetGesture = () => {
        pointerDown = false;
        horizontalLocked = false;
        verticalLocked = false;
        startedOnInteractive = false;
    };

    const startGesture = (clientX, clientY, target) => {
        startX = clientX;
        startY = clientY;
        currentX = clientX;
        gestureStartTime = Date.now();
        pointerDown = true;
        horizontalLocked = false;
        verticalLocked = false;
        startedOnInteractive = isInteractiveTarget(target);
    };

    const moveGesture = (clientX, clientY, event) => {
        if (!pointerDown) return;
        currentX = clientX;
        const deltaX = clientX - startX;
        const deltaY = clientY - startY;
        const lockThreshold = startedOnInteractive ? 14 : 8;

        if (!horizontalLocked && !verticalLocked) {
            if (Math.abs(deltaX) < lockThreshold && Math.abs(deltaY) < lockThreshold) return;
            if (Math.abs(deltaX) > Math.abs(deltaY) * 1.1) horizontalLocked = true;
            else {
                verticalLocked = true;
                return;
            }
        }

        if (verticalLocked) return;
        event.preventDefault();
        applyDrag(deltaX);
    };

    const endGesture = clientX => {
        if (!pointerDown) return;
        const deltaX = clientX - startX;
        const elapsed = Math.max(Date.now() - gestureStartTime, 1);
        const velocity = deltaX / elapsed;
        const viewportWidth = getViewportWidth();
        const passedDistance = viewportWidth > 0 && Math.abs(deltaX) > viewportWidth * 0.18;
        const passedVelocity = Math.abs(velocity) > 0.45;

        track.classList.remove('dragging');

        if (!horizontalLocked) {
            resetGesture();
            goToCard(currentCardIndex);
            return;
        }

        let nextIndex = currentCardIndex;
        if ((passedDistance || passedVelocity) && !isAtBoundary(deltaX)) {
            nextIndex = deltaX < 0 ? currentCardIndex + 1 : currentCardIndex - 1;
        }

        resetGesture();
        goToCard(nextIndex);
    };

    surface.addEventListener('touchstart', e => {
        const touch = e.touches[0];
        startGesture(touch.clientX, touch.clientY, e.target);
    }, { passive: true });

    surface.addEventListener('touchmove', e => {
        const touch = e.touches[0];
        moveGesture(touch.clientX, touch.clientY, e);
    }, { passive: false });

    surface.addEventListener('touchend', e => {
        const touch = e.changedTouches[0];
        endGesture(touch ? touch.clientX : currentX);
    });

    surface.addEventListener('touchcancel', () => {
        resetGesture();
        goToCard(currentCardIndex);
    });

    // Keep mouse dragging behavior aligned with touch gestures.
    surface.addEventListener('mousedown', e => {
        startGesture(e.clientX, e.clientY, e.target);
    });

    window.addEventListener('mousemove', e => {
        moveGesture(e.clientX, e.clientY, e);
    });

    window.addEventListener('mouseup', e => {
        endGesture(e.clientX);
    });

    window.addEventListener('resize', () => {
        goToCard(currentCardIndex, false);
    });
}

function renderCalendar() {
    const grid = document.getElementById('calendar-days');
    const title = document.getElementById('current-month-year');
    grid.innerHTML = '';
    const y = currentViewDate.getFullYear(), m = currentViewDate.getMonth();
    title.innerText = `${y}-${String(m + 1).padStart(2, '0')}`;
    const first = new Date(y, m, 1).getDay();
    const last  = new Date(y, m+1, 0).getDate();
    for (let i = 0; i < first; i++) grid.appendChild(document.createElement('div'));
    for (let d = 1; d <= last; d++) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'day'; dayDiv.innerText = d;
        const fd = `${y}-${(m+1).toString().padStart(2,'0')}-${d.toString().padStart(2,'0')}`;
        if (getVisibleNotes().some(n => n.fullDate === fd)) dayDiv.classList.add('has-note');
        dayDiv.onclick = e => { e.stopPropagation(); filterByDate(fd); hideModal('calendar-modal'); };
        grid.appendChild(dayDiv);
    }
}

// ===== Calendar Rendering =====

function changeMonth(s) { currentViewDate.setMonth(currentViewDate.getMonth() + s); renderCalendar(); }

// ===== Random Memory =====
let lastRandomId = null;

function resetRandomNoteDisplay() {
    const display = document.getElementById('random-note-display');
    const drawBtn = document.getElementById('random-draw-btn');
    if (!display) return;
    hasDrawnRandomNote = false;
    display.innerHTML = `
        <div class="random-empty">
            <div style="font-size:48px;margin-bottom:12px">🎲</div>
            <p>Click the button below to draw a random note</p>
        </div>`;
    if (drawBtn) drawBtn.innerText = 'Draw';
}

function drawRandomNote(showEmpty = true) {
    const display = document.getElementById('random-note-display');
    const drawBtn = document.getElementById('random-draw-btn');
    if (!display) return;

    const visibleNotes = getVisibleNotes();
    const pool = visibleNotes.filter(n => n.id !== lastRandomId);
    if (pool.length === 0 && visibleNotes.length === 0) {
        if (drawBtn) drawBtn.innerText = 'Draw';
        display.innerHTML = `<div class="random-empty"><div style="font-size:32px;margin-bottom:10px">🌱</div><p>No notes yet<br>Write something first</p></div>`;
        return;
    }
    hasDrawnRandomNote = true;
    if (drawBtn) drawBtn.innerText = 'Draw again';
    const source = pool.length > 0 ? pool : visibleNotes;
    const note = source[Math.floor(Math.random() * source.length)];
    lastRandomId = note.id;

    const tag = findTagById(note.tagId, 'note');
    const tagHtml = getTagBadgeMarkup(tag);
    const hasImg = note.images && note.images.length > 0;
    const imageCount = hasImg ? note.images.length : 0;
    const extraThumbs = hasImg && note.images.length > 1
        ? `<div class="random-thumb-strip">${note.images.slice(0, 3).map(src => `<img src="${src}" class="random-thumb" alt="thumb">`).join('')}</div>`
        : '';

    display.innerHTML = `
        <div class="random-card" onclick="openRandomNote(${note.id})">
            ${hasImg ? `
                <div class="random-card-media">
                    <img src="${note.images[0]}" class="random-card-img" alt="random-note-image">
                    <span class="random-image-count">${imageCount} images</span>
                </div>
            ` : ''}
            <div class="random-card-body">
                <div class="random-card-text">${escapeHtml(note.text || '(This note has no text)')}</div>
                ${extraThumbs}
                <div class="random-card-meta">
                    <span class="item-time">🗓 ${note.displayTime}</span>
                    ${tagHtml}
                </div>
            </div>
        </div>`;
}

function openRandomNote(noteId) {
    const note = holeNotes.find(n => n.id === noteId);
    if (!note) return;
    hideModal('calendar-modal');
    showDetails(note);
}

// ===== Statistics =====
function renderStats() {
    const panel = document.getElementById('stats-panel');
    if (!panel) return;

    const statsNotes = getVisibleNotes();
    if (statsNotes.length === 0) {
        panel.innerHTML = `
            <div class="empty-state">
                <div class="emoji">📊</div>
                <p>No notes available for statistics yet<br>Write one first and come back later</p>
            </div>`;
        return;
    }

    const total = statsNotes.length;
    const totalChars = statsNotes.reduce((s, n) => s + (n.text ? n.text.length : 0), 0);
    const today = new Date();
    const monthKey = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}`;
    const monthCount = statsNotes.filter(n => typeof n.fullDate === 'string' && n.fullDate.startsWith(monthKey)).length;
    const photoNotes = statsNotes.filter(n => Array.isArray(n.images) && n.images.length > 0);
    const photoRatio = Math.round((photoNotes.length / total) * 100);
    const photoImages = collectPhotoEntries(photoNotes);

    // Count the current writing streak in days.
    let streak = 0;
    for (let i = 0; i < 365; i++) {
        const d = new Date(today); d.setDate(d.getDate() - i);
        const key = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`;
        if (statsNotes.some(n => n.fullDate === key)) streak++;
        else if (i > 0) break;
    }

    // Find the most frequently used tag.
    const tagCount = {};
    statsNotes.forEach(n => { if (n.tagId) tagCount[n.tagId] = (tagCount[n.tagId] || 0) + 1; });
    const topTagId = Object.keys(tagCount).sort((a,b) => tagCount[b] - tagCount[a])[0];
    const topTag = topTagId ? findTagById(parseInt(topTagId), 'note') : null;

    // Build a heatmap covering the last six months.
    const heatmapData = {};
    statsNotes.forEach(n => { if (n.fullDate) heatmapData[n.fullDate] = (heatmapData[n.fullDate] || 0) + 1; });

    const weeks = 26;
    const cells = [];
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - (weeks * 7 - 1));

    for (let i = 0; i < weeks * 7; i++) {
        const d = new Date(startDate); d.setDate(d.getDate() + i);
        const key = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`;
        cells.push({ key, count: heatmapData[key] || 0 });
    }

    const maxCount = Math.max(...cells.map(c => c.count), 1);

    let heatmapHtml = '<div class="heatmap-grid">';
    cells.forEach(cell => {
        const intensity = cell.count === 0 ? 0 : Math.ceil((cell.count / maxCount) * 4);
        heatmapHtml += `<div class="heat-cell level-${intensity}" title="${cell.key}: ${cell.count} notes"></div>`;
    });
    heatmapHtml += '</div><div class="heatmap-legend"><span>Less</span><div class="heat-cell level-0"></div><div class="heat-cell level-1"></div><div class="heat-cell level-2"></div><div class="heat-cell level-3"></div><div class="heat-cell level-4"></div><span>More</span></div>';

    panel.innerHTML = `
        <div class="stats-grid">
            <div class="stat-card"><div class="stat-num">${total}</div><div class="stat-label">Total Notes</div></div>
            <div class="stat-card"><div class="stat-num">${totalChars.toLocaleString()}</div><div class="stat-label">Total Characters</div></div>
            <div class="stat-card"><div class="stat-num">${monthCount}</div><div class="stat-label">This Month</div></div>
            <div class="stat-card"><div class="stat-num">${streak}</div><div class="stat-label">Current Streak</div></div>
            <div class="stat-card">${topTag ? `<div class="stat-num" style="font-size:13px;color:${topTag.color}">${topTag.name}</div><div class="stat-label">Top Tag</div>` : `<div class="stat-num">-</div><div class="stat-label">No Tags Yet</div>`}</div>
            <button type="button" id="photo-ratio-card" data-action="photo-collection" class="stat-card stat-card-button ${photoImages.length > 0 ? '' : 'disabled'}" ${photoImages.length > 0 ? '' : 'disabled'}>
                <div class="stat-num">${photoRatio}%</div>
                <div class="stat-label">Notes With Photos</div>
            </button>
        </div>
        <div class="heatmap-section">
            <p class="heatmap-title">Writing Heatmap · Last 6 Months</p>
            ${heatmapHtml}
        </div>`;

    const photoRatioCard = document.getElementById('photo-ratio-card');
    if (photoRatioCard && photoImages.length > 0) {
        const openCollection = e => {
            if (e) {
                e.preventDefault?.();
                e.stopPropagation?.();
            }
            openPhotoCollection();
        };
        photoRatioCard.onclick = openCollection;
        photoRatioCard.onpointerup = openCollection;
        photoRatioCard.ontouchend = e => {
            openCollection(e);
        };
    }
}

function openPhotoCollection() {
    const photoNotes = getVisibleNotes().filter(n => Array.isArray(n.images) && n.images.length > 0);
    const images = collectPhotoEntries(photoNotes);

    if (images.length === 0) {
        alert('There are no notes with photos yet.');
        return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'photo-collection-overlay';
    overlay.innerHTML = `
        <div class="photo-collection-card">
            <div class="photo-collection-header">
                <div>
                    <div class="photo-collection-title">Photo Collection</div>
                    <div class="photo-collection-sub">${images.length} photos</div>
                </div>
                <button class="photo-collection-close" type="button">✕</button>
            </div>
            <div class="photo-collection-grid"></div>
        </div>`;

    const card = overlay.querySelector('.photo-collection-card');
    const grid = overlay.querySelector('.photo-collection-grid');
    const closeBtn = overlay.querySelector('.photo-collection-close');

    images.forEach((image, flatIndex) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'photo-collection-item';
        item.innerHTML = `
            <img src="${image.src}" alt="photo-${flatIndex + 1}">
            <span class="photo-collection-date">${image.noteDate}</span>`;
        item.onclick = e => {
            e.stopPropagation();
            openImagePreview(images.map(entry => entry.src), flatIndex);
        };
        grid.appendChild(item);
    });

    closeBtn.onclick = e => {
        e.stopPropagation();
        overlay.remove();
    };
    overlay.onclick = () => overlay.remove();
    card.onclick = e => e.stopPropagation();

    document.body.appendChild(overlay);
}

// ===== Export =====
function exportTxt() {
    if (holeNotes.length === 0) { alert('There are no notes to export yet.'); return; }
    let content = 'Sylva - Notes Export\n';
    content += `Exported at: ${new Date().toLocaleString()}\n`;
    content += `Total notes: ${holeNotes.length}\n`;
    content += '='.repeat(40) + '\n\n';
    holeNotes.forEach((n, i) => {
        content += `[${i + 1}] ${n.displayTime}\n`;
        if (n.text) content += n.text + '\n';
        if (n.images && n.images.length > 0) content += `(Includes ${n.images.length} image${n.images.length > 1 ? 's' : ''})\n`;
        content += '\n' + '-'.repeat(30) + '\n\n';
    });
    downloadFile('sylva-notes.txt', content, 'text/plain;charset=utf-8');
}

function exportJson() {
    const data = { exportTime: new Date().toISOString(), notes: holeNotes, tasks: userTasks, noteTags, taskTags, settings: appSettings };
    downloadFile('sylva-backup.json', JSON.stringify(data, null, 2), 'application/json');
}

function promptImportJson() {
    const input = document.getElementById('import-json-input');
    if (!input) return;
    input.value = '';
    input.click();
}

function handleImportFile(input) {
    const file = input.files && input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = event => {
        try {
            const data = JSON.parse(String(event.target?.result || '{}'));
            const nextNotes = Array.isArray(data.notes) ? data.notes : null;
            const nextTasks = Array.isArray(data.tasks) ? data.tasks : null;
            if (!nextNotes || !nextTasks) {
                alert('This backup file format is invalid.');
                return;
            }

            if (!confirm('Importing this backup will overwrite the current local data in this browser. Continue?')) return;

            holeNotes = nextNotes;
            userTasks = nextTasks;
            noteTags = Array.isArray(data.noteTags) ? data.noteTags : readStorage('myNoteTags', noteTags);
            taskTags = Array.isArray(data.taskTags) ? data.taskTags : [];
            appSettings = normalizeSettings({
                ...appSettings,
                ...(data.settings || {})
            });
            appSettings.guideSeen = true;

            ensureArchiveTag();
            saveToStorage();
            applySettings(appSettings);
            renderList(getVisibleNotes());
            renderTaskList();
            renderColorSwatches();
            renderThemePresets();
            renderFontOptions();
            applyDisplayPref(appSettings.display);
            goHome();
            hideModal('settings-modal');
            alert('Backup imported successfully.');
        } catch (e) {
            console.error('Import failed', e);
            alert('Import failed. Please make sure you selected a valid exported .json backup.');
        } finally {
            input.value = '';
        }
    };
    reader.readAsText(file, 'utf-8');
}

function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}



function renderOnThisDayView() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const mm = month.toString().padStart(2, '0');
    const dd = day.toString().padStart(2, '0');
    const label = document.getElementById('memory-date-label');
    const list = document.getElementById('memory-list');

    if (label) label.innerText = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (!list) return;

    const matches = getVisibleNotes()
        .filter(note => typeof note.fullDate === 'string' && note.fullDate.slice(5) === `${mm}-${dd}`)
        .sort((a, b) => (b.fullDate || '').localeCompare(a.fullDate || ''));

    list.innerHTML = '';
    if (matches.length === 0) {
        list.innerHTML = `<div class="memory-empty">No notes were written on this date yet.<br>Come back next year and take another look.</div>`;
        return;
    }

    matches.forEach(note => {
        const item = document.createElement('button');
        item.className = 'memory-item';
        item.type = 'button';
        item.innerHTML = `
            <div class="memory-year">${(note.fullDate || '').slice(0, 4)} · ${note.displayTime || ''}</div>
            <div class="memory-text">${escapeHtml(note.text || 'A photo was saved on this day.')}</div>
        `;
        item.onclick = () => {
            hideModal('calendar-modal');
            showDetails(note);
        };
        list.appendChild(item);
    });
}

function filterByDate(d) {
    const filtered = getVisibleNotes().filter(n => n.fullDate === d);
    document.getElementById('status-text').innerText = `Date ${d} · ${filtered.length}`;
    renderList(filtered);
}

function showAll() {
    document.getElementById('status-text').innerText = 'All Notes';
    renderList(getVisibleNotes());
}

// ===== Settings =====
function toggleSettings() {
    const m = document.getElementById('settings-modal');
    if (m.classList.contains('show')) { hideModal('settings-modal'); }
    else {
        renderThemePresets();
        renderFontOptions();
        syncSettingsUI();
        showModal('settings-modal');
    }
}

function openGuideModal(force = false) {
    showModal('guide-modal');
    if (force) return;
}

function closeGuideModal() {
    appSettings.guideSeen = true;
    saveToStorage();
    hideModal('guide-modal');
}

function syncSettingsUI() {
    document.getElementById('dark-mode-toggle').checked = appSettings.dark;
    document.getElementById('theme-color-picker').value  = appSettings.themeColor;
    document.querySelectorAll('.preset-color-dot').forEach(d => d.classList.toggle('active', d.dataset.color === appSettings.themeColor));
    document.querySelectorAll('.font-opt').forEach(b => b.classList.toggle('active', b.dataset.font === appSettings.font));
    document.querySelectorAll('.display-opt').forEach(b => b.classList.toggle('active', b.dataset.val === appSettings.display));
}

function applySettings(s) {
    document.body.classList.toggle('dark', s.dark);
    applyThemeColor(s.themeColor, false);
    applyFont(s.font, false);
    applyDisplayPref(s.display, false);
}

function toggleDarkMode(val) {
    appSettings.dark = val;
    document.body.classList.toggle('dark', val);
    saveToStorage();
}

function applyThemeColor(hex, save = true) {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    const darken = (v, amt) => Math.max(0, Math.min(255, Math.round(v * amt)));
    const mixWith = (v, target, amt) => Math.max(0, Math.min(255, Math.round(v * (1 - amt) + target * amt)));
    const toHex  = v => v.toString(16).padStart(2,'0');

    const dark  = `#${toHex(darken(r,0.78))}${toHex(darken(g,0.78))}${toHex(darken(b,0.78))}`;
    const pageBg = `#${toHex(mixWith(r, 250, 0.93))}${toHex(mixWith(g, 247, 0.93))}${toHex(mixWith(b, 241, 0.93))}`;
    const surface = `#${toHex(mixWith(r, 255, 0.955))}${toHex(mixWith(g, 254, 0.955))}${toHex(mixWith(b, 250, 0.955))}`;
    const bg = `#${toHex(mixWith(r, 253, 0.915))}${toHex(mixWith(g, 249, 0.915))}${toHex(mixWith(b, 243, 0.915))}`;
    const border = `#${toHex(mixWith(r, 240, 0.84))}${toHex(mixWith(g, 234, 0.84))}${toHex(mixWith(b, 221, 0.84))}`;
    const dim   = `#${toHex(Math.min(255,r+30))}${toHex(Math.min(255,g+25))}${toHex(Math.min(255,b+10))}`;

    document.documentElement.style.setProperty('--page-bg',      pageBg);
    document.documentElement.style.setProperty('--accent',       hex);
    document.documentElement.style.setProperty('--accent-dark',  dark);
    document.documentElement.style.setProperty('--surface',      surface);
    document.documentElement.style.setProperty('--bg',           bg);
    document.documentElement.style.setProperty('--border',       border);
    document.documentElement.style.setProperty('--accent-light', `${hex}28`);
    document.documentElement.style.setProperty('--accent-dim',   dim);

    if (save) { appSettings.themeColor = hex; saveToStorage(); }
    document.querySelectorAll('.preset-color-dot').forEach(d => d.classList.toggle('active', d.dataset.color === hex));
}

function renderThemePresets() {
    const container = document.getElementById('preset-theme-colors');
    if (!container) return;
    container.innerHTML = '';
    THEME_PRESETS.forEach(color => {
        const div = document.createElement('div');
        div.className = 'preset-color-dot'; div.style.background = color; div.dataset.color = color;
        if (color === appSettings.themeColor) div.classList.add('active');
        div.onclick = () => { applyThemeColor(color); document.getElementById('theme-color-picker').value = color; };
        container.appendChild(div);
    });
}

function applyFont(key, save = true) {
    FONTS.forEach(f => document.body.classList.remove(f.className));
    const font = FONTS.find(f => f.key === key) || FONTS[0];
    document.body.classList.add(font.className);
    if (save) { appSettings.font = key; saveToStorage(); }
    document.querySelectorAll('.font-opt').forEach(b => b.classList.toggle('active', b.dataset.font === key));
}

function renderFontOptions() {
    const container = document.getElementById('font-options');
    if (!container) return;
    container.innerHTML = '';
    FONTS.forEach(font => {
        const btn = document.createElement('button');
        btn.className = 'font-opt' + (appSettings.font === font.key ? ' active' : '');
        btn.dataset.font = font.key;
        btn.style.fontFamily = font.className.includes('round') ? "'ZCOOL XiaoWei'" : font.className.includes('kai') ? "'ZCOOL KuaiLe'" : '';
        btn.innerHTML = `<span>${font.label}</span><span class="font-preview">${font.preview}</span>`;
        btn.onclick = () => applyFont(font.key);
        container.appendChild(btn);
    });
}

function setDisplayPref(val, save = true) {
    applyDisplayPref(val, save);
    document.querySelectorAll('.display-opt').forEach(b => b.classList.toggle('active', b.dataset.val === val));
}

function applyDisplayPref(val, save = true) {
    const nav = document.getElementById('bottom-nav');
    const pageDiary = document.getElementById('page-diary');
    const pageTasks = document.getElementById('page-tasks');
    const navDiary = document.getElementById('nav-diary');
    const navTasks = document.getElementById('nav-tasks');

    nav.style.display = 'flex';
    nav.classList.toggle('single-mode', val !== 'both');
    navDiary.style.display = val === 'tasks' ? 'none' : 'flex';
    navTasks.style.display = val === 'diary' ? 'none' : 'flex';
    pageDiary.classList.toggle('page-single', val !== 'both');
    pageTasks.classList.toggle('page-single', val !== 'both');

    if (val === 'diary') {
        switchPage('diary');
    } else if (val === 'tasks') {
        switchPage('tasks');
    } else {
        nav.classList.remove('single-mode');
        navDiary.style.display = 'flex';
        navTasks.style.display = 'flex';
        pageDiary.classList.remove('page-single');
        pageTasks.classList.remove('page-single');
        pageDiary.style.display = '';
        pageTasks.style.display = '';
        if (currentPage === 'tasks') switchPage('tasks');
        else switchPage('diary');
    }
    if (save) { appSettings.display = val; saveToStorage(); }
}

// ===== Modal Helpers =====
function showModal(id) {
    const m = document.getElementById(id);
    m.style.display = 'flex';
    setTimeout(() => m.classList.add('show'), 10);
}

function hideModal(id) {
    const m = document.getElementById(id);
    m.classList.remove('show');
    setTimeout(() => { m.style.display = 'none'; }, 300);
}

// ===== Image Preview =====
function openImagePreview(images, startIndex = 0) {
    const photoList = Array.isArray(images) ? images : [images];
    let currentIndex = Math.max(0, Math.min(startIndex, photoList.length - 1));
    const overlay = document.createElement('div');
    overlay.id = 'image-preview-overlay';
    overlay.innerHTML = `
        <button class="image-preview-nav prev" type="button">‹</button>
        <img src="" alt="preview-image">
        <button class="image-preview-nav next" type="button">›</button>
        <div class="image-preview-counter"></div>`;

    const img = overlay.querySelector('img');
    const prevBtn = overlay.querySelector('.image-preview-nav.prev');
    const nextBtn = overlay.querySelector('.image-preview-nav.next');
    const counter = overlay.querySelector('.image-preview-counter');

    const renderPreview = () => {
        img.src = photoList[currentIndex];
        counter.textContent = `${currentIndex + 1} / ${photoList.length}`;
        prevBtn.style.display = photoList.length > 1 ? 'flex' : 'none';
        nextBtn.style.display = photoList.length > 1 ? 'flex' : 'none';
    };

    prevBtn.onclick = e => {
        e.stopPropagation();
        currentIndex = (currentIndex - 1 + photoList.length) % photoList.length;
        renderPreview();
    };

    nextBtn.onclick = e => {
        e.stopPropagation();
        currentIndex = (currentIndex + 1) % photoList.length;
        renderPreview();
    };

    overlay.onclick = () => overlay.remove();
    img.onclick = e => e.stopPropagation();
    counter.onclick = e => e.stopPropagation();

    renderPreview();
    document.body.appendChild(overlay);
    setTimeout(() => overlay.classList.add('show'), 10);
}

// ===== Image Upload =====
async function handleImageSelect(input) {
    const files = Array.from(input.files).slice(0, 9);
    if (files.length === 0) return;
    const btn = document.getElementById('add-image-btn');
    btn.innerHTML = 'Loading...';

    const results = await Promise.all(files.map(file => new Promise(resolve => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = e => {
            const img = new Image(); img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height, max = 800;
                if (w > h && w > max) { h *= max/w; w = max; } else if (h > max) { w *= max/h; h = max; }
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
        };
    })));

    currentSelectedImages = results;
    btn.innerHTML = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg>`;
    btn.classList.add('has-image');
    input.value = '';
}

// ===== Utilities =====
function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function autoResizeTextarea(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
}

function showAll() {
    if (currentPage === 'tasks') {
        document.getElementById('status-text').innerText = 'All Tasks';
        renderTaskList();
    } else {
        document.getElementById('status-text').innerText = 'All Notes';
        renderList(getVisibleNotes());
    }
}
