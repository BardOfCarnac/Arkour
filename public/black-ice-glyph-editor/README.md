# Black ICE Glyph Editor

Standalone 13-point 3D glyph editor for experimenting with Black ICE silhouettes without changing the Runner rig or runtime.

## Rig v2

The editor now authors the starfish directly rather than generating its armpits automatically.

Contour points, in order:

1. `frontTip`
2. `frontRightPit`
3. `rightFrontTip`
4. `rightRearPit`
5. `rearRightTip`
6. `rearPit`
7. `rearLeftTip`
8. `leftRearPit`
9. `leftFrontTip`
10. `frontLeftPit`

Internal points:

- `core`
- `innerFront`
- `innerRear`

The internal structure links the core to the front/rear internal points and selected pits. `innerFront` continues toward the front tip; `innerRear` continues toward the rear pit.

Seed asset: `starfish-v2.json`. The previous `starfish-v1.json` remains in the repository for history/backward reference.

## Orientation

The seed is flat on the ground. Black ICE v2 uses ordinary 3D axes:

- X = left/right
- Z = front/back on the ground plane
- Y = height
- front = negative Z, terminating at `frontTip`

Top is therefore the default editing view.

## Controls

- Top: X/Z drag plane
- Front: X/Y drag plane
- Side: Z/Y drag plane
- Orbit: camera-facing drag plane
- Selected Height Y: precise vertical editing on mobile
- Curve: contour smoothing
- Fill: preview opacity
- Flatten to Ground, reset, copy JSON v2, download JSON

The page remains mobile-first: the canvas stays visible and the tool panel opens as a bottom sheet on phones or a right drawer on larger screens.

## Migration

If the browser contains a locally saved v1 five-tip glyph, the editor migrates it once into the v2 anatomy by rotating the old upright X/Y silhouette onto the X/Z ground plane, preserving old Z deformation as new Y height, then deriving initial pits/internal points. New saves use the v2 storage key.
