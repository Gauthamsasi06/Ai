// Traffic Pulse - Real-time Analytics & AI Insights Engine

class TrafficInsights {
  constructor(engine) {
    this.engine = engine;
    this.logs = [];
    this.maxLogs = 60;
    this.analysisTimer = 0;
    this.totalEmissionsKg = 0.042; // baseline counter

    // Historical data buffer for rolling charts (last 60 seconds)
    this.history = {
      timestamps: [],
      avgSpeed: [],
      congestionIndex: [],
      throughput: [],
      emissionsRate: []
    };

    // Pre-populate initial 30s history so charts start lively
    const now = Date.now();
    for (let i = 29; i >= 0; i--) {
      this.history.timestamps.push(new Date(now - i * 1000).toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' }));
      this.history.avgSpeed.push(42 + Math.random() * 8);
      this.history.congestionIndex.push(18 + Math.random() * 12);
      this.history.throughput.push(36 + Math.floor(Math.random() * 10));
      this.history.emissionsRate.push(1.8 + Math.random() * 0.4);
    }

    // Add initial system boot log
    this.addLog('SUCCESS', 'Traffic Pulse Command AI v3.8 initialized. Grid sensors online.');
    this.addLog('INFO', 'Intelligent Driver Model (IDM) & Adaptive Signal Optimization active.');
  }

  addLog(type, message) {
    const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    this.logs.unshift({
      id: Date.now() + Math.random(),
      time: timestamp,
      type, // 'CRITICAL', 'WARNING', 'INFO', 'SUCCESS', 'AI_OPTIMIZATION'
      message
    });
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }
  }

  computeMetrics() {
    const vehicles = this.engine.vehicles;
    const totalVehicles = vehicles.length;

    let totalSpeed = 0;
    let totalWaitTime = 0;
    let totalEco = 0;
    let stoppedCount = 0;
    let crawlingCount = 0; // < 20 km/h
    let cruisingCount = 0; // >= 20 km/h

    // Corridor queues
    const queues = { N: 0, S: 0, E: 0, W: 0 };
    const counts = { N: 0, S: 0, E: 0, W: 0 };

    // Fleet breakdown
    const fleet = {
      SEDAN: 0,
      EV_SPORTS: 0,
      TAXI: 0,
      DELIVERY_VAN: 0,
      SEMI_TRUCK: 0,
      AMBULANCE: 0,
      MOTORCYCLE: 0
    };

    let instantEmissions = 0;

    for (const v of vehicles) {
      const kmh = v.speed * 18;
      totalSpeed += kmh;
      totalWaitTime += v.waitTime;
      totalEco += v.ecoScore;
      instantEmissions += (v.state === 'stopped' ? 0.08 : v.state === 'accelerating' ? 0.09 : 0.04) * v.weight;

      if (v.speed < 0.3) {
        stoppedCount++;
        queues[v.route.origin]++;
      } else if (kmh < 22) {
        crawlingCount++;
      } else {
        cruisingCount++;
      }

      counts[v.route.origin]++;
      if (fleet[v.typeKey] !== undefined) fleet[v.typeKey]++;
    }

    const avgSpeed = totalVehicles > 0 ? (totalSpeed / totalVehicles) : 55;
    const meanWaitTime = totalVehicles > 0 ? (totalWaitTime / totalVehicles) : 0;
    const avgEcoScore = totalVehicles > 0 ? Math.round(totalEco / totalVehicles) : 92;

    // Congestion Index (0% to 100%)
    // Based on ratio of stopped & crawling vehicles + speed deficit from free-flow speed (55 km/h)
    const freeFlowSpeed = 55;
    const speedDeficit = Math.max(0, (freeFlowSpeed - avgSpeed) / freeFlowSpeed);
    const stoppedRatio = totalVehicles > 0 ? (stoppedCount / totalVehicles) : 0;
    const rawCongestion = (speedDeficit * 0.6 + stoppedRatio * 0.4) * 100;
    const congestionIndex = Math.min(100, Math.max(4, Math.round(rawCongestion)));

    // Cumulative CO2
    this.totalEmissionsKg += (instantEmissions * 0.001);

    // Current throughput (per min)
    const currentThroughput = this.engine.throughputHistory.length > 0 
      ? this.engine.throughputHistory[this.engine.throughputHistory.length - 1] 
      : 36;

    return {
      totalVehicles,
      avgSpeed: Math.round(avgSpeed * 10) / 10,
      congestionIndex,
      meanWaitTime: Math.round(meanWaitTime * 10) / 10,
      stoppedCount,
      crawlingCount,
      cruisingCount,
      avgEcoScore,
      totalEmissionsKg: Math.round(this.totalEmissionsKg * 100) / 100,
      instantEmissionsRate: Math.round(instantEmissions * 10) / 10,
      currentThroughput,
      totalPassed: this.engine.totalVehiclesPassed,
      queues,
      counts,
      fleet
    };
  }

