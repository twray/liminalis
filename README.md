# Liminalis

A generative visual engine for real-time music performance written in TypeScript. Liminalis creates dynamic, interactive visualizations that respond to MIDI input and keyboard events, featuring isometric 3D graphics and various animated elements.

## Features

- **Real-time MIDI Integration**: Responds to MIDI controllers and keyboards via WebMIDI
- **Isometric 3D Graphics**: Renders beautiful isometric visualizations using canvas-sketch
- **Color Palette System**: Dynamic color schemes with predefined palettes
- **Mode Management**: Switch between different visual modes and behaviors
- **Key Mapping**: Customizable keyboard controls for interactive performance

## Architecture

The project is organized into several key modules:

- **`animatable/`**: Visual elements that can be animated (cuboids, stripes, coils, etc.)
- **`managers/`**: Core systems for managing objects, key events, and modes
- **`views/`**: Isometric view rendering and display logic
- **`types/`**: TypeScript type definitions for geometry, colors, and settings
- **`util/`**: Helper utilities for color palettes and mode handling
- **`data/`**: Configuration files for color palettes and key mappings

## Usage

### Basic Setup

The engine is built on top of canvas-sketch and WebMIDI. The main entry point initializes:

1. Canvas sketch with specified dimensions (1080x1920)
2. WebMIDI for real-time music input
3. Various animatable objects and managers
4. Isometric view rendering system

### MIDI Integration

Connect a MIDI controller or keyboard to trigger visual responses. The engine supports:

- Note on/off events
- Control change messages
- Real-time parameter modulation
