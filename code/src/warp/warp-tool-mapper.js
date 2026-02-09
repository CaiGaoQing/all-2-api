/**
 * Warp 工具映射器
 * 处理 Claude API 工具 <-> Warp 工具的双向转换
 * 基于 PROBUG 提取的 task.proto 定义更新
 */

import { TOOL_TYPES } from './warp-proto.js';

/**
 * Claude 工具名 -> Warp 工具类型映射
 */
export const CLAUDE_TO_WARP_TOOL = {
    // 基础工具
    'Bash': { type: TOOL_TYPES.RUN_SHELL_COMMAND, field: 'run_shell_command' },
    'Read': { type: TOOL_TYPES.READ_FILES, field: 'read_files' },
    'Write': { type: TOOL_TYPES.APPLY_FILE_DIFFS, field: 'apply_file_diffs' },
    'Edit': { type: TOOL_TYPES.APPLY_FILE_DIFFS, field: 'apply_file_diffs' },
    'Grep': { type: TOOL_TYPES.GREP, field: 'grep' },
    'Glob': { type: TOOL_TYPES.FILE_GLOB_V2, field: 'file_glob_v2' },

    // 搜索工具
    'SearchCodebase': { type: TOOL_TYPES.SEARCH_CODEBASE, field: 'search_codebase' },

    // Web 工具 - 原生支持
    'WebFetch': { type: TOOL_TYPES.CALL_MCP_TOOL, field: 'call_mcp_tool', isNativeWeb: true },
    'WebSearch': { type: TOOL_TYPES.CALL_MCP_TOOL, field: 'call_mcp_tool', isNativeWeb: true },
    'web_search': { type: TOOL_TYPES.CALL_MCP_TOOL, field: 'call_mcp_tool', isNativeWeb: true },

    // 子代理工具
    'Task': { type: TOOL_TYPES.SUBAGENT, field: 'subagent' },
    'Subagent': { type: TOOL_TYPES.SUBAGENT, field: 'subagent' },

    // Todo 工具 - 原生支持
    'TodoWrite': { type: TOOL_TYPES.CALL_MCP_TOOL, field: 'call_mcp_tool', isTodo: true },
    'TodoRead': { type: TOOL_TYPES.CALL_MCP_TOOL, field: 'call_mcp_tool', isTodo: true },

    // 文档工具
    'ReadDocuments': { type: TOOL_TYPES.READ_DOCUMENTS, field: 'read_documents' },
    'EditDocuments': { type: TOOL_TYPES.EDIT_DOCUMENTS, field: 'edit_documents' },
    'CreateDocuments': { type: TOOL_TYPES.CREATE_DOCUMENTS, field: 'create_documents' },

    // 长时间运行命令
    'WriteToShell': { type: TOOL_TYPES.WRITE_TO_LONG_RUNNING_SHELL_COMMAND, field: 'write_to_long_running_shell_command' },
    'ReadShellOutput': { type: TOOL_TYPES.READ_SHELL_COMMAND_OUTPUT, field: 'read_shell_command_output' },

    // 计划工具
    'SuggestPlan': { type: TOOL_TYPES.SUGGEST_PLAN, field: 'suggest_plan' },
    'Plan': { type: TOOL_TYPES.SUGGEST_PLAN, field: 'suggest_plan' },

    // Computer Use 工具
    'UseComputer': { type: TOOL_TYPES.USE_COMPUTER, field: 'use_computer' },
    'computer': { type: TOOL_TYPES.USE_COMPUTER, field: 'use_computer' },
    'RequestComputerUse': { type: TOOL_TYPES.REQUEST_COMPUTER_USE, field: 'request_computer_use' },

    // MCP 工具
    'ReadMCPResource': { type: TOOL_TYPES.READ_MCP_RESOURCE, field: 'read_mcp_resource' },
    'CallMCPTool': { type: TOOL_TYPES.CALL_MCP_TOOL, field: 'call_mcp_tool' },

    // Skill 工具
    'ReadSkill': { type: TOOL_TYPES.READ_SKILL, field: 'read_skill' },
    'Skill': { type: TOOL_TYPES.READ_SKILL, field: 'read_skill' },

    // Code Review 工具
    'OpenCodeReview': { type: TOOL_TYPES.OPEN_CODE_REVIEW, field: 'open_code_review' },
    'InsertReviewComments': { type: TOOL_TYPES.INSERT_REVIEW_COMMENTS, field: 'insert_review_comments' },
};

/**
 * Warp 工具类型 -> Claude 工具名映射
 */
