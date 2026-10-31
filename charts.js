// Traffic Pulse - High-Performance Zero-Dependency Canvas Charting
// Ultra-low latency, custom glow styling, responsive canvas charts

class TrafficCharts {
  static setupHiDPI(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || canvas.width;
    const h = rect.height || canvas.height;
    
    // Only adjust if dimensions changed
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, width: w, height: h };
  }

  // 1. Dual Line Timeline Chart (Speed vs Congestion)
  static renderTimeline(canvas, history) {
    if (!canvas) return;
    const { ctx, width: w, height: h } = this.setupHiDPI(canvas);
    ctx.clearRect(0, 0, w, h);

    const padLeft = 40;
    const padRight = 40;
    const padTop = 20;
    const padBottom = 26;
    const chartW = w - padLeft - padRight;
    const chartH = h - padTop - padBottom;

    if (chartW <= 0 || chartH <= 0) return;

    // Background horizontal grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 4; i++) {
      const y = padTop + (chartH / 4) * i;
      ctx.moveTo(padLeft, y);
      ctx.lineTo(w - padRight, y);
    }
    ctx.stroke();

    // Y Axis Labels
    ctx.fillStyle = '#64748b';
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('70 km/h', padLeft - 6, padTop);
    ctx.fillText('35 km/h', padLeft - 6, padTop + chartH * 0.5);
    ctx.fillText('0', padLeft - 6, padTop + chartH);

    ctx.textAlign = 'left';
    ctx.fillText('100%', w - padRight + 6, padTop);
    ctx.fillText('50%', w - padRight + 6, padTop + chartH * 0.5);
    ctx.fillText('0%', w - padRight + 6, padTop + chartH);

    const dataLen = history.avgSpeed.length;
    if (dataLen < 2) return;

    const stepX = chartW / (dataLen - 1);

    // 1. Speed Line (Cyan)
    ctx.beginPath();
    for (let i = 0; i < dataLen; i++) {
      const x = padLeft + i * stepX;
      const speedNorm = Math.min(1, Math.max(0, history.avgSpeed[i] / 70));
      const y = padTop + chartH * (1 - speedNorm);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Glowing tip dot for speed
    const lastX = padLeft + (dataLen - 1) * stepX;
    const lastSpeedNorm = Math.min(1, Math.max(0, history.avgSpeed[dataLen - 1] / 70));
    const lastSpeedY = padTop + chartH * (1 - lastSpeedNorm);
    ctx.fillStyle = '#00f0ff';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(lastX, lastSpeedY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // 2. Congestion Index Line (Amber / Red)
    ctx.beginPath();
    for (let i = 0; i < dataLen; i++) {
      const x = padLeft + i * stepX;
      const congNorm = Math.min(1, Math.max(0, history.congestionIndex[i] / 100));
      const y = padTop + chartH * (1 - congNorm);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2.0;
    ctx.shadowColor = '#f59e0b';
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Glowing tip dot for congestion
    const lastCongNorm = Math.min(1, Math.max(0, history.congestionIndex[dataLen - 1] / 100));
    const lastCongY = padTop + chartH * (1 - lastCongNorm);
    ctx.fillStyle = '#f59e0b';
    ctx.shadowColor = '#f59e0b';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(lastX, lastCongY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // X Axis recent timestamp
    ctx.fillStyle = '#475569';
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('LIVE (T-0s)', w - padRight, h - 6);
    ctx.textAlign = 'left';
    ctx.fillText('T-45s', padLeft, h - 6);
  }

  // 2. Corridor Volume & Queue Bar Chart
  static renderCorridorBars(canvas, queues, counts) {
    if (!canvas) return;
    const { ctx, width: w, height: h } = this.setupHiDPI(canvas);
    ctx.clearRect(0, 0, w, h);

    const corridors = [
      { key: 'N', label: 'Northbound', count: counts.N || 0, queue: queues.N || 0 },
      { key: 'S', label: 'Southbound', count: counts.S || 0, queue: queues.S || 0 },
      { key: 'E', label: 'Eastbound', count: counts.E || 0, queue: queues.E || 0 },
      { key: 'W', label: 'Westbound', count: counts.W || 0, queue: queues.W || 0 }
    ];

    const padLeft = 70;
    const padRight = 45;
    const padTop = 15;
    const padBottom = 15;
    const barAreaH = h - padTop - padBottom;
    const rowH = barAreaH / 4;
    const maxVal = Math.max(8, ...corridors.map(c => Math.max(c.count, c.queue * 2)));

    corridors.forEach((c, idx) => {
      const y = padTop + idx * rowH;

      // Label
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.label, 8, y + rowH * 0.35);

      const barMaxW = w - padLeft - padRight;
      const countW = Math.max(4, (c.count / maxVal) * barMaxW);
      const queueW = Math.max(0, (c.queue / maxVal) * barMaxW);

      // Track background
      ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.beginPath();
      ctx.roundRect(padLeft, y + 4, barMaxW, 14, 3);
      ctx.fill();

      // Total vehicles bar (Cyan)
      ctx.fillStyle = 'rgba(56, 189, 248, 0.7)';
      ctx.beginPath();
      ctx.roundRect(padLeft, y + 4, countW, 14, 3);
      ctx.fill();

      // Queue portion (Red accent overlay)
      if (queueW > 0) {
        ctx.fillStyle = '#ef4444';
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.roundRect(padLeft, y + 4, queueW, 14, 3);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Stats text
      ctx.fillStyle = '#cbd5e1';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${c.count} (${c.queue} wait)`, padLeft + countW + 8, y + rowH * 0.45);
    });
  }

  // 3. Fleet Breakdown Donut Chart
  static renderFleetDonut(canvas, fleet) {
    if (!canvas) return;
    const { ctx, width: w, height: h } = this.setupHiDPI(canvas);
    ctx.clearRect(0, 0, w, h);

    const centerX = w * 0.38;
    const centerY = h * 0.5;
    const radius = Math.min(centerX, centerY) - 12;
    const innerRadius = radius * 0.62;

    const data = [
      { label: 'Sedans', val: fleet.SEDAN || 0, color: '#38bdf8' },
      { label: 'EVs', val: fleet.EV_SPORTS || 0, color: '#00f0ff' },
      { label: 'Taxis', val: fleet.TAXI || 0, color: '#fbbf24' },
      { label: 'Vans', val: fleet.DELIVERY_VAN || 0, color: '#94a3b8' },
      { label: 'Trucks', val: fleet.SEMI_TRUCK || 0, color: '#f97316' },
      { label: 'Bikes', val: fleet.MOTORCYCLE || 0, color: '#22c55e' },
      { label: 'Emergency', val: fleet.AMBULANCE || 0, color: '#ef4444' }
    ];

    const total = data.reduce((acc, d) => acc + d.val, 0);

    if (total === 0) {
      // Empty placeholder ring
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = radius - innerRadius;
      ctx.beginPath();
      ctx.arc(centerX, centerY, (radius + innerRadius) / 2, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      let startAngle = -Math.PI / 2;
      for (const d of data) {
        if (d.val === 0) continue;
        const sliceAngle = (d.val / total) * Math.PI * 2;
        const endAngle = startAngle + sliceAngle;

        ctx.strokeStyle = d.color;
        ctx.lineWidth = radius - innerRadius;
        ctx.beginPath();
        ctx.arc(centerX, centerY, (radius + innerRadius) / 2, startAngle, endAngle);
        ctx.stroke();

        startAngle = endAngle;
      }
    }

    // Center Fleet Count
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${total}`, centerX, centerY - 4);
    ctx.fillStyle = '#64748b';
    ctx.font = '8px monospace';
    ctx.fillText('UNITS', centerX, centerY + 10);

    // Legend on the right
    const legX = w * 0.66;
    let legY = 16;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    data.slice(0, 5).forEach(d => {
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(legX, legY, 3.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px monospace';
      ctx.fillText(`${d.label}: ${d.val}`, legX + 8, legY);
      legY += 15;
    });
  }

  // 4. Congestion Speedometer Gauge
  static renderCongestionGauge(canvas, congestionScore) {
    if (!canvas) return;
    const { ctx, width: w, height: h } = this.setupHiDPI(canvas);
    ctx.clearRect(0, 0, w, h);

    const centerX = w * 0.5;
    const centerY = h * 0.72;
    const radius = Math.min(w * 0.42, h * 0.58);

    const startAngle = Math.PI * 0.85;
    const endAngle = Math.PI * 2.15;
    const totalAngle = endAngle - startAngle;

    // Background track
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    ctx.stroke();

    // Active colored arc
    const scoreNorm = Math.min(1, Math.max(0, congestionScore / 100));
    const currentAngle = startAngle + totalAngle * scoreNorm;

    // Color interpolation
    let gaugeColor = '#10b981'; // Green
    if (congestionScore > 65) gaugeColor = '#ef4444'; // Red
    else if (congestionScore > 35) gaugeColor = '#f59e0b'; // Amber

    ctx.strokeStyle = gaugeColor;
    ctx.shadowColor = gaugeColor;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, startAngle, currentAngle);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Digital readout inside gauge
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${congestionScore}%`, centerX, centerY - 6);

    ctx.fillStyle = gaugeColor;
    ctx.font = 'bold 9px monospace';
    let statusText = 'OPTIMAL FLOW';
    if (congestionScore > 65) statusText = 'HEAVY CONGESTION';
    else if (congestionScore > 35) statusText = 'MODERATE TRAFFIC';
    ctx.fillText(statusText, centerX, centerY + 12);
  }
}

window.TrafficCharts = TrafficCharts;
