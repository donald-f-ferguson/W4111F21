/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { AUTO_STYLE, ɵPRE_STYLE as PRE_STYLE } from '@angular/animations';
import { copyObj, copyStyles, interpolateParams, iteratorToArray, resolveTiming, resolveTimingValue, visitDslNode } from '../util';
import { createTimelineInstruction } from './animation_timeline_instruction';
import { ElementInstructionMap } from './element_instruction_map';
const ONE_FRAME_IN_MILLISECONDS = 1;
const ENTER_TOKEN = ':enter';
const ENTER_TOKEN_REGEX = new RegExp(ENTER_TOKEN, 'g');
const LEAVE_TOKEN = ':leave';
const LEAVE_TOKEN_REGEX = new RegExp(LEAVE_TOKEN, 'g');
/*
 * The code within this file aims to generate web-animations-compatible keyframes from Angular's
 * animation DSL code.
 *
 * The code below will be converted from:
 *
 * ```
 * sequence([
 *   style({ opacity: 0 }),
 *   animate(1000, style({ opacity: 0 }))
 * ])
 * ```
 *
 * To:
 * ```
 * keyframes = [{ opacity: 0, offset: 0 }, { opacity: 1, offset: 1 }]
 * duration = 1000
 * delay = 0
 * easing = ''
 * ```
 *
 * For this operation to cover the combination of animation verbs (style, animate, group, etc...) a
 * combination of prototypical inheritance, AST traversal and merge-sort-like algorithms are used.
 *
 * [AST Traversal]
 * Each of the animation verbs, when executed, will return an string-map object representing what
 * type of action it is (style, animate, group, etc...) and the data associated with it. This means
 * that when functional composition mix of these functions is evaluated (like in the example above)
 * then it will end up producing a tree of objects representing the animation itself.
 *
 * When this animation object tree is processed by the visitor code below it will visit each of the
 * verb statements within the visitor. And during each visit it will build the context of the
 * animation keyframes by interacting with the `TimelineBuilder`.
 *
 * [TimelineBuilder]
 * This class is responsible for tracking the styles and building a series of keyframe objects for a
 * timeline between a start and end time. The builder starts off with an initial timeline and each
 * time the AST comes across a `group()`, `keyframes()` or a combination of the two wihtin a
 * `sequence()` then it will generate a sub timeline for each step as well as a new one after
 * they are complete.
 *
 * As the AST is traversed, the timing state on each of the timelines will be incremented. If a sub
 * timeline was created (based on one of the cases above) then the parent timeline will attempt to
 * merge the styles used within the sub timelines into itself (only with group() this will happen).
 * This happens with a merge operation (much like how the merge works in mergesort) and it will only
 * copy the most recently used styles from the sub timelines into the parent timeline. This ensures
 * that if the styles are used later on in another phase of the animation then they will be the most
 * up-to-date values.
 *
 * [How Missing Styles Are Updated]
 * Each timeline has a `backFill` property which is responsible for filling in new styles into
 * already processed keyframes if a new style shows up later within the animation sequence.
 *
 * ```
 * sequence([
 *   style({ width: 0 }),
 *   animate(1000, style({ width: 100 })),
 *   animate(1000, style({ width: 200 })),
 *   animate(1000, style({ width: 300 }))
 *   animate(1000, style({ width: 400, height: 400 })) // notice how `height` doesn't exist anywhere
 * else
 * ])
 * ```
 *
 * What is happening here is that the `height` value is added later in the sequence, but is missing
 * from all previous animation steps. Therefore when a keyframe is created it would also be missing
 * from all previous keyframes up until where it is first used. For the timeline keyframe generation
 * to properly fill in the style it will place the previous value (the value from the parent
 * timeline) or a default value of `*` into the backFill object. Given that each of the keyframe
 * styles are objects that prototypically inhert from the backFill object, this means that if a
 * value is added into the backFill then it will automatically propagate any missing values to all
 * keyframes. Therefore the missing `height` value will be properly filled into the already
 * processed keyframes.
 *
 * When a sub-timeline is created it will have its own backFill property. This is done so that
 * styles present within the sub-timeline do not accidentally seep into the previous/future timeline
 * keyframes
 *
 * (For prototypically-inherited contents to be detected a `for(i in obj)` loop must be used.)
 *
 * [Validation]
 * The code in this file is not responsible for validation. That functionality happens with within
 * the `AnimationValidatorVisitor` code.
 */
