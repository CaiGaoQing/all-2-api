/**
 * Warp Protobuf 加载器
 * 使用 protobufjs 加载和编解码 Warp 协议消息
 * 基于 src/warp/proto/ 目录下自动提取的 proto 定义
 */

import protobuf from 'protobufjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 使用本地 proto 目录（从 Warp 二进制自动提取）
const PROTO_DIR = path.join(__dirname, 'proto');

// 缓存加载的 root 和消息类型
let root = null;
let messageTypes = {};
let loadingPromise = null;  // 防止重复加载

/**
 * 加载所有 proto 文件
 * @returns {Promise<Object>} 消息类型对象
 */
export async function loadProtos() {
    if (root) return messageTypes;

    // 防止并发加载
    if (loadingPromise) return loadingPromise;

    loadingPromise = _loadProtosInternal();
    return loadingPromise;
}

async function _loadProtosInternal() {
    if (root) return messageTypes;

    // 创建新的 Root 实例
    root = new protobuf.Root();

    // 设置解析选项以支持 google.protobuf 类型
    root.resolvePath = (origin, target) => {
        // 处理 google/protobuf 导入
        if (target.startsWith('google/protobuf/')) {
            // protobufjs 内置了这些类型，返回 null 让它使用内置的
            return null;
        }
        // 如果 target 已经是绝对路径，直接返回
        if (path.isAbsolute(target)) {
            return target;
        }
        // 其他文件从 PROTO_DIR 加载
        return path.join(PROTO_DIR, target);
    };

    // 按依赖顺序加载 proto 文件
    const protoFiles = [
        'options.proto',
        'citations.proto',
        'file_content.proto',
        'document_content.proto',
        'attachment.proto',
        'todo.proto',
        'suggestions.proto',
        'input_context.proto',
        'task.proto',
        'request.proto',
        'response.proto',
        'conversation_data.proto',
    ];

    for (const file of protoFiles) {
        try {
            await root.load(path.join(PROTO_DIR, file), { keepCase: true });
        } catch (e) {
            // 某些文件可能不存在，跳过
            console.warn(`Warning: Could not load ${file}: ${e.message}`);
        }
    }

    // 查找并缓存消息类型（使用 try-catch 以处理可能不存在的类型）
    const lookupTypeSafe = (name) => {
        try {
            return root.lookupType(name);
        } catch (e) {
            return null;
        }
    };

    const lookupEnumSafe = (name) => {
        try {
            return root.lookupEnum(name);
        } catch (e) {
            return null;
        }
    };

    messageTypes = {
        // 请求/响应
        Request: lookupTypeSafe('warp.multi_agent.v1.Request'),
        ResponseEvent: lookupTypeSafe('warp.multi_agent.v1.ResponseEvent'),

        // 任务相关
        Task: lookupTypeSafe('warp.multi_agent.v1.Task'),
        Message: lookupTypeSafe('warp.multi_agent.v1.Message'),

        // 输入上下文
        InputContext: lookupTypeSafe('warp.multi_agent.v1.InputContext'),

        // 文件内容
        FileContent: lookupTypeSafe('warp.multi_agent.v1.FileContent'),
        FileContentLineRange: lookupTypeSafe('warp.multi_agent.v1.FileContentLineRange'),
        AnyFileContent: lookupTypeSafe('warp.multi_agent.v1.AnyFileContent'),
        DocumentContent: lookupTypeSafe('warp.multi_agent.v1.DocumentContent'),

        // 枚举类型
        ToolType: lookupEnumSafe('warp.multi_agent.v1.ToolType'),
        AgentType: lookupEnumSafe('warp.multi_agent.v1.AgentType'),

        // 客户端动作
        ClientAction: lookupTypeSafe('warp.multi_agent.v1.ClientAction'),

        // 工具结果类型
        RunShellCommandResult: lookupTypeSafe('warp.multi_agent.v1.RunShellCommandResult'),
        ReadFilesResult: lookupTypeSafe('warp.multi_agent.v1.ReadFilesResult'),
        ApplyFileDiffsResult: lookupTypeSafe('warp.multi_agent.v1.ApplyFileDiffsResult'),
        GrepResult: lookupTypeSafe('warp.multi_agent.v1.GrepResult'),
        FileGlobResult: lookupTypeSafe('warp.multi_agent.v1.FileGlobResult'),
        FileGlobV2Result: lookupTypeSafe('warp.multi_agent.v1.FileGlobV2Result'),
        CallMCPToolResult: lookupTypeSafe('warp.multi_agent.v1.CallMCPToolResult'),
        ReadMCPResourceResult: lookupTypeSafe('warp.multi_agent.v1.ReadMCPResourceResult'),
        ShellCommandFinished: lookupTypeSafe('warp.multi_agent.v1.ShellCommandFinished'),
        SearchCodebaseResult: lookupTypeSafe('warp.multi_agent.v1.SearchCodebaseResult'),
        SuggestPlanResult: lookupTypeSafe('warp.multi_agent.v1.SuggestPlanResult'),
        SuggestCreatePlanResult: lookupTypeSafe('warp.multi_agent.v1.SuggestCreatePlanResult'),

        // 新增工具结果类型
        ReadDocumentsResult: lookupTypeSafe('warp.multi_agent.v1.ReadDocumentsResult'),
        EditDocumentsResult: lookupTypeSafe('warp.multi_agent.v1.EditDocumentsResult'),
        CreateDocumentsResult: lookupTypeSafe('warp.multi_agent.v1.CreateDocumentsResult'),
        WriteToLongRunningShellCommandResult: lookupTypeSafe('warp.multi_agent.v1.WriteToLongRunningShellCommandResult'),
        ReadShellCommandOutputResult: lookupTypeSafe('warp.multi_agent.v1.ReadShellCommandOutputResult'),
        UseComputerResult: lookupTypeSafe('warp.multi_agent.v1.UseComputerResult'),
        RequestComputerUseResult: lookupTypeSafe('warp.multi_agent.v1.RequestComputerUseResult'),
        ReadSkillResult: lookupTypeSafe('warp.multi_agent.v1.ReadSkillResult'),
        InsertReviewCommentsResult: lookupTypeSafe('warp.multi_agent.v1.InsertReviewCommentsResult'),
        SuggestNewConversationResult: lookupTypeSafe('warp.multi_agent.v1.SuggestNewConversationResult'),
        SuggestPromptResult: lookupTypeSafe('warp.multi_agent.v1.SuggestPromptResult'),
        OpenCodeReviewResult: lookupTypeSafe('warp.multi_agent.v1.OpenCodeReviewResult'),
        InitProjectResult: lookupTypeSafe('warp.multi_agent.v1.InitProjectResult'),

        // 其他类型
        LongRunningShellCommandSnapshot: lookupTypeSafe('warp.multi_agent.v1.LongRunningShellCommandSnapshot'),
        Coordinates: lookupTypeSafe('warp.multi_agent.v1.Coordinates'),
        RawImage: lookupTypeSafe('warp.multi_agent.v1.RawImage'),
        ScreenDimensions: lookupTypeSafe('warp.multi_agent.v1.ScreenDimensions'),
        TodoItem: lookupTypeSafe('warp.multi_agent.v1.TodoItem'),
        CreateTodoList: lookupTypeSafe('warp.multi_agent.v1.CreateTodoList'),
        UpdatePendingTodos: lookupTypeSafe('warp.multi_agent.v1.UpdatePendingTodos'),
        MarkTodosCompleted: lookupTypeSafe('warp.multi_agent.v1.MarkTodosCompleted'),
        ReviewComment: lookupTypeSafe('warp.multi_agent.v1.ReviewComment'),
        ReviewComments: lookupTypeSafe('warp.multi_agent.v1.ReviewComments'),
        Suggestions: lookupTypeSafe('warp.multi_agent.v1.Suggestions'),
        Citation: lookupTypeSafe('warp.multi_agent.v1.Citation'),
        Attachment: lookupTypeSafe('warp.multi_agent.v1.Attachment'),
        ConversationData: lookupTypeSafe('warp.multi_agent.v1.ConversationData'),
    };

    return messageTypes;
}

