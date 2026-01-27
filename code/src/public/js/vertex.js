/**
 * Vertex AI 账号管理页面 JavaScript
 */

let credentials = [];
let selectedIds = new Set();
let currentContextId = null;
let currentEditId = null;
let parsedJsonData = null;

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
    // 初始化侧边栏
    const sidebarContainer = document.getElementById('sidebar-container');
    if (sidebarContainer) {
        sidebarContainer.innerHTML = getSidebarHTML();
        initSidebar('vertex');
        updateSidebarStats();
    }

    await loadCredentials();
    await loadStatistics();
    await loadModels();
    setupEventListeners();
    setupDropZone();
    setupRegionSelector();
});

// 加载凭据列表
async function loadCredentials() {
    try {
        const response = await fetch('/api/vertex/credentials');
        credentials = await response.json();
        renderCards();
    } catch (error) {
        showToast('加载凭据失败: ' + error.message, 'error');
    }
}

// 加载统计信息
async function loadStatistics() {
    try {
        const response = await fetch('/api/vertex/statistics');
        const stats = await response.json();
        document.getElementById('stat-total').textContent = stats.total || 0;
        document.getElementById('stat-active').textContent = stats.active || 0;
        document.getElementById('stat-healthy').textContent = stats.healthy || 0;
        document.getElementById('stat-usage').textContent = stats.totalUseCount || 0;
    } catch (error) {
        console.error('加载统计失败:', error);
    }
}

// 加载支持的模型列表
async function loadModels() {
    try {
        const response = await fetch('/api/vertex/models');
        const data = await response.json();
        renderModels(data.models, data.mapping);
    } catch (error) {
        console.error('加载模型列表失败:', error);
    }
}

// 渲染模型列表
function renderModels(models, mapping) {
    const grid = document.getElementById('models-grid');
    if (!grid) return;

    // 按版本分组排序：4.5 > 4 > 3.7 > 3.5 > 3
    const sortedModels = models.sort((a, b) => {
        const getVersion = (name) => {
            if (name.includes('4-5') || name.includes('4.5')) return 5;
            if (name.includes('sonnet-4') || name.includes('4-sonnet')) return 4;
            if (name.includes('3-7') || name.includes('3.7')) return 3.7;
            if (name.includes('3-5') || name.includes('3.5')) return 3.5;
            return 3;
        };
        return getVersion(b) - getVersion(a);
    });

    grid.innerHTML = sortedModels.map(model => {
        const vertexModel = mapping[model];
        const isV4Plus = model.includes('4-5') || model.includes('4.5') || model.includes('sonnet-4') || model.includes('4-sonnet');
        const badgeClass = isV4Plus ? 'claude-4' : 'claude-3';
        const badgeText = isV4Plus ? 'Latest' : 'v3';

        return `
            <div class="model-card" data-model="${escapeHtml(model)}" onclick="copyModelName('${escapeHtml(model)}', this)">
                ${isV4Plus ? `<span class="model-card-badge ${badgeClass}">${badgeText}</span>` : ''}
                <div class="model-card-name">${escapeHtml(model)}</div>
                <div class="model-card-mapping">→ ${escapeHtml(vertexModel)}</div>
                <div class="model-card-copy-hint">点击复制模型名称</div>
            </div>
        `;
    }).join('');
}

// 复制模型名称
function copyModelName(modelName, element) {
    navigator.clipboard.writeText(modelName).then(() => {
        element.classList.add('copied');
        showToast(`已复制: ${modelName}`, 'success');
        setTimeout(() => {
            element.classList.remove('copied');
        }, 1500);
    }).catch(() => {
        // 备用复制方法
        const textArea = document.createElement('textarea');
        textArea.value = modelName;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            element.classList.add('copied');
            showToast(`已复制: ${modelName}`, 'success');
            setTimeout(() => {
                element.classList.remove('copied');
            }, 1500);
        } catch (e) {
            showToast('复制失败', 'error');
        }
        document.body.removeChild(textArea);
    });
}

