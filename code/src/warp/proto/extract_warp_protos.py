#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Warp Proto Extractor - 一键从 Warp 二进制提取 Proto 定义

用法:
    python3 extract_warp_protos.py                    # 使用默认路径
    python3 extract_warp_protos.py /path/to/binary   # 指定二进制路径
    python3 extract_warp_protos.py --output ./protos # 指定输出目录

功能:
    1. 从 Warp 二进制中提取嵌入的 FileDescriptorProto
    2. 解码并生成可编译的 .proto 文件
    3. 生成消息类型汇总报告
    4. 与项目现有 proto 进行对比
"""
import argparse
import os
import re
import sys
import json
from datetime import datetime
from pathlib import Path


# ============================================================================
# Protobuf Wire Format 解析器
# ============================================================================

def read_varint(data: bytes, pos: int) -> tuple:
    """读取 varint 编码的整数"""
    result = 0
    shift = 0
    while True:
        if pos >= len(data):
            raise ValueError("Incomplete varint")
        b = data[pos]
        result |= (b & 0x7f) << shift
        pos += 1
        if not (b & 0x80):
            break
        shift += 7
    return result, pos


def read_length_delimited(data: bytes, pos: int) -> tuple:
    """读取长度分隔字段"""
    length, pos = read_varint(data, pos)
    return data[pos:pos + length], pos + length


def parse_field(data: bytes, pos: int) -> tuple:
    """解析单个 protobuf 字段，返回 (field_num, wire_type, value, new_pos)"""
    if pos >= len(data):
        return None, None, None, pos
    
    tag, new_pos = read_varint(data, pos)
    field_num = tag >> 3
    wire_type = tag & 0x7
    
    if wire_type == 0:  # Varint
        value, new_pos = read_varint(data, new_pos)
    elif wire_type == 1:  # 64-bit
        value = int.from_bytes(data[new_pos:new_pos + 8], 'little')
        new_pos += 8
    elif wire_type == 2:  # Length-delimited
        value, new_pos = read_length_delimited(data, new_pos)
    elif wire_type == 5:  # 32-bit
        value = int.from_bytes(data[new_pos:new_pos + 4], 'little')
        new_pos += 4
    else:
        raise ValueError(f"Unknown wire type {wire_type}")
    
    return field_num, wire_type, value, new_pos


def parse_message(data: bytes) -> dict:
    """将 protobuf 消息解析为字段字典"""
    result = {}
    pos = 0
    while pos < len(data):
        try:
            fn, wt, val, pos = parse_field(data, pos)
            if fn is None:
                break
            if fn not in result:
                result[fn] = []
            result[fn].append((wt, val))
        except:
            break
    return result


# ============================================================================
# FileDescriptorProto 解码器
# ============================================================================

def decode_field_descriptor(data: bytes) -> dict:
    """解码 FieldDescriptorProto"""
    fields = parse_message(data)
    result = {}
    
    if 1 in fields: result['name'] = fields[1][0][1].decode('utf-8', errors='replace')
    if 3 in fields: result['number'] = fields[3][0][1]
    if 4 in fields: result['label'] = fields[4][0][1]
    if 5 in fields: result['type'] = fields[5][0][1]
    if 6 in fields: result['type_name'] = fields[6][0][1].decode('utf-8', errors='replace')
    if 9 in fields: result['oneof_index'] = fields[9][0][1]
    
    return result


def decode_message_descriptor(data: bytes) -> dict:
    """解码 DescriptorProto (消息定义)"""
    fields = parse_message(data)
    result = {'name': '', 'fields': [], 'nested': [], 'enums': [], 'oneofs': []}
    
    if 1 in fields:
        result['name'] = fields[1][0][1].decode('utf-8', errors='replace')
    
    if 2 in fields:
        for _, fdata in fields[2]:
            result['fields'].append(decode_field_descriptor(fdata))
    
    if 3 in fields:
        for _, ndata in fields[3]:
            result['nested'].append(decode_message_descriptor(ndata))
    
    if 4 in fields:
        for _, edata in fields[4]:
            result['enums'].append(decode_enum_descriptor(edata))
    
    if 8 in fields:
        for _, odata in fields[8]:
            oneof_fields = parse_message(odata)
            if 1 in oneof_fields:
                result['oneofs'].append(oneof_fields[1][0][1].decode('utf-8', errors='replace'))
    
    return result


def decode_enum_descriptor(data: bytes) -> dict:
    """解码 EnumDescriptorProto"""
    fields = parse_message(data)
    result = {'name': '', 'values': []}
    
    if 1 in fields:
        result['name'] = fields[1][0][1].decode('utf-8', errors='replace')
    
    if 2 in fields:
        for _, vdata in fields[2]:
            vfields = parse_message(vdata)
            value = {'name': '', 'number': 0}
            if 1 in vfields: value['name'] = vfields[1][0][1].decode('utf-8', errors='replace')
            if 2 in vfields: value['number'] = vfields[2][0][1]
            result['values'].append(value)
    
    return result


def decode_file_descriptor(data: bytes) -> dict:
    """解码 FileDescriptorProto"""
    fields = parse_message(data)
    result = {
        'name': '',
        'package': '',
        'dependencies': [],
        'messages': [],
        'enums': [],
        'options': {}
    }
    
    if 1 in fields: result['name'] = fields[1][0][1].decode('utf-8', errors='replace')
    if 2 in fields: result['package'] = fields[2][0][1].decode('utf-8', errors='replace')
    
    if 3 in fields:
        for _, dep in fields[3]:
            result['dependencies'].append(dep.decode('utf-8', errors='replace'))
    
    if 4 in fields:
        for _, mdata in fields[4]:
            result['messages'].append(decode_message_descriptor(mdata))
    
    if 5 in fields:
        for _, edata in fields[5]:
            result['enums'].append(decode_enum_descriptor(edata))
    
    if 8 in fields:
        opt_fields = parse_message(fields[8][0][1])
        if 11 in opt_fields:
            result['options']['go_package'] = opt_fields[11][0][1].decode('utf-8', errors='replace')
    
    return result


# ============================================================================
# Proto 文件生成器
# ============================================================================

TYPE_NAMES = {
    1: 'double', 2: 'float', 3: 'int64', 4: 'uint64', 5: 'int32',
    6: 'fixed64', 7: 'fixed32', 8: 'bool', 9: 'string', 10: 'group',
    11: 'message', 12: 'bytes', 13: 'uint32', 14: 'enum', 
    15: 'sfixed32', 16: 'sfixed64', 17: 'sint32', 18: 'sint64'
}


def format_field(field: dict, in_oneof: bool = False) -> str:
    """格式化字段定义"""
    ftype = field.get('type', 0)
    
    if ftype in (11, 14):  # message or enum
        type_name = field.get('type_name', 'unknown').lstrip('.')
    else:
        type_name = TYPE_NAMES.get(ftype, f'unknown_{ftype}')
    
    label = field.get('label', 1)
    repeated = 'repeated ' if label == 3 and not in_oneof else ''
    
    return f'{repeated}{type_name} {field.get("name", "unknown")} = {field.get("number", 0)};'


def generate_enum(enum: dict, indent: int) -> list:
    """生成枚举定义"""
    prefix = '    ' * indent
    lines = [f'{prefix}enum {enum["name"]} {{']
    for v in enum['values']:
        lines.append(f'{prefix}    {v["name"]} = {v["number"]};')
    lines.append(f'{prefix}}}')
    return lines


def generate_message(msg: dict, indent: int) -> list:
    """递归生成消息定义"""
    prefix = '    ' * indent
    lines = [f'{prefix}message {msg["name"]} {{']
    
    for enum in msg['enums']:
        lines.extend(generate_enum(enum, indent + 1))
        lines.append('')
    
    for nested in msg['nested']:
        lines.extend(generate_message(nested, indent + 1))
        lines.append('')
    
    # 按 oneof 分组字段
    oneof_fields = {i: [] for i in range(len(msg['oneofs']))}
    regular_fields = []
    
    for field in msg['fields']:
        if 'oneof_index' in field:
            idx = field['oneof_index']
            if idx in oneof_fields:
                oneof_fields[idx].append(field)
            else:
                regular_fields.append(field)
        else:
            regular_fields.append(field)
    
    for field in regular_fields:
        lines.append(f'{prefix}    {format_field(field)}')
    
    for i, oneof_name in enumerate(msg['oneofs']):
        if oneof_fields.get(i):
            lines.append(f'{prefix}    oneof {oneof_name} {{')
            for field in oneof_fields[i]:
                lines.append(f'{prefix}        {format_field(field, in_oneof=True)}')
            lines.append(f'{prefix}    }}')
    
    lines.append(f'{prefix}}}')
    return lines


def generate_proto(fd: dict) -> str:
    """从解码的 FileDescriptor 生成 .proto 文件内容"""
    lines = []
    lines.append(f'// 从 Warp 二进制自动提取')
    lines.append(f'// 原始文件: {fd["name"]}')
    lines.append(f'// 提取时间: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')
    lines.append('')
    lines.append('syntax = "proto3";')
    lines.append('')
    lines.append(f'package {fd["package"]};')
    lines.append('')
    
    for dep in fd['dependencies']:
        lines.append(f'import "{dep}";')
    if fd['dependencies']:
        lines.append('')
    
    if fd['options'].get('go_package'):
        lines.append(f'option go_package = "{fd["options"]["go_package"]}";')
        lines.append('')
    
    for enum in fd['enums']:
        lines.extend(generate_enum(enum, 0))
        lines.append('')
    
    for msg in fd['messages']:
        lines.extend(generate_message(msg, 0))
        lines.append('')
    
    return '\n'.join(lines)


# ============================================================================
# 主提取逻辑
# ============================================================================

def find_proto_blocks(data: bytes) -> list:
    """在二进制中查找 proto 定义块"""
    # 查找 FileDescriptorProto 模式: 0x0a + length + name.proto + 0x12 + length + package
    pattern = rb'\x0a([\x08-\x40])([a-z_]+\.proto)\x12([\x10-\x30])(warp\.[a-z_]+\.v\d+)'
    
    # 首先找到所有 proto 文件的起始位置
    all_matches = list(re.finditer(pattern, data))
    
    results = []
    for i, match in enumerate(all_matches):
        start = match.start()
        proto_name = match.group(2).decode()
        package = match.group(4).decode()
        
        # 确定块的结束位置：下一个 proto 文件的开始或合理的最大值
        if i + 1 < len(all_matches):
            # 下一个 proto 文件的开始位置
            next_start = all_matches[i + 1].start()
            block_end = next_start
        else:
            # 最后一个文件，使用固定大小
            block_end = start + 50000
        
        # 限制最大块大小为 200KB
        block_end = min(block_end, start + 200000)
        
        block = data[start:block_end]
        results.append({
            'offset': start,
            'proto_name': proto_name,
            'package': package,
            'data': block,
            'size': len(block)
        })
    
    return results



def find_message_types(data: bytes) -> set:
    """查找所有消息类型名称"""
    msg_pattern = rb'warp\.multi_agent\.v1\.([A-Z][a-zA-Z0-9]+)'
    messages = set()
    
    for match in re.finditer(msg_pattern, data):
        msg_name = match.group(1).decode()
        # 过滤掉后缀 R, H, B (proto 编码标记)
        if len(msg_name) > 1 and not msg_name.endswith(('R', 'H', 'B')):
            messages.add(msg_name)
        elif len(msg_name) > 2:
            base = msg_name[:-1]
            if base and base[0].isupper():
                messages.add(base)
    
    return messages


def extract_protos(binary_path: str, output_dir: str) -> dict:
    """从二进制提取所有 proto 定义"""
    print(f"\n{'='*60}")
    print(f"Warp Proto Extractor")
    print(f"{'='*60}")
    print(f"二进制: {binary_path}")
    print(f"输出目录: {output_dir}")
    
    # 读取二进制
    print(f"\n[1/4] 读取二进制文件...")
    with open(binary_path, 'rb') as f:
        data = f.read()
    print(f"      大小: {len(data) / 1024 / 1024:.2f} MB")
    
    os.makedirs(output_dir, exist_ok=True)
    
    # 查找 proto 块
    print(f"\n[2/4] 搜索 Proto 定义块...")
    blocks = find_proto_blocks(data)
    print(f"      找到 {len(blocks)} 个 proto 文件")
    
    # 解码并生成 proto 文件
    print(f"\n[3/4] 解码并生成 .proto 文件...")
    extracted = []
    failed = []
    
    for block in blocks:
        proto_name = block['proto_name']
        try:
            fd = decode_file_descriptor(block['data'])
            proto_content = generate_proto(fd)
            
            output_path = os.path.join(output_dir, proto_name)
            with open(output_path, 'w') as f:
                f.write(proto_content)
            
            extracted.append({
                'name': proto_name,
                'package': fd['package'],
                'messages': len(fd['messages']),
                'enums': len(fd['enums']),
                'dependencies': fd['dependencies']
            })
            print(f"      ✅ {proto_name}: {len(fd['messages'])} messages, {len(fd['enums'])} enums")
            
        except Exception as e:
            failed.append({'name': proto_name, 'error': str(e)})
            print(f"      ❌ {proto_name}: {e}")
    
    # 生成消息类型汇总
    print(f"\n[4/4] 生成消息类型汇总...")
    message_types = find_message_types(data)
    
    # 保存汇总报告
    report = {
        'extracted_at': datetime.now().isoformat(),
        'binary_path': binary_path,
        'binary_size_mb': len(data) / 1024 / 1024,
        'proto_files': extracted,
        'failed_files': failed,
        'message_types': sorted(list(message_types)),
        'total_message_types': len(message_types)
    }
    
    report_path = os.path.join(output_dir, 'extraction_report.json')
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    
    # 生成 README
    readme_content = generate_readme(report)
    readme_path = os.path.join(output_dir, 'README.md')
    with open(readme_path, 'w') as f:
        f.write(readme_content)
    
    print(f"\n{'='*60}")
    print(f"提取完成!")
    print(f"{'='*60}")
    print(f"  成功: {len(extracted)} 个 proto 文件")
    print(f"  失败: {len(failed)} 个")
    print(f"  消息类型: {len(message_types)} 个")
    print(f"  报告: {report_path}")
    print(f"  README: {readme_path}")
    
    return report


def generate_readme(report: dict) -> str:
    """生成 README.md"""
    lines = [
        "# Warp Proto 定义 (自动提取)",
        "",
        f"提取时间: {report['extracted_at']}",
        f"二进制路径: `{report['binary_path']}`",
        f"二进制大小: {report['binary_size_mb']:.2f} MB",
        "",
        "## 提取的 Proto 文件",
        "",
        "| 文件 | 消息数 | 枚举数 | 依赖 |",
        "|------|--------|--------|------|"
    ]
    
    for pf in report['proto_files']:
        deps = ', '.join(pf['dependencies'][:3])
        if len(pf['dependencies']) > 3:
            deps += '...'
        lines.append(f"| `{pf['name']}` | {pf['messages']} | {pf['enums']} | {deps} |")
    
    if report['failed_files']:
        lines.extend([
            "",
            "## 提取失败",
            ""
        ])
        for ff in report['failed_files']:
            lines.append(f"- `{ff['name']}`: {ff['error']}")
    
    lines.extend([
        "",
        "## 发现的消息类型",
        "",
        f"共发现 {report['total_message_types']} 个消息类型:",
        "",
        "```"
    ])
    
    # 分列显示
    types = report['message_types']
    cols = 3
    for i in range(0, len(types), cols):
        row = types[i:i+cols]
        lines.append('  '.join(f'{t:<35}' for t in row))
    
    lines.extend([
        "```",
        "",
        "## 使用方法",
        "",
        "```bash",
        "# 重新提取最新定义",
        "python3 extract_warp_protos.py",
        "",
        "# 指定输出目录",
        "python3 extract_warp_protos.py --output ./new_protos",
        "",
        "# 指定二进制路径",
        "python3 extract_warp_protos.py /path/to/warp/binary",
        "```"
    ])
    
    return '\n'.join(lines)


def compare_with_existing(output_dir: str, existing_dir: str):
    """与现有 proto 定义对比"""
    print(f"\n[对比] 与现有定义对比...")
    print(f"       现有目录: {existing_dir}")
    
    if not os.path.exists(existing_dir):
        print(f"       ⚠️ 现有目录不存在，跳过对比")
        return
    
    new_files = set(f for f in os.listdir(output_dir) if f.endswith('.proto'))
    old_files = set(f for f in os.listdir(existing_dir) if f.endswith('.proto'))
    
    added = new_files - old_files
    removed = old_files - new_files
    common = new_files & old_files
    
    if added:
        print(f"       新增文件: {', '.join(added)}")
    if removed:
        print(f"       移除文件: {', '.join(removed)}")
    
    # 对比共同文件
    changed = []
    for f in common:
        new_path = os.path.join(output_dir, f)
        old_path = os.path.join(existing_dir, f)
        
        with open(new_path) as nf, open(old_path) as of:
            new_content = nf.read()
            old_content = of.read()
            
            # 忽略注释行的差异
            new_lines = [l for l in new_content.split('\n') if not l.strip().startswith('//')]
            old_lines = [l for l in old_content.split('\n') if not l.strip().startswith('//')]
            
            if new_lines != old_lines:
                changed.append(f)
    
    if changed:
        print(f"       内容变更: {', '.join(changed)}")
    else:
        print(f"       无内容变更")


# ============================================================================
# 命令行入口
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description='从 Warp 二进制提取 Proto 定义',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  %(prog)s                          # 使用默认路径
  %(prog)s /path/to/binary          # 指定二进制
  %(prog)s --output ./new_protos    # 指定输出目录
  %(prog)s --compare ../proto       # 与现有定义对比
        """
    )
    
    parser.add_argument(
        'binary',
        nargs='?',
        default='/Applications/Warp.app/Contents/MacOS/stable',
        help='Warp 二进制路径 (默认: /Applications/Warp.app/Contents/MacOS/stable)'
    )
    
    parser.add_argument(
        '--output', '-o',
        default=None,
        help='输出目录 (默认: ./extracted_protos_YYYYMMDD_HHMMSS)'
    )
    
    parser.add_argument(
        '--compare', '-c',
        default=None,
        help='与现有 proto 目录对比'
    )
    
    args = parser.parse_args()
    
    # 检查二进制是否存在
    if not os.path.exists(args.binary):
        print(f"❌ 二进制文件不存在: {args.binary}")
        sys.exit(1)
    
    # 设置输出目录
    if args.output:
        output_dir = args.output
    else:
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        output_dir = os.path.join(os.path.dirname(__file__), f'extracted_protos_{timestamp}')
    
    # 执行提取
    report = extract_protos(args.binary, output_dir)
    
    # 对比
    if args.compare:
        compare_with_existing(output_dir, args.compare)
    
    # 提示与项目 proto 对比
    project_proto = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'proto')
    if os.path.exists(project_proto) and not args.compare:
        print(f"\n💡 提示: 运行以下命令与项目 proto 对比:")
        print(f"   python3 {__file__} --compare {project_proto}")


if __name__ == "__main__":
    main()
