// PROTOTYPE - NOT FOR PRODUCTION
// Question: 3D에서 점프만으로 5분이 재미있는가?
// Date: 2026-11-19
// Every tuning value lives here, each with value, min, max and step. The game reads them live
// through tune.<name> (index.html); the tweak panel, an add-on, writes them back here.
window.CONFIG = {
  seed: 1, // every gameplay random call reads rng(), seeded from this (or ?seed= in the address)
  // ---- The jump (the hook) ----
  jump_height: { value: 2.4, min: 1, max: 5, step: 0.1 },          // m, full jump with Space held
  time_to_apex: { value: 0.36, min: 0.2, max: 0.7, step: 0.01 },   // s, from take-off to the top
  jump_cut: { value: 0.42, min: 0.1, max: 1, step: 0.02 },         // upward speed kept when Space is let go early
  fall_gravity_mult: { value: 1.9, min: 1, max: 4, step: 0.1 },    // gravity × this on the way down
  max_fall_speed: { value: 28, min: 10, max: 60, step: 1 },        // m/s
  coyote_time: { value: 0.1, min: 0, max: 0.3, step: 0.01 },       // s a jump still counts after leaving a ledge
  jump_buffer: { value: 0.12, min: 0, max: 0.3, step: 0.01 },      // s a press before landing still jumps
  // ---- Running ----
  move_speed: { value: 7, min: 3, max: 14, step: 0.25 },           // m/s
  ground_accel: { value: 60, min: 10, max: 150, step: 5 },         // m/s²
  ground_decel: { value: 75, min: 10, max: 150, step: 5 },         // m/s², stopping with no key held
  air_accel: { value: 32, min: 5, max: 120, step: 1 },             // m/s², steering in the air
  stomp_bounce: { value: 9, min: 3, max: 16, step: 0.5 },          // m/s up after stomping a beetle
  // ---- Camera ----
  cam_distance: { value: 9, min: 4, max: 18, step: 0.5 },          // m behind the hero
  cam_pitch: { value: 0.4, min: 0.1, max: 1.1, step: 0.02 },       // rad above the horizon
  cam_lookahead: { value: 0.35, min: 0, max: 1, step: 0.05 },      // s of running shown ahead
  cam_follow: { value: 9, min: 2, max: 30, step: 0.5 },            // how fast the camera catches up (1/s)
  cam_turn_speed: { value: 2.2, min: 0.5, max: 5, step: 0.1 },     // rad/s with Q / E
  mouse_sensitivity: { value: 0.006, min: 0.001, max: 0.02, step: 0.001 }, // rad per pixel dragged
  // ---- The challenge ----
  platform_speed: { value: 1, min: 0.3, max: 2.5, step: 0.05 },    // × every moving platform's own speed
  patrol_speed: { value: 2.6, min: 0.5, max: 6, step: 0.1 },       // m/s, beetle walk
  spike_period: { value: 1.5, min: 0.6, max: 3, step: 0.05 },      // s per spiky-ball bounce
  spike_hop: { value: 2.6, min: 1, max: 5, step: 0.1 },            // m, spiky-ball bounce height
  vanish_delay: { value: 0.6, min: 0.2, max: 2, step: 0.05 },      // s a crumbling tile holds once stood on
  vanish_return: { value: 2.5, min: 0.5, max: 6, step: 0.1 },      // s before it comes back
  fall_limit: { value: 9, min: 4, max: 20, step: 1 },              // m below the checkpoint that counts as a fall
  // ---- Look: light and post effects ----
  sun_elevation: { value: 16, min: 2, max: 70, step: 1 },         // degrees above the horizon (low = golden hour)
  sun_azimuth: { value: 110, min: 0, max: 360, step: 5 },          // degrees around the course
  exposure: { value: 1, min: 0.2, max: 1.5, step: 0.02 },       // tone-mapping exposure
  bloom_strength: { value: 0.4, min: 0, max: 2, step: 0.05 },      // glow around bright things
  bloom_threshold: { value: 1.2, min: 0, max: 3, step: 0.05 },    // how bright before it glows
  ao_strength: { value: 1, min: 0, max: 1, step: 0.05 },           // shade in creases and contact points
  volume: { value: 0.5, min: 0, max: 1, step: 0.05 },
};
