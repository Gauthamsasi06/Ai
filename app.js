// Traffic Pulse - Main Application Controller & UI Wiring

document.addEventListener('DOMContentLoaded', () => {
  const simCanvas = document.getElementById('simulation-canvas');
  if (!simCanvas) return;

  // Initialize Core Engines
  const engine = new TrafficEngine(simCanvas);
  const insights = new TrafficInsights(engine);
  window.simEngine = engine;
  window.simInsights = insights;

  // Hook engine event notifications into insights log
  engine.onInsightEvent = (type, msg) => {
    const logType = type === 'emergency' ? 'CRITICAL' : type === 'warning' ? 'WARNING' : type === 'alert' ? 'AI_OPTIMIZATION' : 'INFO';
    insights.addLog(logType, msg);
  };

  // Canvas elements for charts
  const timelineCanvas = document.getElementById('timeline-chart');
  const corridorCanvas = document.getElementById('corridor-chart');
  const fleetCanvas = document.getElementById('fleet-chart');
  const gaugeCanvas = document.getElementById('congestion-gauge-chart');

  // Interactive mode states
  let placeHazardMode = false;

  // Set up Canvas coordinate scaling
  function getCanvasCoords(e) {
    const rect = simCanvas.getBoundingClientRect();
    const scaleX = simCanvas.width / rect.width;
    const scaleY = simCanvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  // Click handler on canvas
  simCanvas.addEventListener('click', (e) => {
    const coords = getCanvasCoords(e);

    // 1. If in "Place Roadblock" mode
    if (placeHazardMode) {
      engine.addHazard(coords.x, coords.y);
      placeHazardMode = false;
      const hazardBtn = document.getElementById('btn-add-hazard');
      if (hazardBtn) {
        hazardBtn.classList.remove('active-mode');
        hazardBtn.innerText = '🚧 Place Road Hazard';
      }
      return;
    }

    // 2. Check if clicked an existing hazard to remove it
    for (let i = 0; i < engine.hazards.length; i++) {
      const h = engine.hazards[i];
      if (Math.hypot(coords.x - h.x, coords.y - h.y) <= h.radius + 10) {
        engine.hazards.splice(i, 1);
        if (window.trafficAudio) window.trafficAudio.playBlip(500, 0.05);
        insights.addLog('INFO', `Road hazard at (${Math.round(h.x)}, ${Math.round(h.y)}) removed by operator.`);
        return;
      }
    }

    // 3. Check if clicked a traffic light gantry to force switch
    const gantries = [
      { x: 512, y: 250 },
      { x: 688, y: 450 },
      { x: 500, y: 436 },
      { x: 700, y: 264 }
    ];
    for (const g of gantries) {
      if (Math.hypot(coords.x - g.x, coords.y - g.y) <= 32) {
        engine.forceSignalSwitch();
        insights.addLog('AI_OPTIMIZATION', 'Signal cycle manually triggered by operator click.');
        return;
      }
    }

    // 4. Check if clicked a vehicle to select it
    const clickedVehicle = engine.getVehicleAt(coords.x, coords.y);
    if (clickedVehicle) {
      engine.selectedVehicle = clickedVehicle;
      if (window.trafficAudio) window.trafficAudio.playBlip(780, 0.06);
      showVehicleInspector(clickedVehicle);
    } else {
      // If clicked on open road, drop a quick hazard if shift key or deselect
      if (e.shiftKey) {
        engine.addHazard(coords.x, coords.y);
      } else {
        engine.selectedVehicle = null;
        hideVehicleInspector();
      }
    }
  });

  // Cursor hover updates
  simCanvas.addEventListener('mousemove', (e) => {
    const coords = getCanvasCoords(e);
    const hoverVehicle = engine.getVehicleAt(coords.x, coords.y);
    const hoverHazard = engine.hazards.some(h => Math.hypot(coords.x - h.x, coords.y - h.y) <= h.radius + 10);
    const hoverGantry = [
      { x: 512, y: 250 }, { x: 688, y: 450 }, { x: 500, y: 436 }, { x: 700, y: 264 }
    ].some(g => Math.hypot(coords.x - g.x, coords.y - g.y) <= 32);

    if (placeHazardMode) {
      simCanvas.style.cursor = 'crosshair';
    } else if (hoverVehicle || hoverHazard || hoverGantry) {
      simCanvas.style.cursor = 'pointer';
    } else {
      simCanvas.style.cursor = 'default';
    }
  });

  // UI Buttons & Inputs
  const btnPause = document.getElementById('btn-pause');
  if (btnPause) {
    btnPause.addEventListener('click', () => {
      engine.isPaused = !engine.isPaused;
      btnPause.innerHTML = engine.isPaused ? '▶ Resume Sim' : '⏸ Pause';
      btnPause.classList.toggle('btn-paused', engine.isPaused);
      if (window.trafficAudio) window.trafficAudio.playBlip(520, 0.05);
    });
  }

  // Speed controls
  document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      engine.speedMultiplier = parseFloat(btn.dataset.speed || 1.0);
      if (window.trafficAudio) window.trafficAudio.playBlip(620, 0.04);
    });
  });

  // Spawn Rate Slider
  const spawnSlider = document.getElementById('spawn-rate-slider');
  const spawnRateVal = document.getElementById('spawn-rate-val');
  if (spawnSlider && spawnRateVal) {
    spawnSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      engine.spawnRate = val;
      spawnRateVal.innerText = `${val.toFixed(1)} /s`;
    });
  }

  // Signal Mode Selector
  const signalModeSelect = document.getElementById('signal-mode-select');
  if (signalModeSelect) {
    signalModeSelect.addEventListener('change', (e) => {
      engine.signalMode = e.target.value;
      insights.addLog('INFO', `Traffic light controller changed to: ${e.target.options[e.target.selectedIndex].text}`);
      if (window.trafficAudio) window.trafficAudio.playBlip(550, 0.05);
    });
  }

  // Weather Mode Buttons
  document.querySelectorAll('.weather-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.weather-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const w = btn.dataset.weather;
      engine.weather = w;
      insights.addLog('INFO', `Atmospheric condition updated to: ${w}`);
      if (window.trafficAudio) window.trafficAudio.playBlip(680, 0.05);
    });
  });

  // Spawn Emergency Vehicle
  const btnEmergency = document.getElementById('btn-emergency');
  if (btnEmergency) {
    btnEmergency.addEventListener('click', () => {
      engine.spawnRandomVehicle('AMBULANCE');
      if (window.trafficAudio) window.trafficAudio.playBlip(880, 0.08);
    });
  }

  // Place Road Hazard
  const btnAddHazard = document.getElementById('btn-add-hazard');
  if (btnAddHazard) {
    btnAddHazard.addEventListener('click', () => {
      placeHazardMode = !placeHazardMode;
      btnAddHazard.classList.toggle('active-mode', placeHazardMode);
      btnAddHazard.innerText = placeHazardMode ? '🎯 Click Road to Drop' : '🚧 Place Road Hazard';
      if (window.trafficAudio) window.trafficAudio.playBlip(440, 0.06);
    });
  }

  // Clear Road Hazards
  const btnClearHazards = document.getElementById('btn-clear-hazards');
  if (btnClearHazards) {
    btnClearHazards.addEventListener('click', () => {
      engine.clearHazards();
    });
  }

  // Force Signal Switch
  const btnForceSignal = document.getElementById('btn-force-signal');
  if (btnForceSignal) {
    btnForceSignal.addEventListener('click', () => {
      engine.forceSignalSwitch();
    });
  }

  // Audio FX Toggle
  const btnAudio = document.getElementById('btn-audio');
  if (btnAudio) {
    btnAudio.addEventListener('click', () => {
      if (window.trafficAudio) {
        const enabled = window.trafficAudio.toggleSound();
        btnAudio.innerHTML = enabled ? '🔊 Sound: ON' : '🔇 Sound: OFF';
        btnAudio.classList.toggle('active-sound', enabled);
      }
    });
  }

  // Reset Traffic Grid
  const btnReset = document.getElementById('btn-reset');
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      engine.vehicles = [];
      engine.hazards = [];
      engine.selectedVehicle = null;
      hideVehicleInspector();
      insights.addLog('INFO', 'Simulation grid reset. New traffic cycle initiated.');
      if (window.trafficAudio) window.trafficAudio.playBlip(400, 0.1);
    });
  }

  // Vehicle Inspector UI
  const inspectorPanel = document.getElementById('vehicle-inspector');
  const closeInspectorBtn = document.getElementById('close-inspector');
  if (closeInspectorBtn) {
    closeInspectorBtn.addEventListener('click', () => {
      engine.selectedVehicle = null;
      hideVehicleInspector();
    });
  }

  function showVehicleInspector(v) {
    if (!inspectorPanel) return;
    inspectorPanel.classList.remove('hidden');
    updateInspectorContent(v);
  }

  function hideVehicleInspector() {
    if (!inspectorPanel) return;
    inspectorPanel.classList.add('hidden');
  }

  function updateInspectorContent(v) {
    if (!inspectorPanel || !v) return;
    document.getElementById('insp-id').innerText = v.id;
    document.getElementById('insp-type').innerText = v.type;
    document.getElementById('insp-speed').innerText = `${Math.round(v.speed * 18)} km/h`;
    document.getElementById('insp-state').innerText = v.state.toUpperCase();
    document.getElementById('insp-state').className = `font-mono text-xs px-2 py-0.5 rounded font-bold ${
      v.state === 'cruising' ? 'bg-emerald-500/20 text-emerald-400' :
      v.state === 'braking' ? 'bg-amber-500/20 text-amber-400' :
      v.state === 'stopped' ? 'bg-rose-500/20 text-rose-400' : 'bg-cyan-500/20 text-cyan-400'
    }`;
    document.getElementById('insp-route').innerText = `${v.route.origin} → ${v.route.turn}`;
    document.getElementById('insp-wait').innerText = `${v.waitTime.toFixed(1)}s`;
    document.getElementById('insp-co2').innerText = `${v.co2Emitted.toFixed(2)} g`;
    document.getElementById('insp-eco').innerText = `${Math.round(v.ecoScore)}/100`;
  }

  // Recommendations and Event Log Renderers
  let recsTimer = 0;
  function updateRecommendationsList() {
    const listEl = document.getElementById('recommendations-list');
    if (!listEl) return;
    const recs = insights.getRecommendations();

    listEl.innerHTML = recs.map(r => `
      <div class="p-2.5 rounded-lg border border-slate-700/60 bg-slate-800/40 hover:bg-slate-800/70 transition-colors">
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs font-semibold text-slate-200">${r.title}</span>
          <span class="text-[10px] px-1.5 py-0.5 rounded border font-mono ${r.color}">${r.badge}</span>
        </div>
        <p class="text-[11px] text-slate-400 leading-relaxed">${r.desc}</p>
      </div>
    `).join('');
  }

  function updateLogsList() {
    const logContainer = document.getElementById('insights-feed');
    if (!logContainer) return;

    logContainer.innerHTML = insights.logs.slice(0, 15).map(item => {
      let badgeClass = 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10';
      if (item.type === 'CRITICAL') badgeClass = 'text-rose-400 border-rose-500/30 bg-rose-500/10';
      else if (item.type === 'WARNING') badgeClass = 'text-amber-400 border-amber-500/30 bg-amber-500/10';
      else if (item.type === 'SUCCESS') badgeClass = 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';

      return `
        <div class="flex items-start gap-2 py-1.5 border-b border-slate-800/70 text-[11px]">
          <span class="font-mono text-slate-500 text-[10px] pt-0.5 shrink-0">${item.time}</span>
          <span class="font-mono text-[9px] px-1 py-0.5 rounded border ${badgeClass} shrink-0">${item.type}</span>
          <span class="text-slate-300 leading-tight">${item.message}</span>
        </div>
      `;
    }).join('');
  }

  // Populate initial 8 random vehicles
  for (let i = 0; i < 8; i++) {
    engine.spawnRandomVehicle();
  }

  // Master Animation & Simulation Loop
  let lastTime = performance.now();
  let uiRefreshTimer = 0;

  function loop(currentTime) {
    const dt = (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    // 1. Update & Render Simulation
    engine.update(dt);
    engine.render();

    // 2. Update Analytics
    insights.update(dt);

    // 3. Throttle UI DOM and Chart refreshes (~15 times per second)
    uiRefreshTimer += dt;
    if (uiRefreshTimer >= 0.065) {
      uiRefreshTimer = 0;

      const m = insights.computeMetrics();

      // Update KPI Cards
      const elVehicles = document.getElementById('metric-vehicles');
      if (elVehicles) elVehicles.innerText = m.totalVehicles;

      const elSpeed = document.getElementById('metric-speed');
      if (elSpeed) elSpeed.innerText = `${m.avgSpeed} km/h`;

      const elCongestion = document.getElementById('metric-congestion');
      if (elCongestion) {
        elCongestion.innerText = `${m.congestionIndex}%`;
        elCongestion.className = `text-2xl font-black font-mono tracking-tight ${
          m.congestionIndex > 65 ? 'text-rose-400' :
          m.congestionIndex > 35 ? 'text-amber-400' : 'text-emerald-400'
        }`;
      }

      const elThroughput = document.getElementById('metric-throughput');
      if (elThroughput) elThroughput.innerText = `${m.currentThroughput} v/m`;

      const elWait = document.getElementById('metric-delay');
      if (elWait) elWait.innerText = `${m.meanWaitTime}s`;

      const elEmissions = document.getElementById('metric-emissions');
      if (elEmissions) elEmissions.innerText = `${m.instantEmissionsRate} g/s`;

      // Signal Phase Status Pills
      const elNsPhase = document.getElementById('signal-ns-pill');
      if (elNsPhase) {
        elNsPhase.innerText = `N-S: ${engine.signals.nsState} (${engine.signals.nsCountdown}s)`;
        elNsPhase.className = `font-mono text-xs px-2.5 py-1 rounded-full border ${
          engine.signals.nsState === 'GREEN' ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-400' :
          engine.signals.nsState === 'YELLOW' ? 'border-amber-500/50 bg-amber-500/20 text-amber-400' :
          'border-rose-500/50 bg-rose-500/20 text-rose-400'
        }`;
      }

      const elEwPhase = document.getElementById('signal-ew-pill');
      if (elEwPhase) {
        elEwPhase.innerText = `E-W: ${engine.signals.ewState} (${engine.signals.ewCountdown}s)`;
        elEwPhase.className = `font-mono text-xs px-2.5 py-1 rounded-full border ${
          engine.signals.ewState === 'GREEN' ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-400' :
          engine.signals.ewState === 'YELLOW' ? 'border-amber-500/50 bg-amber-500/20 text-amber-400' :
          'border-rose-500/50 bg-rose-500/20 text-rose-400'
        }`;
      }

      // Draw Charts
      TrafficCharts.renderTimeline(timelineCanvas, insights.history);
      TrafficCharts.renderCorridorBars(corridorCanvas, m.queues, m.counts);
      TrafficCharts.renderFleetDonut(fleetCanvas, m.fleet);
      TrafficCharts.renderCongestionGauge(gaugeCanvas, m.congestionIndex);

      // Selected Vehicle Inspector update
      if (engine.selectedVehicle) {
        updateInspectorContent(engine.selectedVehicle);
      }

      // Recommendations list
      recsTimer += dt;
      if (recsTimer > 1.2) {
        recsTimer = 0;
        updateRecommendationsList();
        updateLogsList();
      }
    }

    requestAnimationFrame(loop);
  }

  // Start Loop
  requestAnimationFrame(loop);
  updateRecommendationsList();
  updateLogsList();
});