// 渲染卡片
function renderCards() {
    const grid = document.getElementById('cards-grid');
    const emptyState = document.getElementById('empty-state');
    const searchInput = document.getElementById('search-input');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

    // 过滤
    const filtered = credentials.filter(c =>
        c.name.toLowerCase().includes(searchTerm) ||
        (c.projectId && c.projectId.toLowerCase().includes(searchTerm)) ||
        (c.clientEmail && c.clientEmail.toLowerCase().includes(searchTerm))
    );

    document.getElementById('displayed-count').textContent = filtered.length;

    if (filtered.length === 0) {
        grid.style.display = 'none';
        emptyState.style.display = 'flex';
        return;
    }

    grid.style.display = 'grid';
    emptyState.style.display = 'none';

    grid.innerHTML = filtered.map(c => createCard(c)).join('');

    // 绑定卡片事件
    grid.querySelectorAll('.vertex-card').forEach(card => {
        const id = parseInt(card.dataset.id);

        card.querySelector('.card-checkbox')?.addEventListener('change', (e) => {
            if (e.target.checked) {
                selectedIds.add(id);
                card.classList.add('selected');
            } else {
                selectedIds.delete(id);
                card.classList.remove('selected');
            }
            updateBatchButtons();
        });

        card.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showContextMenu(e, id);
        });

        card.querySelector('.card-menu-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            showContextMenu(e, id);
        });
    });
}

// 创建卡片 HTML
function createCard(credential) {
    const statusClass = credential.errorCount > 0 ? 'error' : (credential.isActive ? 'active' : 'inactive');
    const statusText = credential.errorCount > 0 ? '错误' : (credential.isActive ? '活跃' : '正常');

    return `
        <div class="vertex-card ${selectedIds.has(credential.id) ? 'selected' : ''}" data-id="${credential.id}">
            <div class="card-header">
                <input type="checkbox" class="checkbox-custom card-checkbox" ${selectedIds.has(credential.id) ? 'checked' : ''}>
                <div class="card-title-section">
                    <h3 class="card-title" title="${escapeHtml(credential.name)}">${escapeHtml(credential.name)}</h3>
                    <span class="card-subtitle">${escapeHtml(credential.projectId || '')}</span>
                </div>
                <button class="card-menu-btn" title="更多操作">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="1"/>
                        <circle cx="12" cy="5" r="1"/>
                        <circle cx="12" cy="19" r="1"/>
                    </svg>
                </button>
            </div>
            <div class="card-body">
                <div class="card-info-row">
                    <span class="card-info-label">Client Email</span>
                    <span class="card-info-value" title="${escapeHtml(credential.clientEmail || '')}">${escapeHtml(credential.clientEmail || '-')}</span>
                </div>
                <div class="card-info-row">
                    <span class="card-info-label">区域</span>
                    <span class="card-info-value">${escapeHtml(credential.region || 'global')}</span>
                </div>
                <div class="card-info-row">
                    <span class="card-info-label">使用次数</span>
                    <span class="card-info-value">${credential.useCount || 0}</span>
                </div>
                ${credential.lastErrorMessage ? `
                <div class="card-info-row">
                    <span class="card-info-label">最后错误</span>
                    <span class="card-info-value error-text" title="${escapeHtml(credential.lastErrorMessage)}">${escapeHtml(credential.lastErrorMessage.substring(0, 50))}${credential.lastErrorMessage.length > 50 ? '...' : ''}</span>
                </div>
                ` : ''}
            </div>
            <div class="card-footer">
                <span class="status-badge ${statusClass}">${statusText}</span>
                <span class="card-date">${formatDate(credential.createdAt)}</span>
            </div>
        </div>
    `;
}

