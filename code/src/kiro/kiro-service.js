/**
 * Kiro API Service - 参考 AIClient-2-API 的实现
 */
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import * as os from 'os';
import * as crypto from 'crypto';
import * as http from 'http';
import * as https from 'https';
import { KIRO_CONSTANTS, MODEL_MAPPING, KIRO_MODELS, buildCodeWhispererUrl } from '../constants.js';
import { getAxiosProxyConfig } from '../proxy.js';
import { logger } from '../logger.js';

const log = logger.client;

// MCP 端点 URL
const MCP_URL_TEMPLATE = 'https://q.{{region}}.amazonaws.com/mcp';

function generateMachineId(credential) {
    const uniqueKey = credential.profileArn || credential.clientId || 'KIRO_DEFAULT';
    return crypto.createHash('sha256').update(uniqueKey).digest('hex');
}

function getSystemInfo() {
    const platform = os.platform();
    const release = os.release();
    const nodeVersion = process.version.replace('v', '');
    let osName = platform;
    if (platform === 'win32') osName = `windows#${release}`;
    else if (platform === 'darwin') osName = `macos#${release}`;
    else osName = `${platform}#${release}`;
    return { osName, nodeVersion };
}

export class KiroService {
    constructor(credential) {
        this.credential = credential;
        this.accessToken = credential.accessToken;
        this.refreshToken = credential.refreshToken;
        // 去除 profileArn 中的空白字符（防止末尾有 Tab/空格导致 403 错误）
        this.profileArn = credential.profileArn ? credential.profileArn.trim() : credential.profileArn;
        this.clientId = credential.clientId;
        this.clientSecret = credential.clientSecret;
        this.authMethod = credential.authMethod || KIRO_CONSTANTS.AUTH_METHOD_SOCIAL;
        this.region = credential.region || KIRO_CONSTANTS.DEFAULT_REGION;
        this.expiresAt = credential.expiresAt;
        
        // Q Agent URL (用于 WebSearch)
        this.qAgentUrl = buildCodeWhispererUrl(KIRO_CONSTANTS.Q_AGENT_URL, this.region);

        const httpAgent = new http.Agent({
            keepAlive: true,
            maxSockets: 100,
            maxFreeSockets: 5,
            timeout: KIRO_CONSTANTS.AXIOS_TIMEOUT,
        });
        const httpsAgent = new https.Agent({
            keepAlive: true,
            maxSockets: 100,
            maxFreeSockets: 5,
            timeout: KIRO_CONSTANTS.AXIOS_TIMEOUT,
        });

        const machineId = generateMachineId(credential);
        const { osName, nodeVersion } = getSystemInfo();
        const kiroVersion = KIRO_CONSTANTS.KIRO_VERSION;

        const axiosConfig = {
            timeout: KIRO_CONSTANTS.AXIOS_TIMEOUT,
            httpAgent,
            httpsAgent,
            headers: {
                'Content-Type': KIRO_CONSTANTS.CONTENT_TYPE_JSON,
                'Accept': KIRO_CONSTANTS.ACCEPT_JSON,
                'amz-sdk-request': 'attempt=1; max=1',
                'x-amzn-kiro-agent-mode': 'spec',
                'x-amz-user-agent': `aws-sdk-js/1.0.0 KiroIDE-${kiroVersion}-${machineId}`,
                'user-agent': `aws-sdk-js/1.0.0 ua/2.1 os/${osName} lang/js md/nodejs#${nodeVersion} api/codewhispererruntime#1.0.0 m/E KiroIDE-${kiroVersion}-${machineId}`,
                'Connection': 'keep-alive'
            },
        };

        const proxyConfig = getAxiosProxyConfig();
        if (proxyConfig.proxy === false) {
            axiosConfig.proxy = false;
        } else if (proxyConfig.httpsAgent) {
            axiosConfig.httpsAgent = proxyConfig.httpsAgent;
        }

        this.axiosInstance = axios.create(axiosConfig);
        this.baseUrl = buildCodeWhispererUrl(KIRO_CONSTANTS.BASE_URL, this.region);
        // Q Agent URL (用于 WebSearch)
        this.qAgentUrl = buildCodeWhispererUrl(KIRO_CONSTANTS.Q_AGENT_URL, this.region);
        // MCP URL (用于直接调用工具)
        this.mcpUrl = buildCodeWhispererUrl(MCP_URL_TEMPLATE, this.region);
    }

    /**
     * 使用 MCP 端点直接调用 web_search 工具
     * @param {string} query - 搜索查询
     * @returns {Promise<object>} 搜索结果
     */
    async callMcpWebSearch(query) {
        const requestId = `web_search_${uuidv4().replace(/-/g, '_').substring(0, 8)}`;
        const requestData = {
            id: requestId,
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
                name: 'web_search',
                arguments: { query }
            }
        };

