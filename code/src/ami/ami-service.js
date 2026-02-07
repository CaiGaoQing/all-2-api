/**
 * AMI API Service - 代理 AMI 的对话功能
 *
 * AMI 使用独特的 SSE 事件格式：
 * - reasoning-delta: 推理过程（思考链）
 * - text-delta: 实际回复文本
 */
import axios from 'axios';
import * as http from 'http';
import * as https from 'https';
import { getAxiosProxyConfig } from '../proxy.js';
import { logger } from '../logger.js';

const log = logger.server;

// AMI API 配置
const AMI_CONFIG = {
    BASE_URL: 'https://app.ami.dev',
    AGENT_ENDPOINT: '/api/v1/agent/v2',
    TIMEOUT: 300000, // 5 分钟超时
};

// AMI 支持的模型
export const AMI_MODELS = {
    'claude-opus-4.5': 'anthropic/claude-opus-4.5',
    'claude-opus-4-5-20251101': 'anthropic/claude-opus-4.5',
    'ami-claude-opus-4.5': 'anthropic/claude-opus-4.5',
};

/**
 * AMI Service - 处理与 AMI API 的通信
 */
export class AmiService {
    constructor(credential) {
        this.credential = credential;
        this.sessionCookie = credential.sessionCookie; // wos-session cookie
        this.projectId = credential.projectId;
        this.chatId = credential.chatId;

        const httpAgent = new http.Agent({
            keepAlive: true,
            maxSockets: 50,
            timeout: AMI_CONFIG.TIMEOUT,
        });
        const httpsAgent = new https.Agent({
            keepAlive: true,
            maxSockets: 50,
            timeout: AMI_CONFIG.TIMEOUT,
        });

        const axiosConfig = {
            timeout: AMI_CONFIG.TIMEOUT,
            httpAgent,
            httpsAgent,
            headers: {
                'Content-Type': 'application/json',
                'Accept': '*/*',
                'Origin': AMI_CONFIG.BASE_URL,
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
            },
        };

        // 配置代理
        const proxyConfig = getAxiosProxyConfig();
        if (proxyConfig.proxy === false) {
            axiosConfig.proxy = false;
        } else if (proxyConfig.httpsAgent) {
            axiosConfig.httpsAgent = proxyConfig.httpsAgent;
        }

        this.axiosInstance = axios.create(axiosConfig);
        this.baseUrl = AMI_CONFIG.BASE_URL;
    }

    /**
     * 构建 AMI 请求体
     * AMI 使用 Vercel AI SDK useChat 格式
     */
    buildRequest(messages, model, options = {}) {
        // AMI 请求体格式 - 基于 Vercel AI SDK useChat
        const request = {
            id: this.chatId,
            messages: messages.map((msg, index) => ({
                id: msg.id || `msg_${Date.now()}_${index}`,
                role: msg.role,
                content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
            })),
            chatId: this.chatId,
            projectId: this.projectId,
            model: model || 'claude-3-5-sonnet-20241022', // 使用更常见的模型名称
            stream: true, // AMI 通常需要流式响应
            // 添加可选参数
            ...(options.max_tokens && { max_tokens: options.max_tokens }),
            ...(options.temperature && { temperature: options.temperature }),
        };

        console.log('🔍 构建的 AMI 请求体:', JSON.stringify(request, null, 2));
        return request;
    }

