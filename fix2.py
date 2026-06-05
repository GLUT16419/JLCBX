#!/usr/bin/env python3
with open('iframe/jspcb/router.js', 'r', encoding='utf-8') as f:
    content = f.read()

old = '''			if (this.m_verbosity >= 1) {
				console.log(\[PCB] Complexity: \, Stage: \, Success: \%\);
				console.log(\[PCB] Params - Clearance: \, ViaCost: \);
			}'''

new = '''			if (this.m_verbosity >= 1) {
				console.log("[PCB] Complexity: " + level + ", Stage: " + stage + ", Success: " + (successRate * 100).toFixed(1) + "%");
				console.log("[PCB] Params - Clearance: " + params.clearance.toFixed(2) + ", ViaCost: " + params.viaCost.toFixed(2));
			}'''

content = content.replace(old, new)

with open('iframe/jspcb/router.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('Done!')
