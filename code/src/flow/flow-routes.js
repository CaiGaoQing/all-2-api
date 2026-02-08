/**
 * Flow API Routes - Express 路由
 * 提供 OpenAI 兼容的 API 接口
 */

import express from 'express';
import { FlowTokenStore } from './flow-token-store.js';
import { FlowGenerationHandler, MODEL_CONFIG } from './flow-handler.js';
import { logger } from '../logger.js';

export function createFlowRoutes(pool) {
    const router = express.Router();

    // 初始化服务
    const flowTokenStore = new FlowTokenStore(pool);
    const flowHandler = new FlowGenerationHandler(flowTokenStore);

    // ========== OpenAI 兼容接口 ==========

    /**
     * GET /v1/models - 获取模型列表
     */
    router.get('/v1/models', (req, res) => {
        const models = flowHandler.getModels();
        res.json({
            object: 'list',
            data: models
        });
    });

    /**
     * POST /v1/chat/completions - 聊天补全（生成图片/视频）
     */
    router.post('/v1/chat/completions', async (req, res) => {
        try {
            const { model, messages, stream = false } = req.body;

            if (!model || !messages || !messages.length) {
                return res.status(400).json({
                    error: {
                        message: 'Missing required fields: model, messages',
                        type: 'invalid_request_error'
                    }
                });
            }

            // 提取 prompt 和图片
            const { prompt, images } = extractPromptAndImages(messages);

            if (!prompt) {
                return res.status(400).json({
                    error: {
                        message: 'No text content found in messages',
                        type: 'invalid_request_error'
                    }
                });
            }

            logger.flow?.info(`[API] Chat completion request - model: ${model}, stream: ${stream}`);

            if (stream) {
                // 流式响应
                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');

                for await (const chunk of flowHandler.handleGeneration(model, prompt, images, true)) {
                    res.write(chunk);
                }
                res.write('data: [DONE]\n\n');
                res.end();
            } else {
                // 非流式响应
                let result = null;
                for await (const chunk of flowHandler.handleGeneration(model, prompt, images, false)) {
                    result = chunk;
                }

                if (result) {
                    const parsed = JSON.parse(result);
                    if (parsed.error) {
                        return res.status(400).json(parsed);
                    }
                    res.json(parsed);
                } else {
                    res.status(500).json({
                        error: {
                            message: 'Generation failed',
                            type: 'internal_error'
                        }
                    });
                }
            }
        } catch (error) {
            logger.flow?.error(`[API] Chat completion error: ${error.message}`);
            res.status(500).json({
                error: {
                    message: error.message,
                    type: 'internal_error'
                }
            });
        }
    });

    // ========== Token 管理接口 ==========

    /**
     * GET /tokens - 获取所有 Token
     */
    router.get('/tokens', async (req, res) => {
        try {
            const tokens = await flowTokenStore.getAllTokens();
            // 隐藏敏感信息
            const safeTokens = tokens.map(t => ({
                ...t,
                st: t.st ? t.st.substring(0, 20) + '...' : null,
                at: t.at ? t.at.substring(0, 20) + '...' : null
            }));
            res.json({ success: true, data: safeTokens });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * GET /tokens/:id - 获取单个 Token
     */
    router.get('/tokens/:id', async (req, res) => {
        try {
            const token = await flowTokenStore.getToken(parseInt(req.params.id));
            if (!token) {
                return res.status(404).json({ success: false, error: 'Token not found' });
            }
            // 隐藏敏感信息
            const safeToken = {
                ...token,
                st: token.st ? token.st.substring(0, 20) + '...' : null,
                at: token.at ? token.at.substring(0, 20) + '...' : null
            };
            res.json({ success: true, data: safeToken });
        } catch (error) {
res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * POST /tokens - 添加新 Token
     */
    router.post('/tokens', async (req, res) => {
        try {
            const { st, remark, imageEnabled, videoEnabled } = req.body;

            if (!st) {
                return res.status(400).json({ success: false, error: 'ST is required' });
            }

            const results = await flowTokenStore.batchAddTokens([st], {
                remark,
                imageEnabled: imageEnabled !== false,
                videoEnabled: videoEnabled !== false
            });

            const result = results[0];
            if (result.success) {
                res.json({ success: true, data: result });
            } else {
                res.status(400).json({ success: false, error: result.error });
            }
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * POST /tokens/batch - 批量添加 Token
     */
    router.post('/tokens/batch', async (req, res) => {
        try {
            const { stList, imageEnabled, videoEnabled } = req.body;
            if (!stList || !Array.isArray(stList) || stList.length === 0) {
                return res.status(400).json({ success: false, error: 'stList is required' });
            }

            const results = await flowTokenStore.batchAddTokens(stList, {
                imageEnabled: imageEnabled !== false,
                videoEnabled: videoEnabled !== false
            });

            res.json({ success: true, data: results });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * PUT /tokens/:id - 更新 Token
     */
    router.put('/tokens/:id', async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const updates = req.body;

            await flowTokenStore.updateToken(id, updates);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * DELETE /tokens/:id - 删除 Token
     */
    router.delete('/tokens/:id', async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            await flowTokenStore.deleteToken(id);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * POST /tokens/:id/enable - 启用 Token
     */
    router.post('/tokens/:id/enable', async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            await flowTokenStore.enableToken(id);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * POST /tokens/:id/disable - 禁用 Token
     */
    router.post('/tokens/:id/disable', async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            await flowTokenStore.disableToken(id);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * POST /tokens/:id/refresh-credits - 刷新余额
     */
    router.post('/tokens/:id/refresh-credits', async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const credits = await flowTokenStore.refreshCredits(id);
            res.json({ success: true, credits });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * POST /tokens/batch-refresh-credits - 批量刷新余额
     */
    router.post('/tokens/batch-refresh-credits', async (req, res) => {
        try {
            const results = await flowTokenStore.batchRefreshCredits();
            res.json({ success: true, data: results });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ========== 辅助函数 ==========

    /**
     * 从消息中提取 prompt 和图片
     */
    function extractPromptAndImages(messages) {
        let prompt = '';
        const images = [];

        for (const msg of messages) {
            if (msg.role !== 'user') continue;

            const content = msg.content;

            // 字符串内容
            if (typeof content === 'string') {
                prompt += content + '\n';
                continue;
            }

            // 数组内容（多模态）
            if (Array.isArray(content)) {
                for (const part of content) {
                    if (part.type === 'text') {
                        prompt += part.text + '\n';
                    } else if (part.type === 'image_url') {
                        const imageUrl = part.image_url?.url || part.image_url;
                        if (imageUrl && imageUrl.startsWith('data:')) {
                            // Base64 图片
                            const base64Data = imageUrl.split(',')[1];
                            if (base64Data) {
                                images.push(base64Data);
                            }
                        }
                    }
                }
            }
        }

        return { prompt: prompt.trim(), images: images.length > 0 ? images : null };
    }

    // 初始化数据库表
    flowTokenStore.initTables().catch(err => {
        logger.flow?.error(`Failed to init flow tables: ${err.message}`);
    });

    return router;
}

export default createFlowRoutes;