/**
 * 获取消息类型（确保已加载）
 * @returns {Promise<Object>} 消息类型对象
 */
export async function getMessageTypes() {
    if (!root) {
        await loadProtos();
    }
    return messageTypes;
}

/**
 * 预加载 Proto 定义（在模块加载时调用）
 * 用于减少首次请求延迟
 */
export function preloadProtos() {
    if (!root && !loadingPromise) {
        loadingPromise = _loadProtosInternal().catch(e => {
            console.warn('[Warp Proto] Preload failed:', e.message);
            loadingPromise = null;
        });
    }
    return loadingPromise;
}

// 模块加载时自动预加载
preloadProtos();

/**
 * 编码 Request 消息
 * @param {Object} requestObj - 请求对象
 * @returns {Buffer} 编码后的二进制数据
 */
export function encodeRequest(requestObj) {
    if (!messageTypes.Request) {
        throw new Error('Proto types not loaded. Call loadProtos() first.');
    }

    const { Request } = messageTypes;

    // 验证消息
    const errMsg = Request.verify(requestObj);
    if (errMsg) {
        throw new Error(`Invalid request: ${errMsg}`);
    }

    // 创建并编码消息
    const message = Request.create(requestObj);
    return Buffer.from(Request.encode(message).finish());
}

/**
 * 解码 ResponseEvent 消息
 * @param {Buffer|Uint8Array} buffer - 二进制数据
 * @returns {Object} 解码后的响应事件对象
 */
