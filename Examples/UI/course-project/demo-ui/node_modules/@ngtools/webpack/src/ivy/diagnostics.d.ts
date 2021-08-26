/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { Diagnostics } from '@angular/compiler-cli';
import type { Compilation } from 'webpack';
export declare type DiagnosticsReporter = (diagnostics: Diagnostics) => void;
export declare function createDiagnosticsReporter(compilation: Compilation): DiagnosticsReporter;
export declare function addWarning(compilation: Compilation, message: string): void;
export declare function addError(compilation: Compilation, message: string): void;