export const WARP_TO_CLAUDE_TOOL = {
    [TOOL_TYPES.RUN_SHELL_COMMAND]: 'Bash',
    [TOOL_TYPES.READ_FILES]: 'Read',
    [TOOL_TYPES.APPLY_FILE_DIFFS]: 'Write',  // 默认映射到 Write，Edit 需要根据内容判断
    [TOOL_TYPES.GREP]: 'Grep',
    [TOOL_TYPES.FILE_GLOB]: 'Glob',
    [TOOL_TYPES.FILE_GLOB_V2]: 'Glob',
    [TOOL_TYPES.SEARCH_CODEBASE]: 'SearchCodebase',
    [TOOL_TYPES.SUBAGENT]: 'Task',
    [TOOL_TYPES.READ_DOCUMENTS]: 'ReadDocuments',
    [TOOL_TYPES.EDIT_DOCUMENTS]: 'EditDocuments',
    [TOOL_TYPES.CREATE_DOCUMENTS]: 'CreateDocuments',
    [TOOL_TYPES.WRITE_TO_LONG_RUNNING_SHELL_COMMAND]: 'WriteToShell',
    [TOOL_TYPES.READ_SHELL_COMMAND_OUTPUT]: 'ReadShellOutput',
    [TOOL_TYPES.SUGGEST_PLAN]: 'Plan',
    [TOOL_TYPES.SUGGEST_CREATE_PLAN]: 'Plan',
    [TOOL_TYPES.USE_COMPUTER]: 'computer',
    [TOOL_TYPES.REQUEST_COMPUTER_USE]: 'RequestComputerUse',
    [TOOL_TYPES.READ_MCP_RESOURCE]: 'ReadMCPResource',
    [TOOL_TYPES.CALL_MCP_TOOL]: null,  // MCP 工具需要根据名称判断
    [TOOL_TYPES.READ_SKILL]: 'Skill',
    [TOOL_TYPES.OPEN_CODE_REVIEW]: 'OpenCodeReview',
    [TOOL_TYPES.INSERT_REVIEW_COMMENTS]: 'InsertReviewComments',
    [TOOL_TYPES.SUGGEST_NEW_CONVERSATION]: 'SuggestNewConversation',
    [TOOL_TYPES.SUGGEST_PROMPT]: 'SuggestPrompt',
    [TOOL_TYPES.INIT_PROJECT]: 'InitProject',
};

/**
 * 获取 Claude 工具对应的 Warp 支持工具类型列表
 * @param {Array} claudeTools - Claude API 工具定义数组
 * @returns {Array<number>} Warp ToolType 枚举值数组
 */
export function getWarpSupportedTools(claudeTools) {
    if (!claudeTools || !Array.isArray(claudeTools)) {
        // 默认支持的工具
        return [
            TOOL_TYPES.RUN_SHELL_COMMAND,
            TOOL_TYPES.READ_FILES,
            TOOL_TYPES.APPLY_FILE_DIFFS,
            TOOL_TYPES.GREP,
            TOOL_TYPES.FILE_GLOB_V2,
        ];
    }

    const supportedTools = new Set();

    for (const tool of claudeTools) {
        const mapping = CLAUDE_TO_WARP_TOOL[tool.name];
        if (mapping) {
            supportedTools.add(mapping.type);
        } else if (tool.name.startsWith('mcp__')) {
            // MCP 工具
            supportedTools.add(TOOL_TYPES.CALL_MCP_TOOL);
        }
    }

    return Array.from(supportedTools);
}

/**
 * 将 Claude tool_use 转换为 Warp ToolCall
 * @param {Object} toolUse - Claude tool_use 对象 { id, name, input }
 * @returns {Object} Warp ToolCall 对象
 */
