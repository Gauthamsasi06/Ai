// Traffic Pulse - High-Fidelity Real-time Traffic Simulation Engine
// Intelligent Driver Model (IDM) + MOBIL Lane Changing + Multi-Lane Corridor Geometry

const VEHICLE_CONFIGS = {
  SEDAN: {
    name: 'Sedan',
    length: 30,
    width: 16,
    maxSpeed: 4.2,
    accel: 0.12,
    decel: 0.22,
    colors: ['#38bdf8', '#818cf8', '#34d399', '#f43f5e', '#e2e8f0'],
    weight: 1.0,
    ecoBase: 88
  },
  EV_SPORTS: {
    name: 'Cyber EV',
    length: 28,
    width: 17,
    maxSpeed: 5.2,
    accel: 0.20,
    decel: 0.28,
    colors: ['#00f0ff', '#10b981', '#f59e0b', '#ec4899'],
    weight: 0.8,
    ecoBase: 96
  },
  TAXI: {
    name: 'Metro Taxi',
    length: 30,
    width: 16,
    maxSpeed: 4.0,
    accel: 0.14,
    decel: 0.24,
    colors: ['#fbbf24'],
    weight: 0.9,
    ecoBase: 82
  },
  DELIVERY_VAN: {
    name: 'Delivery Van',
    length: 38,
    width: 18,
    maxSpeed: 3.5,
    accel: 0.09,
    decel: 0.18,
    colors: ['#94a3b8', '#cbd5e1', '#64748b'],
    weight: 1.4,
    ecoBase: 78
  },
  SEMI_TRUCK: {
    name: '18-Wheeler Heavy',
    length: 56,
    width: 20,
    maxSpeed: 2.8,
    accel: 0.06,
    decel: 0.14,
    colors: ['#ef4444', '#3b82f6', '#f97316'],
    weight: 2.5,
    ecoBase: 65
  },
  AMBULANCE: {
    name: 'Emergency Unit',
    length: 36,
    width: 18,
    maxSpeed: 5.6,
    accel: 0.22,
    decel: 0.30,
    colors: ['#ffffff'],
    weight: 1.2,
    isEmergency: true,
    ecoBase: 85
  },
  MOTORCYCLE: {
    name: 'Motorbike',
    length: 20,
    width: 10,
    maxSpeed: 4.8,
    accel: 0.24,
    decel: 0.26,
    colors: ['#22c55e', '#e11d48', '#facc15'],
    weight: 0.4,
    ecoBase: 92
  }
};

class Vehicle {
  constructor(id, typeKey, route, laneIndex, startProgress = 0) {
    this.id = id;
    this.typeKey = typeKey;
    const cfg = VEHICLE_CONFIGS[typeKey];
    this.type = cfg.name;
    this.length = cfg.length;
    this.width = cfg.width;
    this.baseMaxSpeed = cfg.maxSpeed;
    this.maxSpeed = cfg.maxSpeed * (0.9 + Math.random() * 0.25);
    this.accel = cfg.accel;
    this.decel = cfg.decel;
    this.color = cfg.colors[Math.floor(Math.random() * cfg.colors.length)];
    this.isEmergency = !!cfg.isEmergency;
    this.weight = cfg.weight;

    this.route = route; // { origin: 'N'|'S'|'E'|'W', turn: 'STRAIGHT'|'LEFT'|'RIGHT' }
    this.lane = laneIndex; // 0 (outer) or 1 (inner) for directional side
    this.progress = startProgress; // position along path (pixels)
    this.speed = this.maxSpeed * 0.6;
    this.currentAccel = 0;
    
    // Smooth lane offset for lane changes (-1 to 1)
    this.laneOffset = 0;
    this.targetLaneOffset = 0;
    this.isChangingLane = false;
    this.laneChangeTimer = 0;

    // Physical position in world
    this.x = 0;
    this.y = 0;
    this.angle = 0;

    // Telemetry & metrics
    this.state = 'cruising'; // cruising, braking, stopped, turning, rerouting
    this.waitTime = 0;
    this.totalTime = 0;
    this.distanceTraveled = 0;
    this.co2Emitted = 0; // grams
    this.ecoScore = cfg.ecoBase;
    this.indicator = 'none'; // 'left', 'right', 'none'
    this.indicatorBlink = false;

    // Path waypoints calculated dynamically
    this.path = [];
    this.buildPath();
    this.updatePosition();
  }

  buildPath() {
    this.path = TrafficEngine.computeRoutePath(this.route.origin, this.route.turn, this.lane);
    this.totalPathLength = TrafficEngine.getPathLength(this.path);
  }

  updatePosition() {
    const pointInfo = TrafficEngine.getPointOnPath(this.path, this.progress);
    if (!pointInfo) return;

    // Apply lane offset perpendicular to path heading
    const perpAngle = pointInfo.angle + Math.PI / 2;
    this.x = pointInfo.x + Math.cos(perpAngle) * this.laneOffset;
    this.y = pointInfo.y + Math.sin(perpAngle) * this.laneOffset;
    this.angle = pointInfo.angle;
  }

