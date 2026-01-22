// ============ API 密钥页面 JS ============

let apiKeys = [];
let createKeyModal;
let limitsModal;
let batchCreateModal;
let batchGeneratedKeys = [];

document.addEventListener('DOMContentLoaded', async () => {
    createKeyModal = document.getElementById('create-key-modal');
    limitsModal = document.getElementById('limits-modal');
    batchCreateModal = document.getElementById('batch-create-modal');

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

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeCreateModal();
            closeLimitsModal();
            closeBatchCreateModal();
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

function renderApiKeys() {
    const list = document.getElementById('api-keys-list');
    const emptyState = document.getElementById('empty-state');
    const countEl = document.getElementById('api-keys-count');

    countEl.textContent = '共 ' + apiKeys.length + ' 个密钥';

    if (apiKeys.length === 0) {
        list.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';
    list.innerHTML = apiKeys.map(function(key) {
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
            '<button class="btn btn-secondary btn-sm" onclick="toggleApiKey(' + key.id + ')">' + (key.isActive ? '禁用' : '启用') + '</button>' +
            '<button class="btn btn-danger btn-sm" onclick="deleteApiKey(' + key.id + ')">删除</button>' +
            '</div>' +
            '</td>' +
            '</tr>';
    }).join('');

    // 绑定复制按钮事件
    document.querySelectorAll('.api-key-copy-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            const row = btn.closest('tr');
            const keyValue = row.dataset.keyValue.replace(/&quot;/g, '"');
            copyApiKey(keyValue);
        });
    });

    // 加载用量统计
    apiKeys.forEach(function(key) {
        loadKeyLimitsStatus(key.id);
    });
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

function openCreateModal() {
    document.getElementById('key-name').value = '';
    document.getElementById('custom-key').value = '';
    createKeyModal.classList.add('active');
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
            showToast('API 密钥创建成功', 'success');
            if (result.data.key) {
                alert('请保存您的 API 密钥（只显示一次）:\n\n' + result.data.key);
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
            const cell = document.querySelector('.api-key-limits[data-key-id="' + keyId + '"]');
            const expireCell = document.querySelector('.api-key-expire[data-key-id="' + keyId + '"]');

            if (cell) {
                let html = '<div class="limits-mini">';

                // 显示今日用量
                if (limits.dailyLimit > 0) {
                    const percent = Math.min(100, (usage.daily / limits.dailyLimit) * 100);
                    html += '<div class="limit-item" title="今日: ' + usage.daily + '/' + limits.dailyLimit + '">' +
                        '<span class="limit-label">日</span>' +
                        '<span class="limit-value ' + (percent >= 90 ? 'warning' : '') + '">' + usage.daily + '/' + limits.dailyLimit + '</span>' +
                        '</div>';
                }

                // 显示本月用量
                if (limits.monthlyLimit > 0) {
                    const percent = Math.min(100, (usage.monthly / limits.monthlyLimit) * 100);
                    html += '<div class="limit-item" title="本月: ' + usage.monthly + '/' + limits.monthlyLimit + '">' +
                        '<span class="limit-label">月</span>' +
                        '<span class="limit-value ' + (percent >= 90 ? 'warning' : '') + '">' + usage.monthly + '/' + limits.monthlyLimit + '</span>' +
                        '</div>';
                }

                // 显示并发限制
                if (limits.concurrentLimit > 0) {
                    html += '<div class="limit-item" title="并发: ' + usage.currentConcurrent + '/' + limits.concurrentLimit + '">' +
                        '<span class="limit-label">并发</span>' +
                        '<span class="limit-value">' + usage.currentConcurrent + '/' + limits.concurrentLimit + '</span>' +
                        '</div>';
                }

                // 如果没有任何限制，显示总请求数
                if (limits.dailyLimit === 0 && limits.monthlyLimit === 0 && limits.concurrentLimit === 0) {
                    html += '<div class="limit-item">' +
                        '<span class="limit-value">' + usage.total + ' 请求</span>' +
                        '</div>';
                }

                html += '</div>';
                cell.innerHTML = html;
            }

            // 显示过期时间到单独的列
            if (expireCell) {
                if (expireDate) {
                    const expDate = new Date(expireDate);
                    const now = new Date();
                    const isExpired = expDate < now;
                    const daysLeft = remaining.days;

                    let expireClass = '';
                    // 使用 toLocaleString 确保时区正确
                    const expireDateStr = expDate.toLocaleString('zh-CN', {
                        month: 'numeric',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                    });

                    if (isExpired) {
                        expireClass = 'danger';
                    } else if (daysLeft <= 3) {
                        expireClass = 'danger';
                    } else if (daysLeft <= 7) {
                        expireClass = 'warning';
                    }

                    expireCell.innerHTML = '<span class="limit-value ' + expireClass + '" title="剩余 ' + daysLeft + ' 天">' +
                        (isExpired ? '已过期' : expireDateStr) + '</span>';
                } else {
                    expireCell.innerHTML = '<span class="limit-value" style="color: var(--text-muted);">永久</span>';
                }
            }
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
