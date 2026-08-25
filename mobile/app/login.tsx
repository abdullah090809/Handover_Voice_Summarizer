import { useState, useMemo } from 'react';
import {
    View,
    Text,
    Image,
    TextInput,
    Pressable,
    StyleSheet,
    ActivityIndicator,
    KeyboardAvoidingView,
    ScrollView,
    Platform,
    TextInputProps,
} from 'react-native';
import { useRouter } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useAuth } from '../lib/auth-context';
import { authApi, ApiError } from '../lib/api';
import { fontFamily, fontSize, space, radius, shadow, type BrandColors } from '../constants/design-tokens';
import { useThemeColors } from '../lib/theme-context';

// This screen used to hardcode `const colors = lightColors` at module
// scope, deliberately staying light regardless of the phone's dark/light
// setting. That was fine while dark mode didn't exist yet, but now every
// other screen repaints on toggle and this one didn't, so anyone who signs
// out (or launches signed-out) landed on a stark white card in the middle
// of an otherwise dark app. Switched to useThemeColors() like every other
// screen so Login repaints with the rest of the app instead of being the
// one screen frozen on light -- see theme-context.tsx for the matching
// native-background half of that same fix.
//
// This is also now a full port of the web app's AuthPage.jsx multi-view
// flow (login / register / verify / forgot / reset) instead of a
// login-only screen -- the mobile client had the full authApi surface
// (register/verify/resendOtp/forgotPassword/resetPassword) sitting unused
// in lib/api.ts already, just never wired up to any UI here. Deliberately
// NOT porting web's Turnstile captcha widget -- auth-context.tsx's login()
// already sends a hardcoded 'mobile-app' bypass token the backend accepts
// in place of a real Turnstile token (see its own comment), so there's
// nothing for a mobile equivalent to render.
//
// Structured as one screen with local view-state (not five separate
// expo-router routes) for the same reason AuthPage.jsx is one component
// with view-state on web: these five views are really one flow a person
// moves through linearly, sharing the same card chrome and the same
// success/error banner slot above whichever form is active -- a separate
// route per view would mean re-deriving that shared chrome five times and
// would put "back" navigation (which here just means "show a different
// form in the same card") through the native stack instead of a plain
// state change.

// Named AuthView, not View -- a bare `type View = ...` here shadows the
// `View` component imported from react-native above, which TS flags as an
// import/local-declaration conflict (and would silently break every <View>
// in this file's JSX if it didn't).
type AuthView = 'login' | 'register' | 'verify' | 'forgot' | 'reset';
type Banner = { type: 'success' | 'error'; message: string } | null;
type GoTo = (view: AuthView, opts?: { email?: string; banner?: Banner }) => void;

type Styles = ReturnType<typeof createStyles>;

