// ============================================
// FLOOD PREVENTION SIMULATION - FRONTEND
// ============================================

let currentData = null;
let isCustom = false;

// ---- LOAD PRESET ----
async function loadPreset(presetName) {
    try {
        const response = await fetch(`/api/preset/${presetName}`);
        const data = await response.json();
        currentData = data;
        isCustom = (presetName === 'custom');

        // Show scenario info
        document.getElementById('scenario-info').style.display = 'block';
        document.getElementById('scenario-title').textContent = data.name;
        document.getElementById('scenario-desc').textContent = data.description;
        document.getElementById('meta-reservoirs').textContent = `🏗️ ${data.num_reservoirs} Reservoirs`;
        document.getElementById('meta-drains').textContent = `🚰 ${data.num_drains} Drainage Channels`;
        document.getElementById('meta-rainfall').textContent = `🌧️ ${data.rainfall_intensity}`;

        // Show config section
        document.getElementById('config-section').style.display = 'block';
        document.getElementById('dimension-controls').style.display = isCustom ? 'block' : 'none';

        if (isCustom) {
            document.getElementById('num-reservoirs').value = data.num_reservoirs;
            document.getElementById('num-drains').value = data.num_drains;
        }

        buildUI(data);

        // Hide results and request sections
        document.getElementById('results-section').style.display = 'none';
        document.getElementById('request-section').style.display = 'none';
        document.getElementById('need-section').style.display = 'none';

        // Scroll to config
        document.getElementById('config-section').scrollIntoView({ behavior: 'smooth' });

    } catch (error) {
        console.error('Error loading preset:', error);
        alert('Error loading scenario. Please try again.');
    }
}

// ---- BUILD UI ----
function buildUI(data) {
    buildWaterLevels(data);
    buildAvailable(data);
    buildMatrix('allocation-container', data.allocation, data.num_reservoirs, data.num_drains, 
                data.reservoir_names || null, data.drain_names || null, 'alloc');
    buildMatrix('max-container', data.max_need, data.num_reservoirs, data.num_drains,
                data.reservoir_names || null, data.drain_names || null, 'max');
    buildRequestSection(data);
}

// ---- WATER LEVELS ----
function buildWaterLevels(data) {
    const container = document.getElementById('water-levels-container');
    container.innerHTML = '';

    if (!data.reservoir_water_levels) return;

    data.reservoir_water_levels.forEach((level, i) => {
        const name = data.reservoir_names ? data.reservoir_names[i] : `Reservoir R${i}`;
        let barClass = 'low';
        if (level > 85) barClass = 'critical';
        else if (level > 70) barClass = 'high';
        else if (level > 50) barClass = 'medium';

        const item = document.createElement('div');
        item.className = 'water-level-item';
        item.innerHTML = `
            <div class="name">${name}</div>
            <div class="water-bar-container">
                <div class="water-bar ${barClass}" style="width: ${level}%">${level}%</div>
            </div>
        `;
        container.appendChild(item);
    });
}

// ---- AVAILABLE VECTOR ----
function buildAvailable(data) {
    const container = document.getElementById('available-container');
    container.innerHTML = '';

    data.available.forEach((val, j) => {
        const drainName = data.drain_names ? data.drain_names[j] : `D${j}`;
        const wrapper = document.createElement('div');
        wrapper.innerHTML = `
            <span class="avail-label">${drainName}</span>
            <input type="number" class="avail-input" id="avail-${j}" 
                   value="${val}" min="0" ${isCustom ? '' : ''}>
        `;
        container.appendChild(wrapper);
    });
}

// ---- BUILD MATRIX TABLE ----
function buildMatrix(containerId, matrix, rows, cols, rowNames, colNames, prefix) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    let html = '<table class="matrix-table"><thead><tr><th></th>';
    for (let j = 0; j < cols; j++) {
        const colName = colNames ? colNames[j] : `D${j}`;
        html += `<th>${colName}</th>`;
    }
    html += '</tr></thead><tbody>';

    for (let i = 0; i < rows; i++) {
        const rowName = rowNames ? rowNames[i] : `Reservoir R${i}`;
        html += `<tr><td class="row-header">${rowName}</td>`;
        for (let j = 0; j < cols; j++) {
            const val = matrix[i] ? (matrix[i][j] || 0) : 0;
            html += `<td><input type="number" id="${prefix}-${i}-${j}" value="${val}" min="0"></td>`;
        }
        html += '</tr>';
    }
    html += '</tbody></table>';
    container.innerHTML = html;
}

// ---- REBUILD MATRICES (Custom mode) ----
function rebuildMatrices() {
    if (!isCustom) return;

    const nr = parseInt(document.getElementById('num-reservoirs').value) || 3;
    const nd = parseInt(document.getElementById('num-drains').value) || 3;

    const data = {
        num_reservoirs: nr,
        num_drains: nd,
        reservoir_names: Array.from({ length: nr }, (_, i) => `Reservoir R${i}`),
        drain_names: Array.from({ length: nd }, (_, j) => `Drain D${j}`),
        reservoir_water_levels: Array.from({ length: nr }, () => 50),
        allocation: Array.from({ length: nr }, () => Array(nd).fill(0)),
        max_need: Array.from({ length: nr }, () => Array(nd).fill(0)),
        available: Array(nd).fill(0),
    };

    currentData = { ...currentData, ...data };
    buildUI(data);
}

