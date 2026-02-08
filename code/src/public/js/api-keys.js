// ============ API 密钥页面 JS ============

let apiKeys = [];
let packages = []; // 套餐列表
let selectedPackage = null; // 当前选中的套餐
let createKeyModal;
let limitsModal;
let batchCreateModal;
let renewModal;
let batchGeneratedKeys = [];
let currentSortBy = 'lastUsed'; // 默认排序方式

document.addEventListener('DOMContentLoaded', async () => {
    createKeyModal = document.getElementById('create-key-modal');
    limitsModal = document.getElementById('limits-modal');
    batchCreateModal = document.getElementById('batch-create-modal');
    renewModal = document.getElementById('renew-modal');

    document.getElementById('sidebar-container').innerHTML = getSidebarHTML();
    initSidebar('api-keys');

    if (!await checkAuth()) return;

    loadApiKeys();
    setupEventListeners();
    updateSidebarStats();
});

function setupEventListeners() {
    document.getElementById('create-key-btn').addEventListener('click', openCreateModal);
    document.getElementById('modal-close').addEventListener('click', closeCreateModal);
    document.getElementById('modal-cancel').addEventListener('click', closeCreateModal);
    document.getElementById('modal-submit').addEventListener('click', createApiKey);
    createKeyModal.addEventListener('click', function(e) {
        if (e.target === createKeyModal) closeCreateModal();
    });

    // 排序下拉框事件
    document.getElementById('sort-select').addEventListener('change', function(e) {
        currentSortBy = e.target.value;
        renderApiKeys();
    });

    // 限制配置模态框事件
    document.getElementById('limits-modal-close').addEventListener('click', closeLimitsModal);
    document.getElementById('limits-modal-cancel').addEventListener('click', closeLimitsModal);
    document.getElementById('limits-modal-submit').addEventListener('click', saveLimits);
    limitsModal.addEventListener('click', function(e) {
        if (e.target === limitsModal) closeLimitsModal();
    });

    // 批量生成模态框事件
    document.getElementById('batch-create-btn').addEventListener('click', openBatchCreateModal);
    document.getElementById('batch-modal-close').addEventListener('click', closeBatchCreateModal);
    document.getElementById('batch-modal-cancel').addEventListener('click', closeBatchCreateModal);
    document.getElementById('batch-modal-submit').addEventListener('click', startBatchCreate);
    document.getElementById('batch-copy-all').addEventListener('click', copyAllBatchKeys);
    batchCreateModal.addEventListener('click', function(e) {
        if (e.target === batchCreateModal) closeBatchCreateModal();
    });

    // 续费模态框事件
    document.getElementById('renew-modal-close').addEventListener('click', closeRenewModal);
    document.getElementById('renew-modal-cancel').addEventListener('click', closeRenewModal);
    document.getElementById('renew-modal-submit').addEventListener('click', submitRenew);
    renewModal.addEventListener('click', function(e) {
        if (e.target === renewModal) closeRenewModal();
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeCreateModal();
            closeLimitsModal();
            closeBatchCreateModal();
            closeRenewModal();
        }
    });
}

async function loadApiKeys() {
    try {
        const res = await fetch('/api/keys', {
            headers: { 'Authorization': 'Bearer ' + authToken }
        });
        const result = await res.json();
        apiKeys = result.success ? result.data : [];
        renderApiKeys();
    } catch (err) {
        console.error('Load API keys error:', err);
        showToast('加载 API 密钥失败', 'error');
    }
}

// 排序函数
function sortApiKeys(keys, sortBy) {
    return keys.sort((a, b) => {
        switch (sortBy) {
            case 'lastUsed':
                // 按最后使用时间降序（未使用的排在最后）
                if (!a.lastUsedAt && !b.lastUsedAt) return 0;
                if (!a.lastUsedAt) return 1;
                if (!b.lastUsedAt) return -1;
                return new Date(b.lastUsedAt) - new Date(a.lastUsedAt);
            
            case 'created':
                // 按创建时间降序（最新的在前）
                if (!a.createdAt && !b.createdAt) return 0;
                if (!a.createdAt) return 1;
                if (!b.createdAt) return -1;
                return new Date(b.createdAt) - new Date(a.createdAt);
            
            case 'expire':
                // 按过期时间降序（即将过期的在前，永久的在最后）
                if (!a.expiresAt && !b.expiresAt) return 0;
                if (!a.expiresAt) return 1;  // 永久有效排在后面
                if (!b.expiresAt) return -1;
                return new Date(a.expiresAt) - new Date(b.expiresAt);  // 即将过期的在前
            
            case 'name':
                // 按名称字母顺序
                return (a.name || '').localeCompare(b.name || '');
            
            default:
                return 0;
        }
    });
}