// 设置事件监听
function setupEventListeners() {
    // 搜索
    document.getElementById('search-input')?.addEventListener('input', () => {
        renderCards();
    });

    // 添加账号按钮
    document.getElementById('add-account-btn')?.addEventListener('click', showAddModal);
    document.getElementById('empty-add-btn')?.addEventListener('click', showAddModal);

    // 导入 JSON 按钮
    document.getElementById('import-json-btn')?.addEventListener('click', showImportModal);

    // 添加模态框
    document.getElementById('modal-close')?.addEventListener('click', hideAddModal);
    document.getElementById('modal-cancel')?.addEventListener('click', hideAddModal);
    document.getElementById('modal-submit')?.addEventListener('click', submitAddForm);

    // 导入模态框
    document.getElementById('import-modal-close')?.addEventListener('click', hideImportModal);
    document.getElementById('import-modal-cancel')?.addEventListener('click', hideImportModal);
    document.getElementById('import-modal-submit')?.addEventListener('click', submitImportForm);

    // 全选
    document.getElementById('select-all')?.addEventListener('change', (e) => {
        const checkboxes = document.querySelectorAll('.card-checkbox');
        checkboxes.forEach(cb => {
            cb.checked = e.target.checked;
            const id = parseInt(cb.closest('.account-card').dataset.id);
            if (e.target.checked) {
                selectedIds.add(id);
            } else {
                selectedIds.delete(id);
            }
        });
        updateBatchButtons();
    });

    // 批量删除
    document.getElementById('batch-delete-btn')?.addEventListener('click', batchDelete);

    // 右键菜单
    document.addEventListener('click', hideContextMenu);

    // 右键菜单项
    document.querySelectorAll('.context-menu-item').forEach(item => {
        item.addEventListener('click', () => {
            const action = item.dataset.action;
            handleContextAction(action, currentContextId);
            hideContextMenu();
        });
    });

    // 点击模态框外部关闭
    document.getElementById('add-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'add-modal') hideAddModal();
    });
    document.getElementById('import-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'import-modal') hideImportModal();
    });
}

// 显示添加模态框
function showAddModal() {
    currentEditId = null;
    document.getElementById('add-modal').classList.add('active');
    document.getElementById('account-name').value = '';
    document.getElementById('project-id').value = '';
    document.getElementById('client-email').value = '';
    document.getElementById('private-key').value = '';
    document.getElementById('private-key').placeholder = '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----';
    document.getElementById('region').value = 'global';

    // 重置模态框标题和按钮
    const modalTitle = document.querySelector('#add-modal .modal-title');
    if (modalTitle) modalTitle.textContent = '添加 Vertex AI 账号';

    const submitBtn = document.getElementById('modal-submit');
    submitBtn.innerHTML = `
        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"/>
        </svg>
        添加账号
    `;
}

// 隐藏添加模态框
function hideAddModal() {
    document.getElementById('add-modal').classList.remove('active');
    resetAddModal();
}

// 提交添加表单（统一处理添加和编辑）
async function submitAddForm() {
    // 如果是编辑模式
    if (currentEditId) {
        await submitEditForm(currentEditId);
        return;
    }

    const name = document.getElementById('account-name').value.trim();
    const projectId = document.getElementById('project-id').value.trim();
    const clientEmail = document.getElementById('client-email').value.trim();
    const privateKey = document.getElementById('private-key').value.trim();
    const region = document.getElementById('region').value;

    if (!name || !projectId || !clientEmail || !privateKey) {
        showToast('请填写所有必填字段', 'error');
        return;
    }

    try {
        const response = await fetch('/api/vertex/credentials', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, projectId, clientEmail, privateKey, region })
        });

        const result = await response.json();
        if (response.ok) {
            showToast('账号添加成功', 'success');
            hideAddModal();
            await loadCredentials();
            await loadStatistics();
        } else {
            showToast(result.error || '添加失败', 'error');
        }
    } catch (error) {
        showToast('添加失败: ' + error.message, 'error');
    }
}

// 显示导入模态框
function showImportModal() {
    document.getElementById('import-modal').classList.add('active');
    document.getElementById('import-name').value = '';
    document.getElementById('import-region').value = 'global';
    document.getElementById('import-json').value = '';
    parsedJsonData = null;

    // 重置区域选择器
    document.querySelectorAll('#import-region-selector .region-option').forEach(opt => {
        opt.classList.remove('selected');
        if (opt.dataset.value === 'global') {
            opt.classList.add('selected');
        }
    });

    // 隐藏预览
    document.getElementById('import-preview')?.classList.remove('show');
}

// 隐藏导入模态框
function hideImportModal() {
    document.getElementById('import-modal').classList.remove('active');
    parsedJsonData = null;
}

// 提交导入表单
async function submitImportForm() {
    const nameInput = document.getElementById('import-name');
    const region = document.getElementById('import-region').value;
    const jsonStr = document.getElementById('import-json').value.trim();

    // 尝试解析 JSON
    let keyJson;
    try {
        keyJson = JSON.parse(jsonStr);
    } catch (e) {
        showToast('JSON 格式无效', 'error');
        return;
    }

    // 如果名称为空，使用 project_id
    let name = nameInput.value.trim();
    if (!name && keyJson.project_id) {
        name = keyJson.project_id;
    }

    if (!name) {
        showToast('请填写账号名称', 'error');
        return;
    }

    try {
        const response = await fetch('/api/vertex/credentials/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, region, keyJson })
        });

        const result = await response.json();
        if (response.ok) {
            showToast('导入成功', 'success');
            hideImportModal();
            await loadCredentials();
            await loadStatistics();
        } else {
            showToast(result.error || '导入失败', 'error');
        }
    } catch (error) {
        showToast('导入失败: ' + error.message, 'error');
    }
}