        const headers = {
            ...this.axiosInstance.defaults.headers.common,
            'Authorization': `Bearer ${this.accessToken}`,
            'amz-sdk-invocation-id': uuidv4(),
        };

        console.log(`[KiroService] MCP web_search 请求: ${query}`);
        
        try {
            const response = await this.axiosInstance.post(this.mcpUrl, requestData, { headers });
            
            if (response.data?.error) {
                console.error('[KiroService] MCP web_search 错误:', response.data.error);
                return { success: false, error: response.data.error.message || 'MCP 搜索失败' };
            }

            const result = response.data?.result;
            console.log('[KiroService] MCP web_search 成功，结果:', JSON.stringify(result).substring(0, 500));
            
            return { success: true, result };
        } catch (error) {
            const errorMsg = error.response?.data?.message || error.message;
            const status = error.response?.status;
            console.error(`[KiroService] MCP web_search 失败: ${errorMsg} (status: ${status})`);
            return { success: false, error: errorMsg, statusCode: status };
        }
    }

    /**
     * 格式化 MCP 搜索结果为文本
     */
    formatMcpSearchResult(result) {
        if (!result || !result.content) {
            return '搜索未返回结果。';
        }

        // MCP 结果格式: { content: [{ type: 'text', text: '...' }] }
        if (Array.isArray(result.content)) {
            return result.content
                .filter(item => item.type === 'text' && item.text)
                .map(item => item.text)
                .join('\n');
        }

        return typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
    }

    /**
     * 检查是否包含 WebSearch 工具
     */
    hasWebSearchTool(tools) {
        if (!tools || !Array.isArray(tools)) return false;
        const toolNames = tools.map(tool => tool.name || tool.toolSpecification?.name || '').filter(n => n);
        // 只检测 web_search（小写），WebSearch 是 Cursor 内置工具，每个请求都有
        // 真正执行搜索的请求会只包含 web_search 工具
        const hasWS = tools.length === 1 && tools.some(tool => {
            const name = tool.name || tool.toolSpecification?.name || '';
            return name === 'web_search';
        });
        if (hasWS) {
            console.log('[KiroService] 检测到独立的 web_search 请求');
        }
        return hasWS;
    }

    /**
     * 获取 Kiro Profile（用于获取 profileArn）
     * @returns {Promise<Object|null>} profile 信息或 null
     */
    async getProfile() {
        const baseUrl = this.qAgentUrl.replace('/generateAssistantResponse', '');
        const headers = {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
        };
        
        // 如果已有 profileArn，直接查询
        if (this.profileArn) {
            try {
                const response = await this.axiosInstance.post(`${baseUrl}/GetProfile`, 
                    { profileArn: this.profileArn }, { headers });
                if (response.data && response.data.profile) {
                    return response.data.profile;
                }
            } catch (error) {
                console.error('[KiroService] GetProfile 失败:', error.message);
            }
            return null;
        }
        
        // 没有 profileArn 时，尝试 ListProfiles 获取
        try {
            console.log('[KiroService] 尝试 ListProfiles...');
            const response = await this.axiosInstance.post(`${baseUrl}/ListProfiles`, {}, { headers });
            console.log('[KiroService] ListProfiles 响应:', JSON.stringify(response.data).substring(0, 500));
            if (response.data && response.data.profiles && response.data.profiles.length > 0) {
                const profile = response.data.profiles[0];
                console.log('[KiroService] 从 ListProfiles 获取 profileArn:', profile.arn);
                return profile;
            }
        } catch (error) {
            console.log('[KiroService] ListProfiles 失败:', error.message);
        }
        
        // 尝试 CreateProfile（自动创建）
        try {
            console.log('[KiroService] 尝试 CreateProfile...');
            const response = await this.axiosInstance.post(`${baseUrl}/CreateProfile`, {
                profileName: `KiroProfile-${this.region}`,
                profileType: 'KIRO'
            }, { headers });
            console.log('[KiroService] CreateProfile 响应:', JSON.stringify(response.data).substring(0, 500));
            if (response.data && response.data.profile) {
                return response.data.profile;
            }
        } catch (error) {
            console.log('[KiroService] CreateProfile 失败:', error.message);
        }
        
        return null;
    }

    /**
     * 自动获取并设置 profileArn（如果缺少的话）
     */
    async ensureProfileArn() {
        if (this.profileArn) {
            return this.profileArn;
        }
        
        const profile = await this.getProfile();
        if (profile && profile.arn) {
            this.profileArn = profile.arn;
            console.log('[KiroService] 自动获取 profileArn:', this.profileArn);
            return this.profileArn;
        }
        return null;
    }

    getContentText(message) {
        if (!message) return '';
        if (typeof message === 'string') return message;
        if (Array.isArray(message)) {
            return message.filter(part => part.type === 'text' && part.text).map(part => part.text).join('');
        }
        if (typeof message.content === 'string') return message.content;
        if (Array.isArray(message.content)) {
            return message.content.filter(part => part.type === 'text' && part.text).map(part => part.text).join('');
        }
        return String(message.content || message);
    }

    /**
     * 压缩消息上下文（用于 400 ValidationException 重试）
     */
    _compressMessages(messages, compressionLevel = 1) {
        if (!messages || messages.length <= 3) {
            return messages;
        }

        const keepRecent = Math.max(2, 6 - compressionLevel * 2);
        const maxContentLength = Math.max(500, 2000 - compressionLevel * 500);

        log.warn(`[上下文压缩] 级别 ${compressionLevel} | 原始消息数: ${messages.length} | 保留最近: ${keepRecent} 条`);

        const firstMessage = messages[0];
        const recentMessages = messages.slice(-keepRecent);
        
        if (messages.length <= keepRecent + 1) {
            return this._truncateMessageContent(messages, maxContentLength);
        }

        const middleMessages = messages.slice(1, -keepRecent);
        let summaryText = `[历史对话已压缩，共 ${middleMessages.length} 条消息]`;
        
        if (compressionLevel === 1 && middleMessages.length > 0) {
            const summaries = middleMessages.slice(0, 3).map(msg => {
                const content = this.getContentText(msg);
                const truncated = content.length > 100 ? content.substring(0, 100) + '...' : content;
                return `[${msg.role}]: ${truncated}`;
            });
            if (middleMessages.length > 3) {
                summaries.push(`... 省略 ${middleMessages.length - 3} 条消息 ...`);
            }
            summaryText = summaries.join('\n');
        }

        const compressed = [
            firstMessage,
            { role: 'user', content: summaryText },
            { role: 'assistant', content: '好的，我了解了之前的对话上下文。' },
            ...recentMessages
        ];

        const result = this._truncateMessageContent(compressed, maxContentLength);
        log.warn(`[上下文压缩] 压缩后消息数: ${result.length}`);
        return result;
    }

    /**
     * 截断消息内容
     */
    _truncateMessageContent(messages, maxLength) {
        return messages.map(msg => {
            const content = this.getContentText(msg);
            if (content.length > maxLength) {
                return {
                    ...msg,
                    content: content.substring(0, maxLength) + `\n[内容已截断，原长度: ${content.length}]`
                };
            }
            return msg;
        });
    }

    /**
     * 检查是否为 ValidationException
     */
    _isValidationException(error) {
        const errorType = error.response?.headers?.['x-amzn-errortype'] || '';
        return errorType.includes('ValidationException');
    }

    buildRequest(messages, model, options = {}) {
        const conversationId = uuidv4();
        const codewhispererModel = MODEL_MAPPING[model] || MODEL_MAPPING[KIRO_CONSTANTS.DEFAULT_MODEL_NAME] || model;

        let systemPrompt = '';
        if (options.system) {
            if (typeof options.system === 'string') {
                systemPrompt = options.system;
            } else if (Array.isArray(options.system)) {
                systemPrompt = options.system.map(item => typeof item === 'string' ? item : item.text).join('\n');
            }
        }

        // 自动添加工具使用规范，减少 "Error writing file" 错误
        if (KIRO_CONSTANTS.TOOL_USE_GUIDELINES) {
            systemPrompt = (systemPrompt ? systemPrompt + '\n\n' : '') + KIRO_CONSTANTS.TOOL_USE_GUIDELINES;
        }

        // 合并相邻相同 role 的消息
        const mergedMessages = [];
        for (const msg of messages) {
            if (mergedMessages.length === 0) {
                mergedMessages.push({ ...msg });
            } else {
                const lastMsg = mergedMessages[mergedMessages.length - 1];
                if (msg.role === lastMsg.role) {
                    if (Array.isArray(lastMsg.content) && Array.isArray(msg.content)) {
                        lastMsg.content.push(...msg.content);
                    } else if (typeof lastMsg.content === 'string' && typeof msg.content === 'string') {
                        lastMsg.content += '\n' + msg.content;
                    } else {
                        mergedMessages.push({ ...msg });
                    }
                } else {
                    mergedMessages.push({ ...msg });
                }
            }
        }

        let toolsContext = {};
        let hasWebSearch = false;
        if (options.tools && Array.isArray(options.tools) && options.tools.length > 0) {
            // 检查是否有 WebSearch 工具
            hasWebSearch = this.hasWebSearchTool(options.tools);
            
            // 过滤掉 Bash 工具，但保留 WebSearch
            const filteredTools = options.tools.filter(tool => tool.name !== 'Bash');
            if (filteredTools.length > 0) {
                toolsContext = {
                    tools: filteredTools.map(tool => {
                        // 如果是 web_search 工具，使用完整的定义
                        if (tool.name === 'web_search' || tool.name === 'WebSearch') {
                            return {
                                toolSpecification: {
                                    name: 'web_search',
                                    description: 'Search the web for real-time information. Returns search results with titles, URLs, snippets, and publication dates.',
                                    inputSchema: {
                                        json: {
                                            type: 'object',
                                            properties: {
                                                query: {
                                                    type: 'string',
                                                    description: 'The search query to execute'
                                                }
                                            },
                                            required: ['query'],
                                            additionalProperties: false
                                        }
                                    }
                                }
                            };
                        }
                        return {
                            toolSpecification: {
                                name: tool.name,
                                description: tool.description || "",
                                inputSchema: { json: tool.input_schema || {} }
                            }
                        };
                    })
                };
            }
        }
        
        // 标记是否使用 WebSearch
        this._useWebSearch = hasWebSearch;

        const history = [];
        let startIndex = 0;

        if (systemPrompt) {
            if (mergedMessages[0]?.role === 'user') {
                const firstUserContent = this.getContentText(mergedMessages[0]);
                history.push({
                    userInputMessage: {
                        content: `${systemPrompt}\n\n${firstUserContent}`,
                        modelId: codewhispererModel,
                        origin: KIRO_CONSTANTS.ORIGIN_AI_EDITOR,
                    }
                });
                startIndex = 1;
            } else {
                history.push({
                    userInputMessage: {
                        content: systemPrompt,
                        modelId: codewhispererModel,
                        origin: KIRO_CONSTANTS.ORIGIN_AI_EDITOR,
                    }
                });
            }
        }

        for (let i = startIndex; i < mergedMessages.length - 1; i++) {
            const message = mergedMessages[i];
            if (message.role === 'user') {
                history.push({ userInputMessage: this._buildUserInputMessage(message, codewhispererModel) });
            } else if (message.role === 'assistant') {
                history.push({ assistantResponseMessage: this._buildAssistantResponseMessage(message) });
            }
        }

        let currentMessage = mergedMessages[mergedMessages.length - 1];
        let currentContent = '';
        let currentToolResults = [];
        let currentImages = [];

        if (currentMessage?.role === 'assistant') {
            history.push({ assistantResponseMessage: this._buildAssistantResponseMessage(currentMessage) });
            currentContent = 'Continue';
        } else if (currentMessage) {
            if (history.length > 0 && !history[history.length - 1].assistantResponseMessage) {
                history.push({ assistantResponseMessage: { content: 'Continue' } });
            }

            if (Array.isArray(currentMessage.content)) {
                for (const part of currentMessage.content) {
                    if (part.type === 'text') {
                        currentContent += part.text;
                    } else if (part.type === 'tool_result') {
                        currentToolResults.push({
                            content: [{ text: this.getContentText(part.content) }],
                            status: part.is_error ? 'error' : 'success',
                            toolUseId: part.tool_use_id
                        });
                    } else if (part.type === 'image') {
                        currentImages.push({
                            format: part.source.media_type.split('/')[1],
                            source: { bytes: part.source.data }
                        });
                    }
                }
            } else {
                currentContent = this.getContentText(currentMessage);
            }

            if (!currentContent) {
                currentContent = currentToolResults.length > 0 ? 'Tool results provided.' : 'Continue';
            }
        } else {
            currentContent = 'Continue';
        }

        const userInputMessage = {
            content: currentContent,
            modelId: codewhispererModel,
            origin: KIRO_CONSTANTS.ORIGIN_AI_EDITOR
        };

        if (currentImages.length > 0) {
            userInputMessage.images = currentImages;
        }

        const userInputMessageContext = {};
        if (currentToolResults.length > 0) {
            const uniqueToolResults = [];
            const seenIds = new Set();
            for (const tr of currentToolResults) {
                if (!seenIds.has(tr.toolUseId)) {
                    seenIds.add(tr.toolUseId);
                    uniqueToolResults.push(tr);
                }
            }
            userInputMessageContext.toolResults = uniqueToolResults;
        }
        if (toolsContext.tools) {
            userInputMessageContext.tools = toolsContext.tools;
        }

        if (Object.keys(userInputMessageContext).length > 0) {
            userInputMessage.userInputMessageContext = userInputMessageContext;
        }

        const request = {
            conversationState: {
                chatTriggerType: KIRO_CONSTANTS.CHAT_TRIGGER_TYPE_MANUAL,
                conversationId,
                currentMessage: { userInputMessage }
            }
        };

        if (history.length > 0) {
            request.conversationState.history = history;
        }

        if (this.authMethod === KIRO_CONSTANTS.AUTH_METHOD_SOCIAL && this.profileArn) {
            request.profileArn = this.profileArn;
        }

        return request;
    }

    _buildUserInputMessage(msg, codewhispererModel) {
        const userInputMessage = {
            content: '',
            modelId: codewhispererModel,
            origin: KIRO_CONSTANTS.ORIGIN_AI_EDITOR
        };

        let images = [];
        let toolResults = [];

        if (Array.isArray(msg.content)) {
            for (const part of msg.content) {
                if (part.type === 'text') {
                    userInputMessage.content += part.text;
                } else if (part.type === 'tool_result') {
                    toolResults.push({
                        content: [{ text: this.getContentText(part.content) }],
                        status: part.is_error ? 'error' : 'success',
                        toolUseId: part.tool_use_id
                    });
                } else if (part.type === 'image') {
                    images.push({
                        format: part.source.media_type.split('/')[1],
                        source: { bytes: part.source.data }
                    });
                }
            }
        } else {
            userInputMessage.content = this.getContentText(msg);
        }

        if (!userInputMessage.content) {
            userInputMessage.content = toolResults.length > 0 ? 'Tool results provided.' : 'Continue';
        }

        if (images.length > 0) {
            userInputMessage.images = images;
        }
        if (toolResults.length > 0) {
            const uniqueToolResults = [];
            const seenIds = new Set();
            for (const tr of toolResults) {
                if (!seenIds.has(tr.toolUseId)) {
                    seenIds.add(tr.toolUseId);
                    uniqueToolResults.push(tr);
                }
            }
            userInputMessage.userInputMessageContext = { toolResults: uniqueToolResults };
        }

        return userInputMessage;
    }

    _buildAssistantResponseMessage(msg) {
        const assistantResponseMessage = { content: '' };
        let toolUses = [];

        if (Array.isArray(msg.content)) {
            for (const part of msg.content) {
                if (part.type === 'text') {
                    assistantResponseMessage.content += part.text;
                } else if (part.type === 'tool_use') {
                    toolUses.push({
                        input: part.input,
                        name: part.name,
                        toolUseId: part.id
                    });
                }
            }
        } else {
            assistantResponseMessage.content = this.getContentText(msg);
        }

        if (toolUses.length > 0) {
            assistantResponseMessage.toolUses = toolUses;
        }

        return assistantResponseMessage;
    }

    parseEventStreamBuffer(buffer) {
        const events = [];
        let remaining = buffer;
        let searchStart = 0;

        while (true) {
            const contentStart = remaining.indexOf('{"content":', searchStart);
            const nameStart = remaining.indexOf('{"name":', searchStart);
            const followupStart = remaining.indexOf('{"followupPrompt":', searchStart);
            const inputStart = remaining.indexOf('{"input":', searchStart);
            const stopStart = remaining.indexOf('{"stop":', searchStart);

            const candidates = [contentStart, nameStart, followupStart, inputStart, stopStart].filter(pos => pos >= 0);
            if (candidates.length === 0) break;

            const jsonStart = Math.min(...candidates);
            if (jsonStart < 0) break;

            let braceCount = 0;
            let jsonEnd = -1;
            let inString = false;
            let escapeNext = false;

            for (let i = jsonStart; i < remaining.length; i++) {
                const char = remaining[i];
                if (escapeNext) { escapeNext = false; continue; }
                if (char === '\\') { escapeNext = true; continue; }
                if (char === '"') { inString = !inString; continue; }
                if (!inString) {
                    if (char === '{') braceCount++;
                    else if (char === '}') {
                        braceCount--;
                        if (braceCount === 0) { jsonEnd = i; break; }
                    }
                }
            }

            if (jsonEnd < 0) {
                remaining = remaining.substring(jsonStart);
                break;
            }

            const jsonStr = remaining.substring(jsonStart, jsonEnd + 1);
            try {
                const parsed = JSON.parse(jsonStr);
                if (parsed.content !== undefined && !parsed.followupPrompt) {
                    events.push({ type: 'content', data: parsed.content });
                } else if (parsed.name && parsed.toolUseId) {
                    events.push({
                        type: 'toolUse',
                        data: { name: parsed.name, toolUseId: parsed.toolUseId, input: parsed.input || '', stop: parsed.stop || false }
                    });
                } else if (parsed.input !== undefined && !parsed.name) {
                    events.push({ type: 'toolUseInput', data: { input: parsed.input } });
                } else if (parsed.stop !== undefined) {
                    events.push({ type: 'toolUseStop', data: { stop: parsed.stop } });
                }
            } catch (e) { }

            searchStart = jsonEnd + 1;
            if (searchStart >= remaining.length) { remaining = ''; break; }
        }

        if (searchStart > 0 && remaining.length > 0) {
            remaining = remaining.substring(searchStart);
        }

        return { events, remaining };
    }

    async *generateContentStream(model, requestBody, compressionLevel = 0) {
        // 如果需要压缩，先压缩消息
        let messages = requestBody.messages;
        if (compressionLevel > 0) {
            messages = this._compressMessages(requestBody.messages, compressionLevel);
        }

        const requestData = this.buildRequest(messages, model, {
            system: requestBody.system,
            tools: requestBody.tools
        });

        // 检查是否是 WebSearch 请求，如果是则使用 MCP 端点直接执行搜索
        const useWebSearch = this._useWebSearch;
        
        if (useWebSearch) {
            // 从消息中提取搜索查询
            const lastMessage = messages[messages.length - 1];
            let searchQuery = '';
            
            if (lastMessage) {
                const content = this.getContentText(lastMessage);
                // 尝试从 "Perform a web search for the query: XXX" 格式提取
                const match = content.match(/(?:web search for the query:|搜索|search for)[:\s]*(.+)/i);
                if (match) {
                    searchQuery = match[1].trim();
                } else {
                    searchQuery = content.trim();
                }
            }

            if (searchQuery) {
                console.log('[KiroService] 使用 MCP 执行 web_search，查询:', searchQuery);
                
                // 使用 MCP 端点执行搜索
                const searchResult = await this.callMcpWebSearch(searchQuery);
                
                if (searchResult.success) {
                    // 格式化搜索结果
                    const formattedResult = this.formatMcpSearchResult(searchResult.result);
                    console.log('[KiroService] MCP 搜索成功，返回结果');
                    
                    // 返回搜索结果作为文本
                    yield { type: 'content_block_delta', delta: { type: 'text_delta', text: formattedResult } };
                    return;
                } else {
                    // 搜索失败，返回错误信息
                    console.error('[KiroService] MCP 搜索失败:', searchResult.error);
                    yield { type: 'content_block_delta', delta: { type: 'text_delta', text: `搜索失败: ${searchResult.error}` } };
                    return;
                }
            } else {
                console.log('[KiroService] 无法提取搜索查询，回退到普通请求');
            }
        }
        
        // 普通请求，使用 CodeWhisperer 端点
        const targetUrl = this.baseUrl;

        const headers = {
            ...this.axiosInstance.defaults.headers.common,
            'Authorization': `Bearer ${this.accessToken}`,
            'amz-sdk-invocation-id': uuidv4(),
        };
        
        log.curl('POST', targetUrl, headers, requestData);

        let stream = null;
        let retryCount = 0;
        const maxRetries = 3;
        const baseDelay = 1000;

        while (retryCount <= maxRetries) {
            try {
                const response = await this.axiosInstance.post(targetUrl, requestData, {
                    headers,
                    responseType: 'stream'
                });

                stream = response.data;
                let buffer = '';
                let lastContentEvent = null;
                let currentToolCall = null;

                for await (const chunk of stream) {
                    buffer += chunk.toString();
                    const { events, remaining } = this.parseEventStreamBuffer(buffer);
                    buffer = remaining;

                    for (const event of events) {
                        if (event.type === 'content' && event.data) {
                            if (lastContentEvent === event.data) continue;
                            lastContentEvent = event.data;
                            yield { type: 'content_block_delta', delta: { type: 'text_delta', text: event.data } };
                        } else if (event.type === 'toolUse') {
                            const tc = event.data;
                            if (tc.name && tc.toolUseId) {
                                if (currentToolCall && currentToolCall.toolUseId === tc.toolUseId) {
                                    currentToolCall.input += tc.input || '';
                                } else {
                                    if (currentToolCall) {
                                        yield { type: 'tool_use', toolUse: this._finalizeToolCall(currentToolCall) };
                                    }
                                    currentToolCall = { toolUseId: tc.toolUseId, name: tc.name, input: tc.input || '' };
                                }
                                if (tc.stop) {
                                    yield { type: 'tool_use', toolUse: this._finalizeToolCall(currentToolCall) };
                                    currentToolCall = null;
                                }
                            }
                        } else if (event.type === 'toolUseInput') {
                            if (currentToolCall) currentToolCall.input += event.data.input || '';
                        } else if (event.type === 'toolUseStop') {
                            if (currentToolCall && event.data.stop) {
                                yield { type: 'tool_use', toolUse: this._finalizeToolCall(currentToolCall) };
                                currentToolCall = null;
                            }
                        }
                    }
                }

                if (currentToolCall) {
                    yield { type: 'tool_use', toolUse: this._finalizeToolCall(currentToolCall) };
                }
                return;

            } catch (error) {
                if (stream && typeof stream.destroy === 'function') stream.destroy();

                const status = error.response?.status;

                // 400 ValidationException 处理
                if (status === 400 && this._isValidationException(error)) {
                    // 打印详细错误信息用于调试
                    const errorBody = error.response?.data;
                    const errorHeaders = error.response?.headers;
                    console.error('[KiroService] 400 ValidationException 详情:');
                    console.error('  URL:', targetUrl);
                    console.error('  Headers:', JSON.stringify(errorHeaders, null, 2));
                    if (typeof errorBody === 'string') {
                        console.error('  Body:', errorBody.substring(0, 1000));
                    } else {
                        console.error('  Body:', JSON.stringify(errorBody, null, 2));
                    }
                    
                    if (KIRO_CONSTANTS.ENABLE_CONTEXT_COMPRESSION && compressionLevel < 3) {
                        // 开启压缩重试
                        const newLevel = compressionLevel + 1;
                        log.warn(`[KiroService] 流式请求收到 400 ValidationException，压缩上下文 (级别 ${newLevel}) 后重试...`);
                        yield* this.generateContentStream(model, requestBody, newLevel);
                        return;
                    } else {
                        // 直接返回错误，提示用户重新打开对话
                        const contextError = new Error('上下文超出限制，请重新打开对话');
                        contextError.status = 400;
                        contextError.isContextLimit = true;
                        throw contextError;
                    }
                }

                if ((status === 429 || (status >= 500 && status < 600)) && retryCount < maxRetries) {
                    const delay = baseDelay * Math.pow(2, retryCount);
                    console.log(`[KiroService] 收到 ${status}，${delay}ms 后重试... (${retryCount + 1}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    retryCount++;
                    continue;
                }

                let errorMessage = error.message;
                if (error.response) {
                    errorMessage = `Request failed with status code ${status}`;
                    const errorType = error.response.headers?.['x-amzn-errortype'];
                    const requestId = error.response.headers?.['x-amzn-requestid'];
                    if (errorType) errorMessage += ` | ErrorType: ${errorType}`;
                    if (requestId) errorMessage += ` | RequestId: ${requestId}`;
                }

                const enhancedError = new Error(errorMessage);
                enhancedError.status = status;
                throw enhancedError;
            } finally {
                if (stream && typeof stream.destroy === 'function') stream.destroy();
            }
        }
    }

    async generateContent(model, requestBody, compressionLevel = 0) {
        // 如果需要压缩，先压缩消息
        let messages = requestBody.messages;
        if (compressionLevel > 0) {
            messages = this._compressMessages(requestBody.messages, compressionLevel);
        }

        const requestData = this.buildRequest(messages, model, {
            system: requestBody.system,
            tools: requestBody.tools
        });

        // 检查是否是 WebSearch 请求，如果是则使用 MCP 端点直接执行搜索
        const useWebSearch = this._useWebSearch;
        
        if (useWebSearch) {
            // 从消息中提取搜索查询
            const lastMessage = messages[messages.length - 1];
            let searchQuery = '';
            
            if (lastMessage) {
                const content = this.getContentText(lastMessage);
                const match = content.match(/(?:web search for the query:|搜索|search for)[:\s]*(.+)/i);
                if (match) {
                    searchQuery = match[1].trim();
                } else {
                    searchQuery = content.trim();
                }
            }

            if (searchQuery) {
                console.log('[KiroService] 使用 MCP 执行 web_search (非流式)，查询:', searchQuery);
                
                const searchResult = await this.callMcpWebSearch(searchQuery);
                
                if (searchResult.success) {
                    const formattedResult = this.formatMcpSearchResult(searchResult.result);
                    console.log('[KiroService] MCP 搜索成功 (非流式)');
                    return { content: formattedResult, toolCalls: [] };
                } else {
                    console.error('[KiroService] MCP 搜索失败 (非流式):', searchResult.error);
                    return { content: `搜索失败: ${searchResult.error}`, toolCalls: [] };
                }
            }
        }
        
        // 普通请求，使用 CodeWhisperer 端点
        const targetUrl = this.baseUrl;

        const headers = {
            'Authorization': `Bearer ${this.accessToken}`,
            'amz-sdk-invocation-id': uuidv4(),
        };

        let retryCount = 0;
        const maxRetries = 3;
        const baseDelay = 1000;

        while (retryCount <= maxRetries) {
            try {
                const response = await this.axiosInstance.post(targetUrl, requestData, { headers });
                const rawStr = Buffer.isBuffer(response.data) ? response.data.toString('utf8') : String(response.data);

                let fullContent = '';
                const toolCalls = [];
                let currentToolCall = null;

                const { events } = this.parseEventStreamBuffer(rawStr);
                for (const event of events) {
                    if (event.type === 'content') {
                        fullContent += event.data;
                    } else if (event.type === 'toolUse') {
                        const tc = event.data;
                        if (tc.name && tc.toolUseId) {
                            if (currentToolCall && currentToolCall.toolUseId === tc.toolUseId) {
                                currentToolCall.input += tc.input || '';
                            } else {
                                if (currentToolCall) toolCalls.push(this._finalizeToolCall(currentToolCall));
                                currentToolCall = { toolUseId: tc.toolUseId, name: tc.name, input: tc.input || '' };
                            }
                            if (tc.stop) {
                                toolCalls.push(this._finalizeToolCall(currentToolCall));
                                currentToolCall = null;
                            }
                        }
                    } else if (event.type === 'toolUseInput') {
                        if (currentToolCall) currentToolCall.input += event.data.input || '';
                    } else if (event.type === 'toolUseStop') {
                        if (currentToolCall && event.data.stop) {
                            toolCalls.push(this._finalizeToolCall(currentToolCall));
                            currentToolCall = null;
                        }
                    }
                }

                if (currentToolCall) toolCalls.push(this._finalizeToolCall(currentToolCall));
                return { content: fullContent, toolCalls };

            } catch (error) {
                const status = error.response?.status;

                // 400 ValidationException 处理
                if (status === 400 && this._isValidationException(error)) {
                    // 打印详细错误信息用于调试
                    const errorBody = error.response?.data;
                    const errorHeaders = error.response?.headers;
                    console.error('[KiroService] 400 ValidationException 详情 (非流式):');
                    console.error('  URL:', targetUrl);
                    console.error('  Headers:', JSON.stringify(errorHeaders, null, 2));
                    if (typeof errorBody === 'string') {
                        console.error('  Body:', errorBody.substring(0, 1000));
                    } else {
                        console.error('  Body:', JSON.stringify(errorBody, null, 2));
                    }
                    
                    if (KIRO_CONSTANTS.ENABLE_CONTEXT_COMPRESSION && compressionLevel < 3) {
                        // 开启压缩重试
                        const newLevel = compressionLevel + 1;
                        log.warn(`[KiroService] 非流式请求收到 400 ValidationException，压缩上下文 (级别 ${newLevel}) 后重试...`);
                        return this.generateContent(model, requestBody, newLevel);
                    } else {
                        // 直接返回错误，提示用户重新打开对话
                        const contextError = new Error('上下文超出限制，请重新打开对话');
                        contextError.status = 400;
                        contextError.isContextLimit = true;
                        throw contextError;
                    }
                }

                if ((status === 429 || (status >= 500 && status < 600)) && retryCount < maxRetries) {
                    const delay = baseDelay * Math.pow(2, retryCount);
                    console.log(`[KiroService] 收到 ${status}，${delay}ms 后重试... (${retryCount + 1}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    retryCount++;
                    continue;
                }

                let errorMessage = error.message;
                if (error.response) {
                    errorMessage = `Request failed with status code ${status}`;
                    const errorType = error.response.headers?.['x-amzn-errortype'];
                    const requestId = error.response.headers?.['x-amzn-requestid'];
                    if (errorType) errorMessage += ` | ErrorType: ${errorType}`;
                    if (requestId) errorMessage += ` | RequestId: ${requestId}`;
                }

                const enhancedError = new Error(errorMessage);
                enhancedError.status = status;
                throw enhancedError;
            }
        }
    }

    _finalizeToolCall(toolCall) {
        let input = toolCall.input;
        try { input = JSON.parse(toolCall.input); } catch (e) { }
        return { toolUseId: toolCall.toolUseId, name: toolCall.name, input };
    }

    listModels() {
        return { models: KIRO_MODELS.map(id => ({ name: id })) };
    }
}

export default KiroService;
