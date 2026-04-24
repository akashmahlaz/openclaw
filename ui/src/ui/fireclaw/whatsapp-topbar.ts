// FireClaw fork extension — WhatsApp topbar dropdown.
// Kept in a dedicated file so upstream rebases do not collide with our patches.
// Only touchpoint upstream: a single import + render call in app-render.ts.

import { html, nothing } from "lit";
import type { AppViewState } from "../app-view-state.ts";
import { loadChannels } from "../controllers/channels.ts";
import type { ChannelsState } from "../controllers/channels.types.ts";

type WhatsAppChannelConfig = { dmPolicy?: string; allowFrom?: unknown };
type ConfigWithChannels = { channels?: { whatsapp?: WhatsAppChannelConfig }; whatsapp?: WhatsAppChannelConfig };
type ChannelStatus = { connected?: boolean; running?: boolean };

/** Resolve WhatsApp connected state from channel snapshot or login state. */
function isWhatsAppConnected(state: AppViewState): boolean {
  // Prefer persistent channel status from channels.status RPC
  const snap = state.channelsSnapshot;
  if (snap) {
    const wa = snap.channels?.whatsapp as { connected?: boolean } | undefined;
    if (wa && typeof wa.connected === "boolean") {
      return wa.connected;
    }
  }
  // Fall back to login flow state
  return state.whatsappLoginConnected === true;
}

/** Get WhatsApp status object from channels snapshot. */
function getWhatsAppStatus(state: AppViewState) {
  const snap = state.channelsSnapshot;
  if (!snap) {return null;}
  return (snap.channels?.whatsapp ?? null) as {
    configured?: boolean;
    linked?: boolean;
    running?: boolean;
    connected?: boolean;
    self?: { e164?: string | null; jid?: string | null } | null;
    lastConnectedAt?: number | null;
    lastMessageAt?: number | null;
    lastError?: string | null;
    reconnectAttempts?: number;
    lastDisconnect?: { at: number; error?: string | null; loggedOut?: boolean | null } | null;
  } | null;
}

