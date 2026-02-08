/**
 * Flow API Client for VideoFX (Veo) - Node.js 实现
 * 参考 flow2api 的 Python 实现
 */

import crypto from 'crypto';
import axios from 'axios';
import { getAxiosProxyConfig } from '../proxy.js';

// 默认配置
const DEFAULT_CONFIG = {
    labsBaseUrl: 'https://labs.google/fx/api',
    apiBaseUrl: 'https://aisandbox-pa.googleapis.com/v1',
    timeout: 120000, // 120秒
    maxRetries: 3,
    pollInterval: 3000, // 3秒
    maxPollAttempts: 200
};

// 默认浏览器请求头
const DEFAULT_CLIENT_HEADERS = {
    'sec-ch-ua-mobile': '?1',
    'sec-ch-ua-platform': '"Android"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'cross-site',
    'x-browser-channel': 'stable',
    'x-browser-copyright': 'Copyright 2026 Google LLC. All Rights reserved.',
    'x-browser-validation': 'UujAs0GAwdnCJ9nvrswZ+O+oco0=',
    'x-browser-year': '2026',
    'x-client-data': 'CJS2yQEIpLbJAQipncoBCNj9ygEIlKHLAQiFoM0BGP6lzwE='
};

// User-Agent 缓存
const userAgentCache = new Map();

/**
 * 基于账号ID生成固定的 User-Agent
 */
function generateUserAgent(accountId = null) {
    if (!accountId) {
        accountId = `random_${Math.floor(Math.random() * 999999)}`;
    }

    if (userAgentCache.has(accountId)) {
        return userAgentCache.get(accountId);
    }

    // 使用账号ID作为随机种子
    const hash = crypto.createHash('md5').update(accountId).digest('hex');
    const seed = parseInt(hash.substring(0, 8), 16);
    const rng = (max) => Math.floor((seed * 9301 + 49297) % 233280 / 233280 * max);

    const chromeVersions = ['130.0.0.0', '131.0.0.0', '132.0.0.0', '129.0.0.0'];
    const osConfigs = [
        `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersions[rng(chromeVersions.length)]} Safari/537.36`,
        `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersions[rng(chromeVersions.length)]} Safari/537.36`,
        `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersions[rng(chromeVersions.length)]} Safari/537.36`
    ];

    const userAgent = osConfigs[rng(osConfigs.length)];
    userAgentCache.set(accountId, userAgent);
    return userAgent;
}

/**
 * 生成 sessionId
 */
function generateSessionId() {
    return `;${Date.now()}`;
}

/**
 * 检测图片 MIME 类型
 */
function detectImageMimeType(buffer) {
    if (buffer.length < 12) return 'image/jpeg';

    // WebP
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
        return 'image/webp';
    }
    // PNG
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
        return 'image/png';
    }
    // JPEG
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
        return 'image/jpeg';
    }
    // GIF
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
        return 'image/gif';
    }

    return 'image/jpeg';
}

