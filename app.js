/* ========================================
   Kindergarten Debt Manager — App Logic
   ======================================== */

// ============ DATA LAYER ============
const STORAGE_KEYS = {
    families: 'kdm_families',
    comments: 'kdm_comments',
    notifications: 'kdm_notifications',
    locations: 'kdm_locations',
    settings: 'kdm_settings',
    reminders: 'kdm_reminders'
};

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function loadData(key) {
    try {
        return JSON.parse(localStorage.getItem(key)) || [];
    } catch {
        return [];
    }
}

function saveData(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
}

// State
let families = loadData(STORAGE_KEYS.families);
let comments = loadData(STORAGE_KEYS.comments);
let notifications = loadData(STORAGE_KEYS.notifications);
let locations = loadData(STORAGE_KEYS.locations);
let reminders = loadData(STORAGE_KEYS.reminders);
let settings = (() => {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.settings)) || {};
    } catch { return {}; }
})();
let currentFamilyId = null;
let deleteCallback = null;
let currentView = 'full';
let pendingWaSend = null; // stores { message, familyName, fatherPhone, motherPhone } for picker

// ============ FORMATTERS ============
function formatDate(timestamp) {
    const d = new Date(timestamp);
    const date = d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    return `${date} ${time}`;
}

function formatCurrency(amount) {
    return `₪${Number(amount).toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatPhone(phone) {
    // Clean and format Israeli phone
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('972')) return cleaned;
    if (cleaned.startsWith('0')) return '972' + cleaned.slice(1);
    return '972' + cleaned;
}

// ============ TOAST NOTIFICATIONS ============
function showToast(message, type = 'success', actionHtml = '') {
    const container = document.getElementById('toastContainer');
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type]}</span>
        <span class="toast-message">${message}</span>
        ${actionHtml}
    `;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 300);
    }, actionHtml ? 10000 : 3000);
}

// ============ VIEW TOGGLE ============
document.querySelectorAll('.view-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.view-toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentView = btn.dataset.view;
        renderFamilies();
    });
});

// ============ MODAL HELPERS ============
function openModal(id) {
    document.getElementById(id).classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
    document.body.style.overflow = '';
}

// Close on overlay click
['familyModal', 'editCommentModal', 'deleteModal', 'commentsPanel', 'notificationsPanel', 'managementPanel', 'editLocationModal'].forEach(id => {
    document.getElementById(id).addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeModal(id);
    });
});

// ============ DASHBOARD ============
function updateDashboard() {
    document.getElementById('totalFamilies').textContent = families.length;
    const totalDebt = families.reduce((sum, f) => sum + Number(f.debtAmount), 0);
    document.getElementById('totalDebt').textContent = formatCurrency(totalDebt);
    document.getElementById('totalLocations').textContent = locations.length;
    const pending = notifications.filter(n => !n.isSent).length;
    document.getElementById('pendingNotifications').textContent = pending;

    // Update notification badge
    const badge = document.getElementById('notificationBadge');
    if (pending > 0) {
        badge.style.display = 'flex';
        badge.textContent = pending;
    } else {
        badge.style.display = 'none';
    }

    // Update location dropdowns
    updateLocationDropdowns();
}

function updateLocationDropdowns() {
    const sortedLocs = [...locations].sort((a, b) => a.name.localeCompare(b.name, 'he'));

    // Update filter bar
    const filterSelect = document.getElementById('locationFilter');
    const currentFilter = filterSelect.value;
    const filterOptions = ['<option value="">כל המיקומים</option>'];
    sortedLocs.forEach(loc => {
        filterOptions.push(`<option value="${escapeHtml(loc.name)}" ${loc.name === currentFilter ? 'selected' : ''}>${escapeHtml(loc.name)}</option>`);
    });
    filterSelect.innerHTML = filterOptions.join('');

    // Update family form location dropdown
    const formSelect = document.getElementById('location');
    const currentForm = formSelect.value;
    const formOptions = ['<option value="">בחר מיקום</option>'];
    sortedLocs.forEach(loc => {
        formOptions.push(`<option value="${escapeHtml(loc.name)}" ${loc.name === currentForm ? 'selected' : ''}>${escapeHtml(loc.name)}</option>`);
    });
    formSelect.innerHTML = formOptions.join('');
}