export function claudeToolUseToWarpToolCall(toolUse) {
    const { id, name, input } = toolUse;
    const toolCall = { tool_call_id: id };

    switch (name) {
        case 'Bash':
            toolCall.run_shell_command = {
                command: input.command || '',
                is_read_only: isReadOnlyCommand(input.command || ''),
                is_risky: isRiskyCommand(input.command || ''),
                uses_pager: false,
                wait_until_complete: input.timeout ? false : true
            };
            break;

        case 'Read':
            toolCall.read_files = {
                files: [{
                    name: input.file_path || '',
                    line_ranges: input.offset && input.limit ? [{
                        start: input.offset,
                        end: input.offset + input.limit
                    }] : []
                }]
            };
            break;

        case 'Write':
            toolCall.apply_file_diffs = {
                summary: `Create ${input.file_path || 'file'}`,
                diffs: [],
                new_files: [{
                    file_path: input.file_path || '',
                    content: input.content || ''
                }],
                deleted_files: [],
                v4a_updates: []
            };
            break;

        case 'Edit':
            toolCall.apply_file_diffs = {
                summary: `Edit ${input.file_path || 'file'}`,
                diffs: [{
                    file_path: input.file_path || '',
                    search: input.old_string || '',
                    replace: input.new_string || ''
                }],
                new_files: [],
                deleted_files: [],
                v4a_updates: []
            };
            break;

        case 'Grep':
            toolCall.grep = {
                queries: [input.pattern || ''],
                path: input.path || ''
            };
            break;

        case 'Glob':
            toolCall.file_glob_v2 = {
                patterns: [input.pattern || ''],
                search_dir: input.path || '',
                max_matches: input.max_matches || 100,
                max_depth: input.max_depth || 10,
                min_depth: input.min_depth || 0
            };
            break;

        case 'SearchCodebase':
            toolCall.search_codebase = {
                query: input.query || '',
                path_filters: input.path_filters || [],
                codebase_path: input.codebase_path || ''
            };
            break;

        case 'Task':
        case 'Subagent':
            toolCall.subagent = {
                task_id: input.task_id || id,
                payload: JSON.stringify(input),
                // 根据 subagent_type 设置 metadata
                ...(input.subagent_type === 'research' ? { research: {} } :
                    input.subagent_type === 'advice' ? { advice: {} } :
                    input.subagent_type === 'computer_use' ? { computer_use: {} } :
                    input.subagent_type === 'summarization' ? { summarization: {} } :
                    input.command_id ? { cli: { command_id: input.command_id } } : {})
            };
            break;

        case 'ReadDocuments':
            toolCall.read_documents = {
                documents: (input.documents || []).map(doc => ({
                    document_id: doc.document_id || doc.id || '',
                    line_ranges: doc.line_ranges || []
                }))
            };
            break;

        case 'EditDocuments':
            toolCall.edit_documents = {
                diffs: (input.diffs || []).map(diff => ({
                    document_id: diff.document_id || '',
                    search: diff.search || diff.old_string || '',
                    replace: diff.replace || diff.new_string || ''
                }))
            };
            break;

        case 'CreateDocuments':
            toolCall.create_documents = {
                new_documents: (input.documents || []).map(doc => ({
                    content: doc.content || '',
                    title: doc.title || ''
                }))
            };
            break;

        case 'WriteToShell':
            toolCall.write_to_long_running_shell_command = {
                input: Buffer.from(input.input || ''),
                command_id: input.command_id || '',
                mode: input.mode === 'raw' ? { raw: {} } :
                      input.mode === 'block' ? { block: {} } : { line: {} }
            };
            break;

        case 'ReadShellOutput':
            toolCall.read_shell_command_output = {
                command_id: input.command_id || '',
                ...(input.duration ? { duration: { seconds: input.duration } } :
                    input.wait_for_completion ? { on_completion: {} } : {})
            };
            break;

        case 'Plan':
        case 'SuggestPlan':
            toolCall.suggest_plan = {
                summary: input.summary || '',
                proposed_tasks: (input.tasks || []).map(task => ({
                    id: task.id || crypto.randomUUID(),
                    description: task.description || ''
                }))
            };
            break;

        case 'UseComputer':
        case 'computer':
            toolCall.use_computer = {
                actions: convertComputerActions(input.actions || (input.action ? [input] : [])),
                action_summary: input.action_summary || input.action || '',
                post_actions_screenshot_params: input.screenshot_params || {
                    max_long_edge_px: 1280,
                    max_total_px: 1048576
                }
            };
            break;

        case 'RequestComputerUse':
            toolCall.request_computer_use = {
                task_summary: input.task_summary || input.task || '',
                screenshot_params: input.screenshot_params || {
                    max_long_edge_px: 1280,
                    max_total_px: 1048576
                }
            };
            break;

        case 'ReadMCPResource':
            toolCall.read_mcp_resource = {
                uri: input.uri || '',
                server_id: input.server_id || ''
            };
            break;

        case 'ReadSkill':
        case 'Skill':
            toolCall.read_skill = {
                skill_path: input.skill_path || input.path || '',
                skill_name: input.skill_name || input.name || ''
            };
            break;

        case 'OpenCodeReview':
            toolCall.open_code_review = {};
            break;

        case 'InsertReviewComments':
            toolCall.insert_review_comments = {
                repo_path: input.repo_path || '',
                comments: (input.comments || []).map(comment => ({
                    comment_id: comment.id || '',
                    author: comment.author || '',
                    last_modified_timestamp: comment.timestamp || '',
                    comment_body: comment.body || comment.content || '',
                    parent_comment_id: comment.parent_id || '',
                    location: comment.location ? {
                        file_path: comment.location.file_path || '',
                        line: comment.location.line ? {
                            diff_hunk: comment.location.line.diff_hunk || '',
                            range: comment.location.line.range || {}
                        } : undefined
                    } : undefined
                }))
            };
            break;

        default:
            // MCP 工具或其他工具
            if (name.startsWith('mcp__')) {
                toolCall.call_mcp_tool = {
                    name: name,
                    args: input || {},
                    server_id: input.server_id || ''
                };
            } else {
                // 未知工具，尝试作为 MCP 工具处理
                toolCall.call_mcp_tool = {
                    name: name,
                    args: input || {},
                    server_id: ''
                };
            }
            break;
    }

    return toolCall;
}

/**
 * 转换 Computer Use 动作
 * @param {Array} actions - 动作数组
 * @returns {Array} Warp 格式的动作数组
 */