export function decodeResponseEvent(buffer) {
    if (!messageTypes.ResponseEvent) {
        throw new Error('Proto types not loaded. Call loadProtos() first.');
    }

    const { ResponseEvent } = messageTypes;
    return ResponseEvent.decode(buffer);
}

/**
 * 解码 Message 消息
 * @param {Buffer|Uint8Array} buffer - 二进制数据
 * @returns {Object} 解码后的消息对象
 */
export function decodeMessage(buffer) {
    if (!messageTypes.Message) {
        throw new Error('Proto types not loaded. Call loadProtos() first.');
    }

    const { Message } = messageTypes;
    return Message.decode(buffer);
}

/**
 * 将 ResponseEvent 转换为普通 JavaScript 对象
 * @param {Object} responseEvent - protobufjs 解码的对象
 * @returns {Object} 普通 JavaScript 对象
 */
export function responseEventToObject(responseEvent) {
    if (!messageTypes.ResponseEvent) {
        throw new Error('Proto types not loaded. Call loadProtos() first.');
    }

    const { ResponseEvent } = messageTypes;
    return ResponseEvent.toObject(responseEvent, {
        longs: Number,
        enums: String,
        bytes: String,
        defaults: true,
        oneofs: true
    });
}

/**
 * 获取 ToolType 枚举值
 * @param {string} name - 工具类型名称
 * @returns {number} 枚举值
 */
export function getToolTypeValue(name) {
    if (!messageTypes.ToolType) {
        throw new Error('Proto types not loaded. Call loadProtos() first.');
    }

    return messageTypes.ToolType.values[name];
}

/**
 * 获取 ToolType 枚举名称
 * @param {number} value - 枚举值
 * @returns {string} 工具类型名称
 */
export function getToolTypeName(value) {
    if (!messageTypes.ToolType) {
        throw new Error('Proto types not loaded. Call loadProtos() first.');
    }

    const { ToolType } = messageTypes;
    for (const [name, val] of Object.entries(ToolType.values)) {
        if (val === value) return name;
    }
    return 'UNKNOWN';
}

