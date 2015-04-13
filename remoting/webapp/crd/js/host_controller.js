// Copyright (c) 2012 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/** @suppress {duplicate} */
var remoting = remoting || {};

/** @constructor */
remoting.HostController = function() {
  this.hostDaemonFacade_ = this.createDaemonFacade_();
};

// The values in the enums below are duplicated in daemon_controller.h except
// for NOT_INSTALLED.
/** @enum {number} */
remoting.HostController.State = {
  NOT_IMPLEMENTED: 0,
  NOT_INSTALLED: 1,
  STOPPED: 2,
  STARTING: 3,
  STARTED: 4,
  STOPPING: 5,
  UNKNOWN: 6
};

/**
 * @param {string} state The host controller state name.
 * @return {remoting.HostController.State} The state enum value.
 */
remoting.HostController.State.fromString = function(state) {
  if (!remoting.HostController.State.hasOwnProperty(state)) {
    throw "Invalid HostController.State: " + state;
  }
  return remoting.HostController.State[state];
}

/** @enum {number} */
remoting.HostController.AsyncResult = {
  OK: 0,
  FAILED: 1,
  CANCELLED: 2,
  FAILED_DIRECTORY: 3
};

/**
 * @param {string} result The async result name.
 * @return {remoting.HostController.AsyncResult} The result enum value.
 */
remoting.HostController.AsyncResult.fromString = function(result) {
  if (!remoting.HostController.AsyncResult.hasOwnProperty(result)) {
    throw "Invalid HostController.AsyncResult: " + result;
  }
  return remoting.HostController.AsyncResult[result];
}

/**
 * @return {remoting.HostDaemonFacade}
 * @private
 */
remoting.HostController.prototype.createDaemonFacade_ = function() {
  /** @type {remoting.HostDaemonFacade} @private */
  var hostDaemonFacade = new remoting.HostDaemonFacade();

  /** @param {string} version */
  var printVersion = function(version) {
    if (version == '') {
      console.log('Host not installed.');
    } else {
      console.log('Host version: ' + version);
    }
  };

  hostDaemonFacade.getDaemonVersion().then(printVersion, function() {
    console.log('Host version not available.');
  });

  return hostDaemonFacade;
};

/**
 * Set of features for which hasFeature() can be used to test.
 *
 * @enum {string}
 */
remoting.HostController.Feature = {
  PAIRING_REGISTRY: 'pairingRegistry',
  OAUTH_CLIENT: 'oauthClient'
};

/**
 * Information relating to user consent to collect usage stats.  The
 * fields are:
 *
 *   supported: True if crash dump reporting is supported by the host.
 *
 *   allowed: True if crash dump reporting is allowed.
 *
 *   setByPolicy: True if crash dump reporting is controlled by policy.
 *
 * @typedef {{
 *   supported:boolean,
 *   allowed:boolean,
 *   setByPolicy:boolean
 * }}
 */
remoting.UsageStatsConsent;

/**
 * @param {remoting.HostController.Feature} feature The feature to test for.
 * @param {function(boolean):void} callback
 * @return {void}
 */
remoting.HostController.prototype.hasFeature = function(feature, callback) {
  // TODO(rmsousa): This could synchronously return a boolean, provided it were
  // only called after native messaging is completely initialized.
  this.hostDaemonFacade_.hasFeature(feature).then(callback);
};

/**
 * @return {!Promise<remoting.UsageStatsConsent>}
 */
remoting.HostController.prototype.getConsent = function() {
  return this.hostDaemonFacade_.getUsageStatsConsent();
};

/**
 * Registers and starts the host.
 *
 * @param {string} hostPin Host PIN.
 * @param {boolean} consent The user's consent to crash dump reporting.
 * @param {function():void} onDone Callback to be called when done.
 * @param {function(!remoting.Error):void} onError Callback to be called on
 *     error.
 * @return {void} Nothing.
 */