// ============ FAMILY RENDERING ============
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function renderFamilies() {
    const grid = document.getElementById('familiesGrid');
    const emptyState = document.getElementById('emptyState');
    const search = document.getElementById('searchInput').value.trim().toLowerCase();
    const locationFilter = document.getElementById('locationFilter').value;

    let filtered = families;

    if (search) {
        filtered = filtered.filter(f =>
            f.familyName.toLowerCase().includes(search) ||
            f.familyCode.toLowerCase().includes(search) ||
            f.phone.includes(search) ||
            f.fatherName.toLowerCase().includes(search) ||
            f.motherName.toLowerCase().includes(search)
        );
    }

    if (locationFilter) {
        filtered = filtered.filter(f => f.location === locationFilter);
    }

    // Clear existing cards (keep empty state)
    grid.querySelectorAll('.family-card').forEach(c => c.remove());

    if (filtered.length === 0) {
        emptyState.style.display = '';
        if (families.length > 0 && (search || locationFilter)) {
            emptyState.querySelector('h2').textContent = 'לא נמצאו תוצאות';
            emptyState.querySelector('p').textContent = 'נסה לשנות את החיפוש או הסינון';
            emptyState.querySelector('.empty-icon').textContent = '🔍';
        } else {
            emptyState.querySelector('h2').textContent = 'אין משפחות רשומות';
            emptyState.querySelector('p').textContent = 'לחץ על "הוסף משפחה" כדי להתחיל';
            emptyState.querySelector('.empty-icon').textContent = '📋';
        }
        return;
    }

    emptyState.style.display = 'none';

    filtered.forEach((f, idx) => {
        const commentsCount = comments.filter(c => c.familyId === f.id).length;
        const card = document.createElement('div');
        card.className = currentView === 'compact' ? 'family-card compact' : 'family-card';
        card.style.animationDelay = `${idx * 0.05}s`;

        if (currentView === 'compact') {
            card.innerHTML = `
                <div class="compact-row">
                    <span class="compact-name">${escapeHtml(f.familyName)}</span>
                    <span class="compact-code">${escapeHtml(f.familyCode)}</span>
                    <span class="compact-debt">${formatCurrency(f.debtAmount)}</span>
                    <button class="compact-menu-btn" data-id="${f.id}" onclick="toggleCompactMenu(event, '${f.id}')">⋮</button>
                </div>
                <div class="compact-context-menu" id="compactMenu-${f.id}" style="display:none">
                    <button onclick="openComments('${f.id}'); closeAllCompactMenus()">💬 הערות (${commentsCount})</button>
                    <button onclick="editFamily('${f.id}'); closeAllCompactMenus()">✏️ עריכה</button>
                    <button class="danger" onclick="confirmDeleteFamily('${f.id}'); closeAllCompactMenus()">🗑️ מחיקה</button>
                </div>
            `;
        } else {
            card.innerHTML = `
            <div class="card-header">
                <div class="card-title-section">
                    <span class="card-family-name">${escapeHtml(f.familyName)}</span>
                    <span class="card-family-code">${escapeHtml(f.familyCode)}</span>
                </div>
                <div class="card-debt">${formatCurrency(f.debtAmount)}</div>
            </div>
            <div class="card-details">
                <div class="card-detail">
                    <span class="card-detail-icon">👨</span>
                    <span class="card-detail-label">אב:</span>
                    <span class="card-detail-value">${escapeHtml(f.fatherName)}</span>
                </div>
                <div class="card-detail">
                    <span class="card-detail-icon">👩</span>
                    <span class="card-detail-label">אם:</span>
                    <span class="card-detail-value">${escapeHtml(f.motherName)}</span>
                </div>
                <div class="card-detail">
                    <span class="card-detail-icon">📞</span>
                    <span class="card-detail-label">אב:</span>
                    <span class="card-detail-value" dir="ltr">${f.fatherPhone ? escapeHtml(f.fatherPhone) : '-'}</span>
                    <span class="card-detail-label" style="margin-right:8px;">אם:</span>
                    <span class="card-detail-value" dir="ltr">${f.motherPhone ? escapeHtml(f.motherPhone) : '-'}</span>
                </div>
                <div class="card-detail">
                    <span class="card-detail-icon">📍</span>
                    <span class="card-detail-label">מיקום:</span>
                    <span class="card-detail-value">${escapeHtml(f.location)}</span>
                </div>
            </div>
            <div class="card-actions">
                <button class="btn btn-xs btn-secondary" onclick="openComments('${f.id}')">
                    💬 הערות (${commentsCount})
                </button>
                <button class="btn btn-xs btn-secondary" onclick="editFamily('${f.id}')">
                    ✏️ עריכה
                </button>
                <button class="btn btn-xs btn-secondary" onclick="confirmDeleteFamily('${f.id}')">
                    🗑️ מחיקה
                </button>
            </div>
        `;
        }
        grid.appendChild(card);
    });

    // Apply grid class based on view mode
    if (currentView === 'compact') {
        grid.classList.add('compact-view');
    } else {
        grid.classList.remove('compact-view');
    }
}

// ============ COMPACT CONTEXT MENU ============
function toggleCompactMenu(event, familyId) {
    event.stopPropagation();
    const menu = document.getElementById(`compactMenu-${familyId}`);
    const wasOpen = menu.style.display !== 'none';
    closeAllCompactMenus();
    if (!wasOpen) {
        menu.style.display = 'flex';
    }
}

function closeAllCompactMenus() {
    document.querySelectorAll('.compact-context-menu').forEach(m => m.style.display = 'none');
}

// Close menus on outside click
document.addEventListener('click', (e) => {
    if (!e.target.closest('.compact-menu-btn') && !e.target.closest('.compact-context-menu')) {
        closeAllCompactMenus();
    }
});

// ============ FAMILY CRUD ============
document.getElementById('addFamilyBtn').addEventListener('click', () => {
    document.getElementById('familyModalTitle').textContent = 'הוסף משפחה חדשה';
    document.getElementById('familyForm').reset();
    document.getElementById('familyId').value = '';
    openModal('familyModal');
});

