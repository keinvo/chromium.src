// Copyright (c) 2011 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_UI_VIEWS_TABS_ABSTRACT_TAB_STRIP_VIEW_H_
#define CHROME_BROWSER_UI_VIEWS_TABS_ABSTRACT_TAB_STRIP_VIEW_H_
#pragma once

#include "views/view.h"

// This interface is the way the browser view sees a tab strip's view.
class AbstractTabStripView : public views::View {
 public:
  virtual ~AbstractTabStripView() {}

  // Returns true if the tab strip is editable.
  // Returns false if the tab strip is being dragged or animated to prevent
  // extensions from messing things up while that's happening.
  virtual bool IsTabStripEditable() const = 0;

  // Returns false when there is a drag operation in progress so that the frame
  // doesn't close.
  virtual bool IsTabStripCloseable() const = 0;

  // Updates the loading animations displayed by tabs in the tabstrip to the
  // next frame.
  virtual void UpdateLoadingAnimations() = 0;
};

#endif  // CHROME_BROWSER_UI_VIEWS_TABS_ABSTRACT_TAB_STRIP_VIEW_H_