function convertComputerActions(actions) {
    return actions.map(action => {
        if (action.type === 'mouse_move' || action.mouse_move) {
            const data = action.mouse_move || action;
            return { mouse_move: { to: { x: data.x || data.to?.x || 0, y: data.y || data.to?.y || 0 } } };
        }
        if (action.type === 'click' || action.type === 'mouse_down' || action.mouse_down) {
            const data = action.mouse_down || action;
            const buttonMap = { left: 0, right: 1, middle: 2 };
            return {
                mouse_down: {
                    button: buttonMap[data.button] || 0,
                    at: { x: data.x || data.at?.x || 0, y: data.y || data.at?.y || 0 }
                }
            };
        }
        if (action.type === 'mouse_up' || action.mouse_up) {
            const data = action.mouse_up || action;
            const buttonMap = { left: 0, right: 1, middle: 2 };
            return { mouse_up: { button: buttonMap[data.button] || 0 } };
        }
        if (action.type === 'scroll' || action.type === 'mouse_wheel' || action.mouse_wheel) {
            const data = action.mouse_wheel || action;
            const directionMap = { up: 0, down: 1, left: 2, right: 3 };
            return {
                mouse_wheel: {
                    at: { x: data.x || data.at?.x || 0, y: data.y || data.at?.y || 0 },
                    direction: directionMap[data.direction] || 1,
                    pixels: data.pixels || data.amount || 100
                }
            };
        }
        if (action.type === 'type' || action.type === 'type_text' || action.type_text) {
            const data = action.type_text || action;
            return { type_text: { text: data.text || '' } };
        }
        if (action.type === 'key' || action.type === 'key_down' || action.key_down) {
            const data = action.key_down || action;
            return {
                key_down: {
                    key: typeof data.key === 'number' ? { keycode: data.key } : { char: data.key || '' }
                }
            };
        }
        if (action.type === 'key_up' || action.key_up) {
            const data = action.key_up || action;
            return {
                key_up: {
                    key: typeof data.key === 'number' ? { keycode: data.key } : { char: data.key || '' }
                }
            };
        }
        if (action.type === 'wait' || action.wait) {
            const data = action.wait || action;
            return { wait: { duration: { seconds: data.duration || data.seconds || 1 } } };
        }
        return {};
    });
}

/**
 * 将 Warp ToolCall 转换为 Claude tool_use
 * @param {Object} toolCall - Warp ToolCall 对象
 * @returns {Object|null} Claude tool_use 对象 { id, name, input } 或 null
 */
