/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define("@angular/compiler-cli/src/ngtsc/typecheck/src/completion", ["require", "exports", "tslib", "@angular/compiler", "@angular/compiler/src/compiler", "@angular/compiler/src/render3/r3_ast", "typescript", "@angular/compiler-cli/src/ngtsc/typecheck/api", "@angular/compiler-cli/src/ngtsc/typecheck/src/comments"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CompletionEngine = void 0;
    var tslib_1 = require("tslib");
    var compiler_1 = require("@angular/compiler");
    var compiler_2 = require("@angular/compiler/src/compiler");
    var r3_ast_1 = require("@angular/compiler/src/render3/r3_ast");
    var ts = require("typescript");
    var api_1 = require("@angular/compiler-cli/src/ngtsc/typecheck/api");
    var comments_1 = require("@angular/compiler-cli/src/ngtsc/typecheck/src/comments");
    /**
     * Powers autocompletion for a specific component.
     *
     * Internally caches autocompletion results, and must be discarded if the component template or
     * surrounding TS program have changed.
     */
    var CompletionEngine = /** @class */ (function () {
        function CompletionEngine(tcb, data, shimPath) {
            this.tcb = tcb;
            this.data = data;
            this.shimPath = shimPath;
            /**
             * Cache of completions for various levels of the template, including the root template (`null`).
             * Memoizes `getTemplateContextCompletions`.
             */
            this.templateContextCache = new Map();
            this.expressionCompletionCache = new Map();
            // Find the component completion expression within the TCB. This looks like: `ctx. /* ... */;`
            var globalRead = comments_1.findFirstMatchingNode(this.tcb, {
                filter: ts.isPropertyAccessExpression,
                withExpressionIdentifier: comments_1.ExpressionIdentifier.COMPONENT_COMPLETION
            });
            if (globalRead !== null) {
                this.componentContext = {
                    shimPath: this.shimPath,
                    // `globalRead.name` is an empty `ts.Identifier`, so its start position immediately follows
                    // the `.` in `ctx.`. TS autocompletion APIs can then be used to access completion results
                    // for the component context.
                    positionInShimFile: globalRead.name.getStart(),
                };
            }
            else {
                this.componentContext = null;
            }
        }
        /**
         * Get global completions within the given template context and AST node.
         *
         * @param context the given template context - either a `TmplAstTemplate` embedded view, or `null`
         *     for the root
         * template context.
         * @param node the given AST node
         */
        CompletionEngine.prototype.getGlobalCompletions = function (context, node) {
            if (this.componentContext === null) {
                return null;
            }
            var templateContext = this.getTemplateContextCompletions(context);
            if (templateContext === null) {
                return null;
            }
            var nodeContext = null;
            if (node instanceof compiler_2.EmptyExpr) {
                var nodeLocation = comments_1.findFirstMatchingNode(this.tcb, {
                    filter: ts.isIdentifier,
                    withSpan: node.sourceSpan,
                });
                if (nodeLocation !== null) {
                    nodeContext = {
                        shimPath: this.shimPath,
                        positionInShimFile: nodeLocation.getStart(),
                    };
                }
            }
            if (node instanceof compiler_2.PropertyRead && node.receiver instanceof compiler_2.ImplicitReceiver) {
                var nodeLocation = comments_1.findFirstMatchingNode(this.tcb, {
                    filter: ts.isPropertyAccessExpression,
                    withSpan: node.sourceSpan,
                });
                if (nodeLocation) {
                    nodeContext = {
                        shimPath: this.shimPath,
                        positionInShimFile: nodeLocation.getStart(),
                    };
                }
            }
            return {
                componentContext: this.componentContext,
                templateContext: templateContext,
                nodeContext: nodeContext,
            };
        };
        CompletionEngine.prototype.getExpressionCompletionLocation = function (expr) {
            if (this.expressionCompletionCache.has(expr)) {
                return this.expressionCompletionCache.get(expr);
            }
            // Completion works inside property reads and method calls.
            var tsExpr = null;
            if (expr instanceof compiler_2.PropertyRead || expr instanceof compiler_2.MethodCall ||
                expr instanceof compiler_2.PropertyWrite) {
                // Non-safe navigation operations are trivial: `foo.bar` or `foo.bar()`
                tsExpr = comments_1.findFirstMatchingNode(this.tcb, {
                    filter: ts.isPropertyAccessExpression,
                    withSpan: expr.nameSpan,
                });
            }
            else if (expr instanceof compiler_2.SafePropertyRead || expr instanceof compiler_2.SafeMethodCall) {
                // Safe navigation operations are a little more complex, and involve a ternary. Completion
                // happens in the "true" case of the ternary.
                var ternaryExpr = comments_1.findFirstMatchingNode(this.tcb, {
                    filter: ts.isParenthesizedExpression,
                    withSpan: expr.sourceSpan,
                });
                if (ternaryExpr === null || !ts.isConditionalExpression(ternaryExpr.expression)) {
                    return null;
                }
                var whenTrue = ternaryExpr.expression.whenTrue;
                if (expr instanceof compiler_2.SafePropertyRead && ts.isPropertyAccessExpression(whenTrue)) {
                    tsExpr = whenTrue;
                }
                else if (expr instanceof compiler_2.SafeMethodCall && ts.isCallExpression(whenTrue) &&
                    ts.isPropertyAccessExpression(whenTrue.expression)) {
                    tsExpr = whenTrue.expression;
                }
            }
            if (tsExpr === null) {
                return null;
            }
            var res = {
                shimPath: this.shimPath,
                positionInShimFile: tsExpr.name.getEnd(),
            };
            this.expressionCompletionCache.set(expr, res);
            return res;
        };
        CompletionEngine.prototype.getLiteralCompletionLocation = function (expr) {
            if (this.expressionCompletionCache.has(expr)) {
                return this.expressionCompletionCache.get(expr);
            }
            var tsExpr = null;
            if (expr instanceof r3_ast_1.TextAttribute) {
                var strNode = comments_1.findFirstMatchingNode(this.tcb, {
                    filter: ts.isParenthesizedExpression,
                    withSpan: expr.sourceSpan,
                });
                if (strNode !== null && ts.isStringLiteral(strNode.expression)) {
                    tsExpr = strNode.expression;
                }
            }
            else {
                tsExpr = comments_1.findFirstMatchingNode(this.tcb, {
                    filter: function (n) {
                        return ts.isStringLiteral(n) || ts.isNumericLiteral(n);
                    },
                    withSpan: expr.sourceSpan,
                });
            }
            if (tsExpr === null) {
                return null;
            }
            var positionInShimFile = tsExpr.getEnd();
            if (ts.isStringLiteral(tsExpr)) {
                // In the shimFile, if `tsExpr` is a string, the position should be in the quotes.
                positionInShimFile -= 1;
            }
            var res = {
                shimPath: this.shimPath,
                positionInShimFile: positionInShimFile,
            };
            this.expressionCompletionCache.set(expr, res);
            return res;
        };
        /**
         * Get global completions within the given template context - either a `TmplAstTemplate` embedded
         * view, or `null` for the root context.
         */
        CompletionEngine.prototype.getTemplateContextCompletions = function (context) {
            var e_1, _a;
            if (this.templateContextCache.has(context)) {
                return this.templateContextCache.get(context);
            }
            var templateContext = new Map();
            try {
                // The bound template already has details about the references and variables in scope in the
                // `context` template - they just need to be converted to `Completion`s.
                for (var _b = tslib_1.__values(this.data.boundTarget.getEntitiesInTemplateScope(context)), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var node = _c.value;
                    if (node instanceof compiler_1.TmplAstReference) {
                        templateContext.set(node.name, {
                            kind: api_1.CompletionKind.Reference,
                            node: node,
                        });
                    }
                    else {
                        templateContext.set(node.name, {
                            kind: api_1.CompletionKind.Variable,
                            node: node,
                        });
                    }
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_1) throw e_1.error; }
            }
            this.templateContextCache.set(context, templateContext);
            return templateContext;
        };
        return CompletionEngine;
    }());
    exports.CompletionEngine = CompletionEngine;
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcGxldGlvbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BhY2thZ2VzL2NvbXBpbGVyLWNsaS9zcmMvbmd0c2MvdHlwZWNoZWNrL3NyYy9jb21wbGV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7R0FNRzs7Ozs7Ozs7Ozs7Ozs7SUFFSCw4Q0FBb0U7SUFDcEUsMkRBQTBMO0lBQzFMLCtEQUFtRTtJQUNuRSwrQkFBaUM7SUFHakMscUVBQStHO0lBRS9HLG1GQUF1RTtJQUd2RTs7Ozs7T0FLRztJQUNIO1FBZUUsMEJBQW9CLEdBQVksRUFBVSxJQUFrQixFQUFVLFFBQXdCO1lBQTFFLFFBQUcsR0FBSCxHQUFHLENBQVM7WUFBVSxTQUFJLEdBQUosSUFBSSxDQUFjO1lBQVUsYUFBUSxHQUFSLFFBQVEsQ0FBZ0I7WUFaOUY7OztlQUdHO1lBQ0sseUJBQW9CLEdBQ3hCLElBQUksR0FBRyxFQUE2RSxDQUFDO1lBRWpGLDhCQUF5QixHQUFHLElBQUksR0FBRyxFQUV4QixDQUFDO1lBSWxCLDhGQUE4RjtZQUM5RixJQUFNLFVBQVUsR0FBRyxnQ0FBcUIsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFO2dCQUNqRCxNQUFNLEVBQUUsRUFBRSxDQUFDLDBCQUEwQjtnQkFDckMsd0JBQXdCLEVBQUUsK0JBQW9CLENBQUMsb0JBQW9CO2FBQ3BFLENBQUMsQ0FBQztZQUVILElBQUksVUFBVSxLQUFLLElBQUksRUFBRTtnQkFDdkIsSUFBSSxDQUFDLGdCQUFnQixHQUFHO29CQUN0QixRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVE7b0JBQ3ZCLDJGQUEyRjtvQkFDM0YsMEZBQTBGO29CQUMxRiw2QkFBNkI7b0JBQzdCLGtCQUFrQixFQUFFLFVBQVUsQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFO2lCQUMvQyxDQUFDO2FBQ0g7aUJBQU07Z0JBQ0wsSUFBSSxDQUFDLGdCQUFnQixHQUFHLElBQUks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LENBQUUsQ0FBQzthQUNoRDtZQUVELElBQU0sZUFBZSxHQUFHLElBQUksR0FBRyxFQUFrRCxDQUFDOztnQkFFbEYsNEZBQTRGO2dCQUM1Rix3RUFBd0U7Z0JBQ3hFLEtBQW1CLElBQUEsS0FBQSxpQkFBQSxJQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQywwQkFBMEIsQ0FBQyxPQUFPLENBQUMsQ0FBQSxnQkFBQSw0QkFBRTtvQkFBekUsSUFBTSxJQUFJLFdBQUE7b0JBQ2IsSUFBSSxJQUFJLFlBQVksMkJBQWdCLEVBQUU7d0JBQ3BDLGVBQWUsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRTs0QkFDN0IsSUFBSSxFQUFFLG9CQUFjLENBQUMsU0FBUzs0QkFDOUIsSUFBSSxNQUFBO3lCQUNMLENBQUMsQ0FBQztxQkFDSjt5QkFBTTt3QkFDTCxlQUFlLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUU7NEJBQzdCLElBQUksRUFBRSxvQkFBYyxDQUFDLFFBQVE7NEJBQzdCLElBQUksTUFBQTt5QkFDTCxDQUFDLENBQUM7cUJBQ0o7aUJBQ0Y7Ozs7Ozs7OztZQUVELElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsT0FBTyxFQUFFLGVBQWUsQ0FBQyxDQUFDO1lBQ3hELE9BQU8sZUFBZSxDQUFDO1FBQ3pCLENBQUM7UUFDSCx1QkFBQztJQUFELENBQUMsQUEvTUQsSUErTUM7SUEvTVksNENBQWdCIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IEdvb2dsZSBMTEMgQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5cbmltcG9ydCB7VG1wbEFzdFJlZmVyZW5jZSwgVG1wbEFzdFRlbXBsYXRlfSBmcm9tICdAYW5ndWxhci9jb21waWxlcic7XG5pbXBvcnQge0FTVCwgRW1wdHlFeHByLCBJbXBsaWNpdFJlY2VpdmVyLCBMaXRlcmFsUHJpbWl0aXZlLCBNZXRob2RDYWxsLCBQcm9wZXJ0eVJlYWQsIFByb3BlcnR5V3JpdGUsIFNhZmVNZXRob2RDYWxsLCBTYWZlUHJvcGVydHlSZWFkLCBUbXBsQXN0Tm9kZX0gZnJvbSAnQGFuZ3VsYXIvY29tcGlsZXIvc3JjL2NvbXBpbGVyJztcbmltcG9ydCB7VGV4dEF0dHJpYnV0ZX0gZnJvbSAnQGFuZ3VsYXIvY29tcGlsZXIvc3JjL3JlbmRlcjMvcjNfYXN0JztcbmltcG9ydCAqIGFzIHRzIGZyb20gJ3R5cGVzY3JpcHQnO1xuXG5pbXBvcnQge0Fic29sdXRlRnNQYXRofSBmcm9tICcuLi8uLi9maWxlX3N5c3RlbSc7XG5pbXBvcnQge0NvbXBsZXRpb25LaW5kLCBHbG9iYWxDb21wbGV0aW9uLCBSZWZlcmVuY2VDb21wbGV0aW9uLCBTaGltTG9jYXRpb24sIFZhcmlhYmxlQ29tcGxldGlvbn0gZnJvbSAnLi4vYXBpJztcblxuaW1wb3J0IHtFeHByZXNzaW9uSWRlbnRpZmllciwgZmluZEZpcnN0TWF0Y2hpbmdOb2RlfSBmcm9tICcuL2NvbW1lbnRzJztcbmltcG9ydCB7VGVtcGxhdGVEYXRhfSBmcm9tICcuL2NvbnRleHQnO1xuXG4vKipcbiAqIFBvd2VycyBhdXRvY29tcGxldGlvbiBmb3IgYSBzcGVjaWZpYyBjb21wb25lbnQuXG4gKlxuICogSW50ZXJuYWxseSBjYWNoZXMgYXV0b2NvbXBsZXRpb24gcmVzdWx0cywgYW5kIG11c3QgYmUgZGlzY2FyZGVkIGlmIHRoZSBjb21wb25lbnQgdGVtcGxhdGUgb3JcbiAqIHN1cnJvdW5kaW5nIFRTIHByb2dyYW0gaGF2ZSBjaGFuZ2VkLlxuICovXG5leHBvcnQgY2xhc3MgQ29tcGxldGlvbkVuZ2luZSB7XG4gIHByaXZhdGUgY29tcG9uZW50Q29udGV4dDogU2hpbUxvY2F0aW9ufG51bGw7XG5cbiAgLyoqXG4gICAqIENhY2hlIG9mIGNvbXBsZXRpb25zIGZvciB2YXJpb3VzIGxldmVscyBvZiB0aGUgdGVtcGxhdGUsIGluY2x1ZGluZyB0aGUgcm9vdCB0ZW1wbGF0ZSAoYG51bGxgKS5cbiAgICogTWVtb2l6ZXMgYGdldFRlbXBsYXRlQ29udGV4dENvbXBsZXRpb25zYC5cbiAgICovXG4gIHByaXZhdGUgdGVtcGxhdGVDb250ZXh0Q2FjaGUgPVxuICAgICAgbmV3IE1hcDxUbXBsQXN0VGVtcGxhdGV8bnVsbCwgTWFwPHN0cmluZywgUmVmZXJlbmNlQ29tcGxldGlvbnxWYXJpYWJsZUNvbXBsZXRpb24+PigpO1xuXG4gIHByaXZhdGUgZXhwcmVzc2lvbkNvbXBsZXRpb25DYWNoZSA9IG5ldyBNYXA8XG4gICAgICBQcm9wZXJ0eVJlYWR8U2FmZVByb3BlcnR5UmVhZHxNZXRob2RDYWxsfFNhZmVNZXRob2RDYWxsfExpdGVyYWxQcmltaXRpdmV8VGV4dEF0dHJpYnV0ZSxcbiAgICAgIFNoaW1Mb2NhdGlvbj4oKTtcblxuXG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgdGNiOiB0cy5Ob2RlLCBwcml2YXRlIGRhdGE6IFRlbXBsYXRlRGF0YSwgcHJpdmF0ZSBzaGltUGF0aDogQWJzb2x1dGVGc1BhdGgpIHtcbiAgICAvLyBGaW5kIHRoZSBjb21wb25lbnQgY29tcGxldGlvbiBleHByZXNzaW9uIHdpdGhpbiB0aGUgVENCLiBUaGlzIGxvb2tzIGxpa2U6IGBjdHguIC8qIC4uLiAqLztgXG4gICAgY29uc3QgZ2xvYmFsUmVhZCA9IGZpbmRGaXJzdE1hdGNoaW5nTm9kZSh0aGlzLnRjYiwge1xuICAgICAgZmlsdGVyOiB0cy5pc1Byb3BlcnR5QWNjZXNzRXhwcmVzc2lvbixcbiAgICAgIHdpdGhFeHByZXNzaW9uSWRlbnRpZmllcjogRXhwcmVzc2lvbklkZW50aWZpZXIuQ09NUE9ORU5UX0NPTVBMRVRJT05cbiAgICB9KTtcblxuICAgIGlmIChnbG9iYWxSZWFkICE9PSBudWxsKSB7XG4gICAgICB0aGlzLmNvbXBvbmVudENvbnRleHQgPSB7XG4gICAgICAgIHNoaW1QYXRoOiB0aGlzLnNoaW1QYXRoLFxuICAgICAgICAvLyBgZ2xvYmFsUmVhZC5uYW1lYCBpcyBhbiBlbXB0eSBgdHMuSWRlbnRpZmllcmAsIHNvIGl0cyBzdGFydCBwb3NpdGlvbiBpbW1lZGlhdGVseSBmb2xsb3dzXG4gICAgICAgIC8vIHRoZSBgLmAgaW4gYGN0eC5gLiBUUyBhdXRvY29tcGxldGlvbiBBUElzIGNhbiB0aGVuIGJlIHVzZWQgdG8gYWNjZXNzIGNvbXBsZXRpb24gcmVzdWx0c1xuICAgICAgICAvLyBmb3IgdGhlIGNvbXBvbmVudCBjb250ZXh0LlxuICAgICAgICBwb3NpdGlvbkluU2hpbUZpbGU6IGdsb2JhbFJlYWQubmFtZS5nZXRTdGFydCgpLFxuICAgICAgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5jb21wb25lbnRDb250ZXh0ID0gbnVsbDtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogR2V0IGdsb2JhbCBjb21wbGV0aW9ucyB3aXRoaW4gdGhlIGdpdmVuIHRlbXBsYXRlIGNvbnRleHQgYW5kIEFTVCBub2RlLlxuICAgKlxuICAgKiBAcGFyYW0gY29udGV4dCB0aGUgZ2l2ZW4gdGVtcGxhdGUgY29udGV4dCAtIGVpdGhlciBhIGBUbXBsQXN0VGVtcGxhdGVgIGVtYmVkZGVkIHZpZXcsIG9yIGBudWxsYFxuICAgKiAgICAgZm9yIHRoZSByb290XG4gICAqIHRlbXBsYXRlIGNvbnRleHQuXG4gICAqIEBwYXJhbSBub2RlIHRoZSBnaXZlbiBBU1Qgbm9kZVxuICAgKi9cbiAgZ2V0R2xvYmFsQ29tcGxldGlvbnMoY29udGV4dDogVG1wbEFzdFRlbXBsYXRlfG51bGwsIG5vZGU6IEFTVHxUbXBsQXN0Tm9kZSk6IEdsb2JhbENvbXBsZXRpb25cbiAgICAgIHxudWxsIHtcbiAgICBpZiAodGhpcy5jb21wb25lbnRDb250ZXh0ID09PSBudWxsKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCB0ZW1wbGF0ZUNvbnRleHQgPSB0aGlzLmdldFRlbXBsYXRlQ29udGV4dENvbXBsZXRpb25zKGNvbnRleHQpO1xuICAgIGlmICh0ZW1wbGF0ZUNvbnRleHQgPT09IG51bGwpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGxldCBub2RlQ29udGV4dDogU2hpbUxvY2F0aW9ufG51bGwgPSBudWxsO1xuICAgIGlmIChub2RlIGluc3RhbmNlb2YgRW1wdHlFeHByKSB7XG4gICAgICBjb25zdCBub2RlTG9jYXRpb24gPSBmaW5kRmlyc3RNYXRjaGluZ05vZGUodGhpcy50Y2IsIHtcbiAgICAgICAgZmlsdGVyOiB0cy5pc0lkZW50aWZpZXIsXG4gICAgICAgIHdpdGhTcGFuOiBub2RlLnNvdXJjZVNwYW4sXG4gICAgICB9KTtcbiAgICAgIGlmIChub2RlTG9jYXRpb24gIT09IG51bGwpIHtcbiAgICAgICAgbm9kZUNvbnRleHQgPSB7XG4gICAgICAgICAgc2hpbVBhdGg6IHRoaXMuc2hpbVBhdGgsXG4gICAgICAgICAgcG9zaXRpb25JblNoaW1GaWxlOiBub2RlTG9jYXRpb24uZ2V0U3RhcnQoKSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAobm9kZSBpbnN0YW5jZW9mIFByb3BlcnR5UmVhZCAmJiBub2RlLnJlY2VpdmVyIGluc3RhbmNlb2YgSW1wbGljaXRSZWNlaXZlcikge1xuICAgICAgY29uc3Qgbm9kZUxvY2F0aW9uID0gZmluZEZpcnN0TWF0Y2hpbmdOb2RlKHRoaXMudGNiLCB7XG4gICAgICAgIGZpbHRlcjogdHMuaXNQcm9wZXJ0eUFjY2Vzc0V4cHJlc3Npb24sXG4gICAgICAgIHdpdGhTcGFuOiBub2RlLnNvdXJjZVNwYW4sXG4gICAgICB9KTtcbiAgICAgIGlmIChub2RlTG9jYXRpb24pIHtcbiAgICAgICAgbm9kZUNvbnRleHQgPSB7XG4gICAgICAgICAgc2hpbVBhdGg6IHRoaXMuc2hpbVBhdGgsXG4gICAgICAgICAgcG9zaXRpb25JblNoaW1GaWxlOiBub2RlTG9jYXRpb24uZ2V0U3RhcnQoKSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgY29tcG9uZW50Q29udGV4dDogdGhpcy5jb21wb25lbnRDb250ZXh0LFxuICAgICAgdGVtcGxhdGVDb250ZXh0LFxuICAgICAgbm9kZUNvbnRleHQsXG4gICAgfTtcbiAgfVxuXG4gIGdldEV4cHJlc3Npb25Db21wbGV0aW9uTG9jYXRpb24oZXhwcjogUHJvcGVydHlSZWFkfFByb3BlcnR5V3JpdGV8TWV0aG9kQ2FsbHxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBTYWZlTWV0aG9kQ2FsbCk6IFNoaW1Mb2NhdGlvbnxudWxsIHtcbiAgICBpZiAodGhpcy5leHByZXNzaW9uQ29tcGxldGlvbkNhY2hlLmhhcyhleHByKSkge1xuICAgICAgcmV0dXJuIHRoaXMuZXhwcmVzc2lvbkNvbXBsZXRpb25DYWNoZS5nZXQoZXhwcikhO1xuICAgIH1cblxuICAgIC8vIENvbXBsZXRpb24gd29ya3MgaW5zaWRlIHByb3BlcnR5IHJlYWRzIGFuZCBtZXRob2QgY2FsbHMuXG4gICAgbGV0IHRzRXhwcjogdHMuUHJvcGVydHlBY2Nlc3NFeHByZXNzaW9ufG51bGwgPSBudWxsO1xuICAgIGlmIChleHByIGluc3RhbmNlb2YgUHJvcGVydHlSZWFkIHx8IGV4cHIgaW5zdGFuY2VvZiBNZXRob2RDYWxsIHx8XG4gICAgICAgIGV4cHIgaW5zdGFuY2VvZiBQcm9wZXJ0eVdyaXRlKSB7XG4gICAgICAvLyBOb24tc2FmZSBuYXZpZ2F0aW9uIG9wZXJhdGlvbnMgYXJlIHRyaXZpYWw6IGBmb28uYmFyYCBvciBgZm9vLmJhcigpYFxuICAgICAgdHNFeHByID0gZmluZEZpcnN0TWF0Y2hpbmdOb2RlKHRoaXMudGNiLCB7XG4gICAgICAgIGZpbHRlcjogdHMuaXNQcm9wZXJ0eUFjY2Vzc0V4cHJlc3Npb24sXG4gICAgICAgIHdpdGhTcGFuOiBleHByLm5hbWVTcGFuLFxuICAgICAgfSk7XG4gICAgfSBlbHNlIGlmIChleHByIGluc3RhbmNlb2YgU2FmZVByb3BlcnR5UmVhZCB8fCBleHByIGluc3RhbmNlb2YgU2FmZU1ldGhvZENhbGwpIHtcbiAgICAgIC8vIFNhZmUgbmF2aWdhdGlvbiBvcGVyYXRpb25zIGFyZSBhIGxpdHRsZSBtb3JlIGNvbXBsZXgsIGFuZCBpbnZvbHZlIGEgdGVybmFyeS4gQ29tcGxldGlvblxuICAgICAgLy8gaGFwcGVucyBpbiB0aGUgXCJ0cnVlXCIgY2FzZSBvZiB0aGUgdGVybmFyeS5cbiAgICAgIGNvbnN0IHRlcm5hcnlFeHByID0gZmluZEZpcnN0TWF0Y2hpbmdOb2RlKHRoaXMudGNiLCB7XG4gICAgICAgIGZpbHRlcjogdHMuaXNQYXJlbnRoZXNpemVkRXhwcmVzc2lvbixcbiAgICAgICAgd2l0aFNwYW46IGV4cHIuc291cmNlU3BhbixcbiAgICAgIH0pO1xuICAgICAgaWYgKHRlcm5hcnlFeHByID09PSBudWxsIHx8ICF0cy5pc0NvbmRpdGlvbmFsRXhwcmVzc2lvbih0ZXJuYXJ5RXhwci5leHByZXNzaW9uKSkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHdoZW5UcnVlID0gdGVybmFyeUV4cHIuZXhwcmVzc2lvbi53aGVuVHJ1ZTtcblxuICAgICAgaWYgKGV4cHIgaW5zdGFuY2VvZiBTYWZlUHJvcGVydHlSZWFkICYmIHRzLmlzUHJvcGVydHlBY2Nlc3NFeHByZXNzaW9uKHdoZW5UcnVlKSkge1xuICAgICAgICB0c0V4cHIgPSB3aGVuVHJ1ZTtcbiAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAgZXhwciBpbnN0YW5jZW9mIFNhZmVNZXRob2RDYWxsICYmIHRzLmlzQ2FsbEV4cHJlc3Npb24od2hlblRydWUpICYmXG4gICAgICAgICAgdHMuaXNQcm9wZXJ0eUFjY2Vzc0V4cHJlc3Npb24od2hlblRydWUuZXhwcmVzc2lvbikpIHtcbiAgICAgICAgdHNFeHByID0gd2hlblRydWUuZXhwcmVzc2lvbjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAodHNFeHByID09PSBudWxsKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCByZXM6IFNoaW1Mb2NhdGlvbiA9IHtcbiAgICAgIHNoaW1QYXRoOiB0aGlzLnNoaW1QYXRoLFxuICAgICAgcG9zaXRpb25JblNoaW1GaWxlOiB0c0V4cHIubmFtZS5nZXRFbmQoKSxcbiAgICB9O1xuICAgIHRoaXMuZXhwcmVzc2lvbkNvbXBsZXRpb25DYWNoZS5zZXQoZXhwciwgcmVzKTtcbiAgICByZXR1cm4gcmVzO1xuICB9XG5cbiAgZ2V0TGl0ZXJhbENvbXBsZXRpb25Mb2NhdGlvbihleHByOiBMaXRlcmFsUHJpbWl0aXZlfFRleHRBdHRyaWJ1dGUpOiBTaGltTG9jYXRpb258bnVsbCB7XG4gICAgaWYgKHRoaXMuZXhwcmVzc2lvbkNvbXBsZXRpb25DYWNoZS5oYXMoZXhwcikpIHtcbiAgICAgIHJldHVybiB0aGlzLmV4cHJlc3Npb25Db21wbGV0aW9uQ2FjaGUuZ2V0KGV4cHIpITtcbiAgICB9XG5cbiAgICBsZXQgdHNFeHByOiB0cy5TdHJpbmdMaXRlcmFsfHRzLk51bWVyaWNMaXRlcmFsfG51bGwgPSBudWxsO1xuXG4gICAgaWYgKGV4cHIgaW5zdGFuY2VvZiBUZXh0QXR0cmlidXRlKSB7XG4gICAgICBjb25zdCBzdHJOb2RlID0gZmluZEZpcnN0TWF0Y2hpbmdOb2RlKHRoaXMudGNiLCB7XG4gICAgICAgIGZpbHRlcjogdHMuaXNQYXJlbnRoZXNpemVkRXhwcmVzc2lvbixcbiAgICAgICAgd2l0aFNwYW46IGV4cHIuc291cmNlU3BhbixcbiAgICAgIH0pO1xuICAgICAgaWYgKHN0ck5vZGUgIT09IG51bGwgJiYgdHMuaXNTdHJpbmdMaXRlcmFsKHN0ck5vZGUuZXhwcmVzc2lvbikpIHtcbiAgICAgICAgdHNFeHByID0gc3RyTm9kZS5leHByZXNzaW9uO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB0c0V4cHIgPSBmaW5kRmlyc3RNYXRjaGluZ05vZGUodGhpcy50Y2IsIHtcbiAgICAgICAgZmlsdGVyOiAobjogdHMuTm9kZSk6IG4gaXMgdHMuTnVtZXJpY0xpdGVyYWwgfCB0cy5TdHJpbmdMaXRlcmFsID0+XG4gICAgICAgICAgICB0cy5pc1N0cmluZ0xpdGVyYWwobikgfHwgdHMuaXNOdW1lcmljTGl0ZXJhbChuKSxcbiAgICAgICAgd2l0aFNwYW46IGV4cHIuc291cmNlU3BhbixcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGlmICh0c0V4cHIgPT09IG51bGwpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGxldCBwb3NpdGlvbkluU2hpbUZpbGUgPSB0c0V4cHIuZ2V0RW5kKCk7XG4gICAgaWYgKHRzLmlzU3RyaW5nTGl0ZXJhbCh0c0V4cHIpKSB7XG4gICAgICAvLyBJbiB0aGUgc2hpbUZpbGUsIGlmIGB0c0V4cHJgIGlzIGEgc3RyaW5nLCB0aGUgcG9zaXRpb24gc2hvdWxkIGJlIGluIHRoZSBxdW90ZXMuXG4gICAgICBwb3NpdGlvbkluU2hpbUZpbGUgLT0gMTtcbiAgICB9XG4gICAgY29uc3QgcmVzOiBTaGltTG9jYXRpb24gPSB7XG4gICAgICBzaGltUGF0aDogdGhpcy5zaGltUGF0aCxcbiAgICAgIHBvc2l0aW9uSW5TaGltRmlsZSxcbiAgICB9O1xuICAgIHRoaXMuZXhwcmVzc2lvbkNvbXBsZXRpb25DYWNoZS5zZXQoZXhwciwgcmVzKTtcbiAgICByZXR1cm4gcmVzO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCBnbG9iYWwgY29tcGxldGlvbnMgd2l0aGluIHRoZSBnaXZlbiB0ZW1wbGF0ZSBjb250ZXh0IC0gZWl0aGVyIGEgYFRtcGxBc3RUZW1wbGF0ZWAgZW1iZWRkZWRcbiAgICogdmlldywgb3IgYG51bGxgIGZvciB0aGUgcm9vdCBjb250ZXh0LlxuICAgKi9cbiAgcHJpdmF0ZSBnZXRUZW1wbGF0ZUNvbnRleHRDb21wbGV0aW9ucyhjb250ZXh0OiBUbXBsQXN0VGVtcGxhdGV8bnVsbCk6XG4gICAgICBNYXA8c3RyaW5nLCBSZWZlcmVuY2VDb21wbGV0aW9ufFZhcmlhYmxlQ29tcGxldGlvbj58bnVsbCB7XG4gICAgaWYgKHRoaXMudGVtcGxhdGVDb250ZXh0Q2FjaGUuaGFzKGNvbnRleHQpKSB7XG4gICAgICByZXR1cm4gdGhpcy50ZW1wbGF0ZUNvbnRleHRDYWNoZS5nZXQoY29udGV4dCkhO1xuICAgIH1cblxuICAgIGNvbnN0IHRlbXBsYXRlQ29udGV4dCA9IG5ldyBNYXA8c3RyaW5nLCBSZWZlcmVuY2VDb21wbGV0aW9ufFZhcmlhYmxlQ29tcGxldGlvbj4oKTtcblxuICAgIC8vIFRoZSBib3VuZCB0ZW1wbGF0ZSBhbHJlYWR5IGhhcyBkZXRhaWxzIGFib3V0IHRoZSByZWZlcmVuY2VzIGFuZCB2YXJpYWJsZXMgaW4gc2NvcGUgaW4gdGhlXG4gICAgLy8gYGNvbnRleHRgIHRlbXBsYXRlIC0gdGhleSBqdXN0IG5lZWQgdG8gYmUgY29udmVydGVkIHRvIGBDb21wbGV0aW9uYHMuXG4gICAgZm9yIChjb25zdCBub2RlIG9mIHRoaXMuZGF0YS5ib3VuZFRhcmdldC5nZXRFbnRpdGllc0luVGVtcGxhdGVTY29wZShjb250ZXh0KSkge1xuICAgICAgaWYgKG5vZGUgaW5zdGFuY2VvZiBUbXBsQXN0UmVmZXJlbmNlKSB7XG4gICAgICAgIHRlbXBsYXRlQ29udGV4dC5zZXQobm9kZS5uYW1lLCB7XG4gICAgICAgICAga2luZDogQ29tcGxldGlvbktpbmQuUmVmZXJlbmNlLFxuICAgICAgICAgIG5vZGUsXG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGVtcGxhdGVDb250ZXh0LnNldChub2RlLm5hbWUsIHtcbiAgICAgICAgICBraW5kOiBDb21wbGV0aW9uS2luZC5WYXJpYWJsZSxcbiAgICAgICAgICBub2RlLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aGlzLnRlbXBsYXRlQ29udGV4dENhY2hlLnNldChjb250ZXh0LCB0ZW1wbGF0ZUNvbnRleHQpO1xuICAgIHJldHVybiB0ZW1wbGF0ZUNvbnRleHQ7XG4gIH1cbn1cbiJdfQ==