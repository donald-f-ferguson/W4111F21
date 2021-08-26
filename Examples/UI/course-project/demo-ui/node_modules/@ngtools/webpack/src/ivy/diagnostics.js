"use strict";
/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.addError = exports.addWarning = exports.createDiagnosticsReporter = void 0;
const compiler_cli_1 = require("@angular/compiler-cli");
const typescript_1 = require("typescript");
function createDiagnosticsReporter(compilation) {
    return (diagnostics) => {
        for (const diagnostic of diagnostics) {
            const text = compiler_cli_1.formatDiagnostics([diagnostic]);
            if (diagnostic.category === typescript_1.DiagnosticCategory.Error) {
                addError(compilation, text);
            }
            else {
                addWarning(compilation, text);
            }
        }
    };
}
exports.createDiagnosticsReporter = createDiagnosticsReporter;
function addWarning(compilation, message) {
    compilation.warnings.push(new compilation.compiler.webpack.WebpackError(message));
}
exports.addWarning = addWarning;
function addError(compilation, message) {
    compilation.errors.push(new compilation.compiler.webpack.WebpackError(message));
}
exports.addError = addError;
