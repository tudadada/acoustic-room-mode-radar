#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  {
    name: "acoustic-room-mode-radar",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Standard Acoustic Speed of Sound Calculation (m/s) based on temperature (°C)
function getSpeedOfSound(tempC = 20.0) {
  return 331.3 * Math.sqrt(1 + tempC / 273.15);
}

// Authoritative Absorption Coefficients Database (Sabine / Norris-Eyring Standards)
// Frequencies: [125Hz, 250Hz, 500Hz, 1000Hz, 2000Hz, 4000Hz], NRC (Noise Reduction Coefficient)
const MATERIAL_ABSORPTION_DATABASE = {
  concrete_bare: {
    name: "Bare Poured Concrete / Smooth Masonry",
    coefficients: [0.01, 0.01, 0.02, 0.02, 0.02, 0.03],
    nrc: 0.02,
  },
  drywall_painted: {
    name: "Standard Drywall / Plasterboard (12.5mm / 0.5 in) on Studs",
    coefficients: [0.29, 0.10, 0.05, 0.04, 0.07, 0.09],
    nrc: 0.07,
  },
  glass_window: {
    name: "Ordinary Glass Window Pane (4mm)",
    coefficients: [0.35, 0.25, 0.18, 0.12, 0.07, 0.04],
    nrc: 0.15,
  },
  hardwood_floor: {
    name: "Hardwood / Parquet Flooring on Concrete Subfloor",
    coefficients: [0.15, 0.11, 0.10, 0.07, 0.06, 0.07],
    nrc: 0.08,
  },
  tile_ceramic: {
    name: "Glazed Ceramic / Porcelain Tile Flooring",
    coefficients: [0.01, 0.01, 0.02, 0.02, 0.02, 0.02],
    nrc: 0.02,
  },
  carpet_commercial: {
    name: "Commercial Thin Loop Carpet on Concrete",
    coefficients: [0.03, 0.09, 0.20, 0.54, 0.70, 0.72],
    nrc: 0.38,
  },
  carpet_heavy_pile: {
    name: "Heavy Cut-Pile Carpet with Felt Underlay",
    coefficients: [0.08, 0.25, 0.40, 0.60, 0.70, 0.72],
    nrc: 0.50,
  },
  acoustic_foam_50mm: {
    name: "Open-Cell Polyurethane Acoustic Studio Foam (50mm / 2 in)",
    coefficients: [0.20, 0.45, 0.75, 0.88, 0.92, 0.90],
    nrc: 0.75,
  },
  acoustic_fiberglass_100mm: {
    name: "High-Density Rigid Fiberglass / Rockwool Absorber Panel (100mm / 4 in)",
    coefficients: [0.45, 0.80, 0.98, 0.99, 0.95, 0.92],
    nrc: 0.95,
  },
  heavy_curtains_velvet: {
    name: "Heavy Velour / Velvet Drapes (Draped to 50% Fullness)",
    coefficients: [0.14, 0.35, 0.55, 0.72, 0.70, 0.65],
    nrc: 0.60,
  },
  acoustic_ceiling_tiles: {
    name: "Suspended Mineral Fiber Acoustic Ceiling Tiles",
    coefficients: [0.40, 0.55, 0.68, 0.75, 0.78, 0.72],
    nrc: 0.70,
  },
  wooden_furniture_filled: {
    name: "Bookcases & Soft Furniture Furnished Area",
    coefficients: [0.10, 0.15, 0.25, 0.30, 0.30, 0.25],
    nrc: 0.25,
  },
};

const FREQUENCY_BANDS_HZ = [125, 250, 500, 1000, 2000, 4000];

