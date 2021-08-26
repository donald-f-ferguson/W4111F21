/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { ScriptTarget } from 'typescript';
import type { Compiler } from 'webpack';
/**
 * The options used to configure the {@link JavaScriptOptimizerPlugin}.
 */
export interface JavaScriptOptimizerOptions {
    /**
     * Enables advanced optimizations in the underlying JavaScript optimizers.
     * This currently increases the `terser` passes to 3 and enables the `pure_getters`
     * option for `terser`.
     */
    advanced: boolean;
    /**
     * An object record of string keys that will be replaced with their respective values when found
     * within the code during optimization.
     */
    define: Record<string, string | number | boolean>;
    /**
     * Enables the generation of a sourcemap during optimization.
     * The output sourcemap will be a full sourcemap containing the merge of the input sourcemap and
     * all intermediate sourcemaps.
     */
    sourcemap: boolean;
    /**
     * The ECMAScript version that should be used when generating output code.
     * The optimizer will not adjust the output code with features present in newer
     * ECMAScript versions.
     */
    target: ScriptTarget;
    /**
     * Enables the retention of identifier names and ensures that function and class names are
     * present in the output code.
     */
    keepNames: boolean;
    /**
     * Enables the removal of all license comments from the output code.
     */
    removeLicenses: boolean;
}
/**
 * A Webpack plugin that provides JavaScript optimization capabilities.
 *
 * The plugin uses both `esbuild` and `terser` to provide both fast and highly-optimized
 * code output. `esbuild` is used as an initial pass to remove the majority of unused code
 * as well as shorten identifiers. `terser` is then used as a secondary pass to apply
 * optimizations not yet implemented by `esbuild`.
 */
export declare class JavaScriptOptimizerPlugin {
    options: Partial<JavaScriptOptimizerOptions>;
    constructor(options?: Partial<JavaScriptOptimizerOptions>);
    apply(compiler: Compiler): void;
}