function renderApiKeys() {
    const list = document.getElementById('api-keys-list');
    const emptyState = document.getElementById('empty-state');
    const countEl = document.getElementById('api-keys-count');

    countEl.textContent = '共 ' + apiKeys.length + ' 个密钥';

    if (apiKeys.length === 0) {
        list.innerHTML = '';
        emptyState.style.display = 'block';
        // 移除移动端卡片列表
        const cardList = document.getElementById('api-keys-card-list');
        if (cardList) cardList.innerHTML = '';
        return;
    }

    // 根据选择的排序方式排序
    const sortedKeys = sortApiKeys([...apiKeys], currentSortBy);

    emptyState.style.display = 'none';
    
    // 渲染表格（桌面端）
    list.innerHTML = sortedKeys.map(function(key) {
        const statusClass = key.isActive ? 'success' : 'error';
        const statusText = key.isActive ? '启用' : '禁用';
        const keyDisplay = key.keyValue || key.keyPrefix || '***';
        // 转义特殊字符，防止 XSS 和语法错误
        const escapedKey = keyDisplay.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');

        // 构建限制显示
        let limitsDisplay = '<span class="usage-loading">-</span>';

        return '<tr data-key-value="' + escapedKey + '">' +
            '<td class="api-key-name-cell">' + key.name + '</td>' +
            '<td>' +
            '<div class="api-key-value-cell">' +
            '<span class="api-key-value" style="font-size: 12px;">' + keyDisplay + '</span>' +
            '<button class="api-key-copy-btn" data-key-id="' + key.id + '">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">' +
            '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>' +
            '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>' +
            '</svg></button>' +
            '</div>' +
            '</td>' +
            '<td><span class="logs-status-badge ' + statusClass + '">' + statusText + '</span></td>' +
            '<td class="api-key-limits" data-key-id="' + key.id + '">' + limitsDisplay + '</td>' +
            '<td class="api-key-expire" data-key-id="' + key.id + '">-</td>' +
            '<td>' + formatDateTime(key.createdAt) + '</td>' +
            '<td>' + (key.lastUsedAt ? formatDateTime(key.lastUsedAt) : '从未使用') + '</td>' +
            '<td>' +
            '<div class="api-key-actions-cell">' +
            '<button class="btn btn-secondary btn-sm" onclick="openLimitsModal(' + key.id + ')" title="配置限制">限制</button>' +
            '<button class="btn btn-secondary btn-sm" onclick="openRenewModal(' + key.id + ')" title="续费">续费</button>' +
            '<button class="btn btn-secondary btn-sm" onclick="toggleApiKey(' + key.id + ')">' + (key.isActive ? '禁用' : '启用') + '</button>' +
            '<button class="btn btn-danger btn-sm" onclick="deleteApiKey(' + key.id + ')">删除</button>' +
            '</div>' +
            '</td>' +
            '</tr>';
    }).join('');

    // 渲染卡片列表（移动端）
    renderApiKeysCards(sortedKeys);

    // 绑定复制按钮事件
    document.querySelectorAll('.api-key-copy-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            const row = btn.closest('tr');
            const keyValue = row.dataset.keyValue.replace(/&quot;/g, '"');
            copyApiKey(keyValue);
        });
    });

    // 加载用量统计
    sortedKeys.forEach(function(key) {
        loadKeyLimitsStatus(key.id);
    });
}

