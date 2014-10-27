// Copyright (c) 2012 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_CHROMEOS_EXTENSIONS_FILE_MANAGER_EVENT_ROUTER_H_
#define CHROME_BROWSER_CHROMEOS_EXTENSIONS_FILE_MANAGER_EVENT_ROUTER_H_

#include <map>
#include <string>
#include <vector>

#include "base/basictypes.h"
#include "base/compiler_specific.h"
#include "base/files/file_path_watcher.h"
#include "base/memory/scoped_ptr.h"
#include "chrome/browser/chromeos/drive/drive_integration_service.h"
#include "chrome/browser/chromeos/drive/file_system_observer.h"
#include "chrome/browser/chromeos/drive/job_list.h"
#include "chrome/browser/chromeos/drive/sync_client.h"
#include "chrome/browser/chromeos/file_manager/file_watcher.h"
#include "chrome/browser/chromeos/file_manager/fileapi_util.h"
#include "chrome/browser/chromeos/file_manager/volume_manager.h"
#include "chrome/browser/chromeos/file_manager/volume_manager_observer.h"
#include "chrome/browser/drive/drive_service_interface.h"
#include "chrome/common/extensions/api/file_manager_private.h"
#include "chromeos/disks/disk_mount_manager.h"
#include "chromeos/network/network_state_handler_observer.h"
#include "components/keyed_service/core/keyed_service.h"
#include "storage/browser/fileapi/file_system_operation.h"

class PrefChangeRegistrar;
class Profile;

using file_manager::util::EntryDefinition;

namespace base {
class ListValue;
}

namespace chromeos {
class NetworkState;
}

namespace drive {
class FileChange;
}

