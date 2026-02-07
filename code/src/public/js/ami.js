// AMI 账号管理页面 JavaScript

let credentials = [];
let currentView = 'grid';
let searchQuery = '';

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
    // 检查认证
    if (!await checkAuth()) return;

    // 加载侧边栏
    const sidebarContainer = document.getElementById('sidebar-container');
    if (sidebarContainer) {
        sidebarContainer.innerHTML = getSidebarHTML();
        initSidebar('ami');
        updateSidebarStats();
    }

    // 绑定事件
    bindEvents();

    // 加载数据
    await loadCredentials();
});

// 绑定事件
function bindEvents() {
    // 添加账号按钮
    document.getElementById('add-account-btn')?.addEventListener('click', openAddModal);
    document.getElementById('empty-add-btn')?.addEventListener('click', openAddModal);

    // 刷新按钮
    document.getElementById('refresh-btn')?.addEventListener('click', loadCredentials);

    // 模态框关闭
    document.getElementById('modal-close')?.addEventListener('click', closeAddModal);
    document.getElementById('modal-cancel')?.addEventListener('click', closeAddModal);
    document.getElementById('edit-modal-close')?.addEventListener('click', closeEditModal);
    document.getElementById('edit-modal-cancel')?.addEventListener('click', closeEditModal);

    // 点击遮罩关闭
    document.getElementById('add-modal')?.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay')) closeAddModal();
    });
    document.getElementById('edit-modal')?.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay')) closeEditModal();
    });

    // 表单提交
    document.getElementById('add-account-form')?.addEventListener('submit', handleAddAccount);
    document.getElementById('edit-account-form')?.addEventListener('submit', handleEditAccount);

    // 粘贴按钮
    document.getElementById('paste-cookie-btn')?.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            document.getElementById('session-cookie').value = text;
        } catch (e) {
            showToast('无法访问剪贴板', 'error');
        }
    });

    // 搜索
    document.getElementById('search-input')?.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase();
        renderCredentials();
    });

    // 视图切换
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentView = btn.dataset.view;
            renderCredentials();
        });
    });
}

