// Copyright 2013 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef NET_SSL_CLIENT_CERT_STORE_CHROMEOS_H_
#define NET_SSL_CLIENT_CERT_STORE_CHROMEOS_H_

#include <string>

#include "crypto/scoped_nss_types.h"
#include "net/cert/nss_profile_filter_chromeos.h"
#include "net/ssl/client_cert_store_nss.h"

namespace net {

class NET_EXPORT ClientCertStoreChromeOS : public ClientCertStoreNSS {
 public:
  // Constructs a ClientCertStore that will return client certs available on
  // the user's private and public slots. If |use_system_slot| is true, certs on
  // the system slot will also be returned.
  ClientCertStoreChromeOS(
      bool use_system_slot,
      const std::string& username_hash,
      const PasswordDelegateFactory& password_delegate_factory);
  virtual ~ClientCertStoreChromeOS();

  // ClientCertStoreNSS:
  virtual void GetClientCerts(const SSLCertRequestInfo& cert_request_info,
                              CertificateList* selected_certs,
                              const base::Closure& callback) override;

 protected:
  // ClientCertStoreNSS:
  virtual void GetClientCertsImpl(CERTCertList* cert_list,
                                  const SSLCertRequestInfo& request,
                                  bool query_nssdb,
                                  CertificateList* selected_certs) override;

 private:
  void DidGetSystemAndPrivateSlot(const SSLCertRequestInfo* request,
                                  CertificateList* selected_certs,
                                  const base::Closure& callback,
                                  crypto::ScopedPK11Slot system_slot,
                                  crypto::ScopedPK11Slot private_slot);

  bool use_system_slot_;
  std::string username_hash_;
  NSSProfileFilterChromeOS profile_filter_;

  DISALLOW_COPY_AND_ASSIGN(ClientCertStoreChromeOS);
};

}  // namespace net

#endif  // NET_SSL_CLIENT_CERT_STORE_CHROMEOS_H_
