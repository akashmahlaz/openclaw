// FireClaw fork extension — multi-provider API key configuration UI.
// Kept in a dedicated file so upstream rebases do not collide with our patches.
// Only touchpoint upstream: a single import + 1-line render hook in app-render.helpers.ts.

import { html, nothing } from "lit";
import type { AppViewState } from "../app-view-state.ts";
import {
  ensureConfigLoaded,
  getConfiguredProviders,
  saveApiKeyAndDetectModels,
  setDefaultModel,
} from "../controllers/api-key.ts";
import { PROVIDER_REGISTRY } from "../controllers/provider-registry.ts";

/** Filter the chat-model catalog down to providers that the user has configured. */
export function filterChatModelsForConfiguredProviders(state: AppViewState): AppViewState {
  const configured = getConfiguredProviders(state);
  if (configured.size === 0) {return state;}
  return {
    ...state,
    chatModelCatalog: state.chatModelCatalog.filter((m) => configured.has(m.provider)),
  };
}

function hasApiKeyConfigured(state: AppViewState): boolean {
  return getConfiguredProviders(state).size > 0;
}

export function renderApiKeyButton(state: AppViewState) {
  const hasKey = hasApiKeyConfigured(state);
  const modelCount = state.chatModelCatalog?.length ?? 0;
  const togglePopover = async () => {
    state.apiKeyPopoverOpen = !state.apiKeyPopoverOpen;
    state.apiKeyError = null;
    state.apiKeySuccess = null;
    if (state.apiKeyPopoverOpen) {
      state.apiKeyView = "providers";
      await ensureConfigLoaded(state);
    }
  };
  return html`
    <div class="api-key-wrapper">
      <button
        class="api-key-btn ${hasKey ? "api-key-btn--configured" : "api-key-btn--missing"}"
        @click=${togglePopover}
        title="${hasKey ? `AI configured (${modelCount} models)` : "Add AI API Key"}"
        aria-label="${hasKey ? "AI API Key configured" : "Add AI API Key"}"
        aria-expanded=${state.apiKeyPopoverOpen}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
        </svg>
        ${!hasKey ? html`<span class="api-key-btn__badge">!</span>` : nothing}
      </button>
    </div>
    ${state.apiKeyPopoverOpen ? renderApiKeyPanel(state) : nothing}
  `;
}

function renderApiKeyPanel(state: AppViewState) {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      if (state.apiKeyView === "configure") {
        state.apiKeyView = "providers";
        state.apiKeyValue = "";
        state.apiKeyFetchedModels = [];
        state.apiKeySelectedModel = null;
        state.apiKeyError = null;
        state.apiKeySuccess = null;
      } else {
        state.apiKeyPopoverOpen = false;
      }
    }
  };
  return html`
    <div class="api-key-popover api-key-popover--wide" @keydown=${handleKeyDown}>
      <div class="api-key-popover__header">
        <span class="api-key-popover__title">
          ${state.apiKeyView === "configure"
            ? html`<button class="api-key-popover__back" @click=${() => {
                state.apiKeyView = "providers";
                state.apiKeyValue = "";
                state.apiKeyFetchedModels = [];
                state.apiKeySelectedModel = null;
                state.apiKeyError = null;
                state.apiKeySuccess = null;
              }} aria-label="Back">←</button> ${PROVIDER_REGISTRY.find((p) => p.id === state.apiKeyProvider)?.label ?? state.apiKeyProvider}`
            : "AI Providers"}
        </span>
        <button class="api-key-popover__close" @click=${() => { state.apiKeyPopoverOpen = false; }} aria-label="Close">&times;</button>
      </div>
      ${state.apiKeyView === "providers"
        ? renderProviderList(state)
        : renderProviderConfigure(state)}
    </div>
  `;
}

