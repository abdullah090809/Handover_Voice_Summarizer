import React, { useState } from 'react';
import { Mail, Lock, Hash, ArrowRight, Stethoscope, AlertCircle, CheckCircle2, ArrowLeft, UserRound } from 'lucide-react';
import { useAuth } from '../lib/AuthContext.jsx';
import { authApi, ApiError } from '../lib/api.js';
import { useToast } from '../lib/ToastContext.jsx';
import { Field, IconInput } from '../components/Field.jsx';
import { useTurnstile } from '../lib/useTurnstile.js';

const VIEWS = ['login', 'register', 'verify', 'forgot', 'reset'];

export default function AuthPage() {
  const [view, setView] = useState('login');
  const [prefillEmail, setPrefillEmail] = useState('');
  const [banner, setBanner] = useState(null); // { type: 'success'|'error', message }

  function goTo(nextView, opts = {}) {
    setBanner(opts.banner || null);
    if (opts.email !== undefined) setPrefillEmail(opts.email);
    setView(nextView);
  }

  return (
    <div className="auth-screen">
      <aside className="auth-side">
        <div className="auth-side-brand">
          <div className="auth-side-brand-mark">
            <Stethoscope size={20} />
          </div>
          <strong>Handover</strong>
        </div>

        <div className="auth-side-copy">
          <h1>Shift handovers your team can trust.</h1>
          <p>
            Record a handover by voice, and it's transcribed and structured automatically &mdash; key events,
            medications, incidents, and follow-ups, organized the moment your shift ends.
          </p>
        </div>

        <div className="auth-side-stats">
          <div className="auth-side-stat">
            <strong>24/7</strong>
            <span>Live handover alerts</span>
          </div>
          <div className="auth-side-stat">
            <strong>&lt; 2min</strong>
            <span>To record a handover</span>
          </div>
        </div>
      </aside>

      <div className="auth-main">
        <div className="auth-main-inner">
          <div className="auth-mobile-brand">
            <div className="auth-side-brand-mark">
              <Stethoscope size={18} />
            </div>
            <strong>Handover</strong>
          </div>

          <div className="auth-card">
            {banner && (
              <div className={banner.type === 'error' ? 'form-error-banner' : 'form-success-banner'}>
                {banner.type === 'error' ? <AlertCircle /> : <CheckCircle2 />}
                <span>{banner.message}</span>
              </div>
            )}

            {view === 'login' && <LoginForm goTo={goTo} />}
            {view === 'register' && <RegisterForm goTo={goTo} />}
            {view === 'verify' && <VerifyForm goTo={goTo} prefillEmail={prefillEmail} />}
            {view === 'forgot' && <ForgotForm goTo={goTo} />}
            {view === 'reset' && <ResetForm goTo={goTo} prefillEmail={prefillEmail} />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function LoginForm({ goTo }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const turnstile = useTurnstile(true);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (!turnstile.token) {
      setError('Please complete the verification check below.');
      return;
    }
    setLoading(true);
    try {
      await login(email, password, turnstile.token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
      turnstile.reset();
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="auth-card-header">
        <h2>Sign in</h2>
        <p>Enter your details to access your shift dashboard.</p>
      </div>
      <form className="auth-form" onSubmit={onSubmit}>
        <Field label="Email address" htmlFor="login-email">
          <IconInput
            icon={Mail}
            id="login-email"
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password" htmlFor="login-password">
          <IconInput
            icon={Lock}
            id="login-password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        <div className="auth-turnstile" ref={turnstile.containerRef} />

        {error && (
          <div className="form-error-banner">
            <AlertCircle />
            <span>{error}</span>
          </div>
        )}

        <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading}>
          {loading ? <span className="spinner" /> : <>Sign in <ArrowRight size={16} /></>}
        </button>

        <div className="auth-links">
          <button type="button" className="link-btn" onClick={() => goTo('register')}>
            Create account
          </button>
          <button type="button" className="link-btn" onClick={() => goTo('forgot')}>
            Forgot password?
          </button>
        </div>
      </form>
    </>
  );
}

// ---------------------------------------------------------------------------
function RegisterForm({ goTo }) {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (!/^[a-zA-Z0-9_.]{3,30}$/.test(username)) {
      setError('Username must be 3-30 characters, letters, numbers, "." or "_" only.');
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
      <div className="auth-card-header">
        <h2>Create your account</h2>
        <p>You'll verify your email with a 6-digit code next.</p>
      </div>
      <form className="auth-form" onSubmit={onSubmit}>
        <Field label="Full name" htmlFor="reg-name" optional hint="Shown to your team on handovers and shifts">
          <IconInput icon={UserRound} id="reg-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Username" htmlFor="reg-username" hint="3-30 characters: letters, numbers, . or _">
          <IconInput
            icon={Hash}
            id="reg-username"
            type="text"
            required
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value.trim())}
          />
        </Field>
        <Field label="Email address" htmlFor="reg-email">
          <IconInput icon={Mail} id="reg-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" htmlFor="reg-password" hint="Minimum 8 characters">
          <IconInput
            icon={Lock}
            id="reg-password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        {error && (
          <div className="form-error-banner">
            <AlertCircle />
            <span>{error}</span>
          </div>
        )}

        <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading}>
          {loading ? <span className="spinner" /> : 'Create account'}
        </button>

        <div className="auth-links">
          <button type="button" className="link-btn" onClick={() => goTo('login')}>
            Back to sign in
          </button>
          <button type="button" className="link-btn" onClick={() => goTo('verify')}>
            Have a code already?
          </button>
        </div>
      </form>
    </>
  );
}

