import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, AtSign, Shield, CalendarDays, Briefcase, FileText, Sparkles, Pencil, Mail, Phone } from 'lucide-react';
import { useAuth } from '../lib/AuthContext.jsx';
import { useToast } from '../lib/ToastContext.jsx';
import { formatDate } from '../lib/format.js';
import EditProfileModal from '../components/EditProfileModal.jsx';

export default function ProfileDetailsPage() {
    const { user, refreshUser } = useAuth();
    const showToast = useToast();
    const navigate = useNavigate();
    const location = useLocation();
    const [showEditModal, setShowEditModal] = useState(false);

    useEffect(() => {
        if (location.state?.openEdit) {
            setShowEditModal(true);
            navigate(location.pathname, { replace: true, state: {} });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (!user) return null;

    const missingFields = [
        !user.job_title && 'job title',
        !user.phone_number && 'phone number',
        !user.bio && 'bio',
    ].filter(Boolean);
    const totalFields = 4; // job_title, phone_number, bio, profile_photo_url
    const completedFields = totalFields - missingFields.length - (user.profile_photo_url ? 0 : 1);
    const completionPct = Math.round((completedFields / totalFields) * 100);
    const isIncomplete = missingFields.length > 0 || !user.profile_photo_url;

    return (
        <>
            <button type="button" className="auth-back" style={{ marginBottom: 'var(--space-2)' }} onClick={() => navigate('/profile')}>
                <ArrowLeft /> Back to profile
            </button>

            <div className="page-header">
                <div>
                    <h1>Profile Details</h1>
                    <p>Your username, role, and how your team sees you.</p>
                </div>
                <div className="page-header-actions">
                    <button className="btn btn-primary" onClick={() => setShowEditModal(true)}>
                        <Pencil size={14} /> Edit profile
                    </button>
                </div>
            </div>

            {isIncomplete && (
                <div className="panel profile-completion-card">
                    <div className="panel-body">
                        <div className="profile-completion-top">
                            <div className="profile-completion-icon">
                                <Sparkles size={17} />
                            </div>
                            <div>
                                <strong>Your profile is {completionPct}% complete</strong>
                                <p>
                                    Add your {missingFields.length > 0 ? missingFields.join(', ') : 'photo'} so your team recognizes you on handovers and shifts.
                                </p>
                            </div>
                            <button className="btn btn-primary btn-sm" onClick={() => setShowEditModal(true)}>
                                Complete profile
                            </button>
                        </div>
                        <div className="progress-track">
                            <div className="progress-fill" style={{ width: `${completionPct}%` }} />
                        </div>
                    </div>
                </div>
            )}

            <div className="panel">
                <div className="panel-header">
                    <h3>Contact</h3>
                </div>
                <div className="panel-body no-pad">
                    <div className="info-row">
                        <span className="info-row-label">
                            <Mail /> Email
                        </span>
                        <span className="info-row-value text">{user.email}</span>
                    </div>
                    <div className="info-row">
                        <span className="info-row-label">
                            <Phone /> Phone
                        </span>
                        <span className="info-row-value text">{user.phone_number || 'Not set'}</span>
                    </div>
                </div>
            </div>

            <div className="panel">
                <div className="panel-header">
                    <h3>Account</h3>
                </div>
                <div className="panel-body no-pad">
                    <div className="info-row">
                        <span className="info-row-label">
                            <AtSign /> Username
                        </span>
                        <span className="info-row-value text">@{user.username}</span>
                    </div>
                    <div className="info-row">
                        <span className="info-row-label">
                            <Shield /> Role
                        </span>
                        <span className="info-row-value text">{user.role === 'manager' ? 'Manager' : 'Care Staff'}</span>
                    </div>
                    <div className="info-row">
                        <span className="info-row-label">
                            <Briefcase /> Job title
                        </span>
                        <span className="info-row-value text">{user.job_title || 'Not set'}</span>
                    </div>
                    <div className="info-row" style={{ alignItems: 'flex-start' }}>
                        <span className="info-row-label">
                            <FileText /> Bio
                        </span>
                        <span className="info-row-value text" style={{ textAlign: 'right', maxWidth: '65%' }}>
                            {user.bio || 'Not set'}
                        </span>
                    </div>
                    <div className="info-row">
                        <span className="info-row-label">
                            <CalendarDays /> Member since
                        </span>
                        <span className="info-row-value text">{formatDate(user.created_at)}</span>
                    </div>
                </div>
            </div>

            {showEditModal && (
                <EditProfileModal
                    user={user}
                    onClose={() => setShowEditModal(false)}
                    onSuccess={async () => {
                        setShowEditModal(false);
                        await refreshUser();
                        showToast('Profile updated.', 'success');
                    }}
                />
            )}
        </>
    );
}