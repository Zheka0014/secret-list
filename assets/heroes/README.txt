BIG EYES — 8 playable character sprites

heroes.png  — transparent RGBA atlas 2048 × 1024, one hero per cell with 12 px
              padding (24 px gutters) so mipmaps never bleed between heroes.
              Alpha is cleaned (near-0 → 0, near-255 → 255) and colours are
              dilated into transparent pixels to avoid dark fringes.
heroes.json — pixel rectangles (top-left origin) and in-game height.

Order: fox, bunny, frog, axolotl, duck, kitten, raccoon, mushroom.
Rendered as camera-facing 2.5D sprites with a procedural cut-out rig.
