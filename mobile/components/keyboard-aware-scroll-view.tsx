import { forwardRef, useCallback, useContext, useEffect, useImperativeHandle, useRef } from 'react';
import {
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    TextInput,
    type NativeScrollEvent,
    type NativeSyntheticEvent,
    type ScrollViewProps,
} from 'react-native';
import { HeaderHeightContext } from '@react-navigation/elements';

// Drop-in replacement for <ScrollView> on screens that contain text inputs.
//
// Why it exists: the app runs edge-to-edge on Android, where the OS no
// longer shrinks the window when the keyboard opens, so inputs lower on a
// form ended up hidden behind the keyboard (e.g. Bio on Edit profile).
// This wrapper (1) pads the view by the keyboard height and (2) scrolls the
// focused input into view once the keyboard is up. Props are passed straight
// through to ScrollView, and the ref is the underlying ScrollView, so it can
// replace <ScrollView> without any other change.
//
// HeaderHeightContext is read directly (it is undefined outside a navigation
// header, e.g. inside an RN <Modal>) so this never throws like useHeaderHeight.
export const KeyboardAwareScrollView = forwardRef<ScrollView, ScrollViewProps>(function KeyboardAwareScrollView(
    { style, onScroll, children, keyboardShouldPersistTaps = 'handled', keyboardDismissMode = 'on-drag', ...rest },
    ref
) {
    const headerHeight = useContext(HeaderHeightContext) ?? 0;
    const scrollRef = useRef<ScrollView>(null);
    const offsetY = useRef(0);

    useImperativeHandle(ref, () => scrollRef.current as ScrollView);

    const scrollFocusedIntoView = useCallback(() => {
        try {
            const focused = (TextInput as any).State?.currentlyFocusedInput?.();
            const sv = scrollRef.current as any;
            if (!focused || !sv) return;
            sv.measureInWindow((_x: number, svY: number, _w: number, svH: number) => {
                focused.measureInWindow((_fx: number, fy: number, _fw: number, fh: number) => {
                    const overflow = fy + fh + 24 - (svY + svH);
                    if (overflow > 0) {
                        scrollRef.current?.scrollTo({ y: offsetY.current + overflow, animated: true });
                    }
                });
            });
        } catch {
            // Best effort only -- the padding above already keeps the form usable.
        }
    }, []);

    useEffect(() => {
        const sub = Keyboard.addListener('keyboardDidShow', () => {
            // Wait a beat so the padded layout has settled before measuring.
            setTimeout(scrollFocusedIntoView, 120);
        });
        return () => sub.remove();
    }, [scrollFocusedIntoView]);

    const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        offsetY.current = e.nativeEvent.contentOffset.y;
        onScroll?.(e);
    };

    const backgroundColor = StyleSheet.flatten(style)?.backgroundColor;

    return (
        <KeyboardAvoidingView
            style={[styles.flex, backgroundColor ? { backgroundColor } : null]}
            behavior="padding"
            keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
        >
            <ScrollView
                {...rest}
                ref={scrollRef}
                style={style}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                keyboardShouldPersistTaps={keyboardShouldPersistTaps}
                keyboardDismissMode={keyboardDismissMode}
            >
                {children}
            </ScrollView>
        </KeyboardAvoidingView>
    );
});

const styles = StyleSheet.create({
    flex: { flex: 1 },
});
