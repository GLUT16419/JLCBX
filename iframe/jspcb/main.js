//filename and worker
let file = null;
let originalFile = null; // 保存原始文件内容（转换前）
let fileName = 'output'; // 文件名
let worker = null;
let lastPcbData = null; // 保存最后的布线结果
let isJlcConverted = false; // 是否经过 JLC 转换
let shouldSaveHistory = false;
let routingTimer = null;
let routingStartTime = 0;
const HISTORY_KEY = 'js_pcb_history_v1';
const HISTORY_LIMIT = 10;
let historyRecords = [];

function startTimer() {
	stopTimer();
	const display = document.getElementById('timer-display');
	display.style.display = 'block';
	display.innerText = '00:00';
	routingStartTime = Date.now();

	routingTimer = setInterval(() => {
		const elapsed = Date.now() - routingStartTime;
		const seconds = Math.floor(elapsed / 1000);
		const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
		const ss = String(seconds % 60).padStart(2, '0');
		display.innerText = `${mm}:${ss}`;
	}, 1000);
}

function stopTimer() {
	if (routingTimer) {
		clearInterval(routingTimer);
		routingTimer = null;
	}
}

function loadHistory() {
	try {
		const raw = localStorage.getItem(HISTORY_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed;
	} catch (err) {
		return [];
	}
}

function persistHistory() {
	localStorage.setItem(HISTORY_KEY, JSON.stringify(historyRecords));
}

function formatTime(ts) {
	try {
		return new Date(ts).toLocaleString();
	} catch (err) {
		return '';
	}
}

function formatFileTimestamp(ts) {
	try {
		return new Date(ts).toISOString().replace(/[:.]/g, '-');
	} catch (err) {
		return String(ts);
	}
}

function getCurrentParams() {
	return {
		g: +document.getElementById('arg_g').value,
		t: +document.getElementById('arg_t').value,
		v: +document.getElementById('arg_v').value,
		s: +document.getElementById('arg_s').value,
		z: +document.getElementById('arg_z').value,
		r: +document.getElementById('arg_r').value,
		q: +document.getElementById('arg_q').value,
		d: +document.getElementById('arg_d').value,
		fr: +document.getElementById('arg_fr').value,
		xr: +document.getElementById('arg_xr').value,
		yr: +document.getElementById('arg_yr').value,
	};
}

function formatParams(params) {
	if (!params) return '';
	return `S${params.s} R${params.r} Z${params.z} D${params.d} Q${params.q} FR${params.fr} XR${params.xr} YR${params.yr}`;
}

function renderHistory() {
	const list = document.getElementById('history_list');
	const empty = document.getElementById('history_empty');
	list.innerHTML = '';
	if (!historyRecords.length) {
		empty.style.display = 'block';
		return;
	}
	empty.style.display = 'none';
	for (const record of historyRecords) {
		list.appendChild(createHistoryItem(record));
	}
}

function createHistoryItem(record) {
	const item = document.createElement('div');
	item.className = 'history-item';

	const title = document.createElement('div');
	title.className = 'history-title';
	const name = document.createElement('span');
	name.innerText = record.fileName || 'output';
	const time = document.createElement('span');
	time.innerText = formatTime(record.createdAt);
	title.appendChild(name);
	title.appendChild(time);

	const meta = document.createElement('div');
	meta.className = 'history-meta';
	const params = document.createElement('span');
	params.innerText = formatParams(record.params);
	const gap = document.createElement('span');
	gap.innerText = `Gap ${record.params ? record.params.g : ''}`;
	meta.appendChild(params);
	meta.appendChild(gap);

	const actions = document.createElement('div');
	actions.className = 'history-actions';
	const downloadBtn = document.createElement('button');
	downloadBtn.type = 'button';
	downloadBtn.innerText = '下载 SES';
	downloadBtn.onclick = function () {
		downloadHistoryRecord(record);
	};
	actions.appendChild(downloadBtn);

	item.appendChild(title);
	item.appendChild(meta);
	item.appendChild(actions);
	return item;
}

function downloadHistoryRecord(record) {
	if (!record || !record.sesContent) return;
	const blob = new Blob([record.sesContent], { type: 'text/plain' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	const stamp = formatFileTimestamp(record.createdAt);
	const baseName = record.fileName || 'output';
	a.href = url;
	a.download = `${baseName}_${stamp}.ses`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

function addHistoryRecord(pcbData) {
	if (!originalFile) return;
	try {
		const dsnInfo = parseDsnInfo(originalFile);
		dsnInfo.fileName = fileName;
		dsnInfo.isJlcConverted = isJlcConverted;
		const params = getCurrentParams();
		const sesContent = convertPcbToSes(pcbData, dsnInfo, { gap: params.g });
		const timestamp = Date.now();
		historyRecords.unshift({
			id: String(timestamp),
			fileName: fileName,
			createdAt: timestamp,
			params: params,
			sesContent: sesContent,
		});
		if (historyRecords.length > HISTORY_LIMIT) {
			historyRecords = historyRecords.slice(0, HISTORY_LIMIT);
		}
		persistHistory();
		renderHistory();
	} catch (err) {}
}

//go button handler
let workerBlobUrl = null;

async function loadTextFile(relativePath) {
	if (typeof eda !== 'undefined' && eda?.sys_FileSystem?.getExtensionFile) {
		const f = await eda.sys_FileSystem.getExtensionFile('/iframe/jspcb/' + relativePath);
		if (f) return await f.text();
	}
	const r = await fetch('/iframe/jspcb/' + relativePath);
	return await r.text();
}

async function createRoutingWorker() {
	try {
		return new Worker('/iframe/jspcb/worker.js');
	} catch (e) {}

	const mymath = await loadTextFile('mymath.js');
	const layer = await loadTextFile('layer.js');
	const router = await loadTextFile('router.js');
	const workerSource = await loadTextFile('worker.js');
	const cleanedWorker = workerSource.replace(/^\s*importScripts\([^\)]*\);\s*/m, '');
	const combined = `${mymath}\n${layer}\n${router}\n${cleanedWorker}\n`;
	workerBlobUrl = URL.createObjectURL(new Blob([combined], { type: 'application/javascript' }));
	return new Worker(workerBlobUrl);
}

async function handleOnGo(evt) {
	if (file !== null) {
		//params
		let arg_g = +document.getElementById('arg_g').value;
		let arg_t = +document.getElementById('arg_t').value;
		let arg_v = +document.getElementById('arg_v').value;
		let arg_s = +document.getElementById('arg_s').value;
		let arg_z = +document.getElementById('arg_z').value;
		let arg_r = +document.getElementById('arg_r').value;
		let arg_q = +document.getElementById('arg_q').value;
		let arg_d = +document.getElementById('arg_d').value;
		let arg_fr = +document.getElementById('arg_fr').value;
		let arg_xr = +document.getElementById('arg_xr').value;
		let arg_yr = +document.getElementById('arg_yr').value;

		// Reset log UI
		document.getElementById('log-content').innerHTML = ''; // Clear logs
		appendLog('系统就绪，开始初始化布线线程...');
		document.getElementById('go').disabled = true;
		shouldSaveHistory = false;
		startTimer();

		//run pcb solver web worker thread, register output listner
		if (worker !== null) worker.terminate();
		if (workerBlobUrl) {
			try {
				URL.revokeObjectURL(workerBlobUrl);
			} catch {}
			workerBlobUrl = null;
		}
		try {
			worker = await createRoutingWorker();
		} catch (e) {
			const msg = e && e.message ? e.message : String(e);
			appendLog('Worker 创建失败: ' + msg);
			document.getElementById('go').disabled = false;
			stopTimer();
			return;
		}
		worker.addEventListener(
			'message',
			function (event) {
				// Handle log messages
				if (event.data.type === 'log') {
					appendLog(event.data.message);
					return;
				}

				// Handle legacy array data (result)
				let pcbData = event.data;
				if (event.data.type === 'result') {
					pcbData = event.data.data;
				}

				if (pcbData.length) {
					//保存布线结果
					lastPcbData = pcbData;
					//启用导出按钮
					document.getElementById('export_ses').disabled = false;

					//view the pcb output with auto-scaling (scale=0)
					js_pcb.view_pcb(pcbData, 0, 2);

					// Check if this is likely the final message (based on content or context)
					// Actually worker sends the best_pcb as the very last message too.
					// We can re-enable the button if we receive a message that implies completion?
					// The worker sends "所有采样完成" log right before the final pcb data.
					// But we can't easily distinguish intermediate vs final pcb data here without a flag.
					// However, we can just leave the button disabled until the user changes something or we can detect end.
					// Since we don't have an explicit "done" event for data, let's rely on the log "所有采样完成" to re-enable button?
					// No, let's just keep it disabled while working.
					// Actually, we can just re-enable it always when we get data, but that might allow double clicking.
					// Let's modify the worker to send a "done" message?
					// For now, let's just assume if we get a log starting with "所有采样完成", we are done.
					if (shouldSaveHistory) {
						addHistoryRecord(pcbData);
						shouldSaveHistory = false;
					}
				}
			},
			false,
		);

		// 构建netLayers数组：网络名 -> 层数组，然后在dsn2pcb里转成Map
		let netLayersArray = [];
		if (typeof netConfig !== 'undefined' && netConfig && Array.isArray(netConfig)) {
			for (let net of netConfig) {
				if (net.name && net.layers) {
					netLayersArray.push([net.name, net.layers]);
				}
			}
		}
		// 45度角走线参数
		let arg_45deg = document.getElementById('arg_45deg')?.checked ? 1 : 0;

		//post to solver thread
		worker.postMessage([
			js_pcb.dsn2pcb(file, arg_g, netLayersArray),
			arg_t,
			arg_v,
			arg_s,
			arg_z,
			arg_r,
			arg_q,
			arg_d,
			arg_fr,
			arg_xr,
			arg_yr,
			arg_45deg,
		]);
	}
}

function appendLog(message) {
	let logContainer = document.getElementById('log-content');
	let entry = document.createElement('div');
	entry.className = 'log-entry';
	entry.innerText = message;
	logContainer.appendChild(entry);

	// Auto scroll to bottom
	document.getElementById('log-content').scrollTop = document.getElementById('log-content').scrollHeight;

	// Check for completion message to re-enable button
	if (message.includes('所有采样完成')) {
		document.getElementById('go').disabled = false;
		shouldSaveHistory = true;
		stopTimer();
	}
}

//导出 SES 文件
async function handleExportSes(evt) {
	if (lastPcbData === null || originalFile === null) {
		alert('请先运行布线！');
		return;
	}

	try {
		// 解析原始 DSN 信息
		const dsnInfo = parseDsnInfo(originalFile);
		dsnInfo.fileName = fileName;
		dsnInfo.isJlcConverted = isJlcConverted;

		// 获取 gap 参数
		const gap = +document.getElementById('arg_g').value;

		// 转换为 SES 格式
		const sesContent = convertPcbToSes(lastPcbData, dsnInfo, { gap: gap });

		// EDA 环境：直接导入
		if (typeof eda !== 'undefined' && eda?.pcb_Document?.importAutoRouteSesFile) {
			console.log('[jspcb][eda] importAutoRouteSesFile');
			const sesFile = new File([sesContent], fileName + '.ses', { type: 'text/plain' });
			try {
				await eda.pcb_Document.importAutoRouteSesFile(sesFile);
				eda?.sys_Message?.showToastMessage?.('SES 已导入', 'success', 3);
			} catch (e) {
				console.error('[jspcb][eda] import failed', e);
				try {
					if (eda?.sys_FileSystem?.saveFile) {
						await eda.sys_FileSystem.saveFile(sesFile, sesFile.name);
						eda?.sys_Message?.showToastMessage?.('SES 导入失败，已保存文件', 'warning', 6);
					} else {
						eda?.sys_Message?.showToastMessage?.('SES 导入失败', 'error', 6);
					}
				} catch (e2) {
					console.error('[jspcb][eda] save fallback failed', e2);
					eda?.sys_Message?.showToastMessage?.('SES 导入失败且保存失败', 'error', 8);
				}
			}
			return;
		}

		// 下载文件
		const blob = new Blob([sesContent], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = fileName + '.ses';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	} catch (err) {
		alert('导出失败: ' + err.message);
		console.error(err);
	}
}

//解析DSN信息 - 新增用于获取层和网络
function parseDsnInfo(dsnContent) {
	let info = {
		fileName: 'output',
		layers: [],
		nets: [],
	};

	try {
		let EOF = -1;
		let stream = [dsnContent, 0];

		// 直接使用 dsn2pcb.js 中相同的解析方法
		function peek(stream) {
			if (stream[1] === stream[0].length) return EOF;
			return stream[0].charAt(stream[1]);
		}
		function get(stream) {
			if (stream[1] === stream[0].length) return EOF;
			return stream[0].charAt(stream[1]++);
		}
		function read_whitespace(stream) {
			for (;;) {
				let b = peek(stream);
				if (b !== '\t' && b !== '\n' && b !== '\r' && b !== ' ') break;
				get(stream);
			}
		}
		function read_node_name(stream) {
			let s = '';
			for (;;) {
				let b = peek(stream);
				if (b === '\t' || b === '\n' || b === '\r' || b === ' ' || b === ')') break;
				s += get(stream);
			}
			return s;
		}
		function read_string(stream) {
			let s = '';
			for (;;) {
				let b = peek(stream);
				if (b === '\t' || b === '\n' || b === '\r' || b === ' ' || b === ')') break;
				s += get(stream);
			}
			return [s, []];
		}
		function read_quoted_string(stream) {
			let s = '';
			get(stream); // skip opening "
			for (;;) {
				let b = peek(stream);
				if (b === '"') {
					get(stream);
					break;
				}
				if (b === EOF) break;
				s += get(stream);
			}
			return [s, []];
		}
		function read_tree(stream) {
			// 直接读取到 '(' 开始
			while (true) {
				let b = peek(stream);
				if (b === EOF) return ['', []];
				if (b === '(') break;
				get(stream);
			}
			get(stream); // 跳过 '('
			read_whitespace(stream);
			let t = [read_node_name(stream), []];
			for (;;) {
				read_whitespace(stream);
				let b = peek(stream);
				if (b === EOF) break;
				if (b === ')') {
					get(stream);
					break;
				}
				if (b === '(') {
					t[1].push(read_tree(stream));
					continue;
				}
				if (b === '"') {
					get(stream);
					t[1].push(read_quoted_string(stream));
					get(stream);
					continue;
				}
				t[1].push(read_string(stream));
			}
			return t;
		}
		function search_tree(t, s) {
			if (t[0] === s) return t;
			for (let i = 0; i < t[1].length; i++) {
				let st = search_tree(t[1][i], s);
				if (st.length) return st;
			}
			return [];
		}

		let tree = read_tree(stream);
		console.log('DSN 根节点:', tree[0]);

		// 打印树结构的简化版本用于调试
		function print_tree_simple(t, indent = 0) {
			if (t[0].length && indent <= 2) {
				// 只打印前两层
				console.log('  '.repeat(indent) + t[0]);
			}
			for (let ct of t[1]) {
				if (indent < 3) {
					// 限制深度
					print_tree_simple(ct, indent + 1);
				}
			}
		}
		print_tree_simple(tree);

		// 支持大小写不敏感的搜索
		function search_tree_ignore_case(t, s) {
			if (t[0].toLowerCase() === s.toLowerCase()) return t;
			for (let i = 0; i < t[1].length; i++) {
				let st = search_tree_ignore_case(t[1][i], s);
				if (st.length) return st;
			}
			return [];
		}

		// 解析层 - 从 structure 节点（同时支持 KiCad 格式和 JLC 原始格式）
		let structure_root = search_tree_ignore_case(tree, 'structure');
		if (structure_root.length) {
			console.log(
				'structure 节点子节点:',
				structure_root[1].map((n) => n[0]),
			);

			// 首先尝试从 layer 节点获取层
			for (let structure_node of structure_root[1]) {
				if (structure_node[0].toLowerCase() === 'layer') {
					console.log('找到 layer 节点:', JSON.stringify(structure_node));
					let layer_name;
					// 检查层名的位置
					if (structure_node[1].length > 0) {
						// 情况1: ["layer", ["name", ...]] 或 ["layer", "name"]
						if (Array.isArray(structure_node[1][0])) {
							layer_name = structure_node[1][0][0];
						} else {
							layer_name = structure_node[1][0];
						}
						// 去掉可能的引号
						if (typeof layer_name === 'string') {
							layer_name = layer_name.replace(/^"|"$/g, '');
							info.layers.push({ id: info.layers.length, name: layer_name });
						}
					}
				}
			}

			// 如果没有找到 layer 节点，尝试从 via 定义中推断层
			if (info.layers.length === 0) {
				console.log('未在 structure 中找到 layer 节点，尝试从 via 定义推断层...');
				let allLayerNames = new Set();

				for (let sn of structure_root[1]) {
					if (sn[0].toLowerCase() === 'via') {
						console.log('检查 via 节点:', JSON.stringify(sn).substring(0, 300));
						// via 定义可能包含层信息
						let viaStr = JSON.stringify(sn);
						// 查找类似 F.Cu, B.Cu, In1.Cu 等层名模式
						let layerMatches = viaStr.match(/[FB]\.Cu|In[0-9]+\.Cu/g);
						if (layerMatches) {
							layerMatches.forEach((l) => allLayerNames.add(l));
						}
					}
				}

				// 如果从 via 找到了层名
				if (allLayerNames.size > 0) {
					console.log('从 via 定义找到层:', Array.from(allLayerNames));
					// 按标准顺序排序：F.Cu(顶层) -> In1.Cu -> In2.Cu -> ... -> B.Cu(底层)
					// F.Cu = 0, B.Cu = 最大, InX.Cu = 中间
					const isTop = (l) => l === 'F.Cu';
					const isBottom = (l) => l === 'B.Cu';
					const getInnerNum = (l) => {
						let m = l.match(/In(\d+)\.Cu/);
						return m ? parseInt(m[1]) : 999;
					};

					let layersArray = Array.from(allLayerNames);
					// 分离出顶层、底层和内层
					let top = layersArray.filter(isTop);
					let bottom = layersArray.filter(isBottom);
					let inner = layersArray.filter((l) => !isTop(l) && !isBottom(l));
					// 按内层编号排序
					inner.sort((a, b) => getInnerNum(a) - getInnerNum(b));

					layersArray = [...top, ...inner, ...bottom];
					console.log('排序后的层顺序:', layersArray);

					layersArray.forEach((name, idx) => {
						info.layers.push({ id: idx, name: name });
					});
				}
			}
		}

		// 解析网络 - 从 network 节点
		let network_root = search_tree_ignore_case(tree, 'network');
		if (network_root.length) {
			console.log('找到 network 节点，子节点数:', network_root[1].length);
			// 打印 network 的子节点名
			network_root[1].forEach((n, i) => console.log('  network 子节点', i, ':', n[0]));

			// 优先方式：从 net 节点获取网络名（有42个！）
			for (let i = 0; i < network_root[1].length; i++) {
				let network_node = network_root[1][i];
				if (network_node[0].toLowerCase() === 'net') {
					// net 节点结构：["net",[["PB12",[]],["pins",...]]]
					if (network_node.length > 1 && network_node[1].length > 0) {
						let net_name = network_node[1][0][0]; // 网络名在这个位置！
						// 兼容带引号和不带引号的情况，显示所有网络（包括 $ 开头的）
						if (typeof net_name === 'string') {
							// 去掉可能的引号
							net_name = net_name.replace(/^"|"$/g, '');
							info.nets.push({ id: info.nets.length, name: net_name });
						}
					}
				}
			}
			console.log('从 net 节点解析到的网络数:', info.nets.length);
			// 备用方式：从 class 节点获取网络名
			if (info.nets.length === 0) {
				for (let network_node of network_root[1]) {
					if (network_node[0].toLowerCase() === 'class') {
						console.log('找到 class 节点，子节点数:', network_node[1].length);
						for (let netname of network_node[1]) {
							if (!netname[1].length && netname[0] && !netname[0].startsWith('$')) {
								info.nets.push({ id: info.nets.length, name: netname[0] });
							}
						}
					}
				}
			}
		} else {
			console.warn('未找到 network 节点！');
		}
	} catch (e) {
		console.error('解析 DSN 层/网络失败:', e);
	}

	// 如果没有找到层信息，默认添加 2 层
	if (info.layers.length === 0) {
		info.layers.push({ id: 0, name: 'Top' });
		info.layers.push({ id: 1, name: 'Bottom' });
	}

	return info;
}

//file onload handler
function handleOnLoad(evt) {
	//the onload get a string of the dsn file
	let content = evt.target.result;
	originalFile = content; // 保存原始内容
	isJlcConverted = false;

	// 检查是否需要 JLC 格式转换
	if (document.getElementById('jlc_convert').checked) {
		try {
			content = convertJlcToKicad(content);
			isJlcConverted = true;
			console.log('JLC 格式已转换');
		} catch (err) {
			console.error('JLC 转换失败:', err);
			alert('JLC 格式转换失败: ' + err.message);
		}
	}

	file = content;

	// 解析并初始化新面板
	try {
		const dsnInfo = parseDsnInfo(content); // 从转换后的 content 解析，不是 originalFile
		console.log('解析 DSN:', { nets: dsnInfo.nets.length, layers: dsnInfo.layers.length, bounds: null });
		if (dsnInfo.nets.length > 0) {
			console.log(
				'识别到的网络:',
				dsnInfo.nets.slice(0, 5).map((n) => n.name),
			); // 只输出前5个
		}
		if (dsnInfo.layers.length > 0) {
			console.log(
				'识别到的层:',
				dsnInfo.layers.map((l) => l.name),
			);
		}

		// 初始化层面板
		if (typeof initLayersPanel === 'function') {
			initLayersPanel(dsnInfo.layers);
		}

		// 初始化网络面板
		if (typeof initNetsPanel === 'function') {
			initNetsPanel(dsnInfo.nets);
		}
	} catch (e) {
		console.error('初始化层/网络面板失败:', e);
	}

	// 重置导出按钮
	document.getElementById('export_ses').disabled = true;
	lastPcbData = null;
}

//file selection handler
function handleFileSelect(evt) {
	//filelist
	let files = evt.target.files;
	let f = files[0];

	//dsn files only.
	if (f.name.match('.*[.]dsn')) {
		// 保存文件名
		fileName = f.name.replace('.dsn', '');

		//file reader
		let reader = new FileReader();

		//onload handler
		reader.onload = handleOnLoad;

		//read the dsn file
		reader.readAsText(f);
	}
}

// Resize handler to re-render SVG on window resize
window.addEventListener('resize', function () {
	if (lastPcbData) {
		// Re-render with auto-scaling
		js_pcb.view_pcb(lastPcbData, 0, 2);
	}
});

//register action handlers
document.getElementById('files').addEventListener('change', handleFileSelect, false);
document.getElementById('go').onclick = handleOnGo;
document.getElementById('export_ses').onclick = handleExportSes;
document.getElementById('clear_history').onclick = function () {
	historyRecords = [];
	persistHistory();
	renderHistory();
};

historyRecords = loadHistory();
renderHistory();

async function tryLoadDsnFromEda() {
	try {
		if (typeof eda === 'undefined' || !eda?.pcb_ManufactureData?.getDsnFile) return;
		console.log('[jspcb][eda] getDsnFile...');
		eda?.sys_Message?.showToastMessage?.('正在导出 DSN...', 'info', 2);
		const dsnFile = await eda.pcb_ManufactureData.getDsnFile();
		const dsnContent = typeof dsnFile === 'string' ? dsnFile : await dsnFile.text();
		console.log('[jspcb][eda] DSN length', dsnContent.length);

		const checkbox = document.getElementById('jlc_convert');
		if (checkbox) checkbox.checked = true;

		const info = typeof parseDsnInfo === 'function' ? parseDsnInfo(dsnContent) : null;
		if (info && info.fileName) fileName = info.fileName;
		handleOnLoad({ target: { result: dsnContent } });
		eda?.sys_Message?.showToastMessage?.('DSN 已载入', 'success', 2);
	} catch (e) {
		console.error('[jspcb][eda] load DSN failed', e);
		eda?.sys_Message?.showToastMessage?.('DSN 导出失败', 'error', 6);
	}
}

try {
	const isEda = typeof eda !== 'undefined' && !!eda?.pcb_ManufactureData?.getDsnFile;
	const fileInputWrapper = document.getElementById('file_input_wrapper');
	const edaInputGroup = document.getElementById('eda_input_group');
	const loadBtn = document.getElementById('load_dsn_eda');
	const exportBtn = document.getElementById('export_ses');

	if (isEda) {
		if (fileInputWrapper) fileInputWrapper.style.display = 'none';
		if (edaInputGroup) edaInputGroup.style.display = 'flex';
		if (exportBtn) exportBtn.innerText = '导入 SES';
		if (loadBtn) {
			loadBtn.onclick = function () {
				tryLoadDsnFromEda();
			};
		}
		tryLoadDsnFromEda();
	} else {
		if (exportBtn) exportBtn.innerText = '导出 SES';
	}
} catch (e) {
	console.error('[jspcb] init ui failed', e);
}