document.getElementById('closeFamilyModal').addEventListener('click', () => closeModal('familyModal'));
document.getElementById('cancelFamilyBtn').addEventListener('click', () => closeModal('familyModal'));

document.getElementById('familyForm').addEventListener('submit', (e) => {
    e.preventDefault();

    const id = document.getElementById('familyId').value;
    const familyData = {
        familyCode: document.getElementById('familyCode').value.trim(),
        familyName: document.getElementById('familyName').value.trim(),
        fatherName: document.getElementById('fatherName').value.trim(),
        motherName: document.getElementById('motherName').value.trim(),
        fatherPhone: document.getElementById('fatherPhone').value.trim(),
        motherPhone: document.getElementById('motherPhone').value.trim(),
        location: document.getElementById('location').value.trim(),
        debtAmount: parseFloat(document.getElementById('debtAmount').value) || 0,
    };

    if (!familyData.fatherPhone && !familyData.motherPhone) {
        showToast('נא להזין לפחות מספר טלפון אחד', 'error');
        return;
    }

    if (id) {
        // Edit
        const idx = families.findIndex(f => f.id === id);
        if (idx !== -1) {
            families[idx] = { ...families[idx], ...familyData };
            showToast('המשפחה עודכנה בהצלחה');
        }
    } else {
        // Add
        families.push({
            id: generateId(),
            ...familyData,
            createdAt: Date.now()
        });
        showToast('משפחה חדשה נוספה בהצלחה');
    }

    saveData(STORAGE_KEYS.families, families);
    closeModal('familyModal');
    updateDashboard();
    renderFamilies();
    updateNotifFamilySelect();
});

function editFamily(id) {
    const f = families.find(x => x.id === id);
    if (!f) return;

    document.getElementById('familyModalTitle').textContent = 'ערוך משפחה';
    document.getElementById('familyId').value = f.id;
    document.getElementById('familyCode').value = f.familyCode;
    document.getElementById('familyName').value = f.familyName;
    document.getElementById('fatherName').value = f.fatherName;
    document.getElementById('motherName').value = f.motherName;
    document.getElementById('fatherPhone').value = f.fatherPhone || f.phone || '';
    document.getElementById('motherPhone').value = f.motherPhone || '';
    document.getElementById('location').value = f.location;
    document.getElementById('debtAmount').value = f.debtAmount;
    openModal('familyModal');
}

function confirmDeleteFamily(id) {
    const f = families.find(x => x.id === id);
    if (!f) return;
    document.getElementById('deleteMessage').textContent = `האם אתה בטוח שברצונך למחוק את משפחת ${f.familyName}? כל ההערות וההתראות הקשורות יימחקו גם.`;
    deleteCallback = () => {
        families = families.filter(x => x.id !== id);
        comments = comments.filter(c => c.familyId !== id);
        notifications = notifications.filter(n => n.familyId !== id);
        saveData(STORAGE_KEYS.families, families);
        saveData(STORAGE_KEYS.comments, comments);
        saveData(STORAGE_KEYS.notifications, notifications);
        updateDashboard();
        renderFamilies();
        updateNotifFamilySelect();
        showToast('המשפחה נמחקה בהצלחה');
    };
    openModal('deleteModal');
}

document.getElementById('closeDeleteModal').addEventListener('click', () => closeModal('deleteModal'));
document.getElementById('cancelDeleteBtn').addEventListener('click', () => closeModal('deleteModal'));
document.getElementById('confirmDeleteBtn').addEventListener('click', () => {
    if (deleteCallback) deleteCallback();
    deleteCallback = null;
    closeModal('deleteModal');
});

// ============ COMMENTS ============
function openComments(familyId) {
    currentFamilyId = familyId;
    const family = families.find(f => f.id === familyId);
    if (!family) return;

    document.getElementById('commentsFamilyName').textContent = `משפחת ${family.familyName} (${family.familyCode})`;
    document.getElementById('commentInput').value = '';
    renderComments();
    openModal('commentsPanel');
}

document.getElementById('closeCommentsPanel').addEventListener('click', () => {
    closeModal('commentsPanel');
    currentFamilyId = null;
});

function renderComments() {
    const list = document.getElementById('commentsList');
    const familyComments = comments
        .filter(c => c.familyId === currentFamilyId)
        .sort((a, b) => b.createdAt - a.createdAt);

    if (familyComments.length === 0) {
        list.innerHTML = '<div class="empty-comments">אין הערות עדיין</div>';
        return;
    }

    list.innerHTML = familyComments.map(c => {
        const reminder = reminders.find(r => r.commentId === c.id && !r.fired);
        const reminderBadge = reminder
            ? `<span class="reminder-badge">⏰ ${formatDate(reminder.remindAt)}</span>`
            : '';
        return `
        <div class="comment-item">
            <div class="comment-header">
                <span class="comment-timestamp">${formatDate(c.createdAt)}${c.updatedAt ? ' (עודכן)' : ''} ${reminderBadge}</span>
                <div class="comment-btn-group">
                    <button class="btn-icon" onclick="openEditComment('${c.id}')" title="ערוך">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="btn-icon danger" onclick="confirmDeleteComment('${c.id}')" title="מחק">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="comment-text">${escapeHtml(c.description)}</div>
        </div>
    `;
    }).join('');
}

