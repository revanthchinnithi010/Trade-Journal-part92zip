/// <reference types="node" />
import * as stream from 'stream';

export interface HeaderData {
  path?: string;
  mode?: number;
  noProprietary?: boolean;
  uid?: number;
  gid?: number;
  size?: number;
  mtime?: Date;
  type?: string;
  linkpath?: string;
  uname?: string;
  gname?: string;
  devmaj?: number;
  devmin?: number;
}

export interface Options {
  file?: string;
  cwd?: string;
  strict?: boolean;
  gzip?: boolean;
  filter?: (path: string, stat: any) => boolean;
  onentry?: (entry: ReadEntry) => void;
  map?: (header: HeaderData) => HeaderData;
  mapMeta?: (header: HeaderData) => void;
  jobs?: number;
  maxReadSize?: number;
  noPax?: boolean;
  noMtime?: boolean;
  preservePaths?: boolean;
  unlink?: boolean;
  strip?: number;
  onwarn?: (code: string, message: string, data: any) => void;
  portable?: boolean;
  follow?: boolean;
  noDirRecurse?: boolean;
  sync?: boolean;
  noChmod?: boolean;
  transform?: (entry: ReadEntry) => stream.Readable | undefined;
  C?: string;
  p?: boolean;
  [key: string]: any;
}

export class ReadEntry extends stream.PassThrough {
  path: string;
  type: string;
  size: number;
  remain: number;
  blockRemain: number;
  ignore: boolean;
  header: HeaderData;
  constructor(header?: HeaderData);
}

export class WriteEntry extends stream.Readable {
  path: string;
  constructor(path: string, opt?: Options);
}

export class Pack extends stream.PassThrough {
  constructor(opt?: Options);
  add(entry: stream.Readable): this;
  entry(header: HeaderData, buffer?: Buffer | string, callback?: (err?: Error) => void): stream.Readable;
  finalize(): void;
}

export class Unpack extends stream.Writable {
  constructor(opt?: Options);
}

export function extract(options: Options, fileList?: string[]): Promise<void>;
export function x(options: Options, fileList?: string[]): Promise<void>;
export function create(options: Options, fileList: string[]): Promise<void>;
export function c(options: Options, fileList: string[]): Promise<void>;
export function replace(options: Options, fileList: string[]): Promise<void>;
export function r(options: Options, fileList: string[]): Promise<void>;
export function update(options: Options, fileList: string[]): Promise<void>;
export function u(options: Options, fileList: string[]): Promise<void>;
export function list(options: Options, fileList?: string[]): Promise<void>;
export function t(options: Options, fileList?: string[]): Promise<void>;
