---
title: Research Notes
date: 2026-07-16 11:02
query: "game juice level complete celebration box close packing puzzle UX feedback"
type: tech,gaming,community
sources: 5
model: grok-4-1-fast
generated_by: grok-search
---
# Game Development Insights: JS13K Postmortems, Match-3 Architectures, AI-Assisted AV Tools, and Puzzle Game Analyses

## Table of Contents
- [Death Estate: JS13K 2022 Postmortem](#death-estate-js13k-2022-postmortem)
- [Unity 2D Match-3 Puzzle Game with Engine-Independent Core](#unity-2d-match-3-puzzle-game-with-engine-independent-core)
- [Collection of Claude Skills for Visuals, Animation, and Sound on Web](#collection-of-claude-skills-for-visuals-animation-and-sound-on-web)
- [Game Analysis of Toon Blast](#game-analysis-of-toon-blast)
- [Game Analysis of Royal Match](#game-analysis-of-royal-match)
- [Summary](#summary)
- [Cited Sources](#cited-sources)

## Death Estate: JS13K 2022 Postmortem
**Source:** https://medium.com/@jayther/death-estate-js13k-2022-postmortem-863bfc0af423

**Main topic and thesis:** A detailed postmortem of developing *Death Estate*, a packing-puzzle city builder for the JS13K 2022 competition (theme: "DEATH"). The author reflects on efficient small-scale game development under strict 13KB constraints using existing tools and engines.

**Key points and arguments:**
- Brainstormed ideas around "death builder" leading to a ghost city-building packing puzzle with roads and houses.
- Chose LittleJS engine for tile-based rendering and js13k-rollup boilerplate for build/minification.
- Core gameplay implemented quickly (by day 2): grid-based placement, road connectivity, random house pieces.
- Code optimization techniques included Terser property mangling, CSS cleanup, release builds, and tree-shaking.
- Graphics used bitwise flags (WSEN neighbors) for efficient tile indexing (0-15 for houses); roads rotated at runtime.
- Game over detection via brute-force fitting checks (900 iterations max on 15x15 grid).
- Mobile support added via pointer controls and portrait layout.

**Important data, statistics, quotes:**
- "js13kGames is a JavaScript coding competition for HTML5 Game Developers running yearly since 2012. The fun part of the compo is the file size limit set to 13 kilobytes."
- Used Kenney.nl 1-Bit Pack assets.
- Repo: https://github.com/jayther/js13k-2022-death
- Playable: https://dev.js13kgames.com/games/death-estate

**Conclusions:** Solid planning enabled rapid core implementation despite limited dev time. Bitwise techniques and minification were key to fitting assets and logic. The game balances puzzle mechanics with theme effectively; author recommends supporting asset creators like Kenney.

## Unity 2D Match-3 Puzzle Game with Engine-Independent Core
**Source:** https://github.com/thefcan/unity-match3

**Main topic and thesis:** A Unity 2D match-3 game demonstrating clean architecture: an engine-independent, unit-tested pure C# core using patterns like State, Observer, Pool, and Factory, with a thin MonoBehaviour view layer.

**Key points and arguments:**
- 8x8 board, 5 colors, time-attack with target scores, cascades, combos, bonus time for 4+ matches, auto-shuffle on dead boards, idle hints.
- Core logic separated in `Match3.Core` assembly (no UnityEngine references); views handle only rendering/input.
- State machine manages phases (Init, Playing, Resolving, etc.) for input/clock control without flags.
- Patterns: State for phases, Observer (events) for UI decoupling, Object Pool for tiles, Factory for deterministic creation, ScriptableObject for config.
- 74 NUnit tests cover match detection, gravity, cascades, recovery; runnable outside Unity.

**Important data, statistics, quotes:**
- "The rule of the codebase: logic decides, views obey."
- "74 tests, all green."
- Stack: Unity 2022.3 LTS, 2D URP, TextMeshPro, no third-party assets.
- LevelConfig asset tunes all numbers (time, targets, bonuses).

**Conclusions:** Architecture ensures logic/presentation separation, testability, and mobile performance via pooling. Deliberate scope cuts keep it focused; easy to extend (e.g., special tiles via Factory).

## Collection of Claude Skills for Visuals, Animation, and Sound on Web
**Source:** https://github.com/lovelaced/web-av-skills

**Main topic and thesis:** A set of Claude Code skills for generating AI-assisted web AV content: image-to-SVG conversion, GSAP game animations, Suno SFX/music prompts, audio-synced WebGL demos, and trimming pipelines.

**Key points and arguments:**
- Skills install as folders in `~/.claude/skills/` and activate contextually.
- Workflow example: Generate art prompts → convert to animated SVG → build GSAP timelines → derive/trim matching SFX.
- nano-to-svg: Analyzes images, traces to SVG, supports sprite sheets and animation.
- gsap-game-animations: Builds timelines with easing, particles, complex sequences from descriptions.
- suno-sfx-trimmer & suno-v5-prompts: Consistent-key prompts, exact-duration trimming/normalization via ffmpeg.
- demoscene-webgl: Audio analysis → timing maps → raymarched GLSL synced to music.

**Important data, statistics, quotes:**
- Skills: gsap-game-animations, suno-sfx-trimmer, suno-v5-prompts, demoscene-webgl, nano-to-svg.
- Example integration creates "vector art, choreographed animation, and precisely trimmed sound that all work together."
- MIT license; includes reference docs and scripts.

**Conclusions:** Enables end-to-end AV prototyping with minimal manual work by leveraging Claude for prompts, code, and pipelines. Strong for game UI/juice and demoscene-style visuals.

## Game Analysis of Toon Blast
**Source:** https://medium.com/@ekinmelissezer/game-analysis-of-toon-blast-mechanics-level-design-difficulty-patterns-and-monetization-signals-022748ae51b4

**Main topic and thesis:** In-depth dissection of *Toon Blast*'s match-2 collapse mechanics, level design, difficulty curves, obstacles, power-ups, and monetization signals.

**Key points and arguments:**
- Tap-to-blast 5 colors; power-ups from 5+/7+/9+ matches (Rocket, Bomb, Disco Ball) with combinations.
- Boosters (pre-level/in-game) and layered obstacles (Balloons, Crates, etc.).
- Symmetric boards, progressive obstacle introduction, choke points, color variability for difficulty.
- Power-up reliance increases; early levels easy for onboarding.

**Important data, statistics, quotes:**
- 5 cube colors; power-ups from 5/7/9+ matches.
- Obstacles introduced at varying levels (e.g., Hammer at end of level 9).
- "Players cannot initiate a next move during ongoing cascades."
- Note on analysis date (Oct 22, 2024).

**Conclusions:** Deceptively simple system uses precise pacing, feedback, and progression to drive retention. Power-up economies and obstacle layering create tension/release loops.

## Game Analysis of Royal Match
**Source:** https://medium.com/@ekinmelissezer/game-analysis-for-royal-match-and-toon-blast-9c4bff8ef48b

**Main topic and thesis:** Detailed analysis of *Royal Match*'s match-3 mechanics, power-ups, boosters, meta-game (castle renovation), board variety, obstacles, and engagement hooks.

**Key points and arguments:**
- Swap-to-match 4 tile types; power-ups from specific formations (Light Ball, Propeller, Rocket, TNT) with swiping combinations.
- Pre-level/in-game boosters; meta progression via stars for area tasks.
- Diverse boards (grids, irregular, disconnected); strategic obstacle placement and layering.
- Unique feature: move during cascades for dynamism.

**Important data, statistics, quotes:**
- 4 tile types; power-ups from 4/5 matches in lines/squares/L/T shapes.
- Butler’s Gift from level 32 for win streaks.
- "Players can make the next move during cascading sequences."
- Note on analysis date (Oct 18, 2024).

**Conclusions:** Combines tight core loop with long-term meta progression and rewarding feedback. Variety in boards/obstacles and real-time interaction enhance engagement and retention.

## Summary
These sources collectively highlight best practices in constrained game development (JS13K), clean software architecture for match-3 games, AI-augmented creative pipelines for web AV, and data-driven design patterns in popular mobile puzzles. Common themes include separation of concerns, progressive complexity, efficient resource use, and player-centric feedback loops. They provide practical insights for developers building puzzle games or AV experiences.

## Cited Sources
- https://medium.com/@jayther/death-estate-js13k-2022-postmortem-863bfc0af423
- https://github.com/thefcan/unity-match3
- https://github.com/lovelaced/web-av-skills
- https://medium.com/@ekinmelissezer/game-analysis-of-toon-blast-mechanics-level-design-difficulty-patterns-and-monetization-signals-022748ae51b4
- https://medium.com/@ekinmelissezer/game-analysis-for-royal-match-and-toon-blast-9c4bff8ef48b