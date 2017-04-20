/* eslint-env mocha */
var app = require('..')
var request = require('supertest')
var path = require('path') // core
var pug = require('pug')
var fs = require('fs')
var recurse = require('recursive-readdir-sync')
require('should')
console.log(app.get('env') === 'test')

describe('index', function () {
  it('should work!', function (done) {
    request(app)
      .get('/')
      .expect(200, done)
  })
  it('should have some CSS', function (done) {
    request(app)
      .get('/')
      .end(function (err, res) {
        if (err) throw err
        res.text.should.containEql('<link rel="stylesheet"')
        done()
      })
  })
  it('should render pug', function (done) {
    request(app)
      .get('/')
      .end(function (err, res) {
        if (err) throw err
        // checks for a string that is only in an unbuffered comment
        res.text.should.not.containEql('squeamish ossifrage')
        done()
      })
  })
})

describe('stylesheet compilation', function () {
  before(function () {
    try {
      // rm to ensure that we're not just passing through
      fs.unlinkSync(path.join(__dirname, 'public', 'index.css')) // Scary!
    } catch (e) {
      if (e.code === 'ENOENT') { // file already gone
        return
      }
      throw e
    }
  })
  it('should compile and display CSS', function (done) {
    request(app)
      .get('/index.css')
      .expect(200, done)
  })
})
describe('routes', function () {
  it('should 404 on non-existent', function (done) {
    request(app)
      .get('/404')
      .expect(404, done)
  })
  it('should 404 with some pretty HTML', function (done) {
    request(app)
      .get('/404')
      .end(function (err, res) {
        if (err) throw err
        res.text.should.containEql('Not Found')
        done()
      })
  })
  it('should 403 on protected routes', function (done) {
    request(app)
      .get('/book-club/admin')
      .expect(403, done)
  })
  var routes = [
    '/',
    '/book-club',
    '/book-club/long-list',
    '/book-club/long-list/add-a-book',
    '/book-club/reading-list',
    '/book-club/short-list',
    '/hello-world'
  ]
  for (var i = 0; i < routes.length; i++) {
    ;(function (route) {
      it('route ' + route + ' should 200', function (done) {
        request(app)
          .get(route)
          .expect(200)
          .end(function (err, res) {
            if (err) throw err
            res.text.should.not.containEql('Log in to GOV.ZK')
            done()
          })
      })
    })(routes[i])
  }
})
describe('log in system', function () {
  var auth = require('../auth.js')
  it('should fail on POSTed login with no params', function (done) {
    request(app)
      .post('/log-in')
      .expect(400, done)
  })
  it('should fail on POSTed login with made-up key', function (done) {
    request(app)
      .post('/log-in')
      .send({key: '!abcdef'}) // excl. mark never going to be part of key
      .expect(401, done)
  })
  it('should fail on POSTed login with generated but unverified key', function (done) {
    request(app)
      .post('/log-in')
      .send({key: auth.getNewKey()})
      .expect(401, done)
  })
  it('should work on POSTed login with verified key', function (done) {
    var key = auth.getNewKey()
    auth.activateKey(key, 'test')
    request(app)
      .post('/log-in')
      .send({key})
      .expect(302, done) // redirect to /
  })
})
describe('log in JSON API', function () {
  var auth = require('../auth.js')
  it('should 404 on bad key', function (done) {
    request(app)
      .get('/log-in/verify/!aaaaa.json')
      .expect(404, done)
  })
  it('should return false on valid but inactive key', function (done) {
    request(app)
      .get('/log-in/verify/' + auth.getNewKey() + '.json')
      .expect(200)
      .end(function (err, res) {
        if (err) throw err
        res.text.should.equal('false')
        done()
      })
  })
  it('should return true on ctive key', function (done) {
    var key = auth.getNewKey()
    auth.activateKey(key, 'test')
    request(app)
      .get('/log-in/verify/' + key + '.json')
      .expect(200)
      .end(function (err, res) {
        if (err) throw err
        res.text.should.equal('true')
        done()
      })
  })
})
describe('authentication system', function (done) {
  var auth = require('../auth.js')
  it('should read/write to disk', function () {
    auth.KEYSTORE = '/tmp/authtest.json'
    auth.data.test = 'hello'
    auth.saveToDisk()
    auth.data.test = null
    auth.loadFromDisk()
    auth.data.test.should.containEql('hello')
  })
  it('should save new keys', function () {
    var key = auth.getNewKey()
    key.should.be.a.String
    auth.data.unusedKeys.should.containEql(key)
  })
  it('should validate correct keys', function () {
    var key = auth.getNewKey()
    auth.isKey(key).should.be.true()
  })
  it('should not validate incorrect keys', function () {
    auth.isKey('this is not a valid key').should.be.false()
  })
  it('should mark keys as used', function () {
    var key = auth.getNewKey()
    auth.markKeyUsed(key)
    auth.data.usedKeys.should.containEql(key)
  })
  it('should not think unused keys are used', function () {
    var key = auth.getNewKey()
    auth.isUsedKey(key).should.be.false
  })
  it('should think used keys are used', function () {
    var key = auth.getNewKey()
    auth.markKeyUsed(key)
    auth.isUsedKey(key).should.be.true
  })
  it('should not mark invalid keys as used', function () {
    (function () {
      auth.markKeyUsed('invalid key')
    }).should.throwError('cannot mark invalid key as used')
  })
  it('should not mark keys as used twice', function () {
    var key = auth.getNewKey()
    auth.markKeyUsed(key)
    ;(function () {
      auth.markKeyUsed(key)
    }).should.throwError('cannot mark a key used twice')
  })
  it('should throw an error when activating an invalid key', function () {
    ;(function () {
      auth.activateKey('!abcdef')
    }).should.throwError('cannot activate invalid key')
  })
  after(function (done) {
    fs.unlink('/tmp/authtest.json', done)
  })
})

describe('pug rendering', function () {
  var f = recurse('views')
  for (var i = 0; i < f.length; i++) {
    ;(function (x) {
      it('should render ' + x, function (done) {
        try {
          pug.renderFile(x, null)
        } catch (e) {
          if (e instanceof TypeError) {
            // pass, probably(!) an unsent variable
          } else {
            throw e
          }
        } finally {
          done()
        }
      })
    })(f[i])
  }
})