// 设置拖拽上传区域
function setupDropZone() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const jsonTextarea = document.getElementById('import-json');

    if (!dropZone || !fileInput) return;

    // 点击上传
    dropZone.addEventListener('click', () => fileInput.click());

    // 文件选择
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) handleFile(file);
    });

    // 拖拽事件
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    });

    // JSON 文本框变化时解析
    jsonTextarea?.addEventListener('input', debounce(() => {
        parseJsonContent(jsonTextarea.value);
    }, 500));
}

// 处理上传的文件
function handleFile(file) {
    if (!file.name.endsWith('.json')) {
        showToast('请上传 JSON 文件', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const content = e.target.result;
        document.getElementById('import-json').value = content;
        parseJsonContent(content);
    };
    reader.onerror = () => {
        showToast('文件读取失败', 'error');
    };
    reader.readAsText(file);
}

// 解析 JSON 内容
function parseJsonContent(content) {
    const preview = document.getElementById('import-preview');
    const previewProject = document.getElementById('preview-project');
    const previewEmail = document.getElementById('preview-email');
    const nameInput = document.getElementById('import-name');

    if (!content.trim()) {
        preview?.classList.remove('show');
        parsedJsonData = null;
        return;
    }

    try {
        const json = JSON.parse(content);

        // 验证必要字段
        if (!json.project_id || !json.client_email || !json.private_key) {
            preview?.classList.remove('show');
            parsedJsonData = null;
            return;
        }

        parsedJsonData = json;

        // 显示预览
        if (previewProject) previewProject.textContent = json.project_id;
        if (previewEmail) previewEmail.textContent = json.client_email;
        preview?.classList.add('show');

        // 自动填充名称（如果为空）
        if (nameInput && !nameInput.value.trim()) {
            nameInput.value = json.project_id;
        }
    } catch (e) {
        preview?.classList.remove('show');
        parsedJsonData = null;
    }
}

// 设置区域选择器
function setupRegionSelector() {
    const selector = document.getElementById('import-region-selector');
    const hiddenInput = document.getElementById('import-region');

    if (!selector) return;

    selector.querySelectorAll('.region-option').forEach(option => {
        option.addEventListener('click', () => {
            // 移除其他选中状态
            selector.querySelectorAll('.region-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            // 添加选中状态
            option.classList.add('selected');
            // 更新隐藏输入框
            if (hiddenInput) {
                hiddenInput.value = option.dataset.value;
            }
        });
    });
}

// 防抖函数
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// 显示右键菜单
function showContextMenu(e, id) {
    currentContextId = id;
    const menu = document.getElementById('context-menu');
    menu.style.display = 'block';

    const x = e.clientX || e.pageX;
    const y = e.clientY || e.pageY;

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    // 确保菜单不超出视口
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        menu.style.left = `${x - rect.width}px`;
    }
    if (rect.bottom > window.innerHeight) {
        menu.style.top = `${y - rect.height}px`;
    }
}

// 隐藏右键菜单
function hideContextMenu() {
    document.getElementById('context-menu').style.display = 'none';
    currentContextId = null;
}

// 处理右键菜单操作
async function handleContextAction(action, id) {
    switch (action) {
        case 'activate':
            await activateCredential(id);
            break;
        case 'test':
            await testCredential(id);
            break;
        case 'edit':
            showEditModal(id);
            break;
        case 'delete':
            await deleteCredential(id);
            break;
    }
}

// 激活凭据
async function activateCredential(id) {
    try {
        const response = await fetch(`/api/vertex/credentials/${id}/activate`, {
            method: 'POST'
        });
        if (response.ok) {
            showToast('已设为活跃', 'success');
            await loadCredentials();
            await loadStatistics();
        } else {
            const result = await response.json();
            showToast(result.error || '操作失败', 'error');
        }
    } catch (error) {
        showToast('操作失败: ' + error.message, 'error');
    }
}

// 测试凭据
async function testCredential(id) {
    showToast('正在测试连接...', 'info');
    try {
        const response = await fetch(`/api/vertex/credentials/${id}/test`, {
            method: 'POST'
        });
        const result = await response.json();
        if (response.ok) {
            showToast('连接测试成功', 'success');
            await loadCredentials();
            await loadStatistics();
        } else {
            showToast('测试失败: ' + (result.error || '未知错误'), 'error');
        }
    } catch (error) {
        showToast('测试失败: ' + error.message, 'error');
    }
}

// 显示编辑模态框
function showEditModal(id) {
    const credential = credentials.find(c => c.id === id);
    if (!credential) return;

    currentEditId = id;
    document.getElementById('add-modal').classList.add('active');
    document.getElementById('account-name').value = credential.name;
    document.getElementById('project-id').value = credential.projectId || '';
    document.getElementById('client-email').value = credential.clientEmail || '';
    document.getElementById('private-key').value = '';
    document.getElementById('private-key').placeholder = '留空保持不变';
    document.getElementById('region').value = credential.region || 'global';

    // 修改模态框标题和按钮
    const modalTitle = document.querySelector('#add-modal .modal-title');
    if (modalTitle) modalTitle.textContent = '编辑 Vertex AI 账号';

    const submitBtn = document.getElementById('modal-submit');
    submitBtn.innerHTML = `
        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"/>
        </svg>
        保存修改
    `;
}

// 重置添加模态框
function resetAddModal() {
    currentEditId = null;
    const modalTitle = document.querySelector('#add-modal .modal-title');
    if (modalTitle) modalTitle.textContent = '添加 Vertex AI 账号';

    const submitBtn = document.getElementById('modal-submit');
    submitBtn.innerHTML = `
        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"/>
        </svg>
        添加账号
    `;
    document.getElementById('private-key').placeholder = '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----';
}

// 提交编辑表单
async function submitEditForm(id) {
    const name = document.getElementById('account-name').value.trim();
    const projectId = document.getElementById('project-id').value.trim();
    const clientEmail = document.getElementById('client-email').value.trim();
    const privateKey = document.getElementById('private-key').value.trim();
    const region = document.getElementById('region').value;

    if (!name) {
        showToast('请填写账号名称', 'error');
        return;
    }

    const data = { name, projectId, clientEmail, region };
    if (privateKey) {
        data.privateKey = privateKey;
    }

    try {
        const response = await fetch(`/api/vertex/credentials/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        if (response.ok) {
            showToast('修改成功', 'success');
            hideAddModal();
            await loadCredentials();
            await loadStatistics();
        } else {
            showToast(result.error || '修改失败', 'error');
        }
    } catch (error) {
        showToast('修改失败: ' + error.message, 'error');
    }
}

// 删除凭据
async function deleteCredential(id) {
    if (!confirm('确定要删除这个凭据吗？')) return;

    try {
        const response = await fetch(`/api/vertex/credentials/${id}`, {
            method: 'DELETE'
        });
        if (response.ok) {
            showToast('删除成功', 'success');
            await loadCredentials();
            await loadStatistics();
        } else {
            const result = await response.json();
            showToast(result.error || '删除失败', 'error');
        }
    } catch (error) {
        showToast('删除失败: ' + error.message, 'error');
    }
}

// 批量删除
async function batchDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`确定要删除选中的 ${selectedIds.size} 个凭据吗？`)) return;

    let success = 0;
    let failed = 0;
    for (const id of selectedIds) {
        try {
            const response = await fetch(`/api/vertex/credentials/${id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                success++;
            } else {
                failed++;
            }
        } catch {
            failed++;
        }
    }

    selectedIds.clear();
    updateBatchButtons();
    await loadCredentials();
    await loadStatistics();

    showToast(`删除完成: 成功 ${success} 个, 失败 ${failed} 个`, success > 0 ? 'success' : 'error');
}

// 更新批量操作按钮
function updateBatchButtons() {
    const batchDeleteBtn = document.getElementById('batch-delete-btn');
    if (batchDeleteBtn) {
        batchDeleteBtn.style.display = selectedIds.size > 0 ? 'flex' : 'none';
    }
}

// 工具函数
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
