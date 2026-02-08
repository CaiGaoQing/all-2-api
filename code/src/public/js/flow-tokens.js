// ============ Flow Tokens 管理 ============

let allTokens = [];
let currentFilter = 'all';

// ============ 初始化 ============
document.addEventListener('DOMContentLoaded', async () => {
    // 检查认证
    if (!await checkAuth()) return;

    // 加载侧边栏
    const sidebarContainer = document.getElementById('sidebar-container');
    if (sidebarContainer) {
        sidebarContainer.innerHTML = getSidebarHTML();
        initSidebar('flow-tokens');
        updateSidebarStats();
    }

    // 加载数据
    await loadTokens();

    // 绑定事件
    bindEvents();
});

// ============ 加载 Token 列表 ============
async function loadTokens() {
    try {
        const res = await fetch('/api/flow/tokens', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const result = await res.json();

        if (result.success) {
            allTokens = result.data || [];
            updateStats();
            renderTokens();
        } else {
            showToast(result.error || '加载失败', 'error');
        }
    } catch (e) {
        console.error('Load tokens error:', e);
        showToast('加载 Token 列表失败', 'error');
    }
}

// ============ 更新统计 ============
function updateStats() {
    const total = allTokens.length;
    const active = allTokens.filter(t => t.is_active).length;
    const disabled = total - active;
    const totalCredits = allTokens.reduce((sum, t) => sum + (t.credits || 0), 0);
    const totalUsage = allTokens.reduce((sum, t) => sum + (t.use_count || 0), 0);

    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-active').textContent = active;
    document.getElementById('stat-disabled').textContent = disabled;
    document.getElementById('stat-total-credits').textContent = totalCredits;
    document.getElementById('stat-total-usage').textContent = totalUsage;

    document.getElementById('tab-count-all').textContent = total;
    document.getElementById('tab-count-active').textContent = active;
    document.getElementById('tab-count-disabled').textContent = disabled;
}

// ============ 渲染 Token 列表 ============
function renderTokens() {
    const searchTerm = document.getElementById('search-input')?.value?.toLowerCase() || '';

    let filtered = allTokens;

    // 应用筛选
    if (currentFilter === 'active') {
        filtered = filtered.filter(t => t.is_active);
    } else if (currentFilter === 'disabled') {
        filtered = filtered.filter(t => !t.is_active);
    }

    // 应用搜索
    if (searchTerm) {
        filtered = filtered.filter(t =>
            (t.email && t.email.toLowerCase().includes(searchTerm)) ||
            (t.name && t.name.toLowerCase().includes(searchTerm)) ||
            (t.remark && t.remark.toLowerCase().includes(searchTerm))
        );
    }

    const tbody = document.getElementById('tokens-tbody');
    const emptyState = document.getElementById('empty-state');
    const tableContainer = document.querySelector('.table-container');

    document.getElementById('displayed-count').textContent = filtered.length;

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        if (tableContainer) tableContainer.style.display = 'none';
        if (emptyState) emptyState.style.display = 'flex';
        return;
    }

    if (tableContainer) tableContainer.style.display = 'block';
    if (emptyState) emptyState.style.display = 'none';

    tbody.innerHTML = filtered.map(token => `
        <tr data-id="${token.id}">
            <td>
                <div class="token-email">
                    <strong>${escapeHtml(token.email || '-')}</strong>
                    ${token.remark ? `<span class="token-remark">${escapeHtml(token.remark)}</span>` : ''}
                </div>
            </td>
            <td>
                <span class="status-badge ${token.is_active ? 'success' : 'error'}">
                    ${token.is_active ? '活跃' : '禁用'}
                </span>
            </td>
            <td>${token.credits || 0}</td>
            <td>${token.use_count || 0}</td>
            <td>
                <span class="feature-badge ${token.image_enabled ? 'enabled' : 'disabled'}">
                    ${token.image_enabled ? '启用' : '禁用'}
                </span>
            </td>
            <td>
                <span class="feature-badge ${token.video_enabled ? 'enabled' : 'disabled'}">
                    ${token.video_enabled ? '启用' : '禁用'}
                </span>
            </td>
            <td>
                <span class="project-name" title="${escapeHtml(token.current_project_id || '')}">
                    ${escapeHtml(token.current_project_name || '-')}
                </span>
            </td>
            <td>${formatDateTime(token.last_used_at)}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn-icon-sm" onclick="editToken(${token.id})" title="编辑">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="btn-icon-sm" onclick="refreshCredits(${token.id})" title="刷新余额">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="12" y1="1" x2="12" y2="23"/>
                            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                        </svg>
                    </button>
                    <button class="btn-icon-sm" onclick="toggleToken(${token.id}, ${token.is_active})" title="${token.is_active ? '禁用' : '启用'}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            ${token.is_active ?
                                '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/>' :
                                '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'
                            }
                        </svg>
                    </button>
                    <button class="btn-icon-sm danger" onclick="deleteToken(${token.id})" title="删除">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');

    // 渲染移动端卡片
    const cardList = document.getElementById('tokens-card-list');
    if (cardList) {
        cardList.innerHTML = filtered.map(token => `
            <div class="token-card" data-id="${token.id}">
                <div class="token-card-header">
                    <div>
                        <div class="token-card-email">${escapeHtml(token.email || '-')}</div>
                        ${token.remark ? `<div class="token-card-remark">${escapeHtml(token.remark)}</div>` : ''}
                    </div>
                    <span class="status-badge ${token.is_active ? 'success' : 'error'}">
                        ${token.is_active ? '活跃' : '禁用'}
                    </span>
                </div>
                <div class="token-card-info">
                    <div class="token-card-info-item">
                        <span class="token-card-info-label">余额</span>
                        <span class="token-card-info-value">${token.credits || 0}</span>
                    </div>
                    <div class="token-card-info-item">
                        <span class="token-card-info-label">使用次数</span>
                        <span class="token-card-info-value">${token.use_count || 0}</span>
                    </div>
                    <div class="token-card-info-item">
                        <span class="token-card-info-label">项目</span>
                        <span class="token-card-info-value">${escapeHtml(token.current_project_name || '-')}</span>
                    </div>
                    <div class="token-card-info-item">
                        <span class="token-card-info-label">最后使用</span>
                        <span class="token-card-info-value">${formatDateTime(token.last_used_at)}</span>
                    </div>
                </div>
                <div class="token-card-features">
                    <span class="feature-badge ${token.image_enabled ? 'enabled' : 'disabled'}">
                        图片: ${token.image_enabled ? '启用' : '禁用'}
                    </span>
                    <span class="feature-badge ${token.video_enabled ? 'enabled' : 'disabled'}">
                        视频: ${token.video_enabled ? '启用' : '禁用'}
                    </span>
                </div>
                <div class="token-card-actions">
                    <button class="btn btn-secondary btn-sm" onclick="editToken(${token.id})">编辑</button>
                    <button class="btn btn-secondary btn-sm" onclick="refreshCredits(${token.id})">刷新</button>
                    <button class="btn btn-secondary btn-sm" onclick="toggleToken(${token.id}, ${token.is_active})">
                        ${token.is_active ? '禁用' : '启用'}
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="deleteToken(${token.id})">删除</button>
                </div>
            </div>
        `).join('');
    }
}

// ============ 绑定事件 ============
function bindEvents() {
    // 搜索
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', () => renderTokens());
    }

    // 筛选标签
    document.querySelectorAll('.header-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.header-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentFilter = tab.dataset.filter;
            renderTokens();
        });
    });

    // 添加 Token 按钮
    document.getElementById('add-token-btn')?.addEventListener('click', openAddModal);
    document.getElementById('empty-add-btn')?.addEventListener('click', openAddModal);

    // 批量导入按钮
    document.getElementById('batch-import-btn')?.addEventListener('click', openBatchModal);

    // 批量刷新余额
    document.getElementById('refresh-credits-btn')?.addEventListener('click', batchRefreshCredits);

    // 添加 Modal
    document.getElementById('modal-close')?.addEventListener('click', closeAddModal);
    document.getElementById('modal-cancel')?.addEventListener('click', closeAddModal);
    document.getElementById('modal-submit')?.addEventListener('click', submitAddToken);

    // 批量导入 Modal
    document.getElementById('batch-modal-close')?.addEventListener('click', closeBatchModal);
    document.getElementById('batch-modal-cancel')?.addEventListener('click', closeBatchModal);
    document.getElementById('batch-modal-submit')?.addEventListener('click', submitBatchImport);

    // 编辑 Modal
    document.getElementById('edit-modal-close')?.addEventListener('click', closeEditModal);
    document.getElementById('edit-modal-cancel')?.addEventListener('click', closeEditModal);
    document.getElementById('edit-modal-submit')?.addEventListener('click', submitEditToken);

    // 点击 overlay 关闭 modal
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('active');
            }
        });
    });
}

// ============ 添加 Token Modal ============
function openAddModal() {
    document.getElementById('add-modal').classList.add('active');
    document.getElementById('token-st').value = '';
    document.getElementById('token-remark').value = '';
    document.getElementById('token-image-enabled').checked = true;
    document.getElementById('token-video-enabled').checked = true;
}

function closeAddModal() {
    document.getElementById('add-modal').classList.remove('active');
}

async function submitAddToken() {
    const st = document.getElementById('token-st').value.trim();
    const remark = document.getElementById('token-remark').value.trim();
    const imageEnabled = document.getElementById('token-image-enabled').checked;
    const videoEnabled = document.getElementById('token-video-enabled').checked;

    if (!st) {
        showToast('请输入 Session Token', 'error');
        return;
    }

    try {
        const res = await fetch('/api/flow/tokens', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ st, remark, imageEnabled, videoEnabled })
        });

        const result = await res.json();

        if (result.success) {
            showToast('Token 添加成功', 'success');
            closeAddModal();
            await loadTokens();
        } else {
            showToast(result.error || '添加失败', 'error');
        }
    } catch (e) {
        console.error('Add token error:', e);
        showToast('添加 Token 失败', 'error');
    }
}

// ============ 批量导入 Modal ============
function openBatchModal() {
    document.getElementById('batch-import-modal').classList.add('active');
    document.getElementById('batch-st-list').value = '';
    document.getElementById('batch-image-enabled').checked = true;
    document.getElementById('batch-video-enabled').checked = true;
}

function closeBatchModal() {
    document.getElementById('batch-import-modal').classList.remove('active');
}

async function submitBatchImport() {
    const stListText = document.getElementById('batch-st-list').value.trim();
    const imageEnabled = document.getElementById('batch-image-enabled').checked;
    const videoEnabled = document.getElementById('batch-video-enabled').checked;

    if (!stListText) {
        showToast('请输入 Session Token 列表', 'error');
        return;
    }

    const stList = stListText.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

    if (stList.length === 0) {
        showToast('请输入有效的 Session Token', 'error');
        return;
    }

    try {
        const res = await fetch('/api/flow/tokens/batch', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ stList, imageEnabled, videoEnabled })
        });

        const result = await res.json();

        if (result.success) {
            const data = result.data || [];
            const successCount = data.filter(r => r.success).length;
            const failCount = data.filter(r => !r.success).length;
            showToast(`导入完成: ${successCount} 成功, ${failCount} 失败`, successCount > 0 ? 'success' : 'warning');
            closeBatchModal();
            await loadTokens();
        } else {
            showToast(result.error || '导入失败', 'error');
        }
    } catch (e) {
        console.error('Batch import error:', e);
        showToast('批量导入失败', 'error');
    }
}

// ============ 编辑 Token ============
function editToken(id) {
    const token = allTokens.find(t => t.id === id);
    if (!token) return;

    document.getElementById('edit-token-id').value = id;
    document.getElementById('edit-token-email').value = token.email || '';
    document.getElementById('edit-token-remark').value = token.remark || '';
    document.getElementById('edit-image-enabled').checked = token.image_enabled;
    document.getElementById('edit-video-enabled').checked = token.video_enabled;

    document.getElementById('edit-modal').classList.add('active');
}

function closeEditModal() {
    document.getElementById('edit-modal').classList.remove('active');
}

async function submitEditToken() {
    const id = document.getElementById('edit-token-id').value;
    const remark = document.getElementById('edit-token-remark').value.trim();
    const imageEnabled = document.getElementById('edit-image-enabled').checked;
    const videoEnabled = document.getElementById('edit-video-enabled').checked;

    try {
        const res = await fetch(`/api/flow/tokens/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ remark, imageEnabled, videoEnabled })
        });

        const result = await res.json();

        if (result.success) {
            showToast('Token 更新成功', 'success');
            closeEditModal();
            await loadTokens();
        } else {
            showToast(result.error || '更新失败', 'error');
        }
    } catch (e) {
        console.error('Edit token error:', e);
        showToast('更新 Token 失败', 'error');
    }
}