export function warpToolCallToClaudeToolUse(toolCall) {
    const { tool_call_id } = toolCall;

    if (toolCall.run_shell_command) {
        return {
            type: 'tool_use',
            id: tool_call_id,
            name: 'Bash',
            input: {
                command: toolCall.run_shell_command.command || ''
            }
        };
    }

    if (toolCall.read_files) {
        const file = toolCall.read_files.files?.[0];
        if (!file) return null;

        const input = { file_path: file.name || '' };
        if (file.line_ranges?.length > 0) {
            const range = file.line_ranges[0];
            input.offset = range.start;
            input.limit = range.end - range.start;
        }

        return {
            type: 'tool_use',
            id: tool_call_id,
            name: 'Read',
            input
        };
    }

    if (toolCall.apply_file_diffs) {
        const { new_files, diffs } = toolCall.apply_file_diffs;

        // 如果有 new_files，这是 Write 操作
        if (new_files?.length > 0) {
            const file = new_files[0];
            return {
                type: 'tool_use',
                id: tool_call_id,
                name: 'Write',
                input: {
                    file_path: file.file_path || '',
                    content: file.content || ''
                }
            };
        }

        // 如果有 diffs，这是 Edit 操作
        if (diffs?.length > 0) {
          const diff = diffs[0];
            // 先去除行号，再规范化缩进（默认转为 2 空格缩进）
            const oldStr = normalizeIndent(stripLineNumbers(diff.search || ''));
            const newStr = normalizeIndent(stripLineNumbers(diff.replace || ''));
            return {
                type: 'tool_use',
                id: tool_call_id,
                name: 'Edit',
                input: {
                    file_path: diff.file_path || '',
                    old_string: oldStr,
                    new_string: newStr
                }
            };
        }

        return null;
    }

    if (toolCall.grep) {
        return {
            type: 'tool_use',
            id: tool_call_id,
            name: 'Grep',
            input: {
                pattern: toolCall.grep.queries?.[0] || '',
                path: toolCall.grep.path || ''
            }
        };
    }

    if (toolCall.file_glob_v2) {
        return {
            type: 'tool_use',
            id: tool_call_id,
            name: 'Glob',
            input: {
                pattern: toolCall.file_glob_v2.patterns?.[0] || '',
                path: toolCall.file_glob_v2.search_dir || ''
            }
        };
    }

    if (toolCall.file_glob) {
        return {
            type: 'tool_use',
            id: tool_call_id,
            name: 'Glob',
            input: {
                pattern: toolCall.file_glob.patterns?.[0] || '',
                path: toolCall.file_glob.path || ''
            }
        };
    }

    if (toolCall.search_codebase) {
        return {
            type: 'tool_use',
            id: tool_call_id,
            name: 'SearchCodebase',
            input: {
                query: toolCall.search_codebase.query || '',
                path_filters: toolCall.search_codebase.path_filters || [],
                codebase_path: toolCall.search_codebase.codebase_path || ''
            }
        };
    }

    if (toolCall.subagent) {
        let parsedPayload = {};
        try {
            parsedPayload = JSON.parse(toolCall.subagent.payload || '{}');
        } catch (e) {
            parsedPayload = { prompt: toolCall.subagent.payload };
        }
        return {
            type: 'tool_use',
            id: tool_call_id,
            name: 'Task',
            input: {
                task_id: toolCall.subagent.task_id || '',
                ...parsedPayload
            }
        };
    }

    if (toolCall.read_documents) {
        return {
            type: 'tool_use',
            id: tool_call_id,
            name: 'ReadDocuments',
            input: {
                documents: (toolCall.read_documents.documents || []).map(doc => ({
                    document_id: doc.document_id || '',
                    line_ranges: doc.line_ranges || []
                }))
            }
        };
    }

    if (toolCall.edit_documents) {
        return {
            type: 'tool_use',
            id: tool_call_id,
            name: 'EditDocuments',
            input: {
                diffs: (toolCall.edit_documents.diffs || []).map(diff => ({
                    document_id: diff.document_id || '',
                    old_string: diff.search || '',
                    new_string: diff.replace || ''
                }))
            }
        };
    }

    if (toolCall.create_documents) {
        // 将 create_documents 映射为 Write 工具（Claude Code 使用 Write 而非 CreateDocuments）
        const newDocs = toolCall.create_documents.new_documents || [];
        if (newDocs.length > 0) {
            const firstDoc = newDocs[0];
            // 尝试从 title 中提取文件路径
            // title 可能是 "Create file output.md" 或直接是文件路径 "output.md"
            let filePath = firstDoc.title || '';

            // 如果 title 包含 "Create file" 等前缀，提取实际文件名
            const createFileMatch = filePath.match(/(?:Create|Write|创建|写入)\s+(?:file\s+)?(.+)/i);
            if (createFileMatch) {
                filePath = createFileMatch[1].trim();
            }

            // 如果还是没有有效路径，使用 content 的前几个字符生成文件名或使用默认值
            if (!filePath || filePath.length === 0) {
                filePath = 'untitled.txt';
            }

            return {
                type: 'tool_use',
                id: tool_call_id,
                name: 'Write',
                input: {
                    file_path: filePath,
                    content: firstDoc.content || ''
                }
            };
        }
        // 如果没有 new_documents，返回 null（无效的工具调用）
        return null;
    }

    if (toolCall.write_to_long_running_shell_command) {
        return {
            type: 'tool_use',
            id: tool_call_id,
            name: 'WriteToShell',
            input: {
                input: toolCall.write_to_long_running_shell_command.input?.toString() || '',
                command_id: toolCall.write_to_long_running_shell_command.command_id || '',
                mode: toolCall.write_to_long_running_shell_command.mode?.raw ? 'raw' :
                      toolCall.write_to_long_running_shell_command.mode?.block ? 'block' : 'line'
            }
        };
    }

    if (toolCall.read_shell_command_output) {
        return {
            type: 'tool_use',
            id: tool_call_id,
            name: 'ReadShellOutput',
            input: {
                command_id: toolCall.read_shell_command_output.command_id || '',
                duration: toolCall.read_shell_command_output.duration?.seconds,
                wait_for_completion: !!toolCall.read_shell_command_output.on_completion
            }
        };
    }

    if (toolCall.suggest_plan) {
        return {
            type: 'tool_use',
            id: tool_call_id,
            name: 'Plan',
            input: {
                summary: toolCall.suggest_plan.summary || '',
                tasks: (toolCall.suggest_plan.proposed_tasks || []).map(task => ({
                    id: task.id || '',
                    description: task.description || ''
                }))
            }
        };
    }

    if (toolCall.use_computer) {
        return {
            type: 'tool_use',
            id: tool_call_id,
            name: 'computer',
            input: {
                actions: convertWarpActionsToClaudeActions(toolCall.use_computer.actions || []),
                action_summary: toolCall.use_computer.action_summary || ''
            }
        };
    }

    if (toolCall.request_computer_use) {
        return {
            type: 'tool_use',
            id: tool_call_id,
            name: 'RequestComputerUse',
            input: {
                task_summary: toolCall.request_computer_use.task_summary || ''
            }
        };
    }

    if (toolCall.read_mcp_resource) {
        return {
            type: 'tool_use',
            id: tool_call_id,
            name: 'ReadMCPResource',
            input: {
                uri: toolCall.read_mcp_resource.uri || '',
                server_id: toolCall.read_mcp_resource.server_id || ''
            }
        };
    }

    if (toolCall.read_skill) {
        return {
            type: 'tool_use',
            id: tool_call_id,
            name: 'Skill',
            input: {
                skill_path: toolCall.read_skill.skill_path || '',
                skill_name: toolCall.read_skill.skill_name || ''
            }
        };
    }

    if (toolCall.open_code_review) {
        return {
            type: 'tool_use',
            id: tool_call_id,
            name: 'OpenCodeReview',
            input: {}
        };
    }

    if (toolCall.insert_review_comments) {
        return {
            type: 'tool_use',
            id: tool_call_id,
            name: 'InsertReviewComments',
            input: {
                repo_path: toolCall.insert_review_comments.repo_path || '',
                comments: (toolCall.insert_review_comments.comments || []).map(c => ({
                    id: c.comment_id || '',
                    author: c.author || '',
                    timestamp: c.last_modified_timestamp || '',
                    content: c.comment_body || '',
                    parent_id: c.parent_comment_id || '',
                    location: c.location
                }))
            }
        };
    }

    if (toolCall.call_mcp_tool) {
        return {
            type: 'tool_use',
            id: tool_call_id,
            name: toolCall.call_mcp_tool.name || 'mcp__unknown',
            input: toolCall.call_mcp_tool.args || {}
        };
    }

    // 未知工具类型
    return null;
}

