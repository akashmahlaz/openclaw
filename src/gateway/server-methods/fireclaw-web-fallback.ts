// FireClaw fork extension — web login provider resolver with bundled-plugin fallback.
// Upstream's listChannelPlugins() only returns *configured* plugins, but the web QR
// onboarding flow needs to enumerate bundled-but-not-yet-configured plugins (chicken
// and egg: you set up WhatsApp via QR, but it can't load until configured).
// Kept in a dedicated file so upstream rebases of web.ts don't collide with this patch.

import { listChannelPlugins } from "../../channels/plugins/index.js";
import { listBundledChannelPlugins } from "../../channels/plugins/bundled.js";

const WEB_LOGIN_METHODS = new Set(["web.login.start", "web.login.wait"]);

const pluginRegistersWebLogin = (plugin: { gatewayMethods?: readonly string[] }) =>
  (plugin.gatewayMethods ?? []).some((method) => WEB_LOGIN_METHODS.has(method));

export const resolveWebLoginProvider = () => {
  // First check loaded (configured) plugins.
  const loaded = listChannelPlugins().find(pluginRegistersWebLogin);
  if (loaded) return loaded;
  // Fall back to bundled plugins so web QR setup works before the channel
  // has been explicitly configured. This is required for first-time WhatsApp
  // onboarding via the web UI.
  return listBundledChannelPlugins().find(pluginRegistersWebLogin) ?? null;
};
