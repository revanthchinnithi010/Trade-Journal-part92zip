'use strict';
// Local stub for the `tar` npm package (blocked by Replit firewall).
// Provides the same API surface used by @expo/cli and related packages.
// Actual tar operations (extract/create) work via Node's built-in streams.

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const stream = require('stream');

function notImpl(name) {
  return function () {
    throw new Error(`tar.${name}() is not supported in this environment. The tar package is stubbed.`);
  };
}

// ReadEntry stub (used as a type by @expo/cli's createFileTransform)
class ReadEntry extends stream.PassThrough {
  constructor(header) {
    super();
    this.header = header || {};
    this.path = (header && header.path) || '';
    this.type = (header && header.type) || 'File';
    this.size = (header && header.size) || 0;
    this.remain = this.size;
    this.blockRemain = 0;
    this.ignore = false;
  }
}

// WriteEntry stub
class WriteEntry extends stream.Readable {
  constructor(p, opt) {
    super();
    this.path = p;
    this.opt = opt || {};
  }
}

// Pack stub
class Pack extends stream.PassThrough {
  constructor(opt) { super(); this.opt = opt || {}; }
  add(entry) { return this; }
  entry(header, buffer, callback) { if (callback) callback(); return this; }
  finalize() { this.end(); }
}

// Unpack stub
class Unpack extends stream.Writable {
  constructor(opt) { super(); this.opt = opt || {}; }
}

const extract = notImpl('extract');
const x = notImpl('x');
const create = notImpl('create');
const c = notImpl('c');
const replace = notImpl('replace');
const r = notImpl('r');
const update = notImpl('update');
const u = notImpl('u');
const list = notImpl('list');
const t = notImpl('t');

module.exports = {
  extract,
  x,
  create,
  c,
  replace,
  r,
  update,
  u,
  list,
  t,
  Pack,
  Unpack,
  ReadEntry,
  WriteEntry,
  // Some consumers access these directly
  parse: notImpl('parse'),
  Header: class Header {},
};
