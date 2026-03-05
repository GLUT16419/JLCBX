/**
 * Autorouter Pipeline Tests
 *
 * Tests for the complete conversion flow:
 * DSN parsing → data conversion → routing → SES generation
 *
 * **Validates: Requirements 9.1, 9.4**
 */

import {
	AutorouterPipeline,
	PipelineStage,
	PipelineResult,
	PipelineProgress,
	DEFAULT_PIPELINE_CONFIG,
	NetRoutingStatus,
} from '../../src/autorouter/autorouter-pipeline';

describe('AutorouterPipeline', () => {
	// Sample minimal DSN content for testing
	const minimalDsnContent = `(PCB "TestPCB"
  (parser
    (string_quote '"')
    (space_in_quoted_tokens on)
    (host_cad "EasyEDA Pro")
    (host_version 3.2.69)
  )
  (resolution mil 1000)
  (structure
    (boundary
      (path signal 0
        0 0
        100000 0
        100000 100000
        0 100000
        0 0
      )
    )
    (layer TopLayer
      (type signal)
    )
    (layer BottomLayer
      (type signal)
    )
    (via via0)
    (rule
      (width 10)
      (clear 6)
    )
  )
  (placement
    (component u1
      (place u1 0 0 front 0)
    )
  )
  (library
    (image u1
      (pin p1 1 10000 10000)
      (pin p2 2 20000 10000)
      (pin p3 3 30000 10000)
      (pin p4 4 40000 10000)
    )
    (padstack via0
      (shape(circle TopLayer 24))
      (shape(circle BottomLayer 24))
    )
    (padstack p1
      (shape(circle TopLayer 50))
    )
    (padstack p2
      (shape(circle TopLayer 50))
    )
    (padstack p3
      (shape(circle TopLayer 50))
    )
    (padstack p4
      (shape(circle TopLayer 50))
    )
  )
  (network
    (net GND
      (pins u1-1 u1-2)
    )
    (net VCC
      (pins u1-3 u1-4)
    )
    (class default 'GND' 'VCC'
      (circuit
        (use_via via0)
      )
      (rule
        (width 10)
        (clearance 6)
      )
    )
  )
)`;

	describe('Constructor', () => {
		it('should create pipeline with default configuration', () => {
			const pipeline = new AutorouterPipeline();
			const config = pipeline.getConfig();

			expect(config.continueOnPartialFailure).toBe(true);
			expect(config.includeIntermediateResults).toBe(false);
		});

		it('should create pipeline with custom configuration', () => {
			const pipeline = new AutorouterPipeline({
				continueOnPartialFailure: false,
				timeout: 300,
			});
			const config = pipeline.getConfig();

			expect(config.continueOnPartialFailure).toBe(false);
			expect(config.timeout).toBe(300);
		});
	});

	describe('Configuration', () => {
		it('should update configuration', () => {
			const pipeline = new AutorouterPipeline();
			pipeline.setConfig({ timeout: 120 });

			const config = pipeline.getConfig();
			expect(config.timeout).toBe(120);
		});

		it('should preserve other config values when updating', () => {
			const pipeline = new AutorouterPipeline({
				continueOnPartialFailure: false,
			});
			pipeline.setConfig({ timeout: 120 });

			const config = pipeline.getConfig();
			expect(config.continueOnPartialFailure).toBe(false);
			expect(config.timeout).toBe(120);
		});
	});

	describe('Stage Management', () => {
		it('should start in IDLE stage', () => {
			const pipeline = new AutorouterPipeline();
			expect(pipeline.getStage()).toBe(PipelineStage.IDLE);
		});

		it('should reset to IDLE stage', () => {
			const pipeline = new AutorouterPipeline();
			pipeline.reset();
			expect(pipeline.getStage()).toBe(PipelineStage.IDLE);
		});
	});

	describe('Progress Callback', () => {
		it('should call progress callback during execution', async () => {
			const pipeline = new AutorouterPipeline();
			const progressUpdates: PipelineProgress[] = [];

			pipeline.onProgress((progress: PipelineProgress) => {
				progressUpdates.push({ ...progress });
			});

			await pipeline.run(minimalDsnContent);

			// Should have progress updates for each stage
			expect(progressUpdates.length).toBeGreaterThan(0);

			// Should include parsing stage
			const parsingUpdates = progressUpdates.filter(p => p.stage === PipelineStage.PARSING);
			expect(parsingUpdates.length).toBeGreaterThan(0);

			// Should include converting stage
			const convertingUpdates = progressUpdates.filter(p => p.stage === PipelineStage.CONVERTING);
			expect(convertingUpdates.length).toBeGreaterThan(0);

			// Should include routing stage
			const routingUpdates = progressUpdates.filter(p => p.stage === PipelineStage.ROUTING);
			expect(routingUpdates.length).toBeGreaterThan(0);

			// Should include generating stage
			const generatingUpdates = progressUpdates.filter(p => p.stage === PipelineStage.GENERATING);
			expect(generatingUpdates.length).toBeGreaterThan(0);
		});
	});

	describe('Complete Pipeline Flow', () => {
		it('should successfully process valid DSN content', async () => {
			const pipeline = new AutorouterPipeline();
			const result = await pipeline.run(minimalDsnContent);

			expect(result.success).toBe(true);
			expect(result.sesContent).toBeDefined();
			expect(result.sesContent).toContain('(session');
			expect(result.sesContent).toContain('(base_design');
			expect(result.sesContent).toContain('(resolution mil 1000)');
		});

		it('should preserve PCB name in SES output', async () => {
			const pipeline = new AutorouterPipeline();
			const result = await pipeline.run(minimalDsnContent);

			expect(result.success).toBe(true);
			expect(result.sesContent).toContain('"TestPCB"');
		});

		it('should include summary statistics', async () => {
			const pipeline = new AutorouterPipeline();
			const result = await pipeline.run(minimalDsnContent);

			expect(result.summary).toBeDefined();
			expect(result.summary.totalNets).toBe(2); // GND and VCC
			expect(result.summary.totalPins).toBe(4); // 2 pins per net
		});

		it('should include net status', async () => {
			const pipeline = new AutorouterPipeline();
			const result = await pipeline.run(minimalDsnContent);

			expect(result.netStatus).toBeDefined();
			expect(result.netStatus.length).toBeGreaterThan(0);

			// Each net status should have required fields
			for (const status of result.netStatus) {
				expect(status.netName).toBeDefined();
				expect(typeof status.success).toBe('boolean');
				expect(typeof status.pinCount).toBe('number');
			}
		});

		it('should include intermediate results when configured', async () => {
			const pipeline = new AutorouterPipeline({
				includeIntermediateResults: true,
			});
			const result = await pipeline.run(minimalDsnContent);

			expect(result.success).toBe(true);
			expect(result.parsedData).toBeDefined();
			expect(result.routingResult).toBeDefined();
		});

		it('should not include intermediate results by default', async () => {
			const pipeline = new AutorouterPipeline();
			const result = await pipeline.run(minimalDsnContent);

			expect(result.success).toBe(true);
			expect(result.parsedData).toBeUndefined();
			expect(result.routingResult).toBeUndefined();
		});
	});

	describe('Error Handling', () => {
		it('should handle empty DSN content', async () => {
			const pipeline = new AutorouterPipeline();
			const result = await pipeline.run('');

			expect(result.success).toBe(false);
			expect(result.errors.length).toBeGreaterThan(0);
			expect(result.errors[0].stage).toBe(PipelineStage.PARSING);
		});

		it('should handle invalid DSN syntax', async () => {
			const pipeline = new AutorouterPipeline();
			const result = await pipeline.run('not valid dsn content');

			expect(result.success).toBe(false);
			expect(result.errors.length).toBeGreaterThan(0);
		});

		it('should handle DSN without PCB root', async () => {
			const pipeline = new AutorouterPipeline();
			const result = await pipeline.run('(notPCB "test")');

			expect(result.success).toBe(false);
			expect(result.errors.length).toBeGreaterThan(0);
		});

		it('should collect errors with stage context', async () => {
			const pipeline = new AutorouterPipeline();
			const result = await pipeline.run('');

			expect(result.errors.length).toBeGreaterThan(0);
			const error = result.errors[0];
			expect(error.message).toBeDefined();
			expect(error.stage).toBeDefined();
		});

		it('should propagate errors correctly', async () => {
			const pipeline = new AutorouterPipeline();
			// Use completely invalid DSN that will definitely fail parsing
			const result = await pipeline.run('(invalid syntax here');

			expect(result.success).toBe(false);
			expect(result.errors.length).toBeGreaterThan(0);
		});
	});

	describe('Warnings', () => {
		it('should collect warnings for missing optional data', async () => {
			// DSN with minimal content (missing some optional sections)
			const minimalDsn = `(PCB "MinimalPCB"
  (resolution mil 1000)
  (structure
    (layer TopLayer (type signal))
    (layer BottomLayer (type signal))
  )
  (network)
)`;

			const pipeline = new AutorouterPipeline();
			const result = await pipeline.run(minimalDsn);

			// Should succeed but have warnings
			expect(result.success).toBe(true);
			expect(result.warnings.length).toBeGreaterThan(0);
		});
	});

	describe('Cancellation', () => {
		it('should support cancellation', async () => {
			const pipeline = new AutorouterPipeline();

			// Start the pipeline and immediately cancel
			const runPromise = pipeline.run(minimalDsnContent);
			pipeline.cancel();

			const result = await runPromise;

			// Result should indicate cancellation or error
			expect(result.success).toBe(false);
		});

		it('should reset after cancellation', () => {
			const pipeline = new AutorouterPipeline();
			pipeline.cancel();
			pipeline.reset();

			expect(pipeline.getStage()).toBe(PipelineStage.IDLE);
		});
	});

	describe('Error and Warning Accessors', () => {
		it('should provide access to errors', async () => {
			const pipeline = new AutorouterPipeline();
			await pipeline.run('');

			const errors = pipeline.getErrors();
			expect(errors.length).toBeGreaterThan(0);
		});

		it('should provide access to warnings', async () => {
			const pipeline = new AutorouterPipeline();
			await pipeline.run(minimalDsnContent);

			const warnings = pipeline.getWarnings();
			expect(Array.isArray(warnings)).toBe(true);
		});
	});

	describe('Net Connectivity Preservation (Requirement 9.1, 9.4)', () => {
		it('should preserve all net names in SES output', async () => {
			const pipeline = new AutorouterPipeline();
			const result = await pipeline.run(minimalDsnContent);

			expect(result.success).toBe(true);
			expect(result.sesContent).toContain('GND');
			expect(result.sesContent).toContain('VCC');
		});

		it('should maintain net-to-pin mappings', async () => {
			const pipeline = new AutorouterPipeline({
				includeIntermediateResults: true,
			});
			const result = await pipeline.run(minimalDsnContent);

			expect(result.success).toBe(true);
			expect(result.parsedData).toBeDefined();

			// Check that nets have correct pin counts
			const gndPins = result.parsedData!.network.nets.get('GND');
			const vccPins = result.parsedData!.network.nets.get('VCC');

			expect(gndPins).toBeDefined();
			expect(gndPins!.length).toBe(2);
			expect(vccPins).toBeDefined();
			expect(vccPins!.length).toBe(2);
		});

		it('should report correct net statistics', async () => {
			const pipeline = new AutorouterPipeline();
			const result = await pipeline.run(minimalDsnContent);

			expect(result.summary.totalNets).toBe(2);
			expect(result.netStatus.length).toBe(2);

			// Find GND and VCC in net status
			const gndStatus = result.netStatus.find((s: NetRoutingStatus) => s.netName === 'GND');
			const vccStatus = result.netStatus.find((s: NetRoutingStatus) => s.netName === 'VCC');

			expect(gndStatus).toBeDefined();
			expect(gndStatus!.pinCount).toBe(2);
			expect(vccStatus).toBeDefined();
			expect(vccStatus!.pinCount).toBe(2);
		});
	});

	describe('SES Format Validation', () => {
		it('should generate valid SES session structure', async () => {
			const pipeline = new AutorouterPipeline();
			const result = await pipeline.run(minimalDsnContent);

			expect(result.success).toBe(true);
			expect(result.sesContent).toMatch(/\(session\s+"[^"]+"/);
			expect(result.sesContent).toMatch(/\(base_design\s+"[^"]+"/);
		});

		it('should include resolution declaration', async () => {
			const pipeline = new AutorouterPipeline();
			const result = await pipeline.run(minimalDsnContent);

			expect(result.success).toBe(true);
			expect(result.sesContent).toContain('(resolution mil 1000)');
		});

		it('should include placement section', async () => {
			const pipeline = new AutorouterPipeline();
			const result = await pipeline.run(minimalDsnContent);

			expect(result.success).toBe(true);
			expect(result.sesContent).toContain('(placement');
		});

		it('should include routes section', async () => {
			const pipeline = new AutorouterPipeline();
			const result = await pipeline.run(minimalDsnContent);

			expect(result.success).toBe(true);
			expect(result.sesContent).toContain('(routes');
		});

		it('should include network_out section', async () => {
			const pipeline = new AutorouterPipeline();
			const result = await pipeline.run(minimalDsnContent);

			expect(result.success).toBe(true);
			expect(result.sesContent).toContain('(network_out');
		});
	});
});
