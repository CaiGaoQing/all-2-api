/**
 * Kiro WebSearch Service
 * 通过 Q Agent 对话接口实现 Web 搜索功能
 */
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import * as os from 'os';
import * as crypto from 'crypto';
import { KIRO_CONSTANTS, buildCodeWhispererUrl } from '../constants.js';
import { getAxiosProxyConfig } from '../proxy.js';
import { logger } from '../logger.js';

const log = logger.client;

/**
 * 根据凭证生成唯一的机器码
 */
function generateMachineId(credential) {
    const uniqueKey = credential.profileArn || credential.clientId || 'KIRO_DEFAULT';
    return crypto.createHash('sha256').update(uniqueKey).digest('hex');
}

/**
 * 获取系统运行时信息
 */
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

/**
 * WebSearch 工具定义
 */
const WEB_SEARCH_TOOL = {
    toolSpecification: {
        name: 'web_search',
        description: 'Search the web for information. Returns search results with titles, URLs, and snippets.',
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

/**
 * Kiro WebSearch 服务类
 */
export class WebSearchService {
    constructor(credential) {
        this.credential = credential;
        this.accessToken = credential.accessToken;
        // 去除 profileArn 中的空白字符（防止末尾有 Tab/空格导致 403 错误）
        this.profileArn = credential.profileArn ? credential.profileArn.trim() : credential.profileArn;
        this.authMethod = credential.authMethod || KIRO_CONSTANTS.AUTH_METHOD_SOCIAL;
        this.region = credential.region || KIRO_CONSTANTS.DEFAULT_REGION;

        const machineId = generateMachineId(credential);
        const { osName, nodeVersion } = getSystemInfo();
        const kiroVersion = KIRO_CONSTANTS.KIRO_VERSION;

        // Q Agent 使用 codewhispererstreaming API
        const axiosConfig = {
            timeout: KIRO_CONSTANTS.AXIOS_TIMEOUT,
            headers: {
                'Content-Type': KIRO_CONSTANTS.CONTENT_TYPE_JSON,
                'Accept': KIRO_CONSTANTS.ACCEPT_JSON,
                'amz-sdk-request': 'attempt=1; max=3',
                'x-amzn-codewhisperer-optout': 'true',
                'x-amzn-kiro-agent-mode': 'spec',
                'x-amz-user-agent': `aws-sdk-js/1.0.27 KiroIDE-${kiroVersion}-${machineId}`,
                'user-agent': `aws-sdk-js/1.0.27 ua/2.1 os/${osName} lang/js md/nodejs#${nodeVersion} api/codewhispererstreaming#1.0.27 m/E KiroIDE-${kiroVersion}-${machineId}`,
                'Connection': 'keep-alive'
            },
        };

        // 添加代理配置
        const proxyConfig = getAxiosProxyConfig();
        if (proxyConfig.proxy === false) {
            axiosConfig.proxy = false;
        }
        if (proxyConfig.httpsAgent) {
            axiosConfig.httpsAgent = proxyConfig.httpsAgent;
        }
        if (proxyConfig.httpAgent) {
            axiosConfig.httpAgent = proxyConfig.httpAgent;
        }

        this.axiosInstance = axios.create(axiosConfig);
        this.mcpUrl = buildCodeWhispererUrl(KIRO_CONSTANTS.MCP_URL, this.region);
        this.qAgentUrl = buildCodeWhispererUrl(KIRO_CONSTANTS.Q_AGENT_URL, this.region);
    }

    /**
     * 发送 MCP JSON-RPC 请求
     */
    async sendMcpRequest(method, params = {}, id = null) {
        const requestId = id || uuidv4().replace(/-/g, '_');
        
        const requestData = {
            id: requestId,
            jsonrpc: '2.0',
            method: method
        };
        
        if (Object.keys(params).length > 0) {
            requestData.params = params;
        }

        const headers = {
            'Authorization': `Bearer ${this.accessToken}`,
            'amz-sdk-invocation-id': uuidv4(),
        };

        log.curl('POST', this.mcpUrl, headers, requestData);

        const response = await this.axiosInstance.post(this.mcpUrl, requestData, { headers });
        
        return response.data;
    }

    /**
     * 获取可用的 MCP 工具列表
     */
    async listTools() {
        try {
            const response = await this.sendMcpRequest('tools/list', {}, 'tools_list');
            
            if (response.error) {
                throw new Error(response.error.message || 'MCP tools/list 失败');
            }

            return {
                success: true,
                tools: response.result?.tools || []
            };
        } catch (error) {
            const errorMsg = error.response?.data?.message || error.message;
            const status = error.response?.status;
            log.error(`[WebSearch] 获取工具列表失败: ${errorMsg} (status: ${status})`);
            
            return {
                success: false,
                error: errorMsg,
                statusCode: status
            };
        }
    }

    /**
     * 执行 Web 搜索（通过 Q Agent 对话接口）
     * @param {string} query - 搜索查询
     * @returns {Promise<object>} 搜索结果
     */
    async search(query) {
        if (!query || typeof query !== 'string') {
            return {
                success: false,
                error: '搜索查询不能为空'
            };
        }

        console.log(`[WebSearch] 开始搜索: ${query}`);
        console.log(`[WebSearch] Q Agent URL: ${this.qAgentUrl}`);
        console.log(`[WebSearch] AccessToken: ${this.accessToken ? this.accessToken.substring(0, 30) + '...' : 'NULL'}`);
        console.log(`[WebSearch] ProfileArn: ${this.profileArn || 'NULL'}`);

        try {
            const conversationId = uuidv4();
            
            // 构建请求 - 告诉模型使用 web_search 工具
            const requestData = {
                conversationState: {
                    agentTaskType: 'vibe',
                    chatTriggerType: 'MANUAL',
                    conversationId: conversationId,
                    currentMessage: {
                        userInputMessage: {
                            content: `请使用 web_search 工具搜索以下内容，并返回搜索结果:\n\n${query}`,
                            modelId: 'auto',
                            origin: 'AI_EDITOR',
                            userInputMessageContext: {
                                tools: [WEB_SEARCH_TOOL]
                            }
                        }
                    }
                }
            };

            // 如果是 social 认证，添加 profileArn
            if (this.authMethod === KIRO_CONSTANTS.AUTH_METHOD_SOCIAL && this.profileArn) {
                requestData.profileArn = this.profileArn;
            }

            const headers = {
                'Authorization': `Bearer ${this.accessToken}`,
                'amz-sdk-invocation-id': uuidv4(),
            };

            console.log(`[WebSearch] 请求数据:`, JSON.stringify(requestData, null, 2));

            const response = await this.axiosInstance.post(this.qAgentUrl, requestData, {
                headers,
                responseType: 'text'
            });

            console.log(`[WebSearch] 响应状态: ${response.status}`);
            console.log(`[WebSearch] 响应数据长度: ${response.data?.length || 0}`);
            console.log(`[WebSearch] 响应数据前 2000 字符:`, response.data?.substring(0, 2000));

            // 解析流式响应
            const results = this.parseStreamResponse(response.data);
            
            console.log(`[WebSearch] 解析结果:`, JSON.stringify(results, null, 2));

            return {
                success: true,
                query: query,
                ...results
            };
        } catch (error) {
            const errorMsg = error.response?.data?.message || error.response?.data || error.message;
            const status = error.response?.status;
            console.error(`[WebSearch] 搜索失败: ${errorMsg} (status: ${status})`);
            console.error(`[WebSearch] 完整错误:`, error.response?.data || error.message);
            
            return {
                success: false,
                error: typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg,
                statusCode: status
            };
        }
    }

    /**
     * 解析流式响应
     */
    parseStreamResponse(rawData) {
        const result = {
            content: '',
            toolUses: [],
            searchResults: []
        };

        if (!rawData) {
            return result;
        }

        const dataStr = typeof rawData === 'string' ? rawData : rawData.toString();
        
        // 解析 JSON 片段
        let searchStart = 0;
        while (true) {
            const contentStart = dataStr.indexOf('{"content":', searchStart);
            const toolStart = dataStr.indexOf('{"name":', searchStart);
            const inputStart = dataStr.indexOf('{"input":', searchStart);

            const candidates = [contentStart, toolStart, inputStart].filter(pos => pos >= 0);
            if (candidates.length === 0) break;

            const jsonStart = Math.min(...candidates);
            
            // 找到完整的 JSON 对象
            let braceCount = 0;
            let jsonEnd = -1;
            let inString = false;
            let escapeNext = false;

            for (let i = jsonStart; i < dataStr.length; i++) {
                const char = dataStr[i];
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

            if (jsonEnd < 0) break;

            const jsonStr = dataStr.substring(jsonStart, jsonEnd + 1);
            try {
                const parsed = JSON.parse(jsonStr);
                
                if (parsed.content !== undefined && !parsed.followupPrompt) {
                    result.content += parsed.content;
                } else if (parsed.name && parsed.toolUseId) {
                    // 工具调用开始
                    result.toolUses.push({
                        name: parsed.name,
                        toolUseId: parsed.toolUseId,
                        input: ''
                    });
                } else if (parsed.input !== undefined) {
                    // 工具调用输入
                    if (result.toolUses.length > 0) {
                        const lastTool = result.toolUses[result.toolUses.length - 1];
                        lastTool.input += parsed.input;
                    }
                }
            } catch (e) {
                // 解析失败，跳过
            }

            searchStart = jsonEnd + 1;
            if (searchStart >= dataStr.length) break;
        }

        // 尝试解析工具调用结果中的搜索结果
        for (const toolUse of result.toolUses) {
            if (toolUse.name === 'web_search' && toolUse.input) {
                try {
                    const input = JSON.parse(toolUse.input);
                    if (input.query) {
                        result.searchQuery = input.query;
                    }
                } catch (e) {
                    // 忽略解析错误
                }
            }
        }

        return result;
    }

    /**
     * 直接调用 MCP 工具（用于测试）
     */
    async callTool(toolName, args = {}) {
        try {
            const requestId = `tool_call_${uuidv4().replace(/-/g, '_').substring(0, 8)}`;
            
            const response = await this.sendMcpRequest('tools/call', {
                name: toolName,
                arguments: args
            }, requestId);

            if (response.error) {
                throw new Error(response.error.message || `MCP tools/call ${toolName} 失败`);
            }

            return {
                success: true,
                result: response.result
            };
        } catch (error) {
            const errorMsg = error.response?.data?.message || error.message;
            const status = error.response?.status;
            log.error(`[WebSearch] 调用工具 ${toolName} 失败: ${errorMsg} (status: ${status})`);
            
            return {
                success: false,
                error: errorMsg,
                statusCode: status
            };
        }
    }
}

/**
 * 静态工厂方法：从凭证对象创建 WebSearchService
 */
export function createWebSearchService(credential) {
    return new WebSearchService(credential);
}

export default WebSearchService;