  update(dt) {
    this.analysisTimer += dt;

    // Sample history once every 1.5 seconds
    if (this.analysisTimer >= 1.5) {
      this.analysisTimer = 0;
      const m = this.computeMetrics();

      const timeStr = new Date().toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' });
      this.history.timestamps.push(timeStr);
      this.history.avgSpeed.push(m.avgSpeed);
      this.history.congestionIndex.push(m.congestionIndex);
      this.history.throughput.push(m.currentThroughput);
      this.history.emissionsRate.push(m.instantEmissionsRate);

      if (this.history.timestamps.length > 30) {
        this.history.timestamps.shift();
        this.history.avgSpeed.shift();
        this.history.congestionIndex.shift();
        this.history.throughput.shift();
        this.history.emissionsRate.shift();
      }

      // Run AI heuristic evaluation & advice
      this.evaluateGridHealth(m);
    }
  }

  evaluateGridHealth(metrics) {
    // 1. High congestion check
    if (metrics.congestionIndex > 65 && Math.random() < 0.25) {
      this.addLog('CRITICAL', `Grid congestion reached ${metrics.congestionIndex}%. Activating adaptive green phase stretch.`);
    }

    // 2. Severe queue on single corridor
    const maxQueueDir = Object.keys(metrics.queues).reduce((a, b) => metrics.queues[a] > metrics.queues[b] ? a : b);
    if (metrics.queues[maxQueueDir] >= 4 && Math.random() < 0.3) {
      const dirNames = { N: 'Northbound', S: 'Southbound', E: 'Eastbound', W: 'Westbound' };
      this.addLog('WARNING', `Queue bottleneck detected on ${dirNames[maxQueueDir]} corridor (${metrics.queues[maxQueueDir]} waiting).`);
    }

    // 3. Excellent green wave flow
    if (metrics.congestionIndex < 25 && metrics.currentThroughput > 42 && Math.random() < 0.15) {
      this.addLog('SUCCESS', `Optimal Green Wave flow achieved. Grid throughput sustained at ${metrics.currentThroughput} veh/min.`);
    }

    // 4. Eco rating advisory
    if (metrics.avgEcoScore < 70 && Math.random() < 0.2) {
      this.addLog('AI_OPTIMIZATION', `High stop-and-go cycles detected. Eco score at ${metrics.avgEcoScore}%. Re-timing signal yellow buffers.`);
    }

    // 5. Weather advisory
    if (this.engine.weather === 'RAIN' && Math.random() < 0.12) {
      this.addLog('INFO', 'Precipitation active: Hydroplaning safeguards engaged. Target headways widened by 25%.');
    }
  }

  getRecommendations() {
    const m = this.computeMetrics();
    const recs = [];

    if (m.congestionIndex > 50) {
      recs.push({
        title: 'Extend Green Phase on High-Volume Arteries',
        desc: `Current congestion is ${m.congestionIndex}%. Dynamically extending green time by 4.5s relieves queue pressure.`,
        badge: 'HIGH IMPACT',
        color: 'text-amber-400 border-amber-500/30 bg-amber-500/10'
      });
    } else {
      recs.push({
        title: 'Synchronized Green Wave Corridor Active',
        desc: 'Intersections are operating within balanced thresholds, maximizing vehicle momentum.',
        badge: 'OPTIMAL',
        color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
      });
    }

    if (m.queues.W > 3 || m.queues.E > 3) {
      recs.push({
        title: 'East-West Expressway Divert Recommended',
        desc: 'Queue depth exceeds 3 vehicles. Variable message signage (VMS) can divert 18% of traffic to arterial bypasses.',
        badge: 'ROUTING',
        color: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10'
      });
    }

    if (m.instantEmissionsRate > 2.8) {
      recs.push({
        title: 'Eco-Throttle Speed Harmonization',
        desc: 'Smooth deceleration profiles can mitigate excess idling fuel burns by up to 21%.',
        badge: 'ECO',
        color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
      });
    }

    if (this.engine.hazards.length > 0) {
      recs.push({
        title: 'Active Work Zone Warning Protocol',
        desc: `${this.engine.hazards.length} obstruction zones active. Early lane-change advisory reduces abrupt merging friction.`,
        badge: 'SAFETY',
        color: 'text-rose-400 border-rose-500/30 bg-rose-500/10'
      });
    }

    return recs;
  }
}

window.TrafficInsights = TrafficInsights;