// ---- BUILD REQUEST SECTION ----
function buildRequestSection(data) {
    const select = document.getElementById('request-reservoir');
    select.innerHTML = '';
    for (let i = 0; i < data.num_reservoirs; i++) {
        const name = data.reservoir_names ? data.reservoir_names[i] : `Reservoir R${i}`;
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = name;
        select.appendChild(opt);
    }

    const container = document.getElementById('request-vector-container');
    container.innerHTML = '';
    for (let j = 0; j < data.num_drains; j++) {
        const drainName = data.drain_names ? data.drain_names[j] : `D${j}`;
        const wrapper = document.createElement('div');
        wrapper.innerHTML = `
            <span class="avail-label">${drainName}</span>
            <input type="number" class="avail-input" id="req-${j}" value="0" min="0">
        `;
        container.appendChild(wrapper);
    }
}

// ---- READ CURRENT VALUES FROM UI ----
function readCurrentValues() {
    const nr = currentData.num_reservoirs;
    const nd = currentData.num_drains;

    const available = [];
    for (let j = 0; j < nd; j++) {
        available.push(parseInt(document.getElementById(`avail-${j}`).value) || 0);
    }

    const allocation = [];
    for (let i = 0; i < nr; i++) {
        const row = [];
        for (let j = 0; j < nd; j++) {
            row.push(parseInt(document.getElementById(`alloc-${i}-${j}`).value) || 0);
        }
        allocation.push(row);
    }

    const max_need = [];
    for (let i = 0; i < nr; i++) {
        const row = [];
        for (let j = 0; j < nd; j++) {
            row.push(parseInt(document.getElementById(`max-${i}-${j}`).value) || 0);
        }
        max_need.push(row);
    }

    return { num_reservoirs: nr, num_drains: nd, available, allocation, max_need };
}

// ---- CHECK SAFETY ----
async function checkSafety() {
    const values = readCurrentValues();

    try {
        const response = await fetch('/api/check_safety', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(values)
        });

        const result = await response.json();

        if (result.error) {
            alert('Error: ' + result.error);
            return;
        }

        displayResults(result);
        displayNeedMatrix(result.need_matrix, values.num_reservoirs, values.num_drains);
        document.getElementById('request-section').style.display = 'block';

        document.getElementById('results-section').scrollIntoView({ behavior: 'smooth' });

    } catch (error) {
        console.error('Error:', error);
        alert('Error checking safety. Please verify your inputs.');
    }
}

// ---- DISPLAY RESULTS ----
function displayResults(result) {
    const section = document.getElementById('results-section');
    section.style.display = 'block';

    // Banner
    const banner = document.getElementById('result-banner');
    banner.className = `result-banner ${result.is_safe ? 'safe' : 'unsafe'}`;
    banner.textContent = result.message;

    // Safe Sequence
    const seqSection = document.getElementById('safe-sequence-section');
    const seqDisplay = document.getElementById('safe-sequence');
    if (result.safe_sequence && result.safe_sequence.length > 0) {
        seqSection.style.display = 'block';
        seqDisplay.innerHTML = '';
        result.safe_sequence.forEach((item, idx) => {
            const span = document.createElement('span');
            span.className = 'seq-item';
            span.textContent = item;
            seqDisplay.appendChild(span);

            if (idx < result.safe_sequence.length - 1) {
                const arrow = document.createElement('span');
                arrow.className = 'seq-arrow';
                arrow.textContent = '→';
                seqDisplay.appendChild(arrow);
            }
        });
    } else {
        seqSection.style.display = 'none';
    }

    // Flood Risk
    const floodSection = document.getElementById('flood-risk-section');
    const floodDisplay = document.getElementById('flood-risk');
    if (result.flood_risk_reservoirs && result.flood_risk_reservoirs.length > 0) {
        floodSection.style.display = 'block';
        floodDisplay.innerHTML = '';
        result.flood_risk_reservoirs.forEach(item => {
            const span = document.createElement('span');
            span.className = 'seq-item';
            span.textContent = item + ' ⚠️';
            floodDisplay.appendChild(span);
        });
    } else {
        floodSection.style.display = 'none';
    }

    // Steps
    const stepsSection = document.getElementById('steps-section');
    const stepsContainer = document.getElementById('steps-container');
    if (result.steps && result.steps.length > 0) {
        stepsSection.style.display = 'block';
        stepsContainer.innerHTML = '';
        result.steps.forEach((step, idx) => {
            const card = document.createElement('div');
            card.className = 'step-card';
            card.innerHTML = `
                <h4>Step ${idx + 1}: ${step.reservoir} completes drainage</h4>
                <div class="step-detail">
                    <div class="step-detail-item">
                        <div class="label">Available Before</div>
                        <div class="value">[${step.work_before.join(', ')}]</div>
                    </div>
                    <div class="step-detail-item">
                        <div class="label">Need</div>
                        <div class="value">[${step.need.join(', ')}]</div>
                    </div>
                    <div class="step-detail-item">
                        <div class="label">Allocation Released</div>
                        <div class="value">[${step.allocation.join(', ')}]</div>
                    </div>
                    <div class="step-detail-item">
                        <div class="label">Available After</div>
                        <div class="value">[${step.work_after.join(', ')}]</div>
                    </div>
                </div>
            `;
            stepsContainer.appendChild(card);
        });
    } else {
        stepsSection.style.display = 'none';
    }
}

