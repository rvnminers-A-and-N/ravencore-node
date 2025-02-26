'use strict';

/* jshint sub: true */

var path = require('path');
var EventEmitter = require('events').EventEmitter;
var should = require('chai').should();
var crypto = require('crypto');
var meowcoincore = require('meowcoincore-lib');
var _ = meowcoincore.deps._;
var sinon = require('sinon');
var proxyquire = require('proxyquire');
var fs = require('fs');
var sinon = require('sinon');

var index = require('../../lib');
var log = index.log;
var errors = index.errors;

var Transaction = meowcoincore.Transaction;
var readFileSync = sinon.stub().returns(fs.readFileSync(path.resolve(__dirname, '../data/meowcoin.conf')));
var MeowcoinService = proxyquire('../../lib/services/meowcoind', {
  fs: {
    readFileSync: readFileSync
  }
});
var defaultMeowcoinConf = fs.readFileSync(path.resolve(__dirname, '../data/default.meowcoin.conf'), 'utf8');

describe('Meowcoin Service', function() {
  var txhex = '01000000010000000000000000000000000000000000000000000000000000000000000000ffffffff0704ffff001d0104ffffffff0100f2052a0100000043410496b538e853519c726a2c91e61ec11600ae1390813a627c66fb8be7947be63c52da7589379515d4e0a604f8141781e62294721166bf621e73a82cbf2342c858eeac00000000';

  var baseConfig = {
    node: {
      network: meowcoincore.Networks.testnet
    },
    spawn: {
      datadir: 'testdir',
      exec: 'testpath'
    }
  };

  describe('@constructor', function() {
    it('will create an instance', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      should.exist(meowcoind);
    });
    it('will create an instance without `new`', function() {
      var meowcoind = MeowcoinService(baseConfig);
      should.exist(meowcoind);
    });
    it('will init caches', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      should.exist(meowcoind.utxosCache);
      should.exist(meowcoind.txidsCache);
      should.exist(meowcoind.balanceCache);
      should.exist(meowcoind.summaryCache);
      should.exist(meowcoind.transactionDetailedCache);

      should.exist(meowcoind.transactionCache);
      should.exist(meowcoind.rawTransactionCache);
      should.exist(meowcoind.blockCache);
      should.exist(meowcoind.rawBlockCache);
      should.exist(meowcoind.blockHeaderCache);
      should.exist(meowcoind.zmqKnownTransactions);
      should.exist(meowcoind.zmqKnownBlocks);
      should.exist(meowcoind.lastTip);
      should.exist(meowcoind.lastTipTimeout);
    });
    it('will init clients', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.nodes.should.deep.equal([]);
      meowcoind.nodesIndex.should.equal(0);
      meowcoind.nodes.push({client: sinon.stub()});
      should.exist(meowcoind.client);
    });
    it('will set subscriptions', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.subscriptions.should.deep.equal({
        address: {},
		balance: {},
        rawtransaction: [],
        hashblock: []
      });
    });
  });

  describe('#_initDefaults', function() {
    it('will set transaction concurrency', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind._initDefaults({transactionConcurrency: 10});
      meowcoind.transactionConcurrency.should.equal(10);
      meowcoind._initDefaults({});
      meowcoind.transactionConcurrency.should.equal(5);
    });
  });

  describe('@dependencies', function() {
    it('will have no dependencies', function() {
      MeowcoinService.dependencies.should.deep.equal([]);
    });
  });

  describe('#getAPIMethods', function() {
    it('will return spec', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var methods = meowcoind.getAPIMethods();
      should.exist(methods);
      methods.length.should.equal(28);
    });
  });

  describe('#getPublishEvents', function() {
    it('will return spec', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var events = meowcoind.getPublishEvents();
      should.exist(events);
      events.length.should.equal(4);
      events[0].name.should.equal('meowcoind/rawtransaction');
      events[0].scope.should.equal(meowcoind);
      events[0].subscribe.should.be.a('function');
      events[0].unsubscribe.should.be.a('function');
      events[1].name.should.equal('meowcoind/hashblock');
      events[1].scope.should.equal(meowcoind);
      events[1].subscribe.should.be.a('function');
      events[1].unsubscribe.should.be.a('function');
      events[2].name.should.equal('meowcoind/addresstxid');
      events[2].scope.should.equal(meowcoind);
      events[2].subscribe.should.be.a('function');
      events[2].unsubscribe.should.be.a('function');
      events[3].name.should.equal('meowcoind/addressbalance');
      events[3].scope.should.equal(meowcoind);
      events[3].subscribe.should.be.a('function');
      events[3].unsubscribe.should.be.a('function');
    });
    it('will call subscribe/unsubscribe with correct args', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.subscribe = sinon.stub();
      meowcoind.unsubscribe = sinon.stub();
      var events = meowcoind.getPublishEvents();

      events[0].subscribe('test');
      meowcoind.subscribe.args[0][0].should.equal('rawtransaction');
      meowcoind.subscribe.args[0][1].should.equal('test');

      events[0].unsubscribe('test');
      meowcoind.unsubscribe.args[0][0].should.equal('rawtransaction');
      meowcoind.unsubscribe.args[0][1].should.equal('test');

      events[1].subscribe('test');
      meowcoind.subscribe.args[1][0].should.equal('hashblock');
      meowcoind.subscribe.args[1][1].should.equal('test');

      events[1].unsubscribe('test');
      meowcoind.unsubscribe.args[1][0].should.equal('hashblock');
      meowcoind.unsubscribe.args[1][1].should.equal('test');
    });
  });

  describe('#subscribe', function() {
    var sandbox = sinon.sandbox.create();
    beforeEach(function() {
      sandbox.stub(log, 'info');
    });
    afterEach(function() {
      sandbox.restore();
    });
    it('will push to subscriptions', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var emitter = {};
      meowcoind.subscribe('hashblock', emitter);
      meowcoind.subscriptions.hashblock[0].should.equal(emitter);

      var emitter2 = {};
      meowcoind.subscribe('rawtransaction', emitter2);
      meowcoind.subscriptions.rawtransaction[0].should.equal(emitter2);
    });
  });

  describe('#unsubscribe', function() {
    var sandbox = sinon.sandbox.create();
    beforeEach(function() {
      sandbox.stub(log, 'info');
    });
    afterEach(function() {
      sandbox.restore();
    });
    it('will remove item from subscriptions', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var emitter1 = {};
      var emitter2 = {};
      var emitter3 = {};
      var emitter4 = {};
      var emitter5 = {};
      meowcoind.subscribe('hashblock', emitter1);
      meowcoind.subscribe('hashblock', emitter2);
      meowcoind.subscribe('hashblock', emitter3);
      meowcoind.subscribe('hashblock', emitter4);
      meowcoind.subscribe('hashblock', emitter5);
      meowcoind.subscriptions.hashblock.length.should.equal(5);

      meowcoind.unsubscribe('hashblock', emitter3);
      meowcoind.subscriptions.hashblock.length.should.equal(4);
      meowcoind.subscriptions.hashblock[0].should.equal(emitter1);
      meowcoind.subscriptions.hashblock[1].should.equal(emitter2);
      meowcoind.subscriptions.hashblock[2].should.equal(emitter4);
      meowcoind.subscriptions.hashblock[3].should.equal(emitter5);
    });
    it('will not remove item an already unsubscribed item', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var emitter1 = {};
      var emitter3 = {};
      meowcoind.subscriptions.hashblock= [emitter1];
      meowcoind.unsubscribe('hashblock', emitter3);
      meowcoind.subscriptions.hashblock.length.should.equal(1);
      meowcoind.subscriptions.hashblock[0].should.equal(emitter1);
    });
  });

  describe('#subscribeAddress', function() {
    var sandbox = sinon.sandbox.create();
    beforeEach(function() {
      sandbox.stub(log, 'info');
    });
    afterEach(function() {
      sandbox.restore();
    });
    it('will not an invalid address', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var emitter = new EventEmitter();
      meowcoind.subscribeAddress(emitter, ['invalidaddress']);
      should.not.exist(meowcoind.subscriptions.address['invalidaddress']);
    });
    it('will add a valid address', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var emitter = new EventEmitter();
      meowcoind.subscribeAddress(emitter, ['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br']);
      should.exist(meowcoind.subscriptions.address['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br']);
    });
    it('will handle multiple address subscribers', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var emitter1 = new EventEmitter();
      var emitter2 = new EventEmitter();
      meowcoind.subscribeAddress(emitter1, ['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br']);
      meowcoind.subscribeAddress(emitter2, ['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br']);
      should.exist(meowcoind.subscriptions.address['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br']);
      meowcoind.subscriptions.address['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br'].length.should.equal(2);
    });
    it('will not add the same emitter twice', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var emitter1 = new EventEmitter();
      meowcoind.subscribeAddress(emitter1, ['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br']);
      meowcoind.subscribeAddress(emitter1, ['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br']);
      should.exist(meowcoind.subscriptions.address['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br']);
      meowcoind.subscriptions.address['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br'].length.should.equal(1);
    });
  });

  describe('#unsubscribeAddress', function() {
    var sandbox = sinon.sandbox.create();
    beforeEach(function() {
      sandbox.stub(log, 'info');
    });
    afterEach(function() {
      sandbox.restore();
    });
    it('it will remove a subscription', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var emitter1 = new EventEmitter();
      var emitter2 = new EventEmitter();
      meowcoind.subscribeAddress(emitter1, ['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br']);
      meowcoind.subscribeAddress(emitter2, ['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br']);
      should.exist(meowcoind.subscriptions.address['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br']);
      meowcoind.subscriptions.address['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br'].length.should.equal(2);
      meowcoind.unsubscribeAddress(emitter1, ['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br']);
      meowcoind.subscriptions.address['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br'].length.should.equal(1);
    });
    it('will unsubscribe subscriptions for an emitter', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var emitter1 = new EventEmitter();
      var emitter2 = new EventEmitter();
      meowcoind.subscriptions.address['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br'] = [emitter1, emitter2];
      meowcoind.unsubscribeAddress(emitter1);
      meowcoind.subscriptions.address['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br'].length.should.equal(1);
    });
    it('will NOT unsubscribe subscription with missing address', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var emitter1 = new EventEmitter();
      var emitter2 = new EventEmitter();
      meowcoind.subscriptions.address['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br'] = [emitter1, emitter2];
      meowcoind.unsubscribeAddress(emitter1, ['RJYZeWxr1Ly8YgcvJU1qD5MR9jUtk14HkN']);
      meowcoind.subscriptions.address['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br'].length.should.equal(2);
    });
    it('will NOT unsubscribe subscription with missing emitter', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var emitter1 = new EventEmitter();
      var emitter2 = new EventEmitter();
      meowcoind.subscriptions.address['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br'] = [emitter2];
      meowcoind.unsubscribeAddress(emitter1, ['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br']);
      meowcoind.subscriptions.address['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br'].length.should.equal(1);
      meowcoind.subscriptions.address['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br'][0].should.equal(emitter2);
    });
    it('will remove empty addresses', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var emitter1 = new EventEmitter();
      var emitter2 = new EventEmitter();
      meowcoind.subscriptions.address['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br'] = [emitter1, emitter2];
      meowcoind.unsubscribeAddress(emitter1, ['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br']);
      meowcoind.unsubscribeAddress(emitter2, ['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br']);
      should.not.exist(meowcoind.subscriptions.address['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br']);
    });
    it('will unsubscribe emitter for all addresses', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var emitter1 = new EventEmitter();
      var emitter2 = new EventEmitter();
      meowcoind.subscriptions.address['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br'] = [emitter1, emitter2];
      meowcoind.subscriptions.address['RJYZeWxr1Ly8YgcvJU1qD5MR9jUtk14HkN'] = [emitter1, emitter2];
      sinon.spy(meowcoind, 'unsubscribeAddressAll');
      meowcoind.unsubscribeAddress(emitter1);
      meowcoind.unsubscribeAddressAll.callCount.should.equal(1);
      meowcoind.subscriptions.address['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br'].length.should.equal(1);
      meowcoind.subscriptions.address['RJYZeWxr1Ly8YgcvJU1qD5MR9jUtk14HkN'].length.should.equal(1);
    });
  });

  describe('#unsubscribeAddressAll', function() {
    var sandbox = sinon.sandbox.create();
    beforeEach(function() {
      sandbox.stub(log, 'info');
    });
    afterEach(function() {
      sandbox.restore();
    });
    it('will unsubscribe emitter for all addresses', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var emitter1 = new EventEmitter();
      var emitter2 = new EventEmitter();
      meowcoind.subscriptions.address['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br'] = [emitter1, emitter2];
      meowcoind.subscriptions.address['RJYZeWxr1Ly8YgcvJU1qD5MR9jUtk14HkN'] = [emitter1, emitter2];
      meowcoind.subscriptions.address['mgY65WSfEmsyYaYPQaXhmXMeBhwp4EcsQW'] = [emitter2];
      meowcoind.subscriptions.address['rAfsiNFiHsvDwEA1JsaE9Qmad5CgPVbELh'] = [emitter1];
      meowcoind.unsubscribeAddress(emitter1);
      meowcoind.subscriptions.address['2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br'].length.should.equal(1);
      meowcoind.subscriptions.address['RJYZeWxr1Ly8YgcvJU1qD5MR9jUtk14HkN'].length.should.equal(1);
      meowcoind.subscriptions.address['mgY65WSfEmsyYaYPQaXhmXMeBhwp4EcsQW'].length.should.equal(1);
      should.not.exist(meowcoind.subscriptions.address['rAfsiNFiHsvDwEA1JsaE9Qmad5CgPVbELh']);
    });
  });

  describe('#_getDefaultConfig', function() {
    it('will generate config file from defaults', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var config = meowcoind._getDefaultConfig();
      config.should.equal(defaultMeowcoinConf);
    });
  });

  describe('#_loadSpawnConfiguration', function() {
    var sandbox = sinon.sandbox.create();
    beforeEach(function() {
      sandbox.stub(log, 'info');
    });
    afterEach(function() {
      sandbox.restore();
    });
    it('will parse a meowcoin.conf file', function() {
      var TestMeowcoin = proxyquire('../../lib/services/meowcoind', {
        fs: {
          readFileSync: readFileSync,
          existsSync: sinon.stub().returns(true),
          writeFileSync: sinon.stub()
        },
        mkdirp: {
          sync: sinon.stub()
        }
      });
      var meowcoind = new TestMeowcoin(baseConfig);
      meowcoind.options.spawn.datadir = '/tmp/.meowcoin';
      var node = {};
      meowcoind._loadSpawnConfiguration(node);
      should.exist(meowcoind.spawn.config);
      meowcoind.spawn.config.should.deep.equal({
        addressindex: 1,
        checkblocks: 144,
        dbcache: 8192,
        maxuploadtarget: 1024,
        port: 20000,
        rpcport: 50001,
        rpcallowip: '127.0.0.1',
        rpcuser: 'meowweb',
        rpcpassword: 'MEWC_web01',
        server: 1,
        spentindex: 1,
        timestampindex: 1,
        txindex: 1,
        upnp: 0,
        whitelist: '127.0.0.1',
        zmqpubhashblock: 'tcp://127.0.0.1:28332',
        zmqpubrawtx: 'tcp://127.0.0.1:28332'
      });
    });
    it('will expand relative datadir to absolute path', function() {
      var TestMeowcoin = proxyquire('../../lib/services/meowcoind', {
        fs: {
          readFileSync: readFileSync,
          existsSync: sinon.stub().returns(true),
          writeFileSync: sinon.stub()
        },
        mkdirp: {
          sync: sinon.stub()
        }
      });
      var config = {
        node: {
          network: meowcoincore.Networks.testnet,
          configPath: '/tmp/.meowcoincore/meowcoincore-node.json'
        },
        spawn: {
          datadir: './data',
          exec: 'testpath'
        }
      };
      var meowcoind = new TestMeowcoin(config);
      meowcoind.options.spawn.datadir = './data';
      var node = {};
      meowcoind._loadSpawnConfiguration(node);
      meowcoind.options.spawn.datadir.should.equal('/tmp/.meowcoincore/data');
    });
    it('should throw an exception if txindex isn\'t enabled in the configuration', function() {
      var TestMeowcoin = proxyquire('../../lib/services/meowcoind', {
        fs: {
          readFileSync: sinon.stub().returns(fs.readFileSync(__dirname + '/../data/badmeowcoin.conf')),
          existsSync: sinon.stub().returns(true),
        },
        mkdirp: {
          sync: sinon.stub()
        }
      });
      var meowcoind = new TestMeowcoin(baseConfig);
      (function() {
        meowcoind._loadSpawnConfiguration({datadir: './test'});
      }).should.throw(meowcoincore.errors.InvalidState);
    });
    it('should NOT set https options if node https options are set', function() {
      var writeFileSync = function(path, config) {
        config.should.equal(defaultMeowcoinConf);
      };
      var TestMeowcoin = proxyquire('../../lib/services/meowcoind', {
        fs: {
          writeFileSync: writeFileSync,
          readFileSync: readFileSync,
          existsSync: sinon.stub().returns(false)
        },
        mkdirp: {
          sync: sinon.stub()
        }
      });
      var config = {
        node: {
          network: {
            name: 'regtest'
          },
          https: true,
          httpsOptions: {
            key: 'key.pem',
            cert: 'cert.pem'
          }
        },
        spawn: {
          datadir: 'testdir',
          exec: 'testexec'
        }
      };
      var meowcoind = new TestMeowcoin(config);
      meowcoind.options.spawn.datadir = '/tmp/.meowcoin';
      var node = {};
      meowcoind._loadSpawnConfiguration(node);
    });
  });

  describe('#_checkConfigIndexes', function() {
    var sandbox = sinon.sandbox.create();
    beforeEach(function() {
      sandbox.stub(log, 'warn');
    });
    afterEach(function() {
      sandbox.restore();
    });
    it('should warn the user if reindex is set to 1 in the meowcoin.conf file', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var config = {
        txindex: 1,
        addressindex: 1,
        spentindex: 1,
        server: 1,
        zmqpubrawtx: 1,
        zmqpubhashblock: 1,
        reindex: 1
      };
      var node = {};
      meowcoind._checkConfigIndexes(config, node);
      log.warn.callCount.should.equal(1);
      node._reindex.should.equal(true);
    });
    it('should warn if zmq port and hosts do not match', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var config = {
        txindex: 1,
        addressindex: 1,
        spentindex: 1,
        server: 1,
        zmqpubrawtx: 'tcp://127.0.0.1:28332',
        zmqpubhashblock: 'tcp://127.0.0.1:28331',
        reindex: 1
      };
      var node = {};
      (function() {
        meowcoind._checkConfigIndexes(config, node);
      }).should.throw('"zmqpubrawtx" and "zmqpubhashblock"');
    });
  });

  describe('#_resetCaches', function() {
    it('will reset LRU caches', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var keys = [];
      for (var i = 0; i < 10; i++) {
        keys.push(crypto.randomBytes(32));
        meowcoind.transactionDetailedCache.set(keys[i], {});
        meowcoind.utxosCache.set(keys[i], {});
        meowcoind.txidsCache.set(keys[i], {});
        meowcoind.balanceCache.set(keys[i], {});
        meowcoind.summaryCache.set(keys[i], {});
      }
      meowcoind._resetCaches();
      should.equal(meowcoind.transactionDetailedCache.get(keys[0]), undefined);
      should.equal(meowcoind.utxosCache.get(keys[0]), undefined);
      should.equal(meowcoind.txidsCache.get(keys[0]), undefined);
      should.equal(meowcoind.balanceCache.get(keys[0]), undefined);
      should.equal(meowcoind.summaryCache.get(keys[0]), undefined);
    });
  });

  describe('#_tryAllClients', function() {
    it('will retry for each node client', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.tryAllInterval = 1;
      meowcoind.nodes.push({
        client: {
          getInfo: sinon.stub().callsArgWith(0, new Error('test'))
        }
      });
      meowcoind.nodes.push({
        client: {
          getInfo: sinon.stub().callsArgWith(0, new Error('test'))
        }
      });
      meowcoind.nodes.push({
        client: {
          getInfo: sinon.stub().callsArg(0)
        }
      });
      meowcoind._tryAllClients(function(client, next) {
        client.getInfo(next);
      }, function(err) {
        if (err) {
          return done(err);
        }
        meowcoind.nodes[0].client.getInfo.callCount.should.equal(1);
        meowcoind.nodes[1].client.getInfo.callCount.should.equal(1);
        meowcoind.nodes[2].client.getInfo.callCount.should.equal(1);
        done();
      });
    });
    it('will start using the current node index (round-robin)', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.tryAllInterval = 1;
      meowcoind.nodes.push({
        client: {
          getInfo: sinon.stub().callsArgWith(0, new Error('2'))
        }
      });
      meowcoind.nodes.push({
        client: {
          getInfo: sinon.stub().callsArgWith(0, new Error('3'))
        }
      });
      meowcoind.nodes.push({
        client: {
          getInfo: sinon.stub().callsArgWith(0, new Error('1'))
        }
      });
      meowcoind.nodesIndex = 2;
      meowcoind._tryAllClients(function(client, next) {
        client.getInfo(next);
      }, function(err) {
        err.should.be.instanceOf(Error);
        err.message.should.equal('3');
        meowcoind.nodes[0].client.getInfo.callCount.should.equal(1);
        meowcoind.nodes[1].client.getInfo.callCount.should.equal(1);
        meowcoind.nodes[2].client.getInfo.callCount.should.equal(1);
        meowcoind.nodesIndex.should.equal(2);
        done();
      });
    });
    it('will get error if all clients fail', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.tryAllInterval = 1;
      meowcoind.nodes.push({
        client: {
          getInfo: sinon.stub().callsArgWith(0, new Error('test'))
        }
      });
      meowcoind.nodes.push({
        client: {
          getInfo: sinon.stub().callsArgWith(0, new Error('test'))
        }
      });
      meowcoind.nodes.push({
        client: {
          getInfo: sinon.stub().callsArgWith(0, new Error('test'))
        }
      });
      meowcoind._tryAllClients(function(client, next) {
        client.getInfo(next);
      }, function(err) {
        should.exist(err);
        err.should.be.instanceOf(Error);
        err.message.should.equal('test');
        done();
      });
    });
  });

  describe('#_wrapRPCError', function() {
    it('will convert meowcoind-rpc error object into JavaScript error', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var error = meowcoind._wrapRPCError({message: 'Test error', code: -1});
      error.should.be.an.instanceof(errors.RPCError);
      error.code.should.equal(-1);
      error.message.should.equal('Test error');
    });
  });

  describe('#_initChain', function() {
    var sandbox = sinon.sandbox.create();
    beforeEach(function() {
      sandbox.stub(log, 'info');
    });
    afterEach(function() {
      sandbox.restore();
    });
    it('will set height and genesis buffer', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var genesisBuffer = Buffer.from([]);
      meowcoind.getRawBlock = sinon.stub().callsArgWith(1, null, genesisBuffer);
      meowcoind.nodes.push({
        client: {
          getBestBlockHash: function(callback) {
            callback(null, {
              result: 'bestblockhash'
            });
          },
          getBlock: function(hash, callback) {
            if (hash === 'bestblockhash') {
              callback(null, {
                result: {
                  height: 5000
                }
              });
            }
          },
          getBlockHash: function(num, callback) {
            callback(null, {
              result: 'genesishash'
            });
          }
        }
      });
      meowcoind._initChain(function() {
        log.info.callCount.should.equal(1);
        meowcoind.getRawBlock.callCount.should.equal(1);
        meowcoind.getRawBlock.args[0][0].should.equal('genesishash');
        meowcoind.height.should.equal(5000);
        meowcoind.genesisBuffer.should.equal(genesisBuffer);
        done();
      });
    });
    it('it will handle error from getBestBlockHash', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var getBestBlockHash = sinon.stub().callsArgWith(0, {code: -1, message: 'error'});
      meowcoind.nodes.push({
        client: {
          getBestBlockHash: getBestBlockHash
        }
      });
      meowcoind._initChain(function(err) {
        err.should.be.instanceOf(Error);
        done();
      });
    });
    it('it will handle error from getBlock', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var getBestBlockHash = sinon.stub().callsArgWith(0, null, {});
      var getBlock = sinon.stub().callsArgWith(1, {code: -1, message: 'error'});
      meowcoind.nodes.push({
        client: {
          getBestBlockHash: getBestBlockHash,
          getBlock: getBlock
        }
      });
      meowcoind._initChain(function(err) {
        err.should.be.instanceOf(Error);
        done();
      });
    });
    it('it will handle error from getBlockHash', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var getBestBlockHash = sinon.stub().callsArgWith(0, null, {});
      var getBlock = sinon.stub().callsArgWith(1, null, {
        result: {
          height: 10
        }
      });
      var getBlockHash = sinon.stub().callsArgWith(1, {code: -1, message: 'error'});
      meowcoind.nodes.push({
        client: {
          getBestBlockHash: getBestBlockHash,
          getBlock: getBlock,
          getBlockHash: getBlockHash
        }
      });
      meowcoind._initChain(function(err) {
        err.should.be.instanceOf(Error);
        done();
      });
    });
    it('it will handle error from getRawBlock', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var getBestBlockHash = sinon.stub().callsArgWith(0, null, {});
      var getBlock = sinon.stub().callsArgWith(1, null, {
        result: {
          height: 10
        }
      });
      var getBlockHash = sinon.stub().callsArgWith(1, null, {});
      meowcoind.nodes.push({
        client: {
          getBestBlockHash: getBestBlockHash,
          getBlock: getBlock,
          getBlockHash: getBlockHash
        }
      });
      meowcoind.getRawBlock = sinon.stub().callsArgWith(1, new Error('test'));
      meowcoind._initChain(function(err) {
        err.should.be.instanceOf(Error);
        done();
      });
    });
  });

  describe('#_getDefaultConf', function() {
    afterEach(function() {
      meowcoincore.Networks.disableRegtest();
      baseConfig.node.network = meowcoincore.Networks.testnet;
    });
    it('will get default rpc port for livenet', function() {
      var config = {
        node: {
          network: meowcoincore.Networks.livenet
        },
        spawn: {
          datadir: 'testdir',
          exec: 'testpath'
        }
      };
      var meowcoind = new MeowcoinService(config);
      meowcoind._getDefaultConf().rpcport.should.equal(8766);
    });
    it('will get default rpc port for testnet', function() {
      var config = {
        node: {
          network: meowcoincore.Networks.testnet
        },
        spawn: {
          datadir: 'testdir',
          exec: 'testpath'
        }
      };
      var meowcoind = new MeowcoinService(config);
      meowcoind._getDefaultConf().rpcport.should.equal(18766);
    });
    it('will get default rpc port for regtest', function() {
      meowcoincore.Networks.enableRegtest();
      var config = {
        node: {
          network: meowcoincore.Networks.testnet
        },
        spawn: {
          datadir: 'testdir',
          exec: 'testpath'
        }
      };
      var meowcoind = new MeowcoinService(config);
      meowcoind._getDefaultConf().rpcport.should.equal(18766);
    });
  });

  describe('#_getNetworkConfigPath', function() {
    afterEach(function() {
      meowcoincore.Networks.disableRegtest();
      baseConfig.node.network = meowcoincore.Networks.testnet;
    });
    it('will get default config path for livenet', function() {
      var config = {
        node: {
          network: meowcoincore.Networks.livenet
        },
        spawn: {
          datadir: 'testdir',
          exec: 'testpath'
        }
      };
      var meowcoind = new MeowcoinService(config);
      should.equal(meowcoind._getNetworkConfigPath(), undefined);
    });
    it('will get default rpc port for testnet', function() {
      var config = {
        node: {
          network: meowcoincore.Networks.testnet
        },
        spawn: {
          datadir: 'testdir',
          exec: 'testpath'
        }
      };
      var meowcoind = new MeowcoinService(config);
      meowcoind._getNetworkConfigPath().should.equal('testnet7/meowcoin.conf');
    });
    it('will get default rpc port for regtest', function() {
      meowcoincore.Networks.enableRegtest();
      var config = {
        node: {
          network: meowcoincore.Networks.testnet
        },
        spawn: {
          datadir: 'testdir',
          exec: 'testpath'
        }
      };
      var meowcoind = new MeowcoinService(config);
      meowcoind._getNetworkConfigPath().should.equal('regtest/meowcoin.conf');
    });
  });

  describe('#_getNetworkOption', function() {
    afterEach(function() {
      meowcoincore.Networks.disableRegtest();
      baseConfig.node.network = meowcoincore.Networks.testnet;
    });
    it('return --testnet for testnet', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.node.network = meowcoincore.Networks.testnet;
      meowcoind._getNetworkOption().should.equal('--testnet');
    });
    it('return --regtest for testnet', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.node.network = meowcoincore.Networks.testnet;
      meowcoincore.Networks.enableRegtest();
      meowcoind._getNetworkOption().should.equal('--regtest');
    });
    it('return undefined for livenet', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.node.network = meowcoincore.Networks.livenet;
      meowcoincore.Networks.enableRegtest();
      should.equal(meowcoind._getNetworkOption(), undefined);
    });
  });

  describe('#_zmqBlockHandler', function() {
    it('will emit block', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var node = {};
      var message = Buffer.from('00000000002e08fc7ae9a9aa5380e95e2adcdc5752a4a66a7d3a22466bd4e6aa', 'hex');
      meowcoind._rapidProtectedUpdateTip = sinon.stub();
      meowcoind.on('block', function(block) {
        block.should.equal(message);
        done();
      });
      meowcoind._zmqBlockHandler(node, message);
    });
    it('will not emit same block twice', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var node = {};
      var message = Buffer.from('00000000002e08fc7ae9a9aa5380e95e2adcdc5752a4a66a7d3a22466bd4e6aa', 'hex');
      meowcoind._rapidProtectedUpdateTip = sinon.stub();
      meowcoind.on('block', function(block) {
        block.should.equal(message);
        done();
      });
      meowcoind._zmqBlockHandler(node, message);
      meowcoind._zmqBlockHandler(node, message);
    });
    it('will call function to update tip', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var node = {};
      var message = Buffer.from('00000000002e08fc7ae9a9aa5380e95e2adcdc5752a4a66a7d3a22466bd4e6aa', 'hex');
      meowcoind._rapidProtectedUpdateTip = sinon.stub();
      meowcoind._zmqBlockHandler(node, message);
      meowcoind._rapidProtectedUpdateTip.callCount.should.equal(1);
      meowcoind._rapidProtectedUpdateTip.args[0][0].should.equal(node);
      meowcoind._rapidProtectedUpdateTip.args[0][1].should.equal(message);
    });
    it('will emit to subscribers', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var node = {};
      var message = Buffer.from('00000000002e08fc7ae9a9aa5380e95e2adcdc5752a4a66a7d3a22466bd4e6aa', 'hex');
      meowcoind._rapidProtectedUpdateTip = sinon.stub();
      var emitter = new EventEmitter();
      meowcoind.subscriptions.hashblock.push(emitter);
      emitter.on('meowcoind/hashblock', function(blockHash) {
        blockHash.should.equal(message.toString('hex'));
        done();
      });
      meowcoind._zmqBlockHandler(node, message);
    });
  });

  describe('#_rapidProtectedUpdateTip', function() {
    it('will limit tip updates with rapid calls', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var callCount = 0;
      meowcoind._updateTip = function() {
        callCount++;
        callCount.should.be.within(1, 2);
        if (callCount > 1) {
          done();
        }
      };
      var node = {};
      var message = Buffer.from('00000000002e08fc7ae9a9aa5380e95e2adcdc5752a4a66a7d3a22466bd4e6aa', 'hex');
      var count = 0;
      function repeat() {
        meowcoind._rapidProtectedUpdateTip(node, message);
        count++;
        if (count < 50) {
          repeat();
        }
      }
      repeat();
    });
  });

  describe('#_updateTip', function() {
    var sandbox = sinon.sandbox.create();
    var message = Buffer.from('00000000002e08fc7ae9a9aa5380e95e2adcdc5752a4a66a7d3a22466bd4e6aa', 'hex');
    beforeEach(function() {
      sandbox.stub(log, 'error');
      sandbox.stub(log, 'info');
    });
    afterEach(function() {
      sandbox.restore();
    });
    it('log and emit rpc error from get block', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.syncPercentage = sinon.stub();
      meowcoind.on('error', function(err) {
        err.code.should.equal(-1);
        err.message.should.equal('Test error');
        log.error.callCount.should.equal(1);
        done();
      });
      var node = {
        client: {
          getBlock: sinon.stub().callsArgWith(1, {message: 'Test error', code: -1})
        }
      };
      meowcoind._updateTip(node, message);
    });
    it('emit synced if percentage is 100', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.syncPercentage = sinon.stub().callsArgWith(0, null, 100);
      meowcoind.on('synced', function() {
        done();
      });
      var node = {
        client: {
          getBlock: sinon.stub()
        }
      };
      meowcoind._updateTip(node, message);
    });
    it('NOT emit synced if percentage is less than 100', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.syncPercentage = sinon.stub().callsArgWith(0, null, 99);
      meowcoind.on('synced', function() {
        throw new Error('Synced called');
      });
      var node = {
        client: {
          getBlock: sinon.stub()
        }
      };
      meowcoind._updateTip(node, message);
      log.info.callCount.should.equal(1);
      done();
    });
    it('log and emit error from syncPercentage', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.syncPercentage = sinon.stub().callsArgWith(0, new Error('test'));
      meowcoind.on('error', function(err) {
        log.error.callCount.should.equal(1);
        err.message.should.equal('test');
        done();
      });
      var node = {
        client: {
          getBlock: sinon.stub()
        }
      };
      meowcoind._updateTip(node, message);
    });
    it('reset caches and set height', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.syncPercentage = sinon.stub();
      meowcoind._resetCaches = sinon.stub();
      meowcoind.on('tip', function(height) {
        meowcoind._resetCaches.callCount.should.equal(1);
        height.should.equal(10);
        meowcoind.height.should.equal(10);
        done();
      });
      var node = {
        client: {
          getBlock: sinon.stub().callsArgWith(1, null, {
            result: {
              height: 10
            }
          })
        }
      };
      meowcoind._updateTip(node, message);
    });
    it('will NOT update twice for the same hash', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.syncPercentage = sinon.stub();
      meowcoind._resetCaches = sinon.stub();
      meowcoind.on('tip', function() {
        done();
      });
      var node = {
        client: {
          getBlock: sinon.stub().callsArgWith(1, null, {
            result: {
              height: 10
            }
          })
        }
      };
      meowcoind._updateTip(node, message);
      meowcoind._updateTip(node, message);
    });
    it('will not call syncPercentage if node is stopping', function(done) {
      var config = {
        node: {
          network: meowcoincore.Networks.testnet
        },
        spawn: {
          datadir: 'testdir',
          exec: 'testpath'
        }
      };
      var meowcoind = new MeowcoinService(config);
      meowcoind.syncPercentage = sinon.stub();
      meowcoind._resetCaches = sinon.stub();
      meowcoind.node.stopping = true;
      var node = {
        client: {
          getBlock: sinon.stub().callsArgWith(1, null, {
            result: {
              height: 10
            }
          })
        }
      };
      meowcoind.on('tip', function() {
        meowcoind.syncPercentage.callCount.should.equal(0);
        done();
      });
      meowcoind._updateTip(node, message);
    });
  });

  describe('#_getAddressesFromTransaction', function() {
    it('will get results using meowcoincore.Transaction', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var wif = 'L2Gkw3kKJ6N24QcDuH4XDqt9cTqsKTVNDGz1CRZhk9cq4auDUbJy';
      var privkey = meowcoincore.PrivateKey.fromWIF(wif);
      var inputAddress = privkey.toAddress(meowcoincore.Networks.testnet);
      var outputAddress = meowcoincore.Address('2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br');
      var tx = meowcoincore.Transaction();
      tx.from({
        txid: '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b',
        outputIndex: 0,
        script: meowcoincore.Script(inputAddress),
        address: inputAddress.toString(),
        satoshis: 5000000000
      });
      tx.to(outputAddress, 5000000000);
      tx.sign(privkey);
      var addresses = meowcoind._getAddressesFromTransaction(tx);
      addresses.length.should.equal(2);
      addresses[0].should.equal(inputAddress.toString());
      addresses[1].should.equal(outputAddress.toString());
    });
    it('will handle non-standard script types', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var tx = meowcoincore.Transaction();
      tx.addInput(meowcoincore.Transaction.Input({
        prevTxId: '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b',
        script: meowcoincore.Script('OP_TRUE'),
        outputIndex: 1,
        output: {
          script: meowcoincore.Script('OP_TRUE'),
          satoshis: 5000000000
        }
      }));
      tx.addOutput(meowcoincore.Transaction.Output({
        script: meowcoincore.Script('OP_TRUE'),
        satoshis: 5000000000
      }));
      var addresses = meowcoind._getAddressesFromTransaction(tx);
      addresses.length.should.equal(0);
    });
    it('will handle unparsable script types or missing input script', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var tx = meowcoincore.Transaction();
      tx.addOutput(meowcoincore.Transaction.Output({
        script: Buffer.from('4c', 'hex'),
        satoshis: 5000000000
      }));
      var addresses = meowcoind._getAddressesFromTransaction(tx);
      addresses.length.should.equal(0);
    });
    it('will return unique values', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var tx = meowcoincore.Transaction();
      var address = meowcoincore.Address('2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br');
      tx.addOutput(meowcoincore.Transaction.Output({
        script: meowcoincore.Script(address),
        satoshis: 5000000000
      }));
      tx.addOutput(meowcoincore.Transaction.Output({
        script: meowcoincore.Script(address),
        satoshis: 5000000000
      }));
      var addresses = meowcoind._getAddressesFromTransaction(tx);
      addresses.length.should.equal(1);
    });
  });

  describe('#_notifyAddressTxidSubscribers', function() {
    it('will emit event if matching addresses', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var address = 'RJYZeWxr1Ly8YgcvJU1qD5MR9jUtk14HkN';
      meowcoind._getAddressesFromTransaction = sinon.stub().returns([address]);
      var emitter = new EventEmitter();
      meowcoind.subscriptions.address[address] = [emitter];
      var txid = '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0';
      var transaction = {};
      emitter.on('meowcoind/addresstxid', function(data) {
        data.address.should.equal(address);
        data.txid.should.equal(txid);
        done();
      });
      sinon.spy(emitter, 'emit');
      meowcoind._notifyAddressTxidSubscribers(txid, transaction);
      emitter.emit.callCount.should.equal(1);
    });
    it('will NOT emit event without matching addresses', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var address = 'RJYZeWxr1Ly8YgcvJU1qD5MR9jUtk14HkN';
      meowcoind._getAddressesFromTransaction = sinon.stub().returns([address]);
      var emitter = new EventEmitter();
      var txid = '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0';
      var transaction = {};
      emitter.emit = sinon.stub();
      meowcoind._notifyAddressTxidSubscribers(txid, transaction);
      emitter.emit.callCount.should.equal(0);
    });
  });

  describe('#_zmqTransactionHandler', function() {
    it('will emit to subscribers', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var expectedBuffer = Buffer.from(txhex, 'hex');
      var emitter = new EventEmitter();
      meowcoind.subscriptions.rawtransaction.push(emitter);
      emitter.on('meowcoind/rawtransaction', function(hex) {
        hex.should.be.a('string');
        hex.should.equal(expectedBuffer.toString('hex'));
        done();
      });
      var node = {};
      meowcoind._zmqTransactionHandler(node, expectedBuffer);
    });
    it('will NOT emit to subscribers more than once for the same tx', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var expectedBuffer = Buffer.from(txhex, 'hex');
      var emitter = new EventEmitter();
      meowcoind.subscriptions.rawtransaction.push(emitter);
      emitter.on('meowcoind/rawtransaction', function() {
        done();
      });
      var node = {};
      meowcoind._zmqTransactionHandler(node, expectedBuffer);
      meowcoind._zmqTransactionHandler(node, expectedBuffer);
    });
    it('will emit "tx" event', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var expectedBuffer = Buffer.from(txhex, 'hex');
      meowcoind.on('tx', function(buffer) {
        buffer.should.be.instanceof(Buffer);
        buffer.toString('hex').should.equal(expectedBuffer.toString('hex'));
        done();
      });
      var node = {};
      meowcoind._zmqTransactionHandler(node, expectedBuffer);
    });
    it('will NOT emit "tx" event more than once for the same tx', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var expectedBuffer = Buffer.from(txhex, 'hex');
      meowcoind.on('tx', function() {
        done();
      });
      var node = {};
      meowcoind._zmqTransactionHandler(node, expectedBuffer);
      meowcoind._zmqTransactionHandler(node, expectedBuffer);
    });
  });

  describe('#_checkSyncedAndSubscribeZmqEvents', function() {
    var sandbox = sinon.sandbox.create();
    before(function() {
      sandbox.stub(log, 'error');
    });
    after(function() {
      sandbox.restore();
    });
    it('log errors, update tip and subscribe to zmq events', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind._updateTip = sinon.stub();
      meowcoind._subscribeZmqEvents = sinon.stub();
      var blockEvents = 0;
      meowcoind.on('block', function() {
        blockEvents++;
      });
      var getBestBlockHash = sinon.stub().callsArgWith(0, null, {
        result: '00000000000000001bb82a7f5973618cfd3185ba1ded04dd852a653f92a27c45'
      });
      getBestBlockHash.onCall(0).callsArgWith(0, {code: -1 , message: 'Test error'});
      var progress = 0.90;
      function getProgress() {
        progress = progress + 0.01;
        return progress;
      }
      var info = {};
      Object.defineProperty(info, 'result', {
        get: function() {
          return {
            verificationprogress: getProgress()
          };
        }
      });
      var getBlockchainInfo = sinon.stub().callsArgWith(0, null, info);
      getBlockchainInfo.onCall(0).callsArgWith(0, {code: -1, message: 'Test error'});
      var node = {
        _reindex: true,
        _reindexWait: 1,
        _tipUpdateInterval: 1,
        client: {
          getBestBlockHash: getBestBlockHash,
          getBlockchainInfo: getBlockchainInfo
        }
      };
      meowcoind._checkSyncedAndSubscribeZmqEvents(node);
      setTimeout(function() {
        log.error.callCount.should.equal(2);
        blockEvents.should.equal(11);
        meowcoind._updateTip.callCount.should.equal(11);
        meowcoind._subscribeZmqEvents.callCount.should.equal(1);
        done();
      }, 200);
    });
    it('it will clear interval if node is stopping', function(done) {
      var config = {
        node: {
          network: meowcoincore.Networks.testnet
        },
        spawn: {
          datadir: 'testdir',
          exec: 'testpath'
        }
      };
      var meowcoind = new MeowcoinService(config);
      var getBestBlockHash = sinon.stub().callsArgWith(0, {code: -1, message: 'error'});
      var node = {
        _tipUpdateInterval: 1,
        client: {
          getBestBlockHash: getBestBlockHash
        }
      };
      meowcoind._checkSyncedAndSubscribeZmqEvents(node);
      setTimeout(function() {
        meowcoind.node.stopping = true;
        var count = getBestBlockHash.callCount;
        setTimeout(function() {
          getBestBlockHash.callCount.should.equal(count);
          done();
        }, 100);
      }, 100);
    });
    it('will not set interval if synced is true', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind._updateTip = sinon.stub();
      meowcoind._subscribeZmqEvents = sinon.stub();
      var getBestBlockHash = sinon.stub().callsArgWith(0, null, {
        result: '00000000000000001bb82a7f5973618cfd3185ba1ded04dd852a653f92a27c45'
      });
      var info = {
        result: {
          verificationprogress: 1.00
        }
      };
      var getBlockchainInfo = sinon.stub().callsArgWith(0, null, info);
      var node = {
        _tipUpdateInterval: 1,
        client: {
          getBestBlockHash: getBestBlockHash,
          getBlockchainInfo: getBlockchainInfo
        }
      };
      meowcoind._checkSyncedAndSubscribeZmqEvents(node);
      setTimeout(function() {
        getBestBlockHash.callCount.should.equal(1);
        getBlockchainInfo.callCount.should.equal(1);
        done();
      }, 200);
    });
  });

  describe('#_subscribeZmqEvents', function() {
    it('will call subscribe on zmq socket', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var node = {
        zmqSubSocket: {
          subscribe: sinon.stub(),
          on: sinon.stub()
        }
      };
      meowcoind._subscribeZmqEvents(node);
      node.zmqSubSocket.subscribe.callCount.should.equal(2);
      node.zmqSubSocket.subscribe.args[0][0].should.equal('hashblock');
      node.zmqSubSocket.subscribe.args[1][0].should.equal('rawtx');
    });
    it('will call relevant handler for rawtx topics', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind._zmqTransactionHandler = sinon.stub();
      var node = {
        zmqSubSocket: new EventEmitter()
      };
      node.zmqSubSocket.subscribe = sinon.stub();
      meowcoind._subscribeZmqEvents(node);
      node.zmqSubSocket.on('message', function() {
        meowcoind._zmqTransactionHandler.callCount.should.equal(1);
        done();
      });
      var topic = Buffer.from('rawtx', 'utf8');
      var message = Buffer.from('abcdef', 'hex');
      node.zmqSubSocket.emit('message', topic, message);
    });
    it('will call relevant handler for hashblock topics', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind._zmqBlockHandler = sinon.stub();
      var node = {
        zmqSubSocket: new EventEmitter()
      };
      node.zmqSubSocket.subscribe = sinon.stub();
      meowcoind._subscribeZmqEvents(node);
      node.zmqSubSocket.on('message', function() {
        meowcoind._zmqBlockHandler.callCount.should.equal(1);
        done();
      });
      var topic = Buffer.from('hashblock', 'utf8');
      var message = Buffer.from('abcdef', 'hex');
      node.zmqSubSocket.emit('message', topic, message);
    });
    it('will ignore unknown topic types', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind._zmqBlockHandler = sinon.stub();
      meowcoind._zmqTransactionHandler = sinon.stub();
      var node = {
        zmqSubSocket: new EventEmitter()
      };
      node.zmqSubSocket.subscribe = sinon.stub();
      meowcoind._subscribeZmqEvents(node);
      node.zmqSubSocket.on('message', function() {
        meowcoind._zmqBlockHandler.callCount.should.equal(0);
        meowcoind._zmqTransactionHandler.callCount.should.equal(0);
        done();
      });
      var topic = Buffer.from('unknown', 'utf8');
      var message = Buffer.from('abcdef', 'hex');
      node.zmqSubSocket.emit('message', topic, message);
    });
  });

  describe('#_initZmqSubSocket', function() {
    it('will setup zmq socket', function() {
      var socket = new EventEmitter();
      socket.monitor = sinon.stub();
      socket.connect = sinon.stub();
      var socketFunc = function() {
        return socket;
      };
      var MeowcoinService = proxyquire('../../lib/services/meowcoind', {
        'zeromq': {
          socket: socketFunc
        }
      });
      var meowcoind = new MeowcoinService(baseConfig);
      var node = {};
      meowcoind._initZmqSubSocket(node, 'url');
      node.zmqSubSocket.should.equal(socket);
      socket.connect.callCount.should.equal(1);
      socket.connect.args[0][0].should.equal('url');
      socket.monitor.callCount.should.equal(1);
      socket.monitor.args[0][0].should.equal(500);
      socket.monitor.args[0][1].should.equal(0);
    });
  });

  describe('#_checkReindex', function() {
    var sandbox = sinon.sandbox.create();
    before(function() {
      sandbox.stub(log, 'info');
    });
    after(function() {
      sandbox.restore();
    });
    it('give error from client getblockchaininfo', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var node = {
        _reindex: true,
        _reindexWait: 1,
        client: {
          getBlockchainInfo: sinon.stub().callsArgWith(0, {code: -1 , message: 'Test error'})
        }
      };
      meowcoind._checkReindex(node, function(err) {
        should.exist(err);
        err.should.be.instanceof(errors.RPCError);
        done();
      });
    });
    it('will wait until sync is 100 percent', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var percent = 0.89;
      var node = {
        _reindex: true,
        _reindexWait: 1,
        client: {
          getBlockchainInfo: function(callback) {
            percent += 0.01;
            callback(null, {
              result: {
                verificationprogress: percent
              }
            });
          }
        }
      };
      meowcoind._checkReindex(node, function() {
        node._reindex.should.equal(false);
        log.info.callCount.should.equal(11);
        done();
      });
    });
    it('will call callback if reindex is not enabled', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var node = {
        _reindex: false
      };
      meowcoind._checkReindex(node, function() {
        node._reindex.should.equal(false);
        done();
      });
    });
  });

  describe('#_loadTipFromNode', function() {
    var sandbox = sinon.sandbox.create();
    beforeEach(function() {
      sandbox.stub(log, 'warn');
    });
    afterEach(function() {
      sandbox.restore();
    });
    it('will give rpc from client getbestblockhash', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var getBestBlockHash = sinon.stub().callsArgWith(0, {code: -1, message: 'Test error'});
      var node = {
        client: {
          getBestBlockHash: getBestBlockHash
        }
      };
      meowcoind._loadTipFromNode(node, function(err) {
        err.should.be.instanceof(Error);
        log.warn.callCount.should.equal(0);
        done();
      });
    });
    it('will give rpc from client getblock', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var getBestBlockHash = sinon.stub().callsArgWith(0, null, {
        result: '00000000000000001bb82a7f5973618cfd3185ba1ded04dd852a653f92a27c45'
      });
      var getBlock = sinon.stub().callsArgWith(1, new Error('Test error'));
      var node = {
        client: {
          getBestBlockHash: getBestBlockHash,
          getBlock: getBlock
        }
      };
      meowcoind._loadTipFromNode(node, function(err) {
        getBlock.args[0][0].should.equal('00000000000000001bb82a7f5973618cfd3185ba1ded04dd852a653f92a27c45');
        err.should.be.instanceof(Error);
        log.warn.callCount.should.equal(0);
        done();
      });
    });
    it('will log when error is RPC_IN_WARMUP', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var getBestBlockHash = sinon.stub().callsArgWith(0, {code: -28, message: 'Verifying blocks...'});
      var node = {
        client: {
          getBestBlockHash: getBestBlockHash
        }
      };
      meowcoind._loadTipFromNode(node, function(err) {
        err.should.be.instanceof(Error);
        log.warn.callCount.should.equal(1);
        done();
      });
    });
    it('will set height and emit tip', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var getBestBlockHash = sinon.stub().callsArgWith(0, null, {
        result: '00000000000000001bb82a7f5973618cfd3185ba1ded04dd852a653f92a27c45'
      });
      var getBlock = sinon.stub().callsArgWith(1, null, {
        result: {
          height: 100
        }
      });
      var node = {
        client: {
          getBestBlockHash: getBestBlockHash,
          getBlock: getBlock
        }
      };
      meowcoind.on('tip', function(height) {
        height.should.equal(100);
        meowcoind.height.should.equal(100);
        done();
      });
      meowcoind._loadTipFromNode(node, function(err) {
        if (err) {
          return done(err);
        }
      });
    });
  });

  describe('#_stopSpawnedProcess', function() {
    var sandbox = sinon.sandbox.create();
    beforeEach(function() {
      sandbox.stub(log, 'warn');
    });
    afterEach(function() {
      sandbox.restore();
    });
    it('it will kill process and resume', function(done) {
      var readFile = sandbox.stub();
      readFile.onCall(0).callsArgWith(2, null, '4321');
      var error = new Error('Test error');
      error.code = 'ENOENT';
      readFile.onCall(1).callsArgWith(2, error);
      var TestMeowcoinService = proxyquire('../../lib/services/meowcoind', {
        fs: {
          readFile: readFile
        }
      });
      var meowcoind = new TestMeowcoinService(baseConfig);
      meowcoind.spawnStopTime = 1;
      meowcoind._process = {};
      meowcoind._process.kill = sinon.stub();
      meowcoind._stopSpawnedMeowcoin(function(err) {
        if (err) {
          return done(err);
        }
        meowcoind._process.kill.callCount.should.equal(1);
        log.warn.callCount.should.equal(1);
        done();
      });
    });
    it('it will attempt to kill process and resume', function(done) {
      var readFile = sandbox.stub();
      readFile.onCall(0).callsArgWith(2, null, '4321');
      var error = new Error('Test error');
      error.code = 'ENOENT';
      readFile.onCall(1).callsArgWith(2, error);
      var TestMeowcoinService = proxyquire('../../lib/services/meowcoind', {
        fs: {
          readFile: readFile
        }
      });
      var meowcoind = new TestMeowcoinService(baseConfig);
      meowcoind.spawnStopTime = 1;
      meowcoind._process = {};
      var error2 = new Error('Test error');
      error2.code = 'ESRCH';
      meowcoind._process.kill = sinon.stub().throws(error2);
      meowcoind._stopSpawnedMeowcoin(function(err) {
        if (err) {
          return done(err);
        }
        meowcoind._process.kill.callCount.should.equal(1);
        log.warn.callCount.should.equal(2);
        done();
      });
    });
    it('it will attempt to kill process with NaN', function(done) {
      var readFile = sandbox.stub();
      readFile.onCall(0).callsArgWith(2, null, '     ');
      var TestMeowcoinService = proxyquire('../../lib/services/meowcoind', {
        fs: {
          readFile: readFile
        }
      });
      var meowcoind = new TestMeowcoinService(baseConfig);
      meowcoind.spawnStopTime = 1;
      meowcoind._process = {};
      meowcoind._process.kill = sinon.stub();
      meowcoind._stopSpawnedMeowcoin(function(err) {
        if (err) {
          return done(err);
        }
        done();
      });
    });
    it('it will attempt to kill process without pid', function(done) {
      var readFile = sandbox.stub();
      readFile.onCall(0).callsArgWith(2, null, '');
      var TestMeowcoinService = proxyquire('../../lib/services/meowcoind', {
        fs: {
          readFile: readFile
        }
      });
      var meowcoind = new TestMeowcoinService(baseConfig);
      meowcoind.spawnStopTime = 1;
      meowcoind._process = {};
      meowcoind._process.kill = sinon.stub();
      meowcoind._stopSpawnedMeowcoin(function(err) {
        if (err) {
          return done(err);
        }
        done();
      });
    });
  });

  describe('#_spawnChildProcess', function() {
    var sandbox = sinon.sandbox.create();
    beforeEach(function() {
      sandbox.stub(log, 'info');
      sandbox.stub(log, 'warn');
      sandbox.stub(log, 'error');
    });
    afterEach(function() {
      sandbox.restore();
    });
    it('will give error from spawn config', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind._loadSpawnConfiguration = sinon.stub();
      meowcoind._loadSpawnConfiguration = sinon.stub().throws(new Error('test'));
      meowcoind._spawnChildProcess(function(err) {
        err.should.be.instanceof(Error);
        err.message.should.equal('test');
        done();
      });
    });
    it('will give error from stopSpawnedMeowcoin', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind._loadSpawnConfiguration = sinon.stub();
      meowcoind._stopSpawnedMeowcoin = sinon.stub().callsArgWith(0, new Error('test'));
      meowcoind._spawnChildProcess(function(err) {
        err.should.be.instanceOf(Error);
        err.message.should.equal('test');
      });
    });
    it('will exit spawn if shutdown', function() {
      var config = {
        node: {
          network: meowcoincore.Networks.testnet
        },
        spawn: {
          datadir: 'testdir',
          exec: 'testpath'
        }
      };
      var process = new EventEmitter();
      var spawn = sinon.stub().returns(process);
      var TestMeowcoinService = proxyquire('../../lib/services/meowcoind', {
        fs: {
          readFileSync: readFileSync
        },
        child_process: {
          spawn: spawn
        }
      });
      var meowcoind = new TestMeowcoinService(config);
      meowcoind.spawn = {};
      meowcoind._loadSpawnConfiguration = sinon.stub();
      meowcoind._stopSpawnedMeowcoin = sinon.stub().callsArgWith(0, null);
      meowcoind.node.stopping = true;
      meowcoind._spawnChildProcess(function(err) {
        err.should.be.instanceOf(Error);
        err.message.should.match(/Stopping while trying to spawn/);
      });
    });
    it('will include network with spawn command and init zmq/rpc on node', function(done) {
      var process = new EventEmitter();
      var spawn = sinon.stub().returns(process);
      var TestMeowcoinService = proxyquire('../../lib/services/meowcoind', {
        fs: {
          readFileSync: readFileSync
        },
        child_process: {
          spawn: spawn
        }
      });
      var meowcoind = new TestMeowcoinService(baseConfig);

      meowcoind._loadSpawnConfiguration = sinon.stub();
      meowcoind.spawn = {};
      meowcoind.spawn.exec = 'testexec';
      meowcoind.spawn.configPath = 'testdir/meowcoin.conf';
      meowcoind.spawn.datadir = 'testdir';
      meowcoind.spawn.config = {};
      meowcoind.spawn.config.rpcport = 20001;
      meowcoind.spawn.config.rpcuser = 'meowcoin';
      meowcoind.spawn.config.rpcpassword = 'password';
      meowcoind.spawn.config.zmqpubrawtx = 'tcp://127.0.0.1:30001';

      meowcoind._loadTipFromNode = sinon.stub().callsArgWith(1, null);
      meowcoind._initZmqSubSocket = sinon.stub();
      meowcoind._checkSyncedAndSubscribeZmqEvents = sinon.stub();
      meowcoind._checkReindex = sinon.stub().callsArgWith(1, null);
      meowcoind._spawnChildProcess(function(err, node) {
        should.not.exist(err);
        spawn.callCount.should.equal(1);
        spawn.args[0][0].should.equal('testexec');
        spawn.args[0][1].should.deep.equal([
          '--conf=testdir/meowcoin.conf',
          '--datadir=testdir',
          '--testnet'
        ]);
        spawn.args[0][2].should.deep.equal({
          stdio: 'inherit'
        });
        meowcoind._loadTipFromNode.callCount.should.equal(1);
        meowcoind._initZmqSubSocket.callCount.should.equal(1);
        should.exist(meowcoind._initZmqSubSocket.args[0][0].client);
        meowcoind._initZmqSubSocket.args[0][1].should.equal('tcp://127.0.0.1:30001');
        meowcoind._checkSyncedAndSubscribeZmqEvents.callCount.should.equal(1);
        should.exist(meowcoind._checkSyncedAndSubscribeZmqEvents.args[0][0].client);
        should.exist(node);
        should.exist(node.client);
        done();
      });
    });
    it('will respawn meowcoind spawned process', function(done) {
      var process = new EventEmitter();
      var spawn = sinon.stub().returns(process);
      var TestMeowcoinService = proxyquire('../../lib/services/meowcoind', {
        fs: {
          readFileSync: readFileSync
        },
        child_process: {
          spawn: spawn
        }
      });
      var meowcoind = new TestMeowcoinService(baseConfig);
      meowcoind._loadSpawnConfiguration = sinon.stub();
      meowcoind.spawn = {};
      meowcoind.spawn.exec = 'meowcoind';
      meowcoind.spawn.datadir = '/tmp/meowcoin';
      meowcoind.spawn.configPath = '/tmp/meowcoin/meowcoin.conf';
      meowcoind.spawn.config = {};
      meowcoind.spawnRestartTime = 1;
      meowcoind._loadTipFromNode = sinon.stub().callsArg(1);
      meowcoind._initZmqSubSocket = sinon.stub();
      meowcoind._checkReindex = sinon.stub().callsArg(1);
      meowcoind._checkSyncedAndSubscribeZmqEvents = sinon.stub();
      meowcoind._stopSpawnedMeowcoin = sinon.stub().callsArg(0);
      sinon.spy(meowcoind, '_spawnChildProcess');
      meowcoind._spawnChildProcess(function(err) {
        if (err) {
          return done(err);
        }
        process.once('exit', function() {
          setTimeout(function() {
            meowcoind._spawnChildProcess.callCount.should.equal(2);
            done();
          }, 5);
        });
        process.emit('exit', 1);
      });
    });
    it('will emit error during respawn', function(done) {
      var process = new EventEmitter();
      var spawn = sinon.stub().returns(process);
      var TestMeowcoinService = proxyquire('../../lib/services/meowcoind', {
        fs: {
          readFileSync: readFileSync
        },
        child_process: {
          spawn: spawn
        }
      });
      var meowcoind = new TestMeowcoinService(baseConfig);
      meowcoind._loadSpawnConfiguration = sinon.stub();
      meowcoind.spawn = {};
      meowcoind.spawn.exec = 'meowcoind';
      meowcoind.spawn.datadir = '/tmp/meowcoin';
      meowcoind.spawn.configPath = '/tmp/meowcoin/meowcoin.conf';
      meowcoind.spawn.config = {};
      meowcoind.spawnRestartTime = 1;
      meowcoind._loadTipFromNode = sinon.stub().callsArg(1);
      meowcoind._initZmqSubSocket = sinon.stub();
      meowcoind._checkReindex = sinon.stub().callsArg(1);
      meowcoind._checkSyncedAndSubscribeZmqEvents = sinon.stub();
      meowcoind._stopSpawnedMeowcoin = sinon.stub().callsArg(0);
      sinon.spy(meowcoind, '_spawnChildProcess');
      meowcoind._spawnChildProcess(function(err) {
        if (err) {
          return done(err);
        }
        meowcoind._spawnChildProcess = sinon.stub().callsArgWith(0, new Error('test'));
        meowcoind.on('error', function(err) {
          err.should.be.instanceOf(Error);
          err.message.should.equal('test');
          done();
        });
        process.emit('exit', 1);
      });
    });
    it('will NOT respawn meowcoind spawned process if shutting down', function(done) {
      var process = new EventEmitter();
      var spawn = sinon.stub().returns(process);
      var TestMeowcoinService = proxyquire('../../lib/services/meowcoind', {
        fs: {
          readFileSync: readFileSync
        },
        child_process: {
          spawn: spawn
        }
      });
      var config = {
        node: {
          network: meowcoincore.Networks.testnet
        },
        spawn: {
          datadir: 'testdir',
          exec: 'testpath'
        }
      };
      var meowcoind = new TestMeowcoinService(config);
      meowcoind._loadSpawnConfiguration = sinon.stub();
      meowcoind.spawn = {};
      meowcoind.spawn.exec = 'meowcoind';
      meowcoind.spawn.datadir = '/tmp/meowcoin';
      meowcoind.spawn.configPath = '/tmp/meowcoin/meowcoin.conf';
      meowcoind.spawn.config = {};
      meowcoind.spawnRestartTime = 1;
      meowcoind._loadTipFromNode = sinon.stub().callsArg(1);
      meowcoind._initZmqSubSocket = sinon.stub();
      meowcoind._checkReindex = sinon.stub().callsArg(1);
      meowcoind._checkSyncedAndSubscribeZmqEvents = sinon.stub();
      meowcoind._stopSpawnedMeowcoin = sinon.stub().callsArg(0);
      sinon.spy(meowcoind, '_spawnChildProcess');
      meowcoind._spawnChildProcess(function(err) {
        if (err) {
          return done(err);
        }
        meowcoind.node.stopping = true;
        process.once('exit', function() {
          setTimeout(function() {
            meowcoind._spawnChildProcess.callCount.should.equal(1);
            done();
          }, 5);
        });
        process.emit('exit', 1);
      });
    });
    it('will give error after 60 retries', function(done) {
      var process = new EventEmitter();
      var spawn = sinon.stub().returns(process);
      var TestMeowcoinService = proxyquire('../../lib/services/meowcoind', {
        fs: {
          readFileSync: readFileSync
        },
        child_process: {
          spawn: spawn
        }
      });
      var meowcoind = new TestMeowcoinService(baseConfig);
      meowcoind.startRetryInterval = 1;
      meowcoind._loadSpawnConfiguration = sinon.stub();
      meowcoind.spawn = {};
      meowcoind.spawn.exec = 'testexec';
      meowcoind.spawn.configPath = 'testdir/meowcoin.conf';
      meowcoind.spawn.datadir = 'testdir';
      meowcoind.spawn.config = {};
      meowcoind.spawn.config.rpcport = 20001;
      meowcoind.spawn.config.rpcuser = 'meowcoin';
      meowcoind.spawn.config.rpcpassword = 'password';
      meowcoind.spawn.config.zmqpubrawtx = 'tcp://127.0.0.1:30001';
      meowcoind._loadTipFromNode = sinon.stub().callsArgWith(1, new Error('test'));
      meowcoind._spawnChildProcess(function(err) {
        meowcoind._loadTipFromNode.callCount.should.equal(60);
        err.should.be.instanceof(Error);
        done();
      });
    });
    it('will give error from check reindex', function(done) {
      var process = new EventEmitter();
      var spawn = sinon.stub().returns(process);
      var TestMeowcoinService = proxyquire('../../lib/services/meowcoind', {
        fs: {
          readFileSync: readFileSync
        },
        child_process: {
          spawn: spawn
        }
      });
      var meowcoind = new TestMeowcoinService(baseConfig);

      meowcoind._loadSpawnConfiguration = sinon.stub();
      meowcoind.spawn = {};
      meowcoind.spawn.exec = 'testexec';
      meowcoind.spawn.configPath = 'testdir/meowcoin.conf';
      meowcoind.spawn.datadir = 'testdir';
      meowcoind.spawn.config = {};
      meowcoind.spawn.config.rpcport = 20001;
      meowcoind.spawn.config.rpcuser = 'meowcoin';
      meowcoind.spawn.config.rpcpassword = 'password';
      meowcoind.spawn.config.zmqpubrawtx = 'tcp://127.0.0.1:30001';

      meowcoind._loadTipFromNode = sinon.stub().callsArgWith(1, null);
      meowcoind._initZmqSubSocket = sinon.stub();
      meowcoind._checkSyncedAndSubscribeZmqEvents = sinon.stub();
      meowcoind._checkReindex = sinon.stub().callsArgWith(1, new Error('test'));

      meowcoind._spawnChildProcess(function(err) {
        err.should.be.instanceof(Error);
        done();
      });
    });
  });

  describe('#_connectProcess', function() {
    it('will give error if connecting while shutting down', function(done) {
      var config = {
        node: {
          network: meowcoincore.Networks.testnet
        },
        spawn: {
          datadir: 'testdir',
          exec: 'testpath'
        }
      };
      var meowcoind = new MeowcoinService(config);
      meowcoind.node.stopping = true;
      meowcoind.startRetryInterval = 100;
      meowcoind._loadTipFromNode = sinon.stub();
      meowcoind._connectProcess({}, function(err) {
        err.should.be.instanceof(Error);
        err.message.should.match(/Stopping while trying to connect/);
        meowcoind._loadTipFromNode.callCount.should.equal(0);
        done();
      });
    });
    it('will give error from loadTipFromNode after 60 retries', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind._loadTipFromNode = sinon.stub().callsArgWith(1, new Error('test'));
      meowcoind.startRetryInterval = 1;
      var config = {};
      meowcoind._connectProcess(config, function(err) {
        err.should.be.instanceof(Error);
        meowcoind._loadTipFromNode.callCount.should.equal(60);
        done();
      });
    });
    it('will init zmq/rpc on node', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind._initZmqSubSocket = sinon.stub();
      meowcoind._subscribeZmqEvents = sinon.stub();
      meowcoind._loadTipFromNode = sinon.stub().callsArgWith(1, null);
      var config = {};
      meowcoind._connectProcess(config, function(err, node) {
        should.not.exist(err);
        meowcoind._loadTipFromNode.callCount.should.equal(1);
        meowcoind._initZmqSubSocket.callCount.should.equal(1);
        meowcoind._loadTipFromNode.callCount.should.equal(1);
        should.exist(node);
        should.exist(node.client);
        done();
      });
    });
  });

  describe('#start', function() {
    var sandbox = sinon.sandbox.create();
    beforeEach(function() {
      sandbox.stub(log, 'info');
    });
    afterEach(function() {
      sandbox.restore();
    });
    it('will give error if "spawn" and "connect" are both not configured', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.options = {};
      meowcoind.start(function(err) {
        err.should.be.instanceof(Error);
        err.message.should.match(/Meowcoin configuration options/);
      });
      done();
    });
    it('will give error from spawnChildProcess', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind._spawnChildProcess = sinon.stub().callsArgWith(0, new Error('test'));
      meowcoind.options = {
        spawn: {}
      };
      meowcoind.start(function(err) {
        err.should.be.instanceof(Error);
        err.message.should.equal('test');
        done();
      });
    });
    it('will give error from connectProcess', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind._connectProcess = sinon.stub().callsArgWith(1, new Error('test'));
      meowcoind.options = {
        connect: [
          {}
        ]
      };
      meowcoind.start(function(err) {
        meowcoind._connectProcess.callCount.should.equal(1);
        err.should.be.instanceof(Error);
        err.message.should.equal('test');
        done();
      });
    });
    it('will push node from spawnChildProcess', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var node = {};
      meowcoind._initChain = sinon.stub().callsArg(0);
      meowcoind._spawnChildProcess = sinon.stub().callsArgWith(0, null, node);
      meowcoind.options = {
        spawn: {}
      };
      meowcoind.start(function(err) {
        should.not.exist(err);
        meowcoind.nodes.length.should.equal(1);
        done();
      });
    });
    it('will push node from connectProcess', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind._initChain = sinon.stub().callsArg(0);
      var nodes = [{}];
      meowcoind._connectProcess = sinon.stub().callsArgWith(1, null, nodes);
      meowcoind.options = {
        connect: [
          {}
        ]
      };
      meowcoind.start(function(err) {
        should.not.exist(err);
        meowcoind._connectProcess.callCount.should.equal(1);
        meowcoind.nodes.length.should.equal(1);
        done();
      });
    });
  });

  describe('#isSynced', function() {
    it('will give error from syncPercentage', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.syncPercentage = sinon.stub().callsArgWith(0, new Error('test'));
      meowcoind.isSynced(function(err) {
        should.exist(err);
        err.message.should.equal('test');
        done();
      });
    });
    it('will give "true" if percentage is 100.00', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.syncPercentage = sinon.stub().callsArgWith(0, null, 100.00);
      meowcoind.isSynced(function(err, synced) {
        if (err) {
          return done(err);
        }
        synced.should.equal(true);
        done();
      });
    });
    it('will give "true" if percentage is 99.98', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.syncPercentage = sinon.stub().callsArgWith(0, null, 99.98);
      meowcoind.isSynced(function(err, synced) {
        if (err) {
          return done(err);
        }
        synced.should.equal(true);
        done();
      });
    });
    it('will give "false" if percentage is 99.49', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.syncPercentage = sinon.stub().callsArgWith(0, null, 99.49);
      meowcoind.isSynced(function(err, synced) {
        if (err) {
          return done(err);
        }
        synced.should.equal(false);
        done();
      });
    });
    it('will give "false" if percentage is 1', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.syncPercentage = sinon.stub().callsArgWith(0, null, 1);
      meowcoind.isSynced(function(err, synced) {
        if (err) {
          return done(err);
        }
        synced.should.equal(false);
        done();
      });
    });
  });

  describe('#syncPercentage', function() {
    it('will give rpc error', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var getBlockchainInfo = sinon.stub().callsArgWith(0, {message: 'error', code: -1});
      meowcoind.nodes.push({
        client: {
          getBlockchainInfo: getBlockchainInfo
        }
      });
      meowcoind.syncPercentage(function(err) {
        should.exist(err);
        err.should.be.an.instanceof(errors.RPCError);
        done();
      });
    });
    it('will call client getInfo and give result', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var getBlockchainInfo = sinon.stub().callsArgWith(0, null, {
        result: {
          verificationprogress: '0.983821387'
        }
      });
      meowcoind.nodes.push({
        client: {
          getBlockchainInfo: getBlockchainInfo
        }
      });
      meowcoind.syncPercentage(function(err, percentage) {
        if (err) {
          return done(err);
        }
        percentage.should.equal(98.3821387);
        done();
      });
    });
  });

  describe('#_normalizeAddressArg', function() {
    it('will turn single address into array', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var args = meowcoind._normalizeAddressArg('address');
      args.should.deep.equal(['address']);
    });
    it('will keep an array as an array', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var args = meowcoind._normalizeAddressArg(['address', 'address']);
      args.should.deep.equal(['address', 'address']);
    });
  });

  describe('#getAddressBalance', function() {
    it('will give rpc error', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.nodes.push({
        client: {
          getAddressBalance: sinon.stub().callsArgWith(1, {code: -1, message: 'Test error'})
        }
      });
      var address = 'RJYZeWxr1Ly8YgcvJU1qD5MR9jUtk14HkN';
      var options = {};
      meowcoind.getAddressBalance(address, options, function(err) {
        err.should.be.instanceof(Error);
        done();
      });
    });
    it('will give balance', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var getAddressBalance = sinon.stub().callsArgWith(1, null, {
        result: {
          received: 100000,
          balance: 10000
        }
      });
      meowcoind.nodes.push({
        client: {
          getAddressBalance: getAddressBalance
        }
      });
      var address = 'RJYZeWxr1Ly8YgcvJU1qD5MR9jUtk14HkN';
      var options = {};
      meowcoind.getAddressBalance(address, options, function(err, data) {
        if (err) {
          return done(err);
        }
        data.balance.should.equal(10000);
        data.received.should.equal(100000);
        meowcoind.getAddressBalance(address, options, function(err, data2) {
          if (err) {
            return done(err);
          }
          data2.balance.should.equal(10000);
          data2.received.should.equal(100000);
          getAddressBalance.callCount.should.equal(1);
          done();
        });
      });
    });
  });

  describe('#getAddressUnspentOutputs', function() {
    it('will give rpc error', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.nodes.push({
        client: {
          getAddressUtxos: sinon.stub().callsArgWith(1, {code: -1, message: 'Test error'})
        }
      });
      var options = {
        queryMempool: false
      };
      var address = 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja';
      meowcoind.getAddressUnspentOutputs(address, options, function(err) {
        should.exist(err);
        err.should.be.instanceof(errors.RPCError);
        done();
      });
    });
    it('will give results from client getaddressutxos', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var expectedUtxos = [
        {
          address: 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja',
          txid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          outputIndex: 1,
          script: '76a914f399b4b8894f1153b96fce29f05e6e116eb4c21788ac',
          satoshis: 7679241,
          height: 207111
        }
      ];
      meowcoind.nodes.push({
        client: {
          getAddressUtxos: sinon.stub().callsArgWith(1, null, {
            result: expectedUtxos
          })
        }
      });
      var options = {
        queryMempool: false
      };
      var address = 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja';
      meowcoind.getAddressUnspentOutputs(address, options, function(err, utxos) {
        if (err) {
          return done(err);
        }
        utxos.length.should.equal(1);
        utxos.should.deep.equal(expectedUtxos);
        done();
      });
    });
    it('will use cache', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var expectedUtxos = [
        {
          address: 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja',
          txid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          outputIndex: 1,
          script: '76a914f399b4b8894f1153b96fce29f05e6e116eb4c21788ac',
          satoshis: 7679241,
          height: 207111
        }
      ];
      var getAddressUtxos = sinon.stub().callsArgWith(1, null, {
        result: expectedUtxos
      });
      meowcoind.nodes.push({
        client: {
          getAddressUtxos: getAddressUtxos
        }
      });
      var options = {
        queryMempool: false
      };
      var address = 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja';
      meowcoind.getAddressUnspentOutputs(address, options, function(err, utxos) {
        if (err) {
          return done(err);
        }
        utxos.length.should.equal(1);
        utxos.should.deep.equal(expectedUtxos);
        getAddressUtxos.callCount.should.equal(1);
        meowcoind.getAddressUnspentOutputs(address, options, function(err, utxos) {
          if (err) {
            return done(err);
          }
          utxos.length.should.equal(1);
          utxos.should.deep.equal(expectedUtxos);
          getAddressUtxos.callCount.should.equal(1);
          done();
        });
      });
    });
    it('will update with mempool results', function(done) {
      var deltas = [
        {
          txid: 'e9dcf22807db77ac0276b03cc2d3a8b03c4837db8ac6650501ef45af1c807cce',
          satoshis: -7679241,
          address: 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja',
          index: 0,
          timestamp: 1461342707725,
          prevtxid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          prevout: 1
        },
        {
          txid: 'f637384e9f81f18767ea50e00bce58fc9848b6588a1130529eebba22a410155f',
          satoshis: 100000,
          address: 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja',
          index: 0,
          timestamp: 1461342833133
        },
        {
          txid: 'f71bccef3a8f5609c7f016154922adbfe0194a96fb17a798c24077c18d0a9345',
          satoshis: 400000,
          address: 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja',
          index: 1,
          timestamp: 1461342954813
        }
      ];
      var meowcoind = new MeowcoinService(baseConfig);
      var confirmedUtxos = [
        {
          address: 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja',
          txid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          outputIndex: 1,
          script: '76a914f399b4b8894f1153b96fce29f05e6e116eb4c21788ac',
          satoshis: 7679241,
          height: 207111
        }
      ];
      var expectedUtxos = [
        {
          address: 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja',
          outputIndex: 1,
          satoshis: 400000,
          script: '76a914809dc14496f99b6deb722cf46d89d22f4beb8efd88ac',
          timestamp: 1461342954813,
          txid: 'f71bccef3a8f5609c7f016154922adbfe0194a96fb17a798c24077c18d0a9345'
        },
        {
          address: 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja',
          outputIndex: 0,
          satoshis: 100000,
          script: '76a914809dc14496f99b6deb722cf46d89d22f4beb8efd88ac',
          timestamp: 1461342833133,
          txid: 'f637384e9f81f18767ea50e00bce58fc9848b6588a1130529eebba22a410155f'
        }
      ];
      meowcoind.nodes.push({
        client: {
          getAddressUtxos: sinon.stub().callsArgWith(1, null, {
            result: confirmedUtxos
          }),
          getAddressMempool: sinon.stub().callsArgWith(1, null, {
            result: deltas
          })
        }
      });
      var options = {
        queryMempool: true
      };
      var address = 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja';
      meowcoind.getAddressUnspentOutputs(address, options, function(err, utxos) {
        if (err) {
          return done(err);
        }
        utxos.length.should.equal(2);
        utxos.should.deep.equal(expectedUtxos);
        done();
      });
    });
    it('will update with mempool results with multiple outputs', function(done) {
      var deltas = [
        {
          txid: 'e9dcf22807db77ac0276b03cc2d3a8b03c4837db8ac6650501ef45af1c807cce',
          satoshis: -7679241,
          address: 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja',
          index: 0,
          timestamp: 1461342707725,
          prevtxid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          prevout: 1
        },
        {
          txid: 'e9dcf22807db77ac0276b03cc2d3a8b03c4837db8ac6650501ef45af1c807cce',
          satoshis: -7679241,
          address: 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja',
          index: 1,
          timestamp: 1461342707725,
          prevtxid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          prevout: 2
        }
      ];
      var meowcoind = new MeowcoinService(baseConfig);
      var confirmedUtxos = [
        {
          address: 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja',
          txid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          outputIndex: 1,
          script: '76a914f399b4b8894f1153b96fce29f05e6e116eb4c21788ac',
          satoshis: 7679241,
          height: 207111
        },
        {
          address: 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja',
          txid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          outputIndex: 2,
          script: '76a914f399b4b8894f1153b96fce29f05e6e116eb4c21788ac',
          satoshis: 7679241,
          height: 207111
        }
      ];
      meowcoind.nodes.push({
        client: {
          getAddressUtxos: sinon.stub().callsArgWith(1, null, {
            result: confirmedUtxos
          }),
          getAddressMempool: sinon.stub().callsArgWith(1, null, {
            result: deltas
          })
        }
      });
      var options = {
        queryMempool: true
      };
      var address = 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja';
      meowcoind.getAddressUnspentOutputs(address, options, function(err, utxos) {
        if (err) {
          return done(err);
        }
        utxos.length.should.equal(0);
        done();
      });
    });
    it('three confirmed utxos -> one utxo after mempool', function(done) {
      var deltas = [
        {
          txid: 'e9dcf22807db77ac0276b03cc2d3a8b03c4837db8ac6650501ef45af1c807cce',
          satoshis: -7679241,
          address: 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja',
          index: 0,
          timestamp: 1461342707725,
          prevtxid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          prevout: 0
        },
        {
          txid: 'e9dcf22807db77ac0276b03cc2d3a8b03c4837db8ac6650501ef45af1c807cce',
          satoshis: -7679241,
          address: 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja',
          index: 0,
          timestamp: 1461342707725,
          prevtxid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          prevout: 1
        },
        {
          txid: 'e9dcf22807db77ac0276b03cc2d3a8b03c4837db8ac6650501ef45af1c807cce',
          satoshis: -7679241,
          address: 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja',
          index: 1,
          timestamp: 1461342707725,
          prevtxid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          prevout: 2
        },
        {
          txid: 'e9dcf22807db77ac0276b03cc2d3a8b03c4837db8ac6650501ef45af1c807cce',
          satoshis: 100000,
          address: 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja',
          index: 1,
          script: '76a914809dc14496f99b6deb722cf46d89d22f4beb8efd88ac',
          timestamp: 1461342833133
        }
      ];
      var meowcoind = new MeowcoinService(baseConfig);
      var confirmedUtxos = [
        {
          address: 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja',
          txid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          outputIndex: 0,
          script: '76a914f399b4b8894f1153b96fce29f05e6e116eb4c21788ac',
          satoshis: 7679241,
          height: 207111
        },
        {
          address: 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja',
          txid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          outputIndex: 1,
          script: '76a914f399b4b8894f1153b96fce29f05e6e116eb4c21788ac',
          satoshis: 7679241,
          height: 207111
        },
        {
          address: 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja',
          txid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          outputIndex: 2,
          script: '76a914f399b4b8894f1153b96fce29f05e6e116eb4c21788ac',
          satoshis: 7679241,
          height: 207111
        }
      ];
      meowcoind.nodes.push({
        client: {
          getAddressUtxos: sinon.stub().callsArgWith(1, null, {
            result: confirmedUtxos
          }),
          getAddressMempool: sinon.stub().callsArgWith(1, null, {
            result: deltas
          })
        }
      });
      var options = {
        queryMempool: true
      };
      var address = 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja';
      meowcoind.getAddressUnspentOutputs(address, options, function(err, utxos) {
        if (err) {
          return done(err);
        }
        utxos.length.should.equal(1);
        done();
      });
    });
    it('spending utxos in the mempool', function(done) {
      var deltas = [
        {
          txid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          satoshis: 7679241,
          address: 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja',
          index: 0,
          timestamp: 1461342707724
        },
        {
          txid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          satoshis: 7679241,
          address: 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja',
          index: 1,
          timestamp: 1461342707724
        },
        {
          txid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          satoshis: 7679241,
          address: 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja',
          timestamp: 1461342707724,
          index: 2,
        },
        {
          txid: 'e9dcf22807db77ac0276b03cc2d3a8b03c4837db8ac6650501ef45af1c807cce',
          satoshis: -7679241,
          address: 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja',
          index: 0,
          timestamp: 1461342707725,
          prevtxid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          prevout: 0
        },
        {
          txid: 'e9dcf22807db77ac0276b03cc2d3a8b03c4837db8ac6650501ef45af1c807cce',
          satoshis: -7679241,
          address: 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja',
          index: 0,
          timestamp: 1461342707725,
          prevtxid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          prevout: 1
        },
        {
          txid: 'e9dcf22807db77ac0276b03cc2d3a8b03c4837db8ac6650501ef45af1c807cce',
          satoshis: -7679241,
          address: 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja',
          index: 1,
          timestamp: 1461342707725,
          prevtxid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          prevout: 2
        },
        {
          txid: 'e9dcf22807db77ac0276b03cc2d3a8b03c4837db8ac6650501ef45af1c807cce',
          satoshis: 100000,
          address: 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja',
          index: 1,
          timestamp: 1461342833133
        }
      ];
      var meowcoind = new MeowcoinService(baseConfig);
      var confirmedUtxos = [];
      meowcoind.nodes.push({
        client: {
          getAddressUtxos: sinon.stub().callsArgWith(1, null, {
            result: confirmedUtxos
          }),
          getAddressMempool: sinon.stub().callsArgWith(1, null, {
            result: deltas
          })
        }
      });
      var options = {
        queryMempool: true
      };
      var address = 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja';
      meowcoind.getAddressUnspentOutputs(address, options, function(err, utxos) {
        if (err) {
          return done(err);
        }
        utxos.length.should.equal(1);
        utxos[0].address.should.equal(address);
        utxos[0].txid.should.equal('e9dcf22807db77ac0276b03cc2d3a8b03c4837db8ac6650501ef45af1c807cce');
        utxos[0].outputIndex.should.equal(1);
        utxos[0].script.should.equal('76a914809dc14496f99b6deb722cf46d89d22f4beb8efd88ac');
        utxos[0].timestamp.should.equal(1461342833133);
        done();
      });
    });
    it('will update with mempool results spending zero value output (likely never to happen)', function(done) {
      var deltas = [
        {
          txid: 'e9dcf22807db77ac0276b03cc2d3a8b03c4837db8ac6650501ef45af1c807cce',
          satoshis: 0,
          address: 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja',
          index: 0,
          timestamp: 1461342707725,
          prevtxid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          prevout: 1
        }
      ];
      var meowcoind = new MeowcoinService(baseConfig);
      var confirmedUtxos = [
        {
          address: 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja',
          txid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          outputIndex: 1,
          script: '76a914f399b4b8894f1153b96fce29f05e6e116eb4c21788ac',
          satoshis: 0,
          height: 207111
        }
      ];
      meowcoind.nodes.push({
        client: {
          getAddressUtxos: sinon.stub().callsArgWith(1, null, {
            result: confirmedUtxos
          }),
          getAddressMempool: sinon.stub().callsArgWith(1, null, {
            result: deltas
          })
        }
      });
      var options = {
        queryMempool: true
      };
      var address = 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja';
      meowcoind.getAddressUnspentOutputs(address, options, function(err, utxos) {
        if (err) {
          return done(err);
        }
        utxos.length.should.equal(0);
        done();
      });
    });
    it('will not filter results if mempool is not spending', function(done) {
      var deltas = [
        {
          txid: 'e9dcf22807db77ac0276b03cc2d3a8b03c4837db8ac6650501ef45af1c807cce',
          satoshis: 10000,
          address: 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja',
          index: 0,
          timestamp: 1461342707725
        }
      ];
      var meowcoind = new MeowcoinService(baseConfig);
      var confirmedUtxos = [
        {
          address: 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja',
          txid: '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0',
          outputIndex: 1,
          script: '76a914f399b4b8894f1153b96fce29f05e6e116eb4c21788ac',
          satoshis: 0,
          height: 207111
        }
      ];
      meowcoind.nodes.push({
        client: {
          getAddressUtxos: sinon.stub().callsArgWith(1, null, {
            result: confirmedUtxos
          }),
          getAddressMempool: sinon.stub().callsArgWith(1, null, {
            result: deltas
          })
        }
      });
      var options = {
        queryMempool: true
      };
      var address = 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja';
      meowcoind.getAddressUnspentOutputs(address, options, function(err, utxos) {
        if (err) {
          return done(err);
        }
        utxos.length.should.equal(2);
        done();
      });
    });
    it('it will handle error from getAddressMempool', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.nodes.push({
        client: {
          getAddressMempool: sinon.stub().callsArgWith(1, {code: -1, message: 'test'})
        }
      });
      var options = {
        queryMempool: true
      };
      var address = 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja';
      meowcoind.getAddressUnspentOutputs(address, options, function(err) {
        err.should.be.instanceOf(Error);
        done();
      });
    });
    it('should set query mempool if undefined', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var getAddressMempool = sinon.stub().callsArgWith(1, {code: -1, message: 'test'});
      meowcoind.nodes.push({
        client: {
          getAddressMempool: getAddressMempool
        }
      });
      var options = {};
      var address = 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja';
      meowcoind.getAddressUnspentOutputs(address, options, function(err) {
        getAddressMempool.callCount.should.equal(1);
        done();
      });
    });
  });

  describe('#_getBalanceFromMempool', function() {
    it('will sum satoshis', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var deltas = [
        {
          satoshis: -1000,
        },
        {
          satoshis: 2000,
        },
        {
          satoshis: -10,
        }
      ];
      var sum = meowcoind._getBalanceFromMempool(deltas);
      sum.should.equal(990);
    });
  });

  describe('#_getTxidsFromMempool', function() {
    it('will filter to txids', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var deltas = [
        {
          txid: 'txid0',
        },
        {
          txid: 'txid1',
        },
        {
          txid: 'txid2',
        }
      ];
      var txids = meowcoind._getTxidsFromMempool(deltas);
      txids.length.should.equal(3);
      txids[0].should.equal('txid0');
      txids[1].should.equal('txid1');
      txids[2].should.equal('txid2');
    });
    it('will not include duplicates', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var deltas = [
        {
          txid: 'txid0',
        },
        {
          txid: 'txid0',
        },
        {
          txid: 'txid1',
        }
      ];
      var txids = meowcoind._getTxidsFromMempool(deltas);
      txids.length.should.equal(2);
      txids[0].should.equal('txid0');
      txids[1].should.equal('txid1');
    });
  });

  describe('#_getHeightRangeQuery', function() {
    it('will detect range query', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var options = {
        start: 20,
        end: 0
      };
      var rangeQuery = meowcoind._getHeightRangeQuery(options);
      rangeQuery.should.equal(true);
    });
    it('will get range properties', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var options = {
        start: 20,
        end: 0
      };
      var clone = {};
      meowcoind._getHeightRangeQuery(options, clone);
      clone.end.should.equal(20);
      clone.start.should.equal(0);
    });
    it('will throw error with invalid range', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var options = {
        start: 0,
        end: 20
      };
      (function() {
        meowcoind._getHeightRangeQuery(options);
      }).should.throw('"end" is expected');
    });
  });

  describe('#getAddressTxids', function() {
    it('will give error from _getHeightRangeQuery', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind._getHeightRangeQuery = sinon.stub().throws(new Error('test'));
      meowcoind.getAddressTxids('address', {}, function(err) {
        err.should.be.instanceOf(Error);
        err.message.should.equal('test');
        done();
      });
    });
    it('will give rpc error from mempool query', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.nodes.push({
        client: {
          getAddressMempool: sinon.stub().callsArgWith(1, {code: -1, message: 'Test error'})
        }
      });
      var options = {};
      var address = 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja';
      meowcoind.getAddressTxids(address, options, function(err) {
        should.exist(err);
        err.should.be.instanceof(errors.RPCError);
      });
    });
    it('will give rpc error from txids query', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.nodes.push({
        client: {
          getAddressTxids: sinon.stub().callsArgWith(1, {code: -1, message: 'Test error'})
        }
      });
      var options = {
        queryMempool: false
      };
      var address = 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja';
      meowcoind.getAddressTxids(address, options, function(err) {
        should.exist(err);
        err.should.be.instanceof(errors.RPCError);
      });
    });
    it('will get txid results', function(done) {
      var expectedTxids = [
        'e9dcf22807db77ac0276b03cc2d3a8b03c4837db8ac6650501ef45af1c807cce',
        'f637384e9f81f18767ea50e00bce58fc9848b6588a1130529eebba22a410155f',
        'f3c1ba3ef86a0420d6102e40e2cfc8682632ab95d09d86a27f5d466b9fa9da47',
        '56fafeb01961831b926558d040c246b97709fd700adcaa916541270583e8e579',
        'bc992ad772eb02864db07ef248d31fb3c6826d25f1153ebf8c79df9b7f70fcf2',
        'f71bccef3a8f5609c7f016154922adbfe0194a96fb17a798c24077c18d0a9345',
        'f35e7e2a2334e845946f3eaca76890d9a68f4393ccc9fe37a0c2fb035f66d2e9',
        'edc080f2084eed362aa488ccc873a24c378dc0979aa29b05767517b70569414a',
        'ed11a08e3102f9610bda44c80c46781d97936a4290691d87244b1b345b39a693',
        'ec94d845c603f292a93b7c829811ac624b76e52b351617ca5a758e9d61a11681'
      ];
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.nodes.push({
        client: {
          getAddressTxids: sinon.stub().callsArgWith(1, null, {
            result: expectedTxids.reverse()
          })
        }
      });
      var options = {
        queryMempool: false
      };
      var address = 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja';
      meowcoind.getAddressTxids(address, options, function(err, txids) {
        if (err) {
          return done(err);
        }
        txids.length.should.equal(expectedTxids.length);
        txids.should.deep.equal(expectedTxids);
        done();
      });
    });
    it('will get txid results from cache', function(done) {
      var expectedTxids = [
        'e9dcf22807db77ac0276b03cc2d3a8b03c4837db8ac6650501ef45af1c807cce'
      ];
      var meowcoind = new MeowcoinService(baseConfig);
      var getAddressTxids = sinon.stub().callsArgWith(1, null, {
        result: expectedTxids.reverse()
      });
      meowcoind.nodes.push({
        client: {
          getAddressTxids: getAddressTxids
        }
      });
      var options = {
        queryMempool: false
      };
      var address = 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja';
      meowcoind.getAddressTxids(address, options, function(err, txids) {
        if (err) {
          return done(err);
        }
        getAddressTxids.callCount.should.equal(1);
        txids.should.deep.equal(expectedTxids);

        meowcoind.getAddressTxids(address, options, function(err, txids) {
          if (err) {
            return done(err);
          }
          getAddressTxids.callCount.should.equal(1);
          txids.should.deep.equal(expectedTxids);
          done();
        });
      });
    });
    it('will get txid results WITHOUT cache if rangeQuery and exclude mempool', function(done) {
      var expectedTxids = [
        'e9dcf22807db77ac0276b03cc2d3a8b03c4837db8ac6650501ef45af1c807cce'
      ];
      var meowcoind = new MeowcoinService(baseConfig);
      var getAddressMempool = sinon.stub();
      var getAddressTxids = sinon.stub().callsArgWith(1, null, {
        result: expectedTxids.reverse()
      });
      meowcoind.nodes.push({
        client: {
          getAddressTxids: getAddressTxids,
          getAddressMempool: getAddressMempool
        }
      });
      var options = {
        queryMempool: true, // start and end will exclude mempool
        start: 4,
        end: 2
      };
      var address = 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja';
      meowcoind.getAddressTxids(address, options, function(err, txids) {
        if (err) {
          return done(err);
        }
        getAddressTxids.callCount.should.equal(1);
        getAddressMempool.callCount.should.equal(0);
        txids.should.deep.equal(expectedTxids);

        meowcoind.getAddressTxids(address, options, function(err, txids) {
          if (err) {
            return done(err);
          }
          getAddressTxids.callCount.should.equal(2);
          getAddressMempool.callCount.should.equal(0);
          txids.should.deep.equal(expectedTxids);
          done();
        });
      });
    });
    it('will get txid results from cache and live mempool', function(done) {
      var expectedTxids = [
        'e9dcf22807db77ac0276b03cc2d3a8b03c4837db8ac6650501ef45af1c807cce'
      ];
      var meowcoind = new MeowcoinService(baseConfig);
      var getAddressTxids = sinon.stub().callsArgWith(1, null, {
        result: expectedTxids.reverse()
      });
      var getAddressMempool = sinon.stub().callsArgWith(1, null, {
        result: [
          {
            txid: 'bc992ad772eb02864db07ef248d31fb3c6826d25f1153ebf8c79df9b7f70fcf2'
          },
          {
            txid: 'f71bccef3a8f5609c7f016154922adbfe0194a96fb17a798c24077c18d0a9345'
          },
          {
            txid: 'f35e7e2a2334e845946f3eaca76890d9a68f4393ccc9fe37a0c2fb035f66d2e9'
          }
        ]
      });
      meowcoind.nodes.push({
        client: {
          getAddressTxids: getAddressTxids,
          getAddressMempool: getAddressMempool
        }
      });
      var address = 'RM1FZ5Q4sKxsM1a97dLoUrjZYHZ7B6MKja';
      meowcoind.getAddressTxids(address, {queryMempool: false}, function(err, txids) {
        if (err) {
          return done(err);
        }
        getAddressTxids.callCount.should.equal(1);
        txids.should.deep.equal(expectedTxids);

        meowcoind.getAddressTxids(address, {queryMempool: true}, function(err, txids) {
          if (err) {
            return done(err);
          }
          getAddressTxids.callCount.should.equal(1);
          txids.should.deep.equal([
            'f35e7e2a2334e845946f3eaca76890d9a68f4393ccc9fe37a0c2fb035f66d2e9', // mempool
            'f71bccef3a8f5609c7f016154922adbfe0194a96fb17a798c24077c18d0a9345', // mempool
            'bc992ad772eb02864db07ef248d31fb3c6826d25f1153ebf8c79df9b7f70fcf2', // mempool
            'e9dcf22807db77ac0276b03cc2d3a8b03c4837db8ac6650501ef45af1c807cce' // confirmed
          ]);

          meowcoind.getAddressTxids(address, {queryMempoolOnly: true}, function(err, txids) {
            if (err) {
              return done(err);
            }
            getAddressTxids.callCount.should.equal(1);
            txids.should.deep.equal([
              'f35e7e2a2334e845946f3eaca76890d9a68f4393ccc9fe37a0c2fb035f66d2e9', // mempool
              'f71bccef3a8f5609c7f016154922adbfe0194a96fb17a798c24077c18d0a9345', // mempool
              'bc992ad772eb02864db07ef248d31fb3c6826d25f1153ebf8c79df9b7f70fcf2', // mempool
            ]);
            done();
          });
        });
      });
    });
  });

  describe('#_getConfirmationDetail', function() {
    var sandbox = sinon.sandbox.create();
    beforeEach(function() {
      sandbox.stub(log, 'warn');
    });
    afterEach(function() {
      sandbox.restore();
    });
    it('should get 0 confirmation', function() {
      var tx = new Transaction(txhex);
      tx.height = -1;
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.height = 10;
      var confirmations = meowcoind._getConfirmationsDetail(tx);
      confirmations.should.equal(0);
    });
    it('should get 1 confirmation', function() {
      var tx = new Transaction(txhex);
      tx.height = 10;
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.height = 10;
      var confirmations = meowcoind._getConfirmationsDetail(tx);
      confirmations.should.equal(1);
    });
    it('should get 2 confirmation', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var tx = new Transaction(txhex);
      meowcoind.height = 11;
      tx.height = 10;
      var confirmations = meowcoind._getConfirmationsDetail(tx);
      confirmations.should.equal(2);
    });
    it('should get 0 confirmation with overflow', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var tx = new Transaction(txhex);
      meowcoind.height = 3;
      tx.height = 10;
      var confirmations = meowcoind._getConfirmationsDetail(tx);
      log.warn.callCount.should.equal(1);
      confirmations.should.equal(0);
    });
    it('should get 1000 confirmation', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var tx = new Transaction(txhex);
      meowcoind.height = 1000;
      tx.height = 1;
      var confirmations = meowcoind._getConfirmationsDetail(tx);
      confirmations.should.equal(1000);
    });
  });

  describe('#_getAddressDetailsForInput', function() {
    it('will return if missing an address', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var result = {};
      meowcoind._getAddressDetailsForInput({}, 0, result, []);
      should.not.exist(result.addresses);
      should.not.exist(result.satoshis);
    });
    it('will only add address if it matches', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var result = {};
      meowcoind._getAddressDetailsForInput({
        address: 'address1'
      }, 0, result, ['address2']);
      should.not.exist(result.addresses);
      should.not.exist(result.satoshis);
    });
    it('will instantiate if outputIndexes not defined', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var result = {
        addresses: {}
      };
      meowcoind._getAddressDetailsForInput({
        address: 'address1'
      }, 0, result, ['address1']);
      should.exist(result.addresses);
      result.addresses['address1'].inputIndexes.should.deep.equal([0]);
      result.addresses['address1'].outputIndexes.should.deep.equal([]);
    });
    it('will push to inputIndexes', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var result = {
        addresses: {
          'address1': {
            inputIndexes: [1]
          }
        }
      };
      meowcoind._getAddressDetailsForInput({
        address: 'address1'
      }, 2, result, ['address1']);
      should.exist(result.addresses);
      result.addresses['address1'].inputIndexes.should.deep.equal([1, 2]);
    });
  });

  describe('#_getAddressDetailsForOutput', function() {
    it('will return if missing an address', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var result = {};
      meowcoind._getAddressDetailsForOutput({}, 0, result, []);
      should.not.exist(result.addresses);
      should.not.exist(result.satoshis);
    });
    it('will only add address if it matches', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var result = {};
      meowcoind._getAddressDetailsForOutput({
        address: 'address1'
      }, 0, result, ['address2']);
      should.not.exist(result.addresses);
      should.not.exist(result.satoshis);
    });
    it('will instantiate if outputIndexes not defined', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var result = {
        addresses: {}
      };
      meowcoind._getAddressDetailsForOutput({
        address: 'address1'
      }, 0, result, ['address1']);
      should.exist(result.addresses);
      result.addresses['address1'].inputIndexes.should.deep.equal([]);
      result.addresses['address1'].outputIndexes.should.deep.equal([0]);
    });
    it('will push if outputIndexes defined', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var result = {
        addresses: {
          'address1': {
            outputIndexes: [0]
          }
        }
      };
      meowcoind._getAddressDetailsForOutput({
        address: 'address1'
      }, 1, result, ['address1']);
      should.exist(result.addresses);
      result.addresses['address1'].outputIndexes.should.deep.equal([0, 1]);
    });
  });

  describe('#_getAddressDetailsForTransaction', function() {
    it('will calculate details for the transaction', function(done) {
      /* jshint sub:true */
      var tx = {
        inputs: [
          {
            satoshis: 1000000000,
            address: 'mgY65WSfEmsyYaYPQaXhmXMeBhwp4EcsQW'
          }
        ],
        outputs: [
          {
            satoshis: 100000000,
            address: 'mgY65WSfEmsyYaYPQaXhmXMeBhwp4EcsQW'
          },
          {
            satoshis: 200000000,
            address: 'mgY65WSfEmsyYaYPQaXhmXMeBhwp4EcsQW'
          },
          {
            satoshis: 50000000,
            address: 'mgY65WSfEmsyYaYPQaXhmXMeBhwp4EcsQW'
          },
          {
            satoshis: 300000000,
            address: 'mgY65WSfEmsyYaYPQaXhmXMeBhwp4EcsQW'
          },
          {
            satoshis: 349990000,
            address: 'mgY65WSfEmsyYaYPQaXhmXMeBhwp4EcsQW'
          }
        ],
        locktime: 0
      };
      var meowcoind = new MeowcoinService(baseConfig);
      var addresses = ['mgY65WSfEmsyYaYPQaXhmXMeBhwp4EcsQW'];
      var details = meowcoind._getAddressDetailsForTransaction(tx, addresses);
      should.exist(details.addresses['mgY65WSfEmsyYaYPQaXhmXMeBhwp4EcsQW']);
      details.addresses['mgY65WSfEmsyYaYPQaXhmXMeBhwp4EcsQW'].inputIndexes.should.deep.equal([0]);
      details.addresses['mgY65WSfEmsyYaYPQaXhmXMeBhwp4EcsQW'].outputIndexes.should.deep.equal([
        0, 1, 2, 3, 4
      ]);
      details.satoshis.should.equal(-10000);
      done();
    });
  });

  describe('#_getAddressDetailedTransaction', function() {
    it('will get detailed transaction info', function(done) {
      var txid = '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0';
      var tx = {
        height: 20,
      };
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.getDetailedTransaction = sinon.stub().callsArgWith(1, null, tx);
      meowcoind.height = 300;
      var addresses = {};
      meowcoind._getAddressDetailsForTransaction = sinon.stub().returns({
        addresses: addresses,
        satoshis: 1000,
      });
      meowcoind._getAddressDetailedTransaction(txid, {}, function(err, details) {
        if (err) {
          return done(err);
        }
        details.addresses.should.equal(addresses);
        details.satoshis.should.equal(1000);
        details.confirmations.should.equal(281);
        details.tx.should.equal(tx);
        done();
      });
    });
    it('give error from getDetailedTransaction', function(done) {
      var txid = '46f24e0c274fc07708b781963576c4c5d5625d926dbb0a17fa865dcd9fe58ea0';
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.getDetailedTransaction = sinon.stub().callsArgWith(1, new Error('test'));
      meowcoind._getAddressDetailedTransaction(txid, {}, function(err) {
        err.should.be.instanceof(Error);
        done();
      });
    });
  });

  describe('#_getAddressStrings', function() {
    it('will get address strings from meowcoincore addresses', function() {
      var addresses = [
        meowcoincore.Address('RJYZeWxr1Ly8YgcvJU1qD5MR9jUtk14HkN'),
        meowcoincore.Address('rAfsiNFiHsvDwEA1JsaE9Qmad5CgPVbELh'),
      ];
      var meowcoind = new MeowcoinService(baseConfig);
      var strings = meowcoind._getAddressStrings(addresses);
      strings[0].should.equal('RJYZeWxr1Ly8YgcvJU1qD5MR9jUtk14HkN');
      strings[1].should.equal('rAfsiNFiHsvDwEA1JsaE9Qmad5CgPVbELh');
    });
    it('will get address strings from strings', function() {
      var addresses = [
        'RJYZeWxr1Ly8YgcvJU1qD5MR9jUtk14HkN',
        'rAfsiNFiHsvDwEA1JsaE9Qmad5CgPVbELh',
      ];
      var meowcoind = new MeowcoinService(baseConfig);
      var strings = meowcoind._getAddressStrings(addresses);
      strings[0].should.equal('RJYZeWxr1Ly8YgcvJU1qD5MR9jUtk14HkN');
      strings[1].should.equal('rAfsiNFiHsvDwEA1JsaE9Qmad5CgPVbELh');
    });
    it('will get address strings from mixture of types', function() {
      var addresses = [
        meowcoincore.Address('RJYZeWxr1Ly8YgcvJU1qD5MR9jUtk14HkN'),
        'rAfsiNFiHsvDwEA1JsaE9Qmad5CgPVbELh',
      ];
      var meowcoind = new MeowcoinService(baseConfig);
      var strings = meowcoind._getAddressStrings(addresses);
      strings[0].should.equal('RJYZeWxr1Ly8YgcvJU1qD5MR9jUtk14HkN');
      strings[1].should.equal('rAfsiNFiHsvDwEA1JsaE9Qmad5CgPVbELh');
    });
    it('will give error with unknown', function() {
      var addresses = [
        meowcoincore.Address('RJYZeWxr1Ly8YgcvJU1qD5MR9jUtk14HkN'),
        0,
      ];
      var meowcoind = new MeowcoinService(baseConfig);
      (function() {
        meowcoind._getAddressStrings(addresses);
      }).should.throw(TypeError);
    });
  });

  describe('#_paginateTxids', function() {
    it('slice txids based on "from" and "to" (3 to 13)', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var txids = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      var paginated = meowcoind._paginateTxids(txids, 3, 13);
      paginated.should.deep.equal([3, 4, 5, 6, 7, 8, 9, 10]);
    });
    it('slice txids based on "from" and "to" (0 to 3)', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var txids = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      var paginated = meowcoind._paginateTxids(txids, 0, 3);
      paginated.should.deep.equal([0, 1, 2]);
    });
    it('slice txids based on "from" and "to" (0 to 1)', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var txids = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      var paginated = meowcoind._paginateTxids(txids, 0, 1);
      paginated.should.deep.equal([0]);
    });
    it('will throw error if "from" is greater than "to"', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var txids = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      (function() {
        meowcoind._paginateTxids(txids, 1, 0);
      }).should.throw('"from" (1) is expected to be less than "to"');
    });
    it('will handle string numbers', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var txids = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      var paginated = meowcoind._paginateTxids(txids, '1', '3');
      paginated.should.deep.equal([1, 2]);
    });
  });

  describe('#getAddressHistory', function() {
    var address = '12c6DSiU4Rq3P4ZxziKxzrL5LmMBrzjrJX';
    it('will give error with "from" and "to" range that exceeds max size', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.getAddressHistory(address, {from: 0, to: 51}, function(err) {
        should.exist(err);
        err.message.match(/^\"from/);
        done();
      });
    });
    it('will give error with "from" and "to" order is reversed', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.getAddressTxids = sinon.stub().callsArgWith(2, null, []);
      meowcoind.getAddressHistory(address, {from: 51, to: 0}, function(err) {
        should.exist(err);
        err.message.match(/^\"from/);
        done();
      });
    });
    it('will give error from _getAddressDetailedTransaction', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.getAddressTxids = sinon.stub().callsArgWith(2, null, ['txid']);
      meowcoind._getAddressDetailedTransaction = sinon.stub().callsArgWith(2, new Error('test'));
      meowcoind.getAddressHistory(address, {}, function(err) {
        should.exist(err);
        err.message.should.equal('test');
        done();
      });
    });
    it('will give an error if length of addresses is too long', function(done) {
      var addresses = [];
      for (var i = 0; i < 101; i++) {
        addresses.push(address);
      }
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.maxAddressesQuery = 100;
      meowcoind.getAddressHistory(addresses, {}, function(err) {
        should.exist(err);
        err.message.match(/Maximum/);
        done();
      });
    });
    it('give error from getAddressTxids', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.getAddressTxids = sinon.stub().callsArgWith(2, new Error('test'));
      meowcoind.getAddressHistory('address', {}, function(err) {
        should.exist(err);
        err.should.be.instanceof(Error);
        err.message.should.equal('test');
        done();
      });
    });
    it('will paginate', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind._getAddressDetailedTransaction = function(txid, options, callback) {
        callback(null, txid);
      };
      var txids = ['one', 'two', 'three', 'four'];
      meowcoind.getAddressTxids = sinon.stub().callsArgWith(2, null, txids);
      meowcoind.getAddressHistory('address', {from: 1, to: 3}, function(err, data) {
        if (err) {
          return done(err);
        }
        data.items.length.should.equal(2);
        data.items.should.deep.equal(['two', 'three']);
        done();
      });
    });
  });

  describe('#getAddressSummary', function() {
    var txid1 = '70d9d441d7409aace8e0ffe24ff0190407b2fcb405799a266e0327017288d1f8';
    var txid2 = '35fafaf572341798b2ce2858755afa7c8800bb6b1e885d3e030b81255b5e172d';
    var txid3 = '57b7842afc97a2b46575b490839df46e9273524c6ea59ba62e1e86477cf25247';
    var memtxid1 = 'b1bfa8dbbde790cb46b9763ef3407c1a21c8264b67bfe224f462ec0e1f569e92';
    var memtxid2 = 'e9dcf22807db77ac0276b03cc2d3a8b03c4837db8ac6650501ef45af1c807cce';
    it('will handle error from getAddressTxids', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.nodes.push({
        client: {
          getAddressMempool: sinon.stub().callsArgWith(1, null, {
            result: [
              {
                txid: '70d9d441d7409aace8e0ffe24ff0190407b2fcb405799a266e0327017288d1f8',
              }
            ]
          })
        }
      });
      meowcoind.getAddressTxids = sinon.stub().callsArgWith(2, new Error('test'));
      meowcoind.getAddressBalance = sinon.stub().callsArgWith(2, null, {});
      var address = '';
      var options = {};
      meowcoind.getAddressSummary(address, options, function(err) {
        should.exist(err);
        err.should.be.instanceof(Error);
        err.message.should.equal('test');
        done();
      });
    });
    it('will handle error from getAddressBalance', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.nodes.push({
        client: {
          getAddressMempool: sinon.stub().callsArgWith(1, null, {
            result: [
              {
                txid: '70d9d441d7409aace8e0ffe24ff0190407b2fcb405799a266e0327017288d1f8',
              }
            ]
          })
        }
      });
      meowcoind.getAddressTxids = sinon.stub().callsArgWith(2, null, {});
      meowcoind.getAddressBalance = sinon.stub().callsArgWith(2, new Error('test'), {});
      var address = '';
      var options = {};
      meowcoind.getAddressSummary(address, options, function(err) {
        should.exist(err);
        err.should.be.instanceof(Error);
        err.message.should.equal('test');
        done();
      });
    });
    it('will handle error from client getAddressMempool', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.nodes.push({
        client: {
          getAddressMempool: sinon.stub().callsArgWith(1, {code: -1, message: 'Test error'})
        }
      });
      meowcoind.getAddressTxids = sinon.stub().callsArgWith(2, null, {});
      meowcoind.getAddressBalance = sinon.stub().callsArgWith(2, null, {});
      var address = '';
      var options = {};
      meowcoind.getAddressSummary(address, options, function(err) {
        should.exist(err);
        err.should.be.instanceof(Error);
        err.message.should.equal('Test error');
        done();
      });
    });
    it('should set all properties', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.nodes.push({
        client: {
          getAddressMempool: sinon.stub().callsArgWith(1, null, {
            result: [
              {
                txid: memtxid1,
                satoshis: -1000000
              },
              {
                txid: memtxid2,
                satoshis: 99999
              }
            ]
          })
        }
      });
      sinon.spy(meowcoind, '_paginateTxids');
      meowcoind.getAddressTxids = sinon.stub().callsArgWith(2, null, [txid1, txid2, txid3]);
      meowcoind.getAddressBalance = sinon.stub().callsArgWith(2, null, {
        received: 30 * 1e8,
        balance: 20 * 1e8
      });
      var address = '3NbU8XzUgKyuCgYgZEKsBtUvkTm2r7Xgwj';
      var options = {};
      meowcoind.getAddressSummary(address, options, function(err, summary) {
        meowcoind._paginateTxids.callCount.should.equal(1);
        meowcoind._paginateTxids.args[0][1].should.equal(0);
        meowcoind._paginateTxids.args[0][2].should.equal(1000);
        summary.appearances.should.equal(3);
        summary.totalReceived.should.equal(3000000000);
        summary.totalSpent.should.equal(1000000000);
        summary.balance.should.equal(2000000000);
        summary.unconfirmedAppearances.should.equal(2);
        summary.unconfirmedBalance.should.equal(-900001);
        summary.txids.should.deep.equal([
          'e9dcf22807db77ac0276b03cc2d3a8b03c4837db8ac6650501ef45af1c807cce',
          'b1bfa8dbbde790cb46b9763ef3407c1a21c8264b67bfe224f462ec0e1f569e92',
          '70d9d441d7409aace8e0ffe24ff0190407b2fcb405799a266e0327017288d1f8',
          '35fafaf572341798b2ce2858755afa7c8800bb6b1e885d3e030b81255b5e172d',
          '57b7842afc97a2b46575b490839df46e9273524c6ea59ba62e1e86477cf25247'
        ]);
        done();
      });
    });
    it('will give error with "from" and "to" range that exceeds max size', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.nodes.push({
        client: {
          getAddressMempool: sinon.stub().callsArgWith(1, null, {
            result: [
              {
                txid: memtxid1,
                satoshis: -1000000
              },
              {
                txid: memtxid2,
                satoshis: 99999
              }
            ]
          })
        }
      });
      meowcoind.getAddressTxids = sinon.stub().callsArgWith(2, null, [txid1, txid2, txid3]);
      meowcoind.getAddressBalance = sinon.stub().callsArgWith(2, null, {
        received: 30 * 1e8,
        balance: 20 * 1e8
      });
      var address = '3NbU8XzUgKyuCgYgZEKsBtUvkTm2r7Xgwj';
      var options = {
        from: 0,
        to: 1001
      };
      meowcoind.getAddressSummary(address, options, function(err) {
        should.exist(err);
        err.message.match(/^\"from/);
        done();
      });
    });
    it('will get from cache with noTxList', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.nodes.push({
        client: {
          getAddressMempool: sinon.stub().callsArgWith(1, null, {
            result: [
              {
                txid: memtxid1,
                satoshis: -1000000
              },
              {
                txid: memtxid2,
                satoshis: 99999
              }
            ]
          })
        }
      });
      meowcoind.getAddressTxids = sinon.stub().callsArgWith(2, null, [txid1, txid2, txid3]);
      meowcoind.getAddressBalance = sinon.stub().callsArgWith(2, null, {
        received: 30 * 1e8,
        balance: 20 * 1e8
      });
      var address = '3NbU8XzUgKyuCgYgZEKsBtUvkTm2r7Xgwj';
      var options = {
        noTxList: true
      };
      function checkSummary(summary) {
        summary.appearances.should.equal(3);
        summary.totalReceived.should.equal(3000000000);
        summary.totalSpent.should.equal(1000000000);
        summary.balance.should.equal(2000000000);
        summary.unconfirmedAppearances.should.equal(2);
        summary.unconfirmedBalance.should.equal(-900001);
        should.not.exist(summary.txids);
      }
      meowcoind.getAddressSummary(address, options, function(err, summary) {
        checkSummary(summary);
        meowcoind.getAddressTxids.callCount.should.equal(1);
        meowcoind.getAddressBalance.callCount.should.equal(1);
        meowcoind.getAddressSummary(address, options, function(err, summary) {
          checkSummary(summary);
          meowcoind.getAddressTxids.callCount.should.equal(1);
          meowcoind.getAddressBalance.callCount.should.equal(1);
          done();
        });
      });
    });
    it('will skip querying the mempool with queryMempool set to false', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var getAddressMempool = sinon.stub();
      meowcoind.nodes.push({
        client: {
          getAddressMempool: getAddressMempool
        }
      });
      sinon.spy(meowcoind, '_paginateTxids');
      meowcoind.getAddressTxids = sinon.stub().callsArgWith(2, null, [txid1, txid2, txid3]);
      meowcoind.getAddressBalance = sinon.stub().callsArgWith(2, null, {
        received: 30 * 1e8,
        balance: 20 * 1e8
      });
      var address = '3NbU8XzUgKyuCgYgZEKsBtUvkTm2r7Xgwj';
      var options = {
        queryMempool: false
      };
      meowcoind.getAddressSummary(address, options, function() {
        getAddressMempool.callCount.should.equal(0);
        done();
      });
    });
    it('will give error from _paginateTxids', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var getAddressMempool = sinon.stub();
      meowcoind.nodes.push({
        client: {
          getAddressMempool: getAddressMempool
        }
      });
      sinon.spy(meowcoind, '_paginateTxids');
      meowcoind.getAddressTxids = sinon.stub().callsArgWith(2, null, [txid1, txid2, txid3]);
      meowcoind.getAddressBalance = sinon.stub().callsArgWith(2, null, {
        received: 30 * 1e8,
        balance: 20 * 1e8
      });
      meowcoind._paginateTxids = sinon.stub().throws(new Error('test'));
      var address = '3NbU8XzUgKyuCgYgZEKsBtUvkTm2r7Xgwj';
      var options = {
        queryMempool: false
      };
      meowcoind.getAddressSummary(address, options, function(err) {
        err.should.be.instanceOf(Error);
        err.message.should.equal('test');
        done();
      });
    });
  });

  describe('#getRawBlock', function() {
    var blockhash = '00000000050a6d07f583beba2d803296eb1e9d4980c4a20f206c584e89a4f02b';
    var blockhex = '0100000000000000000000000000000000000000000000000000000000000000000000003ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a29ab5f49ffff001d1dac2b7c0101000000010000000000000000000000000000000000000000000000000000000000000000ffffffff4d04ffff001d0104455468652054696d65732030332f4a616e2f32303039204368616e63656c6c6f72206f6e206272696e6b206f66207365636f6e64206261696c6f757420666f722062616e6b73ffffffff0100f2052a01000000434104678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5fac00000000';
    it('will give rcp error from client getblockhash', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.nodes.push({
        client: {
          getBlockHash: sinon.stub().callsArgWith(1, {code: -1, message: 'Test error'})
        }
      });
      meowcoind.getRawBlock(10, function(err) {
        should.exist(err);
        err.should.be.instanceof(errors.RPCError);
        done();
      });
    });
    it('will give rcp error from client getblock', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.nodes.push({
        client: {
          getBlock: sinon.stub().callsArgWith(2, {code: -1, message: 'Test error'})
        }
      });
      meowcoind.getRawBlock(blockhash, function(err) {
        should.exist(err);
        err.should.be.instanceof(errors.RPCError);
        done();
      });
    });
    it('will try all nodes for getblock', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var getBlockWithError = sinon.stub().callsArgWith(2, {code: -1, message: 'Test error'});
      meowcoind.tryAllInterval = 1;
      meowcoind.nodes.push({
        client: {
          getBlock: getBlockWithError
        }
      });
      meowcoind.nodes.push({
        client: {
          getBlock: getBlockWithError
        }
      });
      meowcoind.nodes.push({
        client: {
          getBlock: sinon.stub().callsArgWith(2, null, {
            result: blockhex
          })
        }
      });
      meowcoind.getRawBlock(blockhash, function(err, buffer) {
        if (err) {
          return done(err);
        }
        buffer.should.be.instanceof(Buffer);
        getBlockWithError.callCount.should.equal(2);
        done();
      });
    });
    it('will get block from cache', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var getBlock = sinon.stub().callsArgWith(2, null, {
        result: blockhex
      });
      meowcoind.nodes.push({
        client: {
          getBlock: getBlock
        }
      });
      meowcoind.getRawBlock(blockhash, function(err, buffer) {
        if (err) {
          return done(err);
        }
        buffer.should.be.instanceof(Buffer);
        getBlock.callCount.should.equal(1);
        meowcoind.getRawBlock(blockhash, function(err, buffer) {
          if (err) {
            return done(err);
          }
          buffer.should.be.instanceof(Buffer);
          getBlock.callCount.should.equal(1);
          done();
        });
      });
    });
    it('will get block by height', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var getBlock = sinon.stub().callsArgWith(2, null, {
        result: blockhex
      });
      var getBlockHash = sinon.stub().callsArgWith(1, null, {
        result: '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f'
      });
      meowcoind.nodes.push({
        client: {
          getBlock: getBlock,
          getBlockHash: getBlockHash
        }
      });
      meowcoind.getRawBlock(0, function(err, buffer) {
        if (err) {
          return done(err);
        }
        buffer.should.be.instanceof(Buffer);
        getBlock.callCount.should.equal(1);
        getBlockHash.callCount.should.equal(1);
        done();
      });
    });
  });

  describe('#getBlock', function() {
    var blockhex = '0100000000000000000000000000000000000000000000000000000000000000000000003ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a29ab5f49ffff001d1dac2b7c0101000000010000000000000000000000000000000000000000000000000000000000000000ffffffff4d04ffff001d0104455468652054696d65732030332f4a616e2f32303039204368616e63656c6c6f72206f6e206272696e6b206f66207365636f6e64206261696c6f757420666f722062616e6b73ffffffff0100f2052a01000000434104678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5fac00000000';
    it('will give an rpc error from client getblock', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var getBlock = sinon.stub().callsArgWith(2, {code: -1, message: 'Test error'});
      var getBlockHash = sinon.stub().callsArgWith(1, null, {});
      meowcoind.nodes.push({
        client: {
          getBlock: getBlock,
          getBlockHash: getBlockHash
        }
      });
      meowcoind.getBlock(0, function(err) {
        err.should.be.instanceof(Error);
        done();
      });
    });
    it('will give an rpc error from client getblockhash', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var getBlockHash = sinon.stub().callsArgWith(1, {code: -1, message: 'Test error'});
      meowcoind.nodes.push({
        client: {
          getBlockHash: getBlockHash
        }
      });
      meowcoind.getBlock(0, function(err) {
        err.should.be.instanceof(Error);
        done();
      });
    });
    it('will getblock as meowcoincore object from height', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var getBlock = sinon.stub().callsArgWith(2, null, {
        result: blockhex
      });
      var getBlockHash = sinon.stub().callsArgWith(1, null, {
        result: '00000000050a6d07f583beba2d803296eb1e9d4980c4a20f206c584e89a4f02b'
      });
      meowcoind.nodes.push({
        client: {
          getBlock: getBlock,
          getBlockHash: getBlockHash
        }
      });
      meowcoind.getBlock(0, function(err, block) {
        should.not.exist(err);
        getBlock.args[0][0].should.equal('00000000050a6d07f583beba2d803296eb1e9d4980c4a20f206c584e89a4f02b');
        getBlock.args[0][1].should.equal(false);
        block.should.be.instanceof(meowcoincore.Block);
        done();
      });
    });
    it('will getblock as meowcoincore object', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var getBlock = sinon.stub().callsArgWith(2, null, {
        result: blockhex
      });
      var getBlockHash = sinon.stub();
      meowcoind.nodes.push({
        client: {
          getBlock: getBlock,
          getBlockHash: getBlockHash
        }
      });
      meowcoind.getBlock('00000000050a6d07f583beba2d803296eb1e9d4980c4a20f206c584e89a4f02b', function(err, block) {
        should.not.exist(err);
        getBlockHash.callCount.should.equal(0);
        getBlock.callCount.should.equal(1);
        getBlock.args[0][0].should.equal('00000000050a6d07f583beba2d803296eb1e9d4980c4a20f206c584e89a4f02b');
        getBlock.args[0][1].should.equal(false);
        block.should.be.instanceof(meowcoincore.Block);
        done();
      });
    });
    it('will get block from cache', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var getBlock = sinon.stub().callsArgWith(2, null, {
        result: blockhex
      });
      var getBlockHash = sinon.stub();
      meowcoind.nodes.push({
        client: {
          getBlock: getBlock,
          getBlockHash: getBlockHash
        }
      });
      var hash = '00000000050a6d07f583beba2d803296eb1e9d4980c4a20f206c584e89a4f02b';
      meowcoind.getBlock(hash, function(err, block) {
        should.not.exist(err);
        getBlockHash.callCount.should.equal(0);
        getBlock.callCount.should.equal(1);
        block.should.be.instanceof(meowcoincore.Block);
        meowcoind.getBlock(hash, function(err, block) {
          should.not.exist(err);
          getBlockHash.callCount.should.equal(0);
          getBlock.callCount.should.equal(1);
          block.should.be.instanceof(meowcoincore.Block);
          done();
        });
      });
    });
    it('will get block from cache with height (but not height)', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var getBlock = sinon.stub().callsArgWith(2, null, {
        result: blockhex
      });
      var getBlockHash = sinon.stub().callsArgWith(1, null, {
        result: '00000000050a6d07f583beba2d803296eb1e9d4980c4a20f206c584e89a4f02b'
      });
      meowcoind.nodes.push({
        client: {
          getBlock: getBlock,
          getBlockHash: getBlockHash
        }
      });
      meowcoind.getBlock(0, function(err, block) {
        should.not.exist(err);
        getBlockHash.callCount.should.equal(1);
        getBlock.callCount.should.equal(1);
        block.should.be.instanceof(meowcoincore.Block);
        meowcoind.getBlock(0, function(err, block) {
          should.not.exist(err);
          getBlockHash.callCount.should.equal(2);
          getBlock.callCount.should.equal(1);
          block.should.be.instanceof(meowcoincore.Block);
          done();
        });
      });
    });
  });

  describe('#getBlockHashesByTimestamp', function() {
    it('should give an rpc error', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var getBlockHashes = sinon.stub().callsArgWith(3, {message: 'error', code: -1});
      meowcoind.nodes.push({
        client: {
          getBlockHashes: getBlockHashes
        }
      });
      meowcoind.getBlockHashesByTimestamp(1441911000, 1441914000, function(err, hashes) {
        should.exist(err);
        err.message.should.equal('error');
        done();
      });
    });
    it('should get the correct block hashes', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var block1 = '00000000050a6d07f583beba2d803296eb1e9d4980c4a20f206c584e89a4f02b';
      var block2 = '000000000383752a55a0b2891ce018fd0fdc0b6352502772b034ec282b4a1bf6';
      var getBlockHashes = sinon.stub().callsArgWith(3, null, {
        result: [block2, block1]
      });
      meowcoind.nodes.push({
        client: {
          getBlockHashes: getBlockHashes
        }
      });
      meowcoind.getBlockHashesByTimestamp(1441914000, 1441911000, function(err, hashes) {
        should.not.exist(err);
        hashes.should.deep.equal([block2, block1]);
        done();
      });
    });
  });

  describe('#getBlockHeader', function() {
    var blockhash = '00000000050a6d07f583beba2d803296eb1e9d4980c4a20f206c584e89a4f02b';
    it('will give error from getBlockHash', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var getBlockHash = sinon.stub().callsArgWith(1, {code: -1, message: 'Test error'});
      meowcoind.nodes.push({
        client: {
          getBlockHash: getBlockHash
        }
      });
      meowcoind.getBlockHeader(10, function(err) {
        err.should.be.instanceof(Error);
      });
    });
    it('it will give rpc error from client getblockheader', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var getBlockHeader = sinon.stub().callsArgWith(1, {code: -1, message: 'Test error'});
      meowcoind.nodes.push({
        client: {
          getBlockHeader: getBlockHeader
        }
      });
      meowcoind.getBlockHeader(blockhash, function(err) {
        err.should.be.instanceof(Error);
      });
    });
    it('it will give rpc error from client getblockhash', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var getBlockHeader = sinon.stub();
      var getBlockHash = sinon.stub().callsArgWith(1, {code: -1, message: 'Test error'});
      meowcoind.nodes.push({
        client: {
          getBlockHeader: getBlockHeader,
          getBlockHash: getBlockHash
        }
      });
      meowcoind.getBlockHeader(0, function(err) {
        err.should.be.instanceof(Error);
      });
    });
    it('will give result from client getblockheader (from height)', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var result = {
        hash: '0000000000000a817cd3a74aec2f2246b59eb2cbb1ad730213e6c4a1d68ec2f6',
        version: 536870912,
        confirmations: 5,
        height: 828781,
        chainWork: '00000000000000000000000000000000000000000000000ad467352c93bc6a3b',
        prevHash: '0000000000000504235b2aff578a48470dbf6b94dafa9b3703bbf0ed554c9dd9',
        nextHash: '00000000000000eedd967ec155f237f033686f0924d574b946caf1b0e89551b8',
        merkleRoot: '124e0f3fb5aa268f102b0447002dd9700988fc570efcb3e0b5b396ac7db437a9',
        time: 1462979126,
        medianTime: 1462976771,
        nonce: 2981820714,
        bits: '1a13ca10',
        difficulty: 847779.0710240941
      };
      var getBlockHeader = sinon.stub().callsArgWith(1, null, {
        result: {
          hash: '0000000000000a817cd3a74aec2f2246b59eb2cbb1ad730213e6c4a1d68ec2f6',
          version: 536870912,
          confirmations: 5,
          height: 828781,
          chainwork: '00000000000000000000000000000000000000000000000ad467352c93bc6a3b',
          previousblockhash: '0000000000000504235b2aff578a48470dbf6b94dafa9b3703bbf0ed554c9dd9',
          nextblockhash: '00000000000000eedd967ec155f237f033686f0924d574b946caf1b0e89551b8',
          merkleroot: '124e0f3fb5aa268f102b0447002dd9700988fc570efcb3e0b5b396ac7db437a9',
          time: 1462979126,
          mediantime: 1462976771,
          nonce: 2981820714,
          bits: '1a13ca10',
          difficulty: 847779.0710240941
        }
      });
      var getBlockHash = sinon.stub().callsArgWith(1, null, {
        result: blockhash
      });
      meowcoind.nodes.push({
        client: {
          getBlockHeader: getBlockHeader,
          getBlockHash: getBlockHash
        }
      });
      meowcoind.getBlockHeader(0, function(err, blockHeader) {
        should.not.exist(err);
        getBlockHeader.args[0][0].should.equal(blockhash);
        blockHeader.should.deep.equal(result);
      });
    });
    it('will give result from client getblockheader (from hash)', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var result = {
        hash: '0000000000000a817cd3a74aec2f2246b59eb2cbb1ad730213e6c4a1d68ec2f6',
        version: 536870912,
        confirmations: 5,
        height: 828781,
        chainWork: '00000000000000000000000000000000000000000000000ad467352c93bc6a3b',
        prevHash: '0000000000000504235b2aff578a48470dbf6b94dafa9b3703bbf0ed554c9dd9',
        nextHash: '00000000000000eedd967ec155f237f033686f0924d574b946caf1b0e89551b8',
        merkleRoot: '124e0f3fb5aa268f102b0447002dd9700988fc570efcb3e0b5b396ac7db437a9',
        time: 1462979126,
        medianTime: 1462976771,
        nonce: 2981820714,
        bits: '1a13ca10',
        difficulty: 847779.0710240941
      };
      var getBlockHeader = sinon.stub().callsArgWith(1, null, {
        result: {
          hash: '0000000000000a817cd3a74aec2f2246b59eb2cbb1ad730213e6c4a1d68ec2f6',
          version: 536870912,
          confirmations: 5,
          height: 828781,
          chainwork: '00000000000000000000000000000000000000000000000ad467352c93bc6a3b',
          previousblockhash: '0000000000000504235b2aff578a48470dbf6b94dafa9b3703bbf0ed554c9dd9',
          nextblockhash: '00000000000000eedd967ec155f237f033686f0924d574b946caf1b0e89551b8',
          merkleroot: '124e0f3fb5aa268f102b0447002dd9700988fc570efcb3e0b5b396ac7db437a9',
          time: 1462979126,
          mediantime: 1462976771,
          nonce: 2981820714,
          bits: '1a13ca10',
          difficulty: 847779.0710240941
        }
      });
      var getBlockHash = sinon.stub();
      meowcoind.nodes.push({
        client: {
          getBlockHeader: getBlockHeader,
          getBlockHash: getBlockHash
        }
      });
      meowcoind.getBlockHeader(blockhash, function(err, blockHeader) {
        should.not.exist(err);
        getBlockHash.callCount.should.equal(0);
        blockHeader.should.deep.equal(result);
      });
    });
  });

  describe('#_maybeGetBlockHash', function() {
    it('will not get block hash with an address', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var getBlockHash = sinon.stub();
      meowcoind.nodes.push({
        client: {
          getBlockHash: getBlockHash
        }
      });
      meowcoind._maybeGetBlockHash('2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br', function(err, hash) {
        if (err) {
          return done(err);
        }
        getBlockHash.callCount.should.equal(0);
        hash.should.equal('2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br');
        done();
      });
    });
    it('will not get block hash with non zero-nine numeric string', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var getBlockHash = sinon.stub();
      meowcoind.nodes.push({
        client: {
          getBlockHash: getBlockHash
        }
      });
      meowcoind._maybeGetBlockHash('109a', function(err, hash) {
        if (err) {
          return done(err);
        }
        getBlockHash.callCount.should.equal(0);
        hash.should.equal('109a');
        done();
      });
    });
    it('will get the block hash if argument is a number', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var getBlockHash = sinon.stub().callsArgWith(1, null, {
        result: 'blockhash'
      });
      meowcoind.nodes.push({
        client: {
          getBlockHash: getBlockHash
        }
      });
      meowcoind._maybeGetBlockHash(10, function(err, hash) {
        if (err) {
          return done(err);
        }
        hash.should.equal('blockhash');
        getBlockHash.callCount.should.equal(1);
        done();
      });
    });
    it('will get the block hash if argument is a number (as string)', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var getBlockHash = sinon.stub().callsArgWith(1, null, {
        result: 'blockhash'
      });
      meowcoind.nodes.push({
        client: {
          getBlockHash: getBlockHash
        }
      });
      meowcoind._maybeGetBlockHash('10', function(err, hash) {
        if (err) {
          return done(err);
        }
        hash.should.equal('blockhash');
        getBlockHash.callCount.should.equal(1);
        done();
      });
    });
    it('will try multiple nodes if one fails', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var getBlockHash = sinon.stub().callsArgWith(1, null, {
        result: 'blockhash'
      });
      getBlockHash.onCall(0).callsArgWith(1, {code: -1, message: 'test'});
      meowcoind.tryAllInterval = 1;
      meowcoind.nodes.push({
        client: {
          getBlockHash: getBlockHash
        }
      });
      meowcoind.nodes.push({
        client: {
          getBlockHash: getBlockHash
        }
      });
      meowcoind._maybeGetBlockHash(10, function(err, hash) {
        if (err) {
          return done(err);
        }
        hash.should.equal('blockhash');
        getBlockHash.callCount.should.equal(2);
        done();
      });
    });
    it('will give error from getBlockHash', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var getBlockHash = sinon.stub().callsArgWith(1, {code: -1, message: 'test'});
      meowcoind.tryAllInterval = 1;
      meowcoind.nodes.push({
        client: {
          getBlockHash: getBlockHash
        }
      });
      meowcoind.nodes.push({
        client: {
          getBlockHash: getBlockHash
        }
      });
      meowcoind._maybeGetBlockHash(10, function(err, hash) {
        getBlockHash.callCount.should.equal(2);
        err.should.be.instanceOf(Error);
        err.message.should.equal('test');
        err.code.should.equal(-1);
        done();
      });
    });
  });

  describe('#getBlockOverview', function() {
    var blockhash = '00000000050a6d07f583beba2d803296eb1e9d4980c4a20f206c584e89a4f02b';
    it('will handle error from maybeGetBlockHash', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind._maybeGetBlockHash = sinon.stub().callsArgWith(1, new Error('test'));
      meowcoind.getBlockOverview(blockhash, function(err) {
        err.should.be.instanceOf(Error);
        done();
      });
    });
    it('will give error from client.getBlock', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var getBlock = sinon.stub().callsArgWith(2, {code: -1, message: 'test'});
      meowcoind.nodes.push({
        client: {
          getBlock: getBlock
        }
      });
      meowcoind.getBlockOverview(blockhash, function(err) {
        err.should.be.instanceOf(Error);
        err.message.should.equal('test');
        done();
      });
    });
    it('will give expected result', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var blockResult = {
        hash: blockhash,
        version: 536870912,
        confirmations: 5,
        height: 828781,
        chainwork: '00000000000000000000000000000000000000000000000ad467352c93bc6a3b',
        previousblockhash: '0000000000000504235b2aff578a48470dbf6b94dafa9b3703bbf0ed554c9dd9',
        nextblockhash: '00000000000000eedd967ec155f237f033686f0924d574b946caf1b0e89551b8',
        merkleroot: '124e0f3fb5aa268f102b0447002dd9700988fc570efcb3e0b5b396ac7db437a9',
        time: 1462979126,
        mediantime: 1462976771,
        nonce: 2981820714,
        bits: '1a13ca10',
        difficulty: 847779.0710240941
      };
      var getBlock = sinon.stub().callsArgWith(2, null, {
        result: blockResult
      });
      meowcoind.nodes.push({
        client: {
          getBlock: getBlock
        }
      });
      function checkBlock(blockOverview) {
        blockOverview.hash.should.equal('00000000050a6d07f583beba2d803296eb1e9d4980c4a20f206c584e89a4f02b');
        blockOverview.version.should.equal(536870912);
        blockOverview.confirmations.should.equal(5);
        blockOverview.height.should.equal(828781);
        blockOverview.chainWork.should.equal('00000000000000000000000000000000000000000000000ad467352c93bc6a3b');
        blockOverview.prevHash.should.equal('0000000000000504235b2aff578a48470dbf6b94dafa9b3703bbf0ed554c9dd9');
        blockOverview.nextHash.should.equal('00000000000000eedd967ec155f237f033686f0924d574b946caf1b0e89551b8');
        blockOverview.merkleRoot.should.equal('124e0f3fb5aa268f102b0447002dd9700988fc570efcb3e0b5b396ac7db437a9');
        blockOverview.time.should.equal(1462979126);
        blockOverview.medianTime.should.equal(1462976771);
        blockOverview.nonce.should.equal(2981820714);
        blockOverview.bits.should.equal('1a13ca10');
        blockOverview.difficulty.should.equal(847779.0710240941);
      }
      meowcoind.getBlockOverview(blockhash, function(err, blockOverview) {
        if (err) {
          return done(err);
        }
        checkBlock(blockOverview);
        meowcoind.getBlockOverview(blockhash, function(err, blockOverview) {
          checkBlock(blockOverview);
          getBlock.callCount.should.equal(1);
          done();
        });
      });
    });
  });

  describe('#estimateFee', function() {
    it('will give rpc error', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var estimateFee = sinon.stub().callsArgWith(1, {message: 'error', code: -1});
      meowcoind.nodes.push({
        client: {
          estimateFee: estimateFee
        }
      });
      meowcoind.estimateFee(1, function(err) {
        should.exist(err);
        err.should.be.an.instanceof(errors.RPCError);
        done();
      });
    });
    it('will call client estimateFee and give result', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var estimateFee = sinon.stub().callsArgWith(1, null, {
        result: -1
      });
      meowcoind.nodes.push({
        client: {
          estimateFee: estimateFee
        }
      });
      meowcoind.estimateFee(1, function(err, feesPerKb) {
        if (err) {
          return done(err);
        }
        feesPerKb.should.equal(-1);
        done();
      });
    });
  });

  describe('#sendTransaction', function(done) {
    var tx = meowcoincore.Transaction(txhex);
    it('will give rpc error', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var sendRawTransaction = sinon.stub().callsArgWith(2, {message: 'error', code: -1});
      meowcoind.nodes.push({
        client: {
          sendRawTransaction: sendRawTransaction
        }
      });
      meowcoind.sendTransaction(txhex, function(err) {
        should.exist(err);
        err.should.be.an.instanceof(errors.RPCError);
      });
    });
    it('will send to client and get hash', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var sendRawTransaction = sinon.stub().callsArgWith(2, null, {
        result: tx.hash
      });
      meowcoind.nodes.push({
        client: {
          sendRawTransaction: sendRawTransaction
        }
      });
      meowcoind.sendTransaction(txhex, function(err, hash) {
        if (err) {
          return done(err);
        }
        hash.should.equal(tx.hash);
      });
    });
    it('will send to client with absurd fees and get hash', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var sendRawTransaction = sinon.stub().callsArgWith(2, null, {
        result: tx.hash
      });
      meowcoind.nodes.push({
        client: {
          sendRawTransaction: sendRawTransaction
        }
      });
      meowcoind.sendTransaction(txhex, {allowAbsurdFees: true}, function(err, hash) {
        if (err) {
          return done(err);
        }
        hash.should.equal(tx.hash);
      });
    });
    it('missing callback will throw error', function() {
      var meowcoind = new MeowcoinService(baseConfig);
      var sendRawTransaction = sinon.stub().callsArgWith(2, null, {
        result: tx.hash
      });
      meowcoind.nodes.push({
        client: {
          sendRawTransaction: sendRawTransaction
        }
      });
      var transaction = meowcoincore.Transaction();
      (function() {
        meowcoind.sendTransaction(transaction);
      }).should.throw(Error);
    });
  });

  describe('#getRawTransaction', function() {
    it('will give rpc error', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var getRawTransaction = sinon.stub().callsArgWith(1, {message: 'error', code: -1});
      meowcoind.nodes.push({
        client: {
          getRawTransaction: getRawTransaction
        }
      });
      meowcoind.getRawTransaction('txid', function(err) {
        should.exist(err);
        err.should.be.an.instanceof(errors.RPCError);
        done();
      });
    });
    it('will try all nodes', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.tryAllInterval = 1;
      var getRawTransactionWithError = sinon.stub().callsArgWith(1, {message: 'error', code: -1});
      var getRawTransaction = sinon.stub().callsArgWith(1, null, {
        result: txhex
      });
      meowcoind.nodes.push({
        client: {
          getRawTransaction: getRawTransactionWithError
        }
      });
      meowcoind.nodes.push({
        client: {
          getRawTransaction: getRawTransactionWithError
        }
      });
      meowcoind.nodes.push({
        client: {
          getRawTransaction: getRawTransaction
        }
      });
      meowcoind.getRawTransaction('txid', function(err, tx) {
        if (err) {
          return done(err);
        }
        should.exist(tx);
        tx.should.be.an.instanceof(Buffer);
        done();
      });
    });
    it('will get from cache', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var getRawTransaction = sinon.stub().callsArgWith(1, null, {
        result: txhex
      });
      meowcoind.nodes.push({
        client: {
          getRawTransaction: getRawTransaction
        }
      });
      meowcoind.getRawTransaction('txid', function(err, tx) {
        if (err) {
          return done(err);
        }
        should.exist(tx);
        tx.should.be.an.instanceof(Buffer);

        meowcoind.getRawTransaction('txid', function(err, tx) {
          should.exist(tx);
          tx.should.be.an.instanceof(Buffer);
          getRawTransaction.callCount.should.equal(1);
          done();
        });
      });
    });
  });

  describe('#getTransaction', function() {
    it('will give rpc error', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var getRawTransaction = sinon.stub().callsArgWith(1, {message: 'error', code: -1});
      meowcoind.nodes.push({
        client: {
          getRawTransaction: getRawTransaction
        }
      });
      meowcoind.getTransaction('txid', function(err) {
        should.exist(err);
        err.should.be.an.instanceof(errors.RPCError);
        done();
      });
    });
    it('will try all nodes', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.tryAllInterval = 1;
      var getRawTransactionWithError = sinon.stub().callsArgWith(1, {message: 'error', code: -1});
      var getRawTransaction = sinon.stub().callsArgWith(1, null, {
        result: txhex
      });
      meowcoind.nodes.push({
        client: {
          getRawTransaction: getRawTransactionWithError
        }
      });
      meowcoind.nodes.push({
        client: {
          getRawTransaction: getRawTransactionWithError
        }
      });
      meowcoind.nodes.push({
        client: {
          getRawTransaction: getRawTransaction
        }
      });
      meowcoind.getTransaction('txid', function(err, tx) {
        if (err) {
          return done(err);
        }
        should.exist(tx);
        tx.should.be.an.instanceof(meowcoincore.Transaction);
        done();
      });
    });
    it('will get from cache', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var getRawTransaction = sinon.stub().callsArgWith(1, null, {
        result: txhex
      });
      meowcoind.nodes.push({
        client: {
          getRawTransaction: getRawTransaction
        }
      });
      meowcoind.getTransaction('txid', function(err, tx) {
        if (err) {
          return done(err);
        }
        should.exist(tx);
        tx.should.be.an.instanceof(meowcoincore.Transaction);

        meowcoind.getTransaction('txid', function(err, tx) {
          should.exist(tx);
          tx.should.be.an.instanceof(meowcoincore.Transaction);
          getRawTransaction.callCount.should.equal(1);
          done();
        });

      });
    });
  });

  describe('#getDetailedTransaction', function() {
    var txBuffer = Buffer.from('01000000016f95980911e01c2c664b3e78299527a47933aac61a515930a8fe0213d1ac9abe01000000da0047304402200e71cda1f71e087c018759ba3427eb968a9ea0b1decd24147f91544629b17b4f0220555ee111ed0fc0f751ffebf097bdf40da0154466eb044e72b6b3dcd5f06807fa01483045022100c86d6c8b417bff6cc3bbf4854c16bba0aaca957e8f73e19f37216e2b06bb7bf802205a37be2f57a83a1b5a8cc511dc61466c11e9ba053c363302e7b99674be6a49fc0147522102632178d046673c9729d828cfee388e121f497707f810c131e0d3fc0fe0bd66d62103a0951ec7d3a9da9de171617026442fcd30f34d66100fab539853b43f508787d452aeffffffff0240420f000000000017a9148a31d53a448c18996e81ce67811e5fb7da21e4468738c9d6f90000000017a9148ce5408cfeaddb7ccb2545ded41ef478109454848700000000', 'hex');
    var info = {
      blockHash: '00000000000ec715852ea2ecae4dc8563f62d603c820f81ac284cd5be0a944d6',
      height: 530482,
      timestamp: 1439559434000,
      buffer: txBuffer
    };
    var rpcRawTransaction = {
      hex: txBuffer.toString('hex'),
      blockhash: info.blockHash,
      height: info.height,
      version: 1,
      locktime: 411451,
      time: info.timestamp,
      vin: [
        {
          valueSat: 110,
          address: 'mgY65WSfEmsyYaYPQaXhmXMeBhwp4EcsQW',
          txid: '3d003413c13eec3fa8ea1fe8bbff6f40718c66facffe2544d7516c9e2900cac2',
          sequence: 0xFFFFFFFF,
          vout: 0,
          scriptSig: {
            hex: 'scriptSigHex',
            asm: 'scriptSigAsm'
          }
        }
      ],
      vout: [
        {
          spentTxId: '4316b98e7504073acd19308b4b8c9f4eeb5e811455c54c0ebfe276c0b1eb6315',
          spentIndex: 2,
          spentHeight: 100,
          valueSat: 100,
          scriptPubKey: {
            hex: '76a9140b2f0a0c31bfe0406b0ccc1381fdbe311946dadc88ac',
            asm: 'OP_DUP OP_HASH160 0b2f0a0c31bfe0406b0ccc1381fdbe311946dadc OP_EQUALVERIFY OP_CHECKSIG',
            addresses: ['mgY65WSfEmsyYaYPQaXhmXMeBhwp4EcsQW']
          }
        }
      ]
    };
    it('should give a transaction with height and timestamp', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.nodes.push({
        client: {
          getRawTransaction: sinon.stub().callsArgWith(2, {code: -1, message: 'Test error'})
        }
      });
      var txid = '2d950d00494caf6bfc5fff2a3f839f0eb50f663ae85ce092bc5f9d45296ae91f';
      meowcoind.getDetailedTransaction(txid, function(err) {
        should.exist(err);
        err.should.be.instanceof(errors.RPCError);
        done();
      });
    });
    it('should give a transaction with all properties', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var getRawTransaction = sinon.stub().callsArgWith(2, null, {
        result: rpcRawTransaction
      });
      meowcoind.nodes.push({
        client: {
          getRawTransaction: getRawTransaction
        }
      });
      var txid = '2d950d00494caf6bfc5fff2a3f839f0eb50f663ae85ce092bc5f9d45296ae91f';
      function checkTx(tx) {
        /* jshint maxstatements: 30 */
        should.exist(tx);
        should.not.exist(tx.coinbase);
        should.equal(tx.hex, txBuffer.toString('hex'));
        should.equal(tx.blockHash, '00000000000ec715852ea2ecae4dc8563f62d603c820f81ac284cd5be0a944d6');
        should.equal(tx.height, 530482);
        should.equal(tx.blockTimestamp, 1439559434000);
        should.equal(tx.version, 1);
        should.equal(tx.locktime, 411451);
        should.equal(tx.feeSatoshis, 10);
        should.equal(tx.inputSatoshis, 110);
        should.equal(tx.outputSatoshis, 100);
        should.equal(tx.hash, txid);
        var input = tx.inputs[0];
        should.equal(input.prevTxId, '3d003413c13eec3fa8ea1fe8bbff6f40718c66facffe2544d7516c9e2900cac2');
        should.equal(input.outputIndex, 0);
        should.equal(input.satoshis, 110);
        should.equal(input.sequence, 0xFFFFFFFF);
        should.equal(input.script, 'scriptSigHex');
        should.equal(input.scriptAsm, 'scriptSigAsm');
        should.equal(input.address, 'mgY65WSfEmsyYaYPQaXhmXMeBhwp4EcsQW');
        var output = tx.outputs[0];
        should.equal(output.satoshis, 100);
        should.equal(output.script, '76a9140b2f0a0c31bfe0406b0ccc1381fdbe311946dadc88ac');
        should.equal(output.scriptAsm, 'OP_DUP OP_HASH160 0b2f0a0c31bfe0406b0ccc1381fdbe311946dadc OP_EQUALVERIFY OP_CHECKSIG');
        should.equal(output.address, 'mgY65WSfEmsyYaYPQaXhmXMeBhwp4EcsQW');
        should.equal(output.spentTxId, '4316b98e7504073acd19308b4b8c9f4eeb5e811455c54c0ebfe276c0b1eb6315');
        should.equal(output.spentIndex, 2);
        should.equal(output.spentHeight, 100);
      }
      meowcoind.getDetailedTransaction(txid, function(err, tx) {
        if (err) {
          return done(err);
        }
        checkTx(tx);
        meowcoind.getDetailedTransaction(txid, function(err, tx) {
          if (err) {
            return done(err);
          }
          checkTx(tx);
          getRawTransaction.callCount.should.equal(1);
          done();
        });
      });
    });
    it('should set coinbase to true', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var rawTransaction = JSON.parse((JSON.stringify(rpcRawTransaction)));
      delete rawTransaction.vin[0];
      rawTransaction.vin = [
        {
          coinbase: 'abcdef'
        }
      ];
      meowcoind.nodes.push({
        client: {
          getRawTransaction: sinon.stub().callsArgWith(2, null, {
            result: rawTransaction
          })
        }
      });
      var txid = '2d950d00494caf6bfc5fff2a3f839f0eb50f663ae85ce092bc5f9d45296ae91f';
      meowcoind.getDetailedTransaction(txid, function(err, tx) {
        should.exist(tx);
        should.equal(tx.coinbase, true);
        done();
      });
    });
    it('will not include address if address length is zero', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var rawTransaction = JSON.parse((JSON.stringify(rpcRawTransaction)));
      rawTransaction.vout[0].scriptPubKey.addresses = [];
      meowcoind.nodes.push({
        client: {
          getRawTransaction: sinon.stub().callsArgWith(2, null, {
            result: rawTransaction
          })
        }
      });
      var txid = '2d950d00494caf6bfc5fff2a3f839f0eb50f663ae85ce092bc5f9d45296ae91f';
      meowcoind.getDetailedTransaction(txid, function(err, tx) {
        should.exist(tx);
        should.equal(tx.outputs[0].address, null);
        done();
      });
    });
    it('will not include address if address length is greater than 1', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var rawTransaction = JSON.parse((JSON.stringify(rpcRawTransaction)));
      rawTransaction.vout[0].scriptPubKey.addresses = ['one', 'two'];
      meowcoind.nodes.push({
        client: {
          getRawTransaction: sinon.stub().callsArgWith(2, null, {
            result: rawTransaction
          })
        }
      });
      var txid = '2d950d00494caf6bfc5fff2a3f839f0eb50f663ae85ce092bc5f9d45296ae91f';
      meowcoind.getDetailedTransaction(txid, function(err, tx) {
        should.exist(tx);
        should.equal(tx.outputs[0].address, null);
        done();
      });
    });
    it('will handle scriptPubKey.addresses not being set', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var rawTransaction = JSON.parse((JSON.stringify(rpcRawTransaction)));
      delete rawTransaction.vout[0].scriptPubKey['addresses'];
      meowcoind.nodes.push({
        client: {
          getRawTransaction: sinon.stub().callsArgWith(2, null, {
            result: rawTransaction
          })
        }
      });
      var txid = '2d950d00494caf6bfc5fff2a3f839f0eb50f663ae85ce092bc5f9d45296ae91f';
      meowcoind.getDetailedTransaction(txid, function(err, tx) {
        should.exist(tx);
        should.equal(tx.outputs[0].address, null);
        done();
      });
    });
    it('will not include script if input missing scriptSig or coinbase', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var rawTransaction = JSON.parse((JSON.stringify(rpcRawTransaction)));
      delete rawTransaction.vin[0].scriptSig;
      delete rawTransaction.vin[0].coinbase;
      meowcoind.nodes.push({
        client: {
          getRawTransaction: sinon.stub().callsArgWith(2, null, {
            result: rawTransaction
          })
        }
      });
      var txid = '2d950d00494caf6bfc5fff2a3f839f0eb50f663ae85ce092bc5f9d45296ae91f';
      meowcoind.getDetailedTransaction(txid, function(err, tx) {
        should.exist(tx);
        should.equal(tx.inputs[0].script, null);
        done();
      });
    });
	it('will set height to -1 if missing height and get time from raw transaction', function(done) {
		var meowcoind = new MeowcoinService(baseConfig);
		sinon.spy(meowcoind, '_tryAllClients');
		var rawTransaction = JSON.parse((JSON.stringify(rpcRawTransaction)));
		delete rawTransaction.height;
		var getRawTransaction = sinon.stub().callsArgWith(2, null, {
			result: rawTransaction
		});
		var getMempoolEntry = sinon.stub().callsArgWith(1, null, {
			result: {}
		});
		meowcoind.nodes.push({
			client: {
				getRawTransaction: getRawTransaction,
				getMempoolEntry: getMempoolEntry
			}
		});
		var txid = '2d950d00494caf6bfc5fff2a3f839f0eb50f663ae85ce092bc5f9d45296ae91f';
		meowcoind.getDetailedTransaction(txid, function(err, tx) {
			should.exist(tx);
			meowcoind._tryAllClients.callCount.should.equal(1);
			getRawTransaction.callCount.should.equal(1);
			should.equal(tx.height, -1);
			should.equal(tx.blockTimestamp, 1439559434000);
			done();
		});
	});
	it('will set height to -1 if missing height and get time from mempoolentry', function(done) {
		var meowcoind = new MeowcoinService(baseConfig);
		sinon.spy(meowcoind, '_tryAllClients');
		var rawTransaction = JSON.parse((JSON.stringify(rpcRawTransaction)));
		delete rawTransaction.time;
		delete rawTransaction.height;
		var getRawTransaction = sinon.stub().callsArgWith(2, null, {
			result: rawTransaction
		});
		var getMempoolEntry = sinon.stub().callsArgWith(1, null, {
			result: {
				time: 1439559434000
			}
		});
		meowcoind.nodes.push({
			client: {
				getRawTransaction: getRawTransaction,
				getMempoolEntry: getMempoolEntry
			}
		});
		var txid = '2d950d00494caf6bfc5fff2a3f839f0eb50f663ae85ce092bc5f9d45296ae91f';
		meowcoind.getDetailedTransaction(txid, function(err, tx) {
			should.exist(tx);
			meowcoind._tryAllClients.callCount.should.equal(1);
			getRawTransaction.callCount.should.equal(1);
			should.equal(tx.height, -1);
			should.equal(tx.receivedTime, 1439559434000);
			done();
		});
	});
  });

  describe('#getBestBlockHash', function() {
    it('will give rpc error', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var getBestBlockHash = sinon.stub().callsArgWith(0, {message: 'error', code: -1});
      meowcoind.nodes.push({
        client: {
          getBestBlockHash: getBestBlockHash
        }
      });
      meowcoind.getBestBlockHash(function(err) {
        should.exist(err);
        err.should.be.an.instanceof(errors.RPCError);
        done();
      });
    });
    it('will call client getInfo and give result', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var getBestBlockHash = sinon.stub().callsArgWith(0, null, {
        result: 'besthash'
      });
      meowcoind.nodes.push({
        client: {
          getBestBlockHash: getBestBlockHash
        }
      });
      meowcoind.getBestBlockHash(function(err, hash) {
        if (err) {
          return done(err);
        }
        should.exist(hash);
        hash.should.equal('besthash');
        done();
      });
    });
  });

  describe('#getSpentInfo', function() {
    it('will give rpc error', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var getSpentInfo = sinon.stub().callsArgWith(1, {message: 'error', code: -1});
      meowcoind.nodes.push({
        client: {
          getSpentInfo: getSpentInfo
        }
      });
      meowcoind.getSpentInfo({}, function(err) {
        should.exist(err);
        err.should.be.an.instanceof(errors.RPCError);
        done();
      });
    });
    it('will empty object when not found', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var getSpentInfo = sinon.stub().callsArgWith(1, {message: 'test', code: -5});
      meowcoind.nodes.push({
        client: {
          getSpentInfo: getSpentInfo
        }
      });
      meowcoind.getSpentInfo({}, function(err, info) {
        should.not.exist(err);
        info.should.deep.equal({});
        done();
      });
    });
    it('will call client getSpentInfo and give result', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var getSpentInfo = sinon.stub().callsArgWith(1, null, {
        result: {
          txid: 'txid',
          index: 10,
          height: 101
        }
      });
      meowcoind.nodes.push({
        client: {
          getSpentInfo: getSpentInfo
        }
      });
      meowcoind.getSpentInfo({}, function(err, info) {
        if (err) {
          return done(err);
        }
        info.txid.should.equal('txid');
        info.index.should.equal(10);
        info.height.should.equal(101);
        done();
      });
    });
  });

  describe('#getInfo', function() {
    it('will give rpc error', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var getInfo = sinon.stub().callsArgWith(0, {message: 'error', code: -1});
      meowcoind.nodes.push({
        client: {
          getInfo: getInfo
        }
      });
      meowcoind.getInfo(function(err) {
        should.exist(err);
        err.should.be.an.instanceof(errors.RPCError);
        done();
      });
    });
    it('will call client getInfo and give result', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.node.getNetworkName = sinon.stub().returns('testnet');
      var getNetworkInfo = sinon.stub().callsArgWith(0, null, {
		result: {
		  subversion: '/Satoshi:0.15.99/',
		  localservices: '000000000000000d'
		}
	  });
	  var getInfo = sinon.stub().callsArgWith(0, null, {
        result: {
          version: 1,
          protocolversion: 1,
          blocks: 1,
          timeoffset: 1,
          connections: 1,
          proxy: '',
          difficulty: 1,
          testnet: true,
          relayfee: 10,
          errors: ''
        }
      });
      meowcoind.nodes.push({
        client: {
          getInfo: getInfo,
		  getNetworkInfo: getNetworkInfo
        }
      });
      meowcoind.getInfo(function(err, info) {
        if (err) {
          return done(err);
        }
        should.exist(info);
        should.equal(info.version, 1);
        should.equal(info.protocolVersion, 1);
        should.equal(info.blocks, 1);
        should.equal(info.timeOffset, 1);
        should.equal(info.connections, 1);
        should.equal(info.proxy, '');
        should.equal(info.difficulty, 1);
        should.equal(info.testnet, true);
        should.equal(info.relayFee, 10);
        should.equal(info.errors, '');
        info.network.should.equal('testnet');
        should.equal(info.subversion, '/Satoshi:0.15.99/');
		should.equal(info.localServices, '000000000000000d');
		done();
      });
    });
  });

  describe('#generateBlock', function() {
    it('will give rpc error', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var generate = sinon.stub().callsArgWith(1, {message: 'error', code: -1});
      meowcoind.nodes.push({
        client: {
          generate: generate
        }
      });
      meowcoind.generateBlock(10, function(err) {
        should.exist(err);
        err.should.be.an.instanceof(errors.RPCError);
        done();
      });
    });
    it('will call client generate and give result', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      var generate = sinon.stub().callsArgWith(1, null, {
        result: ['hash']
      });
      meowcoind.nodes.push({
        client: {
          generate: generate
        }
      });
      meowcoind.generateBlock(10, function(err, hashes) {
        if (err) {
          return done(err);
        }
        hashes.length.should.equal(1);
        hashes[0].should.equal('hash');
        done();
      });
    });
  });

  describe('#stop', function() {
    it('will callback if spawn is not set', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.stop(done);
    });
    it('will exit spawned process', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.spawn = {};
      meowcoind.spawn.process = new EventEmitter();
      meowcoind.spawn.process.kill = sinon.stub();
      meowcoind.stop(done);
      meowcoind.spawn.process.kill.callCount.should.equal(1);
      meowcoind.spawn.process.kill.args[0][0].should.equal('SIGINT');
      meowcoind.spawn.process.emit('exit', 0);
    });
    it('will give error with non-zero exit status code', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.spawn = {};
      meowcoind.spawn.process = new EventEmitter();
      meowcoind.spawn.process.kill = sinon.stub();
      meowcoind.stop(function(err) {
        err.should.be.instanceof(Error);
        err.code.should.equal(1);
        done();
      });
      meowcoind.spawn.process.kill.callCount.should.equal(1);
      meowcoind.spawn.process.kill.args[0][0].should.equal('SIGINT');
      meowcoind.spawn.process.emit('exit', 1);
    });
    it('will stop after timeout', function(done) {
      var meowcoind = new MeowcoinService(baseConfig);
      meowcoind.shutdownTimeout = 300;
      meowcoind.spawn = {};
      meowcoind.spawn.process = new EventEmitter();
      meowcoind.spawn.process.kill = sinon.stub();
      meowcoind.stop(function(err) {
        err.should.be.instanceof(Error);
        done();
      });
      meowcoind.spawn.process.kill.callCount.should.equal(1);
      meowcoind.spawn.process.kill.args[0][0].should.equal('SIGINT');
    });
  });

});