// 移动端卡片渲染
function renderApiKeysCards(sortedKeys) {
    // 检查或创建卡片容器
    let cardList = document.getElementById('api-keys-card-list');
    if (!cardList) {
        cardList = document.createElement('div');
        cardList.id = 'api-keys-card-list';
        cardList.className = 'api-keys-card-list';
        const tableWrapper = document.querySelector('.api-keys-table-wrapper');
        if (tableWrapper) {
            tableWrapper.parentNode.insertBefore(cardList, tableWrapper.nextSibling);
        }
    }

    cardList.innerHTML = sortedKeys.map(function(key) {
        const statusClass = key.isActive ? 'active' : 'disabled';
        const statusText = key.isActive ? '启用' : '禁用';
        const keyDisplay = key.keyValue || key.keyPrefix || '***';
        const escapedKey = keyDisplay.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');

        return '<div class="api-key-card" data-key-id="' + key.id + '" data-key-value="' + escapedKey + '">' +
            '<div class="api-key-card-header">' +
            '<span class="api-key-card-name">' + key.name + '</span>' +
            '<span class="api-key-card-status ' + statusClass + '">' + statusText + '</span>' +
            '</div>' +
            '<div class="api-key-card-key">' +
            '<span class="api-key-card-key-value">' + keyDisplay + '</span>' +
            '<button class="api-key-card-key-copy" onclick="copyApiKey(\'' + escapedKey + '\')">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">' +
            '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>' +
            '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>' +
            '</svg></button>' +
            '</div>' +
            '<div class="api-key-card-info">' +
            '<div class="api-key-card-info-item">' +
            '<span class="api-key-card-info-label">限制/用量</span>' +
            '<span class="api-key-card-info-value api-key-card-limits" data-key-id="' + key.id + '">-</span>' +
            '</div>' +
            '<div class="api-key-card-info-item">' +
            '<span class="api-key-card-info-label">过期时间</span>' +
            '<span class="api-key-card-info-value api-key-card-expire" data-key-id="' + key.id + '">-</span>' +
            '</div>' +
            '<div class="api-key-card-info-item">' +
            '<span class="api-key-card-info-label">创建时间</span>' +
            '<span class="api-key-card-info-value">' + formatDateTime(key.createdAt) + '</span>' +
            '</div>' +
            '<div class="api-key-card-info-item">' +
            '<span class="api-key-card-info-label">最后使用</span>' +
            '<span class="api-key-card-info-value">' + (key.lastUsedAt ? formatDateTime(key.lastUsedAt) : '从未') + '</span>' +
            '</div>' +
            '</div>' +
            '<div class="api-key-card-actions">' +
            '<button class="btn btn-secondary btn-sm" onclick="openLimitsModal(' + key.id + ')">限制</button>' +
            '<button class="btn btn-secondary btn-sm" onclick="openRenewModal(' + key.id + ')">续费</button>' +
            '<button class="btn btn-secondary btn-sm" onclick="toggleApiKey(' + key.id + ')">' + (key.isActive ? '禁用' : '启用') + '</button>' +
            '<button class="btn btn-danger btn-sm" onclick="deleteApiKey(' + key.id + ')">删除</button>' +
            '</div>' +
            '</div>';
    }).join('');
}

async function loadKeyUsage(keyId) {
    try {
        const res = await fetch('/api/keys/' + keyId + '/usage', {
            headers: { 'Authorization': 'Bearer ' + authToken }
        });
        const result = await res.json();
        if (result.success && result.data) {
            const row = document.querySelector('tr:has(button[onclick*="toggleApiKey(' + keyId + ')"])');
            if (row) {
                const usageCell = row.querySelector('.api-key-usage');
                if (usageCell) {
                    usageCell.innerHTML = '<div class="usage-stats-mini">' +
                        '<div class="usage-stat-item">' + (result.data.totalRequests || 0) + ' 请求</div>' +
                        '</div>';
                }
            }
        }
    } catch (err) {
        console.error('Load key usage error:', err);
    }
}

async function openCreateModal() {
    document.getElementById('key-name').value = '';
    document.getElementById('custom-key').value = '';
    document.getElementById('package-select').value = '';
    document.getElementById('package-preview').style.display = 'none';
    selectedPackage = null;
    
    // 加载套餐列表
    await loadPackages();
    
    createKeyModal.classList.add('active');
}

// 加载套餐列表
async function loadPackages() {
    try {
        const res = await fetch('/api/packages/active', {
            headers: { 'Authorization': 'Bearer ' + authToken }
        });
        const result = await res.json();
        if (result.success) {
            packages = result.data;
            renderPackageSelect();
        }
    } catch (err) {
        console.error('加载套餐失败:', err);
    }
}

