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
exports.BundleActionExecutor = void 0;
const piscina_1 = __importDefault(require("piscina"));
const action_cache_1 = require("./action-cache");
const environment_options_1 = require("./environment-options");
const workerFile = require.resolve('./process-bundle');
class BundleActionExecutor {
    constructor(workerOptions, integrityAlgorithm) {
        this.workerOptions = workerOptions;
        if (workerOptions.cachePath) {
            this.cache = new action_cache_1.BundleActionCache(workerOptions.cachePath, integrityAlgorithm);
        }
    }
    ensureWorkerPool() {
        if (this.workerPool) {
            return this.workerPool;
        }
        this.workerPool = new piscina_1.default({
            filename: workerFile,
            name: 'process',
            workerData: this.workerOptions,
            maxThreads: environment_options_1.maxWorkers,
        });
        return this.workerPool;
    }
    async process(action) {
        if (this.cache) {
            const cacheKeys = this.cache.generateCacheKeys(action);
            action.cacheKeys = cacheKeys;
            // Try to get cached data, if it fails fallback to processing
            try {
                const cachedResult = await this.cache.getCachedBundleResult(action);
                if (cachedResult) {
                    return cachedResult;
                }
            }
            catch { }
        }
        return this.ensureWorkerPool().run(action, { name: 'process' });
    }
    processAll(actions) {
        return BundleActionExecutor.executeAll(actions, (action) => this.process(action));
    }
    async inline(action) {
        return this.ensureWorkerPool().run(action, { name: 'inlineLocales' });
    }
    inlineAll(actions) {
        return BundleActionExecutor.executeAll(actions, (action) => this.inline(action));
    }
    static async *executeAll(actions, executor) {
        const executions = new Map();
        for (const action of actions) {
            const execution = executor(action);
            executions.set(execution, execution.then((result) => {
                executions.delete(execution);
                return result;
            }));
        }
        while (executions.size > 0) {
            yield Promise.race(executions.values());
        }
    }
    stop() {
        var _a;
        void ((_a = this.workerPool) === null || _a === void 0 ? void 0 : _a.destroy());
    }
}
exports.BundleActionExecutor = BundleActionExecutor;
