/**
 * Warp API 服务
 * 提供 Token 刷新和 AI 对话功能
 */

import https from 'https';
import { execSync } from 'child_process';
import { loadProtos, decodeResponseEvent, preloadProtos } from './warp-proto.js';
import { parseWarpResponseEvent } from './warp-message-converter.js';

// 预加载 Proto（模块导入时立即开始）
preloadProtos();

// Firebase API Key
const FIREBASE_API_KEY = 'AIzaSyBdy3O3S9hrdayLJxJ7mriBR4qgUaUygAs';

// Warp API 配置
const WARP_CONFIG = {
    host: 'app.warp.dev',
    path: '/ai/multi-agent',
    headers: {
        'x-warp-client-id': 'warp-app',
        'x-warp-client-version': 'v0.2026.01.14.08.15.stable_02',
        'x-warp-os-category': 'macOS',
        'x-warp-os-name': 'macOS',
        'x-warp-os-version': '15.7.2',
        'content-type': 'application/x-protobuf',
        'accept': 'text/event-stream',
        'accept-encoding': 'identity',
    }
};

// Warp 原生支持的模型
export const WARP_MODELS = [
    { id: 'claude-4.1-opus', name: 'Claude 4.1 Opus', provider: 'warp' },
    { id: 'claude-4-opus', name: 'Claude 4 Opus', provider: 'warp' },
    { id: 'claude-4-5-opus', name: 'Claude 4.5 Opus', provider: 'warp' },
    { id: 'claude-4-sonnet', name: 'Claude 4 Sonnet', provider: 'warp' },
    { id: 'claude-4-5-sonnet', name: 'Claude 4.5 Sonnet', provider: 'warp' },
    { id: 'gpt-5', name: 'GPT-5', provider: 'warp' },
    { id: 'gpt-4.1', name: 'GPT-4.1', provider: 'warp' },
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'warp' },
    { id: 'o3', name: 'O3', provider: 'warp' },
    { id: 'o4-mini', name: 'O4 Mini', provider: 'warp' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'warp' },
];

// 模型名称映射：外部模型名 -> Warp 模型名
const MODEL_MAPPING = {
    // Anthropic 模型映射
    'claude-opus-4-5-20251101': 'claude-4-5-opus',
    'claude-haiku-4-5-20251001': 'claude-4-5-sonnet',  // haiku 映射到 sonnet
    'claude-sonnet-4-20250514': 'claude-4-sonnet',
    'claude-3-5-sonnet-20241022': 'claude-4-sonnet',
    'claude-3-opus-20240229': 'claude-4-opus',
    'claude-3-sonnet-20240229': 'claude-4-sonnet',
    'claude-3-haiku-20240307': 'claude-4-sonnet',
    
    // Gemini 模型映射
    'gemini-2.5-flash': 'gemini-2.5-pro',
    'gemini-2.5-flash-lite': 'gemini-2.5-pro',
    'gemini-2.5-flash-thinking': 'gemini-2.5-pro',
    'gemini-2.5-pro': 'gemini-2.5-pro',
    'gemini-3-flash': 'gemini-2.5-pro',
    'gemini-3-pro': 'gemini-3-pro',
    'gemini-3-pro-high': 'gemini-3-pro',
    'gemini-3-pro-low': 'gemini-2.5-pro',
    
    // OpenAI 模型映射
    'gpt-4-turbo': 'gpt-4.1',
    'gpt-4-turbo-preview': 'gpt-4.1',
    'gpt-4': 'gpt-4.1',
    'gpt-4o': 'gpt-4o',
    'gpt-4o-mini': 'gpt-4.1',
    'o1': 'o3',
    'o1-mini': 'o4-mini',
    'o1-preview': 'o3',
};

/**
 * 将外部模型名转换为 Warp 支持的模型名
 */