// ---------------------------------------------------------------------------
function VerifyForm({ goTo, prefillEmail }) {
  const [email, setEmail] = useState(prefillEmail || '');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [resendMsg, setResendMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
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
    if (!email) return setError('Enter your email address first.');
    setResending(true);
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
      <button type="button" className="auth-back" onClick={() => goTo('login')}>
        <ArrowLeft /> Back
      </button>
      <div className="auth-card-header">
        <h2>Verify your email</h2>
        <p>Enter the 6-digit code we sent to your inbox.</p>
      </div>
      <form className="auth-form" onSubmit={onSubmit}>
        <Field label="Email address" htmlFor="verify-email">
          <IconInput icon={Mail} id="verify-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Verification code" htmlFor="verify-otp">
          <IconInput
            icon={Hash}
            id="verify-otp"
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            required
            className="otp-input"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
          />
        </Field>

        {error && (
          <div className="form-error-banner">
            <AlertCircle />
            <span>{error}</span>
          </div>
        )}
        {resendMsg && (
          <div className="form-success-banner">
            <CheckCircle2 />
            <span>{resendMsg}</span>
          </div>
        )}

        <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading}>
          {loading ? <span className="spinner" /> : 'Verify account'}
        </button>
        <button type="button" className="btn btn-secondary btn-block" onClick={resend} disabled={resending}>
          {resending ? 'Sending…' : 'Resend code'}
        </button>
      </form>
    </>
  );
}

// ---------------------------------------------------------------------------
function ForgotForm({ goTo }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
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
      <button type="button" className="auth-back" onClick={() => goTo('login')}>
        <ArrowLeft /> Back
      </button>
      <div className="auth-card-header">
        <h2>Forgot password</h2>
        <p>We'll email you a code to reset it.</p>
      </div>
      <form className="auth-form" onSubmit={onSubmit}>
        <Field label="Email address" htmlFor="forgot-email">
          <IconInput icon={Mail} id="forgot-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        {error && (
          <div className="form-error-banner">
            <AlertCircle />
            <span>{error}</span>
          </div>
        )}
        <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading}>
          {loading ? <span className="spinner" /> : 'Send reset code'}
        </button>
        <div className="auth-links">
          <button type="button" className="link-btn" onClick={() => goTo('reset')}>
            Already have a code?
          </button>
          <span />
        </div>
      </form>
    </>
  );
}

// ---------------------------------------------------------------------------
function ResetForm({ goTo, prefillEmail }) {
  const [email, setEmail] = useState(prefillEmail || '');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
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
      <button type="button" className="auth-back" onClick={() => goTo('login')}>
        <ArrowLeft /> Back
      </button>
      <div className="auth-card-header">
        <h2>Reset password</h2>
        <p>Enter the code we emailed you and choose a new password.</p>
      </div>
      <form className="auth-form" onSubmit={onSubmit}>
        <Field label="Email address" htmlFor="reset-email">
          <IconInput icon={Mail} id="reset-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Reset code" htmlFor="reset-otp">
          <IconInput
            icon={Hash}
            id="reset-otp"
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            required
            className="otp-input"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
          />
        </Field>
        <Field label="New password" htmlFor="reset-password" hint="Minimum 8 characters">
          <IconInput
            icon={Lock}
            id="reset-password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error && (
          <div className="form-error-banner">
            <AlertCircle />
            <span>{error}</span>
          </div>
        )}
        <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading}>
          {loading ? <span className="spinner" /> : 'Update password'}
        </button>
      </form>
    </>
  );
}