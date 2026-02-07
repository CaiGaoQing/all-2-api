/**
 * AMI API 路由
 * 提供 AMI 凭据管理和对话 API
 */
import { AmiService, AMI_MODELS } from './ami-service.js';
import { logger } from '../logger.js';

const log = logger.server;

export function setupAmiRoutes(app, amiStore, verifyApiKey) {

    // ============ 统计 API ============

    // 获取 AMI 统计信息
    app.get('/api/ami/statistics', async (req, res) => {
        try {
            const credentials = await amiStore.getAll();
            const total = credentials.length;
            const active = credentials.filter(c => c.status === 'active' && c.isActive !== false).length;
            const error = credentials.filter(c => c.status === 'error').length;
            const totalUsage = credentials.reduce((sum, c) => sum + (c.useCount || 0), 0);

            res.json({
                success: true,
                data: { total, active, error, totalUsage }
            });
        } catch (error) {
            log.error(`[AMI] 获取统计信息失败: ${error.message}`);
            res.json({ success: true, data: { total: 0, active: 0, error: 0, totalUsage: 0 } });
        }
    });

    // ============ 凭据管理 API ============

    // 获取所有 AMI 凭据
    app.get('/api/ami/credentials', async (req, res) => {
        try {
            const credentials = await amiStore.getAll();
            // 隐藏敏感信息
            const safeCredentials = credentials.map(c => ({
                ...c,
                sessionCookie: c.sessionCookie ? '***' + c.sessionCookie.slice(-20) : null,
            }));
            res.json({ success: true, data: safeCredentials });
        } catch (error) {
            log.error(`[AMI] 获取凭据列表失败: ${error.message}`);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // 添加 AMI 凭据
    app.post('/api/ami/credentials', async (req, res) => {
        try {
            const { name, sessionCookie, projectId, chatId, note } = req.body;

            if (!sessionCookie) {
                return res.status(400).json({ success: false, error: '缺少 sessionCookie' });
            }

            const credential = await amiStore.add({
                name: name || `AMI-${Date.now()}`,
                sessionCookie,
                projectId: projectId || '',
                chatId: chatId || '',
                note: note || '',
                status: 'active',
            });

            log.info(`[AMI] 添加凭据: ${credential.name}`);
            res.json({ success: true, data: { ...credential, sessionCookie: '***' } });
        } catch (error) {
            log.error(`[AMI] 添加凭据失败: ${error.message}`);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // 更新 AMI 凭据
    app.put('/api/ami/credentials/:id', async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const { name, sessionCookie, projectId, chatId, note, status } = req.body;

            const updated = await amiStore.update(id, {
                name,
                sessionCookie,
                projectId,
                chatId,
                note,
                status,
            });

            if (!updated) {
                return res.status(404).json({ success: false, error: '凭据不存在' });
            }

            log.info(`[AMI] 更新凭据: ${id}`);
            res.json({ success: true, data: { ...updated, sessionCookie: '***' } });
        } catch (error) {
            log.error(`[AMI] 更新凭据失败: ${error.message}`);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // 删除 AMI 凭据
    app.delete('/api/ami/credentials/:id', async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const deleted = await amiStore.delete(id);

            if (!deleted) {
                return res.status(404).json({ success: false, error: '凭据不存在' });
            }

            log.info(`[AMI] 删除凭据: ${id}`);
            res.json({ success: true });
        } catch (error) {
            log.error(`[AMI] 删除凭据失败: ${error.message}`);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // 测试 AMI 凭据
    app.post('/api/ami/credentials/:id/test', async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const credential = await amiStore.getById(id);

            if (!credential) {
                return res.status(404).json({ success: false, error: '凭据不存在' });
            }

            // 检查必要字段
            if (!credential.sessionCookie) {
                return res.status(400).json({ success: false, error: '缺少 sessionCookie' });
            }
            if (!credential.projectId || !credential.chatId) {
                return res.status(400).json({
                    success: false,
                    error: '缺少 projectId 或 chatId，请先编辑凭据填写这些信息（从 AMI URL 中获取）'
                });
            }

            // 验证 sessionCookie 格式
            console.log('🔍 调试信息 - sessionCookie 验证:');
            console.log('  原始值:', JSON.stringify(credential.sessionCookie));
            console.log('  长度:', credential.sessionCookie ? credential.sessionCookie.length : 0);
            console.log('  类型:', typeof credential.sessionCookie);

            // 检查是否包含 wos-session= 前缀，如果有则自动去除
            let cleanSessionCookie = credential.sessionCookie;
            if (cleanSessionCookie.startsWith('wos-session=')) {
                cleanSessionCookie = cleanSessionCookie.substring('wos-session='.length);
                console.log('🔧 自动去除 wos-session= 前缀');
                console.log('  清理后的值:', cleanSessionCookie.substring(0, 50) + '...');
            }

            // 更新验证规则：支持 AMI 的加密 session token 格式（包含 *, -, _, ~ 等字符）
            if (!cleanSessionCookie.match(/^[a-zA-Z0-9+/=*._~-]{20,}$/)) {
                console.log('❌ sessionCookie 格式验证失败');
                console.log('  期望格式: AMI session token 字符 (a-zA-Z0-9+/=*._~-)，至少20字符');
                console.log('  实际包含的无效字符:', cleanSessionCookie.split('').filter(c => !c.match(/[a-zA-Z0-9+/=*._~-]/)).join(''));

                return res.status(400).json({
                    success: false,
                    error: 'sessionCookie 格式无效，请确保复制完整的 wos-session cookie 值',
                    debug: {
                        length: cleanSessionCookie ? cleanSessionCookie.length : 0,
                        invalidChars: cleanSessionCookie ? cleanSessionCookie.split('').filter(c => !c.match(/[a-zA-Z0-9+/=*._~-]/)) : []
                    }
                });
            }

            // 更新 credential 对象中的 sessionCookie
            credential.sessionCookie = cleanSessionCookie;

            console.log('✅ sessionCookie 格式验证通过');

            // 验证 projectId 和 chatId 格式
            if (!credential.projectId.match(/^[a-zA-Z0-9]{20,}$/)) {
                return res.status(400).json({
                    success: false,
                    error: 'projectId 格式无效，应该是20+位的字母数字组合'
                });
            }
            if (!credential.chatId.match(/^[a-zA-Z0-9]{20,}$/)) {
                return res.status(400).json({
                    success: false,
                    error: 'chatId 格式无效，应该是20+位的字母数字组合'
                });
            }

            log.info(`[AMI] 开始测试凭据: ${id} (${credential.name})`);
            const service = new AmiService(credential);

            // 发送测试消息
            const testResult = await service.generateContent('claude-opus-4.5', {
                messages: [{ role: 'user', content: 'Hi' }],
                max_tokens: 50,
            });

            // 更新状态为 active
            await amiStore.update(id, {
                status: 'active',
                lastUsed: new Date().toISOString(),
                errorCount: 0,
                lastErrorMessage: null
            });

            log.info(`[AMI] 测试凭据成功: ${id}`);
            res.json({ success: true, message: '凭据有效', response: testResult });
        } catch (error) {
            // 更新状态为 error 并记录错误信息
            await amiStore.update(parseInt(req.params.id), {
                status: 'error',
                lastErrorMessage: error.message,
                lastErrorAt: new Date().toISOString()
            });

            log.error(`[AMI] 测试凭据失败: ${error.message}`);

            // 提供更友好的错误信息
            let userFriendlyError = error.message;
            if (error.message.includes('认证失败')) {
                userFriendlyError = '认证失败：sessionCookie 可能已过期，请重新获取';
            } else if (error.message.includes('访问被拒绝')) {
                userFriendlyError = '访问被拒绝：projectId 或 chatId 可能不正确';
            } else if (error.message.includes('项目或聊天不存在')) {
                userFriendlyError = '项目不存在：请检查 projectId 和 chatId 是否来自有效的 AMI 聊天';
            } else if (error.message.includes('AMI 服务器内部错误')) {
                userFriendlyError = 'AMI 服务器错误：可能是服务暂时不可用，请稍后重试';
            }

            res.status(500).json({ success: false, error: userFriendlyError });
        }
    });

    // 验证 AMI 凭据格式（不发送实际请求）
    app.post('/api/ami/credentials/:id/validate', async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const credential = await amiStore.getById(id);

            if (!credential) {
                return res.status(404).json({ success: false, error: '凭据不存在' });
            }

            const issues = [];

            // 检查必要字段
            if (!credential.sessionCookie) {
                issues.push('缺少 sessionCookie');
            } else if (!credential.sessionCookie.match(/^[a-zA-Z0-9+/=]{20,}$/)) {
                issues.push('sessionCookie 格式无效，应该是 Base64 编码的字符串');
            }

            if (!credential.projectId) {
                issues.push('缺少 projectId');
            } else if (!credential.projectId.match(/^[a-zA-Z0-9]{20,}$/)) {
                issues.push('projectId 格式无效，应该是20+位的字母数字组合');
            }

            if (!credential.chatId) {
                issues.push('缺少 chatId');
            } else if (!credential.chatId.match(/^[a-zA-Z0-9]{20,}$/)) {
                issues.push('chatId 格式无效，应该是20+位的字母数字组合');
            }

            if (issues.length > 0) {
                return res.json({
                    success: false,
                    valid: false,
                    issues,
                    message: '凭据格式验证失败，请修正以下问题：' + issues.join('; ')
                });
            }

            res.json({
                success: true,
                valid: true,
                message: '凭据格式验证通过，可以进行测试'
            });

        } catch (error) {
            log.error(`[AMI] 验证凭据格式失败: ${error.message}`);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ============ 对话 API (Claude 格式) ============

    // AMI 对话 API - Claude 格式
    app.post('/ami/v1/messages', async (req, res) => {
        try {
            // 验证 API Key
            const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
            if (!apiKey) {
                return res.status(401).json({
                    type: 'error',
                    error: { type: 'authentication_error', message: '缺少 API Key' },
                });
            }

            const keyRecord = await verifyApiKey(apiKey);
            if (!keyRecord || !keyRecord.isActive) {
                return res.status(401).json({
                    type: 'error',
                    error: { type: 'authentication_error', message: 'API Key 无效或已禁用' },
                });
            }

            const { model, messages, stream = true, system, max_tokens, temperature, tools } = req.body;

            // 获取可用的 AMI 凭据
            const credentials = await amiStore.getAll();
            const activeCredentials = credentials.filter(c => c.status === 'active');

            if (activeCredentials.length === 0) {
                return res.status(503).json({
                    type: 'error',
                    error: { type: 'service_unavailable', message: '没有可用的 AMI 凭据' },
                });
            }

            // 选择一个凭据（可以实现负载均衡）
            const credential = activeCredentials[Math.floor(Math.random() * activeCredentials.length)];
            const service = new AmiService(credential);

            log.info(`[AMI] 对话请求: model=${model}, stream=${stream}, credential=${credential.id}`);

            if (stream) {
                // 流式响应
                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');
                res.setHeader('X-Accel-Buffering', 'no');

                try {
                    for await (const event of service.generateContentStream(model, {
                        messages,
                        system,
                        max_tokens,
                        temperature,
                        tools,
                    })) {
                        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
                    }
                } catch (streamError) {
                    log.error(`[AMI] 流式响应错误: ${streamError.message}`);
                    res.write(`event: error\ndata: ${JSON.stringify({ type: 'error', error: { message: streamError.message } })}\n\n`);
                }

                res.end();
            } else {
                // 非流式响应
                const response = await service.generateContent(model, {
                    messages,
                    system,
                    max_tokens,
                    temperature,
                    tools,
                });

                res.json(response);
            }

            // 更新最后使用时间
            await amiStore.update(credential.id, { lastUsed: new Date().toISOString() });

        } catch (error) {
            log.error(`[AMI] 对话请求失败: ${error.message}`);
            res.status(500).json({
                type: 'error',
                error: { type: 'api_error', message: error.message },
            });
        }
    });

    // ============ 模型列表 ============

    // 获取 AMI 支持的模型
    app.get('/ami/v1/models', (req, res) => {
        const models = Object.keys(AMI_MODELS).map(id => ({
            id,
            object: 'model',
            created: Date.now(),
            owned_by: 'ami',
            permission: [],
            root: id,
            parent: null,
        }));

        res.json({
            object: 'list',
            data: models,
        });
    });

    log.info('[AMI] 路由已注册');
}

export default setupAmiRoutes;
