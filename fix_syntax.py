#!/usr/bin/env python3
import sys

try:
    with open('iframe/jspcb/router.js', 'r', encoding='utf-8') as f:
        lines = f.readlines()

    fixed_lines = []
    for line in lines:
        if 'console.log([PCB] Complexity' in line:
            line = '\t\t\t\tconsole.log("[PCB] Complexity: " + level + ", Stage: " + stage + ", Success: " + (successRate * 100).toFixed(1) + "%");\n'
        elif 'console.log([PCB] Params - Clearance' in line:
            line = '\t\t\t\tconsole.log("[PCB] Params - Clearance: " + params.clearance.toFixed(2) + ", ViaCost: " + params.viaCost.toFixed(2));\n'
        fixed_lines.append(line)

    with open('iframe/jspcb/router.js', 'w', encoding='utf-8') as f:
        f.writelines(fixed_lines)

    print('修复成功！')
except Exception as e:
    print(f'错误: {e}')
    sys.exit(1)
