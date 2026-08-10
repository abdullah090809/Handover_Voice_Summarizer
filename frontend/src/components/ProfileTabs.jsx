import React from 'react';
import { ChevronDown } from 'lucide-react';

// Section switcher for the Resident/CareWorker/Manager profile pages.
//
// Desktop keeps the existing pill tab strip (.record-tabs-profile) with the
// active section's content rendered below it.
//
// Below 640px the pill strip doesn't have room for four labels ("Overview",
// "Medical Information", "Care Information", "Handover History") -- it either
// truncates or forces horizontal scrolling, and users on a phone don't
// reliably discover a scrollable strip that looks like it ends at the edge
// of the screen. Instead, mobile gets a stacked accordion: one header per
// section, and only the active section's content expands beneath its own
// header.
//
// Both views share the same `active` state (from the parent's useState) and
// the same single copy of content -- content isn't duplicated between the
// two layouts. The content block is positioned purely with flexbox `order`:
// each accordion header gets an even order (0, 2, 4, ...) matching its
// index, and the content block gets `activeIndex * 2 + 1`, which always
// lands it directly after the active header. On desktop the accordion
// headers are hidden (display: none, so they're skipped in flex layout)
// and the content's odd order simply places it after the pill strip
// (order 0), same as before.
export default function ProfileTabs({ tabs, active, onChange, children }) {
  const activeIndex = Math.max(0, tabs.findIndex((t) => t.key === active));

  return (
    <div className="profile-tabs">
      <div className="record-tabs record-tabs-profile" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active === t.key}
            className={`record-tab-btn${active === t.key ? ' active' : ''}`}
            onClick={() => onChange(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tabs.map((t, i) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={active === t.key}
          className={`profile-tab-accordion-header${active === t.key ? ' active' : ''}`}
          style={{ order: i * 2 }}
          onClick={() => onChange(t.key)}
        >
          <span>{t.label}</span>
          <ChevronDown className={`collapsible-chevron${active === t.key ? ' open' : ''}`} />
        </button>
      ))}

      <div className="profile-tab-content" style={{ order: activeIndex * 2 + 1 }}>
        {children}
      </div>
    </div>
  );
}