/**
 * 创建 InputContext 对象
 * @param {Object} options - 选项
 * @param {string} options.pwd - 当前工作目录
 * @param {string} options.home - 用户主目录
 * @param {string} options.platform - 操作系统平台
 * @param {string} options.shellName - Shell 名称
 * @param {string} options.shellVersion - Shell 版本
 * @returns {Object} InputContext 对象
 */
export function createInputContext(options = {}) {
    const {
        pwd = '/tmp',
        home = process.env.HOME || '/root',
        platform = process.platform === 'darwin' ? 'macOS' : process.platform,
        shellName = 'zsh',
        shellVersion = '5.9'
    } = options;

    return {
        directory: {
            pwd,
            home,
            pwd_file_symbols_indexed: false
        },
        operating_system: {
            platform,
            distribution: ''
        },
        shell: {
            name: shellName,
            version: shellVersion
        },
        current_time: {
            seconds: Math.floor(Date.now() / 1000),
            nanos: (Date.now() % 1000) * 1000000
        }
    };
}

/**
 * 创建 TaskStatus 对象
 * @param {string} status - 状态名称: 'pending', 'in_progress', 'blocked', 'succeeded', 'failed', 'aborted'
 * @returns {Object} TaskStatus 对象
 */
export function createTaskStatus(status = 'in_progress') {
    const statusMap = {
        'pending': { pending: {} },
        'in_progress': { in_progress: {} },
        'blocked': { blocked: {} },
        'succeeded': { succeeded: {} },
        'failed': { failed: {} },
        'aborted': { aborted: {} }
    };

    return statusMap[status] || statusMap['in_progress'];
}

// 导出 ToolType 枚举值常量（根据 PROBUG 提取的 task.proto 更新）
export const TOOL_TYPES = {
    RUN_SHELL_COMMAND: 0,
    SEARCH_CODEBASE: 1,
    READ_FILES: 2,
    APPLY_FILE_DIFFS: 3,
    SUGGEST_PLAN: 4,
    SUGGEST_CREATE_PLAN: 5,
    GREP: 6,
    FILE_GLOB: 7,
    READ_MCP_RESOURCE: 8,
    CALL_MCP_TOOL: 9,
    WRITE_TO_LONG_RUNNING_SHELL_COMMAND: 10,
    SUGGEST_NEW_CONVERSATION: 11,
    FILE_GLOB_V2: 12,
    SUGGEST_PROMPT: 13,
    OPEN_CODE_REVIEW: 14,
    INIT_PROJECT: 15,
    SUBAGENT: 16,
    READ_DOCUMENTS: 17,
    EDIT_DOCUMENTS: 18,
    CREATE_DOCUMENTS: 19,
    READ_SHELL_COMMAND_OUTPUT: 20,
    USE_COMPUTER: 21,
    INSERT_REVIEW_COMMENTS: 22,
    READ_SKILL: 23,
    REQUEST_COMPUTER_USE: 24
};

// AgentType 枚举
export const AGENT_TYPES = {
    AGENT_TYPE_UNKNOWN: 0,
    AGENT_TYPE_PRIMARY: 1,
    AGENT_TYPE_CLI: 2
};

// LLMProvider 枚举
export const LLM_PROVIDERS = {
    LLM_PROVIDER_UNKNOWN: 0,
    LLM_PROVIDER_ANTHROPIC: 1,
    LLM_PROVIDER_OPENAI: 2,
    LLM_PROVIDER_GOOGLE: 3,
    LLM_PROVIDER_XAI: 4,
    LLM_PROVIDER_OPENROUTER: 5,
    LLM_PROVIDER_AWS_BEDROCK: 6
};

// AutonomyLevel 枚举
export const AUTONOMY_LEVELS = {
    SUPERVISED: 0,
    UNSUPERVISED: 1
};

// IsolationLevel 枚举
export const ISOLATION_LEVELS = {
    NONE: 0,
    SANDBOX: 1
};