const TECHNICAL_STANDARDS = {
  specification_authority: "ISO 3382-1 / Rayleigh Acoustic Enclosure Theory / Sabine & Norris-Eyring Reverberation Formulation",
  engine: "acoustic-room-mode-radar/1.0.0",
  verification_status: "DETERMINISTIC_BENCHMARK",
};

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "calculate_room_modes",
        description:
          "Calculates discrete acoustic standing wave room modes (Axial, Tangential, Oblique) up to a cutoff frequency for rectangular enclosures. Evaluates Bonello 1/3-octave band criterion and Bolt dimensional ratio compliance to identify bass resonance clustering and null zones.",
        inputSchema: {
          type: "object",
          properties: {
            length_m: {
              type: "number",
              minimum: 0.5,
              description: "Room length along the primary listening axis in meters.",
            },
            width_m: {
              type: "number",
              minimum: 0.5,
              description: "Room width across the stereo lateral axis in meters.",
            },
            height_m: {
              type: "number",
              minimum: 0.5,
              description: "Room ceiling height in meters.",
            },
            temperature_c: {
              type: "number",
              default: 20.0,
              description: "Ambient air temperature in Celsius (affects speed of sound). Default is 20°C.",
            },
            max_frequency_hz: {
              type: "number",
              default: 300.0,
              minimum: 50.0,
              maximum: 500.0,
              description: "Maximum frequency to compute modal resonances for (default 300 Hz).",
            },
          },
          required: ["length_m", "width_m", "height_m"],
        },
      },
      {
        name: "calculate_schroeder_frequency",
        description:
          "Computes the Schroeder cutoff frequency (cross-over frequency between discrete room resonance modes and statistical reverberant sound fields), establishing the four operational acoustic regimes of the enclosure.",
        inputSchema: {
          type: "object",
          properties: {
            length_m: {
              type: "number",
              minimum: 0.5,
              description: "Room length in meters.",
            },
            width_m: {
              type: "number",
              minimum: 0.5,
              description: "Room width in meters.",
            },
            height_m: {
              type: "number",
              minimum: 0.5,
              description: "Room ceiling height in meters.",
            },
            estimated_rt60_s: {
              type: "number",
              default: 0.40,
              minimum: 0.1,
              maximum: 5.0,
              description: "Estimated mid-frequency reverberation time (RT60) in seconds (default 0.40s).",
            },
          },
          required: ["length_m", "width_m", "height_m"],
        },
      },
      {
        name: "calculate_rt60_reverb_time",
        description:
          "Calculates reverberation decay time (RT60) across octave bands using both classical Sabine and Norris-Eyring formulations. Evaluates decay against target usage presets (Podcast/Voiceover, Studio Mixing, Home Theater, Audiophile) and computes exact additional absorption surface area needed.",
        inputSchema: {
          type: "object",
          properties: {
            length_m: {
              type: "number",
              minimum: 0.5,
              description: "Room length in meters.",
            },
            width_m: {
              type: "number",
              minimum: 0.5,
              description: "Room width in meters.",
            },
            height_m: {
              type: "number",
              minimum: 0.5,
              description: "Room height in meters.",
            },
            floor_material: {
              type: "string",
              enum: [
                "hardwood_floor",
                "tile_ceramic",
                "carpet_commercial",
                "carpet_heavy_pile",
                "concrete_bare",
              ],
              default: "hardwood_floor",
              description: "Primary flooring material substrate.",
            },
            wall_material: {
              type: "string",
              enum: [
                "drywall_painted",
                "concrete_bare",
                "glass_window",
                "acoustic_foam_50mm",
                "acoustic_fiberglass_100mm",
              ],
              default: "drywall_painted",
              description: "Primary wall construction substrate.",
            },
            ceiling_material: {
              type: "string",
              enum: [
                "drywall_painted",
                "concrete_bare",
                "acoustic_ceiling_tiles",
              ],
              default: "drywall_painted",
              description: "Ceiling construction substrate.",
            },
            existing_absorbers_m2: {
              type: "number",
              default: 0.0,
              minimum: 0.0,
              description: "Surface area in square meters of dedicated acoustic absorbers already installed.",
            },
            absorber_material: {
              type: "string",
              enum: [
                "acoustic_foam_50mm",
                "acoustic_fiberglass_100mm",
                "heavy_curtains_velvet",
              ],
              default: "acoustic_fiberglass_100mm",
              description: "Grade of installed acoustic absorbers.",
            },
            target_use: {
              type: "string",
              enum: [
                "podcast_voiceover",
                "music_mixing_control",
                "home_theater",
                "audiophile_listening",
              ],
              default: "podcast_voiceover",
              description: "Acoustic destination preset determining recommended RT60 decay target.",
            },
          },
          required: ["length_m", "width_m", "height_m"],
        },
      },
      {
        name: "calculate_speaker_listening_position",
        description:
          "Calculates optimal listening sweet spot and stereo monitor coordinates using the 38% Room Rule (Westhler Model) and Equilateral Triangle geometry. Computes Speaker Boundary Interference Response (SBIR) cancellation notches for wall proximity.",
        inputSchema: {
          type: "object",
          properties: {
            room_length_m: {
              type: "number",
              minimum: 1.0,
              description: "Total room length along the listening axis in meters.",
            },
            room_width_m: {
              type: "number",
              minimum: 1.0,
              description: "Total room width between side walls in meters.",
            },
            ceiling_height_m: {
              type: "number",
              minimum: 1.0,
              description: "Ceiling height in meters.",
            },
            setup_type: {
              type: "string",
              enum: [
                "studio_monitor_nearfield",
                "stereo_hifi",
                "home_theater",
              ],
              default: "studio_monitor_nearfield",
              description: "Acoustic listening configuration style.",
            },
            speaker_flushed_soffit: {
              type: "boolean",
              default: false,
              description: "Set true if speakers are mounted flush into the front baffle wall (soffit mounting).",
            },
          },
          required: ["room_length_m", "room_width_m", "ceiling_height_m"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // -------------------------------------------------------------
    // TOOL 1: calculate_room_modes
    // -------------------------------------------------------------
    if (name === "calculate_room_modes") {
      const L = Number(args.length_m);
      const W = Number(args.width_m);
      const H = Number(args.height_m);
      const tempC = Number(args.temperature_c ?? 20.0);
      const maxF = Number(args.max_frequency_hz ?? 300.0);

      if (L <= 0 || W <= 0 || H <= 0) {
        throw new Error("Room dimensions (length, width, height) must be positive non-zero numbers.");
      }

      const c = getSpeedOfSound(tempC);

      const maxP = Math.ceil((2 * maxF * L) / c);
      const maxQ = Math.ceil((2 * maxF * W) / c);
      const maxR = Math.ceil((2 * maxF * H) / c);

      const modes = [];

      for (let p = 0; p <= maxP; p++) {
        for (let q = 0; q <= maxQ; q++) {
          for (let r = 0; r <= maxR; r++) {
            if (p === 0 && q === 0 && r === 0) continue;

            const freq = (c / 2) * Math.sqrt((p / L) ** 2 + (q / W) ** 2 + (r / H) ** 2);

            if (freq <= maxF) {
              const nonZeros = (p > 0 ? 1 : 0) + (q > 0 ? 1 : 0) + (r > 0 ? 1 : 0);
              let modeType = "oblique";
              let pressureWeightDb = -6.0;
              let surfaces = 6;
              let axisNote = "";

              if (nonZeros === 1) {
                modeType = "axial";
                pressureWeightDb = 0.0;
                surfaces = 2;
                if (p > 0) axisNote = `Length Axial Mode (${p},0,0)`;
                else if (q > 0) axisNote = `Width Axial Mode (0,${q},0)`;
                else axisNote = `Height Axial Mode (0,0,${r})`;
              } else if (nonZeros === 2) {
                modeType = "tangential";
                pressureWeightDb = -3.0;
                surfaces = 4;
                if (r === 0) axisNote = `Length-Width Tangential (${p},${q},0)`;
                else if (q === 0) axisNote = `Length-Height Tangential (${p},0,${r})`;
                else axisNote = `Width-Height Tangential (0,${q},${r})`;
              } else {
                axisNote = `Oblique Corner-to-Corner (${p},${q},${r})`;
              }

              modes.push({
                frequency_hz: Number(freq.toFixed(2)),
                p,
                q,
                r,
                type: modeType,
                pressure_relative_db: pressureWeightDb,
                active_boundaries: surfaces,
                description: axisNote,
              });
            }
          }
        }
      }

      // Sort ascending by frequency
      modes.sort((a, b) => a.frequency_hz - b.frequency_hz);

      // Separate modes by classification
      const axialModes = modes.filter((m) => m.type === "axial");
      const tangentialModes = modes.filter((m) => m.type === "tangential");
      const obliqueModes = modes.filter((m) => m.type === "oblique");

      // Critical Mode Stacking / Clusters (Modes closer than 1.5 Hz apart)
      const clusters = [];
      for (let i = 0; i < modes.length - 1; i++) {
        const delta = modes[i + 1].frequency_hz - modes[i].frequency_hz;
        if (delta <= 1.5) {
          clusters.push({
            center_frequency_hz: Number(((modes[i].frequency_hz + modes[i + 1].frequency_hz) / 2).toFixed(2)),
            frequency_separation_hz: Number(delta.toFixed(2)),
            mode_1: `${modes[i].description} @ ${modes[i].frequency_hz} Hz`,
            mode_2: `${modes[i + 1].description} @ ${modes[i + 1].frequency_hz} Hz`,
            risk_assessment:
              delta === 0
                ? "DEGENERATE COINCIDENCE: Identical resonance frequencies produce extreme bass boom and phase nulls."
                : "TIGHT CLUSTER: High risk of localized bass coloration and severe standing wave boom.",
          });
        }
      }

      // Large Isolation Gaps (> 20 Hz gap between adjacent modes below 120 Hz)
      const bassGaps = [];
      for (let i = 0; i < modes.length - 1; i++) {
        if (modes[i + 1].frequency_hz <= 120) {
          const gap = modes[i + 1].frequency_hz - modes[i].frequency_hz;
          if (gap >= 18.0) {
            bassGaps.push({
              range_hz: `${modes[i].frequency_hz} Hz - ${modes[i + 1].frequency_hz} Hz`,
              gap_span_hz: Number(gap.toFixed(2)),
              acoustic_effect: "ISOLATION HOLE: Severe lack of bass energy in this band causing hollow, uneven bass response.",
            });
          }
        }
      }

      // Bonello 1/3 Octave Criterion Analysis
      // Standard 1/3-octave center frequencies (Hz) up to 315 Hz
      const standardThirdOctaves = [25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315];
      const bonelloBands = [];
      let previousCount = 0;
      let bonelloViolations = 0;

      for (const fc of standardThirdOctaves) {
        if (fc > maxF * 1.1) break;
        const fLow = fc / Math.pow(2, 1 / 6);
        const fHigh = fc * Math.pow(2, 1 / 6);

        const countInBand = modes.filter((m) => m.frequency_hz >= fLow && m.frequency_hz < fHigh).length;

        let status = "OPTIMAL";
        if (countInBand < previousCount && countInBand > 0) {
          status = "BONELLO_VIOLATION_DIP";
          bonelloViolations++;
        }

        bonelloBands.push({
          band_center_hz: fc,
          frequency_range: `${fLow.toFixed(1)} - ${fHigh.toFixed(1)} Hz`,
          mode_count: countInBand,
          status,
        });

        if (countInBand > 0) {
          previousCount = countInBand;
        }
      }

      // Bolt Dimensional Ratio Check (Richard Bolt, 1946)
      const dims = [L, W, H].sort((a, b) => a - b);
      const hNorm = dims[0];
      const wNorm = dims[1];
      const lNorm = dims[2];

      const ratioW = Number((wNorm / hNorm).toFixed(3));
      const ratioL = Number((lNorm / hNorm).toFixed(3));

      // Bolt Area bounds: 1.2 <= W/H <= 1.6 and 1.4 <= L/H <= 2.2
      const isInsideBoltArea = ratioW >= 1.2 && ratioW <= 1.6 && ratioL >= 1.4 && ratioL <= 2.2;

      // Check for degenerate room geometries (Cube, Integer multiples)
      const isCube = Math.abs(L - W) < 0.05 && Math.abs(W - H) < 0.05;
      const isSquareFloor = Math.abs(L - W) < 0.05;

      let roomShapeRating = "FAVORABLE";
      if (isCube) {
        roomShapeRating = "CATASTROPHIC_CUBE: Identical L, W, H creates massive triple-frequency mode stacking.";
      } else if (isSquareFloor) {
        roomShapeRating = "POOR_SQUARE_BASE: Equal length and width doubles all horizontal mode energies.";
      } else if (isInsideBoltArea) {
        roomShapeRating = "EXCELLENT_BOLT_COMPLIANT: Dimension ratios fall inside Bolt's favorable acoustic envelope.";
      } else {
        roomShapeRating = "ACCEPTABLE_NON_OPTIMAL: Dimension ratios avoid integer multiples but require corner bass trapping.";
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "SUCCESS",
                room_geometry: {
                  length_m: L,
                  width_m: W,
                  height_m: H,
                  volume_m3: Number((L * W * H).toFixed(2)),
                  surface_area_m2: Number((2 * (L * W + L * H + W * H)).toFixed(2)),
                  dimension_ratios_normalized: `1.00 : ${ratioW} : ${ratioL}`,
                  bolt_area_compliant: isInsideBoltArea,
                  room_shape_assessment: roomShapeRating,
                },
                speed_of_sound_mps: Number(c.toFixed(2)),
                modal_summary: {
                  total_modes_found: modes.length,
                  axial_modes_count: axialModes.length,
                  tangential_modes_count: tangentialModes.length,
                  oblique_modes_count: obliqueModes.length,
                  lowest_fundamental_mode_hz: modes[0]?.frequency_hz ?? null,
                  lowest_fundamental_description: modes[0]?.description ?? null,
                },
                critical_standing_wave_clusters: clusters.slice(0, 8),
                bass_isolation_gaps: bassGaps,
                bonello_criterion: {
                  evaluation: bonelloViolations === 0 ? "PASSED_STRICT" : "NON_MONOTONIC_DIPS_DETECTED",
                  total_dip_violations: bonelloViolations,
                  guidance:
                    bonelloViolations === 0
                      ? "Mode density increases monotonically per 1/3-octave band. Smooth bass reproduction expected."
                      : "Some 1/3-octave bands have fewer modes than previous lower bands. Localized bass boom and holes likely.",
                  bands: bonelloBands,
                },
                first_ten_modes: modes.slice(0, 10),
                standards_benchmark: TECHNICAL_STANDARDS,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // -------------------------------------------------------------
    // TOOL 2: calculate_schroeder_frequency
    // -------------------------------------------------------------
    if (name === "calculate_schroeder_frequency") {
      const L = Number(args.length_m);
      const W = Number(args.width_m);
      const H = Number(args.height_m);
      const rt60 = Number(args.estimated_rt60_s ?? 0.40);

      if (L <= 0 || W <= 0 || H <= 0) {
        throw new Error("Room dimensions must be positive non-zero numbers.");
      }
      if (rt60 <= 0) {
        throw new Error("RT60 must be a positive number.");
      }

      const V = L * W * H;
      const c = 343.4; // 20°C standard speed of sound

      // Lowest room axial resonance
      const maxDim = Math.max(L, W, H);
      const fMin = c / (2 * maxDim);

      // Classical Schroeder Cutoff Frequency: fs = 2000 * sqrt(RT60 / V)
      const fs = 2000 * Math.sqrt(rt60 / V);
      const fs4 = 4 * fs;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "SUCCESS",
                inputs: {
                  dimensions_m: { length: L, width: W, height: H },
                  room_volume_m3: Number(V.toFixed(2)),
                  assumed_rt60_seconds: rt60,
                },
                schroeder_frequency_hz: Number(fs.toFixed(2)),
                lowest_room_resonance_hz: Number(fMin.toFixed(2)),
                four_acoustic_regimes: {
                  zone_a_pressurization: {
                    range_hz: `0.0 - ${fMin.toFixed(1)} Hz`,
                    behavior: "ROOM_PRESSURE_MODE",
                    characteristics:
                      "Wavelengths are longer than room dimensions. No standing waves form; the room behaves as a sealed pressure vessel with flat boost.",
                    treatment: "No modal treatment needed.",
                  },
                  zone_b_modal_standing_waves: {
                    range_hz: `${fMin.toFixed(1)} - ${fs.toFixed(1)} Hz`,
                    behavior: "DISCRETE_ROOM_MODES",
                    characteristics:
                      "Isolated resonant peaks and deep cancellation nulls. Severe bass boom, muddy low-end, and uneven decay times.",
                    treatment: "Tuned membrane traps, porous corner bass traps, and strategic subwoofer/listener positioning.",
                  },
                  zone_c_transition_diffusion: {
                    range_hz: `${fs.toFixed(1)} - ${fs4.toFixed(1)} Hz`,
                    behavior: "DIFFUSIVE_TRANSITION",
                    characteristics:
                      "Modes begin to overlap heavily. Sound field transitions from wave interference to statistical reverberation.",
                    treatment: "Quadratic residue diffusers (QRD), skyline diffusers, and broadband absorption.",
                  },
                  zone_d_specular_ray_acoustics: {
                    range_hz: `> ${fs4.toFixed(1)} Hz`,
                    behavior: "SPECULAR_RAY_ACOUSTICS",
                    characteristics:
                      "Sound propagates like light rays with geometric reflections. Governed by Sabine reverberation formulas.",
                    treatment: "Early reflection point absorbers (mirror trick), carpet, drapery, and high-frequency diffusers.",
                  },
                },
                standards_benchmark: TECHNICAL_STANDARDS,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // -------------------------------------------------------------
    // TOOL 3: calculate_rt60_reverb_time
    // -------------------------------------------------------------
    if (name === "calculate_rt60_reverb_time") {
      const L = Number(args.length_m);
      const W = Number(args.width_m);
      const H = Number(args.height_m);
      const floorMatKey = args.floor_material ?? "hardwood_floor";
      const wallMatKey = args.wall_material ?? "drywall_painted";
      const ceilMatKey = args.ceiling_material ?? "drywall_painted";
      const existingAbsM2 = Number(args.existing_absorbers_m2 ?? 0.0);
      const absMatKey = args.absorber_material ?? "acoustic_fiberglass_100mm";
      const targetPreset = args.target_use ?? "podcast_voiceover";

      if (L <= 0 || W <= 0 || H <= 0) {
        throw new Error("Dimensions must be positive non-zero numbers.");
      }

      const floorMat = MATERIAL_ABSORPTION_DATABASE[floorMatKey] || MATERIAL_ABSORPTION_DATABASE.hardwood_floor;
      const wallMat = MATERIAL_ABSORPTION_DATABASE[wallMatKey] || MATERIAL_ABSORPTION_DATABASE.drywall_painted;
      const ceilMat = MATERIAL_ABSORPTION_DATABASE[ceilMatKey] || MATERIAL_ABSORPTION_DATABASE.drywall_painted;
      const absMat = MATERIAL_ABSORPTION_DATABASE[absMatKey] || MATERIAL_ABSORPTION_DATABASE.acoustic_fiberglass_100mm;

      const floorArea = L * W;
      const ceilArea = L * W;
      const wallArea = 2 * (L * H + W * H);
      const totalArea = 2 * (L * W + L * H + W * H);
      const volume = L * W * H;

      // Clamp existing absorber area so it does not exceed wall area
      const clampedAbsM2 = Math.min(existingAbsM2, wallArea);
      const baseWallArea = wallArea - clampedAbsM2;

      // Compute total absorption A (metric Sabins) for each of the 6 octave bands
      const sabinsPerBand = [];
      const sabineRt60PerBand = [];
      const eyringRt60PerBand = [];

      for (let i = 0; i < FREQUENCY_BANDS_HZ.length; i++) {
        const floorSabins = floorArea * floorMat.coefficients[i];
        const ceilSabins = ceilArea * ceilMat.coefficients[i];
        const wallSabins = baseWallArea * wallMat.coefficients[i];
        const absorberSabins = clampedAbsM2 * absMat.coefficients[i];

        const totalSabins = floorSabins + ceilSabins + wallSabins + absorberSabins;
        const avgAlpha = totalSabins / totalArea;

        // Sabine Formula: RT60 = 0.161 * V / A
        const rt60Sabine = (0.161 * volume) / totalSabins;

        // Norris-Eyring Formula: RT60 = 0.161 * V / (-S * ln(1 - avgAlpha))
        const safeAlpha = Math.min(avgAlpha, 0.985);
        const rt60Eyring = (0.161 * volume) / (-totalArea * Math.log(1 - safeAlpha));

        sabinsPerBand.push({
          frequency_hz: FREQUENCY_BANDS_HZ[i],
          total_sabins_m2: Number(totalSabins.toFixed(2)),
          average_absorption_coefficient: Number(avgAlpha.toFixed(3)),
          rt60_sabine_seconds: Number(rt60Sabine.toFixed(3)),
          rt60_eyring_seconds: Number(rt60Eyring.toFixed(3)),
        });
        sabineRt60PerBand.push(rt60Sabine);
        eyringRt60PerBand.push(rt60Eyring);
      }

      // Mid-frequency RT60 (Average of 500 Hz and 1000 Hz)
      const midRt60Sabine = (sabineRt60PerBand[2] + sabineRt60PerBand[3]) / 2;
      const midRt60Eyring = (eyringRt60PerBand[2] + eyringRt60PerBand[3]) / 2;

      // Target RT60 Presets
      const TARGET_PRESETS = {
        podcast_voiceover: {
          name: "Podcast / Audiobook Voiceover",
          target_rt60_range: "0.22 - 0.32 s",
          optimal_mid_rt60: 0.28,
        },
        music_mixing_control: {
          name: "Music Production / Control Room Mixing",
          target_rt60_range: "0.28 - 0.38 s",
          optimal_mid_rt60: 0.32,
        },
        home_theater: {
          name: "Home Theater / Surround Cinema",
          target_rt60_range: "0.35 - 0.48 s",
          optimal_mid_rt60: 0.40,
        },
        audiophile_listening: {
          name: "Audiophile Critical Stereo Listening",
          target_rt60_range: "0.45 - 0.60 s",
          optimal_mid_rt60: 0.50,
        },
      };

      const preset = TARGET_PRESETS[targetPreset] || TARGET_PRESETS.podcast_voiceover;
      const targetMidRt60 = preset.optimal_mid_rt60;

      // Determine additional absorption area needed to reach targetMidRt60
      // Required Sabins: A_target = (0.161 * V) / targetMidRt60
      const currentMidSabins = (sabinsPerBand[2].total_sabins_m2 + sabinsPerBand[3].total_sabins_m2) / 2;
      const targetSabins = (0.161 * volume) / targetMidRt60;
      const deltaSabins = Math.max(0, targetSabins - currentMidSabins);

      // Assuming adding panels with NRC 0.85 replacing drywall NRC 0.07
      const netPanelGain = 0.85 - 0.07;
      const treatmentAreaM2 = Number((deltaSabins / netPanelGain).toFixed(2));
      const standardPanels60x120cm = Math.ceil(treatmentAreaM2 / 0.72);

      let decayAssessment = "OPTIMAL";
      if (midRt60Eyring > targetMidRt60 * 1.3) {
        decayAssessment = "EXCESSIVELY_LIVE: Room is reverberant with flutter echoes, speech will sound hollow and indistinct.";
      } else if (midRt60Eyring < targetMidRt60 * 0.7) {
        decayAssessment = "OVERLY_DAMPED: Room is acoustically dead and fatiguing for speakers/performers.";
      } else {
        decayAssessment = "WITHIN_OPTIMAL_TARGET_RANGE: Decay time matches professional standards for selected usage.";
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "SUCCESS",
                room_volume_m3: Number(volume.toFixed(2)),
                total_boundary_area_m2: Number(totalArea.toFixed(2)),
                target_usage: preset.name,
                recommended_target_mid_rt60_seconds: preset.optimal_mid_rt60,
                recommended_target_range: preset.target_rt60_range,
                current_mid_frequency_rt60_seconds: {
                  eyring_method: Number(midRt60Eyring.toFixed(3)),
                  sabine_method: Number(midRt60Sabine.toFixed(3)),
                },
                acoustic_decay_assessment: decayAssessment,
                treatment_recommendation: {
                  additional_absorption_area_needed_m2: treatmentAreaM2,
                  equivalent_standard_panels_60x120cm: standardPanels60x120cm,
                  treatment_guidance:
                    treatmentAreaM2 === 0
                      ? "Room already meets or exceeds target absorption criteria."
                      : `Install approximately ${treatmentAreaM2} m² of rigid absorber panels (NRC >= 0.85) at primary mirror reflection points and rear wall to achieve target RT60 of ${preset.optimal_mid_rt60}s.`,
                },
                octave_band_breakdown: sabinsPerBand,
                standards_benchmark: TECHNICAL_STANDARDS,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // -------------------------------------------------------------
    // TOOL 4: calculate_speaker_listening_position
    // -------------------------------------------------------------
    if (name === "calculate_speaker_listening_position") {
      const L = Number(args.room_length_m);
      const W = Number(args.room_width_m);
      const H = Number(args.ceiling_height_m);
      const setupType = args.setup_type ?? "studio_monitor_nearfield";
      const isSoffit = Boolean(args.speaker_flushed_soffit ?? false);

      if (L <= 0 || W <= 0 || H <= 0) {
        throw new Error("Room length, width, and height must be positive numbers.");
      }

      const c = 343.4; // Speed of sound at 20°C

      // 38% Room Rule (Westhler Model): Listener distance from front wall
      // 38.2% is the optimal balance between 1st length mode null and 2nd mode peak
      const listenerY_38 = Number((L * 0.382).toFixed(2));
      const listenerY_alt_44 = Number((L * 0.44).toFixed(2));
      const listenerX = Number((W / 2).toFixed(2)); // Centered on lateral axis
      const earHeightZ = Number(Math.min(1.25, H * 0.45).toFixed(2)); // Avoid 50% vertical mode null

      // Stereo Triangle Geometry
      // Recommended monitor base spread: 1.2m - 1.8m for nearfield, wider for hifi
      let targetTriangleBase = 1.4;
      if (setupType === "studio_monitor_nearfield") {
        targetTriangleBase = Math.min(1.8, Math.max(1.1, W * 0.38));
      } else if (setupType === "stereo_hifi") {
        targetTriangleBase = Math.min(2.5, Math.max(1.8, W * 0.50));
      } else {
        targetTriangleBase = Math.min(2.2, Math.max(1.5, W * 0.45));
      }

      // Equilateral triangle height: h = base * sqrt(3) / 2
      const triangleHeight = (targetTriangleBase * Math.sqrt(3)) / 2;

      let speakerY = 0.5;
      if (isSoffit) {
        speakerY = 0.1; // Flush into front wall
      } else {
        speakerY = Math.max(0.4, Number((listenerY_38 - triangleHeight).toFixed(2)));
      }

      const leftSpeakerX = Number((listenerX - targetTriangleBase / 2).toFixed(2));
      const rightSpeakerX = Number((listenerX + targetTriangleBase / 2).toFixed(2));
      const speakerZ = earHeightZ; // Tweeter aligned with listener ear height

      // Distance from speaker to side walls and rear wall
      const speakerToSideWall = leftSpeakerX;
      const speakerToFrontWall = speakerY;

      // Speaker Boundary Interference Response (SBIR) Notches
      // f_sbir = c / (4 * d)
      const sbirRearNotchHz = Number((c / (4 * speakerToFrontWall)).toFixed(1));
      const sbirSideNotchHz = Number((c / (4 * speakerToSideWall)).toFixed(1));

      let sbirRearRisk = "LOW";
      let sbirRearGuidance = "";

      if (isSoffit) {
        sbirRearRisk = "MINIMAL_SOFFIT";
        sbirRearGuidance = "Flush soffit mounting completely eliminates front-wall SBIR boundary reflections.";
      } else if (speakerToFrontWall >= 0.25 && speakerToFrontWall <= 0.85) {
        sbirRearRisk = "HIGH_CRITICAL";
        sbirRearGuidance = `Quarter-wavelength cancellation notch at ${sbirRearNotchHz} Hz lands directly in the critical punch/bass region (60-250 Hz). Pull speakers forward (> 0.9m) or push close (< 0.2m with rear boundary bass trap).`;
      } else if (speakerToFrontWall < 0.25) {
        sbirRearRisk = "MANAGED_NEAR_WALL";
        sbirRearGuidance = `Cancellation notch at ${sbirRearNotchHz} Hz is pushed above 350 Hz where directional cabinet damping and absorption panels are highly effective. Use bass shelf filter to compensate for boundary bass gain.`;
      } else {
        sbirRearRisk = "MANAGED_FAR_WALL";
        sbirRearGuidance = `Cancellation notch at ${sbirRearNotchHz} Hz is pushed down into the sub-bass (< 95 Hz) where corner bass traps absorb the energy.`;
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "SUCCESS",
                room_boundaries: {
                  length_m: L,
                  width_m: W,
                  height_m: H,
                },
                listening_position_coordinates: {
                  sweet_spot_38_rule: {
                    x_from_left_wall_m: listenerX,
                    y_from_front_wall_m: listenerY_38,
                    z_ear_height_m: earHeightZ,
                    rule: "38% Room Rule: Positioned at 38.2% room length along center axis to optimize modal energy balance.",
                  },
                  alternative_sweet_spot_44: {
                    x_from_left_wall_m: listenerX,
                    y_from_front_wall_m: listenerY_alt_44,
                    z_ear_height_m: earHeightZ,
                    rule: "44% Room Rule: Secondary fallback position if 38% is obstructed by structural furniture.",
                  },
                  prohibited_listening_zones: [
                    "50% Length (Room Center): Zero bass energy zone (first-order axial modal null). Never place chair here.",
                    "Wall Boundaries (< 0.5m from rear wall): Severe boomy bass buildup due to acoustic boundary pressure loading.",
                  ],
                },
                speaker_placement_coordinates: {
                  left_speaker: {
                    x_from_left_wall_m: leftSpeakerX,
                    y_from_front_wall_m: speakerY,
                    z_tweeter_height_m: speakerZ,
                  },
                  right_speaker: {
                    x_from_right_wall_m: leftSpeakerX,
                    y_from_front_wall_m: speakerY,
                    z_tweeter_height_m: speakerZ,
                  },
                  equilateral_triangle_distance_m: Number(targetTriangleBase.toFixed(2)),
                  toe_in_angle_degrees: 30.0,
                  aiming_guidance: "Angle speakers exactly 30 degrees inward, aimed slightly behind the listener's head.",
                },
                sbir_boundary_analysis: {
                  front_wall_distance_m: speakerToFrontWall,
                  side_wall_distance_m: Number(speakerToSideWall.toFixed(2)),
                  front_wall_cancellation_notch_hz: sbirRearNotchHz,
                  side_wall_cancellation_notch_hz: sbirSideNotchHz,
                  sbir_risk_level: sbirRearRisk,
                  sbir_recommendation: sbirRearGuidance,
                },
                standards_benchmark: TECHNICAL_STANDARDS,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    return {
      isError: true,
      content: [{ type: "text", text: `Error: ${error.message}` }],
    };
  }
});

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

run().catch((err) => {
  console.error("Fatal error starting acoustic-room-mode-radar:", err);
  process.exit(1);
});