// 渲染套餐下拉框
function renderPackageSelect() {
    const select = document.getElementById('package-select');
    select.innerHTML = '<option value="">-- 不使用套餐 --</option>';
    
    packages.forEach(pkg => {
        const option = document.createElement('option');
        option.value = pkg.id;
        option.textContent = `${pkg.name}${pkg.price > 0 ? ` (¥${pkg.price})` : ''}`;
        select.appendChild(option);
    });
    
    // 添加选择事件
    select.onchange = function() {
        const pkgId = this.value;
        if (pkgId) {
            selectedPackage = packages.find(p => p.id === parseInt(pkgId));
            showPackagePreview(selectedPackage);
        } else {
            selectedPackage = null;
            document.getElementById('package-preview').style.display = 'none';
        }
    };
}

// 显示套餐预览
function showPackagePreview(pkg) {
    const preview = document.getElementById('package-preview');
    const content = preview.querySelector('.package-preview-content');
    
    const items = [];
    if (pkg.expiresInDays > 0) items.push(`<div class="package-preview-item"><span class="package-preview-label">有效期</span><span class="package-preview-value">${pkg.expiresInDays} 天</span></div>`);
    if (pkg.dailyLimit > 0) items.push(`<div class="package-preview-item"><span class="package-preview-label">每日请求</span><span class="package-preview-value">${pkg.dailyLimit}</span></div>`);
    if (pkg.monthlyLimit > 0) items.push(`<div class="package-preview-item"><span class="package-preview-label">每月请求</span><span class="package-preview-value">${pkg.monthlyLimit}</span></div>`);
    if (pkg.totalLimit > 0) items.push(`<div class="package-preview-item"><span class="package-preview-label">总请求数</span><span class="package-preview-value">${pkg.totalLimit}</span></div>`);
    if (pkg.concurrentLimit > 0) items.push(`<div class="package-preview-item"><span class="package-preview-label">并发限制</span><span class="package-preview-value">${pkg.concurrentLimit}</span></div>`);
    if (pkg.dailyCostLimit > 0) items.push(`<div class="package-preview-item"><span class="package-preview-label">日费用限制</span><span class="package-preview-value">¥${pkg.dailyCostLimit}</span></div>`);
    if (pkg.monthlyCostLimit > 0) items.push(`<div class="package-preview-item"><span class="package-preview-label">月费用限制</span><span class="package-preview-value">¥${pkg.monthlyCostLimit}</span></div>`);
    if (pkg.totalCostLimit > 0) items.push(`<div class="package-preview-item"><span class="package-preview-label">总费用限制</span><span class="package-preview-value">¥${pkg.totalCostLimit}</span></div>`);
    
    if (items.length === 0) {
        items.push(`<div class="package-preview-item"><span class="package-preview-label">无限制</span><span class="package-preview-value">-</span></div>`);
    }
    
    content.innerHTML = items.join('');
    preview.style.display = 'block';
}

function closeCreateModal() {
    createKeyModal.classList.remove('active');
}

async function createApiKey() {
    const name = document.getElementById('key-name').value.trim();
    const customKey = document.getElementById('custom-key').value.trim();

    if (!name) {
        showToast('请输入密钥名称', 'error');
        return;
    }

    try {
        // 创建密钥
        const res = await fetch('/api/keys', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + authToken
            },
            body: JSON.stringify({ name: name, customKey: customKey || undefined })
        });

        const result = await res.json();
        if (result.success) {
            const keyId = result.data.id;
            const keyValue = result.data.key;
            
            // 如果选择了套餐，应用套餐限制
            if (selectedPackage && keyId) {
                await applyPackageToKey(keyId, selectedPackage);
            }
            
            showToast('API 密钥创建成功', 'success');
            if (keyValue) {
                alert('请保存您的 API 密钥（只显示一次）:\n\n' + keyValue);
            }
            closeCreateModal();
            loadApiKeys();
        } else {
            showToast(result.error || '创建失败', 'error');
        }
    } catch (err) {
        showToast('创建失败: ' + err.message, 'error');
    }
}

// 应用套餐配置到密钥
async function applyPackageToKey(keyId, pkg) {
    try {
        await fetch(`/api/keys/${keyId}/limits`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + authToken
            },
            body: JSON.stringify({
                dailyLimit: pkg.dailyLimit,
                monthlyLimit: pkg.monthlyLimit,
                totalLimit: pkg.totalLimit,
                concurrentLimit: pkg.concurrentLimit,
                rateLimit: pkg.rateLimit,
                dailyCostLimit: pkg.dailyCostLimit,
                monthlyCostLimit: pkg.monthlyCostLimit,
                totalCostLimit: pkg.totalCostLimit,
                expiresInDays: pkg.expiresInDays
            })
        });
    } catch (err) {
        console.error('应用套餐配置失败:', err);
    }
}

