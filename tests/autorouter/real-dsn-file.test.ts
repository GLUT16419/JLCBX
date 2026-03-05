/**
 * Real JLC DSN File Integration Test
 * 
 * This test verifies that the DSN parser can correctly parse the real JLC DSN file
 * located at JS-PCB-master/jlc-file/jlc输出.dsn
 * 
 * Checkpoint Task 6: DSN 解析器验证
 */

import * as fs from 'fs';
import * as path from 'path';
import { JlcDsnParser } from '../../src/autorouter/dsn-parser';

describe('Real JLC DSN File Integration Test', () => {
  let dsnContent: string;
  let parser: JlcDsnParser;

  beforeAll(() => {
    // Read the real JLC DSN file
    const dsnFilePath = path.resolve(__dirname, '../../../JS-PCB-master/jlc-file/jlc输出.dsn');
    dsnContent = fs.readFileSync(dsnFilePath, 'utf-8');
    parser = new JlcDsnParser();
  });

  describe('File Loading', () => {
    it('should successfully load the JLC DSN file', () => {
      expect(dsnContent).toBeDefined();
      expect(dsnContent.length).toBeGreaterThan(0);
    });

    it('should contain expected JLC DSN structure', () => {
      expect(dsnContent).toContain('(PCB "PCB1_1"');
      expect(dsnContent).toContain('(resolution mil 1000)');
      expect(dsnContent).toContain('(host_cad "EasyEDA Pro")');
    });
  });

  describe('DSN Parsing', () => {
    let parsedData: ReturnType<JlcDsnParser['parse']>;

    beforeAll(() => {
      parsedData = parser.parse(dsnContent);
    });

    it('should parse without errors', () => {
      const errors = parser.getErrors();
      expect(errors).toHaveLength(0);
    });

    it('should correctly parse PCB name', () => {
      expect(parsedData.pcbName).toBe('PCB1_1');
    });

    it('should correctly parse resolution (mil 1000)', () => {
      expect(parsedData.resolution.unit).toBe('mil');
      expect(parsedData.resolution.multiplier).toBe(1000);
    });

    it('should correctly parse layer definitions', () => {
      const { layers } = parsedData.structure;
      expect(layers.length).toBeGreaterThanOrEqual(2);
      
      // Find TopLayer and BottomLayer
      const topLayer = layers.find(l => l.name === 'TopLayer');
      const bottomLayer = layers.find(l => l.name === 'BottomLayer');
      
      expect(topLayer).toBeDefined();
      expect(topLayer?.index).toBe(0);
      expect(topLayer?.type).toBe('signal');
      
      expect(bottomLayer).toBeDefined();
      expect(bottomLayer?.index).toBe(1);
      expect(bottomLayer?.type).toBe('signal');
    });

    it('should correctly parse boundary coordinates', () => {
      const { boundary } = parsedData.structure;
      expect(boundary.length).toBeGreaterThan(0);
      
      // First coordinate should be approximately (2462.03, 1181.32)
      expect(boundary[0].x).toBeCloseTo(2462.03, 1);
      expect(boundary[0].y).toBeCloseTo(1181.32, 1);
    });

    it('should correctly parse via type', () => {
      expect(parsedData.structure.viaType).toBe('via0');
    });

    it('should correctly parse design rules', () => {
      const { rules } = parsedData.structure;
      expect(rules.gridVia).toBe(0.25);
      expect(rules.gridWire).toBe(0.25);
      expect(rules.defaultClearance).toBe(6.03);
      expect(rules.defaultWidth).toBe(10.05);
    });

    it('should correctly parse component placement (u1)', () => {
      const placement = parsedData.placement;
      expect(placement.length).toBeGreaterThan(0);
      
      const u1 = placement.find(c => c.name === 'u1');
      expect(u1).toBeDefined();
      expect(u1?.position.x).toBe(0);
      expect(u1?.position.y).toBe(0);
    });
  });

  describe('Library Parsing', () => {
    let parsedData: ReturnType<JlcDsnParser['parse']>;

    beforeAll(() => {
      parsedData = parser.parse(dsnContent);
    });

    it('should parse image with pins', () => {
      const { images } = parsedData.library;
      expect(images.length).toBeGreaterThan(0);
      
      const u1Image = images.find(img => img.name === 'u1');
      expect(u1Image).toBeDefined();
      expect(u1Image?.pins.length).toBeGreaterThan(0);
    });

    it('should correctly parse JLC pin format (20e16, 1468e47)', () => {
      const { images } = parsedData.library;
      const u1Image = images.find(img => img.name === 'u1');
      
      // Check for pin 20e16
      const pin20e16 = u1Image?.pins.find(p => p.name === '20e16');
      expect(pin20e16).toBeDefined();
      expect(pin20e16?.position.x).toBeCloseTo(1687.45, 1);
      expect(pin20e16?.position.y).toBeCloseTo(910.76, 1);
      
      // Check for pin 1468e47
      const pin1468e47 = u1Image?.pins.find(p => p.name === '1468e47');
      expect(pin1468e47).toBeDefined();
      expect(pin1468e47?.position.x).toBeCloseTo(2227.25, 1);
      expect(pin1468e47?.position.y).toBeCloseTo(1099.8, 1);
    });

    it('should parse padstack definitions', () => {
      const { padstacks } = parsedData.library;
      expect(padstacks.length).toBeGreaterThan(0);
      
      // Check for via0 padstack
      const via0 = padstacks.find(p => p.name === 'via0');
      expect(via0).toBeDefined();
      expect(via0?.shapes.length).toBe(2); // TopLayer and BottomLayer
    });

    it('should parse padstack with polygon shape', () => {
      const { padstacks } = parsedData.library;
      
      // Check for p20e16 padstack (polygon)
      const p20e16 = padstacks.find(p => p.name === 'p20e16');
      expect(p20e16).toBeDefined();
      expect(p20e16?.shapes[0].type).toBe('polygon');
      expect(p20e16?.shapes[0].coordinates.length).toBeGreaterThan(0);
    });

    it('should parse padstack with circle shape', () => {
      const { padstacks } = parsedData.library;
      
      // Check for p25e11 padstack (circle)
      const p25e11 = padstacks.find(p => p.name === 'p25e11');
      expect(p25e11).toBeDefined();
      expect(p25e11?.shapes[0].type).toBe('circle');
      // Circle coordinates format: [diameter, x, y]
      expect(p25e11?.shapes[0].coordinates[0]).toBeCloseTo(66.93, 1);
    });
  });

  describe('Network Parsing', () => {
    let parsedData: ReturnType<JlcDsnParser['parse']>;

    beforeAll(() => {
      parsedData = parser.parse(dsnContent);
    });

    it('should parse network definitions', () => {
      const { nets } = parsedData.network;
      expect(nets).toBeInstanceOf(Map);
      expect(nets.size).toBeGreaterThan(0);
    });

    it('should correctly parse GND net with many pins', () => {
      const { nets } = parsedData.network;
      const gndNet = nets.get('GND');
      
      expect(gndNet).toBeDefined();
      expect(gndNet!.length).toBeGreaterThan(50); // GND has many pins
      
      // Check some specific pins
      const pinRefs = gndNet!.map(p => `${p.component}-${p.pin}`);
      expect(pinRefs).toContain('u1-20e16');
      expect(pinRefs).toContain('u1-25e11');
      expect(pinRefs).toContain('u1-1468e48');
    });

    it('should correctly parse 3V3 net', () => {
      const { nets } = parsedData.network;
      const v3Net = nets.get('3V3');
      
      expect(v3Net).toBeDefined();
      expect(v3Net!.length).toBeGreaterThan(0);
      const pinRefs = v3Net!.map(p => `${p.component}-${p.pin}`);
      expect(pinRefs).toContain('u1-20e19');
    });

    it('should correctly parse nets with special format names ($1N1226)', () => {
      const { nets } = parsedData.network;
      const specialNet = nets.get('$1N1226');
      
      expect(specialNet).toBeDefined();
      const pinRefs = specialNet!.map(p => `${p.component}-${p.pin}`);
      expect(pinRefs).toContain('u1-1478e14');
    });

    it('should parse class definitions', () => {
      const { classes } = parsedData.network;
      expect(classes).toBeInstanceOf(Map);
      expect(classes.size).toBeGreaterThan(0);
    });

    it('should correctly parse class with via and rules', () => {
      const { classes } = parsedData.network;
      
      // Find GND class
      const gndClass = classes.get('GND');
      expect(gndClass).toBeDefined();
      expect(gndClass?.viaType).toBe('via0');
      expect(gndClass?.width).toBe(10);
      expect(gndClass?.clearance).toBe(4.02);
    });

    it('should parse all expected nets', () => {
      const { nets } = parsedData.network;
      const netNames = Array.from(nets.keys());
      
      // Check for some expected net names
      expect(netNames).toContain('GND');
      expect(netNames).toContain('3V3');
      expect(netNames).toContain('USB5V');
      expect(netNames).toContain('UART_RX');
      expect(netNames).toContain('UART_TX');
      expect(netNames).toContain('SPI2_MOSI');
      expect(netNames).toContain('SPI2_CLK');
    });
  });

  describe('Data Integrity', () => {
    let parsedData: ReturnType<JlcDsnParser['parse']>;

    beforeAll(() => {
      parsedData = parser.parse(dsnContent);
    });

    it('should have consistent pin references between library and network', () => {
      const { images } = parsedData.library;
      const { nets } = parsedData.network;
      
      // Get all pin names from library
      const libraryPins = new Set<string>();
      images.forEach(img => {
        img.pins.forEach(pin => {
          libraryPins.add(`${img.name}-${pin.name}`);
        });
      });
      
      // Check that all network pins exist in library
      nets.forEach((pinRefs, netName) => {
        pinRefs.forEach(pinRef => {
          const pinRefStr = `${pinRef.component}-${pinRef.pin}`;
          expect(libraryPins.has(pinRefStr)).toBe(true);
        });
      });
    });

    it('should have valid coordinate values (no NaN or Infinity)', () => {
      const { boundary } = parsedData.structure;
      
      boundary.forEach(point => {
        expect(Number.isFinite(point.x)).toBe(true);
        expect(Number.isFinite(point.y)).toBe(true);
      });
    });

    it('should have valid layer indices', () => {
      const { layers } = parsedData.structure;
      
      layers.forEach(layer => {
        expect(layer.index).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(layer.index)).toBe(true);
      });
    });
  });

  describe('Statistics', () => {
    let parsedData: ReturnType<JlcDsnParser['parse']>;

    beforeAll(() => {
      parsedData = parser.parse(dsnContent);
    });

    it('should report parsing statistics', () => {
      const { images } = parsedData.library;
      const { padstacks } = parsedData.library;
      const { nets, classes } = parsedData.network;
      
      console.log('\n=== JLC DSN File Parsing Statistics ===');
      console.log(`PCB Name: ${parsedData.pcbName}`);
      console.log(`Resolution: ${parsedData.resolution.unit} × ${parsedData.resolution.multiplier}`);
      console.log(`Layers: ${parsedData.structure.layers.length}`);
      console.log(`Boundary Points: ${parsedData.structure.boundary.length}`);
      console.log(`Images: ${images.length}`);
      console.log(`Total Pins: ${images.reduce((sum, img) => sum + img.pins.length, 0)}`);
      console.log(`Padstacks: ${padstacks.length}`);
      console.log(`Nets: ${nets.size}`);
      console.log(`Net Classes: ${classes.size}`);
      console.log('========================================\n');
      
      // Basic sanity checks
      expect(images.length).toBeGreaterThan(0);
      expect(nets.size).toBeGreaterThan(0);
    });
  });
});
