/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { rendererTypeName, tokenReference, viewClassName } from '../compile_metadata';
import { BindingForm, convertActionBinding, convertPropertyBinding, convertPropertyBindingBuiltins, EventHandlerVars } from '../compiler_util/expression_converter';
import { ChangeDetectionStrategy } from '../core';
import { Identifiers } from '../identifiers';
import { LifecycleHooks } from '../lifecycle_reflector';
import { isNgContainer } from '../ml_parser/tags';
import * as o from '../output/output_ast';
import { convertValueToOutputAst } from '../output/value_util';
import { ElementAst, EmbeddedTemplateAst, NgContentAst, templateVisitAll } from '../template_parser/template_ast';
import { componentFactoryResolverProviderDef, depDef, lifecycleHookToNodeFlag, providerDef } from './provider_compiler';
const CLASS_ATTR = 'class';
const STYLE_ATTR = 'style';
const IMPLICIT_TEMPLATE_VAR = '$implicit';
export class ViewCompileResult {
    constructor(viewClassVar, rendererTypeVar) {
        this.viewClassVar = viewClassVar;
        this.rendererTypeVar = rendererTypeVar;
    }
}
export class ViewCompiler {
    constructor(_reflector) {
        this._reflector = _reflector;
    }
    compileComponent(outputCtx, component, template, styles, usedPipes) {
        let embeddedViewCount = 0;
        let renderComponentVarName = undefined;
        if (!component.isHost) {
            const template = component.template;
            const customRenderData = [];
            if (template.animations && template.animations.length) {
                customRenderData.push(new o.LiteralMapEntry('animation', convertValueToOutputAst(outputCtx, template.animations), true));
            }
            const renderComponentVar = o.variable(rendererTypeName(component.type.reference));
            renderComponentVarName = renderComponentVar.name;
            outputCtx.statements.push(renderComponentVar
                .set(o.importExpr(Identifiers.createRendererType2).callFn([new o.LiteralMapExpr([
                    new o.LiteralMapEntry('encapsulation', o.literal(template.encapsulation), false),
                    new o.LiteralMapEntry('styles', styles, false),
                    new o.LiteralMapEntry('data', new o.LiteralMapExpr(customRenderData), false)
                ])]))
                .toDeclStmt(o.importType(Identifiers.RendererType2), [o.StmtModifier.Final, o.StmtModifier.Exported]));
        }
        const viewBuilderFactory = (parent) => {
            const embeddedViewIndex = embeddedViewCount++;
            return new ViewBuilder(this._reflector, outputCtx, parent, component, embeddedViewIndex, usedPipes, viewBuilderFactory);
        };
        const visitor = viewBuilderFactory(null);
        visitor.visitAll([], template);
        outputCtx.statements.push(...visitor.build());
        return new ViewCompileResult(visitor.viewName, renderComponentVarName);
    }
}
const LOG_VAR = o.variable('_l');
const VIEW_VAR = o.variable('_v');
const CHECK_VAR = o.variable('_ck');
const COMP_VAR = o.variable('_co');
const EVENT_NAME_VAR = o.variable('en');
const ALLOW_DEFAULT_VAR = o.variable(`ad`);
class ViewBuilder {
    constructor(reflector, outputCtx, parent, component, embeddedViewIndex, usedPipes, viewBuilderFactory) {
        this.reflector = reflector;
        this.outputCtx = outputCtx;
        this.parent = parent;
        this.component = component;
        this.embeddedViewIndex = embeddedViewIndex;
        this.usedPipes = usedPipes;
        this.viewBuilderFactory = viewBuilderFactory;
        this.nodes = [];
        this.purePipeNodeIndices = Object.create(null);
        // Need Object.create so that we don't have builtin values...
        this.refNodeIndices = Object.create(null);
        this.variables = [];
        this.children = [];
        // TODO(tbosch): The old view compiler used to use an `any` type
        // for the context in any embedded view. We keep this behaivor for now
        // to be able to introduce the new view compiler without too many errors.
        this.compType = this.embeddedViewIndex > 0 ?
            o.DYNAMIC_TYPE :
            o.expressionType(outputCtx.importExpr(this.component.type.reference));
        this.viewName = viewClassName(this.component.type.reference, this.embeddedViewIndex);
    }
    visitAll(variables, astNodes) {
        this.variables = variables;
        // create the pipes for the pure pipes immediately, so that we know their indices.
        if (!this.parent) {
            this.usedPipes.forEach((pipe) => {
                if (pipe.pure) {
                    this.purePipeNodeIndices[pipe.name] = this._createPipe(null, pipe);
                }
            });
        }
        if (!this.parent) {
            this.component.viewQueries.forEach((query, queryIndex) => {
                // Note: queries start with id 1 so we can use the number in a Bloom filter!
                const queryId = queryIndex + 1;
                const bindingType = query.first ? 0 /* First */ : 1 /* All */;
                const flags = 134217728 /* TypeViewQuery */ | calcQueryFlags(query);
                this.nodes.push(() => ({
                    sourceSpan: null,
                    nodeFlags: flags,
                    nodeDef: o.importExpr(Identifiers.queryDef).callFn([
                        o.literal(flags), o.literal(queryId),
                        new o.LiteralMapExpr([new o.LiteralMapEntry(query.propertyName, o.literal(bindingType), false)])
                    ])
                }));
            });
        }
        templateVisitAll(this, astNodes);
        if (this.parent && (astNodes.length === 0 || needsAdditionalRootNode(astNodes))) {
            // if the view is an embedded view, then we need to add an additional root node in some cases
            this.nodes.push(() => ({
                sourceSpan: null,
                nodeFlags: 1 /* TypeElement */,
                nodeDef: o.importExpr(Identifiers.anchorDef).callFn([
                    o.literal(0 /* None */), o.NULL_EXPR, o.NULL_EXPR, o.literal(0)
                ])
            }));
        }
    }
    build(targetStatements = []) {
        this.children.forEach((child) => child.build(targetStatements));
        const { updateRendererStmts, updateDirectivesStmts, nodeDefExprs } = this._createNodeExpressions();
        const updateRendererFn = this._createUpdateFn(updateRendererStmts);
        const updateDirectivesFn = this._createUpdateFn(updateDirectivesStmts);
        let viewFlags = 0 /* None */;
        if (!this.parent && this.component.changeDetection === ChangeDetectionStrategy.OnPush) {
            viewFlags |= 2 /* OnPush */;
        }
        const viewFactory = new o.DeclareFunctionStmt(this.viewName, [new o.FnParam(LOG_VAR.name)], [new o.ReturnStatement(o.importExpr(Identifiers.viewDef).callFn([
                o.literal(viewFlags),
                o.literalArr(nodeDefExprs),
                updateDirectivesFn,
                updateRendererFn,
            ]))], o.importType(Identifiers.ViewDefinition), this.embeddedViewIndex === 0 ? [o.StmtModifier.Exported] : []);
        targetStatements.push(viewFactory);
        return targetStatements;
    }
    _createUpdateFn(updateStmts) {
        let updateFn;
        if (updateStmts.length > 0) {
            const preStmts = [];
            if (!this.component.isHost && o.findReadVarNames(updateStmts).has(COMP_VAR.name)) {
                preStmts.push(COMP_VAR.set(VIEW_VAR.prop('component')).toDeclStmt(this.compType));
            }
            updateFn = o.fn([
                new o.FnParam(CHECK_VAR.name, o.INFERRED_TYPE),
                new o.FnParam(VIEW_VAR.name, o.INFERRED_TYPE)
            ], [...preStmts, ...updateStmts], o.INFERRED_TYPE);
        }
        else {
            updateFn = o.NULL_EXPR;
        }
        return updateFn;
    }
    visitNgContent(ast, context) {
        // ngContentDef(ngContentIndex: number, index: number): NodeDef;
        this.nodes.push(() => ({
            sourceSpan: ast.sourceSpan,
            nodeFlags: 8 /* TypeNgContent */,
            nodeDef: o.importExpr(Identifiers.ngContentDef)
                .callFn([o.literal(ast.ngContentIndex), o.literal(ast.index)])
        }));
    }
    visitText(ast, context) {
        // Static text nodes have no check function
        const checkIndex = -1;
        this.nodes.push(() => ({
            sourceSpan: ast.sourceSpan,
            nodeFlags: 2 /* TypeText */,
            nodeDef: o.importExpr(Identifiers.textDef).callFn([
                o.literal(checkIndex),
                o.literal(ast.ngContentIndex),
                o.literalArr([o.literal(ast.value)]),
            ])
        }));
    }
    visitBoundText(ast, context) {
        const nodeIndex = this.nodes.length;
        // reserve the space in the nodeDefs array
        this.nodes.push(null);
        const astWithSource = ast.value;
        const inter = astWithSource.ast;
        const updateRendererExpressions = inter.expressions.map((expr, bindingIndex) => this._preprocessUpdateExpression({ nodeIndex, bindingIndex, sourceSpan: ast.sourceSpan, context: COMP_VAR, value: expr }));
        // Check index is the same as the node index during compilation
        // They might only differ at runtime
        const checkIndex = nodeIndex;
        this.nodes[nodeIndex] = () => ({
            sourceSpan: ast.sourceSpan,
            nodeFlags: 2 /* TypeText */,
            nodeDef: o.importExpr(Identifiers.textDef).callFn([
                o.literal(checkIndex),
                o.literal(ast.ngContentIndex),
                o.literalArr(inter.strings.map(s => o.literal(s))),
            ]),
            updateRenderer: updateRendererExpressions
        });
    }
    visitEmbeddedTemplate(ast, context) {
        const nodeIndex = this.nodes.length;
        // reserve the space in the nodeDefs array
        this.nodes.push(null);
        const { flags, queryMatchesExpr, hostEvents } = this._visitElementOrTemplate(nodeIndex, ast);
        const childVisitor = this.viewBuilderFactory(this);
        this.children.push(childVisitor);
        childVisitor.visitAll(ast.variables, ast.children);
        const childCount = this.nodes.length - nodeIndex - 1;
        // anchorDef(
        //   flags: NodeFlags, matchedQueries: [string, QueryValueType][], ngContentIndex: number,
        //   childCount: number, handleEventFn?: ElementHandleEventFn, templateFactory?:
        //   ViewDefinitionFactory): NodeDef;
        this.nodes[nodeIndex] = () => ({
            sourceSpan: ast.sourceSpan,
            nodeFlags: 1 /* TypeElement */ | flags,
            nodeDef: o.importExpr(Identifiers.anchorDef).callFn([
                o.literal(flags),
                queryMatchesExpr,
                o.literal(ast.ngContentIndex),
                o.literal(childCount),
                this._createElementHandleEventFn(nodeIndex, hostEvents),
                o.variable(childVisitor.viewName),
            ])
        });
    }
    visitElement(ast, context) {
        const nodeIndex = this.nodes.length;
        // reserve the space in the nodeDefs array so we can add children
        this.nodes.push(null);
        // Using a null element name creates an anchor.
        const elName = isNgContainer(ast.name) ? null : ast.name;
        const { flags, usedEvents, queryMatchesExpr, hostBindings: dirHostBindings, hostEvents } = this._visitElementOrTemplate(nodeIndex, ast);
        let inputDefs = [];
        let updateRendererExpressions = [];
        let outputDefs = [];
        if (elName) {
            const hostBindings = ast.inputs
                .map((inputAst) => ({
                context: COMP_VAR,
                inputAst,
                dirAst: null,
            }))
                .concat(dirHostBindings);
            if (hostBindings.length) {
                updateRendererExpressions =
                    hostBindings.map((hostBinding, bindingIndex) => this._preprocessUpdateExpression({
                        context: hostBinding.context,
                        nodeIndex,
                        bindingIndex,
                        sourceSpan: hostBinding.inputAst.sourceSpan,
                        value: hostBinding.inputAst.value
                    }));
                inputDefs = hostBindings.map(hostBinding => elementBindingDef(hostBinding.inputAst, hostBinding.dirAst));
            }
            outputDefs = usedEvents.map(([target, eventName]) => o.literalArr([o.literal(target), o.literal(eventName)]));
        }
        templateVisitAll(this, ast.children);
        const childCount = this.nodes.length - nodeIndex - 1;
        const compAst = ast.directives.find(dirAst => dirAst.directive.isComponent);
        let compRendererType = o.NULL_EXPR;
        let compView = o.NULL_EXPR;
        if (compAst) {
            compView = this.outputCtx.importExpr(compAst.directive.componentViewType);
            compRendererType = this.outputCtx.importExpr(compAst.directive.rendererType);
        }
        // Check index is the same as the node index during compilation
        // They might only differ at runtime
        const checkIndex = nodeIndex;
        this.nodes[nodeIndex] = () => ({
            sourceSpan: ast.sourceSpan,
            nodeFlags: 1 /* TypeElement */ | flags,
            nodeDef: o.importExpr(Identifiers.elementDef).callFn([
                o.literal(checkIndex),
                o.literal(flags),
                queryMatchesExpr,
                o.literal(ast.ngContentIndex),
                o.literal(childCount),
                o.literal(elName),
                elName ? fixedAttrsDef(ast) : o.NULL_EXPR,
                inputDefs.length ? o.literalArr(inputDefs) : o.NULL_EXPR,
                outputDefs.length ? o.literalArr(outputDefs) : o.NULL_EXPR,
                this._createElementHandleEventFn(nodeIndex, hostEvents),
                compView,
                compRendererType,
            ]),
            updateRenderer: updateRendererExpressions
        });
    }
    _visitElementOrTemplate(nodeIndex, ast) {
        let flags = 0 /* None */;
        if (ast.hasViewContainer) {
            flags |= 16777216 /* EmbeddedViews */;
        }
        const usedEvents = new Map();
        ast.outputs.forEach((event) => {
            const { name, target } = elementEventNameAndTarget(event, null);
            usedEvents.set(elementEventFullName(target, name), [target, name]);
        });
        ast.directives.forEach((dirAst) => {
            dirAst.hostEvents.forEach((event) => {
                const { name, target } = elementEventNameAndTarget(event, dirAst);
                usedEvents.set(elementEventFullName(target, name), [target, name]);
            });
        });
        const hostBindings = [];
        const hostEvents = [];
        this._visitComponentFactoryResolverProvider(ast.directives);
        ast.providers.forEach(providerAst => {
            let dirAst = undefined;
            ast.directives.forEach(localDirAst => {
                if (localDirAst.directive.type.reference === tokenReference(providerAst.token)) {
                    dirAst = localDirAst;
                }
            });
            if (dirAst) {
                const { hostBindings: dirHostBindings, hostEvents: dirHostEvents } = this._visitDirective(providerAst, dirAst, ast.references, ast.queryMatches, usedEvents);
                hostBindings.push(...dirHostBindings);
                hostEvents.push(...dirHostEvents);
            }
            else {
                this._visitProvider(providerAst, ast.queryMatches);
            }
        });
        let queryMatchExprs = [];
        ast.queryMatches.forEach((match) => {
            let valueType = undefined;
            if (tokenReference(match.value) ===
                this.reflector.resolveExternalReference(Identifiers.ElementRef)) {
                valueType = 0 /* ElementRef */;
            }
            else if (tokenReference(match.value) ===
                this.reflector.resolveExternalReference(Identifiers.ViewContainerRef)) {
                valueType = 3 /* ViewContainerRef */;
            }
            else if (tokenReference(match.value) ===
                this.reflector.resolveExternalReference(Identifiers.TemplateRef)) {
                valueType = 2 /* TemplateRef */;
            }
            if (valueType != null) {
                queryMatchExprs.push(o.literalArr([o.literal(match.queryId), o.literal(valueType)]));
            }
        });
        ast.references.forEach((ref) => {
            let valueType = undefined;
            if (!ref.value) {
                valueType = 1 /* RenderElement */;
            }
            else if (tokenReference(ref.value) ===
                this.reflector.resolveExternalReference(Identifiers.TemplateRef)) {
                valueType = 2 /* TemplateRef */;
            }
            if (valueType != null) {
                this.refNodeIndices[ref.name] = nodeIndex;
                queryMatchExprs.push(o.literalArr([o.literal(ref.name), o.literal(valueType)]));
            }
        });
        ast.outputs.forEach((outputAst) => {
            hostEvents.push({ context: COMP_VAR, eventAst: outputAst, dirAst: null });
        });
        return {
            flags,
            usedEvents: Array.from(usedEvents.values()),
            queryMatchesExpr: queryMatchExprs.length ? o.literalArr(queryMatchExprs) : o.NULL_EXPR,
            hostBindings,
            hostEvents: hostEvents
        };
    }
    _visitDirective(providerAst, dirAst, refs, queryMatches, usedEvents) {
        const nodeIndex = this.nodes.length;
        // reserve the space in the nodeDefs array so we can add children
        this.nodes.push(null);
        dirAst.directive.queries.forEach((query, queryIndex) => {
            const queryId = dirAst.contentQueryStartId + queryIndex;
            const flags = 67108864 /* TypeContentQuery */ | calcQueryFlags(query);
            const bindingType = query.first ? 0 /* First */ : 1 /* All */;
            this.nodes.push(() => ({
                sourceSpan: dirAst.sourceSpan,
                nodeFlags: flags,
                nodeDef: o.importExpr(Identifiers.queryDef).callFn([
                    o.literal(flags), o.literal(queryId),
                    new o.LiteralMapExpr([new o.LiteralMapEntry(query.propertyName, o.literal(bindingType), false)])
                ]),
            }));
        });
        // Note: the operation below might also create new nodeDefs,
        // but we don't want them to be a child of a directive,
        // as they might be a provider/pipe on their own.
        // I.e. we only allow queries as children of directives nodes.
        const childCount = this.nodes.length - nodeIndex - 1;
        let { flags, queryMatchExprs, providerExpr, depsExpr } = this._visitProviderOrDirective(providerAst, queryMatches);
        refs.forEach((ref) => {
            if (ref.value && tokenReference(ref.value) === tokenReference(providerAst.token)) {
                this.refNodeIndices[ref.name] = nodeIndex;
                queryMatchExprs.push(o.literalArr([o.literal(ref.name), o.literal(4 /* Provider */)]));
            }
        });
        if (dirAst.directive.isComponent) {
            flags |= 32768 /* Component */;
        }
        const inputDefs = dirAst.inputs.map((inputAst, inputIndex) => {
            const mapValue = o.literalArr([o.literal(inputIndex), o.literal(inputAst.directiveName)]);
            // Note: it's important to not quote the key so that we can capture renames by minifiers!
            return new o.LiteralMapEntry(inputAst.directiveName, mapValue, false);
        });
        const outputDefs = [];
        const dirMeta = dirAst.directive;
        Object.keys(dirMeta.outputs).forEach((propName) => {
            const eventName = dirMeta.outputs[propName];
            if (usedEvents.has(eventName)) {
                // Note: it's important to not quote the key so that we can capture renames by minifiers!
                outputDefs.push(new o.LiteralMapEntry(propName, o.literal(eventName), false));
            }
        });
        let updateDirectiveExpressions = [];
        if (dirAst.inputs.length || (flags & (262144 /* DoCheck */ | 65536 /* OnInit */)) > 0) {
            updateDirectiveExpressions =
                dirAst.inputs.map((input, bindingIndex) => this._preprocessUpdateExpression({
                    nodeIndex,
                    bindingIndex,
                    sourceSpan: input.sourceSpan,
                    context: COMP_VAR,
                    value: input.value
                }));
        }
        const dirContextExpr = o.importExpr(Identifiers.nodeValue).callFn([VIEW_VAR, o.literal(nodeIndex)]);
        const hostBindings = dirAst.hostProperties.map((inputAst) => ({
            context: dirContextExpr,
            dirAst,
            inputAst,
        }));
        const hostEvents = dirAst.hostEvents.map((hostEventAst) => ({
            context: dirContextExpr,
            eventAst: hostEventAst,
            dirAst,
        }));
        // Check index is the same as the node index during compilation
        // They might only differ at runtime
        const checkIndex = nodeIndex;
        this.nodes[nodeIndex] = () => ({
            sourceSpan: dirAst.sourceSpan,
            nodeFlags: 16384 /* TypeDirective */ | flags,
            nodeDef: o.importExpr(Identifiers.directiveDef).callFn([
                o.literal(checkIndex),
                o.literal(flags),
                queryMatchExprs.length ? o.literalArr(queryMatchExprs) : o.NULL_EXPR,
                o.literal(childCount),
                providerExpr,
                depsExpr,
                inputDefs.length ? new o.LiteralMapExpr(inputDefs) : o.NULL_EXPR,
                outputDefs.length ? new o.LiteralMapExpr(outputDefs) : o.NULL_EXPR,
            ]),
            updateDirectives: updateDirectiveExpressions,
            directive: dirAst.directive.type,
        });
        return { hostBindings, hostEvents };
    }
    _visitProvider(providerAst, queryMatches) {
        this._addProviderNode(this._visitProviderOrDirective(providerAst, queryMatches));
    }
    _visitComponentFactoryResolverProvider(directives) {
        const componentDirMeta = directives.find(dirAst => dirAst.directive.isComponent);
        if (componentDirMeta && componentDirMeta.directive.entryComponents.length) {
            const { providerExpr, depsExpr, flags, tokenExpr } = componentFactoryResolverProviderDef(this.reflector, this.outputCtx, 8192 /* PrivateProvider */, componentDirMeta.directive.entryComponents);
            this._addProviderNode({
                providerExpr,
                depsExpr,
                flags,
                tokenExpr,
                queryMatchExprs: [],
                sourceSpan: componentDirMeta.sourceSpan
            });
        }
    }
    _addProviderNode(data) {
        // providerDef(
        //   flags: NodeFlags, matchedQueries: [string, QueryValueType][], token:any,
        //   value: any, deps: ([DepFlags, any] | any)[]): NodeDef;
        this.nodes.push(() => ({
            sourceSpan: data.sourceSpan,
            nodeFlags: data.flags,
            nodeDef: o.importExpr(Identifiers.providerDef).callFn([
                o.literal(data.flags),
                data.queryMatchExprs.length ? o.literalArr(data.queryMatchExprs) : o.NULL_EXPR,
                data.tokenExpr, data.providerExpr, data.depsExpr
            ])
        }));
    }
    _visitProviderOrDirective(providerAst, queryMatches) {
        let flags = 0 /* None */;
        let queryMatchExprs = [];
        queryMatches.forEach((match) => {
            if (tokenReference(match.value) === tokenReference(providerAst.token)) {
                queryMatchExprs.push(o.literalArr([o.literal(match.queryId), o.literal(4 /* Provider */)]));
            }
        });
        const { providerExpr, depsExpr, flags: providerFlags, tokenExpr } = providerDef(this.outputCtx, providerAst);
        return {
            flags: flags | providerFlags,
            queryMatchExprs,
            providerExpr,
            depsExpr,
            tokenExpr,
            sourceSpan: providerAst.sourceSpan
        };
    }
    getLocal(name) {
        if (name == EventHandlerVars.event.name) {
            return EventHandlerVars.event;
        }
        let currViewExpr = VIEW_VAR;
        for (let currBuilder = this; currBuilder; currBuilder = currBuilder.parent,
            currViewExpr = currViewExpr.prop('parent').cast(o.DYNAMIC_TYPE)) {
            // check references
            const refNodeIndex = currBuilder.refNodeIndices[name];
            if (refNodeIndex != null) {
                return o.importExpr(Identifiers.nodeValue).callFn([currViewExpr, o.literal(refNodeIndex)]);
            }
            // check variables
            const varAst = currBuilder.variables.find((varAst) => varAst.name === name);
            if (varAst) {
                const varValue = varAst.value || IMPLICIT_TEMPLATE_VAR;
                return currViewExpr.prop('context').prop(varValue);
            }
        }
        return null;
    }
    notifyImplicitReceiverUse() {
        // Not needed in ViewEngine as ViewEngine walks through the generated
        // expressions to figure out if the implicit receiver is used and needs
        // to be generated as part of the pre-update statements.
    }
    maybeRestoreView() {
        // Not necessary in ViewEngine, because view restoration is an Ivy concept.
    }
    _createLiteralArrayConverter(sourceSpan, argCount) {
        if (argCount === 0) {
            const valueExpr = o.importExpr(Identifiers.EMPTY_ARRAY);
            return () => valueExpr;
        }
        const checkIndex = this.nodes.length;
        this.nodes.push(() => ({
            sourceSpan,
            nodeFlags: 32 /* TypePureArray */,
            nodeDef: o.importExpr(Identifiers.pureArrayDef).callFn([
                o.literal(checkIndex),
                o.literal(argCount),
            ])
        }));
        return (args) => callCheckStmt(checkIndex, args);
    }
    _createLiteralMapConverter(sourceSpan, keys) {
        if (keys.length === 0) {
            const valueExpr = o.importExpr(Identifiers.EMPTY_MAP);
            return () => valueExpr;
        }
        const map = o.literalMap(keys.map((e, i) => (Object.assign(Object.assign({}, e), { value: o.literal(i) }))));
        const checkIndex = this.nodes.length;
        this.nodes.push(() => ({
            sourceSpan,
            nodeFlags: 64 /* TypePureObject */,
            nodeDef: o.importExpr(Identifiers.pureObjectDef).callFn([
                o.literal(checkIndex),
                map,
            ])
        }));
        return (args) => callCheckStmt(checkIndex, args);
    }
    _createPipeConverter(expression, name, argCount) {
        const pipe = this.usedPipes.find((pipeSummary) => pipeSummary.name === name);
        if (pipe.pure) {
            const checkIndex = this.nodes.length;
            this.nodes.push(() => ({
                sourceSpan: expression.sourceSpan,
                nodeFlags: 128 /* TypePurePipe */,
                nodeDef: o.importExpr(Identifiers.purePipeDef).callFn([
                    o.literal(checkIndex),
                    o.literal(argCount),
                ])
            }));
            // find underlying pipe in the component view
            let compViewExpr = VIEW_VAR;
            let compBuilder = this;
            while (compBuilder.parent) {
                compBuilder = compBuilder.parent;
                compViewExpr = compViewExpr.prop('parent').cast(o.DYNAMIC_TYPE);
            }
            const pipeNodeIndex = compBuilder.purePipeNodeIndices[name];
            const pipeValueExpr = o.importExpr(Identifiers.nodeValue).callFn([compViewExpr, o.literal(pipeNodeIndex)]);
            return (args) => callUnwrapValue(expression.nodeIndex, expression.bindingIndex, callCheckStmt(checkIndex, [pipeValueExpr].concat(args)));
        }
        else {
            const nodeIndex = this._createPipe(expression.sourceSpan, pipe);
            const nodeValueExpr = o.importExpr(Identifiers.nodeValue).callFn([VIEW_VAR, o.literal(nodeIndex)]);
            return (args) => callUnwrapValue(expression.nodeIndex, expression.bindingIndex, nodeValueExpr.callMethod('transform', args));
        }
    }
    _createPipe(sourceSpan, pipe) {
        const nodeIndex = this.nodes.length;
        let flags = 0 /* None */;
        pipe.type.lifecycleHooks.forEach((lifecycleHook) => {
            // for pipes, we only support ngOnDestroy
            if (lifecycleHook === LifecycleHooks.OnDestroy) {
                flags |= lifecycleHookToNodeFlag(lifecycleHook);
            }
        });
        const depExprs = pipe.type.diDeps.map((diDep) => depDef(this.outputCtx, diDep));
        // function pipeDef(
        //   flags: NodeFlags, ctor: any, deps: ([DepFlags, any] | any)[]): NodeDef
        this.nodes.push(() => ({
            sourceSpan,
            nodeFlags: 16 /* TypePipe */,
            nodeDef: o.importExpr(Identifiers.pipeDef).callFn([
                o.literal(flags), this.outputCtx.importExpr(pipe.type.reference), o.literalArr(depExprs)
            ])
        }));
        return nodeIndex;
    }
    /**
     * For the AST in `UpdateExpression.value`:
     * - create nodes for pipes, literal arrays and, literal maps,
     * - update the AST to replace pipes, literal arrays and, literal maps with calls to check fn.
     *
     * WARNING: This might create new nodeDefs (for pipes and literal arrays and literal maps)!
     */
    _preprocessUpdateExpression(expression) {
        return {
            nodeIndex: expression.nodeIndex,
            bindingIndex: expression.bindingIndex,
            sourceSpan: expression.sourceSpan,
            context: expression.context,
            value: convertPropertyBindingBuiltins({
                createLiteralArrayConverter: (argCount) => this._createLiteralArrayConverter(expression.sourceSpan, argCount),
                createLiteralMapConverter: (keys) => this._createLiteralMapConverter(expression.sourceSpan, keys),
                createPipeConverter: (name, argCount) => this._createPipeConverter(expression, name, argCount)
            }, expression.value)
        };
    }
    _createNodeExpressions() {
        const self = this;
        let updateBindingCount = 0;
        const updateRendererStmts = [];
        const updateDirectivesStmts = [];
        const nodeDefExprs = this.nodes.map((factory, nodeIndex) => {
            const { nodeDef, nodeFlags, updateDirectives, updateRenderer, sourceSpan } = factory();
            if (updateRenderer) {
                updateRendererStmts.push(...createUpdateStatements(nodeIndex, sourceSpan, updateRenderer, false));
            }
            if (updateDirectives) {
                updateDirectivesStmts.push(...createUpdateStatements(nodeIndex, sourceSpan, updateDirectives, (nodeFlags & (262144 /* DoCheck */ | 65536 /* OnInit */)) > 0));
            }
            // We use a comma expression to call the log function before
            // the nodeDef function, but still use the result of the nodeDef function
            // as the value.
            // Note: We only add the logger to elements / text nodes,
            // so we don't generate too much code.
            const logWithNodeDef = nodeFlags & 3 /* CatRenderNode */ ?
                new o.CommaExpr([LOG_VAR.callFn([]).callFn([]), nodeDef]) :
                nodeDef;
            return o.applySourceSpanToExpressionIfNeeded(logWithNodeDef, sourceSpan);
        });
        return { updateRendererStmts, updateDirectivesStmts, nodeDefExprs };
        function createUpdateStatements(nodeIndex, sourceSpan, expressions, allowEmptyExprs) {
            const updateStmts = [];
            const exprs = expressions.map(({ sourceSpan, context, value }) => {
                const bindingId = `${updateBindingCount++}`;
                const nameResolver = context === COMP_VAR ? self : null;
                const { stmts, currValExpr } = convertPropertyBinding(nameResolver, context, value, bindingId, BindingForm.General);
                updateStmts.push(...stmts.map((stmt) => o.applySourceSpanToStatementIfNeeded(stmt, sourceSpan)));
                return o.applySourceSpanToExpressionIfNeeded(currValExpr, sourceSpan);
            });
            if (expressions.length || allowEmptyExprs) {
                updateStmts.push(o.applySourceSpanToStatementIfNeeded(callCheckStmt(nodeIndex, exprs).toStmt(), sourceSpan));
            }
            return updateStmts;
        }
    }
    _createElementHandleEventFn(nodeIndex, handlers) {
        const handleEventStmts = [];
        let handleEventBindingCount = 0;
        handlers.forEach(({ context, eventAst, dirAst }) => {
            const bindingId = `${handleEventBindingCount++}`;
            const nameResolver = context === COMP_VAR ? this : null;
            const { stmts, allowDefault } = convertActionBinding(nameResolver, context, eventAst.handler, bindingId);
            const trueStmts = stmts;
            if (allowDefault) {
                trueStmts.push(ALLOW_DEFAULT_VAR.set(allowDefault.and(ALLOW_DEFAULT_VAR)).toStmt());
            }
            const { target: eventTarget, name: eventName } = elementEventNameAndTarget(eventAst, dirAst);
            const fullEventName = elementEventFullName(eventTarget, eventName);
            handleEventStmts.push(o.applySourceSpanToStatementIfNeeded(new o.IfStmt(o.literal(fullEventName).identical(EVENT_NAME_VAR), trueStmts), eventAst.sourceSpan));
        });
        let handleEventFn;
        if (handleEventStmts.length > 0) {
            const preStmts = [ALLOW_DEFAULT_VAR.set(o.literal(true)).toDeclStmt(o.BOOL_TYPE)];
            if (!this.component.isHost && o.findReadVarNames(handleEventStmts).has(COMP_VAR.name)) {
                preStmts.push(COMP_VAR.set(VIEW_VAR.prop('component')).toDeclStmt(this.compType));
            }
            handleEventFn = o.fn([
                new o.FnParam(VIEW_VAR.name, o.INFERRED_TYPE),
                new o.FnParam(EVENT_NAME_VAR.name, o.INFERRED_TYPE),
                new o.FnParam(EventHandlerVars.event.name, o.INFERRED_TYPE)
            ], [...preStmts, ...handleEventStmts, new o.ReturnStatement(ALLOW_DEFAULT_VAR)], o.INFERRED_TYPE);
        }
        else {
            handleEventFn = o.NULL_EXPR;
        }
        return handleEventFn;
    }
    visitDirective(ast, context) { }
    visitDirectiveProperty(ast, context) { }
    visitReference(ast, context) { }
    visitVariable(ast, context) { }
    visitEvent(ast, context) { }
    visitElementProperty(ast, context) { }
    visitAttr(ast, context) { }
}
function needsAdditionalRootNode(astNodes) {
    const lastAstNode = astNodes[astNodes.length - 1];
    if (lastAstNode instanceof EmbeddedTemplateAst) {
        return lastAstNode.hasViewContainer;
    }
    if (lastAstNode instanceof ElementAst) {
        if (isNgContainer(lastAstNode.name) && lastAstNode.children.length) {
            return needsAdditionalRootNode(lastAstNode.children);
        }
        return lastAstNode.hasViewContainer;
    }
    return lastAstNode instanceof NgContentAst;
}
function elementBindingDef(inputAst, dirAst) {
    const inputType = inputAst.type;
    switch (inputType) {
        case 1 /* Attribute */:
            return o.literalArr([
                o.literal(1 /* TypeElementAttribute */), o.literal(inputAst.name),
                o.literal(inputAst.securityContext)
            ]);
        case 0 /* Property */:
            return o.literalArr([
                o.literal(8 /* TypeProperty */), o.literal(inputAst.name),
                o.literal(inputAst.securityContext)
            ]);
        case 4 /* Animation */:
            const bindingType = 8 /* TypeProperty */ |
                (dirAst && dirAst.directive.isComponent ? 32 /* SyntheticHostProperty */ :
                    16 /* SyntheticProperty */);
            return o.literalArr([
                o.literal(bindingType), o.literal('@' + inputAst.name), o.literal(inputAst.securityContext)
            ]);
        case 2 /* Class */:
            return o.literalArr([o.literal(2 /* TypeElementClass */), o.literal(inputAst.name), o.NULL_EXPR]);
        case 3 /* Style */:
            return o.literalArr([
                o.literal(4 /* TypeElementStyle */), o.literal(inputAst.name), o.literal(inputAst.unit)
            ]);
        default:
            // This default case is not needed by TypeScript compiler, as the switch is exhaustive.
            // However Closure Compiler does not understand that and reports an error in typed mode.
            // The `throw new Error` below works around the problem, and the unexpected: never variable
            // makes sure tsc still checks this code is unreachable.
            const unexpected = inputType;
            throw new Error(`unexpected ${unexpected}`);
    }
}
function fixedAttrsDef(elementAst) {
    const mapResult = Object.create(null);
    elementAst.attrs.forEach(attrAst => {
        mapResult[attrAst.name] = attrAst.value;
    });
    elementAst.directives.forEach(dirAst => {
        Object.keys(dirAst.directive.hostAttributes).forEach(name => {
            const value = dirAst.directive.hostAttributes[name];
            const prevValue = mapResult[name];
            mapResult[name] = prevValue != null ? mergeAttributeValue(name, prevValue, value) : value;
        });
    });
    // Note: We need to sort to get a defined output order
    // for tests and for caching generated artifacts...
    return o.literalArr(Object.keys(mapResult).sort().map((attrName) => o.literalArr([o.literal(attrName), o.literal(mapResult[attrName])])));
}
function mergeAttributeValue(attrName, attrValue1, attrValue2) {
    if (attrName == CLASS_ATTR || attrName == STYLE_ATTR) {
        return `${attrValue1} ${attrValue2}`;
    }
    else {
        return attrValue2;
    }
}
function callCheckStmt(nodeIndex, exprs) {
    if (exprs.length > 10) {
        return CHECK_VAR.callFn([VIEW_VAR, o.literal(nodeIndex), o.literal(1 /* Dynamic */), o.literalArr(exprs)]);
    }
    else {
        return CHECK_VAR.callFn([VIEW_VAR, o.literal(nodeIndex), o.literal(0 /* Inline */), ...exprs]);
    }
}
function callUnwrapValue(nodeIndex, bindingIdx, expr) {
    return o.importExpr(Identifiers.unwrapValue).callFn([
        VIEW_VAR, o.literal(nodeIndex), o.literal(bindingIdx), expr
    ]);
}
function elementEventNameAndTarget(eventAst, dirAst) {
    if (eventAst.isAnimation) {
        return {
            name: `@${eventAst.name}.${eventAst.phase}`,
            target: dirAst && dirAst.directive.isComponent ? 'component' : null
        };
    }
    else {
        return eventAst;
    }
}
function calcQueryFlags(query) {
    let flags = 0 /* None */;
    // Note: We only make queries static that query for a single item and the user specifically
    // set the to be static. This is because of backwards compatibility with the old view compiler...
    if (query.first && query.static) {
        flags |= 268435456 /* StaticQuery */;
    }
    else {
        flags |= 536870912 /* DynamicQuery */;
    }
    if (query.emitDistinctChangesOnly) {
        flags |= -2147483648 /* EmitDistinctChangesOnly */;
    }
    return flags;
}
export function elementEventFullName(target, name) {
    return target ? `${target}:${name}` : name;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlld19jb21waWxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uL3BhY2thZ2VzL2NvbXBpbGVyL3NyYy92aWV3X2NvbXBpbGVyL3ZpZXdfY29tcGlsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7OztHQU1HO0FBRUgsT0FBTyxFQUFxRSxnQkFBZ0IsRUFBRSxjQUFjLEVBQUUsYUFBYSxFQUFDLE1BQU0scUJBQXFCLENBQUM7QUFFeEosT0FBTyxFQUFDLFdBQVcsRUFBb0Isb0JBQW9CLEVBQUUsc0JBQXNCLEVBQUUsOEJBQThCLEVBQUUsZ0JBQWdCLEVBQWdCLE1BQU0sdUNBQXVDLENBQUM7QUFDbk0sT0FBTyxFQUE2Qix1QkFBdUIsRUFBeUQsTUFBTSxTQUFTLENBQUM7QUFFcEksT0FBTyxFQUFDLFdBQVcsRUFBQyxNQUFNLGdCQUFnQixDQUFDO0FBQzNDLE9BQU8sRUFBQyxjQUFjLEVBQUMsTUFBTSx3QkFBd0IsQ0FBQztBQUN0RCxPQUFPLEVBQUMsYUFBYSxFQUFDLE1BQU0sbUJBQW1CLENBQUM7QUFDaEQsT0FBTyxLQUFLLENBQUMsTUFBTSxzQkFBc0IsQ0FBQztBQUMxQyxPQUFPLEVBQUMsdUJBQXVCLEVBQUMsTUFBTSxzQkFBc0IsQ0FBQztBQUU3RCxPQUFPLEVBQXlHLFVBQVUsRUFBRSxtQkFBbUIsRUFBRSxZQUFZLEVBQStGLGdCQUFnQixFQUF1QixNQUFNLGlDQUFpQyxDQUFDO0FBRzNVLE9BQU8sRUFBQyxtQ0FBbUMsRUFBRSxNQUFNLEVBQUUsdUJBQXVCLEVBQUUsV0FBVyxFQUFDLE1BQU0scUJBQXFCLENBQUM7QUFFdEgsTUFBTSxVQUFVLEdBQUcsT0FBTyxDQUFDO0FBQzNCLE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQztBQUMzQixNQUFNLHFCQUFxQixHQUFHLFdBQVcsQ0FBQztBQUUxQyxNQUFNLE9BQU8saUJBQWlCO0lBQzVCLFlBQW1CLFlBQW9CLEVBQVMsZUFBdUI7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RUQsU0FBUyxjQUFjLENBQUMsS0FBMkI7SUFDakQsSUFBSSxLQUFLLGVBQWlCLENBQUM7SUFDM0IsMkZBQTJGO0lBQzNGLGlHQUFpRztJQUNqRyxJQUFJLEtBQUssQ0FBQyxLQUFLLElBQUksS0FBSyxDQUFDLE1BQU0sRUFBRTtRQUMvQixLQUFLLCtCQUF5QixDQUFDO0tBQ2hDO1NBQU07UUFDTCxLQUFLLGdDQUEwQixDQUFDO0tBQ2pDO0lBQ0QsSUFBSSxLQUFLLENBQUMsdUJBQXVCLEVBQUU7UUFDakMsS0FBSyw2Q0FBcUMsQ0FBQztLQUM1QztJQUNELE9BQU8sS0FBSyxDQUFDO0FBQ2YsQ0FBQztBQUVELE1BQU0sVUFBVSxvQkFBb0IsQ0FBQyxNQUFtQixFQUFFLElBQVk7SUFDcEUsT0FBTyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsTUFBTSxJQUFJLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7QUFDN0MsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgTExDIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuXG5pbXBvcnQge0NvbXBpbGVEaXJlY3RpdmVNZXRhZGF0YSwgQ29tcGlsZVBpcGVTdW1tYXJ5LCBDb21waWxlUXVlcnlNZXRhZGF0YSwgcmVuZGVyZXJUeXBlTmFtZSwgdG9rZW5SZWZlcmVuY2UsIHZpZXdDbGFzc05hbWV9IGZyb20gJy4uL2NvbXBpbGVfbWV0YWRhdGEnO1xuaW1wb3J0IHtDb21waWxlUmVmbGVjdG9yfSBmcm9tICcuLi9jb21waWxlX3JlZmxlY3Rvcic7XG5pbXBvcnQge0JpbmRpbmdGb3JtLCBCdWlsdGluQ29udmVydGVyLCBjb252ZXJ0QWN0aW9uQmluZGluZywgY29udmVydFByb3BlcnR5QmluZGluZywgY29udmVydFByb3BlcnR5QmluZGluZ0J1aWx0aW5zLCBFdmVudEhhbmRsZXJWYXJzLCBMb2NhbFJlc29sdmVyfSBmcm9tICcuLi9jb21waWxlcl91dGlsL2V4cHJlc3Npb25fY29udmVydGVyJztcbmltcG9ydCB7QXJndW1lbnRUeXBlLCBCaW5kaW5nRmxhZ3MsIENoYW5nZURldGVjdGlvblN0cmF0ZWd5LCBOb2RlRmxhZ3MsIFF1ZXJ5QmluZGluZ1R5cGUsIFF1ZXJ5VmFsdWVUeXBlLCBWaWV3RmxhZ3N9IGZyb20gJy4uL2NvcmUnO1xuaW1wb3J0IHtBU1QsIEFTVFdpdGhTb3VyY2UsIEludGVycG9sYXRpb259IGZyb20gJy4uL2V4cHJlc3Npb25fcGFyc2VyL2FzdCc7XG5pbXBvcnQge0lkZW50aWZpZXJzfSBmcm9tICcuLi9pZGVudGlmaWVycyc7XG5pbXBvcnQge0xpZmVjeWNsZUhvb2tzfSBmcm9tICcuLi9saWZlY3ljbGVfcmVmbGVjdG9yJztcbmltcG9ydCB7aXNOZ0NvbnRhaW5lcn0gZnJvbSAnLi4vbWxfcGFyc2VyL3RhZ3MnO1xuaW1wb3J0ICogYXMgbyBmcm9tICcuLi9vdXRwdXQvb3V0cHV0X2FzdCc7XG5pbXBvcnQge2NvbnZlcnRWYWx1ZVRvT3V0cHV0QXN0fSBmcm9tICcuLi9vdXRwdXQvdmFsdWVfdXRpbCc7XG5pbXBvcnQge1BhcnNlU291cmNlU3Bhbn0gZnJvbSAnLi4vcGFyc2VfdXRpbCc7XG5pbXBvcnQge0F0dHJBc3QsIEJvdW5kRGlyZWN0aXZlUHJvcGVydHlBc3QsIEJvdW5kRWxlbWVudFByb3BlcnR5QXN0LCBCb3VuZEV2ZW50QXN0LCBCb3VuZFRleHRBc3QsIERpcmVjdGl2ZUFzdCwgRWxlbWVudEFzdCwgRW1iZWRkZWRUZW1wbGF0ZUFzdCwgTmdDb250ZW50QXN0LCBQcm9wZXJ0eUJpbmRpbmdUeXBlLCBQcm92aWRlckFzdCwgUXVlcnlNYXRjaCwgUmVmZXJlbmNlQXN0LCBUZW1wbGF0ZUFzdCwgVGVtcGxhdGVBc3RWaXNpdG9yLCB0ZW1wbGF0ZVZpc2l0QWxsLCBUZXh0QXN0LCBWYXJpYWJsZUFzdH0gZnJvbSAnLi4vdGVtcGxhdGVfcGFyc2VyL3RlbXBsYXRlX2FzdCc7XG5pbXBvcnQge091dHB1dENvbnRleHR9IGZyb20gJy4uL3V0aWwnO1xuXG5pbXBvcnQge2NvbXBvbmVudEZhY3RvcnlSZXNvbHZlclByb3ZpZGVyRGVmLCBkZXBEZWYsIGxpZmVjeWNsZUhvb2tUb05vZGVGbGFnLCBwcm92aWRlckRlZn0gZnJvbSAnLi9wcm92aWRlcl9jb21waWxlcic7XG5cbmNvbnN0IENMQVNTX0FUVFIgPSAnY2xhc3MnO1xuY29uc3QgU1RZTEVfQVRUUiA9ICdzdHlsZSc7XG5jb25zdCBJTVBMSUNJVF9URU1QTEFURV9WQVIgPSAnJGltcGxpY2l0JztcblxuZXhwb3J0IGNsYXNzIFZpZXdDb21waWxlUmVzdWx0IHtcbiAgY29uc3RydWN0b3IocHVibGljIHZpZXdDbGFzc1Zhcjogc3RyaW5nLCBwdWJsaWMgcmVuZGVyZXJUeXBlVmFyOiBzdHJpbmcpIHt9XG59XG5cbmV4cG9ydCBjbGFzcyBWaWV3Q29tcGlsZXIge1xuICBjb25zdHJ1Y3Rvcihwcml2YXRlIF9yZWZsZWN0b3I6IENvbXBpbGVSZWZsZWN0b3IpIHt9XG5cbiAgY29tcGlsZUNvbXBvbmVudChcbiAgICAgIG91dHB1dEN0eDogT3V0cHV0Q29udGV4dCwgY29tcG9uZW50OiBDb21waWxlRGlyZWN0aXZlTWV0YWRhdGEsIHRlbXBsYXRlOiBUZW1wbGF0ZUFzdFtdLFxuICAgICAgc3R5bGVzOiBvLkV4cHJlc3Npb24sIHVzZWRQaXBlczogQ29tcGlsZVBpcGVTdW1tYXJ5W10pOiBWaWV3Q29tcGlsZVJlc3VsdCB7XG4gICAgbGV0IGVtYmVkZGVkVmlld0NvdW50ID0gMDtcblxuICAgIGxldCByZW5kZXJDb21wb25lbnRWYXJOYW1lOiBzdHJpbmcgPSB1bmRlZmluZWQhO1xuICAgIGlmICghY29tcG9uZW50LmlzSG9zdCkge1xuICAgICAgY29uc3QgdGVtcGxhdGUgPSBjb21wb25lbnQudGVtcGxhdGUgITtcbiAgICAgIGNvbnN0IGN1c3RvbVJlbmRlckRhdGE6IG8uTGl0ZXJhbE1hcEVudHJ5W10gPSBbXTtcbiAgICAgIGlmICh0ZW1wbGF0ZS5hbmltYXRpb25zICYmIHRlbXBsYXRlLmFuaW1hdGlvbnMubGVuZ3RoKSB7XG4gICAgICAgIGN1c3RvbVJlbmRlckRhdGEucHVzaChuZXcgby5MaXRlcmFsTWFwRW50cnkoXG4gICAgICAgICAgICAnYW5pbWF0aW9uJywgY29udmVydFZhbHVlVG9PdXRwdXRBc3Qob3V0cHV0Q3R4LCB0ZW1wbGF0ZS5hbmltYXRpb25zKSwgdHJ1ZSkpO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZW5kZXJDb21wb25lbnRWYXIgPSBvLnZhcmlhYmxlKHJlbmRlcmVyVHlwZU5hbWUoY29tcG9uZW50LnR5cGUucmVmZXJlbmNlKSk7XG4gICAgICByZW5kZXJDb21wb25lbnRWYXJOYW1lID0gcmVuZGVyQ29tcG9uZW50VmFyLm5hbWUhO1xuICAgICAgb3V0cHV0Q3R4LnN0YXRlbWVudHMucHVzaChcbiAgICAgICAgICByZW5kZXJDb21wb25lbnRWYXJcbiAgICAgICAgICAgICAgLnNldChvLmltcG9ydEV4cHIoSWRlbnRpZmllcnMuY3JlYXRlUmVuZGVyZXJUeXBlMikuY2FsbEZuKFtuZXcgby5MaXRlcmFsTWFwRXhwcihbXG4gICAgICAgICAgICAgICAgbmV3IG8uTGl0ZXJhbE1hcEVudHJ5KCdlbmNhcHN1bGF0aW9uJywgby5saXRlcmFsKHRlbXBsYXRlLmVuY2Fwc3VsYXRpb24pLCBmYWxzZSksXG4gICAgICAgICAgICAgICAgbmV3IG8uTGl0ZXJhbE1hcEVudHJ5KCdzdHlsZXMnLCBzdHlsZXMsIGZhbHNlKSxcbiAgICAgICAgICAgICAgICBuZXcgby5MaXRlcmFsTWFwRW50cnkoJ2RhdGEnLCBuZXcgby5MaXRlcmFsTWFwRXhwcihjdXN0b21SZW5kZXJEYXRhKSwgZmFsc2UpXG4gICAgICAgICAgICAgIF0pXSkpXG4gICAgICAgICAgICAgIC50b0RlY2xTdG10KFxuICAgICAgICAgICAgICAgICAgby5pbXBvcnRUeXBlKElkZW50aWZpZXJzLlJlbmRlcmVyVHlwZTIpLFxuICAgICAgICAgICAgICAgICAgW28uU3RtdE1vZGlmaWVyLkZpbmFsLCBvLlN0bXRNb2RpZmllci5FeHBvcnRlZF0pKTtcbiAgICB9XG5cbiAgICBjb25zdCB2aWV3QnVpbGRlckZhY3RvcnkgPSAocGFyZW50OiBWaWV3QnVpbGRlcnxudWxsKTogVmlld0J1aWxkZXIgPT4ge1xuICAgICAgY29uc3QgZW1iZWRkZWRWaWV3SW5kZXggPSBlbWJlZGRlZFZpZXdDb3VudCsrO1xuICAgICAgcmV0dXJuIG5ldyBWaWV3QnVpbGRlcihcbiAgICAgICAgICB0aGlzLl9yZWZsZWN0b3IsIG91dHB1dEN0eCwgcGFyZW50LCBjb21wb25lbnQsIGVtYmVkZGVkVmlld0luZGV4LCB1c2VkUGlwZXMsXG4gICAgICAgICAgdmlld0J1aWxkZXJGYWN0b3J5KTtcbiAgICB9O1xuXG4gICAgY29uc3QgdmlzaXRvciA9IHZpZXdCdWlsZGVyRmFjdG9yeShudWxsKTtcbiAgICB2aXNpdG9yLnZpc2l0QWxsKFtdLCB0ZW1wbGF0ZSk7XG5cbiAgICBvdXRwdXRDdHguc3RhdGVtZW50cy5wdXNoKC4uLnZpc2l0b3IuYnVpbGQoKSk7XG5cbiAgICByZXR1cm4gbmV3IFZpZXdDb21waWxlUmVzdWx0KHZpc2l0b3Iudmlld05hbWUsIHJlbmRlckNvbXBvbmVudFZhck5hbWUpO1xuICB9XG59XG5cbmludGVyZmFjZSBWaWV3QnVpbGRlckZhY3Rvcnkge1xuICAocGFyZW50OiBWaWV3QnVpbGRlcik6IFZpZXdCdWlsZGVyO1xufVxuXG5pbnRlcmZhY2UgVXBkYXRlRXhwcmVzc2lvbiB7XG4gIGNvbnRleHQ6IG8uRXhwcmVzc2lvbjtcbiAgbm9kZUluZGV4OiBudW1iZXI7XG4gIGJpbmRpbmdJbmRleDogbnVtYmVyO1xuICBzb3VyY2VTcGFuOiBQYXJzZVNvdXJjZVNwYW47XG4gIHZhbHVlOiBBU1Q7XG59XG5cbmNvbnN0IExPR19WQVIgPSBvLnZhcmlhYmxlKCdfbCcpO1xuY29uc3QgVklFV19WQVIgPSBvLnZhcmlhYmxlKCdfdicpO1xuY29uc3QgQ0hFQ0tfVkFSID0gby52YXJpYWJsZSgnX2NrJyk7XG5jb25zdCBDT01QX1ZBUiA9IG8udmFyaWFibGUoJ19jbycpO1xuY29uc3QgRVZFTlRfTkFNRV9WQVIgPSBvLnZhcmlhYmxlKCdlbicpO1xuY29uc3QgQUxMT1dfREVGQVVMVF9WQVIgPSBvLnZhcmlhYmxlKGBhZGApO1xuXG5jbGFzcyBWaWV3QnVpbGRlciBpbXBsZW1lbnRzIFRlbXBsYXRlQXN0VmlzaXRvciwgTG9jYWxSZXNvbHZlciB7XG4gIHByaXZhdGUgY29tcFR5cGU6IG8uVHlwZTtcbiAgcHJpdmF0ZSBub2RlczogKCgpID0+IHtcbiAgICBzb3VyY2VTcGFuOiBQYXJzZVNvdXJjZVNwYW4gfCBudWxsLFxuICAgIG5vZGVEZWY6IG8uRXhwcmVzc2lvbixcbiAgICBub2RlRmxhZ3M6IE5vZGVGbGFncyxcbiAgICB1cGRhdGVEaXJlY3RpdmVzPzogVXBkYXRlRXhwcmVzc2lvbltdLFxuICAgIHVwZGF0ZVJlbmRlcmVyPzogVXBkYXRlRXhwcmVzc2lvbltdXG4gIH0pW10gPSBbXTtcbiAgcHJpdmF0ZSBwdXJlUGlwZU5vZGVJbmRpY2VzOiB7W3BpcGVOYW1lOiBzdHJpbmddOiBudW1iZXJ9ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcbiAgLy8gTmVlZCBPYmplY3QuY3JlYXRlIHNvIHRoYXQgd2UgZG9uJ3QgaGF2ZSBidWlsdGluIHZhbHVlcy4uLlxuICBwcml2YXRlIHJlZk5vZGVJbmRpY2VzOiB7W3JlZk5hbWU6IHN0cmluZ106IG51bWJlcn0gPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuICBwcml2YXRlIHZhcmlhYmxlczogVmFyaWFibGVBc3RbXSA9IFtdO1xuICBwcml2YXRlIGNoaWxkcmVuOiBWaWV3QnVpbGRlcltdID0gW107XG5cbiAgcHVibGljIHJlYWRvbmx5IHZpZXdOYW1lOiBzdHJpbmc7XG5cbiAgY29uc3RydWN0b3IoXG4gICAgICBwcml2YXRlIHJlZmxlY3RvcjogQ29tcGlsZVJlZmxlY3RvciwgcHJpdmF0ZSBvdXRwdXRDdHg6IE91dHB1dENvbnRleHQsXG4gICAgICBwcml2YXRlIHBhcmVudDogVmlld0J1aWxkZXJ8bnVsbCwgcHJpdmF0ZSBjb21wb25lbnQ6IENvbXBpbGVEaXJlY3RpdmVNZXRhZGF0YSxcbiAgICAgIHByaXZhdGUgZW1iZWRkZWRWaWV3SW5kZXg6IG51bWJlciwgcHJpdmF0ZSB1c2VkUGlwZXM6IENvbXBpbGVQaXBlU3VtbWFyeVtdLFxuICAgICAgcHJpdmF0ZSB2aWV3QnVpbGRlckZhY3Rvcnk6IFZpZXdCdWlsZGVyRmFjdG9yeSkge1xuICAgIC8vIFRPRE8odGJvc2NoKTogVGhlIG9sZCB2aWV3IGNvbXBpbGVyIHVzZWQgdG8gdXNlIGFuIGBhbnlgIHR5cGVcbiAgICAvLyBmb3IgdGhlIGNvbnRleHQgaW4gYW55IGVtYmVkZGVkIHZpZXcuIFdlIGtlZXAgdGhpcyBiZWhhaXZvciBmb3Igbm93XG4gICAgLy8gdG8gYmUgYWJsZSB0byBpbnRyb2R1Y2UgdGhlIG5ldyB2aWV3IGNvbXBpbGVyIHdpdGhvdXQgdG9vIG1hbnkgZXJyb3JzLlxuICAgIHRoaXMuY29tcFR5cGUgPSB0aGlzLmVtYmVkZGVkVmlld0luZGV4ID4gMCA/XG4gICAgICAgIG8uRFlOQU1JQ19UWVBFIDpcbiAgICAgICAgby5leHByZXNzaW9uVHlwZShvdXRwdXRDdHguaW1wb3J0RXhwcih0aGlzLmNvbXBvbmVudC50eXBlLnJlZmVyZW5jZSkpITtcbiAgICB0aGlzLnZpZXdOYW1lID0gdmlld0NsYXNzTmFtZSh0aGlzLmNvbXBvbmVudC50eXBlLnJlZmVyZW5jZSwgdGhpcy5lbWJlZGRlZFZpZXdJbmRleCk7XG4gIH1cblxuICB2aXNpdEFsbCh2YXJpYWJsZXM6IFZhcmlhYmxlQXN0W10sIGFzdE5vZGVzOiBUZW1wbGF0ZUFzdFtdKSB7XG4gICAgdGhpcy52YXJpYWJsZXMgPSB2YXJpYWJsZXM7XG4gICAgLy8gY3JlYXRlIHRoZSBwaXBlcyBmb3IgdGhlIHB1cmUgcGlwZXMgaW1tZWRpYXRlbHksIHNvIHRoYXQgd2Uga25vdyB0aGVpciBpbmRpY2VzLlxuICAgIGlmICghdGhpcy5wYXJlbnQpIHtcbiAgICAgIHRoaXMudXNlZFBpcGVzLmZvckVhY2goKHBpcGUpID0+IHtcbiAgICAgICAgaWYgKHBpcGUucHVyZSkge1xuICAgICAgICAgIHRoaXMucHVyZVBpcGVOb2RlSW5kaWNlc1twaXBlLm5hbWVdID0gdGhpcy5fY3JlYXRlUGlwZShudWxsLCBwaXBlKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLnBhcmVudCkge1xuICAgICAgdGhpcy5jb21wb25lbnQudmlld1F1ZXJpZXMuZm9yRWFjaCgocXVlcnksIHF1ZXJ5SW5kZXgpID0+IHtcbiAgICAgICAgLy8gTm90ZTogcXVlcmllcyBzdGFydCB3aXRoIGlkIDEgc28gd2UgY2FuIHVzZSB0aGUgbnVtYmVyIGluIGEgQmxvb20gZmlsdGVyIVxuICAgICAgICBjb25zdCBxdWVyeUlkID0gcXVlcnlJbmRleCArIDE7XG4gICAgICAgIGNvbnN0IGJpbmRpbmdUeXBlID0gcXVlcnkuZmlyc3QgPyBRdWVyeUJpbmRpbmdUeXBlLkZpcnN0IDogUXVlcnlCaW5kaW5nVHlwZS5BbGw7XG4gICAgICAgIGNvbnN0IGZsYWdzID0gTm9kZUZsYWdzLlR5cGVWaWV3UXVlcnkgfCBjYWxjUXVlcnlGbGFncyhxdWVyeSk7XG4gICAgICAgIHRoaXMubm9kZXMucHVzaCgoKSA9PiAoe1xuICAgICAgICAgICAgICAgICAgICAgICAgICBzb3VyY2VTcGFuOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICAgICAgICBub2RlRmxhZ3M6IGZsYWdzLFxuICAgICAgICAgICAgICAgICAgICAgICAgICBub2RlRGVmOiBvLmltcG9ydEV4cHIoSWRlbnRpZmllcnMucXVlcnlEZWYpLmNhbGxGbihbXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgby5saXRlcmFsKGZsYWdzKSwgby5saXRlcmFsKHF1ZXJ5SWQpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ldyBvLkxpdGVyYWxNYXBFeHByKFtuZXcgby5MaXRlcmFsTWFwRW50cnkoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHF1ZXJ5LnByb3BlcnR5TmFtZSwgby5saXRlcmFsKGJpbmRpbmdUeXBlKSwgZmFsc2UpXSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgXSlcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgICB0ZW1wbGF0ZVZpc2l0QWxsKHRoaXMsIGFzdE5vZGVzKTtcbiAgICBpZiAodGhpcy5wYXJlbnQgJiYgKGFzdE5vZGVzLmxlbmd0aCA9PT0gMCB8fCBuZWVkc0FkZGl0aW9uYWxSb290Tm9kZShhc3ROb2RlcykpKSB7XG4gICAgICAvLyBpZiB0aGUgdmlldyBpcyBhbiBlbWJlZGRlZCB2aWV3LCB0aGVuIHdlIG5lZWQgdG8gYWRkIGFuIGFkZGl0aW9uYWwgcm9vdCBub2RlIGluIHNvbWUgY2FzZXNcbiAgICAgIHRoaXMubm9kZXMucHVzaCgoKSA9PiAoe1xuICAgICAgICAgICAgICAgICAgICAgICAgc291cmNlU3BhbjogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVGbGFnczogTm9kZUZsYWdzLlR5cGVFbGVtZW50LFxuICAgICAgICAgICAgICAgICAgICAgICAgbm9kZURlZjogby5pbXBvcnRFeHByKElkZW50aWZpZXJzLmFuY2hvckRlZikuY2FsbEZuKFtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgby5saXRlcmFsKE5vZGVGbGFncy5Ob25lKSwgby5OVUxMX0VYUFIsIG8uTlVMTF9FWFBSLCBvLmxpdGVyYWwoMClcbiAgICAgICAgICAgICAgICAgICAgICAgIF0pXG4gICAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgIH1cbiAgfVxuXG4gIGJ1aWxkKHRhcmdldFN0YXRlbWVudHM6IG8uU3RhdGVtZW50W10gPSBbXSk6IG8uU3RhdGVtZW50W10ge1xuICAgIHRoaXMuY2hpbGRyZW4uZm9yRWFjaCgoY2hpbGQpID0+IGNoaWxkLmJ1aWxkKHRhcmdldFN0YXRlbWVudHMpKTtcblxuICAgIGNvbnN0IHt1cGRhdGVSZW5kZXJlclN0bXRzLCB1cGRhdGVEaXJlY3RpdmVzU3RtdHMsIG5vZGVEZWZFeHByc30gPVxuICAgICAgICB0aGlzLl9jcmVhdGVOb2RlRXhwcmVzc2lvbnMoKTtcblxuICAgIGNvbnN0IHVwZGF0ZVJlbmRlcmVyRm4gPSB0aGlzLl9jcmVhdGVVcGRhdGVGbih1cGRhdGVSZW5kZXJlclN0bXRzKTtcbiAgICBjb25zdCB1cGRhdGVEaXJlY3RpdmVzRm4gPSB0aGlzLl9jcmVhdGVVcGRhdGVGbih1cGRhdGVEaXJlY3RpdmVzU3RtdHMpO1xuXG5cbiAgICBsZXQgdmlld0ZsYWdzID0gVmlld0ZsYWdzLk5vbmU7XG4gICAgaWYgKCF0aGlzLnBhcmVudCAmJiB0aGlzLmNvbXBvbmVudC5jaGFuZ2VEZXRlY3Rpb24gPT09IENoYW5nZURldGVjdGlvblN0cmF0ZWd5Lk9uUHVzaCkge1xuICAgICAgdmlld0ZsYWdzIHw9IFZpZXdGbGFncy5PblB1c2g7XG4gICAgfVxuICAgIGNvbnN0IHZpZXdGYWN0b3J5ID0gbmV3IG8uRGVjbGFyZUZ1bmN0aW9uU3RtdChcbiAgICAgICAgdGhpcy52aWV3TmFtZSwgW25ldyBvLkZuUGFyYW0oTE9HX1ZBUi5uYW1lISldLFxuICAgICAgICBbbmV3IG8uUmV0dXJuU3RhdGVtZW50KG8uaW1wb3J0RXhwcihJZGVudGlmaWVycy52aWV3RGVmKS5jYWxsRm4oW1xuICAgICAgICAgIG8ubGl0ZXJhbCh2aWV3RmxhZ3MpLFxuICAgICAgICAgIG8ubGl0ZXJhbEFycihub2RlRGVmRXhwcnMpLFxuICAgICAgICAgIHVwZGF0ZURpcmVjdGl2ZXNGbixcbiAgICAgICAgICB1cGRhdGVSZW5kZXJlckZuLFxuICAgICAgICBdKSldLFxuICAgICAgICBvLmltcG9ydFR5cGUoSWRlbnRpZmllcnMuVmlld0RlZmluaXRpb24pLFxuICAgICAgICB0aGlzLmVtYmVkZGVkVmlld0luZGV4ID09PSAwID8gW28uU3RtdE1vZGlmaWVyLkV4cG9ydGVkXSA6IFtdKTtcblxuICAgIHRhcmdldFN0YXRlbWVudHMucHVzaCh2aWV3RmFjdG9yeSk7XG4gICAgcmV0dXJuIHRhcmdldFN0YXRlbWVudHM7XG4gIH1cblxuICBwcml2YXRlIF9jcmVhdGVVcGRhdGVGbih1cGRhdGVTdG10czogby5TdGF0ZW1lbnRbXSk6IG8uRXhwcmVzc2lvbiB7XG4gICAgbGV0IHVwZGF0ZUZuOiBvLkV4cHJlc3Npb247XG4gICAgaWYgKHVwZGF0ZVN0bXRzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnN0IHByZVN0bXRzOiBvLlN0YXRlbWVudFtdID0gW107XG4gICAgICBpZiAoIXRoaXMuY29tcG9uZW50LmlzSG9zdCAmJiBvLmZpbmRSZWFkVmFyTmFtZXModXBkYXRlU3RtdHMpLmhhcyhDT01QX1ZBUi5uYW1lISkpIHtcbiAgICAgICAgcHJlU3RtdHMucHVzaChDT01QX1ZBUi5zZXQoVklFV19WQVIucHJvcCgnY29tcG9uZW50JykpLnRvRGVjbFN0bXQodGhpcy5jb21wVHlwZSkpO1xuICAgICAgfVxuICAgICAgdXBkYXRlRm4gPSBvLmZuKFxuICAgICAgICAgIFtcbiAgICAgICAgICAgIG5ldyBvLkZuUGFyYW0oQ0hFQ0tfVkFSLm5hbWUhLCBvLklORkVSUkVEX1RZUEUpLFxuICAgICAgICAgICAgbmV3IG8uRm5QYXJhbShWSUVXX1ZBUi5uYW1lISwgby5JTkZFUlJFRF9UWVBFKVxuICAgICAgICAgIF0sXG4gICAgICAgICAgWy4uLnByZVN0bXRzLCAuLi51cGRhdGVTdG10c10sIG8uSU5GRVJSRURfVFlQRSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHVwZGF0ZUZuID0gby5OVUxMX0VYUFI7XG4gICAgfVxuICAgIHJldHVybiB1cGRhdGVGbjtcbiAgfVxuXG4gIHZpc2l0TmdDb250ZW50KGFzdDogTmdDb250ZW50QXN0LCBjb250ZXh0OiBhbnkpOiBhbnkge1xuICAgIC8vIG5nQ29udGVudERlZihuZ0NvbnRlbnRJbmRleDogbnVtYmVyLCBpbmRleDogbnVtYmVyKTogTm9kZURlZjtcbiAgICB0aGlzLm5vZGVzLnB1c2goKCkgPT4gKHtcbiAgICAgICAgICAgICAgICAgICAgICBzb3VyY2VTcGFuOiBhc3Quc291cmNlU3BhbixcbiAgICAgICAgICAgICAgICAgICAgICBub2RlRmxhZ3M6IE5vZGVGbGFncy5UeXBlTmdDb250ZW50LFxuICAgICAgICAgICAgICAgICAgICAgIG5vZGVEZWY6IG8uaW1wb3J0RXhwcihJZGVudGlmaWVycy5uZ0NvbnRlbnREZWYpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5jYWxsRm4oW28ubGl0ZXJhbChhc3QubmdDb250ZW50SW5kZXgpLCBvLmxpdGVyYWwoYXN0LmluZGV4KV0pXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgfVxuXG4gIHZpc2l0VGV4dChhc3Q6IFRleHRBc3QsIGNvbnRleHQ6IGFueSk6IGFueSB7XG4gICAgLy8gU3RhdGljIHRleHQgbm9kZXMgaGF2ZSBubyBjaGVjayBmdW5jdGlvblxuICAgIGNvbnN0IGNoZWNrSW5kZXggPSAtMTtcbiAgICB0aGlzLm5vZGVzLnB1c2goKCkgPT4gKHtcbiAgICAgICAgICAgICAgICAgICAgICBzb3VyY2VTcGFuOiBhc3Quc291cmNlU3BhbixcbiAgICAgICAgICAgICAgICAgICAgICBub2RlRmxhZ3M6IE5vZGVGbGFncy5UeXBlVGV4dCxcbiAgICAgICAgICAgICAgICAgICAgICBub2RlRGVmOiBvLmltcG9ydEV4cHIoSWRlbnRpZmllcnMudGV4dERlZikuY2FsbEZuKFtcbiAgICAgICAgICAgICAgICAgICAgICAgIG8ubGl0ZXJhbChjaGVja0luZGV4KSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG8ubGl0ZXJhbChhc3QubmdDb250ZW50SW5kZXgpLFxuICAgICAgICAgICAgICAgICAgICAgICAgby5saXRlcmFsQXJyKFtvLmxpdGVyYWwoYXN0LnZhbHVlKV0pLFxuICAgICAgICAgICAgICAgICAgICAgIF0pXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgfVxuXG4gIHZpc2l0Qm91bmRUZXh0KGFzdDogQm91bmRUZXh0QXN0LCBjb250ZXh0OiBhbnkpOiBhbnkge1xuICAgIGNvbnN0IG5vZGVJbmRleCA9IHRoaXMubm9kZXMubGVuZ3RoO1xuICAgIC8vIHJlc2VydmUgdGhlIHNwYWNlIGluIHRoZSBub2RlRGVmcyBhcnJheVxuICAgIHRoaXMubm9kZXMucHVzaChudWxsISk7XG5cbiAgICBjb25zdCBhc3RXaXRoU291cmNlID0gPEFTVFdpdGhTb3VyY2U+YXN0LnZhbHVlO1xuICAgIGNvbnN0IGludGVyID0gPEludGVycG9sYXRpb24+YXN0V2l0aFNvdXJjZS5hc3Q7XG5cbiAgICBjb25zdCB1cGRhdGVSZW5kZXJlckV4cHJlc3Npb25zID0gaW50ZXIuZXhwcmVzc2lvbnMubWFwKFxuICAgICAgICAoZXhwciwgYmluZGluZ0luZGV4KSA9PiB0aGlzLl9wcmVwcm9jZXNzVXBkYXRlRXhwcmVzc2lvbihcbiAgICAgICAgICAgIHtub2RlSW5kZXgsIGJpbmRpbmdJbmRleCwgc291cmNlU3BhbjogYXN0LnNvdXJjZVNwYW4sIGNvbnRleHQ6IENPTVBfVkFSLCB2YWx1ZTogZXhwcn0pKTtcblxuICAgIC8vIENoZWNrIGluZGV4IGlzIHRoZSBzYW1lIGFzIHRoZSBub2RlIGluZGV4IGR1cmluZyBjb21waWxhdGlvblxuICAgIC8vIFRoZXkgbWlnaHQgb25seSBkaWZmZXIgYXQgcnVudGltZVxuICAgIGNvbnN0IGNoZWNrSW5kZXggPSBub2RlSW5kZXg7XG5cbiAgICB0aGlzLm5vZGVzW25vZGVJbmRleF0gPSAoKSA9PiAoe1xuICAgICAgc291cmNlU3BhbjogYXN0LnNvdXJjZVNwYW4sXG4gICAgICBub2RlRmxhZ3M6IE5vZGVGbGFncy5UeXBlVGV4dCxcbiAgICAgIG5vZGVEZWY6IG8uaW1wb3J0RXhwcihJZGVudGlmaWVycy50ZXh0RGVmKS5jYWxsRm4oW1xuICAgICAgICBvLmxpdGVyYWwoY2hlY2tJbmRleCksXG4gICAgICAgIG8ubGl0ZXJhbChhc3QubmdDb250ZW50SW5kZXgpLFxuICAgICAgICBvLmxpdGVyYWxBcnIoaW50ZXIuc3RyaW5ncy5tYXAocyA9PiBvLmxpdGVyYWwocykpKSxcbiAgICAgIF0pLFxuICAgICAgdXBkYXRlUmVuZGVyZXI6IHVwZGF0ZVJlbmRlcmVyRXhwcmVzc2lvbnNcbiAgICB9KTtcbiAgfVxuXG4gIHZpc2l0RW1iZWRkZWRUZW1wbGF0ZShhc3Q6IEVtYmVkZGVkVGVtcGxhdGVBc3QsIGNvbnRleHQ6IGFueSk6IGFueSB7XG4gICAgY29uc3Qgbm9kZUluZGV4ID0gdGhpcy5ub2Rlcy5sZW5ndGg7XG4gICAgLy8gcmVzZXJ2ZSB0aGUgc3BhY2UgaW4gdGhlIG5vZGVEZWZzIGFycmF5XG4gICAgdGhpcy5ub2Rlcy5wdXNoKG51bGwhKTtcblxuICAgIGNvbnN0IHtmbGFncywgcXVlcnlNYXRjaGVzRXhwciwgaG9zdEV2ZW50c30gPSB0aGlzLl92aXNpdEVsZW1lbnRPclRlbXBsYXRlKG5vZGVJbmRleCwgYXN0KTtcblxuICAgIGNvbnN0IGNoaWxkVmlzaXRvciA9IHRoaXMudmlld0J1aWxkZXJGYWN0b3J5KHRoaXMpO1xuICAgIHRoaXMuY2hpbGRyZW4ucHVzaChjaGlsZFZpc2l0b3IpO1xuICAgIGNoaWxkVmlzaXRvci52aXNpdEFsbChhc3QudmFyaWFibGVzLCBhc3QuY2hpbGRyZW4pO1xuXG4gICAgY29uc3QgY2hpbGRDb3VudCA9IHRoaXMubm9kZXMubGVuZ3RoIC0gbm9kZUluZGV4IC0gMTtcblxuICAgIC8vIGFuY2hvckRlZihcbiAgICAvLyAgIGZsYWdzOiBOb2RlRmxhZ3MsIG1hdGNoZWRRdWVyaWVzOiBbc3RyaW5nLCBRdWVyeVZhbHVlVHlwZV1bXSwgbmdDb250ZW50SW5kZXg6IG51bWJlcixcbiAgICAvLyAgIGNoaWxkQ291bnQ6IG51bWJlciwgaGFuZGxlRXZlbnRGbj86IEVsZW1lbnRIYW5kbGVFdmVudEZuLCB0ZW1wbGF0ZUZhY3Rvcnk/OlxuICAgIC8vICAgVmlld0RlZmluaXRpb25GYWN0b3J5KTogTm9kZURlZjtcbiAgICB0aGlzLm5vZGVzW25vZGVJbmRleF0gPSAoKSA9PiAoe1xuICAgICAgc291cmNlU3BhbjogYXN0LnNvdXJjZVNwYW4sXG4gICAgICBub2RlRmxhZ3M6IE5vZGVGbGFncy5UeXBlRWxlbWVudCB8IGZsYWdzLFxuICAgICAgbm9kZURlZjogby5pbXBvcnRFeHByKElkZW50aWZpZXJzLmFuY2hvckRlZikuY2FsbEZuKFtcbiAgICAgICAgby5saXRlcmFsKGZsYWdzKSxcbiAgICAgICAgcXVlcnlNYXRjaGVzRXhwcixcbiAgICAgICAgby5saXRlcmFsKGFzdC5uZ0NvbnRlbnRJbmRleCksXG4gICAgICAgIG8ubGl0ZXJhbChjaGlsZENvdW50KSxcbiAgICAgICAgdGhpcy5fY3JlYXRlRWxlbWVudEhhbmRsZUV2ZW50Rm4obm9kZUluZGV4LCBob3N0RXZlbnRzKSxcbiAgICAgICAgby52YXJpYWJsZShjaGlsZFZpc2l0b3Iudmlld05hbWUpLFxuICAgICAgXSlcbiAgICB9KTtcbiAgfVxuXG4gIHZpc2l0RWxlbWVudChhc3Q6IEVsZW1lbnRBc3QsIGNvbnRleHQ6IGFueSk6IGFueSB7XG4gICAgY29uc3Qgbm9kZUluZGV4ID0gdGhpcy5ub2Rlcy5sZW5ndGg7XG4gICAgLy8gcmVzZXJ2ZSB0aGUgc3BhY2UgaW4gdGhlIG5vZGVEZWZzIGFycmF5IHNvIHdlIGNhbiBhZGQgY2hpbGRyZW5cbiAgICB0aGlzLm5vZGVzLnB1c2gobnVsbCEpO1xuXG4gICAgLy8gVXNpbmcgYSBudWxsIGVsZW1lbnQgbmFtZSBjcmVhdGVzIGFuIGFuY2hvci5cbiAgICBjb25zdCBlbE5hbWU6IHN0cmluZ3xudWxsID0gaXNOZ0NvbnRhaW5lcihhc3QubmFtZSkgPyBudWxsIDogYXN0Lm5hbWU7XG5cbiAgICBjb25zdCB7ZmxhZ3MsIHVzZWRFdmVudHMsIHF1ZXJ5TWF0Y2hlc0V4cHIsIGhvc3RCaW5kaW5nczogZGlySG9zdEJpbmRpbmdzLCBob3N0RXZlbnRzfSA9XG4gICAgICAgIHRoaXMuX3Zpc2l0RWxlbWVudE9yVGVtcGxhdGUobm9kZUluZGV4LCBhc3QpO1xuXG4gICAgbGV0IGlucHV0RGVmczogby5FeHByZXNzaW9uW10gPSBbXTtcbiAgICBsZXQgdXBkYXRlUmVuZGVyZXJFeHByZXNzaW9uczogVXBkYXRlRXhwcmVzc2lvbltdID0gW107XG4gICAgbGV0IG91dHB1dERlZnM6IG8uRXhwcmVzc2lvbltdID0gW107XG4gICAgaWYgKGVsTmFtZSkge1xuICAgICAgY29uc3QgaG9zdEJpbmRpbmdzOiBhbnlbXSA9IGFzdC5pbnB1dHNcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLm1hcCgoaW5wdXRBc3QpID0+ICh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb250ZXh0OiBDT01QX1ZBUiBhcyBvLkV4cHJlc3Npb24sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbnB1dEFzdCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRpckFzdDogbnVsbCBhcyBhbnksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSkpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5jb25jYXQoZGlySG9zdEJpbmRpbmdzKTtcbiAgICAgIGlmIChob3N0QmluZGluZ3MubGVuZ3RoKSB7XG4gICAgICAgIHVwZGF0ZVJlbmRlcmVyRXhwcmVzc2lvbnMgPVxuICAgICAgICAgICAgaG9zdEJpbmRpbmdzLm1hcCgoaG9zdEJpbmRpbmcsIGJpbmRpbmdJbmRleCkgPT4gdGhpcy5fcHJlcHJvY2Vzc1VwZGF0ZUV4cHJlc3Npb24oe1xuICAgICAgICAgICAgICBjb250ZXh0OiBob3N0QmluZGluZy5jb250ZXh0LFxuICAgICAgICAgICAgICBub2RlSW5kZXgsXG4gICAgICAgICAgICAgIGJpbmRpbmdJbmRleCxcbiAgICAgICAgICAgICAgc291cmNlU3BhbjogaG9zdEJpbmRpbmcuaW5wdXRBc3Quc291cmNlU3BhbixcbiAgICAgICAgICAgICAgdmFsdWU6IGhvc3RCaW5kaW5nLmlucHV0QXN0LnZhbHVlXG4gICAgICAgICAgICB9KSk7XG4gICAgICAgIGlucHV0RGVmcyA9IGhvc3RCaW5kaW5ncy5tYXAoXG4gICAgICAgICAgICBob3N0QmluZGluZyA9PiBlbGVtZW50QmluZGluZ0RlZihob3N0QmluZGluZy5pbnB1dEFzdCwgaG9zdEJpbmRpbmcuZGlyQXN0KSk7XG4gICAgICB9XG4gICAgICBvdXRwdXREZWZzID0gdXNlZEV2ZW50cy5tYXAoXG4gICAgICAgICAgKFt0YXJnZXQsIGV2ZW50TmFtZV0pID0+IG8ubGl0ZXJhbEFycihbby5saXRlcmFsKHRhcmdldCksIG8ubGl0ZXJhbChldmVudE5hbWUpXSkpO1xuICAgIH1cblxuICAgIHRlbXBsYXRlVmlzaXRBbGwodGhpcywgYXN0LmNoaWxkcmVuKTtcblxuICAgIGNvbnN0IGNoaWxkQ291bnQgPSB0aGlzLm5vZGVzLmxlbmd0aCAtIG5vZGVJbmRleCAtIDE7XG5cbiAgICBjb25zdCBjb21wQXN0ID0gYXN0LmRpcmVjdGl2ZXMuZmluZChkaXJBc3QgPT4gZGlyQXN0LmRpcmVjdGl2ZS5pc0NvbXBvbmVudCk7XG4gICAgbGV0IGNvbXBSZW5kZXJlclR5cGUgPSBvLk5VTExfRVhQUiBhcyBvLkV4cHJlc3Npb247XG4gICAgbGV0IGNvbXBWaWV3ID0gby5OVUxMX0VYUFIgYXMgby5FeHByZXNzaW9uO1xuICAgIGlmIChjb21wQXN0KSB7XG4gICAgICBjb21wVmlldyA9IHRoaXMub3V0cHV0Q3R4LmltcG9ydEV4cHIoY29tcEFzdC5kaXJlY3RpdmUuY29tcG9uZW50Vmlld1R5cGUpO1xuICAgICAgY29tcFJlbmRlcmVyVHlwZSA9IHRoaXMub3V0cHV0Q3R4LmltcG9ydEV4cHIoY29tcEFzdC5kaXJlY3RpdmUucmVuZGVyZXJUeXBlKTtcbiAgICB9XG5cbiAgICAvLyBDaGVjayBpbmRleCBpcyB0aGUgc2FtZSBhcyB0aGUgbm9kZSBpbmRleCBkdXJpbmcgY29tcGlsYXRpb25cbiAgICAvLyBUaGV5IG1pZ2h0IG9ubHkgZGlmZmVyIGF0IHJ1bnRpbWVcbiAgICBjb25zdCBjaGVja0luZGV4ID0gbm9kZUluZGV4O1xuXG4gICAgdGhpcy5ub2Rlc1tub2RlSW5kZXhdID0gKCkgPT4gKHtcbiAgICAgIHNvdXJjZVNwYW46IGFzdC5zb3VyY2VTcGFuLFxuICAgICAgbm9kZUZsYWdzOiBOb2RlRmxhZ3MuVHlwZUVsZW1lbnQgfCBmbGFncyxcbiAgICAgIG5vZGVEZWY6IG8uaW1wb3J0RXhwcihJZGVudGlmaWVycy5lbGVtZW50RGVmKS5jYWxsRm4oW1xuICAgICAgICBvLmxpdGVyYWwoY2hlY2tJbmRleCksXG4gICAgICAgIG8ubGl0ZXJhbChmbGFncyksXG4gICAgICAgIHF1ZXJ5TWF0Y2hlc0V4cHIsXG4gICAgICAgIG8ubGl0ZXJhbChhc3QubmdDb250ZW50SW5kZXgpLFxuICAgICAgICBvLmxpdGVyYWwoY2hpbGRDb3VudCksXG4gICAgICAgIG8ubGl0ZXJhbChlbE5hbWUpLFxuICAgICAgICBlbE5hbWUgPyBmaXhlZEF0dHJzRGVmKGFzdCkgOiBvLk5VTExfRVhQUixcbiAgICAgICAgaW5wdXREZWZzLmxlbmd0aCA/IG8ubGl0ZXJhbEFycihpbnB1dERlZnMpIDogby5OVUxMX0VYUFIsXG4gICAgICAgIG91dHB1dERlZnMubGVuZ3RoID8gby5saXRlcmFsQXJyKG91dHB1dERlZnMpIDogby5OVUxMX0VYUFIsXG4gICAgICAgIHRoaXMuX2NyZWF0ZUVsZW1lbnRIYW5kbGVFdmVudEZuKG5vZGVJbmRleCwgaG9zdEV2ZW50cyksXG4gICAgICAgIGNvbXBWaWV3LFxuICAgICAgICBjb21wUmVuZGVyZXJUeXBlLFxuICAgICAgXSksXG4gICAgICB1cGRhdGVSZW5kZXJlcjogdXBkYXRlUmVuZGVyZXJFeHByZXNzaW9uc1xuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBfdmlzaXRFbGVtZW50T3JUZW1wbGF0ZShub2RlSW5kZXg6IG51bWJlciwgYXN0OiB7XG4gICAgaGFzVmlld0NvbnRhaW5lcjogYm9vbGVhbixcbiAgICBvdXRwdXRzOiBCb3VuZEV2ZW50QXN0W10sXG4gICAgZGlyZWN0aXZlczogRGlyZWN0aXZlQXN0W10sXG4gICAgcHJvdmlkZXJzOiBQcm92aWRlckFzdFtdLFxuICAgIHJlZmVyZW5jZXM6IFJlZmVyZW5jZUFzdFtdLFxuICAgIHF1ZXJ5TWF0Y2hlczogUXVlcnlNYXRjaFtdXG4gIH0pOiB7XG4gICAgZmxhZ3M6IE5vZGVGbGFncyxcbiAgICB1c2VkRXZlbnRzOiBbc3RyaW5nfG51bGwsIHN0cmluZ11bXSxcbiAgICBxdWVyeU1hdGNoZXNFeHByOiBvLkV4cHJlc3Npb24sXG4gICAgaG9zdEJpbmRpbmdzOlxuICAgICAgICB7Y29udGV4dDogby5FeHByZXNzaW9uLCBpbnB1dEFzdDogQm91bmRFbGVtZW50UHJvcGVydHlBc3QsIGRpckFzdDogRGlyZWN0aXZlQXN0fVtdLFxuICAgIGhvc3RFdmVudHM6IHtjb250ZXh0OiBvLkV4cHJlc3Npb24sIGV2ZW50QXN0OiBCb3VuZEV2ZW50QXN0LCBkaXJBc3Q6IERpcmVjdGl2ZUFzdH1bXSxcbiAgfSB7XG4gICAgbGV0IGZsYWdzID0gTm9kZUZsYWdzLk5vbmU7XG4gICAgaWYgKGFzdC5oYXNWaWV3Q29udGFpbmVyKSB7XG4gICAgICBmbGFncyB8PSBOb2RlRmxhZ3MuRW1iZWRkZWRWaWV3cztcbiAgICB9XG4gICAgY29uc3QgdXNlZEV2ZW50cyA9IG5ldyBNYXA8c3RyaW5nLCBbc3RyaW5nIHwgbnVsbCwgc3RyaW5nXT4oKTtcbiAgICBhc3Qub3V0cHV0cy5mb3JFYWNoKChldmVudCkgPT4ge1xuICAgICAgY29uc3Qge25hbWUsIHRhcmdldH0gPSBlbGVtZW50RXZlbnROYW1lQW5kVGFyZ2V0KGV2ZW50LCBudWxsKTtcbiAgICAgIHVzZWRFdmVudHMuc2V0KGVsZW1lbnRFdmVudEZ1bGxOYW1lKHRhcmdldCwgbmFtZSksIFt0YXJnZXQsIG5hbWVdKTtcbiAgICB9KTtcbiAgICBhc3QuZGlyZWN0aXZlcy5mb3JFYWNoKChkaXJBc3QpID0+IHtcbiAgICAgIGRpckFzdC5ob3N0RXZlbnRzLmZvckVhY2goKGV2ZW50KSA9PiB7XG4gICAgICAgIGNvbnN0IHtuYW1lLCB0YXJnZXR9ID0gZWxlbWVudEV2ZW50TmFtZUFuZFRhcmdldChldmVudCwgZGlyQXN0KTtcbiAgICAgICAgdXNlZEV2ZW50cy5zZXQoZWxlbWVudEV2ZW50RnVsbE5hbWUodGFyZ2V0LCBuYW1lKSwgW3RhcmdldCwgbmFtZV0pO1xuICAgICAgfSk7XG4gICAgfSk7XG4gICAgY29uc3QgaG9zdEJpbmRpbmdzOlxuICAgICAgICB7Y29udGV4dDogby5FeHByZXNzaW9uLCBpbnB1dEFzdDogQm91bmRFbGVtZW50UHJvcGVydHlBc3QsIGRpckFzdDogRGlyZWN0aXZlQXN0fVtdID0gW107XG4gICAgY29uc3QgaG9zdEV2ZW50czoge2NvbnRleHQ6IG8uRXhwcmVzc2lvbiwgZXZlbnRBc3Q6IEJvdW5kRXZlbnRBc3QsIGRpckFzdDogRGlyZWN0aXZlQXN0fVtdID0gW107XG4gICAgdGhpcy5fdmlzaXRDb21wb25lbnRGYWN0b3J5UmVzb2x2ZXJQcm92aWRlcihhc3QuZGlyZWN0aXZlcyk7XG5cbiAgICBhc3QucHJvdmlkZXJzLmZvckVhY2gocHJvdmlkZXJBc3QgPT4ge1xuICAgICAgbGV0IGRpckFzdDogRGlyZWN0aXZlQXN0ID0gdW5kZWZpbmVkITtcbiAgICAgIGFzdC5kaXJlY3RpdmVzLmZvckVhY2gobG9jYWxEaXJBc3QgPT4ge1xuICAgICAgICBpZiAobG9jYWxEaXJBc3QuZGlyZWN0aXZlLnR5cGUucmVmZXJlbmNlID09PSB0b2tlblJlZmVyZW5jZShwcm92aWRlckFzdC50b2tlbikpIHtcbiAgICAgICAgICBkaXJBc3QgPSBsb2NhbERpckFzdDtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBpZiAoZGlyQXN0KSB7XG4gICAgICAgIGNvbnN0IHtob3N0QmluZGluZ3M6IGRpckhvc3RCaW5kaW5ncywgaG9zdEV2ZW50czogZGlySG9zdEV2ZW50c30gPVxuICAgICAgICAgICAgdGhpcy5fdmlzaXREaXJlY3RpdmUocHJvdmlkZXJBc3QsIGRpckFzdCwgYXN0LnJlZmVyZW5jZXMsIGFzdC5xdWVyeU1hdGNoZXMsIHVzZWRFdmVudHMpO1xuICAgICAgICBob3N0QmluZGluZ3MucHVzaCguLi5kaXJIb3N0QmluZGluZ3MpO1xuICAgICAgICBob3N0RXZlbnRzLnB1c2goLi4uZGlySG9zdEV2ZW50cyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLl92aXNpdFByb3ZpZGVyKHByb3ZpZGVyQXN0LCBhc3QucXVlcnlNYXRjaGVzKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGxldCBxdWVyeU1hdGNoRXhwcnM6IG8uRXhwcmVzc2lvbltdID0gW107XG4gICAgYXN0LnF1ZXJ5TWF0Y2hlcy5mb3JFYWNoKChtYXRjaCkgPT4ge1xuICAgICAgbGV0IHZhbHVlVHlwZTogUXVlcnlWYWx1ZVR5cGUgPSB1bmRlZmluZWQhO1xuICAgICAgaWYgKHRva2VuUmVmZXJlbmNlKG1hdGNoLnZhbHVlKSA9PT1cbiAgICAgICAgICB0aGlzLnJlZmxlY3Rvci5yZXNvbHZlRXh0ZXJuYWxSZWZlcmVuY2UoSWRlbnRpZmllcnMuRWxlbWVudFJlZikpIHtcbiAgICAgICAgdmFsdWVUeXBlID0gUXVlcnlWYWx1ZVR5cGUuRWxlbWVudFJlZjtcbiAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAgdG9rZW5SZWZlcmVuY2UobWF0Y2gudmFsdWUpID09PVxuICAgICAgICAgIHRoaXMucmVmbGVjdG9yLnJlc29sdmVFeHRlcm5hbFJlZmVyZW5jZShJZGVudGlmaWVycy5WaWV3Q29udGFpbmVyUmVmKSkge1xuICAgICAgICB2YWx1ZVR5cGUgPSBRdWVyeVZhbHVlVHlwZS5WaWV3Q29udGFpbmVyUmVmO1xuICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICB0b2tlblJlZmVyZW5jZShtYXRjaC52YWx1ZSkgPT09XG4gICAgICAgICAgdGhpcy5yZWZsZWN0b3IucmVzb2x2ZUV4dGVybmFsUmVmZXJlbmNlKElkZW50aWZpZXJzLlRlbXBsYXRlUmVmKSkge1xuICAgICAgICB2YWx1ZVR5cGUgPSBRdWVyeVZhbHVlVHlwZS5UZW1wbGF0ZVJlZjtcbiAgICAgIH1cbiAgICAgIGlmICh2YWx1ZVR5cGUgIT0gbnVsbCkge1xuICAgICAgICBxdWVyeU1hdGNoRXhwcnMucHVzaChvLmxpdGVyYWxBcnIoW28ubGl0ZXJhbChtYXRjaC5xdWVyeUlkKSwgby5saXRlcmFsKHZhbHVlVHlwZSldKSk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgYXN0LnJlZmVyZW5jZXMuZm9yRWFjaCgocmVmKSA9PiB7XG4gICAgICBsZXQgdmFsdWVUeXBlOiBRdWVyeVZhbHVlVHlwZSA9IHVuZGVmaW5lZCE7XG4gICAgICBpZiAoIXJlZi52YWx1ZSkge1xuICAgICAgICB2YWx1ZVR5cGUgPSBRdWVyeVZhbHVlVHlwZS5SZW5kZXJFbGVtZW50O1xuICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICB0b2tlblJlZmVyZW5jZShyZWYudmFsdWUpID09PVxuICAgICAgICAgIHRoaXMucmVmbGVjdG9yLnJlc29sdmVFeHRlcm5hbFJlZmVyZW5jZShJZGVudGlmaWVycy5UZW1wbGF0ZVJlZikpIHtcbiAgICAgICAgdmFsdWVUeXBlID0gUXVlcnlWYWx1ZVR5cGUuVGVtcGxhdGVSZWY7XG4gICAgICB9XG4gICAgICBpZiAodmFsdWVUeXBlICE9IG51bGwpIHtcbiAgICAgICAgdGhpcy5yZWZOb2RlSW5kaWNlc1tyZWYubmFtZV0gPSBub2RlSW5kZXg7XG4gICAgICAgIHF1ZXJ5TWF0Y2hFeHBycy5wdXNoKG8ubGl0ZXJhbEFycihbby5saXRlcmFsKHJlZi5uYW1lKSwgby5saXRlcmFsKHZhbHVlVHlwZSldKSk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgYXN0Lm91dHB1dHMuZm9yRWFjaCgob3V0cHV0QXN0KSA9PiB7XG4gICAgICBob3N0RXZlbnRzLnB1c2goe2NvbnRleHQ6IENPTVBfVkFSLCBldmVudEFzdDogb3V0cHV0QXN0LCBkaXJBc3Q6IG51bGwhfSk7XG4gICAgfSk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgZmxhZ3MsXG4gICAgICB1c2VkRXZlbnRzOiBBcnJheS5mcm9tKHVzZWRFdmVudHMudmFsdWVzKCkpLFxuICAgICAgcXVlcnlNYXRjaGVzRXhwcjogcXVlcnlNYXRjaEV4cHJzLmxlbmd0aCA/IG8ubGl0ZXJhbEFycihxdWVyeU1hdGNoRXhwcnMpIDogby5OVUxMX0VYUFIsXG4gICAgICBob3N0QmluZGluZ3MsXG4gICAgICBob3N0RXZlbnRzOiBob3N0RXZlbnRzXG4gICAgfTtcbiAgfVxuXG4gIHByaXZhdGUgX3Zpc2l0RGlyZWN0aXZlKFxuICAgICAgcHJvdmlkZXJBc3Q6IFByb3ZpZGVyQXN0LCBkaXJBc3Q6IERpcmVjdGl2ZUFzdCwgcmVmczogUmVmZXJlbmNlQXN0W10sXG4gICAgICBxdWVyeU1hdGNoZXM6IFF1ZXJ5TWF0Y2hbXSwgdXNlZEV2ZW50czogTWFwPHN0cmluZywgYW55Pik6IHtcbiAgICBob3N0QmluZGluZ3M6XG4gICAgICAgIHtjb250ZXh0OiBvLkV4cHJlc3Npb24sIGlucHV0QXN0OiBCb3VuZEVsZW1lbnRQcm9wZXJ0eUFzdCwgZGlyQXN0OiBEaXJlY3RpdmVBc3R9W10sXG4gICAgaG9zdEV2ZW50czoge2NvbnRleHQ6IG8uRXhwcmVzc2lvbiwgZXZlbnRBc3Q6IEJvdW5kRXZlbnRBc3QsIGRpckFzdDogRGlyZWN0aXZlQXN0fVtdXG4gIH0ge1xuICAgIGNvbnN0IG5vZGVJbmRleCA9IHRoaXMubm9kZXMubGVuZ3RoO1xuICAgIC8vIHJlc2VydmUgdGhlIHNwYWNlIGluIHRoZSBub2RlRGVmcyBhcnJheSBzbyB3ZSBjYW4gYWRkIGNoaWxkcmVuXG4gICAgdGhpcy5ub2Rlcy5wdXNoKG51bGwhKTtcblxuICAgIGRpckFzdC5kaXJlY3RpdmUucXVlcmllcy5mb3JFYWNoKChxdWVyeSwgcXVlcnlJbmRleCkgPT4ge1xuICAgICAgY29uc3QgcXVlcnlJZCA9IGRpckFzdC5jb250ZW50UXVlcnlTdGFydElkICsgcXVlcnlJbmRleDtcbiAgICAgIGNvbnN0IGZsYWdzID0gTm9kZUZsYWdzLlR5cGVDb250ZW50UXVlcnkgfCBjYWxjUXVlcnlGbGFncyhxdWVyeSk7XG4gICAgICBjb25zdCBiaW5kaW5nVHlwZSA9IHF1ZXJ5LmZpcnN0ID8gUXVlcnlCaW5kaW5nVHlwZS5GaXJzdCA6IFF1ZXJ5QmluZGluZ1R5cGUuQWxsO1xuICAgICAgdGhpcy5ub2Rlcy5wdXNoKCgpID0+ICh7XG4gICAgICAgICAgICAgICAgICAgICAgICBzb3VyY2VTcGFuOiBkaXJBc3Quc291cmNlU3BhbixcbiAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVGbGFnczogZmxhZ3MsXG4gICAgICAgICAgICAgICAgICAgICAgICBub2RlRGVmOiBvLmltcG9ydEV4cHIoSWRlbnRpZmllcnMucXVlcnlEZWYpLmNhbGxGbihbXG4gICAgICAgICAgICAgICAgICAgICAgICAgIG8ubGl0ZXJhbChmbGFncyksIG8ubGl0ZXJhbChxdWVyeUlkKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgbmV3IG8uTGl0ZXJhbE1hcEV4cHIoW25ldyBvLkxpdGVyYWxNYXBFbnRyeShcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHF1ZXJ5LnByb3BlcnR5TmFtZSwgby5saXRlcmFsKGJpbmRpbmdUeXBlKSwgZmFsc2UpXSlcbiAgICAgICAgICAgICAgICAgICAgICAgIF0pLFxuICAgICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICB9KTtcblxuICAgIC8vIE5vdGU6IHRoZSBvcGVyYXRpb24gYmVsb3cgbWlnaHQgYWxzbyBjcmVhdGUgbmV3IG5vZGVEZWZzLFxuICAgIC8vIGJ1dCB3ZSBkb24ndCB3YW50IHRoZW0gdG8gYmUgYSBjaGlsZCBvZiBhIGRpcmVjdGl2ZSxcbiAgICAvLyBhcyB0aGV5IG1pZ2h0IGJlIGEgcHJvdmlkZXIvcGlwZSBvbiB0aGVpciBvd24uXG4gICAgLy8gSS5lLiB3ZSBvbmx5IGFsbG93IHF1ZXJpZXMgYXMgY2hpbGRyZW4gb2YgZGlyZWN0aXZlcyBub2Rlcy5cbiAgICBjb25zdCBjaGlsZENvdW50ID0gdGhpcy5ub2Rlcy5sZW5ndGggLSBub2RlSW5kZXggLSAxO1xuXG4gICAgbGV0IHtmbGFncywgcXVlcnlNYXRjaEV4cHJzLCBwcm92aWRlckV4cHIsIGRlcHNFeHByfSA9XG4gICAgICAgIHRoaXMuX3Zpc2l0UHJvdmlkZXJPckRpcmVjdGl2ZShwcm92aWRlckFzdCwgcXVlcnlNYXRjaGVzKTtcblxuICAgIHJlZnMuZm9yRWFjaCgocmVmKSA9PiB7XG4gICAgICBpZiAocmVmLnZhbHVlICYmIHRva2VuUmVmZXJlbmNlKHJlZi52YWx1ZSkgPT09IHRva2VuUmVmZXJlbmNlKHByb3ZpZGVyQXN0LnRva2VuKSkge1xuICAgICAgICB0aGlzLnJlZk5vZGVJbmRpY2VzW3JlZi5uYW1lXSA9IG5vZGVJbmRleDtcbiAgICAgICAgcXVlcnlNYXRjaEV4cHJzLnB1c2goXG4gICAgICAgICAgICBvLmxpdGVyYWxBcnIoW28ubGl0ZXJhbChyZWYubmFtZSksIG8ubGl0ZXJhbChRdWVyeVZhbHVlVHlwZS5Qcm92aWRlcildKSk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBpZiAoZGlyQXN0LmRpcmVjdGl2ZS5pc0NvbXBvbmVudCkge1xuICAgICAgZmxhZ3MgfD0gTm9kZUZsYWdzLkNvbXBvbmVudDtcbiAgICB9XG5cbiAgICBjb25zdCBpbnB1dERlZnMgPSBkaXJBc3QuaW5wdXRzLm1hcCgoaW5wdXRBc3QsIGlucHV0SW5kZXgpID0+IHtcbiAgICAgIGNvbnN0IG1hcFZhbHVlID0gby5saXRlcmFsQXJyKFtvLmxpdGVyYWwoaW5wdXRJbmRleCksIG8ubGl0ZXJhbChpbnB1dEFzdC5kaXJlY3RpdmVOYW1lKV0pO1xuICAgICAgLy8gTm90ZTogaXQncyBpbXBvcnRhbnQgdG8gbm90IHF1b3RlIHRoZSBrZXkgc28gdGhhdCB3ZSBjYW4gY2FwdHVyZSByZW5hbWVzIGJ5IG1pbmlmaWVycyFcbiAgICAgIHJldHVybiBuZXcgby5MaXRlcmFsTWFwRW50cnkoaW5wdXRBc3QuZGlyZWN0aXZlTmFtZSwgbWFwVmFsdWUsIGZhbHNlKTtcbiAgICB9KTtcblxuICAgIGNvbnN0IG91dHB1dERlZnM6IG8uTGl0ZXJhbE1hcEVudHJ5W10gPSBbXTtcbiAgICBjb25zdCBkaXJNZXRhID0gZGlyQXN0LmRpcmVjdGl2ZTtcbiAgICBPYmplY3Qua2V5cyhkaXJNZXRhLm91dHB1dHMpLmZvckVhY2goKHByb3BOYW1lKSA9PiB7XG4gICAgICBjb25zdCBldmVudE5hbWUgPSBkaXJNZXRhLm91dHB1dHNbcHJvcE5hbWVdO1xuICAgICAgaWYgKHVzZWRFdmVudHMuaGFzKGV2ZW50TmFtZSkpIHtcbiAgICAgICAgLy8gTm90ZTogaXQncyBpbXBvcnRhbnQgdG8gbm90IHF1b3RlIHRoZSBrZXkgc28gdGhhdCB3ZSBjYW4gY2FwdHVyZSByZW5hbWVzIGJ5IG1pbmlmaWVycyFcbiAgICAgICAgb3V0cHV0RGVmcy5wdXNoKG5ldyBvLkxpdGVyYWxNYXBFbnRyeShwcm9wTmFtZSwgby5saXRlcmFsKGV2ZW50TmFtZSksIGZhbHNlKSk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgbGV0IHVwZGF0ZURpcmVjdGl2ZUV4cHJlc3Npb25zOiBVcGRhdGVFeHByZXNzaW9uW10gPSBbXTtcbiAgICBpZiAoZGlyQXN0LmlucHV0cy5sZW5ndGggfHwgKGZsYWdzICYgKE5vZGVGbGFncy5Eb0NoZWNrIHwgTm9kZUZsYWdzLk9uSW5pdCkpID4gMCkge1xuICAgICAgdXBkYXRlRGlyZWN0aXZlRXhwcmVzc2lvbnMgPVxuICAgICAgICAgIGRpckFzdC5pbnB1dHMubWFwKChpbnB1dCwgYmluZGluZ0luZGV4KSA9PiB0aGlzLl9wcmVwcm9jZXNzVXBkYXRlRXhwcmVzc2lvbih7XG4gICAgICAgICAgICBub2RlSW5kZXgsXG4gICAgICAgICAgICBiaW5kaW5nSW5kZXgsXG4gICAgICAgICAgICBzb3VyY2VTcGFuOiBpbnB1dC5zb3VyY2VTcGFuLFxuICAgICAgICAgICAgY29udGV4dDogQ09NUF9WQVIsXG4gICAgICAgICAgICB2YWx1ZTogaW5wdXQudmFsdWVcbiAgICAgICAgICB9KSk7XG4gICAgfVxuXG4gICAgY29uc3QgZGlyQ29udGV4dEV4cHIgPVxuICAgICAgICBvLmltcG9ydEV4cHIoSWRlbnRpZmllcnMubm9kZVZhbHVlKS5jYWxsRm4oW1ZJRVdfVkFSLCBvLmxpdGVyYWwobm9kZUluZGV4KV0pO1xuICAgIGNvbnN0IGhvc3RCaW5kaW5ncyA9IGRpckFzdC5ob3N0UHJvcGVydGllcy5tYXAoKGlucHV0QXN0KSA9PiAoe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb250ZXh0OiBkaXJDb250ZXh0RXhwcixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGlyQXN0LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbnB1dEFzdCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICBjb25zdCBob3N0RXZlbnRzID0gZGlyQXN0Lmhvc3RFdmVudHMubWFwKChob3N0RXZlbnRBc3QpID0+ICh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRleHQ6IGRpckNvbnRleHRFeHByLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBldmVudEFzdDogaG9zdEV2ZW50QXN0LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkaXJBc3QsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KSk7XG5cbiAgICAvLyBDaGVjayBpbmRleCBpcyB0aGUgc2FtZSBhcyB0aGUgbm9kZSBpbmRleCBkdXJpbmcgY29tcGlsYXRpb25cbiAgICAvLyBUaGV5IG1pZ2h0IG9ubHkgZGlmZmVyIGF0IHJ1bnRpbWVcbiAgICBjb25zdCBjaGVja0luZGV4ID0gbm9kZUluZGV4O1xuXG4gICAgdGhpcy5ub2Rlc1tub2RlSW5kZXhdID0gKCkgPT4gKHtcbiAgICAgIHNvdXJjZVNwYW46IGRpckFzdC5zb3VyY2VTcGFuLFxuICAgICAgbm9kZUZsYWdzOiBOb2RlRmxhZ3MuVHlwZURpcmVjdGl2ZSB8IGZsYWdzLFxuICAgICAgbm9kZURlZjogby5pbXBvcnRFeHByKElkZW50aWZpZXJzLmRpcmVjdGl2ZURlZikuY2FsbEZuKFtcbiAgICAgICAgby5saXRlcmFsKGNoZWNrSW5kZXgpLFxuICAgICAgICBvLmxpdGVyYWwoZmxhZ3MpLFxuICAgICAgICBxdWVyeU1hdGNoRXhwcnMubGVuZ3RoID8gby5saXRlcmFsQXJyKHF1ZXJ5TWF0Y2hFeHBycykgOiBvLk5VTExfRVhQUixcbiAgICAgICAgby5saXRlcmFsKGNoaWxkQ291bnQpLFxuICAgICAgICBwcm92aWRlckV4cHIsXG4gICAgICAgIGRlcHNFeHByLFxuICAgICAgICBpbnB1dERlZnMubGVuZ3RoID8gbmV3IG8uTGl0ZXJhbE1hcEV4cHIoaW5wdXREZWZzKSA6IG8uTlVMTF9FWFBSLFxuICAgICAgICBvdXRwdXREZWZzLmxlbmd0aCA/IG5ldyBvLkxpdGVyYWxNYXBFeHByKG91dHB1dERlZnMpIDogby5OVUxMX0VYUFIsXG4gICAgICBdKSxcbiAgICAgIHVwZGF0ZURpcmVjdGl2ZXM6IHVwZGF0ZURpcmVjdGl2ZUV4cHJlc3Npb25zLFxuICAgICAgZGlyZWN0aXZlOiBkaXJBc3QuZGlyZWN0aXZlLnR5cGUsXG4gICAgfSk7XG5cbiAgICByZXR1cm4ge2hvc3RCaW5kaW5ncywgaG9zdEV2ZW50c307XG4gIH1cblxuICBwcml2YXRlIF92aXNpdFByb3ZpZGVyKHByb3ZpZGVyQXN0OiBQcm92aWRlckFzdCwgcXVlcnlNYXRjaGVzOiBRdWVyeU1hdGNoW10pOiB2b2lkIHtcbiAgICB0aGlzLl9hZGRQcm92aWRlck5vZGUodGhpcy5fdmlzaXRQcm92aWRlck9yRGlyZWN0aXZlKHByb3ZpZGVyQXN0LCBxdWVyeU1hdGNoZXMpKTtcbiAgfVxuXG4gIHByaXZhdGUgX3Zpc2l0Q29tcG9uZW50RmFjdG9yeVJlc29sdmVyUHJvdmlkZXIoZGlyZWN0aXZlczogRGlyZWN0aXZlQXN0W10pIHtcbiAgICBjb25zdCBjb21wb25lbnREaXJNZXRhID0gZGlyZWN0aXZlcy5maW5kKGRpckFzdCA9PiBkaXJBc3QuZGlyZWN0aXZlLmlzQ29tcG9uZW50KTtcbiAgICBpZiAoY29tcG9uZW50RGlyTWV0YSAmJiBjb21wb25lbnREaXJNZXRhLmRpcmVjdGl2ZS5lbnRyeUNvbXBvbmVudHMubGVuZ3RoKSB7XG4gICAgICBjb25zdCB7cHJvdmlkZXJFeHByLCBkZXBzRXhwciwgZmxhZ3MsIHRva2VuRXhwcn0gPSBjb21wb25lbnRGYWN0b3J5UmVzb2x2ZXJQcm92aWRlckRlZihcbiAgICAgICAgICB0aGlzLnJlZmxlY3RvciwgdGhpcy5vdXRwdXRDdHgsIE5vZGVGbGFncy5Qcml2YXRlUHJvdmlkZXIsXG4gICAgICAgICAgY29tcG9uZW50RGlyTWV0YS5kaXJlY3RpdmUuZW50cnlDb21wb25lbnRzKTtcbiAgICAgIHRoaXMuX2FkZFByb3ZpZGVyTm9kZSh7XG4gICAgICAgIHByb3ZpZGVyRXhwcixcbiAgICAgICAgZGVwc0V4cHIsXG4gICAgICAgIGZsYWdzLFxuICAgICAgICB0b2tlbkV4cHIsXG4gICAgICAgIHF1ZXJ5TWF0Y2hFeHByczogW10sXG4gICAgICAgIHNvdXJjZVNwYW46IGNvbXBvbmVudERpck1ldGEuc291cmNlU3BhblxuICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBfYWRkUHJvdmlkZXJOb2RlKGRhdGE6IHtcbiAgICBmbGFnczogTm9kZUZsYWdzLFxuICAgIHF1ZXJ5TWF0Y2hFeHByczogby5FeHByZXNzaW9uW10sXG4gICAgcHJvdmlkZXJFeHByOiBvLkV4cHJlc3Npb24sXG4gICAgZGVwc0V4cHI6IG8uRXhwcmVzc2lvbixcbiAgICB0b2tlbkV4cHI6IG8uRXhwcmVzc2lvbixcbiAgICBzb3VyY2VTcGFuOiBQYXJzZVNvdXJjZVNwYW5cbiAgfSkge1xuICAgIC8vIHByb3ZpZGVyRGVmKFxuICAgIC8vICAgZmxhZ3M6IE5vZGVGbGFncywgbWF0Y2hlZFF1ZXJpZXM6IFtzdHJpbmcsIFF1ZXJ5VmFsdWVUeXBlXVtdLCB0b2tlbjphbnksXG4gICAgLy8gICB2YWx1ZTogYW55LCBkZXBzOiAoW0RlcEZsYWdzLCBhbnldIHwgYW55KVtdKTogTm9kZURlZjtcbiAgICB0aGlzLm5vZGVzLnB1c2goXG4gICAgICAgICgpID0+ICh7XG4gICAgICAgICAgc291cmNlU3BhbjogZGF0YS5zb3VyY2VTcGFuLFxuICAgICAgICAgIG5vZGVGbGFnczogZGF0YS5mbGFncyxcbiAgICAgICAgICBub2RlRGVmOiBvLmltcG9ydEV4cHIoSWRlbnRpZmllcnMucHJvdmlkZXJEZWYpLmNhbGxGbihbXG4gICAgICAgICAgICBvLmxpdGVyYWwoZGF0YS5mbGFncyksXG4gICAgICAgICAgICBkYXRhLnF1ZXJ5TWF0Y2hFeHBycy5sZW5ndGggPyBvLmxpdGVyYWxBcnIoZGF0YS5xdWVyeU1hdGNoRXhwcnMpIDogby5OVUxMX0VYUFIsXG4gICAgICAgICAgICBkYXRhLnRva2VuRXhwciwgZGF0YS5wcm92aWRlckV4cHIsIGRhdGEuZGVwc0V4cHJcbiAgICAgICAgICBdKVxuICAgICAgICB9KSk7XG4gIH1cblxuICBwcml2YXRlIF92aXNpdFByb3ZpZGVyT3JEaXJlY3RpdmUocHJvdmlkZXJBc3Q6IFByb3ZpZGVyQXN0LCBxdWVyeU1hdGNoZXM6IFF1ZXJ5TWF0Y2hbXSk6IHtcbiAgICBmbGFnczogTm9kZUZsYWdzLFxuICAgIHRva2VuRXhwcjogby5FeHByZXNzaW9uLFxuICAgIHNvdXJjZVNwYW46IFBhcnNlU291cmNlU3BhbixcbiAgICBxdWVyeU1hdGNoRXhwcnM6IG8uRXhwcmVzc2lvbltdLFxuICAgIHByb3ZpZGVyRXhwcjogby5FeHByZXNzaW9uLFxuICAgIGRlcHNFeHByOiBvLkV4cHJlc3Npb25cbiAgfSB7XG4gICAgbGV0IGZsYWdzID0gTm9kZUZsYWdzLk5vbmU7XG4gICAgbGV0IHF1ZXJ5TWF0Y2hFeHByczogby5FeHByZXNzaW9uW10gPSBbXTtcblxuICAgIHF1ZXJ5TWF0Y2hlcy5mb3JFYWNoKChtYXRjaCkgPT4ge1xuICAgICAgaWYgKHRva2VuUmVmZXJlbmNlKG1hdGNoLnZhbHVlKSA9PT0gdG9rZW5SZWZlcmVuY2UocHJvdmlkZXJBc3QudG9rZW4pKSB7XG4gICAgICAgIHF1ZXJ5TWF0Y2hFeHBycy5wdXNoKFxuICAgICAgICAgICAgby5saXRlcmFsQXJyKFtvLmxpdGVyYWwobWF0Y2gucXVlcnlJZCksIG8ubGl0ZXJhbChRdWVyeVZhbHVlVHlwZS5Qcm92aWRlcildKSk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgY29uc3Qge3Byb3ZpZGVyRXhwciwgZGVwc0V4cHIsIGZsYWdzOiBwcm92aWRlckZsYWdzLCB0b2tlbkV4cHJ9ID1cbiAgICAgICAgcHJvdmlkZXJEZWYodGhpcy5vdXRwdXRDdHgsIHByb3ZpZGVyQXN0KTtcbiAgICByZXR1cm4ge1xuICAgICAgZmxhZ3M6IGZsYWdzIHwgcHJvdmlkZXJGbGFncyxcbiAgICAgIHF1ZXJ5TWF0Y2hFeHBycyxcbiAgICAgIHByb3ZpZGVyRXhwcixcbiAgICAgIGRlcHNFeHByLFxuICAgICAgdG9rZW5FeHByLFxuICAgICAgc291cmNlU3BhbjogcHJvdmlkZXJBc3Quc291cmNlU3BhblxuICAgIH07XG4gIH1cblxuICBnZXRMb2NhbChuYW1lOiBzdHJpbmcpOiBvLkV4cHJlc3Npb258bnVsbCB7XG4gICAgaWYgKG5hbWUgPT0gRXZlbnRIYW5kbGVyVmFycy5ldmVudC5uYW1lKSB7XG4gICAgICByZXR1cm4gRXZlbnRIYW5kbGVyVmFycy5ldmVudDtcbiAgICB9XG4gICAgbGV0IGN1cnJWaWV3RXhwcjogby5FeHByZXNzaW9uID0gVklFV19WQVI7XG4gICAgZm9yIChsZXQgY3VyckJ1aWxkZXI6IFZpZXdCdWlsZGVyfG51bGwgPSB0aGlzOyBjdXJyQnVpbGRlcjsgY3VyckJ1aWxkZXIgPSBjdXJyQnVpbGRlci5wYXJlbnQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGN1cnJWaWV3RXhwciA9IGN1cnJWaWV3RXhwci5wcm9wKCdwYXJlbnQnKS5jYXN0KG8uRFlOQU1JQ19UWVBFKSkge1xuICAgICAgLy8gY2hlY2sgcmVmZXJlbmNlc1xuICAgICAgY29uc3QgcmVmTm9kZUluZGV4ID0gY3VyckJ1aWxkZXIucmVmTm9kZUluZGljZXNbbmFtZV07XG4gICAgICBpZiAocmVmTm9kZUluZGV4ICE9IG51bGwpIHtcbiAgICAgICAgcmV0dXJuIG8uaW1wb3J0RXhwcihJZGVudGlmaWVycy5ub2RlVmFsdWUpLmNhbGxGbihbY3VyclZpZXdFeHByLCBvLmxpdGVyYWwocmVmTm9kZUluZGV4KV0pO1xuICAgICAgfVxuXG4gICAgICAvLyBjaGVjayB2YXJpYWJsZXNcbiAgICAgIGNvbnN0IHZhckFzdCA9IGN1cnJCdWlsZGVyLnZhcmlhYmxlcy5maW5kKCh2YXJBc3QpID0+IHZhckFzdC5uYW1lID09PSBuYW1lKTtcbiAgICAgIGlmICh2YXJBc3QpIHtcbiAgICAgICAgY29uc3QgdmFyVmFsdWUgPSB2YXJBc3QudmFsdWUgfHwgSU1QTElDSVRfVEVNUExBVEVfVkFSO1xuICAgICAgICByZXR1cm4gY3VyclZpZXdFeHByLnByb3AoJ2NvbnRleHQnKS5wcm9wKHZhclZhbHVlKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBub3RpZnlJbXBsaWNpdFJlY2VpdmVyVXNlKCk6IHZvaWQge1xuICAgIC8vIE5vdCBuZWVkZWQgaW4gVmlld0VuZ2luZSBhcyBWaWV3RW5naW5lIHdhbGtzIHRocm91Z2ggdGhlIGdlbmVyYXRlZFxuICAgIC8vIGV4cHJlc3Npb25zIHRvIGZpZ3VyZSBvdXQgaWYgdGhlIGltcGxpY2l0IHJlY2VpdmVyIGlzIHVzZWQgYW5kIG5lZWRzXG4gICAgLy8gdG8gYmUgZ2VuZXJhdGVkIGFzIHBhcnQgb2YgdGhlIHByZS11cGRhdGUgc3RhdGVtZW50cy5cbiAgfVxuXG4gIG1heWJlUmVzdG9yZVZpZXcoKTogdm9pZCB7XG4gICAgLy8gTm90IG5lY2Vzc2FyeSBpbiBWaWV3RW5naW5lLCBiZWNhdXNlIHZpZXcgcmVzdG9yYXRpb24gaXMgYW4gSXZ5IGNvbmNlcHQuXG4gIH1cblxuICBwcml2YXRlIF9jcmVhdGVMaXRlcmFsQXJyYXlDb252ZXJ0ZXIoc291cmNlU3BhbjogUGFyc2VTb3VyY2VTcGFuLCBhcmdDb3VudDogbnVtYmVyKTpcbiAgICAgIEJ1aWx0aW5Db252ZXJ0ZXIge1xuICAgIGlmIChhcmdDb3VudCA9PT0gMCkge1xuICAgICAgY29uc3QgdmFsdWVFeHByID0gby5pbXBvcnRFeHByKElkZW50aWZpZXJzLkVNUFRZX0FSUkFZKTtcbiAgICAgIHJldHVybiAoKSA9PiB2YWx1ZUV4cHI7XG4gICAgfVxuXG4gICAgY29uc3QgY2hlY2tJbmRleCA9IHRoaXMubm9kZXMubGVuZ3RoO1xuXG4gICAgdGhpcy5ub2Rlcy5wdXNoKCgpID0+ICh7XG4gICAgICAgICAgICAgICAgICAgICAgc291cmNlU3BhbixcbiAgICAgICAgICAgICAgICAgICAgICBub2RlRmxhZ3M6IE5vZGVGbGFncy5UeXBlUHVyZUFycmF5LFxuICAgICAgICAgICAgICAgICAgICAgIG5vZGVEZWY6IG8uaW1wb3J0RXhwcihJZGVudGlmaWVycy5wdXJlQXJyYXlEZWYpLmNhbGxGbihbXG4gICAgICAgICAgICAgICAgICAgICAgICBvLmxpdGVyYWwoY2hlY2tJbmRleCksXG4gICAgICAgICAgICAgICAgICAgICAgICBvLmxpdGVyYWwoYXJnQ291bnQpLFxuICAgICAgICAgICAgICAgICAgICAgIF0pXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcblxuICAgIHJldHVybiAoYXJnczogby5FeHByZXNzaW9uW10pID0+IGNhbGxDaGVja1N0bXQoY2hlY2tJbmRleCwgYXJncyk7XG4gIH1cblxuICBwcml2YXRlIF9jcmVhdGVMaXRlcmFsTWFwQ29udmVydGVyKFxuICAgICAgc291cmNlU3BhbjogUGFyc2VTb3VyY2VTcGFuLCBrZXlzOiB7a2V5OiBzdHJpbmcsIHF1b3RlZDogYm9vbGVhbn1bXSk6IEJ1aWx0aW5Db252ZXJ0ZXIge1xuICAgIGlmIChrZXlzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgY29uc3QgdmFsdWVFeHByID0gby5pbXBvcnRFeHByKElkZW50aWZpZXJzLkVNUFRZX01BUCk7XG4gICAgICByZXR1cm4gKCkgPT4gdmFsdWVFeHByO1xuICAgIH1cblxuICAgIGNvbnN0IG1hcCA9IG8ubGl0ZXJhbE1hcChrZXlzLm1hcCgoZSwgaSkgPT4gKHsuLi5lLCB2YWx1ZTogby5saXRlcmFsKGkpfSkpKTtcbiAgICBjb25zdCBjaGVja0luZGV4ID0gdGhpcy5ub2Rlcy5sZW5ndGg7XG4gICAgdGhpcy5ub2Rlcy5wdXNoKCgpID0+ICh7XG4gICAgICAgICAgICAgICAgICAgICAgc291cmNlU3BhbixcbiAgICAgICAgICAgICAgICAgICAgICBub2RlRmxhZ3M6IE5vZGVGbGFncy5UeXBlUHVyZU9iamVjdCxcbiAgICAgICAgICAgICAgICAgICAgICBub2RlRGVmOiBvLmltcG9ydEV4cHIoSWRlbnRpZmllcnMucHVyZU9iamVjdERlZikuY2FsbEZuKFtcbiAgICAgICAgICAgICAgICAgICAgICAgIG8ubGl0ZXJhbChjaGVja0luZGV4KSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1hcCxcbiAgICAgICAgICAgICAgICAgICAgICBdKVxuICAgICAgICAgICAgICAgICAgICB9KSk7XG5cbiAgICByZXR1cm4gKGFyZ3M6IG8uRXhwcmVzc2lvbltdKSA9PiBjYWxsQ2hlY2tTdG10KGNoZWNrSW5kZXgsIGFyZ3MpO1xuICB9XG5cbiAgcHJpdmF0ZSBfY3JlYXRlUGlwZUNvbnZlcnRlcihleHByZXNzaW9uOiBVcGRhdGVFeHByZXNzaW9uLCBuYW1lOiBzdHJpbmcsIGFyZ0NvdW50OiBudW1iZXIpOlxuICAgICAgQnVpbHRpbkNvbnZlcnRlciB7XG4gICAgY29uc3QgcGlwZSA9IHRoaXMudXNlZFBpcGVzLmZpbmQoKHBpcGVTdW1tYXJ5KSA9PiBwaXBlU3VtbWFyeS5uYW1lID09PSBuYW1lKSE7XG4gICAgaWYgKHBpcGUucHVyZSkge1xuICAgICAgY29uc3QgY2hlY2tJbmRleCA9IHRoaXMubm9kZXMubGVuZ3RoO1xuICAgICAgdGhpcy5ub2Rlcy5wdXNoKCgpID0+ICh7XG4gICAgICAgICAgICAgICAgICAgICAgICBzb3VyY2VTcGFuOiBleHByZXNzaW9uLnNvdXJjZVNwYW4sXG4gICAgICAgICAgICAgICAgICAgICAgICBub2RlRmxhZ3M6IE5vZGVGbGFncy5UeXBlUHVyZVBpcGUsXG4gICAgICAgICAgICAgICAgICAgICAgICBub2RlRGVmOiBvLmltcG9ydEV4cHIoSWRlbnRpZmllcnMucHVyZVBpcGVEZWYpLmNhbGxGbihbXG4gICAgICAgICAgICAgICAgICAgICAgICAgIG8ubGl0ZXJhbChjaGVja0luZGV4KSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgby5saXRlcmFsKGFyZ0NvdW50KSxcbiAgICAgICAgICAgICAgICAgICAgICAgIF0pXG4gICAgICAgICAgICAgICAgICAgICAgfSkpO1xuXG4gICAgICAvLyBmaW5kIHVuZGVybHlpbmcgcGlwZSBpbiB0aGUgY29tcG9uZW50IHZpZXdcbiAgICAgIGxldCBjb21wVmlld0V4cHI6IG8uRXhwcmVzc2lvbiA9IFZJRVdfVkFSO1xuICAgICAgbGV0IGNvbXBCdWlsZGVyOiBWaWV3QnVpbGRlciA9IHRoaXM7XG4gICAgICB3aGlsZSAoY29tcEJ1aWxkZXIucGFyZW50KSB7XG4gICAgICAgIGNvbXBCdWlsZGVyID0gY29tcEJ1aWxkZXIucGFyZW50O1xuICAgICAgICBjb21wVmlld0V4cHIgPSBjb21wVmlld0V4cHIucHJvcCgncGFyZW50JykuY2FzdChvLkRZTkFNSUNfVFlQRSk7XG4gICAgICB9XG4gICAgICBjb25zdCBwaXBlTm9kZUluZGV4ID0gY29tcEJ1aWxkZXIucHVyZVBpcGVOb2RlSW5kaWNlc1tuYW1lXTtcbiAgICAgIGNvbnN0IHBpcGVWYWx1ZUV4cHI6IG8uRXhwcmVzc2lvbiA9XG4gICAgICAgICAgby5pbXBvcnRFeHByKElkZW50aWZpZXJzLm5vZGVWYWx1ZSkuY2FsbEZuKFtjb21wVmlld0V4cHIsIG8ubGl0ZXJhbChwaXBlTm9kZUluZGV4KV0pO1xuXG4gICAgICByZXR1cm4gKGFyZ3M6IG8uRXhwcmVzc2lvbltdKSA9PiBjYWxsVW53cmFwVmFsdWUoXG4gICAgICAgICAgICAgICAgIGV4cHJlc3Npb24ubm9kZUluZGV4LCBleHByZXNzaW9uLmJpbmRpbmdJbmRleCxcbiAgICAgICAgICAgICAgICAgY2FsbENoZWNrU3RtdChjaGVja0luZGV4LCBbcGlwZVZhbHVlRXhwcl0uY29uY2F0KGFyZ3MpKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IG5vZGVJbmRleCA9IHRoaXMuX2NyZWF0ZVBpcGUoZXhwcmVzc2lvbi5zb3VyY2VTcGFuLCBwaXBlKTtcbiAgICAgIGNvbnN0IG5vZGVWYWx1ZUV4cHIgPVxuICAgICAgICAgIG8uaW1wb3J0RXhwcihJZGVudGlmaWVycy5ub2RlVmFsdWUpLmNhbGxGbihbVklFV19WQVIsIG8ubGl0ZXJhbChub2RlSW5kZXgpXSk7XG5cbiAgICAgIHJldHVybiAoYXJnczogby5FeHByZXNzaW9uW10pID0+IGNhbGxVbndyYXBWYWx1ZShcbiAgICAgICAgICAgICAgICAgZXhwcmVzc2lvbi5ub2RlSW5kZXgsIGV4cHJlc3Npb24uYmluZGluZ0luZGV4LFxuICAgICAgICAgICAgICAgICBub2RlVmFsdWVFeHByLmNhbGxNZXRob2QoJ3RyYW5zZm9ybScsIGFyZ3MpKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIF9jcmVhdGVQaXBlKHNvdXJjZVNwYW46IFBhcnNlU291cmNlU3BhbnxudWxsLCBwaXBlOiBDb21waWxlUGlwZVN1bW1hcnkpOiBudW1iZXIge1xuICAgIGNvbnN0IG5vZGVJbmRleCA9IHRoaXMubm9kZXMubGVuZ3RoO1xuICAgIGxldCBmbGFncyA9IE5vZGVGbGFncy5Ob25lO1xuICAgIHBpcGUudHlwZS5saWZlY3ljbGVIb29rcy5mb3JFYWNoKChsaWZlY3ljbGVIb29rKSA9PiB7XG4gICAgICAvLyBmb3IgcGlwZXMsIHdlIG9ubHkgc3VwcG9ydCBuZ09uRGVzdHJveVxuICAgICAgaWYgKGxpZmVjeWNsZUhvb2sgPT09IExpZmVjeWNsZUhvb2tzLk9uRGVzdHJveSkge1xuICAgICAgICBmbGFncyB8PSBsaWZlY3ljbGVIb29rVG9Ob2RlRmxhZyhsaWZlY3ljbGVIb29rKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGNvbnN0IGRlcEV4cHJzID0gcGlwZS50eXBlLmRpRGVwcy5tYXAoKGRpRGVwKSA9PiBkZXBEZWYodGhpcy5vdXRwdXRDdHgsIGRpRGVwKSk7XG4gICAgLy8gZnVuY3Rpb24gcGlwZURlZihcbiAgICAvLyAgIGZsYWdzOiBOb2RlRmxhZ3MsIGN0b3I6IGFueSwgZGVwczogKFtEZXBGbGFncywgYW55XSB8IGFueSlbXSk6IE5vZGVEZWZcbiAgICB0aGlzLm5vZGVzLnB1c2goXG4gICAgICAgICgpID0+ICh7XG4gICAgICAgICAgc291cmNlU3BhbixcbiAgICAgICAgICBub2RlRmxhZ3M6IE5vZGVGbGFncy5UeXBlUGlwZSxcbiAgICAgICAgICBub2RlRGVmOiBvLmltcG9ydEV4cHIoSWRlbnRpZmllcnMucGlwZURlZikuY2FsbEZuKFtcbiAgICAgICAgICAgIG8ubGl0ZXJhbChmbGFncyksIHRoaXMub3V0cHV0Q3R4LmltcG9ydEV4cHIocGlwZS50eXBlLnJlZmVyZW5jZSksIG8ubGl0ZXJhbEFycihkZXBFeHBycylcbiAgICAgICAgICBdKVxuICAgICAgICB9KSk7XG4gICAgcmV0dXJuIG5vZGVJbmRleDtcbiAgfVxuXG4gIC8qKlxuICAgKiBGb3IgdGhlIEFTVCBpbiBgVXBkYXRlRXhwcmVzc2lvbi52YWx1ZWA6XG4gICAqIC0gY3JlYXRlIG5vZGVzIGZvciBwaXBlcywgbGl0ZXJhbCBhcnJheXMgYW5kLCBsaXRlcmFsIG1hcHMsXG4gICAqIC0gdXBkYXRlIHRoZSBBU1QgdG8gcmVwbGFjZSBwaXBlcywgbGl0ZXJhbCBhcnJheXMgYW5kLCBsaXRlcmFsIG1hcHMgd2l0aCBjYWxscyB0byBjaGVjayBmbi5cbiAgICpcbiAgICogV0FSTklORzogVGhpcyBtaWdodCBjcmVhdGUgbmV3IG5vZGVEZWZzIChmb3IgcGlwZXMgYW5kIGxpdGVyYWwgYXJyYXlzIGFuZCBsaXRlcmFsIG1hcHMpIVxuICAgKi9cbiAgcHJpdmF0ZSBfcHJlcHJvY2Vzc1VwZGF0ZUV4cHJlc3Npb24oZXhwcmVzc2lvbjogVXBkYXRlRXhwcmVzc2lvbik6IFVwZGF0ZUV4cHJlc3Npb24ge1xuICAgIHJldHVybiB7XG4gICAgICBub2RlSW5kZXg6IGV4cHJlc3Npb24ubm9kZUluZGV4LFxuICAgICAgYmluZGluZ0luZGV4OiBleHByZXNzaW9uLmJpbmRpbmdJbmRleCxcbiAgICAgIHNvdXJjZVNwYW46IGV4cHJlc3Npb24uc291cmNlU3BhbixcbiAgICAgIGNvbnRleHQ6IGV4cHJlc3Npb24uY29udGV4dCxcbiAgICAgIHZhbHVlOiBjb252ZXJ0UHJvcGVydHlCaW5kaW5nQnVpbHRpbnMoXG4gICAgICAgICAge1xuICAgICAgICAgICAgY3JlYXRlTGl0ZXJhbEFycmF5Q29udmVydGVyOiAoYXJnQ291bnQ6IG51bWJlcikgPT5cbiAgICAgICAgICAgICAgICB0aGlzLl9jcmVhdGVMaXRlcmFsQXJyYXlDb252ZXJ0ZXIoZXhwcmVzc2lvbi5zb3VyY2VTcGFuLCBhcmdDb3VudCksXG4gICAgICAgICAgICBjcmVhdGVMaXRlcmFsTWFwQ29udmVydGVyOiAoa2V5czoge2tleTogc3RyaW5nLCBxdW90ZWQ6IGJvb2xlYW59W10pID0+XG4gICAgICAgICAgICAgICAgdGhpcy5fY3JlYXRlTGl0ZXJhbE1hcENvbnZlcnRlcihleHByZXNzaW9uLnNvdXJjZVNwYW4sIGtleXMpLFxuICAgICAgICAgICAgY3JlYXRlUGlwZUNvbnZlcnRlcjogKG5hbWU6IHN0cmluZywgYXJnQ291bnQ6IG51bWJlcikgPT5cbiAgICAgICAgICAgICAgICB0aGlzLl9jcmVhdGVQaXBlQ29udmVydGVyKGV4cHJlc3Npb24sIG5hbWUsIGFyZ0NvdW50KVxuICAgICAgICAgIH0sXG4gICAgICAgICAgZXhwcmVzc2lvbi52YWx1ZSlcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSBfY3JlYXRlTm9kZUV4cHJlc3Npb25zKCk6IHtcbiAgICB1cGRhdGVSZW5kZXJlclN0bXRzOiBvLlN0YXRlbWVudFtdLFxuICAgIHVwZGF0ZURpcmVjdGl2ZXNTdG10czogby5TdGF0ZW1lbnRbXSxcbiAgICBub2RlRGVmRXhwcnM6IG8uRXhwcmVzc2lvbltdXG4gIH0ge1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgIGxldCB1cGRhdGVCaW5kaW5nQ291bnQgPSAwO1xuICAgIGNvbnN0IHVwZGF0ZVJlbmRlcmVyU3RtdHM6IG8uU3RhdGVtZW50W10gPSBbXTtcbiAgICBjb25zdCB1cGRhdGVEaXJlY3RpdmVzU3RtdHM6IG8uU3RhdGVtZW50W10gPSBbXTtcbiAgICBjb25zdCBub2RlRGVmRXhwcnMgPSB0aGlzLm5vZGVzLm1hcCgoZmFjdG9yeSwgbm9kZUluZGV4KSA9PiB7XG4gICAgICBjb25zdCB7bm9kZURlZiwgbm9kZUZsYWdzLCB1cGRhdGVEaXJlY3RpdmVzLCB1cGRhdGVSZW5kZXJlciwgc291cmNlU3Bhbn0gPSBmYWN0b3J5KCk7XG4gICAgICBpZiAodXBkYXRlUmVuZGVyZXIpIHtcbiAgICAgICAgdXBkYXRlUmVuZGVyZXJTdG10cy5wdXNoKFxuICAgICAgICAgICAgLi4uY3JlYXRlVXBkYXRlU3RhdGVtZW50cyhub2RlSW5kZXgsIHNvdXJjZVNwYW4sIHVwZGF0ZVJlbmRlcmVyLCBmYWxzZSkpO1xuICAgICAgfVxuICAgICAgaWYgKHVwZGF0ZURpcmVjdGl2ZXMpIHtcbiAgICAgICAgdXBkYXRlRGlyZWN0aXZlc1N0bXRzLnB1c2goLi4uY3JlYXRlVXBkYXRlU3RhdGVtZW50cyhcbiAgICAgICAgICAgIG5vZGVJbmRleCwgc291cmNlU3BhbiwgdXBkYXRlRGlyZWN0aXZlcyxcbiAgICAgICAgICAgIChub2RlRmxhZ3MgJiAoTm9kZUZsYWdzLkRvQ2hlY2sgfCBOb2RlRmxhZ3MuT25Jbml0KSkgPiAwKSk7XG4gICAgICB9XG4gICAgICAvLyBXZSB1c2UgYSBjb21tYSBleHByZXNzaW9uIHRvIGNhbGwgdGhlIGxvZyBmdW5jdGlvbiBiZWZvcmVcbiAgICAgIC8vIHRoZSBub2RlRGVmIGZ1bmN0aW9uLCBidXQgc3RpbGwgdXNlIHRoZSByZXN1bHQgb2YgdGhlIG5vZGVEZWYgZnVuY3Rpb25cbiAgICAgIC8vIGFzIHRoZSB2YWx1ZS5cbiAgICAgIC8vIE5vdGU6IFdlIG9ubHkgYWRkIHRoZSBsb2dnZXIgdG8gZWxlbWVudHMgLyB0ZXh0IG5vZGVzLFxuICAgICAgLy8gc28gd2UgZG9uJ3QgZ2VuZXJhdGUgdG9vIG11Y2ggY29kZS5cbiAgICAgIGNvbnN0IGxvZ1dpdGhOb2RlRGVmID0gbm9kZUZsYWdzICYgTm9kZUZsYWdzLkNhdFJlbmRlck5vZGUgP1xuICAgICAgICAgIG5ldyBvLkNvbW1hRXhwcihbTE9HX1ZBUi5jYWxsRm4oW10pLmNhbGxGbihbXSksIG5vZGVEZWZdKSA6XG4gICAgICAgICAgbm9kZURlZjtcbiAgICAgIHJldHVybiBvLmFwcGx5U291cmNlU3BhblRvRXhwcmVzc2lvbklmTmVlZGVkKGxvZ1dpdGhOb2RlRGVmLCBzb3VyY2VTcGFuKTtcbiAgICB9KTtcbiAgICByZXR1cm4ge3VwZGF0ZVJlbmRlcmVyU3RtdHMsIHVwZGF0ZURpcmVjdGl2ZXNTdG10cywgbm9kZURlZkV4cHJzfTtcblxuICAgIGZ1bmN0aW9uIGNyZWF0ZVVwZGF0ZVN0YXRlbWVudHMoXG4gICAgICAgIG5vZGVJbmRleDogbnVtYmVyLCBzb3VyY2VTcGFuOiBQYXJzZVNvdXJjZVNwYW58bnVsbCwgZXhwcmVzc2lvbnM6IFVwZGF0ZUV4cHJlc3Npb25bXSxcbiAgICAgICAgYWxsb3dFbXB0eUV4cHJzOiBib29sZWFuKTogby5TdGF0ZW1lbnRbXSB7XG4gICAgICBjb25zdCB1cGRhdGVTdG10czogby5TdGF0ZW1lbnRbXSA9IFtdO1xuICAgICAgY29uc3QgZXhwcnMgPSBleHByZXNzaW9ucy5tYXAoKHtzb3VyY2VTcGFuLCBjb250ZXh0LCB2YWx1ZX0pID0+IHtcbiAgICAgICAgY29uc3QgYmluZGluZ0lkID0gYCR7dXBkYXRlQmluZGluZ0NvdW50Kyt9YDtcbiAgICAgICAgY29uc3QgbmFtZVJlc29sdmVyID0gY29udGV4dCA9PT0gQ09NUF9WQVIgPyBzZWxmIDogbnVsbDtcbiAgICAgICAgY29uc3Qge3N0bXRzLCBjdXJyVmFsRXhwcn0gPVxuICAgICAgICAgICAgY29udmVydFByb3BlcnR5QmluZGluZyhuYW1lUmVzb2x2ZXIsIGNvbnRleHQsIHZhbHVlLCBiaW5kaW5nSWQsIEJpbmRpbmdGb3JtLkdlbmVyYWwpO1xuICAgICAgICB1cGRhdGVTdG10cy5wdXNoKC4uLnN0bXRzLm1hcChcbiAgICAgICAgICAgIChzdG10OiBvLlN0YXRlbWVudCkgPT4gby5hcHBseVNvdXJjZVNwYW5Ub1N0YXRlbWVudElmTmVlZGVkKHN0bXQsIHNvdXJjZVNwYW4pKSk7XG4gICAgICAgIHJldHVybiBvLmFwcGx5U291cmNlU3BhblRvRXhwcmVzc2lvbklmTmVlZGVkKGN1cnJWYWxFeHByLCBzb3VyY2VTcGFuKTtcbiAgICAgIH0pO1xuICAgICAgaWYgKGV4cHJlc3Npb25zLmxlbmd0aCB8fCBhbGxvd0VtcHR5RXhwcnMpIHtcbiAgICAgICAgdXBkYXRlU3RtdHMucHVzaChvLmFwcGx5U291cmNlU3BhblRvU3RhdGVtZW50SWZOZWVkZWQoXG4gICAgICAgICAgICBjYWxsQ2hlY2tTdG10KG5vZGVJbmRleCwgZXhwcnMpLnRvU3RtdCgpLCBzb3VyY2VTcGFuKSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gdXBkYXRlU3RtdHM7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBfY3JlYXRlRWxlbWVudEhhbmRsZUV2ZW50Rm4oXG4gICAgICBub2RlSW5kZXg6IG51bWJlcixcbiAgICAgIGhhbmRsZXJzOiB7Y29udGV4dDogby5FeHByZXNzaW9uLCBldmVudEFzdDogQm91bmRFdmVudEFzdCwgZGlyQXN0OiBEaXJlY3RpdmVBc3R9W10pIHtcbiAgICBjb25zdCBoYW5kbGVFdmVudFN0bXRzOiBvLlN0YXRlbWVudFtdID0gW107XG4gICAgbGV0IGhhbmRsZUV2ZW50QmluZGluZ0NvdW50ID0gMDtcbiAgICBoYW5kbGVycy5mb3JFYWNoKCh7Y29udGV4dCwgZXZlbnRBc3QsIGRpckFzdH0pID0+IHtcbiAgICAgIGNvbnN0IGJpbmRpbmdJZCA9IGAke2hhbmRsZUV2ZW50QmluZGluZ0NvdW50Kyt9YDtcbiAgICAgIGNvbnN0IG5hbWVSZXNvbHZlciA9IGNvbnRleHQgPT09IENPTVBfVkFSID8gdGhpcyA6IG51bGw7XG4gICAgICBjb25zdCB7c3RtdHMsIGFsbG93RGVmYXVsdH0gPVxuICAgICAgICAgIGNvbnZlcnRBY3Rpb25CaW5kaW5nKG5hbWVSZXNvbHZlciwgY29udGV4dCwgZXZlbnRBc3QuaGFuZGxlciwgYmluZGluZ0lkKTtcbiAgICAgIGNvbnN0IHRydWVTdG10cyA9IHN0bXRzO1xuICAgICAgaWYgKGFsbG93RGVmYXVsdCkge1xuICAgICAgICB0cnVlU3RtdHMucHVzaChBTExPV19ERUZBVUxUX1ZBUi5zZXQoYWxsb3dEZWZhdWx0LmFuZChBTExPV19ERUZBVUxUX1ZBUikpLnRvU3RtdCgpKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHt0YXJnZXQ6IGV2ZW50VGFyZ2V0LCBuYW1lOiBldmVudE5hbWV9ID0gZWxlbWVudEV2ZW50TmFtZUFuZFRhcmdldChldmVudEFzdCwgZGlyQXN0KTtcbiAgICAgIGNvbnN0IGZ1bGxFdmVudE5hbWUgPSBlbGVtZW50RXZlbnRGdWxsTmFtZShldmVudFRhcmdldCwgZXZlbnROYW1lKTtcbiAgICAgIGhhbmRsZUV2ZW50U3RtdHMucHVzaChvLmFwcGx5U291cmNlU3BhblRvU3RhdGVtZW50SWZOZWVkZWQoXG4gICAgICAgICAgbmV3IG8uSWZTdG10KG8ubGl0ZXJhbChmdWxsRXZlbnROYW1lKS5pZGVudGljYWwoRVZFTlRfTkFNRV9WQVIpLCB0cnVlU3RtdHMpLFxuICAgICAgICAgIGV2ZW50QXN0LnNvdXJjZVNwYW4pKTtcbiAgICB9KTtcbiAgICBsZXQgaGFuZGxlRXZlbnRGbjogby5FeHByZXNzaW9uO1xuICAgIGlmIChoYW5kbGVFdmVudFN0bXRzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnN0IHByZVN0bXRzOiBvLlN0YXRlbWVudFtdID1cbiAgICAgICAgICBbQUxMT1dfREVGQVVMVF9WQVIuc2V0KG8ubGl0ZXJhbCh0cnVlKSkudG9EZWNsU3RtdChvLkJPT0xfVFlQRSldO1xuICAgICAgaWYgKCF0aGlzLmNvbXBvbmVudC5pc0hvc3QgJiYgby5maW5kUmVhZFZhck5hbWVzKGhhbmRsZUV2ZW50U3RtdHMpLmhhcyhDT01QX1ZBUi5uYW1lISkpIHtcbiAgICAgICAgcHJlU3RtdHMucHVzaChDT01QX1ZBUi5zZXQoVklFV19WQVIucHJvcCgnY29tcG9uZW50JykpLnRvRGVjbFN0bXQodGhpcy5jb21wVHlwZSkpO1xuICAgICAgfVxuICAgICAgaGFuZGxlRXZlbnRGbiA9IG8uZm4oXG4gICAgICAgICAgW1xuICAgICAgICAgICAgbmV3IG8uRm5QYXJhbShWSUVXX1ZBUi5uYW1lISwgby5JTkZFUlJFRF9UWVBFKSxcbiAgICAgICAgICAgIG5ldyBvLkZuUGFyYW0oRVZFTlRfTkFNRV9WQVIubmFtZSEsIG8uSU5GRVJSRURfVFlQRSksXG4gICAgICAgICAgICBuZXcgby5GblBhcmFtKEV2ZW50SGFuZGxlclZhcnMuZXZlbnQubmFtZSEsIG8uSU5GRVJSRURfVFlQRSlcbiAgICAgICAgICBdLFxuICAgICAgICAgIFsuLi5wcmVTdG10cywgLi4uaGFuZGxlRXZlbnRTdG10cywgbmV3IG8uUmV0dXJuU3RhdGVtZW50KEFMTE9XX0RFRkFVTFRfVkFSKV0sXG4gICAgICAgICAgby5JTkZFUlJFRF9UWVBFKTtcbiAgICB9IGVsc2Uge1xuICAgICAgaGFuZGxlRXZlbnRGbiA9IG8uTlVMTF9FWFBSO1xuICAgIH1cbiAgICByZXR1cm4gaGFuZGxlRXZlbnRGbjtcbiAgfVxuXG4gIHZpc2l0RGlyZWN0aXZlKGFzdDogRGlyZWN0aXZlQXN0LCBjb250ZXh0OiB7dXNlZEV2ZW50czogU2V0PHN0cmluZz59KTogYW55IHt9XG4gIHZpc2l0RGlyZWN0aXZlUHJvcGVydHkoYXN0OiBCb3VuZERpcmVjdGl2ZVByb3BlcnR5QXN0LCBjb250ZXh0OiBhbnkpOiBhbnkge31cbiAgdmlzaXRSZWZlcmVuY2UoYXN0OiBSZWZlcmVuY2VBc3QsIGNvbnRleHQ6IGFueSk6IGFueSB7fVxuICB2aXNpdFZhcmlhYmxlKGFzdDogVmFyaWFibGVBc3QsIGNvbnRleHQ6IGFueSk6IGFueSB7fVxuICB2aXNpdEV2ZW50KGFzdDogQm91bmRFdmVudEFzdCwgY29udGV4dDogYW55KTogYW55IHt9XG4gIHZpc2l0RWxlbWVudFByb3BlcnR5KGFzdDogQm91bmRFbGVtZW50UHJvcGVydHlBc3QsIGNvbnRleHQ6IGFueSk6IGFueSB7fVxuICB2aXNpdEF0dHIoYXN0OiBBdHRyQXN0LCBjb250ZXh0OiBhbnkpOiBhbnkge31cbn1cblxuZnVuY3Rpb24gbmVlZHNBZGRpdGlvbmFsUm9vdE5vZGUoYXN0Tm9kZXM6IFRlbXBsYXRlQXN0W10pOiBib29sZWFuIHtcbiAgY29uc3QgbGFzdEFzdE5vZGUgPSBhc3ROb2Rlc1thc3ROb2Rlcy5sZW5ndGggLSAxXTtcbiAgaWYgKGxhc3RBc3ROb2RlIGluc3RhbmNlb2YgRW1iZWRkZWRUZW1wbGF0ZUFzdCkge1xuICAgIHJldHVybiBsYXN0QXN0Tm9kZS5oYXNWaWV3Q29udGFpbmVyO1xuICB9XG5cbiAgaWYgKGxhc3RBc3ROb2RlIGluc3RhbmNlb2YgRWxlbWVudEFzdCkge1xuICAgIGlmIChpc05nQ29udGFpbmVyKGxhc3RBc3ROb2RlLm5hbWUpICYmIGxhc3RBc3ROb2RlLmNoaWxkcmVuLmxlbmd0aCkge1xuICAgICAgcmV0dXJuIG5lZWRzQWRkaXRpb25hbFJvb3ROb2RlKGxhc3RBc3ROb2RlLmNoaWxkcmVuKTtcbiAgICB9XG4gICAgcmV0dXJuIGxhc3RBc3ROb2RlLmhhc1ZpZXdDb250YWluZXI7XG4gIH1cblxuICByZXR1cm4gbGFzdEFzdE5vZGUgaW5zdGFuY2VvZiBOZ0NvbnRlbnRBc3Q7XG59XG5cblxuZnVuY3Rpb24gZWxlbWVudEJpbmRpbmdEZWYoaW5wdXRBc3Q6IEJvdW5kRWxlbWVudFByb3BlcnR5QXN0LCBkaXJBc3Q6IERpcmVjdGl2ZUFzdCk6IG8uRXhwcmVzc2lvbiB7XG4gIGNvbnN0IGlucHV0VHlwZSA9IGlucHV0QXN0LnR5cGU7XG4gIHN3aXRjaCAoaW5wdXRUeXBlKSB7XG4gICAgY2FzZSBQcm9wZXJ0eUJpbmRpbmdUeXBlLkF0dHJpYnV0ZTpcbiAgICAgIHJldHVybiBvLmxpdGVyYWxBcnIoW1xuICAgICAgICBvLmxpdGVyYWwoQmluZGluZ0ZsYWdzLlR5cGVFbGVtZW50QXR0cmlidXRlKSwgby5saXRlcmFsKGlucHV0QXN0Lm5hbWUpLFxuICAgICAgICBvLmxpdGVyYWwoaW5wdXRBc3Quc2VjdXJpdHlDb250ZXh0KVxuICAgICAgXSk7XG4gICAgY2FzZSBQcm9wZXJ0eUJpbmRpbmdUeXBlLlByb3BlcnR5OlxuICAgICAgcmV0dXJuIG8ubGl0ZXJhbEFycihbXG4gICAgICAgIG8ubGl0ZXJhbChCaW5kaW5nRmxhZ3MuVHlwZVByb3BlcnR5KSwgby5saXRlcmFsKGlucHV0QXN0Lm5hbWUpLFxuICAgICAgICBvLmxpdGVyYWwoaW5wdXRBc3Quc2VjdXJpdHlDb250ZXh0KVxuICAgICAgXSk7XG4gICAgY2FzZSBQcm9wZXJ0eUJpbmRpbmdUeXBlLkFuaW1hdGlvbjpcbiAgICAgIGNvbnN0IGJpbmRpbmdUeXBlID0gQmluZGluZ0ZsYWdzLlR5cGVQcm9wZXJ0eSB8XG4gICAgICAgICAgKGRpckFzdCAmJiBkaXJBc3QuZGlyZWN0aXZlLmlzQ29tcG9uZW50ID8gQmluZGluZ0ZsYWdzLlN5bnRoZXRpY0hvc3RQcm9wZXJ0eSA6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgQmluZGluZ0ZsYWdzLlN5bnRoZXRpY1Byb3BlcnR5KTtcbiAgICAgIHJldHVybiBvLmxpdGVyYWxBcnIoW1xuICAgICAgICBvLmxpdGVyYWwoYmluZGluZ1R5cGUpLCBvLmxpdGVyYWwoJ0AnICsgaW5wdXRBc3QubmFtZSksIG8ubGl0ZXJhbChpbnB1dEFzdC5zZWN1cml0eUNvbnRleHQpXG4gICAgICBdKTtcbiAgICBjYXNlIFByb3BlcnR5QmluZGluZ1R5cGUuQ2xhc3M6XG4gICAgICByZXR1cm4gby5saXRlcmFsQXJyKFxuICAgICAgICAgIFtvLmxpdGVyYWwoQmluZGluZ0ZsYWdzLlR5cGVFbGVtZW50Q2xhc3MpLCBvLmxpdGVyYWwoaW5wdXRBc3QubmFtZSksIG8uTlVMTF9FWFBSXSk7XG4gICAgY2FzZSBQcm9wZXJ0eUJpbmRpbmdUeXBlLlN0eWxlOlxuICAgICAgcmV0dXJuIG8ubGl0ZXJhbEFycihbXG4gICAgICAgIG8ubGl0ZXJhbChCaW5kaW5nRmxhZ3MuVHlwZUVsZW1lbnRTdHlsZSksIG8ubGl0ZXJhbChpbnB1dEFzdC5uYW1lKSwgby5saXRlcmFsKGlucHV0QXN0LnVuaXQpXG4gICAgICBdKTtcbiAgICBkZWZhdWx0OlxuICAgICAgLy8gVGhpcyBkZWZhdWx0IGNhc2UgaXMgbm90IG5lZWRlZCBieSBUeXBlU2NyaXB0IGNvbXBpbGVyLCBhcyB0aGUgc3dpdGNoIGlzIGV4aGF1c3RpdmUuXG4gICAgICAvLyBIb3dldmVyIENsb3N1cmUgQ29tcGlsZXIgZG9lcyBub3QgdW5kZXJzdGFuZCB0aGF0IGFuZCByZXBvcnRzIGFuIGVycm9yIGluIHR5cGVkIG1vZGUuXG4gICAgICAvLyBUaGUgYHRocm93IG5ldyBFcnJvcmAgYmVsb3cgd29ya3MgYXJvdW5kIHRoZSBwcm9ibGVtLCBhbmQgdGhlIHVuZXhwZWN0ZWQ6IG5ldmVyIHZhcmlhYmxlXG4gICAgICAvLyBtYWtlcyBzdXJlIHRzYyBzdGlsbCBjaGVja3MgdGhpcyBjb2RlIGlzIHVucmVhY2hhYmxlLlxuICAgICAgY29uc3QgdW5leHBlY3RlZDogbmV2ZXIgPSBpbnB1dFR5cGU7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYHVuZXhwZWN0ZWQgJHt1bmV4cGVjdGVkfWApO1xuICB9XG59XG5cblxuZnVuY3Rpb24gZml4ZWRBdHRyc0RlZihlbGVtZW50QXN0OiBFbGVtZW50QXN0KTogby5FeHByZXNzaW9uIHtcbiAgY29uc3QgbWFwUmVzdWx0OiB7W2tleTogc3RyaW5nXTogc3RyaW5nfSA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG4gIGVsZW1lbnRBc3QuYXR0cnMuZm9yRWFjaChhdHRyQXN0ID0+IHtcbiAgICBtYXBSZXN1bHRbYXR0ckFzdC5uYW1lXSA9IGF0dHJBc3QudmFsdWU7XG4gIH0pO1xuICBlbGVtZW50QXN0LmRpcmVjdGl2ZXMuZm9yRWFjaChkaXJBc3QgPT4ge1xuICAgIE9iamVjdC5rZXlzKGRpckFzdC5kaXJlY3RpdmUuaG9zdEF0dHJpYnV0ZXMpLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICBjb25zdCB2YWx1ZSA9IGRpckFzdC5kaXJlY3RpdmUuaG9zdEF0dHJpYnV0ZXNbbmFtZV07XG4gICAgICBjb25zdCBwcmV2VmFsdWUgPSBtYXBSZXN1bHRbbmFtZV07XG4gICAgICBtYXBSZXN1bHRbbmFtZV0gPSBwcmV2VmFsdWUgIT0gbnVsbCA/IG1lcmdlQXR0cmlidXRlVmFsdWUobmFtZSwgcHJldlZhbHVlLCB2YWx1ZSkgOiB2YWx1ZTtcbiAgICB9KTtcbiAgfSk7XG4gIC8vIE5vdGU6IFdlIG5lZWQgdG8gc29ydCB0byBnZXQgYSBkZWZpbmVkIG91dHB1dCBvcmRlclxuICAvLyBmb3IgdGVzdHMgYW5kIGZvciBjYWNoaW5nIGdlbmVyYXRlZCBhcnRpZmFjdHMuLi5cbiAgcmV0dXJuIG8ubGl0ZXJhbEFycihPYmplY3Qua2V5cyhtYXBSZXN1bHQpLnNvcnQoKS5tYXAoXG4gICAgICAoYXR0ck5hbWUpID0+IG8ubGl0ZXJhbEFycihbby5saXRlcmFsKGF0dHJOYW1lKSwgby5saXRlcmFsKG1hcFJlc3VsdFthdHRyTmFtZV0pXSkpKTtcbn1cblxuZnVuY3Rpb24gbWVyZ2VBdHRyaWJ1dGVWYWx1ZShhdHRyTmFtZTogc3RyaW5nLCBhdHRyVmFsdWUxOiBzdHJpbmcsIGF0dHJWYWx1ZTI6IHN0cmluZyk6IHN0cmluZyB7XG4gIGlmIChhdHRyTmFtZSA9PSBDTEFTU19BVFRSIHx8IGF0dHJOYW1lID09IFNUWUxFX0FUVFIpIHtcbiAgICByZXR1cm4gYCR7YXR0clZhbHVlMX0gJHthdHRyVmFsdWUyfWA7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGF0dHJWYWx1ZTI7XG4gIH1cbn1cblxuZnVuY3Rpb24gY2FsbENoZWNrU3RtdChub2RlSW5kZXg6IG51bWJlciwgZXhwcnM6IG8uRXhwcmVzc2lvbltdKTogby5FeHByZXNzaW9uIHtcbiAgaWYgKGV4cHJzLmxlbmd0aCA+IDEwKSB7XG4gICAgcmV0dXJuIENIRUNLX1ZBUi5jYWxsRm4oXG4gICAgICAgIFtWSUVXX1ZBUiwgby5saXRlcmFsKG5vZGVJbmRleCksIG8ubGl0ZXJhbChBcmd1bWVudFR5cGUuRHluYW1pYyksIG8ubGl0ZXJhbEFycihleHBycyldKTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gQ0hFQ0tfVkFSLmNhbGxGbihcbiAgICAgICAgW1ZJRVdfVkFSLCBvLmxpdGVyYWwobm9kZUluZGV4KSwgby5saXRlcmFsKEFyZ3VtZW50VHlwZS5JbmxpbmUpLCAuLi5leHByc10pO1xuICB9XG59XG5cbmZ1bmN0aW9uIGNhbGxVbndyYXBWYWx1ZShub2RlSW5kZXg6IG51bWJlciwgYmluZGluZ0lkeDogbnVtYmVyLCBleHByOiBvLkV4cHJlc3Npb24pOiBvLkV4cHJlc3Npb24ge1xuICByZXR1cm4gby5pbXBvcnRFeHByKElkZW50aWZpZXJzLnVud3JhcFZhbHVlKS5jYWxsRm4oW1xuICAgIFZJRVdfVkFSLCBvLmxpdGVyYWwobm9kZUluZGV4KSwgby5saXRlcmFsKGJpbmRpbmdJZHgpLCBleHByXG4gIF0pO1xufVxuXG5mdW5jdGlvbiBlbGVtZW50RXZlbnROYW1lQW5kVGFyZ2V0KFxuICAgIGV2ZW50QXN0OiBCb3VuZEV2ZW50QXN0LCBkaXJBc3Q6IERpcmVjdGl2ZUFzdHxudWxsKToge25hbWU6IHN0cmluZywgdGFyZ2V0OiBzdHJpbmd8bnVsbH0ge1xuICBpZiAoZXZlbnRBc3QuaXNBbmltYXRpb24pIHtcbiAgICByZXR1cm4ge1xuICAgICAgbmFtZTogYEAke2V2ZW50QXN0Lm5hbWV9LiR7ZXZlbnRBc3QucGhhc2V9YCxcbiAgICAgIHRhcmdldDogZGlyQXN0ICYmIGRpckFzdC5kaXJlY3RpdmUuaXNDb21wb25lbnQgPyAnY29tcG9uZW50JyA6IG51bGxcbiAgICB9O1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBldmVudEFzdDtcbiAgfVxufVxuXG5mdW5jdGlvbiBjYWxjUXVlcnlGbGFncyhxdWVyeTogQ29tcGlsZVF1ZXJ5TWV0YWRhdGEpIHtcbiAgbGV0IGZsYWdzID0gTm9kZUZsYWdzLk5vbmU7XG4gIC8vIE5vdGU6IFdlIG9ubHkgbWFrZSBxdWVyaWVzIHN0YXRpYyB0aGF0IHF1ZXJ5IGZvciBhIHNpbmdsZSBpdGVtIGFuZCB0aGUgdXNlciBzcGVjaWZpY2FsbHlcbiAgLy8gc2V0IHRoZSB0byBiZSBzdGF0aWMuIFRoaXMgaXMgYmVjYXVzZSBvZiBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eSB3aXRoIHRoZSBvbGQgdmlldyBjb21waWxlci4uLlxuICBpZiAocXVlcnkuZmlyc3QgJiYgcXVlcnkuc3RhdGljKSB7XG4gICAgZmxhZ3MgfD0gTm9kZUZsYWdzLlN0YXRpY1F1ZXJ5O1xuICB9IGVsc2Uge1xuICAgIGZsYWdzIHw9IE5vZGVGbGFncy5EeW5hbWljUXVlcnk7XG4gIH1cbiAgaWYgKHF1ZXJ5LmVtaXREaXN0aW5jdENoYW5nZXNPbmx5KSB7XG4gICAgZmxhZ3MgfD0gTm9kZUZsYWdzLkVtaXREaXN0aW5jdENoYW5nZXNPbmx5O1xuICB9XG4gIHJldHVybiBmbGFncztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGVsZW1lbnRFdmVudEZ1bGxOYW1lKHRhcmdldDogc3RyaW5nfG51bGwsIG5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiB0YXJnZXQgPyBgJHt0YXJnZXR9OiR7bmFtZX1gIDogbmFtZTtcbn1cbiJdfQ==