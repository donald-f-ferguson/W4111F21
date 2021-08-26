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
        define("@angular/compiler-cli/src/ngtsc/typecheck/src/type_check_block", ["require", "exports", "tslib", "@angular/compiler", "typescript", "@angular/compiler-cli/src/ngtsc/typecheck/src/comments", "@angular/compiler-cli/src/ngtsc/typecheck/src/diagnostics", "@angular/compiler-cli/src/ngtsc/typecheck/src/expression", "@angular/compiler-cli/src/ngtsc/typecheck/src/template_semantics", "@angular/compiler-cli/src/ngtsc/typecheck/src/ts_util", "@angular/compiler-cli/src/ngtsc/typecheck/src/type_constructor", "@angular/compiler-cli/src/ngtsc/typecheck/src/type_parameter_emitter"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Context = exports.TcbDirectiveOutputsOp = exports.generateTypeCheckBlock = exports.TcbGenericContextBehavior = void 0;
    var tslib_1 = require("tslib");
    var compiler_1 = require("@angular/compiler");
    var ts = require("typescript");
    var comments_1 = require("@angular/compiler-cli/src/ngtsc/typecheck/src/comments");
    var diagnostics_1 = require("@angular/compiler-cli/src/ngtsc/typecheck/src/diagnostics");
    var expression_1 = require("@angular/compiler-cli/src/ngtsc/typecheck/src/expression");
    var template_semantics_1 = require("@angular/compiler-cli/src/ngtsc/typecheck/src/template_semantics");
    var ts_util_1 = require("@angular/compiler-cli/src/ngtsc/typecheck/src/ts_util");
    var type_constructor_1 = require("@angular/compiler-cli/src/ngtsc/typecheck/src/type_constructor");
    var type_parameter_emitter_1 = require("@angular/compiler-cli/src/ngtsc/typecheck/src/type_parameter_emitter");
    /**
     * Controls how generics for the component context class will be handled during TCB generation.
     */
    var TcbGenericContextBehavior;
    (function (TcbGenericContextBehavior) {
        /**
         * References to generic parameter bounds will be emitted via the `TypeParameterEmitter`.
         *
         * The caller must verify that all parameter bounds are emittable in order to use this mode.
         */
        TcbGenericContextBehavior[TcbGenericContextBehavior["UseEmitter"] = 0] = "UseEmitter";
        /**
         * Generic parameter declarations will be copied directly from the `ts.ClassDeclaration` of the
         * component class.
         *
         * The caller must only use the generated TCB code in a context where such copies will still be
         * valid, such as an inline type check block.
         */
        TcbGenericContextBehavior[TcbGenericContextBehavior["CopyClassNodes"] = 1] = "CopyClassNodes";
        /**
         * Any generic parameters for the component context class will be set to `any`.
         *
         * Produces a less useful type, but is always safe to use.
         */
        TcbGenericContextBehavior[TcbGenericContextBehavior["FallbackToAny"] = 2] = "FallbackToAny";
    })(TcbGenericContextBehavior = exports.TcbGenericContextBehavior || (exports.TcbGenericContextBehavior = {}));
    /**
     * Given a `ts.ClassDeclaration` for a component, and metadata regarding that component, compose a
     * "type check block" function.
     *
     * When passed through TypeScript's TypeChecker, type errors that arise within the type check block
     * function indicate issues in the template itself.
     *
     * As a side effect of generating a TCB for the component, `ts.Diagnostic`s may also be produced
     * directly for issues within the template which are identified during generation. These issues are
     * recorded in either the `domSchemaChecker` (which checks usage of DOM elements and bindings) as
     * well as the `oobRecorder` (which records errors when the type-checking code generator is unable
     * to sufficiently understand a template).
     *
     * @param env an `Environment` into which type-checking code will be generated.
     * @param ref a `Reference` to the component class which should be type-checked.
     * @param name a `ts.Identifier` to use for the generated `ts.FunctionDeclaration`.
     * @param meta metadata about the component's template and the function being generated.
     * @param domSchemaChecker used to check and record errors regarding improper usage of DOM elements
     * and bindings.
     * @param oobRecorder used to record errors regarding template elements which could not be correctly
     * translated into types during TCB generation.
     * @param genericContextBehavior controls how generic parameters (especially parameters with generic
     * bounds) will be referenced from the generated TCB code.
     */
    function generateTypeCheckBlock(env, ref, name, meta, domSchemaChecker, oobRecorder, genericContextBehavior) {
        var tcb = new Context(env, domSchemaChecker, oobRecorder, meta.id, meta.boundTarget, meta.pipes, meta.schemas);
        var scope = Scope.forNodes(tcb, null, tcb.boundTarget.target.template, /* guard */ null);
        var ctxRawType = env.referenceType(ref);
        if (!ts.isTypeReferenceNode(ctxRawType)) {
            throw new Error("Expected TypeReferenceNode when referencing the ctx param for " + ref.debugName);
        }
        var typeParameters = undefined;
        var typeArguments = undefined;
        if (ref.node.typeParameters !== undefined) {
            if (!env.config.useContextGenericType) {
                genericContextBehavior = TcbGenericContextBehavior.FallbackToAny;
            }
            switch (genericContextBehavior) {
                case TcbGenericContextBehavior.UseEmitter:
                    // Guaranteed to emit type parameters since we checked that the class has them above.
                    typeParameters = new type_parameter_emitter_1.TypeParameterEmitter(ref.node.typeParameters, env.reflector)
                        .emit(function (typeRef) { return env.referenceType(typeRef); });
                    typeArguments = typeParameters.map(function (param) { return ts.factory.createTypeReferenceNode(param.name); });
                    break;
                case TcbGenericContextBehavior.CopyClassNodes:
                    typeParameters = tslib_1.__spreadArray([], tslib_1.__read(ref.node.typeParameters));
                    typeArguments = typeParameters.map(function (param) { return ts.factory.createTypeReferenceNode(param.name); });
                    break;
                case TcbGenericContextBehavior.FallbackToAny:
                    typeArguments = ref.node.typeParameters.map(function () { return ts.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword); });
                    break;
            }
        }
        var paramList = [tcbCtxParam(ref.node, ctxRawType.typeName, typeArguments)];
        var scopeStatements = scope.render();
        var innerBody = ts.createBlock(tslib_1.__spreadArray(tslib_1.__spreadArray([], tslib_1.__read(env.getPreludeStatements())), tslib_1.__read(scopeStatements)));
        // Wrap the body in an "if (true)" expression. This is unnecessary but has the effect of causing
        // the `ts.Printer` to format the type-check block nicely.
        var body = ts.createBlock([ts.createIf(ts.createTrue(), innerBody, undefined)]);
        var fnDecl = ts.createFunctionDeclaration(
        /* decorators */ undefined, 
        /* modifiers */ undefined, 
        /* asteriskToken */ undefined, 
        /* name */ name, 
        /* typeParameters */ env.config.useContextGenericType ? typeParameters : undefined, 
        /* parameters */ paramList, 
        /* type */ undefined, 
        /* body */ body);
        diagnostics_1.addTemplateId(fnDecl, meta.id);
        return fnDecl;
    }
    exports.generateTypeCheckBlock = generateTypeCheckBlock;
    /**
     * A code generation operation that's involved in the construction of a Type Check Block.
     *
     * The generation of a TCB is non-linear. Bindings within a template may result in the need to
     * construct certain types earlier than they otherwise would be constructed. That is, if the
     * generation of a TCB for a template is broken down into specific operations (constructing a
     * directive, extracting a variable from a let- operation, etc), then it's possible for operations
     * earlier in the sequence to depend on operations which occur later in the sequence.
     *
     * `TcbOp` abstracts the different types of operations which are required to convert a template into
     * a TCB. This allows for two phases of processing for the template, where 1) a linear sequence of
     * `TcbOp`s is generated, and then 2) these operations are executed, not necessarily in linear
     * order.
     *
     * Each `TcbOp` may insert statements into the body of the TCB, and also optionally return a
     * `ts.Expression` which can be used to reference the operation's result.
     */
    var TcbOp = /** @class */ (function () {
        function TcbOp() {
        }
        /**
         * Replacement value or operation used while this `TcbOp` is executing (i.e. to resolve circular
         * references during its execution).
         *
         * This is usually a `null!` expression (which asks TS to infer an appropriate type), but another
         * `TcbOp` can be returned in cases where additional code generation is necessary to deal with
         * circular references.
         */
        TcbOp.prototype.circularFallback = function () {
            return INFER_TYPE_FOR_CIRCULAR_OP_EXPR;
        };
        return TcbOp;
    }());
    /**
     * A `TcbOp` which creates an expression for a native DOM element (or web component) from a
     * `TmplAstElement`.
     *
     * Executing this operation returns a reference to the element variable.
     */
    var TcbElementOp = /** @class */ (function (_super) {
        tslib_1.__extends(TcbElementOp, _super);
        function TcbElementOp(tcb, scope, element) {
            var _this = _super.call(this) || this;
            _this.tcb = tcb;
            _this.scope = scope;
            _this.element = element;
            return _this;
        }
        Object.defineProperty(TcbElementOp.prototype, "optional", {
            get: function () {
                // The statement generated by this operation is only used for type-inference of the DOM
                // element's type and won't report diagnostics by itself, so the operation is marked as optional
                // to avoid generating statements for DOM elements that are never referenced.
                return true;
            },
            enumerable: false,
            configurable: true
        });
        TcbElementOp.prototype.execute = function () {
            var id = this.tcb.allocateId();
            // Add the declaration of the element using document.createElement.
            var initializer = ts_util_1.tsCreateElement(this.element.name);
            diagnostics_1.addParseSpanInfo(initializer, this.element.startSourceSpan || this.element.sourceSpan);
            this.scope.addStatement(ts_util_1.tsCreateVariable(id, initializer));
            return id;
        };
        return TcbElementOp;
    }(TcbOp));
    /**
     * A `TcbOp` which creates an expression for particular let- `TmplAstVariable` on a
     * `TmplAstTemplate`'s context.
     *
     * Executing this operation returns a reference to the variable variable (lol).
     */
    var TcbVariableOp = /** @class */ (function (_super) {
        tslib_1.__extends(TcbVariableOp, _super);
        function TcbVariableOp(tcb, scope, template, variable) {
            var _this = _super.call(this) || this;
            _this.tcb = tcb;
            _this.scope = scope;
            _this.template = template;
            _this.variable = variable;
            return _this;
        }
        Object.defineProperty(TcbVariableOp.prototype, "optional", {
            get: function () {
                return false;
            },
            enumerable: false,
            configurable: true
        });
        TcbVariableOp.prototype.execute = function () {
            // Look for a context variable for the template.
            var ctx = this.scope.resolve(this.template);
            // Allocate an identifier for the TmplAstVariable, and initialize it to a read of the variable
            // on the template context.
            var id = this.tcb.allocateId();
            var initializer = ts.createPropertyAccess(
            /* expression */ ctx, 
            /* name */ this.variable.value || '$implicit');
            diagnostics_1.addParseSpanInfo(id, this.variable.keySpan);
            // Declare the variable, and return its identifier.
            var variable;
            if (this.variable.valueSpan !== undefined) {
                diagnostics_1.addParseSpanInfo(initializer, this.variable.valueSpan);
                variable = ts_util_1.tsCreateVariable(id, diagnostics_1.wrapForTypeChecker(initializer));
            }
            else {
                variable = ts_util_1.tsCreateVariable(id, initializer);
            }
            diagnostics_1.addParseSpanInfo(variable.declarationList.declarations[0], this.variable.sourceSpan);
            this.scope.addStatement(variable);
            return id;
        };
        return TcbVariableOp;
    }(TcbOp));
    /**
     * A `TcbOp` which generates a variable for a `TmplAstTemplate`'s context.
     *
     * Executing this operation returns a reference to the template's context variable.
     */
    var TcbTemplateContextOp = /** @class */ (function (_super) {
        tslib_1.__extends(TcbTemplateContextOp, _super);
        function TcbTemplateContextOp(tcb, scope) {
            var _this = _super.call(this) || this;
            _this.tcb = tcb;
            _this.scope = scope;
            // The declaration of the context variable is only needed when the context is actually referenced.
            _this.optional = true;
            return _this;
        }
        TcbTemplateContextOp.prototype.execute = function () {
            // Allocate a template ctx variable and declare it with an 'any' type. The type of this variable
            // may be narrowed as a result of template guard conditions.
            var ctx = this.tcb.allocateId();
            var type = ts.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword);
            this.scope.addStatement(ts_util_1.tsDeclareVariable(ctx, type));
            return ctx;
        };
        return TcbTemplateContextOp;
    }(TcbOp));
    /**
     * A `TcbOp` which descends into a `TmplAstTemplate`'s children and generates type-checking code for
     * them.
     *
     * This operation wraps the children's type-checking code in an `if` block, which may include one
     * or more type guard conditions that narrow types within the template body.
     */
    var TcbTemplateBodyOp = /** @class */ (function (_super) {
        tslib_1.__extends(TcbTemplateBodyOp, _super);
        function TcbTemplateBodyOp(tcb, scope, template) {
            var _this = _super.call(this) || this;
            _this.tcb = tcb;
            _this.scope = scope;
            _this.template = template;
            return _this;
        }
        Object.defineProperty(TcbTemplateBodyOp.prototype, "optional", {
            get: function () {
                return false;
            },
            enumerable: false,
            configurable: true
        });
        TcbTemplateBodyOp.prototype.execute = function () {
            var e_1, _a;
            var _this = this;
            // An `if` will be constructed, within which the template's children will be type checked. The
            // `if` is used for two reasons: it creates a new syntactic scope, isolating variables declared
            // in the template's TCB from the outer context, and it allows any directives on the templates
            // to perform type narrowing of either expressions or the template's context.
            //
            // The guard is the `if` block's condition. It's usually set to `true` but directives that exist
            // on the template can trigger extra guard expressions that serve to narrow types within the
            // `if`. `guard` is calculated by starting with `true` and adding other conditions as needed.
            // Collect these into `guards` by processing the directives.
            var directiveGuards = [];
            var directives = this.tcb.boundTarget.getDirectivesOfNode(this.template);
            if (directives !== null) {
                var _loop_1 = function (dir) {
                    var dirInstId = this_1.scope.resolve(this_1.template, dir);
                    var dirId = this_1.tcb.env.reference(dir.ref);
                    // There are two kinds of guards. Template guards (ngTemplateGuards) allow type narrowing of
                    // the expression passed to an @Input of the directive. Scan the directive to see if it has
                    // any template guards, and generate them if needed.
                    dir.ngTemplateGuards.forEach(function (guard) {
                        // For each template guard function on the directive, look for a binding to that input.
                        var boundInput = _this.template.inputs.find(function (i) { return i.name === guard.inputName; }) ||
                            _this.template.templateAttrs.find(function (i) {
                                return i instanceof compiler_1.TmplAstBoundAttribute && i.name === guard.inputName;
                            });
                        if (boundInput !== undefined) {
                            // If there is such a binding, generate an expression for it.
                            var expr = tcbExpression(boundInput.value, _this.tcb, _this.scope);
                            // The expression has already been checked in the type constructor invocation, so
                            // it should be ignored when used within a template guard.
                            comments_1.markIgnoreDiagnostics(expr);
                            if (guard.type === 'binding') {
                                // Use the binding expression itself as guard.
                                directiveGuards.push(expr);
                            }
                            else {
                                // Call the guard function on the directive with the directive instance and that
                                // expression.
                                var guardInvoke = ts_util_1.tsCallMethod(dirId, "ngTemplateGuard_" + guard.inputName, [
                                    dirInstId,
                                    expr,
                                ]);
                                diagnostics_1.addParseSpanInfo(guardInvoke, boundInput.value.sourceSpan);
                                directiveGuards.push(guardInvoke);
                            }
                        }
                    });
                    // The second kind of guard is a template context guard. This guard narrows the template
                    // rendering context variable `ctx`.
                    if (dir.hasNgTemplateContextGuard) {
                        if (this_1.tcb.env.config.applyTemplateContextGuards) {
                            var ctx = this_1.scope.resolve(this_1.template);
                            var guardInvoke = ts_util_1.tsCallMethod(dirId, 'ngTemplateContextGuard', [dirInstId, ctx]);
                            diagnostics_1.addParseSpanInfo(guardInvoke, this_1.template.sourceSpan);
                            directiveGuards.push(guardInvoke);
                        }
                        else if (this_1.template.variables.length > 0 &&
                            this_1.tcb.env.config.suggestionsForSuboptimalTypeInference) {
                            // The compiler could have inferred a better type for the variables in this template,
                            // but was prevented from doing so by the type-checking configuration. Issue a warning
                            // diagnostic.
                            this_1.tcb.oobRecorder.suboptimalTypeInference(this_1.tcb.id, this_1.template.variables);
                        }
                    }
                };
                var this_1 = this;
                try {
                    for (var directives_1 = tslib_1.__values(directives), directives_1_1 = directives_1.next(); !directives_1_1.done; directives_1_1 = directives_1.next()) {
                        var dir = directives_1_1.value;
                        _loop_1(dir);
                    }
                }
                catch (e_1_1) { e_1 = { error: e_1_1 }; }
                finally {
                    try {
                        if (directives_1_1 && !directives_1_1.done && (_a = directives_1.return)) _a.call(directives_1);
                    }
                    finally { if (e_1) throw e_1.error; }
                }
            }
            // By default the guard is simply `true`.
            var guard = null;
            // If there are any guards from directives, use them instead.
            if (directiveGuards.length > 0) {
                // Pop the first value and use it as the initializer to reduce(). This way, a single guard
                // will be used on its own, but two or more will be combined into binary AND expressions.
                guard = directiveGuards.reduce(function (expr, dirGuard) {
                    return ts.createBinary(expr, ts.SyntaxKind.AmpersandAmpersandToken, dirGuard);
                }, directiveGuards.pop());
            }
            // Create a new Scope for the template. This constructs the list of operations for the template
            // children, as well as tracks bindings within the template.
            var tmplScope = Scope.forNodes(this.tcb, this.scope, this.template, guard);
            // Render the template's `Scope` into its statements.
            var statements = tmplScope.render();
            if (statements.length === 0) {
                // As an optimization, don't generate the scope's block if it has no statements. This is
                // beneficial for templates that contain for example `<span *ngIf="first"></span>`, in which
                // case there's no need to render the `NgIf` guard expression. This seems like a minor
                // improvement, however it reduces the number of flow-node antecedents that TypeScript needs
                // to keep into account for such cases, resulting in an overall reduction of
                // type-checking time.
                return null;
            }
            var tmplBlock = ts.createBlock(statements);
            if (guard !== null) {
                // The scope has a guard that needs to be applied, so wrap the template block into an `if`
                // statement containing the guard expression.
                tmplBlock = ts.createIf(/* expression */ guard, /* thenStatement */ tmplBlock);
            }
            this.scope.addStatement(tmplBlock);
            return null;
        };
        return TcbTemplateBodyOp;
    }(TcbOp));
    /**
     * A `TcbOp` which renders a text binding (interpolation) into the TCB.
     *
     * Executing this operation returns nothing.
     */
    var TcbTextInterpolationOp = /** @class */ (function (_super) {
        tslib_1.__extends(TcbTextInterpolationOp, _super);
        function TcbTextInterpolationOp(tcb, scope, binding) {
            var _this = _super.call(this) || this;
            _this.tcb = tcb;
            _this.scope = scope;
            _this.binding = binding;
            return _this;
        }
        Object.defineProperty(TcbTextInterpolationOp.prototype, "optional", {
            get: function () {
                return false;
            },
            enumerable: false,
            configurable: true
        });
        TcbTextInterpolationOp.prototype.execute = function () {
            var expr = tcbExpression(this.binding.value, this.tcb, this.scope);
            this.scope.addStatement(ts.createExpressionStatement(expr));
            return null;
        };
        return TcbTextInterpolationOp;
    }(TcbOp));
    /**
     * A `TcbOp` which constructs an instance of a directive. For generic directives, generic
     * parameters are set to `any` type.
     */
    var TcbDirectiveTypeOpBase = /** @class */ (function (_super) {
        tslib_1.__extends(TcbDirectiveTypeOpBase, _super);
        function TcbDirectiveTypeOpBase(tcb, scope, node, dir) {
            var _this = _super.call(this) || this;
            _this.tcb = tcb;
            _this.scope = scope;
            _this.node = node;
            _this.dir = dir;
            return _this;
        }
        Object.defineProperty(TcbDirectiveTypeOpBase.prototype, "optional", {
            get: function () {
                // The statement generated by this operation is only used to declare the directive's type and
                // won't report diagnostics by itself, so the operation is marked as optional to avoid
                // generating declarations for directives that don't have any inputs/outputs.
                return true;
            },
            enumerable: false,
            configurable: true
        });
        TcbDirectiveTypeOpBase.prototype.execute = function () {
            var dirRef = this.dir.ref;
            var rawType = this.tcb.env.referenceType(this.dir.ref);
            var type;
            if (this.dir.isGeneric === false || dirRef.node.typeParameters === undefined) {
                type = rawType;
            }
            else {
                if (!ts.isTypeReferenceNode(rawType)) {
                    throw new Error("Expected TypeReferenceNode when referencing the type for " + this.dir.ref.debugName);
                }
                var typeArguments = dirRef.node.typeParameters.map(function () { return ts.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword); });
                type = ts.factory.createTypeReferenceNode(rawType.typeName, typeArguments);
            }
            var id = this.tcb.allocateId();
            comments_1.addExpressionIdentifier(type, comments_1.ExpressionIdentifier.DIRECTIVE);
            diagnostics_1.addParseSpanInfo(type, this.node.startSourceSpan || this.node.sourceSpan);
            this.scope.addStatement(ts_util_1.tsDeclareVariable(id, type));
            return id;
        };
        return TcbDirectiveTypeOpBase;
    }(TcbOp));
    /**
     * A `TcbOp` which constructs an instance of a non-generic directive _without_ setting any of its
     * inputs. Inputs are later set in the `TcbDirectiveInputsOp`. Type checking was found to be
     * faster when done in this way as opposed to `TcbDirectiveCtorOp` which is only necessary when the
     * directive is generic.
     *
     * Executing this operation returns a reference to the directive instance variable with its inferred
     * type.
     */
    var TcbNonGenericDirectiveTypeOp = /** @class */ (function (_super) {
        tslib_1.__extends(TcbNonGenericDirectiveTypeOp, _super);
        function TcbNonGenericDirectiveTypeOp() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        /**
         * Creates a variable declaration for this op's directive of the argument type. Returns the id of
         * the newly created variable.
         */
        TcbNonGenericDirectiveTypeOp.prototype.execute = function () {
            var dirRef = this.dir.ref;
            if (this.dir.isGeneric) {
                throw new Error("Assertion Error: expected " + dirRef.debugName + " not to be generic.");
            }
            return _super.prototype.execute.call(this);
        };
        return TcbNonGenericDirectiveTypeOp;
    }(TcbDirectiveTypeOpBase));
    /**
     * A `TcbOp` which constructs an instance of a generic directive with its generic parameters set
     * to `any` type. This op is like `TcbDirectiveTypeOp`, except that generic parameters are set to
     * `any` type. This is used for situations where we want to avoid inlining.
     *
     * Executing this operation returns a reference to the directive instance variable with its generic
     * type parameters set to `any`.
     */
    var TcbGenericDirectiveTypeWithAnyParamsOp = /** @class */ (function (_super) {
        tslib_1.__extends(TcbGenericDirectiveTypeWithAnyParamsOp, _super);
        function TcbGenericDirectiveTypeWithAnyParamsOp() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        TcbGenericDirectiveTypeWithAnyParamsOp.prototype.execute = function () {
            var dirRef = this.dir.ref;
            if (dirRef.node.typeParameters === undefined) {
                throw new Error("Assertion Error: expected typeParameters when creating a declaration for " + dirRef.debugName);
            }
            return _super.prototype.execute.call(this);
        };
        return TcbGenericDirectiveTypeWithAnyParamsOp;
    }(TcbDirectiveTypeOpBase));
    /**
     * A `TcbOp` which creates a variable for a local ref in a template.
     * The initializer for the variable is the variable expression for the directive, template, or
     * element the ref refers to. When the reference is used in the template, those TCB statements will
     * access this variable as well. For example:
     * ```
     * var _t1 = document.createElement('div');
     * var _t2 = _t1;
     * _t2.value
     * ```
     * This operation supports more fluent lookups for the `TemplateTypeChecker` when getting a symbol
     * for a reference. In most cases, this isn't essential; that is, the information for the symbol
     * could be gathered without this operation using the `BoundTarget`. However, for the case of
     * ng-template references, we will need this reference variable to not only provide a location in
     * the shim file, but also to narrow the variable to the correct `TemplateRef<T>` type rather than
     * `TemplateRef<any>` (this work is still TODO).
     *
     * Executing this operation returns a reference to the directive instance variable with its inferred
     * type.
     */
    var TcbReferenceOp = /** @class */ (function (_super) {
        tslib_1.__extends(TcbReferenceOp, _super);
        function TcbReferenceOp(tcb, scope, node, host, target) {
            var _this = _super.call(this) || this;
            _this.tcb = tcb;
            _this.scope = scope;
            _this.node = node;
            _this.host = host;
            _this.target = target;
            // The statement generated by this operation is only used to for the Type Checker
            // so it can map a reference variable in the template directly to a node in the TCB.
            _this.optional = true;
            return _this;
        }
        TcbReferenceOp.prototype.execute = function () {
            var id = this.tcb.allocateId();
            var initializer = this.target instanceof compiler_1.TmplAstTemplate || this.target instanceof compiler_1.TmplAstElement ?
                this.scope.resolve(this.target) :
                this.scope.resolve(this.host, this.target);
            // The reference is either to an element, an <ng-template> node, or to a directive on an
            // element or template.
            if ((this.target instanceof compiler_1.TmplAstElement && !this.tcb.env.config.checkTypeOfDomReferences) ||
                !this.tcb.env.config.checkTypeOfNonDomReferences) {
                // References to DOM nodes are pinned to 'any' when `checkTypeOfDomReferences` is `false`.
                // References to `TemplateRef`s and directives are pinned to 'any' when
                // `checkTypeOfNonDomReferences` is `false`.
                initializer =
                    ts.createAsExpression(initializer, ts.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword));
            }
            else if (this.target instanceof compiler_1.TmplAstTemplate) {
                // Direct references to an <ng-template> node simply require a value of type
                // `TemplateRef<any>`. To get this, an expression of the form
                // `(_t1 as any as TemplateRef<any>)` is constructed.
                initializer =
                    ts.createAsExpression(initializer, ts.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword));
                initializer = ts.createAsExpression(initializer, this.tcb.env.referenceExternalType('@angular/core', 'TemplateRef', [compiler_1.DYNAMIC_TYPE]));
                initializer = ts.createParen(initializer);
            }
            diagnostics_1.addParseSpanInfo(initializer, this.node.sourceSpan);
            diagnostics_1.addParseSpanInfo(id, this.node.keySpan);
            this.scope.addStatement(ts_util_1.tsCreateVariable(id, initializer));
            return id;
        };
        return TcbReferenceOp;
    }(TcbOp));
    /**
     * A `TcbOp` which is used when the target of a reference is missing. This operation generates a
     * variable of type any for usages of the invalid reference to resolve to. The invalid reference
     * itself is recorded out-of-band.
     */
    var TcbInvalidReferenceOp = /** @class */ (function (_super) {
        tslib_1.__extends(TcbInvalidReferenceOp, _super);
        function TcbInvalidReferenceOp(tcb, scope) {
            var _this = _super.call(this) || this;
            _this.tcb = tcb;
            _this.scope = scope;
            // The declaration of a missing reference is only needed when the reference is resolved.
            _this.optional = true;
            return _this;
        }
        TcbInvalidReferenceOp.prototype.execute = function () {
            var id = this.tcb.allocateId();
            this.scope.addStatement(ts_util_1.tsCreateVariable(id, expression_1.NULL_AS_ANY));
            return id;
        };
        return TcbInvalidReferenceOp;
    }(TcbOp));
    /**
     * A `TcbOp` which constructs an instance of a directive with types inferred from its inputs. The
     * inputs themselves are not checked here; checking of inputs is achieved in `TcbDirectiveInputsOp`.
     * Any errors reported in this statement are ignored, as the type constructor call is only present
     * for type-inference.
     *
     * When a Directive is generic, it is required that the TCB generates the instance using this method
     * in order to infer the type information correctly.
     *
     * Executing this operation returns a reference to the directive instance variable with its inferred
     * type.
     */
    var TcbDirectiveCtorOp = /** @class */ (function (_super) {
        tslib_1.__extends(TcbDirectiveCtorOp, _super);
        function TcbDirectiveCtorOp(tcb, scope, node, dir) {
            var _this = _super.call(this) || this;
            _this.tcb = tcb;
            _this.scope = scope;
            _this.node = node;
            _this.dir = dir;
            return _this;
        }
        Object.defineProperty(TcbDirectiveCtorOp.prototype, "optional", {
            get: function () {
                // The statement generated by this operation is only used to infer the directive's type and
                // won't report diagnostics by itself, so the operation is marked as optional.
                return true;
            },
            enumerable: false,
            configurable: true
        });
        TcbDirectiveCtorOp.prototype.execute = function () {
            var e_2, _a, e_3, _b, e_4, _c;
            var id = this.tcb.allocateId();
            comments_1.addExpressionIdentifier(id, comments_1.ExpressionIdentifier.DIRECTIVE);
            diagnostics_1.addParseSpanInfo(id, this.node.startSourceSpan || this.node.sourceSpan);
            var genericInputs = new Map();
            var inputs = getBoundInputs(this.dir, this.node, this.tcb);
            try {
                for (var inputs_1 = tslib_1.__values(inputs), inputs_1_1 = inputs_1.next(); !inputs_1_1.done; inputs_1_1 = inputs_1.next()) {
                    var input = inputs_1_1.value;
                    // Skip text attributes if configured to do so.
                    if (!this.tcb.env.config.checkTypeOfAttributes &&
                        input.attribute instanceof compiler_1.TmplAstTextAttribute) {
                        continue;
                    }
                    try {
                        for (var _d = (e_3 = void 0, tslib_1.__values(input.fieldNames)), _e = _d.next(); !_e.done; _e = _d.next()) {
                            var fieldName = _e.value;
                            // Skip the field if an attribute has already been bound to it; we can't have a duplicate
                            // key in the type constructor call.
                            if (genericInputs.has(fieldName)) {
                                continue;
                            }
                            var expression = translateInput(input.attribute, this.tcb, this.scope);
                            genericInputs.set(fieldName, {
                                type: 'binding',
                                field: fieldName,
                                expression: expression,
                                sourceSpan: input.attribute.sourceSpan
                            });
                        }
                    }
                    catch (e_3_1) { e_3 = { error: e_3_1 }; }
                    finally {
                        try {
                            if (_e && !_e.done && (_b = _d.return)) _b.call(_d);
                        }
                        finally { if (e_3) throw e_3.error; }
                    }
                }
            }
            catch (e_2_1) { e_2 = { error: e_2_1 }; }
            finally {
                try {
                    if (inputs_1_1 && !inputs_1_1.done && (_a = inputs_1.return)) _a.call(inputs_1);
                }
                finally { if (e_2) throw e_2.error; }
            }
            try {
                // Add unset directive inputs for each of the remaining unset fields.
                for (var _f = tslib_1.__values(this.dir.inputs), _g = _f.next(); !_g.done; _g = _f.next()) {
                    var _h = tslib_1.__read(_g.value, 1), fieldName = _h[0];
                    if (!genericInputs.has(fieldName)) {
                        genericInputs.set(fieldName, { type: 'unset', field: fieldName });
                    }
                }
            }
            catch (e_4_1) { e_4 = { error: e_4_1 }; }
            finally {
                try {
                    if (_g && !_g.done && (_c = _f.return)) _c.call(_f);
                }
                finally { if (e_4) throw e_4.error; }
            }
            // Call the type constructor of the directive to infer a type, and assign the directive
            // instance.
            var typeCtor = tcbCallTypeCtor(this.dir, this.tcb, Array.from(genericInputs.values()));
            comments_1.markIgnoreDiagnostics(typeCtor);
            this.scope.addStatement(ts_util_1.tsCreateVariable(id, typeCtor));
            return id;
        };
        TcbDirectiveCtorOp.prototype.circularFallback = function () {
            return new TcbDirectiveCtorCircularFallbackOp(this.tcb, this.scope, this.node, this.dir);
        };
        return TcbDirectiveCtorOp;
    }(TcbOp));
    /**
     * A `TcbOp` which generates code to check input bindings on an element that correspond with the
     * members of a directive.
     *
     * Executing this operation returns nothing.
     */
    var TcbDirectiveInputsOp = /** @class */ (function (_super) {
        tslib_1.__extends(TcbDirectiveInputsOp, _super);
        function TcbDirectiveInputsOp(tcb, scope, node, dir) {
            var _this = _super.call(this) || this;
            _this.tcb = tcb;
            _this.scope = scope;
            _this.node = node;
            _this.dir = dir;
            return _this;
        }
        Object.defineProperty(TcbDirectiveInputsOp.prototype, "optional", {
            get: function () {
                return false;
            },
            enumerable: false,
            configurable: true
        });
        TcbDirectiveInputsOp.prototype.execute = function () {
            var e_5, _a, e_6, _b;
            var dirId = null;
            // TODO(joost): report duplicate properties
            var inputs = getBoundInputs(this.dir, this.node, this.tcb);
            try {
                for (var inputs_2 = tslib_1.__values(inputs), inputs_2_1 = inputs_2.next(); !inputs_2_1.done; inputs_2_1 = inputs_2.next()) {
                    var input = inputs_2_1.value;
                    // For bound inputs, the property is assigned the binding expression.
                    var expr = translateInput(input.attribute, this.tcb, this.scope);
                    if (!this.tcb.env.config.checkTypeOfInputBindings) {
                        // If checking the type of bindings is disabled, cast the resulting expression to 'any'
                        // before the assignment.
                        expr = ts_util_1.tsCastToAny(expr);
                    }
                    else if (!this.tcb.env.config.strictNullInputBindings) {
                        // If strict null checks are disabled, erase `null` and `undefined` from the type by
                        // wrapping the expression in a non-null assertion.
                        expr = ts.createNonNullExpression(expr);
                    }
                    var assignment = diagnostics_1.wrapForDiagnostics(expr);
                    try {
                        for (var _c = (e_6 = void 0, tslib_1.__values(input.fieldNames)), _d = _c.next(); !_d.done; _d = _c.next()) {
                            var fieldName = _d.value;
                            var target = void 0;
                            if (this.dir.coercedInputFields.has(fieldName)) {
                                // The input has a coercion declaration which should be used instead of assigning the
                                // expression into the input field directly. To achieve this, a variable is declared
                                // with a type of `typeof Directive.ngAcceptInputType_fieldName` which is then used as
                                // target of the assignment.
                                var dirTypeRef = this.tcb.env.referenceType(this.dir.ref);
                                if (!ts.isTypeReferenceNode(dirTypeRef)) {
                                    throw new Error("Expected TypeReferenceNode from reference to " + this.dir.ref.debugName);
                                }
                                var id = this.tcb.allocateId();
                                var type = ts_util_1.tsCreateTypeQueryForCoercedInput(dirTypeRef.typeName, fieldName);
                                this.scope.addStatement(ts_util_1.tsDeclareVariable(id, type));
                                target = id;
                            }
                            else if (this.dir.undeclaredInputFields.has(fieldName)) {
                                // If no coercion declaration is present nor is the field declared (i.e. the input is
                                // declared in a `@Directive` or `@Component` decorator's `inputs` property) there is no
                                // assignment target available, so this field is skipped.
                                continue;
                            }
                            else if (!this.tcb.env.config.honorAccessModifiersForInputBindings &&
                                this.dir.restrictedInputFields.has(fieldName)) {
                                // If strict checking of access modifiers is disabled and the field is restricted
                                // (i.e. private/protected/readonly), generate an assignment into a temporary variable
                                // that has the type of the field. This achieves type-checking but circumvents the access
                                // modifiers.
                                if (dirId === null) {
                                    dirId = this.scope.resolve(this.node, this.dir);
                                }
                                var id = this.tcb.allocateId();
                                var dirTypeRef = this.tcb.env.referenceType(this.dir.ref);
                                if (!ts.isTypeReferenceNode(dirTypeRef)) {
                                    throw new Error("Expected TypeReferenceNode from reference to " + this.dir.ref.debugName);
                                }
                                var type = ts.createIndexedAccessTypeNode(ts.createTypeQueryNode(dirId), ts.createLiteralTypeNode(ts.createStringLiteral(fieldName)));
                                var temp = ts_util_1.tsDeclareVariable(id, type);
                                this.scope.addStatement(temp);
                                target = id;
                            }
                            else {
                                if (dirId === null) {
                                    dirId = this.scope.resolve(this.node, this.dir);
                                }
                                // To get errors assign directly to the fields on the instance, using property access
                                // when possible. String literal fields may not be valid JS identifiers so we use
                                // literal element access instead for those cases.
                                target = this.dir.stringLiteralInputFields.has(fieldName) ?
                                    ts.createElementAccess(dirId, ts.createStringLiteral(fieldName)) :
                                    ts.createPropertyAccess(dirId, ts.createIdentifier(fieldName));
                            }
                            if (input.attribute.keySpan !== undefined) {
                                diagnostics_1.addParseSpanInfo(target, input.attribute.keySpan);
                            }
                            // Finally the assignment is extended by assigning it into the target expression.
                            assignment = ts.createBinary(target, ts.SyntaxKind.EqualsToken, assignment);
                        }
                    }
                    catch (e_6_1) { e_6 = { error: e_6_1 }; }
                    finally {
                        try {
                            if (_d && !_d.done && (_b = _c.return)) _b.call(_c);
                        }
                        finally { if (e_6) throw e_6.error; }
                    }
                    diagnostics_1.addParseSpanInfo(assignment, input.attribute.sourceSpan);
                    // Ignore diagnostics for text attributes if configured to do so.
                    if (!this.tcb.env.config.checkTypeOfAttributes &&
                        input.attribute instanceof compiler_1.TmplAstTextAttribute) {
                        comments_1.markIgnoreDiagnostics(assignment);
                    }
                    this.scope.addStatement(ts.createExpressionStatement(assignment));
                }
            }
            catch (e_5_1) { e_5 = { error: e_5_1 }; }
            finally {
                try {
                    if (inputs_2_1 && !inputs_2_1.done && (_a = inputs_2.return)) _a.call(inputs_2);
                }
                finally { if (e_5) throw e_5.error; }
            }
            return null;
        };
        return TcbDirectiveInputsOp;
    }(TcbOp));
    /**
     * A `TcbOp` which is used to generate a fallback expression if the inference of a directive type
     * via `TcbDirectiveCtorOp` requires a reference to its own type. This can happen using a template
     * reference:
     *
     * ```html
     * <some-cmp #ref [prop]="ref.foo"></some-cmp>
     * ```
     *
     * In this case, `TcbDirectiveCtorCircularFallbackOp` will add a second inference of the directive
     * type to the type-check block, this time calling the directive's type constructor without any
     * input expressions. This infers the widest possible supertype for the directive, which is used to
     * resolve any recursive references required to infer the real type.
     */
    var TcbDirectiveCtorCircularFallbackOp = /** @class */ (function (_super) {
        tslib_1.__extends(TcbDirectiveCtorCircularFallbackOp, _super);
        function TcbDirectiveCtorCircularFallbackOp(tcb, scope, node, dir) {
            var _this = _super.call(this) || this;
            _this.tcb = tcb;
            _this.scope = scope;
            _this.node = node;
            _this.dir = dir;
            return _this;
        }
        Object.defineProperty(TcbDirectiveCtorCircularFallbackOp.prototype, "optional", {
            get: function () {
                return false;
            },
            enumerable: false,
            configurable: true
        });
        TcbDirectiveCtorCircularFallbackOp.prototype.execute = function () {
            var id = this.tcb.allocateId();
            var typeCtor = this.tcb.env.typeCtorFor(this.dir);
            var circularPlaceholder = ts.createCall(typeCtor, /* typeArguments */ undefined, [ts.createNonNullExpression(ts.createNull())]);
            this.scope.addStatement(ts_util_1.tsCreateVariable(id, circularPlaceholder));
            return id;
        };
        return TcbDirectiveCtorCircularFallbackOp;
    }(TcbOp));
    /**
     * A `TcbOp` which feeds elements and unclaimed properties to the `DomSchemaChecker`.
     *
     * The DOM schema is not checked via TCB code generation. Instead, the `DomSchemaChecker` ingests
     * elements and property bindings and accumulates synthetic `ts.Diagnostic`s out-of-band. These are
     * later merged with the diagnostics generated from the TCB.
     *
     * For convenience, the TCB iteration of the template is used to drive the `DomSchemaChecker` via
     * the `TcbDomSchemaCheckerOp`.
     */
    var TcbDomSchemaCheckerOp = /** @class */ (function (_super) {
        tslib_1.__extends(TcbDomSchemaCheckerOp, _super);
        function TcbDomSchemaCheckerOp(tcb, element, checkElement, claimedInputs) {
            var _this = _super.call(this) || this;
            _this.tcb = tcb;
            _this.element = element;
            _this.checkElement = checkElement;
            _this.claimedInputs = claimedInputs;
            return _this;
        }
        Object.defineProperty(TcbDomSchemaCheckerOp.prototype, "optional", {
            get: function () {
                return false;
            },
            enumerable: false,
            configurable: true
        });
        TcbDomSchemaCheckerOp.prototype.execute = function () {
            var e_7, _a;
            if (this.checkElement) {
                this.tcb.domSchemaChecker.checkElement(this.tcb.id, this.element, this.tcb.schemas);
            }
            try {
                // TODO(alxhub): this could be more efficient.
                for (var _b = tslib_1.__values(this.element.inputs), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var binding = _c.value;
                    if (binding.type === 0 /* Property */ && this.claimedInputs.has(binding.name)) {
                        // Skip this binding as it was claimed by a directive.
                        continue;
                    }
                    if (binding.type === 0 /* Property */) {
                        if (binding.name !== 'style' && binding.name !== 'class') {
                            // A direct binding to a property.
                            var propertyName = ATTR_TO_PROP[binding.name] || binding.name;
                            this.tcb.domSchemaChecker.checkProperty(this.tcb.id, this.element, propertyName, binding.sourceSpan, this.tcb.schemas);
                        }
                    }
                }
            }
            catch (e_7_1) { e_7 = { error: e_7_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_7) throw e_7.error; }
            }
            return null;
        };
        return TcbDomSchemaCheckerOp;
    }(TcbOp));
    /**
     * Mapping between attributes names that don't correspond to their element property names.
     * Note: this mapping has to be kept in sync with the equally named mapping in the runtime.
     */
    var ATTR_TO_PROP = {
        'class': 'className',
        'for': 'htmlFor',
        'formaction': 'formAction',
        'innerHtml': 'innerHTML',
        'readonly': 'readOnly',
        'tabindex': 'tabIndex',
    };
    /**
     * A `TcbOp` which generates code to check "unclaimed inputs" - bindings on an element which were
     * not attributed to any directive or component, and are instead processed against the HTML element
     * itself.
     *
     * Currently, only the expressions of these bindings are checked. The targets of the bindings are
     * checked against the DOM schema via a `TcbDomSchemaCheckerOp`.
     *
     * Executing this operation returns nothing.
     */
    var TcbUnclaimedInputsOp = /** @class */ (function (_super) {
        tslib_1.__extends(TcbUnclaimedInputsOp, _super);
        function TcbUnclaimedInputsOp(tcb, scope, element, claimedInputs) {
            var _this = _super.call(this) || this;
            _this.tcb = tcb;
            _this.scope = scope;
            _this.element = element;
            _this.claimedInputs = claimedInputs;
            return _this;
        }
        Object.defineProperty(TcbUnclaimedInputsOp.prototype, "optional", {
            get: function () {
                return false;
            },
            enumerable: false,
            configurable: true
        });
        TcbUnclaimedInputsOp.prototype.execute = function () {
            var e_8, _a;
            // `this.inputs` contains only those bindings not matched by any directive. These bindings go to
            // the element itself.
            var elId = null;
            try {
                // TODO(alxhub): this could be more efficient.
                for (var _b = tslib_1.__values(this.element.inputs), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var binding = _c.value;
                    if (binding.type === 0 /* Property */ && this.claimedInputs.has(binding.name)) {
                        // Skip this binding as it was claimed by a directive.
                        continue;
                    }
                    var expr = tcbExpression(binding.value, this.tcb, this.scope);
                    if (!this.tcb.env.config.checkTypeOfInputBindings) {
                        // If checking the type of bindings is disabled, cast the resulting expression to 'any'
                        // before the assignment.
                        expr = ts_util_1.tsCastToAny(expr);
                    }
                    else if (!this.tcb.env.config.strictNullInputBindings) {
                        // If strict null checks are disabled, erase `null` and `undefined` from the type by
                        // wrapping the expression in a non-null assertion.
                        expr = ts.createNonNullExpression(expr);
                    }
                    if (this.tcb.env.config.checkTypeOfDomBindings && binding.type === 0 /* Property */) {
                        if (binding.name !== 'style' && binding.name !== 'class') {
                            if (elId === null) {
                                elId = this.scope.resolve(this.element);
                            }
                            // A direct binding to a property.
                            var propertyName = ATTR_TO_PROP[binding.name] || binding.name;
                            var prop = ts.createElementAccess(elId, ts.createStringLiteral(propertyName));
                            var stmt = ts.createBinary(prop, ts.SyntaxKind.EqualsToken, diagnostics_1.wrapForDiagnostics(expr));
                            diagnostics_1.addParseSpanInfo(stmt, binding.sourceSpan);
                            this.scope.addStatement(ts.createExpressionStatement(stmt));
                        }
                        else {
                            this.scope.addStatement(ts.createExpressionStatement(expr));
                        }
                    }
                    else {
                        // A binding to an animation, attribute, class or style. For now, only validate the right-
                        // hand side of the expression.
                        // TODO: properly check class and style bindings.
                        this.scope.addStatement(ts.createExpressionStatement(expr));
                    }
                }
            }
            catch (e_8_1) { e_8 = { error: e_8_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_8) throw e_8.error; }
            }
            return null;
        };
        return TcbUnclaimedInputsOp;
    }(TcbOp));
    /**
     * A `TcbOp` which generates code to check event bindings on an element that correspond with the
     * outputs of a directive.
     *
     * Executing this operation returns nothing.
     */
    var TcbDirectiveOutputsOp = /** @class */ (function (_super) {
        tslib_1.__extends(TcbDirectiveOutputsOp, _super);
        function TcbDirectiveOutputsOp(tcb, scope, node, dir) {
            var _this = _super.call(this) || this;
            _this.tcb = tcb;
            _this.scope = scope;
            _this.node = node;
            _this.dir = dir;
            return _this;
        }
        Object.defineProperty(TcbDirectiveOutputsOp.prototype, "optional", {
            get: function () {
                return false;
            },
            enumerable: false,
            configurable: true
        });
        TcbDirectiveOutputsOp.prototype.execute = function () {
            var e_9, _a;
            var dirId = null;
            var outputs = this.dir.outputs;
            try {
                for (var _b = tslib_1.__values(this.node.outputs), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var output = _c.value;
                    if (output.type !== 0 /* Regular */ || !outputs.hasBindingPropertyName(output.name)) {
                        continue;
                    }
                    if (this.tcb.env.config.checkTypeOfOutputEvents && output.name.endsWith('Change')) {
                        var inputName = output.name.slice(0, -6);
                        isSplitTwoWayBinding(inputName, output, this.node.inputs, this.tcb);
                    }
                    // TODO(alxhub): consider supporting multiple fields with the same property name for outputs.
                    var field = outputs.getByBindingPropertyName(output.name)[0].classPropertyName;
                    if (dirId === null) {
                        dirId = this.scope.resolve(this.node, this.dir);
                    }
                    var outputField = ts.createElementAccess(dirId, ts.createStringLiteral(field));
                    diagnostics_1.addParseSpanInfo(outputField, output.keySpan);
                    if (this.tcb.env.config.checkTypeOfOutputEvents) {
                        // For strict checking of directive events, generate a call to the `subscribe` method
                        // on the directive's output field to let type information flow into the handler function's
                        // `$event` parameter.
                        var handler = tcbCreateEventHandler(output, this.tcb, this.scope, 0 /* Infer */);
                        var subscribeFn = ts.createPropertyAccess(outputField, 'subscribe');
                        var call = ts.createCall(subscribeFn, /* typeArguments */ undefined, [handler]);
                        diagnostics_1.addParseSpanInfo(call, output.sourceSpan);
                        this.scope.addStatement(ts.createExpressionStatement(call));
                    }
                    else {
                        // If strict checking of directive events is disabled:
                        //
                        // * We still generate the access to the output field as a statement in the TCB so consumers
                        //   of the `TemplateTypeChecker` can still find the node for the class member for the
                        //   output.
                        // * Emit a handler function where the `$event` parameter has an explicit `any` type.
                        this.scope.addStatement(ts.createExpressionStatement(outputField));
                        var handler = tcbCreateEventHandler(output, this.tcb, this.scope, 1 /* Any */);
                        this.scope.addStatement(ts.createExpressionStatement(handler));
                    }
                    template_semantics_1.ExpressionSemanticVisitor.visit(output.handler, this.tcb.id, this.tcb.boundTarget, this.tcb.oobRecorder);
                }
            }
            catch (e_9_1) { e_9 = { error: e_9_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_9) throw e_9.error; }
            }
            return null;
        };
        return TcbDirectiveOutputsOp;
    }(TcbOp));
    exports.TcbDirectiveOutputsOp = TcbDirectiveOutputsOp;
    /**
     * A `TcbOp` which generates code to check "unclaimed outputs" - event bindings on an element which
     * were not attributed to any directive or component, and are instead processed against the HTML
     * element itself.
     *
     * Executing this operation returns nothing.
     */
    var TcbUnclaimedOutputsOp = /** @class */ (function (_super) {
        tslib_1.__extends(TcbUnclaimedOutputsOp, _super);
        function TcbUnclaimedOutputsOp(tcb, scope, element, claimedOutputs) {
            var _this = _super.call(this) || this;
            _this.tcb = tcb;
            _this.scope = scope;
            _this.element = element;
            _this.claimedOutputs = claimedOutputs;
            return _this;
        }
        Object.defineProperty(TcbUnclaimedOutputsOp.prototype, "optional", {
            get: function () {
                return false;
            },
            enumerable: false,
            configurable: true
        });
        TcbUnclaimedOutputsOp.prototype.execute = function () {
            var e_10, _a;
            var elId = null;
            try {
                // TODO(alxhub): this could be more efficient.
                for (var _b = tslib_1.__values(this.element.outputs), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var output = _c.value;
                    if (this.claimedOutputs.has(output.name)) {
                        // Skip this event handler as it was claimed by a directive.
                        continue;
                    }
                    if (this.tcb.env.config.checkTypeOfOutputEvents && output.name.endsWith('Change')) {
                        var inputName = output.name.slice(0, -6);
                        if (isSplitTwoWayBinding(inputName, output, this.element.inputs, this.tcb)) {
                            // Skip this event handler as the error was already handled.
                            continue;
                        }
                    }
                    if (output.type === 1 /* Animation */) {
                        // Animation output bindings always have an `$event` parameter of type `AnimationEvent`.
                        var eventType = this.tcb.env.config.checkTypeOfAnimationEvents ?
                            this.tcb.env.referenceExternalType('@angular/animations', 'AnimationEvent') :
                            1 /* Any */;
                        var handler = tcbCreateEventHandler(output, this.tcb, this.scope, eventType);
                        this.scope.addStatement(ts.createExpressionStatement(handler));
                    }
                    else if (this.tcb.env.config.checkTypeOfDomEvents) {
                        // If strict checking of DOM events is enabled, generate a call to `addEventListener` on
                        // the element instance so that TypeScript's type inference for
                        // `HTMLElement.addEventListener` using `HTMLElementEventMap` to infer an accurate type for
                        // `$event` depending on the event name. For unknown event names, TypeScript resorts to the
                        // base `Event` type.
                        var handler = tcbCreateEventHandler(output, this.tcb, this.scope, 0 /* Infer */);
                        if (elId === null) {
                            elId = this.scope.resolve(this.element);
                        }
                        var propertyAccess = ts.createPropertyAccess(elId, 'addEventListener');
                        diagnostics_1.addParseSpanInfo(propertyAccess, output.keySpan);
                        var call = ts.createCall(
                        /* expression */ propertyAccess, 
                        /* typeArguments */ undefined, 
                        /* arguments */ [ts.createStringLiteral(output.name), handler]);
                        diagnostics_1.addParseSpanInfo(call, output.sourceSpan);
                        this.scope.addStatement(ts.createExpressionStatement(call));
                    }
                    else {
                        // If strict checking of DOM inputs is disabled, emit a handler function where the `$event`
                        // parameter has an explicit `any` type.
                        var handler = tcbCreateEventHandler(output, this.tcb, this.scope, 1 /* Any */);
                        this.scope.addStatement(ts.createExpressionStatement(handler));
                    }
                    template_semantics_1.ExpressionSemanticVisitor.visit(output.handler, this.tcb.id, this.tcb.boundTarget, this.tcb.oobRecorder);
                }
            }
            catch (e_10_1) { e_10 = { error: e_10_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_10) throw e_10.error; }
            }
            return null;
        };
        return TcbUnclaimedOutputsOp;
    }(TcbOp));
    /**
     * A `TcbOp` which generates a completion point for the component context.
     *
     * This completion point looks like `ctx. ;` in the TCB output, and does not produce diagnostics.
     * TypeScript autocompletion APIs can be used at this completion point (after the '.') to produce
     * autocompletion results of properties and methods from the template's component context.
     */
    var TcbComponentContextCompletionOp = /** @class */ (function (_super) {
        tslib_1.__extends(TcbComponentContextCompletionOp, _super);
        function TcbComponentContextCompletionOp(scope) {
            var _this = _super.call(this) || this;
            _this.scope = scope;
            _this.optional = false;
            return _this;
        }
        TcbComponentContextCompletionOp.prototype.execute = function () {
            var ctx = ts.createIdentifier('ctx');
            var ctxDot = ts.createPropertyAccess(ctx, '');
            comments_1.markIgnoreDiagnostics(ctxDot);
            comments_1.addExpressionIdentifier(ctxDot, comments_1.ExpressionIdentifier.COMPONENT_COMPLETION);
            this.scope.addStatement(ts.createExpressionStatement(ctxDot));
            return null;
        };
        return TcbComponentContextCompletionOp;
    }(TcbOp));
    /**
     * Value used to break a circular reference between `TcbOp`s.
     *
     * This value is returned whenever `TcbOp`s have a circular dependency. The expression is a non-null
     * assertion of the null value (in TypeScript, the expression `null!`). This construction will infer
     * the least narrow type for whatever it's assigned to.
     */
    var INFER_TYPE_FOR_CIRCULAR_OP_EXPR = ts.createNonNullExpression(ts.createNull());
    /**
     * Overall generation context for the type check block.
     *
     * `Context` handles operations during code generation which are global with respect to the whole
     * block. It's responsible for variable name allocation and management of any imports needed. It
     * also contains the template metadata itself.
     */
    var Context = /** @class */ (function () {
        function Context(env, domSchemaChecker, oobRecorder, id, boundTarget, pipes, schemas) {
            this.env = env;
            this.domSchemaChecker = domSchemaChecker;
            this.oobRecorder = oobRecorder;
            this.id = id;
            this.boundTarget = boundTarget;
            this.pipes = pipes;
            this.schemas = schemas;
            this.nextId = 1;
        }
        /**
         * Allocate a new variable name for use within the `Context`.
         *
         * Currently this uses a monotonically increasing counter, but in the future the variable name
         * might change depending on the type of data being stored.
         */
        Context.prototype.allocateId = function () {
            return ts.createIdentifier("_t" + this.nextId++);
        };
        Context.prototype.getPipeByName = function (name) {
            if (!this.pipes.has(name)) {
                return null;
            }
            return this.pipes.get(name);
        };
        return Context;
    }());
    exports.Context = Context;
    /**
     * Local scope within the type check block for a particular template.
     *
     * The top-level template and each nested `<ng-template>` have their own `Scope`, which exist in a
     * hierarchy. The structure of this hierarchy mirrors the syntactic scopes in the generated type
     * check block, where each nested template is encased in an `if` structure.
     *
     * As a template's `TcbOp`s are executed in a given `Scope`, statements are added via
     * `addStatement()`. When this processing is complete, the `Scope` can be turned into a `ts.Block`
     * via `renderToBlock()`.
     *
     * If a `TcbOp` requires the output of another, it can call `resolve()`.
     */
    var Scope = /** @class */ (function () {
        function Scope(tcb, parent, guard) {
            if (parent === void 0) { parent = null; }
            if (guard === void 0) { guard = null; }
            this.tcb = tcb;
            this.parent = parent;
            this.guard = guard;
            /**
             * A queue of operations which need to be performed to generate the TCB code for this scope.
             *
             * This array can contain either a `TcbOp` which has yet to be executed, or a `ts.Expression|null`
             * representing the memoized result of executing the operation. As operations are executed, their
             * results are written into the `opQueue`, overwriting the original operation.
             *
             * If an operation is in the process of being executed, it is temporarily overwritten here with
             * `INFER_TYPE_FOR_CIRCULAR_OP_EXPR`. This way, if a cycle is encountered where an operation
             * depends transitively on its own result, the inner operation will infer the least narrow type
             * that fits instead. This has the same semantics as TypeScript itself when types are referenced
             * circularly.
             */
            this.opQueue = [];
            /**
             * A map of `TmplAstElement`s to the index of their `TcbElementOp` in the `opQueue`
             */
            this.elementOpMap = new Map();
            /**
             * A map of maps which tracks the index of `TcbDirectiveCtorOp`s in the `opQueue` for each
             * directive on a `TmplAstElement` or `TmplAstTemplate` node.
             */
            this.directiveOpMap = new Map();
            /**
             * A map of `TmplAstReference`s to the index of their `TcbReferenceOp` in the `opQueue`
             */
            this.referenceOpMap = new Map();
            /**
             * Map of immediately nested <ng-template>s (within this `Scope`) represented by `TmplAstTemplate`
             * nodes to the index of their `TcbTemplateContextOp`s in the `opQueue`.
             */
            this.templateCtxOpMap = new Map();
            /**
             * Map of variables declared on the template that created this `Scope` (represented by
             * `TmplAstVariable` nodes) to the index of their `TcbVariableOp`s in the `opQueue`.
             */
            this.varMap = new Map();
            /**
             * Statements for this template.
             *
             * Executing the `TcbOp`s in the `opQueue` populates this array.
             */
            this.statements = [];
        }
        /**
         * Constructs a `Scope` given either a `TmplAstTemplate` or a list of `TmplAstNode`s.
         *
         * @param tcb the overall context of TCB generation.
         * @param parent the `Scope` of the parent template (if any) or `null` if this is the root
         * `Scope`.
         * @param templateOrNodes either a `TmplAstTemplate` representing the template for which to
         * calculate the `Scope`, or a list of nodes if no outer template object is available.
         * @param guard an expression that is applied to this scope for type narrowing purposes.
         */
        Scope.forNodes = function (tcb, parent, templateOrNodes, guard) {
            var e_11, _a, e_12, _b;
            var scope = new Scope(tcb, parent, guard);
            if (parent === null && tcb.env.config.enableTemplateTypeChecker) {
                // Add an autocompletion point for the component context.
                scope.opQueue.push(new TcbComponentContextCompletionOp(scope));
            }
            var children;
            // If given an actual `TmplAstTemplate` instance, then process any additional information it
            // has.
            if (templateOrNodes instanceof compiler_1.TmplAstTemplate) {
                // The template's variable declarations need to be added as `TcbVariableOp`s.
                var varMap = new Map();
                try {
                    for (var _c = tslib_1.__values(templateOrNodes.variables), _d = _c.next(); !_d.done; _d = _c.next()) {
                        var v = _d.value;
                        // Validate that variables on the `TmplAstTemplate` are only declared once.
                        if (!varMap.has(v.name)) {
                            varMap.set(v.name, v);
                        }
                        else {
                            var firstDecl = varMap.get(v.name);
                            tcb.oobRecorder.duplicateTemplateVar(tcb.id, v, firstDecl);
                        }
                        var opIndex = scope.opQueue.push(new TcbVariableOp(tcb, scope, templateOrNodes, v)) - 1;
                        scope.varMap.set(v, opIndex);
                    }
                }
                catch (e_11_1) { e_11 = { error: e_11_1 }; }
                finally {
                    try {
                        if (_d && !_d.done && (_a = _c.return)) _a.call(_c);
                    }
                    finally { if (e_11) throw e_11.error; }
                }
                children = templateOrNodes.children;
            }
            else {
                children = templateOrNodes;
            }
            try {
                for (var children_1 = tslib_1.__values(children), children_1_1 = children_1.next(); !children_1_1.done; children_1_1 = children_1.next()) {
                    var node = children_1_1.value;
                    scope.appendNode(node);
                }
            }
            catch (e_12_1) { e_12 = { error: e_12_1 }; }
            finally {
                try {
                    if (children_1_1 && !children_1_1.done && (_b = children_1.return)) _b.call(children_1);
                }
                finally { if (e_12) throw e_12.error; }
            }
            return scope;
        };
        /**
         * Look up a `ts.Expression` representing the value of some operation in the current `Scope`,
         * including any parent scope(s). This method always returns a mutable clone of the
         * `ts.Expression` with the comments cleared.
         *
         * @param node a `TmplAstNode` of the operation in question. The lookup performed will depend on
         * the type of this node:
         *
         * Assuming `directive` is not present, then `resolve` will return:
         *
         * * `TmplAstElement` - retrieve the expression for the element DOM node
         * * `TmplAstTemplate` - retrieve the template context variable
         * * `TmplAstVariable` - retrieve a template let- variable
         * * `TmplAstReference` - retrieve variable created for the local ref
         *
         * @param directive if present, a directive type on a `TmplAstElement` or `TmplAstTemplate` to
         * look up instead of the default for an element or template node.
         */
        Scope.prototype.resolve = function (node, directive) {
            // Attempt to resolve the operation locally.
            var res = this.resolveLocal(node, directive);
            if (res !== null) {
                // We want to get a clone of the resolved expression and clear the trailing comments
                // so they don't continue to appear in every place the expression is used.
                // As an example, this would otherwise produce:
                // var _t1 /**T:DIR*/ /*1,2*/ = _ctor1();
                // _t1 /**T:DIR*/ /*1,2*/.input = 'value';
                //
                // In addition, returning a clone prevents the consumer of `Scope#resolve` from
                // attaching comments at the declaration site.
                var clone = ts.getMutableClone(res);
                ts.setSyntheticTrailingComments(clone, []);
                return clone;
            }
            else if (this.parent !== null) {
                // Check with the parent.
                return this.parent.resolve(node, directive);
            }
            else {
                throw new Error("Could not resolve " + node + " / " + directive);
            }
        };
        /**
         * Add a statement to this scope.
         */
        Scope.prototype.addStatement = function (stmt) {
            this.statements.push(stmt);
        };
        /**
         * Get the statements.
         */
        Scope.prototype.render = function () {
            for (var i = 0; i < this.opQueue.length; i++) {
                // Optional statements cannot be skipped when we are generating the TCB for use
                // by the TemplateTypeChecker.
                var skipOptional = !this.tcb.env.config.enableTemplateTypeChecker;
                this.executeOp(i, skipOptional);
            }
            return this.statements;
        };
        /**
         * Returns an expression of all template guards that apply to this scope, including those of
         * parent scopes. If no guards have been applied, null is returned.
         */
        Scope.prototype.guards = function () {
            var parentGuards = null;
            if (this.parent !== null) {
                // Start with the guards from the parent scope, if present.
                parentGuards = this.parent.guards();
            }
            if (this.guard === null) {
                // This scope does not have a guard, so return the parent's guards as is.
                return parentGuards;
            }
            else if (parentGuards === null) {
                // There's no guards from the parent scope, so this scope's guard represents all available
                // guards.
                return this.guard;
            }
            else {
                // Both the parent scope and this scope provide a guard, so create a combination of the two.
                // It is important that the parent guard is used as left operand, given that it may provide
                // narrowing that is required for this scope's guard to be valid.
                return ts.createBinary(parentGuards, ts.SyntaxKind.AmpersandAmpersandToken, this.guard);
            }
        };
        Scope.prototype.resolveLocal = function (ref, directive) {
            if (ref instanceof compiler_1.TmplAstReference && this.referenceOpMap.has(ref)) {
                return this.resolveOp(this.referenceOpMap.get(ref));
            }
            else if (ref instanceof compiler_1.TmplAstVariable && this.varMap.has(ref)) {
                // Resolving a context variable for this template.
                // Execute the `TcbVariableOp` associated with the `TmplAstVariable`.
                return this.resolveOp(this.varMap.get(ref));
            }
            else if (ref instanceof compiler_1.TmplAstTemplate && directive === undefined &&
                this.templateCtxOpMap.has(ref)) {
                // Resolving the context of the given sub-template.
                // Execute the `TcbTemplateContextOp` for the template.
                return this.resolveOp(this.templateCtxOpMap.get(ref));
            }
            else if ((ref instanceof compiler_1.TmplAstElement || ref instanceof compiler_1.TmplAstTemplate) &&
                directive !== undefined && this.directiveOpMap.has(ref)) {
                // Resolving a directive on an element or sub-template.
                var dirMap = this.directiveOpMap.get(ref);
                if (dirMap.has(directive)) {
                    return this.resolveOp(dirMap.get(directive));
                }
                else {
                    return null;
                }
            }
            else if (ref instanceof compiler_1.TmplAstElement && this.elementOpMap.has(ref)) {
                // Resolving the DOM node of an element in this template.
                return this.resolveOp(this.elementOpMap.get(ref));
            }
            else {
                return null;
            }
        };
        /**
         * Like `executeOp`, but assert that the operation actually returned `ts.Expression`.
         */
        Scope.prototype.resolveOp = function (opIndex) {
            var res = this.executeOp(opIndex, /* skipOptional */ false);
            if (res === null) {
                throw new Error("Error resolving operation, got null");
            }
            return res;
        };
        /**
         * Execute a particular `TcbOp` in the `opQueue`.
         *
         * This method replaces the operation in the `opQueue` with the result of execution (once done)
         * and also protects against a circular dependency from the operation to itself by temporarily
         * setting the operation's result to a special expression.
         */
        Scope.prototype.executeOp = function (opIndex, skipOptional) {
            var op = this.opQueue[opIndex];
            if (!(op instanceof TcbOp)) {
                return op;
            }
            if (skipOptional && op.optional) {
                return null;
            }
            // Set the result of the operation in the queue to its circular fallback. If executing this
            // operation results in a circular dependency, this will prevent an infinite loop and allow for
            // the resolution of such cycles.
            this.opQueue[opIndex] = op.circularFallback();
            var res = op.execute();
            // Once the operation has finished executing, it's safe to cache the real result.
            this.opQueue[opIndex] = res;
            return res;
        };
        Scope.prototype.appendNode = function (node) {
            var e_13, _a;
            if (node instanceof compiler_1.TmplAstElement) {
                var opIndex = this.opQueue.push(new TcbElementOp(this.tcb, this, node)) - 1;
                this.elementOpMap.set(node, opIndex);
                this.appendDirectivesAndInputsOfNode(node);
                this.appendOutputsOfNode(node);
                try {
                    for (var _b = tslib_1.__values(node.children), _c = _b.next(); !_c.done; _c = _b.next()) {
                        var child = _c.value;
                        this.appendNode(child);
                    }
                }
                catch (e_13_1) { e_13 = { error: e_13_1 }; }
                finally {
                    try {
                        if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                    }
                    finally { if (e_13) throw e_13.error; }
                }
                this.checkAndAppendReferencesOfNode(node);
            }
            else if (node instanceof compiler_1.TmplAstTemplate) {
                // Template children are rendered in a child scope.
                this.appendDirectivesAndInputsOfNode(node);
                this.appendOutputsOfNode(node);
                var ctxIndex = this.opQueue.push(new TcbTemplateContextOp(this.tcb, this)) - 1;
                this.templateCtxOpMap.set(node, ctxIndex);
                if (this.tcb.env.config.checkTemplateBodies) {
                    this.opQueue.push(new TcbTemplateBodyOp(this.tcb, this, node));
                }
                else if (this.tcb.env.config.alwaysCheckSchemaInTemplateBodies) {
                    this.appendDeepSchemaChecks(node.children);
                }
                this.checkAndAppendReferencesOfNode(node);
            }
            else if (node instanceof compiler_1.TmplAstBoundText) {
                this.opQueue.push(new TcbTextInterpolationOp(this.tcb, this, node));
            }
            else if (node instanceof compiler_1.TmplAstIcu) {
                this.appendIcuExpressions(node);
            }
        };
        Scope.prototype.checkAndAppendReferencesOfNode = function (node) {
            var e_14, _a;
            try {
                for (var _b = tslib_1.__values(node.references), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var ref = _c.value;
                    var target = this.tcb.boundTarget.getReferenceTarget(ref);
                    var ctxIndex = void 0;
                    if (target === null) {
                        // The reference is invalid if it doesn't have a target, so report it as an error.
                        this.tcb.oobRecorder.missingReferenceTarget(this.tcb.id, ref);
                        // Any usages of the invalid reference will be resolved to a variable of type any.
                        ctxIndex = this.opQueue.push(new TcbInvalidReferenceOp(this.tcb, this)) - 1;
                    }
                    else if (target instanceof compiler_1.TmplAstTemplate || target instanceof compiler_1.TmplAstElement) {
                        ctxIndex = this.opQueue.push(new TcbReferenceOp(this.tcb, this, ref, node, target)) - 1;
                    }
                    else {
                        ctxIndex =
                            this.opQueue.push(new TcbReferenceOp(this.tcb, this, ref, node, target.directive)) - 1;
                    }
                    this.referenceOpMap.set(ref, ctxIndex);
                }
            }
            catch (e_14_1) { e_14 = { error: e_14_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_14) throw e_14.error; }
            }
        };
        Scope.prototype.appendDirectivesAndInputsOfNode = function (node) {
            var e_15, _a, e_16, _b, e_17, _c;
            // Collect all the inputs on the element.
            var claimedInputs = new Set();
            var directives = this.tcb.boundTarget.getDirectivesOfNode(node);
            if (directives === null || directives.length === 0) {
                // If there are no directives, then all inputs are unclaimed inputs, so queue an operation
                // to add them if needed.
                if (node instanceof compiler_1.TmplAstElement) {
                    this.opQueue.push(new TcbUnclaimedInputsOp(this.tcb, this, node, claimedInputs));
                    this.opQueue.push(new TcbDomSchemaCheckerOp(this.tcb, node, /* checkElement */ true, claimedInputs));
                }
                return;
            }
            var dirMap = new Map();
            try {
                for (var directives_2 = tslib_1.__values(directives), directives_2_1 = directives_2.next(); !directives_2_1.done; directives_2_1 = directives_2.next()) {
                    var dir = directives_2_1.value;
                    var directiveOp = void 0;
                    var host = this.tcb.env.reflector;
                    var dirRef = dir.ref;
                    if (!dir.isGeneric) {
                        // The most common case is that when a directive is not generic, we use the normal
                        // `TcbNonDirectiveTypeOp`.
                        directiveOp = new TcbNonGenericDirectiveTypeOp(this.tcb, this, node, dir);
                    }
                    else if (!type_constructor_1.requiresInlineTypeCtor(dirRef.node, host) ||
                        this.tcb.env.config.useInlineTypeConstructors) {
                        // For generic directives, we use a type constructor to infer types. If a directive requires
                        // an inline type constructor, then inlining must be available to use the
                        // `TcbDirectiveCtorOp`. If not we, we fallback to using `any` – see below.
                        directiveOp = new TcbDirectiveCtorOp(this.tcb, this, node, dir);
                    }
                    else {
                        // If inlining is not available, then we give up on infering the generic params, and use
                        // `any` type for the directive's generic parameters.
                        directiveOp = new TcbGenericDirectiveTypeWithAnyParamsOp(this.tcb, this, node, dir);
                    }
                    var dirIndex = this.opQueue.push(directiveOp) - 1;
                    dirMap.set(dir, dirIndex);
                    this.opQueue.push(new TcbDirectiveInputsOp(this.tcb, this, node, dir));
                }
            }
            catch (e_15_1) { e_15 = { error: e_15_1 }; }
            finally {
                try {
                    if (directives_2_1 && !directives_2_1.done && (_a = directives_2.return)) _a.call(directives_2);
                }
                finally { if (e_15) throw e_15.error; }
            }
            this.directiveOpMap.set(node, dirMap);
            // After expanding the directives, we might need to queue an operation to check any unclaimed
            // inputs.
            if (node instanceof compiler_1.TmplAstElement) {
                try {
                    // Go through the directives and remove any inputs that it claims from `elementInputs`.
                    for (var directives_3 = tslib_1.__values(directives), directives_3_1 = directives_3.next(); !directives_3_1.done; directives_3_1 = directives_3.next()) {
                        var dir = directives_3_1.value;
                        try {
                            for (var _d = (e_17 = void 0, tslib_1.__values(dir.inputs.propertyNames)), _e = _d.next(); !_e.done; _e = _d.next()) {
                                var propertyName = _e.value;
                                claimedInputs.add(propertyName);
                            }
                        }
                        catch (e_17_1) { e_17 = { error: e_17_1 }; }
                        finally {
                            try {
                                if (_e && !_e.done && (_c = _d.return)) _c.call(_d);
                            }
                            finally { if (e_17) throw e_17.error; }
                        }
                    }
                }
                catch (e_16_1) { e_16 = { error: e_16_1 }; }
                finally {
                    try {
                        if (directives_3_1 && !directives_3_1.done && (_b = directives_3.return)) _b.call(directives_3);
                    }
                    finally { if (e_16) throw e_16.error; }
                }
                this.opQueue.push(new TcbUnclaimedInputsOp(this.tcb, this, node, claimedInputs));
                // If there are no directives which match this element, then it's a "plain" DOM element (or a
                // web component), and should be checked against the DOM schema. If any directives match,
                // we must assume that the element could be custom (either a component, or a directive like
                // <router-outlet>) and shouldn't validate the element name itself.
                var checkElement = directives.length === 0;
                this.opQueue.push(new TcbDomSchemaCheckerOp(this.tcb, node, checkElement, claimedInputs));
            }
        };
        Scope.prototype.appendOutputsOfNode = function (node) {
            var e_18, _a, e_19, _b, e_20, _c;
            // Collect all the outputs on the element.
            var claimedOutputs = new Set();
            var directives = this.tcb.boundTarget.getDirectivesOfNode(node);
            if (directives === null || directives.length === 0) {
                // If there are no directives, then all outputs are unclaimed outputs, so queue an operation
                // to add them if needed.
                if (node instanceof compiler_1.TmplAstElement) {
                    this.opQueue.push(new TcbUnclaimedOutputsOp(this.tcb, this, node, claimedOutputs));
                }
                return;
            }
            try {
                // Queue operations for all directives to check the relevant outputs for a directive.
                for (var directives_4 = tslib_1.__values(directives), directives_4_1 = directives_4.next(); !directives_4_1.done; directives_4_1 = directives_4.next()) {
                    var dir = directives_4_1.value;
                    this.opQueue.push(new TcbDirectiveOutputsOp(this.tcb, this, node, dir));
                }
            }
            catch (e_18_1) { e_18 = { error: e_18_1 }; }
            finally {
                try {
                    if (directives_4_1 && !directives_4_1.done && (_a = directives_4.return)) _a.call(directives_4);
                }
                finally { if (e_18) throw e_18.error; }
            }
            // After expanding the directives, we might need to queue an operation to check any unclaimed
            // outputs.
            if (node instanceof compiler_1.TmplAstElement) {
                try {
                    // Go through the directives and register any outputs that it claims in `claimedOutputs`.
                    for (var directives_5 = tslib_1.__values(directives), directives_5_1 = directives_5.next(); !directives_5_1.done; directives_5_1 = directives_5.next()) {
                        var dir = directives_5_1.value;
                        try {
                            for (var _d = (e_20 = void 0, tslib_1.__values(dir.outputs.propertyNames)), _e = _d.next(); !_e.done; _e = _d.next()) {
                                var outputProperty = _e.value;
                                claimedOutputs.add(outputProperty);
                            }
                        }
                        catch (e_20_1) { e_20 = { error: e_20_1 }; }
                        finally {
                            try {
                                if (_e && !_e.done && (_c = _d.return)) _c.call(_d);
                            }
                            finally { if (e_20) throw e_20.error; }
                        }
                    }
                }
                catch (e_19_1) { e_19 = { error: e_19_1 }; }
                finally {
                    try {
                        if (directives_5_1 && !directives_5_1.done && (_b = directives_5.return)) _b.call(directives_5);
                    }
                    finally { if (e_19) throw e_19.error; }
                }
                this.opQueue.push(new TcbUnclaimedOutputsOp(this.tcb, this, node, claimedOutputs));
            }
        };
        Scope.prototype.appendDeepSchemaChecks = function (nodes) {
            var e_21, _a, e_22, _b, e_23, _c;
            try {
                for (var nodes_1 = tslib_1.__values(nodes), nodes_1_1 = nodes_1.next(); !nodes_1_1.done; nodes_1_1 = nodes_1.next()) {
                    var node = nodes_1_1.value;
                    if (!(node instanceof compiler_1.TmplAstElement || node instanceof compiler_1.TmplAstTemplate)) {
                        continue;
                    }
                    if (node instanceof compiler_1.TmplAstElement) {
                        var claimedInputs = new Set();
                        var directives = this.tcb.boundTarget.getDirectivesOfNode(node);
                        var hasDirectives = void 0;
                        if (directives === null || directives.length === 0) {
                            hasDirectives = false;
                        }
                        else {
                            hasDirectives = true;
                            try {
                                for (var directives_6 = (e_22 = void 0, tslib_1.__values(directives)), directives_6_1 = directives_6.next(); !directives_6_1.done; directives_6_1 = directives_6.next()) {
                                    var dir = directives_6_1.value;
                                    try {
                                        for (var _d = (e_23 = void 0, tslib_1.__values(dir.inputs.propertyNames)), _e = _d.next(); !_e.done; _e = _d.next()) {
                                            var propertyName = _e.value;
                                            claimedInputs.add(propertyName);
                                        }
                                    }
                                    catch (e_23_1) { e_23 = { error: e_23_1 }; }
                                    finally {
                                        try {
                                            if (_e && !_e.done && (_c = _d.return)) _c.call(_d);
                                        }
                                        finally { if (e_23) throw e_23.error; }
                                    }
                                }
                            }
                            catch (e_22_1) { e_22 = { error: e_22_1 }; }
                            finally {
                                try {
                                    if (directives_6_1 && !directives_6_1.done && (_b = directives_6.return)) _b.call(directives_6);
                                }
                                finally { if (e_22) throw e_22.error; }
                            }
                        }
                        this.opQueue.push(new TcbDomSchemaCheckerOp(this.tcb, node, !hasDirectives, claimedInputs));
                    }
                    this.appendDeepSchemaChecks(node.children);
                }
            }
            catch (e_21_1) { e_21 = { error: e_21_1 }; }
            finally {
                try {
                    if (nodes_1_1 && !nodes_1_1.done && (_a = nodes_1.return)) _a.call(nodes_1);
                }
                finally { if (e_21) throw e_21.error; }
            }
        };
        Scope.prototype.appendIcuExpressions = function (node) {
            var e_24, _a, e_25, _b;
            try {
                for (var _c = tslib_1.__values(Object.values(node.vars)), _d = _c.next(); !_d.done; _d = _c.next()) {
                    var variable = _d.value;
                    this.opQueue.push(new TcbTextInterpolationOp(this.tcb, this, variable));
                }
            }
            catch (e_24_1) { e_24 = { error: e_24_1 }; }
            finally {
                try {
                    if (_d && !_d.done && (_a = _c.return)) _a.call(_c);
                }
                finally { if (e_24) throw e_24.error; }
            }
            try {
                for (var _e = tslib_1.__values(Object.values(node.placeholders)), _f = _e.next(); !_f.done; _f = _e.next()) {
                    var placeholder = _f.value;
                    if (placeholder instanceof compiler_1.TmplAstBoundText) {
                        this.opQueue.push(new TcbTextInterpolationOp(this.tcb, this, placeholder));
                    }
                }
            }
            catch (e_25_1) { e_25 = { error: e_25_1 }; }
            finally {
                try {
                    if (_f && !_f.done && (_b = _e.return)) _b.call(_e);
                }
                finally { if (e_25) throw e_25.error; }
            }
        };
        return Scope;
    }());
    /**
     * Create the `ctx` parameter to the top-level TCB function, with the given generic type arguments.
     */
    function tcbCtxParam(node, name, typeArguments) {
        var type = ts.factory.createTypeReferenceNode(name, typeArguments);
        return ts.factory.createParameterDeclaration(
        /* decorators */ undefined, 
        /* modifiers */ undefined, 
        /* dotDotDotToken */ undefined, 
        /* name */ 'ctx', 
        /* questionToken */ undefined, 
        /* type */ type, 
        /* initializer */ undefined);
    }
    /**
     * Process an `AST` expression and convert it into a `ts.Expression`, generating references to the
     * correct identifiers in the current scope.
     */
    function tcbExpression(ast, tcb, scope) {
        var translator = new TcbExpressionTranslator(tcb, scope);
        return translator.translate(ast);
    }
    var TcbExpressionTranslator = /** @class */ (function () {
        function TcbExpressionTranslator(tcb, scope) {
            this.tcb = tcb;
            this.scope = scope;
        }
        TcbExpressionTranslator.prototype.translate = function (ast) {
            var _this = this;
            // `astToTypescript` actually does the conversion. A special resolver `tcbResolve` is passed
            // which interprets specific expression nodes that interact with the `ImplicitReceiver`. These
            // nodes actually refer to identifiers within the current scope.
            return expression_1.astToTypescript(ast, function (ast) { return _this.resolve(ast); }, this.tcb.env.config);
        };
        /**
         * Resolve an `AST` expression within the given scope.
         *
         * Some `AST` expressions refer to top-level concepts (references, variables, the component
         * context). This method assists in resolving those.
         */
        TcbExpressionTranslator.prototype.resolve = function (ast) {
            var _this = this;
            if (ast instanceof compiler_1.PropertyRead && ast.receiver instanceof compiler_1.ImplicitReceiver) {
                // Try to resolve a bound target for this expression. If no such target is available, then
                // the expression is referencing the top-level component context. In that case, `null` is
                // returned here to let it fall through resolution so it will be caught when the
                // `ImplicitReceiver` is resolved in the branch below.
                return this.resolveTarget(ast);
            }
            else if (ast instanceof compiler_1.PropertyWrite && ast.receiver instanceof compiler_1.ImplicitReceiver) {
                var target = this.resolveTarget(ast);
                if (target === null) {
                    return null;
                }
                var expr = this.translate(ast.value);
                var result = ts.createParen(ts.createBinary(target, ts.SyntaxKind.EqualsToken, expr));
                diagnostics_1.addParseSpanInfo(result, ast.sourceSpan);
                return result;
            }
            else if (ast instanceof compiler_1.ImplicitReceiver) {
                // AST instances representing variables and references look very similar to property reads
                // or method calls from the component context: both have the shape
                // PropertyRead(ImplicitReceiver, 'propName') or MethodCall(ImplicitReceiver, 'methodName').
                //
                // `translate` will first try to `resolve` the outer PropertyRead/MethodCall. If this works,
                // it's because the `BoundTarget` found an expression target for the whole expression, and
                // therefore `translate` will never attempt to `resolve` the ImplicitReceiver of that
                // PropertyRead/MethodCall.
                //
                // Therefore if `resolve` is called on an `ImplicitReceiver`, it's because no outer
                // PropertyRead/MethodCall resolved to a variable or reference, and therefore this is a
                // property read or method call on the component context itself.
                return ts.createIdentifier('ctx');
            }
            else if (ast instanceof compiler_1.BindingPipe) {
                var expr = this.translate(ast.exp);
                var pipeRef = this.tcb.getPipeByName(ast.name);
                var pipe = void 0;
                if (pipeRef === null) {
                    // No pipe by that name exists in scope. Record this as an error.
                    this.tcb.oobRecorder.missingPipe(this.tcb.id, ast);
                    // Use an 'any' value to at least allow the rest of the expression to be checked.
                    pipe = expression_1.NULL_AS_ANY;
                }
                else {
                    // Use a variable declared as the pipe's type.
                    pipe = this.tcb.env.pipeInst(pipeRef);
                }
                var args = ast.args.map(function (arg) { return _this.translate(arg); });
                var methodAccess = ts.factory.createPropertyAccessExpression(pipe, 'transform');
                diagnostics_1.addParseSpanInfo(methodAccess, ast.nameSpan);
                if (!this.tcb.env.config.checkTypeOfPipes) {
                    methodAccess = ts.factory.createAsExpression(methodAccess, ts.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword));
                }
                var result = ts.createCall(
                /* expression */ methodAccess, 
                /* typeArguments */ undefined, tslib_1.__spreadArray([expr], tslib_1.__read(args)));
                diagnostics_1.addParseSpanInfo(result, ast.sourceSpan);
                return result;
            }
            else if (ast instanceof compiler_1.MethodCall && ast.receiver instanceof compiler_1.ImplicitReceiver &&
                !(ast.receiver instanceof compiler_1.ThisReceiver)) {
                // Resolve the special `$any(expr)` syntax to insert a cast of the argument to type `any`.
                // `$any(expr)` -> `expr as any`
                if (ast.name === '$any' && ast.args.length === 1) {
                    var expr = this.translate(ast.args[0]);
                    var exprAsAny = ts.createAsExpression(expr, ts.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword));
                    var result = ts.createParen(exprAsAny);
                    diagnostics_1.addParseSpanInfo(result, ast.sourceSpan);
                    return result;
                }
                // Attempt to resolve a bound target for the method, and generate the method call if a target
                // could be resolved. If no target is available, then the method is referencing the top-level
                // component context, in which case `null` is returned to let the `ImplicitReceiver` being
                // resolved to the component context.
                var receiver = this.resolveTarget(ast);
                if (receiver === null) {
                    return null;
                }
                var method = diagnostics_1.wrapForDiagnostics(receiver);
                diagnostics_1.addParseSpanInfo(method, ast.nameSpan);
                var args = ast.args.map(function (arg) { return _this.translate(arg); });
                var node = ts.createCall(method, undefined, args);
                diagnostics_1.addParseSpanInfo(node, ast.sourceSpan);
                return node;
            }
            else {
                // This AST isn't special after all.
                return null;
            }
        };
        /**
         * Attempts to resolve a bound target for a given expression, and translates it into the
         * appropriate `ts.Expression` that represents the bound target. If no target is available,
         * `null` is returned.
         */
        TcbExpressionTranslator.prototype.resolveTarget = function (ast) {
            var binding = this.tcb.boundTarget.getExpressionTarget(ast);
            if (binding === null) {
                return null;
            }
            var expr = this.scope.resolve(binding);
            diagnostics_1.addParseSpanInfo(expr, ast.sourceSpan);
            return expr;
        };
        return TcbExpressionTranslator;
    }());
    /**
     * Call the type constructor of a directive instance on a given template node, inferring a type for
     * the directive instance from any bound inputs.
     */
    function tcbCallTypeCtor(dir, tcb, inputs) {
        var typeCtor = tcb.env.typeCtorFor(dir);
        // Construct an array of `ts.PropertyAssignment`s for each of the directive's inputs.
        var members = inputs.map(function (input) {
            var propertyName = ts.createStringLiteral(input.field);
            if (input.type === 'binding') {
                // For bound inputs, the property is assigned the binding expression.
                var expr = input.expression;
                if (!tcb.env.config.checkTypeOfInputBindings) {
                    // If checking the type of bindings is disabled, cast the resulting expression to 'any'
                    // before the assignment.
                    expr = ts_util_1.tsCastToAny(expr);
                }
                else if (!tcb.env.config.strictNullInputBindings) {
                    // If strict null checks are disabled, erase `null` and `undefined` from the type by
                    // wrapping the expression in a non-null assertion.
                    expr = ts.createNonNullExpression(expr);
                }
                var assignment = ts.createPropertyAssignment(propertyName, diagnostics_1.wrapForDiagnostics(expr));
                diagnostics_1.addParseSpanInfo(assignment, input.sourceSpan);
                return assignment;
            }
            else {
                // A type constructor is required to be called with all input properties, so any unset
                // inputs are simply assigned a value of type `any` to ignore them.
                return ts.createPropertyAssignment(propertyName, expression_1.NULL_AS_ANY);
            }
        });
        // Call the `ngTypeCtor` method on the directive class, with an object literal argument created
        // from the matched inputs.
        return ts.createCall(
        /* expression */ typeCtor, 
        /* typeArguments */ undefined, 
        /* argumentsArray */ [ts.createObjectLiteral(members)]);
    }
    function getBoundInputs(directive, node, tcb) {
        var boundInputs = [];
        var processAttribute = function (attr) {
            // Skip non-property bindings.
            if (attr instanceof compiler_1.TmplAstBoundAttribute && attr.type !== 0 /* Property */) {
                return;
            }
            // Skip the attribute if the directive does not have an input for it.
            var inputs = directive.inputs.getByBindingPropertyName(attr.name);
            if (inputs === null) {
                return;
            }
            var fieldNames = inputs.map(function (input) { return input.classPropertyName; });
            boundInputs.push({ attribute: attr, fieldNames: fieldNames });
        };
        node.inputs.forEach(processAttribute);
        node.attributes.forEach(processAttribute);
        if (node instanceof compiler_1.TmplAstTemplate) {
            node.templateAttrs.forEach(processAttribute);
        }
        return boundInputs;
    }
    /**
     * Translates the given attribute binding to a `ts.Expression`.
     */
    function translateInput(attr, tcb, scope) {
        if (attr instanceof compiler_1.TmplAstBoundAttribute) {
            // Produce an expression representing the value of the binding.
            return tcbExpression(attr.value, tcb, scope);
        }
        else {
            // For regular attributes with a static string value, use the represented string literal.
            return ts.createStringLiteral(attr.value);
        }
    }
    var EVENT_PARAMETER = '$event';
    /**
     * Creates an arrow function to be used as handler function for event bindings. The handler
     * function has a single parameter `$event` and the bound event's handler `AST` represented as a
     * TypeScript expression as its body.
     *
     * When `eventType` is set to `Infer`, the `$event` parameter will not have an explicit type. This
     * allows for the created handler function to have its `$event` parameter's type inferred based on
     * how it's used, to enable strict type checking of event bindings. When set to `Any`, the `$event`
     * parameter will have an explicit `any` type, effectively disabling strict type checking of event
     * bindings. Alternatively, an explicit type can be passed for the `$event` parameter.
     */
    function tcbCreateEventHandler(event, tcb, scope, eventType) {
        var handler = tcbEventHandlerExpression(event.handler, tcb, scope);
        var eventParamType;
        if (eventType === 0 /* Infer */) {
            eventParamType = undefined;
        }
        else if (eventType === 1 /* Any */) {
            eventParamType = ts.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword);
        }
        else {
            eventParamType = eventType;
        }
        // Obtain all guards that have been applied to the scope and its parents, as they have to be
        // repeated within the handler function for their narrowing to be in effect within the handler.
        var guards = scope.guards();
        var body = ts.createExpressionStatement(handler);
        if (guards !== null) {
            // Wrap the body in an `if` statement containing all guards that have to be applied.
            body = ts.createIf(guards, body);
        }
        var eventParam = ts.createParameter(
        /* decorators */ undefined, 
        /* modifiers */ undefined, 
        /* dotDotDotToken */ undefined, 
        /* name */ EVENT_PARAMETER, 
        /* questionToken */ undefined, 
        /* type */ eventParamType);
        comments_1.addExpressionIdentifier(eventParam, comments_1.ExpressionIdentifier.EVENT_PARAMETER);
        return ts.createFunctionExpression(
        /* modifier */ undefined, 
        /* asteriskToken */ undefined, 
        /* name */ undefined, 
        /* typeParameters */ undefined, 
        /* parameters */ [eventParam], 
        /* type */ ts.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword), 
        /* body */ ts.createBlock([body]));
    }
    /**
     * Similar to `tcbExpression`, this function converts the provided `AST` expression into a
     * `ts.Expression`, with special handling of the `$event` variable that can be used within event
     * bindings.
     */
    function tcbEventHandlerExpression(ast, tcb, scope) {
        var translator = new TcbEventHandlerTranslator(tcb, scope);
        return translator.translate(ast);
    }
    function isSplitTwoWayBinding(inputName, output, inputs, tcb) {
        var input = inputs.find(function (input) { return input.name === inputName; });
        if (input === undefined || input.sourceSpan !== output.sourceSpan) {
            return false;
        }
        // Input consumer should be a directive because it's claimed
        var inputConsumer = tcb.boundTarget.getConsumerOfBinding(input);
        var outputConsumer = tcb.boundTarget.getConsumerOfBinding(output);
        if (outputConsumer === null || inputConsumer.ref === undefined ||
            outputConsumer instanceof compiler_1.TmplAstTemplate) {
            return false;
        }
        if (outputConsumer instanceof compiler_1.TmplAstElement) {
            tcb.oobRecorder.splitTwoWayBinding(tcb.id, input, output, inputConsumer.ref.node, outputConsumer);
            return true;
        }
        else if (outputConsumer.ref !== inputConsumer.ref) {
            tcb.oobRecorder.splitTwoWayBinding(tcb.id, input, output, inputConsumer.ref.node, outputConsumer.ref.node);
            return true;
        }
        return false;
    }
    var TcbEventHandlerTranslator = /** @class */ (function (_super) {
        tslib_1.__extends(TcbEventHandlerTranslator, _super);
        function TcbEventHandlerTranslator() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        TcbEventHandlerTranslator.prototype.resolve = function (ast) {
            // Recognize a property read on the implicit receiver corresponding with the event parameter
            // that is available in event bindings. Since this variable is a parameter of the handler
            // function that the converted expression becomes a child of, just create a reference to the
            // parameter by its name.
            if (ast instanceof compiler_1.PropertyRead && ast.receiver instanceof compiler_1.ImplicitReceiver &&
                !(ast.receiver instanceof compiler_1.ThisReceiver) && ast.name === EVENT_PARAMETER) {
                var event_1 = ts.createIdentifier(EVENT_PARAMETER);
                diagnostics_1.addParseSpanInfo(event_1, ast.nameSpan);
                return event_1;
            }
            return _super.prototype.resolve.call(this, ast);
        };
        return TcbEventHandlerTranslator;
    }(TcbExpressionTranslator));
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHlwZV9jaGVja19ibG9jay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BhY2thZ2VzL2NvbXBpbGVyLWNsaS9zcmMvbmd0c2MvdHlwZWNoZWNrL3NyYy90eXBlX2NoZWNrX2Jsb2NrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7R0FNRzs7Ozs7Ozs7Ozs7Ozs7SUFFSCw4Q0FBcVk7SUFDclksK0JBQWlDO0lBT2pDLG1GQUFnRztJQUNoRyx5RkFBc0c7SUFHdEcsdUZBQTBEO0lBRTFELHVHQUErRDtJQUMvRCxpRkFBNEk7SUFDNUksbUdBQTBEO0lBQzFELCtHQUE4RDtJQUU5RDs7T0FFRztJQUNILElBQVkseUJBdUJYO0lBdkJELFdBQVkseUJBQXlCO1FBQ25DOzs7O1dBSUc7UUFDSCxxRkFBVSxDQUFBO1FBRVY7Ozs7OztXQU1HO1FBQ0gsNkZBQWMsQ0FBQTtRQUVkOzs7O1dBSUc7UUFDSCwyRkFBYSxDQUFBO0lBQ2YsQ0FBQyxFQXZCVyx5QkFBeUIsR0FBekIsaUNBQXlCLEtBQXpCLGlDQUF5QixRQXVCcEM7SUFFRDs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7T0F1Qkc7SUFDSCxTQUFnQixzQkFBc0IsQ0FDbEMsR0FBZ0IsRUFBRSxHQUFxRCxFQUFFLElBQW1CLEVBQzVGLElBQTRCLEVBQUUsZ0JBQWtDLEVBQ2hFLFdBQXdDLEVBQ3hDLHNCQUFpRDtRQUNuRCxJQUFNLEdBQUcsR0FBRyxJQUFJLE9BQU8sQ0FDbkIsR0FBRyxFQUFFLGdCQUFnQixFQUFFLFdBQVcsRUFBRSxJQUFJLENBQUMsRUFBRSxFQUFFLElBQUksQ0FBQyxXQUFXLEVBQUUsSUFBSSxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDN0YsSUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLFFBQVEsQ0FBQyxHQUFHLEVBQUUsSUFBSSxFQUFFLEdBQUcsQ0FBQyxXQUFXLENBQUMsTUFBTSxD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Z0I7Z0JBQ3ZFLENBQUMsQ0FBQyxHQUFHLENBQUMsUUFBUSxZQUFZLHVCQUFZLENBQUMsSUFBSSxHQUFHLENBQUMsSUFBSSxLQUFLLGVBQWUsRUFBRTtnQkFDM0UsSUFBTSxPQUFLLEdBQUcsRUFBRSxDQUFDLGdCQUFnQixDQUFDLGVBQWUsQ0FBQyxDQUFDO2dCQUNuRCw4QkFBZ0IsQ0FBQyxPQUFLLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUN0QyxPQUFPLE9BQUssQ0FBQzthQUNkO1lBRUQsT0FBTyxpQkFBTSxPQUFPLFlBQUMsR0FBRyxDQUFDLENBQUM7UUFDNUIsQ0FBQztRQUNILGdDQUFDO0lBQUQsQ0FBQyxBQWZELENBQXdDLHVCQUF1QixHQWU5RCIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgTExDIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuXG5pbXBvcnQge0FTVCwgQmluZGluZ1BpcGUsIEJpbmRpbmdUeXBlLCBCb3VuZFRhcmdldCwgRFlOQU1JQ19UWVBFLCBJbXBsaWNpdFJlY2VpdmVyLCBNZXRob2RDYWxsLCBQYXJzZWRFdmVudFR5cGUsIFBhcnNlU291cmNlU3BhbiwgUHJvcGVydHlSZWFkLCBQcm9wZXJ0eVdyaXRlLCBTY2hlbWFNZXRhZGF0YSwgVGhpc1JlY2VpdmVyLCBUbXBsQXN0Qm91bmRBdHRyaWJ1dGUsIFRtcGxBc3RCb3VuZEV2ZW50LCBUbXBsQXN0Qm91bmRUZXh0LCBUbXBsQXN0RWxlbWVudCwgVG1wbEFzdEljdSwgVG1wbEFzdE5vZGUsIFRtcGxBc3RSZWZlcmVuY2UsIFRtcGxBc3RUZW1wbGF0ZSwgVG1wbEFzdFRleHRBdHRyaWJ1dGUsIFRtcGxBc3RWYXJpYWJsZX0gZnJvbSAnQGFuZ3VsYXIvY29tcGlsZXInO1xuaW1wb3J0ICogYXMgdHMgZnJvbSAndHlwZXNjcmlwdCc7XG5cbmltcG9ydCB7UmVmZXJlbmNlfSBmcm9tICcuLi8uLi9pbXBvcnRzJztcbmltcG9ydCB7Q2xhc3NQcm9wZXJ0eU5hbWV9IGZyb20gJy4uLy4uL21ldGFkYXRhJztcbmltcG9ydCB7Q2xhc3NEZWNsYXJhdGlvbiwgUmVmbGVjdGlvbkhvc3R9IGZyb20gJy4uLy4uL3JlZmxlY3Rpb24nO1xuaW1wb3J0IHtUZW1wbGF0ZUlkLCBUeXBlQ2hlY2thYmxlRGlyZWN0aXZlTWV0YSwgVHlwZUNoZWNrQmxvY2tNZXRhZGF0YX0gZnJvbSAnLi4vYXBpJztcblxuaW1wb3J0IHthZGRFeHByZXNzaW9uSWRlbnRpZmllciwgRXhwcmVzc2lvbklkZW50aWZpZXIsIG1hcmtJZ25vcmVEaWFnbm9zdGljc30gZnJvbSAnLi9jb21tZW50cyc7XG5pbXBvcnQge2FkZFBhcnNlU3BhbkluZm8sIGFkZFRlbXBsYXRlSWQsIHdyYXBGb3JEaWFnbm9zdGljcywgd3JhcEZvclR5cGVDaGVja2VyfSBmcm9tICcuL2RpYWdub3N0aWNzJztcbmltcG9ydCB7RG9tU2NoZW1hQ2hlY2tlcn0gZnJvbSAnLi9kb20nO1xuaW1wb3J0IHtFbnZpcm9ubWVudH0gZnJvbSAnLi9lbnZpcm9ubWVudCc7XG5pbXBvcnQge2FzdFRvVHlwZXNjcmlwdCwgTlVMTF9BU19BTll9IGZyb20gJy4vZXhwcmVzc2lvbic7XG5pbXBvcnQge091dE9mQmFuZERpYWdub3N0aWNSZWNvcmRlcn0gZnJvbSAnLi9vb2InO1xuaW1wb3J0IHtFeHByZXNzaW9uU2VtYW50aWNWaXNpdG9yfSBmcm9tICcuL3RlbXBsYXRlX3NlbWFudGljcyc7XG5pbXBvcnQge3RzQ2FsbE1ldGhvZCwgdHNDYXN0VG9BbnksIHRzQ3JlYXRlRWxlbWVudCwgdHNDcmVhdGVUeXBlUXVlcnlGb3JDb2VyY2VkSW5wdXQsIHRzQ3JlYXRlVmFyaWFibGUsIHRzRGVjbGFyZVZhcmlhYmxlfSBmcm9tICcuL3RzX3V0aWwnO1xuaW1wb3J0IHtyZXF1aXJlc0lubGluZVR5cGVDdG9yfSBmcm9tICcuL3R5cGVfY29uc3RydWN0b3InO1xuaW1wb3J0IHtUeXBlUGFyYW1ldGVyRW1pdHRlcn0gZnJvbSAnLi90eXBlX3BhcmFtZXRlcl9lbWl0dGVyJztcblxuLyoqXG4gKiBDb250cm9scyBob3cgZ2VuZXJpY3MgZm9yIHRoZSBjb21wb25lbnQgY29udGV4dCBjbGFzcyB3aWxsIGJlIGhhbmRsZWQgZHVyaW5nIFRDQiBnZW5lcmF0aW9uLlxuICovXG5leHBvcnQgZW51bSBUY2JHZW5lcmljQ29udGV4dEJlaGF2aW9yIHtcbiAgLyoqXG4gICAqIFJlZmVyZW5jZXMgdG8gZ2VuZXJpYyBwYXJhbWV0ZXIgYm91bmRzIHdpbGwgYmUgZW1pdHRlZCB2aWEgdGhlIGBUeXBlUGFyYW1ldGVyRW1pdHRlcmAuXG4gICAqXG4gICAqIFRoZSBjYWxsZXIgbXVzdCB2ZXJpZnkgdGhhdCBhbGwgcGFyYW1ldGVyIGJvdW5kcyBhcmUgZW1pdHRhYmxlIGluIG9yZGVyIHRvIHVzZSB0aGlzIG1vZGUuXG4gICAqL1xuICBVc2VFbWl0dGVyLFxuXG4gIC8qKlxuICAgKiBHZW5lcmljIHBhcmFtZXRlciBkZWNsYXJhdGlvbnMgd2lsbCBiZSBjb3BpZWQgZGlyZWN0bHkgZnJvbSB0aGUgYHRzLkNsYXNzRGVjbGFyYXRpb25gIG9mIHRoZVxuICAgKiBjb21wb25lbnQgY2xhc3MuXG4gICAqXG4gICAqIFRoZSBjYWxsZXIgbXVzdCBvbmx5IHVzZSB0aGUgZ2VuZXJhdGVkIFRDQiBjb2RlIGluIGEgY29udGV4dCB3aGVyZSBzdWNoIGNvcGllcyB3aWxsIHN0aWxsIGJlXG4gICAqIHZhbGlkLCBzdWNoIGFzIGFuIGlubGluZSB0eXBlIGNoZWNrIGJsb2NrLlxuICAgKi9cbiAgQ29weUNsYXNzTm9kZXMsXG5cbiAgLyoqXG4gICAqIEFueSBnZW5lcmljIHBhcmFtZXRlcnMgZm9yIHRoZSBjb21wb25lbnQgY29udGV4dCBjbGFzcyB3aWxsIGJlIHNldCB0byBgYW55YC5cbiAgICpcbiAgICogUHJvZHVjZXMgYSBsZXNzIHVzZWZ1bCB0eXBlLCBidXQgaXMgYWx3YXlzIHNhZmUgdG8gdXNlLlxuICAgKi9cbiAgRmFsbGJhY2tUb0FueSxcbn1cblxuLyoqXG4gKiBHaXZlbiBhIGB0cy5DbGFzc0RlY2xhcmF0aW9uYCBmb3IgYSBjb21wb25lbnQsIGFuZCBtZXRhZGF0YSByZWdhcmRpbmcgdGhhdCBjb21wb25lbnQsIGNvbXBvc2UgYVxuICogXCJ0eXBlIGNoZWNrIGJsb2NrXCIgZnVuY3Rpb24uXG4gKlxuICogV2hlbiBwYXNzZWQgdGhyb3VnaCBUeXBlU2NyaXB0J3MgVHlwZUNoZWNrZXIsIHR5cGUgZXJyb3JzIHRoYXQgYXJpc2Ugd2l0aGluIHRoZSB0eXBlIGNoZWNrIGJsb2NrXG4gKiBmdW5jdGlvbiBpbmRpY2F0ZSBpc3N1ZXMgaW4gdGhlIHRlbXBsYXRlIGl0c2VsZi5cbiAqXG4gKiBBcyBhIHNpZGUgZWZmZWN0IG9mIGdlbmVyYXRpbmcgYSBUQ0IgZm9yIHRoZSBjb21wb25lbnQsIGB0cy5EaWFnbm9zdGljYHMgbWF5IGFsc28gYmUgcHJvZHVjZWRcbiAqIGRpcmVjdGx5IGZvciBpc3N1ZXMgd2l0aGluIHRoZSB0ZW1wbGF0ZSB3aGljaCBhcmUgaWRlbnRpZmllZCBkdXJpbmcgZ2VuZXJhdGlvbi4gVGhlc2UgaXNzdWVzIGFyZVxuICogcmVjb3JkZWQgaW4gZWl0aGVyIHRoZSBgZG9tU2NoZW1hQ2hlY2tlcmAgKHdoaWNoIGNoZWNrcyB1c2FnZSBvZiBET00gZWxlbWVudHMgYW5kIGJpbmRpbmdzKSBhc1xuICogd2VsbCBhcyB0aGUgYG9vYlJlY29yZGVyYCAod2hpY2ggcmVjb3JkcyBlcnJvcnMgd2hlbiB0aGUgdHlwZS1jaGVja2luZyBjb2RlIGdlbmVyYXRvciBpcyB1bmFibGVcbiAqIHRvIHN1ZmZpY2llbnRseSB1bmRlcnN0YW5kIGEgdGVtcGxhdGUpLlxuICpcbiAqIEBwYXJhbSBlbnYgYW4gYEVudmlyb25tZW50YCBpbnRvIHdoaWNoIHR5cGUtY2hlY2tpbmcgY29kZSB3aWxsIGJlIGdlbmVyYXRlZC5cbiAqIEBwYXJhbSByZWYgYSBgUmVmZXJlbmNlYCB0byB0aGUgY29tcG9uZW50IGNsYXNzIHdoaWNoIHNob3VsZCBiZSB0eXBlLWNoZWNrZWQuXG4gKiBAcGFyYW0gbmFtZSBhIGB0cy5JZGVudGlmaWVyYCB0byB1c2UgZm9yIHRoZSBnZW5lcmF0ZWQgYHRzLkZ1bmN0aW9uRGVjbGFyYXRpb25gLlxuICogQHBhcmFtIG1ldGEgbWV0YWRhdGEgYWJvdXQgdGhlIGNvbXBvbmVudCdzIHRlbXBsYXRlIGFuZCB0aGUgZnVuY3Rpb24gYmVpbmcgZ2VuZXJhdGVkLlxuICogQHBhcmFtIGRvbVNjaGVtYUNoZWNrZXIgdXNlZCB0byBjaGVjayBhbmQgcmVjb3JkIGVycm9ycyByZWdhcmRpbmcgaW1wcm9wZXIgdXNhZ2Ugb2YgRE9NIGVsZW1lbnRzXG4gKiBhbmQgYmluZGluZ3MuXG4gKiBAcGFyYW0gb29iUmVjb3JkZXIgdXNlZCB0byByZWNvcmQgZXJyb3JzIHJlZ2FyZGluZyB0ZW1wbGF0ZSBlbGVtZW50cyB3aGljaCBjb3VsZCBub3QgYmUgY29ycmVjdGx5XG4gKiB0cmFuc2xhdGVkIGludG8gdHlwZXMgZHVyaW5nIFRDQiBnZW5lcmF0aW9uLlxuICogQHBhcmFtIGdlbmVyaWNDb250ZXh0QmVoYXZpb3IgY29udHJvbHMgaG93IGdlbmVyaWMgcGFyYW1ldGVycyAoZXNwZWNpYWxseSBwYXJhbWV0ZXJzIHdpdGggZ2VuZXJpY1xuICogYm91bmRzKSB3aWxsIGJlIHJlZmVyZW5jZWQgZnJvbSB0aGUgZ2VuZXJhdGVkIFRDQiBjb2RlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVUeXBlQ2hlY2tCbG9jayhcbiAgICBlbnY6IEVudmlyb25tZW50LCByZWY6IFJlZmVyZW5jZTxDbGFzc0RlY2xhcmF0aW9uPHRzLkNsYXNzRGVjbGFyYXRpb24+PiwgbmFtZTogdHMuSWRlbnRpZmllcixcbiAgICBtZXRhOiBUeXBlQ2hlY2tCbG9ja01ldGFkYXRhLCBkb21TY2hlbWFDaGVja2VyOiBEb21TY2hlbWFDaGVja2VyLFxuICAgIG9vYlJlY29yZGVyOiBPdXRPZkJhbmREaWFnbm9zdGljUmVjb3JkZXIsXG4gICAgZ2VuZXJpY0NvbnRleHRCZWhhdmlvcjogVGNiR2VuZXJpY0NvbnRleHRCZWhhdmlvcik6IHRzLkZ1bmN0aW9uRGVjbGFyYXRpb24ge1xuICBjb25zdCB0Y2IgPSBuZXcgQ29udGV4dChcbiAgICAgIGVudiwgZG9tU2NoZW1hQ2hlY2tlciwgb29iUmVjb3JkZXIsIG1ldGEuaWQsIG1ldGEuYm91bmRUYXJnZXQsIG1ldGEucGlwZXMsIG1ldGEuc2NoZW1hcyk7XG4gIGNvbnN0IHNjb3BlID0gU2NvcGUuZm9yTm9kZXModGNiLCBudWxsLCB0Y2IuYm91bmRUYXJnZXQudGFyZ2V0LnRlbXBsYXRlICEsIC8qIGd1YXJkICovIG51bGwpO1xuICBjb25zdCBjdHhSYXdUeXBlID0gZW52LnJlZmVyZW5jZVR5cGUocmVmKTtcbiAgaWYgKCF0cy5pc1R5cGVSZWZlcmVuY2VOb2RlKGN0eFJhd1R5cGUpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICBgRXhwZWN0ZWQgVHlwZVJlZmVyZW5jZU5vZGUgd2hlbiByZWZlcmVuY2luZyB0aGUgY3R4IHBhcmFtIGZvciAke3JlZi5kZWJ1Z05hbWV9YCk7XG4gIH1cblxuICBsZXQgdHlwZVBhcmFtZXRlcnM6IHRzLlR5cGVQYXJhbWV0ZXJEZWNsYXJhdGlvbltdfHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcbiAgbGV0IHR5cGVBcmd1bWVudHM6IHRzLlR5cGVOb2RlW118dW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG4gIGlmIChyZWYubm9kZS50eXBlUGFyYW1ldGVycyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgaWYgKCFlbnYuY29uZmlnLnVzZUNvbnRleHRHZW5lcmljVHlwZSkge1xuICAgICAgZ2VuZXJpY0NvbnRleHRCZWhhdmlvciA9IFRjYkdlbmVyaWNDb250ZXh0QmVoYXZpb3IuRmFsbGJhY2tUb0FueTtcbiAgICB9XG5cbiAgICBzd2l0Y2ggKGdlbmVyaWNDb250ZXh0QmVoYXZpb3IpIHtcbiAgICAgIGNhc2UgVGNiR2VuZXJpY0NvbnRleHRCZWhhdmlvci5Vc2VFbWl0dGVyOlxuICAgICAgICAvLyBHdWFyYW50ZWVkIHRvIGVtaXQgdHlwZSBwYXJhbWV0ZXJzIHNpbmNlIHdlIGNoZWNrZWQgdGhhdCB0aGUgY2xhc3MgaGFzIHRoZW0gYWJvdmUuXG4gICAgICAgIHR5cGVQYXJhbWV0ZXJzID0gbmV3IFR5cGVQYXJhbWV0ZXJFbWl0dGVyKHJlZi5ub2RlLnR5cGVQYXJhbWV0ZXJzLCBlbnYucmVmbGVjdG9yKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAuZW1pdCh0eXBlUmVmID0+IGVudi5yZWZlcmVuY2VUeXBlKHR5cGVSZWYpKSE7XG4gICAgICAgIHR5cGVBcmd1bWVudHMgPSB0eXBlUGFyYW1ldGVycy5tYXAocGFyYW0gPT4gdHMuZmFjdG9yeS5jcmVhdGVUeXBlUmVmZXJlbmNlTm9kZShwYXJhbS5uYW1lKSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBUY2JHZW5lcmljQ29udGV4dEJlaGF2aW9yLkNvcHlDbGFzc05vZGVzOlxuICAgICAgICB0eXBlUGFyYW1ldGVycyA9IFsuLi5yZWYubm9kZS50eXBlUGFyYW1ldGVyc107XG4gICAgICAgIHR5cGVBcmd1bWVudHMgPSB0eXBlUGFyYW1ldGVycy5tYXAocGFyYW0gPT4gdHMuZmFjdG9yeS5jcmVhdGVUeXBlUmVmZXJlbmNlTm9kZShwYXJhbS5uYW1lKSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBUY2JHZW5lcmljQ29udGV4dEJlaGF2aW9yLkZhbGxiYWNrVG9Bbnk6XG4gICAgICAgIHR5cGVBcmd1bWVudHMgPSByZWYubm9kZS50eXBlUGFyYW1ldGVycy5tYXAoXG4gICAgICAgICAgICAoKSA9PiB0cy5mYWN0b3J5LmNyZWF0ZUtleXdvcmRUeXBlTm9kZSh0cy5TeW50YXhLaW5kLkFueUtleXdvcmQpKTtcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgcGFyYW1MaXN0ID0gW3RjYkN0eFBhcmFtKHJlZi5ub2RlLCBjdHhSYXdUeXBlLnR5cGVOYW1lLCB0eXBlQXJndW1lbnRzKV07XG5cbiAgY29uc3Qgc2NvcGVTdGF0ZW1lbnRzID0gc2NvcGUucmVuZGVyKCk7XG4gIGNvbnN0IGlubmVyQm9keSA9IHRzLmNyZWF0ZUJsb2NrKFtcbiAgICAuLi5lbnYuZ2V0UHJlbHVkZVN0YXRlbWVudHMoKSxcbiAgICAuLi5zY29wZVN0YXRlbWVudHMsXG4gIF0pO1xuXG4gIC8vIFdyYXAgdGhlIGJvZHkgaW4gYW4gXCJpZiAodHJ1ZSlcIiBleHByZXNzaW9uLiBUaGlzIGlzIHVubmVjZXNzYXJ5IGJ1dCBoYXMgdGhlIGVmZmVjdCBvZiBjYXVzaW5nXG4gIC8vIHRoZSBgdHMuUHJpbnRlcmAgdG8gZm9ybWF0IHRoZSB0eXBlLWNoZWNrIGJsb2NrIG5pY2VseS5cbiAgY29uc3QgYm9keSA9IHRzLmNyZWF0ZUJsb2NrKFt0cy5jcmVhdGVJZih0cy5jcmVhdGVUcnVlKCksIGlubmVyQm9keSwgdW5kZWZpbmVkKV0pO1xuICBjb25zdCBmbkRlY2wgPSB0cy5jcmVhdGVGdW5jdGlvbkRlY2xhcmF0aW9uKFxuICAgICAgLyogZGVjb3JhdG9ycyAqLyB1bmRlZmluZWQsXG4gICAgICAvKiBtb2RpZmllcnMgKi8gdW5kZWZpbmVkLFxuICAgICAgLyogYXN0ZXJpc2tUb2tlbiAqLyB1bmRlZmluZWQsXG4gICAgICAvKiBuYW1lICovIG5hbWUsXG4gICAgICAvKiB0eXBlUGFyYW1ldGVycyAqLyBlbnYuY29uZmlnLnVzZUNvbnRleHRHZW5lcmljVHlwZSA/IHR5cGVQYXJhbWV0ZXJzIDogdW5kZWZpbmVkLFxuICAgICAgLyogcGFyYW1ldGVycyAqLyBwYXJhbUxpc3QsXG4gICAgICAvKiB0eXBlICovIHVuZGVmaW5lZCxcbiAgICAgIC8qIGJvZHkgKi8gYm9keSk7XG4gIGFkZFRlbXBsYXRlSWQoZm5EZWNsLCBtZXRhLmlkKTtcbiAgcmV0dXJuIGZuRGVjbDtcbn1cblxuLyoqXG4gKiBBIGNvZGUgZ2VuZXJhdGlvbiBvcGVyYXRpb24gdGhhdCdzIGludm9sdmVkIGluIHRoZSBjb25zdHJ1Y3Rpb24gb2YgYSBUeXBlIENoZWNrIEJsb2NrLlxuICpcbiAqIFRoZSBnZW5lcmF0aW9uIG9mIGEgVENCIGlzIG5vbi1saW5lYXIuIEJpbmRpbmdzIHdpdGhpbiBhIHRlbXBsYXRlIG1heSByZXN1bHQgaW4gdGhlIG5lZWQgdG9cbiAqIGNvbnN0cnVjdCBjZXJ0YWluIHR5cGVzIGVhcmxpZXIgdGhhbiB0aGV5IG90aGVyd2lzZSB3b3VsZCBiZSBjb25zdHJ1Y3RlZC4gVGhhdCBpcywgaWYgdGhlXG4gKiBnZW5lcmF0aW9uIG9mIGEgVENCIGZvciBhIHRlbXBsYXRlIGlzIGJyb2tlbiBkb3duIGludG8gc3BlY2lmaWMgb3BlcmF0aW9ucyAoY29uc3RydWN0aW5nIGFcbiAqIGRpcmVjdGl2ZSwgZXh0cmFjdGluZyBhIHZhcmlhYmxlIGZyb20gYSBsZXQtIG9wZXJhdGlvbiwgZXRjKSwgdGhlbiBpdCdzIHBvc3NpYmxlIGZvciBvcGVyYXRpb25zXG4gKiBlYXJsaWVyIGluIHRoZSBzZXF1ZW5jZSB0byBkZXBlbmQgb24gb3BlcmF0aW9ucyB3aGljaCBvY2N1ciBsYXRlciBpbiB0aGUgc2VxdWVuY2UuXG4gKlxuICogYFRjYk9wYCBhYnN0cmFjdHMgdGhlIGRpZmZlcmVudCB0eXBlcyBvZiBvcGVyYXRpb25zIHdoaWNoIGFyZSByZXF1aXJlZCB0byBjb252ZXJ0IGEgdGVtcGxhdGUgaW50b1xuICogYSBUQ0IuIFRoaXMgYWxsb3dzIGZvciB0d28gcGhhc2VzIG9mIHByb2Nlc3NpbmcgZm9yIHRoZSB0ZW1wbGF0ZSwgd2hlcmUgMSkgYSBsaW5lYXIgc2VxdWVuY2Ugb2ZcbiAqIGBUY2JPcGBzIGlzIGdlbmVyYXRlZCwgYW5kIHRoZW4gMikgdGhlc2Ugb3BlcmF0aW9ucyBhcmUgZXhlY3V0ZWQsIG5vdCBuZWNlc3NhcmlseSBpbiBsaW5lYXJcbiAqIG9yZGVyLlxuICpcbiAqIEVhY2ggYFRjYk9wYCBtYXkgaW5zZXJ0IHN0YXRlbWVudHMgaW50byB0aGUgYm9keSBvZiB0aGUgVENCLCBhbmQgYWxzbyBvcHRpb25hbGx5IHJldHVybiBhXG4gKiBgdHMuRXhwcmVzc2lvbmAgd2hpY2ggY2FuIGJlIHVzZWQgdG8gcmVmZXJlbmNlIHRoZSBvcGVyYXRpb24ncyByZXN1bHQuXG4gKi9cbmFic3RyYWN0IGNsYXNzIFRjYk9wIHtcbiAgLyoqXG4gICAqIFNldCB0byB0cnVlIGlmIHRoaXMgb3BlcmF0aW9uIGNhbiBiZSBjb25zaWRlcmVkIG9wdGlvbmFsLiBPcHRpb25hbCBvcGVyYXRpb25zIGFyZSBvbmx5IGV4ZWN1dGVkXG4gICAqIHdoZW4gZGVwZW5kZWQgdXBvbiBieSBvdGhlciBvcGVyYXRpb25zLCBvdGhlcndpc2UgdGhleSBhcmUgZGlzcmVnYXJkZWQuIFRoaXMgYWxsb3dzIGZvciBsZXNzXG4gICAqIGNvZGUgdG8gZ2VuZXJhdGUsIHBhcnNlIGFuZCB0eXBlLWNoZWNrLCBvdmVyYWxsIHBvc2l0aXZlbHkgY29udHJpYnV0aW5nIHRvIHBlcmZvcm1hbmNlLlxuICAgKi9cbiAgYWJzdHJhY3QgcmVhZG9ubHkgb3B0aW9uYWw6IGJvb2xlYW47XG5cbiAgYWJzdHJhY3QgZXhlY3V0ZSgpOiB0cy5FeHByZXNzaW9ufG51bGw7XG5cbiAgLyoqXG4gICAqIFJlcGxhY2VtZW50IHZhbHVlIG9yIG9wZXJhdGlvbiB1c2VkIHdoaWxlIHRoaXMgYFRjYk9wYCBpcyBleGVjdXRpbmcgKGkuZS4gdG8gcmVzb2x2ZSBjaXJjdWxhclxuICAgKiByZWZlcmVuY2VzIGR1cmluZyBpdHMgZXhlY3V0aW9uKS5cbiAgICpcbiAgICogVGhpcyBpcyB1c3VhbGx5IGEgYG51bGwhYCBleHByZXNzaW9uICh3aGljaCBhc2tzIFRTIHRvIGluZmVyIGFuIGFwcHJvcHJpYXRlIHR5cGUpLCBidXQgYW5vdGhlclxuICAgKiBgVGNiT3BgIGNhbiBiZSByZXR1cm5lZCBpbiBjYXNlcyB3aGVyZSBhZGRpdGlvbmFsIGNvZGUgZ2VuZXJhdGlvbiBpcyBuZWNlc3NhcnkgdG8gZGVhbCB3aXRoXG4gICAqIGNpcmN1bGFyIHJlZmVyZW5jZXMuXG4gICAqL1xuICBjaXJjdWxhckZhbGxiYWNrKCk6IFRjYk9wfHRzLkV4cHJlc3Npb24ge1xuICAgIHJldHVybiBJTkZFUl9UWVBFX0ZPUl9DSVJDVUxBUl9PUF9FWFBSO1xuICB9XG59XG5cbi8qKlxuICogQSBgVGNiT3BgIHdoaWNoIGNyZWF0ZXMgYW4gZXhwcmVzc2lvbiBmb3IgYSBuYXRpdmUgRE9NIGVsZW1lbnQgKG9yIHdlYiBjb21wb25lbnQpIGZyb20gYVxuICogYFRtcGxBc3RFbGVtZW50YC5cbiAqXG4gKiBFeGVjdXRpbmcgdGhpcyBvcGVyYXRpb24gcmV0dXJucyBhIHJlZmVyZW5jZSB0byB0aGUgZWxlbWVudCB2YXJpYWJsZS5cbiAqL1xuY2xhc3MgVGNiRWxlbWVudE9wIGV4dGVuZHMgVGNiT3Age1xuICBjb25zdHJ1Y3Rvcihwcml2YXRlIHRjYjogQ29udGV4dCwgcHJpdmF0ZSBzY29wZTogU2NvcGUsIHByaXZhdGUgZWxlbWVudDogVG1wbEFzdEVsZW1lbnQpIHtcbiAgICBzdXBlcigpO1xuICB9XG5cbiAgb3ZlcnJpZGUgZ2V0IG9wdGlvbmFsKCkge1xuICAgIC8vIFRoZSBzdGF0ZW1lbnQgZ2VuZXJhdGVkIGJ5IHRoaXMgb3BlcmF0aW9uIGlzIG9ubHkgdXNlZCBmb3IgdHlwZS1pbmZlcmVuY2Ugb2YgdGhlIERPTVxuICAgIC8vIGVsZW1lbnQncyB0eXBlIGFuZCB3b24ndCByZXBvcnQgZGlhZ25vc3RpY3MgYnkgaXRzZWxmLCBzbyB0aGUgb3BlcmF0aW9uIGlzIG1hcmtlZCBhcyBvcHRpb25hbFxuICAgIC8vIHRvIGF2b2lkIGdlbmVyYXRpbmcgc3RhdGVtZW50cyBmb3IgRE9NIGVsZW1lbnRzIHRoYXQgYXJlIG5ldmVyIHJlZmVyZW5jZWQuXG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBvdmVycmlkZSBleGVjdXRlKCk6IHRzLklkZW50aWZpZXIge1xuICAgIGNvbnN0IGlkID0gdGhpcy50Y2IuYWxsb2NhdGVJZCgpO1xuICAgIC8vIEFkZCB0aGUgZGVjbGFyYXRpb24gb2YgdGhlIGVsZW1lbnQgdXNpbmcgZG9jdW1lbnQuY3JlYXRlRWxlbWVudC5cbiAgICBjb25zdCBpbml0aWFsaXplciA9IHRzQ3JlYXRlRWxlbWVudCh0aGlzLmVsZW1lbnQubmFtZSk7XG4gICAgYWRkUGFyc2VTcGFuSW5mbyhpbml0aWFsaXplciwgdGhpcy5lbGVtZW50LnN0YXJ0U291cmNlU3BhbiB8fCB0aGlzLmVsZW1lbnQuc291cmNlU3Bhbik7XG4gICAgdGhpcy5zY29wZS5hZGRTdGF0ZW1lbnQodHNDcmVhdGVWYXJpYWJsZShpZCwgaW5pdGlhbGl6ZXIpKTtcbiAgICByZXR1cm4gaWQ7XG4gIH1cbn1cblxuLyoqXG4gKiBBIGBUY2JPcGAgd2hpY2ggY3JlYXRlcyBhbiBleHByZXNzaW9uIGZvciBwYXJ0aWN1bGFyIGxldC0gYFRtcGxBc3RWYXJpYWJsZWAgb24gYVxuICogYFRtcGxBc3RUZW1wbGF0ZWAncyBjb250ZXh0LlxuICpcbiAqIEV4ZWN1dGluZyB0aGlzIG9wZXJhdGlvbiByZXR1cm5zIGEgcmVmZXJlbmNlIHRvIHRoZSB2YXJpYWJsZSB2YXJpYWJsZSAobG9sKS5cbiAqL1xuY2xhc3MgVGNiVmFyaWFibGVPcCBleHRlbmRzIFRjYk9wIHtcbiAgY29uc3RydWN0b3IoXG4gICAgICBwcml2YXRlIHRjYjogQ29udGV4dCwgcHJpdmF0ZSBzY29wZTogU2NvcGUsIHByaXZhdGUgdGVtcGxhdGU6IFRtcGxBc3RUZW1wbGF0ZSxcbiAgICAgIHByaXZhdGUgdmFyaWFibGU6IFRtcGxBc3RWYXJpYWJsZSkge1xuICAgIHN1cGVyKCk7XG4gIH1cblxuICBvdmVycmlkZSBnZXQgb3B0aW9uYWwoKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgb3ZlcnJpZGUgZXhlY3V0ZSgpOiB0cy5JZGVudGlmaWVyIHtcbiAgICAvLyBMb29rIGZvciBhIGNvbnRleHQgdmFyaWFibGUgZm9yIHRoZSB0ZW1wbGF0ZS5cbiAgICBjb25zdCBjdHggPSB0aGlzLnNjb3BlLnJlc29sdmUodGhpcy50ZW1wbGF0ZSk7XG5cbiAgICAvLyBBbGxvY2F0ZSBhbiBpZGVudGlmaWVyIGZvciB0aGUgVG1wbEFzdFZhcmlhYmxlLCBhbmQgaW5pdGlhbGl6ZSBpdCB0byBhIHJlYWQgb2YgdGhlIHZhcmlhYmxlXG4gICAgLy8gb24gdGhlIHRlbXBsYXRlIGNvbnRleHQuXG4gICAgY29uc3QgaWQgPSB0aGlzLnRjYi5hbGxvY2F0ZUlkKCk7XG4gICAgY29uc3QgaW5pdGlhbGl6ZXIgPSB0cy5jcmVhdGVQcm9wZXJ0eUFjY2VzcyhcbiAgICAgICAgLyogZXhwcmVzc2lvbiAqLyBjdHgsXG4gICAgICAgIC8qIG5hbWUgKi8gdGhpcy52YXJpYWJsZS52YWx1ZSB8fCAnJGltcGxpY2l0Jyk7XG4gICAgYWRkUGFyc2VTcGFuSW5mbyhpZCwgdGhpcy52YXJpYWJsZS5rZXlTcGFuKTtcblxuICAgIC8vIERlY2xhcmUgdGhlIHZhcmlhYmxlLCBhbmQgcmV0dXJuIGl0cyBpZGVudGlmaWVyLlxuICAgIGxldCB2YXJpYWJsZTogdHMuVmFyaWFibGVTdGF0ZW1lbnQ7XG4gICAgaWYgKHRoaXMudmFyaWFibGUudmFsdWVTcGFuICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGFkZFBhcnNlU3BhbkluZm8oaW5pdGlhbGl6ZXIsIHRoaXMudmFyaWFibGUudmFsdWVTcGFuKTtcbiAgICAgIHZhcmlhYmxlID0gdHNDcmVhdGVWYXJpYWJsZShpZCwgd3JhcEZvclR5cGVDaGVja2VyKGluaXRpYWxpemVyKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhcmlhYmxlID0gdHNDcmVhdGVWYXJpYWJsZShpZCwgaW5pdGlhbGl6ZXIpO1xuICAgIH1cbiAgICBhZGRQYXJzZVNwYW5JbmZvKHZhcmlhYmxlLmRlY2xhcmF0aW9uTGlzdC5kZWNsYXJhdGlvbnNbMF0sIHRoaXMudmFyaWFibGUuc291cmNlU3Bhbik7XG4gICAgdGhpcy5zY29wZS5hZGRTdGF0ZW1lbnQodmFyaWFibGUpO1xuICAgIHJldHVybiBpZDtcbiAgfVxufVxuXG4vKipcbiAqIEEgYFRjYk9wYCB3aGljaCBnZW5lcmF0ZXMgYSB2YXJpYWJsZSBmb3IgYSBgVG1wbEFzdFRlbXBsYXRlYCdzIGNvbnRleHQuXG4gKlxuICogRXhlY3V0aW5nIHRoaXMgb3BlcmF0aW9uIHJldHVybnMgYSByZWZlcmVuY2UgdG8gdGhlIHRlbXBsYXRlJ3MgY29udGV4dCB2YXJpYWJsZS5cbiAqL1xuY2xhc3MgVGNiVGVtcGxhdGVDb250ZXh0T3AgZXh0ZW5kcyBUY2JPcCB7XG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgdGNiOiBDb250ZXh0LCBwcml2YXRlIHNjb3BlOiBTY29wZSkge1xuICAgIHN1cGVyKCk7XG4gIH1cblxuICAvLyBUaGUgZGVjbGFyYXRpb24gb2YgdGhlIGNvbnRleHQgdmFyaWFibGUgaXMgb25seSBuZWVkZWQgd2hlbiB0aGUgY29udGV4dCBpcyBhY3R1YWxseSByZWZlcmVuY2VkLlxuICBvdmVycmlkZSByZWFkb25seSBvcHRpb25hbCA9IHRydWU7XG5cbiAgb3ZlcnJpZGUgZXhlY3V0ZSgpOiB0cy5JZGVudGlmaWVyIHtcbiAgICAvLyBBbGxvY2F0ZSBhIHRlbXBsYXRlIGN0eCB2YXJpYWJsZSBhbmQgZGVjbGFyZSBpdCB3aXRoIGFuICdhbnknIHR5cGUuIFRoZSB0eXBlIG9mIHRoaXMgdmFyaWFibGVcbiAgICAvLyBtYXkgYmUgbmFycm93ZWQgYXMgYSByZXN1bHQgb2YgdGVtcGxhdGUgZ3VhcmQgY29uZGl0aW9ucy5cbiAgICBjb25zdCBjdHggPSB0aGlzLnRjYi5hbGxvY2F0ZUlkKCk7XG4gICAgY29uc3QgdHlwZSA9IHRzLmNyZWF0ZUtleXdvcmRUeXBlTm9kZSh0cy5TeW50YXhLaW5kLkFueUtleXdvcmQpO1xuICAgIHRoaXMuc2NvcGUuYWRkU3RhdGVtZW50KHRzRGVjbGFyZVZhcmlhYmxlKGN0eCwgdHlwZSkpO1xuICAgIHJldHVybiBjdHg7XG4gIH1cbn1cblxuLyoqXG4gKiBBIGBUY2JPcGAgd2hpY2ggZGVzY2VuZHMgaW50byBhIGBUbXBsQXN0VGVtcGxhdGVgJ3MgY2hpbGRyZW4gYW5kIGdlbmVyYXRlcyB0eXBlLWNoZWNraW5nIGNvZGUgZm9yXG4gKiB0aGVtLlxuICpcbiAqIFRoaXMgb3BlcmF0aW9uIHdyYXBzIHRoZSBjaGlsZHJlbidzIHR5cGUtY2hlY2tpbmcgY29kZSBpbiBhbiBgaWZgIGJsb2NrLCB3aGljaCBtYXkgaW5jbHVkZSBvbmVcbiAqIG9yIG1vcmUgdHlwZSBndWFyZCBjb25kaXRpb25zIHRoYXQgbmFycm93IHR5cGVzIHdpdGhpbiB0aGUgdGVtcGxhdGUgYm9keS5cbiAqL1xuY2xhc3MgVGNiVGVtcGxhdGVCb2R5T3AgZXh0ZW5kcyBUY2JPcCB7XG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgdGNiOiBDb250ZXh0LCBwcml2YXRlIHNjb3BlOiBTY29wZSwgcHJpdmF0ZSB0ZW1wbGF0ZTogVG1wbEFzdFRlbXBsYXRlKSB7XG4gICAgc3VwZXIoKTtcbiAgfVxuXG4gIG92ZXJyaWRlIGdldCBvcHRpb25hbCgpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBvdmVycmlkZSBleGVjdXRlKCk6IG51bGwge1xuICAgIC8vIEFuIGBpZmAgd2lsbCBiZSBjb25zdHJ1Y3RlZCwgd2l0aGluIHdoaWNoIHRoZSB0ZW1wbGF0ZSdzIGNoaWxkcmVuIHdpbGwgYmUgdHlwZSBjaGVja2VkLiBUaGVcbiAgICAvLyBgaWZgIGlzIHVzZWQgZm9yIHR3byByZWFzb25zOiBpdCBjcmVhdGVzIGEgbmV3IHN5bnRhY3RpYyBzY29wZSwgaXNvbGF0aW5nIHZhcmlhYmxlcyBkZWNsYXJlZFxuICAgIC8vIGluIHRoZSB0ZW1wbGF0ZSdzIFRDQiBmcm9tIHRoZSBvdXRlciBjb250ZXh0LCBhbmQgaXQgYWxsb3dzIGFueSBkaXJlY3RpdmVzIG9uIHRoZSB0ZW1wbGF0ZXNcbiAgICAvLyB0byBwZXJmb3JtIHR5cGUgbmFycm93aW5nIG9mIGVpdGhlciBleHByZXNzaW9ucyBvciB0aGUgdGVtcGxhdGUncyBjb250ZXh0LlxuICAgIC8vXG4gICAgLy8gVGhlIGd1YXJkIGlzIHRoZSBgaWZgIGJsb2NrJ3MgY29uZGl0aW9uLiBJdCdzIHVzdWFsbHkgc2V0IHRvIGB0cnVlYCBidXQgZGlyZWN0aXZlcyB0aGF0IGV4aXN0XG4gICAgLy8gb24gdGhlIHRlbXBsYXRlIGNhbiB0cmlnZ2VyIGV4dHJhIGd1YXJkIGV4cHJlc3Npb25zIHRoYXQgc2VydmUgdG8gbmFycm93IHR5cGVzIHdpdGhpbiB0aGVcbiAgICAvLyBgaWZgLiBgZ3VhcmRgIGlzIGNhbGN1bGF0ZWQgYnkgc3RhcnRpbmcgd2l0aCBgdHJ1ZWAgYW5kIGFkZGluZyBvdGhlciBjb25kaXRpb25zIGFzIG5lZWRlZC5cbiAgICAvLyBDb2xsZWN0IHRoZXNlIGludG8gYGd1YXJkc2AgYnkgcHJvY2Vzc2luZyB0aGUgZGlyZWN0aXZlcy5cbiAgICBjb25zdCBkaXJlY3RpdmVHdWFyZHM6IHRzLkV4cHJlc3Npb25bXSA9IFtdO1xuXG4gICAgY29uc3QgZGlyZWN0aXZlcyA9IHRoaXMudGNiLmJvdW5kVGFyZ2V0LmdldERpcmVjdGl2ZXNPZk5vZGUodGhpcy50ZW1wbGF0ZSk7XG4gICAgaWYgKGRpcmVjdGl2ZXMgIT09IG51bGwpIHtcbiAgICAgIGZvciAoY29uc3QgZGlyIG9mIGRpcmVjdGl2ZXMpIHtcbiAgICAgICAgY29uc3QgZGlySW5zdElkID0gdGhpcy5zY29wZS5yZXNvbHZlKHRoaXMudGVtcGxhdGUsIGRpcik7XG4gICAgICAgIGNvbnN0IGRpcklkID1cbiAgICAgICAgICAgIHRoaXMudGNiLmVudi5yZWZlcmVuY2UoZGlyLnJlZiBhcyBSZWZlcmVuY2U8Q2xhc3NEZWNsYXJhdGlvbjx0cy5DbGFzc0RlY2xhcmF0aW9uPj4pO1xuXG4gICAgICAgIC8vIFRoZXJlIGFyZSB0d28ga2luZHMgb2YgZ3VhcmRzLiBUZW1wbGF0ZSBndWFyZHMgKG5nVGVtcGxhdGVHdWFyZHMpIGFsbG93IHR5cGUgbmFycm93aW5nIG9mXG4gICAgICAgIC8vIHRoZSBleHByZXNzaW9uIHBhc3NlZCB0byBhbiBASW5wdXQgb2YgdGhlIGRpcmVjdGl2ZS4gU2NhbiB0aGUgZGlyZWN0aXZlIHRvIHNlZSBpZiBpdCBoYXNcbiAgICAgICAgLy8gYW55IHRlbXBsYXRlIGd1YXJkcywgYW5kIGdlbmVyYXRlIHRoZW0gaWYgbmVlZGVkLlxuICAgICAgICBkaXIubmdUZW1wbGF0ZUd1YXJkcy5mb3JFYWNoKGd1YXJkID0+IHtcbiAgICAgICAgICAvLyBGb3IgZWFjaCB0ZW1wbGF0ZSBndWFyZCBmdW5jdGlvbiBvbiB0aGUgZGlyZWN0aXZlLCBsb29rIGZvciBhIGJpbmRpbmcgdG8gdGhhdCBpbnB1dC5cbiAgICAgICAgICBjb25zdCBib3VuZElucHV0ID0gdGhpcy50ZW1wbGF0ZS5pbnB1dHMuZmluZChpID0+IGkubmFtZSA9PT0gZ3VhcmQuaW5wdXROYW1lKSB8fFxuICAgICAgICAgICAgICB0aGlzLnRlbXBsYXRlLnRlbXBsYXRlQXR0cnMuZmluZChcbiAgICAgICAgICAgICAgICAgIChpOiBUbXBsQXN0VGV4dEF0dHJpYnV0ZXxUbXBsQXN0Qm91bmRBdHRyaWJ1dGUpOiBpIGlzIFRtcGxBc3RCb3VuZEF0dHJpYnV0ZSA9PlxuICAgICAgICAgICAgICAgICAgICAgIGkgaW5zdGFuY2VvZiBUbXBsQXN0Qm91bmRBdHRyaWJ1dGUgJiYgaS5uYW1lID09PSBndWFyZC5pbnB1dE5hbWUpO1xuICAgICAgICAgIGlmIChib3VuZElucHV0ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIC8vIElmIHRoZXJlIGlzIHN1Y2ggYSBiaW5kaW5nLCBnZW5lcmF0ZSBhbiBleHByZXNzaW9uIGZvciBpdC5cbiAgICAgICAgICAgIGNvbnN0IGV4cHIgPSB0Y2JFeHByZXNzaW9uKGJvdW5kSW5wdXQudmFsdWUsIHRoaXMudGNiLCB0aGlzLnNjb3BlKTtcblxuICAgICAgICAgICAgLy8gVGhlIGV4cHJlc3Npb24gaGFzIGFscmVhZHkgYmVlbiBjaGVja2VkIGluIHRoZSB0eXBlIGNvbnN0cnVjdG9yIGludm9jYXRpb24sIHNvXG4gICAgICAgICAgICAvLyBpdCBzaG91bGQgYmUgaWdub3JlZCB3aGVuIHVzZWQgd2l0aGluIGEgdGVtcGxhdGUgZ3VhcmQuXG4gICAgICAgICAgICBtYXJrSWdub3JlRGlhZ25vc3RpY3MoZXhwcik7XG5cbiAgICAgICAgICAgIGlmIChndWFyZC50eXBlID09PSAnYmluZGluZycpIHtcbiAgICAgICAgICAgICAgLy8gVXNlIHRoZSBiaW5kaW5nIGV4cHJlc3Npb24gaXRzZWxmIGFzIGd1YXJkLlxuICAgICAgICAgICAgICBkaXJlY3RpdmVHdWFyZHMucHVzaChleHByKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIC8vIENhbGwgdGhlIGd1YXJkIGZ1bmN0aW9uIG9uIHRoZSBkaXJlY3RpdmUgd2l0aCB0aGUgZGlyZWN0aXZlIGluc3RhbmNlIGFuZCB0aGF0XG4gICAgICAgICAgICAgIC8vIGV4cHJlc3Npb24uXG4gICAgICAgICAgICAgIGNvbnN0IGd1YXJkSW52b2tlID0gdHNDYWxsTWV0aG9kKGRpcklkLCBgbmdUZW1wbGF0ZUd1YXJkXyR7Z3VhcmQuaW5wdXROYW1lfWAsIFtcbiAgICAgICAgICAgICAgICBkaXJJbnN0SWQsXG4gICAgICAgICAgICAgICAgZXhwcixcbiAgICAgICAgICAgICAgXSk7XG4gICAgICAgICAgICAgIGFkZFBhcnNlU3BhbkluZm8oZ3VhcmRJbnZva2UsIGJvdW5kSW5wdXQudmFsdWUuc291cmNlU3Bhbik7XG4gICAgICAgICAgICAgIGRpcmVjdGl2ZUd1YXJkcy5wdXNoKGd1YXJkSW52b2tlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFRoZSBzZWNvbmQga2luZCBvZiBndWFyZCBpcyBhIHRlbXBsYXRlIGNvbnRleHQgZ3VhcmQuIFRoaXMgZ3VhcmQgbmFycm93cyB0aGUgdGVtcGxhdGVcbiAgICAgICAgLy8gcmVuZGVyaW5nIGNvbnRleHQgdmFyaWFibGUgYGN0eGAuXG4gICAgICAgIGlmIChkaXIuaGFzTmdUZW1wbGF0ZUNvbnRleHRHdWFyZCkge1xuICAgICAgICAgIGlmICh0aGlzLnRjYi5lbnYuY29uZmlnLmFwcGx5VGVtcGxhdGVDb250ZXh0R3VhcmRzKSB7XG4gICAgICAgICAgICBjb25zdCBjdHggPSB0aGlzLnNjb3BlLnJlc29sdmUodGhpcy50ZW1wbGF0ZSk7XG4gICAgICAgICAgICBjb25zdCBndWFyZEludm9rZSA9IHRzQ2FsbE1ldGhvZChkaXJJZCwgJ25nVGVtcGxhdGVDb250ZXh0R3VhcmQnLCBbZGlySW5zdElkLCBjdHhdKTtcbiAgICAgICAgICAgIGFkZFBhcnNlU3BhbkluZm8oZ3VhcmRJbnZva2UsIHRoaXMudGVtcGxhdGUuc291cmNlU3Bhbik7XG4gICAgICAgICAgICBkaXJlY3RpdmVHdWFyZHMucHVzaChndWFyZEludm9rZSk7XG4gICAgICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICAgICAgdGhpcy50ZW1wbGF0ZS52YXJpYWJsZXMubGVuZ3RoID4gMCAmJlxuICAgICAgICAgICAgICB0aGlzLnRjYi5lbnYuY29uZmlnLnN1Z2dlc3Rpb25zRm9yU3Vib3B0aW1hbFR5cGVJbmZlcmVuY2UpIHtcbiAgICAgICAgICAgIC8vIFRoZSBjb21waWxlciBjb3VsZCBoYXZlIGluZmVycmVkIGEgYmV0dGVyIHR5cGUgZm9yIHRoZSB2YXJpYWJsZXMgaW4gdGhpcyB0ZW1wbGF0ZSxcbiAgICAgICAgICAgIC8vIGJ1dCB3YXMgcHJldmVudGVkIGZyb20gZG9pbmcgc28gYnkgdGhlIHR5cGUtY2hlY2tpbmcgY29uZmlndXJhdGlvbi4gSXNzdWUgYSB3YXJuaW5nXG4gICAgICAgICAgICAvLyBkaWFnbm9zdGljLlxuICAgICAgICAgICAgdGhpcy50Y2Iub29iUmVjb3JkZXIuc3Vib3B0aW1hbFR5cGVJbmZlcmVuY2UodGhpcy50Y2IuaWQsIHRoaXMudGVtcGxhdGUudmFyaWFibGVzKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBCeSBkZWZhdWx0IHRoZSBndWFyZCBpcyBzaW1wbHkgYHRydWVgLlxuICAgIGxldCBndWFyZDogdHMuRXhwcmVzc2lvbnxudWxsID0gbnVsbDtcblxuICAgIC8vIElmIHRoZXJlIGFyZSBhbnkgZ3VhcmRzIGZyb20gZGlyZWN0aXZlcywgdXNlIHRoZW0gaW5zdGVhZC5cbiAgICBpZiAoZGlyZWN0aXZlR3VhcmRzLmxlbmd0aCA+IDApIHtcbiAgICAgIC8vIFBvcCB0aGUgZmlyc3QgdmFsdWUgYW5kIHVzZSBpdCBhcyB0aGUgaW5pdGlhbGl6ZXIgdG8gcmVkdWNlKCkuIFRoaXMgd2F5LCBhIHNpbmdsZSBndWFyZFxuICAgICAgLy8gd2lsbCBiZSB1c2VkIG9uIGl0cyBvd24sIGJ1dCB0d28gb3IgbW9yZSB3aWxsIGJlIGNvbWJpbmVkIGludG8gYmluYXJ5IEFORCBleHByZXNzaW9ucy5cbiAgICAgIGd1YXJkID0gZGlyZWN0aXZlR3VhcmRzLnJlZHVjZShcbiAgICAgICAgICAoZXhwciwgZGlyR3VhcmQpID0+XG4gICAgICAgICAgICAgIHRzLmNyZWF0ZUJpbmFyeShleHByLCB0cy5TeW50YXhLaW5kLkFtcGVyc2FuZEFtcGVyc2FuZFRva2VuLCBkaXJHdWFyZCksXG4gICAgICAgICAgZGlyZWN0aXZlR3VhcmRzLnBvcCgpISk7XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIGEgbmV3IFNjb3BlIGZvciB0aGUgdGVtcGxhdGUuIFRoaXMgY29uc3RydWN0cyB0aGUgbGlzdCBvZiBvcGVyYXRpb25zIGZvciB0aGUgdGVtcGxhdGVcbiAgICAvLyBjaGlsZHJlbiwgYXMgd2VsbCBhcyB0cmFja3MgYmluZGluZ3Mgd2l0aGluIHRoZSB0ZW1wbGF0ZS5cbiAgICBjb25zdCB0bXBsU2NvcGUgPSBTY29wZS5mb3JOb2Rlcyh0aGlzLnRjYiwgdGhpcy5zY29wZSwgdGhpcy50ZW1wbGF0ZSwgZ3VhcmQpO1xuXG4gICAgLy8gUmVuZGVyIHRoZSB0ZW1wbGF0ZSdzIGBTY29wZWAgaW50byBpdHMgc3RhdGVtZW50cy5cbiAgICBjb25zdCBzdGF0ZW1lbnRzID0gdG1wbFNjb3BlLnJlbmRlcigpO1xuICAgIGlmIChzdGF0ZW1lbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgLy8gQXMgYW4gb3B0aW1pemF0aW9uLCBkb24ndCBnZW5lcmF0ZSB0aGUgc2NvcGUncyBibG9jayBpZiBpdCBoYXMgbm8gc3RhdGVtZW50cy4gVGhpcyBpc1xuICAgICAgLy8gYmVuZWZpY2lhbCBmb3IgdGVtcGxhdGVzIHRoYXQgY29udGFpbiBmb3IgZXhhbXBsZSBgPHNwYW4gKm5nSWY9XCJmaXJzdFwiPjwvc3Bhbj5gLCBpbiB3aGljaFxuICAgICAgLy8gY2FzZSB0aGVyZSdzIG5vIG5lZWQgdG8gcmVuZGVyIHRoZSBgTmdJZmAgZ3VhcmQgZXhwcmVzc2lvbi4gVGhpcyBzZWVtcyBsaWtlIGEgbWlub3JcbiAgICAgIC8vIGltcHJvdmVtZW50LCBob3dldmVyIGl0IHJlZHVjZXMgdGhlIG51bWJlciBvZiBmbG93LW5vZGUgYW50ZWNlZGVudHMgdGhhdCBUeXBlU2NyaXB0IG5lZWRzXG4gICAgICAvLyB0byBrZWVwIGludG8gYWNjb3VudCBmb3Igc3VjaCBjYXNlcywgcmVzdWx0aW5nIGluIGFuIG92ZXJhbGwgcmVkdWN0aW9uIG9mXG4gICAgICAvLyB0eXBlLWNoZWNraW5nIHRpbWUuXG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBsZXQgdG1wbEJsb2NrOiB0cy5TdGF0ZW1lbnQgPSB0cy5jcmVhdGVCbG9jayhzdGF0ZW1lbnRzKTtcbiAgICBpZiAoZ3VhcmQgIT09IG51bGwpIHtcbiAgICAgIC8vIFRoZSBzY29wZSBoYXMgYSBndWFyZCB0aGF0IG5lZWRzIHRvIGJlIGFwcGxpZWQsIHNvIHdyYXAgdGhlIHRlbXBsYXRlIGJsb2NrIGludG8gYW4gYGlmYFxuICAgICAgLy8gc3RhdGVtZW50IGNvbnRhaW5pbmcgdGhlIGd1YXJkIGV4cHJlc3Npb24uXG4gICAgICB0bXBsQmxvY2sgPSB0cy5jcmVhdGVJZigvKiBleHByZXNzaW9uICovIGd1YXJkLCAvKiB0aGVuU3RhdGVtZW50ICovIHRtcGxCbG9jayk7XG4gICAgfVxuICAgIHRoaXMuc2NvcGUuYWRkU3RhdGVtZW50KHRtcGxCbG9jayk7XG5cbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufVxuXG4vKipcbiAqIEEgYFRjYk9wYCB3aGljaCByZW5kZXJzIGEgdGV4dCBiaW5kaW5nIChpbnRlcnBvbGF0aW9uKSBpbnRvIHRoZSBUQ0IuXG4gKlxuICogRXhlY3V0aW5nIHRoaXMgb3BlcmF0aW9uIHJldHVybnMgbm90aGluZy5cbiAqL1xuY2xhc3MgVGNiVGV4dEludGVycG9sYXRpb25PcCBleHRlbmRzIFRjYk9wIHtcbiAgY29uc3RydWN0b3IocHJpdmF0ZSB0Y2I6IENvbnRleHQsIHByaXZhdGUgc2NvcGU6IFNjb3BlLCBwcml2YXRlIGJpbmRpbmc6IFRtcGxBc3RCb3VuZFRleHQpIHtcbiAgICBzdXBlcigpO1xuICB9XG5cbiAgb3ZlcnJpZGUgZ2V0IG9wdGlvbmFsKCkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIG92ZXJyaWRlIGV4ZWN1dGUoKTogbnVsbCB7XG4gICAgY29uc3QgZXhwciA9IHRjYkV4cHJlc3Npb24odGhpcy5iaW5kaW5nLnZhbHVlLCB0aGlzLnRjYiwgdGhpcy5zY29wZSk7XG4gICAgdGhpcy5zY29wZS5hZGRTdGF0ZW1lbnQodHMuY3JlYXRlRXhwcmVzc2lvblN0YXRlbWVudChleHByKSk7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuLyoqXG4gKiBBIGBUY2JPcGAgd2hpY2ggY29uc3RydWN0cyBhbiBpbnN0YW5jZSBvZiBhIGRpcmVjdGl2ZS4gRm9yIGdlbmVyaWMgZGlyZWN0aXZlcywgZ2VuZXJpY1xuICogcGFyYW1ldGVycyBhcmUgc2V0IHRvIGBhbnlgIHR5cGUuXG4gKi9cbmFic3RyYWN0IGNsYXNzIFRjYkRpcmVjdGl2ZVR5cGVPcEJhc2UgZXh0ZW5kcyBUY2JPcCB7XG4gIGNvbnN0cnVjdG9yKFxuICAgICAgcHJvdGVjdGVkIHRjYjogQ29udGV4dCwgcHJvdGVjdGVkIHNjb3BlOiBTY29wZSxcbiAgICAgIHByb3RlY3RlZCBub2RlOiBUbXBsQXN0VGVtcGxhdGV8VG1wbEFzdEVsZW1lbnQsIHByb3RlY3RlZCBkaXI6IFR5cGVDaGVja2FibGVEaXJlY3RpdmVNZXRhKSB7XG4gICAgc3VwZXIoKTtcbiAgfVxuXG4gIG92ZXJyaWRlIGdldCBvcHRpb25hbCgpIHtcbiAgICAvLyBUaGUgc3RhdGVtZW50IGdlbmVyYXRlZCBieSB0aGlzIG9wZXJhdGlvbiBpcyBvbmx5IHVzZWQgdG8gZGVjbGFyZSB0aGUgZGlyZWN0aXZlJ3MgdHlwZSBhbmRcbiAgICAvLyB3b24ndCByZXBvcnQgZGlhZ25vc3RpY3MgYnkgaXRzZWxmLCBzbyB0aGUgb3BlcmF0aW9uIGlzIG1hcmtlZCBhcyBvcHRpb25hbCB0byBhdm9pZFxuICAgIC8vIGdlbmVyYXRpbmcgZGVjbGFyYXRpb25zIGZvciBkaXJlY3RpdmVzIHRoYXQgZG9uJ3QgaGF2ZSBhbnkgaW5wdXRzL291dHB1dHMuXG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBvdmVycmlkZSBleGVjdXRlKCk6IHRzLklkZW50aWZpZXIge1xuICAgIGNvbnN0IGRpclJlZiA9IHRoaXMuZGlyLnJlZiBhcyBSZWZlcmVuY2U8Q2xhc3NEZWNsYXJhdGlvbjx0cy5DbGFzc0RlY2xhcmF0aW9uPj47XG5cbiAgICBjb25zdCByYXdUeXBlID0gdGhpcy50Y2IuZW52LnJlZmVyZW5jZVR5cGUodGhpcy5kaXIucmVmKTtcblxuICAgIGxldCB0eXBlOiB0cy5UeXBlTm9kZTtcbiAgICBpZiAodGhpcy5kaXIuaXNHZW5lcmljID09PSBmYWxzZSB8fCBkaXJSZWYubm9kZS50eXBlUGFyYW1ldGVycyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICB0eXBlID0gcmF3VHlwZTtcbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKCF0cy5pc1R5cGVSZWZlcmVuY2VOb2RlKHJhd1R5cGUpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICAgIGBFeHBlY3RlZCBUeXBlUmVmZXJlbmNlTm9kZSB3aGVuIHJlZmVyZW5jaW5nIHRoZSB0eXBlIGZvciAke3RoaXMuZGlyLnJlZi5kZWJ1Z05hbWV9YCk7XG4gICAgICB9XG4gICAgICBjb25zdCB0eXBlQXJndW1lbnRzID0gZGlyUmVmLm5vZGUudHlwZVBhcmFtZXRlcnMubWFwKFxuICAgICAgICAgICgpID0+IHRzLmZhY3RvcnkuY3JlYXRlS2V5d29yZFR5cGVOb2RlKHRzLlN5bnRheEtpbmQuQW55S2V5d29yZCkpO1xuICAgICAgdHlwZSA9IHRzLmZhY3RvcnkuY3JlYXRlVHlwZVJlZmVyZW5jZU5vZGUocmF3VHlwZS50eXBlTmFtZSwgdHlwZUFyZ3VtZW50cyk7XG4gICAgfVxuXG4gICAgY29uc3QgaWQgPSB0aGlzLnRjYi5hbGxvY2F0ZUlkKCk7XG4gICAgYWRkRXhwcmVzc2lvbklkZW50aWZpZXIodHlwZSwgRXhwcmVzc2lvbklkZW50aWZpZXIuRElSRUNUSVZFKTtcbiAgICBhZGRQYXJzZVNwYW5JbmZvKHR5cGUsIHRoaXMubm9kZS5zdGFydFNvdXJjZVNwYW4gfHwgdGhpcy5ub2RlLnNvdXJjZVNwYW4pO1xuICAgIHRoaXMuc2NvcGUuYWRkU3RhdGVtZW50KHRzRGVjbGFyZVZhcmlhYmxlKGlkLCB0eXBlKSk7XG4gICAgcmV0dXJuIGlkO1xuICB9XG59XG5cbi8qKlxuICogQSBgVGNiT3BgIHdoaWNoIGNvbnN0cnVjdHMgYW4gaW5zdGFuY2Ugb2YgYSBub24tZ2VuZXJpYyBkaXJlY3RpdmUgX3dpdGhvdXRfIHNldHRpbmcgYW55IG9mIGl0c1xuICogaW5wdXRzLiBJbnB1dHMgYXJlIGxhdGVyIHNldCBpbiB0aGUgYFRjYkRpcmVjdGl2ZUlucHV0c09wYC4gVHlwZSBjaGVja2luZyB3YXMgZm91bmQgdG8gYmVcbiAqIGZhc3RlciB3aGVuIGRvbmUgaW4gdGhpcyB3YXkgYXMgb3Bwb3NlZCB0byBgVGNiRGlyZWN0aXZlQ3Rvck9wYCB3aGljaCBpcyBvbmx5IG5lY2Vzc2FyeSB3aGVuIHRoZVxuICogZGlyZWN0aXZlIGlzIGdlbmVyaWMuXG4gKlxuICogRXhlY3V0aW5nIHRoaXMgb3BlcmF0aW9uIHJldHVybnMgYSByZWZlcmVuY2UgdG8gdGhlIGRpcmVjdGl2ZSBpbnN0YW5jZSB2YXJpYWJsZSB3aXRoIGl0cyBpbmZlcnJlZFxuICogdHlwZS5cbiAqL1xuY2xhc3MgVGNiTm9uR2VuZXJpY0RpcmVjdGl2ZVR5cGVPcCBleHRlbmRzIFRjYkRpcmVjdGl2ZVR5cGVPcEJhc2Uge1xuICAvKipcbiAgICogQ3JlYXRlcyBhIHZhcmlhYmxlIGRlY2xhcmF0aW9uIGZvciB0aGlzIG9wJ3MgZGlyZWN0aXZlIG9mIHRoZSBhcmd1bWVudCB0eXBlLiBSZXR1cm5zIHRoZSBpZCBvZlxuICAgKiB0aGUgbmV3bHkgY3JlYXRlZCB2YXJpYWJsZS5cbiAgICovXG4gIG92ZXJyaWRlIGV4ZWN1dGUoKTogdHMuSWRlbnRpZmllciB7XG4gICAgY29uc3QgZGlyUmVmID0gdGhpcy5kaXIucmVmIGFzIFJlZmVyZW5jZTxDbGFzc0RlY2xhcmF0aW9uPHRzLkNsYXNzRGVjbGFyYXRpb24+PjtcbiAgICBpZiAodGhpcy5kaXIuaXNHZW5lcmljKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYEFzc2VydGlvbiBFcnJvcjogZXhwZWN0ZWQgJHtkaXJSZWYuZGVidWdOYW1lfSBub3QgdG8gYmUgZ2VuZXJpYy5gKTtcbiAgICB9XG4gICAgcmV0dXJuIHN1cGVyLmV4ZWN1dGUoKTtcbiAgfVxufVxuXG4vKipcbiAqIEEgYFRjYk9wYCB3aGljaCBjb25zdHJ1Y3RzIGFuIGluc3RhbmNlIG9mIGEgZ2VuZXJpYyBkaXJlY3RpdmUgd2l0aCBpdHMgZ2VuZXJpYyBwYXJhbWV0ZXJzIHNldFxuICogdG8gYGFueWAgdHlwZS4gVGhpcyBvcCBpcyBsaWtlIGBUY2JEaXJlY3RpdmVUeXBlT3BgLCBleGNlcHQgdGhhdCBnZW5lcmljIHBhcmFtZXRlcnMgYXJlIHNldCB0b1xuICogYGFueWAgdHlwZS4gVGhpcyBpcyB1c2VkIGZvciBzaXR1YXRpb25zIHdoZXJlIHdlIHdhbnQgdG8gYXZvaWQgaW5saW5pbmcuXG4gKlxuICogRXhlY3V0aW5nIHRoaXMgb3BlcmF0aW9uIHJldHVybnMgYSByZWZlcmVuY2UgdG8gdGhlIGRpcmVjdGl2ZSBpbnN0YW5jZSB2YXJpYWJsZSB3aXRoIGl0cyBnZW5lcmljXG4gKiB0eXBlIHBhcmFtZXRlcnMgc2V0IHRvIGBhbnlgLlxuICovXG5jbGFzcyBUY2JHZW5lcmljRGlyZWN0aXZlVHlwZVdpdGhBbnlQYXJhbXNPcCBleHRlbmRzIFRjYkRpcmVjdGl2ZVR5cGVPcEJhc2Uge1xuICBvdmVycmlkZSBleGVjdXRlKCk6IHRzLklkZW50aWZpZXIge1xuICAgIGNvbnN0IGRpclJlZiA9IHRoaXMuZGlyLnJlZiBhcyBSZWZlcmVuY2U8Q2xhc3NEZWNsYXJhdGlvbjx0cy5DbGFzc0RlY2xhcmF0aW9uPj47XG4gICAgaWYgKGRpclJlZi5ub2RlLnR5cGVQYXJhbWV0ZXJzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgQXNzZXJ0aW9uIEVycm9yOiBleHBlY3RlZCB0eXBlUGFyYW1ldGVycyB3aGVuIGNyZWF0aW5nIGEgZGVjbGFyYXRpb24gZm9yICR7XG4gICAgICAgICAgZGlyUmVmLmRlYnVnTmFtZX1gKTtcbiAgICB9XG5cbiAgICByZXR1cm4gc3VwZXIuZXhlY3V0ZSgpO1xuICB9XG59XG5cbi8qKlxuICogQSBgVGNiT3BgIHdoaWNoIGNyZWF0ZXMgYSB2YXJpYWJsZSBmb3IgYSBsb2NhbCByZWYgaW4gYSB0ZW1wbGF0ZS5cbiAqIFRoZSBpbml0aWFsaXplciBmb3IgdGhlIHZhcmlhYmxlIGlzIHRoZSB2YXJpYWJsZSBleHByZXNzaW9uIGZvciB0aGUgZGlyZWN0aXZlLCB0ZW1wbGF0ZSwgb3JcbiAqIGVsZW1lbnQgdGhlIHJlZiByZWZlcnMgdG8uIFdoZW4gdGhlIHJlZmVyZW5jZSBpcyB1c2VkIGluIHRoZSB0ZW1wbGF0ZSwgdGhvc2UgVENCIHN0YXRlbWVudHMgd2lsbFxuICogYWNjZXNzIHRoaXMgdmFyaWFibGUgYXMgd2VsbC4gRm9yIGV4YW1wbGU6XG4gKiBgYGBcbiAqIHZhciBfdDEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAqIHZhciBfdDIgPSBfdDE7XG4gKiBfdDIudmFsdWVcbiAqIGBgYFxuICogVGhpcyBvcGVyYXRpb24gc3VwcG9ydHMgbW9yZSBmbHVlbnQgbG9va3VwcyBmb3IgdGhlIGBUZW1wbGF0ZVR5cGVDaGVja2VyYCB3aGVuIGdldHRpbmcgYSBzeW1ib2xcbiAqIGZvciBhIHJlZmVyZW5jZS4gSW4gbW9zdCBjYXNlcywgdGhpcyBpc24ndCBlc3NlbnRpYWw7IHRoYXQgaXMsIHRoZSBpbmZvcm1hdGlvbiBmb3IgdGhlIHN5bWJvbFxuICogY291bGQgYmUgZ2F0aGVyZWQgd2l0aG91dCB0aGlzIG9wZXJhdGlvbiB1c2luZyB0aGUgYEJvdW5kVGFyZ2V0YC4gSG93ZXZlciwgZm9yIHRoZSBjYXNlIG9mXG4gKiBuZy10ZW1wbGF0ZSByZWZlcmVuY2VzLCB3ZSB3aWxsIG5lZWQgdGhpcyByZWZlcmVuY2UgdmFyaWFibGUgdG8gbm90IG9ubHkgcHJvdmlkZSBhIGxvY2F0aW9uIGluXG4gKiB0aGUgc2hpbSBmaWxlLCBidXQgYWxzbyB0byBuYXJyb3cgdGhlIHZhcmlhYmxlIHRvIHRoZSBjb3JyZWN0IGBUZW1wbGF0ZVJlZjxUPmAgdHlwZSByYXRoZXIgdGhhblxuICogYFRlbXBsYXRlUmVmPGFueT5gICh0aGlzIHdvcmsgaXMgc3RpbGwgVE9ETykuXG4gKlxuICogRXhlY3V0aW5nIHRoaXMgb3BlcmF0aW9uIHJldHVybnMgYSByZWZlcmVuY2UgdG8gdGhlIGRpcmVjdGl2ZSBpbnN0YW5jZSB2YXJpYWJsZSB3aXRoIGl0cyBpbmZlcnJlZFxuICogdHlwZS5cbiAqL1xuY2xhc3MgVGNiUmVmZXJlbmNlT3AgZXh0ZW5kcyBUY2JPcCB7XG4gIGNvbnN0cnVjdG9yKFxuICAgICAgcHJpdmF0ZSByZWFkb25seSB0Y2I6IENvbnRleHQsIHByaXZhdGUgcmVhZG9ubHkgc2NvcGU6IFNjb3BlLFxuICAgICAgcHJpdmF0ZSByZWFkb25seSBub2RlOiBUbXBsQXN0UmVmZXJlbmNlLFxuICAgICAgcHJpdmF0ZSByZWFkb25seSBob3N0OiBUbXBsQXN0RWxlbWVudHxUbXBsQXN0VGVtcGxhdGUsXG4gICAgICBwcml2YXRlIHJlYWRvbmx5IHRhcmdldDogVHlwZUNoZWNrYWJsZURpcmVjdGl2ZU1ldGF8VG1wbEFzdFRlbXBsYXRlfFRtcGxBc3RFbGVtZW50KSB7XG4gICAgc3VwZXIoKTtcbiAgfVxuXG4gIC8vIFRoZSBzdGF0ZW1lbnQgZ2VuZXJhdGVkIGJ5IHRoaXMgb3BlcmF0aW9uIGlzIG9ubHkgdXNlZCB0byBmb3IgdGhlIFR5cGUgQ2hlY2tlclxuICAvLyBzbyBpdCBjYW4gbWFwIGEgcmVmZXJlbmNlIHZhcmlhYmxlIGluIHRoZSB0ZW1wbGF0ZSBkaXJlY3RseSB0byBhIG5vZGUgaW4gdGhlIFRDQi5cbiAgb3ZlcnJpZGUgcmVhZG9ubHkgb3B0aW9uYWwgPSB0cnVlO1xuXG4gIG92ZXJyaWRlIGV4ZWN1dGUoKTogdHMuSWRlbnRpZmllciB7XG4gICAgY29uc3QgaWQgPSB0aGlzLnRjYi5hbGxvY2F0ZUlkKCk7XG4gICAgbGV0IGluaXRpYWxpemVyID1cbiAgICAgICAgdGhpcy50YXJnZXQgaW5zdGFuY2VvZiBUbXBsQXN0VGVtcGxhdGUgfHwgdGhpcy50YXJnZXQgaW5zdGFuY2VvZiBUbXBsQXN0RWxlbWVudCA/XG4gICAgICAgIHRoaXMuc2NvcGUucmVzb2x2ZSh0aGlzLnRhcmdldCkgOlxuICAgICAgICB0aGlzLnNjb3BlLnJlc29sdmUodGhpcy5ob3N0LCB0aGlzLnRhcmdldCk7XG5cbiAgICAvLyBUaGUgcmVmZXJlbmNlIGlzIGVpdGhlciB0byBhbiBlbGVtZW50LCBhbiA8bmctdGVtcGxhdGU+IG5vZGUsIG9yIHRvIGEgZGlyZWN0aXZlIG9uIGFuXG4gICAgLy8gZWxlbWVudCBvciB0ZW1wbGF0ZS5cbiAgICBpZiAoKHRoaXMudGFyZ2V0IGluc3RhbmNlb2YgVG1wbEFzdEVsZW1lbnQgJiYgIXRoaXMudGNiLmVudi5jb25maWcuY2hlY2tUeXBlT2ZEb21SZWZlcmVuY2VzKSB8fFxuICAgICAgICAhdGhpcy50Y2IuZW52LmNvbmZpZy5jaGVja1R5cGVPZk5vbkRvbVJlZmVyZW5jZXMpIHtcbiAgICAgIC8vIFJlZmVyZW5jZXMgdG8gRE9NIG5vZGVzIGFyZSBwaW5uZWQgdG8gJ2FueScgd2hlbiBgY2hlY2tUeXBlT2ZEb21SZWZlcmVuY2VzYCBpcyBgZmFsc2VgLlxuICAgICAgLy8gUmVmZXJlbmNlcyB0byBgVGVtcGxhdGVSZWZgcyBhbmQgZGlyZWN0aXZlcyBhcmUgcGlubmVkIHRvICdhbnknIHdoZW5cbiAgICAgIC8vIGBjaGVja1R5cGVPZk5vbkRvbVJlZmVyZW5jZXNgIGlzIGBmYWxzZWAuXG4gICAgICBpbml0aWFsaXplciA9XG4gICAgICAgICAgdHMuY3JlYXRlQXNFeHByZXNzaW9uKGluaXRpYWxpemVyLCB0cy5jcmVhdGVLZXl3b3JkVHlwZU5vZGUodHMuU3ludGF4S2luZC5BbnlLZXl3b3JkKSk7XG4gICAgfSBlbHNlIGlmICh0aGlzLnRhcmdldCBpbnN0YW5jZW9mIFRtcGxBc3RUZW1wbGF0ZSkge1xuICAgICAgLy8gRGlyZWN0IHJlZmVyZW5jZXMgdG8gYW4gPG5nLXRlbXBsYXRlPiBub2RlIHNpbXBseSByZXF1aXJlIGEgdmFsdWUgb2YgdHlwZVxuICAgICAgLy8gYFRlbXBsYXRlUmVmPGFueT5gLiBUbyBnZXQgdGhpcywgYW4gZXhwcmVzc2lvbiBvZiB0aGUgZm9ybVxuICAgICAgLy8gYChfdDEgYXMgYW55IGFzIFRlbXBsYXRlUmVmPGFueT4pYCBpcyBjb25zdHJ1Y3RlZC5cbiAgICAgIGluaXRpYWxpemVyID1cbiAgICAgICAgICB0cy5jcmVhdGVBc0V4cHJlc3Npb24oaW5pdGlhbGl6ZXIsIHRzLmNyZWF0ZUtleXdvcmRUeXBlTm9kZSh0cy5TeW50YXhLaW5kLkFueUtleXdvcmQpKTtcbiAgICAgIGluaXRpYWxpemVyID0gdHMuY3JlYXRlQXNFeHByZXNzaW9uKFxuICAgICAgICAgIGluaXRpYWxpemVyLFxuICAgICAgICAgIHRoaXMudGNiLmVudi5yZWZlcmVuY2VFeHRlcm5hbFR5cGUoJ0Bhbmd1bGFyL2NvcmUnLCAnVGVtcGxhdGVSZWYnLCBbRFlOQU1JQ19UWVBFXSkpO1xuICAgICAgaW5pdGlhbGl6ZXIgPSB0cy5jcmVhdGVQYXJlbihpbml0aWFsaXplcik7XG4gICAgfVxuICAgIGFkZFBhcnNlU3BhbkluZm8oaW5pdGlhbGl6ZXIsIHRoaXMubm9kZS5zb3VyY2VTcGFuKTtcbiAgICBhZGRQYXJzZVNwYW5JbmZvKGlkLCB0aGlzLm5vZGUua2V5U3Bhbik7XG5cbiAgICB0aGlzLnNjb3BlLmFkZFN0YXRlbWVudCh0c0NyZWF0ZVZhcmlhYmxlKGlkLCBpbml0aWFsaXplcikpO1xuICAgIHJldHVybiBpZDtcbiAgfVxufVxuXG4vKipcbiAqIEEgYFRjYk9wYCB3aGljaCBpcyB1c2VkIHdoZW4gdGhlIHRhcmdldCBvZiBhIHJlZmVyZW5jZSBpcyBtaXNzaW5nLiBUaGlzIG9wZXJhdGlvbiBnZW5lcmF0ZXMgYVxuICogdmFyaWFibGUgb2YgdHlwZSBhbnkgZm9yIHVzYWdlcyBvZiB0aGUgaW52YWxpZCByZWZlcmVuY2UgdG8gcmVzb2x2ZSB0by4gVGhlIGludmFsaWQgcmVmZXJlbmNlXG4gKiBpdHNlbGYgaXMgcmVjb3JkZWQgb3V0LW9mLWJhbmQuXG4gKi9cbmNsYXNzIFRjYkludmFsaWRSZWZlcmVuY2VPcCBleHRlbmRzIFRjYk9wIHtcbiAgY29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSB0Y2I6IENvbnRleHQsIHByaXZhdGUgcmVhZG9ubHkgc2NvcGU6IFNjb3BlKSB7XG4gICAgc3VwZXIoKTtcbiAgfVxuXG4gIC8vIFRoZSBkZWNsYXJhdGlvbiBvZiBhIG1pc3NpbmcgcmVmZXJlbmNlIGlzIG9ubHkgbmVlZGVkIHdoZW4gdGhlIHJlZmVyZW5jZSBpcyByZXNvbHZlZC5cbiAgb3ZlcnJpZGUgcmVhZG9ubHkgb3B0aW9uYWwgPSB0cnVlO1xuXG4gIG92ZXJyaWRlIGV4ZWN1dGUoKTogdHMuSWRlbnRpZmllciB7XG4gICAgY29uc3QgaWQgPSB0aGlzLnRjYi5hbGxvY2F0ZUlkKCk7XG4gICAgdGhpcy5zY29wZS5hZGRTdGF0ZW1lbnQodHNDcmVhdGVWYXJpYWJsZShpZCwgTlVMTF9BU19BTlkpKTtcbiAgICByZXR1cm4gaWQ7XG4gIH1cbn1cblxuLyoqXG4gKiBBIGBUY2JPcGAgd2hpY2ggY29uc3RydWN0cyBhbiBpbnN0YW5jZSBvZiBhIGRpcmVjdGl2ZSB3aXRoIHR5cGVzIGluZmVycmVkIGZyb20gaXRzIGlucHV0cy4gVGhlXG4gKiBpbnB1dHMgdGhlbXNlbHZlcyBhcmUgbm90IGNoZWNrZWQgaGVyZTsgY2hlY2tpbmcgb2YgaW5wdXRzIGlzIGFjaGlldmVkIGluIGBUY2JEaXJlY3RpdmVJbnB1dHNPcGAuXG4gKiBBbnkgZXJyb3JzIHJlcG9ydGVkIGluIHRoaXMgc3RhdGVtZW50IGFyZSBpZ25vcmVkLCBhcyB0aGUgdHlwZSBjb25zdHJ1Y3RvciBjYWxsIGlzIG9ubHkgcHJlc2VudFxuICogZm9yIHR5cGUtaW5mZXJlbmNlLlxuICpcbiAqIFdoZW4gYSBEaXJlY3RpdmUgaXMgZ2VuZXJpYywgaXQgaXMgcmVxdWlyZWQgdGhhdCB0aGUgVENCIGdlbmVyYXRlcyB0aGUgaW5zdGFuY2UgdXNpbmcgdGhpcyBtZXRob2RcbiAqIGluIG9yZGVyIHRvIGluZmVyIHRoZSB0eXBlIGluZm9ybWF0aW9uIGNvcnJlY3RseS5cbiAqXG4gKiBFeGVjdXRpbmcgdGhpcyBvcGVyYXRpb24gcmV0dXJucyBhIHJlZmVyZW5jZSB0byB0aGUgZGlyZWN0aXZlIGluc3RhbmNlIHZhcmlhYmxlIHdpdGggaXRzIGluZmVycmVkXG4gKiB0eXBlLlxuICovXG5jbGFzcyBUY2JEaXJlY3RpdmVDdG9yT3AgZXh0ZW5kcyBUY2JPcCB7XG4gIGNvbnN0cnVjdG9yKFxuICAgICAgcHJpdmF0ZSB0Y2I6IENvbnRleHQsIHByaXZhdGUgc2NvcGU6IFNjb3BlLCBwcml2YXRlIG5vZGU6IFRtcGxBc3RUZW1wbGF0ZXxUbXBsQXN0RWxlbWVudCxcbiAgICAgIHByaXZhdGUgZGlyOiBUeXBlQ2hlY2thYmxlRGlyZWN0aXZlTWV0YSkge1xuICAgIHN1cGVyKCk7XG4gIH1cblxuICBvdmVycmlkZSBnZXQgb3B0aW9uYWwoKSB7XG4gICAgLy8gVGhlIHN0YXRlbWVudCBnZW5lcmF0ZWQgYnkgdGhpcyBvcGVyYXRpb24gaXMgb25seSB1c2VkIHRvIGluZmVyIHRoZSBkaXJlY3RpdmUncyB0eXBlIGFuZFxuICAgIC8vIHdvbid0IHJlcG9ydCBkaWFnbm9zdGljcyBieSBpdHNlbGYsIHNvIHRoZSBvcGVyYXRpb24gaXMgbWFya2VkIGFzIG9wdGlvbmFsLlxuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgb3ZlcnJpZGUgZXhlY3V0ZSgpOiB0cy5JZGVudGlmaWVyIHtcbiAgICBjb25zdCBpZCA9IHRoaXMudGNiLmFsbG9jYXRlSWQoKTtcbiAgICBhZGRFeHByZXNzaW9uSWRlbnRpZmllcihpZCwgRXhwcmVzc2lvbklkZW50aWZpZXIuRElSRUNUSVZFKTtcbiAgICBhZGRQYXJzZVNwYW5JbmZvKGlkLCB0aGlzLm5vZGUuc3RhcnRTb3VyY2VTcGFuIHx8IHRoaXMubm9kZS5zb3VyY2VTcGFuKTtcblxuICAgIGNvbnN0IGdlbmVyaWNJbnB1dHMgPSBuZXcgTWFwPHN0cmluZywgVGNiRGlyZWN0aXZlSW5wdXQ+KCk7XG5cbiAgICBjb25zdCBpbnB1dHMgPSBnZXRCb3VuZElucHV0cyh0aGlzLmRpciwgdGhpcy5ub2RlLCB0aGlzLnRjYik7XG4gICAgZm9yIChjb25zdCBpbnB1dCBvZiBpbnB1dHMpIHtcbiAgICAgIC8vIFNraXAgdGV4dCBhdHRyaWJ1dGVzIGlmIGNvbmZpZ3VyZWQgdG8gZG8gc28uXG4gICAgICBpZiAoIXRoaXMudGNiLmVudi5jb25maWcuY2hlY2tUeXBlT2ZBdHRyaWJ1dGVzICYmXG4gICAgICAgICAgaW5wdXQuYXR0cmlidXRlIGluc3RhbmNlb2YgVG1wbEFzdFRleHRBdHRyaWJ1dGUpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBvZiBpbnB1dC5maWVsZE5hbWVzKSB7XG4gICAgICAgIC8vIFNraXAgdGhlIGZpZWxkIGlmIGFuIGF0dHJpYnV0ZSBoYXMgYWxyZWFkeSBiZWVuIGJvdW5kIHRvIGl0OyB3ZSBjYW4ndCBoYXZlIGEgZHVwbGljYXRlXG4gICAgICAgIC8vIGtleSBpbiB0aGUgdHlwZSBjb25zdHJ1Y3RvciBjYWxsLlxuICAgICAgICBpZiAoZ2VuZXJpY0lucHV0cy5oYXMoZmllbGROYW1lKSkge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgZXhwcmVzc2lvbiA9IHRyYW5zbGF0ZUlucHV0KGlucHV0LmF0dHJpYnV0ZSwgdGhpcy50Y2IsIHRoaXMuc2NvcGUpO1xuICAgICAgICBnZW5lcmljSW5wdXRzLnNldChmaWVsZE5hbWUsIHtcbiAgICAgICAgICB0eXBlOiAnYmluZGluZycsXG4gICAgICAgICAgZmllbGQ6IGZpZWxkTmFtZSxcbiAgICAgICAgICBleHByZXNzaW9uLFxuICAgICAgICAgIHNvdXJjZVNwYW46IGlucHV0LmF0dHJpYnV0ZS5zb3VyY2VTcGFuXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIEFkZCB1bnNldCBkaXJlY3RpdmUgaW5wdXRzIGZvciBlYWNoIG9mIHRoZSByZW1haW5pbmcgdW5zZXQgZmllbGRzLlxuICAgIGZvciAoY29uc3QgW2ZpZWxkTmFtZV0gb2YgdGhpcy5kaXIuaW5wdXRzKSB7XG4gICAgICBpZiAoIWdlbmVyaWNJbnB1dHMuaGFzKGZpZWxkTmFtZSkpIHtcbiAgICAgICAgZ2VuZXJpY0lucHV0cy5zZXQoZmllbGROYW1lLCB7dHlwZTogJ3Vuc2V0JywgZmllbGQ6IGZpZWxkTmFtZX0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIENhbGwgdGhlIHR5cGUgY29uc3RydWN0b3Igb2YgdGhlIGRpcmVjdGl2ZSB0byBpbmZlciBhIHR5cGUsIGFuZCBhc3NpZ24gdGhlIGRpcmVjdGl2ZVxuICAgIC8vIGluc3RhbmNlLlxuICAgIGNvbnN0IHR5cGVDdG9yID0gdGNiQ2FsbFR5cGVDdG9yKHRoaXMuZGlyLCB0aGlzLnRjYiwgQXJyYXkuZnJvbShnZW5lcmljSW5wdXRzLnZhbHVlcygpKSk7XG4gICAgbWFya0lnbm9yZURpYWdub3N0aWNzKHR5cGVDdG9yKTtcbiAgICB0aGlzLnNjb3BlLmFkZFN0YXRlbWVudCh0c0NyZWF0ZVZhcmlhYmxlKGlkLCB0eXBlQ3RvcikpO1xuICAgIHJldHVybiBpZDtcbiAgfVxuXG4gIG92ZXJyaWRlIGNpcmN1bGFyRmFsbGJhY2soKTogVGNiT3Age1xuICAgIHJldHVybiBuZXcgVGNiRGlyZWN0aXZlQ3RvckNpcmN1bGFyRmFsbGJhY2tPcCh0aGlzLnRjYiwgdGhpcy5zY29wZSwgdGhpcy5ub2RlLCB0aGlzLmRpcik7XG4gIH1cbn1cblxuLyoqXG4gKiBBIGBUY2JPcGAgd2hpY2ggZ2VuZXJhdGVzIGNvZGUgdG8gY2hlY2sgaW5wdXQgYmluZGluZ3Mgb24gYW4gZWxlbWVudCB0aGF0IGNvcnJlc3BvbmQgd2l0aCB0aGVcbiAqIG1lbWJlcnMgb2YgYSBkaXJlY3RpdmUuXG4gKlxuICogRXhlY3V0aW5nIHRoaXMgb3BlcmF0aW9uIHJldHVybnMgbm90aGluZy5cbiAqL1xuY2xhc3MgVGNiRGlyZWN0aXZlSW5wdXRzT3AgZXh0ZW5kcyBUY2JPcCB7XG4gIGNvbnN0cnVjdG9yKFxuICAgICAgcHJpdmF0ZSB0Y2I6IENvbnRleHQsIHByaXZhdGUgc2NvcGU6IFNjb3BlLCBwcml2YXRlIG5vZGU6IFRtcGxBc3RUZW1wbGF0ZXxUbXBsQXN0RWxlbWVudCxcbiAgICAgIHByaXZhdGUgZGlyOiBUeXBlQ2hlY2thYmxlRGlyZWN0aXZlTWV0YSkge1xuICAgIHN1cGVyKCk7XG4gIH1cblxuICBvdmVycmlkZSBnZXQgb3B0aW9uYWwoKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgb3ZlcnJpZGUgZXhlY3V0ZSgpOiBudWxsIHtcbiAgICBsZXQgZGlySWQ6IHRzLkV4cHJlc3Npb258bnVsbCA9IG51bGw7XG5cbiAgICAvLyBUT0RPKGpvb3N0KTogcmVwb3J0IGR1cGxpY2F0ZSBwcm9wZXJ0aWVzXG5cbiAgICBjb25zdCBpbnB1dHMgPSBnZXRCb3VuZElucHV0cyh0aGlzLmRpciwgdGhpcy5ub2RlLCB0aGlzLnRjYik7XG4gICAgZm9yIChjb25zdCBpbnB1dCBvZiBpbnB1dHMpIHtcbiAgICAgIC8vIEZvciBib3VuZCBpbnB1dHMsIHRoZSBwcm9wZXJ0eSBpcyBhc3NpZ25lZCB0aGUgYmluZGluZyBleHByZXNzaW9uLlxuICAgICAgbGV0IGV4cHIgPSB0cmFuc2xhdGVJbnB1dChpbnB1dC5hdHRyaWJ1dGUsIHRoaXMudGNiLCB0aGlzLnNjb3BlKTtcbiAgICAgIGlmICghdGhpcy50Y2IuZW52LmNvbmZpZy5jaGVja1R5cGVPZklucHV0QmluZGluZ3MpIHtcbiAgICAgICAgLy8gSWYgY2hlY2tpbmcgdGhlIHR5cGUgb2YgYmluZGluZ3MgaXMgZGlzYWJsZWQsIGNhc3QgdGhlIHJlc3VsdGluZyBleHByZXNzaW9uIHRvICdhbnknXG4gICAgICAgIC8vIGJlZm9yZSB0aGUgYXNzaWdubWVudC5cbiAgICAgICAgZXhwciA9IHRzQ2FzdFRvQW55KGV4cHIpO1xuICAgICAgfSBlbHNlIGlmICghdGhpcy50Y2IuZW52LmNvbmZpZy5zdHJpY3ROdWxsSW5wdXRCaW5kaW5ncykge1xuICAgICAgICAvLyBJZiBzdHJpY3QgbnVsbCBjaGVja3MgYXJlIGRpc2FibGVkLCBlcmFzZSBgbnVsbGAgYW5kIGB1bmRlZmluZWRgIGZyb20gdGhlIHR5cGUgYnlcbiAgICAgICAgLy8gd3JhcHBpbmcgdGhlIGV4cHJlc3Npb24gaW4gYSBub24tbnVsbCBhc3NlcnRpb24uXG4gICAgICAgIGV4cHIgPSB0cy5jcmVhdGVOb25OdWxsRXhwcmVzc2lvbihleHByKTtcbiAgICAgIH1cblxuICAgICAgbGV0IGFzc2lnbm1lbnQ6IHRzLkV4cHJlc3Npb24gPSB3cmFwRm9yRGlhZ25vc3RpY3MoZXhwcik7XG5cbiAgICAgIGZvciAoY29uc3QgZmllbGROYW1lIG9mIGlucHV0LmZpZWxkTmFtZXMpIHtcbiAgICAgICAgbGV0IHRhcmdldDogdHMuTGVmdEhhbmRTaWRlRXhwcmVzc2lvbjtcbiAgICAgICAgaWYgKHRoaXMuZGlyLmNvZXJjZWRJbnB1dEZpZWxkcy5oYXMoZmllbGROYW1lKSkge1xuICAgICAgICAgIC8vIFRoZSBpbnB1dCBoYXMgYSBjb2VyY2lvbiBkZWNsYXJhdGlvbiB3aGljaCBzaG91bGQgYmUgdXNlZCBpbnN0ZWFkIG9mIGFzc2lnbmluZyB0aGVcbiAgICAgICAgICAvLyBleHByZXNzaW9uIGludG8gdGhlIGlucHV0IGZpZWxkIGRpcmVjdGx5LiBUbyBhY2hpZXZlIHRoaXMsIGEgdmFyaWFibGUgaXMgZGVjbGFyZWRcbiAgICAgICAgICAvLyB3aXRoIGEgdHlwZSBvZiBgdHlwZW9mIERpcmVjdGl2ZS5uZ0FjY2VwdElucHV0VHlwZV9maWVsZE5hbWVgIHdoaWNoIGlzIHRoZW4gdXNlZCBhc1xuICAgICAgICAgIC8vIHRhcmdldCBvZiB0aGUgYXNzaWdubWVudC5cbiAgICAgICAgICBjb25zdCBkaXJUeXBlUmVmID0gdGhpcy50Y2IuZW52LnJlZmVyZW5jZVR5cGUodGhpcy5kaXIucmVmKTtcbiAgICAgICAgICBpZiAoIXRzLmlzVHlwZVJlZmVyZW5jZU5vZGUoZGlyVHlwZVJlZikpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICAgICAgICBgRXhwZWN0ZWQgVHlwZVJlZmVyZW5jZU5vZGUgZnJvbSByZWZlcmVuY2UgdG8gJHt0aGlzLmRpci5yZWYuZGVidWdOYW1lfWApO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnN0IGlkID0gdGhpcy50Y2IuYWxsb2NhdGVJZCgpO1xuICAgICAgICAgIGNvbnN0IHR5cGUgPSB0c0NyZWF0ZVR5cGVRdWVyeUZvckNvZXJjZWRJbnB1dChkaXJUeXBlUmVmLnR5cGVOYW1lLCBmaWVsZE5hbWUpO1xuICAgICAgICAgIHRoaXMuc2NvcGUuYWRkU3RhdGVtZW50KHRzRGVjbGFyZVZhcmlhYmxlKGlkLCB0eXBlKSk7XG5cbiAgICAgICAgICB0YXJnZXQgPSBpZDtcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLmRpci51bmRlY2xhcmVkSW5wdXRGaWVsZHMuaGFzKGZpZWxkTmFtZSkpIHtcbiAgICAgICAgICAvLyBJZiBubyBjb2VyY2lvbiBkZWNsYXJhdGlvbiBpcyBwcmVzZW50IG5vciBpcyB0aGUgZmllbGQgZGVjbGFyZWQgKGkuZS4gdGhlIGlucHV0IGlzXG4gICAgICAgICAgLy8gZGVjbGFyZWQgaW4gYSBgQERpcmVjdGl2ZWAgb3IgYEBDb21wb25lbnRgIGRlY29yYXRvcidzIGBpbnB1dHNgIHByb3BlcnR5KSB0aGVyZSBpcyBub1xuICAgICAgICAgIC8vIGFzc2lnbm1lbnQgdGFyZ2V0IGF2YWlsYWJsZSwgc28gdGhpcyBmaWVsZCBpcyBza2lwcGVkLlxuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgICAgIXRoaXMudGNiLmVudi5jb25maWcuaG9ub3JBY2Nlc3NNb2RpZmllcnNGb3JJbnB1dEJpbmRpbmdzICYmXG4gICAgICAgICAgICB0aGlzLmRpci5yZXN0cmljdGVkSW5wdXRGaWVsZHMuaGFzKGZpZWxkTmFtZSkpIHtcbiAgICAgICAgICAvLyBJZiBzdHJpY3QgY2hlY2tpbmcgb2YgYWNjZXNzIG1vZGlmaWVycyBpcyBkaXNhYmxlZCBhbmQgdGhlIGZpZWxkIGlzIHJlc3RyaWN0ZWRcbiAgICAgICAgICAvLyAoaS5lLiBwcml2YXRlL3Byb3RlY3RlZC9yZWFkb25seSksIGdlbmVyYXRlIGFuIGFzc2lnbm1lbnQgaW50byBhIHRlbXBvcmFyeSB2YXJpYWJsZVxuICAgICAgICAgIC8vIHRoYXQgaGFzIHRoZSB0eXBlIG9mIHRoZSBmaWVsZC4gVGhpcyBhY2hpZXZlcyB0eXBlLWNoZWNraW5nIGJ1dCBjaXJjdW12ZW50cyB0aGUgYWNjZXNzXG4gICAgICAgICAgLy8gbW9kaWZpZXJzLlxuICAgICAgICAgIGlmIChkaXJJZCA9PT0gbnVsbCkge1xuICAgICAgICAgICAgZGlySWQgPSB0aGlzLnNjb3BlLnJlc29sdmUodGhpcy5ub2RlLCB0aGlzLmRpcik7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3QgaWQgPSB0aGlzLnRjYi5hbGxvY2F0ZUlkKCk7XG4gICAgICAgICAgY29uc3QgZGlyVHlwZVJlZiA9IHRoaXMudGNiLmVudi5yZWZlcmVuY2VUeXBlKHRoaXMuZGlyLnJlZik7XG4gICAgICAgICAgaWYgKCF0cy5pc1R5cGVSZWZlcmVuY2VOb2RlKGRpclR5cGVSZWYpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgICAgICAgYEV4cGVjdGVkIFR5cGVSZWZlcmVuY2VOb2RlIGZyb20gcmVmZXJlbmNlIHRvICR7dGhpcy5kaXIucmVmLmRlYnVnTmFtZX1gKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3QgdHlwZSA9IHRzLmNyZWF0ZUluZGV4ZWRBY2Nlc3NUeXBlTm9kZShcbiAgICAgICAgICAgICAgdHMuY3JlYXRlVHlwZVF1ZXJ5Tm9kZShkaXJJZCBhcyB0cy5JZGVudGlmaWVyKSxcbiAgICAgICAgICAgICAgdHMuY3JlYXRlTGl0ZXJhbFR5cGVOb2RlKHRzLmNyZWF0ZVN0cmluZ0xpdGVyYWwoZmllbGROYW1lKSkpO1xuICAgICAgICAgIGNvbnN0IHRlbXAgPSB0c0RlY2xhcmVWYXJpYWJsZShpZCwgdHlwZSk7XG4gICAgICAgICAgdGhpcy5zY29wZS5hZGRTdGF0ZW1lbnQodGVtcCk7XG4gICAgICAgICAgdGFyZ2V0ID0gaWQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaWYgKGRpcklkID09PSBudWxsKSB7XG4gICAgICAgICAgICBkaXJJZCA9IHRoaXMuc2NvcGUucmVzb2x2ZSh0aGlzLm5vZGUsIHRoaXMuZGlyKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBUbyBnZXQgZXJyb3JzIGFzc2lnbiBkaXJlY3RseSB0byB0aGUgZmllbGRzIG9uIHRoZSBpbnN0YW5jZSwgdXNpbmcgcHJvcGVydHkgYWNjZXNzXG4gICAgICAgICAgLy8gd2hlbiBwb3NzaWJsZS4gU3RyaW5nIGxpdGVyYWwgZmllbGRzIG1heSBub3QgYmUgdmFsaWQgSlMgaWRlbnRpZmllcnMgc28gd2UgdXNlXG4gICAgICAgICAgLy8gbGl0ZXJhbCBlbGVtZW50IGFjY2VzcyBpbnN0ZWFkIGZvciB0aG9zZSBjYXNlcy5cbiAgICAgICAgICB0YXJnZXQgPSB0aGlzLmRpci5zdHJpbmdMaXRlcmFsSW5wdXRGaWVsZHMuaGFzKGZpZWxkTmFtZSkgP1xuICAgICAgICAgICAgICB0cy5jcmVhdGVFbGVtZW50QWNjZXNzKGRpcklkLCB0cy5jcmVhdGVTdHJpbmdMaXRlcmFsKGZpZWxkTmFtZSkpIDpcbiAgICAgICAgICAgICAgdHMuY3JlYXRlUHJvcGVydHlBY2Nlc3MoZGlySWQsIHRzLmNyZWF0ZUlkZW50aWZpZXIoZmllbGROYW1lKSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaW5wdXQuYXR0cmlidXRlLmtleVNwYW4gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIGFkZFBhcnNlU3BhbkluZm8odGFyZ2V0LCBpbnB1dC5hdHRyaWJ1dGUua2V5U3Bhbik7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRmluYWxseSB0aGUgYXNzaWdubWVudCBpcyBleHRlbmRlZCBieSBhc3NpZ25pbmcgaXQgaW50byB0aGUgdGFyZ2V0IGV4cHJlc3Npb24uXG4gICAgICAgIGFzc2lnbm1lbnQgPSB0cy5jcmVhdGVCaW5hcnkodGFyZ2V0LCB0cy5TeW50YXhLaW5kLkVxdWFsc1Rva2VuLCBhc3NpZ25tZW50KTtcbiAgICAgIH1cblxuICAgICAgYWRkUGFyc2VTcGFuSW5mbyhhc3NpZ25tZW50LCBpbnB1dC5hdHRyaWJ1dGUuc291cmNlU3Bhbik7XG4gICAgICAvLyBJZ25vcmUgZGlhZ25vc3RpY3MgZm9yIHRleHQgYXR0cmlidXRlcyBpZiBjb25maWd1cmVkIHRvIGRvIHNvLlxuICAgICAgaWYgKCF0aGlzLnRjYi5lbnYuY29uZmlnLmNoZWNrVHlwZU9mQXR0cmlidXRlcyAmJlxuICAgICAgICAgIGlucHV0LmF0dHJpYnV0ZSBpbnN0YW5jZW9mIFRtcGxBc3RUZXh0QXR0cmlidXRlKSB7XG4gICAgICAgIG1hcmtJZ25vcmVEaWFnbm9zdGljcyhhc3NpZ25tZW50KTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5zY29wZS5hZGRTdGF0ZW1lbnQodHMuY3JlYXRlRXhwcmVzc2lvblN0YXRlbWVudChhc3NpZ25tZW50KSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuLyoqXG4gKiBBIGBUY2JPcGAgd2hpY2ggaXMgdXNlZCB0byBnZW5lcmF0ZSBhIGZhbGxiYWNrIGV4cHJlc3Npb24gaWYgdGhlIGluZmVyZW5jZSBvZiBhIGRpcmVjdGl2ZSB0eXBlXG4gKiB2aWEgYFRjYkRpcmVjdGl2ZUN0b3JPcGAgcmVxdWlyZXMgYSByZWZlcmVuY2UgdG8gaXRzIG93biB0eXBlLiBUaGlzIGNhbiBoYXBwZW4gdXNpbmcgYSB0ZW1wbGF0ZVxuICogcmVmZXJlbmNlOlxuICpcbiAqIGBgYGh0bWxcbiAqIDxzb21lLWNtcCAjcmVmIFtwcm9wXT1cInJlZi5mb29cIj48L3NvbWUtY21wPlxuICogYGBgXG4gKlxuICogSW4gdGhpcyBjYXNlLCBgVGNiRGlyZWN0aXZlQ3RvckNpcmN1bGFyRmFsbGJhY2tPcGAgd2lsbCBhZGQgYSBzZWNvbmQgaW5mZXJlbmNlIG9mIHRoZSBkaXJlY3RpdmVcbiAqIHR5cGUgdG8gdGhlIHR5cGUtY2hlY2sgYmxvY2ssIHRoaXMgdGltZSBjYWxsaW5nIHRoZSBkaXJlY3RpdmUncyB0eXBlIGNvbnN0cnVjdG9yIHdpdGhvdXQgYW55XG4gKiBpbnB1dCBleHByZXNzaW9ucy4gVGhpcyBpbmZlcnMgdGhlIHdpZGVzdCBwb3NzaWJsZSBzdXBlcnR5cGUgZm9yIHRoZSBkaXJlY3RpdmUsIHdoaWNoIGlzIHVzZWQgdG9cbiAqIHJlc29sdmUgYW55IHJlY3Vyc2l2ZSByZWZlcmVuY2VzIHJlcXVpcmVkIHRvIGluZmVyIHRoZSByZWFsIHR5cGUuXG4gKi9cbmNsYXNzIFRjYkRpcmVjdGl2ZUN0b3JDaXJjdWxhckZhbGxiYWNrT3AgZXh0ZW5kcyBUY2JPcCB7XG4gIGNvbnN0cnVjdG9yKFxuICAgICAgcHJpdmF0ZSB0Y2I6IENvbnRleHQsIHByaXZhdGUgc2NvcGU6IFNjb3BlLCBwcml2YXRlIG5vZGU6IFRtcGxBc3RUZW1wbGF0ZXxUbXBsQXN0RWxlbWVudCxcbiAgICAgIHByaXZhdGUgZGlyOiBUeXBlQ2hlY2thYmxlRGlyZWN0aXZlTWV0YSkge1xuICAgIHN1cGVyKCk7XG4gIH1cblxuICBvdmVycmlkZSBnZXQgb3B0aW9uYWwoKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgb3ZlcnJpZGUgZXhlY3V0ZSgpOiB0cy5JZGVudGlmaWVyIHtcbiAgICBjb25zdCBpZCA9IHRoaXMudGNiLmFsbG9jYXRlSWQoKTtcbiAgICBjb25zdCB0eXBlQ3RvciA9IHRoaXMudGNiLmVudi50eXBlQ3RvckZvcih0aGlzLmRpcik7XG4gICAgY29uc3QgY2lyY3VsYXJQbGFjZWhvbGRlciA9IHRzLmNyZWF0ZUNhbGwoXG4gICAgICAgIHR5cGVDdG9yLCAvKiB0eXBlQXJndW1lbnRzICovIHVuZGVmaW5lZCwgW3RzLmNyZWF0ZU5vbk51bGxFeHByZXNzaW9uKHRzLmNyZWF0ZU51bGwoKSldKTtcbiAgICB0aGlzLnNjb3BlLmFkZFN0YXRlbWVudCh0c0NyZWF0ZVZhcmlhYmxlKGlkLCBjaXJjdWxhclBsYWNlaG9sZGVyKSk7XG4gICAgcmV0dXJuIGlkO1xuICB9XG59XG5cbi8qKlxuICogQSBgVGNiT3BgIHdoaWNoIGZlZWRzIGVsZW1lbnRzIGFuZCB1bmNsYWltZWQgcHJvcGVydGllcyB0byB0aGUgYERvbVNjaGVtYUNoZWNrZXJgLlxuICpcbiAqIFRoZSBET00gc2NoZW1hIGlzIG5vdCBjaGVja2VkIHZpYSBUQ0IgY29kZSBnZW5lcmF0aW9uLiBJbnN0ZWFkLCB0aGUgYERvbVNjaGVtYUNoZWNrZXJgIGluZ2VzdHNcbiAqIGVsZW1lbnRzIGFuZCBwcm9wZXJ0eSBiaW5kaW5ncyBhbmQgYWNjdW11bGF0ZXMgc3ludGhldGljIGB0cy5EaWFnbm9zdGljYHMgb3V0LW9mLWJhbmQuIFRoZXNlIGFyZVxuICogbGF0ZXIgbWVyZ2VkIHdpdGggdGhlIGRpYWdub3N0aWNzIGdlbmVyYXRlZCBmcm9tIHRoZSBUQ0IuXG4gKlxuICogRm9yIGNvbnZlbmllbmNlLCB0aGUgVENCIGl0ZXJhdGlvbiBvZiB0aGUgdGVtcGxhdGUgaXMgdXNlZCB0byBkcml2ZSB0aGUgYERvbVNjaGVtYUNoZWNrZXJgIHZpYVxuICogdGhlIGBUY2JEb21TY2hlbWFDaGVja2VyT3BgLlxuICovXG5jbGFzcyBUY2JEb21TY2hlbWFDaGVja2VyT3AgZXh0ZW5kcyBUY2JPcCB7XG4gIGNvbnN0cnVjdG9yKFxuICAgICAgcHJpdmF0ZSB0Y2I6IENvbnRleHQsIHByaXZhdGUgZWxlbWVudDogVG1wbEFzdEVsZW1lbnQsIHByaXZhdGUgY2hlY2tFbGVtZW50OiBib29sZWFuLFxuICAgICAgcHJpdmF0ZSBjbGFpbWVkSW5wdXRzOiBTZXQ8c3RyaW5nPikge1xuICAgIHN1cGVyKCk7XG4gIH1cblxuICBvdmVycmlkZSBnZXQgb3B0aW9uYWwoKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgb3ZlcnJpZGUgZXhlY3V0ZSgpOiB0cy5FeHByZXNzaW9ufG51bGwge1xuICAgIGlmICh0aGlzLmNoZWNrRWxlbWVudCkge1xuICAgICAgdGhpcy50Y2IuZG9tU2NoZW1hQ2hlY2tlci5jaGVja0VsZW1lbnQodGhpcy50Y2IuaWQsIHRoaXMuZWxlbWVudCwgdGhpcy50Y2Iuc2NoZW1hcyk7XG4gICAgfVxuXG4gICAgLy8gVE9ETyhhbHhodWIpOiB0aGlzIGNvdWxkIGJlIG1vcmUgZWZmaWNpZW50LlxuICAgIGZvciAoY29uc3QgYmluZGluZyBvZiB0aGlzLmVsZW1lbnQuaW5wdXRzKSB7XG4gICAgICBpZiAoYmluZGluZy50eXBlID09PSBCaW5kaW5nVHlwZS5Qcm9wZXJ0eSAmJiB0aGlzLmNsYWltZWRJbnB1dHMuaGFzKGJpbmRpbmcubmFtZSkpIHtcbiAgICAgICAgLy8gU2tpcCB0aGlzIGJpbmRpbmcgYXMgaXQgd2FzIGNsYWltZWQgYnkgYSBkaXJlY3RpdmUuXG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoYmluZGluZy50eXBlID09PSBCaW5kaW5nVHlwZS5Qcm9wZXJ0eSkge1xuICAgICAgICBpZiAoYmluZGluZy5uYW1lICE9PSAnc3R5bGUnICYmIGJpbmRpbmcubmFtZSAhPT0gJ2NsYXNzJykge1xuICAgICAgICAgIC8vIEEgZGlyZWN0IGJpbmRpbmcgdG8gYSBwcm9wZXJ0eS5cbiAgICAgICAgICBjb25zdCBwcm9wZXJ0eU5hbWUgPSBBVFRSX1RPX1BST1BbYmluZGluZy5uYW1lXSB8fCBiaW5kaW5nLm5hbWU7XG4gICAgICAgICAgdGhpcy50Y2IuZG9tU2NoZW1hQ2hlY2tlci5jaGVja1Byb3BlcnR5KFxuICAgICAgICAgICAgICB0aGlzLnRjYi5pZCwgdGhpcy5lbGVtZW50LCBwcm9wZXJ0eU5hbWUsIGJpbmRpbmcuc291cmNlU3BhbiwgdGhpcy50Y2Iuc2NoZW1hcyk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuXG4vKipcbiAqIE1hcHBpbmcgYmV0d2VlbiBhdHRyaWJ1dGVzIG5hbWVzIHRoYXQgZG9uJ3QgY29ycmVzcG9uZCB0byB0aGVpciBlbGVtZW50IHByb3BlcnR5IG5hbWVzLlxuICogTm90ZTogdGhpcyBtYXBwaW5nIGhhcyB0byBiZSBrZXB0IGluIHN5bmMgd2l0aCB0aGUgZXF1YWxseSBuYW1lZCBtYXBwaW5nIGluIHRoZSBydW50aW1lLlxuICovXG5jb25zdCBBVFRSX1RPX1BST1A6IHtbbmFtZTogc3RyaW5nXTogc3RyaW5nfSA9IHtcbiAgJ2NsYXNzJzogJ2NsYXNzTmFtZScsXG4gICdmb3InOiAnaHRtbEZvcicsXG4gICdmb3JtYWN0aW9uJzogJ2Zvcm1BY3Rpb24nLFxuICAnaW5uZXJIdG1sJzogJ2lubmVySFRNTCcsXG4gICdyZWFkb25seSc6ICdyZWFkT25seScsXG4gICd0YWJpbmRleCc6ICd0YWJJbmRleCcsXG59O1xuXG4vKipcbiAqIEEgYFRjYk9wYCB3aGljaCBnZW5lcmF0ZXMgY29kZSB0byBjaGVjayBcInVuY2xhaW1lZCBpbnB1dHNcIiAtIGJpbmRpbmdzIG9uIGFuIGVsZW1lbnQgd2hpY2ggd2VyZVxuICogbm90IGF0dHJpYnV0ZWQgdG8gYW55IGRpcmVjdGl2ZSBvciBjb21wb25lbnQsIGFuZCBhcmUgaW5zdGVhZCBwcm9jZXNzZWQgYWdhaW5zdCB0aGUgSFRNTCBlbGVtZW50XG4gKiBpdHNlbGYuXG4gKlxuICogQ3VycmVudGx5LCBvbmx5IHRoZSBleHByZXNzaW9ucyBvZiB0aGVzZSBiaW5kaW5ncyBhcmUgY2hlY2tlZC4gVGhlIHRhcmdldHMgb2YgdGhlIGJpbmRpbmdzIGFyZVxuICogY2hlY2tlZCBhZ2FpbnN0IHRoZSBET00gc2NoZW1hIHZpYSBhIGBUY2JEb21TY2hlbWFDaGVja2VyT3BgLlxuICpcbiAqIEV4ZWN1dGluZyB0aGlzIG9wZXJhdGlvbiByZXR1cm5zIG5vdGhpbmcuXG4gKi9cbmNsYXNzIFRjYlVuY2xhaW1lZElucHV0c09wIGV4dGVuZHMgVGNiT3Age1xuICBjb25zdHJ1Y3RvcihcbiAgICAgIHByaXZhdGUgdGNiOiBDb250ZXh0LCBwcml2YXRlIHNjb3BlOiBTY29wZSwgcHJpdmF0ZSBlbGVtZW50OiBUbXBsQXN0RWxlbWVudCxcbiAgICAgIHByaXZhdGUgY2xhaW1lZElucHV0czogU2V0PHN0cmluZz4pIHtcbiAgICBzdXBlcigpO1xuICB9XG5cbiAgb3ZlcnJpZGUgZ2V0IG9wdGlvbmFsKCkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIG92ZXJyaWRlIGV4ZWN1dGUoKTogbnVsbCB7XG4gICAgLy8gYHRoaXMuaW5wdXRzYCBjb250YWlucyBvbmx5IHRob3NlIGJpbmRpbmdzIG5vdCBtYXRjaGVkIGJ5IGFueSBkaXJlY3RpdmUuIFRoZXNlIGJpbmRpbmdzIGdvIHRvXG4gICAgLy8gdGhlIGVsZW1lbnQgaXRzZWxmLlxuICAgIGxldCBlbElkOiB0cy5FeHByZXNzaW9ufG51bGwgPSBudWxsO1xuXG4gICAgLy8gVE9ETyhhbHhodWIpOiB0aGlzIGNvdWxkIGJlIG1vcmUgZWZmaWNpZW50LlxuICAgIGZvciAoY29uc3QgYmluZGluZyBvZiB0aGlzLmVsZW1lbnQuaW5wdXRzKSB7XG4gICAgICBpZiAoYmluZGluZy50eXBlID09PSBCaW5kaW5nVHlwZS5Qcm9wZXJ0eSAmJiB0aGlzLmNsYWltZWRJbnB1dHMuaGFzKGJpbmRpbmcubmFtZSkpIHtcbiAgICAgICAgLy8gU2tpcCB0aGlzIGJpbmRpbmcgYXMgaXQgd2FzIGNsYWltZWQgYnkgYSBkaXJlY3RpdmUuXG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBsZXQgZXhwciA9IHRjYkV4cHJlc3Npb24oYmluZGluZy52YWx1ZSwgdGhpcy50Y2IsIHRoaXMuc2NvcGUpO1xuICAgICAgaWYgKCF0aGlzLnRjYi5lbnYuY29uZmlnLmNoZWNrVHlwZU9mSW5wdXRCaW5kaW5ncykge1xuICAgICAgICAvLyBJZiBjaGVja2luZyB0aGUgdHlwZSBvZiBiaW5kaW5ncyBpcyBkaXNhYmxlZCwgY2FzdCB0aGUgcmVzdWx0aW5nIGV4cHJlc3Npb24gdG8gJ2FueSdcbiAgICAgICAgLy8gYmVmb3JlIHRoZSBhc3NpZ25tZW50LlxuICAgICAgICBleHByID0gdHNDYXN0VG9BbnkoZXhwcik7XG4gICAgICB9IGVsc2UgaWYgKCF0aGlzLnRjYi5lbnYuY29uZmlnLnN0cmljdE51bGxJbnB1dEJpbmRpbmdzKSB7XG4gICAgICAgIC8vIElmIHN0cmljdCBudWxsIGNoZWNrcyBhcmUgZGlzYWJsZWQsIGVyYXNlIGBudWxsYCBhbmQgYHVuZGVmaW5lZGAgZnJvbSB0aGUgdHlwZSBieVxuICAgICAgICAvLyB3cmFwcGluZyB0aGUgZXhwcmVzc2lvbiBpbiBhIG5vbi1udWxsIGFzc2VydGlvbi5cbiAgICAgICAgZXhwciA9IHRzLmNyZWF0ZU5vbk51bGxFeHByZXNzaW9uKGV4cHIpO1xuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy50Y2IuZW52LmNvbmZpZy5jaGVja1R5cGVPZkRvbUJpbmRpbmdzICYmIGJpbmRpbmcudHlwZSA9PT0gQmluZGluZ1R5cGUuUHJvcGVydHkpIHtcbiAgICAgICAgaWYgKGJpbmRpbmcubmFtZSAhPT0gJ3N0eWxlJyAmJiBiaW5kaW5nLm5hbWUgIT09ICdjbGFzcycpIHtcbiAgICAgICAgICBpZiAoZWxJZCA9PT0gbnVsbCkge1xuICAgICAgICAgICAgZWxJZCA9IHRoaXMuc2NvcGUucmVzb2x2ZSh0aGlzLmVsZW1lbnQpO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBBIGRpcmVjdCBiaW5kaW5nIHRvIGEgcHJvcGVydHkuXG4gICAgICAgICAgY29uc3QgcHJvcGVydHlOYW1lID0gQVRUUl9UT19QUk9QW2JpbmRpbmcubmFtZV0gfHwgYmluZGluZy5uYW1lO1xuICAgICAgICAgIGNvbnN0IHByb3AgPSB0cy5jcmVhdGVFbGVtZW50QWNjZXNzKGVsSWQsIHRzLmNyZWF0ZVN0cmluZ0xpdGVyYWwocHJvcGVydHlOYW1lKSk7XG4gICAgICAgICAgY29uc3Qgc3RtdCA9IHRzLmNyZWF0ZUJpbmFyeShwcm9wLCB0cy5TeW50YXhLaW5kLkVxdWFsc1Rva2VuLCB3cmFwRm9yRGlhZ25vc3RpY3MoZXhwcikpO1xuICAgICAgICAgIGFkZFBhcnNlU3BhbkluZm8oc3RtdCwgYmluZGluZy5zb3VyY2VTcGFuKTtcbiAgICAgICAgICB0aGlzLnNjb3BlLmFkZFN0YXRlbWVudCh0cy5jcmVhdGVFeHByZXNzaW9uU3RhdGVtZW50KHN0bXQpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLnNjb3BlLmFkZFN0YXRlbWVudCh0cy5jcmVhdGVFeHByZXNzaW9uU3RhdGVtZW50KGV4cHIpKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gQSBiaW5kaW5nIHRvIGFuIGFuaW1hdGlvbiwgYXR0cmlidXRlLCBjbGFzcyBvciBzdHlsZS4gRm9yIG5vdywgb25seSB2YWxpZGF0ZSB0aGUgcmlnaHQtXG4gICAgICAgIC8vIGhhbmQgc2lkZSBvZiB0aGUgZXhwcmVzc2lvbi5cbiAgICAgICAgLy8gVE9ETzogcHJvcGVybHkgY2hlY2sgY2xhc3MgYW5kIHN0eWxlIGJpbmRpbmdzLlxuICAgICAgICB0aGlzLnNjb3BlLmFkZFN0YXRlbWVudCh0cy5jcmVhdGVFeHByZXNzaW9uU3RhdGVtZW50KGV4cHIpKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufVxuXG4vKipcbiAqIEEgYFRjYk9wYCB3aGljaCBnZW5lcmF0ZXMgY29kZSB0byBjaGVjayBldmVudCBiaW5kaW5ncyBvbiBhbiBlbGVtZW50IHRoYXQgY29ycmVzcG9uZCB3aXRoIHRoZVxuICogb3V0cHV0cyBvZiBhIGRpcmVjdGl2ZS5cbiAqXG4gKiBFeGVjdXRpbmcgdGhpcyBvcGVyYXRpb24gcmV0dXJucyBub3RoaW5nLlxuICovXG5leHBvcnQgY2xhc3MgVGNiRGlyZWN0aXZlT3V0cHV0c09wIGV4dGVuZHMgVGNiT3Age1xuICBjb25zdHJ1Y3RvcihcbiAgICAgIHByaXZhdGUgdGNiOiBDb250ZXh0LCBwcml2YXRlIHNjb3BlOiBTY29wZSwgcHJpdmF0ZSBub2RlOiBUbXBsQXN0VGVtcGxhdGV8VG1wbEFzdEVsZW1lbnQsXG4gICAgICBwcml2YXRlIGRpcjogVHlwZUNoZWNrYWJsZURpcmVjdGl2ZU1ldGEpIHtcbiAgICBzdXBlcigpO1xuICB9XG5cbiAgb3ZlcnJpZGUgZ2V0IG9wdGlvbmFsKCkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIG92ZXJyaWRlIGV4ZWN1dGUoKTogbnVsbCB7XG4gICAgbGV0IGRpcklkOiB0cy5FeHByZXNzaW9ufG51bGwgPSBudWxsO1xuICAgIGNvbnN0IG91dHB1dHMgPSB0aGlzLmRpci5vdXRwdXRzO1xuXG4gICAgZm9yIChjb25zdCBvdXRwdXQgb2YgdGhpcy5ub2RlLm91dHB1dHMpIHtcbiAgICAgIGlmIChvdXRwdXQudHlwZSAhPT0gUGFyc2VkRXZlbnRUeXBlLlJlZ3VsYXIgfHwgIW91dHB1dHMuaGFzQmluZGluZ1Byb3BlcnR5TmFtZShvdXRwdXQubmFtZSkpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmICh0aGlzLnRjYi5lbnYuY29uZmlnLmNoZWNrVHlwZU9mT3V0cHV0RXZlbnRzICYmIG91dHB1dC5uYW1lLmVuZHNXaXRoKCdDaGFuZ2UnKSkge1xuICAgICAgICBjb25zdCBpbnB1dE5hbWUgPSBvdXRwdXQubmFtZS5zbGljZSgwLCAtNik7XG4gICAgICAgIGlzU3BsaXRUd29XYXlCaW5kaW5nKGlucHV0TmFtZSwgb3V0cHV0LCB0aGlzLm5vZGUuaW5wdXRzLCB0aGlzLnRjYik7XG4gICAgICB9XG4gICAgICAvLyBUT0RPKGFseGh1Yik6IGNvbnNpZGVyIHN1cHBvcnRpbmcgbXVsdGlwbGUgZmllbGRzIHdpdGggdGhlIHNhbWUgcHJvcGVydHkgbmFtZSBmb3Igb3V0cHV0cy5cbiAgICAgIGNvbnN0IGZpZWxkID0gb3V0cHV0cy5nZXRCeUJpbmRpbmdQcm9wZXJ0eU5hbWUob3V0cHV0Lm5hbWUpIVswXS5jbGFzc1Byb3BlcnR5TmFtZTtcblxuICAgICAgaWYgKGRpcklkID09PSBudWxsKSB7XG4gICAgICAgIGRpcklkID0gdGhpcy5zY29wZS5yZXNvbHZlKHRoaXMubm9kZSwgdGhpcy5kaXIpO1xuICAgICAgfVxuICAgICAgY29uc3Qgb3V0cHV0RmllbGQgPSB0cy5jcmVhdGVFbGVtZW50QWNjZXNzKGRpcklkLCB0cy5jcmVhdGVTdHJpbmdMaXRlcmFsKGZpZWxkKSk7XG4gICAgICBhZGRQYXJzZVNwYW5JbmZvKG91dHB1dEZpZWxkLCBvdXRwdXQua2V5U3Bhbik7XG4gICAgICBpZiAodGhpcy50Y2IuZW52LmNvbmZpZy5jaGVja1R5cGVPZk91dHB1dEV2ZW50cykge1xuICAgICAgICAvLyBGb3Igc3RyaWN0IGNoZWNraW5nIG9mIGRpcmVjdGl2ZSBldmVudHMsIGdlbmVyYXRlIGEgY2FsbCB0byB0aGUgYHN1YnNjcmliZWAgbWV0aG9kXG4gICAgICAgIC8vIG9uIHRoZSBkaXJlY3RpdmUncyBvdXRwdXQgZmllbGQgdG8gbGV0IHR5cGUgaW5mb3JtYXRpb24gZmxvdyBpbnRvIHRoZSBoYW5kbGVyIGZ1bmN0aW9uJ3NcbiAgICAgICAgLy8gYCRldmVudGAgcGFyYW1ldGVyLlxuICAgICAgICBjb25zdCBoYW5kbGVyID0gdGNiQ3JlYXRlRXZlbnRIYW5kbGVyKG91dHB1dCwgdGhpcy50Y2IsIHRoaXMuc2NvcGUsIEV2ZW50UGFyYW1UeXBlLkluZmVyKTtcbiAgICAgICAgY29uc3Qgc3Vic2NyaWJlRm4gPSB0cy5jcmVhdGVQcm9wZXJ0eUFjY2VzcyhvdXRwdXRGaWVsZCwgJ3N1YnNjcmliZScpO1xuICAgICAgICBjb25zdCBjYWxsID0gdHMuY3JlYXRlQ2FsbChzdWJzY3JpYmVGbiwgLyogdHlwZUFyZ3VtZW50cyAqLyB1bmRlZmluZWQsIFtoYW5kbGVyXSk7XG4gICAgICAgIGFkZFBhcnNlU3BhbkluZm8oY2FsbCwgb3V0cHV0LnNvdXJjZVNwYW4pO1xuICAgICAgICB0aGlzLnNjb3BlLmFkZFN0YXRlbWVudCh0cy5jcmVhdGVFeHByZXNzaW9uU3RhdGVtZW50KGNhbGwpKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIElmIHN0cmljdCBjaGVja2luZyBvZiBkaXJlY3RpdmUgZXZlbnRzIGlzIGRpc2FibGVkOlxuICAgICAgICAvL1xuICAgICAgICAvLyAqIFdlIHN0aWxsIGdlbmVyYXRlIHRoZSBhY2Nlc3MgdG8gdGhlIG91dHB1dCBmaWVsZCBhcyBhIHN0YXRlbWVudCBpbiB0aGUgVENCIHNvIGNvbnN1bWVyc1xuICAgICAgICAvLyAgIG9mIHRoZSBgVGVtcGxhdGVUeXBlQ2hlY2tlcmAgY2FuIHN0aWxsIGZpbmQgdGhlIG5vZGUgZm9yIHRoZSBjbGFzcyBtZW1iZXIgZm9yIHRoZVxuICAgICAgICAvLyAgIG91dHB1dC5cbiAgICAgICAgLy8gKiBFbWl0IGEgaGFuZGxlciBmdW5jdGlvbiB3aGVyZSB0aGUgYCRldmVudGAgcGFyYW1ldGVyIGhhcyBhbiBleHBsaWNpdCBgYW55YCB0eXBlLlxuICAgICAgICB0aGlzLnNjb3BlLmFkZFN0YXRlbWVudCh0cy5jcmVhdGVFeHByZXNzaW9uU3RhdGVtZW50KG91dHB1dEZpZWxkKSk7XG4gICAgICAgIGNvbnN0IGhhbmRsZXIgPSB0Y2JDcmVhdGVFdmVudEhhbmRsZXIob3V0cHV0LCB0aGlzLnRjYiwgdGhpcy5zY29wZSwgRXZlbnRQYXJhbVR5cGUuQW55KTtcbiAgICAgICAgdGhpcy5zY29wZS5hZGRTdGF0ZW1lbnQodHMuY3JlYXRlRXhwcmVzc2lvblN0YXRlbWVudChoYW5kbGVyKSk7XG4gICAgICB9XG5cbiAgICAgIEV4cHJlc3Npb25TZW1hbnRpY1Zpc2l0b3IudmlzaXQoXG4gICAgICAgICAgb3V0cHV0LmhhbmRsZXIsIHRoaXMudGNiLmlkLCB0aGlzLnRjYi5ib3VuZFRhcmdldCwgdGhpcy50Y2Iub29iUmVjb3JkZXIpO1xuICAgIH1cblxuICAgIHJldHVybiBudWxsO1xuICB9XG59XG5cbi8qKlxuICogQSBgVGNiT3BgIHdoaWNoIGdlbmVyYXRlcyBjb2RlIHRvIGNoZWNrIFwidW5jbGFpbWVkIG91dHB1dHNcIiAtIGV2ZW50IGJpbmRpbmdzIG9uIGFuIGVsZW1lbnQgd2hpY2hcbiAqIHdlcmUgbm90IGF0dHJpYnV0ZWQgdG8gYW55IGRpcmVjdGl2ZSBvciBjb21wb25lbnQsIGFuZCBhcmUgaW5zdGVhZCBwcm9jZXNzZWQgYWdhaW5zdCB0aGUgSFRNTFxuICogZWxlbWVudCBpdHNlbGYuXG4gKlxuICogRXhlY3V0aW5nIHRoaXMgb3BlcmF0aW9uIHJldHVybnMgbm90aGluZy5cbiAqL1xuY2xhc3MgVGNiVW5jbGFpbWVkT3V0cHV0c09wIGV4dGVuZHMgVGNiT3Age1xuICBjb25zdHJ1Y3RvcihcbiAgICAgIHByaXZhdGUgdGNiOiBDb250ZXh0LCBwcml2YXRlIHNjb3BlOiBTY29wZSwgcHJpdmF0ZSBlbGVtZW50OiBUbXBsQXN0RWxlbWVudCxcbiAgICAgIHByaXZhdGUgY2xhaW1lZE91dHB1dHM6IFNldDxzdHJpbmc+KSB7XG4gICAgc3VwZXIoKTtcbiAgfVxuXG4gIG92ZXJyaWRlIGdldCBvcHRpb25hbCgpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBvdmVycmlkZSBleGVjdXRlKCk6IG51bGwge1xuICAgIGxldCBlbElkOiB0cy5FeHByZXNzaW9ufG51bGwgPSBudWxsO1xuXG4gICAgLy8gVE9ETyhhbHhodWIpOiB0aGlzIGNvdWxkIGJlIG1vcmUgZWZmaWNpZW50LlxuICAgIGZvciAoY29uc3Qgb3V0cHV0IG9mIHRoaXMuZWxlbWVudC5vdXRwdXRzKSB7XG4gICAgICBpZiAodGhpcy5jbGFpbWVkT3V0cHV0cy5oYXMob3V0cHV0Lm5hbWUpKSB7XG4gICAgICAgIC8vIFNraXAgdGhpcyBldmVudCBoYW5kbGVyIGFzIGl0IHdhcyBjbGFpbWVkIGJ5IGEgZGlyZWN0aXZlLlxuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMudGNiLmVudi5jb25maWcuY2hlY2tUeXBlT2ZPdXRwdXRFdmVudHMgJiYgb3V0cHV0Lm5hbWUuZW5kc1dpdGgoJ0NoYW5nZScpKSB7XG4gICAgICAgIGNvbnN0IGlucHV0TmFtZSA9IG91dHB1dC5uYW1lLnNsaWNlKDAsIC02KTtcbiAgICAgICAgaWYgKGlzU3BsaXRUd29XYXlCaW5kaW5nKGlucHV0TmFtZSwgb3V0cHV0LCB0aGlzLmVsZW1lbnQuaW5wdXRzLCB0aGlzLnRjYikpIHtcbiAgICAgICAgICAvLyBTa2lwIHRoaXMgZXZlbnQgaGFuZGxlciBhcyB0aGUgZXJyb3Igd2FzIGFscmVhZHkgaGFuZGxlZC5cbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAob3V0cHV0LnR5cGUgPT09IFBhcnNlZEV2ZW50VHlwZS5BbmltYXRpb24pIHtcbiAgICAgICAgLy8gQW5pbWF0aW9uIG91dHB1dCBiaW5kaW5ncyBhbHdheXMgaGF2ZSBhbiBgJGV2ZW50YCBwYXJhbWV0ZXIgb2YgdHlwZSBgQW5pbWF0aW9uRXZlbnRgLlxuICAgICAgICBjb25zdCBldmVudFR5cGUgPSB0aGlzLnRjYi5lbnYuY29uZmlnLmNoZWNrVHlwZU9mQW5pbWF0aW9uRXZlbnRzID9cbiAgICAgICAgICAgIHRoaXMudGNiLmVudi5yZWZlcmVuY2VFeHRlcm5hbFR5cGUoJ0Bhbmd1bGFyL2FuaW1hdGlvbnMnLCAnQW5pbWF0aW9uRXZlbnQnKSA6XG4gICAgICAgICAgICBFdmVudFBhcmFtVHlwZS5Bbnk7XG5cbiAgICAgICAgY29uc3QgaGFuZGxlciA9IHRjYkNyZWF0ZUV2ZW50SGFuZGxlcihvdXRwdXQsIHRoaXMudGNiLCB0aGlzLnNjb3BlLCBldmVudFR5cGUpO1xuICAgICAgICB0aGlzLnNjb3BlLmFkZFN0YXRlbWVudCh0cy5jcmVhdGVFeHByZXNzaW9uU3RhdGVtZW50KGhhbmRsZXIpKTtcbiAgICAgIH0gZWxzZSBpZiAodGhpcy50Y2IuZW52LmNvbmZpZy5jaGVja1R5cGVPZkRvbUV2ZW50cykge1xuICAgICAgICAvLyBJZiBzdHJpY3QgY2hlY2tpbmcgb2YgRE9NIGV2ZW50cyBpcyBlbmFibGVkLCBnZW5lcmF0ZSBhIGNhbGwgdG8gYGFkZEV2ZW50TGlzdGVuZXJgIG9uXG4gICAgICAgIC8vIHRoZSBlbGVtZW50IGluc3RhbmNlIHNvIHRoYXQgVHlwZVNjcmlwdCdzIHR5cGUgaW5mZXJlbmNlIGZvclxuICAgICAgICAvLyBgSFRNTEVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcmAgdXNpbmcgYEhUTUxFbGVtZW50RXZlbnRNYXBgIHRvIGluZmVyIGFuIGFjY3VyYXRlIHR5cGUgZm9yXG4gICAgICAgIC8vIGAkZXZlbnRgIGRlcGVuZGluZyBvbiB0aGUgZXZlbnQgbmFtZS4gRm9yIHVua25vd24gZXZlbnQgbmFtZXMsIFR5cGVTY3JpcHQgcmVzb3J0cyB0byB0aGVcbiAgICAgICAgLy8gYmFzZSBgRXZlbnRgIHR5cGUuXG4gICAgICAgIGNvbnN0IGhhbmRsZXIgPSB0Y2JDcmVhdGVFdmVudEhhbmRsZXIob3V0cHV0LCB0aGlzLnRjYiwgdGhpcy5zY29wZSwgRXZlbnRQYXJhbVR5cGUuSW5mZXIpO1xuXG4gICAgICAgIGlmIChlbElkID09PSBudWxsKSB7XG4gICAgICAgICAgZWxJZCA9IHRoaXMuc2NvcGUucmVzb2x2ZSh0aGlzLmVsZW1lbnQpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHByb3BlcnR5QWNjZXNzID0gdHMuY3JlYXRlUHJvcGVydHlBY2Nlc3MoZWxJZCwgJ2FkZEV2ZW50TGlzdGVuZXInKTtcbiAgICAgICAgYWRkUGFyc2VTcGFuSW5mbyhwcm9wZXJ0eUFjY2Vzcywgb3V0cHV0LmtleVNwYW4pO1xuICAgICAgICBjb25zdCBjYWxsID0gdHMuY3JlYXRlQ2FsbChcbiAgICAgICAgICAgIC8qIGV4cHJlc3Npb24gKi8gcHJvcGVydHlBY2Nlc3MsXG4gICAgICAgICAgICAvKiB0eXBlQXJndW1lbnRzICovIHVuZGVmaW5lZCxcbiAgICAgICAgICAgIC8qIGFyZ3VtZW50cyAqL1t0cy5jcmVhdGVTdHJpbmdMaXRlcmFsKG91dHB1dC5uYW1lKSwgaGFuZGxlcl0pO1xuICAgICAgICBhZGRQYXJzZVNwYW5JbmZvKGNhbGwsIG91dHB1dC5zb3VyY2VTcGFuKTtcbiAgICAgICAgdGhpcy5zY29wZS5hZGRTdGF0ZW1lbnQodHMuY3JlYXRlRXhwcmVzc2lvblN0YXRlbWVudChjYWxsKSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBJZiBzdHJpY3QgY2hlY2tpbmcgb2YgRE9NIGlucHV0cyBpcyBkaXNhYmxlZCwgZW1pdCBhIGhhbmRsZXIgZnVuY3Rpb24gd2hlcmUgdGhlIGAkZXZlbnRgXG4gICAgICAgIC8vIHBhcmFtZXRlciBoYXMgYW4gZXhwbGljaXQgYGFueWAgdHlwZS5cbiAgICAgICAgY29uc3QgaGFuZGxlciA9IHRjYkNyZWF0ZUV2ZW50SGFuZGxlcihvdXRwdXQsIHRoaXMudGNiLCB0aGlzLnNjb3BlLCBFdmVudFBhcmFtVHlwZS5BbnkpO1xuICAgICAgICB0aGlzLnNjb3BlLmFkZFN0YXRlbWVudCh0cy5jcmVhdGVFeHByZXNzaW9uU3RhdGVtZW50KGhhbmRsZXIpKTtcbiAgICAgIH1cblxuICAgICAgRXhwcmVzc2lvblNlbWFudGljVmlzaXRvci52aXNpdChcbiAgICAgICAgICBvdXRwdXQuaGFuZGxlciwgdGhpcy50Y2IuaWQsIHRoaXMudGNiLmJvdW5kVGFyZ2V0LCB0aGlzLnRjYi5vb2JSZWNvcmRlcik7XG4gICAgfVxuXG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuLyoqXG4gKiBBIGBUY2JPcGAgd2hpY2ggZ2VuZXJhdGVzIGEgY29tcGxldGlvbiBwb2ludCBmb3IgdGhlIGNvbXBvbmVudCBjb250ZXh0LlxuICpcbiAqIFRoaXMgY29tcGxldGlvbiBwb2ludCBsb29rcyBsaWtlIGBjdHguIDtgIGluIHRoZSBUQ0Igb3V0cHV0LCBhbmQgZG9lcyBub3QgcHJvZHVjZSBkaWFnbm9zdGljcy5cbiAqIFR5cGVTY3JpcHQgYXV0b2NvbXBsZXRpb24gQVBJcyBjYW4gYmUgdXNlZCBhdCB0aGlzIGNvbXBsZXRpb24gcG9pbnQgKGFmdGVyIHRoZSAnLicpIHRvIHByb2R1Y2VcbiAqIGF1dG9jb21wbGV0aW9uIHJlc3VsdHMgb2YgcHJvcGVydGllcyBhbmQgbWV0aG9kcyBmcm9tIHRoZSB0ZW1wbGF0ZSdzIGNvbXBvbmVudCBjb250ZXh0LlxuICovXG5jbGFzcyBUY2JDb21wb25lbnRDb250ZXh0Q29tcGxldGlvbk9wIGV4dGVuZHMgVGNiT3Age1xuICBjb25zdHJ1Y3Rvcihwcml2YXRlIHNjb3BlOiBTY29wZSkge1xuICAgIHN1cGVyKCk7XG4gIH1cblxuICBvdmVycmlkZSByZWFkb25seSBvcHRpb25hbCA9IGZhbHNlO1xuXG4gIG92ZXJyaWRlIGV4ZWN1dGUoKTogbnVsbCB7XG4gICAgY29uc3QgY3R4ID0gdHMuY3JlYXRlSWRlbnRpZmllcignY3R4Jyk7XG4gICAgY29uc3QgY3R4RG90ID0gdHMuY3JlYXRlUHJvcGVydHlBY2Nlc3MoY3R4LCAnJyk7XG4gICAgbWFya0lnbm9yZURpYWdub3N0aWNzKGN0eERvdCk7XG4gICAgYWRkRXhwcmVzc2lvbklkZW50aWZpZXIoY3R4RG90LCBFeHByZXNzaW9uSWRlbnRpZmllci5DT01QT05FTlRfQ09NUExFVElPTik7XG4gICAgdGhpcy5zY29wZS5hZGRTdGF0ZW1lbnQodHMuY3JlYXRlRXhwcmVzc2lvblN0YXRlbWVudChjdHhEb3QpKTtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufVxuXG4vKipcbiAqIFZhbHVlIHVzZWQgdG8gYnJlYWsgYSBjaXJjdWxhciByZWZlcmVuY2UgYmV0d2VlbiBgVGNiT3Bgcy5cbiAqXG4gKiBUaGlzIHZhbHVlIGlzIHJldHVybmVkIHdoZW5ldmVyIGBUY2JPcGBzIGhhdmUgYSBjaXJjdWxhciBkZXBlbmRlbmN5LiBUaGUgZXhwcmVzc2lvbiBpcyBhIG5vbi1udWxsXG4gKiBhc3NlcnRpb24gb2YgdGhlIG51bGwgdmFsdWUgKGluIFR5cGVTY3JpcHQsIHRoZSBleHByZXNzaW9uIGBudWxsIWApLiBUaGlzIGNvbnN0cnVjdGlvbiB3aWxsIGluZmVyXG4gKiB0aGUgbGVhc3QgbmFycm93IHR5cGUgZm9yIHdoYXRldmVyIGl0J3MgYXNzaWduZWQgdG8uXG4gKi9cbmNvbnN0IElORkVSX1RZUEVfRk9SX0NJUkNVTEFSX09QX0VYUFIgPSB0cy5jcmVhdGVOb25OdWxsRXhwcmVzc2lvbih0cy5jcmVhdGVOdWxsKCkpO1xuXG4vKipcbiAqIE92ZXJhbGwgZ2VuZXJhdGlvbiBjb250ZXh0IGZvciB0aGUgdHlwZSBjaGVjayBibG9jay5cbiAqXG4gKiBgQ29udGV4dGAgaGFuZGxlcyBvcGVyYXRpb25zIGR1cmluZyBjb2RlIGdlbmVyYXRpb24gd2hpY2ggYXJlIGdsb2JhbCB3aXRoIHJlc3BlY3QgdG8gdGhlIHdob2xlXG4gKiBibG9jay4gSXQncyByZXNwb25zaWJsZSBmb3IgdmFyaWFibGUgbmFtZSBhbGxvY2F0aW9uIGFuZCBtYW5hZ2VtZW50IG9mIGFueSBpbXBvcnRzIG5lZWRlZC4gSXRcbiAqIGFsc28gY29udGFpbnMgdGhlIHRlbXBsYXRlIG1ldGFkYXRhIGl0c2VsZi5cbiAqL1xuZXhwb3J0IGNsYXNzIENvbnRleHQge1xuICBwcml2YXRlIG5leHRJZCA9IDE7XG5cbiAgY29uc3RydWN0b3IoXG4gICAgICByZWFkb25seSBlbnY6IEVudmlyb25tZW50LCByZWFkb25seSBkb21TY2hlbWFDaGVja2VyOiBEb21TY2hlbWFDaGVja2VyLFxuICAgICAgcmVhZG9ubHkgb29iUmVjb3JkZXI6IE91dE9mQmFuZERpYWdub3N0aWNSZWNvcmRlciwgcmVhZG9ubHkgaWQ6IFRlbXBsYXRlSWQsXG4gICAgICByZWFkb25seSBib3VuZFRhcmdldDogQm91bmRUYXJnZXQ8VHlwZUNoZWNrYWJsZURpcmVjdGl2ZU1ldGE+LFxuICAgICAgcHJpdmF0ZSBwaXBlczogTWFwPHN0cmluZywgUmVmZXJlbmNlPENsYXNzRGVjbGFyYXRpb248dHMuQ2xhc3NEZWNsYXJhdGlvbj4+PixcbiAgICAgIHJlYWRvbmx5IHNjaGVtYXM6IFNjaGVtYU1ldGFkYXRhW10pIHt9XG5cbiAgLyoqXG4gICAqIEFsbG9jYXRlIGEgbmV3IHZhcmlhYmxlIG5hbWUgZm9yIHVzZSB3aXRoaW4gdGhlIGBDb250ZXh0YC5cbiAgICpcbiAgICogQ3VycmVudGx5IHRoaXMgdXNlcyBhIG1vbm90b25pY2FsbHkgaW5jcmVhc2luZyBjb3VudGVyLCBidXQgaW4gdGhlIGZ1dHVyZSB0aGUgdmFyaWFibGUgbmFtZVxuICAgKiBtaWdodCBjaGFuZ2UgZGVwZW5kaW5nIG9uIHRoZSB0eXBlIG9mIGRhdGEgYmVpbmcgc3RvcmVkLlxuICAgKi9cbiAgYWxsb2NhdGVJZCgpOiB0cy5JZGVudGlmaWVyIHtcbiAgICByZXR1cm4gdHMuY3JlYXRlSWRlbnRpZmllcihgX3Qke3RoaXMubmV4dElkKyt9YCk7XG4gIH1cblxuICBnZXRQaXBlQnlOYW1lKG5hbWU6IHN0cmluZyk6IFJlZmVyZW5jZTxDbGFzc0RlY2xhcmF0aW9uPHRzLkNsYXNzRGVjbGFyYXRpb24+PnxudWxsIHtcbiAgICBpZiAoIXRoaXMucGlwZXMuaGFzKG5hbWUpKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMucGlwZXMuZ2V0KG5hbWUpITtcbiAgfVxufVxuXG4vKipcbiAqIExvY2FsIHNjb3BlIHdpdGhpbiB0aGUgdHlwZSBjaGVjayBibG9jayBmb3IgYSBwYXJ0aWN1bGFyIHRlbXBsYXRlLlxuICpcbiAqIFRoZSB0b3AtbGV2ZWwgdGVtcGxhdGUgYW5kIGVhY2ggbmVzdGVkIGA8bmctdGVtcGxhdGU+YCBoYXZlIHRoZWlyIG93biBgU2NvcGVgLCB3aGljaCBleGlzdCBpbiBhXG4gKiBoaWVyYXJjaHkuIFRoZSBzdHJ1Y3R1cmUgb2YgdGhpcyBoaWVyYXJjaHkgbWlycm9ycyB0aGUgc3ludGFjdGljIHNjb3BlcyBpbiB0aGUgZ2VuZXJhdGVkIHR5cGVcbiAqIGNoZWNrIGJsb2NrLCB3aGVyZSBlYWNoIG5lc3RlZCB0ZW1wbGF0ZSBpcyBlbmNhc2VkIGluIGFuIGBpZmAgc3RydWN0dXJlLlxuICpcbiAqIEFzIGEgdGVtcGxhdGUncyBgVGNiT3BgcyBhcmUgZXhlY3V0ZWQgaW4gYSBnaXZlbiBgU2NvcGVgLCBzdGF0ZW1lbnRzIGFyZSBhZGRlZCB2aWFcbiAqIGBhZGRTdGF0ZW1lbnQoKWAuIFdoZW4gdGhpcyBwcm9jZXNzaW5nIGlzIGNvbXBsZXRlLCB0aGUgYFNjb3BlYCBjYW4gYmUgdHVybmVkIGludG8gYSBgdHMuQmxvY2tgXG4gKiB2aWEgYHJlbmRlclRvQmxvY2soKWAuXG4gKlxuICogSWYgYSBgVGNiT3BgIHJlcXVpcmVzIHRoZSBvdXRwdXQgb2YgYW5vdGhlciwgaXQgY2FuIGNhbGwgYHJlc29sdmUoKWAuXG4gKi9cbmNsYXNzIFNjb3BlIHtcbiAgLyoqXG4gICAqIEEgcXVldWUgb2Ygb3BlcmF0aW9ucyB3aGljaCBuZWVkIHRvIGJlIHBlcmZvcm1lZCB0byBnZW5lcmF0ZSB0aGUgVENCIGNvZGUgZm9yIHRoaXMgc2NvcGUuXG4gICAqXG4gICAqIFRoaXMgYXJyYXkgY2FuIGNvbnRhaW4gZWl0aGVyIGEgYFRjYk9wYCB3aGljaCBoYXMgeWV0IHRvIGJlIGV4ZWN1dGVkLCBvciBhIGB0cy5FeHByZXNzaW9ufG51bGxgXG4gICAqIHJlcHJlc2VudGluZyB0aGUgbWVtb2l6ZWQgcmVzdWx0IG9mIGV4ZWN1dGluZyB0aGUgb3BlcmF0aW9uLiBBcyBvcGVyYXRpb25zIGFyZSBleGVjdXRlZCwgdGhlaXJcbiAgICogcmVzdWx0cyBhcmUgd3JpdHRlbiBpbnRvIHRoZSBgb3BRdWV1ZWAsIG92ZXJ3cml0aW5nIHRoZSBvcmlnaW5hbCBvcGVyYXRpb24uXG4gICAqXG4gICAqIElmIGFuIG9wZXJhdGlvbiBpcyBpbiB0aGUgcHJvY2VzcyBvZiBiZWluZyBleGVjdXRlZCwgaXQgaXMgdGVtcG9yYXJpbHkgb3ZlcndyaXR0ZW4gaGVyZSB3aXRoXG4gICAqIGBJTkZFUl9UWVBFX0ZPUl9DSVJDVUxBUl9PUF9FWFBSYC4gVGhpcyB3YXksIGlmIGEgY3ljbGUgaXMgZW5jb3VudGVyZWQgd2hlcmUgYW4gb3BlcmF0aW9uXG4gICAqIGRlcGVuZHMgdHJhbnNpdGl2ZWx5IG9uIGl0cyBvd24gcmVzdWx0LCB0aGUgaW5uZXIgb3BlcmF0aW9uIHdpbGwgaW5mZXIgdGhlIGxlYXN0IG5hcnJvdyB0eXBlXG4gICAqIHRoYXQgZml0cyBpbnN0ZWFkLiBUaGlzIGhhcyB0aGUgc2FtZSBzZW1hbnRpY3MgYXMgVHlwZVNjcmlwdCBpdHNlbGYgd2hlbiB0eXBlcyBhcmUgcmVmZXJlbmNlZFxuICAgKiBjaXJjdWxhcmx5LlxuICAgKi9cbiAgcHJpdmF0ZSBvcFF1ZXVlOiAoVGNiT3B8dHMuRXhwcmVzc2lvbnxudWxsKVtdID0gW107XG5cbiAgLyoqXG4gICAqIEEgbWFwIG9mIGBUbXBsQXN0RWxlbWVudGBzIHRvIHRoZSBpbmRleCBvZiB0aGVpciBgVGNiRWxlbWVudE9wYCBpbiB0aGUgYG9wUXVldWVgXG4gICAqL1xuICBwcml2YXRlIGVsZW1lbnRPcE1hcCA9IG5ldyBNYXA8VG1wbEFzdEVsZW1lbnQsIG51bWJlcj4oKTtcbiAgLyoqXG4gICAqIEEgbWFwIG9mIG1hcHMgd2hpY2ggdHJhY2tzIHRoZSBpbmRleCBvZiBgVGNiRGlyZWN0aXZlQ3Rvck9wYHMgaW4gdGhlIGBvcFF1ZXVlYCBmb3IgZWFjaFxuICAgKiBkaXJlY3RpdmUgb24gYSBgVG1wbEFzdEVsZW1lbnRgIG9yIGBUbXBsQXN0VGVtcGxhdGVgIG5vZGUuXG4gICAqL1xuICBwcml2YXRlIGRpcmVjdGl2ZU9wTWFwID1cbiAgICAgIG5ldyBNYXA8VG1wbEFzdEVsZW1lbnR8VG1wbEFzdFRlbXBsYXRlLCBNYXA8VHlwZUNoZWNrYWJsZURpcmVjdGl2ZU1ldGEsIG51bWJlcj4+KCk7XG5cbiAgLyoqXG4gICAqIEEgbWFwIG9mIGBUbXBsQXN0UmVmZXJlbmNlYHMgdG8gdGhlIGluZGV4IG9mIHRoZWlyIGBUY2JSZWZlcmVuY2VPcGAgaW4gdGhlIGBvcFF1ZXVlYFxuICAgKi9cbiAgcHJpdmF0ZSByZWZlcmVuY2VPcE1hcCA9IG5ldyBNYXA8VG1wbEFzdFJlZmVyZW5jZSwgbnVtYmVyPigpO1xuXG4gIC8qKlxuICAgKiBNYXAgb2YgaW1tZWRpYXRlbHkgbmVzdGVkIDxuZy10ZW1wbGF0ZT5zICh3aXRoaW4gdGhpcyBgU2NvcGVgKSByZXByZXNlbnRlZCBieSBgVG1wbEFzdFRlbXBsYXRlYFxuICAgKiBub2RlcyB0byB0aGUgaW5kZXggb2YgdGhlaXIgYFRjYlRlbXBsYXRlQ29udGV4dE9wYHMgaW4gdGhlIGBvcFF1ZXVlYC5cbiAgICovXG4gIHByaXZhdGUgdGVtcGxhdGVDdHhPcE1hcCA9IG5ldyBNYXA8VG1wbEFzdFRlbXBsYXRlLCBudW1iZXI+KCk7XG5cbiAgLyoqXG4gICAqIE1hcCBvZiB2YXJpYWJsZXMgZGVjbGFyZWQgb24gdGhlIHRlbXBsYXRlIHRoYXQgY3JlYXRlZCB0aGlzIGBTY29wZWAgKHJlcHJlc2VudGVkIGJ5XG4gICAqIGBUbXBsQXN0VmFyaWFibGVgIG5vZGVzKSB0byB0aGUgaW5kZXggb2YgdGhlaXIgYFRjYlZhcmlhYmxlT3BgcyBpbiB0aGUgYG9wUXVldWVgLlxuICAgKi9cbiAgcHJpdmF0ZSB2YXJNYXAgPSBuZXcgTWFwPFRtcGxBc3RWYXJpYWJsZSwgbnVtYmVyPigpO1xuXG4gIC8qKlxuICAgKiBTdGF0ZW1lbnRzIGZvciB0aGlzIHRlbXBsYXRlLlxuICAgKlxuICAgKiBFeGVjdXRpbmcgdGhlIGBUY2JPcGBzIGluIHRoZSBgb3BRdWV1ZWAgcG9wdWxhdGVzIHRoaXMgYXJyYXkuXG4gICAqL1xuICBwcml2YXRlIHN0YXRlbWVudHM6IHRzLlN0YXRlbWVudFtdID0gW107XG5cbiAgcHJpdmF0ZSBjb25zdHJ1Y3RvcihcbiAgICAgIHByaXZhdGUgdGNiOiBDb250ZXh0LCBwcml2YXRlIHBhcmVudDogU2NvcGV8bnVsbCA9IG51bGwsXG4gICAgICBwcml2YXRlIGd1YXJkOiB0cy5FeHByZXNzaW9ufG51bGwgPSBudWxsKSB7fVxuXG4gIC8qKlxuICAgKiBDb25zdHJ1Y3RzIGEgYFNjb3BlYCBnaXZlbiBlaXRoZXIgYSBgVG1wbEFzdFRlbXBsYXRlYCBvciBhIGxpc3Qgb2YgYFRtcGxBc3ROb2RlYHMuXG4gICAqXG4gICAqIEBwYXJhbSB0Y2IgdGhlIG92ZXJhbGwgY29udGV4dCBvZiBUQ0IgZ2VuZXJhdGlvbi5cbiAgICogQHBhcmFtIHBhcmVudCB0aGUgYFNjb3BlYCBvZiB0aGUgcGFyZW50IHRlbXBsYXRlIChpZiBhbnkpIG9yIGBudWxsYCBpZiB0aGlzIGlzIHRoZSByb290XG4gICAqIGBTY29wZWAuXG4gICAqIEBwYXJhbSB0ZW1wbGF0ZU9yTm9kZXMgZWl0aGVyIGEgYFRtcGxBc3RUZW1wbGF0ZWAgcmVwcmVzZW50aW5nIHRoZSB0ZW1wbGF0ZSBmb3Igd2hpY2ggdG9cbiAgICogY2FsY3VsYXRlIHRoZSBgU2NvcGVgLCBvciBhIGxpc3Qgb2Ygbm9kZXMgaWYgbm8gb3V0ZXIgdGVtcGxhdGUgb2JqZWN0IGlzIGF2YWlsYWJsZS5cbiAgICogQHBhcmFtIGd1YXJkIGFuIGV4cHJlc3Npb24gdGhhdCBpcyBhcHBsaWVkIHRvIHRoaXMgc2NvcGUgZm9yIHR5cGUgbmFycm93aW5nIHB1cnBvc2VzLlxuICAgKi9cbiAgc3RhdGljIGZvck5vZGVzKFxuICAgICAgdGNiOiBDb250ZXh0LCBwYXJlbnQ6IFNjb3BlfG51bGwsIHRlbXBsYXRlT3JOb2RlczogVG1wbEFzdFRlbXBsYXRlfChUbXBsQXN0Tm9kZVtdKSxcbiAgICAgIGd1YXJkOiB0cy5FeHByZXNzaW9ufG51bGwpOiBTY29wZSB7XG4gICAgY29uc3Qgc2NvcGUgPSBuZXcgU2NvcGUodGNiLCBwYXJlbnQsIGd1YXJkKTtcblxuICAgIGlmIChwYXJlbnQgPT09IG51bGwgJiYgdGNiLmVudi5jb25maWcuZW5hYmxlVGVtcGxhdGVUeXBlQ2hlY2tlcikge1xuICAgICAgLy8gQWRkIGFuIGF1dG9jb21wbGV0aW9uIHBvaW50IGZvciB0aGUgY29tcG9uZW50IGNvbnRleHQuXG4gICAgICBzY29wZS5vcFF1ZXVlLnB1c2gobmV3IFRjYkNvbXBvbmVudENvbnRleHRDb21wbGV0aW9uT3Aoc2NvcGUpKTtcbiAgICB9XG5cbiAgICBsZXQgY2hpbGRyZW46IFRtcGxBc3ROb2RlW107XG5cbiAgICAvLyBJZiBnaXZlbiBhbiBhY3R1YWwgYFRtcGxBc3RUZW1wbGF0ZWAgaW5zdGFuY2UsIHRoZW4gcHJvY2VzcyBhbnkgYWRkaXRpb25hbCBpbmZvcm1hdGlvbiBpdFxuICAgIC8vIGhhcy5cbiAgICBpZiAodGVtcGxhdGVPck5vZGVzIGluc3RhbmNlb2YgVG1wbEFzdFRlbXBsYXRlKSB7XG4gICAgICAvLyBUaGUgdGVtcGxhdGUncyB2YXJpYWJsZSBkZWNsYXJhdGlvbnMgbmVlZCB0byBiZSBhZGRlZCBhcyBgVGNiVmFyaWFibGVPcGBzLlxuICAgICAgY29uc3QgdmFyTWFwID0gbmV3IE1hcDxzdHJpbmcsIFRtcGxBc3RWYXJpYWJsZT4oKTtcblxuICAgICAgZm9yIChjb25zdCB2IG9mIHRlbXBsYXRlT3JOb2Rlcy52YXJpYWJsZXMpIHtcbiAgICAgICAgLy8gVmFsaWRhdGUgdGhhdCB2YXJpYWJsZXMgb24gdGhlIGBUbXBsQXN0VGVtcGxhdGVgIGFyZSBvbmx5IGRlY2xhcmVkIG9uY2UuXG4gICAgICAgIGlmICghdmFyTWFwLmhhcyh2Lm5hbWUpKSB7XG4gICAgICAgICAgdmFyTWFwLnNldCh2Lm5hbWUsIHYpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnN0IGZpcnN0RGVjbCA9IHZhck1hcC5nZXQodi5uYW1lKSE7XG4gICAgICAgICAgdGNiLm9vYlJlY29yZGVyLmR1cGxpY2F0ZVRlbXBsYXRlVmFyKHRjYi5pZCwgdiwgZmlyc3REZWNsKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IG9wSW5kZXggPSBzY29wZS5vcFF1ZXVlLnB1c2gobmV3IFRjYlZhcmlhYmxlT3AodGNiLCBzY29wZSwgdGVtcGxhdGVPck5vZGVzLCB2KSkgLSAxO1xuICAgICAgICBzY29wZS52YXJNYXAuc2V0KHYsIG9wSW5kZXgpO1xuICAgICAgfVxuICAgICAgY2hpbGRyZW4gPSB0ZW1wbGF0ZU9yTm9kZXMuY2hpbGRyZW47XG4gICAgfSBlbHNlIHtcbiAgICAgIGNoaWxkcmVuID0gdGVtcGxhdGVPck5vZGVzO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IG5vZGUgb2YgY2hpbGRyZW4pIHtcbiAgICAgIHNjb3BlLmFwcGVuZE5vZGUobm9kZSk7XG4gICAgfVxuICAgIHJldHVybiBzY29wZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBMb29rIHVwIGEgYHRzLkV4cHJlc3Npb25gIHJlcHJlc2VudGluZyB0aGUgdmFsdWUgb2Ygc29tZSBvcGVyYXRpb24gaW4gdGhlIGN1cnJlbnQgYFNjb3BlYCxcbiAgICogaW5jbHVkaW5nIGFueSBwYXJlbnQgc2NvcGUocykuIFRoaXMgbWV0aG9kIGFsd2F5cyByZXR1cm5zIGEgbXV0YWJsZSBjbG9uZSBvZiB0aGVcbiAgICogYHRzLkV4cHJlc3Npb25gIHdpdGggdGhlIGNvbW1lbnRzIGNsZWFyZWQuXG4gICAqXG4gICAqIEBwYXJhbSBub2RlIGEgYFRtcGxBc3ROb2RlYCBvZiB0aGUgb3BlcmF0aW9uIGluIHF1ZXN0aW9uLiBUaGUgbG9va3VwIHBlcmZvcm1lZCB3aWxsIGRlcGVuZCBvblxuICAgKiB0aGUgdHlwZSBvZiB0aGlzIG5vZGU6XG4gICAqXG4gICAqIEFzc3VtaW5nIGBkaXJlY3RpdmVgIGlzIG5vdCBwcmVzZW50LCB0aGVuIGByZXNvbHZlYCB3aWxsIHJldHVybjpcbiAgICpcbiAgICogKiBgVG1wbEFzdEVsZW1lbnRgIC0gcmV0cmlldmUgdGhlIGV4cHJlc3Npb24gZm9yIHRoZSBlbGVtZW50IERPTSBub2RlXG4gICAqICogYFRtcGxBc3RUZW1wbGF0ZWAgLSByZXRyaWV2ZSB0aGUgdGVtcGxhdGUgY29udGV4dCB2YXJpYWJsZVxuICAgKiAqIGBUbXBsQXN0VmFyaWFibGVgIC0gcmV0cmlldmUgYSB0ZW1wbGF0ZSBsZXQtIHZhcmlhYmxlXG4gICAqICogYFRtcGxBc3RSZWZlcmVuY2VgIC0gcmV0cmlldmUgdmFyaWFibGUgY3JlYXRlZCBmb3IgdGhlIGxvY2FsIHJlZlxuICAgKlxuICAgKiBAcGFyYW0gZGlyZWN0aXZlIGlmIHByZXNlbnQsIGEgZGlyZWN0aXZlIHR5cGUgb24gYSBgVG1wbEFzdEVsZW1lbnRgIG9yIGBUbXBsQXN0VGVtcGxhdGVgIHRvXG4gICAqIGxvb2sgdXAgaW5zdGVhZCBvZiB0aGUgZGVmYXVsdCBmb3IgYW4gZWxlbWVudCBvciB0ZW1wbGF0ZSBub2RlLlxuICAgKi9cbiAgcmVzb2x2ZShcbiAgICAgIG5vZGU6IFRtcGxBc3RFbGVtZW50fFRtcGxBc3RUZW1wbGF0ZXxUbXBsQXN0VmFyaWFibGV8VG1wbEFzdFJlZmVyZW5jZSxcbiAgICAgIGRpcmVjdGl2ZT86IFR5cGVDaGVja2FibGVEaXJlY3RpdmVNZXRhKTogdHMuRXhwcmVzc2lvbiB7XG4gICAgLy8gQXR0ZW1wdCB0byByZXNvbHZlIHRoZSBvcGVyYXRpb24gbG9jYWxseS5cbiAgICBjb25zdCByZXMgPSB0aGlzLnJlc29sdmVMb2NhbChub2RlLCBkaXJlY3RpdmUpO1xuICAgIGlmIChyZXMgIT09IG51bGwpIHtcbiAgICAgIC8vIFdlIHdhbnQgdG8gZ2V0IGEgY2xvbmUgb2YgdGhlIHJlc29sdmVkIGV4cHJlc3Npb24gYW5kIGNsZWFyIHRoZSB0cmFpbGluZyBjb21tZW50c1xuICAgICAgLy8gc28gdGhleSBkb24ndCBjb250aW51ZSB0byBhcHBlYXIgaW4gZXZlcnkgcGxhY2UgdGhlIGV4cHJlc3Npb24gaXMgdXNlZC5cbiAgICAgIC8vIEFzIGFuIGV4YW1wbGUsIHRoaXMgd291bGQgb3RoZXJ3aXNlIHByb2R1Y2U6XG4gICAgICAvLyB2YXIgX3QxIC8qKlQ6RElSKi8gLyoxLDIqLyA9IF9jdG9yMSgpO1xuICAgICAgLy8gX3QxIC8qKlQ6RElSKi8gLyoxLDIqLy5pbnB1dCA9ICd2YWx1ZSc7XG4gICAgICAvL1xuICAgICAgLy8gSW4gYWRkaXRpb24sIHJldHVybmluZyBhIGNsb25lIHByZXZlbnRzIHRoZSBjb25zdW1lciBvZiBgU2NvcGUjcmVzb2x2ZWAgZnJvbVxuICAgICAgLy8gYXR0YWNoaW5nIGNvbW1lbnRzIGF0IHRoZSBkZWNsYXJhdGlvbiBzaXRlLlxuXG4gICAgICBjb25zdCBjbG9uZSA9IHRzLmdldE11dGFibGVDbG9uZShyZXMpO1xuICAgICAgdHMuc2V0U3ludGhldGljVHJhaWxpbmdDb21tZW50cyhjbG9uZSwgW10pO1xuICAgICAgcmV0dXJuIGNsb25lO1xuICAgIH0gZWxzZSBpZiAodGhpcy5wYXJlbnQgIT09IG51bGwpIHtcbiAgICAgIC8vIENoZWNrIHdpdGggdGhlIHBhcmVudC5cbiAgICAgIHJldHVybiB0aGlzLnBhcmVudC5yZXNvbHZlKG5vZGUsIGRpcmVjdGl2ZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgQ291bGQgbm90IHJlc29sdmUgJHtub2RlfSAvICR7ZGlyZWN0aXZlfWApO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBBZGQgYSBzdGF0ZW1lbnQgdG8gdGhpcyBzY29wZS5cbiAgICovXG4gIGFkZFN0YXRlbWVudChzdG10OiB0cy5TdGF0ZW1lbnQpOiB2b2lkIHtcbiAgICB0aGlzLnN0YXRlbWVudHMucHVzaChzdG10KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgdGhlIHN0YXRlbWVudHMuXG4gICAqL1xuICByZW5kZXIoKTogdHMuU3RhdGVtZW50W10ge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5vcFF1ZXVlLmxlbmd0aDsgaSsrKSB7XG4gICAgICAvLyBPcHRpb25hbCBzdGF0ZW1lbnRzIGNhbm5vdCBiZSBza2lwcGVkIHdoZW4gd2UgYXJlIGdlbmVyYXRpbmcgdGhlIFRDQiBmb3IgdXNlXG4gICAgICAvLyBieSB0aGUgVGVtcGxhdGVUeXBlQ2hlY2tlci5cbiAgICAgIGNvbnN0IHNraXBPcHRpb25hbCA9ICF0aGlzLnRjYi5lbnYuY29uZmlnLmVuYWJsZVRlbXBsYXRlVHlwZUNoZWNrZXI7XG4gICAgICB0aGlzLmV4ZWN1dGVPcChpLCBza2lwT3B0aW9uYWwpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5zdGF0ZW1lbnRzO1xuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybnMgYW4gZXhwcmVzc2lvbiBvZiBhbGwgdGVtcGxhdGUgZ3VhcmRzIHRoYXQgYXBwbHkgdG8gdGhpcyBzY29wZSwgaW5jbHVkaW5nIHRob3NlIG9mXG4gICAqIHBhcmVudCBzY29wZXMuIElmIG5vIGd1YXJkcyBoYXZlIGJlZW4gYXBwbGllZCwgbnVsbCBpcyByZXR1cm5lZC5cbiAgICovXG4gIGd1YXJkcygpOiB0cy5FeHByZXNzaW9ufG51bGwge1xuICAgIGxldCBwYXJlbnRHdWFyZHM6IHRzLkV4cHJlc3Npb258bnVsbCA9IG51bGw7XG4gICAgaWYgKHRoaXMucGFyZW50ICE9PSBudWxsKSB7XG4gICAgICAvLyBTdGFydCB3aXRoIHRoZSBndWFyZHMgZnJvbSB0aGUgcGFyZW50IHNjb3BlLCBpZiBwcmVzZW50LlxuICAgICAgcGFyZW50R3VhcmRzID0gdGhpcy5wYXJlbnQuZ3VhcmRzKCk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuZ3VhcmQgPT09IG51bGwpIHtcbiAgICAgIC8vIFRoaXMgc2NvcGUgZG9lcyBub3QgaGF2ZSBhIGd1YXJkLCBzbyByZXR1cm4gdGhlIHBhcmVudCdzIGd1YXJkcyBhcyBpcy5cbiAgICAgIHJldHVybiBwYXJlbnRHdWFyZHM7XG4gICAgfSBlbHNlIGlmIChwYXJlbnRHdWFyZHMgPT09IG51bGwpIHtcbiAgICAgIC8vIFRoZXJlJ3Mgbm8gZ3VhcmRzIGZyb20gdGhlIHBhcmVudCBzY29wZSwgc28gdGhpcyBzY29wZSdzIGd1YXJkIHJlcHJlc2VudHMgYWxsIGF2YWlsYWJsZVxuICAgICAgLy8gZ3VhcmRzLlxuICAgICAgcmV0dXJuIHRoaXMuZ3VhcmQ7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIEJvdGggdGhlIHBhcmVudCBzY29wZSBhbmQgdGhpcyBzY29wZSBwcm92aWRlIGEgZ3VhcmQsIHNvIGNyZWF0ZSBhIGNvbWJpbmF0aW9uIG9mIHRoZSB0d28uXG4gICAgICAvLyBJdCBpcyBpbXBvcnRhbnQgdGhhdCB0aGUgcGFyZW50IGd1YXJkIGlzIHVzZWQgYXMgbGVmdCBvcGVyYW5kLCBnaXZlbiB0aGF0IGl0IG1heSBwcm92aWRlXG4gICAgICAvLyBuYXJyb3dpbmcgdGhhdCBpcyByZXF1aXJlZCBmb3IgdGhpcyBzY29wZSdzIGd1YXJkIHRvIGJlIHZhbGlkLlxuICAgICAgcmV0dXJuIHRzLmNyZWF0ZUJpbmFyeShwYXJlbnRHdWFyZHMsIHRzLlN5bnRheEtpbmQuQW1wZXJzYW5kQW1wZXJzYW5kVG9rZW4sIHRoaXMuZ3VhcmQpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgcmVzb2x2ZUxvY2FsKFxuICAgICAgcmVmOiBUbXBsQXN0RWxlbWVudHxUbXBsQXN0VGVtcGxhdGV8VG1wbEFzdFZhcmlhYmxlfFRtcGxBc3RSZWZlcmVuY2UsXG4gICAgICBkaXJlY3RpdmU/OiBUeXBlQ2hlY2thYmxlRGlyZWN0aXZlTWV0YSk6IHRzLkV4cHJlc3Npb258bnVsbCB7XG4gICAgaWYgKHJlZiBpbnN0YW5jZW9mIFRtcGxBc3RSZWZlcmVuY2UgJiYgdGhpcy5yZWZlcmVuY2VPcE1hcC5oYXMocmVmKSkge1xuICAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZU9wKHRoaXMucmVmZXJlbmNlT3BNYXAuZ2V0KHJlZikhKTtcbiAgICB9IGVsc2UgaWYgKHJlZiBpbnN0YW5jZW9mIFRtcGxBc3RWYXJpYWJsZSAmJiB0aGlzLnZhck1hcC5oYXMocmVmKSkge1xuICAgICAgLy8gUmVzb2x2aW5nIGEgY29udGV4dCB2YXJpYWJsZSBmb3IgdGhpcyB0ZW1wbGF0ZS5cbiAgICAgIC8vIEV4ZWN1dGUgdGhlIGBUY2JWYXJpYWJsZU9wYCBhc3NvY2lhdGVkIHdpdGggdGhlIGBUbXBsQXN0VmFyaWFibGVgLlxuICAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZU9wKHRoaXMudmFyTWFwLmdldChyZWYpISk7XG4gICAgfSBlbHNlIGlmIChcbiAgICAgICAgcmVmIGluc3RhbmNlb2YgVG1wbEFzdFRlbXBsYXRlICYmIGRpcmVjdGl2ZSA9PT0gdW5kZWZpbmVkICYmXG4gICAgICAgIHRoaXMudGVtcGxhdGVDdHhPcE1hcC5oYXMocmVmKSkge1xuICAgICAgLy8gUmVzb2x2aW5nIHRoZSBjb250ZXh0IG9mIHRoZSBnaXZlbiBzdWItdGVtcGxhdGUuXG4gICAgICAvLyBFeGVjdXRlIHRoZSBgVGNiVGVtcGxhdGVDb250ZXh0T3BgIGZvciB0aGUgdGVtcGxhdGUuXG4gICAgICByZXR1cm4gdGhpcy5yZXNvbHZlT3AodGhpcy50ZW1wbGF0ZUN0eE9wTWFwLmdldChyZWYpISk7XG4gICAgfSBlbHNlIGlmIChcbiAgICAgICAgKHJlZiBpbnN0YW5jZW9mIFRtcGxBc3RFbGVtZW50IHx8IHJlZiBpbnN0YW5jZW9mIFRtcGxBc3RUZW1wbGF0ZSkgJiZcbiAgICAgICAgZGlyZWN0aXZlICE9PSB1bmRlZmluZWQgJiYgdGhpcy5kaXJlY3RpdmVPcE1hcC5oYXMocmVmKSkge1xuICAgICAgLy8gUmVzb2x2aW5nIGEgZGlyZWN0aXZlIG9uIGFuIGVsZW1lbnQgb3Igc3ViLXRlbXBsYXRlLlxuICAgICAgY29uc3QgZGlyTWFwID0gdGhpcy5kaXJlY3RpdmVPcE1hcC5nZXQocmVmKSE7XG4gICAgICBpZiAoZGlyTWFwLmhhcyhkaXJlY3RpdmUpKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlc29sdmVPcChkaXJNYXAuZ2V0KGRpcmVjdGl2ZSkhKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAocmVmIGluc3RhbmNlb2YgVG1wbEFzdEVsZW1lbnQgJiYgdGhpcy5lbGVtZW50T3BNYXAuaGFzKHJlZikpIHtcbiAgICAgIC8vIFJlc29sdmluZyB0aGUgRE9NIG5vZGUgb2YgYW4gZWxlbWVudCBpbiB0aGlzIHRlbXBsYXRlLlxuICAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZU9wKHRoaXMuZWxlbWVudE9wTWFwLmdldChyZWYpISk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBMaWtlIGBleGVjdXRlT3BgLCBidXQgYXNzZXJ0IHRoYXQgdGhlIG9wZXJhdGlvbiBhY3R1YWxseSByZXR1cm5lZCBgdHMuRXhwcmVzc2lvbmAuXG4gICAqL1xuICBwcml2YXRlIHJlc29sdmVPcChvcEluZGV4OiBudW1iZXIpOiB0cy5FeHByZXNzaW9uIHtcbiAgICBjb25zdCByZXMgPSB0aGlzLmV4ZWN1dGVPcChvcEluZGV4LCAvKiBza2lwT3B0aW9uYWwgKi8gZmFsc2UpO1xuICAgIGlmIChyZXMgPT09IG51bGwpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgRXJyb3IgcmVzb2x2aW5nIG9wZXJhdGlvbiwgZ290IG51bGxgKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlcztcbiAgfVxuXG4gIC8qKlxuICAgKiBFeGVjdXRlIGEgcGFydGljdWxhciBgVGNiT3BgIGluIHRoZSBgb3BRdWV1ZWAuXG4gICAqXG4gICAqIFRoaXMgbWV0aG9kIHJlcGxhY2VzIHRoZSBvcGVyYXRpb24gaW4gdGhlIGBvcFF1ZXVlYCB3aXRoIHRoZSByZXN1bHQgb2YgZXhlY3V0aW9uIChvbmNlIGRvbmUpXG4gICAqIGFuZCBhbHNvIHByb3RlY3RzIGFnYWluc3QgYSBjaXJjdWxhciBkZXBlbmRlbmN5IGZyb20gdGhlIG9wZXJhdGlvbiB0byBpdHNlbGYgYnkgdGVtcG9yYXJpbHlcbiAgICogc2V0dGluZyB0aGUgb3BlcmF0aW9uJ3MgcmVzdWx0IHRvIGEgc3BlY2lhbCBleHByZXNzaW9uLlxuICAgKi9cbiAgcHJpdmF0ZSBleGVjdXRlT3Aob3BJbmRleDogbnVtYmVyLCBza2lwT3B0aW9uYWw6IGJvb2xlYW4pOiB0cy5FeHByZXNzaW9ufG51bGwge1xuICAgIGNvbnN0IG9wID0gdGhpcy5vcFF1ZXVlW29wSW5kZXhdO1xuICAgIGlmICghKG9wIGluc3RhbmNlb2YgVGNiT3ApKSB7XG4gICAgICByZXR1cm4gb3A7XG4gICAgfVxuXG4gICAgaWYgKHNraXBPcHRpb25hbCAmJiBvcC5vcHRpb25hbCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgLy8gU2V0IHRoZSByZXN1bHQgb2YgdGhlIG9wZXJhdGlvbiBpbiB0aGUgcXVldWUgdG8gaXRzIGNpcmN1bGFyIGZhbGxiYWNrLiBJZiBleGVjdXRpbmcgdGhpc1xuICAgIC8vIG9wZXJhdGlvbiByZXN1bHRzIGluIGEgY2lyY3VsYXIgZGVwZW5kZW5jeSwgdGhpcyB3aWxsIHByZXZlbnQgYW4gaW5maW5pdGUgbG9vcCBhbmQgYWxsb3cgZm9yXG4gICAgLy8gdGhlIHJlc29sdXRpb24gb2Ygc3VjaCBjeWNsZXMuXG4gICAgdGhpcy5vcFF1ZXVlW29wSW5kZXhdID0gb3AuY2lyY3VsYXJGYWxsYmFjaygpO1xuICAgIGNvbnN0IHJlcyA9IG9wLmV4ZWN1dGUoKTtcbiAgICAvLyBPbmNlIHRoZSBvcGVyYXRpb24gaGFzIGZpbmlzaGVkIGV4ZWN1dGluZywgaXQncyBzYWZlIHRvIGNhY2hlIHRoZSByZWFsIHJlc3VsdC5cbiAgICB0aGlzLm9wUXVldWVbb3BJbmRleF0gPSByZXM7XG4gICAgcmV0dXJuIHJlcztcbiAgfVxuXG4gIHByaXZhdGUgYXBwZW5kTm9kZShub2RlOiBUbXBsQXN0Tm9kZSk6IHZvaWQge1xuICAgIGlmIChub2RlIGluc3RhbmNlb2YgVG1wbEFzdEVsZW1lbnQpIHtcbiAgICAgIGNvbnN0IG9wSW5kZXggPSB0aGlzLm9wUXVldWUucHVzaChuZXcgVGNiRWxlbWVudE9wKHRoaXMudGNiLCB0aGlzLCBub2RlKSkgLSAxO1xuICAgICAgdGhpcy5lbGVtZW50T3BNYXAuc2V0KG5vZGUsIG9wSW5kZXgpO1xuICAgICAgdGhpcy5hcHBlbmREaXJlY3RpdmVzQW5kSW5wdXRzT2ZOb2RlKG5vZGUpO1xuICAgICAgdGhpcy5hcHBlbmRPdXRwdXRzT2ZOb2RlKG5vZGUpO1xuICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiBub2RlLmNoaWxkcmVuKSB7XG4gICAgICAgIHRoaXMuYXBwZW5kTm9kZShjaGlsZCk7XG4gICAgICB9XG4gICAgICB0aGlzLmNoZWNrQW5kQXBwZW5kUmVmZXJlbmNlc09mTm9kZShub2RlKTtcbiAgICB9IGVsc2UgaWYgKG5vZGUgaW5zdGFuY2VvZiBUbXBsQXN0VGVtcGxhdGUpIHtcbiAgICAgIC8vIFRlbXBsYXRlIGNoaWxkcmVuIGFyZSByZW5kZXJlZCBpbiBhIGNoaWxkIHNjb3BlLlxuICAgICAgdGhpcy5hcHBlbmREaXJlY3RpdmVzQW5kSW5wdXRzT2ZOb2RlKG5vZGUpO1xuICAgICAgdGhpcy5hcHBlbmRPdXRwdXRzT2ZOb2RlKG5vZGUpO1xuICAgICAgY29uc3QgY3R4SW5kZXggPSB0aGlzLm9wUXVldWUucHVzaChuZXcgVGNiVGVtcGxhdGVDb250ZXh0T3AodGhpcy50Y2IsIHRoaXMpKSAtIDE7XG4gICAgICB0aGlzLnRlbXBsYXRlQ3R4T3BNYXAuc2V0KG5vZGUsIGN0eEluZGV4KTtcbiAgICAgIGlmICh0aGlzLnRjYi5lbnYuY29uZmlnLmNoZWNrVGVtcGxhdGVCb2RpZXMpIHtcbiAgICAgICAgdGhpcy5vcFF1ZXVlLnB1c2gobmV3IFRjYlRlbXBsYXRlQm9keU9wKHRoaXMudGNiLCB0aGlzLCBub2RlKSk7XG4gICAgICB9IGVsc2UgaWYgKHRoaXMudGNiLmVudi5jb25maWcuYWx3YXlzQ2hlY2tTY2hlbWFJblRlbXBsYXRlQm9kaWVzKSB7XG4gICAgICAgIHRoaXMuYXBwZW5kRGVlcFNjaGVtYUNoZWNrcyhub2RlLmNoaWxkcmVuKTtcbiAgICAgIH1cbiAgICAgIHRoaXMuY2hlY2tBbmRBcHBlbmRSZWZlcmVuY2VzT2ZOb2RlKG5vZGUpO1xuICAgIH0gZWxzZSBpZiAobm9kZSBpbnN0YW5jZW9mIFRtcGxBc3RCb3VuZFRleHQpIHtcbiAgICAgIHRoaXMub3BRdWV1ZS5wdXNoKG5ldyBUY2JUZXh0SW50ZXJwb2xhdGlvbk9wKHRoaXMudGNiLCB0aGlzLCBub2RlKSk7XG4gICAgfSBlbHNlIGlmIChub2RlIGluc3RhbmNlb2YgVG1wbEFzdEljdSkge1xuICAgICAgdGhpcy5hcHBlbmRJY3VFeHByZXNzaW9ucyhub2RlKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGNoZWNrQW5kQXBwZW5kUmVmZXJlbmNlc09mTm9kZShub2RlOiBUbXBsQXN0RWxlbWVudHxUbXBsQXN0VGVtcGxhdGUpOiB2b2lkIHtcbiAgICBmb3IgKGNvbnN0IHJlZiBvZiBub2RlLnJlZmVyZW5jZXMpIHtcbiAgICAgIGNvbnN0IHRhcmdldCA9IHRoaXMudGNiLmJvdW5kVGFyZ2V0LmdldFJlZmVyZW5jZVRhcmdldChyZWYpO1xuXG4gICAgICBsZXQgY3R4SW5kZXg6IG51bWJlcjtcbiAgICAgIGlmICh0YXJnZXQgPT09IG51bGwpIHtcbiAgICAgICAgLy8gVGhlIHJlZmVyZW5jZSBpcyBpbnZhbGlkIGlmIGl0IGRvZXNuJ3QgaGF2ZSBhIHRhcmdldCwgc28gcmVwb3J0IGl0IGFzIGFuIGVycm9yLlxuICAgICAgICB0aGlzLnRjYi5vb2JSZWNvcmRlci5taXNzaW5nUmVmZXJlbmNlVGFyZ2V0KHRoaXMudGNiLmlkLCByZWYpO1xuXG4gICAgICAgIC8vIEFueSB1c2FnZXMgb2YgdGhlIGludmFsaWQgcmVmZXJlbmNlIHdpbGwgYmUgcmVzb2x2ZWQgdG8gYSB2YXJpYWJsZSBvZiB0eXBlIGFueS5cbiAgICAgICAgY3R4SW5kZXggPSB0aGlzLm9wUXVldWUucHVzaChuZXcgVGNiSW52YWxpZFJlZmVyZW5jZU9wKHRoaXMudGNiLCB0aGlzKSkgLSAxO1xuICAgICAgfSBlbHNlIGlmICh0YXJnZXQgaW5zdGFuY2VvZiBUbXBsQXN0VGVtcGxhdGUgfHwgdGFyZ2V0IGluc3RhbmNlb2YgVG1wbEFzdEVsZW1lbnQpIHtcbiAgICAgICAgY3R4SW5kZXggPSB0aGlzLm9wUXVldWUucHVzaChuZXcgVGNiUmVmZXJlbmNlT3AodGhpcy50Y2IsIHRoaXMsIHJlZiwgbm9kZSwgdGFyZ2V0KSkgLSAxO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY3R4SW5kZXggPVxuICAgICAgICAgICAgdGhpcy5vcFF1ZXVlLnB1c2gobmV3IFRjYlJlZmVyZW5jZU9wKHRoaXMudGNiLCB0aGlzLCByZWYsIG5vZGUsIHRhcmdldC5kaXJlY3RpdmUpKSAtIDE7XG4gICAgICB9XG4gICAgICB0aGlzLnJlZmVyZW5jZU9wTWFwLnNldChyZWYsIGN0eEluZGV4KTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFwcGVuZERpcmVjdGl2ZXNBbmRJbnB1dHNPZk5vZGUobm9kZTogVG1wbEFzdEVsZW1lbnR8VG1wbEFzdFRlbXBsYXRlKTogdm9pZCB7XG4gICAgLy8gQ29sbGVjdCBhbGwgdGhlIGlucHV0cyBvbiB0aGUgZWxlbWVudC5cbiAgICBjb25zdCBjbGFpbWVkSW5wdXRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgY29uc3QgZGlyZWN0aXZlcyA9IHRoaXMudGNiLmJvdW5kVGFyZ2V0LmdldERpcmVjdGl2ZXNPZk5vZGUobm9kZSk7XG4gICAgaWYgKGRpcmVjdGl2ZXMgPT09IG51bGwgfHwgZGlyZWN0aXZlcy5sZW5ndGggPT09IDApIHtcbiAgICAgIC8vIElmIHRoZXJlIGFyZSBubyBkaXJlY3RpdmVzLCB0aGVuIGFsbCBpbnB1dHMgYXJlIHVuY2xhaW1lZCBpbnB1dHMsIHNvIHF1ZXVlIGFuIG9wZXJhdGlvblxuICAgICAgLy8gdG8gYWRkIHRoZW0gaWYgbmVlZGVkLlxuICAgICAgaWYgKG5vZGUgaW5zdGFuY2VvZiBUbXBsQXN0RWxlbWVudCkge1xuICAgICAgICB0aGlzLm9wUXVldWUucHVzaChuZXcgVGNiVW5jbGFpbWVkSW5wdXRzT3AodGhpcy50Y2IsIHRoaXMsIG5vZGUsIGNsYWltZWRJbnB1dHMpKTtcbiAgICAgICAgdGhpcy5vcFF1ZXVlLnB1c2goXG4gICAgICAgICAgICBuZXcgVGNiRG9tU2NoZW1hQ2hlY2tlck9wKHRoaXMudGNiLCBub2RlLCAvKiBjaGVja0VsZW1lbnQgKi8gdHJ1ZSwgY2xhaW1lZElucHV0cykpO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGRpck1hcCA9IG5ldyBNYXA8VHlwZUNoZWNrYWJsZURpcmVjdGl2ZU1ldGEsIG51bWJlcj4oKTtcbiAgICBmb3IgKGNvbnN0IGRpciBvZiBkaXJlY3RpdmVzKSB7XG4gICAgICBsZXQgZGlyZWN0aXZlT3A6IFRjYk9wO1xuICAgICAgY29uc3QgaG9zdCA9IHRoaXMudGNiLmVudi5yZWZsZWN0b3I7XG4gICAgICBjb25zdCBkaXJSZWYgPSBkaXIucmVmIGFzIFJlZmVyZW5jZTxDbGFzc0RlY2xhcmF0aW9uPHRzLkNsYXNzRGVjbGFyYXRpb24+PjtcblxuICAgICAgaWYgKCFkaXIuaXNHZW5lcmljKSB7XG4gICAgICAgIC8vIFRoZSBtb3N0IGNvbW1vbiBjYXNlIGlzIHRoYXQgd2hlbiBhIGRpcmVjdGl2ZSBpcyBub3QgZ2VuZXJpYywgd2UgdXNlIHRoZSBub3JtYWxcbiAgICAgICAgLy8gYFRjYk5vbkRpcmVjdGl2ZVR5cGVPcGAuXG4gICAgICAgIGRpcmVjdGl2ZU9wID0gbmV3IFRjYk5vbkdlbmVyaWNEaXJlY3RpdmVUeXBlT3AodGhpcy50Y2IsIHRoaXMsIG5vZGUsIGRpcik7XG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgICFyZXF1aXJlc0lubGluZVR5cGVDdG9yKGRpclJlZi5ub2RlLCBob3N0KSB8fFxuICAgICAgICAgIHRoaXMudGNiLmVudi5jb25maWcudXNlSW5saW5lVHlwZUNvbnN0cnVjdG9ycykge1xuICAgICAgICAvLyBGb3IgZ2VuZXJpYyBkaXJlY3RpdmVzLCB3ZSB1c2UgYSB0eXBlIGNvbnN0cnVjdG9yIHRvIGluZmVyIHR5cGVzLiBJZiBhIGRpcmVjdGl2ZSByZXF1aXJlc1xuICAgICAgICAvLyBhbiBpbmxpbmUgdHlwZSBjb25zdHJ1Y3RvciwgdGhlbiBpbmxpbmluZyBtdXN0IGJlIGF2YWlsYWJsZSB0byB1c2UgdGhlXG4gICAgICAgIC8vIGBUY2JEaXJlY3RpdmVDdG9yT3BgLiBJZiBub3Qgd2UsIHdlIGZhbGxiYWNrIHRvIHVzaW5nIGBhbnlgIOKAkyBzZWUgYmVsb3cuXG4gICAgICAgIGRpcmVjdGl2ZU9wID0gbmV3IFRjYkRpcmVjdGl2ZUN0b3JPcCh0aGlzLnRjYiwgdGhpcywgbm9kZSwgZGlyKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIElmIGlubGluaW5nIGlzIG5vdCBhdmFpbGFibGUsIHRoZW4gd2UgZ2l2ZSB1cCBvbiBpbmZlcmluZyB0aGUgZ2VuZXJpYyBwYXJhbXMsIGFuZCB1c2VcbiAgICAgICAgLy8gYGFueWAgdHlwZSBmb3IgdGhlIGRpcmVjdGl2ZSdzIGdlbmVyaWMgcGFyYW1ldGVycy5cbiAgICAgICAgZGlyZWN0aXZlT3AgPSBuZXcgVGNiR2VuZXJpY0RpcmVjdGl2ZVR5cGVXaXRoQW55UGFyYW1zT3AodGhpcy50Y2IsIHRoaXMsIG5vZGUsIGRpcik7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGRpckluZGV4ID0gdGhpcy5vcFF1ZXVlLnB1c2goZGlyZWN0aXZlT3ApIC0gMTtcbiAgICAgIGRpck1hcC5zZXQoZGlyLCBkaXJJbmRleCk7XG5cbiAgICAgIHRoaXMub3BRdWV1ZS5wdXNoKG5ldyBUY2JEaXJlY3RpdmVJbnB1dHNPcCh0aGlzLnRjYiwgdGhpcywgbm9kZSwgZGlyKSk7XG4gICAgfVxuICAgIHRoaXMuZGlyZWN0aXZlT3BNYXAuc2V0KG5vZGUsIGRpck1hcCk7XG5cbiAgICAvLyBBZnRlciBleHBhbmRpbmcgdGhlIGRpcmVjdGl2ZXMsIHdlIG1pZ2h0IG5lZWQgdG8gcXVldWUgYW4gb3BlcmF0aW9uIHRvIGNoZWNrIGFueSB1bmNsYWltZWRcbiAgICAvLyBpbnB1dHMuXG4gICAgaWYgKG5vZGUgaW5zdGFuY2VvZiBUbXBsQXN0RWxlbWVudCkge1xuICAgICAgLy8gR28gdGhyb3VnaCB0aGUgZGlyZWN0aXZlcyBhbmQgcmVtb3ZlIGFueSBpbnB1dHMgdGhhdCBpdCBjbGFpbXMgZnJvbSBgZWxlbWVudElucHV0c2AuXG4gICAgICBmb3IgKGNvbnN0IGRpciBvZiBkaXJlY3RpdmVzKSB7XG4gICAgICAgIGZvciAoY29uc3QgcHJvcGVydHlOYW1lIG9mIGRpci5pbnB1dHMucHJvcGVydHlOYW1lcykge1xuICAgICAgICAgIGNsYWltZWRJbnB1dHMuYWRkKHByb3BlcnR5TmFtZSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgdGhpcy5vcFF1ZXVlLnB1c2gobmV3IFRjYlVuY2xhaW1lZElucHV0c09wKHRoaXMudGNiLCB0aGlzLCBub2RlLCBjbGFpbWVkSW5wdXRzKSk7XG4gICAgICAvLyBJZiB0aGVyZSBhcmUgbm8gZGlyZWN0aXZlcyB3aGljaCBtYXRjaCB0aGlzIGVsZW1lbnQsIHRoZW4gaXQncyBhIFwicGxhaW5cIiBET00gZWxlbWVudCAob3IgYVxuICAgICAgLy8gd2ViIGNvbXBvbmVudCksIGFuZCBzaG91bGQgYmUgY2hlY2tlZCBhZ2FpbnN0IHRoZSBET00gc2NoZW1hLiBJZiBhbnkgZGlyZWN0aXZlcyBtYXRjaCxcbiAgICAgIC8vIHdlIG11c3QgYXNzdW1lIHRoYXQgdGhlIGVsZW1lbnQgY291bGQgYmUgY3VzdG9tIChlaXRoZXIgYSBjb21wb25lbnQsIG9yIGEgZGlyZWN0aXZlIGxpa2VcbiAgICAgIC8vIDxyb3V0ZXItb3V0bGV0PikgYW5kIHNob3VsZG4ndCB2YWxpZGF0ZSB0aGUgZWxlbWVudCBuYW1lIGl0c2VsZi5cbiAgICAgIGNvbnN0IGNoZWNrRWxlbWVudCA9IGRpcmVjdGl2ZXMubGVuZ3RoID09PSAwO1xuICAgICAgdGhpcy5vcFF1ZXVlLnB1c2gobmV3IFRjYkRvbVNjaGVtYUNoZWNrZXJPcCh0aGlzLnRjYiwgbm9kZSwgY2hlY2tFbGVtZW50LCBjbGFpbWVkSW5wdXRzKSk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhcHBlbmRPdXRwdXRzT2ZOb2RlKG5vZGU6IFRtcGxBc3RFbGVtZW50fFRtcGxBc3RUZW1wbGF0ZSk6IHZvaWQge1xuICAgIC8vIENvbGxlY3QgYWxsIHRoZSBvdXRwdXRzIG9uIHRoZSBlbGVtZW50LlxuICAgIGNvbnN0IGNsYWltZWRPdXRwdXRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgY29uc3QgZGlyZWN0aXZlcyA9IHRoaXMudGNiLmJvdW5kVGFyZ2V0LmdldERpcmVjdGl2ZXNPZk5vZGUobm9kZSk7XG4gICAgaWYgKGRpcmVjdGl2ZXMgPT09IG51bGwgfHwgZGlyZWN0aXZlcy5sZW5ndGggPT09IDApIHtcbiAgICAgIC8vIElmIHRoZXJlIGFyZSBubyBkaXJlY3RpdmVzLCB0aGVuIGFsbCBvdXRwdXRzIGFyZSB1bmNsYWltZWQgb3V0cHV0cywgc28gcXVldWUgYW4gb3BlcmF0aW9uXG4gICAgICAvLyB0byBhZGQgdGhlbSBpZiBuZWVkZWQuXG4gICAgICBpZiAobm9kZSBpbnN0YW5jZW9mIFRtcGxBc3RFbGVtZW50KSB7XG4gICAgICAgIHRoaXMub3BRdWV1ZS5wdXNoKG5ldyBUY2JVbmNsYWltZWRPdXRwdXRzT3AodGhpcy50Y2IsIHRoaXMsIG5vZGUsIGNsYWltZWRPdXRwdXRzKSk7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gUXVldWUgb3BlcmF0aW9ucyBmb3IgYWxsIGRpcmVjdGl2ZXMgdG8gY2hlY2sgdGhlIHJlbGV2YW50IG91dHB1dHMgZm9yIGEgZGlyZWN0aXZlLlxuICAgIGZvciAoY29uc3QgZGlyIG9mIGRpcmVjdGl2ZXMpIHtcbiAgICAgIHRoaXMub3BRdWV1ZS5wdXNoKG5ldyBUY2JEaXJlY3RpdmVPdXRwdXRzT3AodGhpcy50Y2IsIHRoaXMsIG5vZGUsIGRpcikpO1xuICAgIH1cblxuICAgIC8vIEFmdGVyIGV4cGFuZGluZyB0aGUgZGlyZWN0aXZlcywgd2UgbWlnaHQgbmVlZCB0byBxdWV1ZSBhbiBvcGVyYXRpb24gdG8gY2hlY2sgYW55IHVuY2xhaW1lZFxuICAgIC8vIG91dHB1dHMuXG4gICAgaWYgKG5vZGUgaW5zdGFuY2VvZiBUbXBsQXN0RWxlbWVudCkge1xuICAgICAgLy8gR28gdGhyb3VnaCB0aGUgZGlyZWN0aXZlcyBhbmQgcmVnaXN0ZXIgYW55IG91dHB1dHMgdGhhdCBpdCBjbGFpbXMgaW4gYGNsYWltZWRPdXRwdXRzYC5cbiAgICAgIGZvciAoY29uc3QgZGlyIG9mIGRpcmVjdGl2ZXMpIHtcbiAgICAgICAgZm9yIChjb25zdCBvdXRwdXRQcm9wZXJ0eSBvZiBkaXIub3V0cHV0cy5wcm9wZXJ0eU5hbWVzKSB7XG4gICAgICAgICAgY2xhaW1lZE91dHB1dHMuYWRkKG91dHB1dFByb3BlcnR5KTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICB0aGlzLm9wUXVldWUucHVzaChuZXcgVGNiVW5jbGFpbWVkT3V0cHV0c09wKHRoaXMudGNiLCB0aGlzLCBub2RlLCBjbGFpbWVkT3V0cHV0cykpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXBwZW5kRGVlcFNjaGVtYUNoZWNrcyhub2RlczogVG1wbEFzdE5vZGVbXSk6IHZvaWQge1xuICAgIGZvciAoY29uc3Qgbm9kZSBvZiBub2Rlcykge1xuICAgICAgaWYgKCEobm9kZSBpbnN0YW5jZW9mIFRtcGxBc3RFbGVtZW50IHx8IG5vZGUgaW5zdGFuY2VvZiBUbXBsQXN0VGVtcGxhdGUpKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAobm9kZSBpbnN0YW5jZW9mIFRtcGxBc3RFbGVtZW50KSB7XG4gICAgICAgIGNvbnN0IGNsYWltZWRJbnB1dHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICAgICAgY29uc3QgZGlyZWN0aXZlcyA9IHRoaXMudGNiLmJvdW5kVGFyZ2V0LmdldERpcmVjdGl2ZXNPZk5vZGUobm9kZSk7XG4gICAgICAgIGxldCBoYXNEaXJlY3RpdmVzOiBib29sZWFuO1xuICAgICAgICBpZiAoZGlyZWN0aXZlcyA9PT0gbnVsbCB8fCBkaXJlY3RpdmVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIGhhc0RpcmVjdGl2ZXMgPSBmYWxzZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBoYXNEaXJlY3RpdmVzID0gdHJ1ZTtcbiAgICAgICAgICBmb3IgKGNvbnN0IGRpciBvZiBkaXJlY3RpdmVzKSB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHByb3BlcnR5TmFtZSBvZiBkaXIuaW5wdXRzLnByb3BlcnR5TmFtZXMpIHtcbiAgICAgICAgICAgICAgY2xhaW1lZElucHV0cy5hZGQocHJvcGVydHlOYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5vcFF1ZXVlLnB1c2gobmV3IFRjYkRvbVNjaGVtYUNoZWNrZXJPcCh0aGlzLnRjYiwgbm9kZSwgIWhhc0RpcmVjdGl2ZXMsIGNsYWltZWRJbnB1dHMpKTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5hcHBlbmREZWVwU2NoZW1hQ2hlY2tzKG5vZGUuY2hpbGRyZW4pO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXBwZW5kSWN1RXhwcmVzc2lvbnMobm9kZTogVG1wbEFzdEljdSk6IHZvaWQge1xuICAgIGZvciAoY29uc3QgdmFyaWFibGUgb2YgT2JqZWN0LnZhbHVlcyhub2RlLnZhcnMpKSB7XG4gICAgICB0aGlzLm9wUXVldWUucHVzaChuZXcgVGNiVGV4dEludGVycG9sYXRpb25PcCh0aGlzLnRjYiwgdGhpcywgdmFyaWFibGUpKTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBwbGFjZWhvbGRlciBvZiBPYmplY3QudmFsdWVzKG5vZGUucGxhY2Vob2xkZXJzKSkge1xuICAgICAgaWYgKHBsYWNlaG9sZGVyIGluc3RhbmNlb2YgVG1wbEFzdEJvdW5kVGV4dCkge1xuICAgICAgICB0aGlzLm9wUXVldWUucHVzaChuZXcgVGNiVGV4dEludGVycG9sYXRpb25PcCh0aGlzLnRjYiwgdGhpcywgcGxhY2Vob2xkZXIpKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxuaW50ZXJmYWNlIFRjYkJvdW5kSW5wdXQge1xuICBhdHRyaWJ1dGU6IFRtcGxBc3RCb3VuZEF0dHJpYnV0ZXxUbXBsQXN0VGV4dEF0dHJpYnV0ZTtcbiAgZmllbGROYW1lczogQ2xhc3NQcm9wZXJ0eU5hbWVbXTtcbn1cblxuLyoqXG4gKiBDcmVhdGUgdGhlIGBjdHhgIHBhcmFtZXRlciB0byB0aGUgdG9wLWxldmVsIFRDQiBmdW5jdGlvbiwgd2l0aCB0aGUgZ2l2ZW4gZ2VuZXJpYyB0eXBlIGFyZ3VtZW50cy5cbiAqL1xuZnVuY3Rpb24gdGNiQ3R4UGFyYW0oXG4gICAgbm9kZTogQ2xhc3NEZWNsYXJhdGlvbjx0cy5DbGFzc0RlY2xhcmF0aW9uPiwgbmFtZTogdHMuRW50aXR5TmFtZSxcbiAgICB0eXBlQXJndW1lbnRzOiB0cy5UeXBlTm9kZVtdfHVuZGVmaW5lZCk6IHRzLlBhcmFtZXRlckRlY2xhcmF0aW9uIHtcbiAgY29uc3QgdHlwZSA9IHRzLmZhY3RvcnkuY3JlYXRlVHlwZVJlZmVyZW5jZU5vZGUobmFtZSwgdHlwZUFyZ3VtZW50cyk7XG4gIHJldHVybiB0cy5mYWN0b3J5LmNyZWF0ZVBhcmFtZXRlckRlY2xhcmF0aW9uKFxuICAgICAgLyogZGVjb3JhdG9ycyAqLyB1bmRlZmluZWQsXG4gICAgICAvKiBtb2RpZmllcnMgKi8gdW5kZWZpbmVkLFxuICAgICAgLyogZG90RG90RG90VG9rZW4gKi8gdW5kZWZpbmVkLFxuICAgICAgLyogbmFtZSAqLyAnY3R4JyxcbiAgICAgIC8qIHF1ZXN0aW9uVG9rZW4gKi8gdW5kZWZpbmVkLFxuICAgICAgLyogdHlwZSAqLyB0eXBlLFxuICAgICAgLyogaW5pdGlhbGl6ZXIgKi8gdW5kZWZpbmVkKTtcbn1cblxuLyoqXG4gKiBQcm9jZXNzIGFuIGBBU1RgIGV4cHJlc3Npb24gYW5kIGNvbnZlcnQgaXQgaW50byBhIGB0cy5FeHByZXNzaW9uYCwgZ2VuZXJhdGluZyByZWZlcmVuY2VzIHRvIHRoZVxuICogY29ycmVjdCBpZGVudGlmaWVycyBpbiB0aGUgY3VycmVudCBzY29wZS5cbiAqL1xuZnVuY3Rpb24gdGNiRXhwcmVzc2lvbihhc3Q6IEFTVCwgdGNiOiBDb250ZXh0LCBzY29wZTogU2NvcGUpOiB0cy5FeHByZXNzaW9uIHtcbiAgY29uc3QgdHJhbnNsYXRvciA9IG5ldyBUY2JFeHByZXNzaW9uVHJhbnNsYXRvcih0Y2IsIHNjb3BlKTtcbiAgcmV0dXJuIHRyYW5zbGF0b3IudHJhbnNsYXRlKGFzdCk7XG59XG5cbmNsYXNzIFRjYkV4cHJlc3Npb25UcmFuc2xhdG9yIHtcbiAgY29uc3RydWN0b3IocHJvdGVjdGVkIHRjYjogQ29udGV4dCwgcHJvdGVjdGVkIHNjb3BlOiBTY29wZSkge31cblxuICB0cmFuc2xhdGUoYXN0OiBBU1QpOiB0cy5FeHByZXNzaW9uIHtcbiAgICAvLyBgYXN0VG9UeXBlc2NyaXB0YCBhY3R1YWxseSBkb2VzIHRoZSBjb252ZXJzaW9uLiBBIHNwZWNpYWwgcmVzb2x2ZXIgYHRjYlJlc29sdmVgIGlzIHBhc3NlZFxuICAgIC8vIHdoaWNoIGludGVycHJldHMgc3BlY2lmaWMgZXhwcmVzc2lvbiBub2RlcyB0aGF0IGludGVyYWN0IHdpdGggdGhlIGBJbXBsaWNpdFJlY2VpdmVyYC4gVGhlc2VcbiAgICAvLyBub2RlcyBhY3R1YWxseSByZWZlciB0byBpZGVudGlmaWVycyB3aXRoaW4gdGhlIGN1cnJlbnQgc2NvcGUuXG4gICAgcmV0dXJuIGFzdFRvVHlwZXNjcmlwdChhc3QsIGFzdCA9PiB0aGlzLnJlc29sdmUoYXN0KSwgdGhpcy50Y2IuZW52LmNvbmZpZyk7XG4gIH1cblxuICAvKipcbiAgICogUmVzb2x2ZSBhbiBgQVNUYCBleHByZXNzaW9uIHdpdGhpbiB0aGUgZ2l2ZW4gc2NvcGUuXG4gICAqXG4gICAqIFNvbWUgYEFTVGAgZXhwcmVzc2lvbnMgcmVmZXIgdG8gdG9wLWxldmVsIGNvbmNlcHRzIChyZWZlcmVuY2VzLCB2YXJpYWJsZXMsIHRoZSBjb21wb25lbnRcbiAgICogY29udGV4dCkuIFRoaXMgbWV0aG9kIGFzc2lzdHMgaW4gcmVzb2x2aW5nIHRob3NlLlxuICAgKi9cbiAgcHJvdGVjdGVkIHJlc29sdmUoYXN0OiBBU1QpOiB0cy5FeHByZXNzaW9ufG51bGwge1xuICAgIGlmIChhc3QgaW5zdGFuY2VvZiBQcm9wZXJ0eVJlYWQgJiYgYXN0LnJlY2VpdmVyIGluc3RhbmNlb2YgSW1wbGljaXRSZWNlaXZlcikge1xuICAgICAgLy8gVHJ5IHRvIHJlc29sdmUgYSBib3VuZCB0YXJnZXQgZm9yIHRoaXMgZXhwcmVzc2lvbi4gSWYgbm8gc3VjaCB0YXJnZXQgaXMgYXZhaWxhYmxlLCB0aGVuXG4gICAgICAvLyB0aGUgZXhwcmVzc2lvbiBpcyByZWZlcmVuY2luZyB0aGUgdG9wLWxldmVsIGNvbXBvbmVudCBjb250ZXh0LiBJbiB0aGF0IGNhc2UsIGBudWxsYCBpc1xuICAgICAgLy8gcmV0dXJuZWQgaGVyZSB0byBsZXQgaXQgZmFsbCB0aHJvdWdoIHJlc29sdXRpb24gc28gaXQgd2lsbCBiZSBjYXVnaHQgd2hlbiB0aGVcbiAgICAgIC8vIGBJbXBsaWNpdFJlY2VpdmVyYCBpcyByZXNvbHZlZCBpbiB0aGUgYnJhbmNoIGJlbG93LlxuICAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZVRhcmdldChhc3QpO1xuICAgIH0gZWxzZSBpZiAoYXN0IGluc3RhbmNlb2YgUHJvcGVydHlXcml0ZSAmJiBhc3QucmVjZWl2ZXIgaW5zdGFuY2VvZiBJbXBsaWNpdFJlY2VpdmVyKSB7XG4gICAgICBjb25zdCB0YXJnZXQgPSB0aGlzLnJlc29sdmVUYXJnZXQoYXN0KTtcbiAgICAgIGlmICh0YXJnZXQgPT09IG51bGwpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGV4cHIgPSB0aGlzLnRyYW5zbGF0ZShhc3QudmFsdWUpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gdHMuY3JlYXRlUGFyZW4odHMuY3JlYXRlQmluYXJ5KHRhcmdldCwgdHMuU3ludGF4S2luZC5FcXVhbHNUb2tlbiwgZXhwcikpO1xuICAgICAgYWRkUGFyc2VTcGFuSW5mbyhyZXN1bHQsIGFzdC5zb3VyY2VTcGFuKTtcbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSBlbHNlIGlmIChhc3QgaW5zdGFuY2VvZiBJbXBsaWNpdFJlY2VpdmVyKSB7XG4gICAgICAvLyBBU1QgaW5zdGFuY2VzIHJlcHJlc2VudGluZyB2YXJpYWJsZXMgYW5kIHJlZmVyZW5jZXMgbG9vayB2ZXJ5IHNpbWlsYXIgdG8gcHJvcGVydHkgcmVhZHNcbiAgICAgIC8vIG9yIG1ldGhvZCBjYWxscyBmcm9tIHRoZSBjb21wb25lbnQgY29udGV4dDogYm90aCBoYXZlIHRoZSBzaGFwZVxuICAgICAgLy8gUHJvcGVydHlSZWFkKEltcGxpY2l0UmVjZWl2ZXIsICdwcm9wTmFtZScpIG9yIE1ldGhvZENhbGwoSW1wbGljaXRSZWNlaXZlciwgJ21ldGhvZE5hbWUnKS5cbiAgICAgIC8vXG4gICAgICAvLyBgdHJhbnNsYXRlYCB3aWxsIGZpcnN0IHRyeSB0byBgcmVzb2x2ZWAgdGhlIG91dGVyIFByb3BlcnR5UmVhZC9NZXRob2RDYWxsLiBJZiB0aGlzIHdvcmtzLFxuICAgICAgLy8gaXQncyBiZWNhdXNlIHRoZSBgQm91bmRUYXJnZXRgIGZvdW5kIGFuIGV4cHJlc3Npb24gdGFyZ2V0IGZvciB0aGUgd2hvbGUgZXhwcmVzc2lvbiwgYW5kXG4gICAgICAvLyB0aGVyZWZvcmUgYHRyYW5zbGF0ZWAgd2lsbCBuZXZlciBhdHRlbXB0IHRvIGByZXNvbHZlYCB0aGUgSW1wbGljaXRSZWNlaXZlciBvZiB0aGF0XG4gICAgICAvLyBQcm9wZXJ0eVJlYWQvTWV0aG9kQ2FsbC5cbiAgICAgIC8vXG4gICAgICAvLyBUaGVyZWZvcmUgaWYgYHJlc29sdmVgIGlzIGNhbGxlZCBvbiBhbiBgSW1wbGljaXRSZWNlaXZlcmAsIGl0J3MgYmVjYXVzZSBubyBvdXRlclxuICAgICAgLy8gUHJvcGVydHlSZWFkL01ldGhvZENhbGwgcmVzb2x2ZWQgdG8gYSB2YXJpYWJsZSBvciByZWZlcmVuY2UsIGFuZCB0aGVyZWZvcmUgdGhpcyBpcyBhXG4gICAgICAvLyBwcm9wZXJ0eSByZWFkIG9yIG1ldGhvZCBjYWxsIG9uIHRoZSBjb21wb25lbnQgY29udGV4dCBpdHNlbGYuXG4gICAgICByZXR1cm4gdHMuY3JlYXRlSWRlbnRpZmllcignY3R4Jyk7XG4gICAgfSBlbHNlIGlmIChhc3QgaW5zdGFuY2VvZiBCaW5kaW5nUGlwZSkge1xuICAgICAgY29uc3QgZXhwciA9IHRoaXMudHJhbnNsYXRlKGFzdC5leHApO1xuICAgICAgY29uc3QgcGlwZVJlZiA9IHRoaXMudGNiLmdldFBpcGVCeU5hbWUoYXN0Lm5hbWUpO1xuICAgICAgbGV0IHBpcGU6IHRzLkV4cHJlc3Npb258bnVsbDtcbiAgICAgIGlmIChwaXBlUmVmID09PSBudWxsKSB7XG4gICAgICAgIC8vIE5vIHBpcGUgYnkgdGhhdCBuYW1lIGV4aXN0cyBpbiBzY29wZS4gUmVjb3JkIHRoaXMgYXMgYW4gZXJyb3IuXG4gICAgICAgIHRoaXMudGNiLm9vYlJlY29yZGVyLm1pc3NpbmdQaXBlKHRoaXMudGNiLmlkLCBhc3QpO1xuXG4gICAgICAgIC8vIFVzZSBhbiAnYW55JyB2YWx1ZSB0byBhdCBsZWFzdCBhbGxvdyB0aGUgcmVzdCBvZiB0aGUgZXhwcmVzc2lvbiB0byBiZSBjaGVja2VkLlxuICAgICAgICBwaXBlID0gTlVMTF9BU19BTlk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBVc2UgYSB2YXJpYWJsZSBkZWNsYXJlZCBhcyB0aGUgcGlwZSdzIHR5cGUuXG4gICAgICAgIHBpcGUgPSB0aGlzLnRjYi5lbnYucGlwZUluc3QocGlwZVJlZik7XG4gICAgICB9XG4gICAgICBjb25zdCBhcmdzID0gYXN0LmFyZ3MubWFwKGFyZyA9PiB0aGlzLnRyYW5zbGF0ZShhcmcpKTtcbiAgICAgIGxldCBtZXRob2RBY2Nlc3M6IHRzLkV4cHJlc3Npb24gPVxuICAgICAgICAgIHRzLmZhY3RvcnkuY3JlYXRlUHJvcGVydHlBY2Nlc3NFeHByZXNzaW9uKHBpcGUsICd0cmFuc2Zvcm0nKTtcbiAgICAgIGFkZFBhcnNlU3BhbkluZm8obWV0aG9kQWNjZXNzLCBhc3QubmFtZVNwYW4pO1xuICAgICAgaWYgKCF0aGlzLnRjYi5lbnYuY29uZmlnLmNoZWNrVHlwZU9mUGlwZXMpIHtcbiAgICAgICAgbWV0aG9kQWNjZXNzID0gdHMuZmFjdG9yeS5jcmVhdGVBc0V4cHJlc3Npb24oXG4gICAgICAgICAgICBtZXRob2RBY2Nlc3MsIHRzLmZhY3RvcnkuY3JlYXRlS2V5d29yZFR5cGVOb2RlKHRzLlN5bnRheEtpbmQuQW55S2V5d29yZCkpO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZXN1bHQgPSB0cy5jcmVhdGVDYWxsKFxuICAgICAgICAgIC8qIGV4cHJlc3Npb24gKi8gbWV0aG9kQWNjZXNzLFxuICAgICAgICAgIC8qIHR5cGVBcmd1bWVudHMgKi8gdW5kZWZpbmVkLFxuICAgICAgICAgIC8qIGFyZ3VtZW50c0FycmF5ICovW2V4cHIsIC4uLmFyZ3NdKTtcbiAgICAgIGFkZFBhcnNlU3BhbkluZm8ocmVzdWx0LCBhc3Quc291cmNlU3Bhbik7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICAgIGFzdCBpbnN0YW5jZW9mIE1ldGhvZENhbGwgJiYgYXN0LnJlY2VpdmVyIGluc3RhbmNlb2YgSW1wbGljaXRSZWNlaXZlciAmJlxuICAgICAgICAhKGFzdC5yZWNlaXZlciBpbnN0YW5jZW9mIFRoaXNSZWNlaXZlcikpIHtcbiAgICAgIC8vIFJlc29sdmUgdGhlIHNwZWNpYWwgYCRhbnkoZXhwcilgIHN5bnRheCB0byBpbnNlcnQgYSBjYXN0IG9mIHRoZSBhcmd1bWVudCB0byB0eXBlIGBhbnlgLlxuICAgICAgLy8gYCRhbnkoZXhwcilgIC0+IGBleHByIGFzIGFueWBcbiAgICAgIGlmIChhc3QubmFtZSA9PT0gJyRhbnknICYmIGFzdC5hcmdzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICBjb25zdCBleHByID0gdGhpcy50cmFuc2xhdGUoYXN0LmFyZ3NbMF0pO1xuICAgICAgICBjb25zdCBleHByQXNBbnkgPVxuICAgICAgICAgICAgdHMuY3JlYXRlQXNFeHByZXNzaW9uKGV4cHIsIHRzLmNyZWF0ZUtleXdvcmRUeXBlTm9kZSh0cy5TeW50YXhLaW5kLkFueUtleXdvcmQpKTtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gdHMuY3JlYXRlUGFyZW4oZXhwckFzQW55KTtcbiAgICAgICAgYWRkUGFyc2VTcGFuSW5mbyhyZXN1bHQsIGFzdC5zb3VyY2VTcGFuKTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgIH1cblxuICAgICAgLy8gQXR0ZW1wdCB0byByZXNvbHZlIGEgYm91bmQgdGFyZ2V0IGZvciB0aGUgbWV0aG9kLCBhbmQgZ2VuZXJhdGUgdGhlIG1ldGhvZCBjYWxsIGlmIGEgdGFyZ2V0XG4gICAgICAvLyBjb3VsZCBiZSByZXNvbHZlZC4gSWYgbm8gdGFyZ2V0IGlzIGF2YWlsYWJsZSwgdGhlbiB0aGUgbWV0aG9kIGlzIHJlZmVyZW5jaW5nIHRoZSB0b3AtbGV2ZWxcbiAgICAgIC8vIGNvbXBvbmVudCBjb250ZXh0LCBpbiB3aGljaCBjYXNlIGBudWxsYCBpcyByZXR1cm5lZCB0byBsZXQgdGhlIGBJbXBsaWNpdFJlY2VpdmVyYCBiZWluZ1xuICAgICAgLy8gcmVzb2x2ZWQgdG8gdGhlIGNvbXBvbmVudCBjb250ZXh0LlxuICAgICAgY29uc3QgcmVjZWl2ZXIgPSB0aGlzLnJlc29sdmVUYXJnZXQoYXN0KTtcbiAgICAgIGlmIChyZWNlaXZlciA9PT0gbnVsbCkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cblxuICAgICAgY29uc3QgbWV0aG9kID0gd3JhcEZvckRpYWdub3N0aWNzKHJlY2VpdmVyKTtcbiAgICAgIGFkZFBhcnNlU3BhbkluZm8obWV0aG9kLCBhc3QubmFtZVNwYW4pO1xuICAgICAgY29uc3QgYXJncyA9IGFzdC5hcmdzLm1hcChhcmcgPT4gdGhpcy50cmFuc2xhdGUoYXJnKSk7XG4gICAgICBjb25zdCBub2RlID0gdHMuY3JlYXRlQ2FsbChtZXRob2QsIHVuZGVmaW5lZCwgYXJncyk7XG4gICAgICBhZGRQYXJzZVNwYW5JbmZvKG5vZGUsIGFzdC5zb3VyY2VTcGFuKTtcbiAgICAgIHJldHVybiBub2RlO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBUaGlzIEFTVCBpc24ndCBzcGVjaWFsIGFmdGVyIGFsbC5cbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBBdHRlbXB0cyB0byByZXNvbHZlIGEgYm91bmQgdGFyZ2V0IGZvciBhIGdpdmVuIGV4cHJlc3Npb24sIGFuZCB0cmFuc2xhdGVzIGl0IGludG8gdGhlXG4gICAqIGFwcHJvcHJpYXRlIGB0cy5FeHByZXNzaW9uYCB0aGF0IHJlcHJlc2VudHMgdGhlIGJvdW5kIHRhcmdldC4gSWYgbm8gdGFyZ2V0IGlzIGF2YWlsYWJsZSxcbiAgICogYG51bGxgIGlzIHJldHVybmVkLlxuICAgKi9cbiAgcHJvdGVjdGVkIHJlc29sdmVUYXJnZXQoYXN0OiBBU1QpOiB0cy5FeHByZXNzaW9ufG51bGwge1xuICAgIGNvbnN0IGJpbmRpbmcgPSB0aGlzLnRjYi5ib3VuZFRhcmdldC5nZXRFeHByZXNzaW9uVGFyZ2V0KGFzdCk7XG4gICAgaWYgKGJpbmRpbmcgPT09IG51bGwpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGNvbnN0IGV4cHIgPSB0aGlzLnNjb3BlLnJlc29sdmUoYmluZGluZyk7XG4gICAgYWRkUGFyc2VTcGFuSW5mbyhleHByLCBhc3Quc291cmNlU3Bhbik7XG4gICAgcmV0dXJuIGV4cHI7XG4gIH1cbn1cblxuLyoqXG4gKiBDYWxsIHRoZSB0eXBlIGNvbnN0cnVjdG9yIG9mIGEgZGlyZWN0aXZlIGluc3RhbmNlIG9uIGEgZ2l2ZW4gdGVtcGxhdGUgbm9kZSwgaW5mZXJyaW5nIGEgdHlwZSBmb3JcbiAqIHRoZSBkaXJlY3RpdmUgaW5zdGFuY2UgZnJvbSBhbnkgYm91bmQgaW5wdXRzLlxuICovXG5mdW5jdGlvbiB0Y2JDYWxsVHlwZUN0b3IoXG4gICAgZGlyOiBUeXBlQ2hlY2thYmxlRGlyZWN0aXZlTWV0YSwgdGNiOiBDb250ZXh0LCBpbnB1dHM6IFRjYkRpcmVjdGl2ZUlucHV0W10pOiB0cy5FeHByZXNzaW9uIHtcbiAgY29uc3QgdHlwZUN0b3IgPSB0Y2IuZW52LnR5cGVDdG9yRm9yKGRpcik7XG5cbiAgLy8gQ29uc3RydWN0IGFuIGFycmF5IG9mIGB0cy5Qcm9wZXJ0eUFzc2lnbm1lbnRgcyBmb3IgZWFjaCBvZiB0aGUgZGlyZWN0aXZlJ3MgaW5wdXRzLlxuICBjb25zdCBtZW1iZXJzID0gaW5wdXRzLm1hcChpbnB1dCA9PiB7XG4gICAgY29uc3QgcHJvcGVydHlOYW1lID0gdHMuY3JlYXRlU3RyaW5nTGl0ZXJhbChpbnB1dC5maWVsZCk7XG5cbiAgICBpZiAoaW5wdXQudHlwZSA9PT0gJ2JpbmRpbmcnKSB7XG4gICAgICAvLyBGb3IgYm91bmQgaW5wdXRzLCB0aGUgcHJvcGVydHkgaXMgYXNzaWduZWQgdGhlIGJpbmRpbmcgZXhwcmVzc2lvbi5cbiAgICAgIGxldCBleHByID0gaW5wdXQuZXhwcmVzc2lvbjtcbiAgICAgIGlmICghdGNiLmVudi5jb25maWcuY2hlY2tUeXBlT2ZJbnB1dEJpbmRpbmdzKSB7XG4gICAgICAgIC8vIElmIGNoZWNraW5nIHRoZSB0eXBlIG9mIGJpbmRpbmdzIGlzIGRpc2FibGVkLCBjYXN0IHRoZSByZXN1bHRpbmcgZXhwcmVzc2lvbiB0byAnYW55J1xuICAgICAgICAvLyBiZWZvcmUgdGhlIGFzc2lnbm1lbnQuXG4gICAgICAgIGV4cHIgPSB0c0Nhc3RUb0FueShleHByKTtcbiAgICAgIH0gZWxzZSBpZiAoIXRjYi5lbnYuY29uZmlnLnN0cmljdE51bGxJbnB1dEJpbmRpbmdzKSB7XG4gICAgICAgIC8vIElmIHN0cmljdCBudWxsIGNoZWNrcyBhcmUgZGlzYWJsZWQsIGVyYXNlIGBudWxsYCBhbmQgYHVuZGVmaW5lZGAgZnJvbSB0aGUgdHlwZSBieVxuICAgICAgICAvLyB3cmFwcGluZyB0aGUgZXhwcmVzc2lvbiBpbiBhIG5vbi1udWxsIGFzc2VydGlvbi5cbiAgICAgICAgZXhwciA9IHRzLmNyZWF0ZU5vbk51bGxFeHByZXNzaW9uKGV4cHIpO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBhc3NpZ25tZW50ID0gdHMuY3JlYXRlUHJvcGVydHlBc3NpZ25tZW50KHByb3BlcnR5TmFtZSwgd3JhcEZvckRpYWdub3N0aWNzKGV4cHIpKTtcbiAgICAgIGFkZFBhcnNlU3BhbkluZm8oYXNzaWdubWVudCwgaW5wdXQuc291cmNlU3Bhbik7XG4gICAgICByZXR1cm4gYXNzaWdubWVudDtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gQSB0eXBlIGNvbnN0cnVjdG9yIGlzIHJlcXVpcmVkIHRvIGJlIGNhbGxlZCB3aXRoIGFsbCBpbnB1dCBwcm9wZXJ0aWVzLCBzbyBhbnkgdW5zZXRcbiAgICAgIC8vIGlucHV0cyBhcmUgc2ltcGx5IGFzc2lnbmVkIGEgdmFsdWUgb2YgdHlwZSBgYW55YCB0byBpZ25vcmUgdGhlbS5cbiAgICAgIHJldHVybiB0cy5jcmVhdGVQcm9wZXJ0eUFzc2lnbm1lbnQocHJvcGVydHlOYW1lLCBOVUxMX0FTX0FOWSk7XG4gICAgfVxuICB9KTtcblxuICAvLyBDYWxsIHRoZSBgbmdUeXBlQ3RvcmAgbWV0aG9kIG9uIHRoZSBkaXJlY3RpdmUgY2xhc3MsIHdpdGggYW4gb2JqZWN0IGxpdGVyYWwgYXJndW1lbnQgY3JlYXRlZFxuICAvLyBmcm9tIHRoZSBtYXRjaGVkIGlucHV0cy5cbiAgcmV0dXJuIHRzLmNyZWF0ZUNhbGwoXG4gICAgICAvKiBleHByZXNzaW9uICovIHR5cGVDdG9yLFxuICAgICAgLyogdHlwZUFyZ3VtZW50cyAqLyB1bmRlZmluZWQsXG4gICAgICAvKiBhcmd1bWVudHNBcnJheSAqL1t0cy5jcmVhdGVPYmplY3RMaXRlcmFsKG1lbWJlcnMpXSk7XG59XG5cbmZ1bmN0aW9uIGdldEJvdW5kSW5wdXRzKFxuICAgIGRpcmVjdGl2ZTogVHlwZUNoZWNrYWJsZURpcmVjdGl2ZU1ldGEsIG5vZGU6IFRtcGxBc3RUZW1wbGF0ZXxUbXBsQXN0RWxlbWVudCxcbiAgICB0Y2I6IENvbnRleHQpOiBUY2JCb3VuZElucHV0W10ge1xuICBjb25zdCBib3VuZElucHV0czogVGNiQm91bmRJbnB1dFtdID0gW107XG5cbiAgY29uc3QgcHJvY2Vzc0F0dHJpYnV0ZSA9IChhdHRyOiBUbXBsQXN0Qm91bmRBdHRyaWJ1dGV8VG1wbEFzdFRleHRBdHRyaWJ1dGUpID0+IHtcbiAgICAvLyBTa2lwIG5vbi1wcm9wZXJ0eSBiaW5kaW5ncy5cbiAgICBpZiAoYXR0ciBpbnN0YW5jZW9mIFRtcGxBc3RCb3VuZEF0dHJpYnV0ZSAmJiBhdHRyLnR5cGUgIT09IEJpbmRpbmdUeXBlLlByb3BlcnR5KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gU2tpcCB0aGUgYXR0cmlidXRlIGlmIHRoZSBkaXJlY3RpdmUgZG9lcyBub3QgaGF2ZSBhbiBpbnB1dCBmb3IgaXQuXG4gICAgY29uc3QgaW5wdXRzID0gZGlyZWN0aXZlLmlucHV0cy5nZXRCeUJpbmRpbmdQcm9wZXJ0eU5hbWUoYXR0ci5uYW1lKTtcbiAgICBpZiAoaW5wdXRzID09PSBudWxsKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGZpZWxkTmFtZXMgPSBpbnB1dHMubWFwKGlucHV0ID0+IGlucHV0LmNsYXNzUHJvcGVydHlOYW1lKTtcbiAgICBib3VuZElucHV0cy5wdXNoKHthdHRyaWJ1dGU6IGF0dHIsIGZpZWxkTmFtZXN9KTtcbiAgfTtcblxuICBub2RlLmlucHV0cy5mb3JFYWNoKHByb2Nlc3NBdHRyaWJ1dGUpO1xuICBub2RlLmF0dHJpYnV0ZXMuZm9yRWFjaChwcm9jZXNzQXR0cmlidXRlKTtcbiAgaWYgKG5vZGUgaW5zdGFuY2VvZiBUbXBsQXN0VGVtcGxhdGUpIHtcbiAgICBub2RlLnRlbXBsYXRlQXR0cnMuZm9yRWFjaChwcm9jZXNzQXR0cmlidXRlKTtcbiAgfVxuXG4gIHJldHVybiBib3VuZElucHV0cztcbn1cblxuLyoqXG4gKiBUcmFuc2xhdGVzIHRoZSBnaXZlbiBhdHRyaWJ1dGUgYmluZGluZyB0byBhIGB0cy5FeHByZXNzaW9uYC5cbiAqL1xuZnVuY3Rpb24gdHJhbnNsYXRlSW5wdXQoXG4gICAgYXR0cjogVG1wbEFzdEJvdW5kQXR0cmlidXRlfFRtcGxBc3RUZXh0QXR0cmlidXRlLCB0Y2I6IENvbnRleHQsIHNjb3BlOiBTY29wZSk6IHRzLkV4cHJlc3Npb24ge1xuICBpZiAoYXR0ciBpbnN0YW5jZW9mIFRtcGxBc3RCb3VuZEF0dHJpYnV0ZSkge1xuICAgIC8vIFByb2R1Y2UgYW4gZXhwcmVzc2lvbiByZXByZXNlbnRpbmcgdGhlIHZhbHVlIG9mIHRoZSBiaW5kaW5nLlxuICAgIHJldHVybiB0Y2JFeHByZXNzaW9uKGF0dHIudmFsdWUsIHRjYiwgc2NvcGUpO1xuICB9IGVsc2Uge1xuICAgIC8vIEZvciByZWd1bGFyIGF0dHJpYnV0ZXMgd2l0aCBhIHN0YXRpYyBzdHJpbmcgdmFsdWUsIHVzZSB0aGUgcmVwcmVzZW50ZWQgc3RyaW5nIGxpdGVyYWwuXG4gICAgcmV0dXJuIHRzLmNyZWF0ZVN0cmluZ0xpdGVyYWwoYXR0ci52YWx1ZSk7XG4gIH1cbn1cblxuLyoqXG4gKiBBbiBpbnB1dCBiaW5kaW5nIHRoYXQgY29ycmVzcG9uZHMgd2l0aCBhIGZpZWxkIG9mIGEgZGlyZWN0aXZlLlxuICovXG5pbnRlcmZhY2UgVGNiRGlyZWN0aXZlQm91bmRJbnB1dCB7XG4gIHR5cGU6ICdiaW5kaW5nJztcblxuICAvKipcbiAgICogVGhlIG5hbWUgb2YgYSBmaWVsZCBvbiB0aGUgZGlyZWN0aXZlIHRoYXQgaXMgc2V0LlxuICAgKi9cbiAgZmllbGQ6IHN0cmluZztcblxuICAvKipcbiAgICogVGhlIGB0cy5FeHByZXNzaW9uYCBjb3JyZXNwb25kaW5nIHdpdGggdGhlIGlucHV0IGJpbmRpbmcgZXhwcmVzc2lvbi5cbiAgICovXG4gIGV4cHJlc3Npb246IHRzLkV4cHJlc3Npb247XG5cbiAgLyoqXG4gICAqIFRoZSBzb3VyY2Ugc3BhbiBvZiB0aGUgZnVsbCBhdHRyaWJ1dGUgYmluZGluZy5cbiAgICovXG4gIHNvdXJjZVNwYW46IFBhcnNlU291cmNlU3Bhbjtcbn1cblxuLyoqXG4gKiBJbmRpY2F0ZXMgdGhhdCBhIGNlcnRhaW4gZmllbGQgb2YgYSBkaXJlY3RpdmUgZG9lcyBub3QgaGF2ZSBhIGNvcnJlc3BvbmRpbmcgaW5wdXQgYmluZGluZy5cbiAqL1xuaW50ZXJmYWNlIFRjYkRpcmVjdGl2ZVVuc2V0SW5wdXQge1xuICB0eXBlOiAndW5zZXQnO1xuXG4gIC8qKlxuICAgKiBUaGUgbmFtZSBvZiBhIGZpZWxkIG9uIHRoZSBkaXJlY3RpdmUgZm9yIHdoaWNoIG5vIGlucHV0IGJpbmRpbmcgaXMgcHJlc2VudC5cbiAgICovXG4gIGZpZWxkOiBzdHJpbmc7XG59XG5cbnR5cGUgVGNiRGlyZWN0aXZlSW5wdXQgPSBUY2JEaXJlY3RpdmVCb3VuZElucHV0fFRjYkRpcmVjdGl2ZVVuc2V0SW5wdXQ7XG5cbmNvbnN0IEVWRU5UX1BBUkFNRVRFUiA9ICckZXZlbnQnO1xuXG5jb25zdCBlbnVtIEV2ZW50UGFyYW1UeXBlIHtcbiAgLyogR2VuZXJhdGVzIGNvZGUgdG8gaW5mZXIgdGhlIHR5cGUgb2YgYCRldmVudGAgYmFzZWQgb24gaG93IHRoZSBsaXN0ZW5lciBpcyByZWdpc3RlcmVkLiAqL1xuICBJbmZlcixcblxuICAvKiBEZWNsYXJlcyB0aGUgdHlwZSBvZiB0aGUgYCRldmVudGAgcGFyYW1ldGVyIGFzIGBhbnlgLiAqL1xuICBBbnksXG59XG5cbi8qKlxuICogQ3JlYXRlcyBhbiBhcnJvdyBmdW5jdGlvbiB0byBiZSB1c2VkIGFzIGhhbmRsZXIgZnVuY3Rpb24gZm9yIGV2ZW50IGJpbmRpbmdzLiBUaGUgaGFuZGxlclxuICogZnVuY3Rpb24gaGFzIGEgc2luZ2xlIHBhcmFtZXRlciBgJGV2ZW50YCBhbmQgdGhlIGJvdW5kIGV2ZW50J3MgaGFuZGxlciBgQVNUYCByZXByZXNlbnRlZCBhcyBhXG4gKiBUeXBlU2NyaXB0IGV4cHJlc3Npb24gYXMgaXRzIGJvZHkuXG4gKlxuICogV2hlbiBgZXZlbnRUeXBlYCBpcyBzZXQgdG8gYEluZmVyYCwgdGhlIGAkZXZlbnRgIHBhcmFtZXRlciB3aWxsIG5vdCBoYXZlIGFuIGV4cGxpY2l0IHR5cGUuIFRoaXNcbiAqIGFsbG93cyBmb3IgdGhlIGNyZWF0ZWQgaGFuZGxlciBmdW5jdGlvbiB0byBoYXZlIGl0cyBgJGV2ZW50YCBwYXJhbWV0ZXIncyB0eXBlIGluZmVycmVkIGJhc2VkIG9uXG4gKiBob3cgaXQncyB1c2VkLCB0byBlbmFibGUgc3RyaWN0IHR5cGUgY2hlY2tpbmcgb2YgZXZlbnQgYmluZGluZ3MuIFdoZW4gc2V0IHRvIGBBbnlgLCB0aGUgYCRldmVudGBcbiAqIHBhcmFtZXRlciB3aWxsIGhhdmUgYW4gZXhwbGljaXQgYGFueWAgdHlwZSwgZWZmZWN0aXZlbHkgZGlzYWJsaW5nIHN0cmljdCB0eXBlIGNoZWNraW5nIG9mIGV2ZW50XG4gKiBiaW5kaW5ncy4gQWx0ZXJuYXRpdmVseSwgYW4gZXhwbGljaXQgdHlwZSBjYW4gYmUgcGFzc2VkIGZvciB0aGUgYCRldmVudGAgcGFyYW1ldGVyLlxuICovXG5mdW5jdGlvbiB0Y2JDcmVhdGVFdmVudEhhbmRsZXIoXG4gICAgZXZlbnQ6IFRtcGxBc3RCb3VuZEV2ZW50LCB0Y2I6IENvbnRleHQsIHNjb3BlOiBTY29wZSxcbiAgICBldmVudFR5cGU6IEV2ZW50UGFyYW1UeXBlfHRzLlR5cGVOb2RlKTogdHMuRXhwcmVzc2lvbiB7XG4gIGNvbnN0IGhhbmRsZXIgPSB0Y2JFdmVudEhhbmRsZXJFeHByZXNzaW9uKGV2ZW50LmhhbmRsZXIsIHRjYiwgc2NvcGUpO1xuXG4gIGxldCBldmVudFBhcmFtVHlwZTogdHMuVHlwZU5vZGV8dW5kZWZpbmVkO1xuICBpZiAoZXZlbnRUeXBlID09PSBFdmVudFBhcmFtVHlwZS5JbmZlcikge1xuICAgIGV2ZW50UGFyYW1UeXBlID0gdW5kZWZpbmVkO1xuICB9IGVsc2UgaWYgKGV2ZW50VHlwZSA9PT0gRXZlbnRQYXJhbVR5cGUuQW55KSB7XG4gICAgZXZlbnRQYXJhbVR5cGUgPSB0cy5jcmVhdGVLZXl3b3JkVHlwZU5vZGUodHMuU3ludGF4S2luZC5BbnlLZXl3b3JkKTtcbiAgfSBlbHNlIHtcbiAgICBldmVudFBhcmFtVHlwZSA9IGV2ZW50VHlwZTtcbiAgfVxuXG4gIC8vIE9idGFpbiBhbGwgZ3VhcmRzIHRoYXQgaGF2ZSBiZWVuIGFwcGxpZWQgdG8gdGhlIHNjb3BlIGFuZCBpdHMgcGFyZW50cywgYXMgdGhleSBoYXZlIHRvIGJlXG4gIC8vIHJlcGVhdGVkIHdpdGhpbiB0aGUgaGFuZGxlciBmdW5jdGlvbiBmb3IgdGhlaXIgbmFycm93aW5nIHRvIGJlIGluIGVmZmVjdCB3aXRoaW4gdGhlIGhhbmRsZXIuXG4gIGNvbnN0IGd1YXJkcyA9IHNjb3BlLmd1YXJkcygpO1xuXG4gIGxldCBib2R5OiB0cy5TdGF0ZW1lbnQgPSB0cy5jcmVhdGVFeHByZXNzaW9uU3RhdGVtZW50KGhhbmRsZXIpO1xuICBpZiAoZ3VhcmRzICE9PSBudWxsKSB7XG4gICAgLy8gV3JhcCB0aGUgYm9keSBpbiBhbiBgaWZgIHN0YXRlbWVudCBjb250YWluaW5nIGFsbCBndWFyZHMgdGhhdCBoYXZlIHRvIGJlIGFwcGxpZWQuXG4gICAgYm9keSA9IHRzLmNyZWF0ZUlmKGd1YXJkcywgYm9keSk7XG4gIH1cblxuICBjb25zdCBldmVudFBhcmFtID0gdHMuY3JlYXRlUGFyYW1ldGVyKFxuICAgICAgLyogZGVjb3JhdG9ycyAqLyB1bmRlZmluZWQsXG4gICAgICAvKiBtb2RpZmllcnMgKi8gdW5kZWZpbmVkLFxuICAgICAgLyogZG90RG90RG90VG9rZW4gKi8gdW5kZWZpbmVkLFxuICAgICAgLyogbmFtZSAqLyBFVkVOVF9QQVJBTUVURVIsXG4gICAgICAvKiBxdWVzdGlvblRva2VuICovIHVuZGVmaW5lZCxcbiAgICAgIC8qIHR5cGUgKi8gZXZlbnRQYXJhbVR5cGUpO1xuICBhZGRFeHByZXNzaW9uSWRlbnRpZmllcihldmVudFBhcmFtLCBFeHByZXNzaW9uSWRlbnRpZmllci5FVkVOVF9QQVJBTUVURVIpO1xuXG4gIHJldHVybiB0cy5jcmVhdGVGdW5jdGlvbkV4cHJlc3Npb24oXG4gICAgICAvKiBtb2RpZmllciAqLyB1bmRlZmluZWQsXG4gICAgICAvKiBhc3Rlcmlza1Rva2VuICovIHVuZGVmaW5lZCxcbiAgICAgIC8qIG5hbWUgKi8gdW5kZWZpbmVkLFxuICAgICAgLyogdHlwZVBhcmFtZXRlcnMgKi8gdW5kZWZpbmVkLFxuICAgICAgLyogcGFyYW1ldGVycyAqL1tldmVudFBhcmFtXSxcbiAgICAgIC8qIHR5cGUgKi8gdHMuY3JlYXRlS2V5d29yZFR5cGVOb2RlKHRzLlN5bnRheEtpbmQuQW55S2V5d29yZCksXG4gICAgICAvKiBib2R5ICovIHRzLmNyZWF0ZUJsb2NrKFtib2R5XSkpO1xufVxuXG4vKipcbiAqIFNpbWlsYXIgdG8gYHRjYkV4cHJlc3Npb25gLCB0aGlzIGZ1bmN0aW9uIGNvbnZlcnRzIHRoZSBwcm92aWRlZCBgQVNUYCBleHByZXNzaW9uIGludG8gYVxuICogYHRzLkV4cHJlc3Npb25gLCB3aXRoIHNwZWNpYWwgaGFuZGxpbmcgb2YgdGhlIGAkZXZlbnRgIHZhcmlhYmxlIHRoYXQgY2FuIGJlIHVzZWQgd2l0aGluIGV2ZW50XG4gKiBiaW5kaW5ncy5cbiAqL1xuZnVuY3Rpb24gdGNiRXZlbnRIYW5kbGVyRXhwcmVzc2lvbihhc3Q6IEFTVCwgdGNiOiBDb250ZXh0LCBzY29wZTogU2NvcGUpOiB0cy5FeHByZXNzaW9uIHtcbiAgY29uc3QgdHJhbnNsYXRvciA9IG5ldyBUY2JFdmVudEhhbmRsZXJUcmFuc2xhdG9yKHRjYiwgc2NvcGUpO1xuICByZXR1cm4gdHJhbnNsYXRvci50cmFuc2xhdGUoYXN0KTtcbn1cblxuZnVuY3Rpb24gaXNTcGxpdFR3b1dheUJpbmRpbmcoXG4gICAgaW5wdXROYW1lOiBzdHJpbmcsIG91dHB1dDogVG1wbEFzdEJvdW5kRXZlbnQsIGlucHV0czogVG1wbEFzdEJvdW5kQXR0cmlidXRlW10sIHRjYjogQ29udGV4dCkge1xuICBjb25zdCBpbnB1dCA9IGlucHV0cy5maW5kKGlucHV0ID0+IGlucHV0Lm5hbWUgPT09IGlucHV0TmFtZSk7XG4gIGlmIChpbnB1dCA9PT0gdW5kZWZpbmVkIHx8IGlucHV0LnNvdXJjZVNwYW4gIT09IG91dHB1dC5zb3VyY2VTcGFuKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIC8vIElucHV0IGNvbnN1bWVyIHNob3VsZCBiZSBhIGRpcmVjdGl2ZSBiZWNhdXNlIGl0J3MgY2xhaW1lZFxuICBjb25zdCBpbnB1dENvbnN1bWVyID0gdGNiLmJvdW5kVGFyZ2V0LmdldENvbnN1bWVyT2ZCaW5kaW5nKGlucHV0KSBhcyBUeXBlQ2hlY2thYmxlRGlyZWN0aXZlTWV0YTtcbiAgY29uc3Qgb3V0cHV0Q29uc3VtZXIgPSB0Y2IuYm91bmRUYXJnZXQuZ2V0Q29uc3VtZXJPZkJpbmRpbmcob3V0cHV0KTtcbiAgaWYgKG91dHB1dENvbnN1bWVyID09PSBudWxsIHx8IGlucHV0Q29uc3VtZXIucmVmID09PSB1bmRlZmluZWQgfHxcbiAgICAgIG91dHB1dENvbnN1bWVyIGluc3RhbmNlb2YgVG1wbEFzdFRlbXBsYXRlKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGlmIChvdXRwdXRDb25zdW1lciBpbnN0YW5jZW9mIFRtcGxBc3RFbGVtZW50KSB7XG4gICAgdGNiLm9vYlJlY29yZGVyLnNwbGl0VHdvV2F5QmluZGluZyhcbiAgICAgICAgdGNiLmlkLCBpbnB1dCwgb3V0cHV0LCBpbnB1dENvbnN1bWVyLnJlZi5ub2RlLCBvdXRwdXRDb25zdW1lcik7XG4gICAgcmV0dXJuIHRydWU7XG4gIH0gZWxzZSBpZiAob3V0cHV0Q29uc3VtZXIucmVmICE9PSBpbnB1dENvbnN1bWVyLnJlZikge1xuICAgIHRjYi5vb2JSZWNvcmRlci5zcGxpdFR3b1dheUJpbmRpbmcoXG4gICAgICAgIHRjYi5pZCwgaW5wdXQsIG91dHB1dCwgaW5wdXRDb25zdW1lci5yZWYubm9kZSwgb3V0cHV0Q29uc3VtZXIucmVmLm5vZGUpO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG4gIHJldHVybiBmYWxzZTtcbn1cblxuY2xhc3MgVGNiRXZlbnRIYW5kbGVyVHJhbnNsYXRvciBleHRlbmRzIFRjYkV4cHJlc3Npb25UcmFuc2xhdG9yIHtcbiAgcHJvdGVjdGVkIG92ZXJyaWRlIHJlc29sdmUoYXN0OiBBU1QpOiB0cy5FeHByZXNzaW9ufG51bGwge1xuICAgIC8vIFJlY29nbml6ZSBhIHByb3BlcnR5IHJlYWQgb24gdGhlIGltcGxpY2l0IHJlY2VpdmVyIGNvcnJlc3BvbmRpbmcgd2l0aCB0aGUgZXZlbnQgcGFyYW1ldGVyXG4gICAgLy8gdGhhdCBpcyBhdmFpbGFibGUgaW4gZXZlbnQgYmluZGluZ3MuIFNpbmNlIHRoaXMgdmFyaWFibGUgaXMgYSBwYXJhbWV0ZXIgb2YgdGhlIGhhbmRsZXJcbiAgICAvLyBmdW5jdGlvbiB0aGF0IHRoZSBjb252ZXJ0ZWQgZXhwcmVzc2lvbiBiZWNvbWVzIGEgY2hpbGQgb2YsIGp1c3QgY3JlYXRlIGEgcmVmZXJlbmNlIHRvIHRoZVxuICAgIC8vIHBhcmFtZXRlciBieSBpdHMgbmFtZS5cbiAgICBpZiAoYXN0IGluc3RhbmNlb2YgUHJvcGVydHlSZWFkICYmIGFzdC5yZWNlaXZlciBpbnN0YW5jZW9mIEltcGxpY2l0UmVjZWl2ZXIgJiZcbiAgICAgICAgIShhc3QucmVjZWl2ZXIgaW5zdGFuY2VvZiBUaGlzUmVjZWl2ZXIpICYmIGFzdC5uYW1lID09PSBFVkVOVF9QQVJBTUVURVIpIHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gdHMuY3JlYXRlSWRlbnRpZmllcihFVkVOVF9QQVJBTUVURVIpO1xuICAgICAgYWRkUGFyc2VTcGFuSW5mbyhldmVudCwgYXN0Lm5hbWVTcGFuKTtcbiAgICAgIHJldHVybiBldmVudDtcbiAgICB9XG5cbiAgICByZXR1cm4gc3VwZXIucmVzb2x2ZShhc3QpO1xuICB9XG59XG4iXX0=