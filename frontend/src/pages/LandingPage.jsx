import React, { useEffect, useState, useId } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Mic, FileText, ListChecks, Bell, Users, ShieldCheck, History, Home, Clock, Sun, Moon, Menu, X, ArrowRight, Plus, LayoutDashboard, CalendarClock, ClipboardList, Check, AlertTriangle } from 'lucide-react';
import { useAuth } from '../lib/AuthContext.jsx';
import { useTheme } from '../lib/ThemeContext.jsx';
import { FullScreenLoader } from '../components/RouteGuards.jsx';
import { UrgencyBadge } from '../components/Badge.jsx';
import '../styles/landing.css';

const NAV = [
  ['Product', '#product'],
  ['How it works', '#how-it-works'],
  ['Features', '#features'],
  ['FAQ', '#faq'],
  ['Security', '#security'],
];

function Brand() {
  return (
    <Link to="/" className="lp-brand" aria-label="Handover home">
      <span className="lp-brand-mark"><img src="/logo.png" alt="" /></span>
      <strong>Handover</strong>
    </Link>
  );
}

function Header() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState('');
  const { isDark, toggleTheme } = useTheme();
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return undefined;
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setActive('#' + e.target.id)), { rootMargin: '-45% 0px -50% 0px' });
    NAV.forEach(([, h]) => { const el = document.querySelector(h); if (el) io.observe(el); });
    return () => io.disconnect();
  }, []);
  return (
    <header className="lp-header">
      <div className="lp-container lp-header-inner">
        <Brand />
        <nav className="lp-nav" aria-label="Main">
          {NAV.map(([l, h]) => <a key={h} href={h} aria-current={active === h ? 'true' : undefined}>{l}</a>)}
        </nav>
        <div className="lp-header-actions">
          <button type="button" className="lp-icon-btn" onClick={toggleTheme} aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}>
            {isDark ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <Link to="/login" className="lp-login lp-hide-sm">Log in</Link>
          <Link to="/login?view=register" className="btn btn-primary lp-hide-sm">Get started</Link>
          <button type="button" className="lp-icon-btn lp-menu-btn" aria-expanded={open} aria-controls="lp-mobile-nav" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen(!open)}>
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
      {open && (
        <nav id="lp-mobile-nav" className="lp-mobile-nav" aria-label="Mobile">
          {NAV.map(([l, h]) => <a key={h} href={h} onClick={() => setOpen(false)}>{l}<ArrowRight size={16} aria-hidden="true" /></a>)}
          <div className="lp-mobile-cta">
            <Link to="/login?view=register" className="btn btn-primary btn-lg" onClick={() => setOpen(false)}>Get started</Link>
            <Link to="/login" className="btn btn-secondary btn-lg" onClick={() => setOpen(false)}>Log in</Link>
          </div>
        </nav>
      )}
    </header>
  );
}

const Logo = () => <img src="/logo.png" alt="" />;
const NAVI = [[LayoutDashboard,'Dashboard'],[FileText,'Handovers'],[Home,'Residents'],[CalendarClock,'Shifts'],[Users,'Team'],[Bell,'Alerts'],[History,'Audit']];
const ROWS = [
  ['Margaret H.','Night shift','high','Reported left knee pain on standing; settled mood. Follow-up: check knee at morning rounds.'],
  ['Arthur P.','Day shift','medium','Ate well, joined afternoon activity. Follow-up: confirm GP call-back.'],
  ['Joan W.','Day shift','low','Calm day, no concerns raised.'],
];

