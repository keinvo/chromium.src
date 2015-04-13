// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @fileoverview
 * Unit tests for host_controller.js.
 */

(function() {

'use strict';

/** @type {remoting.HostController} */
var controller;

/** @type {sinon.Mock} */
var hostListMock = null;

/** @type {sinon.TestStub} */
var generateUuidStub;

/** @type {remoting.MockHostDaemonFacade} */
var mockHostDaemonFacade;

/** @type {sinon.TestStub} */
var hostDaemonFacadeCtorStub;

/** @type {remoting.MockSignalStrategy} */
var mockSignalStrategy;

/** @type {sinon.TestStub} */
var signalStrategyCreateStub;

/** @type {sinon.TestStub|Function} */
var signalStrategyConnectStub;

var FAKE_HOST_PIN = '<FAKE_HOST_PIN>';
var FAKE_PIN_HASH = '<FAKE_PIN_HASH>';
var FAKE_NEW_HOST_PIN = '<FAKE_NEW_HOST_PIN>';
var FAKE_USER_EMAIL = '<FAKE_USER_EMAIL>';
var FAKE_XMPP_LOGIN = '<FAKE_XMPP_LOGIN>';
var FAKE_USER_NAME = '<FAKE_USER_NAME>';
var FAKE_HOST_ID = '0bad0bad-0bad-0bad-0bad-0bad0bad0bad';
var FAKE_DAEMON_VERSION = '1.2.3.4';
var FAKE_HOST_NAME = '<FAKE_HOST_NAME>';
var FAKE_PUBLIC_KEY = '<FAKE_PUBLIC_KEY>';
var FAKE_PRIVATE_KEY = '<FAKE_PRIVATE_KEY>';
var FAKE_AUTH_CODE = '<FAKE_AUTH_CODE>';
var FAKE_REFRESH_TOKEN = '<FAKE_REFRESH_TOKEN>';
var FAKE_HOST_CLIENT_ID = '<FAKE_HOST_CLIENT_ID>';
var FAKE_CLIENT_JID = '<FAKE_CLIENT_JID>';
var FAKE_CLIENT_BASE_JID = '<FAKE_CLIENT_BASE_JID>';
var FAKE_IDENTITY_TOKEN = '<FAKE_IDENTITY_TOKEN>';

/** @type {sinon.Spy|Function} */
var getCredentialsFromAuthCodeSpy;

/** @type {sinon.Spy|Function} */
var getPinHashSpy;

/** @type {sinon.Spy|Function} */
var startDaemonSpy;

/** @type {sinon.Spy|Function} */
var updateDaemonConfigSpy;

/** @type {sinon.Spy} */
var unregisterHostByIdSpy;

/** @type {sinon.Spy} */
var onLocalHostStartedSpy;

QUnit.module('host_controller', {
  beforeEach: function(/** QUnit.Assert */ assert) {
    chromeMocks.activate(['identity', 'runtime']);
    chromeMocks.identity.mock$setToken(FAKE_IDENTITY_TOKEN);
    remoting.identity = new remoting.Identity();
    remoting.MockXhr.activate();
    base.debug.assert(remoting.oauth2 === null);
    remoting.oauth2 = new remoting.OAuth2();
    base.debug.assert(remoting.hostList === null);
    remoting.hostList = /** @type {remoting.HostList} */
        (Object.create(remoting.HostList.prototype));

    // When the HostList's unregisterHostById method is called, make
    // sure the argument is correct.
    unregisterHostByIdSpy =
        sinon.stub(remoting.hostList, 'unregisterHostById', function(
            /** string */ hostId, /** Function */ onDone) {
          assert.equal(hostId, FAKE_HOST_ID);
          if (onDone) {
            onDone();
          }
        });

    // When the HostList's onLocalHostStarted method is called, make
    // sure the arguments are correct.
    onLocalHostStartedSpy =
        sinon.stub(
            remoting.hostList, 'onLocalHostStarted', function(
                /** string */ hostName,
                /** string */ newHostId,
                /** string */ publicKey) {
              assert.equal(hostName, FAKE_HOST_NAME);
              assert.equal(newHostId, FAKE_HOST_ID);
              assert.equal(publicKey, FAKE_PUBLIC_KEY);
            });

    mockSignalStrategy = new remoting.MockSignalStrategy(
        FAKE_CLIENT_JID + '/extra_junk',
        remoting.SignalStrategy.Type.XMPP);
    signalStrategyCreateStub = sinon.stub(remoting.SignalStrategy, 'create');
    signalStrategyCreateStub.returns(mockSignalStrategy);

    hostDaemonFacadeCtorStub = sinon.stub(remoting, 'HostDaemonFacade');
    mockHostDaemonFacade = new remoting.MockHostDaemonFacade();
    hostDaemonFacadeCtorStub.returns(mockHostDaemonFacade);
    generateUuidStub = sinon.stub(base, 'generateUuid');
    generateUuidStub.returns(FAKE_HOST_ID);
    getCredentialsFromAuthCodeSpy = sinon.spy(
        mockHostDaemonFacade, 'getCredentialsFromAuthCode');
    getPinHashSpy = sinon.spy(mockHostDaemonFacade, 'getPinHash');
    startDaemonSpy = sinon.spy(mockHostDaemonFacade, 'startDaemon');
    updateDaemonConfigSpy =
        sinon.spy(mockHostDaemonFacade, 'updateDaemonConfig');

    // Set up successful responses from mockHostDaemonFacade.
    // Individual tests override these values to create errors.
    mockHostDaemonFacade.features =
        [remoting.HostController.Feature.OAUTH_CLIENT];
    mockHostDaemonFacade.daemonVersion = FAKE_DAEMON_VERSION;
    mockHostDaemonFacade.hostName = FAKE_HOST_NAME;
    mockHostDaemonFacade.privateKey = FAKE_PRIVATE_KEY;
    mockHostDaemonFacade.publicKey = FAKE_PUBLIC_KEY;
    mockHostDaemonFacade.hostClientId = FAKE_HOST_CLIENT_ID;
    mockHostDaemonFacade.userEmail = FAKE_XMPP_LOGIN;
    mockHostDaemonFacade.refreshToken = FAKE_REFRESH_TOKEN;
    mockHostDaemonFacade.pinHashFunc = fakePinHashFunc;
    mockHostDaemonFacade.startDaemonResult =
        remoting.HostController.AsyncResult.OK;
    mockHostDaemonFacade.stopDaemonResult =
        remoting.HostController.AsyncResult.OK;
    mockHostDaemonFacade.daemonConfig = {
      host_id: FAKE_HOST_ID,
      xmpp_login: FAKE_XMPP_LOGIN
    };
    mockHostDaemonFacade.updateDaemonConfigResult =
        remoting.HostController.AsyncResult.OK;
    mockHostDaemonFacade.daemonState =
        remoting.HostController.State.STARTED;

    sinon.stub(remoting.identity, 'getEmail').returns(
        Promise.resolve(FAKE_USER_EMAIL));
    sinon.stub(remoting.oauth2, 'getRefreshToken').returns(
        FAKE_REFRESH_TOKEN);

    controller = new remoting.HostController();
  },

  afterEach: function() {
    controller = null;
    getCredentialsFromAuthCodeSpy.restore();
    generateUuidStub.restore();
    hostDaemonFacadeCtorStub.restore();
    signalStrategyCreateStub.restore();
    remoting.hostList = null;
    remoting.oauth2 = null;
    remoting.MockXhr.restore();
    chromeMocks.restore();
    remoting.identity = null;
  }
});

/**
 * @param {string} hostId
 * @param {string} pin
 * @return {string}
 */
function fakePinHashFunc(hostId, pin) {
  return '<FAKE_PIN:' + hostId + ':' + pin + '>';
}

/**
 * Install an HTTP response for requests to the registry.
 * @param {QUnit.Assert} assert
 * @param {boolean} withAuthCode
 */
function queueRegistryResponse(assert, withAuthCode) {
  var responseJson = {
      data: {
        authorizationCode: FAKE_AUTH_CODE
      }
  };
  if (!withAuthCode) {
    delete responseJson.data.authorizationCode;
  }

  remoting.MockXhr.setResponseFor(
      'POST', 'DIRECTORY_API_BASE_URL/@me/hosts',
      function(/** remoting.MockXhr */ xhr) {
        assert.deepEqual(
            xhr.params.jsonContent,
            { data: {
              hostId: FAKE_HOST_ID,
              hostName: FAKE_HOST_NAME,
              publicKey: FAKE_PUBLIC_KEY
            } });
        xhr.setTextResponse(200, JSON.stringify(responseJson));
      });
}

/**
 * @param {boolean} successful
 */
function stubSignalStrategyConnect(successful) {
  sinon.stub(mockSignalStrategy, 'connect', function() {
    Promise.resolve().then(function() {
      mockSignalStrategy.setStateForTesting(
          successful ?
            remoting.SignalStrategy.State.CONNECTED :
            remoting.SignalStrategy.State.FAILED);
    });
  });
}

// Check that hasFeature returns false for missing features.
QUnit.test('hasFeature returns false', function(assert) {
  return new Promise(function(resolve, reject) {
    controller.hasFeature(
        remoting.HostController.Feature.PAIRING_REGISTRY,
        resolve);
  }).then(function(/** boolean */ result) {
    assert.equal(result, false);
  });
});

// Check that hasFeature returns true for supported features.
QUnit.test('hasFeature returns true', function(assert) {
  return new Promise(function(resolve, reject) {
    controller.hasFeature(
        remoting.HostController.Feature.OAUTH_CLIENT,
        resolve);
  }).then(function(/** boolean */ result) {
    assert.equal(result, true);
  });
});

// Check what happens when the HostDaemonFacade's getHostName method
// fails.
QUnit.test('start with getHostName failure', function(assert) {
  mockHostDaemonFacade.hostName = null;
  return new Promise(function(resolve, reject) {
    controller.start(FAKE_HOST_PIN, true, function() {
      reject('test failed');
    }, function(/** remoting.Error */ e) {
      assert.equal(e.getDetail(), 'getHostName');
      assert.equal(e.getTag(), remoting.Error.Tag.UNEXPECTED);
      assert.equal(unregisterHostByIdSpy.callCount, 0);
      assert.equal(onLocalHostStartedSpy.callCount, 0);
      assert.equal(startDaemonSpy.callCount, 0);
      resolve(null);
    });
  });
});

// Check what happens when the HostDaemonFacade's generateKeyPair
// method fails.
QUnit.test('start with generateKeyPair failure', function(assert) {
  mockHostDaemonFacade.publicKey = null;
  mockHostDaemonFacade.privateKey = null;
  return new Promise(function(resolve, reject) {
    controller.start(FAKE_HOST_PIN, true, function() {
      reject('test failed');
    }, function(/** remoting.Error */ e) {
      assert.equal(e.getDetail(), 'generateKeyPair');
      assert.equal(e.getTag(), remoting.Error.Tag.UNEXPECTED);
      assert.equal(unregisterHostByIdSpy.callCount, 0);
      assert.equal(onLocalHostStartedSpy.callCount, 0);
      assert.equal(startDaemonSpy.callCount, 0);
      resolve(null);
    });
  });
});

// Check what happens when the HostDaemonFacade's getHostClientId
// method fails.
QUnit.test('start with getHostClientId failure', function(assert) {
  mockHostDaemonFacade.hostClientId = null;
  return new Promise(function(resolve, reject) {
    controller.start(FAKE_HOST_PIN, true, function() {
      reject('test failed');
    }, function(/** remoting.Error */ e) {
      assert.equal(e.getDetail(), 'getHostClientId');
      assert.equal(e.getTag(), remoting.Error.Tag.UNEXPECTED);
      assert.equal(unregisterHostByIdSpy.callCount, 0);
      assert.equal(onLocalHostStartedSpy.callCount, 0);
      assert.equal(startDaemonSpy.callCount, 0);
      resolve(null);
    });
  });
});

// Check what happens when the registry returns an HTTP when we try to
// register a host.
QUnit.test('start with host registration failure', function(assert) {
  remoting.MockXhr.setEmptyResponseFor(
      'POST', 'DIRECTORY_API_BASE_URL/@me/hosts', 500);
  return new Promise(function(resolve, reject) {
    controller.start(FAKE_HOST_PIN, true, function() {
      reject('test failed');
    }, function(/** remoting.Error */ e) {
      assert.equal(e.getTag(), remoting.Error.Tag.REGISTRATION_FAILED);
      assert.equal(unregisterHostByIdSpy.callCount, 0);
      assert.equal(onLocalHostStartedSpy.callCount, 0);
      assert.equal(startDaemonSpy.callCount, 0);
      resolve(null);
    });
  });
});

// Check what happens when the HostDaemonFacade's
// getCredentialsFromAuthCode method fails.
QUnit.test('start with getCredentialsFromAuthCode failure', function(assert) {
  mockHostDaemonFacade.useEmail = null;
  mockHostDaemonFacade.refreshToken = null;
  queueRegistryResponse(assert, true);
  return new Promise(function(resolve, reject) {
    controller.start(FAKE_HOST_PIN, true, function() {
      reject('test failed');
    }, function(/** remoting.Error */ e) {
      assert.equal(e.getDetail(), 'getCredentialsFromAuthCode');
      assert.equal(e.getTag(), remoting.Error.Tag.UNEXPECTED);
      assert.equal(getCredentialsFromAuthCodeSpy.callCount, 1);
      assert.equal(unregisterHostByIdSpy.callCount, 0);
      assert.equal(onLocalHostStartedSpy.callCount, 0);
      assert.equal(startDaemonSpy.callCount, 0);
      resolve(null);
    });
  });
});

// Check what happens when the HostDaemonFacade's getPinHash method
// fails, and verify that getPinHash is called when the registry
// does't return an auth code.
QUnit.test('start with getRefreshToken+getPinHash failure', function(assert) {
  mockHostDaemonFacade.pinHashFunc = null;
  queueRegistryResponse(assert, false);
  return new Promise(function(resolve, reject) {
    controller.start(FAKE_HOST_PIN, true, function() {
      reject('test failed');
    }, function(/** remoting.Error */ e) {
      assert.equal(e.getDetail(), 'getPinHash');
      assert.equal(e.getTag(), remoting.Error.Tag.UNEXPECTED);
      assert.equal(unregisterHostByIdSpy.callCount, 0);
      assert.equal(onLocalHostStartedSpy.callCount, 0);
      assert.equal(startDaemonSpy.callCount, 0);
      resolve(null);
    });
  });
});

// Check what happens when the SignalStrategy fails to connect.
QUnit.test('start with signalStrategy failure', function(assert) {
  queueRegistryResponse(assert, true);
  stubSignalStrategyConnect(false);
  return new Promise(function(resolve, reject) {
    controller.start(FAKE_HOST_PIN, true, function() {
      reject('test failed');
    }, function(/** remoting.Error */ e) {
      assert.equal(e.getDetail(), 'setStateForTesting');
      assert.equal(e.getTag(), remoting.Error.Tag.UNEXPECTED);
      assert.equal(unregisterHostByIdSpy.callCount, 1);
      resolve(null);
    });
  });
});

// Check what happens when the HostDaemonFacade's startDaemon method
// fails and calls its onError argument.
// TODO(jrw): Should startDaemon even have an onError callback?
QUnit.test('start with startDaemon failure', function(assert) {
  queueRegistryResponse(assert, true);
  stubSignalStrategyConnect(true);
  mockHostDaemonFacade.startDaemonResult = null;
  return new Promise(function(resolve, reject) {
    controller.start(FAKE_HOST_PIN, true, function() {
      reject('test failed');
    }, function(/** remoting.Error */ e) {
      assert.equal(e.getDetail(), 'startDaemon');
      assert.equal(e.getTag(), remoting.Error.Tag.UNEXPECTED);
      assert.equal(unregisterHostByIdSpy.callCount, 1);
      assert.equal(unregisterHostByIdSpy.args[0][0], FAKE_HOST_ID);
      assert.equal(onLocalHostStartedSpy.callCount, 0);
      resolve(null);
    });
  });
});

// Check what happens when the HostDaemonFacade's startDaemon method
// calls is onDone method with a CANCELLED error code.
QUnit.test('start with startDaemon cancelled', function(assert) {
  queueRegistryResponse(assert, true);
  stubSignalStrategyConnect(true);
  mockHostDaemonFacade.startDaemonResult =
      remoting.HostController.AsyncResult.CANCELLED;
  return new Promise(function(resolve, reject) {
    controller.start(FAKE_HOST_PIN, true, function() {
      reject('test failed');
    }, function(/** remoting.Error */ e) {
      assert.equal(e.getTag(), remoting.Error.Tag.CANCELLED);
      assert.equal(unregisterHostByIdSpy.callCount, 1);
      assert.equal(unregisterHostByIdSpy.args[0][0], FAKE_HOST_ID);
      assert.equal(onLocalHostStartedSpy.callCount, 0);
      resolve(null);
    });
  });
});

// Check what happens when the HostDaemonFacade's startDaemon method
// calls is onDone method with an async error code.
QUnit.test('start with startDaemon returning failure code', function(assert) {
  queueRegistryResponse(assert, true);
  stubSignalStrategyConnect(true);
  mockHostDaemonFacade.startDaemonResult =
      remoting.HostController.AsyncResult.FAILED;
  return new Promise(function(resolve, reject) {
    controller.start(FAKE_HOST_PIN, true, function() {
      reject('test failed');
    }, function(/** remoting.Error */ e) {
      assert.equal(e.getTag(), remoting.Error.Tag.UNEXPECTED);
      assert.equal(unregisterHostByIdSpy.callCount, 1);
      assert.equal(onLocalHostStartedSpy.callCount, 0);
      resolve(null);
    });
  });
});

// Check what happens when the entire host registration process
// succeeds.
[false, true].forEach(function(/** boolean */ consent) {
  QUnit.test('start succeeds(1) with consent=' + consent, function(assert) {
    /** @const */
    var fakePinHash = fakePinHashFunc(FAKE_HOST_ID, FAKE_HOST_PIN);
    queueRegistryResponse(assert, true);
    stubSignalStrategyConnect(true);
    return new Promise(function(resolve, reject) {
      controller.start(FAKE_HOST_PIN, consent, function() {
        assert.equal(getCredentialsFromAuthCodeSpy.callCount, 1);
        assert.deepEqual(
            getCredentialsFromAuthCodeSpy.args[0][0],
            FAKE_AUTH_CODE);
        assert.equal(getPinHashSpy.callCount, 1);
        assert.deepEqual(
            getPinHashSpy.args[0].slice(0, 2),
            [FAKE_HOST_ID, FAKE_HOST_PIN]);
        assert.equal(unregisterHostByIdSpy.callCount, 0);
        assert.equal(onLocalHostStartedSpy.callCount, 1);
        assert.equal(startDaemonSpy.callCount, 1);
        assert.deepEqual(
            startDaemonSpy.args[0].slice(0, 2),
            [{
              xmpp_login: FAKE_XMPP_LOGIN,
              oauth_refresh_token: FAKE_REFRESH_TOKEN,
              host_owner: FAKE_CLIENT_JID.toLowerCase(),
              host_owner_email: FAKE_USER_EMAIL,
              host_id: FAKE_HOST_ID,
              host_name: FAKE_HOST_NAME,
              host_secret_hash: fakePinHash,
              private_key: FAKE_PRIVATE_KEY
            }, consent]);
        resolve(null);
      }, reject);
    });
  });
});

// Check alternative host registration without a registry-supplied
// auth code.
[false, true].forEach(function(/** boolean */ consent) {
  QUnit.test('start succeeds(2) with consent=' + consent, function(assert) {
    /** @const */
    var fakePinHash = fakePinHashFunc(FAKE_HOST_ID, FAKE_HOST_PIN);
    queueRegistryResponse(assert, false);
    stubSignalStrategyConnect(true);
    return new Promise(function(resolve, reject) {
      controller.start(FAKE_HOST_PIN, consent, function() {
        assert.equal(getPinHashSpy.callCount, 1);
        assert.deepEqual(
            getPinHashSpy.args[0].slice(0, 2),
            [FAKE_HOST_ID, FAKE_HOST_PIN]);
        assert.equal(unregisterHostByIdSpy.callCount, 0);
        assert.equal(onLocalHostStartedSpy.callCount, 1);
        assert.equal(startDaemonSpy.callCount, 1);
        assert.deepEqual(
            startDaemonSpy.args[0].slice(0, 2),
            [{
              xmpp_login: FAKE_USER_EMAIL,
              oauth_refresh_token: FAKE_REFRESH_TOKEN,
              host_id: FAKE_HOST_ID,
              host_name: FAKE_HOST_NAME,
              host_secret_hash: fakePinHash,
              private_key: FAKE_PRIVATE_KEY
            }, consent]);
        resolve(null);
      }, reject);
    });
  });
});

// Check alternative host registration without a registry-supplied
// auth code.
[false, true].forEach(function(/** boolean */ consent) {
  QUnit.test('start succeeds(2) with consent=' + consent, function(assert) {
    /** @const */
    var fakePinHash = fakePinHashFunc(FAKE_HOST_ID, FAKE_HOST_PIN);
    queueRegistryResponse(assert, false);
    stubSignalStrategyConnect(true);
    return new Promise(function(resolve, reject) {
      controller.start(FAKE_HOST_PIN, consent, function() {
        assert.equal(getCredentialsFromAuthCodeSpy.callCount, 0);
        assert.equal(getPinHashSpy.callCount, 1);
        assert.deepEqual(
            getPinHashSpy.args[0].slice(0, 2),
            [FAKE_HOST_ID, FAKE_HOST_PIN]);
        assert.equal(unregisterHostByIdSpy.callCount, 0);
        assert.equal(onLocalHostStartedSpy.callCount, 1);
        assert.equal(startDaemonSpy.callCount, 1);
        assert.deepEqual(
            startDaemonSpy.args[0].slice(0, 2),
            [{
              xmpp_login: FAKE_USER_EMAIL,
              oauth_refresh_token: FAKE_REFRESH_TOKEN,
              host_id: FAKE_HOST_ID,
              host_name: FAKE_HOST_NAME,
              host_secret_hash: fakePinHash,
              private_key: FAKE_PRIVATE_KEY
            }, consent]);
        resolve(null);
      }, reject);
    });
  });
});

// Check what happens when stopDaemon calls onError.
// TODO(jrw): Should stopDaemon even have an onError callback?
QUnit.test('stop with stopDaemon failure', function(assert) {
  mockHostDaemonFacade.stopDaemonResult = null;
  return new Promise(function(resolve, reject) {
    controller.stop(function() {
      reject('test failed');
    }, function(/** remoting.Error */ e) {
      assert.equal(e.getDetail(), 'stopDaemon');
      // TODO(jrw): Is it really desirable to leave the host registered?
      assert.equal(unregisterHostByIdSpy.callCount, 0);
      resolve(null);
    });
  });
});

// Check what happens when stopDaemon returns FAILED.
QUnit.test('stop with stopDaemon cancelled', function(assert) {
  mockHostDaemonFacade.stopDaemonResult =
      remoting.HostController.AsyncResult.FAILED;
  return new Promise(function(resolve, reject) {
    controller.stop(function() {
      reject('test failed');
    }, function(/** remoting.Error */ e) {
      // TODO(jrw): Is it really desirable to leave the host registered?
      assert.equal(e.getTag(), remoting.Error.Tag.UNEXPECTED);
      assert.equal(unregisterHostByIdSpy.callCount, 0);
      resolve(null);
    });
  });
});

// Check what happens when stopDaemon returns CANCELLED.
QUnit.test('stop with stopDaemon cancelled', function(assert) {
  mockHostDaemonFacade.stopDaemonResult =
      remoting.HostController.AsyncResult.CANCELLED;
  return new Promise(function(resolve, reject) {
    controller.stop(function() {
      reject('test failed');
    }, function(/** remoting.Error */ e) {
      assert.equal(e.getTag(), remoting.Error.Tag.CANCELLED);
      assert.equal(unregisterHostByIdSpy.callCount, 0);
      resolve(null);
    });
  });
});

// Check what happens when stopDaemon succeeds.
QUnit.test('stop succeeds', function(assert) {
  sinon.stub(controller, 'getLocalHostId').callsArgWith(0, FAKE_HOST_ID);
  return new Promise(function(resolve, reject) {
    controller.stop(function() {
      assert.equal(unregisterHostByIdSpy.callCount, 1);
      assert.equal(unregisterHostByIdSpy.args[0][0], FAKE_HOST_ID);
      resolve(null);
    }, reject);
  });
});

// Check what happens when the host reports an invalid config.
QUnit.test('updatePin where config is invalid', function(assert) {
  mockHostDaemonFacade.daemonConfig = {};
  return new Promise(function(resolve, reject) {
    controller.updatePin(FAKE_NEW_HOST_PIN, function() {
      reject('test failed');
    }, function(/** remoting.Error */ e) {
      assert.equal(e.getTag(), remoting.Error.Tag.UNEXPECTED);
      resolve(null);
    });
  });
});

// Check what happens when getDaemonConfig calls onError.
QUnit.test('updatePin where getDaemonConfig fails', function(assert) {
  mockHostDaemonFacade.daemonConfig = null;
  return new Promise(function(resolve, reject) {
    controller.updatePin(FAKE_NEW_HOST_PIN, function() {
      reject('test failed');
    }, function(/** remoting.Error */ e) {
      assert.equal(e.getDetail(), 'getDaemonConfig');
      assert.equal(e.getTag(), remoting.Error.Tag.UNEXPECTED);
      resolve(null);
    });
  });
});

// Check what happens when updateDaemonConfig calls onError.
// TODO(jrw): Should updateDaemonConfig even have an onError callback?
QUnit.test('updatePin where updateDaemonConfig calls onError', function(
    assert) {
  mockHostDaemonFacade.updateDaemonConfigResult = null;
  return new Promise(function(resolve, reject) {
    controller.updatePin(FAKE_NEW_HOST_PIN, function() {
      reject('test failed');
    }, function(/** remoting.Error */ e) {
      assert.equal(e.getDetail(), 'updateDaemonConfig');
      assert.equal(e.getTag(), remoting.Error.Tag.UNEXPECTED);
      resolve(null);
    });
  });
});

// Check what happens when updateDaemonConfig returns CANCELLED.
QUnit.test('updatePin where updateDaemonConfig is cancelled', function(
    assert) {
  mockHostDaemonFacade.updateDaemonConfigResult =
      remoting.HostController.AsyncResult.CANCELLED;
  return new Promise(function(resolve, reject) {
    controller.updatePin(FAKE_NEW_HOST_PIN, function() {
      reject('test failed');
    }, function(/** remoting.Error */ e) {
      assert.equal(e.getTag(), remoting.Error.Tag.CANCELLED);
      resolve(null);
    });
  });
});

// Check what happens when updateDaemonConfig returns FAILED.
QUnit.test('updatePin where updateDaemonConfig is returns failure', function(
    assert) {
  mockHostDaemonFacade.updateDaemonConfigResult =
      remoting.HostController.AsyncResult.FAILED;
  return new Promise(function(resolve, reject) {
    controller.updatePin(FAKE_NEW_HOST_PIN, function() {
      reject('test failed');
    }, function(/** remoting.Error */ e) {
      assert.equal(e.getTag(), remoting.Error.Tag.UNEXPECTED);
      resolve(null);
    });
  });
});

// Check what happens when updatePin succeeds.
QUnit.test('updatePin succeeds', function(assert) {
  /** @const */
  var fakePinHash = fakePinHashFunc(FAKE_HOST_ID, FAKE_NEW_HOST_PIN);
  return new Promise(function(resolve, reject) {
    controller.updatePin(FAKE_NEW_HOST_PIN, function() {
      assert.equal(getPinHashSpy.callCount, 1);
      assert.equal(getPinHashSpy.args[0][0], FAKE_HOST_ID);
      assert.equal(getPinHashSpy.args[0][1], FAKE_NEW_HOST_PIN);
      assert.equal(updateDaemonConfigSpy.callCount, 1);
      assert.deepEqual(
          updateDaemonConfigSpy.args[0][0], {
            host_secret_hash: fakePinHash
          });
      resolve(null);
    }, reject);
  });
});

// Check what happens when getLocalHostState fails.
QUnit.test('getLocalHostState with error', function(assert) {
  mockHostDaemonFacade.daemonState = null;
  return new Promise(function(resolve, reject) {
    controller.getLocalHostState(function(
        /** remoting.HostController.State */ state) {
      assert.equal(state, remoting.HostController.State.UNKNOWN);
      resolve(null);
    });
  });
});

// Check what happens when getLocalHostState reports no plugin.
QUnit.test('getLocalHostState with no plugin', function(assert) {
  sinon.stub(mockHostDaemonFacade, 'getDaemonState').returns(
      Promise.reject(new remoting.Error(remoting.Error.Tag.MISSING_PLUGIN)));
  return new Promise(function(resolve, reject) {
    controller.getLocalHostState(function(
        /** remoting.HostController.State */ state) {
      assert.equal(state, remoting.HostController.State.NOT_INSTALLED);
      resolve(null);
    });
  });
});

// Check what happens when getLocalHostState succeeds.
QUnit.test('getLocalHostState succeeds', function(assert) {
  return new Promise(function(resolve, reject) {
    controller.getLocalHostState(function(
        /** remoting.HostController.State */ state) {
      assert.equal(state, remoting.HostController.State.STARTED);
      resolve(null);
    });
  });
});

// Check what happens to getLocalHostId when getDaemonConfig
// returns an invalid config.
QUnit.test('getLocalHostId with invalid daemon config', function(assert) {
  mockHostDaemonFacade.daemonConfig = {};
  return new Promise(function(resolve, reject) {
    controller.getLocalHostId(function(/** ?string */ id) {
      assert.strictEqual(id, null);
      resolve(null);
    });
  });
});

// Check what happens to getLocalHostId when getDaemonConfig fails.
QUnit.test('getLocalHostId with getDaemonConfig failure', function(assert) {
  mockHostDaemonFacade.daemonConfig = null;
  return new Promise(function(resolve, reject) {
    controller.getLocalHostId(function(/** ?string */ id) {
      assert.strictEqual(id, null);
      resolve(null);
    });
  });
});

// Check what happens when getLocalHostId succeeds.
QUnit.test('getLocalHostId succeeds', function(assert) {
  return new Promise(function(resolve, reject) {
    controller.getLocalHostId(function(/** ?string */ id) {
      assert.equal(id, FAKE_HOST_ID);
      resolve(null);
    });
  });
});

// Tests omitted for getPairedClients, deletePairedClient, and
// clearPairedClients because they simply call through to
// HostDaemonFacade.

})();