// 加载凭据列表
async function loadCredentials() {
    showLoading(true);

    try {
        const res = await fetch('/api/ami/credentials', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();

        if (data.success) {
            credentials = data.data || [];
            updateStats();
            renderCredentials();
        } else {
            showToast(data.error || '加载失败', 'error');
        }
    } catch (e) {
        showToast('加载凭据失败: ' + e.message, 'error');
    } finally {
        showLoading(false);
    }
}

// 更新统计
function updateStats() {
    const total = credentials.length;
    const active = credentials.filter(c => c.status === 'active' && c.isActive).length;
    const error = credentials.filter(c => c.status === 'error' || c.errorCount > 0).length;
    const usage = credentials.reduce((sum, c) => sum + (c.useCount || 0), 0);

    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-active').textContent = active;
    document.getElementById('stat-error').textContent = error;
    document.getElementById('stat-usage').textContent = usage;
}

// 渲染凭据列表
function renderCredentials() {
    const grid = document.getElementById('cards-grid');
    const list = document.getElementById('list-view');
    const empty = document.getElementById('empty-state');

    // 过滤
    let filtered = credentials;
    if (searchQuery) {
        filtered = credentials.filter(c =>
            c.name?.toLowerCase().includes(searchQuery) ||
            c.note?.toLowerCase().includes(searchQuery) ||
            c.projectId?.toLowerCase().includes(searchQuery)
        );
    }

    if (filtered.length === 0) {
        grid.style.display = 'none';
        list.style.display = 'none';
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';

    if (currentView === 'grid') {
        grid.style.display = 'grid';
        list.style.display = 'none';
        grid.innerHTML = filtered.map(c => renderCard(c)).join('');
    } else {
        grid.style.display = 'none';
        list.style.display = 'block';
        list.innerHTML = filtered.map(c => renderListItem(c)).join('');
    }

    // 绑定卡片事件
    bindCardEvents();
}

// 渲染卡片
function renderCard(credential) {
    const statusClass = credential.status === 'active' ? 'active' : 'error';
    const statusText = credential.status === 'active' ? '正常' : '异常';

    return `
        <div class="ami-card" data-id="${credential.id}">
            <div class="ami-card-header">
                <div class="ami-card-info">
                    <div class="ami-card-name">${escapeHtml(credential.name)}</div>
                    <div class="ami-card-id">ID: ${credential.id}</div>
                </div>
                <div class="ami-card-status ${statusClass}">
                    <span class="status-dot"></span>
                    ${statusText}
                </div>
            </div>
            <div class="ami-card-details">
                <div class="ami-card-detail">
                    <span class="detail-label">Project ID</span>
                    <span class="detail-value">${credential.projectId || '-'}</span>
                </div>
                <div class="ami-card-detail">
                    <span class="detail-label">Chat ID</span>
                    <span class="detail-value">${credential.chatId || '-'}</span>
                </div>
                <div class="ami-card-detail">
                    <span class="detail-label">使用次数</span>
                    <span class="detail-value">${credential.useCount || 0}</span>
                </div>
                <div class="ami-card-detail">
                    <span class="detail-label">最后使用</span>
                    <span class="detail-value">${credential.lastUsedAt ? formatDateTime(credential.lastUsedAt) : '-'}</span>
                </div>
            </div>
            ${credential.note ? `<div class="ami-card-note" style="font-size: 12px; color: var(--text-secondary); margin-bottom: 12px;">${escapeHtml(credential.note)}</div>` : ''}
            <div class="ami-card-actions">
                <button class="btn btn-secondary btn-sm" onclick="testCredential(${credential.id})">
                    <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                    测试
                </button>
                <button class="btn btn-secondary btn-sm" onclick="openEditModal(${credential.id})">
                    <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 20h9"/>
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                    </svg>
                    编辑
                </button>
                <button class="btn btn-danger btn-sm" onclick="deleteCredential(${credential.id})">
                    <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                    删除
                </button>
            </div>
        </div>
    `;
}

// 渲染列表项
function renderListItem(credential) {
    const statusClass = credential.status === 'active' ? 'active' : 'error';
    const statusText = credential.status === 'active' ? '正常' : '异常';

    return `
        <div class="ami-list-item" data-id="${credential.id}">
            <div class="ami-list-name">
                ${escapeHtml(credential.name)}
                ${credential.note ? `<span class="ami-list-note">${escapeHtml(credential.note)}</span>` : ''}
            </div>
            <div class="ami-list-status ${statusClass}">
                <span class="status-dot"></span>
                ${statusText}
            </div>
            <div class="ami-list-value">${credential.useCount || 0}</div>
            <div class="ami-list-value">${credential.projectId || '-'}</div>
            <div class="ami-list-value">${credential.lastUsedAt ? formatDateTime(credential.lastUsedAt) : '-'}</div>
            <div class="ami-list-actions">
                <button class="btn-icon-only" onclick="testCredential(${credential.id})" title="测试">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                </button>
                <button class="btn-icon-only" onclick="openEditModal(${credential.id})" title="编辑">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 20h9"/>
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                    </svg>
                </button>
                <button class="btn-icon-only danger" onclick="deleteCredential(${credential.id})" title="删除">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                </button>
            </div>
        </div>
    `;
}

// 绑定卡片事件
function bindCardEvents() {
    // 卡片点击事件已通过 onclick 绑定
}

// 打开添加模态框
function openAddModal() {
    document.getElementById('add-modal').classList.add('active');
    document.getElementById('add-account-form').reset();
}

// 关闭添加模态框
function closeAddModal() {
    document.getElementById('add-modal').classList.remove('active');
}

// 打开编辑模态框
function openEditModal(id) {
    const credential = credentials.find(c => c.id === id);
    if (!credential) return;

    document.getElementById('edit-id').value = id;
    document.getElementById('edit-name').value = credential.name || '';
    document.getElementById('edit-session-cookie').value = '';
    document.getElementById('edit-project-id').value = credential.projectId || '';
    document.getElementById('edit-chat-id').value = credential.chatId || '';
    document.getElementById('edit-note').value = credential.note || '';
    document.getElementById('edit-account-name').textContent = credential.name;

    document.getElementById('edit-modal').classList.add('active');
}

// 关闭编辑模态框
function closeEditModal() {
    document.getElementById('edit-modal').classList.remove('active');
}

// 添加账号
async function handleAddAccount(e) {
    e.preventDefault();

    const sessionCookie = document.getElementById('session-cookie').value.trim();
    const name = document.getElementById('account-name').value.trim();
    const projectId = document.getElementById('project-id').value.trim();
    const chatId = document.getElementById('chat-id').value.trim();
    const note = document.getElementById('account-note').value.trim();

    if (!sessionCookie) {
        showToast('请输入 wos-session Cookie', 'error');
        return;
    }

    try {
        const res = await fetch('/api/ami/credentials', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                name: name || undefined,
                sessionCookie,
                projectId: projectId || undefined,
                chatId: chatId || undefined,
                note: note || undefined
            })
        });

        const data = await res.json();

        if (data.success) {
            showToast('账号添加成功', 'success');
            closeAddModal();
            await loadCredentials();
        } else {
            showToast(data.error || '添加失败', 'error');
        }
    } catch (e) {
        showToast('添加失败: ' + e.message, 'error');
    }
}

