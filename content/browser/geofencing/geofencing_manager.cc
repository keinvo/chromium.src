// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "content/browser/geofencing/geofencing_manager.h"

#include <algorithm>

#include "base/callback.h"
#include "content/browser/geofencing/geofencing_service.h"
#include "content/browser/service_worker/service_worker_context_wrapper.h"
#include "content/public/browser/browser_thread.h"
#include "third_party/WebKit/public/platform/WebCircularGeofencingRegion.h"

namespace content {

struct GeofencingManager::Registration {
  Registration(int64 service_worker_registration_id,
               const std::string& region_id,
               const blink::WebCircularGeofencingRegion& region,
               const StatusCallback& callback,
               int64 geofencing_registration_id);

  int64 service_worker_registration_id;
  std::string region_id;
  blink::WebCircularGeofencingRegion region;

  // Registration ID as returned by the |GeofencingService|.
  int64 geofencing_registration_id;

  // Callback to call when registration is completed. This field is reset when
  // registration is complete.
  StatusCallback registration_callback;

  // Returns true if registration has been completed, and thus should be
  // included in calls to GetRegisteredRegions.
  bool is_active() const { return registration_callback.is_null(); }
};

GeofencingManager::Registration::Registration(
    int64 service_worker_registration_id,
    const std::string& region_id,
    const blink::WebCircularGeofencingRegion& region,
    const GeofencingManager::StatusCallback& callback,
    int64 geofencing_registration_id)
    : service_worker_registration_id(service_worker_registration_id),
      region_id(region_id),
      region(region),
      geofencing_registration_id(geofencing_registration_id),
      registration_callback(callback) {
}

GeofencingManager::GeofencingManager(
    const scoped_refptr<ServiceWorkerContextWrapper>& service_worker_context)
    : service_(nullptr), service_worker_context_(service_worker_context) {
  DCHECK_CURRENTLY_ON(BrowserThread::UI);
}

GeofencingManager::~GeofencingManager() {
}

void GeofencingManager::Init() {
  DCHECK_CURRENTLY_ON(BrowserThread::UI);
  BrowserThread::PostTask(BrowserThread::IO,
                          FROM_HERE,
                          base::Bind(&GeofencingManager::InitOnIO, this));
}

void GeofencingManager::Shutdown() {
  DCHECK_CURRENTLY_ON(BrowserThread::UI);
  BrowserThread::PostTask(BrowserThread::IO,
                          FROM_HERE,
                          base::Bind(&GeofencingManager::ShutdownOnIO, this));
}

void GeofencingManager::InitOnIO() {
  DCHECK_CURRENTLY_ON(BrowserThread::IO);
  service_ = GeofencingServiceImpl::GetInstance();
}

void GeofencingManager::ShutdownOnIO() {
  DCHECK_CURRENTLY_ON(BrowserThread::IO);
  // Clean up all registrations with the |GeofencingService|.
  // TODO(mek): This will need to change to support geofence registrations that
  //     outlive the browser, although removing the references to this
  //     |GeofencingManager| from the |GeofencingService| will still be needed.
  for (const auto& registration : registrations_by_id_) {
    service_->UnregisterRegion(registration.first);
  }
}

void GeofencingManager::RegisterRegion(
    int64 service_worker_registration_id,
    const std::string& region_id,
    const blink::WebCircularGeofencingRegion& region,
    const StatusCallback& callback) {
  DCHECK_CURRENTLY_ON(BrowserThread::IO);

  // TODO(mek): Validate region_id and region.

  if (!service_->IsServiceAvailable()) {
    callback.Run(GEOFENCING_STATUS_OPERATION_FAILED_SERVICE_NOT_AVAILABLE);
    return;
  }

  if (FindRegistration(service_worker_registration_id, region_id)) {
    // Already registered, return an error.
    // TODO(mek): Use a more specific error code.
    callback.Run(GEOFENCING_STATUS_ERROR);
    return;
  }

  AddRegistration(service_worker_registration_id,
                  region_id,
                  region,
                  callback,
                  service_->RegisterRegion(region, this));
}

void GeofencingManager::UnregisterRegion(int64 service_worker_registration_id,
                                         const std::string& region_id,
                                         const StatusCallback& callback) {
  DCHECK_CURRENTLY_ON(BrowserThread::IO);

  // TODO(mek): Validate region_id.

  if (!service_->IsServiceAvailable()) {
    callback.Run(GEOFENCING_STATUS_OPERATION_FAILED_SERVICE_NOT_AVAILABLE);
    return;
  }

  Registration* registration =
      FindRegistration(service_worker_registration_id, region_id);
  if (!registration) {
    // Not registered, return an error.
    callback.Run(GEOFENCING_STATUS_UNREGISTRATION_FAILED_NOT_REGISTERED);
    return;
  }

  if (!registration->is_active()) {
    // Started registration, but not completed yet, error.
    callback.Run(GEOFENCING_STATUS_UNREGISTRATION_FAILED_NOT_REGISTERED);
    return;
  }

  service_->UnregisterRegion(registration->geofencing_registration_id);
  ClearRegistration(registration);
  callback.Run(GEOFENCING_STATUS_OK);
}

GeofencingStatus GeofencingManager::GetRegisteredRegions(
    int64 service_worker_registration_id,
    std::map<std::string, blink::WebCircularGeofencingRegion>* result) {
  DCHECK_CURRENTLY_ON(BrowserThread::IO);
  CHECK(result);

  if (!service_->IsServiceAvailable()) {
    return GEOFENCING_STATUS_OPERATION_FAILED_SERVICE_NOT_AVAILABLE;
  }

  // Populate result, filtering out inactive registrations.
  result->clear();
  ServiceWorkerRegistrationsMap::iterator registrations =
      registrations_.find(service_worker_registration_id);
  if (registrations == registrations_.end())
    return GEOFENCING_STATUS_OK;
  for (const auto& registration : registrations->second) {
    if (registration.second.is_active())
      (*result)[registration.first] = registration.second.region;
  }
  return GEOFENCING_STATUS_OK;
}

void GeofencingManager::RegistrationFinished(int64 geofencing_registration_id,
                                             GeofencingStatus status) {
  DCHECK_CURRENTLY_ON(BrowserThread::IO);
  Registration* registration = FindRegistrationById(geofencing_registration_id);
  DCHECK(registration);
  DCHECK(!registration->is_active());
  registration->registration_callback.Run(status);
  registration->registration_callback.Reset();

  // If the registration wasn't succesful, remove it from our storage.
  if (status != GEOFENCING_STATUS_OK)
    ClearRegistration(registration);
}

GeofencingManager::Registration* GeofencingManager::FindRegistration(
    int64 service_worker_registration_id,
    const std::string& region_id) {
  DCHECK_CURRENTLY_ON(BrowserThread::IO);
  ServiceWorkerRegistrationsMap::iterator registrations_iterator =
      registrations_.find(service_worker_registration_id);
  if (registrations_iterator == registrations_.end())
    return nullptr;
  RegionIdRegistrationMap::iterator registration =
      registrations_iterator->second.find(region_id);
  if (registration == registrations_iterator->second.end())
    return nullptr;
  return &registration->second;
}

GeofencingManager::Registration* GeofencingManager::FindRegistrationById(
    int64 geofencing_registration_id) {
  DCHECK_CURRENTLY_ON(BrowserThread::IO);
  RegistrationIdRegistrationMap::iterator registration_iterator =
      registrations_by_id_.find(geofencing_registration_id);
  if (registration_iterator == registrations_by_id_.end())
    return nullptr;
  return &registration_iterator->second->second;
}

GeofencingManager::Registration& GeofencingManager::AddRegistration(
    int64 service_worker_registration_id,
    const std::string& region_id,
    const blink::WebCircularGeofencingRegion& region,
    const StatusCallback& callback,
    int64 geofencing_registration_id) {
  DCHECK_CURRENTLY_ON(BrowserThread::IO);
  DCHECK(!FindRegistration(service_worker_registration_id, region_id));
  RegionIdRegistrationMap::iterator registration =
      registrations_[service_worker_registration_id]
          .insert(std::make_pair(region_id,
                                 Registration(service_worker_registration_id,
                                              region_id,
                                              region,
                                              callback,
                                              geofencing_registration_id)))
          .first;
  registrations_by_id_[geofencing_registration_id] = registration;
  return registration->second;
}

void GeofencingManager::ClearRegistration(Registration* registration) {
  DCHECK_CURRENTLY_ON(BrowserThread::IO);
  registrations_by_id_.erase(registration->geofencing_registration_id);
  ServiceWorkerRegistrationsMap::iterator registrations_iterator =
      registrations_.find(registration->service_worker_registration_id);
  DCHECK(registrations_iterator != registrations_.end());
  registrations_iterator->second.erase(registration->region_id);
  if (registrations_iterator->second.empty())
    registrations_.erase(registrations_iterator);
}

}  // namespace content