export function mapModelToWarp(modelName) {
    if (!modelName) return 'claude-4.1-opus';
    
    const lowerModel = modelName.toLowerCase().trim();
    
    // 直接匹配映射表
    if (MODEL_MAPPING[lowerModel]) {
        return MODEL_MAPPING[lowerModel];
    }
    
    // 检查是否是 Warp 原生支持的模型
    const warpModel = WARP_MODELS.find(m => m.id.toLowerCase() === lowerModel);
    if (warpModel) {
        return warpModel.id;
    }
    
    // 模糊匹配
    if (lowerModel.includes('opus')) {
        if (lowerModel.includes('4.5') || lowerModel.includes('4-5')) return 'claude-4-5-opus';
        if (lowerModel.includes('4.1')) return 'claude-4.1-opus';
        return 'claude-4-opus';
    }
    if (lowerModel.includes('sonnet')) {
        if (lowerModel.includes('4.5') || lowerModel.includes('4-5')) return 'claude-4-5-sonnet';
        return 'claude-4-sonnet';
    }
    if (lowerModel.includes('haiku')) return 'claude-4-sonnet';
    if (lowerModel.includes('claude')) return 'claude-4.1-opus';
    if (lowerModel.includes('gemini')) return 'gemini-2.5-pro';
    if (lowerModel.includes('gpt')) return 'gpt-4.1';
    
    // 默认返回 claude-4.1-opus
    return 'claude-4.1-opus';
}

// ==================== Token 工具 ====================

/**
 * 解析 JWT Token
 */
export function parseJwtToken(token) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;

        let payload = parts[1];
        payload += '='.repeat((4 - payload.length % 4) % 4);

        const decoded = Buffer.from(payload, 'base64').toString('utf8');
        return JSON.parse(decoded);
    } catch (e) {
        return null;
    }
}

/**
 * 检查 Token 是否过期
 */
export function isTokenExpired(token, bufferMinutes = 5) {
    const payload = parseJwtToken(token);
    if (!payload || !payload.exp) return true;

    const now = Math.floor(Date.now() / 1000);
    const bufferSeconds = bufferMinutes * 60;

    return (payload.exp - now) <= bufferSeconds;
}

/**
 * 获取 Token 过期时间
 */
export function getTokenExpiresAt(token) {
    const payload = parseJwtToken(token);
    if (!payload || !payload.exp) return null;
    return new Date(payload.exp * 1000);
}

/**
 * 从 Token 中提取邮箱
 */
export function getEmailFromToken(token) {
    const payload = parseJwtToken(token);
    return payload?.email || null;
}

// ==================== Token 刷新 ====================

/**
 * 使用 refresh token 刷新 access token
 * 使用 curl 命令通过代理发送请求（如果需要）
 */
export function refreshAccessToken(refreshToken) {
    return new Promise((resolve, reject) => {

        const payload = JSON.stringify({
            grant_type: 'refresh_token',
            refresh_token: refreshToken
        });

        const url = `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`;
        const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
        const isWindows = process.platform === 'win32';

        // Windows 使用双引号并转义内部双引号，Unix 使用单引号
        const escapedPayload = isWindows
            ? `"${payload.replace(/"/g, '\\"')}"`
            : `'${payload}'`;

        try {
            let result;

            // 如果设置了代理，先尝试代理
            if (proxyUrl) {
                try {
                    const proxyCmd = `curl -s --connect-timeout 10 --max-time 30 -x "${proxyUrl}" -X POST "${url}" -H "Content-Type: application/json" -d ${escapedPayload}`;
                    result = execSync(proxyCmd, {
                        encoding: 'utf8',
                        timeout: 35000,
                        windowsHide: true
                    });
                } catch (proxyError) {
                    console.log('[Warp] 代理请求失败，尝试直连...');
                    // 代理失败，尝试直连
                    const directCmd = `curl -s --connect-timeout 10 --max-time 30 -X POST "${url}" -H "Content-Type: application/json" -d ${escapedPayload}`;
                    result = execSync(directCmd, {
                        encoding: 'utf8',
                        timeout: 35000,
                        windowsHide: true
                    });
                }
            } else {
                // 没有代理，直接请求
                const directCmd = `curl -s --connect-timeout 10 --max-time 30 -X POST "${url}" -H "Content-Type: application/json" -d ${escapedPayload}`;
                result = execSync(directCmd, {
                    encoding: 'utf8',
                    timeout: 35000,
                    windowsHide: true
                });
            }

            if (!result || result.trim() === '') {
                reject(new Error('刷新失败: 服务器无响应'));
                return;
            }

            const json = JSON.parse(result);

            if (json.error) {
                reject(new Error(`刷新失败: ${json.error.message}`));
            } else {
                resolve({
                    accessToken: json.id_token,
                    refreshToken: json.refresh_token,
                    expiresIn: parseInt(json.expires_in)
                });
            }
        } catch (e) {
            if (e.message && e.message.includes('ETIMEDOUT')) {
                reject(new Error('刷新失败: 连接超时，请检查网络或代理设置'));
            } else {
                reject(e);
            }
        }
    });
}