async function toggleApiKey(id) {
    try {
        const res = await fetch('/api/keys/' + id + '/toggle', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + authToken }
        });
        const result = await res.json();
        if (result.success) {
            showToast('状态已更新', 'success');
            loadApiKeys();
        } else {
            showToast(result.error || '操作失败', 'error');
        }
    } catch (err) {
        showToast('操作失败: ' + err.message, 'error');
    }
}

async function deleteApiKey(id) {
    if (!confirm('确定要删除此 API 密钥吗？')) return;

    try {
        await fetch('/api/keys/' + id, {
            method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + authToken }
        });
        showToast('API 密钥已删除', 'success');
        loadApiKeys();
    } catch (err) {
        showToast('删除失败: ' + err.message, 'error');
    }
}

function copyApiKey(key) {
    copyToClipboard(key);
}

// ============ 限制配置相关函数 ============

async function loadKeyLimitsStatus(keyId) {
    try {
        const res = await fetch('/api/keys/' + keyId + '/limits-status', {
            headers: { 'Authorization': 'Bearer ' + authToken }
        });
        const result = await res.json();
        if (result.success && result.data) {
            const { limits, usage, remaining, expireDate } = result.data;
            
            // 桌面端表格
            const cell = document.querySelector('.api-key-limits[data-key-id="' + keyId + '"]');
            const expireCell = document.querySelector('.api-key-expire[data-key-id="' + keyId + '"]');
            
            // 移动端卡片
            const cardLimits = document.querySelector('.api-key-card-limits[data-key-id="' + keyId + '"]');
            const cardExpire = document.querySelector('.api-key-card-expire[data-key-id="' + keyId + '"]');

            // 构建限制显示内容
            let limitsHtml = '<div class="limits-mini">';
            let limitsText = '';

            // 显示今日用量
            if (limits.dailyLimit > 0) {
                const percent = Math.min(100, (usage.daily / limits.dailyLimit) * 100);
                limitsHtml += '<div class="limit-item" title="今日: ' + usage.daily + '/' + limits.dailyLimit + '">' +
                    '<span class="limit-label">日</span>' +
                    '<span class="limit-value ' + (percent >= 90 ? 'warning' : '') + '">' + usage.daily + '/' + limits.dailyLimit + '</span>' +
                    '</div>';
                limitsText += '日:' + usage.daily + '/' + limits.dailyLimit + ' ';
            }

            // 显示本月用量
            if (limits.monthlyLimit > 0) {
                const percent = Math.min(100, (usage.monthly / limits.monthlyLimit) * 100);
                limitsHtml += '<div class="limit-item" title="本月: ' + usage.monthly + '/' + limits.monthlyLimit + '">' +
                    '<span class="limit-label">月</span>' +
                    '<span class="limit-value ' + (percent >= 90 ? 'warning' : '') + '">' + usage.monthly + '/' + limits.monthlyLimit + '</span>' +
                    '</div>';
                limitsText += '月:' + usage.monthly + '/' + limits.monthlyLimit + ' ';
            }

            // 显示并发限制
            if (limits.concurrentLimit > 0) {
                limitsHtml += '<div class="limit-item" title="并发: ' + usage.currentConcurrent + '/' + limits.concurrentLimit + '">' +
                    '<span class="limit-label">并发</span>' +
                    '<span class="limit-value">' + usage.currentConcurrent + '/' + limits.concurrentLimit + '</span>' +
                    '</div>';
            }

            // 如果没有任何限制，显示总请求数
            if (limits.dailyLimit === 0 && limits.monthlyLimit === 0 && limits.concurrentLimit === 0) {
                limitsHtml += '<div class="limit-item">' +
                    '<span class="limit-value">' + usage.total + ' 请求</span>' +
                    '</div>';
                limitsText = usage.total + ' 请求';
            }

            limitsHtml += '</div>';

            // 更新桌面端
            if (cell) cell.innerHTML = limitsHtml;
            
            // 更新移动端
            if (cardLimits) cardLimits.textContent = limitsText || usage.total + ' 请求';

            // 处理过期时间
            let expireHtml = '';
            let expireText = '永久';
            
            if (expireDate) {
                const daysLeft = remaining.days;
                let expireClass = '';
                let expireDateStr = expireDate;
                
                // 格式化为 MM/DD HH:mm
                const parts = expireDate.split(' ');
                if (parts.length === 2) {
                    const dateParts = parts[0].split('-');
                    const timeParts = parts[1].split(':');
                    if (dateParts.length === 3 && timeParts.length >= 2) {
                        expireDateStr = dateParts[1] + '/' + dateParts[2] + ' ' + timeParts[0] + ':' + timeParts[1];
                    }
                }

                const isExpired = daysLeft <= 0;

                if (isExpired) {
                    expireClass = 'danger';
                } else if (daysLeft <= 3) {
                    expireClass = 'danger';
                } else if (daysLeft <= 7) {
                    expireClass = 'warning';
                }

                expireHtml = '<span class="limit-value ' + expireClass + '" title="剩余 ' + daysLeft + ' 天">' +
                    (isExpired ? '已过期' : expireDateStr) + '</span>';
                expireText = isExpired ? '已过期' : (daysLeft + '天');
            } else {
                expireHtml = '<span class="limit-value" style="color: var(--text-muted);">永久</span>';
            }

            // 更新桌面端过期时间
            if (expireCell) expireCell.innerHTML = expireHtml;
            
            // 更新移动端过期时间
            if (cardExpire) cardExpire.textContent = expireText;
        }
    } catch (err) {
        console.error('Load key limits status error:', err);
    }
}

