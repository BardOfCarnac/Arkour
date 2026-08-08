# Pose bank tuning boundary

The six authored poses and their semantic names are fixed by Runner Pose Bank v1. Transition durations in `runner-pose-bank-v1.json` are initial presentation defaults, not rules-derived values.

Before wiring speed-dependent selection into the runtime, verify at Arkour scale:

- when `neutral_fall` stops reading as sufficiently fast travel
- when `travel_feet_first` should replace it
- when a deliberate flip into `travel_head_first` improves the sense of speed
- how early the head-first exit flip must begin to guarantee feet-first landing orientation
- whether the 80ms impact and 120ms absorb defaults remain visible on mobile displays

No additional authored pose is required for the flip itself.
