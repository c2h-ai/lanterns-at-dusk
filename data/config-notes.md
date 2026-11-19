# The values' notes

What `prototypes/lanterns-at-dusk/config.js` said beside its values, kept here because `data/config.json`
holds no comments. The values themselves are in `data/config.json`.

- `seed`: every gameplay random call reads rng(), seeded from this (or ?seed= in the address)
---- Rowing (the hook) ----
- `stroke_time`: s per oar stroke while W is held
- `stroke_thrust`: m/s² pushed during the power half of a stroke
- `back_thrust`: m/s² backing water with S
- `water_drag`: 1/s, how fast the glide fades
- `side_grip`: 1/s, how fast sideways drift is killed (the keel)
- `turn_rate`: rad/s at full turn
- `turn_ease`: 1/s, how fast turning starts and stops
- `max_speed`: m/s
- `shore_bounce`: share of speed kept when nudged off a shore
---- Lanterns and the story ----
- `lantern_reach`: m, how close the boat must be to light one
- `lantern_glimmer_range`: m, unlit lanterns flicker when the boat is this near
- `lantern_beam`: brightness of the light column over an unlit lantern
- `memory_hold`: s a memory line stays on screen
- `dusk_speed`: how fast the sky moves toward the next stage (1/s)
- `ending_time`: s of the lighthouse ending before the results
---- Camera ----
- `cam_distance`: m behind the boat
- `cam_height`: m above the water
- `cam_follow`: 1/s, how fast the camera swings behind
- `mouse_sensitivity`: rad per pixel dragged
- `look_return`: 1/s, how fast a dragged view drifts back
---- Look ----
- `water_ripple`: size of the small waves
- `reflection_blur`: how much waves break up the mirror
- `fog_far`: m, where the haze is complete