  update(dt, engine) {
    this.totalTime += dt;
    this.distanceTraveled += this.speed;

    // Indicator blink timing
    if (this.indicator !== 'none') {
      this.indicatorBlink = Math.floor(Date.now() / 320) % 2 === 0;
    } else {
      this.indicatorBlink = false;
    }

    // Weather impact on friction & top speed
    let effectiveMaxSpeed = this.maxSpeed;
    let effectiveDecel = this.decel;
    if (engine.weather === 'RAIN') {
      effectiveMaxSpeed *= 0.82;
      effectiveDecel *= 0.75;
    }

    // Identify obstacles & lead vehicle
    const leadInfo = engine.findLeadVehicle(this);
    const signalInfo = engine.checkSignalObstacle(this);
    const hazardInfo = engine.checkHazardObstacle(this);
    const ambulanceInfo = engine.checkAmbulanceYield(this);

    // Calculate Intelligent Driver Model (IDM) acceleration
    let targetSpeed = effectiveMaxSpeed;
    if (this.route.turn !== 'STRAIGHT' && this.isInIntersectionZone()) {
      targetSpeed = Math.min(effectiveMaxSpeed, 2.2); // Slow down for turn
      this.state = 'turning';
    }

    // Determine nearest obstacle headway (s) and relative speed (deltaV)
    let s = 9999;
    let deltaV = 0;
    let obstacleReason = 'clear';

    if (leadInfo && leadInfo.gap < s) {
      s = leadInfo.gap;
      deltaV = this.speed - leadInfo.vehicle.speed;
      obstacleReason = 'lead';
    }

    if (signalInfo && signalInfo.gap < s) {
      s = signalInfo.gap;
      deltaV = this.speed; // Signal is stationary
      obstacleReason = 'signal';
    }

    if (hazardInfo && hazardInfo.gap < s) {
      s = hazardInfo.gap;
      deltaV = this.speed;
      obstacleReason = 'hazard';
    }

    if (ambulanceInfo && ambulanceInfo.shouldYield) {
      targetSpeed = Math.max(1.0, this.speed * 0.5);
    }

    // IDM Equation:
    // s* = s0 + v * T + (v * deltaV) / (2 * sqrt(a * b))
    const s0 = 22; // minimum bumper distance
    const T = 1.2; // comfortable time headway (seconds)
    const a = this.accel;
    const b = effectiveDecel;

    const sStar = s0 + Math.max(0, this.speed * T + (this.speed * deltaV) / (2 * Math.sqrt(a * b)));
    const freeRoadTerm = 1 - Math.pow(Math.max(0, this.speed / Math.max(0.1, targetSpeed)), 4);
    const interactionTerm = Math.pow(sStar / Math.max(0.1, s), 2);

    let rawAccel = a * (freeRoadTerm - interactionTerm);
    rawAccel = Math.max(-b * 1.8, Math.min(a, rawAccel));
    this.currentAccel = rawAccel;

    // Apply acceleration
    this.speed = Math.max(0, this.speed + rawAccel);

    // State tracking
    if (this.speed < 0.25) {
      this.state = 'stopped';
      this.waitTime += dt;
      // High idle penalty
      this.co2Emitted += 0.08 * dt * this.weight;
      this.ecoScore = Math.max(10, this.ecoScore - 0.04 * dt);
    } else if (rawAccel < -0.15) {
      this.state = 'braking';
      this.co2Emitted += 0.05 * dt * this.weight;
    } else if (rawAccel > 0.08) {
      this.state = 'accelerating';
      this.co2Emitted += 0.09 * dt * this.weight;
    } else {
      if (this.state !== 'turning') this.state = 'cruising';
      this.co2Emitted += 0.03 * dt * this.weight;
    }

    // Lane offset animation for lane changes
    if (this.isChangingLane) {
      this.laneChangeTimer += dt;
      this.laneOffset += (this.targetLaneOffset - this.laneOffset) * 0.08;
      if (Math.abs(this.laneOffset - this.targetLaneOffset) < 0.5) {
        this.laneOffset = 0;
        this.targetLaneOffset = 0;
        this.isChangingLane = false;
        this.indicator = 'none';
        this.buildPath();
      }
    } else {
      // Evaluate MOBIL Lane Change opportunity
      this.considerLaneChange(engine, leadInfo, hazardInfo);
    }

    // Advance vehicle along path
    this.progress += this.speed;
    this.updatePosition();
  }

  considerLaneChange(engine, leadInfo, hazardInfo) {
    if (this.isChangingLane || this.isInIntersectionZone()) return;
    if (this.route.turn !== 'STRAIGHT') return; // Stay in lane designated for turn

    // Determine target lane
    const currentLane = this.lane;
    const canGoToOtherLane = (currentLane === 0) ? 1 : 0;

    let desireChange = false;
    let reason = '';

    // If hazard ahead in current lane, change immediately!
    if (hazardInfo && hazardInfo.gap < 160) {
      desireChange = true;
      reason = 'hazard';
    } else if (leadInfo && leadInfo.gap < 60 && leadInfo.vehicle.speed < this.maxSpeed * 0.5) {
      desireChange = true;
      reason = 'overtake';
    }

    if (desireChange) {
      const isClear = engine.isLaneClearForMerge(this, canGoToOtherLane);
      if (isClear) {
        this.isChangingLane = true;
        this.lane = canGoToOtherLane;
        this.targetLaneOffset = (canGoToOtherLane > currentLane) ? 34 : -34;
        this.laneOffset = (canGoToOtherLane > currentLane) ? -34 : 34;
        this.indicator = canGoToOtherLane > currentLane ? 'right' : 'left';
      }
    }
  }

  isInIntersectionZone() {
    return this.x >= 500 && this.x <= 700 && this.y >= 250 && this.y <= 450;
  }
}

class TrafficEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.vehicles = [];
    this.vehicleIdCounter = 1000;
    this.hazards = []; // { id, x, y, radius: 24, label: 'Road Work' }

    // Simulation settings
    this.spawnRate = 1.4; // vehicles per second average
    this.spawnTimer = 0;
    this.speedMultiplier = 1.0;
    this.isPaused = false;
    this.weather = 'NIGHT'; // 'DAY', 'NIGHT', 'RAIN'
    this.signalMode = 'ADAPTIVE_AI'; // 'ADAPTIVE_AI', 'FIXED_TIMER', 'GREEN_WAVE', 'MANUAL'

    // Rain particles
    this.rainDrops = [];
    this.initRain();

    // Selection
    this.selectedVehicle = null;

    // Traffic light controller
    this.signals = {
      // 0: NS Green, EW Red
      // 1: NS Yellow, EW Red
      // 2: All Red
      // 3: EW Green, NS Red
      // 4: EW Yellow, NS Red
      // 5: All Red
      phase: 0,
      timer: 0,
      phaseDurations: [14, 3.5, 1.5, 14, 3.5, 1.5],
      nsState: 'GREEN', // 'GREEN', 'YELLOW', 'RED'
      ewState: 'RED',
      nsCountdown: 14,
      ewCountdown: 19,
      emergencyOverride: false,
      emergencyDirection: null
    };

    // Performance & metrics accumulation
    this.throughputHistory = [];
    this.totalVehiclesPassed = 0;
    this.recentDepartures = 0;
    this.departureTimer = 0;

    // Preemption listener
    this.onEmergencyPreemption = null;
    this.onInsightEvent = null;
  }

  initRain() {
    this.rainDrops = [];
    for (let i = 0; i < 180; i++) {
      this.rainDrops.push({
        x: Math.random() * 1200,
        y: Math.random() * 700,
        len: 12 + Math.random() * 14,
        speed: 12 + Math.random() * 8,
        alpha: 0.2 + Math.random() * 0.4
      });
    }
  }

  static computeRoutePath(origin, turn, lane) {
    // Coordinate layout:
    // Canvas: 1200 x 700
    // Center: (600, 350)
    // Lane width: 34
    // NS Road: width 136 (x: 532 to 668)
    //   Southbound: lane 0 (x = 549), lane 1 (x = 583)
    //   Northbound: lane 0 (x = 617, inner), lane 1 (x = 651, outer)
    // EW Road: width 136 (y: 282 to 418)
    //   Westbound: lane 0 (y = 333, inner), lane 1 (y = 299, outer)
    //   Eastbound: lane 0 (y = 367, inner), lane 1 (y = 401, outer)

    const path = [];
    const step = 20;

    if (origin === 'N') { // Travelling South (+y)
      const startX = lane === 0 ? 549 : 583;
      if (turn === 'STRAIGHT') {
        for (let y = -40; y <= 740; y += step) path.push({ x: startX, y });
      } else if (turn === 'RIGHT') { // Turn into Westbound outer lane (y = 299)
        for (let y = -40; y <= 270; y += step) path.push({ x: 549, y });
        // Arc from (549, 270) to (490, 299)
        const arc = TrafficEngine.createArcPath({ x: 549, y: 270 }, { x: 510, y: 280 }, { x: 480, y: 299 }, 8);
        path.push(...arc);
        for (let x = 480; x >= -40; x -= step) path.push({ x, y: 299 });
      } else if (turn === 'LEFT') { // Turn into Eastbound inner lane (y = 367)
        for (let y = -40; y <= 330; y += step) path.push({ x: 583, y });
        const arc = TrafficEngine.createArcPath({ x: 583, y: 330 }, { x: 610, y: 367 }, { x: 670, y: 367 }, 10);
        path.push(...arc);
        for (let x = 670; x <= 1240; x += step) path.push({ x, y: 367 });
      }
    } else if (origin === 'S') { // Travelling North (-y)
      const startX = lane === 0 ? 617 : 651;
      if (turn === 'STRAIGHT') {
        for (let y = 740; y >= -40; y -= step) path.push({ x: startX, y });
      } else if (turn === 'RIGHT') { // Turn into Eastbound outer lane (y = 401)
        for (let y = 740; y >= 430; y -= step) path.push({ x: 651, y });
        const arc = TrafficEngine.createArcPath({ x: 651, y: 430 }, { x: 680, y: 418 }, { x: 720, y: 401 }, 8);
        path.push(...arc);
        for (let x = 720; x <= 1240; x += step) path.push({ x, y: 401 });
      } else if (turn === 'LEFT') { // Turn into Westbound inner lane (y = 333)
        for (let y = 740; y >= 370; y -= step) path.push({ x: 617, y });
        const arc = TrafficEngine.createArcPath({ x: 617, y: 370 }, { x: 590, y: 333 }, { x: 530, y: 333 }, 10);
        path.push(...arc);
        for (let x = 530; x >= -40; x -= step) path.push({ x, y: 333 });
      }
    } else if (origin === 'W') { // Travelling East (+x)
      const startY = lane === 0 ? 367 : 401;
      if (turn === 'STRAIGHT') {
        for (let x = -40; x <= 1240; x += step) path.push({ x, y: startY });
      } else if (turn === 'RIGHT') { // Turn into Southbound outer lane (x = 549)
        for (let x = -40; x <= 500; x += step) path.push({ x, y: 401 });
        const arc = TrafficEngine.createArcPath({ x: 500, y: 401 }, { x: 530, y: 420 }, { x: 549, y: 460 }, 8);
        path.push(...arc);
        for (let y = 460; y <= 740; y += step) path.push({ x: 549, y });
      } else if (turn === 'LEFT') { // Turn into Northbound inner lane (x = 617)
        for (let x = -40; x <= 580; x += step) path.push({ x, y: 367 });
        const arc = TrafficEngine.createArcPath({ x: 580, y: 367 }, { x: 617, y: 340 }, { x: 617, y: 280 }, 10);
        path.push(...arc);
        for (let y = 280; y >= -40; y -= step) path.push({ x: 617, y });
      }
    } else if (origin === 'E') { // Travelling West (-x)
      const startY = lane === 0 ? 333 : 299;
      if (turn === 'STRAIGHT') {
        for (let x = 1240; x >= -40; x -= step) path.push({ x, y: startY });
      } else if (turn === 'RIGHT') { // Turn into Northbound outer lane (x = 651)
        for (let x = 1240; x >= 700; x -= step) path.push({ x, y: 299 });
        const arc = TrafficEngine.createArcPath({ x: 700, y: 299 }, { x: 670, y: 280 }, { x: 651, y: 240 }, 8);
        path.push(...arc);
        for (let y = 240; y >= -40; y -= step) path.push({ x: 651, y });
      } else if (turn === 'LEFT') { // Turn into Southbound inner lane (x = 583)
        for (let x = 1240; x >= 620; x -= step) path.push({ x, y: 333 });
        const arc = TrafficEngine.createArcPath({ x: 620, y: 333 }, { x: 583, y: 360 }, { x: 583, y: 420 }, 10);
        path.push(...arc);
        for (let y = 420; y <= 740; y += step) path.push({ x: 583, y });
      }
    }

    return path;
  }

  static createArcPath(p0, p1, p2, count) {
    const pts = [];
    for (let i = 1; i <= count; i++) {
      const t = i / count;
      const x = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x;
      const y = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y;
      pts.push({ x, y });
    }
    return pts;
  }

  static getPathLength(path) {
    let len = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const dx = path[i + 1].x - path[i].x;
      const dy = path[i + 1].y - path[i].y;
      len += Math.hypot(dx, dy);
    }
    return len;
  }

  static getPointOnPath(path, progress) {
    if (!path || path.length < 2) return null;
    let accumulated = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const p1 = path[i];
      const p2 = path[i + 1];
      const segDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (accumulated + segDist >= progress) {
        const ratio = (progress - accumulated) / Math.max(0.001, segDist);
        const x = p1.x + (p2.x - p1.x) * ratio;
        const y = p1.y + (p2.y - p1.y) * ratio;
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        return { x, y, angle };
      }
      accumulated += segDist;
    }
    const last = path[path.length - 1];
    const prev = path[path.length - 2];
    return { x: last.x, y: last.y, angle: Math.atan2(last.y - prev.y, last.x - prev.x) };
  }

  spawnRandomVehicle(forcedType = null) {
    const origins = ['N', 'S', 'E', 'W'];
    const origin = origins[Math.floor(Math.random() * origins.length)];
    
    // Pick turn based on probability
    const r = Math.random();
    let turn = 'STRAIGHT';
    let lane = Math.floor(Math.random() * 2);

    if (r < 0.22) {
      turn = 'RIGHT';
      lane = 0; // right turns prefer outer lane
    } else if (r < 0.42) {
      turn = 'LEFT';
      lane = 1; // left turns prefer inner lane
    }

    // Vehicle type selection
    let typeKey = forcedType;
    if (!typeKey) {
      const tr = Math.random();
      if (tr < 0.45) typeKey = 'SEDAN';
      else if (tr < 0.65) typeKey = 'EV_SPORTS';
      else if (tr < 0.78) typeKey = 'TAXI';
      else if (tr < 0.88) typeKey = 'DELIVERY_VAN';
      else if (tr < 0.95) typeKey = 'MOTORCYCLE';
      else if (tr < 0.98) typeKey = 'SEMI_TRUCK';
      else typeKey = 'AMBULANCE';
    }

    // Check spawn collision clearance
    const tempPath = TrafficEngine.computeRoutePath(origin, turn, lane);
    const startPoint = tempPath[0];
    const tooClose = this.vehicles.some(v => {
      return Math.hypot(v.x - startPoint.x, v.y - startPoint.y) < 48;
    });

    if (tooClose) return null;

    const id = `V-${this.vehicleIdCounter++}`;
    const vehicle = new Vehicle(id, typeKey, { origin, turn }, lane, 0);
    this.vehicles.push(vehicle);

    if (vehicle.isEmergency) {
      if (window.trafficAudio) window.trafficAudio.startSiren();
      if (this.onInsightEvent) {
        this.onInsightEvent('emergency', `Emergency Unit ${vehicle.id} deployed from ${origin} corridor. Preempting signals.`);
      }
    }

    return vehicle;
  }

  findLeadVehicle(vehicle) {
    let nearestLead = null;
    let minGap = 9999;

    for (const other of this.vehicles) {
      if (other === vehicle) continue;

      // Same route origin and lane
      if (other.route.origin === vehicle.route.origin && other.lane === vehicle.lane) {
        if (other.progress > vehicle.progress) {
          const gap = other.progress - vehicle.progress - other.length;
          if (gap >= 0 && gap < minGap) {
            minGap = gap;
            nearestLead = other;
          }
        }
      }
    }

    if (nearestLead) {
      return { vehicle: nearestLead, gap: minGap };
    }
    return null;
  }

  checkSignalObstacle(vehicle) {
    // Traffic light stop lines:
    // N (Southbound): Stop line y = 265
    // S (Northbound): Stop line y = 435
    // W (Eastbound):  Stop line x = 515
    // E (Westbound):  Stop line x = 685

    const { origin } = vehicle.route;
    let isRed = false;
    let stopProgress = null;

    if (origin === 'N' || origin === 'S') {
      isRed = this.signals.nsState === 'RED' || (this.signals.nsState === 'YELLOW' && vehicle.speed > 2.0);
      if (origin === 'N') {
        // Stopline around progress = 305px from top
        stopProgress = 305;
      } else {
        // S origin stopline around progress = 305px from bottom
        stopProgress = 305;
      }
    } else {
      isRed = this.signals.ewState === 'RED' || (this.signals.ewState === 'YELLOW' && vehicle.speed > 2.0);
      if (origin === 'W') {
        stopProgress = 555;
      } else {
        stopProgress = 555;
      }
    }

    if (isRed && vehicle.progress < stopProgress) {
      const gap = stopProgress - vehicle.progress;
      if (gap > 0 && gap < 280) {
        return { gap };
      }
    }

    return null;
  }

  checkHazardObstacle(vehicle) {
    if (this.hazards.length === 0) return null;
    for (const h of this.hazards) {
      const d = Math.hypot(vehicle.x - h.x, vehicle.y - h.y);
      if (d < 160) {
        // Project onto vehicle forward direction
        const dx = h.x - vehicle.x;
        const dy = h.y - vehicle.y;
        const dot = dx * Math.cos(vehicle.angle) + dy * Math.sin(vehicle.angle);
        if (dot > 0 && dot < 140) {
          return { gap: dot - 25, hazard: h };
        }
      }
    }
    return null;
  }

  checkAmbulanceYield(vehicle) {
    if (vehicle.isEmergency) return { shouldYield: false };
    const emergencyVehicle = this.vehicles.find(v => v.isEmergency);
    if (!emergencyVehicle) return { shouldYield: false };

    const dist = Math.hypot(vehicle.x - emergencyVehicle.x, vehicle.y - emergencyVehicle.y);
    if (dist < 180) {
      return { shouldYield: true };
    }
    return { shouldYield: false };
  }

  isLaneClearForMerge(vehicle, targetLane) {
    for (const other of this.vehicles) {
      if (other === vehicle) continue;
      if (other.route.origin === vehicle.route.origin && other.lane === targetLane) {
        const dist = Math.abs(other.progress - vehicle.progress);
        if (dist < 46) return false;
      }
    }
    return true;
  }

  updateTrafficLights(dt) {
    // Check for approaching emergency vehicles to trigger preemption
    const emergency = this.vehicles.find(v => v.isEmergency && v.progress < 450);
    if (emergency) {
      const isNS = emergency.route.origin === 'N' || emergency.route.origin === 'S';
      if (!this.signals.emergencyOverride) {
        this.signals.emergencyOverride = true;
        this.signals.emergencyDirection = isNS ? 'NS' : 'EW';
        if (isNS && this.signals.nsState !== 'GREEN') {
          this.signals.phase = 0;
          this.signals.timer = 0;
        } else if (!isNS && this.signals.ewState !== 'GREEN') {
          this.signals.phase = 3;
          this.signals.timer = 0;
        }
        if (this.onInsightEvent) {
          this.onInsightEvent('alert', `Priority Green Wave triggered for ${emergency.id}`);
        }
      }
    } else if (this.signals.emergencyOverride) {
      this.signals.emergencyOverride = false;
      this.signals.emergencyDirection = null;
      if (window.trafficAudio) window.trafficAudio.stopSiren();
    }

    if (this.signalMode === 'ADAPTIVE_AI' && !this.signals.emergencyOverride) {
      this.updateAdaptiveAI(dt);
    } else if (this.signalMode === 'FIXED_TIMER' || this.signalMode === 'GREEN_WAVE' || this.signals.emergencyOverride) {
      this.signals.timer += dt;
      const currentDuration = this.signals.phaseDurations[this.signals.phase];
      if (this.signals.timer >= currentDuration) {
        this.signals.timer = 0;
        this.signals.phase = (this.signals.phase + 1) % 6;
        if (window.trafficAudio) window.trafficAudio.playSignalChange();
      }
    }

    // Set states based on phase
    switch (this.signals.phase) {
      case 0:
        this.signals.nsState = 'GREEN';
        this.signals.ewState = 'RED';
        break;
      case 1:
        this.signals.nsState = 'YELLOW';
        this.signals.ewState = 'RED';
        break;
      case 2:
        this.signals.nsState = 'RED';
        this.signals.ewState = 'RED';
        break;
      case 3:
        this.signals.nsState = 'RED';
        this.signals.ewState = 'GREEN';
        break;
      case 4:
        this.signals.nsState = 'RED';
        this.signals.ewState = 'YELLOW';
        break;
      case 5:
        this.signals.nsState = 'RED';
        this.signals.ewState = 'RED';
        break;
    }

    // Countdowns
    const remaining = Math.max(0, this.signals.phaseDurations[this.signals.phase] - this.signals.timer);
    if (this.signals.nsState === 'GREEN') {
      this.signals.nsCountdown = Math.ceil(remaining);
      this.signals.ewCountdown = Math.ceil(remaining + 5);
    } else if (this.signals.ewState === 'GREEN') {
      this.signals.ewCountdown = Math.ceil(remaining);
      this.signals.nsCountdown = Math.ceil(remaining + 5);
    } else {
      this.signals.nsCountdown = Math.ceil(remaining);
      this.signals.ewCountdown = Math.ceil(remaining);
    }
  }

  updateAdaptiveAI(dt) {
    this.signals.timer += dt;
    
    // Count stopped/queued vehicles in each direction
    let nsQueue = 0;
    let ewQueue = 0;

    for (const v of this.vehicles) {
      if (v.speed < 1.0) {
        if (v.route.origin === 'N' || v.route.origin === 'S') nsQueue++;
        else ewQueue++;
      }
    }

    const currentPhase = this.signals.phase;
    const elapsed = this.signals.timer;

    // Minimum green duration is 6s, maximum is 20s
    if (currentPhase === 0) { // NS Green
      if (elapsed > 6 && (nsQueue === 0 && ewQueue > 2 || elapsed > 18)) {
        this.signals.phase = 1; // Go to yellow
        this.signals.timer = 0;
        if (window.trafficAudio) window.trafficAudio.playSignalChange();
      }
    } else if (currentPhase === 1) { // NS Yellow
      if (elapsed > 3.0) {
        this.signals.phase = 2; // All red
        this.signals.timer = 0;
      }
    } else if (currentPhase === 2) { // All red
      if (elapsed > 1.2) {
        this.signals.phase = 3; // EW Green
        this.signals.timer = 0;
        if (window.trafficAudio) window.trafficAudio.playSignalChange();
      }
    } else if (currentPhase === 3) { // EW Green
      if (elapsed > 6 && (ewQueue === 0 && nsQueue > 2 || elapsed > 18)) {
        this.signals.phase = 4; // Go to yellow
        this.signals.timer = 0;
        if (window.trafficAudio) window.trafficAudio.playSignalChange();
      }
    } else if (currentPhase === 4) { // EW Yellow
      if (elapsed > 3.0) {
        this.signals.phase = 5; // All red
        this.signals.timer = 0;
      }
    } else if (currentPhase === 5) { // All red
      if (elapsed > 1.2) {
        this.signals.phase = 0; // NS Green
        this.signals.timer = 0;
        if (window.trafficAudio) window.trafficAudio.playSignalChange();
      }
    }
  }

  forceSignalSwitch() {
    if (this.signals.nsState === 'GREEN') {
      this.signals.phase = 1;
    } else if (this.signals.ewState === 'GREEN') {
      this.signals.phase = 4;
    } else {
      this.signals.phase = (this.signals.phase + 1) % 6;
    }
    this.signals.timer = 0;
    if (window.trafficAudio) window.trafficAudio.playSignalChange();
  }

  addHazard(x, y) {
    const id = `HAZ-${Date.now() % 10000}`;
    this.hazards.push({ id, x, y, radius: 26, label: 'Road Work' });
    if (window.trafficAudio) window.trafficAudio.playAlert('warning');
    if (this.onInsightEvent) {
      this.onInsightEvent('warning', `Road obstruction reported at (${Math.round(x)}, ${Math.round(y)}). Diversion active.`);
    }
  }

  clearHazards() {
    this.hazards = [];
    if (window.trafficAudio) window.trafficAudio.playBlip(750, 0.08);
    if (this.onInsightEvent) {
      this.onInsightEvent('info', 'All road hazards and work zones cleared.');
    }
  }

  update(rawDt) {
    if (this.isPaused) return;

    const dt = Math.min(rawDt, 0.1) * this.speedMultiplier;

    // Traffic light updates
    this.updateTrafficLights(dt);

    // Vehicle spawns
    this.spawnTimer += dt;
    const interval = 1.0 / Math.max(0.2, this.spawnRate);
    if (this.spawnTimer >= interval) {
      this.spawnTimer = 0;
      this.spawnRandomVehicle();
    }

    // Vehicle updates
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      v.update(dt, this);

      // Check if finished path
      if (v.progress >= v.totalPathLength || v.x < -60 || v.x > 1260 || v.y < -60 || v.y > 760) {
        if (v === this.selectedVehicle) {
          this.selectedVehicle = null;
        }
        this.vehicles.splice(i, 1);
        this.totalVehiclesPassed++;
        this.recentDepartures++;
      }
    }

    // Throughput rate window (per minute)
    this.departureTimer += dt;
    if (this.departureTimer >= 1.0) {
      const perMinRate = Math.round(this.recentDepartures * 60);
      this.throughputHistory.push(perMinRate);
      if (this.throughputHistory.length > 30) this.throughputHistory.shift();
      this.recentDepartures = 0;
      this.departureTimer = 0;
    }

    // Rain particles update
    if (this.weather === 'RAIN') {
      for (const d of this.rainDrops) {
        d.y += d.speed * this.speedMultiplier;
        d.x -= d.speed * 0.3 * this.speedMultiplier;
        if (d.y > 720) {
          d.y = -20;
          d.x = Math.random() * 1280;
        }
      }
    }
  }

  render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.save();
    ctx.clearRect(0, 0, w, h);

    // 1. Background Grid & City Ground
    this.renderCityGround(ctx, w, h);

    // 2. Road Network
    this.renderRoads(ctx);

    // 3. Road Markings & Intersections
    this.renderMarkings(ctx);

    // 4. Hazards & Cones
    this.renderHazards(ctx);

    // 5. Traffic Lights Gantries
    this.renderTrafficSignals(ctx);

    // 6. Vehicles
    this.renderVehicles(ctx);

    // 7. Weather Atmosphere & Rain
    this.renderWeatherOverlay(ctx, w, h);

    // 8. Vehicle Selection Reticle
    if (this.selectedVehicle) {
      this.renderSelectionReticle(ctx, this.selectedVehicle);
    }

    ctx.restore();
  }

  renderCityGround(ctx, w, h) {
    // Dark metropolis background
    const bgGrad = ctx.createLinearGradient(0, 0, w, h);
    if (this.weather === 'NIGHT') {
      bgGrad.addColorStop(0, '#090d16');
      bgGrad.addColorStop(1, '#05080f');
    } else if (this.weather === 'RAIN') {
      bgGrad.addColorStop(0, '#0c121e');
      bgGrad.addColorStop(1, '#070b12');
    } else { // DAY
      bgGrad.addColorStop(0, '#1a2234');
      bgGrad.addColorStop(1, '#111827');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Grid lines for high-tech HUD look
    ctx.strokeStyle = this.weather === 'NIGHT' ? 'rgba(0, 240, 255, 0.03)' : 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < w; x += 40) {
      ctx.moveTo(x, 0); ctx.lineTo(x, h);
    }
    for (let y = 0; y < h; y += 40) {
      ctx.moveTo(0, y); ctx.lineTo(w, y);
    }
    ctx.stroke();

    // City blocks / sidewalk zones
    ctx.fillStyle = 'rgba(30, 41, 59, 0.6)';
    // Top-Left block
    ctx.fillRect(20, 20, 500, 250);
    // Top-Right block
    ctx.fillRect(680, 20, 500, 250);
    // Bottom-Left block
    ctx.fillRect(20, 430, 500, 250);
    // Bottom-Right block
    ctx.fillRect(680, 430, 500, 250);

    // Decorative building footprints / solar roofs
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
    ctx.lineWidth = 1.5;

    // Block 1 structures
    ctx.strokeRect(50, 40, 200, 100);
    ctx.fillRect(50, 40, 200, 100);
    ctx.strokeRect(280, 40, 220, 200);
    ctx.fillRect(280, 40, 220, 200);

    // Block 2 structures
    ctx.strokeRect(700, 40, 240, 180);
    ctx.fillRect(700, 40, 240, 180);
    ctx.strokeRect(970, 50, 190, 190);
    ctx.fillRect(970, 50, 190, 190);

    // Block 3 structures
    ctx.strokeRect(50, 460, 210, 190);
    ctx.fillRect(50, 460, 210, 190);
    ctx.strokeRect(290, 460, 210, 190);
    ctx.fillRect(290, 460, 210, 190);

    // Block 4 structures
    ctx.strokeRect(700, 460, 220, 200);
    ctx.fillRect(700, 460, 220, 200);
    ctx.strokeRect(950, 460, 210, 180);
    ctx.fillRect(950, 460, 210, 180);
  }

  renderRoads(ctx) {
    // Asphalt road surface
    ctx.fillStyle = '#171e2e';
    
    // East-West Expressway (y: 282 to 418, height = 136)
    ctx.fillRect(0, 282, 1200, 136);

    // North-South Boulevard (x: 532 to 668, width = 136)
    ctx.fillRect(532, 0, 136, 700);

    // Road borders / curbs with slight neon glow
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 2.5;

    // West curbs
    ctx.beginPath();
    ctx.moveTo(0, 282); ctx.lineTo(532, 282);
    ctx.moveTo(0, 418); ctx.lineTo(532, 418);
    // East curbs
    ctx.moveTo(668, 282); ctx.lineTo(1200, 282);
    ctx.moveTo(668, 418); ctx.lineTo(1200, 418);
    // North curbs
    ctx.moveTo(532, 0); ctx.lineTo(532, 282);
    ctx.moveTo(668, 0); ctx.lineTo(668, 282);
    // South curbs
    ctx.moveTo(532, 418); ctx.lineTo(532, 700);
    ctx.moveTo(668, 418); ctx.lineTo(668, 700);
    ctx.stroke();
  }

  renderMarkings(ctx) {
    // 1. Center divider lines (Double solid yellow)
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);

    // EW Double Yellow
    ctx.beginPath();
    ctx.moveTo(0, 348); ctx.lineTo(515, 348);
    ctx.moveTo(0, 352); ctx.lineTo(515, 352);
    ctx.moveTo(685, 348); ctx.lineTo(1200, 348);
    ctx.moveTo(685, 352); ctx.lineTo(1200, 352);
    // NS Double Yellow
    ctx.moveTo(598, 0); ctx.lineTo(598, 265);
    ctx.moveTo(602, 0); ctx.lineTo(602, 265);
    ctx.moveTo(598, 435); ctx.lineTo(598, 700);
    ctx.moveTo(602, 435); ctx.lineTo(602, 700);
    ctx.stroke();

    // 2. Dashed lane dividers (White dashed)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([12, 12]);

    ctx.beginPath();
    // Westbound outer/inner divider (y = 316)
    ctx.moveTo(0, 316); ctx.lineTo(515, 316);
    ctx.moveTo(685, 316); ctx.lineTo(1200, 316);
    // Eastbound inner/outer divider (y = 384)
    ctx.moveTo(0, 384); ctx.lineTo(515, 384);
    ctx.moveTo(685, 384); ctx.lineTo(1200, 384);

    // North-South dividers
    // Southbound inner/outer (x = 566)
    ctx.moveTo(566, 0); ctx.lineTo(566, 265);
    ctx.moveTo(566, 435); ctx.lineTo(566, 700);
    // Northbound inner/outer (x = 634)
    ctx.moveTo(634, 0); ctx.lineTo(634, 265);
    ctx.moveTo(634, 435); ctx.lineTo(634, 700);
    ctx.stroke();

    ctx.setLineDash([]); // Reset dash

    // 3. Stop lines
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    // North stopline (Southbound lanes x: 532 to 600 at y = 265)
    ctx.moveTo(532, 265); ctx.lineTo(600, 265);
    // South stopline (Northbound lanes x: 600 to 668 at y = 435)
    ctx.moveTo(600, 435); ctx.lineTo(668, 435);
    // West stopline (Eastbound lanes y: 350 to 418 at x = 515)
    ctx.moveTo(515, 350); ctx.lineTo(515, 418);
    // East stopline (Westbound lanes y: 282 to 350 at x = 685)
    ctx.moveTo(685, 282); ctx.lineTo(685, 350);
    ctx.stroke();

    // 4. Pedestrian Crosswalk stripes (Zebra pattern)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    // North crosswalk
    for (let x = 536; x < 664; x += 12) {
      ctx.fillRect(x, 267, 7, 12);
    }
    // South crosswalk
    for (let x = 536; x < 664; x += 12) {
      ctx.fillRect(x, 421, 7, 12);
    }
    // West crosswalk
    for (let y = 286; y < 414; y += 12) {
      ctx.fillRect(518, y, 12, 7);
    }
    // East crosswalk
    for (let y = 286; y < 414; y += 12) {
      ctx.fillRect(670, y, 12, 7);
    }

    // 5. Intersection Box (Yellow criss-cross grid / Don't block box)
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.22)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(532, 282, 136, 136);

    ctx.save();
    ctx.beginPath();
    ctx.rect(532, 282, 136, 136);
    ctx.clip();
    ctx.beginPath();
    for (let i = -140; i < 280; i += 24) {
      ctx.moveTo(532 + i, 282);
      ctx.lineTo(532 + i + 136, 418);
      ctx.moveTo(532 + i, 418);
      ctx.lineTo(532 + i + 136, 282);
    }
    ctx.stroke();
    ctx.restore();
  }

  renderHazards(ctx) {
    for (const h of this.hazards) {
      ctx.save();
      // Pulsing warning ring
      const pulse = 1 + Math.sin(Date.now() * 0.008) * 0.25;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.radius * pulse, 0, Math.PI * 2);
      ctx.stroke();

      // Cone base / Barricade
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(h.x, h.y, 14, 0, Math.PI * 2);
      ctx.fill();

      // Hazard stripes
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(h.x - 8, h.y - 2, 16, 4);

      // Warning label
      ctx.fillStyle = '#fef08a';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('HAZARD', h.x, h.y - 18);
      ctx.restore();
    }
  }

  renderTrafficSignals(ctx) {
    const s = this.signals;

    // Signal Heads Positions:
    // North gantry: (512, 250)
    // South gantry: (688, 450)
    // West gantry:  (500, 436)
    // East gantry:  (700, 264)

    this.drawSignalGantry(ctx, 512, 250, s.nsState, s.nsCountdown, 'N');
    this.drawSignalGantry(ctx, 688, 450, s.nsState, s.nsCountdown, 'S');
    this.drawSignalGantry(ctx, 500, 436, s.ewState, s.ewCountdown, 'W');
    this.drawSignalGantry(ctx, 700, 264, s.ewState, s.ewCountdown, 'E');
  }

  drawSignalGantry(ctx, x, y, state, countdown, direction) {
    ctx.save();

    // Housing
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x - 14, y - 28, 28, 56, 6);
    ctx.fill();
    ctx.stroke();

    // Red light
    ctx.fillStyle = state === 'RED' ? '#ef4444' : '#331215';
    if (state === 'RED') {
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 14;
    }
    ctx.beginPath();
    ctx.arc(x, y - 16, 6, 0, Math.PI * 2);
    ctx.fill();

    // Yellow light
    ctx.shadowBlur = 0;
    ctx.fillStyle = state === 'YELLOW' ? '#f59e0b' : '#3d2b09';
    if (state === 'YELLOW') {
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 14;
    }
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();

    // Green light
    ctx.shadowBlur = 0;
    ctx.fillStyle = state === 'GREEN' ? '#10b981' : '#082f1f';
    if (state === 'GREEN') {
      ctx.shadowColor = '#10b981';
      ctx.shadowBlur = 14;
    }
    ctx.beginPath();
    ctx.arc(x, y + 16, 6, 0, Math.PI * 2);
    ctx.fill();

    // Digital Countdown Display badge above gantry
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.strokeStyle = state === 'GREEN' ? '#10b981' : state === 'YELLOW' ? '#f59e0b' : '#ef4444';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x - 12, y - 48, 24, 16, 3);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = ctx.strokeStyle;
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${countdown}s`, x, y - 40);

    ctx.restore();
  }

  renderVehicles(ctx) {
    for (const v of this.vehicles) {
      ctx.save();
      ctx.translate(v.x, v.y);
      ctx.rotate(v.angle);

      // Night / Rain Headlights & Taillights projection
      if (this.weather === 'NIGHT' || this.weather === 'RAIN') {
        // Headlights cone (front +x)
        const hlGrad = ctx.createRadialGradient(v.length / 2, 0, 4, v.length / 2 + 75, 0, 70);
        hlGrad.addColorStop(0, 'rgba(255, 255, 220, 0.45)');
        hlGrad.addColorStop(0.5, 'rgba(255, 255, 220, 0.12)');
        hlGrad.addColorStop(1, 'rgba(255, 255, 220, 0)');

        ctx.fillStyle = hlGrad;
        ctx.beginPath();
        ctx.moveTo(v.length / 2, -v.width * 0.4);
        ctx.lineTo(v.length / 2 + 75, -v.width * 1.6);
        ctx.lineTo(v.length / 2 + 75, v.width * 1.6);
        ctx.lineTo(v.length / 2, v.width * 0.4);
        ctx.closePath();
        ctx.fill();

        // Taillights red glow (rear -x)
        const isBraking = v.state === 'braking' || v.state === 'stopped';
        const tlAlpha = isBraking ? 0.7 : 0.25;
        const tlRadius = isBraking ? 20 : 10;
        ctx.fillStyle = `rgba(239, 68, 68, ${tlAlpha})`;
        ctx.beginPath();
        ctx.arc(-v.length / 2, -v.width * 0.35, tlRadius, 0, Math.PI * 2);
        ctx.arc(-v.length / 2, v.width * 0.35, tlRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Vehicle Chassis Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.roundRect(-v.length / 2 + 2, -v.width / 2 + 2, v.length, v.width, 4);
      ctx.fill();

      // Vehicle Body
      ctx.fillStyle = v.color;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(-v.length / 2, -v.width / 2, v.length, v.width, 4);
      ctx.fill();
      ctx.stroke();

      // Windshield & Roof details
      ctx.fillStyle = '#0f172a';
      const windshieldX = v.length * 0.05;
      const roofLen = v.length * 0.45;
      ctx.beginPath();
      ctx.roundRect(windshieldX - roofLen * 0.5, -v.width * 0.35, roofLen, v.width * 0.7, 2);
      ctx.fill();

      // Turn indicators (blinking amber)
      if (v.indicatorBlink) {
        ctx.fillStyle = '#f59e0b';
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 8;
        if (v.indicator === 'left') {
          // Front & rear left corners
          ctx.fillRect(v.length / 2 - 3, -v.width / 2 - 2, 4, 3);
          ctx.fillRect(-v.length / 2 + 1, -v.width / 2 - 2, 4, 3);
        } else if (v.indicator === 'right') {
          // Front & rear right corners
          ctx.fillRect(v.length / 2 - 3, v.width / 2 - 1, 4, 3);
          ctx.fillRect(-v.length / 2 + 1, v.width / 2 - 1, 4, 3);
        }
        ctx.shadowBlur = 0;
      }

      // Emergency Ambulance Flashing Strobe Beacons
      if (v.isEmergency) {
        const strobe = Math.floor(Date.now() / 120) % 2;
        ctx.fillStyle = strobe ? '#ef4444' : '#3b82f6';
        ctx.shadowColor = strobe ? '#ef4444' : '#3b82f6';
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Emergency cross markings
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(-3, -v.width * 0.4, 6, 2);
        ctx.fillRect(-3, v.width * 0.4 - 2, 6, 2);
      }

      // Taxi roof checker
      if (v.typeKey === 'TAXI') {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(-4, -3, 8, 6);
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 6px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('TAXI', 0, 0);
      }

      ctx.restore();
    }
  }

  renderSelectionReticle(ctx, v) {
    ctx.save();
    ctx.translate(v.x, v.y);
    const spin = Date.now() * 0.003;
    const pulse = 1 + Math.sin(Date.now() * 0.01) * 0.12;

    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 1.8;
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 12;

    // Corner brackets
    const r = (v.length + 18) * 0.5 * pulse;
    ctx.beginPath();
    ctx.arc(0, 0, r, spin, spin + Math.PI * 0.35);
    ctx.arc(0, 0, r, spin + Math.PI * 0.5, spin + Math.PI * 0.85);
    ctx.arc(0, 0, r, spin + Math.PI, spin + Math.PI * 1.35);
    ctx.arc(0, 0, r, spin + Math.PI * 1.5, spin + Math.PI * 1.85);
    ctx.stroke();

    // Callout badge above vehicle
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(-45, -r - 28, 90, 22, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${v.id} | ${Math.round(v.speed * 18)} km/h`, 0, -r - 17);

    ctx.restore();
  }

  renderWeatherOverlay(ctx, w, h) {
    if (this.weather === 'RAIN') {
      // Atmospheric misty tint
      ctx.fillStyle = 'rgba(15, 23, 42, 0.18)';
      ctx.fillRect(0, 0, w, h);

      // Rain streak lines
      ctx.strokeStyle = 'rgba(186, 230, 253, 0.5)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (const d of this.rainDrops) {
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - 4, d.y + d.len);
      }
      ctx.stroke();
    } else if (this.weather === 'NIGHT') {
      // Vignette effect for dramatic cyberpunk night lighting
      const vigGrad = ctx.createRadialGradient(w / 2, h / 2, 280, w / 2, h / 2, 700);
      vigGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vigGrad.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
      ctx.fillStyle = vigGrad;
      ctx.fillRect(0, 0, w, h);
    }
  }

  getVehicleAt(screenX, screenY) {
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      const d = Math.hypot(screenX - v.x, screenY - v.y);
      if (d <= Math.max(v.length, 24)) {
        return v;
      }
    }
    return null;
  }
}

window.TrafficEngine = TrafficEngine;
window.VEHICLE_CONFIGS = VEHICLE_CONFIGS;
