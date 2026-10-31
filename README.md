# 🚦 TRAFFIC PULSE - Real-Time Autonomous Grid Command & Analytics

A cutting-edge, cyber-themed real-time traffic simulation and analytics frontend built entirely with modern JavaScript, HTML5 Canvas, and Tailwind CSS.

---

## 🌟 Key Features

### 1. 🏎️ High-Fidelity JavaScript Simulation Engine
- **Intelligent Driver Model (IDM)**: Vehicles exhibit authentic car-following dynamics, safe headway keeping, smooth cruising acceleration, and reaction braking.
- **Dynamic Lane Changing (MOBIL-Inspired)**: Vehicles calculate lane advantage, signal turn indicators, and smoothly merge around slower traffic and hazards.
- **7 Distinct Vehicle Profiles**:
  - `Cyber EV`: High acceleration, regenerative braking, ultra-high eco score.
  - `Executive Sedan`: Standard commuter vehicle with smooth cruising physics.
  - `Metro Taxi`: Checkered roof livery, frequent turning patterns.
  - `Delivery Van`: Medium commercial cargo carrier with cautious braking profiles.
  - `18-Wheeler Heavy Semi-Truck`: Extended articulated chassis, heavy inertia, longer stopping distances.
  - `Emergency Unit (Ambulance)`: Siren strobes (red & blue), right-of-way priority, and automated signal preemption.
  - `Motorbike`: Agile, nimble acceleration, quick lane transitions.

### 2. 🚦 Smart Signal Controller & Preemption
- **Adaptive AI Mode**: Continually inspects corridor queue lengths in real time to eliminate empty-green phases and clear congestion spikes.
- **Fixed Timer Mode**: Standard statutory signal cycles with countdown timers.
- **Green Wave Corridor**: Dynamic synchronization for continuous high-speed flow.
- **Emergency Vehicle Priority Preemption**: Instantly creates a green corridor when an emergency vehicle approaches, while surrounding vehicles yield.
- **Interactive Manual Override**: Click any traffic signal gantry to manually trigger a phase change.

### 3. 🌧️ Dynamic Atmospheric Conditions
- **Cyber Night**: Dark obsidian asphalt with luminous neon lane dividers, headlight beam projections, and ambient signal bloom.
- **Torrential Rainstorm**: Animated rain particles, wet road reflections, and a 25% friction penalty requiring longer braking distances.
- **Clear Daylight**: Clean high-contrast metropolitan layout.

### 4. 📊 Real-Time Analytics & Insights Suite
- **Live Telemetry KPIs**:
  - Active Grid Fleet count
  - City Congestion Index (0% free flow to 100% gridlock with dynamic color status)
  - Mean Grid Velocity (km/h)
  - Average Signal Delay (seconds stopped)
  - Carbon Intensity (g CO2/s based on vehicle idling and acceleration)
  - Intersection Throughput (vehicles cleared per minute)
- **Zero-Dependency Canvas Charts**:
  - **Velocity & Congestion Timeline**: 60-second dual-line graph of speed vs congestion.
  - **Corridor Density Bars**: Real-time queue depths across North, South, East, and West arteries.
  - **Fleet Breakdown Donut Chart**: Proportional mix of active vehicle types.
  - **Congestion Speedometer Gauge**: Color-coded arc gauge reflecting instant grid pressure.
- **Autonomous AI Advisory Feed**: Evaluates bottleneck risk, recommends signal cycle extensions, and provides environmental emission tips.
- **Vehicle Telemetry Inspector**: Click any vehicle on the map to inspect its real-time ID, velocity, driver state, trajectory, wait time, and eco rating.

### 5. 🔊 Self-Contained Web Audio Synthesizer
- Zero external MP3 downloads; generates UI blips, alert chimes, and ambulance sirens dynamically using the Web Audio API.

---

## 🚀 How to Run

### Option 1: Direct File Open
Double click `index.html` in Windows Explorer or open it in any modern browser:
```
C:\Users\gauth\.gemini\antigravity\scratch\traffic-pulse\index.html
```

### Option 2: Local HTTP Server (Python / Node)
From PowerShell:
```powershell
cd C:\Users\gauth\.gemini\antigravity\scratch\traffic-pulse
python -m http.server 8080
```
Then navigate to: `http://localhost:8080`

---

## 🕹️ Interactive Controls

| Action | Control |
| :--- | :--- |
| **Inspect Vehicle** | Left-click any vehicle on the road |
| **Place Roadblock / Hazard** | Click **"🚧 Place Road Hazard"** button, then click on any lane |
| **Remove Hazard** | Click directly on an active orange hazard cone |
| **Manual Signal Switch** | Click any traffic light gantry or click **"⚡ Flip Signal"** |
| **Dispatch Ambulance** | Click **"🚨 Emergency Dispatch"** |
| **Adjust Spawn Rate** | Drag the **"Spawn Flow"** slider (0.4/s to 3.5/s) |
| **Simulation Speed** | Select `0.5x`, `1.0x`, `2.0x`, or `4.0x` |
| **Sound Effects** | Click **"🔇 Sound: OFF / ON"** to toggle synthesizer |
| **Weather Modes** | Click `🌙 Night`, `🌧️ Rain`, or `☀️ Day` |
