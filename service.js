/*
 * CleanFrame launcher service for TizenBrew.
 *
 * Starts apps the way `sdb shell 0 was_execute <id>` does, by talking to the TV's own sdb port
 * (127.0.0.1:26101, which needs Developer Mode's Host PC IP set to 127.0.0.1). CleanFrame uses this
 * for apps the TV ignores when asked through tizen.application.launch.
 *
 * Listens on 127.0.0.1:8082 only.   GET /ping   GET /launch?id=<app id>
 * Plain ES5 on purpose: the Node runtime on older Tizen TVs is old.
 */
(function () {
  var net = require('net');
  var http = require('http');
  var PORT = 8082, SDB_PORT = 26101, SDB_HOST = (typeof process !== 'undefined' && process.env && process.env.CF_SDB_HOST) || '127.0.0.1', ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

  function buf(n) { return Buffer.alloc ? Buffer.alloc(n) : new Buffer(n); }
  function fromString(s) { return Buffer.from && Buffer.from !== Uint8Array.from ? Buffer.from(s) : new Buffer(s); }
  function cmd(name) { return fromString(name).readUInt32LE(0); }
  var CNXN = cmd('CNXN'), OPEN = cmd('OPEN'), OKAY = cmd('OKAY'), WRTE = cmd('WRTE'), CLSE = cmd('CLSE');

  function sum(data) { var r = 0, i; for (i = 0; i < data.length; i++) r = (r + data[i]) >>> 0; return r; }
  function packet(command, arg0, arg1, text) {
    var data = text === undefined ? buf(0) : fromString(text + '\0'), out = buf(24 + data.length);
    out.writeUInt32LE(command, 0); out.writeUInt32LE(arg0, 4); out.writeUInt32LE(arg1, 8);
    out.writeUInt32LE(data.length, 12); out.writeUInt32LE(sum(data), 16); out.writeUInt32LE((0xFFFFFFFF - command) >>> 0, 20);
    data.copy(out, 24);
    return out;
  }

  /* Runs one shell command on the TV's sdb daemon and calls back with (error, output). */
  function shell(command, done) {
    var socket = net.connect(SDB_PORT, SDB_HOST), pending = buf(0), output = '', finished = false, localId = 1, remoteId = 0, opened = false;
    var timer = setTimeout(function () { finish(new Error('Timed out talking to the TV'), output); }, 6000);
    function finish(err, out) {
      if (finished) return; finished = true; clearTimeout(timer);
      try { socket.destroy(); } catch (e) { /* already closed */ }
      done(err, out);
    }
    function handle(command, arg0, arg1, data) {
      if (command === CNXN && !opened) { opened = true; socket.write(packet(OPEN, localId, 0, command_)); }
      else if (command === OKAY) { remoteId = arg0; }
      else if (command === WRTE) { output += data.toString(); socket.write(packet(OKAY, localId, arg0)); }
      else if (command === CLSE) { finish(null, output); }
    }
    var command_ = 'shell:' + command;
    socket.on('connect', function () { socket.write(packet(CNXN, 0x01000000, 4096, 'host::')); });
    socket.on('data', function (chunk) {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= 24) {
        var length = pending.readUInt32LE(12);
        if (pending.length < 24 + length) break;
        handle(pending.readUInt32LE(0), pending.readUInt32LE(4), pending.readUInt32LE(8), pending.slice(24, 24 + length));
        pending = pending.slice(24 + length);
      }
    });
    socket.on('error', function (err) { finish(err, output); });
    socket.on('close', function () { finish(output ? null : new Error('Connection closed'), output); });
  }

  function reply(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' });
    res.end(JSON.stringify(body));
  }

  var server = http.createServer(function (req, res) {
    var url = req.url || '', m;
    if (req.method === 'OPTIONS') { reply(res, 204, {}); return; }
    if (url.indexOf('/ping') === 0) { reply(res, 200, { ok: true }); return; }
    m = /^\/launch\?id=([^&]*)/.exec(url);
    if (!m) { reply(res, 404, { ok: false, error: 'Unknown request' }); return; }
    var id = decodeURIComponent(m[1]);
    if (!ID_PATTERN.test(id)) { reply(res, 400, { ok: false, error: 'Invalid app id' }); return; }
    shell('0 was_execute ' + id, function (err, out) {
      if (err) { reply(res, 502, { ok: false, error: String(err.message || err) }); return; }
      reply(res, out.indexOf('launched') >= 0 ? 200 : 502, { ok: out.indexOf('launched') >= 0, output: out });
    });
  });
  server.on('error', function (err) { console.log('CleanFrame launcher: ' + (err && err.message)); });
  server.listen(PORT, '127.0.0.1', function () { console.log('CleanFrame launcher listening on 127.0.0.1:' + PORT); });
})();
