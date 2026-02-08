/**
 * Flow Generation Handler - Node.js 实现
 * 处理图片和视频生成请求
 */

import crypto from 'crypto';
import { FlowClient } from './flow-client.js';
import { getRecaptchaToken, isPlaywrightAvailable } from './browser-captcha.js';
import { logger } from '../logger.js';

// 模型配置
export const MODEL_CONFIG = {
    // ========== 图片生成 ==========
    // GEM_PIX (Gemini 2.5 Flash)
    "gemini-2.5-flash-image-landscape": {
        type: "image",
        modelName: "GEM_PIX",
        aspectRatio: "IMAGE_ASPECT_RATIO_LANDSCAPE"
    },
    "gemini-2.5-flash-image-portrait": {
        type: "image",
        modelName: "GEM_PIX",
        aspectRatio: "IMAGE_ASPECT_RATIO_PORTRAIT"
    },

    // GEM_PIX_2 (Gemini 3.0 Pro)
    "gemini-3.0-pro-image-landscape": {
        type: "image",
        modelName: "GEM_PIX_2",
        aspectRatio: "IMAGE_ASPECT_RATIO_LANDSCAPE"
    },
    "gemini-3.0-pro-image-portrait": {
        type: "image",
        modelName: "GEM_PIX_2",
        aspectRatio: "IMAGE_ASPECT_RATIO_PORTRAIT"
    },
    "gemini-3.0-pro-image-square": {
        type: "image",
        modelName: "GEM_PIX_2",
        aspectRatio: "IMAGE_ASPECT_RATIO_SQUARE"
    },

    // IMAGEN_3_5 (Imagen 4.0)
    "imagen-4.0-generate-preview-landscape": {
        type: "image",
        modelName: "IMAGEN_3_5",
        aspectRatio: "IMAGE_ASPECT_RATIO_LANDSCAPE"
    },
    "imagen-4.0-generate-preview-portrait": {
        type: "image",
        modelName: "IMAGEN_3_5",
        aspectRatio: "IMAGE_ASPECT_RATIO_PORTRAIT"
    },

    // ========== 文生视频 (T2V) ==========
    "veo_3_1_t2v_fast_portrait": {
        type: "video",
        videoType: "t2v",
        modelKey: "veo_3_1_t2v_fast_portrait",
        aspectRatio: "VIDEO_ASPECT_RATIO_PORTRAIT",
        supportsImages: false
    },
    "veo_3_1_t2v_fast_landscape": {
        type: "video",
        videoType: "t2v",
        modelKey: "veo_3_1_t2v_fast",
        aspectRatio: "VIDEO_ASPECT_RATIO_LANDSCAPE",
        supportsImages: false
    },
    "veo_2_0_t2v_portrait": {
        type: "video",
        videoType: "t2v",
        modelKey: "veo_2_0_t2v",
        aspectRatio: "VIDEO_ASPECT_RATIO_PORTRAIT",
        supportsImages: false
    },
    "veo_2_0_t2v_landscape": {
        type: "video",
        videoType: "t2v",
        modelKey: "veo_2_0_t2v",
        aspectRatio: "VIDEO_ASPECT_RATIO_LANDSCAPE",
        supportsImages: false
    },

    // ========== 首尾帧模型 (I2V) ==========
    "veo_3_1_i2v_s_fast_portrait_fl": {
        type: "video",
        videoType: "i2v",
        modelKey: "veo_3_1_i2v_s_fast_portrait_fl",
        aspectRatio: "VIDEO_ASPECT_RATIO_PORTRAIT",
        supportsImages: true,
        minImages: 1,
        maxImages: 2
    },
    "veo_3_1_i2v_s_fast_fl": {
        type: "video",
        videoType: "i2v",
        modelKey: "veo_3_1_i2v_s_fast_fl",
        aspectRatio: "VIDEO_ASPECT_RATIO_LANDSCAPE",
        supportsImages: true,
        minImages: 1,
        maxImages: 2
    },

    // ========== 多图生成 (R2V) ==========
    "veo_3_1_r2v_fast_portrait": {
        type: "video",
        videoType: "r2v",
        modelKey: "veo_3_1_r2v_fast_portrait",
        aspectRatio: "VIDEO_ASPECT_RATIO_PORTRAIT",
        supportsImages: true,
        minImages: 0,
        maxImages: null
    },
    "veo_3_1_r2v_fast": {
        type: "video",
        videoType: "r2v",
        modelKey: "veo_3_1_r2v_fast",
        aspectRatio: "VIDEO_ASPECT_RATIO_LANDSCAPE",
        supportsImages: true,
        minImages: 0,
        maxImages: null
    }
};