function AppMock({ rows = 3, stats = true, active = 0 }) {
  return (
    <div className="lp-app" role="img" aria-label="Handover dashboard (sample data)">
      <div className="lp-chrome"><i /><i /><i /></div>
      <div className="lp-app-body">
        <aside className="lp-side" aria-hidden="true">
          <div className="lp-side-brand"><span className="lp-brand-mark"><Logo /></span><b>Handover</b></div>
          {NAVI.map(([I, l], i) => <div key={l} className={'lp-side-item' + (i === active ? ' on' : '')}><I size={14} />{l}</div>)}
        </aside>
        <div className="lp-main" aria-hidden="true">
          <div className="lp-greet">Good morning, Sarah</div>
          {stats && <div className="lp-stats">
            <div><span>Active residents</span><b>24</b></div>
            <div><span>Urgent handovers</span><b className="hi">2</b></div>
            <div><span>Unread alerts</span><b>3</b></div>
          </div>}
          <div className="lp-sub">Recent handovers</div>
          {ROWS.slice(0, rows).map(([n, s, u, t]) => (
            <div key={n} className="lp-row">
              <div className="lp-row-top"><b>{n}</b><span><Clock size={12} /> {s}</span><UrgencyBadge urgency={u} /></div>
              <p>{t}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="lp-hero" id="product" aria-labelledby="lp-h1">
      <div className="lp-container">
        <div className="lp-hero-copy">
          <p className="lp-eyebrow">VOICE-FIRST SHIFT HANDOVERS</p>
          <h1 id="lp-h1">Make every shift handover <em>clearer.</em></h1>
          <p className="lp-lead">Record what matters by voice. Handover turns spoken updates into clear, structured records your team can understand and act on.</p>
          <div className="lp-cta-row">
            <Link to="/login?view=register" className="btn btn-primary btn-lg">Get started <ArrowRight size={16} aria-hidden="true" /></Link>
            <a href="#how-it-works" className="btn btn-secondary btn-lg">See how it works</a>
          </div>
        </div>
        <div className="lp-hero-visual">
          <AppMock />
          <div className="lp-float" aria-hidden="true">
            <span className="lp-pulse"><Mic size={14} /></span>
            <div><b>Recording handover</b><small>Margaret H. · 0:32</small></div>
          </div>
        </div>
        <ul className="lp-signal" aria-label="Capabilities">
          {[[Mic,'Voice capture'],[FileText,'Transcription'],[ClipboardList,'AI summaries'],[ListChecks,'Follow-ups']].map(([I, l]) => <li key={l}><I size={16} aria-hidden="true" />{l}</li>)}
        </ul>
      </div>
    </section>
  );
}

function Problem() {
  return (
    <section className="lp-section lp-alt" aria-labelledby="lp-problem">
      <div className="lp-container lp-split">
        <div>
          <h2 id="lp-problem" className="lp-big">The end of a shift shouldn’t be the hardest part of documenting it.</h2>
          <p className="lp-lead">When information is rushed, typed inconsistently, or buried in notes, the next shift has to reconstruct what happened.</p>
        </div>
        <div className="lp-flows" aria-hidden="true">
          <ol className="lp-flow bad"><li>Rushed notes</li><li>Scattered information</li><li>Missed context</li></ol>
          <ol className="lp-flow good"><li>Speak</li><li>Structure</li><li>Share</li></ol>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="lp-section" id="how-it-works" aria-labelledby="lp-how">
      <div className="lp-container">
        <h2 id="lp-how" className="lp-big">From a spoken update to a clear next step.</h2>
        <ol className="lp-steps">
          <li className="lp-step"><span className="lp-step-num">01 · Speak</span>
            <div className="lp-mini lp-rec"><span className="lp-pulse"><Mic size={16} /></span><div className="lp-wave">{[6,14,9,18,12,20,8,15,10,17,7,13].map((h, i) => <i key={i} style={{ height: h }} />)}</div><small>0:32</small></div></li>
          <li className="lp-step"><span className="lp-step-num">02 · Transcribe</span>
            <div className="lp-mini"><p className="lp-reading">Margaret had a settled evening, ate most of her dinner but said her left knee was sore when standing…</p></div></li>
          <li className="lp-step"><span className="lp-step-num">03 · Structure</span>
            <div className="lp-mini"><div className="lp-kv"><span>Summary</span>Good appetite; knee pain on standing.</div><div className="lp-kv"><span>Urgency</span><UrgencyBadge urgency="medium" /></div></div></li>
          <li className="lp-step"><span className="lp-step-num">04 · Act</span>
            <div className="lp-mini"><div className="lp-check"><Check size={14} /> Check knee at morning rounds</div><div className="lp-check"><Check size={14} /> Review pain relief</div></div></li>
        </ol>
      </div>
    </section>
  );
}

function ShowcaseDashboard() {
  return (
    <section className="lp-section lp-dark-band" aria-labelledby="lp-dash">
      <div className="lp-container lp-show">
        <div>
          <h2 id="lp-dash" className="lp-big">One clear operational view.</h2>
          <p className="lp-lead">Managers see recent handovers, urgent items, residents and alerts together, so what needs attention is never buried.</p>
        </div>
        <AppMock rows={3} />
      </div>
    </section>
  );
}

function ShowcaseDetail() {
  return (
    <section className="lp-section" aria-labelledby="lp-detail">
      <div className="lp-container lp-show rev">
        <div className="lp-detail" role="img" aria-label="Handover detail (sample data)">
          <div className="lp-detail-bar"><b>Margaret H.</b><span><Clock size={12} /> Night shift</span><UrgencyBadge urgency="high" /><span className="badge badge-active">Complete</span></div>
          <div className="lp-detail-body">
            <div><h3 className="lp-label">Transcript</h3><p className="lp-reading">Margaret had a settled evening, ate most of her dinner but said her left knee was sore when standing. Slept after ten…</p></div>
            <div><h3 className="lp-label">Summary</h3><p className="lp-reading">Good appetite, calm mood. Reported left knee pain on standing.</p></div>
            <div className="lp-cols">
              <div><h3 className="lp-label">Key events</h3><ul><li>Knee pain on standing</li><li>Settled by 10pm</li></ul></div>
              <div><h3 className="lp-label">Follow-up actions</h3><ul><li>Check knee at rounds</li><li>Review pain relief</li></ul></div>
            </div>
          </div>
        </div>
        <div>
          <h2 id="lp-detail" className="lp-big">From a spoken update to something the next shift can use.</h2>
          <p className="lp-lead">The original handover stays connected to its transcript, summary, urgency and follow-up actions.</p>
        </div>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section className="lp-section lp-alt" id="features" aria-labelledby="lp-feat">
      <div className="lp-container">
        <h2 id="lp-feat" className="lp-big">Built around the handover.</h2>
        <div className="lp-bento">
          <div className="lp-f lp-f-lg"><h3>Voice-first handovers</h3><p>Capture information naturally without turning every shift into a typing exercise.</p>
            <div className="lp-mini lp-rec"><span className="lp-pulse"><Mic size={16} /></span><div className="lp-wave">{[6,14,9,18,12,20,8,15,10,17,7,13,9,16].map((h, i) => <i key={i} style={{ height: h }} />)}</div><small>0:32</small></div></div>
          <div className="lp-f"><h3>AI summaries</h3><p>Transcripts become structured summaries that are quick to scan.</p></div>
          <div className="lp-f"><h3>Urgency</h3><p>Urgent handovers are flagged and alert managers in real time.</p><div className="lp-badges"><UrgencyBadge urgency="low" /><UrgencyBadge urgency="medium" /><UrgencyBadge urgency="high" /></div></div>
          <div className="lp-f"><h3>Follow-ups</h3><p>Outstanding actions stay visible until they’re resolved.</p></div>
          <div className="lp-f"><h3>Team visibility</h3><p>Resident and shift context, plus an audit trail, for managers.</p></div>
        </div>
      </div>
    </section>
  );
}

function Phone({ children, title }) {
  return (
    <div className="lp-phone" role="img" aria-label={title + ' (sample data)'}>
      <div className="lp-notch" />
      <div className="lp-phone-screen" aria-hidden="true">{children}</div>
    </div>
  );
}

function Mobile() {
  const shots = [
    ['01', 'Current shift', (<>
      <div className="lp-m-top"><span className="lp-brand-mark sm"><Logo /></span><b>Day shift</b></div>
      <div className="lp-sub">Assigned residents</div>
      <div className="lp-row"><div className="lp-row-top"><b>Margaret H.</b><UrgencyBadge urgency="high" /></div><p>Left knee pain reported overnight</p></div>
      <div className="lp-row"><div className="lp-row-top"><b>Arthur P.</b><UrgencyBadge urgency="medium" /></div><p>GP call-back to confirm</p></div>
      <div className="lp-row"><div className="lp-row-top"><b>Joan W.</b><UrgencyBadge urgency="low" /></div><p>No concerns</p></div>
      <div className="lp-btn-m"><Mic size={15} /> Record handover</div></>)],
    ['02', 'Record handover', (<>
      <div className="lp-m-top"><b>Margaret H.</b><span className="lp-sub">Day shift</span></div>
      <div className="lp-rec-big"><span className="lp-pulse big"><Mic size={26} /></span><b className="lp-timer">0:32</b><small>Recording… tap to stop</small>
        <div className="lp-wave">{[6,14,9,18,12,20,8,15,10,17,7,13,9,16,11].map((h, i) => <i key={i} style={{ height: h }} />)}</div></div>
      <div className="lp-btn-m stop">Stop and save</div></>)],
    ['03', 'Review handover', (<>
      <div className="lp-m-top"><b>Margaret H.</b><UrgencyBadge urgency="medium" /></div>
      <h3 className="lp-label">Summary</h3><p className="lp-reading sm">Settled evening, good appetite. Left knee pain on standing.</p>
      <h3 className="lp-label">Key event</h3><p className="lp-reading sm">Knee pain on standing</p>
      <h3 className="lp-label">Follow-up</h3><div className="lp-check"><Check size={13} /> Check knee at morning rounds</div>
      <div className="lp-check"><Check size={13} /> Review pain relief</div></>)],
  ];
  return (
    <section className="lp-section lp-mob" aria-labelledby="lp-mob">
      <div className="lp-container">
        <p className="lp-eyebrow">BUILT FOR THE PEOPLE ON SHIFT</p>
        <h2 id="lp-mob" className="lp-big">Everything they need, without slowing down the shift.</h2>
        <p className="lp-lead">Care workers can capture handovers by voice, review resident context, see their shifts and keep follow-ups visible from the mobile experience.</p>
      </div>
      <div className="lp-container lp-phones-wrap">
        <ol className="lp-phones">
          {shots.map(([n, t, body]) => (
            <li key={n} className="lp-shot">
              <span className="lp-step-num">{n} · {t}</span>
              <div className="lp-phone" role="img" aria-label={t + ' screen (sample data)'}>
                <div className="lp-notch" /><div className="lp-phone-screen" aria-hidden="true">{body}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div className="lp-container"><p className="lp-mgr"><b>For managers:</b> the web app adds team handovers, urgent items, residents, alerts and the audit log, and urgent handovers alert managers in real time.</p></div>
    </section>
  );
}

const FAQS = [
  ['What is Handover?', 'Handover is a voice-first shift handover system for care teams. Staff record a spoken update, and Handover transcribes it and turns it into a structured, reviewable record.'],
  ['How does voice handover work?', 'A care worker records a voice note about a resident on web or mobile. The audio is transcribed with Whisper, summarised into a structured report, and any follow-up actions are kept visible for the next shift.'],
  ['Can managers and care workers have different access?', 'Yes. Handover has manager and care worker roles. Managers can access areas such as the team, alerts and audit log; care workers see their own shifts and residents.'],
  ['Can I review previous handovers?', 'Yes. Handovers are saved with their transcript, summary, urgency and follow-up actions, and can be browsed and searched in the Handovers page.'],
  ['Does Handover support residents and shifts?', 'Yes. Every handover is connected to a resident and a shift, so context stays together.'],
  ['Does Handover create AI summaries?', 'Yes. After transcription, a Gemini model produces a summary, key events, incidents and follow-up actions, and sets an urgency flag. Summaries are an aid to review, so staff should check them.'],
  ['Is there a mobile experience?', 'Yes. The Handover mobile app lets care workers record and review handovers and receive push notifications for urgent items.'],
  ['How is access controlled?', 'Accounts are created with email verification codes, sign-in is token-based, sign-up attempts are rate limited, and relevant activity is recorded in an audit log.'],
];

function Faq() {
  const [openI, setOpenI] = useState(0);
  const uid = useId();
  return (
    <section className="lp-section" id="faq" aria-labelledby="lp-faq">
      <div className="lp-container lp-faq">
        <h2 id="lp-faq" className="lp-big">Questions, answered.</h2>
        <div className="lp-acc">
          {FAQS.map(([q, a], i) => {
            const on = openI === i;
            return (
              <div key={q} className={'lp-acc-item' + (on ? ' on' : '')}>
                <h3><button type="button" aria-expanded={on} aria-controls={`${uid}-${i}`} id={`${uid}-b${i}`} onClick={() => setOpenI(on ? -1 : i)}>
                  <span>{q}</span><Plus size={18} aria-hidden="true" />
                </button></h3>
                <div id={`${uid}-${i}`} role="region" aria-labelledby={`${uid}-b${i}`} className="lp-acc-panel"><div><p>{a}</p></div></div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Trust() {
  return (
    <section className="lp-section lp-alt lp-tight" id="security" aria-labelledby="lp-sec">
      <div className="lp-container lp-trust-row">
        <h2 id="lp-sec">Built with controlled access in mind.</h2>
        <ul className="lp-trust">
          {['Role-based permissions','Email verification','Audit logging','Local audio transcription'].map((t) => <li key={t}><ShieldCheck size={16} aria-hidden="true" /> {t}</li>)}
        </ul>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="lp-final" aria-labelledby="lp-final">
      <div className="lp-container">
        <h2 id="lp-final">A clearer handover starts with what you say.</h2>
        <p>Capture the details that matter and make them easier for the next person to understand and act on.</p>
        <div className="lp-cta-row lp-center">
          <Link to="/login?view=register" className="btn btn-primary btn-lg">Get started</Link>
          <a href="#how-it-works" className="btn btn-secondary btn-lg">See how it works</a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const cols = [
    ['Product', [['Dashboard', '/dashboard'], ['Handovers', '/handovers'], ['Residents', '/residents'], ['Shifts', '/shifts'], ['Alerts', '/notifications']]],
    ['Learn', [['How it works', '#how-it-works'], ['Features', '#features'], ['FAQ', '#faq'], ['Security', '#security']]],
    ['Account', [['Log in', '/login'], ['Get started', '/login?view=register']]],
    ['Legal', [['Privacy', '/privacy'], ['Terms', '/terms'], ['Cookies', '/cookies']]],
  ];
  return (
    <footer className="lp-footer">
      <div className="lp-container">
        <div className="lp-footer-top">
          <div className="lp-footer-brand">
            <Brand />
            <p className="lp-footer-tag">Clearer handovers.<br />Better continuity between shifts.</p>
            <p className="lp-footer-desc">Voice-first handover software for care teams.</p>
          </div>
          {cols.map(([t, links]) => (
            <nav key={t} aria-label={t} className="lp-footer-col">
              <h2 className="lp-footer-h">{t}</h2>
              <ul>{links.map(([l, h]) => <li key={l}>{h.startsWith('#') ? <a href={h}>{l}</a> : <Link to={h}>{l}</Link>}</li>)}</ul>
            </nav>
          ))}
        </div>
        <div className="lp-footer-base"><span>© 2026 Handover</span><span>Clearer information between shifts.</span></div>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  const { status } = useAuth();
  useEffect(() => { document.title = 'Handover — Clearer shift handovers'; }, []);
  if (status === 'loading') return <FullScreenLoader />;
  if (status === 'authed') return <Navigate to="/dashboard" replace />;
  return (
    <div className="lp">
      <a href="#lp-main" className="lp-skip">Skip to content</a>
      <Header />
      <main id="lp-main">
        <Hero /><Problem /><HowItWorks /><ShowcaseDashboard /><ShowcaseDetail /><Features /><Mobile /><Trust /><Faq /><FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
