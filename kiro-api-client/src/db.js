import mysql from 'mysql2/promise';

// MySQL 连接配置
const DB_CONFIG = {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: parseInt(process.env.MYSQL_PORT || '13306'),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '4561230wW?',
    database: process.env.MYSQL_DATABASE || 'kiro_api',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

let pool = null;

/**
 * 初始化数据库连接池
 */
export async function initDatabase() {
    if (pool) return pool;

    pool = mysql.createPool(DB_CONFIG);

    // 创建凭据表
    await pool.execute(`
        CREATE TABLE IF NOT EXISTS credentials (
            id INT PRIMARY KEY AUTO_INCREMENT,
            name VARCHAR(255) NOT NULL UNIQUE,
            access_token TEXT NOT NULL,
            refresh_token TEXT,
            profile_arn VARCHAR(512),
            client_id VARCHAR(255),
            client_secret TEXT,
            auth_method VARCHAR(50) DEFAULT 'social',
            provider VARCHAR(50) DEFAULT 'Google',
            region VARCHAR(50) DEFAULT 'us-east-1',
            expires_at VARCHAR(50),
            is_active TINYINT DEFAULT 1,
            usage_data JSON,
            usage_updated_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 添加 provider 列（如果不存在）
    try {
        await pool.execute(`ALTER TABLE credentials ADD COLUMN provider VARCHAR(50) DEFAULT 'Google' AFTER auth_method`);
    } catch (e) {
        // 列已存在，忽略错误
    }

    // 创建错误凭据表
    await pool.execute(`
        CREATE TABLE IF NOT EXISTS error_credentials (
            id INT PRIMARY KEY AUTO_INCREMENT,
            original_id INT,
            name VARCHAR(255) NOT NULL,
            access_token TEXT NOT NULL,
            refresh_token TEXT,
            profile_arn VARCHAR(512),
            client_id VARCHAR(255),
            client_secret TEXT,
            auth_method VARCHAR(50) DEFAULT 'social',
            region VARCHAR(50) DEFAULT 'us-east-1',
            expires_at VARCHAR(50),
            error_message TEXT,
            error_count INT DEFAULT 1,
            last_error_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 创建用户表
    await pool.execute(`
        CREATE TABLE IF NOT EXISTS users (
            id INT PRIMARY KEY AUTO_INCREMENT,
            username VARCHAR(255) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            is_admin TINYINT DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 创建 API 密钥表
    await pool.execute(`
        CREATE TABLE IF NOT EXISTS api_keys (
            id INT PRIMARY KEY AUTO_INCREMENT,
            user_id INT NOT NULL,
            name VARCHAR(255) NOT NULL,
            key_value VARCHAR(255) NOT NULL,
            key_hash VARCHAR(255) NOT NULL UNIQUE,
            key_prefix VARCHAR(50) NOT NULL,
            is_active TINYINT DEFAULT 1,
            last_used_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            daily_limit INT DEFAULT 0,
            monthly_limit INT DEFAULT 0,
            total_limit INT DEFAULT 0,
            concurrent_limit INT DEFAULT 0,
            rate_limit INT DEFAULT 0,
            daily_cost_limit DECIMAL(10,2) DEFAULT 0,
            monthly_cost_limit DECIMAL(10,2) DEFAULT 0,
            total_cost_limit DECIMAL(10,2) DEFAULT 0,
            expires_in_days INT DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 创建 API 日志表
    await pool.execute(`
        CREATE TABLE IF NOT EXISTS api_logs (
            id INT PRIMARY KEY AUTO_INCREMENT,
            request_id VARCHAR(100) NOT NULL,
            api_key_id INT,
            api_key_prefix VARCHAR(50),
            credential_id INT,
            credential_name VARCHAR(255),
            ip_address VARCHAR(50),
            user_agent TEXT,
            method VARCHAR(10) DEFAULT 'POST',
            path VARCHAR(255) DEFAULT '/v1/messages',
            model VARCHAR(100),
            stream TINYINT DEFAULT 0,
            input_tokens INT DEFAULT 0,
            output_tokens INT DEFAULT 0,
            request_messages MEDIUMTEXT,
            response_content MEDIUMTEXT,
            status_code INT DEFAULT 200,
            error_message TEXT,
            duration_ms INT DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_created_at (created_at),
            INDEX idx_api_key_id (api_key_id),
            INDEX idx_ip_address (ip_address),
            INDEX idx_request_id (request_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 创建 Gemini Antigravity 凭证表
    await pool.execute(`
        CREATE TABLE IF NOT EXISTS gemini_credentials (
            id INT PRIMARY KEY AUTO_INCREMENT,
            name VARCHAR(255) NOT NULL UNIQUE,
            email VARCHAR(255),
            access_token TEXT NOT NULL,
            refresh_token TEXT,
            project_id VARCHAR(255),
            expires_at VARCHAR(50),
            is_active TINYINT DEFAULT 1,
            usage_data JSON,
            usage_updated_at DATETIME,
            error_count INT DEFAULT 0,
            last_error_at DATETIME,
            last_error_message TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 创建 Gemini 错误凭证表
    await pool.execute(`
        CREATE TABLE IF NOT EXISTS gemini_error_credentials (
            id INT PRIMARY KEY AUTO_INCREMENT,
            original_id INT,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255),
            access_token TEXT NOT NULL,
            refresh_token TEXT,
            project_id VARCHAR(255),
            expires_at VARCHAR(50),
            error_message TEXT,
            error_count INT DEFAULT 1,
            last_error_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    return pool;
}

/**
 * 获取数据库连接池
 */
export async function getDatabase() {
    if (!pool) {
        await initDatabase();
    }
    return pool;
}

/**
 * 关闭数据库连接池
 */
export async function closeDatabase() {
    if (pool) {
        await pool.end();
        pool = null;
    }
}

/**
 * 凭据管理类
 */
export class CredentialStore {
    constructor(database) {
        this.db = database;
    }

    static async create() {
        const database = await getDatabase();
        return new CredentialStore(database);
    }

    async add(credential) {
        const [result] = await this.db.execute(`
            INSERT INTO credentials (name, access_token, refresh_token, profile_arn, client_id, client_secret, auth_method, provider, region, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            credential.name,
            credential.accessToken,
            credential.refreshToken || null,
            credential.profileArn || null,
            credential.clientId || null,
            credential.clientSecret || null,
            credential.authMethod || 'social',
            credential.provider || 'Google',
            credential.region || 'us-east-1',
            credential.expiresAt || null
        ]);
        return result.insertId;
    }

    async update(id, credential) {
        const toNull = (val) => val === undefined ? null : val;
        await this.db.execute(`
            UPDATE credentials SET
                name = COALESCE(?, name),
                access_token = COALESCE(?, access_token),
                refresh_token = COALESCE(?, refresh_token),
                profile_arn = COALESCE(?, profile_arn),
                client_id = COALESCE(?, client_id),
                client_secret = COALESCE(?, client_secret),
                auth_method = COALESCE(?, auth_method),
                provider = COALESCE(?, provider),
                region = COALESCE(?, region),
                expires_at = COALESCE(?, expires_at)
            WHERE id = ?
        `, [
            toNull(credential.name),
            toNull(credential.accessToken),
            toNull(credential.refreshToken),
            toNull(credential.profileArn),
            toNull(credential.clientId),
            toNull(credential.clientSecret),
            toNull(credential.authMethod),
            toNull(credential.provider),
            toNull(credential.region),
            toNull(credential.expiresAt),
            id
        ]);
    }

    async delete(id) {
        await this.db.execute('DELETE FROM credentials WHERE id = ?', [id]);
    }

    async getById(id) {
        const [rows] = await this.db.execute('SELECT * FROM credentials WHERE id = ?', [id]);
        if (rows.length === 0) return null;
        return this._mapRow(rows[0]);
    }

    async getByName(name) {
        const [rows] = await this.db.execute('SELECT * FROM credentials WHERE name = ?', [name]);
        if (rows.length === 0) return null;
        return this._mapRow(rows[0]);
    }

    async getAll() {
        const [rows] = await this.db.execute('SELECT * FROM credentials ORDER BY created_at DESC');
        return rows.map(row => this._mapRow(row));
    }

    async getActive() {
        const [rows] = await this.db.execute('SELECT * FROM credentials WHERE is_active = 1 LIMIT 1');
        if (rows.length === 0) return null;
        return this._mapRow(rows[0]);
    }

    async setActive(id) {
        await this.db.execute('UPDATE credentials SET is_active = 0');
        await this.db.execute('UPDATE credentials SET is_active = 1 WHERE id = ?', [id]);
    }

    async importFromFile(filePath, name) {
        const fs = await import('fs');
        const content = fs.readFileSync(filePath, 'utf8');
        const creds = JSON.parse(content);

        return this.add({
            name: name || `imported_${Date.now()}`,
            accessToken: creds.accessToken,
            refreshToken: creds.refreshToken,
            profileArn: creds.profileArn,
            clientId: creds.clientId,
            clientSecret: creds.clientSecret,
            authMethod: creds.authMethod,
            region: creds.region,
            expiresAt: creds.expiresAt
        });
    }

    async batchImportSocialAccounts(accounts, region = 'us-east-1') {
        const results = {
            success: 0,
            failed: 0,
            errors: [],
            imported: []
        };

        for (const account of accounts) {
            try {
                if (!account.email || !account.refreshToken) {
                    results.failed++;
                    results.errors.push({
                        email: account.email || 'unknown',
                        error: '缺少 email 或 refreshToken'
                    });
                    continue;
                }

                const provider = account.provider || 'Google';

                const existing = await this.getByName(account.email);
                if (existing) {
                    await this.update(existing.id, {
                        refreshToken: account.refreshToken,
                        authMethod: 'social',
                        provider: provider,
                        region: region
                    });
                    results.success++;
                    results.imported.push({
                        email: account.email,
                        id: existing.id,
                        action: 'updated'
                    });
                } else {
                    const id = await this.add({
                        name: account.email,
                        accessToken: account.refreshToken,
                        refreshToken: account.refreshToken,
                        authMethod: 'social',
                        provider: provider,
                        region: region
                    });
                    results.success++;
                    results.imported.push({
                        email: account.email,
                        id: id,
                        action: 'created'
                    });
                }
            } catch (error) {
                results.failed++;
                results.errors.push({
                    email: account.email || 'unknown',
                    error: error.message
                });
            }
        }

        return results;
    }

    _mapRow(row) {
        return {
            id: row.id,
            name: row.name,
            email: row.name,
            accessToken: row.access_token,
            refreshToken: row.refresh_token,
            profileArn: row.profile_arn,
            clientId: row.client_id,
            clientSecret: row.client_secret,
            authMethod: row.auth_method,
            provider: row.provider || 'Google',
            region: row.region,
            expiresAt: row.expires_at,
            isActive: row.is_active === 1,
            usageData: row.usage_data ? (typeof row.usage_data === 'string' ? JSON.parse(row.usage_data) : row.usage_data) : null,
            usageUpdatedAt: row.usage_updated_at,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }

    async updateUsage(id, usageData) {
        const usageJson = JSON.stringify(usageData);
        await this.db.execute(`
            UPDATE credentials SET
                usage_data = ?,
                usage_updated_at = NOW()
            WHERE id = ?
        `, [usageJson, id]);
    }

    _mapErrorRow(row) {
        return {
            id: row.id,
            originalId: row.original_id,
            name: row.name,
            accessToken: row.access_token,
            refreshToken: row.refresh_token,
            profileArn: row.profile_arn,
            clientId: row.client_id,
            clientSecret: row.client_secret,
            authMethod: row.auth_method,
            region: row.region,
            expiresAt: row.expires_at,
            errorMessage: row.error_message,
            errorCount: row.error_count,
            lastErrorAt: row.last_error_at,
            createdAt: row.created_at
        };
    }

    async moveToError(id, errorMessage) {
        const credential = await this.getById(id);
        if (!credential) return null;

        const [existingError] = await this.db.execute(
            'SELECT id, error_count FROM error_credentials WHERE original_id = ?',
            [id]
        );

        if (existingError.length > 0) {
            const errorId = existingError[0].id;
            const errorCount = existingError[0].error_count + 1;
            await this.db.execute(`
                UPDATE error_credentials SET
                    error_message = ?,
                    error_count = ?,
                    last_error_at = NOW()
                WHERE id = ?
            `, [errorMessage, errorCount, errorId]);
        } else {
            await this.db.execute(`
                INSERT INTO error_credentials (
                    original_id, name, access_token, refresh_token, profile_arn,
                    client_id, client_secret, auth_method, region, expires_at,
                    error_message, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                credential.id,
                credential.name,
                credential.accessToken,
                credential.refreshToken,
                credential.profileArn,
                credential.clientId,
                credential.clientSecret,
                credential.authMethod,
                credential.region,
                credential.expiresAt,
                errorMessage,
                credential.createdAt
            ]);
        }

        await this.delete(id);
        return credential;
    }

    async restoreFromError(errorId, newAccessToken, newRefreshToken, newExpiresAt) {
        const [rows] = await this.db.execute('SELECT * FROM error_credentials WHERE id = ?', [errorId]);
        if (rows.length === 0) return null;

        const errorCred = this._mapErrorRow(rows[0]);

        const [result] = await this.db.execute(`
            INSERT INTO credentials (
                name, access_token, refresh_token, profile_arn,
                client_id, client_secret, auth_method, region, expires_at, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            errorCred.name,
            newAccessToken || errorCred.accessToken,
            newRefreshToken || errorCred.refreshToken,
            errorCred.profileArn,
            errorCred.clientId,
            errorCred.clientSecret,
            errorCred.authMethod,
            errorCred.region,
            newExpiresAt || errorCred.expiresAt,
            errorCred.createdAt
        ]);

        await this.db.execute('DELETE FROM error_credentials WHERE id = ?', [errorId]);
        return result.insertId;
    }

    async getAllErrors() {
        const [rows] = await this.db.execute('SELECT * FROM error_credentials ORDER BY last_error_at DESC');
        return rows.map(row => this._mapErrorRow(row));
    }

    async getErrorById(id) {
        const [rows] = await this.db.execute('SELECT * FROM error_credentials WHERE id = ?', [id]);
        if (rows.length === 0) return null;
        return this._mapErrorRow(rows[0]);
    }

    async deleteError(id) {
        await this.db.execute('DELETE FROM error_credentials WHERE id = ?', [id]);
    }

    async updateErrorToken(id, accessToken, refreshToken, expiresAt) {
        const toNull = (val) => val === undefined ? null : val;
        await this.db.execute(`
            UPDATE error_credentials SET
                access_token = COALESCE(?, access_token),
                refresh_token = COALESCE(?, refresh_token),
                expires_at = COALESCE(?, expires_at)
            WHERE id = ?
        `, [toNull(accessToken), toNull(refreshToken), toNull(expiresAt), id]);
    }
}

/**
 * 用户管理类
 */
export class UserStore {
    constructor(database) {
        this.db = database;
    }

    static async create() {
        const database = await getDatabase();
        return new UserStore(database);
    }

    async create(username, passwordHash, isAdmin = false) {
        try {
            const [result] = await this.db.execute(`
                INSERT INTO users (username, password_hash, is_admin)
                VALUES (?, ?, ?)
            `, [username, passwordHash, isAdmin ? 1 : 0]);
            return result.insertId;
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                throw new Error('用户名已存在');
            }
            throw error;
        }
    }

    async getByUsername(username) {
        const [rows] = await this.db.execute('SELECT * FROM users WHERE username = ?', [username]);
        if (rows.length === 0) return null;
        return this._mapRow(rows[0]);
    }

    async getById(id) {
        const [rows] = await this.db.execute('SELECT * FROM users WHERE id = ?', [id]);
        if (rows.length === 0) return null;
        return this._mapRow(rows[0]);
    }

    async getAll() {
        const [rows] = await this.db.execute('SELECT * FROM users ORDER BY created_at DESC');
        return rows.map(row => this._mapRow(row));
    }

    async updatePassword(id, passwordHash) {
        await this.db.execute(`
            UPDATE users SET password_hash = ?
            WHERE id = ?
        `, [passwordHash, id]);
    }

    async delete(id) {
        await this.db.execute('DELETE FROM api_keys WHERE user_id = ?', [id]);
        await this.db.execute('DELETE FROM users WHERE id = ?', [id]);
    }

    async hasUsers() {
        const [rows] = await this.db.execute('SELECT COUNT(*) as count FROM users');
        return rows[0].count > 0;
    }

    _mapRow(row) {
        return {
            id: row.id,
            username: row.username,
            passwordHash: row.password_hash,
            isAdmin: row.is_admin === 1,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }
}

/**
 * API 密钥管理类
 */
export class ApiKeyStore {
    constructor(database) {
        this.db = database;
    }

    static async create() {
        const database = await getDatabase();
        return new ApiKeyStore(database);
    }

    async create(userId, name, keyValue, keyHash, keyPrefix) {
        const [result] = await this.db.execute(`
            INSERT INTO api_keys (user_id, name, key_value, key_hash, key_prefix)
            VALUES (?, ?, ?, ?, ?)
        `, [userId, name, keyValue, keyHash, keyPrefix]);
        return result.insertId;
    }

    async getByKeyHash(keyHash) {
        const [rows] = await this.db.execute('SELECT * FROM api_keys WHERE key_hash = ? AND is_active = 1', [keyHash]);
        if (rows.length === 0) return null;
        return this._mapRow(rows[0]);
    }

    async getByUserId(userId) {
        const [rows] = await this.db.execute('SELECT * FROM api_keys WHERE user_id = ? ORDER BY created_at DESC', [userId]);
        return rows.map(row => this._mapRow(row));
    }

    async getAll() {
        const [rows] = await this.db.execute(`
            SELECT ak.*, u.username
            FROM api_keys ak
            LEFT JOIN users u ON ak.user_id = u.id
            ORDER BY ak.created_at DESC
        `);
        return rows.map(row => this._mapRowWithUser(row));
    }

    async updateLastUsed(id) {
        await this.db.execute(`
            UPDATE api_keys SET last_used_at = NOW()
            WHERE id = ?
        `, [id]);
    }

    async disable(id) {
        await this.db.execute('UPDATE api_keys SET is_active = 0 WHERE id = ?', [id]);
    }

    async enable(id) {
        await this.db.execute('UPDATE api_keys SET is_active = 1 WHERE id = ?', [id]);
    }

    async delete(id) {
        await this.db.execute('DELETE FROM api_keys WHERE id = ?', [id]);
    }

    async updateLimits(id, limits) {
        const { dailyLimit, monthlyLimit, totalLimit, concurrentLimit, rateLimit, dailyCostLimit, monthlyCostLimit, totalCostLimit, expiresInDays } = limits;
        await this.db.execute(`
            UPDATE api_keys SET
                daily_limit = COALESCE(?, daily_limit),
                monthly_limit = COALESCE(?, monthly_limit),
                total_limit = COALESCE(?, total_limit),
                concurrent_limit = COALESCE(?, concurrent_limit),
                rate_limit = COALESCE(?, rate_limit),
                daily_cost_limit = COALESCE(?, daily_cost_limit),
                monthly_cost_limit = COALESCE(?, monthly_cost_limit),
                total_cost_limit = COALESCE(?, total_cost_limit),
                expires_in_days = COALESCE(?, expires_in_days)
            WHERE id = ?
        `, [
            dailyLimit ?? null,
            monthlyLimit ?? null,
            totalLimit ?? null,
            concurrentLimit ?? null,
            rateLimit ?? null,
            dailyCostLimit ?? null,
            monthlyCostLimit ?? null,
            totalCostLimit ?? null,
            expiresInDays ?? null,
            id
        ]);
    }

    async getById(id) {
        const [rows] = await this.db.execute('SELECT * FROM api_keys WHERE id = ?', [id]);
        if (rows.length === 0) return null;
        return this._mapRow(rows[0]);
    }

    _mapRow(row) {
        return {
            id: row.id,
            userId: row.user_id,
            name: row.name,
            keyValue: row.key_value,
            keyHash: row.key_hash,
            keyPrefix: row.key_prefix,
            isActive: row.is_active === 1,
            lastUsedAt: row.last_used_at,
            createdAt: row.created_at,
            dailyLimit: row.daily_limit || 0,
            monthlyLimit: row.monthly_limit || 0,
            totalLimit: row.total_limit || 0,
            concurrentLimit: row.concurrent_limit || 0,
            rateLimit: row.rate_limit || 0,
            dailyCostLimit: parseFloat(row.daily_cost_limit) || 0,
            monthlyCostLimit: parseFloat(row.monthly_cost_limit) || 0,
            totalCostLimit: parseFloat(row.total_cost_limit) || 0,
            expiresInDays: row.expires_in_days || 0
        };
    }

    _mapRowWithUser(row) {
        return {
            id: row.id,
            userId: row.user_id,
            username: row.username,
            name: row.name,
            keyValue: row.key_value,
            keyHash: row.key_hash,
            keyPrefix: row.key_prefix,
            isActive: row.is_active === 1,
            lastUsedAt: row.last_used_at,
            createdAt: row.created_at,
            dailyLimit: row.daily_limit || 0,
            monthlyLimit: row.monthly_limit || 0,
            totalLimit: row.total_limit || 0,
            concurrentLimit: row.concurrent_limit || 0,
            rateLimit: row.rate_limit || 0,
            dailyCostLimit: parseFloat(row.daily_cost_limit) || 0,
            monthlyCostLimit: parseFloat(row.monthly_cost_limit) || 0,
            totalCostLimit: parseFloat(row.total_cost_limit) || 0,
            expiresInDays: row.expires_in_days || 0
        };
    }
}

/**
 * API 日志管理类
 */
export class ApiLogStore {
    constructor(database) {
        this.db = database;
    }

    static async create() {
        const database = await getDatabase();
        return new ApiLogStore(database);
    }

    async create(logData) {
        const [result] = await this.db.execute(`
            INSERT INTO api_logs (
                request_id, api_key_id, api_key_prefix, credential_id, credential_name,
                ip_address, user_agent, method, path, model, stream,
                input_tokens, output_tokens, request_messages, response_content,
                status_code, error_message, duration_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            logData.requestId || null,
            logData.apiKeyId !== undefined ? logData.apiKeyId : null,
            logData.apiKeyPrefix !== undefined ? logData.apiKeyPrefix : null,
            logData.credentialId !== undefined ? logData.credentialId : null,
            logData.credentialName !== undefined ? logData.credentialName : null,
            logData.ipAddress !== undefined ? logData.ipAddress : null,
            logData.userAgent !== undefined ? logData.userAgent : null,
            logData.method || 'POST',
            logData.path || '/v1/messages',
            logData.model !== undefined ? logData.model : null,
            logData.stream ? 1 : 0,
            logData.inputTokens || 0,
            logData.outputTokens || 0,
            logData.requestMessages !== undefined ? logData.requestMessages : null,
            logData.responseContent !== undefined ? logData.responseContent : null,
            logData.statusCode || 200,
            logData.errorMessage !== undefined ? logData.errorMessage : null,
            logData.durationMs || 0
        ]);
        return result.insertId;
    }

    async getAll(options = {}) {
        const { page = 1, pageSize = 100, apiKeyId, ipAddress, startDate, endDate } = options;
        const limit = parseInt(pageSize) || 100;
        const offset = ((parseInt(page) || 1) - 1) * limit;

        let query = 'SELECT * FROM api_logs WHERE 1=1';
        const params = [];

        if (apiKeyId) {
            query += ' AND api_key_id = ?';
            params.push(apiKeyId);
        }
        if (ipAddress) {
            query += ' AND ip_address = ?';
            params.push(ipAddress);
        }
        if (startDate) {
            query += ' AND created_at >= ?';
            params.push(startDate);
        }
        if (endDate) {
            query += ' AND created_at <= ?';
            params.push(endDate);
        }

        // 获取总数
        const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
        const [countRows] = await this.db.execute(countQuery, params);
        const total = Number(countRows[0].total) || 0;

        query += ` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
        const [rows] = await this.db.execute(query, params);

        return {
            logs: rows.map(row => this._mapRow(row)),
            total,
            page: parseInt(page) || 1,
            pageSize: limit,
            totalPages: Math.ceil(total / limit)
        };
    }

    async getByApiKeyId(apiKeyId, limit = 100) {
        const [rows] = await this.db.execute(
            `SELECT * FROM api_logs WHERE api_key_id = ? ORDER BY created_at DESC LIMIT ${parseInt(limit)}`,
            [apiKeyId]
        );
        return rows.map(row => this._mapRow(row));
    }

    async getStats(apiKeyId = null, startDate = null, endDate = null) {
        let query = `
            SELECT
                COUNT(*) as total_requests,
                SUM(input_tokens) as total_input_tokens,
                SUM(output_tokens) as total_output_tokens,
                AVG(duration_ms) as avg_duration_ms
            FROM api_logs
            WHERE 1=1
        `;
        const params = [];

        if (apiKeyId) {
            query += ' AND api_key_id = ?';
            params.push(apiKeyId);
        }
        if (startDate) {
            query += ' AND created_at >= ?';
            params.push(startDate);
        }
        if (endDate) {
            query += ' AND created_at <= ?';
            params.push(endDate);
        }

        const [rows] = await this.db.execute(query, params);
        return rows[0];
    }

    _mapRow(row) {
        return {
            id: row.id,
            requestId: row.request_id,
            apiKeyId: row.api_key_id,
            apiKeyPrefix: row.api_key_prefix,
            credentialId: row.credential_id,
            credentialName: row.credential_name,
            ipAddress: row.ip_address,
            userAgent: row.user_agent,
            method: row.method,
            path: row.path,
            model: row.model,
            stream: row.stream === 1,
            inputTokens: row.input_tokens,
            outputTokens: row.output_tokens,
            requestMessages: row.request_messages,
            responseContent: row.response_content,
            statusCode: row.status_code,
            errorMessage: row.error_message,
            durationMs: row.duration_ms,
            createdAt: row.created_at
        };
    }

    async getStatsForApiKey(apiKeyId, options = {}) {
        const { startDate, endDate } = options;
        let query = `
            SELECT
                COUNT(*) as requestCount,
                COALESCE(SUM(input_tokens), 0) as inputTokens,
                COALESCE(SUM(output_tokens), 0) as outputTokens,
                COALESCE(AVG(duration_ms), 0) as avgDurationMs
            FROM api_logs
            WHERE api_key_id = ?
        `;
        const params = [apiKeyId];

        if (startDate) {
            query += ' AND created_at >= ?';
            params.push(startDate);
        }
        if (endDate) {
            query += ' AND created_at <= ?';
            params.push(endDate);
        }

        const [rows] = await this.db.execute(query, params);
        return {
            requestCount: Number(rows[0].requestCount) || 0,
            inputTokens: Number(rows[0].inputTokens) || 0,
            outputTokens: Number(rows[0].outputTokens) || 0,
            avgDurationMs: Number(rows[0].avgDurationMs) || 0
        };
    }

    async getStatsByModel(apiKeyId, options = {}) {
        const { startDate, endDate } = options;
        let query = `
            SELECT
                model,
                COUNT(*) as requestCount,
                COALESCE(SUM(input_tokens), 0) as inputTokens,
                COALESCE(SUM(output_tokens), 0) as outputTokens
            FROM api_logs
            WHERE api_key_id = ?
        `;
        const params = [apiKeyId];

        if (startDate) {
            query += ' AND created_at >= ?';
            params.push(startDate);
        }
        if (endDate) {
            query += ' AND created_at <= ?';
            params.push(endDate);
        }

        query += ' GROUP BY model';

        const [rows] = await this.db.execute(query, params);
        return rows.map(row => ({
            model: row.model,
            requestCount: Number(row.requestCount) || 0,
            inputTokens: Number(row.inputTokens) || 0,
            outputTokens: Number(row.outputTokens) || 0
        }));
    }

    async getAllStatsByModel(options = {}) {
        const { startDate, endDate } = options;
        let query = `
            SELECT
                model,
                COUNT(*) as requestCount,
                COALESCE(SUM(input_tokens), 0) as inputTokens,
                COALESCE(SUM(output_tokens), 0) as outputTokens
            FROM api_logs
            WHERE 1=1
        `;
        const params = [];

        if (startDate) {
            query += ' AND created_at >= ?';
            params.push(startDate);
        }
        if (endDate) {
            query += ' AND created_at <= ?';
            params.push(endDate);
        }

        query += ' GROUP BY model';

        const [rows] = await this.db.execute(query, params);
        return rows.map(row => ({
            model: row.model,
            requestCount: Number(row.requestCount) || 0,
            inputTokens: Number(row.inputTokens) || 0,
            outputTokens: Number(row.outputTokens) || 0
        }));
    }

    async getErrorLogs(options = {}) {
        const { limit = 100, offset = 0, startDate, endDate } = options;
        let query = `
            SELECT * FROM api_logs
            WHERE status_code >= 400
        `;
        const params = [];

        if (startDate) {
            query += ' AND created_at >= ?';
            params.push(startDate);
        }
        if (endDate) {
            query += ' AND created_at <= ?';
            params.push(endDate);
        }

        query += ` ORDER BY created_at DESC LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;

        const [rows] = await this.db.execute(query, params);
        return {
            logs: rows.map(row => this._mapRow(row)),
            total: rows.length
        };
    }

    async getByRequestId(requestId) {
        const [rows] = await this.db.execute(
            'SELECT * FROM api_logs WHERE request_id = ?',
            [requestId]
        );
        if (rows.length === 0) return null;
        return this._mapRow(rows[0]);
    }

    async update(requestId, data) {
        const fields = [];
        const params = [];

        if (data.outputTokens !== undefined) {
            fields.push('output_tokens = ?');
            params.push(data.outputTokens);
        }
        if (data.responseContent !== undefined) {
            fields.push('response_content = ?');
            params.push(data.responseContent);
        }
        if (data.statusCode !== undefined) {
            fields.push('status_code = ?');
            params.push(data.statusCode);
        }
        if (data.errorMessage !== undefined) {
            fields.push('error_message = ?');
            params.push(data.errorMessage);
        }
        if (data.durationMs !== undefined) {
            fields.push('duration_ms = ?');
            params.push(data.durationMs);
        }

        if (fields.length === 0) return;

        params.push(requestId);
        await this.db.execute(
            `UPDATE api_logs SET ${fields.join(', ')} WHERE request_id = ?`,
            params
        );
    }

    async delete(id) {
        await this.db.execute('DELETE FROM api_logs WHERE id = ?', [id]);
    }

    async cleanOldLogs(daysToKeep) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        await this.db.execute(
            'DELETE FROM api_logs WHERE created_at < ?',
            [cutoffDate.toISOString()]
        );
    }

    async getStatsByIp(options = {}) {
        const { startDate, endDate, limit = 100 } = options;
        let query = `
            SELECT
                ip_address as ipAddress,
                COUNT(*) as requestCount,
                COALESCE(SUM(input_tokens), 0) as inputTokens,
                COALESCE(SUM(output_tokens), 0) as outputTokens
            FROM api_logs
            WHERE 1=1
        `;
        const params = [];

        if (startDate) {
            query += ' AND created_at >= ?';
            params.push(startDate);
        }
        if (endDate) {
            query += ' AND created_at <= ?';
            params.push(endDate);
        }

        query += ` GROUP BY ip_address ORDER BY requestCount DESC LIMIT ${parseInt(limit)}`;

        const [rows] = await this.db.execute(query, params);
        return rows.map(row => ({
            ipAddress: row.ipAddress,
            requestCount: Number(row.requestCount) || 0,
            inputTokens: Number(row.inputTokens) || 0,
            outputTokens: Number(row.outputTokens) || 0
        }));
  }

    async getStatsByApiKey(options = {}) {
        const { startDate, endDate } = options;
        let query = `
            SELECT
                api_key_id as apiKeyId,
                api_key_prefix as apiKeyPrefix,
                COUNT(*) as requestCount,
                COALESCE(SUM(input_tokens), 0) as inputTokens,
                COALESCE(SUM(output_tokens), 0) as outputTokens
            FROM api_logs
            WHERE 1=1
        `;
        const params = [];

        if (startDate) {
            query += ' AND created_at >= ?';
            params.push(startDate);
    }
        if (endDate) {
            query += ' AND created_at <= ?';
            params.push(endDate);
        }

        query += ' GROUP BY api_key_id, api_key_prefix';

        const [rows] = await this.db.execute(query, params);
        return rows.map(row => ({
            apiKeyId: row.apiKeyId,
            apiKeyPrefix: row.apiKeyPrefix,
            requestCount: Number(row.requestCount) || 0,
            inputTokens: Number(row.inputTokens) || 0,
            outputTokens: Number(row.outputTokens) || 0
        }));
    }

    async getCostByApiKey(options = {}) {
        const { startDate, endDate } = options;
        let query = `
            SELECT
                api_key_id as apiKeyId,
                api_key_prefix as apiKeyPrefix,
                COUNT(*) as requestCount,
                COALESCE(SUM(input_tokens), 0) as inputTokens,
                COALESCE(SUM(output_tokens), 0) as outputTokens
            FROM api_logs
            WHERE api_key_id IS NOT NULL
        `;
        const params = [];

        if (startDate) {
            query += ' AND created_at >= ?';
            params.push(startDate);
        }
        if (endDate) {
            query += ' AND created_at <= ?';
            params.push(endDate);
        }

        query += ' GROUP BY api_key_id, api_key_prefix';

        const [rows] = await this.db.execute(query, params);
        return rows.map(row => ({
            apiKeyId: row.apiKeyId,
            apiKeyPrefix: row.apiKeyPrefix,
            requestCount: Number(row.requestCount) || 0,
            inputTokens: Number(row.inputTokens) || 0,
            outputTokens: Number(row.outputTokens) || 0
        }));
    }

    async getStatsByDate(options = {}) {
        const { startDate, endDate, apiKeyId } = options;
        let query = `
            SELECT
                DATE(created_at) as date,
                COUNT(*) as requestCount,
                COALESCE(SUM(input_tokens), 0) as inputTokens,
                COALESCE(SUM(output_tokens), 0) as outputTokens
            FROM api_logs
            WHERE 1=1
        `;
        const params = [];

        if (apiKeyId) {
            query += ' AND api_key_id = ?';
            params.push(apiKeyId);
        }
        if (startDate) {
            query += ' AND created_at >= ?';
            params.push(startDate);
        }
        if (endDate) {
            query += ' AND created_at <= ?';
            params.push(endDate);
        }

        query += ' GROUP BY DATE(created_at) ORDER BY date DESC';

        const [rows] = await this.db.execute(query, params);
        return rows.map(row => ({
            date: row.date,
            requestCount: Number(row.requestCount) || 0,
            inputTokens: Number(row.inputTokens) || 0,
            outputTokens: Number(row.outputTokens) || 0
        }));
    }
}

/**
 * Gemini Antigravity 凭证管理类
 */
export class GeminiCredentialStore {
    constructor(database) {
        this.db = database;
    }

    static async create() {
        const database = await getDatabase();
        return new GeminiCredentialStore(database);
    }

    async add(credential) {
        const [result] = await this.db.execute(`
            INSERT INTO gemini_credentials (name, email, access_token, refresh_token, project_id, expires_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [
            credential.name,
            credential.email || null,
            credential.accessToken,
            credential.refreshToken || null,
            credential.projectId || null,
            credential.expiresAt || null
        ]);
        return result.insertId;
    }

    async update(id, credential) {
        const toNull = (val) => val === undefined ? null : val;
        await this.db.execute(`
            UPDATE gemini_credentials SET
                name = COALESCE(?, name),
                email = COALESCE(?, email),
                access_token = COALESCE(?, access_token),
                refresh_token = COALESCE(?, refresh_token),
                project_id = COALESCE(?, project_id),
                expires_at = COALESCE(?, expires_at),
                error_count = COALESCE(?, error_count),
                last_error_at = COALESCE(?, last_error_at),
                last_error_message = COALESCE(?, last_error_message)
            WHERE id = ?
        `, [
            toNull(credential.name),
            toNull(credential.email),
            toNull(credential.accessToken),
            toNull(credential.refreshToken),
            toNull(credential.projectId),
            toNull(credential.expiresAt),
            toNull(credential.errorCount),
            toNull(credential.lastErrorAt),
            toNull(credential.lastErrorMessage),
            id
        ]);
    }

    async delete(id) {
        await this.db.execute('DELETE FROM gemini_credentials WHERE id = ?', [id]);
    }

    async getById(id) {
        const [rows] = await this.db.execute('SELECT * FROM gemini_credentials WHERE id = ?', [id]);
        if (rows.length === 0) return null;
        return this._mapRow(rows[0]);
    }

    async getByName(name) {
        const [rows] = await this.db.execute('SELECT * FROM gemini_credentials WHERE name = ?', [name]);
        if (rows.length === 0) return null;
        return this._mapRow(rows[0]);
    }

    async getAll() {
        const [rows] = await this.db.execute('SELECT * FROM gemini_credentials ORDER BY created_at DESC');
        return rows.map(row => this._mapRow(row));
    }

    async getActive() {
        const [rows] = await this.db.execute('SELECT * FROM gemini_credentials WHERE is_active = 1 LIMIT 1');
        if (rows.length === 0) return null;
        return this._mapRow(rows[0]);
    }

    async getAllActive() {
        const [rows] = await this.db.execute('SELECT * FROM gemini_credentials WHERE is_active = 1 ORDER BY error_count ASC, updated_at DESC');
        return rows.map(row => this._mapRow(row));
    }

    async setActive(id) {
        await this.db.execute('UPDATE gemini_credentials SET is_active = 0');
        await this.db.execute('UPDATE gemini_credentials SET is_active = 1 WHERE id = ?', [id]);
    }

    async updateUsage(id, usageData) {
        const usageJson = JSON.stringify(usageData);
        await this.db.execute(`
            UPDATE gemini_credentials SET
                usage_data = ?,
                usage_updated_at = NOW()
            WHERE id = ?
        `, [usageJson, id]);
    }

    async incrementErrorCount(id, errorMessage) {
        await this.db.execute(`
            UPDATE gemini_credentials SET
                error_count = error_count + 1,
                last_error_at = NOW(),
                last_error_message = ?
            WHERE id = ?
        `, [errorMessage, id]);
    }

    async resetErrorCount(id) {
        await this.db.execute(`
            UPDATE gemini_credentials SET
                error_count = 0,
                last_error_at = NULL,
                last_error_message = NULL
            WHERE id = ?
        `, [id]);
    }

    _mapRow(row) {
        return {
            id: row.id,
            name: row.name,
            email: row.email,
            accessToken: row.access_token,
            refreshToken: row.refresh_token,
            projectId: row.project_id,
            expiresAt: row.expires_at,
            isActive: row.is_active === 1,
            usageData: row.usage_data ? (typeof row.usage_data === 'string' ? JSON.parse(row.usage_data) : row.usage_data) : null,
            usageUpdatedAt: row.usage_updated_at,
            errorCount: row.error_count || 0,
            lastErrorAt: row.last_error_at,
            lastErrorMessage: row.last_error_message,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }

    // ============ 错误凭证管理 ============

    async moveToError(id, errorMessage) {
        const credential = await this.getById(id);
        if (!credential) return null;

        const [existingError] = await this.db.execute(
            'SELECT id, error_count FROM gemini_error_credentials WHERE original_id = ?',
            [id]
        );

        if (existingError.length > 0) {
            const errorId = existingError[0].id;
            const errorCount = existingError[0].error_count + 1;
            await this.db.execute(`
                UPDATE gemini_error_credentials SET
                    error_message = ?,
                    error_count = ?,
                    last_error_at = NOW()
                WHERE id = ?
            `, [errorMessage, errorCount, errorId]);
        } else {
            await this.db.execute(`
                INSERT INTO gemini_error_credentials (
                    original_id, name, email, access_token, refresh_token,
                    project_id, expires_at, error_message, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                credential.id,
                credential.name,
                credential.email,
                credential.accessToken,
                credential.refreshToken,
                credential.projectId,
                credential.expiresAt,
                errorMessage,
                credential.createdAt
            ]);
        }

        await this.delete(id);
        return credential;
    }

    async restoreFromError(errorId, newAccessToken, newRefreshToken, newExpiresAt) {
        const [rows] = await this.db.execute('SELECT * FROM gemini_error_credentials WHERE id = ?', [errorId]);
        if (rows.length === 0) return null;

        const errorCred = this._mapErrorRow(rows[0]);

        const [result] = await this.db.execute(`
            INSERT INTO gemini_credentials (
                name, email, access_token, refresh_token, project_id, expires_at, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            errorCred.name,
            errorCred.email,
            newAccessToken || errorCred.accessToken,
            newRefreshToken || errorCred.refreshToken,
            errorCred.projectId,
            newExpiresAt || errorCred.expiresAt,
            errorCred.createdAt
        ]);

        await this.db.execute('DELETE FROM gemini_error_credentials WHERE id = ?', [errorId]);
        return result.insertId;
    }

    async getAllErrors() {
        const [rows] = await this.db.execute('SELECT * FROM gemini_error_credentials ORDER BY last_error_at DESC');
        return rows.map(row => this._mapErrorRow(row));
    }

    async getErrorById(id) {
        const [rows] = await this.db.execute('SELECT * FROM gemini_error_credentials WHERE id = ?', [id]);
        if (rows.length === 0) return null;
        return this._mapErrorRow(rows[0]);
    }

    async deleteError(id) {
        await this.db.execute('DELETE FROM gemini_error_credentials WHERE id = ?', [id]);
    }

    _mapErrorRow(row) {
        return {
            id: row.id,
            originalId: row.original_id,
            name: row.name,
            email: row.email,
            accessToken: row.access_token,
            refreshToken: row.refresh_token,
            projectId: row.project_id,
            expiresAt: row.expires_at,
            errorMessage: row.error_message,
            errorCount: row.error_count,
            lastErrorAt: row.last_error_at,
            createdAt: row.created_at
        };
    }
}
