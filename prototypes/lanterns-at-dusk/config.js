// PROTOTYPE - NOT FOR PRODUCTION
// Question: 노 젓기와 노을 풍경만으로 5분이 아름답고 아련하게 느껴지는가?
// Date: 2026-11-19
// Every tuning value lives here, each with value, min, max and step. The game reads them live
// through tune.<name> (index.html); the tweak panel, an add-on, writes them back here.
window.CONFIG = {
  seed: 1, // every gameplay random call reads rng(), seeded from this (or ?seed= in the address)
  // ---- Rowing (the hook) ----
  stroke_time: { value: 1.0, min: 0.4, max: 2, step: 0.05 },        // s per oar stroke while W is held
  stroke_thrust: { value: 5.2, min: 1, max: 12, step: 0.1 },        // m/s² pushed during the power half of a stroke
  back_thrust: { value: 1.8, min: 0.5, max: 6, step: 0.1 },         // m/s² backing water with S
  water_drag: { value: 0.55, min: 0.1, max: 2, step: 0.05 },        // 1/s, how fast the glide fades
  side_grip: { value: 3.5, min: 0.5, max: 10, step: 0.1 },          // 1/s, how fast sideways drift is killed (the keel)
  turn_rate: { value: 0.85, min: 0.2, max: 2, step: 0.05 },         // rad/s at full turn
  turn_ease: { value: 3, min: 0.5, max: 10, step: 0.25 },           // 1/s, how fast turning starts and stops
  max_speed: { value: 5.5, min: 2, max: 12, step: 0.25 },           // m/s
  shore_bounce: { value: 0.3, min: 0, max: 1, step: 0.05 },         // share of speed kept when nudged off a shore
  // ---- Lanterns and the story ----
  lantern_reach: { value: 5, min: 2, max: 10, step: 0.25 },         // m, how close the boat must be to light one
  lantern_glimmer_range: { value: 28, min: 5, max: 60, step: 1 },   // m, unlit lanterns flicker when the boat is this near
  memory_hold: { value: 5.5, min: 2, max: 12, step: 0.25 },         // s a memory line stays on screen
  dusk_speed: { value: 0.25, min: 0.05, max: 2, step: 0.05 },       // how fast the sky moves toward the next stage (1/s)
  ending_time: { value: 11, min: 4, max: 25, step: 0.5 },           // s of the lighthouse ending before the results
  // ---- Camera ----
  cam_distance: { value: 8.5, min: 4, max: 20, step: 0.5 },         // m behind the boat
  cam_height: { value: 4.2, min: 1, max: 10, step: 0.1 },           // m above the water
  cam_follow: { value: 2.2, min: 0.5, max: 10, step: 0.1 },         // 1/s, how fast the camera swings behind
  mouse_sensitivity: { value: 0.005, min: 0.001, max: 0.02, step: 0.001 }, // rad per pixel dragged
  look_return: { value: 0.8, min: 0.1, max: 4, step: 0.1 },         // 1/s, how fast a dragged view drifts back
  // ---- Look ----
  exposure: { value: 1.0, min: 0.3, max: 2, step: 0.05 },
  bloom_strength: { value: 0.75, min: 0, max: 2, step: 0.05 },
  bloom_threshold: { value: 1.1, min: 0, max: 3, step: 0.05 },
  bloom_radius: { value: 0.75, min: 0, max: 1, step: 0.05 },
  water_ripple: { value: 1, min: 0, max: 3, step: 0.05 },          // size of the small waves
  reflection_blur: { value: 0.55, min: 0, max: 2, step: 0.05 },    // how much waves break up the mirror
  fog_far: { value: 240, min: 80, max: 600, step: 10 },             // m, where the haze is complete
  volume: { value: 0.5, min: 0, max: 1, step: 0.05 },
};
