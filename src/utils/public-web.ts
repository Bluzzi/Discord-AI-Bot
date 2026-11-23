import type { IncomingMessage, OutgoingHttpHeaders } from "node:http";
import { lookup } from "node:dns";
import { get as httpGet } from "node:http";
import { get as httpsGet } from "node:https";
import { BlockList, isIP } from "node:net";
import { pipeline } from "node:stream/promises";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

const nonPublic = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
] as const) nonPublic.addSubnet(network, prefix);
nonPublic.addSubnet("2001::", 23, "ipv6");
nonPublic.addSubnet("2002::", 16, "ipv6");
nonPublic.addSubnet("3fff::", 20, "ipv6");
const globalIpv6 = new BlockList();
globalIpv6.addSubnet("2000::", 3, "ipv6");

const isPublicAddress = (address: string) => {
  const family = isIP(address);
  if (family === 4) return !nonPublic.check(address);
  return family === 6 && globalIpv6.check(address, "ipv6") && !nonPublic.check(address, "ipv6");
};

export class PublicWebError extends Error {
  public constructor(public readonly code: "invalid_url" | "non_public_url" | "body_too_large" | "unsupported_encoding") {
    super(code);
  }
}

export const parseWebUrl = (value: string, base?: URL) => {
  const url = URL.parse(value, base);
  if (!url || !["http:", "https:"].includes(url.protocol) || url.username || url.password || url.href.length > 4096) return null;
  url.hash = "";
  return url;
};

export const getPublicPage = async (url: URL, headers: OutgoingHttpHeaders, signal: AbortSignal): Promise<IncomingMessage> => {
  const hostname = url.hostname.replace(/^\[|\]$/gu, "");
  if (isIP(hostname) !== 0 && !isPublicAddress(hostname)) throw new PublicWebError("non_public_url");
  if (url.port) throw new PublicWebError("invalid_url");

  const get = url.protocol === "https:" ? httpsGet : httpGet;
  return new Promise((resolve, reject) => {
    const request = get(url, {
      headers,
      signal,
      agent: false,
      // Validate the same address the socket will connect to, including after each redirect.
      lookup: (host, options, callback) => {
        lookup(host, { ...options, all: true }, (error, addresses) => {
          if (error) return callback(error, "", 0);
          const candidates = addresses.filter(({ address }) => isPublicAddress(address));
          const first = candidates[0];
          if (!first) return callback(new PublicWebError("non_public_url"), "", 0);
          if (options.all === true) return callback(null, candidates);
          return callback(null, first.address, first.family);
        });
      },
    }, resolve);
    request.on("error", reject);
  });
};

const maxBytes = 1024 * 1024;
const decompressors = {
  gzip: createGunzip,
  deflate: createInflate,
  br: createBrotliDecompress,
};

const collect = async (source: AsyncIterable<Buffer>) => {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of source) {
    total += chunk.length;
    if (total > maxBytes) throw new PublicWebError("body_too_large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
};

export const readPageBody = async (response: IncomingMessage, signal: AbortSignal): Promise<Buffer> => {
  const encoding = response.headers["content-encoding"]?.toLowerCase() ?? "identity";
  if (Number(response.headers["content-length"]) > maxBytes) {
    response.destroy();
    throw new PublicWebError("body_too_large");
  }
  if (encoding === "identity") return collect(response as AsyncIterable<Buffer>);
  if (!Object.hasOwn(decompressors, encoding)) {
    response.destroy();
    throw new PublicWebError("unsupported_encoding");
  }
  const decompress = decompressors[encoding as keyof typeof decompressors];
  return pipeline(response, decompress(), collect, { signal });
};