namespace file_manager {
class DeviceEventRouter;

// Monitors changes in disk mounts, network connection state and preferences
// affecting File Manager. Dispatches appropriate File Browser events.
class EventRouter : public KeyedService,
                    public chromeos::NetworkStateHandlerObserver,
                    public drive::FileSystemObserver,
                    public drive::JobListObserver,
                    public drive::DriveServiceObserver,
                    public VolumeManagerObserver,
                    public content::NotificationObserver {
 public:
  typedef base::Callback<void(const base::FilePath& virtual_path,
                              const drive::FileChange* list,
                              bool got_error,
                              const std::vector<std::string>& extension_ids)>
      DispatchDirectoryChangeEventImplCallback;

  explicit EventRouter(Profile* profile);
  virtual ~EventRouter();

  // KeyedService overrides.
  virtual void Shutdown() override;

  typedef base::Callback<void(bool success)> BoolCallback;

  // Adds a file watch at |local_path|, associated with |virtual_path|, for
  // an extension with |extension_id|.
  //
  // |callback| will be called with true on success, or false on failure.
  // |callback| must not be null.
  void AddFileWatch(const base::FilePath& local_path,
                    const base::FilePath& virtual_path,
                    const std::string& extension_id,
                    const BoolCallback& callback);

  // Removes a file watch at |local_path| for an extension with |extension_id|.
  void RemoveFileWatch(const base::FilePath& local_path,
                       const std::string& extension_id);

  // Called when a copy task is completed.
  void OnCopyCompleted(
      int copy_id, const GURL& source_url, const GURL& destination_url,
      base::File::Error error);

  // Called when a copy task progress is updated.
  void OnCopyProgress(int copy_id,
                      storage::FileSystemOperation::CopyProgressType type,
                      const GURL& source_url,
                      const GURL& destination_url,
                      int64 size);

  // chromeos::NetworkStateHandlerObserver overrides.
  virtual void DefaultNetworkChanged(
      const chromeos::NetworkState* network) override;

  // drive::JobListObserver overrides.
  virtual void OnJobAdded(const drive::JobInfo& job_info) override;
  virtual void OnJobUpdated(const drive::JobInfo& job_info) override;
  virtual void OnJobDone(const drive::JobInfo& job_info,
                         drive::FileError error) override;

  // drive::DriveServiceObserver overrides.
  virtual void OnRefreshTokenInvalid() override;

  // drive::FileSystemObserver overrides.
  virtual void OnDirectoryChanged(const base::FilePath& drive_path) override;
  virtual void OnFileChanged(const drive::FileChange& changed_files) override;
  virtual void OnDriveSyncError(drive::file_system::DriveSyncErrorType type,
                                const base::FilePath& drive_path) override;

  // VolumeManagerObserver overrides.
  virtual void OnDiskAdded(
      const chromeos::disks::DiskMountManager::Disk& disk,
      bool mounting) override;
  virtual void OnDiskRemoved(
      const chromeos::disks::DiskMountManager::Disk& disk) override;
  virtual void OnDeviceAdded(const std::string& device_path) override;
  virtual void OnDeviceRemoved(const std::string& device_path) override;
  virtual void OnVolumeMounted(chromeos::MountError error_code,
                               const VolumeInfo& volume_info) override;
  virtual void OnVolumeUnmounted(chromeos::MountError error_code,
                                 const VolumeInfo& volume_info) override;
  virtual void OnFormatStarted(
      const std::string& device_path, bool success) override;
  virtual void OnFormatCompleted(
      const std::string& device_path, bool success) override;

  // content::NotificationObserver overrides.
  virtual void Observe(int type,
                       const content::NotificationSource& source,
                       const content::NotificationDetails& details) override;

  // Set custom dispatch directory change event implementation for testing.
  void SetDispatchDirectoryChangeEventImplForTesting(
      const DispatchDirectoryChangeEventImplCallback& callback);

 private:
  typedef std::map<base::FilePath, FileWatcher*> WatcherMap;

  // Starts observing file system change events.
  void ObserveEvents();

  // Called when prefs related to file manager change.
  void OnFileManagerPrefsChanged();

  // Process file watch notifications.
  void HandleFileWatchNotification(const drive::FileChange* list,
                                   const base::FilePath& path,
                                   bool got_error);

  // Sends directory change event.
  void DispatchDirectoryChangeEvent(
      const base::FilePath& path,
      const drive::FileChange* list,
      bool got_error,
      const std::vector<std::string>& extension_ids);

  // Default implementation of DispatchDirectoryChangeEvent.
  void DispatchDirectoryChangeEventImpl(
      const base::FilePath& path,
      const drive::FileChange* list,
      bool got_error,
      const std::vector<std::string>& extension_ids);

  // Sends directory change event, after converting the file definition to entry
  // definition.
  void DispatchDirectoryChangeEventWithEntryDefinition(
      const linked_ptr<drive::FileChange> list,
      const std::string* extension_id,
      bool watcher_error,
      const EntryDefinition& entry_definition);

  // Dispatches the mount completed event.
  void DispatchMountCompletedEvent(
      extensions::api::file_manager_private::MountCompletedEventType event_type,
      chromeos::MountError error,
      const VolumeInfo& volume_info);

  // If needed, opens a file manager window for the removable device mounted at
  // |mount_path|. Disk.mount_path() is empty, since it is being filled out
  // after calling notifying observers by DiskMountManager.
  void ShowRemovableDeviceInFileManager(VolumeType type,
                                        const base::FilePath& mount_path);

  // Manages the list of currently active Drive file transfer jobs.
  struct DriveJobInfoWithStatus {
    DriveJobInfoWithStatus();
    DriveJobInfoWithStatus(const drive::JobInfo& info,
                           const std::string& status);
    drive::JobInfo job_info;
    std::string status;
  };

  // Sends onFileTransferUpdate event right now if |immediate| is set. Otherwise
  // it refrains from sending for a short while, and after that it sends the
  // most recently scheduled event once.
  // The delay is for waiting subsequent 'added' events to come after the first
  // one when multiple tasks are added. This way, we can avoid frequent UI
  // update caused by differences between singular and plural cases.
  void ScheduleDriveFileTransferEvent(const drive::JobInfo& job_info,
                                      const std::string& status,
                                      bool immediate);

  // Sends the most recently scheduled onFileTransferUpdated event to
  // extensions.
  // This is used for implementing ScheduledDriveFileTransferEvent().
  void SendDriveFileTransferEvent();

  std::map<drive::JobID, DriveJobInfoWithStatus> drive_jobs_;
  scoped_ptr<DriveJobInfoWithStatus> drive_job_info_for_scheduled_event_;
  base::Time last_copy_progress_event_;
  base::Time next_send_file_transfer_event_;

  WatcherMap file_watchers_;
  scoped_ptr<PrefChangeRegistrar> pref_change_registrar_;
  Profile* profile_;

  content::NotificationRegistrar notification_registrar_;

  scoped_ptr<DeviceEventRouter> device_event_router_;

  DispatchDirectoryChangeEventImplCallback
      dispatch_directory_change_event_impl_;

  // Note: This should remain the last member so it'll be destroyed and
  // invalidate the weak pointers before any other members are destroyed.
  base::WeakPtrFactory<EventRouter> weak_factory_;

  DISALLOW_COPY_AND_ASSIGN(EventRouter);
};

}  // namespace file_manager

#endif  // CHROME_BROWSER_CHROMEOS_EXTENSIONS_FILE_MANAGER_EVENT_ROUTER_H_
