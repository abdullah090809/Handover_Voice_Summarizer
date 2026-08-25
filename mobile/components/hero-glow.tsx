import { View, StyleSheet } from 'react-native';

// Decorative backdrop for a dark `ink-900` hero card, approximating web's
// `radial-gradient(circle at 88% -10%, rgba(43,162,150,0.35), transparent
// 55%)` (pages.css's .profile-hero). RN has no gradient primitive without
// pulling in expo-linear-gradient purely for this one decorative touch, so
// this fakes the falloff with several concentric, low-opacity circles
// sharing one center point just outside the hero's top-right corner --
// each layer larger and fainter than the last, same idea as a poor man's
// radial gradient.
//
// Bug fix (this pass): the very first version of this glow used two
// hard-edged, bordered rings sized independently of each other. Because
// they didn't share a center or a coordinated size progression, the inner
// one read as a solid, oddly-cropped circle "floating" in the corner
// instead of a smooth wash -- it didn't reach the hero's actual edges, so
// there was visible flat ink-900 between the circle and the card border on
// two sides. This version anchors every layer at the SAME point (see
// CENTER_* below) and sizes the outermost layer well past the hero's
// bounds on every side, so the glow always reaches all the way to the
// card's edges regardless of the hero's actual width/height, with no hard
// perimeter line anywhere (no borders, fills only).
//
// Render this as the first child of any `position: relative, overflow:
// hidden` dark hero container -- it fills that container edge-to-edge and
// ignores touches.

// Center point, expressed as an offset from the hero's own top-right
// corner (matching the CSS radial-gradient's "88% -10%" anchor: mostly in
// from the right, slightly above the top edge).
const CENTER_FROM_RIGHT = 50;
const CENTER_FROM_TOP = -20;

// Diameter + opacity for each layer, innermost (smallest, brightest) last
// so it paints on top -- ordered here outermost-first for clarity.
const LAYERS = [
    { diameter: 420, opacity: 0.05 },
    { diameter: 300, opacity: 0.09 },
    { diameter: 190, opacity: 0.16 },
    { diameter: 100, opacity: 0.24 },
];

export function HeroGlow() {
    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {LAYERS.map((layer, i) => (
                <View
                    key={i}
                    style={{
                        position: 'absolute',
                        width: layer.diameter,
                        height: layer.diameter,
                        borderRadius: layer.diameter / 2,
                        right: CENTER_FROM_RIGHT - layer.diameter / 2,
                        top: CENTER_FROM_TOP - layer.diameter / 2,
                        backgroundColor: `rgba(43, 162, 150, ${layer.opacity})`,
                    }}
                />
            ))}
        </View>
    );
}