remoting.HostController.prototype.start = function(hostPin, consent, onDone,
                                                   onError) {
  /** @type {remoting.HostController} */
  var that = this;

  // The following variables are set in local functions of this method
  // and read by other local methods.  Each variable is assumed to be
  // undefined at the point where it is assigned.

  /** @type {string} */
  var hostName;

  /** @type {string} */
  var privateKey;

  /** @type {string} */
  var publicKey;

  /** @type {?string} */
  var hostClientId;

  /** @type {string} */
  var xmppLogin;

  /** @type {?string} */
  var refreshToken;

  /** @type {string} */
  var clientBaseJid;

  /** @const */
  var newHostId = base.generateUuid();

  /** @param {!remoting.Error} error */
  function onStartError(error) {
    // Unregister the host if we failed to start it.
    remoting.hostList.unregisterHostById(newHostId);
    onError(error);
  }

  /**
   * @param {remoting.HostController.AsyncResult} result
   */
  function onStarted(result) {
    if (result == remoting.HostController.AsyncResult.OK) {
      remoting.hostList.onLocalHostStarted(hostName, newHostId, publicKey);
      onDone();
    } else if (result == remoting.HostController.AsyncResult.CANCELLED) {
      onStartError(new remoting.Error(remoting.Error.Tag.CANCELLED));
    } else {
      onStartError(remoting.Error.unexpected());
    }
  }

  /**
   * @param {string} hostSecretHash
   */
  function startHostWithHash(hostSecretHash) {
    var hostConfig = {
      xmpp_login: xmppLogin,
      oauth_refresh_token: refreshToken,
      host_id: newHostId,
      host_name: hostName,
      host_secret_hash: hostSecretHash,
      private_key: privateKey
    };
    var hostOwner = clientBaseJid;
    remoting.identity.getEmail().then(
        function(/** string */ hostOwnerEmail) {
          if (hostOwner != xmppLogin) {
            hostConfig['host_owner'] = hostOwner;
            if (hostOwnerEmail != hostOwner) {
              hostConfig['host_owner_email'] = hostOwnerEmail;
            }
          }
          that.hostDaemonFacade_.startDaemon(
              hostConfig, consent).then(
                  onStarted, remoting.Error.handler(onStartError));
        });
  }

  /**
   * @param {string} clientBaseJidParam
   */
  function onClientBaseJid(clientBaseJidParam) {
    clientBaseJid = clientBaseJidParam;
    that.hostDaemonFacade_.getPinHash(
        newHostId, hostPin).then(
            startHostWithHash, remoting.Error.handler(onError));
  }

  /**
   * @param {{refreshToken: string, userEmail: string}} creds
   */
  function onServiceAccountCredentials(creds) {
    xmppLogin = creds.userEmail;
    refreshToken = creds.refreshToken;
    that.getClientBaseJid_(onClientBaseJid, onStartError);
  }

  /**
   * @param {!remoting.Xhr.Response} response
   */
  function onRegistered(response) {
    var success = (response.status == 200);

    if (success) {
      var result = base.jsonParseSafe(response.getText());
      if ('data' in result && 'authorizationCode' in result['data']) {
        that.hostDaemonFacade_.getCredentialsFromAuthCode(
            result['data']['authorizationCode']).then(
                onServiceAccountCredentials,
                remoting.Error.handler(onError));
      } else {
        // No authorization code returned, use regular user credential flow.
        refreshToken = remoting.oauth2.getRefreshToken();
        remoting.identity.getEmail().then(
            function(/** string */ email) {
              xmppLogin = email;
              clientBaseJid = email;
              that.hostDaemonFacade_.getPinHash(
                  newHostId, hostPin).then(
                      startHostWithHash,
                      remoting.Error.handler(onError));
            });
      }
    } else {
      console.log('Failed to register the host. Status: ' + response.status +
                  ' response: ' + response.getText());
      onError(new remoting.Error(remoting.Error.Tag.REGISTRATION_FAILED));
    }
  }

  /**
   * @param {string} oauthToken
   */
  function doRegisterHost(oauthToken) {
    var newHostDetails = { data: {
       hostId: newHostId,
       hostName: hostName,
       publicKey: publicKey
    } };

    new remoting.Xhr({
      method: 'POST',
      url: remoting.settings.DIRECTORY_API_BASE_URL + '/@me/hosts',
      urlParams: {
        hostClientId: hostClientId
      },
      jsonContent: newHostDetails,
      oauthToken: oauthToken
    }).start().then(onRegistered);
  }

  /**
   * @param {string} hostClientIdParam
   */
  function onHostClientId(hostClientIdParam) {
    hostClientId = hostClientIdParam;
    remoting.identity.getToken().then(
        doRegisterHost,
        remoting.Error.handler(onError));
  }

  /**
   * @param {boolean} hasFeature
   */
  function onHasFeatureOAuthClient(hasFeature) {
    if (hasFeature) {
      that.hostDaemonFacade_.getHostClientId().then(
          onHostClientId, remoting.Error.handler(onError));
    } else {
      hostClientId = null;
      remoting.identity.getToken().then(
          doRegisterHost,
          remoting.Error.handler(onError));
    }
  }

  /**
   * @param {{privateKey:string, publicKey:string}} keyPair
   */
  function onKeyGenerated(keyPair) {
    privateKey = keyPair.privateKey;
    publicKey = keyPair.publicKey;
    that.hasFeature(
        remoting.HostController.Feature.OAUTH_CLIENT,
        onHasFeatureOAuthClient);
  }

  /**
   * @param {string} hostNameParam
   * @return {void} Nothing.
   */
  function startWithHostname(hostNameParam) {
    hostName = hostNameParam;
    that.hostDaemonFacade_.generateKeyPair().then(
        onKeyGenerated, remoting.Error.handler(onError));
  }

  this.hostDaemonFacade_.getHostName().then(
      startWithHostname, remoting.Error.handler(onError));
};