async function openLimitsModal(keyId) {
    try {
        // 获取密钥详情
        const res = await fetch('/api/keys/' + keyId, {
            headers: { 'Authorization': 'Bearer ' + authToken }
        });
        const result = await res.json();
        if (!result.success) {
            showToast(result.error || '获取密钥信息失败', 'error');
            return;
        }

        const key = result.data;
        document.getElementById('limits-key-id').value = keyId;
        document.getElementById('limits-key-name').textContent = key.name;
        document.getElementById('daily-limit').value = key.dailyLimit || 0;
        document.getElementById('monthly-limit').value = key.monthlyLimit || 0;
        document.getElementById('total-limit').value = key.totalLimit || 0;
        document.getElementById('concurrent-limit').value = key.concurrentLimit || 0;
        // 金额限制
        document.getElementById('daily-cost-limit').value = key.dailyCostLimit || 0;
        document.getElementById('monthly-cost-limit').value = key.monthlyCostLimit || 0;
        document.getElementById('total-cost-limit').value = key.totalCostLimit || 0;
        // 有效期
        document.getElementById('expires-in-days').value = key.expiresInDays || 0;

        // 加载当前用量状态
        loadLimitsStatusInModal(keyId);

        limitsModal.classList.add('active');
    } catch (err) {
        showToast('获取密钥信息失败: ' + err.message, 'error');
    }
}

async function loadLimitsStatusInModal(keyId) {
    try {
        const res = await fetch('/api/keys/' + keyId + '/limits-status', {
            headers: { 'Authorization': 'Bearer ' + authToken }
        });
        const result = await res.json();
        if (result.success && result.data) {
            const { usage, remaining } = result.data;
            const statusDiv = document.getElementById('limits-status');
            const gridDiv = document.getElementById('usage-grid');

            let html = '<div class="usage-item"><span class="usage-label">今日请求</span><span class="usage-value">' + usage.daily + '</span></div>' +
                '<div class="usage-item"><span class="usage-label">本月请求</span><span class="usage-value">' + usage.monthly + '</span></div>' +
                '<div class="usage-item"><span class="usage-label">总请求</span><span class="usage-value">' + usage.total + '</span></div>' +
                '<div class="usage-item"><span class="usage-label">今日费用</span><span class="usage-value">$' + (usage.dailyCost || 0).toFixed(4) + '</span></div>' +
                '<div class="usage-item"><span class="usage-label">本月费用</span><span class="usage-value">$' + (usage.monthlyCost || 0).toFixed(4) + '</span></div>' +
                '<div class="usage-item"><span class="usage-label">总费用</span><span class="usage-value">$' + (usage.totalCost || 0).toFixed(4) + '</span></div>';

            if (remaining.days !== null) {
                html += '<div class="usage-item"><span class="usage-label">剩余天数</span><span class="usage-value">' + remaining.days + ' 天</span></div>';
            }

            gridDiv.innerHTML = html;
            statusDiv.style.display = 'block';
        }
    } catch (err) {
        console.error('Load limits status error:', err);
    }
}

