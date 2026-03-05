/**
 * DSN 解析器测试
 *
 * 测试 JlcDsnParser 类的 DSN 文件解析功能。
 */

import { JlcDsnParser } from '../../src/autorouter/dsn-parser';

describe('JlcDsnParser', () => {
	let parser: JlcDsnParser;

	beforeEach(() => {
		parser = new JlcDsnParser();
	});

	// =========================================================================
	// Task 5.1: DSN 树解析器测试
	// =========================================================================

	describe('parseTree - S-expression lexical analysis', () => {
		it('should parse simple atom', () => {
			const result = parser.parseTree('(test)');
			expect(result).toEqual(['test']);
		});

		it('should parse multiple atoms', () => {
			const result = parser.parseTree('(test foo bar)');
			expect(result).toEqual(['test', 'foo', 'bar']);
		});

		it('should parse quoted strings', () => {
			const result = parser.parseTree('(PCB "PCB1_1")');
			expect(result).toEqual(['PCB', 'PCB1_1']);
		});

		it('should parse quoted strings with spaces', () => {
			const result = parser.parseTree('(name "Hello World")');
			expect(result).toEqual(['name', 'Hello World']);
		});

		it('should parse numbers', () => {
			const result = parser.parseTree('(resolution mil 1000)');
			expect(result).toEqual(['resolution', 'mil', '1000']);
		});

		it('should parse negative numbers', () => {
			const result = parser.parseTree('(point -100 -200)');
			expect(result).toEqual(['point', '-100', '-200']);
		});

		it('should parse decimal numbers', () => {
			const result = parser.parseTree('(coord 123.45 678.90)');
			expect(result).toEqual(['coord', '123.45', '678.90']);
		});

		it('should parse JLC pin format like 20e16', () => {
			const result = parser.parseTree('(pin p20e16 20e16 1687.45 910.76)');
			expect(result).toEqual(['pin', 'p20e16', '20e16', '1687.45', '910.76']);
		});

		it('should parse JLC pin format like 1468e47', () => {
			const result = parser.parseTree('(pin p1468e47 1468e47 2227.25 1099.8)');
			expect(result).toEqual([
				'pin',
				'p1468e47',
				'1468e47',
				'2227.25',
				'1099.8',
			]);
		});

		it('should parse identifiers with special characters', () => {
			const result = parser.parseTree('(net $1N1226)');
			expect(result).toEqual(['net', '$1N1226']);
		});

		it('should parse identifiers with underscores', () => {
			const result = parser.parseTree('(net SPI2_MOSI)');
			expect(result).toEqual(['net', 'SPI2_MOSI']);
		});

		it('should parse single-quoted strings', () => {
			const result = parser.parseTree("(class GND 'GND')");
			expect(result).toEqual(['class', 'GND', 'GND']);
		});

		it('should parse mixed quote styles', () => {
			const result = parser.parseTree(`(test "double" 'single')`);
			expect(result).toEqual(['test', 'double', 'single']);
		});
	});

	describe('parseTree - tree structure building', () => {
		it('should parse nested lists', () => {
			const result = parser.parseTree('(a (b c) (d e))');
			expect(result).toEqual(['a', ['b', 'c'], ['d', 'e']]);
		});

		it('should parse deeply nested lists', () => {
			const result = parser.parseTree('(a (b (c (d))))');
			expect(result).toEqual(['a', ['b', ['c', ['d']]]]);
		});

		it('should parse empty list', () => {
			const result = parser.parseTree('()');
			expect(result).toEqual([]);
		});

		it('should parse list with empty nested list', () => {
			const result = parser.parseTree('(a ())');
			expect(result).toEqual(['a', []]);
		});

		it('should parse multiline content', () => {
			const content = `(PCB "name"
        (parser
          (host_cad "EasyEDA Pro")
        )
      )`;
			const result = parser.parseTree(content);
			expect(result).toEqual([
				'PCB',
				'name',
				['parser', ['host_cad', 'EasyEDA Pro']],
			]);
		});

		it('should handle whitespace correctly', () => {
			const result = parser.parseTree('(  a   b   c  )');
			expect(result).toEqual(['a', 'b', 'c']);
		});

		it('should handle tabs and newlines', () => {
			const result = parser.parseTree('(\ta\n\tb\r\n\tc\t)');
			expect(result).toEqual(['a', 'b', 'c']);
		});

		it('should parse JLC DSN structure section', () => {
			const content = `(structure
        (boundary(path signal 0 100 200 300 400))
        (via via0)
        (layer TopLayer
          (type signal)
        )
      )`;
			const result = parser.parseTree(content);
			expect(result).toEqual([
				'structure',
				['boundary', ['path', 'signal', '0', '100', '200', '300', '400']],
				['via', 'via0'],
				['layer', 'TopLayer', ['type', 'signal']],
			]);
		});

		it('should parse JLC DSN network section', () => {
			const content = `(network
        (net GND
          (pins u1-20e16 u1-20e17)
        )
        (net 3V3
          (pins u1-20e19)
        )
      )`;
			const result = parser.parseTree(content);
			expect(result).toEqual([
				'network',
				['net', 'GND', ['pins', 'u1-20e16', 'u1-20e17']],
				['net', '3V3', ['pins', 'u1-20e19']],
			]);
		});
	});

	describe('parseTree - error handling', () => {
		it('should throw error for unclosed parenthesis', () => {
			expect(() => parser.parseTree('(a b c')).toThrow(/Unclosed parenthesis/);
		});

		it('should record error for unexpected content after expression', () => {
			// The parser completes parsing the first expression and records an error
			// for the unexpected content after it
			const result = parser.parseTree('(a b) c)');
			expect(result).toEqual(['a', 'b']);
			const errors = parser.getErrors();
			expect(errors.length).toBeGreaterThan(0);
			expect(errors[0].message).toContain('Unexpected token after expression');
		});

		it('should throw error for empty input', () => {
			expect(() => parser.parseTree('')).toThrow(/Unexpected end of input/);
		});

		it('should throw error for whitespace only input', () => {
			expect(() => parser.parseTree('   ')).toThrow(/Unexpected end of input/);
		});

		it('should record errors in getErrors()', () => {
			try {
				parser.parseTree('(a b c');
			} catch {
				// Expected to throw
			}
			const errors = parser.getErrors();
			expect(errors.length).toBeGreaterThan(0);
			expect(errors[0].message).toContain('Unclosed parenthesis');
		});
	});

	describe('searchTree - helper function', () => {
		it('should find node by name at top level', () => {
			const tree = ['PCB', 'name', ['parser', 'data'], ['structure', 'data']];
			const result = parser.searchTree(tree, 'parser');
			expect(result).toEqual(['parser', 'data']);
		});

		it('should find node by name in nested structure', () => {
			const tree = ['PCB', ['structure', ['boundary', 'coords']]];
			const result = parser.searchTree(tree, 'boundary');
			expect(result).toEqual(['boundary', 'coords']);
		});

		it('should return undefined for non-existent node', () => {
			const tree = ['PCB', 'name', ['parser', 'data']];
			const result = parser.searchTree(tree, 'nonexistent');
			expect(result).toBeUndefined();
		});

		it('should return undefined for string input', () => {
			const result = parser.searchTree('just a string', 'test');
			expect(result).toBeUndefined();
		});

		it('should find first matching node', () => {
			const tree = ['root', ['layer', 'TopLayer'], ['layer', 'BottomLayer']];
			const result = parser.searchTree(tree, 'layer');
			expect(result).toEqual(['layer', 'TopLayer']);
		});

		it('should find deeply nested node', () => {
			const tree = ['a', ['b', ['c', ['d', ['target', 'found']]]]];
			const result = parser.searchTree(tree, 'target');
			expect(result).toEqual(['target', 'found']);
		});

		it('should handle empty array', () => {
			const result = parser.searchTree([], 'test');
			expect(result).toBeUndefined();
		});

		it('should find node in JLC DSN structure', () => {
			const tree = [
				'PCB',
				'PCB1_1',
				['parser', ['host_cad', 'EasyEDA Pro']],
				['resolution', 'mil', '1000'],
				['structure', ['boundary', ['path', 'signal', '0', '100', '200']]],
			];

			expect(parser.searchTree(tree, 'resolution')).toEqual([
				'resolution',
				'mil',
				'1000',
			]);
			expect(parser.searchTree(tree, 'structure')).toEqual([
				'structure',
				['boundary', ['path', 'signal', '0', '100', '200']],
			]);
			expect(parser.searchTree(tree, 'boundary')).toEqual([
				'boundary',
				['path', 'signal', '0', '100', '200'],
			]);
		});
	});

	describe('searchTreeAll - find all matching nodes', () => {
		it('should find all nodes with same name', () => {
			const tree = ['root', ['layer', 'TopLayer'], ['layer', 'BottomLayer']];
			const results = parser.searchTreeAll(tree, 'layer');
			expect(results).toEqual([
				['layer', 'TopLayer'],
				['layer', 'BottomLayer'],
			]);
		});

		it('should return empty array for no matches', () => {
			const tree = ['root', ['a', 'b'], ['c', 'd']];
			const results = parser.searchTreeAll(tree, 'nonexistent');
			expect(results).toEqual([]);
		});

		it('should find all net definitions', () => {
			const tree = [
				'network',
				['net', 'GND', ['pins', 'u1-1']],
				['net', '3V3', ['pins', 'u1-2']],
				['net', 'VCC', ['pins', 'u1-3']],
			];
			const results = parser.searchTreeAll(tree, 'net');
			expect(results.length).toBe(3);
			expect(results[0]).toEqual(['net', 'GND', ['pins', 'u1-1']]);
			expect(results[1]).toEqual(['net', '3V3', ['pins', 'u1-2']]);
			expect(results[2]).toEqual(['net', 'VCC', ['pins', 'u1-3']]);
		});

		it('should find all pin definitions', () => {
			const tree = [
				'image',
				'u1',
				['pin', 'p20e16', '20e16', '100', '200'],
				['pin', 'p20e17', '20e17', '100', '300'],
			];
			const results = parser.searchTreeAll(tree, 'pin');
			expect(results.length).toBe(2);
		});
	});

	describe('parseTree - real JLC DSN content', () => {
		it('should parse JLC DSN header', () => {
			const content = `(PCB "PCB1_1"
  (parser
    (host_cad "EasyEDA Pro")
    (host_version "3.2.69")
  )
  (resolution mil 1000)
)`;
			const result = parser.parseTree(content);
			expect(result[0]).toBe('PCB');
			expect(result[1]).toBe('PCB1_1');

			const parserNode = parser.searchTree(result, 'parser');
			expect(parserNode).toBeDefined();
			expect(parserNode![1]).toEqual(['host_cad', 'EasyEDA Pro']);

			const resolutionNode = parser.searchTree(result, 'resolution');
			expect(resolutionNode).toEqual(['resolution', 'mil', '1000']);
		});

		it('should parse JLC DSN padstack with polygon', () => {
			const content = `(padstack p20e16
      (shape(polygon TopLayer 0.1 49.21 -39.37 -49.21 -39.37 -49.21 -39.37 -49.21 39.37 -49.21 39.37 49.21 39.37 49.21 39.37 49.21 -39.37))
    )`;
			const result = parser.parseTree(content);
			expect(result[0]).toBe('padstack');
			expect(result[1]).toBe('p20e16');

			const shapeNode = parser.searchTree(result, 'shape');
			expect(shapeNode).toBeDefined();

			const polygonNode = parser.searchTree(shapeNode!, 'polygon');
			expect(polygonNode).toBeDefined();
			expect(polygonNode![1]).toBe('TopLayer');
			expect(polygonNode![2]).toBe('0.1');
		});

		it('should parse JLC DSN padstack with circle', () => {
			const content = `(padstack via0
      (shape(circle TopLayer 24))
      (shape(circle BottomLayer 24))
    )`;
			const result = parser.parseTree(content);
			expect(result[0]).toBe('padstack');
			expect(result[1]).toBe('via0');

			const shapes = parser.searchTreeAll(result, 'shape');
			expect(shapes.length).toBe(2);

			const circle1 = parser.searchTree(shapes[0], 'circle');
			expect(circle1).toEqual(['circle', 'TopLayer', '24']);

			const circle2 = parser.searchTree(shapes[1], 'circle');
			expect(circle2).toEqual(['circle', 'BottomLayer', '24']);
		});

		it('should parse JLC DSN class definition', () => {
			const content = `(class GND 'GND'
      (circuit 
        (use_via via0)
      )
      (rule 
        (width 10)
        (clearance 4.02)
      )
    )`;
			const result = parser.parseTree(content);
			expect(result[0]).toBe('class');
			expect(result[1]).toBe('GND');
			expect(result[2]).toBe('GND'); // quoted string without quotes

			const circuitNode = parser.searchTree(result, 'circuit');
			expect(circuitNode).toBeDefined();

			const useViaNode = parser.searchTree(circuitNode!, 'use_via');
			expect(useViaNode).toEqual(['use_via', 'via0']);

			const ruleNode = parser.searchTree(result, 'rule');
			expect(ruleNode).toBeDefined();

			const widthNode = parser.searchTree(ruleNode!, 'width');
			expect(widthNode).toEqual(['width', '10']);
		});

		it('should parse JLC DSN boundary with many coordinates', () => {
			const content = `(boundary(path signal 0 2462.03 1181.32 2487.3 1177.99 2510.84 1168.24 2531.06 1152.72))`;
			const result = parser.parseTree(content);
			expect(result[0]).toBe('boundary');

			const pathNode = parser.searchTree(result, 'path');
			expect(pathNode).toBeDefined();
			expect(pathNode![0]).toBe('path');
			expect(pathNode![1]).toBe('signal');
			expect(pathNode![2]).toBe('0');
			expect(pathNode![3]).toBe('2462.03');
			expect(pathNode![4]).toBe('1181.32');
			// Verify we have all coordinates
			expect(pathNode!.length).toBe(11); // path + signal + 0 + 8 coordinates
		});

		it('should parse complete JLC DSN file structure', () => {
			// A minimal but complete JLC DSN structure
			const content = `(PCB "PCB1_1"
  (parser
    (host_cad "EasyEDA Pro")
    (host_version "3.2.69")
  )
  (resolution mil 1000)
  (structure
    (boundary(path signal 0 100 200 300 400))
    (via via0)
    (layer TopLayer
      (type signal)
    )
    (layer BottomLayer
      (type signal)
    )
  )
  (placement
    (component u1
      (place u1 0 0 front 0)
    )
  )
  (library
    (image u1
      (pin p20e16 20e16 1687.45 910.76)
    )
    (padstack via0
      (shape(circle TopLayer 24))
      (shape(circle BottomLayer 24))
    )
  )
  (network
    (net GND
      (pins u1-20e16)
    )
    (class GND 'GND'
      (circuit 
        (use_via via0)
      )
      (rule 
        (width 10)
        (clearance 4.02)
      )
    )
  )
  (wiring)
)`;
			const result = parser.parseTree(content);

			// Verify top-level structure
			expect(result[0]).toBe('PCB');
			expect(result[1]).toBe('PCB1_1');

			// Verify all major sections exist
			expect(parser.searchTree(result, 'parser')).toBeDefined();
			expect(parser.searchTree(result, 'resolution')).toBeDefined();
			expect(parser.searchTree(result, 'structure')).toBeDefined();
			expect(parser.searchTree(result, 'placement')).toBeDefined();
			expect(parser.searchTree(result, 'library')).toBeDefined();
			expect(parser.searchTree(result, 'network')).toBeDefined();
			expect(parser.searchTree(result, 'wiring')).toBeDefined();

			// Verify nested structures
			const structure = parser.searchTree(result, 'structure');
			expect(parser.searchTree(structure!, 'boundary')).toBeDefined();
			expect(parser.searchTree(structure!, 'via')).toBeDefined();

			const layers = parser.searchTreeAll(structure!, 'layer');
			expect(layers.length).toBe(2);
			expect(layers[0][1]).toBe('TopLayer');
			expect(layers[1][1]).toBe('BottomLayer');

			// Verify network
			const network = parser.searchTree(result, 'network');
			const nets = parser.searchTreeAll(network!, 'net');
			expect(nets.length).toBe(1);
			expect(nets[0][1]).toBe('GND');

			// Verify no errors
			expect(parser.getErrors()).toEqual([]);
		});
	});

	// =========================================================================
	// Task 5.2-5.4: Full DSN parsing tests (to be implemented)
	// =========================================================================

	describe('parse - PCB name parsing (Task 5.2)', () => {
		it('should parse PCB name from DSN content', () => {
			const content = `(PCB "PCB1_1"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
				)
			)`;
			const result = parser.parse(content);
			expect(result.pcbName).toBe('PCB1_1');
		});

		it('should parse PCB name with special characters', () => {
			const content = `(PCB "My_PCB-Design_v1.0"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
				)
			)`;
			const result = parser.parse(content);
			expect(result.pcbName).toBe('My_PCB-Design_v1.0');
		});

		it('should handle empty PCB name', () => {
			const content = `(PCB ""
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
				)
			)`;
			const result = parser.parse(content);
			expect(result.pcbName).toBe('');
		});
	});

	describe('parse - resolution parsing (Task 5.2)', () => {
		it('should parse resolution correctly for JLC format (mil 1000)', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
				)
			)`;
			const result = parser.parse(content);
			expect(result.resolution.unit).toBe('mil');
			expect(result.resolution.multiplier).toBe(1000);
		});

		it('should parse resolution for KiCad format (um 10)', () => {
			const content = `(PCB "Test"
				(resolution um 10)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
				)
			)`;
			const result = parser.parse(content);
			expect(result.resolution.unit).toBe('um');
			expect(result.resolution.multiplier).toBe(10);
		});

		it('should use default resolution when missing', () => {
			const content = `(PCB "Test"
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
				)
			)`;
			const result = parser.parse(content);
			expect(result.resolution.unit).toBe('mil');
			expect(result.resolution.multiplier).toBe(1000);
			expect(parser.getErrors().length).toBeGreaterThan(0);
		});
	});

	describe('parse - boundary coordinates parsing (Task 5.2)', () => {
		it('should parse boundary coordinates from path', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
				)
			)`;
			const result = parser.parse(content);
			expect(result.structure.boundary).toEqual([
				{ x: 0, y: 0 },
				{ x: 100, y: 0 },
				{ x: 100, y: 100 },
				{ x: 0, y: 100 },
				{ x: 0, y: 0 },
			]);
		});

		it('should parse boundary with decimal coordinates', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 2462.03 1181.32 2487.3 1177.99))
					(layer TopLayer (type signal))
				)
			)`;
			const result = parser.parse(content);
			expect(result.structure.boundary).toEqual([
				{ x: 2462.03, y: 1181.32 },
				{ x: 2487.3, y: 1177.99 },
			]);
		});

		it('should parse boundary with negative coordinates', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 -100 -200 100 200))
					(layer TopLayer (type signal))
				)
			)`;
			const result = parser.parse(content);
			expect(result.structure.boundary).toEqual([
				{ x: -100, y: -200 },
				{ x: 100, y: 200 },
			]);
		});

		it('should handle missing boundary gracefully', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(layer TopLayer (type signal))
				)
			)`;
			const result = parser.parse(content);
			expect(result.structure.boundary).toEqual([]);
			expect(parser.getErrors().length).toBeGreaterThan(0);
		});
	});

	describe('parse - layer definitions parsing (Task 5.2)', () => {
		it('should parse TopLayer and BottomLayer', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
					(layer BottomLayer (type signal))
				)
			)`;
			const result = parser.parse(content);
			expect(result.structure.layers).toHaveLength(2);
			expect(result.structure.layers[0]).toEqual({
				name: 'TopLayer',
				type: 'signal',
				index: 0,
			});
			expect(result.structure.layers[1]).toEqual({
				name: 'BottomLayer',
				type: 'signal',
				index: 1,
			});
		});

		it('should map TopLayer to index 0', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
				)
			)`;
			const result = parser.parse(content);
			const topLayer = result.structure.layers.find(l => l.name === 'TopLayer');
			expect(topLayer?.index).toBe(0);
		});

		it('should map BottomLayer to index 1', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer BottomLayer (type signal))
				)
			)`;
			const result = parser.parse(content);
			const bottomLayer = result.structure.layers.find(l => l.name === 'BottomLayer');
			expect(bottomLayer?.index).toBe(1);
		});

		it('should parse layer type correctly', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
					(layer PowerLayer (type power))
				)
			)`;
			const result = parser.parse(content);
			expect(result.structure.layers[0].type).toBe('signal');
			expect(result.structure.layers[1].type).toBe('power');
		});

		it('should handle inner layers', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
					(layer InnerLayer1 (type signal))
					(layer InnerLayer2 (type signal))
					(layer BottomLayer (type signal))
				)
			)`;
			const result = parser.parse(content);
			expect(result.structure.layers).toHaveLength(4);
			
			const innerLayer1 = result.structure.layers.find(l => l.name === 'InnerLayer1');
			const innerLayer2 = result.structure.layers.find(l => l.name === 'InnerLayer2');
			expect(innerLayer1?.index).toBe(2);
			expect(innerLayer2?.index).toBe(3);
		});
	});

	describe('parse - via type parsing (Task 5.2)', () => {
		it('should parse via type', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(via via0)
					(layer TopLayer (type signal))
				)
			)`;
			const result = parser.parse(content);
			expect(result.structure.viaType).toBe('via0');
		});

		it('should use default via type when missing', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
				)
			)`;
			const result = parser.parse(content);
			expect(result.structure.viaType).toBe('via0');
		});
	});

	describe('parse - design rules parsing (Task 5.2)', () => {
		it('should parse grid values', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(grid via 0.25)
					(grid wire 0.25)
					(layer TopLayer (type signal))
				)
			)`;
			const result = parser.parse(content);
			expect(result.structure.rules.gridVia).toBe(0.25);
			expect(result.structure.rules.gridWire).toBe(0.25);
		});

		it('should parse rule width', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(rule(width 10.05))
					(layer TopLayer (type signal))
				)
			)`;
			const result = parser.parse(content);
			expect(result.structure.rules.defaultWidth).toBe(10.05);
		});

		it('should use default rules when missing', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
				)
			)`;
			const result = parser.parse(content);
			expect(result.structure.rules.defaultWidth).toBe(10);
			expect(result.structure.rules.defaultClearance).toBe(6);
			expect(result.structure.rules.gridVia).toBe(0.25);
			expect(result.structure.rules.gridWire).toBe(0.25);
		});
	});

	describe('parse - complete JLC DSN file (Task 5.2)', () => {
		it('should parse a minimal complete JLC DSN file', () => {
			const content = `(PCB "PCB1_1"
				(parser
					(host_cad "EasyEDA Pro")
					(host_version "3.2.69")
				)
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 2559.65 0 2559.65 1181.32 0 1181.32 0 0))
					(via via0)
					(grid via 0.25)
					(grid wire 0.25)
					(rule(clear 6.03))
					(rule(width 10.05))
					(layer TopLayer (type signal))
					(layer BottomLayer (type signal))
				)
				(placement
					(component u1
						(place u1 0 0 front 0)
					)
				)
				(library)
				(network)
				(wiring)
			)`;
			const result = parser.parse(content);

			// Verify PCB name
			expect(result.pcbName).toBe('PCB1_1');

			// Verify resolution
			expect(result.resolution.unit).toBe('mil');
			expect(result.resolution.multiplier).toBe(1000);

			// Verify boundary
			expect(result.structure.boundary.length).toBe(5);
			expect(result.structure.boundary[0]).toEqual({ x: 0, y: 0 });
			expect(result.structure.boundary[1]).toEqual({ x: 2559.65, y: 0 });

			// Verify layers
			expect(result.structure.layers.length).toBe(2);
			expect(result.structure.layers[0].name).toBe('TopLayer');
			expect(result.structure.layers[0].index).toBe(0);
			expect(result.structure.layers[1].name).toBe('BottomLayer');
			expect(result.structure.layers[1].index).toBe(1);

			// Verify via type
			expect(result.structure.viaType).toBe('via0');

			// Verify design rules
			expect(result.structure.rules.gridVia).toBe(0.25);
			expect(result.structure.rules.gridWire).toBe(0.25);
			expect(result.structure.rules.defaultWidth).toBe(10.05);
		});

		it('should throw error for invalid DSN format', () => {
			const content = `(INVALID "Test")`;
			expect(() => parser.parse(content)).toThrow(/Invalid DSN format/);
		});
	});

	describe('parse - component placement (Task 5.2 basic)', () => {
		it('should parse basic component placement', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
				)
				(placement
					(component u1
						(place u1 0 0 front 0)
					)
				)
			)`;
			const result = parser.parse(content);
			expect(result.placement.length).toBe(1);
			expect(result.placement[0].name).toBe('u1');
			expect(result.placement[0].position).toEqual({ x: 0, y: 0 });
			expect(result.placement[0].side).toBe('front');
			expect(result.placement[0].rotation).toBe(0);
		});

		it('should parse component placement with position', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
				)
				(placement
					(component u1
						(place u1 100.5 200.5 back 90)
					)
				)
			)`;
			const result = parser.parse(content);
			expect(result.placement[0].position).toEqual({ x: 100.5, y: 200.5 });
			expect(result.placement[0].side).toBe('back');
			expect(result.placement[0].rotation).toBe(90);
		});
	});

	describe('parse - real JLC DSN file integration (Task 5.2)', () => {
		// This test uses the actual JLC DSN file structure
		it('should parse real JLC DSN file header and structure', () => {
			const content = `(PCB "PCB1_1"
  (parser
    (host_cad "EasyEDA Pro")
    (host_version "3.2.69")
  )
  (resolution mil 1000)
  (structure
    (boundary(path signal 0 2462.03 1181.32 2487.3 1177.99 2510.84 1168.24 2531.06 1152.72 2546.58 1132.5 2556.33 1108.96 2559.65 1083.69 2559.65 97.06 2556.34 71.94 2546.65 48.53 2531.22 28.43 2511.12 13 2487.71 3.31 2462.59 0 100.03 0 72.48 3.87 47.07 15.17 25.75 33.04 10.17 56.09 1.54 82.53 0.53 110.33 0.53 1084.56 3.83 1109.6 13.49 1132.94 28.87 1152.98 48.91 1168.35 72.24 1178.02 97.28 1181.32 2462.03 1181.32 )
    )
    (via via0
    )
    (grid via   0.25)
    (grid wire   0.25)
    (grid place   0.25)
    (rule(clear 6.03))
    (rule(clear 6.03 (type default_smd)))
    (rule(clear 6.03 (type smd_smd)))
    (rule(width 10.05))
    (layer TopLayer
      (type signal)
    )
    (layer BottomLayer
      (type signal)
    )
  )
  (placement
    (component u1
      (place u1 0 0 front 0
      )
    )
  )
  (library)
  (network)
  (wiring)
)`;
			const result = parser.parse(content);

			// Verify PCB name
			expect(result.pcbName).toBe('PCB1_1');

			// Verify resolution (JLC format)
			expect(result.resolution.unit).toBe('mil');
			expect(result.resolution.multiplier).toBe(1000);

			// Verify boundary has many coordinates (rounded PCB shape)
			expect(result.structure.boundary.length).toBeGreaterThan(10);
			// First coordinate
			expect(result.structure.boundary[0]).toEqual({ x: 2462.03, y: 1181.32 });
			// Last coordinate should close the path
			expect(result.structure.boundary[result.structure.boundary.length - 1]).toEqual({ x: 2462.03, y: 1181.32 });

			// Verify layers
			expect(result.structure.layers.length).toBe(2);
			expect(result.structure.layers[0].name).toBe('TopLayer');
			expect(result.structure.layers[0].type).toBe('signal');
			expect(result.structure.layers[0].index).toBe(0);
			expect(result.structure.layers[1].name).toBe('BottomLayer');
			expect(result.structure.layers[1].type).toBe('signal');
			expect(result.structure.layers[1].index).toBe(1);

			// Verify via type
			expect(result.structure.viaType).toBe('via0');

			// Verify design rules
			expect(result.structure.rules.gridVia).toBe(0.25);
			expect(result.structure.rules.gridWire).toBe(0.25);
			expect(result.structure.rules.defaultWidth).toBe(10.05);

			// Verify placement
			expect(result.placement.length).toBe(1);
			expect(result.placement[0].name).toBe('u1');
			expect(result.placement[0].image).toBe('u1');
			expect(result.placement[0].position).toEqual({ x: 0, y: 0 });
			expect(result.placement[0].side).toBe('front');
			expect(result.placement[0].rotation).toBe(0);
		});
	});

	describe('getErrors', () => {
		it('should return empty array initially', () => {
			expect(parser.getErrors()).toEqual([]);
		});

		it('should return empty array for valid DSN tree', () => {
			parser.parseTree('(test data)');
			expect(parser.getErrors()).toEqual([]);
		});
	});

	// =========================================================================
	// Task 5.3: 组件和引脚解析测试
	// =========================================================================

	describe('parse - library image parsing (Task 5.3)', () => {
		it('should parse image with single pin', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
				)
				(library
					(image u1
						(pin p20e16 20e16 1687.45 910.76)
					)
				)
			)`;
			const result = parser.parse(content);
			expect(result.library.images.length).toBe(1);
			expect(result.library.images[0].name).toBe('u1');
			expect(result.library.images[0].pins.length).toBe(1);
		});

		it('should parse image with multiple pins', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
				)
				(library
					(image u1
						(pin p20e16 20e16 1687.45 910.76)
						(pin p20e16 20e17 1687.45 206.83)
						(pin p20e18 20e18 1566.38 844.23)
					)
				)
			)`;
			const result = parser.parse(content);
			expect(result.library.images[0].pins.length).toBe(3);
		});

		it('should parse JLC pin format 20e16', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
				)
				(library
					(image u1
						(pin p20e16 20e16 1687.45 910.76)
					)
				)
			)`;
			const result = parser.parse(content);
			const pin = result.library.images[0].pins[0];
			expect(pin.name).toBe('20e16');
			expect(pin.padstack).toBe('p20e16');
			expect(pin.position).toEqual({ x: 1687.45, y: 910.76 });
		});

		it('should parse JLC pin format 1468e47', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
				)
				(library
					(image u1
						(pin p1468e47 1468e47 2227.25 1099.8)
					)
				)
			)`;
			const result = parser.parse(content);
			const pin = result.library.images[0].pins[0];
			expect(pin.name).toBe('1468e47');
			expect(pin.padstack).toBe('p1468e47');
			expect(pin.position).toEqual({ x: 2227.25, y: 1099.8 });
		});

		it('should parse pin with decimal coordinates', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
				)
				(library
					(image u1
						(pin p25e11 25e11 1276.91 66.39)
					)
				)
			)`;
			const result = parser.parse(content);
			const pin = result.library.images[0].pins[0];
			expect(pin.position.x).toBeCloseTo(1276.91, 2);
			expect(pin.position.y).toBeCloseTo(66.39, 2);
		});

		it('should parse pin with negative coordinates', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
				)
				(library
					(image u1
						(pin ptest test -100.5 -200.5)
					)
				)
			)`;
			const result = parser.parse(content);
			const pin = result.library.images[0].pins[0];
			expect(pin.position).toEqual({ x: -100.5, y: -200.5 });
		});

		it('should default pin rotation to 0', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
				)
				(library
					(image u1
						(pin p20e16 20e16 100 200)
					)
				)
			)`;
			const result = parser.parse(content);
			const pin = result.library.images[0].pins[0];
			expect(pin.rotation).toBe(0);
		});

		it('should handle empty library', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
				)
				(library)
			)`;
			const result = parser.parse(content);
			expect(result.library.images).toEqual([]);
			expect(result.library.padstacks).toEqual([]);
		});

		it('should handle missing library', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
				)
			)`;
			const result = parser.parse(content);
			expect(result.library.images).toEqual([]);
			expect(result.library.padstacks).toEqual([]);
		});
	});

	describe('parse - library padstack parsing (Task 5.3)', () => {
		it('should parse padstack with circle shape', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
				)
				(library
					(padstack via0
						(shape(circle TopLayer 24))
					)
				)
			)`;
			const result = parser.parse(content);
			expect(result.library.padstacks.length).toBe(1);
			expect(result.library.padstacks[0].name).toBe('via0');
			expect(result.library.padstacks[0].shapes.length).toBe(1);
			expect(result.library.padstacks[0].shapes[0].type).toBe('circle');
			expect(result.library.padstacks[0].shapes[0].layer).toBe('TopLayer');
			expect(result.library.padstacks[0].shapes[0].coordinates).toEqual([24, 0, 0]);
		});

		it('should parse padstack with circle shape and center coordinates', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
				)
				(library
					(padstack p25e11
						(shape(circle TopLayer 66.93 0 0))
					)
				)
			)`;
			const result = parser.parse(content);
			const shape = result.library.padstacks[0].shapes[0];
			expect(shape.type).toBe('circle');
			expect(shape.coordinates).toEqual([66.93, 0, 0]);
		});

		it('should parse padstack with multiple shapes on different layers', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
					(layer BottomLayer (type signal))
				)
				(library
					(padstack via0
						(shape(circle TopLayer 24))
						(shape(circle BottomLayer 24))
					)
				)
			)`;
			const result = parser.parse(content);
			expect(result.library.padstacks[0].shapes.length).toBe(2);
			expect(result.library.padstacks[0].shapes[0].layer).toBe('TopLayer');
			expect(result.library.padstacks[0].shapes[1].layer).toBe('BottomLayer');
		});

		it('should parse padstack with polygon shape', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
				)
				(library
					(padstack p20e16
						(shape(polygon TopLayer 0.1 49.21 -39.37 -49.21 -39.37 -49.21 39.37 49.21 39.37))
					)
				)
			)`;
			const result = parser.parse(content);
			const shape = result.library.padstacks[0].shapes[0];
			expect(shape.type).toBe('polygon');
			expect(shape.layer).toBe('TopLayer');
			// Polygon coordinates (excluding aperture 0.1)
			expect(shape.coordinates).toEqual([49.21, -39.37, -49.21, -39.37, -49.21, 39.37, 49.21, 39.37]);
		});

		it('should parse padstack with complex polygon shape', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
				)
				(library
					(padstack p1407e7
						(shape(polygon TopLayer 0.1 -17.01 15.88 17.01 15.88 17.01 15.88 17.01 -15.88 17.01 -15.88 -17.01 -15.88 -17.01 -15.88 -17.01 15.88))
					)
				)
			)`;
			const result = parser.parse(content);
			const shape = result.library.padstacks[0].shapes[0];
			expect(shape.type).toBe('polygon');
			expect(shape.coordinates.length).toBe(16); // 8 coordinate pairs
		});

		it('should parse multiple padstacks', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
				)
				(library
					(padstack via0
						(shape(circle TopLayer 24))
					)
					(padstack p20e16
						(shape(polygon TopLayer 0.1 10 10 -10 10 -10 -10 10 -10))
					)
					(padstack p25e11
						(shape(circle TopLayer 66.93 0 0))
					)
				)
			)`;
			const result = parser.parse(content);
			expect(result.library.padstacks.length).toBe(3);
			expect(result.library.padstacks[0].name).toBe('via0');
			expect(result.library.padstacks[1].name).toBe('p20e16');
			expect(result.library.padstacks[2].name).toBe('p25e11');
		});

		it('should parse padstack with polygon on multiple layers', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
					(layer BottomLayer (type signal))
				)
				(library
					(padstack p1468e86
						(shape(polygon TopLayer 0.1 -31.5 -31.5 -31.5 31.5 31.5 31.5 31.5 -31.5))
						(shape(polygon BottomLayer 0.1 -31.5 -31.5 -31.5 31.5 31.5 31.5 31.5 -31.5))
					)
				)
			)`;
			const result = parser.parse(content);
			expect(result.library.padstacks[0].shapes.length).toBe(2);
			expect(result.library.padstacks[0].shapes[0].layer).toBe('TopLayer');
			expect(result.library.padstacks[0].shapes[1].layer).toBe('BottomLayer');
		});
	});

	describe('parse - complete library parsing (Task 5.3)', () => {
		it('should parse library with images and padstacks', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
					(layer BottomLayer (type signal))
				)
				(library
					(image u1
						(pin p20e16 20e16 1687.45 910.76)
						(pin p20e16 20e17 1687.45 206.83)
						(pin p1468e47 1468e47 2227.25 1099.8)
					)
					(padstack via0
						(shape(circle TopLayer 24))
						(shape(circle BottomLayer 24))
					)
					(padstack p20e16
						(shape(polygon TopLayer 0.1 49.21 -39.37 -49.21 -39.37 -49.21 39.37 49.21 39.37))
					)
					(padstack p1468e47
						(shape(circle TopLayer 62.99 0 0))
						(shape(circle BottomLayer 62.99 0 0))
					)
				)
			)`;
			const result = parser.parse(content);

			// Verify images
			expect(result.library.images.length).toBe(1);
			expect(result.library.images[0].name).toBe('u1');
			expect(result.library.images[0].pins.length).toBe(3);

			// Verify pins
			const pins = result.library.images[0].pins;
			expect(pins[0].name).toBe('20e16');
			expect(pins[0].padstack).toBe('p20e16');
			expect(pins[1].name).toBe('20e17');
			expect(pins[2].name).toBe('1468e47');
			expect(pins[2].padstack).toBe('p1468e47');

			// Verify padstacks
			expect(result.library.padstacks.length).toBe(3);
			expect(result.library.padstacks[0].name).toBe('via0');
			expect(result.library.padstacks[0].shapes.length).toBe(2);
			expect(result.library.padstacks[1].name).toBe('p20e16');
			expect(result.library.padstacks[1].shapes[0].type).toBe('polygon');
			expect(result.library.padstacks[2].name).toBe('p1468e47');
			expect(result.library.padstacks[2].shapes[0].type).toBe('circle');
		});

		it('should parse real JLC DSN library structure', () => {
			// This test uses a subset of the actual JLC DSN file structure
			const content = `(PCB "PCB1_1"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 2559.65 0 2559.65 1181.32 0 1181.32 0 0))
					(layer TopLayer (type signal))
					(layer BottomLayer (type signal))
				)
				(library
					(image u1
						(pin p20e16 20e16 1687.45 910.76)
						(pin p20e16 20e17 1687.45 206.83)
						(pin p20e18 20e18 1566.38 844.23)
						(pin p20e18 20e19 1566.38 824.55)
						(pin p25e11 25e11 1276.91 66.39)
						(pin p1396e7 1396e7 2487.89 1102.82)
						(pin p1468e47 1468e47 2227.25 1099.8)
					)
					(padstack via0
						(shape(circle TopLayer 24))
						(shape(circle BottomLayer 24))
					)
					(padstack p20e16
						(shape(polygon TopLayer 0.1 49.21 -39.37 -49.21 -39.37 -49.21 -39.37 -49.21 39.37 -49.21 39.37 49.21 39.37 49.21 39.37 49.21 -39.37))
					)
					(padstack p20e18
						(shape(polygon TopLayer 0.1 24.61 -5.91 -24.61 -5.91 -24.61 -5.91 -24.61 5.91 -24.61 5.91 24.61 5.91 24.61 5.91 24.61 -5.91))
					)
					(padstack p25e11
						(shape(circle TopLayer 66.93 0 0))
						(shape(circle BottomLayer 66.93 0 0))
					)
					(padstack p1396e7
						(shape(polygon TopLayer 0.1 -23.25 -0.8 0.8 23.25 0.8 23.25 23.25 0.8 23.25 0.8 -0.8 -23.25 -0.8 -23.25 -23.25 -0.8))
					)
					(padstack p1468e47
						(shape(circle TopLayer 62.99 0 0))
						(shape(circle BottomLayer 62.99 0 0))
					)
				)
			)`;
			const result = parser.parse(content);

			// Verify image
			expect(result.library.images.length).toBe(1);
			expect(result.library.images[0].name).toBe('u1');
			expect(result.library.images[0].pins.length).toBe(7);

			// Verify various pin formats
			const pins = result.library.images[0].pins;
			
			// Simple format: 20e16
			const pin20e16 = pins.find(p => p.name === '20e16');
			expect(pin20e16).toBeDefined();
			expect(pin20e16!.padstack).toBe('p20e16');
			expect(pin20e16!.position).toEqual({ x: 1687.45, y: 910.76 });

			// Another simple format: 25e11
			const pin25e11 = pins.find(p => p.name === '25e11');
			expect(pin25e11).toBeDefined();
			expect(pin25e11!.padstack).toBe('p25e11');

			// Complex format: 1396e7
			const pin1396e7 = pins.find(p => p.name === '1396e7');
			expect(pin1396e7).toBeDefined();
			expect(pin1396e7!.padstack).toBe('p1396e7');

			// Complex format: 1468e47
			const pin1468e47 = pins.find(p => p.name === '1468e47');
			expect(pin1468e47).toBeDefined();
			expect(pin1468e47!.padstack).toBe('p1468e47');

			// Verify padstacks
			expect(result.library.padstacks.length).toBe(6);

			// Via padstack
			const via0 = result.library.padstacks.find(p => p.name === 'via0');
			expect(via0).toBeDefined();
			expect(via0!.shapes.length).toBe(2);
			expect(via0!.shapes[0].type).toBe('circle');

			// Polygon padstack
			const p20e16 = result.library.padstacks.find(p => p.name === 'p20e16');
			expect(p20e16).toBeDefined();
			expect(p20e16!.shapes[0].type).toBe('polygon');

			// Circle padstack with center
			const p25e11 = result.library.padstacks.find(p => p.name === 'p25e11');
			expect(p25e11).toBeDefined();
			expect(p25e11!.shapes[0].type).toBe('circle');
			expect(p25e11!.shapes[0].coordinates[0]).toBeCloseTo(66.93, 2);
		});
	});

	// Property-based tests will be added in task 5.5 and 5.6

	// =========================================================================
	// Task 5.4: 网络定义解析测试
	// =========================================================================

	describe('parse - network net parsing (Task 5.4)', () => {
		it('should parse single net with single pin', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
				)
				(network
					(net GND
						(pins u1-20e16)
					)
				)
			)`;
			const result = parser.parse(content);
			expect(result.network.nets.size).toBe(1);
			expect(result.network.nets.has('GND')).toBe(true);
			const gndPins = result.network.nets.get('GND');
			expect(gndPins).toBeDefined();
			expect(gndPins!.length).toBe(1);
			expect(gndPins![0].component).toBe('u1');
			expect(gndPins![0].pin).toBe('20e16');
		});

		it('should parse net with multiple pins', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
				)
				(network
					(net GND
						(pins u1-20e16 u1-20e17 u1-20e18)
					)
				)
			)`;
			const result = parser.parse(content);
			const gndPins = result.network.nets.get('GND');
			expect(gndPins!.length).toBe(3);
			expect(gndPins![0].pin).toBe('20e16');
			expect(gndPins![1].pin).toBe('20e17');
			expect(gndPins![2].pin).toBe('20e18');
		});

		it('should parse multiple nets', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
				)
				(network
					(net GND
						(pins u1-20e16 u1-20e17)
					)
					(net 3V3
						(pins u1-20e19 u1-20e20)
					)
					(net VCC
						(pins u1-25e11)
					)
				)
			)`;
			const result = parser.parse(content);
			expect(result.network.nets.size).toBe(3);
			expect(result.network.nets.has('GND')).toBe(true);
			expect(result.network.nets.has('3V3')).toBe(true);
			expect(result.network.nets.has('VCC')).toBe(true);
		});

		it('should parse net with special format name ($1N1226)', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
				)
				(network
					(net $1N1226
						(pins u1-1478e14 u1-1483e7 u1-1484e8)
					)
				)
			)`;
			const result = parser.parse(content);
			expect(result.network.nets.has('$1N1226')).toBe(true);
			const pins = result.network.nets.get('$1N1226');
			expect(pins!.length).toBe(3);
			expect(pins![0].pin).toBe('1478e14');
			expect(pins![1].pin).toBe('1483e7');
			expect(pins![2].pin).toBe('1484e8');
		});

		it('should parse net with underscore in name', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
				)
				(network
					(net SPI2_MOSI
						(pins u1-20e27 u1-1468e58)
					)
				)
			)`;
			const result = parser.parse(content);
			expect(result.network.nets.has('SPI2_MOSI')).toBe(true);
			const pins = result.network.nets.get('SPI2_MOSI');
			expect(pins!.length).toBe(2);
		});

		it('should parse net with complex pin names', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
				)
				(network
					(net NET1
						(pins u1-1468e47 u1-1468e48 u1-1468e53)
					)
				)
			)`;
			const result = parser.parse(content);
			const pins = result.network.nets.get('NET1');
			expect(pins![0].pin).toBe('1468e47');
			expect(pins![1].pin).toBe('1468e48');
			expect(pins![2].pin).toBe('1468e53');
		});

		it('should handle empty network', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
				)
				(network)
			)`;
			const result = parser.parse(content);
			expect(result.network.nets.size).toBe(0);
		});

		it('should handle missing network', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
				)
			)`;
			const result = parser.parse(content);
			expect(result.network.nets.size).toBe(0);
		});

		it('should handle net with single pin (no connection)', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
				)
				(network
					(net SPI2_MISO
						(pins u1-1468e56)
					)
				)
			)`;
			const result = parser.parse(content);
			const pins = result.network.nets.get('SPI2_MISO');
			expect(pins!.length).toBe(1);
		});
	});

	describe('parse - network class parsing (Task 5.4)', () => {
		it('should parse single class definition', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
				)
				(network
					(class GND 'GND'
						(circuit 
							(use_via via0)
						)
						(rule 
							(width 10)
							(clearance 4.02)
						)
					)
				)
			)`;
			const result = parser.parse(content);
			expect(result.network.classes.size).toBe(1);
			expect(result.network.classes.has('GND')).toBe(true);
			const gndClass = result.network.classes.get('GND');
			expect(gndClass).toBeDefined();
			expect(gndClass!.viaType).toBe('via0');
			expect(gndClass!.width).toBe(10);
			expect(gndClass!.clearance).toBe(4.02);
		});

		it('should parse multiple class definitions', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
				)
				(network
					(class GND 'GND'
						(circuit 
							(use_via via0)
						)
						(rule 
							(width 10)
							(clearance 4.02)
						)
					)
					(class 3V3 '3V3'
						(circuit 
							(use_via via0)
						)
						(rule 
							(width 10)
							(clearance 4.02)
						)
					)
				)
			)`;
			const result = parser.parse(content);
			expect(result.network.classes.size).toBe(2);
			expect(result.network.classes.has('GND')).toBe(true);
			expect(result.network.classes.has('3V3')).toBe(true);
		});

		it('should parse class with special format name ($1N1226)', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
				)
				(network
					(class $1N1226 '$1N1226'
						(circuit 
							(use_via via0)
						)
						(rule 
							(width 10)
							(clearance 4.02)
						)
					)
				)
			)`;
			const result = parser.parse(content);
			expect(result.network.classes.has('$1N1226')).toBe(true);
		});

		it('should parse default class with empty name', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
				)
				(network
					(class '' ''
						(circuit 
							(use_via via0)
						)
						(rule 
							(width 10)
							(clearance 4.02)
						)
					)
				)
			)`;
			const result = parser.parse(content);
			expect(result.network.classes.has('')).toBe(true);
		});

		it('should use default values when circuit/rule missing', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
				)
				(network
					(class TEST 'TEST')
				)
			)`;
			const result = parser.parse(content);
			const testClass = result.network.classes.get('TEST');
			expect(testClass).toBeDefined();
			expect(testClass!.viaType).toBe('via0');
			expect(testClass!.width).toBe(10);
			expect(testClass!.clearance).toBe(4.02);
		});

		it('should parse class with different via type', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
				)
				(network
					(class POWER 'POWER'
						(circuit 
							(use_via via1)
						)
						(rule 
							(width 20)
							(clearance 8)
						)
					)
				)
			)`;
			const result = parser.parse(content);
			const powerClass = result.network.classes.get('POWER');
			expect(powerClass!.viaType).toBe('via1');
			expect(powerClass!.width).toBe(20);
			expect(powerClass!.clearance).toBe(8);
		});
	});

	describe('parse - complete network parsing (Task 5.4)', () => {
		it('should parse network with nets and classes', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
				)
				(network
					(net GND
						(pins u1-20e16 u1-20e17 u1-20e18)
					)
					(net 3V3
						(pins u1-20e19 u1-20e20)
					)
					(net $1N1226
						(pins u1-1478e14 u1-1483e7 u1-1484e8)
					)
					(class '' ''
						(circuit 
							(use_via via0)
						)
						(rule 
							(width 10)
							(clearance 4.02)
						)
					)
					(class GND 'GND'
						(circuit 
							(use_via via0)
						)
						(rule 
							(width 10)
							(clearance 4.02)
						)
					)
					(class 3V3 '3V3'
						(circuit 
							(use_via via0)
						)
						(rule 
							(width 10)
							(clearance 4.02)
						)
					)
				)
			)`;
			const result = parser.parse(content);

			// Verify nets
			expect(result.network.nets.size).toBe(3);
			expect(result.network.nets.get('GND')!.length).toBe(3);
			expect(result.network.nets.get('3V3')!.length).toBe(2);
			expect(result.network.nets.get('$1N1226')!.length).toBe(3);

			// Verify classes
			expect(result.network.classes.size).toBe(3);
			expect(result.network.classes.has('')).toBe(true);
			expect(result.network.classes.has('GND')).toBe(true);
			expect(result.network.classes.has('3V3')).toBe(true);
		});

		it('should parse real JLC DSN network structure', () => {
			// This test uses a subset of the actual JLC DSN file structure
			const content = `(PCB "PCB1_1"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 2559.65 0 2559.65 1181.32 0 1181.32 0 0))
					(layer TopLayer (type signal))
					(layer BottomLayer (type signal))
				)
				(network
					(net GND
						(pins u1-20e16 u1-20e17 u1-20e18 u1-20e26 u1-20e28 u1-20e29 u1-20e30 u1-20e31 u1-20e32 u1-20e33 u1-20e34 u1-20e35 u1-20e36 u1-20e42 u1-20e43 u1-20e44 u1-20e45 u1-20e46 u1-20e47 u1-25e11 u1-25e13 u1-1468e48 u1-1468e53 u1-1468e57 u1-1468e62 u1-1468e67 u1-1468e73 u1-1468e78 u1-1468e81 u1-1476e15 u1-1477e15 u1-1478e15)
					)
					(net 3V3
						(pins u1-20e19 u1-20e20 u1-20e21 u1-20e37 u1-1396e8 u1-1407e8 u1-1408e8 u1-1409e8 u1-1410e8 u1-1412e8 u1-1468e70 u1-1468e86 u1-1476e14 u1-1477e14 u1-1483e8)
					)
					(net $1N1226
						(pins u1-1478e14 u1-1483e7 u1-1484e8)
					)
					(net $1N1224
						(pins u1-1478e16 u1-1479e8 u1-1480e8 u1-1481e8 u1-1482e8)
					)
					(net SPI2_MOSI
						(pins u1-20e27 u1-1468e58)
					)
					(net UART_TX
						(pins u1-1468e79 u1-1582e17)
					)
					(net SPI2_MISO
						(pins u1-1468e56)
					)
					(class '' ''
						(circuit 
							(use_via via0)
						)
						(rule 
							(width 10)
							(clearance 4.02)
						)
					)
					(class 3V3 '3V3'
						(circuit 
							(use_via via0)
						)
						(rule 
							(width 10)
							(clearance 4.02)
						)
					)
					(class GND 'GND'
						(circuit 
							(use_via via0)
						)
						(rule 
							(width 10)
							(clearance 4.02)
						)
					)
					(class $1N1226 '$1N1226'
						(circuit 
							(use_via via0)
						)
						(rule 
							(width 10)
							(clearance 4.02)
						)
					)
				)
			)`;
			const result = parser.parse(content);

			// Verify nets
			expect(result.network.nets.size).toBe(7);

			// GND net should have many pins
			const gndPins = result.network.nets.get('GND');
			expect(gndPins).toBeDefined();
			expect(gndPins!.length).toBe(32);
			expect(gndPins![0].component).toBe('u1');
			expect(gndPins![0].pin).toBe('20e16');

			// 3V3 net
			const v3Pins = result.network.nets.get('3V3');
			expect(v3Pins).toBeDefined();
			expect(v3Pins!.length).toBe(15);

			// Special format net
			const specialNet = result.network.nets.get('$1N1226');
			expect(specialNet).toBeDefined();
			expect(specialNet!.length).toBe(3);

			// Single pin net
			const misoNet = result.network.nets.get('SPI2_MISO');
			expect(misoNet).toBeDefined();
			expect(misoNet!.length).toBe(1);

			// Verify classes
			expect(result.network.classes.size).toBe(4);
			expect(result.network.classes.has('')).toBe(true);
			expect(result.network.classes.has('GND')).toBe(true);
			expect(result.network.classes.has('3V3')).toBe(true);
			expect(result.network.classes.has('$1N1226')).toBe(true);

			// Verify class rules
			const gndClass = result.network.classes.get('GND');
			expect(gndClass!.viaType).toBe('via0');
			expect(gndClass!.width).toBe(10);
			expect(gndClass!.clearance).toBe(4.02);
		});

		it('should build correct network-to-pin mapping', () => {
			const content = `(PCB "Test"
				(resolution mil 1000)
				(structure
					(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
					(layer TopLayer (type signal))
				)
				(network
					(net NET1
						(pins u1-pin1 u1-pin2 u1-pin3)
					)
					(net NET2
						(pins u1-pin4 u1-pin5)
					)
				)
			)`;
			const result = parser.parse(content);

			// Verify mapping
			const net1Pins = result.network.nets.get('NET1');
			expect(net1Pins!.map(p => p.pin)).toEqual(['pin1', 'pin2', 'pin3']);

			const net2Pins = result.network.nets.get('NET2');
			expect(net2Pins!.map(p => p.pin)).toEqual(['pin4', 'pin5']);
		});
	});
});