/**
 * Stop the daemon process.
 * @param {function():void} onDone Callback to be called when done.
 * @param {function(!remoting.Error):void} onError Callback to be called on
 *     error.
 * @return {void} Nothing.
 */
remoting.HostController.prototype.stop = function(onDone, onError) {
  /** @type {remoting.HostController} */
  var that = this;

  /** @param {string?} hostId The host id of the local host. */
  function unregisterHost(hostId) {
    if (hostId) {
      remoting.hostList.unregisterHostById(hostId, onDone);
      return;
    }
    onDone();
  }

  /** @param {remoting.HostController.AsyncResult} result */
  function onStopped(result) {
    if (result == remoting.HostController.AsyncResult.OK) {
      that.getLocalHostId(unregisterHost);
    } else if (result == remoting.HostController.AsyncResult.CANCELLED) {
      onError(new remoting.Error(remoting.Error.Tag.CANCELLED));
    } else {
      onError(remoting.Error.unexpected());
    }
  }

  this.hostDaemonFacade_.stopDaemon().then(
      onStopped, remoting.Error.handler(onError));
};

/**
 * Check the host configuration is valid (non-null, and contains both host_id
 * and xmpp_login keys).
 * @param {Object} config The host configuration.
 * @return {boolean} True if it is valid.
 */
function isHostConfigValid_(config) {
  return !!config && typeof config['host_id'] == 'string' &&
      typeof config['xmpp_login'] == 'string';
}

/**
 * @param {string} newPin The new PIN to set
 * @param {function():void} onDone Callback to be called when done.
 * @param {function(!remoting.Error):void} onError Callback to be called on
 *     error.
 * @return {void} Nothing.
 */
remoting.HostController.prototype.updatePin = function(newPin, onDone,
                                                       onError) {
  /** @type {remoting.HostController} */
  var that = this;

  /** @param {remoting.HostController.AsyncResult} result */
  function onConfigUpdated(result) {
    if (result == remoting.HostController.AsyncResult.OK) {
      onDone();
    } else if (result == remoting.HostController.AsyncResult.CANCELLED) {
      onError(new remoting.Error(remoting.Error.Tag.CANCELLED));
    } else {
      onError(remoting.Error.unexpected());
    }
  }

  /** @param {string} pinHash */
  function updateDaemonConfigWithHash(pinHash) {
    var newConfig = {
      host_secret_hash: pinHash
    };
    that.hostDaemonFacade_.updateDaemonConfig(newConfig).then(
        onConfigUpdated, remoting.Error.handler(onError));
  }

  /** @param {Object} config */
  function onConfig(config) {
    if (!isHostConfigValid_(config)) {
      onError(remoting.Error.unexpected());
      return;
    }
    /** @type {string} */
    var hostId = config['host_id'];
    that.hostDaemonFacade_.getPinHash(hostId, newPin).then(
        updateDaemonConfigWithHash, remoting.Error.handler(onError));
  }

  // TODO(sergeyu): When crbug.com/121518 is fixed: replace this call
  // with an unprivileged version if that is necessary.
  this.hostDaemonFacade_.getDaemonConfig().then(
      onConfig, remoting.Error.handler(onError));
};

