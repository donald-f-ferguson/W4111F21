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
exports.inlineLocales = exports.createI18nPlugins = exports.process = void 0;
const remapping_1 = __importDefault(require("@ampproject/remapping"));
const core_1 = require("@babel/core");
const template_1 = __importDefault(require("@babel/template"));
const cacache = __importStar(require("cacache"));
const crypto_1 = require("crypto");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const terser_1 = require("terser");
const worker_threads_1 = require("worker_threads");
const environment_options_1 = require("./environment-options");
// Lazy loaded webpack-sources object
// Webpack is only imported if needed during the processing
let webpackSources;
// If code size is larger than 500KB, consider lower fidelity but faster sourcemap merge
const FAST_SOURCEMAP_THRESHOLD = 500 * 1024;
const { cachePath, i18n } = (worker_threads_1.workerData || {});
async function cachePut(content, key, integrity) {
    if (cachePath && key) {
        await cacache.put(cachePath, key, content, {
            metadata: { integrity },
        });
    }
}
async function process(options) {
    var _a;
    if (!options.cacheKeys) {
        options.cacheKeys = [];
    }
    const result = { name: options.name };
    if (options.integrityAlgorithm) {
        // Store unmodified code integrity value -- used for SRI value replacement
        result.integrity = generateIntegrityValue(options.integrityAlgorithm, options.code);
    }
    // Runtime chunk requires specialized handling
    if (options.runtime) {
        return { ...result, ...(await processRuntime(options)) };
    }
    const basePath = path.dirname(options.filename);
    const filename = path.basename(options.filename);
    const downlevelFilename = filename.replace(/\-(es20\d{2}|esnext)/, '-es5');
    const downlevel = !options.optimizeOnly;
    const sourceCode = options.code;
    if (downlevel) {
        const { supportedBrowsers: targets = [] } = options;
        // todo: revisit this in version 10, when we update our defaults browserslist
        // Without this workaround bundles will not be downlevelled because Babel doesn't know handle to 'op_mini all'
        // See: https://github.com/babel/babel/issues/11155
        if (Array.isArray(targets) && targets.includes('op_mini all')) {
            targets.push('ie_mob 11');
        }
        else if ('op_mini' in targets) {
            targets['ie_mob'] = '11';
        }
        // Downlevel the bundle
        const transformResult = await core_1.transformAsync(sourceCode, {
            filename,
            // using false ensures that babel will NOT search and process sourcemap comments (large memory usage)
            // The types do not include the false option even though it is valid
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            inputSourceMap: false,
            babelrc: false,
            configFile: false,
            presets: [
                [
                    require.resolve('@babel/preset-env'),
                    {
                        // browserslist-compatible query or object of minimum environment versions to support
                        targets,
                        // modules aren't needed since the bundles use webpack's custom module loading
                        modules: false,
                        // 'transform-typeof-symbol' generates slower code
                        exclude: ['transform-typeof-symbol'],
                    },
                ],
            ],
            plugins: [
                createIifeWrapperPlugin(),
                ...(options.replacements ? [createReplacePlugin(options.replacements)] : []),
            ],
            minified: environment_options_1.allowMinify && !!options.optimize,
            compact: !environment_options_1.shouldBeautify && !!options.optimize,
            sourceMaps: !!options.map,
        });
        if (!transformResult || !transformResult.code) {
            throw new Error(`Unknown error occurred processing bundle for "${options.filename}".`);
        }
        result.downlevel = await processBundle({
            ...options,
            code: transformResult.code,
            downlevelMap: (_a = transformResult.map) !== null && _a !== void 0 ? _a : undefined,
            filename: path.join(basePath, downlevelFilename),
            isOriginal: false,
        });
    }
    if (!result.original && !options.ignoreOriginal) {
        result.original = await processBundle({
            ...options,
            isOriginal: true,
        });
    }
    return result;
}
exports.process = process;
async function processBundle(options) {
    const { optimize, isOriginal, code, map, downlevelMap, filename: filepath, hiddenSourceMaps, cacheKeys = [], integrityAlgorithm, } = options;
    const filename = path.basename(filepath);
    let resultCode = code;
    let optimizeResult;
    if (optimize) {
        optimizeResult = await terserMangle(code, {
            filename,
            sourcemap: !!map,
            compress: !isOriginal,
            ecma: isOriginal ? 2015 : 5,
        });
        resultCode = optimizeResult.code;
    }
    let mapContent;
    if (map) {
        if (!hiddenSourceMaps) {
            resultCode += `\n//# sourceMappingURL=${filename}.map`;
        }
        const partialSourcemaps = [];
        if (optimizeResult && optimizeResult.map) {
            partialSourcemaps.push(optimizeResult.map);
        }
        if (downlevelMap) {
            partialSourcemaps.push(downlevelMap);
        }
        if (partialSourcemaps.length > 0) {
            partialSourcemaps.push(map);
            const fullSourcemap = remapping_1.default(partialSourcemaps, () => null);
            mapContent = JSON.stringify(fullSourcemap);
        }
        else {
            mapContent = map;
        }
        await cachePut(mapContent, cacheKeys[isOriginal ? 1 /* OriginalMap */ : 3 /* DownlevelMap */]);
        fs.writeFileSync(filepath + '.map', mapContent);
    }
    const fileResult = createFileEntry(filepath, resultCode, mapContent, integrityAlgorithm);
    await cachePut(resultCode, cacheKeys[isOriginal ? 0 /* OriginalCode */ : 2 /* DownlevelCode */], fileResult.integrity);
    fs.writeFileSync(filepath, resultCode);
    return fileResult;
}
async function terserMangle(code, options = {}) {
    // Note: Investigate converting the AST instead of re-parsing
    // estree -> terser is already supported; need babel -> estree/terser
    // Mangle downlevel code
    const minifyOutput = await terser_1.minify(options.filename ? { [options.filename]: code } : code, {
        compress: environment_options_1.allowMinify && !!options.compress,
        ecma: options.ecma || 5,
        mangle: environment_options_1.allowMangle,
        safari10: true,
        format: {
            ascii_only: true,
            webkit: true,
            beautify: environment_options_1.shouldBeautify,
            wrap_func_args: false,
        },
        sourceMap: !!options.sourcemap &&
            {
                asObject: true,
                // typings don't include asObject option
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            },
    });
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return { code: minifyOutput.code, map: minifyOutput.map };
}
function createFileEntry(filename, code, map, integrityAlgorithm) {
    return {
        filename: filename,
        size: Buffer.byteLength(code),
        integrity: integrityAlgorithm && generateIntegrityValue(integrityAlgorithm, code),
        map: !map
            ? undefined
            : {
                filename: filename + '.map',
                size: Buffer.byteLength(map),
            },
    };
}
function generateIntegrityValue(hashAlgorithm, code) {
    return hashAlgorithm + '-' + crypto_1.createHash(hashAlgorithm).update(code).digest('base64');
}
// The webpack runtime chunk is already ES5.
// However, two variants are still needed due to lazy routing and SRI differences
// NOTE: This should eventually be a babel plugin
async function processRuntime(options) {
    let originalCode = options.code;
    let downlevelCode = options.code;
    // Replace integrity hashes with updated values
    if (options.integrityAlgorithm && options.runtimeData) {
        for (const data of options.runtimeData) {
            if (!data.integrity) {
                continue;
            }
            if (data.original && data.original.integrity) {
                originalCode = originalCode.replace(data.integrity, data.original.integrity);
            }
            if (data.downlevel && data.downlevel.integrity) {
                downlevelCode = downlevelCode.replace(data.integrity, data.downlevel.integrity);
            }
        }
    }
    // Adjust lazy loaded scripts to point to the proper variant
    // Extra spacing is intentional to align source line positions
    downlevelCode = downlevelCode.replace(/"\-(es20\d{2}|esnext)\./, '   "-es5.');
    return {
        original: await processBundle({
            ...options,
            code: originalCode,
            isOriginal: true,
        }),
        downlevel: await processBundle({
            ...options,
            code: downlevelCode,
            filename: options.filename.replace(/\-(es20\d{2}|esnext)/, '-es5'),
            isOriginal: false,
        }),
    };
}
function createReplacePlugin(replacements) {
    return {
        visitor: {
            StringLiteral(path) {
                for (const replacement of replacements) {
                    if (path.node.value === replacement[0]) {
                        path.node.value = replacement[1];
                    }
                }
            },
        },
    };
}
function createIifeWrapperPlugin() {
    return {
        visitor: {
            Program: {
                exit(path) {
                    // Save existing body and directives
                    const { body, directives } = path.node;
                    // Clear out body and directives for wrapper
                    path.node.body = [];
                    path.node.directives = [];
                    // Create the wrapper - "(function() { ... })();"
                    const wrapper = core_1.types.expressionStatement(core_1.types.callExpression(core_1.types.parenthesizedExpression(core_1.types.functionExpression(undefined, [], core_1.types.blockStatement(body, directives))), []));
                    // Insert the wrapper
                    path.pushContainer('body', wrapper);
                },
            },
        },
    };
}
const USE_LOCALIZE_PLUGINS = false;
async function createI18nPlugins(locale, translation, missingTranslation, shouldInline, localeDataContent) {
    const plugins = [];
    const localizeDiag = await Promise.resolve().then(() => __importStar(require('@angular/localize/src/tools/src/diagnostics')));
    const diagnostics = new localizeDiag.Diagnostics();
    if (shouldInline) {
        const es2015 = await Promise.resolve().then(() => __importStar(require('@angular/localize/src/tools/src/translate/source_files/es2015_translate_plugin')));
        plugins.push(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        es2015.makeEs2015TranslatePlugin(diagnostics, (translation || {}), {
            missingTranslation: translation === undefined ? 'ignore' : missingTranslation,
        }));
        const es5 = await Promise.resolve().then(() => __importStar(require('@angular/localize/src/tools/src/translate/source_files/es5_translate_plugin')));
        plugins.push(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        es5.makeEs5TranslatePlugin(diagnostics, (translation || {}), {
            missingTranslation: translation === undefined ? 'ignore' : missingTranslation,
        }));
    }
    const inlineLocale = await Promise.resolve().then(() => __importStar(require('@angular/localize/src/tools/src/translate/source_files/locale_plugin')));
    plugins.push(inlineLocale.makeLocalePlugin(locale));
    if (localeDataContent) {
        plugins.push({
            visitor: {
                Program(path) {
                    path.unshiftContainer('body', template_1.default.ast(localeDataContent));
                },
            },
        });
    }
    return { diagnostics, plugins };
}
exports.createI18nPlugins = createI18nPlugins;
const localizeName = '$localize';
async function inlineLocales(options) {
    var _a;
    if (!i18n || i18n.inlineLocales.size === 0) {
        return { file: options.filename, diagnostics: [], count: 0 };
    }
    if (i18n.flatOutput && i18n.inlineLocales.size > 1) {
        throw new Error('Flat output is only supported when inlining one locale.');
    }
    const hasLocalizeName = options.code.includes(localizeName);
    if (!hasLocalizeName && !options.setLocale) {
        return inlineCopyOnly(options);
    }
    let ast;
    try {
        ast = core_1.parseSync(options.code, {
            babelrc: false,
            configFile: false,
            sourceType: 'script',
            filename: options.filename,
        });
    }
    catch (error) {
        if (error.message) {
            // Make the error more readable.
            // Same errors will contain the full content of the file as the error message
            // Which makes it hard to find the actual error message.
            const index = error.message.indexOf(')\n');
            const msg = index !== -1 ? error.message.substr(0, index + 1) : error.message;
            throw new Error(`${msg}\nAn error occurred inlining file "${options.filename}"`);
        }
    }
    if (!ast) {
        throw new Error(`Unknown error occurred inlining file "${options.filename}"`);
    }
    if (!USE_LOCALIZE_PLUGINS) {
        return inlineLocalesDirect(ast, options);
    }
    const diagnostics = [];
    for (const locale of i18n.inlineLocales) {
        const isSourceLocale = locale === i18n.sourceLocale;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const translations = isSourceLocale ? {} : i18n.locales[locale].translation || {};
        let localeDataContent;
        if (options.setLocale) {
            // If locale data is provided, load it and prepend to file
            const localeDataPath = (_a = i18n.locales[locale]) === null || _a === void 0 ? void 0 : _a.dataPath;
            if (localeDataPath) {
                localeDataContent = await loadLocaleData(localeDataPath, true, options.es5);
            }
        }
        const { diagnostics: localeDiagnostics, plugins } = await createI18nPlugins(locale, translations, isSourceLocale ? 'ignore' : options.missingTranslation || 'warning', true, localeDataContent);
        const transformResult = await core_1.transformFromAstSync(ast, options.code, {
            filename: options.filename,
            // using false ensures that babel will NOT search and process sourcemap comments (large memory usage)
            // The types do not include the false option even though it is valid
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            inputSourceMap: false,
            babelrc: false,
            configFile: false,
            plugins,
            compact: !environment_options_1.shouldBeautify,
            sourceMaps: !!options.map,
        });
        diagnostics.push(...localeDiagnostics.messages);
        if (!transformResult || !transformResult.code) {
            throw new Error(`Unknown error occurred processing bundle for "${options.filename}".`);
        }
        const outputPath = path.join(options.outputPath, i18n.flatOutput ? '' : locale, options.filename);
        fs.writeFileSync(outputPath, transformResult.code);
        if (options.map && transformResult.map) {
            const outputMap = remapping_1.default([transformResult.map, options.map], () => null);
            fs.writeFileSync(outputPath + '.map', JSON.stringify(outputMap));
        }
    }
    return { file: options.filename, diagnostics };
}
exports.inlineLocales = inlineLocales;
async function inlineLocalesDirect(ast, options) {
    if (!i18n || i18n.inlineLocales.size === 0) {
        return { file: options.filename, diagnostics: [], count: 0 };
    }
    const { default: generate } = await Promise.resolve().then(() => __importStar(require('@babel/generator')));
    const utils = await Promise.resolve().then(() => __importStar(require('@angular/localize/src/tools/src/source_file_utils')));
    const localizeDiag = await Promise.resolve().then(() => __importStar(require('@angular/localize/src/tools/src/diagnostics')));
    const diagnostics = new localizeDiag.Diagnostics();
    const positions = findLocalizePositions(ast, options, utils);
    if (positions.length === 0 && !options.setLocale) {
        return inlineCopyOnly(options);
    }
    const inputMap = !!options.map && JSON.parse(options.map);
    // Cleanup source root otherwise it will be added to each source entry
    const mapSourceRoot = inputMap && inputMap.sourceRoot;
    if (inputMap) {
        delete inputMap.sourceRoot;
    }
    // Load Webpack only when needed
    if (webpackSources === undefined) {
        webpackSources = (await Promise.resolve().then(() => __importStar(require('webpack')))).sources;
    }
    const { ConcatSource, OriginalSource, ReplaceSource, SourceMapSource } = webpackSources;
    for (const locale of i18n.inlineLocales) {
        const content = new ReplaceSource(inputMap
            ? new SourceMapSource(options.code, options.filename, inputMap)
            : new OriginalSource(options.code, options.filename));
        const isSourceLocale = locale === i18n.sourceLocale;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const translations = isSourceLocale ? {} : i18n.locales[locale].translation || {};
        for (const position of positions) {
            const translated = utils.translate(diagnostics, translations, position.messageParts, position.expressions, isSourceLocale ? 'ignore' : options.missingTranslation || 'warning');
            const expression = utils.buildLocalizeReplacement(translated[0], translated[1]);
            const { code } = generate(expression);
            content.replace(position.start, position.end - 1, code);
        }
        let outputSource = content;
        if (options.setLocale) {
            const setLocaleText = `var $localize=Object.assign(void 0===$localize?{}:$localize,{locale:"${locale}"});\n`;
            // If locale data is provided, load it and prepend to file
            let localeDataSource;
            const localeDataPath = i18n.locales[locale] && i18n.locales[locale].dataPath;
            if (localeDataPath) {
                const localeDataContent = await loadLocaleData(localeDataPath, true, options.es5);
                localeDataSource = new OriginalSource(localeDataContent, path.basename(localeDataPath));
            }
            outputSource = localeDataSource
                ? // The semicolon ensures that there is no syntax error between statements
                    new ConcatSource(setLocaleText, localeDataSource, ';\n', content)
                : new ConcatSource(setLocaleText, content);
        }
        const { source: outputCode, map: outputMap } = outputSource.sourceAndMap();
        const outputPath = path.join(options.outputPath, i18n.flatOutput ? '' : locale, options.filename);
        fs.writeFileSync(outputPath, outputCode);
        if (inputMap && outputMap) {
            outputMap.file = options.filename;
            if (mapSourceRoot) {
                outputMap.sourceRoot = mapSourceRoot;
            }
            fs.writeFileSync(outputPath + '.map', JSON.stringify(outputMap));
        }
    }
    return { file: options.filename, diagnostics: diagnostics.messages, count: positions.length };
}
function inlineCopyOnly(options) {
    if (!i18n) {
        throw new Error('i18n options are missing');
    }
    for (const locale of i18n.inlineLocales) {
        const outputPath = path.join(options.outputPath, i18n.flatOutput ? '' : locale, options.filename);
        fs.writeFileSync(outputPath, options.code);
        if (options.map) {
            fs.writeFileSync(outputPath + '.map', options.map);
        }
    }
    return { file: options.filename, diagnostics: [], count: 0 };
}
function findLocalizePositions(ast, options, utils) {
    const positions = [];
    // Workaround to ensure a path hub is present for traversal
    const { File } = require('@babel/core');
    const file = new File({}, { code: options.code, ast });
    if (options.es5) {
        core_1.traverse(file.ast, {
            CallExpression(path) {
                const callee = path.get('callee');
                if (callee.isIdentifier() &&
                    callee.node.name === localizeName &&
                    utils.isGlobalIdentifier(callee)) {
                    const [messageParts, expressions] = unwrapLocalizeCall(path, utils);
                    positions.push({
                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                        start: path.node.start,
                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                        end: path.node.end,
                        messageParts,
                        expressions,
                    });
                }
            },
        });
    }
    else {
        core_1.traverse(file.ast, {
            TaggedTemplateExpression(path) {
                if (core_1.types.isIdentifier(path.node.tag) && path.node.tag.name === localizeName) {
                    const [messageParts, expressions] = unwrapTemplateLiteral(path, utils);
                    positions.push({
                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                        start: path.node.start,
                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                        end: path.node.end,
                        messageParts,
                        expressions,
                    });
                }
            },
        });
    }
    return positions;
}
function unwrapTemplateLiteral(path, utils) {
    const [messageParts] = utils.unwrapMessagePartsFromTemplateLiteral(path.get('quasi').get('quasis'));
    const [expressions] = utils.unwrapExpressionsFromTemplateLiteral(path.get('quasi'));
    return [messageParts, expressions];
}
function unwrapLocalizeCall(path, utils) {
    const [messageParts] = utils.unwrapMessagePartsFromLocalizeCall(path);
    const [expressions] = utils.unwrapSubstitutionsFromLocalizeCall(path);
    return [messageParts, expressions];
}
async function loadLocaleData(path, optimize, es5) {
    // The path is validated during option processing before the build starts
    const content = fs.readFileSync(path, 'utf8');
    // Downlevel and optimize the data
    const transformResult = await core_1.transformAsync(content, {
        filename: path,
        // The types do not include the false option even though it is valid
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inputSourceMap: false,
        babelrc: false,
        configFile: false,
        presets: [
            [
                require.resolve('@babel/preset-env'),
                {
                    bugfixes: true,
                    // IE 11 is the oldest supported browser
                    targets: es5 ? { ie: '11' } : { esmodules: true },
                },
            ],
        ],
        minified: environment_options_1.allowMinify && optimize,
        compact: !environment_options_1.shouldBeautify && optimize,
        comments: !optimize,
    });
    if (!transformResult || !transformResult.code) {
        throw new Error(`Unknown error occurred processing bundle for "${path}".`);
    }
    return transformResult.code;
}