export default function LoginScreen() {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const router = useRouter();
    const [view, setView] = useState<AuthView>('login');
    const [prefillEmail, setPrefillEmail] = useState('');
    const [banner, setBanner] = useState<Banner>(null);

    const goTo: GoTo = (nextView, opts = {}) => {
        setBanner(opts.banner ?? null);
        if (opts.email !== undefined) setPrefillEmail(opts.email);
        setView(nextView);
    };

    return (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
                <View style={styles.inner}>
                    <View style={styles.brandRow}>
                        <View style={styles.brandMark}>
                            <Image source={require('../assets/images/logo.png')} style={styles.brandMarkImage} resizeMode="contain" />
                        </View>
                        <Text style={styles.brandName}>Handover Voice Summarizer</Text>
                    </View>

                    {/* Reachable pre-login on purpose: if the saved/default backend
                        URL is wrong or stale (e.g. the dev machine's LAN IP changed),
                        login itself can never succeed, so fixing it can't be gated
                        behind being logged in. See server-settings.tsx. */}
                    <Pressable style={styles.serverLink} onPress={() => router.push('/server-settings')} hitSlop={8}>
                        <Feather name="server" size={13} color={colors.textTertiary} />
                        <Text style={styles.serverLinkText}>Server settings</Text>
                    </Pressable>

                    <View style={styles.card}>
                        {banner && (
                            <View style={[styles.banner, banner.type === 'error' ? styles.bannerError : styles.bannerSuccess]}>
                                <Feather
                                    name={banner.type === 'error' ? 'alert-circle' : 'check-circle'}
                                    size={16}
                                    color={banner.type === 'error' ? colors.urgency.high : colors.urgency.low}
                                />
                                <Text style={[styles.bannerText, { color: banner.type === 'error' ? colors.urgency.high : colors.urgency.low }]}>
                                    {banner.message}
                                </Text>
                            </View>
                        )}

                        {view === 'login' && <LoginForm goTo={goTo} styles={styles} colors={colors} />}
                        {view === 'register' && <RegisterForm goTo={goTo} styles={styles} colors={colors} />}
                        {view === 'verify' && <VerifyForm goTo={goTo} prefillEmail={prefillEmail} styles={styles} colors={colors} />}
                        {view === 'forgot' && <ForgotForm goTo={goTo} styles={styles} colors={colors} />}
                        {view === 'reset' && <ResetForm goTo={goTo} prefillEmail={prefillEmail} styles={styles} colors={colors} />}
                    </View>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

// ---------------------------------------------------------------------------
// Shared field primitives
// ---------------------------------------------------------------------------

type IconFieldProps = TextInputProps & {
    styles: Styles;
    colors: BrandColors;
    icon: keyof typeof Feather.glyphMap;
    label: string;
    hint?: string;
};

function IconField({ styles, colors, icon, label, hint, ...inputProps }: IconFieldProps) {
    return (
        <View style={styles.field}>
            <Text style={styles.fieldLabel}>{label}</Text>
            <View style={styles.inputWrap}>
                <Feather name={icon} size={16} color={colors.textTertiary} />
                <TextInput style={styles.inputWithIcon} placeholderTextColor={colors.textTertiary} {...inputProps} />
            </View>
            {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
        </View>
    );
}

function PasswordField({
    styles,
    colors,
    label,
    hint,
    value,
    onChangeText,
    autoComplete,
    editable,
}: {
    styles: Styles;
    colors: BrandColors;
    label: string;
    hint?: string;
    value: string;
    onChangeText: (t: string) => void;
    autoComplete?: TextInputProps['autoComplete'];
    editable?: boolean;
}) {
    const [visible, setVisible] = useState(false);
    return (
        <View style={styles.field}>
            <Text style={styles.fieldLabel}>{label}</Text>
            <View style={styles.inputWrap}>
                <Feather name="lock" size={16} color={colors.textTertiary} />
                <TextInput
                    style={styles.inputWithIcon}
                    value={value}
                    onChangeText={onChangeText}
                    secureTextEntry={!visible}
                    autoCapitalize="none"
                    autoComplete={autoComplete}
                    editable={editable}
                    placeholder="••••••••"
                    placeholderTextColor={colors.textTertiary}
                />
                <Pressable style={styles.inputSuffixBtn} onPress={() => setVisible((v) => !v)} hitSlop={8}>
                    <Feather name={visible ? 'eye-off' : 'eye'} size={15} color={colors.textSecondary} />
                    <Text style={styles.inputSuffixText}>{visible ? 'Hide' : 'Show'}</Text>
                </Pressable>
            </View>
            {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
        </View>
    );
}

function OtpField({ styles, colors, label, value, onChangeText }: { styles: Styles; colors: BrandColors; label: string; value: string; onChangeText: (t: string) => void }) {
    return (
        <View style={styles.field}>
            <Text style={styles.fieldLabel}>{label}</Text>
            <TextInput
                style={styles.otpInput}
                value={value}
                onChangeText={(t) => onChangeText(t.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="••••••"
                placeholderTextColor={colors.textTertiary}
            />
        </View>
    );
}

function BackRow({ styles, colors, onPress }: { styles: Styles; colors: BrandColors; onPress: () => void }) {
    return (
        <Pressable style={styles.backRow} onPress={onPress} hitSlop={8}>
            <Feather name="arrow-left" size={15} color={colors.textSecondary} />
            <Text style={styles.backText}>Back</Text>
        </Pressable>
    );
}

// ---------------------------------------------------------------------------
function LoginForm({ goTo, styles, colors }: { goTo: GoTo; styles: Styles; colors: BrandColors }) {
    const { login } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    async function handleLogin() {
        setError('');
        if (!email || !password) {
            setError('Please enter both email and password.');
            return;
        }
        setLoading(true);
        try {
            await login(email, password);
        } catch (err) {
            if (err instanceof ApiError) {
                setError(err.status === 401 ? 'Incorrect email or password.' : err.message);
            } else {
                setError('Something went wrong. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    }

    return (
        <>
            <View style={styles.cardHeader}>
                <Text style={styles.title}>Sign in</Text>
                <View style={styles.subtitleRow}>
                    <Text style={styles.subtitle}>New to Handover? </Text>
                    <Pressable onPress={() => goTo('register')} hitSlop={6}>
                        <Text style={styles.linkText}>Create an account</Text>
                    </Pressable>
                </View>
            </View>

            <View style={styles.form}>
                <IconField
                    styles={styles}
                    colors={colors}
                    icon="mail"
                    label="Email"
                    placeholder="you@carehome.com"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    autoComplete="email"
                    editable={!loading}
                />
                <PasswordField styles={styles} colors={colors} label="Password" value={password} onChangeText={setPassword} autoComplete="current-password" editable={!loading} />

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <Pressable
                    style={({ pressed }) => [styles.button, loading && styles.buttonDisabled, pressed && styles.buttonPressed]}
                    onPress={handleLogin}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color={colors.white} />
                    ) : (
                        <View style={styles.buttonRow}>
                            <Text style={styles.buttonText}>Sign In</Text>
                            <Feather name="arrow-right" size={16} color={colors.white} />
                        </View>
                    )}
                </Pressable>

                <Pressable style={styles.centerLink} onPress={() => goTo('forgot')} hitSlop={6}>
                    <Text style={styles.linkTextCenter}>Forgot password?</Text>
                </Pressable>
            </View>
        </>
    );
}

// ---------------------------------------------------------------------------
function RegisterForm({ goTo, styles, colors }: { goTo: GoTo; styles: Styles; colors: BrandColors }) {
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    async function onSubmit() {
        setError('');
        if (!/^[a-zA-Z0-9_.]{3,30}$/.test(username)) {
            setError('Username must be 3-30 characters, letters, numbers, "." or "_" only.');
            return;
        }
        if (password.length < 8) {
            setError('Password must be at least 8 characters.');
            return;
        }
        setLoading(true);
        try {
            await authApi.register(email, username, password, name.trim());
            goTo('verify', { email, banner: { type: 'success', message: 'Registration received. Enter the code we emailed you to verify your account.' } });
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Something went wrong.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <>
            <BackRow styles={styles} colors={colors} onPress={() => goTo('login')} />
            <View style={styles.cardHeader}>
                <Text style={styles.title}>Create your account</Text>
                <Text style={styles.subtitle}>You&apos;ll verify your email with a 6-digit code next.</Text>
            </View>

            <View style={styles.form}>
                <IconField
                    styles={styles}
                    colors={colors}
                    icon="user"
                    label="Full name"
                    hint="Shown to your team on handovers and shifts"
                    placeholder="Optional"
                    value={name}
                    onChangeText={setName}
                    editable={!loading}
                />
                <IconField
                    styles={styles}
                    colors={colors}
                    icon="hash"
                    label="Username"
                    hint="3-30 characters: letters, numbers, . or _"
                    value={username}
                    onChangeText={(t) => setUsername(t.trim())}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="username"
                    editable={!loading}
                />
                <IconField
                    styles={styles}
                    colors={colors}
                    icon="mail"
                    label="Email"
                    placeholder="you@carehome.com"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    autoComplete="email"
                    editable={!loading}
                />
                <PasswordField
                    styles={styles}
                    colors={colors}
                    label="Password"
                    hint="Minimum 8 characters"
                    value={password}
                    onChangeText={setPassword}
                    autoComplete="new-password"
                    editable={!loading}
                />

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <Pressable
                    style={({ pressed }) => [styles.button, loading && styles.buttonDisabled, pressed && styles.buttonPressed]}
                    onPress={onSubmit}
                    disabled={loading}
                >
                    {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Create account</Text>}
                </Pressable>

                <Pressable style={styles.centerLink} onPress={() => goTo('verify')} hitSlop={6}>
                    <Text style={styles.linkTextCenter}>Have a code already?</Text>
                </Pressable>
            </View>
        </>
    );
}

// ---------------------------------------------------------------------------
function VerifyForm({ goTo, prefillEmail, styles, colors }: { goTo: GoTo; prefillEmail: string; styles: Styles; colors: BrandColors }) {
    const [email, setEmail] = useState(prefillEmail || '');
    const [otp, setOtp] = useState('');
    const [error, setError] = useState('');
    const [resendMsg, setResendMsg] = useState('');
    const [loading, setLoading] = useState(false);
    const [resending, setResending] = useState(false);

    async function onSubmit() {
        setError('');
        setResendMsg('');
        if (!email) {
            setError('Enter your email address.');
            return;
        }
        if (otp.length !== 6) {
            setError('Enter the 6-digit code.');
            return;
        }
        setLoading(true);
        try {
            await authApi.verify(email, otp);
            goTo('login', { email, banner: { type: 'success', message: 'Your account is verified. Sign in to continue.' } });
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Something went wrong.');
        } finally {
            setLoading(false);
        }
    }

    async function resend() {
        if (!email) {
            setError('Enter your email address first.');
            return;
        }
        setResending(true);
        setError('');
        setResendMsg('');
        try {
            await authApi.resendOtp(email);
            setResendMsg('A new code has been sent.');
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Could not resend the code.');
        } finally {
            setResending(false);
        }
    }

    return (
        <>
            <BackRow styles={styles} colors={colors} onPress={() => goTo('login')} />
            <View style={styles.cardHeader}>
                <Text style={styles.title}>Verify your email</Text>
                <Text style={styles.subtitle}>Enter the 6-digit code we sent to your inbox.</Text>
            </View>

            <View style={styles.form}>
                <IconField
                    styles={styles}
                    colors={colors}
                    icon="mail"
                    label="Email"
                    placeholder="you@carehome.com"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    editable={!loading}
                />
                <OtpField styles={styles} colors={colors} label="Verification code" value={otp} onChangeText={setOtp} />

                {error ? <Text style={styles.error}>{error}</Text> : null}
                {resendMsg ? <Text style={styles.successText}>{resendMsg}</Text> : null}

                <Pressable
                    style={({ pressed }) => [styles.button, loading && styles.buttonDisabled, pressed && styles.buttonPressed]}
                    onPress={onSubmit}
                    disabled={loading}
                >
                    {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Verify account</Text>}
                </Pressable>
                <Pressable
                    style={({ pressed }) => [styles.secondaryButton, resending && styles.buttonDisabled, pressed && styles.secondaryButtonPressed]}
                    onPress={resend}
                    disabled={resending}
                >
                    <Text style={styles.secondaryButtonText}>{resending ? 'Sending…' : 'Resend code'}</Text>
                </Pressable>
            </View>
        </>
    );
}

// ---------------------------------------------------------------------------
function ForgotForm({ goTo, styles, colors }: { goTo: GoTo; styles: Styles; colors: BrandColors }) {
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    async function onSubmit() {
        setError('');
        if (!email) {
            setError('Enter your email address.');
            return;
        }
        setLoading(true);
        try {
            await authApi.forgotPassword(email);
            goTo('reset', { email, banner: { type: 'success', message: 'If that email is registered, a reset code is on its way.' } });
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Something went wrong.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <>
            <BackRow styles={styles} colors={colors} onPress={() => goTo('login')} />
            <View style={styles.cardHeader}>
                <Text style={styles.title}>Forgot password</Text>
                <Text style={styles.subtitle}>We&apos;ll email you a code to reset it.</Text>
            </View>

            <View style={styles.form}>
                <IconField
                    styles={styles}
                    colors={colors}
                    icon="mail"
                    label="Email"
                    placeholder="you@carehome.com"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    editable={!loading}
                />

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <Pressable
                    style={({ pressed }) => [styles.button, loading && styles.buttonDisabled, pressed && styles.buttonPressed]}
                    onPress={onSubmit}
                    disabled={loading}
                >
                    {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Send reset code</Text>}
                </Pressable>

                <Pressable style={styles.centerLink} onPress={() => goTo('reset')} hitSlop={6}>
                    <Text style={styles.linkTextCenter}>Already have a code?</Text>
                </Pressable>
            </View>
        </>
    );
}

// ---------------------------------------------------------------------------
function ResetForm({ goTo, prefillEmail, styles, colors }: { goTo: GoTo; prefillEmail: string; styles: Styles; colors: BrandColors }) {
    const [email, setEmail] = useState(prefillEmail || '');
    const [otp, setOtp] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    async function onSubmit() {
        setError('');
        if (!email) {
            setError('Enter your email address.');
            return;
        }
        if (otp.length !== 6) {
            setError('Enter the 6-digit code.');
            return;
        }
        if (password.length < 8) {
            setError('New password must be at least 8 characters.');
            return;
        }
        setLoading(true);
        try {
            await authApi.resetPassword(email, otp, password);
            goTo('login', { email, banner: { type: 'success', message: 'Password updated. Sign in with your new password.' } });
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Something went wrong.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <>
            <BackRow styles={styles} colors={colors} onPress={() => goTo('login')} />
            <View style={styles.cardHeader}>
                <Text style={styles.title}>Reset password</Text>
                <Text style={styles.subtitle}>Enter the code we emailed you and choose a new password.</Text>
            </View>

            <View style={styles.form}>
                <IconField
                    styles={styles}
                    colors={colors}
                    icon="mail"
                    label="Email"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    editable={!loading}
                />
                <OtpField styles={styles} colors={colors} label="Reset code" value={otp} onChangeText={setOtp} />
                <PasswordField
                    styles={styles}
                    colors={colors}
                    label="New password"
                    hint="Minimum 8 characters"
                    value={password}
                    onChangeText={setPassword}
                    autoComplete="new-password"
                    editable={!loading}
                />

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <Pressable
                    style={({ pressed }) => [styles.button, loading && styles.buttonDisabled, pressed && styles.buttonPressed]}
                    onPress={onSubmit}
                    disabled={loading}
                >
                    {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Update password</Text>}
                </Pressable>
            </View>
        </>
    );
}

// ---------------------------------------------------------------------------
function createStyles(colors: BrandColors) {
    return StyleSheet.create({
        flex: { flex: 1, backgroundColor: colors.surfaceApp },
        container: {
            flexGrow: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: space[6],
            backgroundColor: colors.surfaceApp,
        },
        inner: { width: '100%', maxWidth: 400, alignItems: 'center', gap: space[6] },
        brandRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
        brandMark: {
            width: 36,
            height: 36,
            alignItems: 'center',
            justifyContent: 'center',
        },
        brandMarkImage: { width: 36, height: 36 },
        brandName: {
            fontFamily: fontFamily.uiBold,
            fontSize: fontSize.lg,
            letterSpacing: -0.2,
            color: colors.textPrimary,
        },
        serverLink: { flexDirection: 'row', alignItems: 'center', gap: space[1], marginTop: -space[3] },
        serverLinkText: { fontFamily: fontFamily.ui, fontSize: fontSize.xs, color: colors.textTertiary },
        card: {
            width: '100%',
            gap: space[6],
            backgroundColor: colors.surfaceCard,
            borderWidth: 1,
            borderColor: colors.borderDefault,
            borderRadius: radius.lg,
            padding: space[8],
            ...shadow.lg,
        },
        cardHeader: { gap: space[2] },
        title: {
            fontFamily: fontFamily.readingSemiBold,
            fontSize: fontSize['2xl'],
            letterSpacing: -0.2,
            color: colors.textPrimary,
        },
        subtitle: { fontFamily: fontFamily.ui, fontSize: fontSize.sm, color: colors.textSecondary },
        subtitleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
        linkText: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.sm, color: colors.textLink },
        linkTextCenter: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.sm, color: colors.textLink, textAlign: 'center' },
        centerLink: { alignItems: 'center', paddingTop: space[1] },
        backRow: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
        backText: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.sm, color: colors.textSecondary },

        // Success/error banner shown above whichever form is active --
        // mirrors AuthPage.jsx's .form-error-banner / .form-success-banner,
        // reused across every view rather than each form owning its own.
        banner: {
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: space[2],
            borderWidth: 1,
            borderRadius: radius.md,
            padding: space[3],
        },
        bannerError: { backgroundColor: colors.urgency.highBg, borderColor: colors.urgency.highBorder },
        bannerSuccess: { backgroundColor: colors.urgency.lowBg, borderColor: colors.urgency.lowBorder },
        bannerText: { flex: 1, fontFamily: fontFamily.ui, fontSize: fontSize.sm, lineHeight: fontSize.sm * 1.4 },

        form: { gap: space[4] },
        field: { gap: space[2] },
        fieldLabel: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.sm, color: colors.textPrimary },
        fieldHint: { fontFamily: fontFamily.ui, fontSize: fontSize.xs, color: colors.textTertiary },

        // Icon + input row. Icon and (for passwords) the show/hide button
        // sit as ordinary flex siblings of the TextInput inside this row
        // rather than absolutely positioned over it -- simpler than
        // matching web's CSS, and sidesteps having to hand-tune padding to
        // avoid the input text ever sliding under the icon/button.
        inputWrap: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[2],
            height: 44,
            borderWidth: 1,
            borderColor: colors.borderStrong,
            borderRadius: radius.md,
            paddingHorizontal: space[3],
            backgroundColor: colors.surfaceCard,
        },
        inputWithIcon: {
            flex: 1,
            height: '100%',
            padding: 0,
            fontFamily: fontFamily.ui,
            fontSize: fontSize.base,
            color: colors.textPrimary,
        },
        inputSuffixBtn: { flexDirection: 'row', alignItems: 'center', gap: space[1], paddingLeft: space[2] },
        inputSuffixText: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.xs, color: colors.textSecondary },

        otpInput: {
            height: 48,
            borderWidth: 1,
            borderColor: colors.borderStrong,
            borderRadius: radius.md,
            paddingHorizontal: space[3],
            fontFamily: fontFamily.mono,
            fontSize: fontSize.lg,
            letterSpacing: 8,
            textAlign: 'center',
            color: colors.textPrimary,
            backgroundColor: colors.surfaceCard,
        },

        error: { fontFamily: fontFamily.ui, color: colors.urgency.high, fontSize: fontSize.sm },
        successText: { fontFamily: fontFamily.ui, color: colors.urgency.low, fontSize: fontSize.sm },

        button: {
            height: 48,
            backgroundColor: colors.teal[600],
            borderRadius: radius.full,
            alignItems: 'center',
            justifyContent: 'center',
        },
        buttonRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
        buttonPressed: { backgroundColor: colors.teal[700] },
        buttonDisabled: { opacity: 0.55 },
        buttonText: { color: colors.white, fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.base },

        secondaryButton: {
            height: 44,
            borderWidth: 1,
            borderColor: colors.borderStrong,
            borderRadius: radius.full,
            alignItems: 'center',
            justifyContent: 'center',
        },
        secondaryButtonPressed: { backgroundColor: colors.surfaceHover },
        secondaryButtonText: { color: colors.textPrimary, fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.base },
    });
}