/**
 * 将 Warp Computer Use 动作转换为 Claude 格式
 * @param {Array} actions - Warp 动作数组
 * @returns {Array} Claude 格式的动作数组
 */
function convertWarpActionsToClaudeActions(actions) {
    return actions.map(action => {
        if (action.mouse_move) {
            return { type: 'mouse_move', x: action.mouse_move.to?.x || 0, y: action.mouse_move.to?.y || 0 };
        }
        if (action.mouse_down) {
            const buttonMap = { 0: 'left', 1: 'right', 2: 'middle' };
            return {
                type: 'click',
                button: buttonMap[action.mouse_down.button] || 'left',
                x: action.mouse_down.at?.x || 0,
                y: action.mouse_down.at?.y || 0
            };
        }
        if (action.mouse_wheel) {
            const directionMap = { 0: 'up', 1: 'down', 2: 'left', 3: 'right' };
            return {
                type: 'scroll',
                direction: directionMap[action.mouse_wheel.direction] || 'down',
                x: action.mouse_wheel.at?.x || 0,
                y: action.mouse_wheel.at?.y || 0,
                amount: action.mouse_wheel.pixels || action.mouse_wheel.clicks || 100
            };
        }
        if (action.type_text) {
            return { type: 'type', text: action.type_text.text || '' };
        }
        if (action.key_down) {
            return {
                type: 'key',
                key: action.key_down.key?.keycode || action.key_down.key?.char || ''
            };
        }
        if (action.wait) {
            return { type: 'wait', duration: action.wait.duration?.seconds || 1 };
        }
        return action;
    });
}

/**
 * 将 Claude tool_result 转换为 Warp ToolCallResult
 * 基于 PROBUG 提取的 task.proto 定义更新
 * @param {Object} toolResult - Claude tool_result 对象
 * @param {string} toolName - 工具名称
 * @returns {Object} Warp ToolCallResult 对象
 */
export function claudeToolResultToWarpResult(toolResult, toolName) {
    const { tool_use_id, content, is_error } = toolResult;
    const result = { tool_call_id: tool_use_id };

    // 将内容转换为字符串
    let contentStr = '';
    if (typeof content === 'string') {
        contentStr = content;
    } else if (Array.isArray(content)) {
        contentStr = content.map(c => c.text || c.content || '').join('\n');
    }

    switch (toolName) {
        case 'Bash':
            result.run_shell_command = {
                command: '',
                command_finished: {
                    output: contentStr,
                    exit_code: is_error ? 1 : 0
                }
            };
            break;

        case 'Read':
            if (is_error) {
                result.read_files = {
                    error: { message: contentStr }
                };
            } else {
                result.read_files = {
                    text_files_success: {
                        files: [{
                            file_path: '',
                            content: contentStr
                        }]
                    }
                };
            }
            break;

        case 'Write':
        case 'Edit':
            if (is_error) {
                result.apply_file_diffs = {
                    error: { message: contentStr }
                };
            } else {
                result.apply_file_diffs = {
                    success: {
                        updated_files_v2: []
                    }
                };
            }
            break;

        case 'Grep':
            if (is_error) {
                result.grep = {
                    error: { message: contentStr }
                };
            } else {
                result.grep = {
                    success: {
                        matched_files: []
                    }
                };
            }
            break;

        case 'Glob':
            if (is_error) {
                result.file_glob_v2 = {
                    error: { message: contentStr }
                };
            } else {
                result.file_glob_v2 = {
                    success: {
                        matched_files: []
                    }
                };
            }
            break;

        case 'SearchCodebase':
            if (is_error) {
                result.search_codebase = {
                    error: { message: contentStr }
                };
            } else {
                result.search_codebase = {
                    success: {
                        files: []
                    }
                };
            }
            break;

        case 'Task':
        case 'Subagent':
            result.subagent = {
                payload: contentStr
            };
            break;

        case 'ReadDocuments':
            if (is_error) {
                result.read_documents = {
                    error: { message: contentStr }
                };
            } else {
                result.read_documents = {
                    success: {
                        documents: []
                    }
                };
            }
            break;

        case 'EditDocuments':
            if (is_error) {
                result.edit_documents = {
                    error: { message: contentStr }
                };
            } else {
                result.edit_documents = {
                    success: {
                        updated_documents: []
                    }
                };
            }
            break;

        case 'CreateDocuments':
            if (is_error) {
                result.create_documents = {
                    error: { message: contentStr }
                };
            } else {
                result.create_documents = {
                    success: {
                        created_documents: []
                    }
                };
            }
            break;

        case 'WriteToShell':
            result.write_to_long_running_shell_command = {
                long_running_command_snapshot: {
                    output: contentStr
                }
            };
            break;

        case 'ReadShellOutput':
            result.read_shell_command_output = {
                command: '',
                long_running_command_snapshot: {
                    output: contentStr
                }
            };
            break;

        case 'Plan':
        case 'SuggestPlan':
            result.suggest_plan = {
                accepted: {}
            };
            break;

        case 'computer':
        case 'UseComputer':
            if (is_error) {
                result.use_computer = {
                    error: { message: contentStr }
                };
            } else {
                result.use_computer = {
                    success: {
                        // screenshot 和 cursor_position 需要从实际结果中提取
                    }
                };
            }
            break;

        case 'RequestComputerUse':
            result.request_computer_use = {
                approved: {}
            };
            break;

        case 'ReadMCPResource':
            if (is_error) {
                result.read_mcp_resource = {
                    error: { message: contentStr }
                };
            } else {
                result.read_mcp_resource = {
                    success: {
                        contents: [{
                            text: { content: contentStr }
                        }]
                    }
                };
            }
            break;

        case 'Skill':
        case 'ReadSkill':
            if (is_error) {
                result.read_skill = {
                    error: { message: contentStr }
                };
            } else {
                result.read_skill = {
                    success: {
                        content: {
                            file_path: '',
                            content: contentStr
                        }
                    }
                };
            }
            break;

        case 'OpenCodeReview':
            result.open_code_review = {};
            break;

        case 'InsertReviewComments':
            if (is_error) {
                result.insert_review_comments = {
                    error: { message: contentStr }
                };
            } else {
                result.insert_review_comments = {
                    success: {}
                };
            }
            break;

        default:
            // MCP 工具或其他
            if (is_error) {
                result.call_mcp_tool = {
                    error: { message: contentStr }
                };
            } else {
                result.call_mcp_tool = {
                    success: {
                        results: [{
                            text: { text: contentStr }
                        }]
                    }
                };
            }
            break;
    }

    return result;
}