    /**
     * 将 AMI SSE 事件转换为 Claude 格式
     */
    convertAmiEventToClaude(amiEvent) {
        const { type, delta, id, data, messageId, messageMetadata, finishReason } = amiEvent;

        switch (type) {
            case 'start':
                return {
                    type: 'message_start',
                    message: {
                        id: messageId || `msg_${Date.now()}`,
                        type: 'message',
                        role: 'assistant',
                        content: [],
                        model: messageMetadata?.model || 'ami-claude-opus-4.5',
                        stop_reason: null,
                        stop_sequence: null,
                        usage: { input_tokens: 0, output_tokens: 0 },
                    },
                };

            case 'reasoning-start':
                // 推理开始 - 创建 thinking block
                return {
                    type: 'content_block_start',
                    index: parseInt(id) || 0,
                    content_block: {
                        type: 'thinking',
                        thinking: '',
                    },
                };

            case 'reasoning-delta':
                // 推理增量
                if (!delta) return null;
                return {
                    type: 'content_block_delta',
                    index: parseInt(id) || 0,
                    delta: {
                        type: 'thinking_delta',
                        thinking: delta,
                    },
                };

            case 'reasoning-end':
                return {
                    type: 'content_block_stop',
                    index: parseInt(id) || 0,
                };

            case 'text-start':
                // 文本开始 - 创建 text block
                return {
                    type: 'content_block_start',
                    index: parseInt(id) || 1,
                    content_block: {
                        type: 'text',
                        text: '',
                    },
                };

            case 'text-delta':
                // 文本增量
                if (!delta) return null;
                return {
                    type: 'content_block_delta',
                    index: parseInt(id) || 1,
                    delta: {
                        type: 'text_delta',
                        text: delta,
                    },
                };

            case 'text-end':
                return {
                    type: 'content_block_stop',
                    index: parseInt(id) || 1,
                };

            case 'data-context-window':
                // 上下文窗口信息 - 可以忽略或记录
                return null;

            case 'finish':
                return {
                    type: 'message_delta',
                    delta: {
                        stop_reason: finishReason === 'stop' ? 'end_turn' : finishReason,
                        stop_sequence: null,
                    },
                    usage: { output_tokens: 0 },
                };

            case 'finish-step':
            case 'start-step':
            case 'data-otel':
            case 'data-lifecycle':
                // 这些事件可以忽略
                return null;

            default:
                log.debug(`[AmiService] 未知事件类型: ${type}`);
                return null;
        }
    }

    /**
     * 流式生成内容
     * @param {string} model - 模型名称
     * @param {object} requestBody - Claude 格式的请求体
     * @yields {object} Claude 格式的 SSE 事件
     */
    async *generateContentStream(model, requestBody) {
        const { messages, system, max_tokens, temperature } = requestBody;

        // 如果有 system prompt，将其添加到消息开头
        const allMessages = system
            ? [{ role: 'system', content: system }, ...messages]
            : messages;

        const amiRequest = this.buildRequest(allMessages, model, {
            max_tokens,
            temperature,
        });

        const headers = {
            'Cookie': `wos-session=${this.sessionCookie}`,
            'Referer': `${this.baseUrl}/chat/${this.projectId}?chat=${this.chatId}`,
            'Accept': 'text/event-stream',
            'Content-Type': 'application/json',
        };

        log.info(`[AmiService] 发送请求到 AMI: model=${model}, projectId=${this.projectId}, chatId=${this.chatId}`);
        log.info(`[AmiService] 请求体: ${JSON.stringify(amiRequest)}`);
        log.debug(`[AmiService] 请求头: ${JSON.stringify(headers)}`);
        log.debug(`[AmiService] 请求URL: ${this.baseUrl}${AMI_CONFIG.AGENT_ENDPOINT}`);

        // 详细调试信息
        console.log('🔍 AMI 请求调试信息:');
        console.log('  URL:', `${this.baseUrl}${AMI_CONFIG.AGENT_ENDPOINT}`);
        console.log('  Method: POST');
        console.log('  Headers:', JSON.stringify(headers, null, 2));
        console.log('  Body:', JSON.stringify(amiRequest, null, 2));
        console.log('  SessionCookie 长度:', this.sessionCookie.length);
        console.log('  SessionCookie 前50字符:', this.sessionCookie.substring(0, 50) + '...');

        try {
            const response = await this.axiosInstance.post(
                `${this.baseUrl}${AMI_CONFIG.AGENT_ENDPOINT}`,
                amiRequest,
                {
                    headers,
                    responseType: 'stream',
                }
            );

            let buffer = '';

            for await (const chunk of response.data) {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim()) continue;

                    if (line === 'data: [DONE]') {
                        yield { type: 'message_stop' };
                        return;
                    }

                    if (line.startsWith('data: ')) {
                        try {
                            const amiEvent = JSON.parse(line.slice(6));
                            const claudeEvent = this.convertAmiEventToClaude(amiEvent);
                            if (claudeEvent) {
                                yield claudeEvent;
                            }
                        } catch (e) {
                            log.warn(`[AmiService] 解析 SSE 事件失败: ${line}`);
                        }
                    }
                }
            }

