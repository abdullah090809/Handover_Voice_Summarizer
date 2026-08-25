import { type ReactNode } from 'react';
import { Pressable, type StyleProp, type ViewStyle, type GestureResponderEvent } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';

// Shared press-feedback wrapper. Before this, every tappable card in the
// app (Team, Residents, Handovers, Alerts...) was a bare <Pressable> and
// relied on RN's default opacity dim on press -- a flat, slightly dated
// feel with no depth. This swaps in a small scale-down + opacity dip on
// press-in that springs back on release, the same physical feedback
// pattern iOS/Android's own native lists use. One component, reused
// everywhere, so the whole app's tap feedback feels consistent rather than
// each screen inventing (or not inventing) its own.
//
// Deliberately built on Reanimated's shared values + withTiming rather than
// the RN Animated API -- Reanimated already ships in this app (see
// app/_layout.tsx's import), and driving the transform on the UI thread
// keeps the feedback snappy even during a heavier JS-thread screen (e.g.
// the Handovers list re-rendering while a recording uploads).
type AnimatedPressableProps = {
    children: ReactNode;
    onPress?: (event: GestureResponderEvent) => void;
    style?: StyleProp<ViewStyle>;
    disabled?: boolean;
    scaleTo?: number;
    hitSlop?: number;
};

export function AnimatedPressable({ children, onPress, style, disabled, scaleTo = 0.97, hitSlop }: AnimatedPressableProps) {
    const scale = useSharedValue(1);
    const opacity = useSharedValue(1);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
        opacity: opacity.value,
    }));

    function handlePressIn() {
        scale.value = withTiming(scaleTo, { duration: 100, easing: Easing.out(Easing.quad) });
        opacity.value = withTiming(0.92, { duration: 100 });
    }

    function handlePressOut() {
        scale.value = withTiming(1, { duration: 150, easing: Easing.out(Easing.quad) });
        opacity.value = withTiming(1, { duration: 150 });
    }

    return (
        <Pressable
            onPress={onPress}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            disabled={disabled}
            hitSlop={hitSlop}
        >
            <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>
        </Pressable>
    );
}