// ============ 启用/禁用 Token ============
async function toggleToken(id, isActive) {
    const action = isActive ? 'disable' : 'enable';
    const actionText = isActive ? '禁用' : '启用';

    try {
        const res = await fetch(`/api/flow/tokens/${id}/${action}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        const result = await res.json();

        if (result.success) {
            showToast(`Token 已${actionText}`, 'success');
            await loadTokens();
        } else {
            showToast(result.error || `${actionText}失败`, 'error');
        }
    } catch (e) {
        console.error('Toggle token error:', e);
        showToast(`${actionText} Token 失败`, 'error');
    }
}

// ============ 删除 Token ============
async function deleteToken(id) {
    if (!confirm('确定要删除这个 Token 吗？此操作不可恢复。')) {
        return;
    }

    try {
        const res = await fetch(`/api/flow/tokens/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        const result = await res.json();

        if (result.success) {
            showToast('Token 已删除', 'success');
            await loadTokens();
        } else {
            showToast(result.error || '删除失败', 'error');
        }
    } catch (e) {
        console.error('Delete token error:', e);
        showToast('删除 Token 失败', 'error');
    }
}

// ============ 刷新余额 ============
async function refreshCredits(id) {
    // 找到按钮并添加动画
    const btn = document.querySelector(`tr[data-id="${id}"] .btn-icon-sm[title="刷新余额"]`);
    const cardBtn = document.querySelector(`.token-card[data-id="${id}"] .btn-sm:nth-child(2)`);

    if (btn) btn.classList.add('refreshing');
    if (cardBtn) cardBtn.disabled = true;

    try {
        const res = await fetch(`/api/flow/tokens/${id}/refresh-credits`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        const result = await res.json();

        if (result.success) {
            showToast(`余额刷新成功: ${result.credits}`, 'success');
            await loadTokens();
        } else {
            showToast(result.error || '刷新失败', 'error');
        }
    } catch (e) {
        console.error('Refresh credits error:', e);
        showToast('刷新余额失败', 'error');
    } finally {
        if (btn) btn.classList.remove('refreshing');
        if (cardBtn) cardBtn.disabled = false;
    }
}

// ============ 批量刷新余额 ============
async function batchRefreshCredits() {
    if (!confirm('确定要刷新所有活跃 Token 的余额吗？这可能需要一些时间。')) {
        return;
    }

    const btn = document.getElementById('refresh-credits-btn');
    const originalText = btn ? btn.innerHTML : '';

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `
            <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;">
                <path d="M21 12a9 9 0 11-6.219-8.56"/>
            </svg>
            刷新中...
        `;
    }

    try {
        const res = await fetch('/api/flow/tokens/batch-refresh-credits', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        const result = await res.json();

        if (result.success) {
            const data = result.data || [];
            showToast(`已刷新 ${data.length} 个 Token 的余额`, 'success');
            await loadTokens();
        } else {
            showToast(result.error || '批量刷新失败', 'error');
        }
    } catch (e) {
        console.error('Batch refresh credits error:', e);
        showToast('批量刷新余额失败', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}

// ============ 工具函数 ============
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