export class FlowGenerationHandler {
    constructor(flowTokenStore, config = {}) {
        this.flowTokenStore = flowTokenStore;
        this.flowClient = new FlowClient(config);
        this.pollInterval = config.pollInterval || 3000;
        this.maxPollAttempts = config.maxPollAttempts || 200;
    }

    /**
     * 获取支持的模型列表
     */
    getModels() {
        return Object.keys(MODEL_CONFIG).map(id => ({
            id,
            object: 'model',
            created: Date.now(),
            owned_by: 'flow2api',
            ...MODEL_CONFIG[id]
        }));
    }

    /**
     * 统一生成入口
     */
    async *handleGeneration(model, prompt, images = null, stream = false) {
        const startTime = Date.now();

        // 1. 验证模型
        if (!MODEL_CONFIG[model]) {
            yield this._createErrorResponse(`不支持的模型: ${model}`);
            return;
        }

        const modelConfig = MODEL_CONFIG[model];
        const generationType = modelConfig.type;
        logger.flow?.info(`[GENERATION] 开始生成 - 模型: ${model}, 类型: ${generationType}`);

        // 2. 选择Token
        const token = await this.flowTokenStore.selectToken(generationType === 'video');
        if (!token) {
            const errorMsg = `没有可用的Token进行${generationType === 'video' ? '视频' : '图片'}生成`;
            if (stream) {
                yield this._createStreamChunk(`❌ ${errorMsg}\n`);
            }
            yield this._createErrorResponse(errorMsg);
            return;
        }

        logger.flow?.info(`[GENERATION] 已选择Token: ${token.id} (${token.email})`);

        try {
            // 3. 确保AT有效
            if (stream) {
                yield this._createStreamChunk(`✨ ${generationType === 'video' ? '视频' : '图片'}生成任务已启动\n`);
                yield this._createStreamChunk('初始化生成环境...\n');
            }

            const validToken = await this.flowTokenStore.ensureAtValid(token.id);
            if (!validToken) {
                yield this._createErrorResponse('Token AT无效或刷新失败');
                return;
            }

            // 4. 确保Project存在
            const projectId = await this.flowTokenStore.ensureProjectExists(token.id);
            logger.flow?.info(`[GENERATION] Project ID: ${projectId}`);

            // 5. 根据类型处理
            if (generationType === 'image') {
                yield* this._handleImageGeneration(validToken, projectId, modelConfig, prompt, images, stream);
            } else {
                yield* this._handleVideoGeneration(validToken, projectId, modelConfig, prompt, images, stream);
            }

            // 6. 记录使用
            await this.flowTokenStore.recordUsage(token.id, generationType === 'video');
            logger.flow?.info(`[GENERATION] ✅ 生成成功完成`);

        } catch (error) {
            const errorMsg = `生成失败: ${error.message}`;
            logger.flow?.error(`[GENERATION] ❌ ${errorMsg}`);
            if (stream) {
                yield this._createStreamChunk(`❌ ${errorMsg}\n`);
            }
            await this.flowTokenStore.recordError(token.id);
            yield this._createErrorResponse(errorMsg);
        }
    }

    /**
     * 处理图片生成
     */
    async *_handleImageGeneration(token, projectId, modelConfig, prompt, images, stream) {
        // 上传图片 (如果有)
        const imageInputs = [];
        if (images && images.length > 0) {
            if (stream) {
                yield this._createStreamChunk(`上传 ${images.length} 张参考图片...\n`);
            }

            for (let idx = 0; idx < images.length; idx++) {
                const imageBuffer = Buffer.from(images[idx], 'base64');
                const mediaId = await this.flowClient.uploadImage(
                    token.at,
                    imageBuffer,
                    modelConfig.aspectRatio
                );
                imageInputs.push({
                    name: mediaId,
                    imageInputType: 'IMAGE_INPUT_TYPE_REFERENCE'
                });
                if (stream) {
                    yield this._createStreamChunk(`已上传第 ${idx + 1}/${images.length} 张图片\n`);
    }
            }
        }

        // 获取 reCAPTCHA token
        const recaptchaToken = await this._getRecaptchaToken(token);

        // 调用生成API
        if (stream) {
            yield this._createStreamChunk('正在生成图片...\n');
        }

        const result = await this.flowClient.generateImage({
            at: token.at,
            projectId,
            prompt,
            modelName: modelConfig.modelName,
            aspectRatio: modelConfig.aspectRatio,
            imageInputs,
            recaptchaToken
        });

        // 提取URL
        const media = result.media || [];
        if (!media.length) {
            yield this._createErrorResponse('生成结果为空');
            return;
        }

        const imageUrl = media[0].image?.generatedImage?.fifeUrl;
        if (!imageUrl) {
            yield this._createErrorResponse('无法获取图片URL');
            return;
        }

        // 返回结果
        if (stream) {
            yield this._createStreamChunk(`![Generated Image](${imageUrl})`, 'stop');
        } else {
            yield this._createCompletionResponse(imageUrl, 'image');
        }
    }