export class FlowClient {
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.labsBaseUrl = this.config.labsBaseUrl;
        this.apiBaseUrl = this.config.apiBaseUrl;
        this.timeout = this.config.timeout;
    }

    /**
     * 统一 HTTP 请求处理
     */
    async _makeRequest(options) {
        const {
            method = 'POST',
            url,
            headers = {},
            jsonData = null,
            useSt = false,
            stToken = null,
            useAt = false,
            atToken = null,
            timeout = this.timeout
        } = options;

        const requestHeaders = { ...headers };

        // ST 认证 - 使用 Cookie
        if (useSt && stToken) {
            requestHeaders['Cookie'] = `__Secure-next-auth.session-token=${stToken}`;
        }

        // AT 认证 - 使用 Bearer
        if (useAt && atToken) {
            requestHeaders['authorization'] = `Bearer ${atToken}`;
        }

        // 确定账号标识
        let accountId = null;
        if (stToken) accountId = stToken.substring(0, 16);
        else if (atToken) accountId = atToken.substring(0, 16);

        // 通用请求头
        requestHeaders['Content-Type'] = 'application/json';
        requestHeaders['User-Agent'] = generateUserAgent(accountId);

        // 添加默认浏览器头
        for (const [key, value] of Object.entries(DEFAULT_CLIENT_HEADERS)) {
            if (!requestHeaders[key]) {
                requestHeaders[key] = value;
            }
        }

        const axiosConfig = {
            method,
            url,
            headers: requestHeaders,
            timeout,
            ...getAxiosProxyConfig()
        };

        if (jsonData && method.toUpperCase() !== 'GET') {
            axiosConfig.data = jsonData;
        }

        try {
            const response = await axios(axiosConfig);
            return response.data;
        } catch (error) {
            const status = error.response?.status;
            const errorData = error.response?.data;
            let errorReason = `HTTP Error ${status || 'unknown'}`;

            if (errorData?.error) {
                const errorInfo = errorData.error;
                const errorMessage = errorInfo.message || '';
                const details = errorInfo.details || [];
                for (const detail of details) {
                    if (detail.reason) {
                        errorReason = detail.reason;
                        break;
                    }
                }
                if (errorMessage) {
                    errorReason = `${errorReason}: ${errorMessage}`;
                }
            }

            throw new Error(`Flow API request failed: ${errorReason}`);
        }
    }

    // ========== 认证相关 (使用ST) ==========

    /**
     * ST 转 AT
     */
    async stToAt(st) {
        const url = `${this.labsBaseUrl}/auth/session`;
        return await this._makeRequest({
            method: 'GET',
            url,
            useSt: true,
            stToken: st
        });
    }

    // ========== 项目管理 (使用ST) ==========

    /**
     * 创建项目
     */
    async createProject(st, title) {
        const url = `${this.labsBaseUrl}/trpc/project.createProject`;
        const jsonData = {
            json: {
                projectTitle: title,
                toolName: 'PINHOLE'
            }
        };

        const result = await this._makeRequest({
            method: 'POST',
            url,   jsonData,
            useSt: true,
            stToken: st
        });

        return result.result.data.json.result.projectId;
    }

    /**
     * 删除项目
     */
    async deleteProject(st, projectId) {
        const url = `${this.labsBaseUrl}/trpc/project.deleteProject`;
        const jsonData = {
            json: {
                projectToDeleteId: projectId
            }
        };

        await this._makeRequest({
            method: 'POST',
            url,
            jsonData,
            useSt: true,
            stToken: st
        });
    }

    // ========== 余额查询 (使用AT) ==========

    /**
     * 查询余额
     */
    async getCredits(at) {
        const url = `${this.apiBaseUrl}/credits`;
        return await this._makeRequest({
            method: 'GET',
            url,
            useAt: true,
            atToken: at
        });
    }

    // ========== 图片上传 (使用AT) ==========

    /**
     * 上传图片
     */
    async uploadImage(at, imageBuffer, aspectRatio = 'IMAGE_ASPECT_RATIO_LANDSCAPE') {
        // 转换视频 aspect_ratio 为图片 aspect_ratio
        if (aspectRatio.startsWith('VIDEO_')) {
            aspectRatio = aspectRatio.replace('VIDEO_', 'IMAGE_');
        }

        const mimeType = detectImageMimeType(imageBuffer);
        const imageBase64 = imageBuffer.toString('base64');

        const url = `${this.apiBaseUrl}:uploadUserImage`;
        const jsonData = {
            imageInput: {
                rawImageBytes: imageBase64,
                mimeType,
                isUserUploaded: true,
                aspectRatio
            },
            clientContext: {
                sessionId: generateSessionId(),
                tool: 'ASSET_MANAGER'
            }
        };

        const result = await this._makeRequest({
            method: 'POST',
            url,
            jsonData,
            useAt: true,
            atToken: at
        });

        return result.mediaGenerationId.mediaGenerationId;
    }

    // ========== 图片生成 (使用AT) ==========

    /**
     * 生成图片 (同步返回)
     */
    async generateImage(options) {
        const {
            at,
            projectId,
            prompt,
            modelName,
            aspectRatio,
            imageInputs = [],
            recaptchaToken
        } = options;

        if (!recaptchaToken) {
            throw new Error('reCAPTCHA token is required');
        }

        const url = `${this.apiBaseUrl}/projects/${projectId}/flowMedia:batchGenerateImages`;
        const sessionId = generateSessionId();

        const clientContext = {
            recaptchaContext: {
                token: recaptchaToken,
                applicationType: 'RECAPTCHA_APPLICATION_TYPE_WEB'
            },
            sessionId,
            projectId,
            tool: 'PINHOLE'
        };

        const requestData = {
            seed: Math.floor(Math.random() * 99999) + 1,
            imageModelName: modelName,
            imageAspectRatio: aspectRatio,
            prompt,
            imageInputs
        };

        const jsonData = {
            clientContext,
            requests: [requestData]
        };

        return await this._makeRequest({
            method: 'POST',
            url,
            jsonData,
            useAt: true,
            atToken: at
        });
    }

    // ========== 视频生成 (使用AT) ==========

    /**
     * 文生视频
     */
    async generateVideoText(options) {
        const {
            at,
            projectId,
            prompt,
            modelKey,
            aspectRatio,
            userPaygateTier = 'PAYGATE_TIER_ONE',
            recaptchaToken
        } = options;

        if (!recaptchaToken) {
            throw new Error('reCAPTCHA token is required');
        }

        const url = `${this.apiBaseUrl}/video:batchAsyncGenerateVideoText`;
        const sessionId = generateSessionId();
        const sceneId = crypto.randomUUID();

        const jsonData = {
            clientContext: {
                recaptchaContext: {
                    token: recaptchaToken,
                    applicationType: 'RECAPTCHA_APPLICATION_TYPE_WEB'
                },
                sessionId,
                projectId,
                tool: 'PINHOLE',
                userPaygateTier
            },
            requests: [{
                aspectRatio,
                seed: Math.floor(Math.random() * 99999) + 1,
                textInput: { prompt },
                videoModelKey: modelKey,
                metadata: { sceneId }
            }]
        };

        return await this._makeRequest({
            method: 'POST',
            url,
            jsonData,
            useAt: true,
            atToken: at
        });
    }

    /**
     * 图生视频 (多图参考)
     */
    async generateVideoReferenceImages(options) {
        const {
            at,
            projectId,
            prompt,
            modelKey,
            aspectRatio,
            referenceImages,
            userPaygateTier = 'PAYGATE_TIER_ONE',
            recaptchaToken
        } = options;

        if (!recaptchaToken) {
            throw new Error('reCAPTCHA token is required');
        }

        const url = `${this.apiBaseUrl}/video:batchAsyncGenerateVideoReferenceImages`;
        const sessionId = generateSessionId();
        const sceneId = crypto.randomUUID();

        const jsonData = {
            clientContext: {
                recaptchaContext: {
                    token: recaptchaToken,
                    applicationType: 'RECAPTCHA_APPLICATION_TYPE_WEB'
                },
                sessionId,
                projectId,
                tool: 'PINHOLE',
                userPaygateTier
            },
            requests: [{
                aspectRatio,
                seed: Math.floor(Math.random() * 99999) + 1,
                textInput: { prompt },
                videoModelKey: modelKey,
                referenceImages,
                metadata: { sceneId }
            }]
        };

        return await this._makeRequest({
            method: 'POST',
            url,
            jsonData,
            useAt: true,
            atToken: at
        });
    }

    /**
     * 首尾帧生成视频
     */
    async generateVideoStartEnd(options) {
        const {
            at,
            projectId,
            prompt,
            modelKey,
            aspectRatio,
            startMediaId,
            endMediaId,
            userPaygateTier = 'PAYGATE_TIER_ONE',
            recaptchaToken
        } = options;

        if (!recaptchaToken) {
            throw new Error('reCAPTCHA token is required');
        }

        const url = `${this.apiBaseUrl}/video:batchAsyncGenerateVideoStartAndEndImage`;
        const sessionId = generateSessionId();
        const sceneId = crypto.randomUUID();

        const jsonData = {
            clientContext: {
                recaptchaContext: {
                    token: recaptchaToken,
                    applicationType: 'RECAPTCHA_APPLICATION_TYPE_WEB'
                },
                sessionId,
                projectId,
                tool: 'PINHOLE',
                userPaygateTier
            },
            requests: [{
                aspectRatio,
                seed: Math.floor(Math.random() * 99999) + 1,
                textInput: { prompt },
                videoModelKey: modelKey,
                startImage: { mediaId: startMediaId },
                endImage: { mediaId: endMediaId },
                metadata: { sceneId }
            }]
        };

        return await this._makeRequest({
            method: 'POST',
            url,
            jsonData,
            useAt: true,
            atToken: at
        });
    }

    /**
     * 仅首帧生成视频
     */
    async generateVideoStartImage(options) {
        const {
            at,
            projectId,
            prompt,
            modelKey,
            aspectRatio,
            startMediaId,
            userPaygateTier = 'PAYGATE_TIER_ONE',
            recaptchaToken
        } = options;

        if (!recaptchaToken) {
            throw new Error('reCAPTCHA token is required');
        }

        const url = `${this.apiBaseUrl}/video:batchAsyncGenerateVideoStartImage`;
        const sessionId = generateSessionId();
        const sceneId = crypto.randomUUID();

        const jsonData = {
            clientContext: {
                recaptchaContext: {
                    token: recaptchaToken,
                    applicationType: 'RECAPTCHA_APPLICATION_TYPE_WEB'
                },
                sessionId,
                projectId,
                tool: 'PINHOLE',
                userPaygateTier
            },
            requests: [{
                aspectRatio,
                seed: Math.floor(Math.random() * 99999) + 1,
                textInput: { prompt },
                videoModelKey: modelKey,
                startImage: { mediaId: startMediaId },
                metadata: { sceneId }
            }]
        };

        return await this._makeRequest({
            method: 'POST',
            url,
            jsonData,
            useAt: true,
            atToken: at
        });
    }

    // ========== 任务轮询 (使用AT) ==========

    /**
     * 查询视频生成状态
     */
    async checkVideoStatus(at, operations) {
        const url = `${this.apiBaseUrl}/video:batchCheckAsyncVideoGenerationStatus`;
        const jsonData = { operations };

        return await this._makeRequest({
            method: 'POST',
            url,
            jsonData,
            useAt: true,
            atToken: at
        });
    }

    // ========== 媒体删除 (使用ST) ==========

    /**
     * 删除媒体
     */
    async deleteMedia(st, mediaNames) {
        const url = `${this.labsBaseUrl}/trpc/media.deleteMedia`;
        const jsonData = {
            json: {
                names: mediaNames
            }
        };

        await this._makeRequest({
            method: 'POST',
            url,
            jsonData,
            useSt: true,
            stToken: st
        });
    }
}

export default FlowClient;