export function buildAnimationTimelines(driver, rootElement, ast, enterClassName, leaveClassName, startingStyles = {}, finalStyles = {}, options, subInstructions, errors = []) {
    return new AnimationTimelineBuilderVisitor().buildKeyframes(driver, rootElement, ast, enterClassName, leaveClassName, startingStyles, finalStyles, options, subInstructions, errors);
}
export class AnimationTimelineBuilderVisitor {
    buildKeyframes(driver, rootElement, ast, enterClassName, leaveClassName, startingStyles, finalStyles, options, subInstructions, errors = []) {
        subInstructions = subInstructions || new ElementInstructionMap();
        const context = new AnimationTimelineContext(driver, rootElement, subInstructions, enterClassName, leaveClassName, errors, []);
        context.options = options;
        context.currentTimeline.setStyles([startingStyles], null, context.errors, options);
        visitDslNode(this, ast, context);
        // this checks to see if an actual animation happened
        const timelines = context.timelines.filter(timeline => timeline.containsAnimation());
        if (timelines.length && Object.keys(finalStyles).length) {
            const tl = timelines[timelines.length - 1];
            if (!tl.allowOnlyTimelineStyles()) {
                tl.setStyles([finalStyles], null, context.errors, options);
            }
        }
        return timelines.length ? timelines.map(timeline => timeline.buildKeyframes()) :
            [createTimelineInstruction(rootElement, [], [], [], 0, 0, '', false)];
    }
    visitTrigger(ast, context) {
        // these values are not visited in this AST
    }
    visitState(ast, context) {
        // these values are not visited in this AST
    }
    visitTransition(ast, context) {
        // these values are not visited in this AST
    }
    visitAnimateChild(ast, context) {
        const elementInstructions = context.subInstructions.consume(context.element);
        if (elementInstructions) {
            const innerContext = context.createSubContext(ast.options);
            const startTime = context.currentTimeline.currentTime;
            const endTime = this._visitSubInstructions(elementInstructions, innerContext, innerContext.options);
            if (startTime != endTime) {
                // we do this on the upper context because we created a sub context for
                // the sub child animations
                context.transformIntoNewTimeline(endTime);
            }
        }
        context.previousNode = ast;
    }
    visitAnimateRef(ast, context) {
        const innerContext = context.createSubContext(ast.options);
        innerContext.transformIntoNewTimeline();
        this.visitReference(ast.animation, innerContext);
        context.transformIntoNewTimeline(innerContext.currentTimeline.currentTime);
        context.previousNode = ast;
    }
    _visitSubInstructions(instructions, context, options) {
        const startTime = context.currentTimeline.currentTime;
        let furthestTime = startTime;
        // this is a special-case for when a user wants to skip a sub
        // animation from being fired entirely.
        const duration = options.duration != null ? resolveTimingValue(options.duration) : null;
        const delay = options.delay != null ? resolveTimingValue(options.delay) : null;
        if (duration !== 0) {
            instructions.forEach(instruction => {
                const instructionTimings = context.appendInstructionToTimeline(instruction, duration, delay);
                furthestTime =
                    Math.max(furthestTime, instructionTimings.duration + instructionTimings.delay);
            });
        }
        return furthestTime;
    }
    visitReference(ast, context) {
        context.updateOptions(ast.options, true);
        visitDslNode(this, ast.animation, context);
        context.previousNode = ast;
    }
    visitSequence(ast, context) {
        const subContextCount = context.subContextCount;
        let ctx = context;
        const options = ast.options;
        if (options && (options.params || options.delay)) {
            ctx = context.createSubContext(options);
            ctx.transformIntoNewTimeline();
            if (options.delay != null) {
                if (ctx.previousNode.type == 6 /* Style */) {
                    ctx.currentTimeline.snapshotCurrentStyles();
                    ctx.previousNode = DEFAULT_NOOP_PREVIOUS_NODE;
                }
                const delay = resolveTimingValue(options.delay);
                ctx.delayNextStep(delay);
            }
        }
        if (ast.steps.length) {
            ast.steps.forEach(s => visitDslNode(this, s, ctx));
            // this is here just incase the inner steps only contain or end with a style() call
            ctx.currentTimeline.applyStylesToKeyframe();
            // this means that some animation function within the sequence
            // ended up creating a sub timeline (which means the current
            // timeline cannot overlap with the contents of the sequence)
            if (ctx.subContextCount > subContextCount) {
                ctx.transformIntoNewTimeline();
            }
        }
        context.previousNode = ast;
    }
    visitGroup(ast, context) {
        const innerTimelines = [];
        let furthestTime = context.currentTimeline.currentTime;
        const delay = ast.options && ast.options.delay ? resolveTimingValue(ast.options.delay) : 0;
        ast.steps.forEach(s => {
            const innerContext = context.createSubContext(ast.options);
            if (delay) {
                innerContext.delayNextStep(delay);
            }
            visitDslNode(this, s, innerContext);
            furthestTime = Math.max(furthestTime, innerContext.currentTimeline.currentTime);
            innerTimelines.push(innerContext.currentTimeline);
        });
        // this operation is run after the AST loop because otherwise
        // if the parent timeline's collected styles were updated then
        // it would pass in invalid data into the new-to-be forked items
        innerTimelines.forEach(timeline => context.currentTimeline.mergeTimelineCollectedStyles(timeline));
        context.transformIntoNewTimeline(furthestTime);
        context.previousNode = ast;
    }
    _visitTiming(ast, context) {
        if (ast.dynamic) {
            const strValue = ast.strValue;
            const timingValue = context.params ? interpolateParams(strValue, context.params, context.errors) : strValue;
            return resolveTiming(timingValue, context.errors);
        }
        else {
            return { duration: ast.duration, delay: ast.delay, easing: ast.easing };
        }
    }
    visitAnimate(ast, context) {
        const timings = context.currentAnimateTimings = this._visitTiming(ast.timings, context);
        const timeline = context.currentTimeline;
        if (timings.delay) {
            context.incrementTime(timings.delay);
            timeline.snapshotCurrentStyles();
        }
        const style = ast.style;
        if (style.type == 5 /* Keyframes */) {
            this.visitKeyframes(style, context);
        }
        else {
            context.incrementTime(timings.duration);
            this.visitStyle(style, context);
            timeline.applyStylesToKeyframe();
        }
        context.currentAnimateTimings = null;
        context.previousNode = ast;
    }
    visitStyle(ast, context) {
        const timeline = context.currentTimeline;
        const timings = context.currentAnimateTimings;
        // this is a special case for when a style() call
        // directly follows  an animate() call (but not inside of an animate() call)
        if (!timings && timeline.getCurrentStyleProperties().length) {
            timeline.forwardFrame();
        }
        const easing = (timings && timings.easing) || ast.easing;
        if (ast.isEmptyStep) {
            timeline.applyEmptyStep(easing);
        }
        else {
            timeline.setStyles(ast.styles, easing, context.errors, context.options);
        }
        context.previousNode = ast;
    }
    visitKeyframes(ast, context) {
        const currentAnimateTimings = context.currentAnimateTimings;
        const startTime = (context.currentTimeline).duration;
        const duration = currentAnimateTimings.duration;
        const innerContext = context.createSubContext();
        const innerTimeline = innerContext.currentTimeline;
        innerTimeline.easing = currentAnimateTimings.easing;
        ast.styles.forEach(step => {
            const offset = step.offset || 0;
            innerTimeline.forwardTime(offset * duration);
            innerTimeline.setStyles(step.styles, step.easing, context.errors, context.options);
            innerTimeline.applyStylesToKeyframe();
        });
        // this will ensure that the parent timeline gets all the styles from
        // the child even if the new timeline below is not used
        context.currentTimeline.mergeTimelineCollectedStyles(innerTimeline);
        // we do this because the window between this timeline and the sub timeline
        // should ensure that the styles within are exactly the same as they were before
        context.transformIntoNewTimeline(startTime + duration);
        context.previousNode = ast;
    }
    visitQuery(ast, context) {
        // in the event that the first step before this is a style step we need
        // to ensure the styles are applied before the children are animated
        const startTime = context.currentTimeline.currentTime;
        const options = (ast.options || {});
        const delay = options.delay ? resolveTimingValue(options.delay) : 0;
        if (delay &&
            (context.previousNode.type === 6 /* Style */ ||
                (startTime == 0 && context.currentTimeline.getCurrentStyleProperties().length))) {
            context.currentTimeline.snapshotCurrentStyles();
            context.previousNode = DEFAULT_NOOP_PREVIOUS_NODE;
        }
        let furthestTime = startTime;
        const elms = context.invokeQuery(ast.selector, ast.originalSelector, ast.limit, ast.includeSelf, options.optional ? true : false, context.errors);
        context.currentQueryTotal = elms.length;
        let sameElementTimeline = null;
        elms.forEach((element, i) => {
            context.currentQueryIndex = i;
            const innerContext = context.createSubContext(ast.options, element);
            if (delay) {
                innerContext.delayNextStep(delay);
            }
            if (element === context.element) {
                sameElementTimeline = innerContext.currentTimeline;
            }
            visitDslNode(this, ast.animation, innerContext);
            // this is here just incase the inner steps only contain or end
            // with a style() call (which is here to signal that this is a preparatory
            // call to style an element before it is animated again)
            innerContext.currentTimeline.applyStylesToKeyframe();
            const endTime = innerContext.currentTimeline.currentTime;
            furthestTime = Math.max(furthestTime, endTime);
        });
        context.currentQueryIndex = 0;
        context.currentQueryTotal = 0;
        context.transformIntoNewTimeline(furthestTime);
        if (sameElementTimeline) {
            context.currentTimeline.mergeTimelineCollectedStyles(sameElementTimeline);
            context.currentTimeline.snapshotCurrentStyles();
        }
        context.previousNode = ast;
    }
    visitStagger(ast, context) {
        const parentContext = context.parentContext;
        const tl = context.currentTimeline;
        const timings = ast.timings;
        const duration = Math.abs(timings.duration);
        const maxTime = duration * (context.currentQueryTotal - 1);
        let delay = duration * context.currentQueryIndex;
        let staggerTransformer = timings.duration < 0 ? 'reverse' : timings.easing;
        switch (staggerTransformer) {
            case 'reverse':
                delay = maxTime - delay;
                break;
            case 'full':
                delay = parentContext.currentStaggerTime;
                break;
        }
        const timeline = context.currentTimeline;
        if (delay) {
            timeline.delayNextStep(delay);
        }
        const startingTime = timeline.currentTime;
        visitDslNode(this, ast.animation, context);
        context.previousNode = ast;
        // time = duration + delay
        // the reason why this computation is so complex is because
        // the inner timeline may either have a delay value or a stretched
        // keyframe depending on if a subtimeline is not used or is used.
        parentContext.currentStaggerTime =
            (tl.currentTime - startingTime) + (tl.startTime - parentContext.currentTimeline.startTime);
    }
}
const DEFAULT_NOOP_PREVIOUS_NODE = {};
export class AnimationTimelineContext {
    constructor(_driver, element, subInstructions, _enterClassName, _leaveClassName, errors, timelines, initialTimeline) {
        this._driver = _driver;
        this.element = element;
        this.subInstructions = subInstructions;
        this._enterClassName = _enterClassName;
        this._leaveClassName = _leaveClassName;
        this.errors = errors;
        this.timelines = timelines;
        this.parentContext = null;
        this.currentAnimateTimings = null;
        this.previousNode = DEFAULT_NOOP_PREVIOUS_NODE;
        this.subContextCount = 0;
        this.options = {};
        this.currentQueryIndex = 0;
        this.currentQueryTotal = 0;
        this.currentStaggerTime = 0;
        this.currentTimeline = initialTimeline || new TimelineBuilder(this._driver, element, 0);
        timelines.push(this.currentTimeline);
    }
    get params() {
        return this.options.params;
    }
    updateOptions(options, skipIfExists) {
        if (!options)
            return;
        const newOptions = options;
        let optionsToUpdate = this.options;
        // NOTE: this will get patched up when other animation methods support duration overrides
        if (newOptions.duration != null) {
            optionsToUpdate.duration = resolveTimingValue(newOptions.duration);
        }
        if (newOptions.delay != null) {
            optionsToUpdate.delay = resolveTimingValue(newOptions.delay);
        }
        const newParams = newOptions.params;
        if (newParams) {
            let paramsToUpdate = optionsToUpdate.params;
            if (!paramsToUpdate) {
                paramsToUpdate = this.options.params = {};
            }
            Object.keys(newParams).forEach(name => {
                if (!skipIfExists || !paramsToUpdate.hasOwnProperty(name)) {
                    paramsToUpdate[name] = interpolateParams(newParams[name], paramsToUpdate, this.errors);
                }
            });
        }
    }
    _copyOptions() {
        const options = {};
        if (this.options) {
            const oldParams = this.options.params;
            if (oldParams) {
                const params = options['params'] = {};
                Object.keys(oldParams).forEach(name => {
                    params[name] = oldParams[name];
                });
            }
        }
        return options;
    }
    createSubContext(options = null, element, newTime) {
        const target = element || this.element;
        const context = new AnimationTimelineContext(this._driver, target, this.subInstructions, this._enterClassName, this._leaveClassName, this.errors, this.timelines, this.currentTimeline.fork(target, newTime || 0));
        context.previousNode = this.previousNode;
        context.currentAnimateTimings = this.currentAnimateTimings;
        context.options = this._copyOptions();
        context.updateOptions(options);
        context.currentQueryIndex = this.currentQueryIndex;
        context.currentQueryTotal = this.currentQueryTotal;
        context.parentContext = this;
        this.subContextCount++;
        return context;
    }
    transformIntoNewTimeline(newTime) {
        this.previousNode = DEFAULT_NOOP_PREVIOUS_NODE;
        this.currentTimeline = this.currentTimeline.fork(this.element, newTime);
        this.timelines.push(this.currentTimeline);
        return this.currentTimeline;
    }
    appendInstructionToTimeline(instruction, duration, delay) {
        const updatedTimings = {
            duration: duration != null ? duration : instruction.duration,
            delay: this.currentTimeline.currentTime + (delay != null ? delay : 0) + instruction.delay,
            easing: ''
        };
        const builder = new SubTimelineBuilder(this._driver, instruction.element, instruction.keyframes, instruction.preStyleProps, instruction.postStyleProps, updatedTimings, instruction.stretchStartingKeyframe);
        this.timelines.push(builder);
        return updatedTimings;
    }
    incrementTime(time) {
        this.currentTimeline.forwardTime(this.currentTimeline.duration + time);
    }
    delayNextStep(delay) {
        // negative delays are not yet supported
        if (delay > 0) {
            this.currentTimeline.delayNextStep(delay);
        }
    }
    invokeQuery(selector, originalSelector, limit, includeSelf, optional, errors) {
        let results = [];
        if (includeSelf) {
            results.push(this.element);
        }
        if (selector.length > 0) { // if :self is only used then the selector is empty
            selector = selector.replace(ENTER_TOKEN_REGEX, '.' + this._enterClassName);
            selector = selector.replace(LEAVE_TOKEN_REGEX, '.' + this._leaveClassName);
            const multi = limit != 1;
            let elements = this._driver.query(this.element, selector, multi);
            if (limit !== 0) {
                elements = limit < 0 ? elements.slice(elements.length + limit, elements.length) :
                    elements.slice(0, limit);
            }
            results.push(...elements);
        }
        if (!optional && results.length == 0) {
            errors.push(`\`query("${originalSelector}")\` returned zero elements. (Use \`query("${originalSelector}", { optional: true })\` if you wish to allow this.)`);
        }
        return results;
    }
}
export class TimelineBuilder {
    constructor(_driver, element, startTime, _elementTimelineStylesLookup) {
        this._driver = _driver;
        this.element = element;
        this.startTime = startTime;
        this._elementTimelineStylesLookup = _elementTimelineStylesLookup;
        this.duration = 0;
        this._previousKeyframe = {};
        this._currentKeyframe = {};
        this._keyframes = new Map();
        this._styleSummary = {};
        this._pendingStyles = {};
        this._backFill = {};
        this._currentEmptyStepKeyframe = null;
        if (!this._elementTimelineStylesLookup) {
            this._elementTimelineStylesLookup = new Map();
        }
        this._localTimelineStyles = Object.create(this._backFill, {});
        this._globalTimelineStyles = this._elementTimelineStylesLookup.get(element);
        if (!this._globalTimelineStyles) {
            this._globalTimelineStyles = this._localTimelineStyles;
            this._elementTimelineStylesLookup.set(element, this._localTimelineStyles);
        }
        this._loadKeyframe();
    }
    containsAnimation() {
        switch (this._keyframes.size) {
            case 0:
                return false;
            case 1:
                return this.getCurrentStyleProperties().length > 0;
            default:
                return true;
        }
    }
    getCurrentStyleProperties() {
        return Object.keys(this._currentKeyframe);
    }
    get currentTime() {
        return this.startTime + this.duration;
    }
    delayNextStep(delay) {
        // in the event that a style() step is placed right before a stagger()
        // and that style() step is the very first style() value in the animation
        // then we need to make a copy of the keyframe [0, copy, 1] so that the delay
        // properly applies the style() values to work with the stagger...
        const hasPreStyleStep = this._keyframes.size == 1 && Object.keys(this._pendingStyles).length;
        if (this.duration || hasPreStyleStep) {
            this.forwardTime(this.currentTime + delay);
            if (hasPreStyleStep) {
                this.snapshotCurrentStyles();
            }
        }
        else {
            this.startTime += delay;
        }
    }
    fork(element, currentTime) {
        this.applyStylesToKeyframe();
        return new TimelineBuilder(this._driver, element, currentTime || this.currentTime, this._elementTimelineStylesLookup);
    }
    _loadKeyframe() {
        if (this._currentKeyframe) {
            this._previousKeyframe = this._currentKeyframe;
        }
        this._currentKeyframe = this._keyframes.get(this.duration);
        if (!this._currentKeyframe) {
            this._currentKeyframe = Object.create(this._backFill, {});
            this._keyframes.set(this.duration, this._currentKeyframe);
        }
    }
    forwardFrame() {
        this.duration += ONE_FRAME_IN_MILLISECONDS;
        this._loadKeyframe();
    }
    forwardTime(time) {
        this.applyStylesToKeyframe();
        this.duration = time;
        this._loadKeyframe();
    }
    _updateStyle(prop, value) {
        this._localTimelineStyles[prop] = value;
        this._globalTimelineStyles[prop] = value;
        this._styleSummary[prop] = { time: this.currentTime, value };
    }
    allowOnlyTimelineStyles() {
        return this._currentEmptyStepKeyframe !== this._currentKeyframe;
    }
    applyEmptyStep(easing) {
        if (easing) {
            this._previousKeyframe['easing'] = easing;
        }
        // special case for animate(duration):
        // all missing styles are filled with a `*` value then
        // if any destination styles are filled in later on the same
        // keyframe then they will override the overridden styles
        // We use `_globalTimelineStyles` here because there may be
        // styles in previous keyframes that are not present in this timeline
        Object.keys(this._globalTimelineStyles).forEach(prop => {
            this._backFill[prop] = this._globalTimelineStyles[prop] || AUTO_STYLE;
            this._currentKeyframe[prop] = AUTO_STYLE;
        });
        this._currentEmptyStepKeyframe = this._currentKeyframe;
    }
    setStyles(input, easing, errors, options) {
        if (easing) {
            this._previousKeyframe['easing'] = easing;
        }
        const params = (options && options.params) || {};
        const styles = flattenStyles(input, this._globalTimelineStyles);
        Object.keys(styles).forEach(prop => {
            const val = interpolateParams(styles[prop], params, errors);
            this._pendingStyles[prop] = val;
            if (!this._localTimelineStyles.hasOwnProperty(prop)) {
                this._backFill[prop] = this._globalTimelineStyles.hasOwnProperty(prop) ?
                    this._globalTimelineStyles[prop] :
                    AUTO_STYLE;
            }
            this._updateStyle(prop, val);
        });
    }
    applyStylesToKeyframe() {
        const styles = this._pendingStyles;
        const props = Object.keys(styles);
        if (props.length == 0)
            return;
        this._pendingStyles = {};
        props.forEach(prop => {
            const val = styles[prop];
            this._currentKeyframe[prop] = val;
        });
        Object.keys(this._localTimelineStyles).forEach(prop => {
            if (!this._currentKeyframe.hasOwnProperty(prop)) {
                this._currentKeyframe[prop] = this._localTimelineStyles[prop];
            }
        });
    }
    snapshotCurrentStyles() {
        Object.keys(this._localTimelineStyles).forEach(prop => {
            const val = this._localTimelineStyles[prop];
            this._pendingStyles[prop] = val;
            this._updateStyle(prop, val);
        });
    }
    getFinalKeyframe() {
        return this._keyframes.get(this.duration);
    }
    get properties() {
        const properties = [];
        for (let prop in this._currentKeyframe) {
            properties.push(prop);
        }
        return properties;
    }
    mergeTimelineCollectedStyles(timeline) {
        Object.keys(timeline._styleSummary).forEach(prop => {
            const details0 = this._styleSummary[prop];
            const details1 = timeline._styleSummary[prop];
            if (!details0 || details1.time > details0.time) {
                this._updateStyle(prop, details1.value);
            }
        });
    }
    buildKeyframes() {
        this.applyStylesToKeyframe();
        const preStyleProps = new Set();
        const postStyleProps = new Set();
        const isEmpty = this._keyframes.size === 1 && this.duration === 0;
        let finalKeyframes = [];
        this._keyframes.forEach((keyframe, time) => {
            const finalKeyframe = copyStyles(keyframe, true);
            Object.keys(finalKeyframe).forEach(prop => {
                const value = finalKeyframe[prop];
                if (value == PRE_STYLE) {
                    preStyleProps.add(prop);
                }
                else if (value == AUTO_STYLE) {
                    postStyleProps.add(prop);
                }
            });
            if (!isEmpty) {
                finalKeyframe['offset'] = time / this.duration;
            }
            finalKeyframes.push(finalKeyframe);
        });
        const preProps = preStyleProps.size ? iteratorToArray(preStyleProps.values()) : [];
        const postProps = postStyleProps.size ? iteratorToArray(postStyleProps.values()) : [];
        // special case for a 0-second animation (which is designed just to place styles onscreen)
        if (isEmpty) {
            const kf0 = finalKeyframes[0];
            const kf1 = copyObj(kf0);
            kf0['offset'] = 0;
            kf1['offset'] = 1;
            finalKeyframes = [kf0, kf1];
        }
        return createTimelineInstruction(this.element, finalKeyframes, preProps, postProps, this.duration, this.startTime, this.easing, false);
    }
}
class SubTimelineBuilder extends TimelineBuilder {
    constructor(driver, element, keyframes, preStyleProps, postStyleProps, timings, _stretchStartingKeyframe = false) {
        super(driver, element, timings.delay);
        this.keyframes = keyframes;
        this.preStyleProps = preStyleProps;
        this.postStyleProps = postStyleProps;
        this._stretchStartingKeyframe = _stretchStartingKeyframe;
        this.timings = { duration: timings.duration, delay: timings.delay, easing: timings.easing };
    }
    containsAnimation() {
        return this.keyframes.length > 1;
    }
    buildKeyframes() {
        let keyframes = this.keyframes;
        let { delay, duration, easing } = this.timings;
        if (this._stretchStartingKeyframe && delay) {
            const newKeyframes = [];
            const totalTime = duration + delay;
            const startingGap = delay / totalTime;
            // the original starting keyframe now starts once the delay is done
            const newFirstKeyframe = copyStyles(keyframes[0], false);
            newFirstKeyframe['offset'] = 0;
            newKeyframes.push(newFirstKeyframe);
            const oldFirstKeyframe = copyStyles(keyframes[0], false);
            oldFirstKeyframe['offset'] = roundOffset(startingGap);
            newKeyframes.push(oldFirstKeyframe);
            /*
              When the keyframe is stretched then it means that the delay before the animation
              starts is gone. Instead the first keyframe is placed at the start of the animation
              and it is then copied to where it starts when the original delay is over. This basically
              means nothing animates during that delay, but the styles are still renderered. For this
              to work the original offset values that exist in the original keyframes must be "warped"
              so that they can take the new keyframe + delay into account.
      
              delay=1000, duration=1000, keyframes = 0 .5 1
      
              turns into
      
              delay=0, duration=2000, keyframes = 0 .33 .66 1
             */
            // offsets between 1 ... n -1 are all warped by the keyframe stretch
            const limit = keyframes.length - 1;
            for (let i = 1; i <= limit; i++) {
                let kf = copyStyles(keyframes[i], false);
                const oldOffset = kf['offset'];
                const timeAtKeyframe = delay + oldOffset * duration;
                kf['offset'] = roundOffset(timeAtKeyframe / totalTime);
                newKeyframes.push(kf);
            }
            // the new starting keyframe should be added at the start
            duration = totalTime;
            delay = 0;
            easing = '';
            keyframes = newKeyframes;
        }
        return createTimelineInstruction(this.element, keyframes, this.preStyleProps, this.postStyleProps, duration, delay, easing, true);
    }
}
function roundOffset(offset, decimalPoints = 3) {
    const mult = Math.pow(10, decimalPoints - 1);
    return Math.round(offset * mult) / mult;
}
function flattenStyles(input, allStyles) {
    const styles = {};
    let allProperties;
    input.forEach(token => {
        if (token === '*') {
            allProperties = allProperties || Object.keys(allStyles);
            allProperties.forEach(prop => {
                styles[prop] = AUTO_STYLE;
            });
        }
        else {
            copyStyles(token, false, styles);
        }
    });
    return styles;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYW5pbWF0aW9uX3RpbWVsaW5lX2J1aWxkZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9wYWNrYWdlcy9hbmltYXRpb25zL2Jyb3dzZXIvc3JjL2RzbC9hbmltYXRpb25fdGltZWxpbmVfYnVpbGRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7O0dBTUc7QUFDSCxPQUFPLEVBQXNHLFVBQVUsRUFBRSxVQUFVLElBQUksU0FBUyxFQUFhLE1BQU0scUJBQXFCLENBQUM7QUFHekwsT0FBTyxFQUFDLE9BQU8sRUFBRSxVQUFVLEVBQUUsaUJBQWlCLEVBQUUsZUFBZSxFQUFFLGFBQWEsRUFBRSxrQkFBa0IsRUFBRSxZQUFZLEVBQUMsTUFBTSxTQUFTLENBQUM7QUFHakksT0FBTyxFQUErQix5QkFBeUIsRUFBQyxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pHLE9BQU8sRUFBQyxxQkFBcUIsRUFBQyxNQUFNLDJCQUEyQixDQUFDO0FBRWhFLE1BQU0seUJBQXlCLEdBQUcsQ0FBQyxDQUFDO0FBQ3BDLE1BQU0sV0FBVyxHQUFHLFFBQVEsQ0FBQztBQUM3QixNQUFNLGlCQUFpQixHQUFHLElBQUksTUFBTSxDQUFDLFdBQVcsRUFBRSxHQUFHLENBQUMsQ0FBQztBQUN2RCxNQUFNLFdBQVcsR0FBRyxRQUFRLENBQUM7QUFDN0IsTUFBTSxpQkFBaUIsR0FBRyxJQUFJLE1BQU0sQ0FBQyxXQUFXLEVBQUUsR0FBRyxDQUFDLENBQUM7QUFFdkQ7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBbUZHO0FBQ0gsTUFBTSxVQUFVLHVCQUF1QixDQUNuQyxNQUF1QixFQUFFLFdBQWdCLEVBQUUsR0FBK0IsRUFDMUUsY0FBc0IsRUFBRSxjQUFzQixFQUFFLGlCQUE2QixFQUFFLEVBQy9FLGNBQTBCLEVBQUUsRUFB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SyxHQUFHLEVBQUU7WUFDakIsYUFBYSxHQUFHLGFBQWEsSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ3hELGFBQWEsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUU7Z0JBQzNCLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxVQUFVLENBQUM7WUFDNUIsQ0FBQyxDQUFDLENBQUM7U0FDSjthQUFNO1lBQ0wsVUFBVSxDQUFDLEtBQW1CLEVBQUUsS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1NBQ2hEO0lBQ0gsQ0FBQyxDQUFDLENBQUM7SUFDSCxPQUFPLE1BQU0sQ0FBQztBQUNoQixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IEdvb2dsZSBMTEMgQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5pbXBvcnQge0FuaW1hdGVDaGlsZE9wdGlvbnMsIEFuaW1hdGVUaW1pbmdzLCBBbmltYXRpb25NZXRhZGF0YVR5cGUsIEFuaW1hdGlvbk9wdGlvbnMsIEFuaW1hdGlvblF1ZXJ5T3B0aW9ucywgQVVUT19TVFlMRSwgybVQUkVfU1RZTEUgYXMgUFJFX1NUWUxFLCDJtVN0eWxlRGF0YX0gZnJvbSAnQGFuZ3VsYXIvYW5pbWF0aW9ucyc7XG5cbmltcG9ydCB7QW5pbWF0aW9uRHJpdmVyfSBmcm9tICcuLi9yZW5kZXIvYW5pbWF0aW9uX2RyaXZlcic7XG5pbXBvcnQge2NvcHlPYmosIGNvcHlTdHlsZXMsIGludGVycG9sYXRlUGFyYW1zLCBpdGVyYXRvclRvQXJyYXksIHJlc29sdmVUaW1pbmcsIHJlc29sdmVUaW1pbmdWYWx1ZSwgdmlzaXREc2xOb2RlfSBmcm9tICcuLi91dGlsJztcblxuaW1wb3J0IHtBbmltYXRlQXN0LCBBbmltYXRlQ2hpbGRBc3QsIEFuaW1hdGVSZWZBc3QsIEFzdCwgQXN0VmlzaXRvciwgRHluYW1pY1RpbWluZ0FzdCwgR3JvdXBBc3QsIEtleWZyYW1lc0FzdCwgUXVlcnlBc3QsIFJlZmVyZW5jZUFzdCwgU2VxdWVuY2VBc3QsIFN0YWdnZXJBc3QsIFN0YXRlQXN0LCBTdHlsZUFzdCwgVGltaW5nQXN0LCBUcmFuc2l0aW9uQXN0LCBUcmlnZ2VyQXN0fSBmcm9tICcuL2FuaW1hdGlvbl9hc3QnO1xuaW1wb3J0IHtBbmltYXRpb25UaW1lbGluZUluc3RydWN0aW9uLCBjcmVhdGVUaW1lbGluZUluc3RydWN0aW9ufSBmcm9tICcuL2FuaW1hdGlvbl90aW1lbGluZV9pbnN0cnVjdGlvbic7XG5pbXBvcnQge0VsZW1lbnRJbnN0cnVjdGlvbk1hcH0gZnJvbSAnLi9lbGVtZW50X2luc3RydWN0aW9uX21hcCc7XG5cbmNvbnN0IE9ORV9GUkFNRV9JTl9NSUxMSVNFQ09ORFMgPSAxO1xuY29uc3QgRU5URVJfVE9LRU4gPSAnOmVudGVyJztcbmNvbnN0IEVOVEVSX1RPS0VOX1JFR0VYID0gbmV3IFJlZ0V4cChFTlRFUl9UT0tFTiwgJ2cnKTtcbmNvbnN0IExFQVZFX1RPS0VOID0gJzpsZWF2ZSc7XG5jb25zdCBMRUFWRV9UT0tFTl9SRUdFWCA9IG5ldyBSZWdFeHAoTEVBVkVfVE9LRU4sICdnJyk7XG5cbi8qXG4gKiBUaGUgY29kZSB3aXRoaW4gdGhpcyBmaWxlIGFpbXMgdG8gZ2VuZXJhdGUgd2ViLWFuaW1hdGlvbnMtY29tcGF0aWJsZSBrZXlmcmFtZXMgZnJvbSBBbmd1bGFyJ3NcbiAqIGFuaW1hdGlvbiBEU0wgY29kZS5cbiAqXG4gKiBUaGUgY29kZSBiZWxvdyB3aWxsIGJlIGNvbnZlcnRlZCBmcm9tOlxuICpcbiAqIGBgYFxuICogc2VxdWVuY2UoW1xuICogICBzdHlsZSh7IG9wYWNpdHk6IDAgfSksXG4gKiAgIGFuaW1hdGUoMTAwMCwgc3R5bGUoeyBvcGFjaXR5OiAwIH0pKVxuICogXSlcbiAqIGBgYFxuICpcbiAqIFRvOlxuICogYGBgXG4gKiBrZXlmcmFtZXMgPSBbeyBvcGFjaXR5OiAwLCBvZmZzZXQ6IDAgfSwgeyBvcGFjaXR5OiAxLCBvZmZzZXQ6IDEgfV1cbiAqIGR1cmF0aW9uID0gMTAwMFxuICogZGVsYXkgPSAwXG4gKiBlYXNpbmcgPSAnJ1xuICogYGBgXG4gKlxuICogRm9yIHRoaXMgb3BlcmF0aW9uIHRvIGNvdmVyIHRoZSBjb21iaW5hdGlvbiBvZiBhbmltYXRpb24gdmVyYnMgKHN0eWxlLCBhbmltYXRlLCBncm91cCwgZXRjLi4uKSBhXG4gKiBjb21iaW5hdGlvbiBvZiBwcm90b3R5cGljYWwgaW5oZXJpdGFuY2UsIEFTVCB0cmF2ZXJzYWwgYW5kIG1lcmdlLXNvcnQtbGlrZSBhbGdvcml0aG1zIGFyZSB1c2VkLlxuICpcbiAqIFtBU1QgVHJhdmVyc2FsXVxuICogRWFjaCBvZiB0aGUgYW5pbWF0aW9uIHZlcmJzLCB3aGVuIGV4ZWN1dGVkLCB3aWxsIHJldHVybiBhbiBzdHJpbmctbWFwIG9iamVjdCByZXByZXNlbnRpbmcgd2hhdFxuICogdHlwZSBvZiBhY3Rpb24gaXQgaXMgKHN0eWxlLCBhbmltYXRlLCBncm91cCwgZXRjLi4uKSBhbmQgdGhlIGRhdGEgYXNzb2NpYXRlZCB3aXRoIGl0LiBUaGlzIG1lYW5zXG4gKiB0aGF0IHdoZW4gZnVuY3Rpb25hbCBjb21wb3NpdGlvbiBtaXggb2YgdGhlc2UgZnVuY3Rpb25zIGlzIGV2YWx1YXRlZCAobGlrZSBpbiB0aGUgZXhhbXBsZSBhYm92ZSlcbiAqIHRoZW4gaXQgd2lsbCBlbmQgdXAgcHJvZHVjaW5nIGEgdHJlZSBvZiBvYmplY3RzIHJlcHJlc2VudGluZyB0aGUgYW5pbWF0aW9uIGl0c2VsZi5cbiAqXG4gKiBXaGVuIHRoaXMgYW5pbWF0aW9uIG9iamVjdCB0cmVlIGlzIHByb2Nlc3NlZCBieSB0aGUgdmlzaXRvciBjb2RlIGJlbG93IGl0IHdpbGwgdmlzaXQgZWFjaCBvZiB0aGVcbiAqIHZlcmIgc3RhdGVtZW50cyB3aXRoaW4gdGhlIHZpc2l0b3IuIEFuZCBkdXJpbmcgZWFjaCB2aXNpdCBpdCB3aWxsIGJ1aWxkIHRoZSBjb250ZXh0IG9mIHRoZVxuICogYW5pbWF0aW9uIGtleWZyYW1lcyBieSBpbnRlcmFjdGluZyB3aXRoIHRoZSBgVGltZWxpbmVCdWlsZGVyYC5cbiAqXG4gKiBbVGltZWxpbmVCdWlsZGVyXVxuICogVGhpcyBjbGFzcyBpcyByZXNwb25zaWJsZSBmb3IgdHJhY2tpbmcgdGhlIHN0eWxlcyBhbmQgYnVpbGRpbmcgYSBzZXJpZXMgb2Yga2V5ZnJhbWUgb2JqZWN0cyBmb3IgYVxuICogdGltZWxpbmUgYmV0d2VlbiBhIHN0YXJ0IGFuZCBlbmQgdGltZS4gVGhlIGJ1aWxkZXIgc3RhcnRzIG9mZiB3aXRoIGFuIGluaXRpYWwgdGltZWxpbmUgYW5kIGVhY2hcbiAqIHRpbWUgdGhlIEFTVCBjb21lcyBhY3Jvc3MgYSBgZ3JvdXAoKWAsIGBrZXlmcmFtZXMoKWAgb3IgYSBjb21iaW5hdGlvbiBvZiB0aGUgdHdvIHdpaHRpbiBhXG4gKiBgc2VxdWVuY2UoKWAgdGhlbiBpdCB3aWxsIGdlbmVyYXRlIGEgc3ViIHRpbWVsaW5lIGZvciBlYWNoIHN0ZXAgYXMgd2VsbCBhcyBhIG5ldyBvbmUgYWZ0ZXJcbiAqIHRoZXkgYXJlIGNvbXBsZXRlLlxuICpcbiAqIEFzIHRoZSBBU1QgaXMgdHJhdmVyc2VkLCB0aGUgdGltaW5nIHN0YXRlIG9uIGVhY2ggb2YgdGhlIHRpbWVsaW5lcyB3aWxsIGJlIGluY3JlbWVudGVkLiBJZiBhIHN1YlxuICogdGltZWxpbmUgd2FzIGNyZWF0ZWQgKGJhc2VkIG9uIG9uZSBvZiB0aGUgY2FzZXMgYWJvdmUpIHRoZW4gdGhlIHBhcmVudCB0aW1lbGluZSB3aWxsIGF0dGVtcHQgdG9cbiAqIG1lcmdlIHRoZSBzdHlsZXMgdXNlZCB3aXRoaW4gdGhlIHN1YiB0aW1lbGluZXMgaW50byBpdHNlbGYgKG9ubHkgd2l0aCBncm91cCgpIHRoaXMgd2lsbCBoYXBwZW4pLlxuICogVGhpcyBoYXBwZW5zIHdpdGggYSBtZXJnZSBvcGVyYXRpb24gKG11Y2ggbGlrZSBob3cgdGhlIG1lcmdlIHdvcmtzIGluIG1lcmdlc29ydCkgYW5kIGl0IHdpbGwgb25seVxuICogY29weSB0aGUgbW9zdCByZWNlbnRseSB1c2VkIHN0eWxlcyBmcm9tIHRoZSBzdWIgdGltZWxpbmVzIGludG8gdGhlIHBhcmVudCB0aW1lbGluZS4gVGhpcyBlbnN1cmVzXG4gKiB0aGF0IGlmIHRoZSBzdHlsZXMgYXJlIHVzZWQgbGF0ZXIgb24gaW4gYW5vdGhlciBwaGFzZSBvZiB0aGUgYW5pbWF0aW9uIHRoZW4gdGhleSB3aWxsIGJlIHRoZSBtb3N0XG4gKiB1cC10by1kYXRlIHZhbHVlcy5cbiAqXG4gKiBbSG93IE1pc3NpbmcgU3R5bGVzIEFyZSBVcGRhdGVkXVxuICogRWFjaCB0aW1lbGluZSBoYXMgYSBgYmFja0ZpbGxgIHByb3BlcnR5IHdoaWNoIGlzIHJlc3BvbnNpYmxlIGZvciBmaWxsaW5nIGluIG5ldyBzdHlsZXMgaW50b1xuICogYWxyZWFkeSBwcm9jZXNzZWQga2V5ZnJhbWVzIGlmIGEgbmV3IHN0eWxlIHNob3dzIHVwIGxhdGVyIHdpdGhpbiB0aGUgYW5pbWF0aW9uIHNlcXVlbmNlLlxuICpcbiAqIGBgYFxuICogc2VxdWVuY2UoW1xuICogICBzdHlsZSh7IHdpZHRoOiAwIH0pLFxuICogICBhbmltYXRlKDEwMDAsIHN0eWxlKHsgd2lkdGg6IDEwMCB9KSksXG4gKiAgIGFuaW1hdGUoMTAwMCwgc3R5bGUoeyB3aWR0aDogMjAwIH0pKSxcbiAqICAgYW5pbWF0ZSgxMDAwLCBzdHlsZSh7IHdpZHRoOiAzMDAgfSkpXG4gKiAgIGFuaW1hdGUoMTAwMCwgc3R5bGUoeyB3aWR0aDogNDAwLCBoZWlnaHQ6IDQwMCB9KSkgLy8gbm90aWNlIGhvdyBgaGVpZ2h0YCBkb2Vzbid0IGV4aXN0IGFueXdoZXJlXG4gKiBlbHNlXG4gKiBdKVxuICogYGBgXG4gKlxuICogV2hhdCBpcyBoYXBwZW5pbmcgaGVyZSBpcyB0aGF0IHRoZSBgaGVpZ2h0YCB2YWx1ZSBpcyBhZGRlZCBsYXRlciBpbiB0aGUgc2VxdWVuY2UsIGJ1dCBpcyBtaXNzaW5nXG4gKiBmcm9tIGFsbCBwcmV2aW91cyBhbmltYXRpb24gc3RlcHMuIFRoZXJlZm9yZSB3aGVuIGEga2V5ZnJhbWUgaXMgY3JlYXRlZCBpdCB3b3VsZCBhbHNvIGJlIG1pc3NpbmdcbiAqIGZyb20gYWxsIHByZXZpb3VzIGtleWZyYW1lcyB1cCB1bnRpbCB3aGVyZSBpdCBpcyBmaXJzdCB1c2VkLiBGb3IgdGhlIHRpbWVsaW5lIGtleWZyYW1lIGdlbmVyYXRpb25cbiAqIHRvIHByb3Blcmx5IGZpbGwgaW4gdGhlIHN0eWxlIGl0IHdpbGwgcGxhY2UgdGhlIHByZXZpb3VzIHZhbHVlICh0aGUgdmFsdWUgZnJvbSB0aGUgcGFyZW50XG4gKiB0aW1lbGluZSkgb3IgYSBkZWZhdWx0IHZhbHVlIG9mIGAqYCBpbnRvIHRoZSBiYWNrRmlsbCBvYmplY3QuIEdpdmVuIHRoYXQgZWFjaCBvZiB0aGUga2V5ZnJhbWVcbiAqIHN0eWxlcyBhcmUgb2JqZWN0cyB0aGF0IHByb3RvdHlwaWNhbGx5IGluaGVydCBmcm9tIHRoZSBiYWNrRmlsbCBvYmplY3QsIHRoaXMgbWVhbnMgdGhhdCBpZiBhXG4gKiB2YWx1ZSBpcyBhZGRlZCBpbnRvIHRoZSBiYWNrRmlsbCB0aGVuIGl0IHdpbGwgYXV0b21hdGljYWxseSBwcm9wYWdhdGUgYW55IG1pc3NpbmcgdmFsdWVzIHRvIGFsbFxuICoga2V5ZnJhbWVzLiBUaGVyZWZvcmUgdGhlIG1pc3NpbmcgYGhlaWdodGAgdmFsdWUgd2lsbCBiZSBwcm9wZXJseSBmaWxsZWQgaW50byB0aGUgYWxyZWFkeVxuICogcHJvY2Vzc2VkIGtleWZyYW1lcy5cbiAqXG4gKiBXaGVuIGEgc3ViLXRpbWVsaW5lIGlzIGNyZWF0ZWQgaXQgd2lsbCBoYXZlIGl0cyBvd24gYmFja0ZpbGwgcHJvcGVydHkuIFRoaXMgaXMgZG9uZSBzbyB0aGF0XG4gKiBzdHlsZXMgcHJlc2VudCB3aXRoaW4gdGhlIHN1Yi10aW1lbGluZSBkbyBub3QgYWNjaWRlbnRhbGx5IHNlZXAgaW50byB0aGUgcHJldmlvdXMvZnV0dXJlIHRpbWVsaW5lXG4gKiBrZXlmcmFtZXNcbiAqXG4gKiAoRm9yIHByb3RvdHlwaWNhbGx5LWluaGVyaXRlZCBjb250ZW50cyB0byBiZSBkZXRlY3RlZCBhIGBmb3IoaSBpbiBvYmopYCBsb29wIG11c3QgYmUgdXNlZC4pXG4gKlxuICogW1ZhbGlkYXRpb25dXG4gKiBUaGUgY29kZSBpbiB0aGlzIGZpbGUgaXMgbm90IHJlc3BvbnNpYmxlIGZvciB2YWxpZGF0aW9uLiBUaGF0IGZ1bmN0aW9uYWxpdHkgaGFwcGVucyB3aXRoIHdpdGhpblxuICogdGhlIGBBbmltYXRpb25WYWxpZGF0b3JWaXNpdG9yYCBjb2RlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRBbmltYXRpb25UaW1lbGluZXMoXG4gICAgZHJpdmVyOiBBbmltYXRpb25Ecml2ZXIsIHJvb3RFbGVtZW50OiBhbnksIGFzdDogQXN0PEFuaW1hdGlvbk1ldGFkYXRhVHlwZT4sXG4gICAgZW50ZXJDbGFzc05hbWU6IHN0cmluZywgbGVhdmVDbGFzc05hbWU6IHN0cmluZywgc3RhcnRpbmdTdHlsZXM6IMm1U3R5bGVEYXRhID0ge30sXG4gICAgZmluYWxTdHlsZXM6IMm1U3R5bGVEYXRhID0ge30sIG9wdGlvbnM6IEFuaW1hdGlvbk9wdGlvbnMsXG4gICAgc3ViSW5zdHJ1Y3Rpb25zPzogRWxlbWVudEluc3RydWN0aW9uTWFwLCBlcnJvcnM6IGFueVtdID0gW10pOiBBbmltYXRpb25UaW1lbGluZUluc3RydWN0aW9uW10ge1xuICByZXR1cm4gbmV3IEFuaW1hdGlvblRpbWVsaW5lQnVpbGRlclZpc2l0b3IoKS5idWlsZEtleWZyYW1lcyhcbiAgICAgIGRyaXZlciwgcm9vdEVsZW1lbnQsIGFzdCwgZW50ZXJDbGFzc05hbWUsIGxlYXZlQ2xhc3NOYW1lLCBzdGFydGluZ1N0eWxlcywgZmluYWxTdHlsZXMsXG4gICAgICBvcHRpb25zLCBzdWJJbnN0cnVjdGlvbnMsIGVycm9ycyk7XG59XG5cbmV4cG9ydCBjbGFzcyBBbmltYXRpb25UaW1lbGluZUJ1aWxkZXJWaXNpdG9yIGltcGxlbWVudHMgQXN0VmlzaXRvciB7XG4gIGJ1aWxkS2V5ZnJhbWVzKFxuICAgICAgZHJpdmVyOiBBbmltYXRpb25Ecml2ZXIsIHJvb3RFbGVtZW50OiBhbnksIGFzdDogQXN0PEFuaW1hdGlvbk1ldGFkYXRhVHlwZT4sXG4gICAgICBlbnRlckNsYXNzTmFtZTogc3RyaW5nLCBsZWF2ZUNsYXNzTmFtZTogc3RyaW5nLCBzdGFydGluZ1N0eWxlczogybVTdHlsZURhdGEsXG4gICAgICBmaW5hbFN0eWxlczogybVTdHlsZURhdGEsIG9wdGlvbnM6IEFuaW1hdGlvbk9wdGlvbnMsIHN1Ykluc3RydWN0aW9ucz86IEVsZW1lbnRJbnN0cnVjdGlvbk1hcCxcbiAgICAgIGVycm9yczogYW55W10gPSBbXSk6IEFuaW1hdGlvblRpbWVsaW5lSW5zdHJ1Y3Rpb25bXSB7XG4gICAgc3ViSW5zdHJ1Y3Rpb25zID0gc3ViSW5zdHJ1Y3Rpb25zIHx8IG5ldyBFbGVtZW50SW5zdHJ1Y3Rpb25NYXAoKTtcbiAgICBjb25zdCBjb250ZXh0ID0gbmV3IEFuaW1hdGlvblRpbWVsaW5lQ29udGV4dChcbiAgICAgICAgZHJpdmVyLCByb290RWxlbWVudCwgc3ViSW5zdHJ1Y3Rpb25zLCBlbnRlckNsYXNzTmFtZSwgbGVhdmVDbGFzc05hbWUsIGVycm9ycywgW10pO1xuICAgIGNvbnRleHQub3B0aW9ucyA9IG9wdGlvbnM7XG4gICAgY29udGV4dC5jdXJyZW50VGltZWxpbmUuc2V0U3R5bGVzKFtzdGFydGluZ1N0eWxlc10sIG51bGwsIGNvbnRleHQuZXJyb3JzLCBvcHRpb25zKTtcblxuICAgIHZpc2l0RHNsTm9kZSh0aGlzLCBhc3QsIGNvbnRleHQpO1xuXG4gICAgLy8gdGhpcyBjaGVja3MgdG8gc2VlIGlmIGFuIGFjdHVhbCBhbmltYXRpb24gaGFwcGVuZWRcbiAgICBjb25zdCB0aW1lbGluZXMgPSBjb250ZXh0LnRpbWVsaW5lcy5maWx0ZXIodGltZWxpbmUgPT4gdGltZWxpbmUuY29udGFpbnNBbmltYXRpb24oKSk7XG4gICAgaWYgKHRpbWVsaW5lcy5sZW5ndGggJiYgT2JqZWN0LmtleXMoZmluYWxTdHlsZXMpLmxlbmd0aCkge1xuICAgICAgY29uc3QgdGwgPSB0aW1lbGluZXNbdGltZWxpbmVzLmxlbmd0aCAtIDFdO1xuICAgICAgaWYgKCF0bC5hbGxvd09ubHlUaW1lbGluZVN0eWxlcygpKSB7XG4gICAgICAgIHRsLnNldFN0eWxlcyhbZmluYWxTdHlsZXNdLCBudWxsLCBjb250ZXh0LmVycm9ycywgb3B0aW9ucyk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHRpbWVsaW5lcy5sZW5ndGggPyB0aW1lbGluZXMubWFwKHRpbWVsaW5lID0+IHRpbWVsaW5lLmJ1aWxkS2V5ZnJhbWVzKCkpIDpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFtjcmVhdGVUaW1lbGluZUluc3RydWN0aW9uKHJvb3RFbGVtZW50LCBbXSwgW10sIFtdLCAwLCAwLCAnJywgZmFsc2UpXTtcbiAgfVxuXG4gIHZpc2l0VHJpZ2dlcihhc3Q6IFRyaWdnZXJBc3QsIGNvbnRleHQ6IEFuaW1hdGlvblRpbWVsaW5lQ29udGV4dCk6IGFueSB7XG4gICAgLy8gdGhlc2UgdmFsdWVzIGFyZSBub3QgdmlzaXRlZCBpbiB0aGlzIEFTVFxuICB9XG5cbiAgdmlzaXRTdGF0ZShhc3Q6IFN0YXRlQXN0LCBjb250ZXh0OiBBbmltYXRpb25UaW1lbGluZUNvbnRleHQpOiBhbnkge1xuICAgIC8vIHRoZXNlIHZhbHVlcyBhcmUgbm90IHZpc2l0ZWQgaW4gdGhpcyBBU1RcbiAgfVxuXG4gIHZpc2l0VHJhbnNpdGlvbihhc3Q6IFRyYW5zaXRpb25Bc3QsIGNvbnRleHQ6IEFuaW1hdGlvblRpbWVsaW5lQ29udGV4dCk6IGFueSB7XG4gICAgLy8gdGhlc2UgdmFsdWVzIGFyZSBub3QgdmlzaXRlZCBpbiB0aGlzIEFTVFxuICB9XG5cbiAgdmlzaXRBbmltYXRlQ2hpbGQoYXN0OiBBbmltYXRlQ2hpbGRBc3QsIGNvbnRleHQ6IEFuaW1hdGlvblRpbWVsaW5lQ29udGV4dCk6IGFueSB7XG4gICAgY29uc3QgZWxlbWVudEluc3RydWN0aW9ucyA9IGNvbnRleHQuc3ViSW5zdHJ1Y3Rpb25zLmNvbnN1bWUoY29udGV4dC5lbGVtZW50KTtcbiAgICBpZiAoZWxlbWVudEluc3RydWN0aW9ucykge1xuICAgICAgY29uc3QgaW5uZXJDb250ZXh0ID0gY29udGV4dC5jcmVhdGVTdWJDb250ZXh0KGFzdC5vcHRpb25zKTtcbiAgICAgIGNvbnN0IHN0YXJ0VGltZSA9IGNvbnRleHQuY3VycmVudFRpbWVsaW5lLmN1cnJlbnRUaW1lO1xuICAgICAgY29uc3QgZW5kVGltZSA9IHRoaXMuX3Zpc2l0U3ViSW5zdHJ1Y3Rpb25zKFxuICAgICAgICAgIGVsZW1lbnRJbnN0cnVjdGlvbnMsIGlubmVyQ29udGV4dCwgaW5uZXJDb250ZXh0Lm9wdGlvbnMgYXMgQW5pbWF0ZUNoaWxkT3B0aW9ucyk7XG4gICAgICBpZiAoc3RhcnRUaW1lICE9IGVuZFRpbWUpIHtcbiAgICAgICAgLy8gd2UgZG8gdGhpcyBvbiB0aGUgdXBwZXIgY29udGV4dCBiZWNhdXNlIHdlIGNyZWF0ZWQgYSBzdWIgY29udGV4dCBmb3JcbiAgICAgICAgLy8gdGhlIHN1YiBjaGlsZCBhbmltYXRpb25zXG4gICAgICAgIGNvbnRleHQudHJhbnNmb3JtSW50b05ld1RpbWVsaW5lKGVuZFRpbWUpO1xuICAgICAgfVxuICAgIH1cbiAgICBjb250ZXh0LnByZXZpb3VzTm9kZSA9IGFzdDtcbiAgfVxuXG4gIHZpc2l0QW5pbWF0ZVJlZihhc3Q6IEFuaW1hdGVSZWZBc3QsIGNvbnRleHQ6IEFuaW1hdGlvblRpbWVsaW5lQ29udGV4dCk6IGFueSB7XG4gICAgY29uc3QgaW5uZXJDb250ZXh0ID0gY29udGV4dC5jcmVhdGVTdWJDb250ZXh0KGFzdC5vcHRpb25zKTtcbiAgICBpbm5lckNvbnRleHQudHJhbnNmb3JtSW50b05ld1RpbWVsaW5lKCk7XG4gICAgdGhpcy52aXNpdFJlZmVyZW5jZShhc3QuYW5pbWF0aW9uLCBpbm5lckNvbnRleHQpO1xuICAgIGNvbnRleHQudHJhbnNmb3JtSW50b05ld1RpbWVsaW5lKGlubmVyQ29udGV4dC5jdXJyZW50VGltZWxpbmUuY3VycmVudFRpbWUpO1xuICAgIGNvbnRleHQucHJldmlvdXNOb2RlID0gYXN0O1xuICB9XG5cbiAgcHJpdmF0ZSBfdmlzaXRTdWJJbnN0cnVjdGlvbnMoXG4gICAgICBpbnN0cnVjdGlvbnM6IEFuaW1hdGlvblRpbWVsaW5lSW5zdHJ1Y3Rpb25bXSwgY29udGV4dDogQW5pbWF0aW9uVGltZWxpbmVDb250ZXh0LFxuICAgICAgb3B0aW9uczogQW5pbWF0ZUNoaWxkT3B0aW9ucyk6IG51bWJlciB7XG4gICAgY29uc3Qgc3RhcnRUaW1lID0gY29udGV4dC5jdXJyZW50VGltZWxpbmUuY3VycmVudFRpbWU7XG4gICAgbGV0IGZ1cnRoZXN0VGltZSA9IHN0YXJ0VGltZTtcblxuICAgIC8vIHRoaXMgaXMgYSBzcGVjaWFsLWNhc2UgZm9yIHdoZW4gYSB1c2VyIHdhbnRzIHRvIHNraXAgYSBzdWJcbiAgICAvLyBhbmltYXRpb24gZnJvbSBiZWluZyBmaXJlZCBlbnRpcmVseS5cbiAgICBjb25zdCBkdXJhdGlvbiA9IG9wdGlvbnMuZHVyYXRpb24gIT0gbnVsbCA/IHJlc29sdmVUaW1pbmdWYWx1ZShvcHRpb25zLmR1cmF0aW9uKSA6IG51bGw7XG4gICAgY29uc3QgZGVsYXkgPSBvcHRpb25zLmRlbGF5ICE9IG51bGwgPyByZXNvbHZlVGltaW5nVmFsdWUob3B0aW9ucy5kZWxheSkgOiBudWxsO1xuICAgIGlmIChkdXJhdGlvbiAhPT0gMCkge1xuICAgICAgaW5zdHJ1Y3Rpb25zLmZvckVhY2goaW5zdHJ1Y3Rpb24gPT4ge1xuICAgICAgICBjb25zdCBpbnN0cnVjdGlvblRpbWluZ3MgPVxuICAgICAgICAgICAgY29udGV4dC5hcHBlbmRJbnN0cnVjdGlvblRvVGltZWxpbmUoaW5zdHJ1Y3Rpb24sIGR1cmF0aW9uLCBkZWxheSk7XG4gICAgICAgIGZ1cnRoZXN0VGltZSA9XG4gICAgICAgICAgICBNYXRoLm1heChmdXJ0aGVzdFRpbWUsIGluc3RydWN0aW9uVGltaW5ncy5kdXJhdGlvbiArIGluc3RydWN0aW9uVGltaW5ncy5kZWxheSk7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gZnVydGhlc3RUaW1lO1xuICB9XG5cbiAgdmlzaXRSZWZlcmVuY2UoYXN0OiBSZWZlcmVuY2VBc3QsIGNvbnRleHQ6IEFuaW1hdGlvblRpbWVsaW5lQ29udGV4dCkge1xuICAgIGNvbnRleHQudXBkYXRlT3B0aW9ucyhhc3Qub3B0aW9ucywgdHJ1ZSk7XG4gICAgdmlzaXREc2xOb2RlKHRoaXMsIGFzdC5hbmltYXRpb24sIGNvbnRleHQpO1xuICAgIGNvbnRleHQucHJldmlvdXNOb2RlID0gYXN0O1xuICB9XG5cbiAgdmlzaXRTZXF1ZW5jZShhc3Q6IFNlcXVlbmNlQXN0LCBjb250ZXh0OiBBbmltYXRpb25UaW1lbGluZUNvbnRleHQpIHtcbiAgICBjb25zdCBzdWJDb250ZXh0Q291bnQgPSBjb250ZXh0LnN1YkNvbnRleHRDb3VudDtcbiAgICBsZXQgY3R4ID0gY29udGV4dDtcbiAgICBjb25zdCBvcHRpb25zID0gYXN0Lm9wdGlvbnM7XG5cbiAgICBpZiAob3B0aW9ucyAmJiAob3B0aW9ucy5wYXJhbXMgfHwgb3B0aW9ucy5kZWxheSkpIHtcbiAgICAgIGN0eCA9IGNvbnRleHQuY3JlYXRlU3ViQ29udGV4dChvcHRpb25zKTtcbiAgICAgIGN0eC50cmFuc2Zvcm1JbnRvTmV3VGltZWxpbmUoKTtcblxuICAgICAgaWYgKG9wdGlvbnMuZGVsYXkgIT0gbnVsbCkge1xuICAgICAgICBpZiAoY3R4LnByZXZpb3VzTm9kZS50eXBlID09IEFuaW1hdGlvbk1ldGFkYXRhVHlwZS5TdHlsZSkge1xuICAgICAgICAgIGN0eC5jdXJyZW50VGltZWxpbmUuc25hcHNob3RDdXJyZW50U3R5bGVzKCk7XG4gICAgICAgICAgY3R4LnByZXZpb3VzTm9kZSA9IERFRkFVTFRfTk9PUF9QUkVWSU9VU19OT0RFO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgZGVsYXkgPSByZXNvbHZlVGltaW5nVmFsdWUob3B0aW9ucy5kZWxheSk7XG4gICAgICAgIGN0eC5kZWxheU5leHRTdGVwKGRlbGF5KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoYXN0LnN0ZXBzLmxlbmd0aCkge1xuICAgICAgYXN0LnN0ZXBzLmZvckVhY2gocyA9PiB2aXNpdERzbE5vZGUodGhpcywgcywgY3R4KSk7XG5cbiAgICAgIC8vIHRoaXMgaXMgaGVyZSBqdXN0IGluY2FzZSB0aGUgaW5uZXIgc3RlcHMgb25seSBjb250YWluIG9yIGVuZCB3aXRoIGEgc3R5bGUoKSBjYWxsXG4gICAgICBjdHguY3VycmVudFRpbWVsaW5lLmFwcGx5U3R5bGVzVG9LZXlmcmFtZSgpO1xuXG4gICAgICAvLyB0aGlzIG1lYW5zIHRoYXQgc29tZSBhbmltYXRpb24gZnVuY3Rpb24gd2l0aGluIHRoZSBzZXF1ZW5jZVxuICAgICAgLy8gZW5kZWQgdXAgY3JlYXRpbmcgYSBzdWIgdGltZWxpbmUgKHdoaWNoIG1lYW5zIHRoZSBjdXJyZW50XG4gICAgICAvLyB0aW1lbGluZSBjYW5ub3Qgb3ZlcmxhcCB3aXRoIHRoZSBjb250ZW50cyBvZiB0aGUgc2VxdWVuY2UpXG4gICAgICBpZiAoY3R4LnN1YkNvbnRleHRDb3VudCA+IHN1YkNvbnRleHRDb3VudCkge1xuICAgICAgICBjdHgudHJhbnNmb3JtSW50b05ld1RpbWVsaW5lKCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29udGV4dC5wcmV2aW91c05vZGUgPSBhc3Q7XG4gIH1cblxuICB2aXNpdEdyb3VwKGFzdDogR3JvdXBBc3QsIGNvbnRleHQ6IEFuaW1hdGlvblRpbWVsaW5lQ29udGV4dCkge1xuICAgIGNvbnN0IGlubmVyVGltZWxpbmVzOiBUaW1lbGluZUJ1aWxkZXJbXSA9IFtdO1xuICAgIGxldCBmdXJ0aGVzdFRpbWUgPSBjb250ZXh0LmN1cnJlbnRUaW1lbGluZS5jdXJyZW50VGltZTtcbiAgICBjb25zdCBkZWxheSA9IGFzdC5vcHRpb25zICYmIGFzdC5vcHRpb25zLmRlbGF5ID8gcmVzb2x2ZVRpbWluZ1ZhbHVlKGFzdC5vcHRpb25zLmRlbGF5KSA6IDA7XG5cbiAgICBhc3Quc3RlcHMuZm9yRWFjaChzID0+IHtcbiAgICAgIGNvbnN0IGlubmVyQ29udGV4dCA9IGNvbnRleHQuY3JlYXRlU3ViQ29udGV4dChhc3Qub3B0aW9ucyk7XG4gICAgICBpZiAoZGVsYXkpIHtcbiAgICAgICAgaW5uZXJDb250ZXh0LmRlbGF5TmV4dFN0ZXAoZGVsYXkpO1xuICAgICAgfVxuXG4gICAgICB2aXNpdERzbE5vZGUodGhpcywgcywgaW5uZXJDb250ZXh0KTtcbiAgICAgIGZ1cnRoZXN0VGltZSA9IE1hdGgubWF4KGZ1cnRoZXN0VGltZSwgaW5uZXJDb250ZXh0LmN1cnJlbnRUaW1lbGluZS5jdXJyZW50VGltZSk7XG4gICAgICBpbm5lclRpbWVsaW5lcy5wdXNoKGlubmVyQ29udGV4dC5jdXJyZW50VGltZWxpbmUpO1xuICAgIH0pO1xuXG4gICAgLy8gdGhpcyBvcGVyYXRpb24gaXMgcnVuIGFmdGVyIHRoZSBBU1QgbG9vcCBiZWNhdXNlIG90aGVyd2lzZVxuICAgIC8vIGlmIHRoZSBwYXJlbnQgdGltZWxpbmUncyBjb2xsZWN0ZWQgc3R5bGVzIHdlcmUgdXBkYXRlZCB0aGVuXG4gICAgLy8gaXQgd291bGQgcGFzcyBpbiBpbnZhbGlkIGRhdGEgaW50byB0aGUgbmV3LXRvLWJlIGZvcmtlZCBpdGVtc1xuICAgIGlubmVyVGltZWxpbmVzLmZvckVhY2goXG4gICAgICAgIHRpbWVsaW5lID0+IGNvbnRleHQuY3VycmVudFRpbWVsaW5lLm1lcmdlVGltZWxpbmVDb2xsZWN0ZWRTdHlsZXModGltZWxpbmUpKTtcbiAgICBjb250ZXh0LnRyYW5zZm9ybUludG9OZXdUaW1lbGluZShmdXJ0aGVzdFRpbWUpO1xuICAgIGNvbnRleHQucHJldmlvdXNOb2RlID0gYXN0O1xuICB9XG5cbiAgcHJpdmF0ZSBfdmlzaXRUaW1pbmcoYXN0OiBUaW1pbmdBc3QsIGNvbnRleHQ6IEFuaW1hdGlvblRpbWVsaW5lQ29udGV4dCk6IEFuaW1hdGVUaW1pbmdzIHtcbiAgICBpZiAoKGFzdCBhcyBEeW5hbWljVGltaW5nQXN0KS5keW5hbWljKSB7XG4gICAgICBjb25zdCBzdHJWYWx1ZSA9IChhc3QgYXMgRHluYW1pY1RpbWluZ0FzdCkuc3RyVmFsdWU7XG4gICAgICBjb25zdCB0aW1pbmdWYWx1ZSA9XG4gICAgICAgICAgY29udGV4dC5wYXJhbXMgPyBpbnRlcnBvbGF0ZVBhcmFtcyhzdHJWYWx1ZSwgY29udGV4dC5wYXJhbXMsIGNvbnRleHQuZXJyb3JzKSA6IHN0clZhbHVlO1xuICAgICAgcmV0dXJuIHJlc29sdmVUaW1pbmcodGltaW5nVmFsdWUsIGNvbnRleHQuZXJyb3JzKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHtkdXJhdGlvbjogYXN0LmR1cmF0aW9uLCBkZWxheTogYXN0LmRlbGF5LCBlYXNpbmc6IGFzdC5lYXNpbmd9O1xuICAgIH1cbiAgfVxuXG4gIHZpc2l0QW5pbWF0ZShhc3Q6IEFuaW1hdGVBc3QsIGNvbnRleHQ6IEFuaW1hdGlvblRpbWVsaW5lQ29udGV4dCkge1xuICAgIGNvbnN0IHRpbWluZ3MgPSBjb250ZXh0LmN1cnJlbnRBbmltYXRlVGltaW5ncyA9IHRoaXMuX3Zpc2l0VGltaW5nKGFzdC50aW1pbmdzLCBjb250ZXh0KTtcbiAgICBjb25zdCB0aW1lbGluZSA9IGNvbnRleHQuY3VycmVudFRpbWVsaW5lO1xuICAgIGlmICh0aW1pbmdzLmRlbGF5KSB7XG4gICAgICBjb250ZXh0LmluY3JlbWVudFRpbWUodGltaW5ncy5kZWxheSk7XG4gICAgICB0aW1lbGluZS5zbmFwc2hvdEN1cnJlbnRTdHlsZXMoKTtcbiAgICB9XG5cbiAgICBjb25zdCBzdHlsZSA9IGFzdC5zdHlsZTtcbiAgICBpZiAoc3R5bGUudHlwZSA9PSBBbmltYXRpb25NZXRhZGF0YVR5cGUuS2V5ZnJhbWVzKSB7XG4gICAgICB0aGlzLnZpc2l0S2V5ZnJhbWVzKHN0eWxlLCBjb250ZXh0KTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29udGV4dC5pbmNyZW1lbnRUaW1lKHRpbWluZ3MuZHVyYXRpb24pO1xuICAgICAgdGhpcy52aXNpdFN0eWxlKHN0eWxlIGFzIFN0eWxlQXN0LCBjb250ZXh0KTtcbiAgICAgIHRpbWVsaW5lLmFwcGx5U3R5bGVzVG9LZXlmcmFtZSgpO1xuICAgIH1cblxuICAgIGNvbnRleHQuY3VycmVudEFuaW1hdGVUaW1pbmdzID0gbnVsbDtcbiAgICBjb250ZXh0LnByZXZpb3VzTm9kZSA9IGFzdDtcbiAgfVxuXG4gIHZpc2l0U3R5bGUoYXN0OiBTdHlsZUFzdCwgY29udGV4dDogQW5pbWF0aW9uVGltZWxpbmVDb250ZXh0KSB7XG4gICAgY29uc3QgdGltZWxpbmUgPSBjb250ZXh0LmN1cnJlbnRUaW1lbGluZTtcbiAgICBjb25zdCB0aW1pbmdzID0gY29udGV4dC5jdXJyZW50QW5pbWF0ZVRpbWluZ3MhO1xuXG4gICAgLy8gdGhpcyBpcyBhIHNwZWNpYWwgY2FzZSBmb3Igd2hlbiBhIHN0eWxlKCkgY2FsbFxuICAgIC8vIGRpcmVjdGx5IGZvbGxvd3MgIGFuIGFuaW1hdGUoKSBjYWxsIChidXQgbm90IGluc2lkZSBvZiBhbiBhbmltYXRlKCkgY2FsbClcbiAgICBpZiAoIXRpbWluZ3MgJiYgdGltZWxpbmUuZ2V0Q3VycmVudFN0eWxlUHJvcGVydGllcygpLmxlbmd0aCkge1xuICAgICAgdGltZWxpbmUuZm9yd2FyZEZyYW1lKCk7XG4gICAgfVxuXG4gICAgY29uc3QgZWFzaW5nID0gKHRpbWluZ3MgJiYgdGltaW5ncy5lYXNpbmcpIHx8IGFzdC5lYXNpbmc7XG4gICAgaWYgKGFzdC5pc0VtcHR5U3RlcCkge1xuICAgICAgdGltZWxpbmUuYXBwbHlFbXB0eVN0ZXAoZWFzaW5nKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGltZWxpbmUuc2V0U3R5bGVzKGFzdC5zdHlsZXMsIGVhc2luZywgY29udGV4dC5lcnJvcnMsIGNvbnRleHQub3B0aW9ucyk7XG4gICAgfVxuXG4gICAgY29udGV4dC5wcmV2aW91c05vZGUgPSBhc3Q7XG4gIH1cblxuICB2aXNpdEtleWZyYW1lcyhhc3Q6IEtleWZyYW1lc0FzdCwgY29udGV4dDogQW5pbWF0aW9uVGltZWxpbmVDb250ZXh0KSB7XG4gICAgY29uc3QgY3VycmVudEFuaW1hdGVUaW1pbmdzID0gY29udGV4dC5jdXJyZW50QW5pbWF0ZVRpbWluZ3MhO1xuICAgIGNvbnN0IHN0YXJ0VGltZSA9IChjb250ZXh0LmN1cnJlbnRUaW1lbGluZSEpLmR1cmF0aW9uO1xuICAgIGNvbnN0IGR1cmF0aW9uID0gY3VycmVudEFuaW1hdGVUaW1pbmdzLmR1cmF0aW9uO1xuICAgIGNvbnN0IGlubmVyQ29udGV4dCA9IGNvbnRleHQuY3JlYXRlU3ViQ29udGV4dCgpO1xuICAgIGNvbnN0IGlubmVyVGltZWxpbmUgPSBpbm5lckNvbnRleHQuY3VycmVudFRpbWVsaW5lO1xuICAgIGlubmVyVGltZWxpbmUuZWFzaW5nID0gY3VycmVudEFuaW1hdGVUaW1pbmdzLmVhc2luZztcblxuICAgIGFzdC5zdHlsZXMuZm9yRWFjaChzdGVwID0+IHtcbiAgICAgIGNvbnN0IG9mZnNldDogbnVtYmVyID0gc3RlcC5vZmZzZXQgfHwgMDtcbiAgICAgIGlubmVyVGltZWxpbmUuZm9yd2FyZFRpbWUob2Zmc2V0ICogZHVyYXRpb24pO1xuICAgICAgaW5uZXJUaW1lbGluZS5zZXRTdHlsZXMoc3RlcC5zdHlsZXMsIHN0ZXAuZWFzaW5nLCBjb250ZXh0LmVycm9ycywgY29udGV4dC5vcHRpb25zKTtcbiAgICAgIGlubmVyVGltZWxpbmUuYXBwbHlTdHlsZXNUb0tleWZyYW1lKCk7XG4gICAgfSk7XG5cbiAgICAvLyB0aGlzIHdpbGwgZW5zdXJlIHRoYXQgdGhlIHBhcmVudCB0aW1lbGluZSBnZXRzIGFsbCB0aGUgc3R5bGVzIGZyb21cbiAgICAvLyB0aGUgY2hpbGQgZXZlbiBpZiB0aGUgbmV3IHRpbWVsaW5lIGJlbG93IGlzIG5vdCB1c2VkXG4gICAgY29udGV4dC5jdXJyZW50VGltZWxpbmUubWVyZ2VUaW1lbGluZUNvbGxlY3RlZFN0eWxlcyhpbm5lclRpbWVsaW5lKTtcblxuICAgIC8vIHdlIGRvIHRoaXMgYmVjYXVzZSB0aGUgd2luZG93IGJldHdlZW4gdGhpcyB0aW1lbGluZSBhbmQgdGhlIHN1YiB0aW1lbGluZVxuICAgIC8vIHNob3VsZCBlbnN1cmUgdGhhdCB0aGUgc3R5bGVzIHdpdGhpbiBhcmUgZXhhY3RseSB0aGUgc2FtZSBhcyB0aGV5IHdlcmUgYmVmb3JlXG4gICAgY29udGV4dC50cmFuc2Zvcm1JbnRvTmV3VGltZWxpbmUoc3RhcnRUaW1lICsgZHVyYXRpb24pO1xuICAgIGNvbnRleHQucHJldmlvdXNOb2RlID0gYXN0O1xuICB9XG5cbiAgdmlzaXRRdWVyeShhc3Q6IFF1ZXJ5QXN0LCBjb250ZXh0OiBBbmltYXRpb25UaW1lbGluZUNvbnRleHQpIHtcbiAgICAvLyBpbiB0aGUgZXZlbnQgdGhhdCB0aGUgZmlyc3Qgc3RlcCBiZWZvcmUgdGhpcyBpcyBhIHN0eWxlIHN0ZXAgd2UgbmVlZFxuICAgIC8vIHRvIGVuc3VyZSB0aGUgc3R5bGVzIGFyZSBhcHBsaWVkIGJlZm9yZSB0aGUgY2hpbGRyZW4gYXJlIGFuaW1hdGVkXG4gICAgY29uc3Qgc3RhcnRUaW1lID0gY29udGV4dC5jdXJyZW50VGltZWxpbmUuY3VycmVudFRpbWU7XG4gICAgY29uc3Qgb3B0aW9ucyA9IChhc3Qub3B0aW9ucyB8fCB7fSkgYXMgQW5pbWF0aW9uUXVlcnlPcHRpb25zO1xuICAgIGNvbnN0IGRlbGF5ID0gb3B0aW9ucy5kZWxheSA/IHJlc29sdmVUaW1pbmdWYWx1ZShvcHRpb25zLmRlbGF5KSA6IDA7XG5cbiAgICBpZiAoZGVsYXkgJiZcbiAgICAgICAgKGNvbnRleHQucHJldmlvdXNOb2RlLnR5cGUgPT09IEFuaW1hdGlvbk1ldGFkYXRhVHlwZS5TdHlsZSB8fFxuICAgICAgICAgKHN0YXJ0VGltZSA9PSAwICYmIGNvbnRleHQuY3VycmVudFRpbWVsaW5lLmdldEN1cnJlbnRTdHlsZVByb3BlcnRpZXMoKS5sZW5ndGgpKSkge1xuICAgICAgY29udGV4dC5jdXJyZW50VGltZWxpbmUuc25hcHNob3RDdXJyZW50U3R5bGVzKCk7XG4gICAgICBjb250ZXh0LnByZXZpb3VzTm9kZSA9IERFRkFVTFRfTk9PUF9QUkVWSU9VU19OT0RFO1xuICAgIH1cblxuICAgIGxldCBmdXJ0aGVzdFRpbWUgPSBzdGFydFRpbWU7XG4gICAgY29uc3QgZWxtcyA9IGNvbnRleHQuaW52b2tlUXVlcnkoXG4gICAgICAgIGFzdC5zZWxlY3RvciwgYXN0Lm9yaWdpbmFsU2VsZWN0b3IsIGFzdC5saW1pdCwgYXN0LmluY2x1ZGVTZWxmLFxuICAgICAgICBvcHRpb25zLm9wdGlvbmFsID8gdHJ1ZSA6IGZhbHNlLCBjb250ZXh0LmVycm9ycyk7XG5cbiAgICBjb250ZXh0LmN1cnJlbnRRdWVyeVRvdGFsID0gZWxtcy5sZW5ndGg7XG4gICAgbGV0IHNhbWVFbGVtZW50VGltZWxpbmU6IFRpbWVsaW5lQnVpbGRlcnxudWxsID0gbnVsbDtcbiAgICBlbG1zLmZvckVhY2goKGVsZW1lbnQsIGkpID0+IHtcbiAgICAgIGNvbnRleHQuY3VycmVudFF1ZXJ5SW5kZXggPSBpO1xuICAgICAgY29uc3QgaW5uZXJDb250ZXh0ID0gY29udGV4dC5jcmVhdGVTdWJDb250ZXh0KGFzdC5vcHRpb25zLCBlbGVtZW50KTtcbiAgICAgIGlmIChkZWxheSkge1xuICAgICAgICBpbm5lckNvbnRleHQuZGVsYXlOZXh0U3RlcChkZWxheSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChlbGVtZW50ID09PSBjb250ZXh0LmVsZW1lbnQpIHtcbiAgICAgICAgc2FtZUVsZW1lbnRUaW1lbGluZSA9IGlubmVyQ29udGV4dC5jdXJyZW50VGltZWxpbmU7XG4gICAgICB9XG5cbiAgICAgIHZpc2l0RHNsTm9kZSh0aGlzLCBhc3QuYW5pbWF0aW9uLCBpbm5lckNvbnRleHQpO1xuXG4gICAgICAvLyB0aGlzIGlzIGhlcmUganVzdCBpbmNhc2UgdGhlIGlubmVyIHN0ZXBzIG9ubHkgY29udGFpbiBvciBlbmRcbiAgICAgIC8vIHdpdGggYSBzdHlsZSgpIGNhbGwgKHdoaWNoIGlzIGhlcmUgdG8gc2lnbmFsIHRoYXQgdGhpcyBpcyBhIHByZXBhcmF0b3J5XG4gICAgICAvLyBjYWxsIHRvIHN0eWxlIGFuIGVsZW1lbnQgYmVmb3JlIGl0IGlzIGFuaW1hdGVkIGFnYWluKVxuICAgICAgaW5uZXJDb250ZXh0LmN1cnJlbnRUaW1lbGluZS5hcHBseVN0eWxlc1RvS2V5ZnJhbWUoKTtcblxuICAgICAgY29uc3QgZW5kVGltZSA9IGlubmVyQ29udGV4dC5jdXJyZW50VGltZWxpbmUuY3VycmVudFRpbWU7XG4gICAgICBmdXJ0aGVzdFRpbWUgPSBNYXRoLm1heChmdXJ0aGVzdFRpbWUsIGVuZFRpbWUpO1xuICAgIH0pO1xuXG4gICAgY29udGV4dC5jdXJyZW50UXVlcnlJbmRleCA9IDA7XG4gICAgY29udGV4dC5jdXJyZW50UXVlcnlUb3RhbCA9IDA7XG4gICAgY29udGV4dC50cmFuc2Zvcm1JbnRvTmV3VGltZWxpbmUoZnVydGhlc3RUaW1lKTtcblxuICAgIGlmIChzYW1lRWxlbWVudFRpbWVsaW5lKSB7XG4gICAgICBjb250ZXh0LmN1cnJlbnRUaW1lbGluZS5tZXJnZVRpbWVsaW5lQ29sbGVjdGVkU3R5bGVzKHNhbWVFbGVtZW50VGltZWxpbmUpO1xuICAgICAgY29udGV4dC5jdXJyZW50VGltZWxpbmUuc25hcHNob3RDdXJyZW50U3R5bGVzKCk7XG4gICAgfVxuXG4gICAgY29udGV4dC5wcmV2aW91c05vZGUgPSBhc3Q7XG4gIH1cblxuICB2aXNpdFN0YWdnZXIoYXN0OiBTdGFnZ2VyQXN0LCBjb250ZXh0OiBBbmltYXRpb25UaW1lbGluZUNvbnRleHQpIHtcbiAgICBjb25zdCBwYXJlbnRDb250ZXh0ID0gY29udGV4dC5wYXJlbnRDb250ZXh0ITtcbiAgICBjb25zdCB0bCA9IGNvbnRleHQuY3VycmVudFRpbWVsaW5lO1xuICAgIGNvbnN0IHRpbWluZ3MgPSBhc3QudGltaW5ncztcbiAgICBjb25zdCBkdXJhdGlvbiA9IE1hdGguYWJzKHRpbWluZ3MuZHVyYXRpb24pO1xuICAgIGNvbnN0IG1heFRpbWUgPSBkdXJhdGlvbiAqIChjb250ZXh0LmN1cnJlbnRRdWVyeVRvdGFsIC0gMSk7XG4gICAgbGV0IGRlbGF5ID0gZHVyYXRpb24gKiBjb250ZXh0LmN1cnJlbnRRdWVyeUluZGV4O1xuXG4gICAgbGV0IHN0YWdnZXJUcmFuc2Zvcm1lciA9IHRpbWluZ3MuZHVyYXRpb24gPCAwID8gJ3JldmVyc2UnIDogdGltaW5ncy5lYXNpbmc7XG4gICAgc3dpdGNoIChzdGFnZ2VyVHJhbnNmb3JtZXIpIHtcbiAgICAgIGNhc2UgJ3JldmVyc2UnOlxuICAgICAgICBkZWxheSA9IG1heFRpbWUgLSBkZWxheTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdmdWxsJzpcbiAgICAgICAgZGVsYXkgPSBwYXJlbnRDb250ZXh0LmN1cnJlbnRTdGFnZ2VyVGltZTtcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgY29uc3QgdGltZWxpbmUgPSBjb250ZXh0LmN1cnJlbnRUaW1lbGluZTtcbiAgICBpZiAoZGVsYXkpIHtcbiAgICAgIHRpbWVsaW5lLmRlbGF5TmV4dFN0ZXAoZGVsYXkpO1xuICAgIH1cblxuICAgIGNvbnN0IHN0YXJ0aW5nVGltZSA9IHRpbWVsaW5lLmN1cnJlbnRUaW1lO1xuICAgIHZpc2l0RHNsTm9kZSh0aGlzLCBhc3QuYW5pbWF0aW9uLCBjb250ZXh0KTtcbiAgICBjb250ZXh0LnByZXZpb3VzTm9kZSA9IGFzdDtcblxuICAgIC8vIHRpbWUgPSBkdXJhdGlvbiArIGRlbGF5XG4gICAgLy8gdGhlIHJlYXNvbiB3aHkgdGhpcyBjb21wdXRhdGlvbiBpcyBzbyBjb21wbGV4IGlzIGJlY2F1c2VcbiAgICAvLyB0aGUgaW5uZXIgdGltZWxpbmUgbWF5IGVpdGhlciBoYXZlIGEgZGVsYXkgdmFsdWUgb3IgYSBzdHJldGNoZWRcbiAgICAvLyBrZXlmcmFtZSBkZXBlbmRpbmcgb24gaWYgYSBzdWJ0aW1lbGluZSBpcyBub3QgdXNlZCBvciBpcyB1c2VkLlxuICAgIHBhcmVudENvbnRleHQuY3VycmVudFN0YWdnZXJUaW1lID1cbiAgICAgICAgKHRsLmN1cnJlbnRUaW1lIC0gc3RhcnRpbmdUaW1lKSArICh0bC5zdGFydFRpbWUgLSBwYXJlbnRDb250ZXh0LmN1cnJlbnRUaW1lbGluZS5zdGFydFRpbWUpO1xuICB9XG59XG5cbmV4cG9ydCBkZWNsYXJlIHR5cGUgU3R5bGVBdFRpbWUgPSB7XG4gIHRpbWU6IG51bWJlcjsgdmFsdWU6IHN0cmluZyB8IG51bWJlcjtcbn07XG5cbmNvbnN0IERFRkFVTFRfTk9PUF9QUkVWSU9VU19OT0RFID0gPEFzdDxBbmltYXRpb25NZXRhZGF0YVR5cGU+Pnt9O1xuZXhwb3J0IGNsYXNzIEFuaW1hdGlvblRpbWVsaW5lQ29udGV4dCB7XG4gIHB1YmxpYyBwYXJlbnRDb250ZXh0OiBBbmltYXRpb25UaW1lbGluZUNvbnRleHR8bnVsbCA9IG51bGw7XG4gIHB1YmxpYyBjdXJyZW50VGltZWxpbmU6IFRpbWVsaW5lQnVpbGRlcjtcbiAgcHVibGljIGN1cnJlbnRBbmltYXRlVGltaW5nczogQW5pbWF0ZVRpbWluZ3N8bnVsbCA9IG51bGw7XG4gIHB1YmxpYyBwcmV2aW91c05vZGU6IEFzdDxBbmltYXRpb25NZXRhZGF0YVR5cGU+ID0gREVGQVVMVF9OT09QX1BSRVZJT1VTX05PREU7XG4gIHB1YmxpYyBzdWJDb250ZXh0Q291bnQgPSAwO1xuICBwdWJsaWMgb3B0aW9uczogQW5pbWF0aW9uT3B0aW9ucyA9IHt9O1xuICBwdWJsaWMgY3VycmVudFF1ZXJ5SW5kZXg6IG51bWJlciA9IDA7XG4gIHB1YmxpYyBjdXJyZW50UXVlcnlUb3RhbDogbnVtYmVyID0gMDtcbiAgcHVibGljIGN1cnJlbnRTdGFnZ2VyVGltZTogbnVtYmVyID0gMDtcblxuICBjb25zdHJ1Y3RvcihcbiAgICAgIHByaXZhdGUgX2RyaXZlcjogQW5pbWF0aW9uRHJpdmVyLCBwdWJsaWMgZWxlbWVudDogYW55LFxuICAgICAgcHVibGljIHN1Ykluc3RydWN0aW9uczogRWxlbWVudEluc3RydWN0aW9uTWFwLCBwcml2YXRlIF9lbnRlckNsYXNzTmFtZTogc3RyaW5nLFxuICAgICAgcHJpdmF0ZSBfbGVhdmVDbGFzc05hbWU6IHN0cmluZywgcHVibGljIGVycm9yczogYW55W10sIHB1YmxpYyB0aW1lbGluZXM6IFRpbWVsaW5lQnVpbGRlcltdLFxuICAgICAgaW5pdGlhbFRpbWVsaW5lPzogVGltZWxpbmVCdWlsZGVyKSB7XG4gICAgdGhpcy5jdXJyZW50VGltZWxpbmUgPSBpbml0aWFsVGltZWxpbmUgfHwgbmV3IFRpbWVsaW5lQnVpbGRlcih0aGlzLl9kcml2ZXIsIGVsZW1lbnQsIDApO1xuICAgIHRpbWVsaW5lcy5wdXNoKHRoaXMuY3VycmVudFRpbWVsaW5lKTtcbiAgfVxuXG4gIGdldCBwYXJhbXMoKSB7XG4gICAgcmV0dXJuIHRoaXMub3B0aW9ucy5wYXJhbXM7XG4gIH1cblxuICB1cGRhdGVPcHRpb25zKG9wdGlvbnM6IEFuaW1hdGlvbk9wdGlvbnN8bnVsbCwgc2tpcElmRXhpc3RzPzogYm9vbGVhbikge1xuICAgIGlmICghb3B0aW9ucykgcmV0dXJuO1xuXG4gICAgY29uc3QgbmV3T3B0aW9ucyA9IG9wdGlvbnMgYXMgYW55O1xuICAgIGxldCBvcHRpb25zVG9VcGRhdGUgPSB0aGlzLm9wdGlvbnM7XG5cbiAgICAvLyBOT1RFOiB0aGlzIHdpbGwgZ2V0IHBhdGNoZWQgdXAgd2hlbiBvdGhlciBhbmltYXRpb24gbWV0aG9kcyBzdXBwb3J0IGR1cmF0aW9uIG92ZXJyaWRlc1xuICAgIGlmIChuZXdPcHRpb25zLmR1cmF0aW9uICE9IG51bGwpIHtcbiAgICAgIChvcHRpb25zVG9VcGRhdGUgYXMgYW55KS5kdXJhdGlvbiA9IHJlc29sdmVUaW1pbmdWYWx1ZShuZXdPcHRpb25zLmR1cmF0aW9uKTtcbiAgICB9XG5cbiAgICBpZiAobmV3T3B0aW9ucy5kZWxheSAhPSBudWxsKSB7XG4gICAgICBvcHRpb25zVG9VcGRhdGUuZGVsYXkgPSByZXNvbHZlVGltaW5nVmFsdWUobmV3T3B0aW9ucy5kZWxheSk7XG4gICAgfVxuXG4gICAgY29uc3QgbmV3UGFyYW1zID0gbmV3T3B0aW9ucy5wYXJhbXM7XG4gICAgaWYgKG5ld1BhcmFtcykge1xuICAgICAgbGV0IHBhcmFtc1RvVXBkYXRlOiB7W25hbWU6IHN0cmluZ106IGFueX0gPSBvcHRpb25zVG9VcGRhdGUucGFyYW1zITtcbiAgICAgIGlmICghcGFyYW1zVG9VcGRhdGUpIHtcbiAgICAgICAgcGFyYW1zVG9VcGRhdGUgPSB0aGlzLm9wdGlvbnMucGFyYW1zID0ge307XG4gICAgICB9XG5cbiAgICAgIE9iamVjdC5rZXlzKG5ld1BhcmFtcykuZm9yRWFjaChuYW1lID0+IHtcbiAgICAgICAgaWYgKCFza2lwSWZFeGlzdHMgfHwgIXBhcmFtc1RvVXBkYXRlLmhhc093blByb3BlcnR5KG5hbWUpKSB7XG4gICAgICAgICAgcGFyYW1zVG9VcGRhdGVbbmFtZV0gPSBpbnRlcnBvbGF0ZVBhcmFtcyhuZXdQYXJhbXNbbmFtZV0sIHBhcmFtc1RvVXBkYXRlLCB0aGlzLmVycm9ycyk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgX2NvcHlPcHRpb25zKCkge1xuICAgIGNvbnN0IG9wdGlvbnM6IEFuaW1hdGlvbk9wdGlvbnMgPSB7fTtcbiAgICBpZiAodGhpcy5vcHRpb25zKSB7XG4gICAgICBjb25zdCBvbGRQYXJhbXMgPSB0aGlzLm9wdGlvbnMucGFyYW1zO1xuICAgICAgaWYgKG9sZFBhcmFtcykge1xuICAgICAgICBjb25zdCBwYXJhbXM6IHtbbmFtZTogc3RyaW5nXTogYW55fSA9IG9wdGlvbnNbJ3BhcmFtcyddID0ge307XG4gICAgICAgIE9iamVjdC5rZXlzKG9sZFBhcmFtcykuZm9yRWFjaChuYW1lID0+IHtcbiAgICAgICAgICBwYXJhbXNbbmFtZV0gPSBvbGRQYXJhbXNbbmFtZV07XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gb3B0aW9ucztcbiAgfVxuXG4gIGNyZWF0ZVN1YkNvbnRleHQob3B0aW9uczogQW5pbWF0aW9uT3B0aW9uc3xudWxsID0gbnVsbCwgZWxlbWVudD86IGFueSwgbmV3VGltZT86IG51bWJlcik6XG4gICAgICBBbmltYXRpb25UaW1lbGluZUNvbnRleHQge1xuICAgIGNvbnN0IHRhcmdldCA9IGVsZW1lbnQgfHwgdGhpcy5lbGVtZW50O1xuICAgIGNvbnN0IGNvbnRleHQgPSBuZXcgQW5pbWF0aW9uVGltZWxpbmVDb250ZXh0KFxuICAgICAgICB0aGlzLl9kcml2ZXIsIHRhcmdldCwgdGhpcy5zdWJJbnN0cnVjdGlvbnMsIHRoaXMuX2VudGVyQ2xhc3NOYW1lLCB0aGlzLl9sZWF2ZUNsYXNzTmFtZSxcbiAgICAgICAgdGhpcy5lcnJvcnMsIHRoaXMudGltZWxpbmVzLCB0aGlzLmN1cnJlbnRUaW1lbGluZS5mb3JrKHRhcmdldCwgbmV3VGltZSB8fCAwKSk7XG4gICAgY29udGV4dC5wcmV2aW91c05vZGUgPSB0aGlzLnByZXZpb3VzTm9kZTtcbiAgICBjb250ZXh0LmN1cnJlbnRBbmltYXRlVGltaW5ncyA9IHRoaXMuY3VycmVudEFuaW1hdGVUaW1pbmdzO1xuXG4gICAgY29udGV4dC5vcHRpb25zID0gdGhpcy5fY29weU9wdGlvbnMoKTtcbiAgICBjb250ZXh0LnVwZGF0ZU9wdGlvbnMob3B0aW9ucyk7XG5cbiAgICBjb250ZXh0LmN1cnJlbnRRdWVyeUluZGV4ID0gdGhpcy5jdXJyZW50UXVlcnlJbmRleDtcbiAgICBjb250ZXh0LmN1cnJlbnRRdWVyeVRvdGFsID0gdGhpcy5jdXJyZW50UXVlcnlUb3RhbDtcbiAgICBjb250ZXh0LnBhcmVudENvbnRleHQgPSB0aGlzO1xuICAgIHRoaXMuc3ViQ29udGV4dENvdW50Kys7XG4gICAgcmV0dXJuIGNvbnRleHQ7XG4gIH1cblxuICB0cmFuc2Zvcm1JbnRvTmV3VGltZWxpbmUobmV3VGltZT86IG51bWJlcikge1xuICAgIHRoaXMucHJldmlvdXNOb2RlID0gREVGQVVMVF9OT09QX1BSRVZJT1VTX05PREU7XG4gICAgdGhpcy5jdXJyZW50VGltZWxpbmUgPSB0aGlzLmN1cnJlbnRUaW1lbGluZS5mb3JrKHRoaXMuZWxlbWVudCwgbmV3VGltZSk7XG4gICAgdGhpcy50aW1lbGluZXMucHVzaCh0aGlzLmN1cnJlbnRUaW1lbGluZSk7XG4gICAgcmV0dXJuIHRoaXMuY3VycmVudFRpbWVsaW5lO1xuICB9XG5cbiAgYXBwZW5kSW5zdHJ1Y3Rpb25Ub1RpbWVsaW5lKFxuICAgICAgaW5zdHJ1Y3Rpb246IEFuaW1hdGlvblRpbWVsaW5lSW5zdHJ1Y3Rpb24sIGR1cmF0aW9uOiBudW1iZXJ8bnVsbCxcbiAgICAgIGRlbGF5OiBudW1iZXJ8bnVsbCk6IEFuaW1hdGVUaW1pbmdzIHtcbiAgICBjb25zdCB1cGRhdGVkVGltaW5nczogQW5pbWF0ZVRpbWluZ3MgPSB7XG4gICAgICBkdXJhdGlvbjogZHVyYXRpb24gIT0gbnVsbCA/IGR1cmF0aW9uIDogaW5zdHJ1Y3Rpb24uZHVyYXRpb24sXG4gICAgICBkZWxheTogdGhpcy5jdXJyZW50VGltZWxpbmUuY3VycmVudFRpbWUgKyAoZGVsYXkgIT0gbnVsbCA/IGRlbGF5IDogMCkgKyBpbnN0cnVjdGlvbi5kZWxheSxcbiAgICAgIGVhc2luZzogJydcbiAgICB9O1xuICAgIGNvbnN0IGJ1aWxkZXIgPSBuZXcgU3ViVGltZWxpbmVCdWlsZGVyKFxuICAgICAgICB0aGlzLl9kcml2ZXIsIGluc3RydWN0aW9uLmVsZW1lbnQsIGluc3RydWN0aW9uLmtleWZyYW1lcywgaW5zdHJ1Y3Rpb24ucHJlU3R5bGVQcm9wcyxcbiAgICAgICAgaW5zdHJ1Y3Rpb24ucG9zdFN0eWxlUHJvcHMsIHVwZGF0ZWRUaW1pbmdzLCBpbnN0cnVjdGlvbi5zdHJldGNoU3RhcnRpbmdLZXlmcmFtZSk7XG4gICAgdGhpcy50aW1lbGluZXMucHVzaChidWlsZGVyKTtcbiAgICByZXR1cm4gdXBkYXRlZFRpbWluZ3M7XG4gIH1cblxuICBpbmNyZW1lbnRUaW1lKHRpbWU6IG51bWJlcikge1xuICAgIHRoaXMuY3VycmVudFRpbWVsaW5lLmZvcndhcmRUaW1lKHRoaXMuY3VycmVudFRpbWVsaW5lLmR1cmF0aW9uICsgdGltZSk7XG4gIH1cblxuICBkZWxheU5leHRTdGVwKGRlbGF5OiBudW1iZXIpIHtcbiAgICAvLyBuZWdhdGl2ZSBkZWxheXMgYXJlIG5vdCB5ZXQgc3VwcG9ydGVkXG4gICAgaWYgKGRlbGF5ID4gMCkge1xuICAgICAgdGhpcy5jdXJyZW50VGltZWxpbmUuZGVsYXlOZXh0U3RlcChkZWxheSk7XG4gICAgfVxuICB9XG5cbiAgaW52b2tlUXVlcnkoXG4gICAgICBzZWxlY3Rvcjogc3RyaW5nLCBvcmlnaW5hbFNlbGVjdG9yOiBzdHJpbmcsIGxpbWl0OiBudW1iZXIsIGluY2x1ZGVTZWxmOiBib29sZWFuLFxuICAgICAgb3B0aW9uYWw6IGJvb2xlYW4sIGVycm9yczogYW55W10pOiBhbnlbXSB7XG4gICAgbGV0IHJlc3VsdHM6IGFueVtdID0gW107XG4gICAgaWYgKGluY2x1ZGVTZWxmKSB7XG4gICAgICByZXN1bHRzLnB1c2godGhpcy5lbGVtZW50KTtcbiAgICB9XG4gICAgaWYgKHNlbGVjdG9yLmxlbmd0aCA+IDApIHsgIC8vIGlmIDpzZWxmIGlzIG9ubHkgdXNlZCB0aGVuIHRoZSBzZWxlY3RvciBpcyBlbXB0eVxuICAgICAgc2VsZWN0b3IgPSBzZWxlY3Rvci5yZXBsYWNlKEVOVEVSX1RPS0VOX1JFR0VYLCAnLicgKyB0aGlzLl9lbnRlckNsYXNzTmFtZSk7XG4gICAgICBzZWxlY3RvciA9IHNlbGVjdG9yLnJlcGxhY2UoTEVBVkVfVE9LRU5fUkVHRVgsICcuJyArIHRoaXMuX2xlYXZlQ2xhc3NOYW1lKTtcbiAgICAgIGNvbnN0IG11bHRpID0gbGltaXQgIT0gMTtcbiAgICAgIGxldCBlbGVtZW50cyA9IHRoaXMuX2RyaXZlci5xdWVyeSh0aGlzLmVsZW1lbnQsIHNlbGVjdG9yLCBtdWx0aSk7XG4gICAgICBpZiAobGltaXQgIT09IDApIHtcbiAgICAgICAgZWxlbWVudHMgPSBsaW1pdCA8IDAgPyBlbGVtZW50cy5zbGljZShlbGVtZW50cy5sZW5ndGggKyBsaW1pdCwgZWxlbWVudHMubGVuZ3RoKSA6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxlbWVudHMuc2xpY2UoMCwgbGltaXQpO1xuICAgICAgfVxuICAgICAgcmVzdWx0cy5wdXNoKC4uLmVsZW1lbnRzKTtcbiAgICB9XG5cbiAgICBpZiAoIW9wdGlvbmFsICYmIHJlc3VsdHMubGVuZ3RoID09IDApIHtcbiAgICAgIGVycm9ycy5wdXNoKGBcXGBxdWVyeShcIiR7b3JpZ2luYWxTZWxlY3Rvcn1cIilcXGAgcmV0dXJuZWQgemVybyBlbGVtZW50cy4gKFVzZSBcXGBxdWVyeShcIiR7XG4gICAgICAgICAgb3JpZ2luYWxTZWxlY3Rvcn1cIiwgeyBvcHRpb25hbDogdHJ1ZSB9KVxcYCBpZiB5b3Ugd2lzaCB0byBhbGxvdyB0aGlzLilgKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdHM7XG4gIH1cbn1cblxuXG5leHBvcnQgY2xhc3MgVGltZWxpbmVCdWlsZGVyIHtcbiAgcHVibGljIGR1cmF0aW9uOiBudW1iZXIgPSAwO1xuICAvLyBUT0RPKGlzc3VlLzI0NTcxKTogcmVtb3ZlICchJy5cbiAgcHVibGljIGVhc2luZyE6IHN0cmluZ3xudWxsO1xuICBwcml2YXRlIF9wcmV2aW91c0tleWZyYW1lOiDJtVN0eWxlRGF0YSA9IHt9O1xuICBwcml2YXRlIF9jdXJyZW50S2V5ZnJhbWU6IMm1U3R5bGVEYXRhID0ge307XG4gIHByaXZhdGUgX2tleWZyYW1lcyA9IG5ldyBNYXA8bnVtYmVyLCDJtVN0eWxlRGF0YT4oKTtcbiAgcHJpdmF0ZSBfc3R5bGVTdW1tYXJ5OiB7W3Byb3A6IHN0cmluZ106IFN0eWxlQXRUaW1lfSA9IHt9O1xuICBwcml2YXRlIF9sb2NhbFRpbWVsaW5lU3R5bGVzOiDJtVN0eWxlRGF0YTtcbiAgcHJpdmF0ZSBfZ2xvYmFsVGltZWxpbmVTdHlsZXM6IMm1U3R5bGVEYXRhO1xuICBwcml2YXRlIF9wZW5kaW5nU3R5bGVzOiDJtVN0eWxlRGF0YSA9IHt9O1xuICBwcml2YXRlIF9iYWNrRmlsbDogybVTdHlsZURhdGEgPSB7fTtcbiAgcHJpdmF0ZSBfY3VycmVudEVtcHR5U3RlcEtleWZyYW1lOiDJtVN0eWxlRGF0YXxudWxsID0gbnVsbDtcblxuICBjb25zdHJ1Y3RvcihcbiAgICAgIHByaXZhdGUgX2RyaXZlcjogQW5pbWF0aW9uRHJpdmVyLCBwdWJsaWMgZWxlbWVudDogYW55LCBwdWJsaWMgc3RhcnRUaW1lOiBudW1iZXIsXG4gICAgICBwcml2YXRlIF9lbGVtZW50VGltZWxpbmVTdHlsZXNMb29rdXA/OiBNYXA8YW55LCDJtVN0eWxlRGF0YT4pIHtcbiAgICBpZiAoIXRoaXMuX2VsZW1lbnRUaW1lbGluZVN0eWxlc0xvb2t1cCkge1xuICAgICAgdGhpcy5fZWxlbWVudFRpbWVsaW5lU3R5bGVzTG9va3VwID0gbmV3IE1hcDxhbnksIMm1U3R5bGVEYXRhPigpO1xuICAgIH1cblxuICAgIHRoaXMuX2xvY2FsVGltZWxpbmVTdHlsZXMgPSBPYmplY3QuY3JlYXRlKHRoaXMuX2JhY2tGaWxsLCB7fSk7XG4gICAgdGhpcy5fZ2xvYmFsVGltZWxpbmVTdHlsZXMgPSB0aGlzLl9lbGVtZW50VGltZWxpbmVTdHlsZXNMb29rdXAuZ2V0KGVsZW1lbnQpITtcbiAgICBpZiAoIXRoaXMuX2dsb2JhbFRpbWVsaW5lU3R5bGVzKSB7XG4gICAgICB0aGlzLl9nbG9iYWxUaW1lbGluZVN0eWxlcyA9IHRoaXMuX2xvY2FsVGltZWxpbmVTdHlsZXM7XG4gICAgICB0aGlzLl9lbGVtZW50VGltZWxpbmVTdHlsZXNMb29rdXAuc2V0KGVsZW1lbnQsIHRoaXMuX2xvY2FsVGltZWxpbmVTdHlsZXMpO1xuICAgIH1cbiAgICB0aGlzLl9sb2FkS2V5ZnJhbWUoKTtcbiAgfVxuXG4gIGNvbnRhaW5zQW5pbWF0aW9uKCk6IGJvb2xlYW4ge1xuICAgIHN3aXRjaCAodGhpcy5fa2V5ZnJhbWVzLnNpemUpIHtcbiAgICAgIGNhc2UgMDpcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgY2FzZSAxOlxuICAgICAgICByZXR1cm4gdGhpcy5nZXRDdXJyZW50U3R5bGVQcm9wZXJ0aWVzKCkubGVuZ3RoID4gMDtcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgfVxuXG4gIGdldEN1cnJlbnRTdHlsZVByb3BlcnRpZXMoKTogc3RyaW5nW10ge1xuICAgIHJldHVybiBPYmplY3Qua2V5cyh0aGlzLl9jdXJyZW50S2V5ZnJhbWUpO1xuICB9XG5cbiAgZ2V0IGN1cnJlbnRUaW1lKCkge1xuICAgIHJldHVybiB0aGlzLnN0YXJ0VGltZSArIHRoaXMuZHVyYXRpb247XG4gIH1cblxuICBkZWxheU5leHRTdGVwKGRlbGF5OiBudW1iZXIpIHtcbiAgICAvLyBpbiB0aGUgZXZlbnQgdGhhdCBhIHN0eWxlKCkgc3RlcCBpcyBwbGFjZWQgcmlnaHQgYmVmb3JlIGEgc3RhZ2dlcigpXG4gICAgLy8gYW5kIHRoYXQgc3R5bGUoKSBzdGVwIGlzIHRoZSB2ZXJ5IGZpcnN0IHN0eWxlKCkgdmFsdWUgaW4gdGhlIGFuaW1hdGlvblxuICAgIC8vIHRoZW4gd2UgbmVlZCB0byBtYWtlIGEgY29weSBvZiB0aGUga2V5ZnJhbWUgWzAsIGNvcHksIDFdIHNvIHRoYXQgdGhlIGRlbGF5XG4gICAgLy8gcHJvcGVybHkgYXBwbGllcyB0aGUgc3R5bGUoKSB2YWx1ZXMgdG8gd29yayB3aXRoIHRoZSBzdGFnZ2VyLi4uXG4gICAgY29uc3QgaGFzUHJlU3R5bGVTdGVwID0gdGhpcy5fa2V5ZnJhbWVzLnNpemUgPT0gMSAmJiBPYmplY3Qua2V5cyh0aGlzLl9wZW5kaW5nU3R5bGVzKS5sZW5ndGg7XG5cbiAgICBpZiAodGhpcy5kdXJhdGlvbiB8fCBoYXNQcmVTdHlsZVN0ZXApIHtcbiAgICAgIHRoaXMuZm9yd2FyZFRpbWUodGhpcy5jdXJyZW50VGltZSArIGRlbGF5KTtcbiAgICAgIGlmIChoYXNQcmVTdHlsZVN0ZXApIHtcbiAgICAgICAgdGhpcy5zbmFwc2hvdEN1cnJlbnRTdHlsZXMoKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5zdGFydFRpbWUgKz0gZGVsYXk7XG4gICAgfVxuICB9XG5cbiAgZm9yayhlbGVtZW50OiBhbnksIGN1cnJlbnRUaW1lPzogbnVtYmVyKTogVGltZWxpbmVCdWlsZGVyIHtcbiAgICB0aGlzLmFwcGx5U3R5bGVzVG9LZXlmcmFtZSgpO1xuICAgIHJldHVybiBuZXcgVGltZWxpbmVCdWlsZGVyKFxuICAgICAgICB0aGlzLl9kcml2ZXIsIGVsZW1lbnQsIGN1cnJlbnRUaW1lIHx8IHRoaXMuY3VycmVudFRpbWUsIHRoaXMuX2VsZW1lbnRUaW1lbGluZVN0eWxlc0xvb2t1cCk7XG4gIH1cblxuICBwcml2YXRlIF9sb2FkS2V5ZnJhbWUoKSB7XG4gICAgaWYgKHRoaXMuX2N1cnJlbnRLZXlmcmFtZSkge1xuICAgICAgdGhpcy5fcHJldmlvdXNLZXlmcmFtZSA9IHRoaXMuX2N1cnJlbnRLZXlmcmFtZTtcbiAgICB9XG4gICAgdGhpcy5fY3VycmVudEtleWZyYW1lID0gdGhpcy5fa2V5ZnJhbWVzLmdldCh0aGlzLmR1cmF0aW9uKSE7XG4gICAgaWYgKCF0aGlzLl9jdXJyZW50S2V5ZnJhbWUpIHtcbiAgICAgIHRoaXMuX2N1cnJlbnRLZXlmcmFtZSA9IE9iamVjdC5jcmVhdGUodGhpcy5fYmFja0ZpbGwsIHt9KTtcbiAgICAgIHRoaXMuX2tleWZyYW1lcy5zZXQodGhpcy5kdXJhdGlvbiwgdGhpcy5fY3VycmVudEtleWZyYW1lKTtcbiAgICB9XG4gIH1cblxuICBmb3J3YXJkRnJhbWUoKSB7XG4gICAgdGhpcy5kdXJhdGlvbiArPSBPTkVfRlJBTUVfSU5fTUlMTElTRUNPTkRTO1xuICAgIHRoaXMuX2xvYWRLZXlmcmFtZSgpO1xuICB9XG5cbiAgZm9yd2FyZFRpbWUodGltZTogbnVtYmVyKSB7XG4gICAgdGhpcy5hcHBseVN0eWxlc1RvS2V5ZnJhbWUoKTtcbiAgICB0aGlzLmR1cmF0aW9uID0gdGltZTtcbiAgICB0aGlzLl9sb2FkS2V5ZnJhbWUoKTtcbiAgfVxuXG4gIHByaXZhdGUgX3VwZGF0ZVN0eWxlKHByb3A6IHN0cmluZywgdmFsdWU6IHN0cmluZ3xudW1iZXIpIHtcbiAgICB0aGlzLl9sb2NhbFRpbWVsaW5lU3R5bGVzW3Byb3BdID0gdmFsdWU7XG4gICAgdGhpcy5fZ2xvYmFsVGltZWxpbmVTdHlsZXNbcHJvcF0gPSB2YWx1ZTtcbiAgICB0aGlzLl9zdHlsZVN1bW1hcnlbcHJvcF0gPSB7dGltZTogdGhpcy5jdXJyZW50VGltZSwgdmFsdWV9O1xuICB9XG5cbiAgYWxsb3dPbmx5VGltZWxpbmVTdHlsZXMoKSB7XG4gICAgcmV0dXJuIHRoaXMuX2N1cnJlbnRFbXB0eVN0ZXBLZXlmcmFtZSAhPT0gdGhpcy5fY3VycmVudEtleWZyYW1lO1xuICB9XG5cbiAgYXBwbHlFbXB0eVN0ZXAoZWFzaW5nOiBzdHJpbmd8bnVsbCkge1xuICAgIGlmIChlYXNpbmcpIHtcbiAgICAgIHRoaXMuX3ByZXZpb3VzS2V5ZnJhbWVbJ2Vhc2luZyddID0gZWFzaW5nO1xuICAgIH1cblxuICAgIC8vIHNwZWNpYWwgY2FzZSBmb3IgYW5pbWF0ZShkdXJhdGlvbik6XG4gICAgLy8gYWxsIG1pc3Npbmcgc3R5bGVzIGFyZSBmaWxsZWQgd2l0aCBhIGAqYCB2YWx1ZSB0aGVuXG4gICAgLy8gaWYgYW55IGRlc3RpbmF0aW9uIHN0eWxlcyBhcmUgZmlsbGVkIGluIGxhdGVyIG9uIHRoZSBzYW1lXG4gICAgLy8ga2V5ZnJhbWUgdGhlbiB0aGV5IHdpbGwgb3ZlcnJpZGUgdGhlIG92ZXJyaWRkZW4gc3R5bGVzXG4gICAgLy8gV2UgdXNlIGBfZ2xvYmFsVGltZWxpbmVTdHlsZXNgIGhlcmUgYmVjYXVzZSB0aGVyZSBtYXkgYmVcbiAgICAvLyBzdHlsZXMgaW4gcHJldmlvdXMga2V5ZnJhbWVzIHRoYXQgYXJlIG5vdCBwcmVzZW50IGluIHRoaXMgdGltZWxpbmVcbiAgICBPYmplY3Qua2V5cyh0aGlzLl9nbG9iYWxUaW1lbGluZVN0eWxlcykuZm9yRWFjaChwcm9wID0+IHtcbiAgICAgIHRoaXMuX2JhY2tGaWxsW3Byb3BdID0gdGhpcy5fZ2xvYmFsVGltZWxpbmVTdHlsZXNbcHJvcF0gfHwgQVVUT19TVFlMRTtcbiAgICAgIHRoaXMuX2N1cnJlbnRLZXlmcmFtZVtwcm9wXSA9IEFVVE9fU1RZTEU7XG4gICAgfSk7XG4gICAgdGhpcy5fY3VycmVudEVtcHR5U3RlcEtleWZyYW1lID0gdGhpcy5fY3VycmVudEtleWZyYW1lO1xuICB9XG5cbiAgc2V0U3R5bGVzKFxuICAgICAgaW5wdXQ6ICjJtVN0eWxlRGF0YXxzdHJpbmcpW10sIGVhc2luZzogc3RyaW5nfG51bGwsIGVycm9yczogYW55W10sXG4gICAgICBvcHRpb25zPzogQW5pbWF0aW9uT3B0aW9ucykge1xuICAgIGlmIChlYXNpbmcpIHtcbiAgICAgIHRoaXMuX3ByZXZpb3VzS2V5ZnJhbWVbJ2Vhc2luZyddID0gZWFzaW5nO1xuICAgIH1cblxuICAgIGNvbnN0IHBhcmFtcyA9IChvcHRpb25zICYmIG9wdGlvbnMucGFyYW1zKSB8fCB7fTtcbiAgICBjb25zdCBzdHlsZXMgPSBmbGF0dGVuU3R5bGVzKGlucHV0LCB0aGlzLl9nbG9iYWxUaW1lbGluZVN0eWxlcyk7XG4gICAgT2JqZWN0LmtleXMoc3R5bGVzKS5mb3JFYWNoKHByb3AgPT4ge1xuICAgICAgY29uc3QgdmFsID0gaW50ZXJwb2xhdGVQYXJhbXMoc3R5bGVzW3Byb3BdLCBwYXJhbXMsIGVycm9ycyk7XG4gICAgICB0aGlzLl9wZW5kaW5nU3R5bGVzW3Byb3BdID0gdmFsO1xuICAgICAgaWYgKCF0aGlzLl9sb2NhbFRpbWVsaW5lU3R5bGVzLmhhc093blByb3BlcnR5KHByb3ApKSB7XG4gICAgICAgIHRoaXMuX2JhY2tGaWxsW3Byb3BdID0gdGhpcy5fZ2xvYmFsVGltZWxpbmVTdHlsZXMuaGFzT3duUHJvcGVydHkocHJvcCkgP1xuICAgICAgICAgICAgdGhpcy5fZ2xvYmFsVGltZWxpbmVTdHlsZXNbcHJvcF0gOlxuICAgICAgICAgICAgQVVUT19TVFlMRTtcbiAgICAgIH1cbiAgICAgIHRoaXMuX3VwZGF0ZVN0eWxlKHByb3AsIHZhbCk7XG4gICAgfSk7XG4gIH1cblxuICBhcHBseVN0eWxlc1RvS2V5ZnJhbWUoKSB7XG4gICAgY29uc3Qgc3R5bGVzID0gdGhpcy5fcGVuZGluZ1N0eWxlcztcbiAgICBjb25zdCBwcm9wcyA9IE9iamVjdC5rZXlzKHN0eWxlcyk7XG4gICAgaWYgKHByb3BzLmxlbmd0aCA9PSAwKSByZXR1cm47XG5cbiAgICB0aGlzLl9wZW5kaW5nU3R5bGVzID0ge307XG5cbiAgICBwcm9wcy5mb3JFYWNoKHByb3AgPT4ge1xuICAgICAgY29uc3QgdmFsID0gc3R5bGVzW3Byb3BdO1xuICAgICAgdGhpcy5fY3VycmVudEtleWZyYW1lW3Byb3BdID0gdmFsO1xuICAgIH0pO1xuXG4gICAgT2JqZWN0LmtleXModGhpcy5fbG9jYWxUaW1lbGluZVN0eWxlcykuZm9yRWFjaChwcm9wID0+IHtcbiAgICAgIGlmICghdGhpcy5fY3VycmVudEtleWZyYW1lLmhhc093blByb3BlcnR5KHByb3ApKSB7XG4gICAgICAgIHRoaXMuX2N1cnJlbnRLZXlmcmFtZVtwcm9wXSA9IHRoaXMuX2xvY2FsVGltZWxpbmVTdHlsZXNbcHJvcF07XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICBzbmFwc2hvdEN1cnJlbnRTdHlsZXMoKSB7XG4gICAgT2JqZWN0LmtleXModGhpcy5fbG9jYWxUaW1lbGluZVN0eWxlcykuZm9yRWFjaChwcm9wID0+IHtcbiAgICAgIGNvbnN0IHZhbCA9IHRoaXMuX2xvY2FsVGltZWxpbmVTdHlsZXNbcHJvcF07XG4gICAgICB0aGlzLl9wZW5kaW5nU3R5bGVzW3Byb3BdID0gdmFsO1xuICAgICAgdGhpcy5fdXBkYXRlU3R5bGUocHJvcCwgdmFsKTtcbiAgICB9KTtcbiAgfVxuXG4gIGdldEZpbmFsS2V5ZnJhbWUoKSB7XG4gICAgcmV0dXJuIHRoaXMuX2tleWZyYW1lcy5nZXQodGhpcy5kdXJhdGlvbik7XG4gIH1cblxuICBnZXQgcHJvcGVydGllcygpIHtcbiAgICBjb25zdCBwcm9wZXJ0aWVzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGZvciAobGV0IHByb3AgaW4gdGhpcy5fY3VycmVudEtleWZyYW1lKSB7XG4gICAgICBwcm9wZXJ0aWVzLnB1c2gocHJvcCk7XG4gICAgfVxuICAgIHJldHVybiBwcm9wZXJ0aWVzO1xuICB9XG5cbiAgbWVyZ2VUaW1lbGluZUNvbGxlY3RlZFN0eWxlcyh0aW1lbGluZTogVGltZWxpbmVCdWlsZGVyKSB7XG4gICAgT2JqZWN0LmtleXModGltZWxpbmUuX3N0eWxlU3VtbWFyeSkuZm9yRWFjaChwcm9wID0+IHtcbiAgICAgIGNvbnN0IGRldGFpbHMwID0gdGhpcy5fc3R5bGVTdW1tYXJ5W3Byb3BdO1xuICAgICAgY29uc3QgZGV0YWlsczEgPSB0aW1lbGluZS5fc3R5bGVTdW1tYXJ5W3Byb3BdO1xuICAgICAgaWYgKCFkZXRhaWxzMCB8fCBkZXRhaWxzMS50aW1lID4gZGV0YWlsczAudGltZSkge1xuICAgICAgICB0aGlzLl91cGRhdGVTdHlsZShwcm9wLCBkZXRhaWxzMS52YWx1ZSk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICBidWlsZEtleWZyYW1lcygpOiBBbmltYXRpb25UaW1lbGluZUluc3RydWN0aW9uIHtcbiAgICB0aGlzLmFwcGx5U3R5bGVzVG9LZXlmcmFtZSgpO1xuICAgIGNvbnN0IHByZVN0eWxlUHJvcHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICBjb25zdCBwb3N0U3R5bGVQcm9wcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIGNvbnN0IGlzRW1wdHkgPSB0aGlzLl9rZXlmcmFtZXMuc2l6ZSA9PT0gMSAmJiB0aGlzLmR1cmF0aW9uID09PSAwO1xuXG4gICAgbGV0IGZpbmFsS2V5ZnJhbWVzOiDJtVN0eWxlRGF0YVtdID0gW107XG4gICAgdGhpcy5fa2V5ZnJhbWVzLmZvckVhY2goKGtleWZyYW1lLCB0aW1lKSA9PiB7XG4gICAgICBjb25zdCBmaW5hbEtleWZyYW1lID0gY29weVN0eWxlcyhrZXlmcmFtZSwgdHJ1ZSk7XG4gICAgICBPYmplY3Qua2V5cyhmaW5hbEtleWZyYW1lKS5mb3JFYWNoKHByb3AgPT4ge1xuICAgICAgICBjb25zdCB2YWx1ZSA9IGZpbmFsS2V5ZnJhbWVbcHJvcF07XG4gICAgICAgIGlmICh2YWx1ZSA9PSBQUkVfU1RZTEUpIHtcbiAgICAgICAgICBwcmVTdHlsZVByb3BzLmFkZChwcm9wKTtcbiAgICAgICAgfSBlbHNlIGlmICh2YWx1ZSA9PSBBVVRPX1NUWUxFKSB7XG4gICAgICAgICAgcG9zdFN0eWxlUHJvcHMuYWRkKHByb3ApO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIGlmICghaXNFbXB0eSkge1xuICAgICAgICBmaW5hbEtleWZyYW1lWydvZmZzZXQnXSA9IHRpbWUgLyB0aGlzLmR1cmF0aW9uO1xuICAgICAgfVxuICAgICAgZmluYWxLZXlmcmFtZXMucHVzaChmaW5hbEtleWZyYW1lKTtcbiAgICB9KTtcblxuICAgIGNvbnN0IHByZVByb3BzOiBzdHJpbmdbXSA9IHByZVN0eWxlUHJvcHMuc2l6ZSA/IGl0ZXJhdG9yVG9BcnJheShwcmVTdHlsZVByb3BzLnZhbHVlcygpKSA6IFtdO1xuICAgIGNvbnN0IHBvc3RQcm9wczogc3RyaW5nW10gPSBwb3N0U3R5bGVQcm9wcy5zaXplID8gaXRlcmF0b3JUb0FycmF5KHBvc3RTdHlsZVByb3BzLnZhbHVlcygpKSA6IFtdO1xuXG4gICAgLy8gc3BlY2lhbCBjYXNlIGZvciBhIDAtc2Vjb25kIGFuaW1hdGlvbiAod2hpY2ggaXMgZGVzaWduZWQganVzdCB0byBwbGFjZSBzdHlsZXMgb25zY3JlZW4pXG4gICAgaWYgKGlzRW1wdHkpIHtcbiAgICAgIGNvbnN0IGtmMCA9IGZpbmFsS2V5ZnJhbWVzWzBdO1xuICAgICAgY29uc3Qga2YxID0gY29weU9iaihrZjApO1xuICAgICAga2YwWydvZmZzZXQnXSA9IDA7XG4gICAgICBrZjFbJ29mZnNldCddID0gMTtcbiAgICAgIGZpbmFsS2V5ZnJhbWVzID0gW2tmMCwga2YxXTtcbiAgICB9XG5cbiAgICByZXR1cm4gY3JlYXRlVGltZWxpbmVJbnN0cnVjdGlvbihcbiAgICAgICAgdGhpcy5lbGVtZW50LCBmaW5hbEtleWZyYW1lcywgcHJlUHJvcHMsIHBvc3RQcm9wcywgdGhpcy5kdXJhdGlvbiwgdGhpcy5zdGFydFRpbWUsXG4gICAgICAgIHRoaXMuZWFzaW5nLCBmYWxzZSk7XG4gIH1cbn1cblxuY2xhc3MgU3ViVGltZWxpbmVCdWlsZGVyIGV4dGVuZHMgVGltZWxpbmVCdWlsZGVyIHtcbiAgcHVibGljIHRpbWluZ3M6IEFuaW1hdGVUaW1pbmdzO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgICAgZHJpdmVyOiBBbmltYXRpb25Ecml2ZXIsIGVsZW1lbnQ6IGFueSwgcHVibGljIGtleWZyYW1lczogybVTdHlsZURhdGFbXSxcbiAgICAgIHB1YmxpYyBwcmVTdHlsZVByb3BzOiBzdHJpbmdbXSwgcHVibGljIHBvc3RTdHlsZVByb3BzOiBzdHJpbmdbXSwgdGltaW5nczogQW5pbWF0ZVRpbWluZ3MsXG4gICAgICBwcml2YXRlIF9zdHJldGNoU3RhcnRpbmdLZXlmcmFtZTogYm9vbGVhbiA9IGZhbHNlKSB7XG4gICAgc3VwZXIoZHJpdmVyLCBlbGVtZW50LCB0aW1pbmdzLmRlbGF5KTtcbiAgICB0aGlzLnRpbWluZ3MgPSB7ZHVyYXRpb246IHRpbWluZ3MuZHVyYXRpb24sIGRlbGF5OiB0aW1pbmdzLmRlbGF5LCBlYXNpbmc6IHRpbWluZ3MuZWFzaW5nfTtcbiAgfVxuXG4gIG92ZXJyaWRlIGNvbnRhaW5zQW5pbWF0aW9uKCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiB0aGlzLmtleWZyYW1lcy5sZW5ndGggPiAxO1xuICB9XG5cbiAgb3ZlcnJpZGUgYnVpbGRLZXlmcmFtZXMoKTogQW5pbWF0aW9uVGltZWxpbmVJbnN0cnVjdGlvbiB7XG4gICAgbGV0IGtleWZyYW1lcyA9IHRoaXMua2V5ZnJhbWVzO1xuICAgIGxldCB7ZGVsYXksIGR1cmF0aW9uLCBlYXNpbmd9ID0gdGhpcy50aW1pbmdzO1xuICAgIGlmICh0aGlzLl9zdHJldGNoU3RhcnRpbmdLZXlmcmFtZSAmJiBkZWxheSkge1xuICAgICAgY29uc3QgbmV3S2V5ZnJhbWVzOiDJtVN0eWxlRGF0YVtdID0gW107XG4gICAgICBjb25zdCB0b3RhbFRpbWUgPSBkdXJhdGlvbiArIGRlbGF5O1xuICAgICAgY29uc3Qgc3RhcnRpbmdHYXAgPSBkZWxheSAvIHRvdGFsVGltZTtcblxuICAgICAgLy8gdGhlIG9yaWdpbmFsIHN0YXJ0aW5nIGtleWZyYW1lIG5vdyBzdGFydHMgb25jZSB0aGUgZGVsYXkgaXMgZG9uZVxuICAgICAgY29uc3QgbmV3Rmlyc3RLZXlmcmFtZSA9IGNvcHlTdHlsZXMoa2V5ZnJhbWVzWzBdLCBmYWxzZSk7XG4gICAgICBuZXdGaXJzdEtleWZyYW1lWydvZmZzZXQnXSA9IDA7XG4gICAgICBuZXdLZXlmcmFtZXMucHVzaChuZXdGaXJzdEtleWZyYW1lKTtcblxuICAgICAgY29uc3Qgb2xkRmlyc3RLZXlmcmFtZSA9IGNvcHlTdHlsZXMoa2V5ZnJhbWVzWzBdLCBmYWxzZSk7XG4gICAgICBvbGRGaXJzdEtleWZyYW1lWydvZmZzZXQnXSA9IHJvdW5kT2Zmc2V0KHN0YXJ0aW5nR2FwKTtcbiAgICAgIG5ld0tleWZyYW1lcy5wdXNoKG9sZEZpcnN0S2V5ZnJhbWUpO1xuXG4gICAgICAvKlxuICAgICAgICBXaGVuIHRoZSBrZXlmcmFtZSBpcyBzdHJldGNoZWQgdGhlbiBpdCBtZWFucyB0aGF0IHRoZSBkZWxheSBiZWZvcmUgdGhlIGFuaW1hdGlvblxuICAgICAgICBzdGFydHMgaXMgZ29uZS4gSW5zdGVhZCB0aGUgZmlyc3Qga2V5ZnJhbWUgaXMgcGxhY2VkIGF0IHRoZSBzdGFydCBvZiB0aGUgYW5pbWF0aW9uXG4gICAgICAgIGFuZCBpdCBpcyB0aGVuIGNvcGllZCB0byB3aGVyZSBpdCBzdGFydHMgd2hlbiB0aGUgb3JpZ2luYWwgZGVsYXkgaXMgb3Zlci4gVGhpcyBiYXNpY2FsbHlcbiAgICAgICAgbWVhbnMgbm90aGluZyBhbmltYXRlcyBkdXJpbmcgdGhhdCBkZWxheSwgYnV0IHRoZSBzdHlsZXMgYXJlIHN0aWxsIHJlbmRlcmVyZWQuIEZvciB0aGlzXG4gICAgICAgIHRvIHdvcmsgdGhlIG9yaWdpbmFsIG9mZnNldCB2YWx1ZXMgdGhhdCBleGlzdCBpbiB0aGUgb3JpZ2luYWwga2V5ZnJhbWVzIG11c3QgYmUgXCJ3YXJwZWRcIlxuICAgICAgICBzbyB0aGF0IHRoZXkgY2FuIHRha2UgdGhlIG5ldyBrZXlmcmFtZSArIGRlbGF5IGludG8gYWNjb3VudC5cblxuICAgICAgICBkZWxheT0xMDAwLCBkdXJhdGlvbj0xMDAwLCBrZXlmcmFtZXMgPSAwIC41IDFcblxuICAgICAgICB0dXJucyBpbnRvXG5cbiAgICAgICAgZGVsYXk9MCwgZHVyYXRpb249MjAwMCwga2V5ZnJhbWVzID0gMCAuMzMgLjY2IDFcbiAgICAgICAqL1xuXG4gICAgICAvLyBvZmZzZXRzIGJldHdlZW4gMSAuLi4gbiAtMSBhcmUgYWxsIHdhcnBlZCBieSB0aGUga2V5ZnJhbWUgc3RyZXRjaFxuICAgICAgY29uc3QgbGltaXQgPSBrZXlmcmFtZXMubGVuZ3RoIC0gMTtcbiAgICAgIGZvciAobGV0IGkgPSAxOyBpIDw9IGxpbWl0OyBpKyspIHtcbiAgICAgICAgbGV0IGtmID0gY29weVN0eWxlcyhrZXlmcmFtZXNbaV0sIGZhbHNlKTtcbiAgICAgICAgY29uc3Qgb2xkT2Zmc2V0ID0ga2ZbJ29mZnNldCddIGFzIG51bWJlcjtcbiAgICAgICAgY29uc3QgdGltZUF0S2V5ZnJhbWUgPSBkZWxheSArIG9sZE9mZnNldCAqIGR1cmF0aW9uO1xuICAgICAgICBrZlsnb2Zmc2V0J10gPSByb3VuZE9mZnNldCh0aW1lQXRLZXlmcmFtZSAvIHRvdGFsVGltZSk7XG4gICAgICAgIG5ld0tleWZyYW1lcy5wdXNoKGtmKTtcbiAgICAgIH1cblxuICAgICAgLy8gdGhlIG5ldyBzdGFydGluZyBrZXlmcmFtZSBzaG91bGQgYmUgYWRkZWQgYXQgdGhlIHN0YXJ0XG4gICAgICBkdXJhdGlvbiA9IHRvdGFsVGltZTtcbiAgICAgIGRlbGF5ID0gMDtcbiAgICAgIGVhc2luZyA9ICcnO1xuXG4gICAgICBrZXlmcmFtZXMgPSBuZXdLZXlmcmFtZXM7XG4gICAgfVxuXG4gICAgcmV0dXJuIGNyZWF0ZVRpbWVsaW5lSW5zdHJ1Y3Rpb24oXG4gICAgICAgIHRoaXMuZWxlbWVudCwga2V5ZnJhbWVzLCB0aGlzLnByZVN0eWxlUHJvcHMsIHRoaXMucG9zdFN0eWxlUHJvcHMsIGR1cmF0aW9uLCBkZWxheSwgZWFzaW5nLFxuICAgICAgICB0cnVlKTtcbiAgfVxufVxuXG5mdW5jdGlvbiByb3VuZE9mZnNldChvZmZzZXQ6IG51bWJlciwgZGVjaW1hbFBvaW50cyA9IDMpOiBudW1iZXIge1xuICBjb25zdCBtdWx0ID0gTWF0aC5wb3coMTAsIGRlY2ltYWxQb2ludHMgLSAxKTtcbiAgcmV0dXJuIE1hdGgucm91bmQob2Zmc2V0ICogbXVsdCkgLyBtdWx0O1xufVxuXG5mdW5jdGlvbiBmbGF0dGVuU3R5bGVzKGlucHV0OiAoybVTdHlsZURhdGF8c3RyaW5nKVtdLCBhbGxTdHlsZXM6IMm1U3R5bGVEYXRhKSB7XG4gIGNvbnN0IHN0eWxlczogybVTdHlsZURhdGEgPSB7fTtcbiAgbGV0IGFsbFByb3BlcnRpZXM6IHN0cmluZ1tdO1xuICBpbnB1dC5mb3JFYWNoKHRva2VuID0+IHtcbiAgICBpZiAodG9rZW4gPT09ICcqJykge1xuICAgICAgYWxsUHJvcGVydGllcyA9IGFsbFByb3BlcnRpZXMgfHwgT2JqZWN0LmtleXMoYWxsU3R5bGVzKTtcbiAgICAgIGFsbFByb3BlcnRpZXMuZm9yRWFjaChwcm9wID0+IHtcbiAgICAgICAgc3R5bGVzW3Byb3BdID0gQVVUT19TVFlMRTtcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb3B5U3R5bGVzKHRva2VuIGFzIMm1U3R5bGVEYXRhLCBmYWxzZSwgc3R5bGVzKTtcbiAgICB9XG4gIH0pO1xuICByZXR1cm4gc3R5bGVzO1xufVxuIl19