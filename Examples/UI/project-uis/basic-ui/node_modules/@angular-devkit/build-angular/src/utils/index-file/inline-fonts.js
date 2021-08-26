"use strict";
/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InlineFontsProcessor = void 0;
const cacache = __importStar(require("cacache"));
const fs = __importStar(require("fs"));
const https = __importStar(require("https"));
const https_proxy_agent_1 = __importDefault(require("https-proxy-agent"));
const url_1 = require("url");
const cache_path_1 = require("../cache-path");
const environment_options_1 = require("../environment-options");
const html_rewriting_stream_1 = require("./html-rewriting-stream");
const cacheFontsPath = environment_options_1.cachingDisabled
    ? undefined
    : cache_path_1.findCachePath('angular-build-fonts');
const packageVersion = require('../../../package.json').version;
const SUPPORTED_PROVIDERS = {
    'fonts.googleapis.com': {
        seperateRequestForWOFF: true,
        preconnectUrl: 'https://fonts.gstatic.com',
    },
    'use.typekit.net': {
        seperateRequestForWOFF: false,
        preconnectUrl: 'https://use.typekit.net',
    },
};
class InlineFontsProcessor {
    constructor(options) {
        this.options = options;
    }
    async process(content) {
        var _a;
        const hrefList = [];
        const existingPreconnect = new Set();
        // Collector link tags with href
        const { rewriter: collectorStream } = await html_rewriting_stream_1.htmlRewritingStream(content);
        collectorStream.on('startTag', (tag) => {
            const { tagName, attrs } = tag;
            if (tagName !== 'link') {
                return;
            }
            let hrefValue;
            let relValue;
            for (const { name, value } of attrs) {
                switch (name) {
                    case 'rel':
                        relValue = value;
                        break;
                    case 'href':
                        hrefValue = value;
                        break;
                }
                if (hrefValue && relValue) {
                    switch (relValue) {
                        case 'stylesheet':
                            // <link rel="stylesheet" href="https://example.com/main.css">
                            hrefList.push(hrefValue);
                            break;
                        case 'preconnect':
                            // <link rel="preconnect" href="https://example.com">
                            existingPreconnect.add(hrefValue.replace(/\/$/, ''));
                            break;
                    }
                    return;
                }
            }
        });
        await new Promise((resolve) => collectorStream.on('finish', resolve));
        // Download stylesheets
        const hrefsContent = new Map();
        const newPreconnectUrls = new Set();
        for (const hrefItem of hrefList) {
            const url = this.createNormalizedUrl(hrefItem);
            if (!url) {
                continue;
            }
            const content = await this.processHref(url);
            if (content === undefined) {
                continue;
            }
            hrefsContent.set(hrefItem, content);
            // Add preconnect
            const preconnectUrl = (_a = this.getFontProviderDetails(url)) === null || _a === void 0 ? void 0 : _a.preconnectUrl;
            if (preconnectUrl && !existingPreconnect.has(preconnectUrl)) {
                newPreconnectUrls.add(preconnectUrl);
            }
        }
        if (hrefsContent.size === 0) {
            return content;
        }
        // Replace link with style tag.
        const { rewriter, transformedContent } = await html_rewriting_stream_1.htmlRewritingStream(content);
        rewriter.on('startTag', (tag) => {
            const { tagName, attrs } = tag;
            switch (tagName) {
                case 'head':
                    rewriter.emitStartTag(tag);
                    for (const url of newPreconnectUrls) {
                        rewriter.emitRaw(`<link rel="preconnect" href="${url}" crossorigin>`);
                    }
                    break;
                case 'link':
                    const hrefAttr = attrs.some(({ name, value }) => name === 'rel' && value === 'stylesheet') &&
                        attrs.find(({ name, value }) => name === 'href' && hrefsContent.has(value));
                    if (hrefAttr) {
                        const href = hrefAttr.value;
                        const cssContent = hrefsContent.get(href);
                        rewriter.emitRaw(`<style type="text/css">${cssContent}</style>`);
                    }
                    else {
                        rewriter.emitStartTag(tag);
                    }
                    break;
                default:
                    rewriter.emitStartTag(tag);
                    break;
            }
        });
        return transformedContent;
    }
    async getResponse(url, userAgent) {
        var _a;
        const key = `${packageVersion}|${url}|${userAgent}`;
        if (cacheFontsPath) {
            const entry = await cacache.get.info(cacheFontsPath, key);
            if (entry) {
                return fs.promises.readFile(entry.path, 'utf8');
            }
        }
        let agent;
        const httpsProxy = (_a = process.env.HTTPS_PROXY) !== null && _a !== void 0 ? _a : process.env.https_proxy;
        if (httpsProxy) {
            agent = https_proxy_agent_1.default(httpsProxy);
        }
        const data = await new Promise((resolve, reject) => {
            let rawResponse = '';
            https
                .get(url, {
                agent,
                rejectUnauthorized: false,
                headers: {
                    'user-agent': userAgent,
                },
            }, (res) => {
                if (res.statusCode !== 200) {
                    reject(new Error(`Inlining of fonts failed. ${url} returned status code: ${res.statusCode}.`));
                    return;
                }
                res.on('data', (chunk) => (rawResponse += chunk)).on('end', () => resolve(rawResponse));
            })
                .on('error', (e) => reject(new Error(`Inlining of fonts failed. An error has occurred while retrieving ${url} over the internet.\n` +
                e.message)));
        });
        if (cacheFontsPath) {
            await cacache.put(cacheFontsPath, key, data);
        }
        return data;
    }
    async processHref(url) {
        const provider = this.getFontProviderDetails(url);
        if (!provider) {
            return undefined;
        }
        // The order IE -> Chrome is important as otherwise Chrome will load woff1.
        let cssContent = '';
        if (this.options.WOFFSupportNeeded && provider.seperateRequestForWOFF) {
            cssContent += await this.getResponse(url, "Mozilla/5.0 (Windows NT 10.0; Trident/7.0; rv:11. 0) like Gecko" /* IE */);
        }
        cssContent += await this.getResponse(url, "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.121 Safari/537.36" /* Chrome */);
        if (this.options.minify) {
            cssContent = cssContent
                // Comments.
                .replace(/\/\*([\s\S]*?)\*\//g, '')
                // New lines.
                .replace(/\n/g, '')
                // Safe spaces.
                .replace(/\s?[\{\:\;]\s+/g, (s) => s.trim());
        }
        return cssContent;
    }
    getFontProviderDetails(url) {
        return SUPPORTED_PROVIDERS[url.hostname];
    }
    createNormalizedUrl(value) {
        // Need to convert '//' to 'https://' because the URL parser will fail with '//'.
        const normalizedHref = value.startsWith('//') ? `https:${value}` : value;
        if (!normalizedHref.startsWith('http')) {
            // Non valid URL.
            // Example: relative path styles.css.
            return undefined;
        }
        const url = new url_1.URL(normalizedHref);
        // Force HTTPS protocol
        url.protocol = 'https:';
        return url;
    }
}
exports.InlineFontsProcessor = InlineFontsProcessor;