document.getElementById('addCommentBtn').addEventListener('click', () => {
    const input = document.getElementById('commentInput');
    const text = input.value.trim();
    if (!text) {
        showToast('נא להזין תוכן הערה', 'error');
        return;
    }

    const commentObj = {
        id: generateId(),
        familyId: currentFamilyId,
        description: text,
        createdAt: Date.now(),
        updatedAt: null
    };
    comments.push(commentObj);
    saveData(STORAGE_KEYS.comments, comments);

    // Check for reminder
    handleReminderForComment(commentObj);

    input.value = '';
    resetReminderFields();
    renderComments();
    renderFamilies();
    showToast('הערה נוספה בהצלחה');
});

// Send comment as WhatsApp notification
document.getElementById('sendCommentAsNotification').addEventListener('click', () => {
    const input = document.getElementById('commentInput');
    const text = input.value.trim();
    if (!text) {
        showToast('נא להזין תוכן הודעה', 'error');
        return;
    }

    const family = families.find(f => f.id === currentFamilyId);
    if (!family) return;

    // Add as comment
    const commentObj = {
        id: generateId(),
        familyId: currentFamilyId,
        description: text,
        createdAt: Date.now(),
        updatedAt: null
    };
    comments.push(commentObj);
    saveData(STORAGE_KEYS.comments, comments);

    // Check for reminder
    handleReminderForComment(commentObj);

    // Add as notification
    const notif = {
        id: generateId(),
        familyId: currentFamilyId,
        message: text,
        source: 'comment',
        isSent: true,
        createdAt: Date.now()
    };
    notifications.push(notif);
    saveData(STORAGE_KEYS.notifications, notifications);

    // Open WhatsApp with recipient picker
    openWhatsAppPicker(family, text);

    input.value = '';
    resetReminderFields();
    renderComments();
    renderFamilies();
    updateDashboard();
    showToast('הודעה נשלחת לוואטסאפ');
});

// Edit comment
function openEditComment(commentId) {
    const c = comments.find(x => x.id === commentId);
    if (!c) return;
    document.getElementById('editCommentId').value = c.id;
    document.getElementById('editCommentText').value = c.description;
    openModal('editCommentModal');
}

document.getElementById('closeEditCommentModal').addEventListener('click', () => closeModal('editCommentModal'));
document.getElementById('cancelEditCommentBtn').addEventListener('click', () => closeModal('editCommentModal'));

document.getElementById('saveEditCommentBtn').addEventListener('click', () => {
    const id = document.getElementById('editCommentId').value;
    const text = document.getElementById('editCommentText').value.trim();
    if (!text) {
        showToast('נא להזין תוכן הערה', 'error');
        return;
    }
    const idx = comments.findIndex(c => c.id === id);
    if (idx !== -1) {
        comments[idx].description = text;
        comments[idx].updatedAt = Date.now();
        saveData(STORAGE_KEYS.comments, comments);
        renderComments();
        showToast('ההערה עודכנה בהצלחה');
    }
    closeModal('editCommentModal');
});

// Delete comment
function confirmDeleteComment(commentId) {
    document.getElementById('deleteMessage').textContent = 'האם אתה בטוח שברצונך למחוק הערה זו?';
    deleteCallback = () => {
        comments = comments.filter(c => c.id !== commentId);
        saveData(STORAGE_KEYS.comments, comments);
        renderComments();
        renderFamilies();
        showToast('ההערה נמחקה');
    };
    openModal('deleteModal');
}

// ============ NOTIFICATIONS ============
document.getElementById('notificationBell').addEventListener('click', () => {
    updateNotifFamilySelect();
    renderNotifications();
    openModal('notificationsPanel');
});

document.getElementById('closeNotificationsPanel').addEventListener('click', () => closeModal('notificationsPanel'));

function updateNotifFamilySelect() {
    const select = document.getElementById('notifFamily');
    select.innerHTML = '<option value="">בחר משפחה</option>' +
        families.map(f => `<option value="${f.id}">${escapeHtml(f.familyName)} (${escapeHtml(f.familyCode)})</option>`).join('');
}

function renderNotifications() {
    const list = document.getElementById('notificationsList');
    const sorted = [...notifications].sort((a, b) => b.createdAt - a.createdAt);

    if (sorted.length === 0) {
        list.innerHTML = '<div class="empty-comments">אין התראות</div>';
        return;
    }

    list.innerHTML = sorted.map(n => {
        const family = families.find(f => f.id === n.familyId);
        const familyName = family ? `${family.familyName} (${family.familyCode})` : 'משפחה לא ידועה';
        const sourceLabel = n.source === 'comment' ? 'מהערה' : 'ישירה';
        const sourceClass = n.source === 'comment' ? 'comment' : 'direct';

        return `
        <div class="notification-item">
            <div class="notification-item-header">
                <span class="notification-family-tag">👨‍👩‍👧 ${escapeHtml(familyName)}</span>
                <span class="notification-source-tag ${sourceClass}">${sourceLabel}</span>
            </div>
            <div class="notification-message">${escapeHtml(n.message)}</div>
            <div class="notification-actions">
                ${n.isSent
                ? '<span class="notification-sent-badge">✅ נשלח</span>'
                : family
                    ? `<button class="btn btn-whatsapp btn-xs" onclick="sendNotifWhatsApp('${n.id}')">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                            שלח לוואטסאפ
                           </button>`
                    : ''
            }
                <button class="btn-icon danger" onclick="confirmDeleteNotification('${n.id}')" title="מחק">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                </button>
                <span class="notification-timestamp">${formatDate(n.createdAt)}</span>
            </div>
        </div>
        `;
    }).join('');
}