// 编辑账号
async function handleEditAccount(e) {
    e.preventDefault();

    const id = document.getElementById('edit-id').value;
    const name = document.getElementById('edit-name').value.trim();
    const sessionCookie = document.getElementById('edit-session-cookie').value.trim();
    const projectId = document.getElementById('edit-project-id').value.trim();
    const chatId = document.getElementById('edit-chat-id').value.trim();
    const note = document.getElementById('edit-note').value.trim();

    try {
        const body = {
            name: name || undefined,
            projectId: projectId || undefined,
            chatId: chatId || undefined,
            note: note || undefined
        };

        // 只有填写了新的 Cookie 才更新
        if (sessionCookie) {
            body.sessionCookie = sessionCookie;
        }

        const res = await fetch(`/api/ami/credentials/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(body)
        });

        const data = await res.json();

        if (data.success) {
            showToast('账号更新成功', 'success');
            closeEditModal();
            await loadCredentials();
        } else {
            showToast(data.error || '更新失败', 'error');
        }
    } catch (e) {
        showToast('更新失败: ' + e.message, 'error');
    }
}

// 测试凭据
async function testCredential(id) {
    showToast('正在测试凭据...', 'info');

    try {
        const res = await fetch(`/api/ami/credentials/${id}/test`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        const data = await res.json();

        if (data.success) {
            showToast('凭据测试成功', 'success');
            await loadCredentials();
        } else {
            showToast(data.error || '测试失败', 'error');
        }
    } catch (e) {
        showToast('测试失败: ' + e.message, 'error');
    }
}

// 删除凭据
async function deleteCredential(id) {
    if (!confirm('确定要删除这个账号吗？此操作不可恢复。')) {
        return;
    }

    try {
        const res = await fetch(`/api/ami/credentials/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        const data = await res.json();

        if (data.success) {
            showToast('账号已删除', 'success');
            await loadCredentials();
        } else {
            showToast(data.error || '删除失败', 'error');
        }
    } catch (e) {
        showToast('删除失败: ' + e.message, 'error');
    }
}

// 显示/隐藏加载状态
function showLoading(show) {
    const loading = document.getElementById('loading-state');
    const grid = document.getElementById('cards-grid');
    const list = document.getElementById('list-view');
    const empty = document.getElementById('empty-state');

    if (show) {
        loading.style.display = 'block';
        grid.style.display = 'none';
        list.style.display = 'none';
        empty.style.display = 'none';
    } else {
        loading.style.display = 'none';
    }
}

// HTML 转义
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
