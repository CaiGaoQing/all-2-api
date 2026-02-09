# Warp Proto 定义 (自动提取)

提取时间: 2026-01-27T12:35:47.762818
二进制路径: `/Applications/Warp.app/Contents/MacOS/stable`
二进制大小: 260.29 MB

## 提取的 Proto 文件

| 文件 | 消息数 | 枚举数 | 依赖 |
|------|--------|--------|------|
| `options.proto` | 0 | 0 | google/protobuf/descriptor.proto |
| `suggestions.proto` | 3 | 0 |  |
| `citations.proto` | 1 | 1 |  |
| `file_content.proto` | 4 | 0 | options.proto |
| `document_content.proto` | 1 | 0 | options.proto, file_content.proto |
| `attachment.proto` | 12 | 0 | google/protobuf/empty.proto, document_content.proto, options.proto... |
| `input_context.proto` | 1 | 0 | google/protobuf/timestamp.proto, file_content.proto, attachment.proto... |
| `todo.proto` | 4 | 0 |  |
| `task.proto` | 36 | 2 | google/protobuf/empty.proto, google/protobuf/descriptor.proto, google/protobuf/struct.proto... |
| `response.proto` | 2 | 1 | google/protobuf/field_mask.proto, options.proto, suggestions.proto... |
| `request.proto` | 3 | 2 | google/protobuf/empty.proto, google/protobuf/struct.proto, input_context.proto... |
| `conversation_data.proto` | 1 | 0 | task.proto |

## 发现的消息类型

共发现 74 个消息类型:

```
AgentType                            AnyFileContent                       ApplyFileDiffsResult               
Attachment                           AutonomyLevel                        BaseRef                            
BinaryFileContent                    CallMCPToolResult                    Citation                           
ClientAction                         Coordinates                          CreateDocumentsResult              
CreateTodoList                       CurrentRef                           DiffHunk                           
DiffSet                              DocumentContent                      DocumentType                       
DriveObject                          EditDocumentsResult                  ExecutedShellCommand               
FileContent                          FileContentLineRange                 FileGlobResult                     
FileGlobV2Result                     GenericStringObject                  GrepResult                         
InitProjectResult                    InputContext                         InsertReviewCommentsResult         
IsolationLevel                       LLMProvider                          LongRunningShellCommandSnapshot    
MCPResourceContent                   MarkTodosCompleted                   Message                            
MessageMCP                           Notebook                             OpenCodeReviewResult               
PermissionDenied                     RawImage                             ReadDocumentsResult                
ReadFilesResult                      ReadMCPResourceResult                ReadShellCommandOutputResult       
ReadSkillResult                      Request                              RequestComputerUseResult           
ResponseEvent                        ReviewComment                        ReviewComments                     
RunShellCommandResult                RunningShellCommand                  ScreenDimensions                   
SearchCodebaseResult                 ShellCommandError                    ShellCommandFinished               
Skill                                SkillsContext                        SuggestCreatePlanResult            
SuggestNewConversationResult         SuggestPlanResult                    SuggestPromptResult                
SuggestedAgentModeWorkflow           SuggestedRule                        Suggestions                        
Task                                 TodoItem                             ToolType                           
UpdatePendingTodos                   UseComputerResult                    UserQueryMode                      
Workflow                             WriteToLongRunningShellCommandResult
```

## 使用方法

```bash
# 重新提取最新定义
python3 extract_warp_protos.py

# 指定输出目录
python3 extract_warp_protos.py --output ./new_protos

# 指定二进制路径
python3 extract_warp_protos.py /path/to/warp/binary
```