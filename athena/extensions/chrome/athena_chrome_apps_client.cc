// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "athena/extensions/chrome/athena_chrome_apps_client.h"

#include "athena/extensions/chrome/athena_chrome_app_delegate.h"
#include "base/memory/singleton.h"
#include "chrome/browser/browser_process.h"
#include "chrome/browser/devtools/devtools_window.h"
#include "chrome/browser/profiles/profile_manager.h"
#include "chrome/common/extensions/features/feature_channel.h"
#include "extensions/browser/app_window/app_window.h"

namespace athena {

AthenaChromeAppsClient::AthenaChromeAppsClient() {
}

AthenaChromeAppsClient::~AthenaChromeAppsClient() {
}

std::vector<content::BrowserContext*>
AthenaChromeAppsClient::GetLoadedBrowserContexts() {
  std::vector<Profile*> profiles =
      g_browser_process->profile_manager()->GetLoadedProfiles();
  return std::vector<content::BrowserContext*>(profiles.begin(),
                                               profiles.end());
}

extensions::AppWindow* AthenaChromeAppsClient::CreateAppWindow(
    content::BrowserContext* context,
    const extensions::Extension* extension) {
  return new extensions::AppWindow(
      context, new AthenaChromeAppDelegate, extension);
}

void AthenaChromeAppsClient::OpenDevToolsWindow(
    content::WebContents* web_contents,
    const base::Closure& callback) {
  // TODO(oshima): Figure out what to do.
  DevToolsWindow* devtools_window = DevToolsWindow::OpenDevToolsWindow(
      web_contents, DevToolsToggleAction::ShowConsole());
  devtools_window->SetLoadCompletedCallback(callback);
}

bool AthenaChromeAppsClient::IsCurrentChannelOlderThanDev() {
  return extensions::GetCurrentChannel() > chrome::VersionInfo::CHANNEL_DEV;
}

}  // namespace athena