/**
 * 高性能 SSE 行解析器
 * 使用 Buffer 数组避免频繁字符串拼接
 */
class SSELineParser {
    constructor() {
        this.chunks = [];
        this.totalLength = 0;
    }

    /**
     * 添加数据块并返回完整的行
     * @param {Buffer} chunk - 数据块
     * @returns {string[]} 完整的行数组
     */
    addChunk(chunk) {
        this.chunks.push(chunk);
        this.totalLength += chunk.length;

        // 合并所有 chunks
        const combined = Buffer.concat(this.chunks, this.totalLength);
        const str = combined.toString();

        // 查找最后一个换行符
        const lastNewline = str.lastIndexOf('\n');
        if (lastNewline === -1) {
            return [];
        }

        // 分割完整的行
        const completeStr = str.substring(0, lastNewline);
        const remaining = str.substring(lastNewline + 1);

        // 保留剩余部分
        if (remaining) {
            this.chunks = [Buffer.from(remaining)];
            this.totalLength = this.chunks[0].length;
        } else {
            this.chunks = [];
            this.totalLength = 0;
        }

        return completeStr.split('\n');
    }

    /**
     * 获取剩余数据
     * @returns {string}
     */
    flush() {
        if (this.totalLength === 0) return '';
        const result = Buffer.concat(this.chunks, this.totalLength).toString();
        this.chunks = [];
        this.totalLength = 0;
        return result;
    }
}

// ==================== Protobuf 编码 ====================

function encodeVarint(value) {
    const bytes = [];
    let v = value;
    while (v > 127) {
        bytes.push((v & 0x7f) | 0x80);
        v >>>= 7;
    }
    bytes.push(v);
    return Buffer.from(bytes);
}

function encodeField(fieldNum, wireType, data) {
    const tag = (fieldNum << 3) | wireType;
    return Buffer.concat([encodeVarint(tag), data]);
}

function encodeString(fieldNum, str) {
    const strBytes = Buffer.from(str, 'utf8');
    return encodeField(fieldNum, 2, Buffer.concat([encodeVarint(strBytes.length), strBytes]));
}

function encodeBytes(fieldNum, buf) {
    return encodeField(fieldNum, 2, Buffer.concat([encodeVarint(buf.length), buf]));
}

function encodeMessage(fieldNum, msgBytes) {
    return encodeField(fieldNum, 2, Buffer.concat([encodeVarint(msgBytes.length), msgBytes]));
}

function encodeVarintField(fieldNum, value) {
    return encodeField(fieldNum, 0, encodeVarint(value));
}

function encodeFixed32(fieldNum, value) {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(value, 0);
    return encodeField(fieldNum, 5, buf);
}

/**
 * 构建 Warp 请求体
 * @param {string} query - 用户查询
 * @param {string} model - 模型名称
 * @param {Object} options - 可选参数
 * @param {Object} options.toolResult - 工具结果 { callId, command, output }
 * @param {string} options.workingDir - 工作目录
 */