    /**
     * 处理视频生成
     */
    async *_handleVideoGeneration(token, projectId, modelConfig, prompt, images, stream) {
        const videoType = modelConfig.videoType;
        const imageCount = images ? images.length : 0;

        // 验证图片数量
        if (videoType === 't2v' && imageCount > 0) {
            if (stream) {
                yield this._createStreamChunk('⚠️ 文生视频模型不支持上传图片，将忽略图片\n');
            }
            images = null;
        } else if (videoType === 'i2v') {
            const minImages = modelConfig.minImages || 1;
            const maxImages = modelConfig.maxImages || 2;
            if (imageCount < minImages || imageCount > maxImages) {
                yield this._createErrorResponse(`首尾帧模型需要 ${minImages}-${maxImages} 张图片，当前提供了 ${imageCount} 张`);
                return;
            }
        }

        // 获取 reCAPTCHA token
        const recaptchaToken = await this._getRecaptchaToken(token);

        // 上传图片并调用对应API
        let result;
        const userPaygateTier = token.userPaygateTier || 'PAYGATE_TIER_ONE';

        if (videoType === 'i2v' && images && images.length > 0) {
            // 首尾帧生成
            if (stream) {
                yield this._createStreamChunk('上传首帧图片...\n');
            }
            const startMediaId = await this.flowClient.uploadImage(
                token.at,
                Buffer.from(images[0], 'base64'),
                modelConfig.aspectRatio
            );

            if (images.length === 2) {
                if (stream) {
                    yield this._createStreamChunk('上传尾帧图片...\n');
                }
                const endMediaId = await this.flowClient.uploadImage(
                    token.at,
                    Buffer.from(images[1], 'base64'),
                    modelConfig.aspectRatio
                );

                if (stream) {
                    yield this._createStreamChunk('提交视频生成任务...\n');
                }
                result = await this.flowClient.generateVideoStartEnd({
                    at: token.at,
                    projectId,
                    prompt,
                    modelKey: modelConfig.modelKey,
                    aspectRatio: modelConfig.aspectRatio,
                    startMediaId,
                    endMediaId,
                    userPaygateTier,
                    recaptchaToken
                });
            } else {
                if (stream) {
                    yield this._createStreamChunk('提交视频生成任务...\n');
                }
                result = await this.flowClient.generateVideoStartImage({
                    at: token.at,
                    projectId,
                    prompt,
                    modelKey: modelConfig.modelKey.replace('_fl', ''),
                    aspectRatio: modelConfig.aspectRatio,
                    startMediaId,
                    userPaygateTier,
                    recaptchaToken
                });
            }
        } else if (videoType === 'r2v' && images && images.length > 0) {
            // 多图参考生成
            if (stream) {
                yield this._createStreamChunk(`上传 ${images.length} 张参考图片...\n`);
            }
            const referenceImages = [];
            for (const img of images) {
                const mediaId = await this.flowClient.uploadImage(
                    token.at,
                    Buffer.from(img, 'base64'),
                    modelConfig.aspectRatio
                );
                referenceImages.push({
                    imageUsageType: 'IMAGE_USAGE_TYPE_ASSET',
                    mediaId
                });
            }

            if (stream) {
                yield this._createStreamChunk('提交视频生成任务...\n');
            }
            result = await this.flowClient.generateVideoReferenceImages({
                at: token.at,
                projectId,
                prompt,
                modelKey: modelConfig.modelKey,
                aspectRatio: modelConfig.aspectRatio,
                referenceImages,
                userPaygateTier,
                recaptchaToken
            });
        } else {
            // 纯文本生成
            if (stream) {
                yield this._createStreamChunk('提交视频生成任务...\n');
            }
            result = await this.flowClient.generateVideoText({
                at: token.at,
                projectId,
                prompt,
    modelKey: modelConfig.modelKey,
                aspectRatio: modelConfig.aspectRatio,
                userPaygateTier,
                recaptchaToken
            });
        }

        // 获取operations并轮询
        const operations = result.operations || [];
        if (!operations.length) {
            yield this._createErrorResponse('生成任务创建失败');
            return;
        }

        if (stream) {
            yield this._createStreamChunk('视频生成中...\n');
        }

        yield* this._pollVideoResult(token, operations, stream);
    }