function renderProviderList(state: AppViewState) {
  const configured = getConfiguredProviders(state);
  // Show MiniMax suggestion if no keys configured
  const suggestion = PROVIDER_REGISTRY.find((p) => p.recommended && p.suggestion);
  const showSuggestion = suggestion && configured.size === 0;

  return html`
    ${showSuggestion ? html`
      <div class="api-key-suggestion">
        <span class="api-key-suggestion__icon">✨</span>
        <span>${suggestion!.suggestion}</span>
      </div>
    ` : nothing}
    <div class="api-key-provider-list">
      ${PROVIDER_REGISTRY.map((p) => {
        const isConfigured = configured.has(p.id);
        return html`
          <button
            class="api-key-provider-card ${isConfigured ? "api-key-provider-card--configured" : ""} ${p.recommended ? "api-key-provider-card--recommended" : ""}"
            @click=${() => {
              state.apiKeyProvider = p.id;
              state.apiKeyView = "configure";
              state.apiKeyValue = "";
              state.apiKeyFetchedModels = [];
              state.apiKeySelectedModel = null;
              state.apiKeyError = null;
              state.apiKeySuccess = null;
            }}
          >
            <div class="api-key-provider-card__info">
              <span class="api-key-provider-card__name">
                ${p.label}
                ${p.recommended ? html`<span class="api-key-provider-card__badge">★</span>` : nothing}
              </span>
              <span class="api-key-provider-card__desc">${p.description}</span>
            </div>
            <span class="api-key-provider-card__status">
              ${isConfigured
                ? html`<span class="api-key-provider-card__check">✓</span>`
                : html`<span class="api-key-provider-card__arrow">→</span>`}
            </span>
          </button>
        `;
      })}
    </div>
  `;
}

function renderProviderConfigure(state: AppViewState) {
  const provider = PROVIDER_REGISTRY.find((p) => p.id === state.apiKeyProvider);
  if (!provider) {return nothing;}

  const handleSaveAndDetect = async () => {
    await saveApiKeyAndDetectModels(state);
  };
  const handleSetDefault = async () => {
    await setDefaultModel(state);
  };
  const handleKeyInput = (e: Event) => {
    state.apiKeyValue = (e.target as HTMLInputElement).value;
    state.apiKeyError = null;
    state.apiKeySuccess = null;
  };
  const handleKeyDown = async (e: KeyboardEvent) => {
    if (e.key === "Enter" && !state.apiKeySaving && state.apiKeyValue.trim()) {
      await handleSaveAndDetect();
    }
  };

  const configured = getConfiguredProviders(state);
  const isConfigured = configured.has(state.apiKeyProvider);

  return html`
    <div class="api-key-configure">
      ${isConfigured ? html`
        <div class="api-key-popover__status api-key-popover__status--ok">
          <span class="api-key-popover__status-dot"></span>
          <span>Key configured — enter a new key to update</span>
        </div>
      ` : nothing}
      <label class="api-key-popover__field">
        <span class="api-key-popover__label">${isConfigured ? "Update API Key" : "API Key"}</span>
        <input
          type="password"
          placeholder=${provider.placeholder}
          .value=${state.apiKeyValue}
          @input=${handleKeyInput}
          @keydown=${handleKeyDown}
          autocomplete="off"
        />
      </label>

      ${state.apiKeyError ? html`<div class="api-key-popover__msg api-key-popover__msg--error">${state.apiKeyError}</div>` : nothing}
      ${state.apiKeySuccess ? html`<div class="api-key-popover__msg api-key-popover__msg--success">${state.apiKeySuccess}</div>` : nothing}

      ${state.apiKeyValue.trim() && !state.apiKeySaving ? html`
        <button
          class="api-key-popover__save"
          ?disabled=${state.apiKeySaving}
          @click=${handleSaveAndDetect}
        >
          Save Key & Add Models
        </button>
      ` : nothing}

      ${state.apiKeySaving ? html`
        <div class="api-key-models-loading">
          <span class="api-key-models-loading__spinner"></span>
          <span>Saving…</span>
        </div>
      ` : nothing}

      ${state.apiKeyFetchedModels.length > 0 ? html`
        <div class="api-key-models">
          <div class="api-key-models__header">
            <span class="api-key-models__title">${state.apiKeyFetchedModels.length} model${state.apiKeyFetchedModels.length !== 1 ? "s" : ""} available</span>
            <span class="api-key-models__hint">Select default model</span>
          </div>
          <div class="api-key-models__list">
            ${state.apiKeyFetchedModels.slice(0, 50).map((m) => html`
              <button
                class="api-key-model-item ${m.id === state.apiKeySelectedModel ? "api-key-model-item--selected" : ""}"
                @click=${() => { state.apiKeySelectedModel = m.id; }}
              >
                <span class="api-key-model-item__name">${m.name}</span>
                ${m.contextWindow ? html`<span class="api-key-model-item__ctx">${Math.round(m.contextWindow / 1000)}k ctx</span>` : nothing}
                ${m.id === state.apiKeySelectedModel ? html`<span class="api-key-model-item__check">✓</span>` : nothing}
              </button>
            `)}
          </div>
          <button
            class="api-key-popover__save"
            ?disabled=${!state.apiKeySelectedModel || state.apiKeySaving}
            @click=${handleSetDefault}
          >
            ${state.apiKeySaving ? "Setting…" : `Set as Default Model`}
          </button>
        </div>
      ` : nothing}
    </div>
  `;
}