function buildRequestBody(query, model = 'claude-4.1-opus', options = {}) {
    const timestamp = Math.floor(Date.now() / 1000);
    const nanos = (Date.now() % 1000) * 1000000;
    const workingDir = options.workingDir || '/tmp';
    const homeDir = '/tmp';
    const toolResult = options.toolResult || null;

    const field1 = encodeString(1, "");
    const pathInfo = Buffer.concat([encodeString(1, workingDir), encodeString(2, homeDir)]);
    const osInfo = encodeMessage(1, encodeFixed32(9, 0x534f6361));
    const shellInfo = Buffer.concat([encodeString(1, "zsh"), encodeString(2, "5.9")]);
    const timestampInfo = Buffer.concat([encodeVarintField(1, timestamp), encodeVarintField(2, nanos)]);

    const field2_1 = Buffer.concat([
        encodeMessage(1, pathInfo),
        encodeMessage(2, osInfo),
        encodeMessage(3, shellInfo),
        encodeMessage(4, timestampInfo)
    ]);

    let field2_6;
    if (toolResult && toolResult.callId && toolResult.output !== undefined) {
        // 将工具结果嵌入查询文本中，让 Warp 理解上下文
        // 格式：原始查询 + 工具执行信息 + 工具输出
        const toolResultQuery = `${query}\n\n[命令已执行]\n命令: ${toolResult.command}\n输出:\n${toolResult.output}`;
        const queryContent = Buffer.concat([encodeString(1, toolResultQuery), encodeString(3, ""), encodeVarintField(4, 1)]);
        field2_6 = encodeMessage(1, encodeMessage(1, queryContent));
    } else {
        // 普通查询格式
        const queryContent = Buffer.concat([encodeString(1, query), encodeString(3, ""), encodeVarintField(4, 1)]);
        field2_6 = encodeMessage(1, encodeMessage(1, queryContent));
    }
    
    const field2Content = Buffer.concat([encodeMessage(1, field2_1), encodeMessage(6, field2_6)]);

    const modelConfig = Buffer.concat([encodeString(1, "auto-efficient"), encodeString(4, "cli-agent-auto")]);
    const capabilities = Buffer.from([0x06, 0x07, 0x0c, 0x08, 0x09, 0x0f, 0x0e, 0x00, 0x0b, 0x10, 0x0a, 0x14, 0x11, 0x13, 0x12, 0x02, 0x03, 0x01, 0x0d]);
    const capabilities2 = Buffer.from([0x0a, 0x14, 0x06, 0x07, 0x0c, 0x02, 0x01]);

    const field3Content = Buffer.concat([
        encodeMessage(1, modelConfig),
        encodeVarintField(2, 1), encodeVarintField(3, 1), encodeVarintField(4, 1),
        encodeVarintField(6, 1), encodeVarintField(7, 1), encodeVarintField(8, 1),
        encodeBytes(9, capabilities),
        encodeVarintField(10, 1), encodeVarintField(11, 1), encodeVarintField(12, 1),
        encodeVarintField(13, 1), encodeVarintField(14, 1), encodeVarintField(15, 1),
        encodeVarintField(16, 1), encodeVarintField(17, 1), encodeVarintField(21, 1),
        encodeBytes(22, capabilities2), encodeVarintField(23, 1)
    ]);

    const entrypoint = Buffer.concat([
        encodeString(1, "entrypoint"),
        encodeMessage(2, encodeMessage(3, encodeString(1, "USER_INITIATED")))
    ]);
    const autoResume = Buffer.concat([encodeString(1, "is_auto_resume_after_error"), encodeMessage(2, encodeVarintField(4, 0))]);
    const autoDetect = Buffer.concat([encodeString(1, "is_autodetected_user_query"), encodeMessage(2, encodeVarintField(4, 1))]);
    const field4Content = Buffer.concat([encodeMessage(2, entrypoint), encodeMessage(2, autoResume), encodeMessage(2, autoDetect)]);

    return Buffer.concat([field1, encodeMessage(2, field2Content), encodeMessage(3, field3Content), encodeMessage(4, field4Content)]);
}

// ==================== API 请求 ====================

// Proto 加载状态
let protoLoaded = false;

/**
 * 确保 proto 已加载
 */
async function ensureProtoLoaded() {
    if (!protoLoaded) {
        await loadProtos();
        protoLoaded = true;
    }
}

/**
 * 使用 protobufjs 解析响应事件
 * @param {Buffer} buffer - base64 解码后的二进制数据
 * @param {boolean} debug - 是否输出调试信息
 * @returns {Array} 解析后的事件数组
 */
function parseEventWithProto(buffer, debug = false) {
    try {
        const responseEvent = decodeResponseEvent(buffer);
        const events = parseWarpResponseEvent(responseEvent);

        if (debug && events.length > 0) {
            console.log(`  [PROTO] parsed ${events.length} events:`, events.map(e => e.type).join(', '));
        }

        return events;
    } catch (e) {
        if (debug) {
            console.log(`  [PROTO] decode error: ${e.message}`);
        }
        return [];
    }
}

/**
 * 发送非流式请求
 * @param {string} query - 用户查询
 * @param {string} accessToken - 访问令牌
 * @param {string} model - 模型名称
 * @param {Object} options - 可选参数
 * @param {Object} options.toolResult - 工具结果 { callId, command, output }
 * @param {string} options.workingDir - 工作目录
 */
