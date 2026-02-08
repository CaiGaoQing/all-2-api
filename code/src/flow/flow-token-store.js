/**
 * Flow Token Store - Flow API 凭据管理
 * 独立于 Kiro 凭据的 Flow Token 存储
 */

import { FlowClient } from './flow-client.js';
import { logger } from '../logger.js';

export class FlowTokenStore {
    constructor(pool, flowClient = null) {
        this.pool = pool;
        this.flowClient = flowClient || new FlowClient();
    }

    /**
     * 初始化 Flow 相关的数据库表
     */
    async initTables() {
        // Flow Tokens 表
        await this.pool.execute(`
            CREATE TABLE IF NOT EXISTS flow_tokens (
                id INT PRIMARY KEY AUTO_INCREMENT,
                st TEXT NOT NULL,
                at TEXT,
                at_expires DATETIME,
                email VARCHAR(255) NOT NULL,
                name VARCHAR(255),
                remark VARCHAR(500),
                is_active TINYINT DEFAULT 1,
                credits INT DEFAULT 0,
                user_paygate_tier VARCHAR(50),
                current_project_id VARCHAR(255),
                current_project_name VARCHAR(255),
                image_enabled TINYINT DEFAULT 1,
                video_enabled TINYINT DEFAULT 1,
                use_count INT DEFAULT 0,
                error_count INT DEFAULT 0,
                last_used_at DATETIME,
                last_error_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // Flow Projects 表
        await this.pool.execute(`
            CREATE TABLE IF NOT EXISTS flow_projects (
                id INT PRIMARY KEY AUTO_INCREMENT,
                project_id VARCHAR(255) NOT NULL,
                token_id INT NOT NULL,
                project_name VARCHAR(255) NOT NULL,
                tool_name VARCHAR(50) DEFAULT 'PINHOLE',
                is_active TINYINT DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (token_id) REFERENCES flow_tokens(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        logger.flow?.info('[FlowTokenStore] 数据库表初始化完成');
    }

    // ========== Token CRUD ==========

    /**
     * 获取所有 Token
     */
    async getAllTokens() {
        const [rows] = await this.pool.execute(
            'SELECT * FROM flow_tokens ORDER BY created_at DESC'
        );
        return rows;
    }

    /**
     * 获取活跃的 Token
     */
    async getActiveTokens() {
        const [rows] = await this.pool.execute(
            'SELECT * FROM flow_tokens WHERE is_active = 1 ORDER BY use_count ASC'
        );
        return rows;
    }

    /**
     * 根据 ID 获取 Token
     */
    async getToken(id) {
        const [rows] = await this.pool.execute(
            'SELECT * FROM flow_tokens WHERE id = ?',
            [id]
        );
        return rows[0] || null;
    }

    /**
     * 根据 ST 获取 Token
     */
    async getTokenBySt(st) {
        const [rows] = await this.pool.execute(
            'SELECT * FROM flow_tokens WHERE st = ?',
            [st]
        );
        return rows[0] || null;
    }

    /**
     * 添加新 Token
     */
    async addToken(tokenData) {
        const {
            st, at, atExpires, email, name, remark,
            credits, userPaygateTier, currentProjectId, currentProjectName,
            imageEnabled = true, videoEnabled = true
        } = tokenData;

        const [result] = await this.pool.execute(
            `INSERT INTO flow_tokens
            (st, at, at_expires, email, name, remark, credits, user_paygate_tier,
             current_project_id, current_project_name, image_enabled, video_enabled)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [st, at, atExpires, email, name || '', remark || null,
             credits || 0, userPaygateTier || null,
             currentProjectId || null, currentProjectName || null,
             imageEnabled ? 1 : 0, videoEnabled ? 1 : 0]
        );

        return result.insertId;
    }

    /**
     * 更新 Token
     */
    async updateToken(id, updates) {
        const allowedFields = [
            'st', 'at', 'at_expires', 'email', 'name', 'remark', 'is_active',
            'credits', 'user_paygate_tier', 'current_project_id', 'current_project_name',
            'image_enabled', 'video_enabled', 'use_count', 'error_count',
            'last_used_at', 'last_error_at'
        ];

        const setClauses = [];
        const values = [];

        for (const [key, value] of Object.entries(updates)) {
            const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
            if (allowedFields.includes(dbKey)) {
                setClauses.push(`${dbKey} = ?`);
                values.push(value);
            }
        }

        if (setClauses.length === 0) return;

        values.push(id);
        await this.pool.execute(
            `UPDATE flow_tokens SET ${setClauses.join(', ')} WHERE id = ?`,
            values
        );
    }

    /**
     * 删除 Token
     */
    async deleteToken(id) {
        await this.pool.execute('DELETE FROM flow_tokens WHERE id = ?', [id]);
    }

    /**
     * 启用 Token
     */
    async enableToken(id) {
        await this.pool.execute(
            'UPDATE flow_tokens SET is_active = 1, error_count = 0 WHERE id = ?',
            [id]
        );
    }

    /**
     * 禁用 Token
     */
    async disableToken(id) {
        await this.pool.execute(
            'UPDATE flow_tokens SET is_active = 0 WHERE id = ?',
            [id]
        );
    }

    // ========== Token 选择和负载均衡 ==========

    /**
     * 选择可用的 Token
     */
    async selectToken(forVideo = false) {
        const field = forVideo ? 'video_enabled' : 'image_enabled';
        const [rows] = await this.pool.execute(
            `SELECT * FROM flow_tokens
             WHERE is_active = 1 AND ${field} = 1
             ORDER BY use_count ASC, last_used_at ASC
             LIMIT 1`
        );
        return rows[0] || null;
    }

    // ========== AT 管理 ==========

    /**
     * 确保 AT 有效，如果无效则刷新
     */
    async ensureAtValid(tokenId) {
        const token = await this.getToken(tokenId);
        if (!token) return null;

        // 检查 AT 是否存在
        if (!token.at) {
            logger.flow?.info(`[AT_CHECK] Token ${tokenId}: AT不存在，需要刷新`);
            return await this._refreshAt(tokenId, token.st);
        }

        // 检查是否即将过期（提前1小时刷新）
        if (token.at_expires) {
            const expiresAt = new Date(token.at_expires);
            const now = new Date();
            const timeUntilExpiry = expiresAt - now;

            if (timeUntilExpiry < 3600000) { // 1小时
                logger.flow?.info(`[AT_CHECK] Token ${tokenId}: AT即将过期，需要刷新`);
                return await this._refreshAt(tokenId, token.st);
            }
        }

        return token;
    }

    /**
     * 刷新 AT
     */
    async _refreshAt(tokenId, st) {
        try {
            logger.flow?.info(`[AT_REFRESH] Token ${tokenId}: 开始刷新AT...`);

            const result = await this.flowClient.stToAt(st);
            const newAt = result.access_token;
            const expires = result.expires;

            let atExpires = null;
            if (expires) {
                atExpires = new Date(expires.replace('Z', '+00:00'));
            }

            await this.updateToken(tokenId, {
                at: newAt,
                atExpires: atExpires
            });

            logger.flow?.info(`[AT_REFRESH] Token ${tokenId}: AT刷新成功`);

            return await this.getToken(tokenId);
        } catch (error) {
            logger.flow?.error(`[AT_REFRESH] Token ${tokenId}: AT刷新失败 - ${error.message}`);
            await this.disableToken(tokenId);
            return null;
        }
    }

    // ========== Project 管理 ==========

    /**
     * 确保 Token 有可用的 Project
     */
    async ensureProjectExists(tokenId) {
        const token = await this.getToken(tokenId);
        if (!token) throw new Error('Token not found');

        if (token.current_project_id) {
            return token.current_project_id;
        }

        // 创建新 Project
        const now = new Date();
        const projectName = now.toLocaleString('en-US', {
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });

        try {
            const projectId = await this.flowClient.createProject(token.st, projectName);
            logger.flow?.info(`[PROJECT] Created project for token ${tokenId}: ${projectName}`);

            await this.updateToken(tokenId, {
                currentProjectId: projectId,
                currentProjectName: projectName
            });

            // 保存到 projects 表
            await this.pool.execute(
                `INSERT INTO flow_projects (project_id, token_id, project_name) VALUES (?, ?, ?)`,
                [projectId, tokenId, projectName]
            );

            return projectId;
        } catch (error) {
            throw new Error(`Failed to create project: ${error.message}`);
        }
    }

    // ========== 使用统计 ==========

    /**
     * 记录使用
     */
    async recordUsage(tokenId, isVideo = false) {
        await this.pool.execute(
            `UPDATE flow_tokens SET
             use_count = use_count + 1,
             last_used_at = NOW()
             WHERE id = ?`,
            [tokenId]
        );
    }

    /**
     * 记录错误
     */
    async recordError(tokenId) {
        await this.pool.execute(
            `UPDATE flow_tokens SET
             error_count = error_count + 1,
             last_error_at = NOW()
             WHERE id = ?`,
            [tokenId]
        );

        // 检查是否需要自动禁用（连续3次错误）
        const token = await this.getToken(tokenId);
        if (token && token.error_count >= 3) {
            logger.flow?.warn(`[TOKEN_BAN] Token ${tokenId} 连续错误次数达到阈值，自动禁用`);
            await this.disableToken(tokenId);
        }
    }

    /**
     * 重置错误计数
     */
    async resetErrorCount(tokenId) {
        await this.pool.execute(
            'UPDATE flow_tokens SET error_count = 0 WHERE id = ?',
            [tokenId]
        );
    }

    // ========== 批量导入 ==========

    /**
     * 批量添加 Token（通过 ST）
     */
    async batchAddTokens(stList, options = {}) {
        const results = [];

        for (const st of stList) {
            try {
                // 检查是否已存在
                const existing = await this.getTokenBySt(st);
                if (existing) {
                    results.push({
                        st: st.substring(0, 20) + '...',
                        success: false,
                        error: `Token 已存在（邮箱: ${existing.email}）`
                    });
                    continue;
                }

                // 转换 ST 到 AT
                const atResult = await this.flowClient.stToAt(st);
                const at = atResult.access_token;
                const expires = atResult.expires;
                const userInfo = atResult.user || {};
                const email = userInfo.email || '';
                const name = userInfo.name || email.split('@')[0];

                let atExpires = null;
                if (expires) {
                  atExpires = new Date(expires.replace('Z', '+00:00'));
                }

                // 查询余额
                let credits = 0;
                let userPaygateTier = null;
                try {
                    const creditsResult = await this.flowClient.getCredits(at);
                    credits = creditsResult.credits || 0;
                    userPaygateTier = creditsResult.userPaygateTier;
                } catch (e) {
                    // 忽略余额查询错误
                }

                // 创建 Project
                const now = new Date();
                const projectName = now.toLocaleString('en-US', {
                    month: 'short',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                });

                let projectId = null;
                try {
                    projectId = await this.flowClient.createProject(st, projectName);
                } catch (e) {
                    // 忽略项目创建错误
                }

                // 保存 Token
                const tokenId = await this.addToken({
                    st,
                    at,
                    atExpires,
                    email,
                    name,
                    credits,
                    userPaygateTier,
                    currentProjectId: projectId,
                    currentProjectName: projectName,
                    ...options
                });

                // 保存 Project
                if (projectId) {
                    await this.pool.execute(
                        `INSERT INTO flow_projects (project_id, token_id, project_name) VALUES (?, ?, ?)`,
                        [projectId, tokenId, projectName]
                    );
                }

                results.push({
                    st: st.substring(0, 20) + '...',
                    success: true,
                    tokenId,
                    email,
                    credits
                });

            } catch (error) {
                results.push({
                    st: st.substring(0, 20) + '...',
                    success: false,
                    error: error.message
                });
            }
        }

        return results;
    }

    // ========== 余额刷新 ==========

    /**
     * 刷新 Token 余额
     */
    async refreshCredits(tokenId) {
        const token = await this.getToken(tokenId);
        if (!token) return 0;

        // 确保 AT 有效
        const validToken = await this.ensureAtValid(tokenId);
        if (!validToken) return 0;

        try {
            const result = await this.flowClient.getCredits(validToken.at);
            const credits = result.credits || 0;

            await this.updateToken(tokenId, { credits });

            return credits;
        } catch (error) {
            logger.flow?.error(`Failed to refresh credits for token ${tokenId}: ${error.message}`);
            return 0;
        }
    }

    /**
     * 批量刷新所有 Token 余额
     */
    async batchRefreshCredits() {
        const tokens = await this.getActiveTokens();
        const results = [];

        for (const token of tokens) {
            const credits = await this.refreshCredits(token.id);
            results.push({
                id: token.id,
                email: token.email,
                credits
            });
        }

        return results;
    }
}

export default FlowTokenStore;