            // 处理剩余的 buffer
            if (buffer.trim()) {
                if (buffer === 'data: [DONE]') {
                    yield { type: 'message_stop' };
                } else if (buffer.startsWith('data: ')) {
                    try {
                        const amiEvent = JSON.parse(buffer.slice(6));
                        const claudeEvent = this.convertAmiEventToClaude(amiEvent);
                        if (claudeEvent) {
                            yield claudeEvent;
                        }
                    } catch (e) {
                        log.warn(`[AmiService] 解析最后的 SSE 事件失败: ${buffer}`);
                    }
                }
            }

        } catch (error) {
            const status = error.response?.status;
            const statusText = error.response?.statusText;
            let errorMsg = error.message;
            let responseBody = '';

            // 记录请求详细信息用于调试
            log.error(`[AmiService] 请求失败详情:`);
            log.error(`[AmiService]   URL: ${this.baseUrl}${AMI_CONFIG.AGENT_ENDPOINT}`);
            log.error(`[AmiService]   Status: ${status} ${statusText || ''}`);
            log.error(`[AmiService]   ProjectId: ${this.projectId}`);
            log.error(`[AmiService]   ChatId: ${this.chatId}`);
            log.error(`[AmiService]   SessionCookie: ${this.sessionCookie ? '***' + this.sessionCookie.slice(-10) : 'null'}`);

            // 尝试获取更详细的错误信息
            try {
                if (error.response?.data) {
                    // 如果是流，尝试读取
                    if (error.response.data.readable || typeof error.response.data.on === 'function') {
                        // 是流对象，尝试收集数据
                        const chunks = [];
                        for await (const chunk of error.response.data) {
                            chunks.push(chunk);
                        }
                        const body = Buffer.concat(chunks).toString('utf8');
                        responseBody = body;
                        try {
                            const parsed = JSON.parse(body);
                            errorMsg = parsed.message || parsed.error || body.substring(0, 500);
                        } catch {
                            errorMsg = body.substring(0, 500);
                        }
                    } else if (typeof error.response.data === 'string') {
                        responseBody = error.response.data;
                        errorMsg = error.response.data.substring(0, 500);
                    } else if (Buffer.isBuffer(error.response.data)) {
                        responseBody = error.response.data.toString('utf8');
                        errorMsg = responseBody.substring(0, 500);
                    } else if (error.response.data.message) {
                        errorMsg = error.response.data.message;
                        responseBody = JSON.stringify(error.response.data);
                    } else if (error.response.data.error) {
                        errorMsg = typeof error.response.data.error === 'string'
                            ? error.response.data.error
                            : 'API Error';
                        responseBody = JSON.stringify(error.response.data);
                    }
                }
            } catch (parseError) {
                // 忽略解析错误，使用原始错误消息
                log.debug(`[AmiService] 解析错误响应失败: ${parseError.message}`);
            }

            // 记录响应体用于调试
            if (responseBody) {
                log.error(`[AmiService]   响应体: ${responseBody.substring(0, 1000)}`);
            }

            // 根据状态码提供更具体的错误信息
            let specificError = errorMsg;
            if (status === 401) {
                specificError = '认证失败，请检查 sessionCookie 是否有效';
            } else if (status === 403) {
                specificError = '访问被拒绝，请检查 projectId 和 chatId 是否正确';
            } else if (status === 404) {
                specificError = '项目或聊天不存在，请检查 projectId 和 chatId';
            } else if (status === 500) {
                specificError = `AMI 服务器内部错误: ${errorMsg}`;
            }

            log.error(`[AmiService] 请求失败: ${specificError} (status: ${status})`);
            throw new Error(`AMI API 错误 (${status || 'unknown'}): ${specificError}`);
        }
    }

    /**
     * 非流式生成内容
     */
    async generateContent(model, requestBody) {
        const events = [];
        let thinkingContent = '';
        let textContent = '';

        for await (const event of this.generateContentStream(model, requestBody)) {
            events.push(event);

            if (event.type === 'content_block_delta') {
                if (event.delta?.type === 'thinking_delta') {
                    thinkingContent += event.delta.thinking || '';
                } else if (event.delta?.type === 'text_delta') {
                    textContent += event.delta.text || '';
                }
            }
        }

        // 构建 Claude 格式的响应
        const content = [];
        if (thinkingContent) {
            content.push({ type: 'thinking', thinking: thinkingContent });
        }
        if (textContent) {
            content.push({ type: 'text', text: textContent });
        }

        return {
            id: `msg_${Date.now()}`,
            type: 'message',
            role: 'assistant',
            content,
            model: AMI_MODELS[model] || model,
            stop_reason: 'end_turn',
            stop_sequence: null,
            usage: {
                input_tokens: 0,
                output_tokens: 0,
            },
        };
    }
}

export default AmiService;