export async function sendWarpRequest(query, accessToken, model = 'claude-4.1-opus', reqOptions = {}) {
    // 确保 proto 已加载
    await ensureProtoLoaded();

    return new Promise((resolve, reject) => {
        const body = buildRequestBody(query, model, reqOptions);
        const DEBUG = process.env.WARP_DEBUG === 'true';

        const httpOptions = {
            hostname: WARP_CONFIG.host,
            port: 443,
            path: WARP_CONFIG.path,
            method: 'POST',
            headers: {
                ...WARP_CONFIG.headers,
                'authorization': `Bearer ${accessToken}`,
                'content-length': body.length
            }
        };

        // 设置请求超时（增加到 120s，因为复杂请求可能需要更长时间）
        const timeoutMs = reqOptions.timeout || 120000;
        const timeout = setTimeout(() => {
            req.destroy(new Error(`Request timeout after ${timeoutMs/1000}s`));
        }, timeoutMs);

        const req = https.request(httpOptions, (res) => {
            if (res.statusCode !== 200) {
                clearTimeout(timeout);
                let errorData = '';
                res.on('data', chunk => errorData += chunk);
                res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${errorData}`)));
                return;
            }

            let responseText = '';
            let toolCalls = [];
            let eventCount = 0;
            const lineParser = new SSELineParser();  // 使用高性能解析器
            let usage = { input_tokens: 0, output_tokens: 0 };

            res.on('data', (chunk) => {
                const lines = lineParser.addChunk(chunk);

                for (const line of lines) {
                    if (line.startsWith('data:')) {
                        eventCount++;
                        const eventData = line.substring(5).trim();
                        if (eventData) {
                            try {
                                const decoded = Buffer.from(eventData, 'base64');
                                const events = parseEventWithProto(decoded, DEBUG);

                                for (const event of events) {
                                    if (event.type === 'text_delta') {
                                        responseText += event.text;
                                        if (DEBUG) {
                                            console.log(`  [WARP] text: "${event.text.substring(0, 50)}${event.text.length > 50 ? '...' : ''}"`);
                                        }
                                    } else if (event.type === 'reasoning') {
                                        // 不将 reasoning 添加到 responseText，避免思考内容污染输出
                                        // responseText += event.reasoning || '';
                                        if (DEBUG) {
                                            console.log(`  [WARP] reasoning: "${(event.reasoning || '').substring(0, 50)}..."`);
                                        }
                                    } else if (event.type === 'tool_use') {
                                        toolCalls.push(event.toolUse);
                                        if (DEBUG) {
                                            console.log(`  [WARP] tool_use: ${event.toolUse.name}`);
                                        }
                                    } else if (event.type === 'stream_finished') {
                                        usage = event.usage || usage;
                                    }
                                }
                            } catch (e) {
                                if (DEBUG) {
                                    console.log(`  [WARP] event#${eventCount} error: ${e.message}`);
                                }
                            }
                        }
                    }
                }
            });

            res.on('end', () => {
                clearTimeout(timeout);
                // 处理剩余数据
                const remaining = lineParser.flush();
                if (remaining.startsWith('data:')) {
                    const eventData = remaining.substring(5).trim();
                    if (eventData) {
                        try {
                            const decoded = Buffer.from(eventData, 'base64');
                            const events = parseEventWithProto(decoded, DEBUG);

                            for (const event of events) {
                                if (event.type === 'text_delta') {
                                    responseText += event.text;
                                } else if (event.type === 'reasoning') {
                                    // 不将 reasoning 添加到 responseText
                                } else if (event.type === 'tool_use') {
                                    toolCalls.push(event.toolUse);
                                } else if (event.type === 'stream_finished') {
                                    usage = event.usage || usage;
                                }
                            }
                        } catch (e) { }
                    }
                }

                if (DEBUG) {
                    console.log(`  [WARP] total: ${eventCount} events, text=${responseText.length}c, tools=${toolCalls.length}`);
                }

                // 返回响应文本和工具调用信息
                resolve({
                    text: responseText,
                    toolCalls: toolCalls,
                    usage: usage
                });
            });

            res.on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        });

        req.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
        req.write(body);
        req.end();
    });
}

/**
 * 发送流式请求
 * @param {string} query - 用户查询
 * @param {string} accessToken - 访问令牌
 * @param {string} model - 模型名称
 * @param {Function} onData - 数据回调 (text, event)
 * @param {Function} onEnd - 结束回调 (usage)
 * @param {Function} onError - 错误回调 (error)
 */