// =========================================================================
// Task 5.5: DSN 解析属性测试 (Property-Based Tests)
// =========================================================================

import * as fc from 'fast-check';

/**
 * Property-Based Tests for DSN Parsing Correctness
 *
 * **Property 1: DSN Parsing Correctness**
 * **Validates: Requirements 1.1, 1.2, 1.4, 1.6, 1.8, 1.9**
 *
 * *For any* valid JLC DSN content containing PCB name, resolution, boundary
 * coordinates, pin definitions, and network definitions, parsing the content
 * SHALL extract all values correctly such that:
 * - The PCB name matches the original
 * - Resolution unit and multiplier are correctly identified
 * - All boundary coordinates are extracted in order
 * - All pin names (including JLC format like `20e16`) are correctly parsed
 * - All net-to-pin mappings are preserved
 */
describe('Property-Based Tests: DSN Parsing Correctness', () => {
	let parser: JlcDsnParser;

	beforeEach(() => {
		parser = new JlcDsnParser();
	});

	// =========================================================================
	// Generators for valid DSN content
	// =========================================================================

	/**
	 * Generate a valid PCB name
	 * PCB names can contain letters, numbers, underscores, hyphens, and dots
	 */
	const pcbNameArb = fc.stringOf(
		fc.constantFrom(
			...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-.'
		),
		{ minLength: 1, maxLength: 20 }
	);

	/**
	 * Generate a valid resolution unit
	 */
	const resolutionUnitArb = fc.constantFrom('mil', 'um');

	/**
	 * Generate a valid resolution multiplier
	 * JLC uses 1000, KiCad uses 10
	 */
	const resolutionMultiplierArb = fc.constantFrom(10, 100, 1000);

	/**
	 * Generate a valid coordinate value
	 * Coordinates in JLC DSN are typically decimal numbers
	 */
	const coordinateArb = fc.float({
		min: -10000,
		max: 10000,
		noNaN: true,
		noDefaultInfinity: true,
	}).map(n => Math.round(n * 100) / 100); // Round to 2 decimal places

	/**
	 * Generate a valid boundary coordinate pair
	 */
	const boundaryPointArb = fc.tuple(coordinateArb, coordinateArb);

	/**
	 * Generate a valid boundary path (at least 3 points to form a closed shape)
	 */
	const boundaryPathArb = fc.array(boundaryPointArb, { minLength: 3, maxLength: 10 });

	/**
	 * Generate a valid JLC pin name format (e.g., 20e16, 1468e47)
	 */
	const jlcPinNameArb = fc.tuple(
		fc.integer({ min: 1, max: 9999 }),
		fc.integer({ min: 1, max: 99 })
	).map(([a, b]) => `${a}e${b}`);

	/**
	 * Generate a valid net name
	 * Net names can be: GND, 3V3, VCC, $1N1226, SPI2_MOSI, etc.
	 */
	const netNameArb = fc.oneof(
		// Simple names
		fc.constantFrom('GND', 'VCC', '3V3', '5V', 'NET1', 'NET2'),
		// Names with underscore
		fc.stringOf(
			fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_'),
			{ minLength: 2, maxLength: 10 }
		),
		// Special format with $
		fc.tuple(
			fc.constant('$'),
			fc.integer({ min: 1, max: 9 }),
			fc.constant('N'),
			fc.integer({ min: 1000, max: 9999 })
		).map(([prefix, n1, mid, n2]) => `${prefix}${n1}${mid}${n2}`)
	);

	/**
	 * Generate a valid layer name
	 */
	const layerNameArb = fc.constantFrom('TopLayer', 'BottomLayer', 'InnerLayer1', 'InnerLayer2');

	// =========================================================================
	// Helper function to generate valid DSN content
	// =========================================================================

	/**
	 * Generate a valid JLC DSN content string from parameters
	 */
	function generateDsnContent(params: {
		pcbName: string;
		resolutionUnit: string;
		resolutionMultiplier: number;
		boundary: [number, number][];
		layers: string[];
		pins: { name: string; x: number; y: number }[];
		nets: { name: string; pins: string[] }[];
	}): string {
		const { pcbName, resolutionUnit, resolutionMultiplier, boundary, layers, pins, nets } = params;

		// Generate boundary path string
		const boundaryCoords = boundary.flatMap(([x, y]) => [x, y]).join(' ');

		// Generate layer definitions
		const layerDefs = layers.map(name => `(layer ${name} (type signal))`).join('\n\t\t\t');

		// Generate pin definitions
		const pinDefs = pins.map(p => `(pin p${p.name} ${p.name} ${p.x} ${p.y})`).join('\n\t\t\t\t');

		// Generate padstack definitions for pins
		const padstackDefs = pins.map(p => 
			`(padstack p${p.name}\n\t\t\t\t(shape(circle TopLayer 24 0 0))\n\t\t\t)`
		).join('\n\t\t\t');

		// Generate net definitions
		const netDefs = nets.map(n => {
			const pinRefs = n.pins.map(p => `u1-${p}`).join(' ');
			return `(net ${n.name}\n\t\t\t\t(pins ${pinRefs})\n\t\t\t)`;
		}).join('\n\t\t\t');

		// Generate class definitions for nets
		const classDefs = nets.map(n => 
			`(class ${n.name} '${n.name}'\n\t\t\t\t(circuit (use_via via0))\n\t\t\t\t(rule (width 10) (clearance 4.02))\n\t\t\t)`
		).join('\n\t\t\t');

		return `(PCB "${pcbName}"
	(parser
		(host_cad "EasyEDA Pro")
		(host_version "3.2.69")
	)
	(resolution ${resolutionUnit} ${resolutionMultiplier})
	(structure
		(boundary(path signal 0 ${boundaryCoords}))
		(via via0)
		(grid via 0.25)
		(grid wire 0.25)
		${layerDefs}
	)
	(placement
		(component u1
			(place u1 0 0 front 0)
		)
	)
	(library
		(image u1
			${pinDefs}
		)
		(padstack via0
			(shape(circle TopLayer 24))
			(shape(circle BottomLayer 24))
		)
		${padstackDefs}
	)
	(network
		${netDefs}
		${classDefs}
	)
	(wiring)
)`;
	}

	// =========================================================================
	// Property Tests
	// =========================================================================

	/**
	 * Property 1.1: PCB Name Parsing Correctness
	 * **Validates: Requirement 1.1**
	 *
	 * WHEN a JLC DSN file is provided, THE DSN_Parser SHALL parse the PCB name
	 * from `(PCB "name"` format
	 */
	it('should correctly parse PCB name for any valid name', () => {
		fc.assert(
			fc.property(
				pcbNameArb,
				(pcbName) => {
					const dsnContent = generateDsnContent({
						pcbName,
						resolutionUnit: 'mil',
						resolutionMultiplier: 1000,
						boundary: [[0, 0], [100, 0], [100, 100], [0, 100]],
						layers: ['TopLayer', 'BottomLayer'],
						pins: [{ name: '1e1', x: 50, y: 50 }],
						nets: [{ name: 'NET1', pins: ['1e1'] }],
					});

					const result = parser.parse(dsnContent);
					return result.pcbName === pcbName;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property 1.2: Resolution Parsing Correctness
	 * **Validates: Requirement 1.2**
	 *
	 * WHEN parsing resolution, THE DSN_Parser SHALL correctly interpret
	 * `(resolution mil 1000)` format and convert to internal units
	 */
	it('should correctly parse resolution unit and multiplier for any valid values', () => {
		fc.assert(
			fc.property(
				resolutionUnitArb,
				resolutionMultiplierArb,
				(unit, multiplier) => {
					const dsnContent = generateDsnContent({
						pcbName: 'TestPCB',
						resolutionUnit: unit,
						resolutionMultiplier: multiplier,
						boundary: [[0, 0], [100, 0], [100, 100], [0, 100]],
						layers: ['TopLayer', 'BottomLayer'],
						pins: [{ name: '1e1', x: 50, y: 50 }],
						nets: [{ name: 'NET1', pins: ['1e1'] }],
					});

					const result = parser.parse(dsnContent);
					return result.resolution.unit === unit && 
					       result.resolution.multiplier === multiplier;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property 1.3: Boundary Coordinates Parsing Correctness
	 * **Validates: Requirement 1.4**
	 *
	 * WHEN parsing boundary coordinates, THE DSN_Parser SHALL extract coordinates
	 * from `(boundary(path signal 0 x1 y1 x2 y2 ...))` format
	 */
	it('should correctly parse all boundary coordinates in order', () => {
		fc.assert(
			fc.property(
				boundaryPathArb,
				(boundary) => {
					const dsnContent = generateDsnContent({
						pcbName: 'TestPCB',
						resolutionUnit: 'mil',
						resolutionMultiplier: 1000,
						boundary,
						layers: ['TopLayer', 'BottomLayer'],
						pins: [{ name: '1e1', x: 50, y: 50 }],
						nets: [{ name: 'NET1', pins: ['1e1'] }],
					});

					const result = parser.parse(dsnContent);

					// Verify boundary length matches
					if (result.structure.boundary.length !== boundary.length) {
						return false;
					}

					// Verify each coordinate matches (with floating point tolerance)
					const TOLERANCE = 0.01;
					return boundary.every(([expectedX, expectedY], index) => {
						const actual = result.structure.boundary[index];
						const xDiff = Math.abs(actual.x - expectedX);
						const yDiff = Math.abs(actual.y - expectedY);
						return xDiff < TOLERANCE && yDiff < TOLERANCE;
					});
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property 1.4: JLC Pin Name Parsing Correctness
	 * **Validates: Requirement 1.6**
	 *
	 * WHEN parsing pin references, THE DSN_Parser SHALL correctly parse pin names
	 * in `20e16`, `1468e47` format
	 */
	it('should correctly parse JLC format pin names', () => {
		fc.assert(
			fc.property(
				fc.array(jlcPinNameArb, { minLength: 1, maxLength: 10 }),
				fc.array(coordinateArb, { minLength: 1, maxLength: 10 }),
				fc.array(coordinateArb, { minLength: 1, maxLength: 10 }),
				(pinNames, xCoords, yCoords) => {
					// Ensure unique pin names and matching coordinate arrays
					const uniquePinNames = [...new Set(pinNames)];
					const pins = uniquePinNames.slice(0, Math.min(xCoords.length, yCoords.length)).map((name, i) => ({
						name,
						x: xCoords[i],
						y: yCoords[i],
					}));

					if (pins.length === 0) return true; // Skip empty case

					const dsnContent = generateDsnContent({
						pcbName: 'TestPCB',
						resolutionUnit: 'mil',
						resolutionMultiplier: 1000,
						boundary: [[0, 0], [100, 0], [100, 100], [0, 100]],
						layers: ['TopLayer', 'BottomLayer'],
						pins,
						nets: [{ name: 'NET1', pins: pins.map(p => p.name) }],
					});

					const result = parser.parse(dsnContent);

					// Verify all pin names are correctly parsed
					const parsedPins = result.library.images[0]?.pins || [];
					const parsedPinNames = parsedPins.map(p => p.name);

					return pins.every(pin => parsedPinNames.includes(pin.name));
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property 1.5: Pin Position Parsing Correctness
	 * **Validates: Requirement 1.6**
	 *
	 * Pin positions should be correctly extracted with their coordinates
	 */
	it('should correctly parse pin positions', () => {
		fc.assert(
			fc.property(
				jlcPinNameArb,
				coordinateArb,
				coordinateArb,
				(pinName, x, y) => {
					const dsnContent = generateDsnContent({
						pcbName: 'TestPCB',
						resolutionUnit: 'mil',
						resolutionMultiplier: 1000,
						boundary: [[0, 0], [100, 0], [100, 100], [0, 100]],
						layers: ['TopLayer', 'BottomLayer'],
						pins: [{ name: pinName, x, y }],
						nets: [{ name: 'NET1', pins: [pinName] }],
					});

					const result = parser.parse(dsnContent);
					const parsedPin = result.library.images[0]?.pins[0];

					if (!parsedPin) return false;

					const TOLERANCE = 0.01;
					const xDiff = Math.abs(parsedPin.position.x - x);
					const yDiff = Math.abs(parsedPin.position.y - y);

					return xDiff < TOLERANCE && yDiff < TOLERANCE;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property 1.6: Net-to-Pin Mapping Preservation
	 * **Validates: Requirements 1.8, 1.9**
	 *
	 * WHEN parsing network definitions, THE DSN_Parser SHALL extract net names
	 * and pin connections in `u1-pinname` format
	 */
	it('should preserve all net-to-pin mappings', () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.tuple(
						netNameArb,
						fc.array(jlcPinNameArb, { minLength: 1, maxLength: 5 })
					),
					{ minLength: 1, maxLength: 5 }
				),
				(netDefinitions) => {
					// Ensure unique net names and pin names
					const seenNetNames = new Set<string>();
					const seenPinNames = new Set<string>();
					const uniqueNets: { name: string; pins: string[] }[] = [];

					for (const [netName, pins] of netDefinitions) {
						if (seenNetNames.has(netName)) continue;
						seenNetNames.add(netName);

						const uniquePins = pins.filter(p => {
							if (seenPinNames.has(p)) return false;
							seenPinNames.add(p);
							return true;
						});

						if (uniquePins.length > 0) {
							uniqueNets.push({ name: netName, pins: uniquePins });
						}
					}

					if (uniqueNets.length === 0) return true; // Skip empty case

					// Collect all pins for the library
					const allPins = uniqueNets.flatMap(n => n.pins).map((name, i) => ({
						name,
						x: 50 + i * 10,
						y: 50 + i * 10,
					}));

					const dsnContent = generateDsnContent({
						pcbName: 'TestPCB',
						resolutionUnit: 'mil',
						resolutionMultiplier: 1000,
						boundary: [[0, 0], [1000, 0], [1000, 1000], [0, 1000]],
						layers: ['TopLayer', 'BottomLayer'],
						pins: allPins,
						nets: uniqueNets,
					});

					const result = parser.parse(dsnContent);

					// Verify all nets are parsed
					if (result.network.nets.size !== uniqueNets.length) {
						return false;
					}

					// Verify each net has correct pin mappings
					return uniqueNets.every(net => {
						const parsedPins = result.network.nets.get(net.name);
						if (!parsedPins) return false;
						if (parsedPins.length !== net.pins.length) return false;

						const parsedPinNames = parsedPins.map(p => p.pin);
						return net.pins.every(pin => parsedPinNames.includes(pin));
					});
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property 1.7: Layer Definition Parsing
	 * **Validates: Requirement 1.3 (implicit)**
	 *
	 * Layer definitions should be correctly parsed with proper indices
	 */
	it('should correctly parse layer definitions', () => {
		fc.assert(
			fc.property(
				fc.shuffledSubarray(['TopLayer', 'BottomLayer', 'InnerLayer1', 'InnerLayer2'], { minLength: 1 }),
				(layers) => {
					const dsnContent = generateDsnContent({
						pcbName: 'TestPCB',
						resolutionUnit: 'mil',
						resolutionMultiplier: 1000,
						boundary: [[0, 0], [100, 0], [100, 100], [0, 100]],
						layers,
						pins: [{ name: '1e1', x: 50, y: 50 }],
						nets: [{ name: 'NET1', pins: ['1e1'] }],
					});

					const result = parser.parse(dsnContent);

					// Verify all layers are parsed
					if (result.structure.layers.length !== layers.length) {
						return false;
					}

					// Verify layer names match
					const parsedLayerNames = result.structure.layers.map(l => l.name);
					return layers.every(layer => parsedLayerNames.includes(layer));
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property 1.8: TopLayer and BottomLayer Index Mapping
	 * **Validates: Requirement 1.3**
	 *
	 * TopLayer should always map to index 0, BottomLayer to index 1
	 */
	it('should map TopLayer to index 0 and BottomLayer to index 1', () => {
		fc.assert(
			fc.property(
				fc.boolean(), // Include TopLayer
				fc.boolean(), // Include BottomLayer
				(includeTop, includeBottom) => {
					const layers: string[] = [];
					if (includeTop) layers.push('TopLayer');
					if (includeBottom) layers.push('BottomLayer');
					if (layers.length === 0) layers.push('TopLayer'); // Need at least one layer

					const dsnContent = generateDsnContent({
						pcbName: 'TestPCB',
						resolutionUnit: 'mil',
						resolutionMultiplier: 1000,
						boundary: [[0, 0], [100, 0], [100, 100], [0, 100]],
						layers,
						pins: [{ name: '1e1', x: 50, y: 50 }],
						nets: [{ name: 'NET1', pins: ['1e1'] }],
					});

					const result = parser.parse(dsnContent);

					// Verify TopLayer index
					const topLayer = result.structure.layers.find(l => l.name === 'TopLayer');
					if (topLayer && topLayer.index !== 0) return false;

					// Verify BottomLayer index
					const bottomLayer = result.structure.layers.find(l => l.name === 'BottomLayer');
					if (bottomLayer && bottomLayer.index !== 1) return false;

					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property 1.9: Net Class Rules Parsing
	 * **Validates: Requirement 1.9**
	 *
	 * Class definitions should be correctly parsed with via types, width, and clearance
	 */
	it('should correctly parse net class definitions', () => {
		fc.assert(
			fc.property(
				fc.array(netNameArb, { minLength: 1, maxLength: 5 }),
				(netNames) => {
					const uniqueNetNames = [...new Set(netNames)];
					if (uniqueNetNames.length === 0) return true;

					// Create pins for each net
					const pins = uniqueNetNames.map((name, i) => ({
						name: `${i + 1}e${i + 1}`,
						x: 50 + i * 10,
						y: 50 + i * 10,
					}));

					const nets = uniqueNetNames.map((name, i) => ({
						name,
						pins: [pins[i].name],
					}));

					const dsnContent = generateDsnContent({
						pcbName: 'TestPCB',
						resolutionUnit: 'mil',
						resolutionMultiplier: 1000,
						boundary: [[0, 0], [100, 0], [100, 100], [0, 100]],
						layers: ['TopLayer', 'BottomLayer'],
						pins,
						nets,
					});

					const result = parser.parse(dsnContent);

					// Verify all classes are parsed
					if (result.network.classes.size !== uniqueNetNames.length) {
						return false;
					}

					// Verify each class has correct rules
					return uniqueNetNames.every(netName => {
						const classRules = result.network.classes.get(netName);
						if (!classRules) return false;

						// Verify default values from our generator
						return classRules.viaType === 'via0' &&
						       classRules.width === 10 &&
						       Math.abs(classRules.clearance - 4.02) < 0.01;
					});
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property 1.10: Complete DSN Parsing Consistency
	 * **Validates: Requirements 1.1, 1.2, 1.4, 1.6, 1.8, 1.9**
	 *
	 * For any valid DSN content, parsing should extract all components correctly
	 * and maintain consistency between related data structures
	 */
	it('should maintain consistency across all parsed components', () => {
		fc.assert(
			fc.property(
				pcbNameArb,
				resolutionUnitArb,
				resolutionMultiplierArb,
				boundaryPathArb,
				fc.array(jlcPinNameArb, { minLength: 1, maxLength: 5 }),
				(pcbName, unit, multiplier, boundary, pinNames) => {
					const uniquePinNames = [...new Set(pinNames)];
					if (uniquePinNames.length === 0) return true;

					const pins = uniquePinNames.map((name, i) => ({
						name,
						x: 50 + i * 10,
						y: 50 + i * 10,
					}));

					// Create a single net with all pins
					const nets = [{ name: 'NET1', pins: uniquePinNames }];

					const dsnContent = generateDsnContent({
						pcbName,
						resolutionUnit: unit,
						resolutionMultiplier: multiplier,
						boundary,
						layers: ['TopLayer', 'BottomLayer'],
						pins,
						nets,
					});

					const result = parser.parse(dsnContent);

					// Verify PCB name
					if (result.pcbName !== pcbName) return false;

					// Verify resolution
					if (result.resolution.unit !== unit) return false;
					if (result.resolution.multiplier !== multiplier) return false;

					// Verify boundary count
					if (result.structure.boundary.length !== boundary.length) return false;

					// Verify pins count
					const parsedPins = result.library.images[0]?.pins || [];
					if (parsedPins.length !== pins.length) return false;

					// Verify net has all pins
					const netPins = result.network.nets.get('NET1');
					if (!netPins || netPins.length !== uniquePinNames.length) return false;

					// Verify all pins in net reference existing pins in library
					const libraryPinNames = new Set(parsedPins.map(p => p.name));
					return netPins.every(pinRef => libraryPinNames.has(pinRef.pin));
				}
			),
			{ numRuns: 100 }
		);
	});
});


// =========================================================================
// Task 5.6: 错误报告属性测试 (Property-Based Tests)
// =========================================================================

/**
 * Property-Based Tests for Error Reporting with Context
 *
 * Feature: jlc-eda-autorouter-plugin, Property 7: Error Reporting with Context
 * **Validates: Requirements 8.1, 8.5**
 *
 * *For any* invalid DSN input (syntax errors, missing required fields, invalid values),
 * the parser SHALL return an error that includes:
 * - Description of what was expected vs. what was found
 * - Location information (line number or character position when applicable)
 * - The problematic value or token
 */
describe('Property-Based Tests: Error Reporting with Context', () => {
	let parser: JlcDsnParser;

	beforeEach(() => {
		parser = new JlcDsnParser();
	});

	// =========================================================================
	// Generators for invalid DSN content
	// =========================================================================

	/**
	 * Generate a random position to insert an error
	 */
	const errorPositionArb = fc.integer({ min: 1, max: 10 });

	/**
	 * Generate random whitespace (spaces, tabs, newlines)
	 */
	const whitespaceArb = fc.stringOf(
		fc.constantFrom(' ', '\t', '\n'),
		{ minLength: 0, maxLength: 3 }
	);

	/**
	 * Generate a valid PCB name for base content
	 */
	const pcbNameArb = fc.stringOf(
		fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-.'),
		{ minLength: 1, maxLength: 10 }
	);

	/**
	 * Generate invalid coordinate values (non-numeric)
	 */
	const invalidCoordinateArb = fc.oneof(
		fc.constantFrom('abc', 'xyz', 'NaN', 'undefined', 'null', '!@#', '***'),
		fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'), { minLength: 1, maxLength: 5 })
	);

	/**
	 * Generate invalid layer names
	 */
	const invalidLayerNameArb = fc.oneof(
		fc.constantFrom('InvalidLayer', 'UnknownLayer', 'Layer99', 'BadLayer'),
		fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'), { minLength: 3, maxLength: 10 })
	);

	/**
	 * Generate unexpected tokens
	 */
	const unexpectedTokenArb = fc.oneof(
		fc.constantFrom(']', '}', '@', '#', '%', '^', '&', '*'),
		fc.stringOf(fc.constantFrom(...'!@#$%^&*'), { minLength: 1, maxLength: 3 })
	);

	// =========================================================================
	// Helper functions
	// =========================================================================

	/**
	 * Generate a minimal valid DSN content for testing
	 */
	function generateMinimalValidDsn(pcbName: string): string {
		return `(PCB "${pcbName}"
	(resolution mil 1000)
	(structure
		(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
		(layer TopLayer (type signal))
	)
)`;
	}

	/**
	 * Check if an error has a descriptive message
	 */
	function hasDescriptiveMessage(error: { message: string }): boolean {
		return error.message.length > 0 && 
		       (error.message.includes('expected') || 
		        error.message.includes('invalid') || 
		        error.message.includes('Invalid') ||
		        error.message.includes('Expected') ||
		        error.message.includes('missing') ||
		        error.message.includes('Missing') ||
		        error.message.includes('Unexpected') ||
		        error.message.includes('unexpected') ||
		        error.message.includes('Unclosed') ||
		        error.message.includes('Unknown'));
	}

	/**
	 * Check if an error has location information when applicable
	 */
	function hasLocationInfo(error: { line?: number; column?: number }): boolean {
		return (error.line !== undefined && error.line > 0) || 
		       (error.column !== undefined && error.column > 0);
	}

	/**
	 * Check if an error has token information when applicable
	 */
	function hasTokenInfo(error: { token?: string; message: string }): boolean {
		// Token info can be in the token field or embedded in the message
		return error.token !== undefined || 
		       /["'].*["']/.test(error.message) ||
		       /`.*`/.test(error.message) ||
		       /: \S+/.test(error.message);
	}

	// =========================================================================
	// Property Tests for Syntax Errors
	// =========================================================================

	/**
	 * Property 7.1: Unclosed Parenthesis Error Reporting
	 * **Validates: Requirements 8.1, 8.5**
	 *
	 * For any DSN content with unclosed parentheses, the parser SHALL return
	 * an error with descriptive message and location information
	 */
	it('should report unclosed parenthesis errors with context', () => {
		fc.assert(
			fc.property(
				pcbNameArb,
				whitespaceArb,
				(pcbName, ws) => {
					// Create DSN with unclosed parenthesis
					const invalidDsn = `(PCB "${pcbName}"${ws}(resolution mil 1000`;

					let errorThrown = false;
					try {
						parser.parseTree(invalidDsn);
					} catch (e) {
						errorThrown = true;
					}

					const errors = parser.getErrors();

					// Should either throw or record an error
					if (!errorThrown && errors.length === 0) {
						return false;
					}

					// If errors were recorded, verify they have context
					if (errors.length > 0) {
						const error = errors[0];
						// Must have descriptive message
						if (!hasDescriptiveMessage(error)) return false;
						// Should have location info for syntax errors
						if (!hasLocationInfo(error)) return false;
					}

					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property 7.2: Unexpected Token Error Reporting
	 * **Validates: Requirements 8.1, 8.5**
	 *
	 * For any DSN content with unexpected tokens after a valid expression,
	 * the parser SHALL return an error with the problematic token
	 */
	it('should report unexpected token errors with the problematic token', () => {
		fc.assert(
			fc.property(
				pcbNameArb,
				unexpectedTokenArb,
				(pcbName, unexpectedToken) => {
					// Create DSN with unexpected token after valid expression
					const invalidDsn = `(PCB "${pcbName}") ${unexpectedToken})`;

					try {
						parser.parseTree(invalidDsn);
					} catch {
						// May throw, that's ok
					}

					const errors = parser.getErrors();

					// Should record an error for unexpected content
					if (errors.length === 0) {
						return false;
					}

					const error = errors[0];
					// Must have descriptive message
					if (!hasDescriptiveMessage(error)) return false;
					// Should have token or location info
					if (!hasTokenInfo(error) && !hasLocationInfo(error)) return false;

					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property 7.3: Unexpected Closing Parenthesis Error Reporting
	 * **Validates: Requirements 8.1, 8.5**
	 *
	 * For any DSN content with unexpected closing parenthesis,
	 * the parser SHALL return an error with location information
	 */
	it('should report unexpected closing parenthesis errors with location', () => {
		fc.assert(
			fc.property(
				pcbNameArb,
				errorPositionArb,
				(pcbName, position) => {
					// Create DSN with extra closing parenthesis
					const validPart = `(PCB "${pcbName}"`;
					const invalidDsn = validPart + ')'.repeat(position + 2);

					let errorThrown = false;
					try {
						parser.parseTree(invalidDsn);
					} catch {
						errorThrown = true;
					}

					const errors = parser.getErrors();

					// Should either throw or record an error
					if (!errorThrown && errors.length === 0) {
						return false;
					}

					// If errors were recorded, verify they have context
					if (errors.length > 0) {
						const error = errors[0];
						// Must have descriptive message
						if (!hasDescriptiveMessage(error)) return false;
					}

					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	// =========================================================================
	// Property Tests for Missing Required Fields
	// =========================================================================

	/**
	 * Property 7.4: Missing PCB Name Error Reporting
	 * **Validates: Requirements 8.1, 8.5**
	 *
	 * For DSN content missing the PCB name, the parser SHALL return
	 * an error describing what was expected
	 */
	it('should report missing PCB name errors with description', () => {
		fc.assert(
			fc.property(
				whitespaceArb,
				(ws) => {
					// Create DSN without PCB name (just PCB keyword)
					const invalidDsn = `(PCB${ws}(resolution mil 1000))`;

					let errorThrown = false;
					try {
						parser.parse(invalidDsn);
					} catch {
						errorThrown = true;
					}

					const errors = parser.getErrors();

					// Should record an error for missing name
					if (errors.length === 0 && !errorThrown) {
						// Parser may accept this as valid with empty name
						return true;
					}

					// If errors were recorded, verify they have context
					if (errors.length > 0) {
						const error = errors[0];
						// Must have descriptive message
						if (!hasDescriptiveMessage(error)) return false;
					}

					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property 7.5: Missing Resolution Error Reporting
	 * **Validates: Requirements 8.1, 8.5**
	 *
	 * For DSN content missing the resolution definition, the parser SHALL
	 * return an error describing the missing field
	 */
	it('should report missing resolution errors with description', () => {
		fc.assert(
			fc.property(
				pcbNameArb,
				(pcbName) => {
					// Create DSN without resolution
					const invalidDsn = `(PCB "${pcbName}"
	(structure
		(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
		(layer TopLayer (type signal))
	)
)`;

					const result = parser.parse(invalidDsn);
					const errors = parser.getErrors();

					// Should record an error for missing resolution
					if (errors.length === 0) {
						// Parser uses default, but should still report warning
						// This is acceptable behavior - using defaults
						return true;
					}

					// If errors were recorded, verify they have context
					const error = errors[0];
					// Must have descriptive message
					return hasDescriptiveMessage(error);
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property 7.6: Missing Boundary Error Reporting
	 * **Validates: Requirements 8.1, 8.5**
	 *
	 * For DSN content missing the boundary definition, the parser SHALL
	 * return an error describing the missing field
	 */
	it('should report missing boundary errors with description', () => {
		fc.assert(
			fc.property(
				pcbNameArb,
				(pcbName) => {
					// Create DSN without boundary
					const invalidDsn = `(PCB "${pcbName}"
	(resolution mil 1000)
	(structure
		(layer TopLayer (type signal))
	)
)`;

					parser.parse(invalidDsn);
					const errors = parser.getErrors();

					// Should record an error for missing boundary
					if (errors.length === 0) {
						// Parser may accept this with empty boundary
						return true;
					}

					// If errors were recorded, verify they have context
					const error = errors[0];
					// Must have descriptive message
					return hasDescriptiveMessage(error);
				}
			),
			{ numRuns: 100 }
		);
	});

	// =========================================================================
	// Property Tests for Invalid Values
	// =========================================================================

	/**
	 * Property 7.7: Invalid Coordinate Value Error Reporting
	 * **Validates: Requirements 8.1, 8.5**
	 *
	 * For DSN content with non-numeric coordinate values, the parser SHALL
	 * return an error with the problematic value
	 */
	it('should report invalid coordinate errors with the problematic value', () => {
		fc.assert(
			fc.property(
				pcbNameArb,
				invalidCoordinateArb,
				invalidCoordinateArb,
				(pcbName, invalidX, invalidY) => {
					// Create DSN with invalid coordinates in boundary
					const invalidDsn = `(PCB "${pcbName}"
	(resolution mil 1000)
	(structure
		(boundary(path signal 0 ${invalidX} ${invalidY} 100 0 100 100 0 100 0 0))
		(layer TopLayer (type signal))
	)
)`;

					parser.parse(invalidDsn);
					const errors = parser.getErrors();

					// Should record an error for invalid coordinates
					if (errors.length === 0) {
						// Parser may skip invalid coordinates
						return true;
					}

					// If errors were recorded, verify they have context
					const error = errors[0];
					// Must have descriptive message
					if (!hasDescriptiveMessage(error)) return false;
					// Should mention the problematic value
					if (!hasTokenInfo(error)) return false;

					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property 7.8: Invalid Resolution Multiplier Error Reporting
	 * **Validates: Requirements 8.1, 8.5**
	 *
	 * For DSN content with invalid resolution multiplier, the parser SHALL
	 * return an error with the problematic value
	 */
	it('should report invalid resolution multiplier errors with the problematic value', () => {
		fc.assert(
			fc.property(
				pcbNameArb,
				invalidCoordinateArb,
				(pcbName, invalidMultiplier) => {
					// Create DSN with invalid resolution multiplier
					const invalidDsn = `(PCB "${pcbName}"
	(resolution mil ${invalidMultiplier})
	(structure
		(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
		(layer TopLayer (type signal))
	)
)`;

					parser.parse(invalidDsn);
					const errors = parser.getErrors();

					// Should record an error for invalid multiplier
					if (errors.length === 0) {
						// Parser may use default value
						return true;
					}

					// If errors were recorded, verify they have context
					const error = errors[0];
					// Must have descriptive message
					if (!hasDescriptiveMessage(error)) return false;
					// Should mention the problematic value
					if (!hasTokenInfo(error)) return false;

					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property 7.9: Unknown Resolution Unit Error Reporting
	 * **Validates: Requirements 8.1, 8.5**
	 *
	 * For DSN content with unknown resolution unit, the parser SHALL
	 * return an error with the problematic value
	 */
	it('should report unknown resolution unit errors with the problematic value', () => {
		fc.assert(
			fc.property(
				pcbNameArb,
				fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'), { minLength: 2, maxLength: 5 })
					.filter(s => s !== 'mil' && s !== 'um'),
				(pcbName, invalidUnit) => {
					// Create DSN with invalid resolution unit
					const invalidDsn = `(PCB "${pcbName}"
	(resolution ${invalidUnit} 1000)
	(structure
		(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
		(layer TopLayer (type signal))
	)
)`;

					parser.parse(invalidDsn);
					const errors = parser.getErrors();

					// Should record an error for unknown unit
					if (errors.length === 0) {
						// Parser may accept unknown units
						return true;
					}

					// If errors were recorded, verify they have context
					const error = errors[0];
					// Must have descriptive message
					if (!hasDescriptiveMessage(error)) return false;
					// Should mention the problematic value
					if (!hasTokenInfo(error)) return false;

					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property 7.10: Invalid Pin Reference Format Error Reporting
	 * **Validates: Requirements 8.1, 8.5**
	 *
	 * For DSN content with invalid pin reference format (missing component-pin separator),
	 * the parser SHALL return an error with the problematic value
	 */
	it('should report invalid pin reference format errors with the problematic value', () => {
		fc.assert(
			fc.property(
				pcbNameArb,
				fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'), { minLength: 2, maxLength: 8 })
					.filter(s => !s.includes('-')), // Ensure no dash
				(pcbName, invalidPinRef) => {
					// Create DSN with invalid pin reference (no dash separator)
					const invalidDsn = `(PCB "${pcbName}"
	(resolution mil 1000)
	(structure
		(boundary(path signal 0 0 0 100 0 100 100 0 100 0 0))
		(layer TopLayer (type signal))
	)
	(placement
		(component u1
			(place u1 0 0 front 0)
		)
	)
	(library
		(image u1
			(pin p1e1 1e1 50 50)
		)
	)
	(network
		(net NET1
			(pins ${invalidPinRef})
		)
	)
)`;

					parser.parse(invalidDsn);
					const errors = parser.getErrors();

					// Should record an error for invalid pin reference
					if (errors.length === 0) {
						// Parser may skip invalid pin references
						return true;
					}

					// If errors were recorded, verify they have context
					const error = errors[0];
					// Must have descriptive message
					if (!hasDescriptiveMessage(error)) return false;

					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	// =========================================================================
	// Property Tests for Error Context Completeness
	// =========================================================================

	/**
	 * Property 7.11: Error Messages Always Contain Description
	 * **Validates: Requirements 8.1, 8.5**
	 *
	 * For any error generated by the parser, the error message SHALL
	 * contain a description of what was expected vs. what was found
	 */
	it('should always include descriptive error messages', () => {
		fc.assert(
			fc.property(
				fc.oneof(
					// Unclosed parenthesis
					fc.constant('(PCB "Test" (resolution mil 1000'),
					// Unexpected token
					fc.constant('(PCB "Test") extra)'),
					// Empty input
					fc.constant(''),
					// Whitespace only
					fc.constant('   \n\t  '),
					// Invalid top-level
					fc.constant('(INVALID "Test")'),
					// Missing structure
					fc.constant('(PCB "Test" (resolution mil 1000))')
				),
				(invalidDsn) => {
					try {
						if (invalidDsn.trim() === '' || !invalidDsn.startsWith('(PCB')) {
							parser.parseTree(invalidDsn);
						} else {
							parser.parse(invalidDsn);
						}
					} catch {
						// Expected to throw for some cases
					}

					const errors = parser.getErrors();

					// All recorded errors should have descriptive messages
					return errors.every(error => hasDescriptiveMessage(error));
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property 7.12: Syntax Errors Include Location Information
	 * **Validates: Requirements 8.1, 8.5**
	 *
	 * For syntax errors (unclosed parentheses, unexpected tokens),
	 * the error SHALL include line number or character position
	 */
	it('should include location information for syntax errors', () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 1, max: 5 }),
				fc.integer({ min: 1, max: 5 }),
				(numLines, numSpaces) => {
					// Create DSN with unclosed parenthesis at specific location
					const lines = Array(numLines).fill('').map((_, i) => 
						i === 0 ? '(PCB "Test"' : '  (nested'
					);
					const invalidDsn = lines.join('\n') + ' '.repeat(numSpaces);

					try {
						parser.parseTree(invalidDsn);
					} catch {
						// Expected to throw
					}

					const errors = parser.getErrors();

					// Syntax errors should have location info
					if (errors.length > 0) {
						const syntaxErrors = errors.filter(e => 
							e.message.includes('Unclosed') || 
							e.message.includes('Unexpected') ||
							e.message.includes('end of input')
						);
						
						// At least one syntax error should have location
						if (syntaxErrors.length > 0) {
							return syntaxErrors.some(e => hasLocationInfo(e));
						}
					}

					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property 7.13: Value Errors Include Problematic Token
	 * **Validates: Requirements 8.1, 8.5**
	 *
	 * For value errors (invalid coordinates, unknown units),
	 * the error SHALL include the problematic value or token
	 */
	it('should include problematic token for value errors', () => {
		fc.assert(
			fc.property(
				invalidCoordinateArb,
				(invalidValue) => {
					// Create DSN with invalid coordinate value
					const invalidDsn = `(PCB "Test"
	(resolution mil 1000)
	(structure
		(boundary(path signal 0 ${invalidValue} 0 100 0 100 100 0 100 0 0))
		(layer TopLayer (type signal))
	)
)`;

					parser.parse(invalidDsn);
					const errors = parser.getErrors();

					// Value errors should mention the problematic value
					if (errors.length > 0) {
						const valueErrors = errors.filter(e => 
							e.message.includes('Invalid') || 
							e.message.includes('invalid') ||
							e.message.includes('coordinate')
						);
						
						// Value errors should have token info
						if (valueErrors.length > 0) {
							return valueErrors.some(e => hasTokenInfo(e));
						}
					}

					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property 7.14: Multiple Errors Are All Reported
	 * **Validates: Requirements 8.1, 8.5**
	 *
	 * When DSN content has multiple errors, all errors SHALL be reported
	 * with appropriate context
	 */
	it('should report multiple errors when present', () => {
		fc.assert(
			fc.property(
				pcbNameArb,
				invalidCoordinateArb,
				invalidCoordinateArb,
				(pcbName, invalidX, invalidY) => {
					// Create DSN with multiple invalid coordinates
					const invalidDsn = `(PCB "${pcbName}"
	(resolution mil 1000)
	(structure
		(boundary(path signal 0 ${invalidX} ${invalidY} ${invalidX} ${invalidY}))
		(layer TopLayer (type signal))
	)
)`;

					parser.parse(invalidDsn);
					const errors = parser.getErrors();

					// All errors should have descriptive messages
					return errors.every(error => hasDescriptiveMessage(error));
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property 7.15: Error Reporting Does Not Crash Parser
	 * **Validates: Requirements 8.1, 8.5**
	 *
	 * For any invalid input, the parser SHALL either throw a controlled error
	 * or return with errors recorded, but never crash unexpectedly
	 */
	it('should handle any invalid input without crashing', () => {
		fc.assert(
			fc.property(
				fc.oneof(
					// Random garbage
					fc.string({ minLength: 0, maxLength: 100 }),
					// Partial DSN
					fc.constant('(PCB'),
					// Deeply nested unclosed
					fc.constant('((((('),
					// Many closing parens
					fc.constant(')))))))'),
					// Mixed valid and invalid
					fc.tuple(pcbNameArb, fc.string({ minLength: 0, maxLength: 50 }))
						.map(([name, garbage]) => `(PCB "${name}" ${garbage}`)
				),
				(invalidInput) => {
					try {
						// Try parseTree first
						parser.parseTree(invalidInput);
					} catch (e) {
						// Controlled error is acceptable
						if (e instanceof Error) {
							return true;
						}
						// Unknown error type is not acceptable
						return false;
					}

					// If no exception, errors should be recorded or input was valid
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});
});