document.getElementById('addNotificationBtn').addEventListener('click', () => {
    const familyId = document.getElementById('notifFamily').value;
    const message = document.getElementById('notifMessage').value.trim();

    if (!familyId) {
        showToast('נא לבחור משפחה', 'error');
        return;
    }
    if (!message) {
        showToast('נא להזין הודעה', 'error');
        return;
    }

    notifications.push({
        id: generateId(),
        familyId,
        message,
        source: 'direct',
        isSent: false,
        createdAt: Date.now()
    });
    saveData(STORAGE_KEYS.notifications, notifications);
    document.getElementById('notifMessage').value = '';
    document.getElementById('notifFamily').value = '';
    renderNotifications();
    updateDashboard();
    showToast('התראה נוספה בהצלחה');
});

function sendNotifWhatsApp(notifId) {
    const n = notifications.find(x => x.id === notifId);
    if (!n) return;
    const family = families.find(f => f.id === n.familyId);
    if (!family) {
        showToast('לא נמצאה משפחה קשורה', 'error');
        return;
    }

    // Mark as sent
    n.isSent = true;
    saveData(STORAGE_KEYS.notifications, notifications);
    renderNotifications();
    updateDashboard();

    openWhatsAppPicker(family, n.message);
    showToast('הודעה נשלחת לוואטסאפ');
}

// ============ WHATSAPP RECIPIENT PICKER ============
function openWhatsAppPicker(family, message) {
    const fatherPhone = family.fatherPhone || family.phone || '';
    const motherPhone = family.motherPhone || '';

    // If only one phone exists, send directly
    if (fatherPhone && !motherPhone) {
        sendWhatsApp(fatherPhone, message, family.familyName);
        return;
    }
    if (!fatherPhone && motherPhone) {
        sendWhatsApp(motherPhone, message, family.familyName);
        return;
    }

    // Both phones exist — show picker
    pendingWaSend = { message, familyName: family.familyName, fatherPhone, motherPhone };
    document.getElementById('waPickFatherPhone').textContent = fatherPhone;
    document.getElementById('waPickMotherPhone').textContent = motherPhone;
    document.getElementById('waPickFather').style.display = '';
    document.getElementById('waPickMother').style.display = '';
    openModal('whatsappPickerModal');
}

document.getElementById('closeWhatsappPicker').addEventListener('click', () => closeModal('whatsappPickerModal'));

document.querySelectorAll('.wa-pick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (!pendingWaSend) return;
        const target = btn.dataset.target;
        const { fatherPhone, motherPhone, message, familyName } = pendingWaSend;
        pendingWaSend = null;
        closeModal('whatsappPickerModal');

        if (target === 'father') {
            sendWhatsApp(fatherPhone, message, familyName);
        } else if (target === 'mother') {
            sendWhatsApp(motherPhone, message, familyName);
        } else if (target === 'both') {
            sendWhatsApp(fatherPhone, message, familyName);
            setTimeout(() => {
                sendWhatsApp(motherPhone, message, familyName);
            }, 500);
        }
    });
});