/**
 * 检查命令是否为只读命令
 * @param {string} cmd - 命令字符串
 * @returns {boolean}
 */
export function isReadOnlyCommand(cmd) {
    if (!cmd) return true;

    const readOnlyPatterns = [
        /^ls\b/,
        /^cat\b/,
        /^head\b/,
        /^tail\b/,
        /^grep\b/,
        /^find\b/,
        /^pwd\b/,
        /^echo\b/,
        /^wc\b/,
        /^tree\b/,
        /^file\b/,
        /^stat\b/,
        /^du\b/,
        /^df/,
        /^which\b/,
        /^whereis\b/,
        /^type\b/,
        /^env\b/,
        /^printenv\b/,
        /^whoami\b/,
        /^id\b/,
        /^date\b/,
        /^uname\b/,
        /^hostname\b/,
        /^git\s+(status|log|diff|show|branch|remote|tag)\b/,
        /^npm\s+(list|ls|view|info|search)\b/,
        /^node\s+--version/,
        /^python\s+--version/,
    ];

    return readOnlyPatterns.some(p => p.test(cmd.trim()));
}

/**
 * 检查命令是否为危险命令
 * @param {string} cmd - 命令字符串
 * @returns {boolean}
 */
export function isRiskyCommand(cmd) {
    if (!cmd) return false;

    const riskyPatterns = [
        /\/,
        /\brm\s+.*\*/,
        /\bsudo\b/,
        /\bchmod\s+777\b/,
        /\bchown\b/,
        /\bmkfs\b/,
        /\bdd\b/,
        /\bformat\b/,
        /\bfdisk\b/,
        /\bparted\b/,
        /\b>\s*\/dev\//,
        /\bcurl\b.*\|\s*(ba)?sh/,
        /\bwget\b.*\|\s*(ba)?sh/,
        /\beval\b/,
        /\bexec\b/,
        /\bkill\s+-9\b/,
        /\bkillall\b/,
        /\bshutdown\b/,
        /\breboot\b/,
        /\binit\s+0\b/,
    ];

    return riskyPatterns.some(p => p.test(cmd));
}

/**
 * 从 Warp 工具调用中提取工具名称
 * 基于 PROBUG 提取的 task.proto 定义更新
 * @param {Object} toolCall - Warp ToolCall 对象
 * @returns {string} 工具名称
 */
export function getToolNameFromWarpToolCall(toolCall) {
    if (toolCall.run_shell_command) return 'Bash';
    if (toolCall.read_files) return 'Read';
    if (toolCall.apply_file_diffs) {
        // 根据内容判断是 Write 还是 Edit
        if (toolCall.apply_file_diffs.new_files?.length > 0) return 'Write';
        if (toolCall.apply_file_diffs.diffs?.length > 0) return 'Edit';
        if (toolCall.apply_file_diffs.v4a_updates?.length > 0) return 'Edit';
        if (toolCall.apply_file_diffs.deleted_files?.length > 0) return 'Delete';
        return 'Write';
    }
    if (toolCall.grep) return 'Grep';
    if (toolCall.file_glob_v2 || toolCall.file_glob) return 'Glob';
    if (toolCall.search_codebase) return 'SearchCodebase';
    if (toolCall.subagent) return 'Task';
    if (toolCall.read_documents) return 'ReadDocuments';
    if (toolCall.edit_documents) return 'EditDocuments';
    if (toolCall.create_documents) return 'Write';  // 映射为 Write 工具
    if (toolCall.write_to_long_running_shell_command) return 'WriteToShell';
    if (toolCall.read_shell_command_output) return 'ReadShellOutput';
    if (toolCall.suggest_plan) return 'Plan';
    if (toolCall.suggest_create_plan) return 'Plan';
    if (toolCall.use_computer) return 'computer';
    if (toolCall.request_computer_use) return 'RequestComputerUse';
    if (toolCall.read_mcp_resource) return 'ReadMCPResource';
    if (toolCall.call_mcp_tool) return toolCall.call_mcp_tool.name || 'mcp__unknown';
    if (toolCall.read_skill) return 'Skill';
    if (toolCall.open_code_review) return 'OpenCodeReview';
    if (toolCall.insert_review_comments) return 'InsertReviewComments';
    if (toolCall.suggest_new_conversation) return 'SuggestNewConversation';
    if (toolCall.suggest_prompt) return 'SuggestPrompt';
    if (toolCall.init_project) return 'InitProject';

    return 'unknown';
}