/**
 * Get the state of the local host.
 *
 * @param {function(remoting.HostController.State):void} onDone Completion
 *     callback.
 */
remoting.HostController.prototype.getLocalHostState = function(onDone) {
  /** @param {!remoting.Error} error */
  function onError(error) {
    onDone((error.hasTag(remoting.Error.Tag.MISSING_PLUGIN)) ?
               remoting.HostController.State.NOT_INSTALLED :
               remoting.HostController.State.UNKNOWN);
  }
  this.hostDaemonFacade_.getDaemonState().then(
      onDone, remoting.Error.handler(onError));
};

/**
 * Get the id of the local host, or null if it is not registered.
 *
 * @param {function(string?):void} onDone Completion callback.
 */
remoting.HostController.prototype.getLocalHostId = function(onDone) {
  /** @type {remoting.HostController} */
  var that = this;
  /** @param {Object} config */
  function onConfig(config) {
    var hostId = null;
    if (isHostConfigValid_(config)) {
      hostId = /** @type {string} */ (config['host_id']);
    }
    onDone(hostId);
  };

  this.hostDaemonFacade_.getDaemonConfig().then(onConfig, function(error) {
    onDone(null);
  });
};

/**
 * Fetch the list of paired clients for this host.
 *
 * @param {function(Array<remoting.PairedClient>):void} onDone
 * @param {function(!remoting.Error):void} onError
 * @return {void}
 */
remoting.HostController.prototype.getPairedClients = function(onDone,
                                                              onError) {
  this.hostDaemonFacade_.getPairedClients().then(
      onDone, remoting.Error.handler(onError));
};

/**
 * Delete a single paired client.
 *
 * @param {string} client The client id of the pairing to delete.
 * @param {function():void} onDone Completion callback.
 * @param {function(!remoting.Error):void} onError Error callback.
 * @return {void}
 */
remoting.HostController.prototype.deletePairedClient = function(
    client, onDone, onError) {
  this.hostDaemonFacade_.deletePairedClient(client).then(
      onDone, remoting.Error.handler(onError));
};

/**
 * Delete all paired clients.
 *
 * @param {function():void} onDone Completion callback.
 * @param {function(!remoting.Error):void} onError Error callback.
 * @return {void}
 */
remoting.HostController.prototype.clearPairedClients = function(
    onDone, onError) {
  this.hostDaemonFacade_.clearPairedClients().then(
      onDone, remoting.Error.handler(onError));
};

/**
 * Gets the host owner's base JID, used by the host for client authorization.
 * In most cases this is the same as the owner's email address, but for
 * non-Gmail accounts, it may be different.
 *
 * @private
 * @param {function(string): void} onSuccess
 * @param {function(!remoting.Error): void} onError
 */
remoting.HostController.prototype.getClientBaseJid_ = function(
    onSuccess, onError) {
  /** @type {remoting.SignalStrategy} */
  var signalStrategy = null;

  /** @param {remoting.SignalStrategy.State} state */
  var onState = function(state) {
    switch (state) {
      case remoting.SignalStrategy.State.CONNECTED:
        var jid = signalStrategy.getJid().split('/')[0].toLowerCase();
        base.dispose(signalStrategy);
        signalStrategy = null;
        onSuccess(jid);
        break;

      case remoting.SignalStrategy.State.FAILED:
        var error = signalStrategy.getError();
        base.dispose(signalStrategy);
        signalStrategy = null;
        onError(error);
        break;
    }
  };

  signalStrategy = remoting.SignalStrategy.create();
  signalStrategy.setStateChangedCallback(onState);

  /** @param {string} token */
  function connectSignalingWithToken(token) {
    remoting.identity.getEmail().then(
        connectSignalingWithTokenAndEmail.bind(null, token),
        remoting.Error.handler(onError));
  }

  /**
   * @param {string} token
   * @param {string} email
   */
  function connectSignalingWithTokenAndEmail(token, email) {
    signalStrategy.connect(remoting.settings.XMPP_SERVER, email, token);
  }

  remoting.identity.getToken().then(
      connectSignalingWithToken, remoting.Error.handler(onError));
};

/** @type {remoting.HostController} */
remoting.hostController = null;
