import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Moon, ChevronRight, BadgeCheck, Camera, LogOut, UserCog, KeyRound } from 'lucide-react';
import { useAuth } from '../lib/AuthContext.jsx';
import { useToast } from '../lib/ToastContext.jsx';
import { useConfirm } from '../lib/ConfirmContext.jsx';
import { useTheme } from '../lib/ThemeContext.jsx';
import { Avatar } from '../components/States.jsx';
import { RoleBadge } from '../components/Badge.jsx';
import { displayName } from '../lib/format.js';
import { userApi, resolveFileUrl, ApiError } from '../lib/api.js';
import ChangePasswordModal from '../components/ChangePasswordModal.jsx';

export default function ProfilePage() {
  const { user, refreshUser, logout } = useAuth();
  const showToast = useToast();
  const confirm = useConfirm();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [uploading, setUploading] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const fileInputRef = useRef(null);

  if (!user) return null;

  async function onPickPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      await userApi.uploadProfilePicture(file);
      await refreshUser();
      showToast('Profile picture updated.', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not upload your photo.', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function onLogout() {
    const ok = await confirm({
      title: 'Sign out',
      message: 'You\u2019ll need to sign in again to access your account.',
      confirmLabel: 'Sign out',
      danger: true,
    });
    if (ok) logout();
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>My Profile</h1>
          <p>Your account details and security settings.</p>
        </div>
      </div>

      <div className="profile-hero profile-hero-centered">
        <div className="profile-hero-avatar-wrap">
          <Avatar text={displayName(user)} size="xl" src={resolveFileUrl(user.profile_photo_url)} />
          <span className="profile-hero-verified" title="Verified account">
            <BadgeCheck size={16} />
          </span>
          <button
            type="button"
            className="avatar-upload-btn"
            aria-label="Change profile picture"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <span className="spinner" style={{ width: 12, height: 12 }} /> : <Camera size={13} />}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={onPickPhoto}
          />
        </div>
        <div className="profile-hero-info">
          <h2>{displayName(user)}</h2>
          <p className="profile-hero-email">{user.email}</p>
          <div className="tag-strip" style={{ justifyContent: 'center' }}>
            <RoleBadge role={user.role} />
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-body no-pad">
          <button
            type="button"
            className="settings-row"
            onClick={toggleTheme}
            role="switch"
            aria-checked={isDark}
          >
            <span className="settings-row-icon">
              <Moon size={17} />
            </span>
            <span className="settings-row-body">
              <span className="settings-row-title">Dark mode</span>
              <span className="settings-row-meta">Switch the app to a darker color scheme</span>
            </span>
            <span className={`toggle-switch-visual ${isDark ? 'checked' : ''}`} aria-hidden="true" />
          </button>

          <div className="divider" style={{ marginLeft: 'var(--space-5)' }} />

          <button className="settings-row" onClick={() => navigate('/profile/details')}>
            <span className="settings-row-icon">
              <UserCog size={17} />
            </span>
            <span className="settings-row-body">
              <span className="settings-row-title">Profile details</span>
              <span className="settings-row-meta">Username, role, bio and password</span>
            </span>
            <ChevronRight size={17} color="var(--text-tertiary)" />
          </button>

          <div className="divider" style={{ marginLeft: 'var(--space-5)' }} />

          <button className="settings-row" onClick={() => setShowPasswordModal(true)}>
            <span className="settings-row-icon">
              <KeyRound size={17} />
            </span>
            <span className="settings-row-body">
              <span className="settings-row-title">Password</span>
              <span className="settings-row-meta">Change the password used to sign in</span>
            </span>
            <ChevronRight size={17} color="var(--text-tertiary)" />
          </button>

          <div className="divider" style={{ marginLeft: 'var(--space-5)' }} />

          <button className="settings-row settings-row-danger" onClick={onLogout}>
            <span className="settings-row-icon settings-row-icon-danger">
              <LogOut size={17} />
            </span>
            <span className="settings-row-body">
              <span className="settings-row-title">Log out</span>
              <span className="settings-row-meta">Sign out of your account on this device</span>
            </span>
            <ChevronRight size={17} color="var(--text-tertiary)" />
          </button>
        </div>
      </div>

      {showPasswordModal && (
        <ChangePasswordModal
          onClose={() => setShowPasswordModal(false)}
          onSuccess={() => {
            setShowPasswordModal(false);
            showToast('Password updated.', 'success');
          }}
        />
      )}
    </>
  );
}