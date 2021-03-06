// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROMECAST_CRASH_ANDROID_CRASH_HANDLER_H_
#define CHROMECAST_CRASH_ANDROID_CRASH_HANDLER_H_

#include <jni.h>
#include <string>

#include "base/files/file_path.h"
#include "base/macros.h"
#include "base/memory/scoped_ptr.h"

namespace google_breakpad {
class ExceptionHandler;
}

namespace chromecast {
class CastCrashReporterClientAndroid;

class CrashHandler {
 public:
  // Initializes the crash handler for attempting to upload crash dumps with
  // the current process's log file.
  // Must not be called more than once.
  static void Initialize(const std::string& process_type,
                         const base::FilePath& log_file_path);

  // Returns the directory location for crash dumps.
  static bool GetCrashDumpLocation(base::FilePath* crash_dir);

  // Registers JNI methods for this module.
  static bool RegisterCastCrashJni(JNIEnv* env);

  // Returns whether or not the user has allowed for uploading crash dumps.
  bool CanUploadCrashDump();

  // Callback with which to create a breakpad::ExceptionHandler that will
  // attempt synchronously uploading crash dumps and logs at crash time.
  void AttemptUploadCrashDump();

  // Callback for breakpad::ExceptionHandler to delete crash dumps created by
  // the Chrome crash component. Chrome's crash component does not query
  // for user consent after initializing breakpad.
  void RemoveCrashDumps();

 private:
  CrashHandler(const base::FilePath& log_file_path);
  ~CrashHandler();

  void Initialize(const std::string& process_type);

  // Starts a background thread to look for any past crash dumps and upload them
  // to the crash server.
  void UploadCrashDumpsAsync();

  // Path to the current process's log file.
  base::FilePath log_file_path_;

  // Location to which crash dumps should be written.
  base::FilePath crash_dump_path_;

  scoped_ptr<CastCrashReporterClientAndroid> crash_reporter_client_;
  scoped_ptr<google_breakpad::ExceptionHandler> crash_uploader_;

  DISALLOW_COPY_AND_ASSIGN(CrashHandler);
};

}  // namespace chromecast

#endif  // CHROMECAST_CRASH_ANDROID_CRASH_HANDLER_H_