export async function sendWarpStreamRequest(query, accessToken, model, onData, onEnd, onError) {
    // 确保 proto 已加载
    await ensureProtoLoaded();

    const body = buildRequestBody(query, model);
    const DEBUG = process.env.WARP_DEBUG === 'true';
    const lineParser = new SSELineParser();  // 使用高性能解析器
    let usage = { input_tokens: 0, output_tokens: 0 };

    const options = {
        hostname: WARP_CONFIG.host,
        port: 443,
        path: WARP_CONFIG.path,
        method: 'POST',
        headers: {
            ...WARP_CONFIG.headers,
            'authorization': `Bearer ${accessToken}`,
            'content-length': body.length
        }
    };

    const req = https.request(options, (res) => {
        if (res.statusCode !== 200) {
            let errorData = '';
            res.on('data', chunk => errorData += chunk);
            res.on('end', () => onError(new Error(`HTTP ${res.statusCode}: ${errorData}`)));
            return;
        }

        res.on('data', (chunk) => {
            const lines = lineParser.addChunk(chunk);

            for (const line of lines) {
                if (line.startsWith('data:')) {
                    const eventData = line.substring(5).trim();
                    if (eventData) {
                        try {
                            const decoded = Buffer.from(eventData, 'base64');
                            const events = parseEventWithProto(decoded, DEBUG);

                            for (const event of events) {
                                if (event.type === 'text_delta') {
                                    onData(event.text, event);
                                } else if (event.type === 'reasoning') {
                                    onData(event.reasoning || '', event);
                                } else if (event.type === 'tool_use') {
                                    onData(null, event);
                                } else if (event.type === 'stream_finished') {
                                    usage = event.usage || usage;
                                }
                            }
                        } catch (e) {
                            if (DEBUG) {
                                console.log(`  [WARP STREAM] parse error: ${e.message}`);
                            }
                        }
                    }
                }
            }
        });

        res.on('end', () => {
            // 处理剩余数据
            const remaining = lineParser.flush();
            if (remaining.startsWith('data:')) {
                const eventData = remaining.substring(5).trim();
                if (eventData) {
                    try {
                        const decoded = Buffer.from(eventData, 'base64');
                        const events = parseEventWithProto(decoded, DEBUG);

                        for (const event of events) {
                            if (event.type === 'text_delta') {
                                onData(event.text, event);
                            } else if (event.type === 'reasoning') {
                                onData(event.reasoning || '', event);
                            } else if (event.type === 'stream_finished') {
                                usage = event.usage || usage;
                            }
                        }
                    } catch (e) { }
                }
            }
            onEnd(usage);
        });
    });

    req.on('error', onError);
    req.write(body);
    req.end();

    return req;
}

// ==================== Warp 服务类 ====================

export class WarpService {
    constructor(warpStore) {
        this.store = warpStore;
    }

    /**
     * 获取有效的 access token
     * 如果 token 过期，自动刷新
     */
    async getValidAccessToken(credential) {
        // 检查现有 token 是否有效
        if (credential.accessToken && !isTokenExpired(credential.accessToken)) {
            return credential.accessToken;
        }

        // 刷新 token
        try {
            const result = await refreshAccessToken(credential.refreshToken);
            const expiresAt = new Date(Date.now() + result.expiresIn * 1000);

            // 更新数据库
            await this.store.updateToken(credential.id, result.accessToken, expiresAt);

            return result.accessToken;
        } catch (error) {
            await this.store.incrementErrorCount(credential.id, error.message);
            throw error;
        }
    }

    /**
     * 发送对话请求（自动选择账号、刷新 token、自动故障转移）
     */
    async chat(query, model = 'claude-4.1-opus') {
        // 使用带故障转移的方法
        return this.chatWithFailover(query, model, 3);
    }

    /**
     * 发送流式对话请求（自动故障转移）
     */
    async chatStream(query, model, onData, onEnd, onError) {
        // 使用带故障转移的方法
        return this.chatStreamWithFailover(query, model, onData, onEnd, onError, 3);
    }

    /**
     * 发送流式对话请求（原始版本，无故障转移）
     */
    async chatStreamSimple(query, model, onData, onEnd, onError) {
        const credential = await this.store.getRandomActive();
        if (!credential) {
            onError(new Error('没有可用的 Warp 账号'));
            return null;
        }

        try {
            const accessToken = await this.getValidAccessToken(credential);
            await this.store.incrementUseCount(credential.id);

            return sendWarpStreamRequest(query, accessToken, model, onData, onEnd, (error) => {
                this.store.incrementErrorCount(credential.id, error.message);
                onError(error);
            });
        } catch (error) {
            await this.store.incrementErrorCount(credential.id, error.message);
            onError(error);
            return null;
        }
    }

