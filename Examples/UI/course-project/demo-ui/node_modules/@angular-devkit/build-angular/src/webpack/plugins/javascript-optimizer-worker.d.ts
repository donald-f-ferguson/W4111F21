/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
/**
 * A request to optimize JavaScript using the supplied options.
 */
interface OptimizeRequest {
    /**
     * The options to use when optimizing.
     */
    options: {
        advanced: boolean;
        define?: Record<string, string>;
        keepNames: boolean;
        removeLicenses: boolean;
        sourcemap: boolean;
        target: 5 | 2015 | 2016 | 2017 | 2018 | 2019 | 2020;
    };
    /**
     * The JavaScript asset to optimize.
     */
    asset: {
        name: string;
        code: string;
        map: object;
    };
}
export default function ({ asset, options }: OptimizeRequest): Promise<{
    name: string;
    code: string;
    map: import("@ampproject/remapping/dist/types/source-map").default | undefined;
}>;
export {};