/**
 * 去除字符串中每行的行号前缀
 * 支持多种格式：
 * - "33|  <body>" -> "  <body>"
 * - "  33→content" -> "content"
 * - "33:content" -> "content" (仅当行首是数字时)
 * @param {string} str - 输入字符串
 * @returns {string} 去除行号后的字符串
 */
export function stripLineNumbers(str) {
    if (!str) return str;

    // 按行处理
    const lines = str.split('\n');
    const processedLines = lines.map(line => {
        // 匹配常见的行号格式：
        // 1. "数字|" 或 "数字→" 或 "数字:" 开头（可能有前导空格）
        // 2. "空格+数字+tab" 格式 (cat -n 输出格式)

        // 格式1: "33|content" 或 "33→content"
        let match = line.match(/^\s*\d+[|→]\s?(.*)$/);
        if (match) {
            return match[1];
        }

        // 格式2: "   33\tcontent" (cat -n 格式)
        match = line.match(/^\s*\d+\t(.*)$/);
        if (match) {
            return match[1];
        }

        // 格式3: "33:content" (仅当整行以数字开头)
        match = line.match(/^(\d+):(.*)$/);
        if (match) {
            return match[2];
        }

        // 没有匹配到行号格式，返回原行
        return line;
    });

    return processedLines.join('\n');
}

/**
 * 检测字符串的缩进风格
 * @param {string} str - 输入字符串
 * @returns {Object} { char: ' ' 或 '\t', size: 缩进大小 }
 */
export function detectIndentStyle(str) {
    if (!str) return { char: ' ', size: 2 };

    const lines = str.split('\n');
    const indentCounts = { spaces: {}, tabs: 0 };

    for (const line of lines) {
        if (!line.trim()) continue; // 跳过空行

        const match = line.match(/^(\s+)/);
        if (match) {
            const indent = match[1];
            if (indent.includes('\t')) {
                indentCounts.tabs++;
            } else {
                const len = indent.length;
                indentCounts.spaces[len] = (indentCounts.spaces[len] || 0) + 1;
            }
        }
    }

    // 如果主要使用 tab
    if (indentCounts.tabs > Object.values(indentCounts.spaces).reduce((a, b) => a + b, 0)) {
        return { char: '\t', size: 1 };
    }

    // 找出最常见的空格缩进
    const spaceCounts = Object.entries(indentCounts.spaces);
    if (spaceCounts.length === 0) return { char: ' ', size: 2 };

    // 计算最可能的基础缩进大小（通常是 2 或 4）
    const allIndents = spaceCounts.map(([len]) => parseInt(len)).sort((a, b) => a - b);

    // 尝试找出 GCD（最大公约数）作为基础缩进
    const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
    let baseIndent = allIndents[0];
    for (const indent of allIndents) {
        baseIndent = gcd(baseIndent, indent);
    }

    // 基础缩进通常是 2 或 4，如果计算出 1，则默认为 2
    if (baseIndent === 1 && allIndents.some(i => i >= 2)) {
        baseIndent = 2;
    }

    return { char: ' ', size: baseIndent || 2 };
}

/**
 * 规范化字符串的缩进
 * 将单空格缩进转换为双空格缩进（或其他目标缩进）
 * @param {string} str - 输入字符串
 * @param {number} targetIndent - 目标缩进大小（默认 2）
 * @returns {string} 规范化后的字符串
 */
export function normalizeIndent(str, targetIndent = 2) {
    if (!str) return str;

    const lines = str.split('\n');
    const sourceStyle = detectIndentStyle(str);

    // 如果源缩进已经是目标缩进，直接返回
    if (sourceStyle.char === ' ' && sourceStyle.size === targetIndent) {
        return str;
    }

    const processedLines = lines.map(line => {
        if (!line.trim()) return line; // 保留空行

        const match = line.match(/^(\s*)(.*)/);
        if (!match) return line;

        const [, indent, content] = match;
        if (!indent) return line;

        let indentLevel;
        if (sourceStyle.char === '\t') {
            // Tab 缩进：每个 tab 算一级
            indentLevel = indent.split('\t').length - 1;
        } else {
            // 空格缩进：计算缩进级别
            const spaceCount = indent.replace(/\t/g, '').length;
            indentLevel = Math.round(spaceCount / sourceStyle.size);
        }

        // 生成新的缩进
        const newIndent = ' '.repeat(indentLevel * targetIndent);
        return newIndent + content;
    });

    return processedLines.join('\n');
}