function sendWhatsApp(phone, message, familyName) {
    const formattedPhone = formatPhone(phone);
    const greeting = (settings.whatsappGreeting || 'שלום משפחת {שם_משפחה},').replace('{שם_משפחה}', familyName);
    const signature = settings.whatsappSignature || 'בברכה,\nהנהלת הגן';
    const fullMessage = `${greeting}\n\n${message}\n\n${signature}`;
    const url = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(fullMessage)}`;
    window.open(url, '_blank');
}

function confirmDeleteNotification(notifId) {
    document.getElementById('deleteMessage').textContent = 'האם אתה בטוח שברצונך למחוק התראה זו?';
    deleteCallback = () => {
        notifications = notifications.filter(n => n.id !== notifId);
        saveData(STORAGE_KEYS.notifications, notifications);
        renderNotifications();
        updateDashboard();
        showToast('ההתראה נמחקה');
    };
    openModal('deleteModal');
}

// ============ SEARCH & FILTER ============
document.getElementById('searchInput').addEventListener('input', renderFamilies);
document.getElementById('locationFilter').addEventListener('change', renderFamilies);

// ============ KEYBOARD SHORTCUTS ============
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        ['familyModal', 'editCommentModal', 'deleteModal', 'commentsPanel', 'notificationsPanel', 'managementPanel', 'editLocationModal', 'whatsappPickerModal'].forEach(id => {
            if (document.getElementById(id).classList.contains('active')) {
                closeModal(id);
            }
        });
    }
});

// ============ MANAGEMENT PANEL ============
document.getElementById('managementBtn').addEventListener('click', () => {
    renderLocations();
    loadWhatsappTemplate();
    openModal('managementPanel');
});
document.getElementById('closeManagementPanel').addEventListener('click', () => closeModal('managementPanel'));

// Panel Tabs
document.querySelectorAll('.panel-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        const tabName = tab.dataset.tab;
        const tabMap = { locations: 'tabLocations', data: 'tabData', whatsapp: 'tabWhatsapp' };
        document.getElementById(tabMap[tabName]).classList.add('active');
    });
});

// ============ LOCATIONS MANAGEMENT ============
function renderLocations() {
    const list = document.getElementById('locationsList');
    const sorted = [...locations].sort((a, b) => a.name.localeCompare(b.name, 'he'));

    if (sorted.length === 0) {
        list.innerHTML = '<div class="empty-comments">אין מיקומים רשומים</div>';
        return;
    }

    list.innerHTML = sorted.map(loc => {
        const familyCount = families.filter(f => f.location === loc.name).length;
        return `
        <div class="location-item">
            <div class="location-name">
                📍 ${escapeHtml(loc.name)}
                <span class="location-count">${familyCount} משפחות</span>
            </div>
            <div class="location-actions">
                <button class="btn-icon" onclick="openEditLocation('${loc.id}')" title="ערוך">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </button>
                <button class="btn-icon danger" onclick="confirmDeleteLocation('${loc.id}')" title="מחק">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                </button>
            </div>
        </div>
        `;
    }).join('');
}

// Add location
document.getElementById('addLocationBtn').addEventListener('click', () => {
    const input = document.getElementById('newLocationInput');
    const name = input.value.trim();
    if (!name) {
        showToast('נא להזין שם מיקום', 'error');
        return;
    }
    if (locations.some(l => l.name === name)) {
        showToast('מיקום בשם זה כבר קיים', 'error');
        return;
    }
    locations.push({ id: generateId(), name, createdAt: Date.now() });
    saveData(STORAGE_KEYS.locations, locations);
    input.value = '';
    renderLocations();
    updateDashboard();
    showToast('מיקום חדש נוסף בהצלחה');
});

// Allow pressing Enter to add location
document.getElementById('newLocationInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('addLocationBtn').click();
    }
});

// Edit location
function openEditLocation(locId) {
    const loc = locations.find(l => l.id === locId);
    if (!loc) return;
    document.getElementById('editLocationId').value = loc.id;
    document.getElementById('editLocationName').value = loc.name;
    openModal('editLocationModal');
}

document.getElementById('closeEditLocationModal').addEventListener('click', () => closeModal('editLocationModal'));
document.getElementById('cancelEditLocationBtn').addEventListener('click', () => closeModal('editLocationModal'));

document.getElementById('saveEditLocationBtn').addEventListener('click', () => {
    const id = document.getElementById('editLocationId').value;
    const newName = document.getElementById('editLocationName').value.trim();
    if (!newName) {
        showToast('נא להזין שם מיקום', 'error');
        return;
    }
    const idx = locations.findIndex(l => l.id === id);
    if (idx === -1) return;

    const oldName = locations[idx].name;
    if (oldName !== newName && locations.some(l => l.name === newName)) {
        showToast('מיקום בשם זה כבר קיים', 'error');
        return;
    }

    // Update all families with the old name
    if (oldName !== newName) {
        families.forEach(f => {
            if (f.location === oldName) f.location = newName;
        });
        saveData(STORAGE_KEYS.families, families);
    }

    locations[idx].name = newName;
    saveData(STORAGE_KEYS.locations, locations);
    closeModal('editLocationModal');
    renderLocations();
    updateDashboard();
    renderFamilies();
    showToast('המיקום עודכן בהצלחה');
});

// Delete location
function confirmDeleteLocation(locId) {
    const loc = locations.find(l => l.id === locId);
    if (!loc) return;
    const familyCount = families.filter(f => f.location === loc.name).length;
    let msg = `האם אתה בטוח שברצונך למחוק את המיקום "${loc.name}"?`;
    if (familyCount > 0) {
        msg += ` (${familyCount} משפחות משויכות למיקום זה)`;
    }
    document.getElementById('deleteMessage').textContent = msg;
    deleteCallback = () => {
        locations = locations.filter(l => l.id !== locId);
        saveData(STORAGE_KEYS.locations, locations);
        renderLocations();
        updateDashboard();
        showToast('המיקום נמחק');
    };
    openModal('deleteModal');
}

// ============ DATA MANAGEMENT ============
document.getElementById('exportDataBtn').addEventListener('click', () => {
    const data = {
        version: 1,
        exportDate: new Date().toISOString(),
        families,
        comments,
        notifications,
        locations,
        reminders,
        settings
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kindergarten-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('הנתונים יוצאו בהצלחה');
});

// Excel Export
document.getElementById('exportExcelBtn').addEventListener('click', () => {
    if (typeof XLSX === 'undefined') {
        showToast('ספריית Excel לא נטענה. בדוק חיבור אינטרנט.', 'error');
        return;
    }

    const wb = XLSX.utils.book_new();

    // Sheet 1: Families
    const familiesData = families.map(f => ({
        'קוד משפחה': f.familyCode,
        'שם משפחה': f.familyName,
        'שם האב': f.fatherName,
        'טלפון האב': f.fatherPhone || f.phone || '',
        'שם האם': f.motherName,
        'טלפון האם': f.motherPhone || '',
        'מיקום': f.location,
        'סכום חוב': f.debtAmount,
        'מספר הערות': comments.filter(c => c.familyId === f.id).length,
        'תאריך הוספה': formatDate(f.createdAt)
    }));
    const wsFamilies = XLSX.utils.json_to_sheet(familiesData);
    wsFamilies['!cols'] = [
        { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 14 },
        { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 18 }
    ];
    XLSX.utils.book_append_sheet(wb, wsFamilies, 'משפחות');

    // Sheet 2: Comments
    const commentsData = comments.map(c => {
        const family = families.find(f => f.id === c.familyId);
        return {
            'קוד משפחה': family ? family.familyCode : '',
            'שם משפחה': family ? family.familyName : 'לא ידוע',
            'תוכן הערה': c.description,
            'תאריך יצירה': formatDate(c.createdAt),
            'תאריך עדכון': c.updatedAt ? formatDate(c.updatedAt) : ''
        };
    });
    const wsComments = XLSX.utils.json_to_sheet(commentsData);
    wsComments['!cols'] = [
        { wch: 12 }, { wch: 16 }, { wch: 40 }, { wch: 18 }, { wch: 18 }
    ];
    XLSX.utils.book_append_sheet(wb, wsComments, 'הערות');

    // Sheet 3: Notifications
    const notifsData = notifications.map(n => {
        const family = families.find(f => f.id === n.familyId);
        return {
            'קוד משפחה': family ? family.familyCode : '',
            'שם משפחה': family ? family.familyName : 'לא ידוע',
            'הודעה': n.message,
            'מקור': n.source === 'comment' ? 'מהערה' : 'ישירה',
            'נשלח': n.isSent ? 'כן' : 'לא',
            'תאריך': formatDate(n.createdAt)
        };
    });
    const wsNotifs = XLSX.utils.json_to_sheet(notifsData);
    wsNotifs['!cols'] = [
        { wch: 12 }, { wch: 16 }, { wch: 40 }, { wch: 10 }, { wch: 8 }, { wch: 18 }
    ];
    XLSX.utils.book_append_sheet(wb, wsNotifs, 'התראות');

    // Set RTL on all sheets
    wb.SheetNames.forEach(name => {
        if (!wb.Sheets[name]['!sheetViews']) {
            wb.Sheets[name]['!sheetViews'] = [{ rightToLeft: true }];
        }
    });

    XLSX.writeFile(wb, `kindergarten-data-${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast('הנתונים יוצאו לקובץ Excel בהצלחה');
});

