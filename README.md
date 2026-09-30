# acoustic-room-mode-radar

[![npm version](https://img.shields.io/npm/v/acoustic-room-mode-radar.svg)](https://www.npmjs.com/package/acoustic-room-mode-radar)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

**Acoustic Room Mode Radar (`acoustic-room-mode-radar`)** is a deterministic Model Context Protocol (MCP) server engineered for room acoustics, home studio design, podcast vocal booths, and audio monitoring environments. It provides zero-hallucination mathematical engines for standing wave room modes (Axial, Tangential, Oblique), Bonello and Bolt dimensional criteria compliance, Schroeder crossover cutoff frequency, Sabine & Norris-Eyring RT60 reverberation decay, and optimal speaker/sweet-spot placement.

---

## Capabilities & Tools Included

### 1. `calculate_room_modes`
Calculates discrete acoustic standing wave room modes up to a cutoff frequency for rectangular enclosures.
- **Rayleigh Wave Model**: Computes exact frequencies ($f_{p,q,r} = \frac{c}{2}\sqrt{(p/L)^2 + (q/W)^2 + (r/H)^2}$) for all Axial (0 dB), Tangential (-3 dB), and Oblique (-6 dB) modes.
- **Resonance Clustering Detection**: Identifies severe degeneracies and modal stacking closer than 1.5 Hz apart.
- **Bass Isolation Holes**: Detects wide gaps (> 18 Hz) below 120 Hz causing hollow bass response.
- **Bonello 1/3-Octave Criterion (1981)**: Audits monotonic mode count growth per third-octave band to spot acoustic dips and colorations.
- **Bolt Area Compliance**: Checks room dimensional ratios ($W/H$ and $L/H$) against Richard Bolt's envelope of favorable acoustic proportions.

### 2. `calculate_schroeder_frequency`
Computes the Schroeder cutoff frequency ($f_s \approx 2000 \sqrt{RT_{60}/V}$), establishing the four operational acoustic regimes:
- **Zone A (Pressurization)**: $0 \text{ Hz} \to f_{min}$ (Room acts as sealed pressure chamber).
- **Zone B (Discrete Modes)**: $f_{min} \to f_s$ (Standing waves and bass resonance dominate).
- **Zone C (Diffusion Transition)**: $f_s \to 4f_s$ (Diffusers and broadband absorption take effect).
- **Zone D (Specular Ray Acoustics)**: $> 4f_s$ (Ray acoustics, early reflections, mirror trick).

### 3. `calculate_rt60_reverb_time`
Calculates reverberation decay time (RT60) across 6 standard octave bands (125 Hz to 4000 Hz) using both **Sabine** and **Norris-Eyring** formulations.
- **Substrate Database**: Built-in absorption coefficients for drywall, concrete, glass, hardwood, ceramic tile, commercial carpet, heavy pile, acoustic foam (50mm), rigid fiberglass (100mm), and heavy velour curtains.
- **Target Usage Presets**: Compares current decay against professional targets (`podcast_voiceover` [0.22 - 0.32s], `music_mixing_control` [0.28 - 0.38s], `home_theater` [0.35 - 0.48s], `audiophile_listening` [0.45 - 0.60s]).
- **Treatment Prescription**: Calculates exact square meters of high-density acoustic treatment panels required to achieve the target decay.

### 4. `calculate_speaker_listening_position`
Calculates optimal listening sweet spot and stereo monitor coordinates.
- **38% Room Rule (Westhler Model)**: Pinpoints listening position at 38.2% (or fallback 44%) room length to balance first-mode nulls and second-mode peaks.
- **Equilateral Triangle Geometry**: Coordinates monitor spacing and toe-in aiming angles (30° inward).
- **Speaker Boundary Interference Response (SBIR)**: Calculates first quarter-wavelength cancellation notches from rear and side walls, providing actionable placement adjustments.

---

## Quick Start

### Running directly via npx
```bash
npx -y acoustic-room-mode-radar
```

### Claude Desktop Integration
Add to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "acoustic-room-mode-radar": {
      "command": "npx",
      "args": ["-y", "acoustic-room-mode-radar"]
    }
  }
}
```

### Cursor Integration
In Cursor Settings > Features > MCP Servers:
- **Type**: `command`
- **Command**: `npx -y acoustic-room-mode-radar`

---

## Specification Authority & Verification

All calculations strictly adhere to:
- **ISO 3382-1**: Measurement of room acoustic parameters.
- **Lord Rayleigh Theory of Sound**: Rectangular acoustic cavity modal eigenvalues.
- **Wallace Clement Sabine & Norris-Eyring**: Diffuse field reverberation decay equations.
- **Richard Bolt & Oscar Bonello Criteria**: Statistical distribution of normal modes in small rooms.

## License

MIT © datutu <ceo@dottheworld.com>
