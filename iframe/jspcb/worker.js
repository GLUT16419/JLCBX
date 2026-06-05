importScripts('mymath.js', 'layer.js', 'router.js');

function pcb_thread(paramater_array) {
	//generate range of routing vectors
	function gen_vectors(vec_range, x_range, y_range, enable_45deg = false) {
		let v = [];
		for (let y = y_range; y >= -y_range; --y) {
			for (let x = x_range; x >= -x_range; --x) {
				let p = [x, y];
				let len = js_pcb.length_2d(p);
				if (len > 0.1 && len <= vec_range) {
					// 如果启用45度角，允许所有向量；否则只允许正交向量
					if (enable_45deg || x === 0 || y === 0) {
						v.push([x, y, 0]);
					}
				}
			}
		}
		return v;
	}

	//args
	let pcb_data, arg_t, arg_v, arg_s, arg_z, arg_r, arg_q, arg_d, arg_fr, arg_xr, arg_yr, arg_45deg, arg_strategy;
	[pcb_data, arg_t, arg_v, arg_s, arg_z, arg_r, arg_q, arg_d, arg_fr, arg_xr, arg_yr, arg_45deg, arg_strategy] = paramater_array;
	let enable_45deg = arg_45deg === 1;

	//create flooding and backtracking vectors
	let flood_range = arg_fr;
	let flood_range_x_even_layer = arg_xr;
	let flood_range_y_odd_layer = arg_yr;
	let path_range = flood_range + 0;
	let path_range_x_even_layer = flood_range_x_even_layer + 0;
	let path_range_y_odd_layer = flood_range_y_odd_layer + 0;

	let routing_flood_vectorss = [
		gen_vectors(flood_range, flood_range_x_even_layer, flood_range, enable_45deg),
		gen_vectors(flood_range, flood_range, flood_range_y_odd_layer, enable_45deg),
	];

	let routing_path_vectorss = [
		gen_vectors(path_range, path_range_x_even_layer, path_range, enable_45deg),
		gen_vectors(path_range, path_range, flood_range_y_odd_layer, enable_45deg),
	];

	//choose distance metric function
	let dfuncs = [
		js_pcb.squared_euclidean_distance_3d,
		js_pcb.manhattan_distance_3d,
		js_pcb.euclidean_distance_3d,
		js_pcb.chebyshev_distance_3d,
		js_pcb.reciprical_distance_3d,
	];

	//create pcb object and populate with tracks from input
	let current_pcb = new js_pcb.Pcb(pcb_data[0], routing_flood_vectorss, routing_path_vectorss, dfuncs[arg_d], arg_r, arg_v, arg_q, arg_z);
	// 设置布线策略
	current_pcb.set_strategy(arg_strategy || 'balanced');
	for (let track of pcb_data[1]) current_pcb.add_track(track);

	// 发送进度更新
	function sendProgressUpdate(pcb, sampleIndex, totalSamples) {
		const progress = pcb.m_progress || {
			total: pcb.m_netlist ? pcb.m_netlist.length : 0,
			routed: 0,
			failed: 0,
		};
		const processed = progress.routed + progress.failed;
		const percent = progress.total > 0 ? ((processed / progress.total) * 100).toFixed(1) : '0.0';
		const successRate = processed > 0 ? ((progress.routed / processed) * 100).toFixed(1) : '--';

		postMessage({
			type: 'progress',
			data: {
				sampleIndex: sampleIndex + 1,
				totalSamples: totalSamples,
				total: progress.total,
				routed: progress.routed,
				failed: progress.failed,
				processed: processed,
				percent: percent,
				successRate: successRate,
				elapsedTime: progress.elapsedTime || '--',
				remainingTime: progress.remainingTime || '--',
			},
		});
	}

	//run number of samples of solution and pick best one
	let best_pcb = current_pcb.output_pcb();
	postMessage(best_pcb);
	let best_cost = 1000000000;
	for (let i = 0; i < arg_s; ++i) {
		// 发送日志消息
		postMessage({
			type: 'log',
			message: `[采样 ${i + 1}/${arg_s}] 开始布线...`,
		});

		// 发送初始进度
		sendProgressUpdate(current_pcb, i, arg_s);

		let startTime = Date.now();
		if (!current_pcb.route(arg_t)) {
			current_pcb.increase_quantization();
			postMessage({
				type: 'log',
				message: `[采样 ${i + 1}/${arg_s}] 布线失败，增加量化精度重试`,
			});
			continue;
		}

		let endTime = Date.now();
		let duration = (endTime - startTime) / 1000;
		let cost = current_pcb.cost();

		// 发送最终进度
		sendProgressUpdate(current_pcb, i, arg_s);

		postMessage({
			type: 'log',
			message: `[采样 ${i + 1}/${arg_s}] 完成! 耗时: ${duration.toFixed(2)}s, 代价: ${cost}`,
		});

		if (cost <= best_cost) {
			best_cost = cost;
			best_pcb = current_pcb.output_pcb();
			postMessage({
				type: 'log',
				message: `>>> 发现更优解 (代价: ${cost})`,
			});
			// Send intermediate best result for visualization
			postMessage(best_pcb);
		}
	}

	postMessage({
		type: 'log',
		message: `所有采样完成。最佳代价: ${best_cost}`,
	});

	// 发送完成状态
	postMessage({
		type: 'progress',
		data: {
			complete: true,
			total: current_pcb.m_netlist ? current_pcb.m_netlist.length : 0,
			bestCost: best_cost,
		},
	});

	postMessage(best_pcb);
}

//thread event listner
addEventListener(
	'message',
	function (event) {
		pcb_thread(event.data);
	},
	false,
);