function closeLimitsModal() {
    limitsModal.classList.remove('active');
    document.getElementById('limits-status').style.display = 'none';
}

async function saveLimits() {
    const keyId = document.getElementById('limits-key-id').value;
    const dailyLimit = parseInt(document.getElementById('daily-limit').value) || 0;
    const monthlyLimit = parseInt(document.getElementById('monthly-limit').value) || 0;
    const totalLimit = parseInt(document.getElementById('total-limit').value) || 0;
    const concurrentLimit = parseInt(document.getElementById('concurrent-limit').value) || 0;
    // 金额限制
    const dailyCostLimit = parseFloat(document.getElementById('daily-cost-limit').value) || 0;
    const monthlyCostLimit = parseFloat(document.getElementById('monthly-cost-limit').value) || 0;
    const totalCostLimit = parseFloat(document.getElementById('total-cost-limit').value) || 0;
    // 有效期
    const expiresInDays = parseInt(document.getElementById('expires-in-days').value) || 0;

    try {
        const res = await fetch('/api/keys/' + keyId + '/limits', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + authToken
            },
            body: JSON.stringify({
                dailyLimit,
                monthlyLimit,
                totalLimit,
                concurrentLimit,
                dailyCostLimit,
                monthlyCostLimit,
                totalCostLimit,
                expiresInDays
            })
        });

        const result = await res.json();
        if (result.success) {
            showToast('限制配置已保存', 'success');
            closeLimitsModal();
            loadApiKeys();
        } else {
            showToast(result.error || '保存失败', 'error');
        }
    } catch (err) {
        showToast('保存失败: ' + err.message, 'error');
    }
}

// ============ 批量生成相关函数 ============

function openBatchCreateModal() {
    document.getElementById('batch-name-prefix').value = '';
    document.getElementById('batch-count').value = '10';
    document.getElementById('batch-progress').style.display = 'none';
    document.getElementById('batch-results').innerHTML = '';
    document.getElementById('batch-modal-submit').style.display = 'inline-flex';
    document.getElementById('batch-modal-submit').disabled = false;
    document.getElementById('batch-copy-all').style.display = 'none';
    batchGeneratedKeys = [];
    batchCreateModal.classList.add('active');
}

function closeBatchCreateModal() {
    batchCreateModal.classList.remove('active');
}

async function startBatchCreate() {
    const prefix = document.getElementById('batch-name-prefix').value.trim();
    const count = parseInt(document.getElementById('batch-count').value) || 0;

    if (!prefix) {
        showToast('请输入名称前缀', 'error');
        return;
    }

    if (count < 1 || count > 100) {
        showToast('生成数量必须在 1-100 之间', 'error');
        return;
    }

    // 显示进度条
    document.getElementById('batch-progress').style.display = 'block';
    document.getElementById('batch-modal-submit').disabled = true;
    document.getElementById('batch-results').innerHTML = '';
    batchGeneratedKeys = [];

    const progressBar = document.getElementById('batch-progress-bar');
    const progressText = document.getElementById('batch-progress-text');
    const resultsDiv = document.getElementById('batch-results');

    let successCount = 0;
    let failCount = 0;

    for (let i = 1; i <= count; i++) {
        const keyName = prefix + '_' + i;
        progressText.textContent = i + '/' + count;
        progressBar.style.width = ((i / count) * 100) + '%';

        try {
            const res = await fetch('/api/keys', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + authToken
                },
                body: JSON.stringify({ name: keyName })
            });

            const result = await res.json();
            if (result.success && result.data.key) {
                successCount++;
                batchGeneratedKeys.push({ name: keyName, key: result.data.key });
                const escapedKey = result.data.key.replace(/'/g, "\\'");
                resultsDiv.innerHTML += '<div class="batch-result-item success">' +
                    '<span class="batch-result-name">' + keyName + '</span>' +
                    '<span class="batch-result-key">' + result.data.key + '</span>' +
                    '<button class="btn btn-sm" onclick="copyToClipboard(\'' + escapedKey + '\')">复制</button>' +
                    '</div>';
            } else {
                failCount++;
                resultsDiv.innerHTML += '<div class="batch-result-item error">' +
                    '<span class="batch-result-name">' + keyName + '</span>' +
                    '<span class="batch-result-error">' + (result.error || '创建失败') + '</span>' +
                    '</div>';
            }
        } catch (err) {
            failCount++;
            resultsDiv.innerHTML += '<div class="batch-result-item error">' +
                '<span class="batch-result-name">' + keyName + '</span>' +
                '<span class="batch-result-error">' + err.message + '</span>' +
                '</div>';
        }

        // 滚动到底部
        resultsDiv.scrollTop = resultsDiv.scrollHeight;
    }

    // 完成
    document.getElementById('batch-modal-submit').style.display = 'none';
    if (batchGeneratedKeys.length > 0) {
        document.getElementById('batch-copy-all').style.display = 'inline-flex';
    }

    showToast('批量生成完成: 成功 ' + successCount + ' 个, 失败 ' + failCount + ' 个',
        failCount === 0 ? 'success' : 'warning');

    // 刷新列表
    loadApiKeys();
}

