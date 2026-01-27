/**
 * 代理配置模块
 * 支持 HTTP/HTTPS/SOCKS5 代理
 */

import { HttpsProxyAgent } from 'https-proxy-agent';
import { getDatabase } from './db.js';

let proxyConfig = null;
let proxyAgent = null;

/**
 * 解析代理配置字符串
 * 支持格式：
 * - host:port:username:password (ISP 格式)
 * - http://username:password@host:port
 * - http://host:port
 */
export function parseProxyString(proxyStr) {
    if (!proxyStr || proxyStr.trim() === '') {
        return null;
    }

    proxyStr = proxyStr.trim();

    // 如果已经是 URL 格式
    if (proxyStr.startsWith('http://') || proxyStr.startsWith('https://')) {
        return proxyStr;
    }

    // ISP 格式: host:port:username:password
    const parts = proxyStr.split(':');
    if (parts.length === 4) {
        const [host, port, username, password] = parts;
        return `http://${username}:${password}@${host}:${port}`;
    } else if (parts.length === 2) {
        const [host, port] = parts;
        return `http://${host}:${port}`;
    }

    // 无法解析，返回原始字符串
    return proxyStr;
}

/**
 * 创建代理 Agent
 */
export function createProxyAgent(proxyUrl) {
    if (!proxyUrl) {
        return null;
    }
    return new HttpsProxyAgent(proxyUrl);
}

/**
 * 初始化代理配置（从数据库加载）
 */
export async function initProxyConfig() {
    try {
        const db = await getDatabase();

        // 确保 settings 表存在
        await db.execute(`
            CREATE TABLE IF NOT EXISTS settings (
                \`key\` VARCHAR(255) PRIMARY KEY,
                value TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        const [rows] = await db.execute('SELECT * FROM settings WHERE `key` = ?', ['proxy_config']);

        if (rows.length > 0) {
            const configStr = rows[0].value;

            if (configStr) {
                proxyConfig = JSON.parse(configStr);
                if (proxyConfig.enabled && proxyConfig.proxyUrl) {
                    const proxyUrl = parseProxyString(proxyConfig.proxyUrl);
                    proxyAgent = createProxyAgent(proxyUrl);
                    console.log('[Proxy] 代理配置已加载:', proxyConfig.proxyUrl);
                }
            }
        }
    } catch (error) {
        console.error('加载代理配置失败:', error.message);
    }

    return proxyConfig;
}

/**
 * 获取当前代理配置
 */
export function getProxyConfig() {
    return proxyConfig;
}

/**
 * 获取代理 Agent（用于 axios 请求）
 */
export function getProxyAgent() {
    if (!proxyConfig || !proxyConfig.enabled) {
        return null;
    }
    return proxyAgent;
}

/**
 * 保存代理配置到数据库
 */
export async function saveProxyConfig(config) {
    const db = await getDatabase();

    // 确保 settings 表存在
    await db.execute(`
        CREATE TABLE IF NOT EXISTS settings (
            \`key\` VARCHAR(255) PRIMARY KEY,
            value TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const configStr = JSON.stringify(config);

    // 使用 REPLACE 来插入或更新
    await db.execute(`
        REPLACE INTO settings (\`key\`, value, updated_at)
        VALUES (?, ?, NOW())
    `, ['proxy_config', configStr]);

    // 更新内存中的配置
    proxyConfig = config;

    if (config.enabled && config.proxyUrl) {
        const proxyUrl = parseProxyString(config.proxyUrl);
        proxyAgent = createProxyAgent(proxyUrl);
        console.log('[Proxy] 代理配置已保存并启用:', config.proxyUrl);
    } else {
        proxyAgent = null;
        console.log('[Proxy] 代理已禁用');
    }

    return config;
}

/**
 * 获取 axios 请求配置（包含代理）
 * 优先使用数据库配置，如果未启用则尝试使用环境变量代理
 */
export function getAxiosProxyConfig() {
    // 优先使用数据库配置的代理
    const agent = getProxyAgent();
    if (agent) {
        return {
            httpAgent: agent,
            httpsAgent: agent,
            proxy: false  // 禁用 axios 内置代理，使用 agent
        };
    }

    // 如果数据库代理未启用，尝试使用环境变量代理
    const envProxy = process.env.HTTPS_PROXY || process.env.https_proxy ||
                     process.env.HTTP_PROXY || process.env.http_proxy;
    if (envProxy) {
        const envAgent = createProxyAgent(envProxy);
        if (envAgent) {
            return {
                httpAgent: envAgent,
                httpsAgent: envAgent,
                proxy: false
            };
        }
    }

    return {};
}

/**
 * 测试代理连接
 */
export async function testProxyConnection(proxyUrl) {
    const axios = (await import('axios')).default;
    const testUrl = 'https://httpbin.org/ip';

    try {
        const parsedUrl = parseProxyString(proxyUrl);
        const agent = createProxyAgent(parsedUrl);

        const response = await axios.get(testUrl, {
            httpsAgent: agent,
            proxy: false,
            timeout: 10000
        });

        return {
            success: true,
            ip: response.data.origin,
            message: `代理连接成功，出口 IP: ${response.data.origin}`
        };
    } catch (error) {
        return {
            success: false,
            message: `代理连接失败: ${error.message}`
        };
    }
}

export default {
    parseProxyString,
    createProxyAgent,
    initProxyConfig,
    getProxyConfig,
    getProxyAgent,
    saveProxyConfig,
    getAxiosProxyConfig,
    testProxyConnection
};
