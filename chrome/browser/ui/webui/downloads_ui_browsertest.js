// Copyright 2013 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

GEN_INCLUDE(['downloads_ui_browsertest_base.js']);
GEN('#include "chrome/browser/ui/webui/downloads_ui_browsertest.h"');

// Test UI when removing entries is allowed.
TEST_F('BaseDownloadsWebUITest', 'DeleteAllowed', function() {
  this.expectDeleteControlsVisible(true);
  // TODO(pamg): Mock out the back-end calls, so we can also test removing a
  // single item.
});

TEST_F('BaseDownloadsWebUITest', 'NoResultsHiddenWhenDownloads', function() {
  assertNotEquals(0, downloads.Manager.size());
  expectFalse($('downloads-display').hidden);
  expectTrue($('no-downloads-or-results').hidden);
});

TEST_F('BaseDownloadsWebUITest', 'NoSearchResultsShown', function() {
  expectFalse($('downloads-display').hidden);
  var noResults = $('no-downloads-or-results');
  expectTrue(noResults.hidden);

  downloads.Manager.setSearchText('just try to search for me!');
  this.sendEmptyList();

  expectTrue($('downloads-display').hidden);
  this.checkShowing(noResults, loadTimeData.getString('no_search_results'));
});

TEST_F('BaseDownloadsWebUITest', 'NoDownloadsAfterClearAll', function() {
  expectFalse($('downloads-display').hidden);
  var noResults = $('no-downloads-or-results');
  expectTrue(noResults.hidden);

  $('clear-all').click();
  this.sendEmptyList();

  expectTrue($('downloads-display').hidden);
  this.checkShowing(noResults, loadTimeData.getString('no_downloads'));
});

TEST_F('BaseDownloadsWebUITest', 'PauseResumeFocus', function() {
  var manager = downloads.Manager.getInstance();
  assertGE(manager.size(), 0);

  var freshestDownload = this.createdDownloads[0];
  freshestDownload.state = downloads.Item.States.IN_PROGRESS;
  freshestDownload.resume = false;
  downloads.Manager.updateItem(freshestDownload);

  var node = manager.idMap_[freshestDownload.id].view.node;
  var pause = node.querySelector('.pause');
  var resume = node.querySelector('.resume');

  expectFalse(pause.hidden);
  expectTrue(resume.hidden);
  // Move the focus to "Pause" then pretend the download was resumed. The focus
  // should move to the equivalent button ("Resume" in this case).
  pause.focus();
  assertEquals(document.activeElement, pause);

  freshestDownload.state = downloads.Item.States.PAUSED;
  freshestDownload.resume = true;
  downloads.Manager.updateItem(freshestDownload);

  expectTrue(pause.hidden);
  expectFalse(resume.hidden);
  expectEquals(document.activeElement, resume);
});

TEST_F('BaseDownloadsWebUITest', 'DatesCollapse', function() {
  function datesShowing() {
    var displayDiv = $('downloads-display');
    return displayDiv.querySelectorAll('.date-container:not([hidden])').length;
  }

  var manager = downloads.Manager.getInstance();
  var numDownloads = manager.size();
  assertGE(numDownloads, 2);

  expectEquals(1, datesShowing());

  var freshestId = this.createdDownloads[0].id;
  this.createDangerousDownload(freshestId + 1, Date.now());
  manager.updateAll(this.createdDownloads);

  expectEquals(numDownloads + 1, manager.size());
  expectEquals(1, datesShowing());

  var firstContainer = document.querySelector('.date-container');
  assertFalse(firstContainer.hidden);
  expectGT(firstContainer.querySelector('.since').textContent.trim().length, 0);
  expectGT(firstContainer.querySelector('.date').textContent.trim().length, 0);
});

/**
 * @constructor
 * @extends {BaseDownloadsWebUITest}
 */
function EmptyDownloadsWebUITest() {}

EmptyDownloadsWebUITest.prototype = {
  __proto__: BaseDownloadsWebUITest.prototype,

  /** @override */
  setUp: function() {
    // Doesn't create any fake downloads.
    assertEquals(0, downloads.Manager.size());
  },
};

TEST_F('EmptyDownloadsWebUITest', 'NoDownloadsMessageShowing', function() {
  expectTrue($('downloads-display').hidden);
  var noResults = $('no-downloads-or-results');
  this.checkShowing(noResults, loadTimeData.getString('no_downloads'));
});

TEST_F('EmptyDownloadsWebUITest', 'NoSearchResultsWithNoDownloads', function() {
  downloads.Manager.setSearchText('bananas');
  this.sendEmptyList();

  expectTrue($('downloads-display').hidden);
  var noResults = $('no-downloads-or-results');
  this.checkShowing(noResults, loadTimeData.getString('no_search_results'));
});

/**
 * Fixture for Downloads WebUI testing when deletions are prohibited.
 * @extends {BaseDownloadsWebUITest}
 * @constructor
 */
function DownloadsWebUIDeleteProhibitedTest() {}

DownloadsWebUIDeleteProhibitedTest.prototype = {
  __proto__: BaseDownloadsWebUITest.prototype,

  /** @override */
  testGenPreamble: function() {
    GEN('  SetDeleteAllowed(false);');
  },
};

// Test UI when removing entries is prohibited.
TEST_F('DownloadsWebUIDeleteProhibitedTest', 'DeleteProhibited', function() {
  this.expectDeleteControlsVisible(false);
  // TODO(pamg): Mock out the back-end calls, so we can also test removing a
  // single item.
});

TEST_F('DownloadsWebUIDeleteProhibitedTest', 'ClearLeavesSearch', function() {
  downloads.Manager.setSearchText('muhahaha');
  $('clear-all').click();
  expectGE(downloads.Manager.getInstance().searchText_.length, 0);
});