    /**
     * 轮询视频生成结果
     */
    async *_pollVideoResult(token, operations, stream) {
        for (let attempt = 0; attempt < this.maxPollAttempts; attempt++) {
            await this._sleep(this.pollInterval);

            try {
                const result = await this.flowClient.checkVideoStatus(token.at, operations);
                const checkedOperations = result.operations || [];

                if (!checkedOperations.length) continue;

                const operation = checkedOperations[0];
                const status = operation.status;

                // 进度更新
                if (stream && attempt % 7 === 0) {
                    const progress = Math.min(Math.floor((attempt / this.maxPollAttempts) * 100), 95);
                    yield this._createStreamChunk(`生成进度: ${progress}%\n`);
                }

                if (status === 'MEDIA_GENERATION_STATUS_SUCCESSFUL') {
                    const metadata = operation.operation?.metadata || {};
                    const videoInfo = metadata.video || {};
                    const videoUrl = videoInfo.fifeUrl;

                    if (!videoUrl) {
                        yield this._createErrorResponse('视频URL为空');
                        return;
                    }

                    if (stream) {
                        yield this._createStreamChunk(
                            `<video src='${videoUrl}' controls style='max-width:100%'></video>`,
                            'stop'
                        );
                    } else {
                        yield this._createCompletionResponse(videoUrl, 'video');
                    }
                    return;
                } else if (status === 'MEDIA_GENERATION_STATUS_FAILED') {
                    const errorInfo = operation.operation?.error || {};
                    const errorMessage = errorInfo.message || '未知错误';
                    yield this._createErrorResponse(`视频生成失败: ${errorMessage}`);
                    return;
                }
            } catch (error) {
                logger.flow?.error(`Poll error: ${error.message}`);
                continue;
            }
        }

        yield this._createErrorResponse(`视频生成超时 (已轮询${this.maxPollAttempts}次)`);
    }

    /**
     * 获取 reCAPTCHA token
     */
    async _getRecaptchaToken(token) {
        const projectId = token.current_project_id;
        if (!projectId) {
            throw new Error('Token 没有关联的 Project ID');
        }

        // 使用 Playwright 浏览器自动获取
        const recaptchaToken = await getRecaptchaToken(projectId, 'IMAGE_GENERATION');
        if (!recaptchaToken) {
            throw new Error('reCAPTCHA token 获取失败，请确保已安装 Playwright: npm install playwright && npx playwright install chromium');
        }

        return recaptchaToken;
    }

    // ========== 响应格式化 ==========

    _createStreamChunk(content, finishReason = null) {
        const chunk = {
            id: `chatcmpl-${Date.now()}`,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: 'flow2api',
            choices: [{
                index: 0,
                delta: finishReason ? { content } : { reasoning_content: content },
                finish_reason: finishReason
            }]
        };
        return `data: ${JSON.stringify(chunk)}\n\n`;
    }

    _createCompletionResponse(content, mediaType = 'image') {
        const formattedContent = mediaType === 'video'
      ? `<video src='${content}' controls></video>`
            : `![Generated Image](${content})`;

        return JSON.stringify({
            id: `chatcmpl-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: 'flow2api',
            choices: [{
                index: 0,
                message: {
                    role: 'assistant',
                    content: formattedContent
                },
                finish_reason: 'stop'
            }]
        });
    }

    _createErrorResponse(errorMessage) {
        return JSON.stringify({
            error: {
                message: errorMessage,
                type: 'invalid_request_error',
                code: 'generation_failed'
            }
        });
    }

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default FlowGenerationHandler;
