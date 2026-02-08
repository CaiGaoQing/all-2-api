/**
 * 基于 Playwright 的本地 reCAPTCHA 打码服务
 * 参考 flow2api 的 Python 实现
 */

import { logger } from '../logger.js';

// 配置
const WEBSITE_KEY = '6LdsFiUsAAAAAIjVDZcuLhaHiDn5nnHVXVRQGeMV';
const LABS_URL = 'https://labs.google/fx/tools/flow';

// UA 池
const UA_LIST = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
];

// 分辨率池
const RESOLUTIONS = [
    [1920, 1080], [2560, 1440], [1366, 768], [1536, 864],
    [1600, 900], [1280, 720], [1440, 900], [1680, 1050],
];

// Playwright 实例
let playwright = null;
let chromium = null;

/**
 * 初始化 Playwright
 */
async function initPlaywright() {
    if (playwright) return true;

    try {
        const pw = await import('playwright');
        playwright = pw;
        chromium = pw.chromium;
        logger.flow?.info('[BrowserCaptcha] Playwright 初始化成功');
        return true;
    } catch (error) {
        logger.flow?.error(`[BrowserCaptcha] Playwright 未安装: ${error.message}`);
        logger.flow?.error('[BrowserCaptcha] 请运行: npm install playwright && npx playwright install chromium');
        return false;
    }
}

/**
 * 获取随机 UA
 */
function getRandomUA() {
    return UA_LIST[Math.floor(Math.random() * UA_LIST.length)];
}

/**
 * 获取随机分辨率
 */
function getRandomResolution() {
    const [width, height] = RESOLUTIONS[Math.floor(Math.random() * RESOLUTIONS.length)];
    return { width, height: height - Math.floor(Math.random() * 80) };
}

/**
 * 获取 reCAPTCHA Token
 * @param {string} projectId - 项目 ID
 * @param {string} action - reCAPTCHA action (默认 IMAGE_GENERATION)
 * @returns {Promise<string|null>} reCAPTCHA token
 */
export async function getRecaptchaToken(projectId, action = 'IMAGE_GENERATION') {
    // 初始化 Playwright
    if (!await initPlaywright()) {
        throw new Error('Playwright 未安装，请运行: npm install playwright && npx playwright install chromium');
    }

    const MAX_RETRIES = 3;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        let browser = null;
        let context = null;
        let page = null;

        try {
            const startTime = Date.now();
            const userAgent = getRandomUA();
            const viewport = getRandomResolution();

            logger.flow?.info(`[BrowserCaptcha] 尝试 ${attempt + 1}/${MAX_RETRIES} - 启动浏览器...`);

            // 启动浏览器
            browser = await chromium.launch({
                headless: false,
                args: [
                    '--disable-blink-features=AutomationControlled',
                    '--no-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-setuid-sandbox',
                    '--no-first-run',
                    '--disable-infobars',
                    `--window-size=${viewport.width},${viewport.height}`,
                ]
            });

            // 创建上下文
            context = await browser.newContext({
                userAgent,
                viewport,
            });

            // 创建页面
            page = await context.newPage();

            // 隐藏 webdriver 特征
            await page.addInitScript(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            });

            // 构造页面 URL
            const pageUrl = `https://labs.google/fx/tools/flow/project/${projectId}`;

            // 拦截请求，注入 reCAPTCHA 脚本
            await page.route('**/*', async (route) => {
                const url = route.request().url();

                if (url.replace(/\/$/, '') === pageUrl.replace(/\/$/, '')) {
                    // 返回包含 reCAPTCHA 脚本的简单 HTML
                    const html = `
                        <html>
                        <head>
                            <script src="https://www.google.com/recaptcha/enterprise.js?render=${WEBSITE_KEY}"></script>
                        </head>
                        <body></body>
                        </html>
                    `;
                    await route.fulfill({
                        status: 200,
                        contentType: 'text/html',
                        body: html
                    });
                } else if (url.includes('google.com') || url.includes('gstatic.com') || url.includes('recaptcha.net')) {
                    // 允许 Google 相关请求
                    await route.continue();
                } else {
                    // 阻止其他请求
                    await route.abort();
                }
            });

            // 导航到页面
            try {
                await page.goto(pageUrl, { waitUntil: 'load', timeout: 30000 });
            } catch (e) {
                logger.flow?.warn(`[BrowserCaptcha] 页面加载失败: ${e.message}`);
                continue;
            }

            // 等待 grecaptcha 就绪
            try {
                await page.waitForFunction(() => typeof grecaptcha !== 'undefined', { timeout: 15000 });
            } catch (e) {
                logger.flow?.warn(`[BrowserCaptcha] grecaptcha 未就绪: ${e.message}`);
                continue;
            }

            // 执行 reCAPTCHA
            const token = await page.evaluate(async ({ websiteKey, actionName }) => {
                return new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error('timeout')), 25000);
                    grecaptcha.enterprise.execute(websiteKey, { action: actionName })
                        .then(t => {
                            clearTimeout(timeout);
                            resolve(t);
                        })
                        .catch(e => {
                            clearTimeout(timeout);
                            reject(e);
                        });
                });
            }, { websiteKey: WEBSITE_KEY, actionName: action });

            if (token) {
                const elapsed = Date.now() - startTime;
                logger.flow?.info(`[BrowserCaptcha] ✅ Token 获取成功 (${elapsed}ms)`);
                return token;
            }

        } catch (error) {
            logger.flow?.warn(`[BrowserCaptcha] 尝试 ${attempt + 1} 失败: ${error.message}`);
        } finally {
            // 清理资源
            try { if (page) await page.close(); } catch {}
            try { if (context) await context.close(); } catch {}
            try { if (browser) await browser.close(); } catch {}
        }

        // 重试前等待
        if (attempt < MAX_RETRIES - 1) {
            await new Promise(r => setTimeout(r, 1000));
        }
    }

    logger.flow?.error('[BrowserCaptcha] ❌ 所有尝试均失败');
    return null;
}

/**
 * 检查 Playwright 是否可用
 */
export async function isPlaywrightAvailable() {
    try {
        await import('playwright');
        return true;
    } catch {
        return false;
    }
}

export default {
    getRecaptchaToken,
    isPlaywrightAvailable,
    WEBSITE_KEY
};