function copyAllBatchKeys() {
    if (batchGeneratedKeys.length === 0) {
        showToast('没有可复制的密钥', 'error');
        return;
    }

    const text = batchGeneratedKeys.map(function(item) {
        return item.name + ': ' + item.key;
    }).join('\n');

    copyToClipboard(text);
}

// ============ 续费相关函数 ============

function setRenewDays(days) {
    document.getElementById('renew-days').value = days;
}

async function openRenewModal(keyId) {
    try {
        // 获取密钥详情
        const res = await fetch('/api/keys/' + keyId, {
            headers: { 'Authorization': 'Bearer ' + authToken }
        });
        const result = await res.json();
        if (!result.success) {
            showToast(result.error || '获取密钥信息失败', 'error');
            return;
        }

        const key = result.data;
        document.getElementById('renew-key-id').value = keyId;
        document.getElementById('renew-key-name').textContent = key.name;
        document.getElementById('renew-days').value = 30;

        // 获取当前状态
        const statusRes = await fetch('/api/keys/' + keyId + '/limits-status', {
            headers: { 'Authorization': 'Bearer ' + authToken }
        });
        const statusResult = await statusRes.json();

        if (statusResult.success && statusResult.data) {
            const { expireDate, remaining } = statusResult.data;
            if (expireDate) {
                const expDate = new Date(expireDate);
                const now = new Date();
                const isExpired = expDate < now;
                const daysLeft = remaining.days;

                document.getElementById('renew-current-status').innerHTML = isExpired
                    ? '<span style="color: var(--danger-color);">已过期</span>'
                    : '<span style="color: var(--success-color);">有效</span>';
                document.getElementById('renew-remaining-days').innerHTML = isExpired
                    ? '<span style="color: var(--danger-color);">已过期</span>'
                    : '<span>' + daysLeft + ' 天</span>';
            } else {
                document.getElementById('renew-current-status').innerHTML = '<span style="color: var(--text-muted);">永久有效</span>';
                document.getElementById('renew-remaining-days').innerHTML = '<span style="color: var(--text-muted);">无限制</span>';
            }
        }

        renewModal.classList.add('active');
    } catch (err) {
        showToast('获取密钥信息失败: ' + err.message, 'error');
    }
}

function closeRenewModal() {
    renewModal.classList.remove('active');
}

async function submitRenew() {
    const keyId = document.getElementById('renew-key-id').value;
    const days = parseInt(document.getElementById('renew-days').value) || 0;

    if (days <= 0) {
        showToast('续费天数必须大于 0', 'error');
        return;
    }

    try {
        const res = await fetch('/api/keys/' + keyId + '/renew', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + authToken
            },
            body: JSON.stringify({ days: days })
        });

        const result = await res.json();
        if (result.success) {
            showToast('续费成功，新增 ' + result.data.addedDays + ' 天，剩余 ' + result.data.remainingDays + ' 天', 'success');
            closeRenewModal();
            loadApiKeys();
        } else {
            showToast(result.error || '续费失败', 'error');
        }
    } catch (err) {
        showToast('续费失败: ' + err.message, 'error');
    }
}
