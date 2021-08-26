"use strict";
/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const remapping_1 = __importDefault(require("@ampproject/remapping"));
const esbuild_1 = require("esbuild");
const terser_1 = require("terser");
async function default_1({ asset, options }) {
    // esbuild is used as a first pass
    const esbuildResult = await esbuild_1.transform(asset.code, {
        minifyIdentifiers: !options.keepNames,
        minifySyntax: true,
        // NOTE: Disabling whitespace ensures unused pure annotations are kept
        minifyWhitespace: false,
        pure: ['forwardRef'],
        legalComments: options.removeLicenses ? 'none' : 'inline',
        sourcefile: asset.name,
        sourcemap: options.sourcemap && 'external',
        define: options.define,
        keepNames: options.keepNames,
        target: `es${options.target}`,
    });
    // terser is used as a second pass
    const terserResult = await optimizeWithTerser(asset.name, esbuildResult.code, options.sourcemap, options.target, options.advanced);
    // Merge intermediate sourcemaps with input sourcemap if enabled
    let fullSourcemap;
    if (options.sourcemap) {
        const partialSourcemaps = [];
        if (esbuildResult.map) {
            partialSourcemaps.unshift(JSON.parse(esbuildResult.map));
        }
        if (terserResult.map) {
            partialSourcemaps.unshift(terserResult.map);
        }
        partialSourcemaps.push(asset.map);
        fullSourcemap = remapping_1.default(partialSourcemaps, () => null);
    }
    return { name: asset.name, code: terserResult.code, map: fullSourcemap };
}
exports.default = default_1;
async function optimizeWithTerser(name, code, sourcemaps, target, advanced) {
    const result = await terser_1.minify({ [name]: code }, {
        compress: {
            passes: advanced ? 2 : 1,
            pure_getters: advanced,
        },
        ecma: target,
        // esbuild in the first pass is used to minify identifiers instead of mangle here
        mangle: false,
        format: {
            // ASCII output is enabled here as well to prevent terser from converting back to UTF-8
            ascii_only: true,
            wrap_func_args: false,
        },
        sourceMap: sourcemaps &&
            {
                asObject: true,
                // typings don't include asObject option
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            },
    });
    if (!result.code) {
        throw new Error('Terser failed for unknown reason.');
    }
    return { code: result.code, map: result.map };
}
