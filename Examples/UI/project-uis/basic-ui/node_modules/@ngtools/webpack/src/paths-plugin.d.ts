/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { CompilerOptions } from 'typescript';
import type { Configuration } from 'webpack';
export interface TypeScriptPathsPluginOptions extends Pick<CompilerOptions, 'paths' | 'baseUrl'> {
}
declare type Resolver = Exclude<Exclude<Configuration['resolve'], undefined>['resolver'], undefined>;
export declare class TypeScriptPathsPlugin {
    private options?;
    constructor(options?: TypeScriptPathsPluginOptions | undefined);
    update(options: TypeScriptPathsPluginOptions): void;
    apply(resolver: Resolver): void;
}
export {};