document.getElementById('importDataInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = JSON.parse(event.target.result);
            if (data.families) {
                families = data.families;
                saveData(STORAGE_KEYS.families, families);
            }
            if (data.comments) {
                comments = data.comments;
                saveData(STORAGE_KEYS.comments, comments);
            }
            if (data.notifications) {
                notifications = data.notifications;
                saveData(STORAGE_KEYS.notifications, notifications);
            }
            if (data.locations) {
                locations = data.locations;
                saveData(STORAGE_KEYS.locations, locations);
            }
            if (data.settings) {
                settings = data.settings;
                localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
            }
            updateDashboard();
            renderFamilies();
            updateNotifFamilySelect();
            renderLocations();
            loadWhatsappTemplate();
            showToast('הנתונים יובאו בהצלחה');
        } catch (err) {
            showToast('שגיאה בייבוא הקובץ. ודא שזהו קובץ JSON תקין.', 'error');
        }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset file input
});

document.getElementById('clearAllDataBtn').addEventListener('click', () => {
    document.getElementById('deleteMessage').textContent = 'האם אתה בטוח שברצונך למחוק את כל הנתונים? פעולה זו אינה ניתנת לביטול!';
    deleteCallback = () => {
        families = [];
        comments = [];
        notifications = [];
        locations = [];
        settings = {};
        reminders = [];
        saveData(STORAGE_KEYS.families, families);
        saveData(STORAGE_KEYS.comments, comments);
        saveData(STORAGE_KEYS.notifications, notifications);
        saveData(STORAGE_KEYS.locations, locations);
        saveData(STORAGE_KEYS.reminders, reminders);
        localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
        updateDashboard();
        renderFamilies();
        updateNotifFamilySelect();
        renderLocations();
        showToast('כל הנתונים נמחקו');
    };
    openModal('deleteModal');
});

// ============ WHATSAPP TEMPLATE ============
function loadWhatsappTemplate() {
    document.getElementById('whatsappGreeting').value = settings.whatsappGreeting || 'שלום משפחת {שם_משפחה},';
    document.getElementById('whatsappSignature').value = settings.whatsappSignature || 'בברכה,\nהנהלת הגן';
    loadManagerSettings();
}