    /**
     * 批量刷新所有账号的 token
     */
    async refreshAllTokens() {
        const credentials = await this.store.getAllActive();
        const results = [];

        for (const cred of credentials) {
            try {
                if (!cred.accessToken || isTokenExpired(cred.accessToken)) {
                    const result = await refreshAccessToken(cred.refreshToken);
                    const expiresAt = new Date(Date.now() + result.expiresIn * 1000);
                    await this.store.updateToken(cred.id, result.accessToken, expiresAt);
                    results.push({ id: cred.id, name: cred.name, success: true });
                } else {
                    results.push({ id: cred.id, name: cred.name, success: true, skipped: true });
                }
            } catch (error) {
                await this.store.incrementErrorCount(cred.id, error.message);
                results.push({ id: cred.id, name: cred.name, success: false, error: error.message });
            }
        }

        return results;
    }

    /**
     * 健康检查
     */
    async healthCheck() {
        const stats = await this.store.getStatistics();
        return {
            ...stats,
            isHealthy: stats.healthy > 0
        };
    }

    /**
     * 查询账户用量
     */
    async getQuota(credentialId) {
        const credential = credentialId 
            ? await this.store.getById(credentialId)
            : await this.store.getRandomActive();
        
        if (!credential) {
            throw new Error('没有可用的 Warp 账号');
        }

        const accessToken = await this.getValidAccessToken(credential);
        const quota = await getRequestLimit(accessToken);
        
        return {
            ...quota,
            credentialId: credential.id,
            credentialName: credential.name,
            email: getEmailFromToken(credential.accessToken)
        };
    }

    /**
     * 查询所有账户用量
     */
    async getAllQuotas() {
        const credentials = await this.store.getAllActive();
        const results = [];

        for (const cred of credentials) {
            try {
                const accessToken = await this.getValidAccessToken(cred);
                const quota = await getRequestLimit(accessToken);
                results.push({
                    ...quota,
                    credentialId: cred.id,
                    credentialName: cred.name,
                    email: getEmailFromToken(cred.accessToken)
                });
            } catch (error) {
                results.push({
                    credentialId: cred.id,
                    credentialName: cred.name,
                    email: getEmailFromToken(cred.accessToken),
                    error: error.message
                });
            }
        }

        return results;
    }

    /**
     * 发送对话请求（带自动故障转移）
     * 如果当前账号失败，自动尝试其他可用账号
     */
    async chatWithFailover(query, model = 'claude-4.1-opus', maxRetries = 3) {
        const triedIds = new Set();
        let lastError = null;

        for (let i = 0; i < maxRetries; i++) {
            // 获取一个未尝试过的可用账号
            const credential = await this.store.getRandomActiveExcluding(Array.from(triedIds));
            if (!credential) {
                break;
            }

            triedIds.add(credential.id);

            try {
                const accessToken = await this.getValidAccessToken(credential);
                const warpResponse = await sendWarpRequest(query, accessToken, model);
                await this.store.incrementUseCount(credential.id);

                return {
                    response: warpResponse.text,
                    toolCalls: warpResponse.toolCalls,
                    credentialId: credential.id,
                    credentialName: credential.name,
                    retriesUsed: i
                };
            } catch (error) {
                lastError = error;
                await this.store.incrementErrorCount(credential.id, error.message);
                
                // 检查是否是额度耗尽错误
                const isQuotaError = error.message.includes('limit') || 
                                    error.message.includes('quota') ||
                                    error.message.includes('exceeded');
                
                if (isQuotaError) {
                    // 标记账号额度耗尽
                    await this.store.markQuotaExhausted(credential.id);
                }
                
                console.log(`[Warp] 账号 ${credential.name} 请求失败: ${error.message}, 尝试下一个账号...`);
            }
        }

        throw lastError || new Error('所有账号都请求失败');
    }