/** Format a timestamp as relative time (e.g. "2m ago", "3h ago"). */
function formatRelativeTime(ts: number | null | undefined): string {
  if (!ts) {return "—";}
  const diff = Date.now() - ts;
  if (diff < 60_000) {return "just now";}
  if (diff < 3_600_000) {return `${Math.floor(diff / 60_000)}m ago`;}
  if (diff < 86_400_000) {return `${Math.floor(diff / 3_600_000)}h ago`;}
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

/** Parse raw WhatsApp error (Boom JSON or string) into a clean user-friendly message. */
function parseWhatsAppError(raw: string | null | undefined): string | null {
  if (!raw) {return null;}
  try {
    const obj = JSON.parse(raw);
    const code = obj?.error?.data?.reason ?? obj?.output?.statusCode ?? obj?.statusCode;
    const message = obj?.output?.payload?.message ?? obj?.error?.message ?? obj?.message;
    if (code === "401" || code === 401) {return "Session expired";}
    if (code === "428" || code === 428) {return "Connection interrupted";}
    if (typeof message === "string" && message.length < 100) {return message;}
    return "Connection error";
  } catch {
    // Not JSON — return as-is if short, else generic
    return raw.length < 80 ? raw : "Connection error";
  }
}

/** Resolve current WhatsApp dmPolicy from configSnapshot. */
function getWhatsAppDmPolicy(state: AppViewState): string {
  const cfg = (state.configSnapshot?.config ?? state.configForm) as ConfigWithChannels | undefined;
  const wa = cfg?.channels?.whatsapp ?? cfg?.whatsapp;
  return wa?.dmPolicy ?? "open";
}

/** Resolve current WhatsApp allowFrom list from configSnapshot. */
function getWhatsAppAllowFrom(state: AppViewState): string[] {
  const cfg = (state.configSnapshot?.config ?? state.configForm) as ConfigWithChannels | undefined;
  const wa = cfg?.channels?.whatsapp ?? cfg?.whatsapp;
  const list = wa?.allowFrom;
  return Array.isArray(list) ? list.map(String) : [];
}

export function renderTopbarWhatsAppButton(state: AppViewState) {
  const connected = isWhatsAppConnected(state);
  const wa = getWhatsAppStatus(state);
  const busy = state.whatsappBusy;
  const dropdownOpen = state.whatsappDropdownOpen;

  const toggleDropdown = () => {
    state.whatsappDropdownOpen = !state.whatsappDropdownOpen;
    if (!state.whatsappDropdownOpen) {
      state.whatsappDropdownView = "status";
      state.whatsappLoginMessage = null;
    } else {
      // Refresh channel status when opening
      if (state.client && state.connected) {
        loadChannels(state as unknown as ChannelsState, true);
      }
    }
  };

  const closeDropdown = () => {
    state.whatsappDropdownOpen = false;
    state.whatsappDropdownView = "status";
    state.whatsappLoginMessage = null;
  };

  const handleOverlayClick = (e: Event) => {
    if (e.target === e.currentTarget) {closeDropdown();}
  };

  const statusLabel = busy
    ? "Connecting…"
    : connected
      ? "WhatsApp"
      : "Connect";

  // Count connected channels
  let connectedCount = 0;
  let totalChannels = 0;
  if (state.channelsSnapshot) {
    const channels = state.channelsSnapshot.channels ?? {};
    for (const [, ch] of Object.entries(channels)) {
      totalChannels++;
      const status = ch as ChannelStatus | undefined;
      if (status?.connected || status?.running) {connectedCount++;}
    }
  }

  return html`
    <div class="wa-dropdown-wrapper">
      <button
        class="wa-dropdown-trigger ${connected ? "wa-dropdown-trigger--connected" : ""}"
        @click=${toggleDropdown}
        ?disabled=${busy && !dropdownOpen}
      >
        <span class="wa-dropdown-trigger__dot">
          ${connected
            ? html`<span class="wa-dot wa-dot--connected-ping"></span><span class="wa-dot wa-dot--connected"></span>`
            : html`<span class="wa-dot wa-dot--disconnected"></span>`}
        </span>
        <svg class="wa-dropdown-trigger__icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
        <span class="wa-dropdown-trigger__label">${statusLabel}</span>
        ${totalChannels > 0 ? html`<span class="wa-dropdown-trigger__count">${connectedCount}/${totalChannels}</span>` : nothing}
        <svg class="wa-dropdown-trigger__chevron ${dropdownOpen ? "wa-dropdown-trigger__chevron--open" : ""}" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      ${dropdownOpen ? html`
        <div class="wa-dropdown-backdrop" @click=${handleOverlayClick}></div>
        <div class="wa-dropdown-panel">
          ${state.whatsappDropdownView === "status"
            ? renderWaDropdownStatus(state, wa, connected, closeDropdown)
            : state.whatsappDropdownView === "qr"
              ? renderWaDropdownQr(state, closeDropdown)
              : renderWaDropdownSettings(state, closeDropdown)}
        </div>
      ` : nothing}
    </div>
  `;
}

/** Dropdown view: Channel status list. */
function renderWaDropdownStatus(
  state: AppViewState,
  wa: ReturnType<typeof getWhatsAppStatus>,
  connected: boolean,
  close: () => void,
) {
  const snap = state.channelsSnapshot;
  const tg = snap?.channels?.telegram as { configured?: boolean; running?: boolean } | undefined;

  const startQr = async () => {
    if (!state.client || !state.connected) {
      state.whatsappLoginMessage = "Not connected to gateway.";
      return;
    }
    state.whatsappDropdownView = "qr";
    await state.handleWhatsAppStart(false);
    if (state.whatsappLoginQrDataUrl) {
      state.handleWhatsAppWait();
    }
  };

  const phoneDisplay = wa?.self?.e164
    ? wa.self.e164
    : wa?.self?.jid
      ? wa.self.jid.split("@")[0]
      : null;

  return html`
    <div class="wa-dropdown-header">
      <span class="wa-dropdown-header__title">Channels</span>
      <button class="wa-dropdown-close" @click=${close} aria-label="Close">&times;</button>
    </div>

    <div class="wa-dropdown-item ${connected ? "wa-dropdown-item--live" : ""}">
      <div class="wa-dropdown-item__left">
        <span class="wa-dropdown-item__dot">
          ${connected
            ? html`<span class="wa-dot wa-dot--connected-ping"></span><span class="wa-dot wa-dot--connected"></span>`
            : html`<span class="wa-dot wa-dot--disconnected"></span>`}
        </span>
        <div class="wa-dropdown-item__info">
          <span class="wa-dropdown-item__name">WhatsApp</span>
          ${connected && phoneDisplay
            ? html`<span class="wa-dropdown-item__detail">${phoneDisplay}</span>`
            : nothing}
        </div>
      </div>
      <div class="wa-dropdown-item__right">
        ${connected
          ? html`
              <span class="wa-dropdown-badge wa-dropdown-badge--live">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                Live
              </span>
              <button class="wa-dropdown-action" @click=${() => { state.whatsappDropdownView = "settings"; }} title="Settings">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              </button>
            `
          : wa?.linked
            ? html`
                <span class="wa-dropdown-badge wa-dropdown-badge--offline">Disconnected</span>
                <button class="wa-dropdown-action" @click=${() => { state.whatsappDropdownView = "settings"; }} title="Settings">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                </button>
              `
            : html`
                <button class="wa-dropdown-action wa-dropdown-action--connect" @click=${startQr}>
                  ${state.whatsappBusy ? "Connecting…" : "Setup →"}
                </button>
              `}
      </div>
    </div>

    ${connected ? html`
      <div class="wa-dropdown-statusbar">
        ${wa?.lastConnectedAt ? html`<span class="wa-dropdown-statusbar__item">Connected ${formatRelativeTime(wa.lastConnectedAt)}</span>` : nothing}
        ${wa?.lastMessageAt ? html`<span class="wa-dropdown-statusbar__item">Last msg ${formatRelativeTime(wa.lastMessageAt)}</span>` : nothing}
      </div>
    ` : wa?.linked && parseWhatsAppError(wa?.lastError) ? html`
      <div class="wa-dropdown-statusbar wa-dropdown-statusbar--error">
        <span class="wa-dropdown-statusbar__item">${parseWhatsAppError(wa?.lastError)} — relink to reconnect</span>
      </div>
    ` : nothing}

    <div class="wa-dropdown-item wa-dropdown-item--live">
      <div class="wa-dropdown-item__left">
        <span class="wa-dropdown-item__dot"><span class="wa-dot wa-dot--web"></span></span>
        <div class="wa-dropdown-item__info">
          <span class="wa-dropdown-item__name">Web Chat</span>
          <span class="wa-dropdown-item__detail">Always available</span>
        </div>
      </div>
      <div class="wa-dropdown-item__right">
        <span class="wa-dropdown-badge wa-dropdown-badge--live">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          Live
        </span>
      </div>
    </div>

    ${tg?.configured ? html`
      <div class="wa-dropdown-item ${tg.running ? "wa-dropdown-item--live" : ""}">
        <div class="wa-dropdown-item__left">
          <span class="wa-dropdown-item__dot">
            ${tg.running
              ? html`<span class="wa-dot wa-dot--telegram"></span>`
              : html`<span class="wa-dot wa-dot--disconnected"></span>`}
          </span>
          <div class="wa-dropdown-item__info">
            <span class="wa-dropdown-item__name">Telegram</span>
          </div>
        </div>
        <div class="wa-dropdown-item__right">
          ${tg.running
            ? html`<span class="wa-dropdown-badge wa-dropdown-badge--live">Live</span>`
            : html`<span class="wa-dropdown-badge wa-dropdown-badge--offline">Offline</span>`}
        </div>
      </div>
    ` : nothing}

    <div class="wa-dropdown-footer">
      <button class="wa-dropdown-footer__link" @click=${() => { close(); state.setTab("channels"); }}>
        Manage channels →
      </button>
    </div>

    ${state.whatsappLoginMessage ? html`<div class="wa-dropdown-message">${state.whatsappLoginMessage}</div>` : nothing}
  `;
}

/** Dropdown view: QR code scan. */
function renderWaDropdownQr(state: AppViewState, close: () => void) {
  const connected = state.whatsappLoginConnected === true;
  const goBack = () => {
    state.whatsappDropdownView = "status";
    state.whatsappLoginQrDataUrl = null;
    state.whatsappLoginMessage = null;
  };

  return html`
    <div class="wa-dropdown-header">
      <button class="wa-dropdown-back" @click=${goBack} aria-label="Back">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span class="wa-dropdown-header__title">Connect WhatsApp</span>
      <button class="wa-dropdown-close" @click=${close} aria-label="Close">&times;</button>
    </div>

    ${connected
      ? html`
          <div class="wa-dropdown-qr-success">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#25D366" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <p>Connected!</p>
          </div>
        `
      : html`
          <div class="wa-dropdown-qr-steps">
            <div class="wa-dropdown-qr-step"><span class="wa-dropdown-qr-step__num">1</span> Open WhatsApp on your phone</div>
            <div class="wa-dropdown-qr-step"><span class="wa-dropdown-qr-step__num">2</span> Go to Linked Devices</div>
            <div class="wa-dropdown-qr-step"><span class="wa-dropdown-qr-step__num">3</span> Scan this code</div>
          </div>
          ${state.whatsappLoginQrDataUrl
            ? html`<div class="wa-dropdown-qr-img"><img src=${state.whatsappLoginQrDataUrl} alt="QR" width="200" height="200" /></div>`
            : state.whatsappBusy
              ? html`<div class="wa-dropdown-qr-loading"><span class="wa-qr-modal__spinner"></span> Generating QR…</div>`
              : nothing}
        `}

    ${state.whatsappLoginMessage ? html`<div class="wa-dropdown-message">${state.whatsappLoginMessage}</div>` : nothing}

    ${state.whatsappBusy && state.whatsappLoginQrDataUrl
      ? html`<div class="wa-dropdown-qr-waiting"><span class="wa-qr-modal__spinner"></span> Waiting for scan…</div>`
      : nothing}
  `;
}

/** Dropdown view: WhatsApp settings. */
function renderWaDropdownSettings(state: AppViewState, close: () => void) {
  const wa = getWhatsAppStatus(state);
  const goBack = () => { state.whatsappDropdownView = "status"; };

  const handleDisconnect = async () => {
    await state.handleWhatsAppLogout();
    state.whatsappDropdownView = "status";
    if (state.client && state.connected) {
      loadChannels(state as unknown as ChannelsState, true);
    }
  };

  const handleReconnect = async () => {
    state.whatsappDropdownView = "qr";
    await state.handleWhatsAppStart(true);
    if (state.whatsappLoginQrDataUrl) {
      state.handleWhatsAppWait();
    }
  };

  const phoneDisplay = wa?.self?.e164
    ? wa.self.e164
    : wa?.self?.jid
      ? wa.self.jid.split("@")[0]
      : "Unknown";

  // Message rules — read current dmPolicy + allowFrom from config
  const currentDmPolicy = getWhatsAppDmPolicy(state);
  const currentAllowFrom = getWhatsAppAllowFrom(state);

  const handleDmPolicyChange = async (e: Event) => {
    const value = (e.target as HTMLSelectElement).value;
    if (!state.client || !state.connected) {return;}
    if (!state.configSnapshot?.hash) {
      state.whatsappLoginMessage = "Config not loaded. Try again.";
      return;
    }
    const baseHash = state.configSnapshot.hash;
    try {
      await state.client.request("config.patch", {
        raw: JSON.stringify({ channels: { whatsapp: { dmPolicy: value } } }),
        baseHash,
      });
      // Reload config to reflect the change
      const res = await state.client.request<import("../types.ts").ConfigSnapshot>("config.get", {});
      state.configSnapshot = res;
    } catch {
      state.whatsappLoginMessage = "Failed to save message rule.";
    }
  };

  const handleAllowFromSave = async (e: Event) => {
    e.preventDefault();
    if (!state.client || !state.connected) {return;}
    const form = e.target as HTMLFormElement;
    const input = form.querySelector("input") as HTMLInputElement;
    const raw = input.value.trim();
    const numbers = raw
      ? raw.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    if (!state.configSnapshot?.hash) {
      state.whatsappLoginMessage = "Config not loaded. Try again.";
      return;
    }
    const baseHash = state.configSnapshot.hash;
    try {
      await state.client.request("config.patch", {
        raw: JSON.stringify({ channels: { whatsapp: { allowFrom: numbers } } }),
        baseHash,
      });
      const res = await state.client.request<import("../types.ts").ConfigSnapshot>("config.get", {});
      state.configSnapshot = res;
      state.whatsappLoginMessage = "Allowed numbers saved.";
    } catch {
      state.whatsappLoginMessage = "Failed to save allowed numbers.";
    }
  };

  return html`
    <div class="wa-dropdown-header">
      <button class="wa-dropdown-back" @click=${goBack} aria-label="Back">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span class="wa-dropdown-header__title">WhatsApp Settings</span>
      <button class="wa-dropdown-close" @click=${close} aria-label="Close">&times;</button>
    </div>

    <div class="wa-dropdown-settings-info">
      <div class="wa-dropdown-settings-row">
        <span class="wa-dropdown-settings-row__label">Phone</span>
        <span class="wa-dropdown-settings-row__value">${phoneDisplay}</span>
      </div>
      ${wa?.lastConnectedAt ? html`
        <div class="wa-dropdown-settings-row">
          <span class="wa-dropdown-settings-row__label">Connected</span>
          <span class="wa-dropdown-settings-row__value">${formatRelativeTime(wa.lastConnectedAt)}</span>
        </div>
      ` : nothing}
      ${wa?.lastMessageAt ? html`
        <div class="wa-dropdown-settings-row">
          <span class="wa-dropdown-settings-row__label">Last message</span>
          <span class="wa-dropdown-settings-row__value">${formatRelativeTime(wa.lastMessageAt)}</span>
        </div>
      ` : nothing}
    </div>

    <!-- Message rules section -->
    <div class="wa-dropdown-settings-section">
      <span class="wa-dropdown-settings-section__title">Message Rules</span>

      <div class="wa-dropdown-settings-row">
        <span class="wa-dropdown-settings-row__label">Accept DMs from</span>
        <select class="wa-dropdown-settings-select" @change=${handleDmPolicyChange}>
          <option value="open" ?selected=${currentDmPolicy === "open"}>Everyone</option>
          <option value="allowlist" ?selected=${currentDmPolicy === "allowlist"}>Specific numbers</option>
          <option value="pairing" ?selected=${currentDmPolicy === "pairing"}>Paired device only</option>
          <option value="disabled" ?selected=${currentDmPolicy === "disabled"}>Disabled</option>
        </select>
      </div>

      ${currentDmPolicy === "allowlist" ? html`
        <form class="wa-dropdown-settings-allowform" @submit=${handleAllowFromSave}>
          <label class="wa-dropdown-settings-row__label">Allowed numbers</label>
          <input
            class="wa-dropdown-settings-input"
            type="text"
            placeholder="+1234567890, +9876543210"
            .value=${currentAllowFrom.join(", ")}
          />
          <button type="submit" class="wa-dropdown-settings-btn wa-dropdown-settings-btn--save">Save</button>
        </form>
      ` : nothing}
    </div>

    <div class="wa-dropdown-settings-actions">
      <button class="wa-dropdown-settings-btn wa-dropdown-settings-btn--relink" @click=${handleReconnect} ?disabled=${state.whatsappBusy}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        Relink device
      </button>
      <button class="wa-dropdown-settings-btn wa-dropdown-settings-btn--disconnect" @click=${handleDisconnect} ?disabled=${state.whatsappBusy}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>
        ${state.whatsappBusy ? "Disconnecting…" : "Disconnect"}
      </button>
    </div>

    ${state.whatsappLoginMessage ? html`<div class="wa-dropdown-message">${state.whatsappLoginMessage}</div>` : nothing}
  `;
}
