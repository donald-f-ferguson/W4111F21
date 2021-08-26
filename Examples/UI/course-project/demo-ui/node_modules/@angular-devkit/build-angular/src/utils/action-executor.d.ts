/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { I18nOptions } from './i18n-options';
import { InlineOptions, ProcessBundleOptions, ProcessBundleResult } from './process-bundle';
export declare class BundleActionExecutor {
    private workerOptions;
    private workerPool?;
    private cache?;
    constructor(workerOptions: {
        cachePath?: string;
        i18n: I18nOptions;
    }, integrityAlgorithm?: string);
    private ensureWorkerPool;
    process(action: ProcessBundleOptions): Promise<ProcessBundleResult>;
    processAll(actions: Iterable<ProcessBundleOptions>): AsyncIterable<ProcessBundleResult>;
    inline(action: InlineOptions): Promise<{
        file: string;
        diagnostics: {
            type: string;
            message: string;
        }[];
        count: number;
    }>;
    inlineAll(actions: Iterable<InlineOptions>): AsyncIterable<{
        file: string;
        diagnostics: {
            type: string;
            message: string;
        }[];
        count: number;
    }>;
    private static executeAll;
    stop(): void;
}