// ---- DISPLAY NEED MATRIX ----
function displayNeedMatrix(needMatrix, nr, nd) {
    const section = document.getElementById('need-section');
    section.style.display = 'block';

    const container = document.getElementById('need-container');
    let html = '<table class="need-table"><thead><tr><th></th>';
    for (let j = 0; j < nd; j++) {
        const name = currentData.drain_names ? currentData.drain_names[j] : `D${j}`;
        html += `<th>${name}</th>`;
    }
    html += '</tr></thead><tbody>';

    for (let i = 0; i < nr; i++) {
        const name = currentData.reservoir_names ? currentData.reservoir_names[i] : `R${i}`;
        html += `<tr><td class="row-header">${name}</td>`;
        for (let j = 0; j < nd; j++) {
            const val = needMatrix[i][j];
            html += `<td>${val}</td>`;
        }
        html += '</tr>';
    }
    html += '</tbody></table>';
    container.innerHTML = html;
}

// ---- SUBMIT RELEASE REQUEST ----
async function submitRequest() {
    const values = readCurrentValues();
    const reservoirId = parseInt(document.getElementById('request-reservoir').value);
    const nd = values.num_drains;

    const requestVector = [];
    for (let j = 0; j < nd; j++) {
        requestVector.push(parseInt(document.getElementById(`req-${j}`).value) || 0);
    }

    // Check if all zeros
    if (requestVector.every(v => v === 0)) {
        alert('Please enter a non-zero request vector.');
        return;
    }

    const payload = {
        ...values,
        reservoir_id: reservoirId,
        request: requestVector
    };

    try {
        const response = await fetch('/api/request_release', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (result.error) {
            alert('Error: ' + result.error);
            return;
        }

        displayRequestResult(result, reservoirId, requestVector);

    } catch (error) {
        console.error('Error:', error);
        alert('Error submitting request. Please try again.');
    }
}

// ---- DISPLAY REQUEST RESULT ----
function displayRequestResult(result, reservoirId, requestVector) {
    const section = document.getElementById('request-result');
    section.style.display = 'block';

    const banner = document.getElementById('request-banner');
    if (result.granted) {
        banner.className = 'result-banner safe';
        banner.textContent = `✅ REQUEST GRANTED: Reservoir R${reservoirId} can safely use additional drainage [${requestVector.join(', ')}]`;
    } else {
        banner.className = 'result-banner unsafe';
        banner.textContent = `❌ REQUEST DENIED: ${result.reason}`;
    }

    const details = document.getElementById('request-details');
    let html = '';

    if (result.safe_sequence && result.safe_sequence.length > 0) {
        html += '<h4 style="margin-top:1rem;">Safe Sequence (after request):</h4>';
        html += '<div class="sequence-display">';
        result.safe_sequence.forEach((item, idx) => {
            html += `<span class="seq-item">${item}</span>`;
            if (idx < result.safe_sequence.length - 1) {
                html += '<span class="seq-arrow">→</span>';
            }
        });
        html += '</div>';
    }

    if (result.flood_risk_reservoirs && result.flood_risk_reservoirs.length > 0) {
        html += '<h4 style="margin-top:1rem; color: #e53e3e;">🚨 At-Risk Reservoirs:</h4>';
        html += '<div class="sequence-display danger-seq">';
        result.flood_risk_reservoirs.forEach(item => {
            html += `<span class="seq-item">${item} ⚠️</span>`;
        });
        html += '</div>';
    }

    if (result.steps && result.steps.length > 0) {
        html += '<h4 style="margin-top:1rem;">Step-by-Step:</h4>';
        result.steps.forEach((step, idx) => {
            html += `
                <div class="step-card">
                    <h4>Step ${idx + 1}: ${step.reservoir}</h4>
                    <div class="step-detail">
                        <div class="step-detail-item">
                            <div class="label">Work Before</div>
                            <div class="value">[${step.work_before.join(', ')}]</div>
                        </div>
                        <div class="step-detail-item">
                            <div class="label">Need</div>
                            <div class="value">[${step.need.join(', ')}]</div>
                        </div>
                        <div class="step-detail-item">
                            <div class="label">Released</div>
                            <div class="value">[${step.allocation.join(', ')}]</div>
                        </div>
                        <div class="step-detail-item">
                            <div class="label">Work After</div>
                            <div class="value">[${step.work_after.join(', ')}]</div>
                        </div>
                    </div>
                </div>
            `;
        });
    }

    details.innerHTML = html;

    section.scrollIntoView({ behavior: 'smooth' });
}