    /**
     * 流式对话请求（带自动故障转移）
     */
    async chatStreamWithFailover(query, model, onData, onEnd, onError, maxRetries = 3) {
        const triedIds = new Set();
        let usedCredentialId = null;

        const tryNext = async () => {
            const credential = await this.store.getRandomActiveExcluding(Array.from(triedIds));
            if (!credential) {
                onError(new Error('所有账号都请求失败'), usedCredentialId);
                return null;
            }

            triedIds.add(credential.id);
            usedCredentialId = credential.id;

            try {
                const accessToken = await this.getValidAccessToken(credential);
                await this.store.incrementUseCount(credential.id);

                return sendWarpStreamRequest(query, accessToken, model, 
                    (content) => onData(content, credential.id),
                    () => onEnd(credential.id),
                    async (error) => {
                        await this.store.incrementErrorCount(credential.id, error.message);
                        
                        if (triedIds.size < maxRetries) {
                            console.log(`[Warp] 账号 ${credential.name} 流式请求失败: ${error.message}, 尝试下一个账号...`);
                            tryNext();
                        } else {
                            onError(error, credential.id);
                        }
                    }
                );
            } catch (error) {
                await this.store.incrementErrorCount(credential.id, error.message);
                
                if (triedIds.size < maxRetries) {
                    console.log(`[Warp] 账号 ${credential.name} 初始化失败: ${error.message}, 尝试下一个账号...`);
                    return tryNext();
                } else {
                    onError(error, credential.id);
                    return null;
                }
            }
        };

        return tryNext();
    }
}

/**
 * 获取账户请求额度
 */
export async function getRequestLimit(accessToken) {
    const query = `query GetRequestLimitInfo($requestContext: RequestContext!) {
  user(requestContext: $requestContext) {
    __typename
    ... on UserOutput {
      user {
        requestLimitInfo {
          isUnlimited
          nextRefreshTime
          requestLimit
          requestsUsedSinceLastRefresh
          requestLimitRefreshDuration
        }
      }
    }
    ... on UserFacingError {
      error {
        __typename
        message
      }
    }
  }
}`;

    const appVersion = 'v0.2026.01.14.08.15.stable_02';
    
    const data = {
        operationName: 'GetRequestLimitInfo',
        variables: {
            requestContext: {
                clientContext: { version: appVersion },
                osContext: {
                    category: 'macOS',
                    linuxKernelVersion: null,
                    name: 'macOS',
                    version: '15.7.2'
                }
            }
        },
        query: query
    };

    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(data);
        
        const options = {
            hostname: 'app.warp.dev',
            port: 443,
            path: '/graphql/v2?op=GetRequestLimitInfo',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                'authorization': `Bearer ${accessToken}`,
                'x-warp-client-id': 'warp-app',
                'x-warp-client-version': appVersion,
                'x-warp-os-category': 'macOS',
                'x-warp-os-name': 'macOS',
                'x-warp-os-version': '15.7.2'
            }
        };

        const req = https.request(options, (res) => {
            let responseData = '';
            res.on('data', chunk => responseData += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(responseData);
                    
                    if (result.errors) {
                        reject(new Error(`GraphQL 错误: ${result.errors[0].message}`));
                        return;
                    }
                    
                    const userData = result.data?.user;
                    
                    if (userData?.__typename === 'UserOutput') {
                        const limitInfo = userData.user?.requestLimitInfo;
                        
                        if (limitInfo) {
                            resolve({
                                requestLimit: limitInfo.requestLimit || 0,
                                requestsUsed: limitInfo.requestsUsedSinceLastRefresh || 0,
                                requestsRemaining: (limitInfo.requestLimit || 0) - (limitInfo.requestsUsedSinceLastRefresh || 0),
                                isUnlimited: limitInfo.isUnlimited || false,
                                nextRefreshTime: limitInfo.nextRefreshTime || null,
                                refreshDuration: limitInfo.requestLimitRefreshDuration || 'WEEKLY'
                            });
                        } else {
                            reject(new Error('未找到额度信息'));
                        }
                    } else if (userData?.__typename === 'UserFacingError') {
                        reject(new Error(userData.error?.message || '用户错误'));
                    } else {
                        reject(new Error('未知响应格式'));
                    }
                } catch (e) {
                    reject(new Error(`解析响应失败: ${e.message}`));
                }
            });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

// ==================== Protobufjs 模块导出 ====================
// 新的 protobufjs 实现通过以下模块提供：
// - warp-proto.js: Proto 加载器和编解码函数
// - warp-tool-mapper.js: Claude <-> Warp 工具映射
// - warp-message-converter.js: Claude <-> Warp 消息转换
//
// 使用方法：
// import { loadProtos, encodeRequest, decodeResponseEvent } from './warp-proto.js';
// import { buildWarpRequest, parseWarpResponseEvent } from './warp-message-converter.js';
//
// 新端点 /w/v1/messages/proto 使用 protobufjs 实现
