// ============ 公开用量查询页面 JS ============

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('query-form');
    const apiKeyInput = document.getElementById('api-key');
    const queryBtn = document.getElementById('query-btn');
    const errorMessage = document.getElementById('error-message');
    const resultsSection = document.getElementById('results-section');
    const loading = document.getElementById('loading');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const apiKey = apiKeyInput.value.trim();

        if (!apiKey) {
            showError('请输入 API 密钥');
            return;
        }

        if (!apiKey.startsWith('sk-')) {
            showError('API 密钥格式不正确，应以 sk- 开头');
            return;
        }

        await queryUsage(apiKey);
    });

    async function queryUsage(apiKey) {
        showLoading(true);
        hideError();
        resultsSection.classList.remove('active');

        try {
            const response = await fetch('/api/public/usage', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ apiKey })
            });

            const result = await response.json();

            if (!result.success) {
                showError(result.error || '查询失败');
                return;
            }

            displayResults(result.data);
        } catch (err) {
            showError('查询失败: ' + err.message);
        } finally {
            showLoading(false);
        }
    }

    function displayResults(data) {
        const { keyInfo, usage, cost, limits } = data;

        // 显示密钥信息
        document.getElementById('key-prefix').textContent = keyInfo.keyPrefix;
        const statusEl = document.getElementById('key-status');
        statusEl.textContent = keyInfo.isActive ? '启用' : '禁用';
        statusEl.className = 'key-status ' + (keyInfo.isActive ? 'active' : 'inactive');

        // 显示统计数据
        document.getElementById('total-cost').textContent = '$' + cost.summary.totalCost.toFixed(4);
        document.getElementById('total-requests').textContent = formatNumber(cost.summary.totalRequests);
        document.getElementById('total-input-tokens').textContent = formatNumber(cost.summary.totalInputTokens);
        document.getElementById('total-output-tokens').textContent = formatNumber(cost.summary.totalOutputTokens);

        // 显示按模型统计
        const modelStatsBody = document.getElementById('model-stats-body');
        if (cost.models && cost.models.length > 0) {
            modelStatsBody.innerHTML = cost.models.map(m => `
                <tr>
                    <td>${m.model || 'unknown'}</td>
                    <td>${formatNumber(m.requestCount)}</td>
                    <td class="token-value">${formatNumber(m.inputTokens)}</td>
                    <td class="token-value">${formatNumber(m.outputTokens)}</td>
                    <td class="cost-value">$${m.inputCost.toFixed(4)}</td>
                    <td class="cost-value">$${m.outputCost.toFixed(4)}</td>
                    <td class="cost-value">$${m.totalCost.toFixed(4)}</td>
                </tr>
            `).join('');
        } else {
            modelStatsBody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">暂无数据</td></tr>';
        }

        // 显示今日/本月用量
        const periodStatsBody = document.getElementById('period-stats-body');
        periodStatsBody.innerHTML = `
            <tr>
                <td>今日</td>
                <td>${formatNumber(usage.daily)}</td>
                <td class="cost-value">$${usage.dailyCost.toFixed(4)}</td>
            </tr>
            <tr>
       <td>本月</td>
                <td>${formatNumber(usage.monthly)}</td>
                <td class="cost-value">$${usage.monthlyCost.toFixed(4)}</td>
            </tr>
            <tr>
                <td>总计</td>
                <td>${formatNumber(usage.total)}</td>
                <td class="cost-value">$${usage.totalCost.toFixed(4)}</td>
            </tr>
        `;

        // 显示配额限制
        const limitsInfo = document.getElementById('limits-info');
        const limitsGrid = document.getElementById('limits-grid');

        if (limits && hasAnyLimit(limits)) {
            let limitsHtml = '';

            if (limits.dailyLimit > 0) {
                const percent = (usage.daily / limits.dailyLimit) * 100;
                limitsHtml += `
                    <div class="limit-item">
                        <span class="limit-label">每日请求</span>
                        <span class="limit-value ${percent >= 90 ? 'danger' : percent >= 70 ? 'warning' : ''}">${usage.daily} / ${limits.dailyLimit}</span>
                    </div>
                `;
            }

            if (limits.monthlyLimit > 0) {
                const percent = (usage.monthly / limits.monthlyLimit) * 100;
                limitsHtml += `
                    <div class="limit-item">
                        <span class="limit-label">每月请求</span>
                        <span class="limit-value ${percent >= 90 ? 'danger' : percent >= 70 ? 'warning' : ''}">${usage.monthly} / ${limits.monthlyLimit}</span>
                    </div>
                `;
            }

            if (limits.totalLimit > 0) {
                const percent = (usage.total / limits.totalLimit) * 100;
                limitsHtml += `
                    <div class="limit-item">
                        <span class="limit-label">总请求</span>
                        <span class="limit-value ${percent >= 90 ? 'danger' : percent >= 70 ? 'warning' : ''}">${usage.total} / ${limits.totalLimit}</span>
                    </div>
                `;
            }

            if (limits.dailyCostLimit > 0) {
                const percent = (usage.dailyCost / limits.dailyCostLimit) * 100;
                limitsHtml += `
                    <div class="limit-item">
                        <span class="limit-label">每日费用</span>
                        <span class="limit-value ${percent >= 90 ? 'danger' : percent >= 70 ? 'warning' : ''}">$${usage.dailyCost.toFixed(2)} / $${limits.dailyCostLimit.toFixed(2)}</span>
                    </div>
                `;
            }

            if (limits.monthlyCostLimit > 0) {
                const percent = (usage.monthlyCost / limits.monthlyCostLimit) * 100;
                limitsHtml += `
                    <div class="limit-item">
                        <span class="limit-label">每月费用</span>
                        <span class="limit-value ${percent >= 90 ? 'danger' : percent >= 70 ? 'warning' : ''}">$${usage.monthlyCost.toFixed(2)} / $${limits.monthlyCostLimit.toFixed(2)}</span>
                    </div>
                `;
            }

            if (limits.totalCostLimit > 0) {
                const percent = (usage.totalCost / limits.totalCostLimit) * 100;
                limitsHtml += `
                    <div class="limit-item">
                        <span class="limit-label">总费用</span>
                        <span class="limit-value ${percent >= 90 ? 'danger' : percent >= 70 ? 'warning' : ''}">$${usage.totalCost.toFixed(2)} / $${limits.totalCostLimit.toFixed(2)}</span>
                    </div>
                `;
            }

            if (limits.expiresInDays > 0 && limits.expireDate) {
                const expDate = new Date(limits.expireDate);
                const now = new Date();
                const isExpired = expDate < now;
                const remainingDays = limits.remainingDays !== null ? limits.remainingDays : 0;
                // 使用 toLocaleString 确保时区正确
                const expireDateStr = expDate.toLocaleString('zh-CN', {
                    year: 'numeric',
                    month: 'numeric',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });

                limitsHtml += `
                    <div class="limit-item">
                        <span class="limit-label">过期时间</span>
                        <span class="limit-value ${isExpired ? 'danger' : remainingDays <= 7 ? 'danger' : remainingDays <= 30 ? 'warning' : ''}">${isExpired ? '已过期' : expireDateStr}</span>
                    </div>
                    <div class="limit-item">
                        <span class="limit-label">剩余天数</span>
                        <span class="limit-value ${isExpired ? 'danger' : remainingDays <= 7 ? 'danger' : remainingDays <= 30 ? 'warning' : ''}">${isExpired ? '0' : remainingDays} 天</span>
                    </div>
                `;
            }

            limitsGrid.innerHTML = limitsHtml;
            limitsInfo.style.display = 'block';
        } else {
            limitsInfo.style.display = 'none';
        }

        resultsSection.classList.add('active');
    }

    function hasAnyLimit(limits) {
        return limits.dailyLimit > 0 ||
               limits.monthlyLimit > 0 ||
               limits.totalLimit > 0 ||
               limits.dailyCostLimit > 0 ||
               limits.monthlyCostLimit > 0 ||
               limits.totalCostLimit > 0 ||
               limits.expiresInDays > 0;
    }

    function formatNumber(num) {
        if (num === null || num === undefined) return '0';
        return num.toLocaleString();
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.classList.add('active');
    }

    function hideError() {
        errorMessage.classList.remove('active');
    }

    function showLoading(show) {
        if (show) {
            loading.classList.add('active');
            queryBtn.disabled = true;
        } else {
            loading.classList.remove('active');
            queryBtn.disabled = false;
        }
    }
});