document.getElementById('saveWhatsappTemplate').addEventListener('click', () => {
    settings.whatsappGreeting = document.getElementById('whatsappGreeting').value.trim();
    settings.whatsappSignature = document.getElementById('whatsappSignature').value.trim();
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
    showToast('תבנית הודעה נשמרה בהצלחה');
});

// ============ MANAGER SETTINGS ============
function loadManagerSettings() {
    document.getElementById('managerPhone').value = settings.managerPhone || '';
    document.getElementById('managerEmail').value = settings.managerEmail || '';
}

document.getElementById('saveManagerSettings').addEventListener('click', () => {
    settings.managerPhone = document.getElementById('managerPhone').value.trim();
    settings.managerEmail = document.getElementById('managerEmail').value.trim();
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
    showToast('הגדרות מנהל נשמרו בהצלחה');
});

// ============ REMINDER SYSTEM ============
document.getElementById('reminderToggle').addEventListener('change', (e) => {
    const fields = document.getElementById('reminderFields');
    fields.style.display = e.target.checked ? 'flex' : 'none';
    if (e.target.checked) {
        // Default to tomorrow
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        document.getElementById('reminderDate').value = tomorrow.toISOString().slice(0, 10);
    }
});

function handleReminderForComment(commentObj) {
    const toggle = document.getElementById('reminderToggle');
    if (!toggle.checked) return;

    const dateVal = document.getElementById('reminderDate').value;
    const timeVal = document.getElementById('reminderTime').value;
    if (!dateVal || !timeVal) {
        showToast('נא להזין תאריך ושעה לתזכורת', 'error');
        return;
    }

    const remindAt = new Date(`${dateVal}T${timeVal}`).getTime();
    if (remindAt <= Date.now()) {
        showToast('תאריך התזכורת חייב להיות בעתיד', 'error');
        return;
    }

    const family = families.find(f => f.id === commentObj.familyId);
    reminders.push({
        id: generateId(),
        commentId: commentObj.id,
        familyId: commentObj.familyId,
        familyName: family ? family.familyName : '',
        message: commentObj.description,
        remindAt,
        fired: false,
        createdAt: Date.now()
    });
    saveData(STORAGE_KEYS.reminders, reminders);
    showToast(`תזכורת נקבעה ל-${formatDate(remindAt)}`, 'info');
}

function resetReminderFields() {
    document.getElementById('reminderToggle').checked = false;
    document.getElementById('reminderFields').style.display = 'none';
    document.getElementById('reminderDate').value = '';
    document.getElementById('reminderTime').value = '09:00';
}

// Check reminders every 30 seconds
function checkReminders() {
    const now = Date.now();
    let changed = false;

    reminders.forEach(r => {
        if (!r.fired && r.remindAt <= now) {
            r.fired = true;
            changed = true;

            const family = families.find(f => f.id === r.familyId);
            const familyName = r.familyName || (family ? family.familyName : 'לא ידוע');

            // Show browser notification
            if (Notification.permission === 'granted') {
                new Notification(`⏰ תזכורת - משפחת ${familyName}`, {
                    body: r.message,
                    icon: '💬',
                    tag: r.id
                });
            }

            // Build WhatsApp button for toast
            let waActionHtml = '';
            if (family) {
                const phone = family.fatherPhone || family.motherPhone || family.phone || '';
                if (phone) {
                    waActionHtml = `<button class="toast-wa-btn" onclick="openWhatsAppPicker(families.find(f=>f.id==='${family.id}'), '${escapeHtml(r.message.replace(/'/g, "\\'"))}')">  📱 שלח לוואטסאפ</button>`;
                }
            }

            // Show in-app toast with WhatsApp button
            showToast(`⏰ תזכורת: משפחת ${familyName} - ${r.message.slice(0, 50)}`, 'info', waActionHtml);

            // Auto-send email to manager if configured
            if (settings.managerEmail) {
                const emailSubject = `⏰ תזכורת - משפחת ${familyName}`;
                const emailBody = `תזכורת ממערכת ניהול חובות\n\nמשפחה: ${familyName}\nהערה: ${r.message}\nתאריך תזכורת: ${formatDate(r.remindAt)}`;

                fetch('/api/send-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        to: settings.managerEmail,
                        subject: emailSubject,
                        body: emailBody
                    })
                })
                    .then(res => res.json())
                    .then(data => {
                        if (data.success) {
                            showToast(`✉️ מייל תזכורת נשלח ל-${settings.managerEmail}`);
                        } else {
                            showToast(`❌ שליחת מייל נכשלה: ${data.error}`, 'error');
                        }
                    })
                    .catch(err => {
                        showToast('❌ שליחת מייל נכשלה - בדוק שהשרת פועל', 'error');
                        console.error('Email send error:', err);
                    });
            }
        }
    });

    if (changed) {
        saveData(STORAGE_KEYS.reminders, reminders);
        if (currentFamilyId) renderComments();
    }
}

// ============ INIT ============
function init() {
    // Request notification permission for reminders
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }

    updateDashboard();
    renderFamilies();
    updateNotifFamilySelect();

    // Start reminder checker
    checkReminders();
    setInterval(checkReminders, 30000);
}

init();
