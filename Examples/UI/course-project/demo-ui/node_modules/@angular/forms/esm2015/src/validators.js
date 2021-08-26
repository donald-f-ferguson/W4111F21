/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { InjectionToken, ɵisObservable as isObservable, ɵisPromise as isPromise } from '@angular/core';
import { forkJoin, from } from 'rxjs';
import { map } from 'rxjs/operators';
function isEmptyInputValue(value) {
    // we don't check for string here so it also works with arrays
    return value == null || value.length === 0;
}
function hasValidLength(value) {
    // non-strict comparison is intentional, to check for both `null` and `undefined` values
    return value != null && typeof value.length === 'number';
}
/**
 * @description
 * An `InjectionToken` for registering additional synchronous validators used with
 * `AbstractControl`s.
 *
 * @see `NG_ASYNC_VALIDATORS`
 *
 * @usageNotes
 *
 * ### Providing a custom validator
 *
 * The following example registers a custom validator directive. Adding the validator to the
 * existing collection of validators requires the `multi: true` option.
 *
 * ```typescript
 * @Directive({
 *   selector: '[customValidator]',
 *   providers: [{provide: NG_VALIDATORS, useExisting: CustomValidatorDirective, multi: true}]
 * })
 * class CustomValidatorDirective implements Validator {
 *   validate(control: AbstractControl): ValidationErrors | null {
 *     return { 'custom': true };
 *   }
 * }
 * ```
 *
 * @publicApi
 */
export const NG_VALIDATORS = new InjectionToken('NgValidators');
/**
 * @description
 * An `InjectionToken` for registering additional asynchronous validators used with
 * `AbstractControl`s.
 *
 * @see `NG_VALIDATORS`
 *
 * @publicApi
 */
export const NG_ASYNC_VALIDATORS = new InjectionToken('NgAsyncValidators');
/**
 * A regular expression that matches valid e-mail addresses.
 *
 * At a high level, this regexp matches e-mail addresses of the format `local-part@tld`, where:
 * - `local-part` consists of one or more of the allowed characters (alphanumeric and some
 *   punctuation symbols).
 * - `local-part` cannot begin or end with a period (`.`).
 * - `local-part` cannot be longer than 64 characters.
 * - `tld` consists of one or more `labels` separated by periods (`.`). For example `localhost` or
 *   `foo.com`.
 * - A `label` consists of one or more of the allowed characters (alphanumeric, dashes (`-`) and
 *   periods (`.`)).
 * - A `label` cannot begin or end with a dash (`-`) or a period (`.`).
 * - A `label` cannot be longer than 63 characters.
 * - The whole address cannot be longer than 254 characters.
 *
 * ## Implementation background
 *
 * This regexp was ported over from AngularJS (see there for git history):
 * https://github.com/angular/angular.js/blob/c133ef836/src/ng/directive/input.js#L27
 * It is based on the
 * [WHATWG version](https://html.spec.whatwg.org/multipage/input.html#valid-e-mail-address) with
 * some enhancements to incorporate more RFC rules (such as rules related to domain names and the
 * lengths of different parts of the address). The main differences from the WHATWG version are:
 *   - Disallow `local-part` to begin or end with a period (`.`).
 *   - Disallow `local-part` length to exceed 64 characters.
 *   - Disallow total address length to exceed 254 characters.
 *
 * See [this commit](https://github.com/angular/angular.js/commit/f3f5cf72e) for more details.
 */
const EMAIL_REGEXP = /^(?=.{1,254}$)(?=.{1,64}@)[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
/**
 * @description
 * Provides a set of built-in validators that can be used by form controls.
 *
 * A validator is a function that processes a `FormControl` or collection of
 * controls and returns an error map or null. A null map means that validation has passed.
 *
 * @see [Form Validation](/guide/form-validation)
 *
 * @publicApi
 */
export class Validators {
    /**
     * @description
     * Validator that requires the control's value to be greater than or equal to the provided number.
     *
     * @usageNotes
     *
     * ### Validate against a minimum of 3
     *
     * ```typescript
     * const control = new FormControl(2, Validators.min(3));
     *
     * console.log(control.errors); // {min: {min: 3, actual: 2}}
     * ```
     *
     * @returns A validator function that returns an error map with the
     * `min` property if the validation check fails, otherwise `null`.
     *
     * @see `updateValueAndValidity()`
     *
     */
    static min(min) {
        return minValidator(min);
    }
    /**
     * @description
     * Validator that requires the control's value to be less than or equal to the provided number.
     *
     * @usageNotes
     *
     * ### Validate against a maximum of 15
     *
     * ```typescript
     * const control = new FormControl(16, Validators.max(15));
     *
     * console.log(control.errors); // {max: {max: 15, actual: 16}}
     * ```
     *
     * @returns A validator function that returns an error map with the
     * `max` property if the validation check fails, otherwise `null`.
     *
     * @see `updateValueAndValidity()`
     *
     */
    static max(max) {
        return maxValidator(max);
    }
    /**
     * @description
     * Validator that requires the control have a non-empty value.
     *
     * @usageNotes
     *
     * ### Validate that the field is non-empty
     *
     * ```typescript
     * const control = new FormControl('', Validators.required);
     *
     * console.log(control.errors); // {required: true}
     * ```
     *
     * @returns An error map with the `required` property
     * if the validation check fails, otherwise `null`.
     *
     * @see `updateValueAndValidity()`
     *
     */
    static required(control) {
        return requiredValidator(control);
    }
    /**
     * @description
     * Validator that requires the control's value be true. This validator is commonly
     * used for required checkboxes.
     *
     * @usageNotes
     *
     * ### Validate that the field value is true
     *
     * ```typescript
     * const control = new FormControl('', Validators.requiredTrue);
     *
     * console.log(control.errors); // {required: true}
     * ```
     *
     * @returns An error map that contains the `required` property
     * set to `true` if the validation check fails, otherwise `null`.
     *
     * @see `updateValueAndValidity()`
     *
     */
    static requiredTrue(control) {
        return requiredTrueValidator(control);
    }
    /**
     * @description
     * Validator that requires the control's value pass an email validation test.
     *
     * Tests the value using a [regular
     * expression](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions)
     * pattern suitable for common usecases. The pattern is based on the definition of a valid email
     * address in the [WHATWG HTML
     * specification](https://html.spec.whatwg.org/multipage/input.html#valid-e-mail-address) with
     * some enhancements to incorporate more RFC rules (such as rules related to domain names and the
     * lengths of different parts of the address).
     *
     * The differences from the WHATWG version include:
     * - Disallow `local-part` (the part before the `@` symbol) to begin or end with a period (`.`).
     * - Disallow `local-part` to be longer than 64 characters.
     * - Disallow the whole address to be longer than 254 characters.
     *
     * If this pattern does not satisfy your business needs, you can use `Validators.pattern()` to
     * validate the value against a different pattern.
     *
     * @usageNotes
     *
     * ### Validate that the field matches a valid email pattern
     *
     * ```typescript
     * const control = new FormControl('bad@', Validators.email);
     *
     * console.log(control.errors); // {email: true}
     * ```
     *
     * @returns An error map with the `email` property
     * if the validation check fails, otherwise `null`.
     *
     * @see `updateValueAndValidity()`
     *
     */
    static email(control) {
        return emailValidator(control);
    }
    /**
     * @description
     * Validator that requires the length of the control's value to be greater than or equal
     * to the provided minimum length. This validator is also provided by default if you use the
     * the HTML5 `minlength` attribute. Note that the `minLength` validator is intended to be used
     * only for types that have a numeric `length` property, such as strings or arrays. The
     * `minLength` validator logic is also not invoked for values when their `length` property is 0
     * (for example in case of an empty string or an empty array), to support optional controls. You
     * can use the standard `required` validator if empty values should not be considered valid.
     *
     * @usageNotes
     *
     * ### Validate that the field has a minimum of 3 characters
     *
     * ```typescript
     * const control = new FormControl('ng', Validators.minLength(3));
     *
     * console.log(control.errors); // {minlength: {requiredLength: 3, actualLength: 2}}
     * ```
     *
     * ```html
     * <input minlength="5">
     * ```
     *
     * @returns A validator function that returns an error map with the
     * `minlength` property if the validation check fails, otherwise `null`.
     *
     * @see `updateValueAndValidity()`
     *
     */
    static minLength(minLength) {
        return minLengthValidator(minLength);
    }
    /**
     * @description
     * Validator that requires the length of the control's value to be less than or equal
     * to the provided maximum length. This validator is also provided by default if you use the
     * the HTML5 `maxlength` attribute. Note that the `maxLength` validator is intended to be used
     * only for types that have a numeric `length` property, such as strings or arrays.
     *
     * @usageNotes
     *
     * ### Validate that the field has maximum of 5 characters
     *
     * ```typescript
     * const control = new FormControl('Angular', Validators.maxLength(5));
     *
     * console.log(control.errors); // {maxlength: {requiredLength: 5, actualLength: 7}}
     * ```
     *
     * ```html
     * <input maxlength="5">
     * ```
     *
     * @returns A validator function that returns an error map with the
     * `maxlength` property if the validation check fails, otherwise `null`.
     *
     * @see `updateValueAndValidity()`
     *
     */
    static maxLength(maxLength) {
        return maxLengthValidator(maxLength);
    }
    /**
     * @description
     * Validator that requires the control's value to match a regex pattern. This validator is also
     * provided by default if you use the HTML5 `pattern` attribute.
     *
     * @usageNotes
     *
     * ### Validate that the field only contains letters or spaces
     *
     * ```typescript
     * const control = new FormControl('1', Validators.pattern('[a-zA-Z ]*'));
     *
     * console.log(control.errors); // {pattern: {requiredPattern: '^[a-zA-Z ]*$', actualValue: '1'}}
     * ```
     *
     * ```html
     * <input pattern="[a-zA-Z ]*">
     * ```
     *
     * ### Pattern matching with the global or sticky flag
     *
     * `RegExp` objects created with the `g` or `y` flags that are passed into `Validators.pattern`
     * can produce different results on the same input when validations are run consecutively. This is
     * due to how the behavior of `RegExp.prototype.test` is
     * specified in [ECMA-262](https://tc39.es/ecma262/#sec-regexpbuiltinexec)
     * (`RegExp` preserves the index of the last match when the global or sticky flag is used).
     * Due to this behavior, it is recommended that when using
     * `Validators.pattern` you **do not** pass in a `RegExp` object with either the global or sticky
     * flag enabled.
     *
     * ```typescript
     * // Not recommended (since the `g` flag is used)
     * const controlOne = new FormControl('1', Validators.pattern(/foo/g));
     *
     * // Good
     * const controlTwo = new FormControl('1', Validators.pattern(/foo/));
     * ```
     *
     * @param pattern A regular expression to be used as is to test the values, or a string.
     * If a string is passed, the `^` character is prepended and the `$` character is
     * appended to the provided string (if not already present), and the resulting regular
     * expression is used to test the values.
     *
     * @returns A validator function that returns an error map with the
     * `pattern` property if the validation check fails, otherwise `null`.
     *
     * @see `updateValueAndValidity()`
     *
     */
    static pattern(pattern) {
        return patternValidator(pattern);
    }
    /**
     * @description
     * Validator that performs no operation.
     *
     * @see `updateValueAndValidity()`
     *
     */
    static nullValidator(control) {
        return nullValidator(control);
    }
    static compose(validators) {
        return compose(validators);
    }
    /**
     * @description
     * Compose multiple async validators into a single function that returns the union
     * of the individual error objects for the provided control.
     *
     * @returns A validator function that returns an error map with the
     * merged error objects of the async validators if the validation check fails, otherwise `null`.
     *
     * @see `updateValueAndValidity()`
     *
     */
    static composeAsync(validators) {
        return composeAsync(validators);
    }
}
/**
 * Validator that requires the control's value to be greater than or equal to the provided number.
 * See `Validators.min` for additional information.
 */
export function minValidator(min) {
    return (control) => {
        if (isEmptyInputValue(control.value) || isEmptyInputValue(min)) {
            return null; // don't validate empty values to allow optional controls
        }
        const value = parseFloat(control.value);
        // Controls with NaN values after parsing should be treated as not having a
        // minimum, per the HTML forms spec: https://www.w3.org/TR/html5/forms.html#attr-input-min
        return !isNaN(value) && value < min ? { 'min': { 'min': min, 'actual': control.value } } : null;
    };
}
/**
 * Validator that requires the control's value to be less than or equal to the provided number.
 * See `Validators.max` for additional information.
 */
export function maxValidator(max) {
    return (control) => {
        if (isEmptyInputValue(control.value) || isEmptyInputValue(max)) {
            return null; // don't validate empty values to allow optional controls
        }
        const value = parseFloat(control.value);
        // Controls with NaN values after parsing should be treated as not having a
        // maximum, per the HTML forms spec: https://www.w3.org/TR/html5/forms.html#attr-input-max
        return !isNaN(value) && value > max ? { 'max': { 'max': max, 'actual': control.value } } : null;
    };
}
/**
 * Validator that requires the control have a non-empty value.
 * See `Validators.required` for additional information.
 */
export function requiredValidator(control) {
    return isEmptyInputValue(control.value) ? { 'required': true } : null;
}
/**
 * Validator that requires the control's value be true. This validator is commonly
 * used for required checkboxes.
 * See `Validators.requiredTrue` for additional information.
 */
export function requiredTrueValidator(control) {
    return control.value === true ? null : { 'required': true };
}
/**
 * Validator that requires the control's value pass an email validation test.
 * See `Validators.email` for additional information.
 */
export function emailValidator(control) {
    if (isEmptyInputValue(control.value)) {
        return null; // don't validate empty values to allow optional controls
    }
    return EMAIL_REGEXP.test(control.value) ? null : { 'email': true };
}
/**
 * Validator that requires the length of the control's value to be greater than or equal
 * to the provided minimum length. See `Validators.minLength` for additional information.
 */
export function minLengthValidator(minLength) {
    return (control) => {
        if (isEmptyInputValue(control.value) || !hasValidLength(control.value)) {
            // don't validate empty values to allow optional controls
            // don't validate values without `length` property
            return null;
        }
        return control.value.length < minLength ?
            { 'minlength': { 'requiredLength': minLength, 'actualLength': control.value.length } } :
            null;
    };
}
/**
 * Validator that requires the length of the control's value to be less than or equal
 * to the provided maximum length. See `Validators.maxLength` for additional information.
 */
export function maxLengthValidator(maxLength) {
    return (control) => {
        return hasValidLength(control.value) && control.value.length > maxLength ?
            { 'maxlength': { 'requiredLength': maxLength, 'actualLength': control.value.length } } :
            null;
    };
}
/**
 * Validator that requires the control's value to match a regex pattern.
 * See `Validators.pattern` for additional information.
 */
export function patternValidator(pattern) {
    if (!pattern)
        return nullValidator;
    let regex;
    let regexStr;
    if (typeof pattern === 'string') {
        regexStr = '';
        if (pattern.charAt(0) !== '^')
            regexStr += '^';
        regexStr += pattern;
        if (pattern.charAt(pattern.length - 1) !== '$')
            regexStr += '$';
        regex = new RegExp(regexStr);
    }
    else {
        regexStr = pattern.toString();
        regex = pattern;
    }
    return (control) => {
        if (isEmptyInputValue(control.value)) {
            return null; // don't validate empty values to allow optional controls
        }
        const value = control.value;
        return regex.test(value) ? null :
            { 'pattern': { 'requiredPattern': regexStr, 'actualValue': value } };
    };
}
/**
 * Function that has `ValidatorFn` shape, but performs no operation.
 */
export function nullValidator(control) {
    return null;
}
function isPresent(o) {
    return o != null;
}
export function toObservable(r) {
    const obs = isPromise(r) ? from(r) : r;
    if (!(isObservable(obs)) && (typeof ngDevMode === 'undefined' || ngDevMode)) {
        throw new Error(`Expected validator to return Promise or Observable.`);
    }
    return obs;
}
function mergeErrors(arrayOfErrors) {
    let res = {};
    // Not using Array.reduce here due to a Chrome 80 bug
    // https://bugs.chromium.org/p/chromium/issues/detail?id=1049982
    arrayOfErrors.forEach((errors) => {
        res = errors != null ? Object.assign(Object.assign({}, res), errors) : res;
    });
    return Object.keys(res).length === 0 ? null : res;
}
function executeValidators(control, validators) {
    return validators.map(validator => validator(control));
}
function isValidatorFn(validator) {
    return !validator.validate;
}
/**
 * Given the list of validators that may contain both functions as well as classes, return the list
 * of validator functions (convert validator classes into validator functions). This is needed to
 * have consistent structure in validators list before composing them.
 *
 * @param validators The set of validators that may contain validators both in plain function form
 *     as well as represented as a validator class.
 */
export function normalizeValidators(validators) {
    return validators.map(validator => {
        return isValidatorFn(validator) ?
            validator :
            ((c) => validator.validate(c));
    });
}
/**
 * Merges synchronous validators into a single validator function.
 * See `Validators.compose` for additional information.
 */
function compose(validators) {
    if (!validators)
        return null;
    const presentValidators = validators.filter(isPresent);
    if (presentValidators.length == 0)
        return null;
    return function (control) {
        return mergeErrors(executeValidators(control, presentValidators));
    };
}
/**
 * Accepts a list of validators of different possible shapes (`Validator` and `ValidatorFn`),
 * normalizes the list (converts everything to `ValidatorFn`) and merges them into a single
 * validator function.
 */
export function composeValidators(validators) {
    return validators != null ? compose(normalizeValidators(validators)) : null;
}
/**
 * Merges asynchronous validators into a single validator function.
 * See `Validators.composeAsync` for additional information.
 */
function composeAsync(validators) {
    if (!validators)
        return null;
    const presentValidators = validators.filter(isPresent);
    if (presentValidators.length == 0)
        return null;
    return function (control) {
        const observables = executeValidators(control, presentValidators).map(toObservable);
        return forkJoin(observables).pipe(map(mergeErrors));
    };
}
/**
 * Accepts a list of async validators of different possible shapes (`AsyncValidator` and
 * `AsyncValidatorFn`), normalizes the list (converts everything to `AsyncValidatorFn`) and merges
 * them into a single validator function.
 */
export function composeAsyncValidators(validators) {
    return validators != null ? composeAsync(normalizeValidators(validators)) :
        null;
}
/**
 * Merges raw control validators with a given directive validator and returns the combined list of
 * validators as an array.
 */
export function mergeValidators(controlValidators, dirValidator) {
    if (controlValidators === null)
        return [dirValidator];
    return Array.isArray(controlValidators) ? [...controlValidators, dirValidator] :
        [controlValidators, dirValidator];
}
/**
 * Retrieves the list of raw synchronous validators attached to a given control.
 */
export function getControlValidators(control) {
    return control._rawValidators;
}
/**
 * Retrieves the list of raw asynchronous validators attached to a given control.
 */
export function getControlAsyncValidators(control) {
    return control._rawAsyncValidators;
}
/**
 * Accepts a singleton validator, an array, or null, and returns an array type with the provided
 * validators.
 *
 * @param validators A validator, validators, or null.
 * @returns A validators array.
 */
export function makeValidatorsArray(validators) {
    if (!validators)
        return [];
    return Array.isArray(validators) ? validators : [validators];
}
/**
 * Determines whether a validator or validators array has a given validator.
 *
 * @param validators The validator or validators to compare against.
 * @param validator The validator to check.
 * @returns Whether the validator is present.
 */
export function hasValidator(validators, validator) {
    return Array.isArray(validators) ? validators.includes(validator) : validators === validator;
}
/**
 * Combines two arrays of validators into one. If duplicates are provided, only one will be added.
 *
 * @param validators The new validators.
 * @param currentValidators The base array of currrent validators.
 * @returns An array of validators.
 */
export function addValidators(validators, currentValidators) {
    const current = makeValidatorsArray(currentValidators);
    const validatorsToAdd = makeValidatorsArray(validators);
    validatorsToAdd.forEach((v) => {
        // Note: if there are duplicate entries in the new validators array,
        // only the first one would be added to the current list of validarors.
        // Duplicate ones would be ignored since `hasValidator` would detect
        // the presence of a validator function and we update the current list in place.
        if (!hasValidator(current, v)) {
            current.push(v);
        }
    });
    return current;
}
export function removeValidators(validators, currentValidators) {
    return makeValidatorsArray(currentValidators).filter(v => !hasValidator(validators, v));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmFsaWRhdG9ycy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uL3BhY2thZ2VzL2Zvcm1zL3NyYy92YWxpZGF0b3JzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7R0FNRztBQUVILE9BQU8sRUFBQyxjQUFjLEVBQUUsYUFBYSxJQUFJLFlBQVksRUFBRSxVQUFVLElBQUksU0FBUyxFQUFDLE1BQU0sZUFBZSxDQUFDO0FBQ3JHLE9BQU8sRUFBQyxRQUFRLEVBQUUsSUFBSSxFQUFhLE1BQU0sTUFBTSxDQUFDO0FBQ2hELE9BQU8sRUFBQyxHQUFHLEVBQUMsTUFBTSxnQkFBZ0IsQ0FBQztBQUtuQyxTQUFTLGlCQUFpQixDQUFDLEtBQVU7SUFDbkMsOERBQThEO0lBQzlELE9BQU8sS0FBSyxJQUFJLElBQUksSUFBSSxLQUFLLENBQUMsTUFBTSxLQUFLLENBQUMsQ0FBQztBQUM3QyxDQUFDO0FBRUQsU0FBUyxjQUFjLENBQUMsS0FBVTtJQUNoQyx3RkFBd0Y7SUFDeEYsT0FBTyxLQUFLLElBQUksSUFBSSxJQUFJLE9BQU8sS0FBSyxDQUFDLE1BQU0sS0FBSyxRQUFRLENBQUM7QUFDM0QsQ0FBQztBQUVEOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0EyQkc7QUFDSCxNQUFNLENBQUMsTUFBTSxhQUFhLEdBQUcsSUFBSSxjQUFjLENBQTRCLGNBQWMsQ0FBQyxDQUFDO0FBRTNGOzs7Ozs7OztHQVFHO0FBQ0gsTUFBTSxDQUFDLE1BQU0sbUJBQW1CLEdBQzVCLElBQUksY0FBYyxDQUE0QixtQkFBbUIsQ0FBQyxDQUFDO0FBRXZFOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQTZCRztBQUNILE1BQU0sWUFBWSxHQUNkLG9NQUFvTSxDQUFDO0FBRXpNOzs7Ozs7Ozs7O0dBVUc7QUFDSCxNQUFNLE9BQU8sVUFBVTtJQUNyQjs7Ozs7Ozs7Ozs7Ozs7Ozs7OztPQW1CRztJQUNILE1BQU0sQ0FBQyxHQUFH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QUNILE1BQU0sVUFBVSxZQUFZLENBQ3hCLFVBQXNCLEVBQUUsU0FBWTtJQUN0QyxPQUFPLEtBQUssQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsS0FBSyxTQUFTLENBQUM7QUFDL0YsQ0FBQztBQUVEOzs7Ozs7R0FNRztBQUNILE1BQU0sVUFBVSxhQUFhLENBQ3pCLFVBQWlCLEVBQUUsaUJBQTZCO0lBQ2xELE1BQU0sT0FBTyxHQUFHLG1CQUFtQixDQUFDLGlCQUFpQixDQUFDLENBQUM7SUFDdkQsTUFBTSxlQUFlLEdBQUcsbUJBQW1CLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDeEQsZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUksRUFBRSxFQUFFO1FBQy9CLG9FQUFvRTtRQUNwRSx1RUFBdUU7UUFDdkUsb0VBQW9FO1FBQ3BFLGdGQUFnRjtRQUNoRixJQUFJLENBQUMsWUFBWSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsRUFBRTtZQUM3QixPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1NBQ2pCO0lBQ0gsQ0FBQyxDQUFDLENBQUM7SUFDSCxPQUFPLE9BQU8sQ0FBQztBQUNqQixDQUFDO0FBRUQsTUFBTSxVQUFVLGdCQUFnQixDQUM1QixVQUFpQixFQUFFLGlCQUE2QjtJQUNsRCxPQUFPLG1CQUFtQixDQUFDLGlCQUFpQixDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxZQUFZLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDMUYsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgTExDIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuXG5pbXBvcnQge0luamVjdGlvblRva2VuLCDJtWlzT2JzZXJ2YWJsZSBhcyBpc09ic2VydmFibGUsIMm1aXNQcm9taXNlIGFzIGlzUHJvbWlzZX0gZnJvbSAnQGFuZ3VsYXIvY29yZSc7XG5pbXBvcnQge2ZvcmtKb2luLCBmcm9tLCBPYnNlcnZhYmxlfSBmcm9tICdyeGpzJztcbmltcG9ydCB7bWFwfSBmcm9tICdyeGpzL29wZXJhdG9ycyc7XG5cbmltcG9ydCB7QXN5bmNWYWxpZGF0b3IsIEFzeW5jVmFsaWRhdG9yRm4sIFZhbGlkYXRpb25FcnJvcnMsIFZhbGlkYXRvciwgVmFsaWRhdG9yRm59IGZyb20gJy4vZGlyZWN0aXZlcy92YWxpZGF0b3JzJztcbmltcG9ydCB7QWJzdHJhY3RDb250cm9sfSBmcm9tICcuL21vZGVsJztcblxuZnVuY3Rpb24gaXNFbXB0eUlucHV0VmFsdWUodmFsdWU6IGFueSk6IGJvb2xlYW4ge1xuICAvLyB3ZSBkb24ndCBjaGVjayBmb3Igc3RyaW5nIGhlcmUgc28gaXQgYWxzbyB3b3JrcyB3aXRoIGFycmF5c1xuICByZXR1cm4gdmFsdWUgPT0gbnVsbCB8fCB2YWx1ZS5sZW5ndGggPT09IDA7XG59XG5cbmZ1bmN0aW9uIGhhc1ZhbGlkTGVuZ3RoKHZhbHVlOiBhbnkpOiBib29sZWFuIHtcbiAgLy8gbm9uLXN0cmljdCBjb21wYXJpc29uIGlzIGludGVudGlvbmFsLCB0byBjaGVjayBmb3IgYm90aCBgbnVsbGAgYW5kIGB1bmRlZmluZWRgIHZhbHVlc1xuICByZXR1cm4gdmFsdWUgIT0gbnVsbCAmJiB0eXBlb2YgdmFsdWUubGVuZ3RoID09PSAnbnVtYmVyJztcbn1cblxuLyoqXG4gKiBAZGVzY3JpcHRpb25cbiAqIEFuIGBJbmplY3Rpb25Ub2tlbmAgZm9yIHJlZ2lzdGVyaW5nIGFkZGl0aW9uYWwgc3luY2hyb25vdXMgdmFsaWRhdG9ycyB1c2VkIHdpdGhcbiAqIGBBYnN0cmFjdENvbnRyb2xgcy5cbiAqXG4gKiBAc2VlIGBOR19BU1lOQ19WQUxJREFUT1JTYFxuICpcbiAqIEB1c2FnZU5vdGVzXG4gKlxuICogIyMjIFByb3ZpZGluZyBhIGN1c3RvbSB2YWxpZGF0b3JcbiAqXG4gKiBUaGUgZm9sbG93aW5nIGV4YW1wbGUgcmVnaXN0ZXJzIGEgY3VzdG9tIHZhbGlkYXRvciBkaXJlY3RpdmUuIEFkZGluZyB0aGUgdmFsaWRhdG9yIHRvIHRoZVxuICogZXhpc3RpbmcgY29sbGVjdGlvbiBvZiB2YWxpZGF0b3JzIHJlcXVpcmVzIHRoZSBgbXVsdGk6IHRydWVgIG9wdGlvbi5cbiAqXG4gKiBgYGB0eXBlc2NyaXB0XG4gKiBARGlyZWN0aXZlKHtcbiAqICAgc2VsZWN0b3I6ICdbY3VzdG9tVmFsaWRhdG9yXScsXG4gKiAgIHByb3ZpZGVyczogW3twcm92aWRlOiBOR19WQUxJREFUT1JTLCB1c2VFeGlzdGluZzogQ3VzdG9tVmFsaWRhdG9yRGlyZWN0aXZlLCBtdWx0aTogdHJ1ZX1dXG4gKiB9KVxuICogY2xhc3MgQ3VzdG9tVmFsaWRhdG9yRGlyZWN0aXZlIGltcGxlbWVudHMgVmFsaWRhdG9yIHtcbiAqICAgdmFsaWRhdGUoY29udHJvbDogQWJzdHJhY3RDb250cm9sKTogVmFsaWRhdGlvbkVycm9ycyB8IG51bGwge1xuICogICAgIHJldHVybiB7ICdjdXN0b20nOiB0cnVlIH07XG4gKiAgIH1cbiAqIH1cbiAqIGBgYFxuICpcbiAqIEBwdWJsaWNBcGlcbiAqL1xuZXhwb3J0IGNvbnN0IE5HX1ZBTElEQVRPUlMgPSBuZXcgSW5qZWN0aW9uVG9rZW48QXJyYXk8VmFsaWRhdG9yfEZ1bmN0aW9uPj4oJ05nVmFsaWRhdG9ycycpO1xuXG4vKipcbiAqIEBkZXNjcmlwdGlvblxuICogQW4gYEluamVjdGlvblRva2VuYCBmb3IgcmVnaXN0ZXJpbmcgYWRkaXRpb25hbCBhc3luY2hyb25vdXMgdmFsaWRhdG9ycyB1c2VkIHdpdGhcbiAqIGBBYnN0cmFjdENvbnRyb2xgcy5cbiAqXG4gKiBAc2VlIGBOR19WQUxJREFUT1JTYFxuICpcbiAqIEBwdWJsaWNBcGlcbiAqL1xuZXhwb3J0IGNvbnN0IE5HX0FTWU5DX1ZBTElEQVRPUlMgPVxuICAgIG5ldyBJbmplY3Rpb25Ub2tlbjxBcnJheTxWYWxpZGF0b3J8RnVuY3Rpb24+PignTmdBc3luY1ZhbGlkYXRvcnMnKTtcblxuLyoqXG4gKiBBIHJlZ3VsYXIgZXhwcmVzc2lvbiB0aGF0IG1hdGNoZXMgdmFsaWQgZS1tYWlsIGFkZHJlc3Nlcy5cbiAqXG4gKiBBdCBhIGhpZ2ggbGV2ZWwsIHRoaXMgcmVnZXhwIG1hdGNoZXMgZS1tYWlsIGFkZHJlc3NlcyBvZiB0aGUgZm9ybWF0IGBsb2NhbC1wYXJ0QHRsZGAsIHdoZXJlOlxuICogLSBgbG9jYWwtcGFydGAgY29uc2lzdHMgb2Ygb25lIG9yIG1vcmUgb2YgdGhlIGFsbG93ZWQgY2hhcmFjdGVycyAoYWxwaGFudW1lcmljIGFuZCBzb21lXG4gKiAgIHB1bmN0dWF0aW9uIHN5bWJvbHMpLlxuICogLSBgbG9jYWwtcGFydGAgY2Fubm90IGJlZ2luIG9yIGVuZCB3aXRoIGEgcGVyaW9kIChgLmApLlxuICogLSBgbG9jYWwtcGFydGAgY2Fubm90IGJlIGxvbmdlciB0aGFuIDY0IGNoYXJhY3RlcnMuXG4gKiAtIGB0bGRgIGNvbnNpc3RzIG9mIG9uZSBvciBtb3JlIGBsYWJlbHNgIHNlcGFyYXRlZCBieSBwZXJpb2RzIChgLmApLiBGb3IgZXhhbXBsZSBgbG9jYWxob3N0YCBvclxuICogICBgZm9vLmNvbWAuXG4gKiAtIEEgYGxhYmVsYCBjb25zaXN0cyBvZiBvbmUgb3IgbW9yZSBvZiB0aGUgYWxsb3dlZCBjaGFyYWN0ZXJzIChhbHBoYW51bWVyaWMsIGRhc2hlcyAoYC1gKSBhbmRcbiAqICAgcGVyaW9kcyAoYC5gKSkuXG4gKiAtIEEgYGxhYmVsYCBjYW5ub3QgYmVnaW4gb3IgZW5kIHdpdGggYSBkYXNoIChgLWApIG9yIGEgcGVyaW9kIChgLmApLlxuICogLSBBIGBsYWJlbGAgY2Fubm90IGJlIGxvbmdlciB0aGFuIDYzIGNoYXJhY3RlcnMuXG4gKiAtIFRoZSB3aG9sZSBhZGRyZXNzIGNhbm5vdCBiZSBsb25nZXIgdGhhbiAyNTQgY2hhcmFjdGVycy5cbiAqXG4gKiAjIyBJbXBsZW1lbnRhdGlvbiBiYWNrZ3JvdW5kXG4gKlxuICogVGhpcyByZWdleHAgd2FzIHBvcnRlZCBvdmVyIGZyb20gQW5ndWxhckpTIChzZWUgdGhlcmUgZm9yIGdpdCBoaXN0b3J5KTpcbiAqIGh0dHBzOi8vZ2l0aHViLmNvbS9hbmd1bGFyL2FuZ3VsYXIuanMvYmxvYi9jMTMzZWY4MzYvc3JjL25nL2RpcmVjdGl2ZS9pbnB1dC5qcyNMMjdcbiAqIEl0IGlzIGJhc2VkIG9uIHRoZVxuICogW1dIQVRXRyB2ZXJzaW9uXShodHRwczovL2h0bWwuc3BlYy53aGF0d2cub3JnL211bHRpcGFnZS9pbnB1dC5odG1sI3ZhbGlkLWUtbWFpbC1hZGRyZXNzKSB3aXRoXG4gKiBzb21lIGVuaGFuY2VtZW50cyB0byBpbmNvcnBvcmF0ZSBtb3JlIFJGQyBydWxlcyAoc3VjaCBhcyBydWxlcyByZWxhdGVkIHRvIGRvbWFpbiBuYW1lcyBhbmQgdGhlXG4gKiBsZW5ndGhzIG9mIGRpZmZlcmVudCBwYXJ0cyBvZiB0aGUgYWRkcmVzcykuIFRoZSBtYWluIGRpZmZlcmVuY2VzIGZyb20gdGhlIFdIQVRXRyB2ZXJzaW9uIGFyZTpcbiAqICAgLSBEaXNhbGxvdyBgbG9jYWwtcGFydGAgdG8gYmVnaW4gb3IgZW5kIHdpdGggYSBwZXJpb2QgKGAuYCkuXG4gKiAgIC0gRGlzYWxsb3cgYGxvY2FsLXBhcnRgIGxlbmd0aCB0byBleGNlZWQgNjQgY2hhcmFjdGVycy5cbiAqICAgLSBEaXNhbGxvdyB0b3RhbCBhZGRyZXNzIGxlbmd0aCB0byBleGNlZWQgMjU0IGNoYXJhY3RlcnMuXG4gKlxuICogU2VlIFt0aGlzIGNvbW1pdF0oaHR0cHM6Ly9naXRodWIuY29tL2FuZ3VsYXIvYW5ndWxhci5qcy9jb21taXQvZjNmNWNmNzJlKSBmb3IgbW9yZSBkZXRhaWxzLlxuICovXG5jb25zdCBFTUFJTF9SRUdFWFAgPVxuICAgIC9eKD89LnsxLDI1NH0kKSg/PS57MSw2NH1AKVthLXpBLVowLTkhIyQlJicqKy89P15fYHt8fX4tXSsoPzpcXC5bYS16QS1aMC05ISMkJSYnKisvPT9eX2B7fH1+LV0rKSpAW2EtekEtWjAtOV0oPzpbYS16QS1aMC05LV17MCw2MX1bYS16QS1aMC05XSk/KD86XFwuW2EtekEtWjAtOV0oPzpbYS16QS1aMC05LV17MCw2MX1bYS16QS1aMC05XSk/KSokLztcblxuLyoqXG4gKiBAZGVzY3JpcHRpb25cbiAqIFByb3ZpZGVzIGEgc2V0IG9mIGJ1aWx0LWluIHZhbGlkYXRvcnMgdGhhdCBjYW4gYmUgdXNlZCBieSBmb3JtIGNvbnRyb2xzLlxuICpcbiAqIEEgdmFsaWRhdG9yIGlzIGEgZnVuY3Rpb24gdGhhdCBwcm9jZXNzZXMgYSBgRm9ybUNvbnRyb2xgIG9yIGNvbGxlY3Rpb24gb2ZcbiAqIGNvbnRyb2xzIGFuZCByZXR1cm5zIGFuIGVycm9yIG1hcCBvciBudWxsLiBBIG51bGwgbWFwIG1lYW5zIHRoYXQgdmFsaWRhdGlvbiBoYXMgcGFzc2VkLlxuICpcbiAqIEBzZWUgW0Zvcm0gVmFsaWRhdGlvbl0oL2d1aWRlL2Zvcm0tdmFsaWRhdGlvbilcbiAqXG4gKiBAcHVibGljQXBpXG4gKi9cbmV4cG9ydCBjbGFzcyBWYWxpZGF0b3JzIHtcbiAgLyoqXG4gICAqIEBkZXNjcmlwdGlvblxuICAgKiBWYWxpZGF0b3IgdGhhdCByZXF1aXJlcyB0aGUgY29udHJvbCdzIHZhbHVlIHRvIGJlIGdyZWF0ZXIgdGhhbiBvciBlcXVhbCB0byB0aGUgcHJvdmlkZWQgbnVtYmVyLlxuICAgKlxuICAgKiBAdXNhZ2VOb3Rlc1xuICAgKlxuICAgKiAjIyMgVmFsaWRhdGUgYWdhaW5zdCBhIG1pbmltdW0gb2YgM1xuICAgKlxuICAgKiBgYGB0eXBlc2NyaXB0XG4gICAqIGNvbnN0IGNvbnRyb2wgPSBuZXcgRm9ybUNvbnRyb2woMiwgVmFsaWRhdG9ycy5taW4oMykpO1xuICAgKlxuICAgKiBjb25zb2xlLmxvZyhjb250cm9sLmVycm9ycyk7IC8vIHttaW46IHttaW46IDMsIGFjdHVhbDogMn19XG4gICAqIGBgYFxuICAgKlxuICAgKiBAcmV0dXJucyBBIHZhbGlkYXRvciBmdW5jdGlvbiB0aGF0IHJldHVybnMgYW4gZXJyb3IgbWFwIHdpdGggdGhlXG4gICAqIGBtaW5gIHByb3BlcnR5IGlmIHRoZSB2YWxpZGF0aW9uIGNoZWNrIGZhaWxzLCBvdGhlcndpc2UgYG51bGxgLlxuICAgKlxuICAgKiBAc2VlIGB1cGRhdGVWYWx1ZUFuZFZhbGlkaXR5KClgXG4gICAqXG4gICAqL1xuICBzdGF0aWMgbWluKG1pbjogbnVtYmVyKTogVmFsaWRhdG9yRm4ge1xuICAgIHJldHVybiBtaW5WYWxpZGF0b3IobWluKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBAZGVzY3JpcHRpb25cbiAgICogVmFsaWRhdG9yIHRoYXQgcmVxdWlyZXMgdGhlIGNvbnRyb2wncyB2YWx1ZSB0byBiZSBsZXNzIHRoYW4gb3IgZXF1YWwgdG8gdGhlIHByb3ZpZGVkIG51bWJlci5cbiAgICpcbiAgICogQHVzYWdlTm90ZXNcbiAgICpcbiAgICogIyMjIFZhbGlkYXRlIGFnYWluc3QgYSBtYXhpbXVtIG9mIDE1XG4gICAqXG4gICAqIGBgYHR5cGVzY3JpcHRcbiAgICogY29uc3QgY29udHJvbCA9IG5ldyBGb3JtQ29udHJvbCgxNiwgVmFsaWRhdG9ycy5tYXgoMTUpKTtcbiAgICpcbiAgICogY29uc29sZS5sb2coY29udHJvbC5lcnJvcnMpOyAvLyB7bWF4OiB7bWF4OiAxNSwgYWN0dWFsOiAxNn19XG4gICAqIGBgYFxuICAgKlxuICAgKiBAcmV0dXJucyBBIHZhbGlkYXRvciBmdW5jdGlvbiB0aGF0IHJldHVybnMgYW4gZXJyb3IgbWFwIHdpdGggdGhlXG4gICAqIGBtYXhgIHByb3BlcnR5IGlmIHRoZSB2YWxpZGF0aW9uIGNoZWNrIGZhaWxzLCBvdGhlcndpc2UgYG51bGxgLlxuICAgKlxuICAgKiBAc2VlIGB1cGRhdGVWYWx1ZUFuZFZhbGlkaXR5KClgXG4gICAqXG4gICAqL1xuICBzdGF0aWMgbWF4KG1heDogbnVtYmVyKTogVmFsaWRhdG9yRm4ge1xuICAgIHJldHVybiBtYXhWYWxpZGF0b3IobWF4KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBAZGVzY3JpcHRpb25cbiAgICogVmFsaWRhdG9yIHRoYXQgcmVxdWlyZXMgdGhlIGNvbnRyb2wgaGF2ZSBhIG5vbi1lbXB0eSB2YWx1ZS5cbiAgICpcbiAgICogQHVzYWdlTm90ZXNcbiAgICpcbiAgICogIyMjIFZhbGlkYXRlIHRoYXQgdGhlIGZpZWxkIGlzIG5vbi1lbXB0eVxuICAgKlxuICAgKiBgYGB0eXBlc2NyaXB0XG4gICAqIGNvbnN0IGNvbnRyb2wgPSBuZXcgRm9ybUNvbnRyb2woJycsIFZhbGlkYXRvcnMucmVxdWlyZWQpO1xuICAgKlxuICAgKiBjb25zb2xlLmxvZyhjb250cm9sLmVycm9ycyk7IC8vIHtyZXF1aXJlZDogdHJ1ZX1cbiAgICogYGBgXG4gICAqXG4gICAqIEByZXR1cm5zIEFuIGVycm9yIG1hcCB3aXRoIHRoZSBgcmVxdWlyZWRgIHByb3BlcnR5XG4gICAqIGlmIHRoZSB2YWxpZGF0aW9uIGNoZWNrIGZhaWxzLCBvdGhlcndpc2UgYG51bGxgLlxuICAgKlxuICAgKiBAc2VlIGB1cGRhdGVWYWx1ZUFuZFZhbGlkaXR5KClgXG4gICAqXG4gICAqL1xuICBzdGF0aWMgcmVxdWlyZWQoY29udHJvbDogQWJzdHJhY3RDb250cm9sKTogVmFsaWRhdGlvbkVycm9yc3xudWxsIHtcbiAgICByZXR1cm4gcmVxdWlyZWRWYWxpZGF0b3IoY29udHJvbCk7XG4gIH1cblxuICAvKipcbiAgICogQGRlc2NyaXB0aW9uXG4gICAqIFZhbGlkYXRvciB0aGF0IHJlcXVpcmVzIHRoZSBjb250cm9sJ3MgdmFsdWUgYmUgdHJ1ZS4gVGhpcyB2YWxpZGF0b3IgaXMgY29tbW9ubHlcbiAgICogdXNlZCBmb3IgcmVxdWlyZWQgY2hlY2tib3hlcy5cbiAgICpcbiAgICogQHVzYWdlTm90ZXNcbiAgICpcbiAgICogIyMjIFZhbGlkYXRlIHRoYXQgdGhlIGZpZWxkIHZhbHVlIGlzIHRydWVcbiAgICpcbiAgICogYGBgdHlwZXNjcmlwdFxuICAgKiBjb25zdCBjb250cm9sID0gbmV3IEZvcm1Db250cm9sKCcnLCBWYWxpZGF0b3JzLnJlcXVpcmVkVHJ1ZSk7XG4gICAqXG4gICAqIGNvbnNvbGUubG9nKGNvbnRyb2wuZXJyb3JzKTsgLy8ge3JlcXVpcmVkOiB0cnVlfVxuICAgKiBgYGBcbiAgICpcbiAgICogQHJldHVybnMgQW4gZXJyb3IgbWFwIHRoYXQgY29udGFpbnMgdGhlIGByZXF1aXJlZGAgcHJvcGVydHlcbiAgICogc2V0IHRvIGB0cnVlYCBpZiB0aGUgdmFsaWRhdGlvbiBjaGVjayBmYWlscywgb3RoZXJ3aXNlIGBudWxsYC5cbiAgICpcbiAgICogQHNlZSBgdXBkYXRlVmFsdWVBbmRWYWxpZGl0eSgpYFxuICAgKlxuICAgKi9cbiAgc3RhdGljIHJlcXVpcmVkVHJ1ZShjb250cm9sOiBBYnN0cmFjdENvbnRyb2wpOiBWYWxpZGF0aW9uRXJyb3JzfG51bGwge1xuICAgIHJldHVybiByZXF1aXJlZFRydWVWYWxpZGF0b3IoY29udHJvbCk7XG4gIH1cblxuICAvKipcbiAgICogQGRlc2NyaXB0aW9uXG4gICAqIFZhbGlkYXRvciB0aGF0IHJlcXVpcmVzIHRoZSBjb250cm9sJ3MgdmFsdWUgcGFzcyBhbiBlbWFpbCB2YWxpZGF0aW9uIHRlc3QuXG4gICAqXG4gICAqIFRlc3RzIHRoZSB2YWx1ZSB1c2luZyBhIFtyZWd1bGFyXG4gICAqIGV4cHJlc3Npb25dKGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0phdmFTY3JpcHQvR3VpZGUvUmVndWxhcl9FeHByZXNzaW9ucylcbiAgICogcGF0dGVybiBzdWl0YWJsZSBmb3IgY29tbW9uIHVzZWNhc2VzLiBUaGUgcGF0dGVybiBpcyBiYXNlZCBvbiB0aGUgZGVmaW5pdGlvbiBvZiBhIHZhbGlkIGVtYWlsXG4gICAqIGFkZHJlc3MgaW4gdGhlIFtXSEFUV0cgSFRNTFxuICAgKiBzcGVjaWZpY2F0aW9uXShodHRwczovL2h0bWwuc3BlYy53aGF0d2cub3JnL211bHRpcGFnZS9pbnB1dC5odG1sI3ZhbGlkLWUtbWFpbC1hZGRyZXNzKSB3aXRoXG4gICAqIHNvbWUgZW5oYW5jZW1lbnRzIHRvIGluY29ycG9yYXRlIG1vcmUgUkZDIHJ1bGVzIChzdWNoIGFzIHJ1bGVzIHJlbGF0ZWQgdG8gZG9tYWluIG5hbWVzIGFuZCB0aGVcbiAgICogbGVuZ3RocyBvZiBkaWZmZXJlbnQgcGFydHMgb2YgdGhlIGFkZHJlc3MpLlxuICAgKlxuICAgKiBUaGUgZGlmZmVyZW5jZXMgZnJvbSB0aGUgV0hBVFdHIHZlcnNpb24gaW5jbHVkZTpcbiAgICogLSBEaXNhbGxvdyBgbG9jYWwtcGFydGAgKHRoZSBwYXJ0IGJlZm9yZSB0aGUgYEBgIHN5bWJvbCkgdG8gYmVnaW4gb3IgZW5kIHdpdGggYSBwZXJpb2QgKGAuYCkuXG4gICAqIC0gRGlzYWxsb3cgYGxvY2FsLXBhcnRgIHRvIGJlIGxvbmdlciB0aGFuIDY0IGNoYXJhY3RlcnMuXG4gICAqIC0gRGlzYWxsb3cgdGhlIHdob2xlIGFkZHJlc3MgdG8gYmUgbG9uZ2VyIHRoYW4gMjU0IGNoYXJhY3RlcnMuXG4gICAqXG4gICAqIElmIHRoaXMgcGF0dGVybiBkb2VzIG5vdCBzYXRpc2Z5IHlvdXIgYnVzaW5lc3MgbmVlZHMsIHlvdSBjYW4gdXNlIGBWYWxpZGF0b3JzLnBhdHRlcm4oKWAgdG9cbiAgICogdmFsaWRhdGUgdGhlIHZhbHVlIGFnYWluc3QgYSBkaWZmZXJlbnQgcGF0dGVybi5cbiAgICpcbiAgICogQHVzYWdlTm90ZXNcbiAgICpcbiAgICogIyMjIFZhbGlkYXRlIHRoYXQgdGhlIGZpZWxkIG1hdGNoZXMgYSB2YWxpZCBlbWFpbCBwYXR0ZXJuXG4gICAqXG4gICAqIGBgYHR5cGVzY3JpcHRcbiAgICogY29uc3QgY29udHJvbCA9IG5ldyBGb3JtQ29udHJvbCgnYmFkQCcsIFZhbGlkYXRvcnMuZW1haWwpO1xuICAgKlxuICAgKiBjb25zb2xlLmxvZyhjb250cm9sLmVycm9ycyk7IC8vIHtlbWFpbDogdHJ1ZX1cbiAgICogYGBgXG4gICAqXG4gICAqIEByZXR1cm5zIEFuIGVycm9yIG1hcCB3aXRoIHRoZSBgZW1haWxgIHByb3BlcnR5XG4gICAqIGlmIHRoZSB2YWxpZGF0aW9uIGNoZWNrIGZhaWxzLCBvdGhlcndpc2UgYG51bGxgLlxuICAgKlxuICAgKiBAc2VlIGB1cGRhdGVWYWx1ZUFuZFZhbGlkaXR5KClgXG4gICAqXG4gICAqL1xuICBzdGF0aWMgZW1haWwoY29udHJvbDogQWJzdHJhY3RDb250cm9sKTogVmFsaWRhdGlvbkVycm9yc3xudWxsIHtcbiAgICByZXR1cm4gZW1haWxWYWxpZGF0b3IoY29udHJvbCk7XG4gIH1cblxuICAvKipcbiAgICogQGRlc2NyaXB0aW9uXG4gICAqIFZhbGlkYXRvciB0aGF0IHJlcXVpcmVzIHRoZSBsZW5ndGggb2YgdGhlIGNvbnRyb2wncyB2YWx1ZSB0byBiZSBncmVhdGVyIHRoYW4gb3IgZXF1YWxcbiAgICogdG8gdGhlIHByb3ZpZGVkIG1pbmltdW0gbGVuZ3RoLiBUaGlzIHZhbGlkYXRvciBpcyBhbHNvIHByb3ZpZGVkIGJ5IGRlZmF1bHQgaWYgeW91IHVzZSB0aGVcbiAgICogdGhlIEhUTUw1IGBtaW5sZW5ndGhgIGF0dHJpYnV0ZS4gTm90ZSB0aGF0IHRoZSBgbWluTGVuZ3RoYCB2YWxpZGF0b3IgaXMgaW50ZW5kZWQgdG8gYmUgdXNlZFxuICAgKiBvbmx5IGZvciB0eXBlcyB0aGF0IGhhdmUgYSBudW1lcmljIGBsZW5ndGhgIHByb3BlcnR5LCBzdWNoIGFzIHN0cmluZ3Mgb3IgYXJyYXlzLiBUaGVcbiAgICogYG1pbkxlbmd0aGAgdmFsaWRhdG9yIGxvZ2ljIGlzIGFsc28gbm90IGludm9rZWQgZm9yIHZhbHVlcyB3aGVuIHRoZWlyIGBsZW5ndGhgIHByb3BlcnR5IGlzIDBcbiAgICogKGZvciBleGFtcGxlIGluIGNhc2Ugb2YgYW4gZW1wdHkgc3RyaW5nIG9yIGFuIGVtcHR5IGFycmF5KSwgdG8gc3VwcG9ydCBvcHRpb25hbCBjb250cm9scy4gWW91XG4gICAqIGNhbiB1c2UgdGhlIHN0YW5kYXJkIGByZXF1aXJlZGAgdmFsaWRhdG9yIGlmIGVtcHR5IHZhbHVlcyBzaG91bGQgbm90IGJlIGNvbnNpZGVyZWQgdmFsaWQuXG4gICAqXG4gICAqIEB1c2FnZU5vdGVzXG4gICAqXG4gICAqICMjIyBWYWxpZGF0ZSB0aGF0IHRoZSBmaWVsZCBoYXMgYSBtaW5pbXVtIG9mIDMgY2hhcmFjdGVyc1xuICAgKlxuICAgKiBgYGB0eXBlc2NyaXB0XG4gICAqIGNvbnN0IGNvbnRyb2wgPSBuZXcgRm9ybUNvbnRyb2woJ25nJywgVmFsaWRhdG9ycy5taW5MZW5ndGgoMykpO1xuICAgKlxuICAgKiBjb25zb2xlLmxvZyhjb250cm9sLmVycm9ycyk7IC8vIHttaW5sZW5ndGg6IHtyZXF1aXJlZExlbmd0aDogMywgYWN0dWFsTGVuZ3RoOiAyfX1cbiAgICogYGBgXG4gICAqXG4gICAqIGBgYGh0bWxcbiAgICogPGlucHV0IG1pbmxlbmd0aD1cIjVcIj5cbiAgICogYGBgXG4gICAqXG4gICAqIEByZXR1cm5zIEEgdmFsaWRhdG9yIGZ1bmN0aW9uIHRoYXQgcmV0dXJucyBhbiBlcnJvciBtYXAgd2l0aCB0aGVcbiAgICogYG1pbmxlbmd0aGAgcHJvcGVydHkgaWYgdGhlIHZhbGlkYXRpb24gY2hlY2sgZmFpbHMsIG90aGVyd2lzZSBgbnVsbGAuXG4gICAqXG4gICAqIEBzZWUgYHVwZGF0ZVZhbHVlQW5kVmFsaWRpdHkoKWBcbiAgICpcbiAgICovXG4gIHN0YXRpYyBtaW5MZW5ndGgobWluTGVuZ3RoOiBudW1iZXIpOiBWYWxpZGF0b3JGbiB7XG4gICAgcmV0dXJuIG1pbkxlbmd0aFZhbGlkYXRvcihtaW5MZW5ndGgpO1xuICB9XG5cbiAgLyoqXG4gICAqIEBkZXNjcmlwdGlvblxuICAgKiBWYWxpZGF0b3IgdGhhdCByZXF1aXJlcyB0aGUgbGVuZ3RoIG9mIHRoZSBjb250cm9sJ3MgdmFsdWUgdG8gYmUgbGVzcyB0aGFuIG9yIGVxdWFsXG4gICAqIHRvIHRoZSBwcm92aWRlZCBtYXhpbXVtIGxlbmd0aC4gVGhpcyB2YWxpZGF0b3IgaXMgYWxzbyBwcm92aWRlZCBieSBkZWZhdWx0IGlmIHlvdSB1c2UgdGhlXG4gICAqIHRoZSBIVE1MNSBgbWF4bGVuZ3RoYCBhdHRyaWJ1dGUuIE5vdGUgdGhhdCB0aGUgYG1heExlbmd0aGAgdmFsaWRhdG9yIGlzIGludGVuZGVkIHRvIGJlIHVzZWRcbiAgICogb25seSBmb3IgdHlwZXMgdGhhdCBoYXZlIGEgbnVtZXJpYyBgbGVuZ3RoYCBwcm9wZXJ0eSwgc3VjaCBhcyBzdHJpbmdzIG9yIGFycmF5cy5cbiAgICpcbiAgICogQHVzYWdlTm90ZXNcbiAgICpcbiAgICogIyMjIFZhbGlkYXRlIHRoYXQgdGhlIGZpZWxkIGhhcyBtYXhpbXVtIG9mIDUgY2hhcmFjdGVyc1xuICAgKlxuICAgKiBgYGB0eXBlc2NyaXB0XG4gICAqIGNvbnN0IGNvbnRyb2wgPSBuZXcgRm9ybUNvbnRyb2woJ0FuZ3VsYXInLCBWYWxpZGF0b3JzLm1heExlbmd0aCg1KSk7XG4gICAqXG4gICAqIGNvbnNvbGUubG9nKGNvbnRyb2wuZXJyb3JzKTsgLy8ge21heGxlbmd0aDoge3JlcXVpcmVkTGVuZ3RoOiA1LCBhY3R1YWxMZW5ndGg6IDd9fVxuICAgKiBgYGBcbiAgICpcbiAgICogYGBgaHRtbFxuICAgKiA8aW5wdXQgbWF4bGVuZ3RoPVwiNVwiPlxuICAgKiBgYGBcbiAgICpcbiAgICogQHJldHVybnMgQSB2YWxpZGF0b3IgZnVuY3Rpb24gdGhhdCByZXR1cm5zIGFuIGVycm9yIG1hcCB3aXRoIHRoZVxuICAgKiBgbWF4bGVuZ3RoYCBwcm9wZXJ0eSBpZiB0aGUgdmFsaWRhdGlvbiBjaGVjayBmYWlscywgb3RoZXJ3aXNlIGBudWxsYC5cbiAgICpcbiAgICogQHNlZSBgdXBkYXRlVmFsdWVBbmRWYWxpZGl0eSgpYFxuICAgKlxuICAgKi9cbiAgc3RhdGljIG1heExlbmd0aChtYXhMZW5ndGg6IG51bWJlcik6IFZhbGlkYXRvckZuIHtcbiAgICByZXR1cm4gbWF4TGVuZ3RoVmFsaWRhdG9yKG1heExlbmd0aCk7XG4gIH1cblxuICAvKipcbiAgICogQGRlc2NyaXB0aW9uXG4gICAqIFZhbGlkYXRvciB0aGF0IHJlcXVpcmVzIHRoZSBjb250cm9sJ3MgdmFsdWUgdG8gbWF0Y2ggYSByZWdleCBwYXR0ZXJuLiBUaGlzIHZhbGlkYXRvciBpcyBhbHNvXG4gICAqIHByb3ZpZGVkIGJ5IGRlZmF1bHQgaWYgeW91IHVzZSB0aGUgSFRNTDUgYHBhdHRlcm5gIGF0dHJpYnV0ZS5cbiAgICpcbiAgICogQHVzYWdlTm90ZXNcbiAgICpcbiAgICogIyMjIFZhbGlkYXRlIHRoYXQgdGhlIGZpZWxkIG9ubHkgY29udGFpbnMgbGV0dGVycyBvciBzcGFjZXNcbiAgICpcbiAgICogYGBgdHlwZXNjcmlwdFxuICAgKiBjb25zdCBjb250cm9sID0gbmV3IEZvcm1Db250cm9sKCcxJywgVmFsaWRhdG9ycy5wYXR0ZXJuKCdbYS16QS1aIF0qJykpO1xuICAgKlxuICAgKiBjb25zb2xlLmxvZyhjb250cm9sLmVycm9ycyk7IC8vIHtwYXR0ZXJuOiB7cmVxdWlyZWRQYXR0ZXJuOiAnXlthLXpBLVogXSokJywgYWN0dWFsVmFsdWU6ICcxJ319XG4gICAqIGBgYFxuICAgKlxuICAgKiBgYGBodG1sXG4gICAqIDxpbnB1dCBwYXR0ZXJuPVwiW2EtekEtWiBdKlwiPlxuICAgKiBgYGBcbiAgICpcbiAgICogIyMjIFBhdHRlcm4gbWF0Y2hpbmcgd2l0aCB0aGUgZ2xvYmFsIG9yIHN0aWNreSBmbGFnXG4gICAqXG4gICAqIGBSZWdFeHBgIG9iamVjdHMgY3JlYXRlZCB3aXRoIHRoZSBgZ2Agb3IgYHlgIGZsYWdzIHRoYXQgYXJlIHBhc3NlZCBpbnRvIGBWYWxpZGF0b3JzLnBhdHRlcm5gXG4gICAqIGNhbiBwcm9kdWNlIGRpZmZlcmVudCByZXN1bHRzIG9uIHRoZSBzYW1lIGlucHV0IHdoZW4gdmFsaWRhdGlvbnMgYXJlIHJ1biBjb25zZWN1dGl2ZWx5LiBUaGlzIGlzXG4gICAqIGR1ZSB0byBob3cgdGhlIGJlaGF2aW9yIG9mIGBSZWdFeHAucHJvdG90eXBlLnRlc3RgIGlzXG4gICAqIHNwZWNpZmllZCBpbiBbRUNNQS0yNjJdKGh0dHBzOi8vdGMzOS5lcy9lY21hMjYyLyNzZWMtcmVnZXhwYnVpbHRpbmV4ZWMpXG4gICAqIChgUmVnRXhwYCBwcmVzZXJ2ZXMgdGhlIGluZGV4IG9mIHRoZSBsYXN0IG1hdGNoIHdoZW4gdGhlIGdsb2JhbCBvciBzdGlja3kgZmxhZyBpcyB1c2VkKS5cbiAgICogRHVlIHRvIHRoaXMgYmVoYXZpb3IsIGl0IGlzIHJlY29tbWVuZGVkIHRoYXQgd2hlbiB1c2luZ1xuICAgKiBgVmFsaWRhdG9ycy5wYXR0ZXJuYCB5b3UgKipkbyBub3QqKiBwYXNzIGluIGEgYFJlZ0V4cGAgb2JqZWN0IHdpdGggZWl0aGVyIHRoZSBnbG9iYWwgb3Igc3RpY2t5XG4gICAqIGZsYWcgZW5hYmxlZC5cbiAgICpcbiAgICogYGBgdHlwZXNjcmlwdFxuICAgKiAvLyBOb3QgcmVjb21tZW5kZWQgKHNpbmNlIHRoZSBgZ2AgZmxhZyBpcyB1c2VkKVxuICAgKiBjb25zdCBjb250cm9sT25lID0gbmV3IEZvcm1Db250cm9sKCcxJywgVmFsaWRhdG9ycy5wYXR0ZXJuKC9mb28vZykpO1xuICAgKlxuICAgKiAvLyBHb29kXG4gICAqIGNvbnN0IGNvbnRyb2xUd28gPSBuZXcgRm9ybUNvbnRyb2woJzEnLCBWYWxpZGF0b3JzLnBhdHRlcm4oL2Zvby8pKTtcbiAgICogYGBgXG4gICAqXG4gICAqIEBwYXJhbSBwYXR0ZXJuIEEgcmVndWxhciBleHByZXNzaW9uIHRvIGJlIHVzZWQgYXMgaXMgdG8gdGVzdCB0aGUgdmFsdWVzLCBvciBhIHN0cmluZy5cbiAgICogSWYgYSBzdHJpbmcgaXMgcGFzc2VkLCB0aGUgYF5gIGNoYXJhY3RlciBpcyBwcmVwZW5kZWQgYW5kIHRoZSBgJGAgY2hhcmFjdGVyIGlzXG4gICAqIGFwcGVuZGVkIHRvIHRoZSBwcm92aWRlZCBzdHJpbmcgKGlmIG5vdCBhbHJlYWR5IHByZXNlbnQpLCBhbmQgdGhlIHJlc3VsdGluZyByZWd1bGFyXG4gICAqIGV4cHJlc3Npb24gaXMgdXNlZCB0byB0ZXN0IHRoZSB2YWx1ZXMuXG4gICAqXG4gICAqIEByZXR1cm5zIEEgdmFsaWRhdG9yIGZ1bmN0aW9uIHRoYXQgcmV0dXJucyBhbiBlcnJvciBtYXAgd2l0aCB0aGVcbiAgICogYHBhdHRlcm5gIHByb3BlcnR5IGlmIHRoZSB2YWxpZGF0aW9uIGNoZWNrIGZhaWxzLCBvdGhlcndpc2UgYG51bGxgLlxuICAgKlxuICAgKiBAc2VlIGB1cGRhdGVWYWx1ZUFuZFZhbGlkaXR5KClgXG4gICAqXG4gICAqL1xuICBzdGF0aWMgcGF0dGVybihwYXR0ZXJuOiBzdHJpbmd8UmVnRXhwKTogVmFsaWRhdG9yRm4ge1xuICAgIHJldHVybiBwYXR0ZXJuVmFsaWRhdG9yKHBhdHRlcm4pO1xuICB9XG5cbiAgLyoqXG4gICAqIEBkZXNjcmlwdGlvblxuICAgKiBWYWxpZGF0b3IgdGhhdCBwZXJmb3JtcyBubyBvcGVyYXRpb24uXG4gICAqXG4gICAqIEBzZWUgYHVwZGF0ZVZhbHVlQW5kVmFsaWRpdHkoKWBcbiAgICpcbiAgICovXG4gIHN0YXRpYyBudWxsVmFsaWRhdG9yKGNvbnRyb2w6IEFic3RyYWN0Q29udHJvbCk6IFZhbGlkYXRpb25FcnJvcnN8bnVsbCB7XG4gICAgcmV0dXJuIG51bGxWYWxpZGF0b3IoY29udHJvbCk7XG4gIH1cblxuICAvKipcbiAgICogQGRlc2NyaXB0aW9uXG4gICAqIENvbXBvc2UgbXVsdGlwbGUgdmFsaWRhdG9ycyBpbnRvIGEgc2luZ2xlIGZ1bmN0aW9uIHRoYXQgcmV0dXJucyB0aGUgdW5pb25cbiAgICogb2YgdGhlIGluZGl2aWR1YWwgZXJyb3IgbWFwcyBmb3IgdGhlIHByb3ZpZGVkIGNvbnRyb2wuXG4gICAqXG4gICAqIEByZXR1cm5zIEEgdmFsaWRhdG9yIGZ1bmN0aW9uIHRoYXQgcmV0dXJucyBhbiBlcnJvciBtYXAgd2l0aCB0aGVcbiAgICogbWVyZ2VkIGVycm9yIG1hcHMgb2YgdGhlIHZhbGlkYXRvcnMgaWYgdGhlIHZhbGlkYXRpb24gY2hlY2sgZmFpbHMsIG90aGVyd2lzZSBgbnVsbGAuXG4gICAqXG4gICAqIEBzZWUgYHVwZGF0ZVZhbHVlQW5kVmFsaWRpdHkoKWBcbiAgICpcbiAgICovXG4gIHN0YXRpYyBjb21wb3NlKHZhbGlkYXRvcnM6IG51bGwpOiBudWxsO1xuICBzdGF0aWMgY29tcG9zZSh2YWxpZGF0b3JzOiAoVmFsaWRhdG9yRm58bnVsbHx1bmRlZmluZWQpW10pOiBWYWxpZGF0b3JGbnxudWxsO1xuICBzdGF0aWMgY29tcG9zZSh2YWxpZGF0b3JzOiAoVmFsaWRhdG9yRm58bnVsbHx1bmRlZmluZWQpW118bnVsbCk6IFZhbGlkYXRvckZufG51bGwge1xuICAgIHJldHVybiBjb21wb3NlKHZhbGlkYXRvcnMpO1xuICB9XG5cbiAgLyoqXG4gICAqIEBkZXNjcmlwdGlvblxuICAgKiBDb21wb3NlIG11bHRpcGxlIGFzeW5jIHZhbGlkYXRvcnMgaW50byBhIHNpbmdsZSBmdW5jdGlvbiB0aGF0IHJldHVybnMgdGhlIHVuaW9uXG4gICAqIG9mIHRoZSBpbmRpdmlkdWFsIGVycm9yIG9iamVjdHMgZm9yIHRoZSBwcm92aWRlZCBjb250cm9sLlxuICAgKlxuICAgKiBAcmV0dXJucyBBIHZhbGlkYXRvciBmdW5jdGlvbiB0aGF0IHJldHVybnMgYW4gZXJyb3IgbWFwIHdpdGggdGhlXG4gICAqIG1lcmdlZCBlcnJvciBvYmplY3RzIG9mIHRoZSBhc3luYyB2YWxpZGF0b3JzIGlmIHRoZSB2YWxpZGF0aW9uIGNoZWNrIGZhaWxzLCBvdGhlcndpc2UgYG51bGxgLlxuICAgKlxuICAgKiBAc2VlIGB1cGRhdGVWYWx1ZUFuZFZhbGlkaXR5KClgXG4gICAqXG4gICAqL1xuICBzdGF0aWMgY29tcG9zZUFzeW5jKHZhbGlkYXRvcnM6IChBc3luY1ZhbGlkYXRvckZufG51bGwpW10pOiBBc3luY1ZhbGlkYXRvckZufG51bGwge1xuICAgIHJldHVybiBjb21wb3NlQXN5bmModmFsaWRhdG9ycyk7XG4gIH1cbn1cblxuLyoqXG4gKiBWYWxpZGF0b3IgdGhhdCByZXF1aXJlcyB0aGUgY29udHJvbCdzIHZhbHVlIHRvIGJlIGdyZWF0ZXIgdGhhbiBvciBlcXVhbCB0byB0aGUgcHJvdmlkZWQgbnVtYmVyLlxuICogU2VlIGBWYWxpZGF0b3JzLm1pbmAgZm9yIGFkZGl0aW9uYWwgaW5mb3JtYXRpb24uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtaW5WYWxpZGF0b3IobWluOiBudW1iZXIpOiBWYWxpZGF0b3JGbiB7XG4gIHJldHVybiAoY29udHJvbDogQWJzdHJhY3RDb250cm9sKTogVmFsaWRhdGlvbkVycm9yc3xudWxsID0+IHtcbiAgICBpZiAoaXNFbXB0eUlucHV0VmFsdWUoY29udHJvbC52YWx1ZSkgfHwgaXNFbXB0eUlucHV0VmFsdWUobWluKSkge1xuICAgICAgcmV0dXJuIG51bGw7ICAvLyBkb24ndCB2YWxpZGF0ZSBlbXB0eSB2YWx1ZXMgdG8gYWxsb3cgb3B0aW9uYWwgY29udHJvbHNcbiAgICB9XG4gICAgY29uc3QgdmFsdWUgPSBwYXJzZUZsb2F0KGNvbnRyb2wudmFsdWUpO1xuICAgIC8vIENvbnRyb2xzIHdpdGggTmFOIHZhbHVlcyBhZnRlciBwYXJzaW5nIHNob3VsZCBiZSB0cmVhdGVkIGFzIG5vdCBoYXZpbmcgYVxuICAgIC8vIG1pbmltdW0sIHBlciB0aGUgSFRNTCBmb3JtcyBzcGVjOiBodHRwczovL3d3dy53My5vcmcvVFIvaHRtbDUvZm9ybXMuaHRtbCNhdHRyLWlucHV0LW1pblxuICAgIHJldHVybiAhaXNOYU4odmFsdWUpICYmIHZhbHVlIDwgbWluID8geydtaW4nOiB7J21pbic6IG1pbiwgJ2FjdHVhbCc6IGNvbnRyb2wudmFsdWV9fSA6IG51bGw7XG4gIH07XG59XG5cbi8qKlxuICogVmFsaWRhdG9yIHRoYXQgcmVxdWlyZXMgdGhlIGNvbnRyb2wncyB2YWx1ZSB0byBiZSBsZXNzIHRoYW4gb3IgZXF1YWwgdG8gdGhlIHByb3ZpZGVkIG51bWJlci5cbiAqIFNlZSBgVmFsaWRhdG9ycy5tYXhgIGZvciBhZGRpdGlvbmFsIGluZm9ybWF0aW9uLlxuICovXG5leHBvcnQgZnVuY3Rpb24gbWF4VmFsaWRhdG9yKG1heDogbnVtYmVyKTogVmFsaWRhdG9yRm4ge1xuICByZXR1cm4gKGNvbnRyb2w6IEFic3RyYWN0Q29udHJvbCk6IFZhbGlkYXRpb25FcnJvcnN8bnVsbCA9PiB7XG4gICAgaWYgKGlzRW1wdHlJbnB1dFZhbHVlKGNvbnRyb2wudmFsdWUpIHx8IGlzRW1wdHlJbnB1dFZhbHVlKG1heCkpIHtcbiAgICAgIHJldHVybiBudWxsOyAgLy8gZG9uJ3QgdmFsaWRhdGUgZW1wdHkgdmFsdWVzIHRvIGFsbG93IG9wdGlvbmFsIGNvbnRyb2xzXG4gICAgfVxuICAgIGNvbnN0IHZhbHVlID0gcGFyc2VGbG9hdChjb250cm9sLnZhbHVlKTtcbiAgICAvLyBDb250cm9scyB3aXRoIE5hTiB2YWx1ZXMgYWZ0ZXIgcGFyc2luZyBzaG91bGQgYmUgdHJlYXRlZCBhcyBub3QgaGF2aW5nIGFcbiAgICAvLyBtYXhpbXVtLCBwZXIgdGhlIEhUTUwgZm9ybXMgc3BlYzogaHR0cHM6Ly93d3cudzMub3JnL1RSL2h0bWw1L2Zvcm1zLmh0bWwjYXR0ci1pbnB1dC1tYXhcbiAgICByZXR1cm4gIWlzTmFOKHZhbHVlKSAmJiB2YWx1ZSA+IG1heCA/IHsnbWF4JzogeydtYXgnOiBtYXgsICdhY3R1YWwnOiBjb250cm9sLnZhbHVlfX0gOiBudWxsO1xuICB9O1xufVxuXG4vKipcbiAqIFZhbGlkYXRvciB0aGF0IHJlcXVpcmVzIHRoZSBjb250cm9sIGhhdmUgYSBub24tZW1wdHkgdmFsdWUuXG4gKiBTZWUgYFZhbGlkYXRvcnMucmVxdWlyZWRgIGZvciBhZGRpdGlvbmFsIGluZm9ybWF0aW9uLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVxdWlyZWRWYWxpZGF0b3IoY29udHJvbDogQWJzdHJhY3RDb250cm9sKTogVmFsaWRhdGlvbkVycm9yc3xudWxsIHtcbiAgcmV0dXJuIGlzRW1wdHlJbnB1dFZhbHVlKGNvbnRyb2wudmFsdWUpID8geydyZXF1aXJlZCc6IHRydWV9IDogbnVsbDtcbn1cblxuLyoqXG4gKiBWYWxpZGF0b3IgdGhhdCByZXF1aXJlcyB0aGUgY29udHJvbCdzIHZhbHVlIGJlIHRydWUuIFRoaXMgdmFsaWRhdG9yIGlzIGNvbW1vbmx5XG4gKiB1c2VkIGZvciByZXF1aXJlZCBjaGVja2JveGVzLlxuICogU2VlIGBWYWxpZGF0b3JzLnJlcXVpcmVkVHJ1ZWAgZm9yIGFkZGl0aW9uYWwgaW5mb3JtYXRpb24uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXF1aXJlZFRydWVWYWxpZGF0b3IoY29udHJvbDogQWJzdHJhY3RDb250cm9sKTogVmFsaWRhdGlvbkVycm9yc3xudWxsIHtcbiAgcmV0dXJuIGNvbnRyb2wudmFsdWUgPT09IHRydWUgPyBudWxsIDogeydyZXF1aXJlZCc6IHRydWV9O1xufVxuXG4vKipcbiAqIFZhbGlkYXRvciB0aGF0IHJlcXVpcmVzIHRoZSBjb250cm9sJ3MgdmFsdWUgcGFzcyBhbiBlbWFpbCB2YWxpZGF0aW9uIHRlc3QuXG4gKiBTZWUgYFZhbGlkYXRvcnMuZW1haWxgIGZvciBhZGRpdGlvbmFsIGluZm9ybWF0aW9uLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZW1haWxWYWxpZGF0b3IoY29udHJvbDogQWJzdHJhY3RDb250cm9sKTogVmFsaWRhdGlvbkVycm9yc3xudWxsIHtcbiAgaWYgKGlzRW1wdHlJbnB1dFZhbHVlKGNvbnRyb2wudmFsdWUpKSB7XG4gICAgcmV0dXJuIG51bGw7ICAvLyBkb24ndCB2YWxpZGF0ZSBlbXB0eSB2YWx1ZXMgdG8gYWxsb3cgb3B0aW9uYWwgY29udHJvbHNcbiAgfVxuICByZXR1cm4gRU1BSUxfUkVHRVhQLnRlc3QoY29udHJvbC52YWx1ZSkgPyBudWxsIDogeydlbWFpbCc6IHRydWV9O1xufVxuXG4vKipcbiAqIFZhbGlkYXRvciB0aGF0IHJlcXVpcmVzIHRoZSBsZW5ndGggb2YgdGhlIGNvbnRyb2wncyB2YWx1ZSB0byBiZSBncmVhdGVyIHRoYW4gb3IgZXF1YWxcbiAqIHRvIHRoZSBwcm92aWRlZCBtaW5pbXVtIGxlbmd0aC4gU2VlIGBWYWxpZGF0b3JzLm1pbkxlbmd0aGAgZm9yIGFkZGl0aW9uYWwgaW5mb3JtYXRpb24uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtaW5MZW5ndGhWYWxpZGF0b3IobWluTGVuZ3RoOiBudW1iZXIpOiBWYWxpZGF0b3JGbiB7XG4gIHJldHVybiAoY29udHJvbDogQWJzdHJhY3RDb250cm9sKTogVmFsaWRhdGlvbkVycm9yc3xudWxsID0+IHtcbiAgICBpZiAoaXNFbXB0eUlucHV0VmFsdWUoY29udHJvbC52YWx1ZSkgfHwgIWhhc1ZhbGlkTGVuZ3RoKGNvbnRyb2wudmFsdWUpKSB7XG4gICAgICAvLyBkb24ndCB2YWxpZGF0ZSBlbXB0eSB2YWx1ZXMgdG8gYWxsb3cgb3B0aW9uYWwgY29udHJvbHNcbiAgICAgIC8vIGRvbid0IHZhbGlkYXRlIHZhbHVlcyB3aXRob3V0IGBsZW5ndGhgIHByb3BlcnR5XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICByZXR1cm4gY29udHJvbC52YWx1ZS5sZW5ndGggPCBtaW5MZW5ndGggP1xuICAgICAgICB7J21pbmxlbmd0aCc6IHsncmVxdWlyZWRMZW5ndGgnOiBtaW5MZW5ndGgsICdhY3R1YWxMZW5ndGgnOiBjb250cm9sLnZhbHVlLmxlbmd0aH19IDpcbiAgICAgICAgbnVsbDtcbiAgfTtcbn1cblxuLyoqXG4gKiBWYWxpZGF0b3IgdGhhdCByZXF1aXJlcyB0aGUgbGVuZ3RoIG9mIHRoZSBjb250cm9sJ3MgdmFsdWUgdG8gYmUgbGVzcyB0aGFuIG9yIGVxdWFsXG4gKiB0byB0aGUgcHJvdmlkZWQgbWF4aW11bSBsZW5ndGguIFNlZSBgVmFsaWRhdG9ycy5tYXhMZW5ndGhgIGZvciBhZGRpdGlvbmFsIGluZm9ybWF0aW9uLlxuICovXG5leHBvcnQgZnVuY3Rpb24gbWF4TGVuZ3RoVmFsaWRhdG9yKG1heExlbmd0aDogbnVtYmVyKTogVmFsaWRhdG9yRm4ge1xuICByZXR1cm4gKGNvbnRyb2w6IEFic3RyYWN0Q29udHJvbCk6IFZhbGlkYXRpb25FcnJvcnN8bnVsbCA9PiB7XG4gICAgcmV0dXJuIGhhc1ZhbGlkTGVuZ3RoKGNvbnRyb2wudmFsdWUpICYmIGNvbnRyb2wudmFsdWUubGVuZ3RoID4gbWF4TGVuZ3RoID9cbiAgICAgICAgeydtYXhsZW5ndGgnOiB7J3JlcXVpcmVkTGVuZ3RoJzogbWF4TGVuZ3RoLCAnYWN0dWFsTGVuZ3RoJzogY29udHJvbC52YWx1ZS5sZW5ndGh9fSA6XG4gICAgICAgIG51bGw7XG4gIH07XG59XG5cbi8qKlxuICogVmFsaWRhdG9yIHRoYXQgcmVxdWlyZXMgdGhlIGNvbnRyb2wncyB2YWx1ZSB0byBtYXRjaCBhIHJlZ2V4IHBhdHRlcm4uXG4gKiBTZWUgYFZhbGlkYXRvcnMucGF0dGVybmAgZm9yIGFkZGl0aW9uYWwgaW5mb3JtYXRpb24uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXR0ZXJuVmFsaWRhdG9yKHBhdHRlcm46IHN0cmluZ3xSZWdFeHApOiBWYWxpZGF0b3JGbiB7XG4gIGlmICghcGF0dGVybikgcmV0dXJuIG51bGxWYWxpZGF0b3I7XG4gIGxldCByZWdleDogUmVnRXhwO1xuICBsZXQgcmVnZXhTdHI6IHN0cmluZztcbiAgaWYgKHR5cGVvZiBwYXR0ZXJuID09PSAnc3RyaW5nJykge1xuICAgIHJlZ2V4U3RyID0gJyc7XG5cbiAgICBpZiAocGF0dGVybi5jaGFyQXQoMCkgIT09ICdeJykgcmVnZXhTdHIgKz0gJ14nO1xuXG4gICAgcmVnZXhTdHIgKz0gcGF0dGVybjtcblxuICAgIGlmIChwYXR0ZXJuLmNoYXJBdChwYXR0ZXJuLmxlbmd0aCAtIDEpICE9PSAnJCcpIHJlZ2V4U3RyICs9ICckJztcblxuICAgIHJlZ2V4ID0gbmV3IFJlZ0V4cChyZWdleFN0cik7XG4gIH0gZWxzZSB7XG4gICAgcmVnZXhTdHIgPSBwYXR0ZXJuLnRvU3RyaW5nKCk7XG4gICAgcmVnZXggPSBwYXR0ZXJuO1xuICB9XG4gIHJldHVybiAoY29udHJvbDogQWJzdHJhY3RDb250cm9sKTogVmFsaWRhdGlvbkVycm9yc3xudWxsID0+IHtcbiAgICBpZiAoaXNFbXB0eUlucHV0VmFsdWUoY29udHJvbC52YWx1ZSkpIHtcbiAgICAgIHJldHVybiBudWxsOyAgLy8gZG9uJ3QgdmFsaWRhdGUgZW1wdHkgdmFsdWVzIHRvIGFsbG93IG9wdGlvbmFsIGNvbnRyb2xzXG4gICAgfVxuICAgIGNvbnN0IHZhbHVlOiBzdHJpbmcgPSBjb250cm9sLnZhbHVlO1xuICAgIHJldHVybiByZWdleC50ZXN0KHZhbHVlKSA/IG51bGwgOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHsncGF0dGVybic6IHsncmVxdWlyZWRQYXR0ZXJuJzogcmVnZXhTdHIsICdhY3R1YWxWYWx1ZSc6IHZhbHVlfX07XG4gIH07XG59XG5cbi8qKlxuICogRnVuY3Rpb24gdGhhdCBoYXMgYFZhbGlkYXRvckZuYCBzaGFwZSwgYnV0IHBlcmZvcm1zIG5vIG9wZXJhdGlvbi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG51bGxWYWxpZGF0b3IoY29udHJvbDogQWJzdHJhY3RDb250cm9sKTogVmFsaWRhdGlvbkVycm9yc3xudWxsIHtcbiAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIGlzUHJlc2VudChvOiBhbnkpOiBib29sZWFuIHtcbiAgcmV0dXJuIG8gIT0gbnVsbDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvT2JzZXJ2YWJsZShyOiBhbnkpOiBPYnNlcnZhYmxlPGFueT4ge1xuICBjb25zdCBvYnMgPSBpc1Byb21pc2UocikgPyBmcm9tKHIpIDogcjtcbiAgaWYgKCEoaXNPYnNlcnZhYmxlKG9icykpICYmICh0eXBlb2YgbmdEZXZNb2RlID09PSAndW5kZWZpbmVkJyB8fCBuZ0Rldk1vZGUpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBFeHBlY3RlZCB2YWxpZGF0b3IgdG8gcmV0dXJuIFByb21pc2Ugb3IgT2JzZXJ2YWJsZS5gKTtcbiAgfVxuICByZXR1cm4gb2JzO1xufVxuXG5mdW5jdGlvbiBtZXJnZUVycm9ycyhhcnJheU9mRXJyb3JzOiAoVmFsaWRhdGlvbkVycm9yc3xudWxsKVtdKTogVmFsaWRhdGlvbkVycm9yc3xudWxsIHtcbiAgbGV0IHJlczoge1trZXk6IHN0cmluZ106IGFueX0gPSB7fTtcblxuICAvLyBOb3QgdXNpbmcgQXJyYXkucmVkdWNlIGhlcmUgZHVlIHRvIGEgQ2hyb21lIDgwIGJ1Z1xuICAvLyBodHRwczovL2J1Z3MuY2hyb21pdW0ub3JnL3AvY2hyb21pdW0vaXNzdWVzL2RldGFpbD9pZD0xMDQ5OTgyXG4gIGFycmF5T2ZFcnJvcnMuZm9yRWFjaCgoZXJyb3JzOiBWYWxpZGF0aW9uRXJyb3JzfG51bGwpID0+IHtcbiAgICByZXMgPSBlcnJvcnMgIT0gbnVsbCA/IHsuLi5yZXMhLCAuLi5lcnJvcnN9IDogcmVzITtcbiAgfSk7XG5cbiAgcmV0dXJuIE9iamVjdC5rZXlzKHJlcykubGVuZ3RoID09PSAwID8gbnVsbCA6IHJlcztcbn1cblxudHlwZSBHZW5lcmljVmFsaWRhdG9yRm4gPSAoY29udHJvbDogQWJzdHJhY3RDb250cm9sKSA9PiBhbnk7XG5cbmZ1bmN0aW9uIGV4ZWN1dGVWYWxpZGF0b3JzPFYgZXh0ZW5kcyBHZW5lcmljVmFsaWRhdG9yRm4+KFxuICAgIGNvbnRyb2w6IEFic3RyYWN0Q29udHJvbCwgdmFsaWRhdG9yczogVltdKTogUmV0dXJuVHlwZTxWPltdIHtcbiAgcmV0dXJuIHZhbGlkYXRvcnMubWFwKHZhbGlkYXRvciA9PiB2YWxpZGF0b3IoY29udHJvbCkpO1xufVxuXG5mdW5jdGlvbiBpc1ZhbGlkYXRvckZuPFY+KHZhbGlkYXRvcjogVnxWYWxpZGF0b3J8QXN5bmNWYWxpZGF0b3IpOiB2YWxpZGF0b3IgaXMgViB7XG4gIHJldHVybiAhKHZhbGlkYXRvciBhcyBWYWxpZGF0b3IpLnZhbGlkYXRlO1xufVxuXG4vKipcbiAqIEdpdmVuIHRoZSBsaXN0IG9mIHZhbGlkYXRvcnMgdGhhdCBtYXkgY29udGFpbiBib3RoIGZ1bmN0aW9ucyBhcyB3ZWxsIGFzIGNsYXNzZXMsIHJldHVybiB0aGUgbGlzdFxuICogb2YgdmFsaWRhdG9yIGZ1bmN0aW9ucyAoY29udmVydCB2YWxpZGF0b3IgY2xhc3NlcyBpbnRvIHZhbGlkYXRvciBmdW5jdGlvbnMpLiBUaGlzIGlzIG5lZWRlZCB0b1xuICogaGF2ZSBjb25zaXN0ZW50IHN0cnVjdHVyZSBpbiB2YWxpZGF0b3JzIGxpc3QgYmVmb3JlIGNvbXBvc2luZyB0aGVtLlxuICpcbiAqIEBwYXJhbSB2YWxpZGF0b3JzIFRoZSBzZXQgb2YgdmFsaWRhdG9ycyB0aGF0IG1heSBjb250YWluIHZhbGlkYXRvcnMgYm90aCBpbiBwbGFpbiBmdW5jdGlvbiBmb3JtXG4gKiAgICAgYXMgd2VsbCBhcyByZXByZXNlbnRlZCBhcyBhIHZhbGlkYXRvciBjbGFzcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZVZhbGlkYXRvcnM8Vj4odmFsaWRhdG9yczogKFZ8VmFsaWRhdG9yfEFzeW5jVmFsaWRhdG9yKVtdKTogVltdIHtcbiAgcmV0dXJuIHZhbGlkYXRvcnMubWFwKHZhbGlkYXRvciA9PiB7XG4gICAgcmV0dXJuIGlzVmFsaWRhdG9yRm48Vj4odmFsaWRhdG9yKSA/XG4gICAgICAgIHZhbGlkYXRvciA6XG4gICAgICAgICgoYzogQWJzdHJhY3RDb250cm9sKSA9PiB2YWxpZGF0b3IudmFsaWRhdGUoYykpIGFzIHVua25vd24gYXMgVjtcbiAgfSk7XG59XG5cbi8qKlxuICogTWVyZ2VzIHN5bmNocm9ub3VzIHZhbGlkYXRvcnMgaW50byBhIHNpbmdsZSB2YWxpZGF0b3IgZnVuY3Rpb24uXG4gKiBTZWUgYFZhbGlkYXRvcnMuY29tcG9zZWAgZm9yIGFkZGl0aW9uYWwgaW5mb3JtYXRpb24uXG4gKi9cbmZ1bmN0aW9uIGNvbXBvc2UodmFsaWRhdG9yczogKFZhbGlkYXRvckZufG51bGx8dW5kZWZpbmVkKVtdfG51bGwpOiBWYWxpZGF0b3JGbnxudWxsIHtcbiAgaWYgKCF2YWxpZGF0b3JzKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgcHJlc2VudFZhbGlkYXRvcnM6IFZhbGlkYXRvckZuW10gPSB2YWxpZGF0b3JzLmZpbHRlcihpc1ByZXNlbnQpIGFzIGFueTtcbiAgaWYgKHByZXNlbnRWYWxpZGF0b3JzLmxlbmd0aCA9PSAwKSByZXR1cm4gbnVsbDtcblxuICByZXR1cm4gZnVuY3Rpb24oY29udHJvbDogQWJzdHJhY3RDb250cm9sKSB7XG4gICAgcmV0dXJuIG1lcmdlRXJyb3JzKGV4ZWN1dGVWYWxpZGF0b3JzPFZhbGlkYXRvckZuPihjb250cm9sLCBwcmVzZW50VmFsaWRhdG9ycykpO1xuICB9O1xufVxuXG4vKipcbiAqIEFjY2VwdHMgYSBsaXN0IG9mIHZhbGlkYXRvcnMgb2YgZGlmZmVyZW50IHBvc3NpYmxlIHNoYXBlcyAoYFZhbGlkYXRvcmAgYW5kIGBWYWxpZGF0b3JGbmApLFxuICogbm9ybWFsaXplcyB0aGUgbGlzdCAoY29udmVydHMgZXZlcnl0aGluZyB0byBgVmFsaWRhdG9yRm5gKSBhbmQgbWVyZ2VzIHRoZW0gaW50byBhIHNpbmdsZVxuICogdmFsaWRhdG9yIGZ1bmN0aW9uLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY29tcG9zZVZhbGlkYXRvcnModmFsaWRhdG9yczogQXJyYXk8VmFsaWRhdG9yfFZhbGlkYXRvckZuPik6IFZhbGlkYXRvckZufG51bGwge1xuICByZXR1cm4gdmFsaWRhdG9ycyAhPSBudWxsID8gY29tcG9zZShub3JtYWxpemVWYWxpZGF0b3JzPFZhbGlkYXRvckZuPih2YWxpZGF0b3JzKSkgOiBudWxsO1xufVxuXG4vKipcbiAqIE1lcmdlcyBhc3luY2hyb25vdXMgdmFsaWRhdG9ycyBpbnRvIGEgc2luZ2xlIHZhbGlkYXRvciBmdW5jdGlvbi5cbiAqIFNlZSBgVmFsaWRhdG9ycy5jb21wb3NlQXN5bmNgIGZvciBhZGRpdGlvbmFsIGluZm9ybWF0aW9uLlxuICovXG5mdW5jdGlvbiBjb21wb3NlQXN5bmModmFsaWRhdG9yczogKEFzeW5jVmFsaWRhdG9yRm58bnVsbClbXSk6IEFzeW5jVmFsaWRhdG9yRm58bnVsbCB7XG4gIGlmICghdmFsaWRhdG9ycykgcmV0dXJuIG51bGw7XG4gIGNvbnN0IHByZXNlbnRWYWxpZGF0b3JzOiBBc3luY1ZhbGlkYXRvckZuW10gPSB2YWxpZGF0b3JzLmZpbHRlcihpc1ByZXNlbnQpIGFzIGFueTtcbiAgaWYgKHByZXNlbnRWYWxpZGF0b3JzLmxlbmd0aCA9PSAwKSByZXR1cm4gbnVsbDtcblxuICByZXR1cm4gZnVuY3Rpb24oY29udHJvbDogQWJzdHJhY3RDb250cm9sKSB7XG4gICAgY29uc3Qgb2JzZXJ2YWJsZXMgPVxuICAgICAgICBleGVjdXRlVmFsaWRhdG9yczxBc3luY1ZhbGlkYXRvckZuPihjb250cm9sLCBwcmVzZW50VmFsaWRhdG9ycykubWFwKHRvT2JzZXJ2YWJsZSk7XG4gICAgcmV0dXJuIGZvcmtKb2luKG9ic2VydmFibGVzKS5waXBlKG1hcChtZXJnZUVycm9ycykpO1xuICB9O1xufVxuXG4vKipcbiAqIEFjY2VwdHMgYSBsaXN0IG9mIGFzeW5jIHZhbGlkYXRvcnMgb2YgZGlmZmVyZW50IHBvc3NpYmxlIHNoYXBlcyAoYEFzeW5jVmFsaWRhdG9yYCBhbmRcbiAqIGBBc3luY1ZhbGlkYXRvckZuYCksIG5vcm1hbGl6ZXMgdGhlIGxpc3QgKGNvbnZlcnRzIGV2ZXJ5dGhpbmcgdG8gYEFzeW5jVmFsaWRhdG9yRm5gKSBhbmQgbWVyZ2VzXG4gKiB0aGVtIGludG8gYSBzaW5nbGUgdmFsaWRhdG9yIGZ1bmN0aW9uLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY29tcG9zZUFzeW5jVmFsaWRhdG9ycyh2YWxpZGF0b3JzOiBBcnJheTxBc3luY1ZhbGlkYXRvcnxBc3luY1ZhbGlkYXRvckZuPik6XG4gICAgQXN5bmNWYWxpZGF0b3JGbnxudWxsIHtcbiAgcmV0dXJuIHZhbGlkYXRvcnMgIT0gbnVsbCA/IGNvbXBvc2VBc3luYyhub3JtYWxpemVWYWxpZGF0b3JzPEFzeW5jVmFsaWRhdG9yRm4+KHZhbGlkYXRvcnMpKSA6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBudWxsO1xufVxuXG4vKipcbiAqIE1lcmdlcyByYXcgY29udHJvbCB2YWxpZGF0b3JzIHdpdGggYSBnaXZlbiBkaXJlY3RpdmUgdmFsaWRhdG9yIGFuZCByZXR1cm5zIHRoZSBjb21iaW5lZCBsaXN0IG9mXG4gKiB2YWxpZGF0b3JzIGFzIGFuIGFycmF5LlxuICovXG5leHBvcnQgZnVuY3Rpb24gbWVyZ2VWYWxpZGF0b3JzPFY+KGNvbnRyb2xWYWxpZGF0b3JzOiBWfFZbXXxudWxsLCBkaXJWYWxpZGF0b3I6IFYpOiBWW10ge1xuICBpZiAoY29udHJvbFZhbGlkYXRvcnMgPT09IG51bGwpIHJldHVybiBbZGlyVmFsaWRhdG9yXTtcbiAgcmV0dXJuIEFycmF5LmlzQXJyYXkoY29udHJvbFZhbGlkYXRvcnMpID8gWy4uLmNvbnRyb2xWYWxpZGF0b3JzLCBkaXJWYWxpZGF0b3JdIDpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgW2NvbnRyb2xWYWxpZGF0b3JzLCBkaXJWYWxpZGF0b3JdO1xufVxuXG4vKipcbiAqIFJldHJpZXZlcyB0aGUgbGlzdCBvZiByYXcgc3luY2hyb25vdXMgdmFsaWRhdG9ycyBhdHRhY2hlZCB0byBhIGdpdmVuIGNvbnRyb2wuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRDb250cm9sVmFsaWRhdG9ycyhjb250cm9sOiBBYnN0cmFjdENvbnRyb2wpOiBWYWxpZGF0b3JGbnxWYWxpZGF0b3JGbltdfG51bGwge1xuICByZXR1cm4gKGNvbnRyb2wgYXMgYW55KS5fcmF3VmFsaWRhdG9ycyBhcyBWYWxpZGF0b3JGbiB8IFZhbGlkYXRvckZuW10gfCBudWxsO1xufVxuXG4vKipcbiAqIFJldHJpZXZlcyB0aGUgbGlzdCBvZiByYXcgYXN5bmNocm9ub3VzIHZhbGlkYXRvcnMgYXR0YWNoZWQgdG8gYSBnaXZlbiBjb250cm9sLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q29udHJvbEFzeW5jVmFsaWRhdG9ycyhjb250cm9sOiBBYnN0cmFjdENvbnRyb2wpOiBBc3luY1ZhbGlkYXRvckZufFxuICAgIEFzeW5jVmFsaWRhdG9yRm5bXXxudWxsIHtcbiAgcmV0dXJuIChjb250cm9sIGFzIGFueSkuX3Jhd0FzeW5jVmFsaWRhdG9ycyBhcyBBc3luY1ZhbGlkYXRvckZuIHwgQXN5bmNWYWxpZGF0b3JGbltdIHwgbnVsbDtcbn1cblxuLyoqXG4gKiBBY2NlcHRzIGEgc2luZ2xldG9uIHZhbGlkYXRvciwgYW4gYXJyYXksIG9yIG51bGwsIGFuZCByZXR1cm5zIGFuIGFycmF5IHR5cGUgd2l0aCB0aGUgcHJvdmlkZWRcbiAqIHZhbGlkYXRvcnMuXG4gKlxuICogQHBhcmFtIHZhbGlkYXRvcnMgQSB2YWxpZGF0b3IsIHZhbGlkYXRvcnMsIG9yIG51bGwuXG4gKiBAcmV0dXJucyBBIHZhbGlkYXRvcnMgYXJyYXkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtYWtlVmFsaWRhdG9yc0FycmF5PFQgZXh0ZW5kcyBWYWxpZGF0b3JGbnxBc3luY1ZhbGlkYXRvckZuPih2YWxpZGF0b3JzOiBUfFRbXXxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBudWxsKTogVFtdIHtcbiAgaWYgKCF2YWxpZGF0b3JzKSByZXR1cm4gW107XG4gIHJldHVybiBBcnJheS5pc0FycmF5KHZhbGlkYXRvcnMpID8gdmFsaWRhdG9ycyA6IFt2YWxpZGF0b3JzXTtcbn1cblxuLyoqXG4gKiBEZXRlcm1pbmVzIHdoZXRoZXIgYSB2YWxpZGF0b3Igb3IgdmFsaWRhdG9ycyBhcnJheSBoYXMgYSBnaXZlbiB2YWxpZGF0b3IuXG4gKlxuICogQHBhcmFtIHZhbGlkYXRvcnMgVGhlIHZhbGlkYXRvciBvciB2YWxpZGF0b3JzIHRvIGNvbXBhcmUgYWdhaW5zdC5cbiAqIEBwYXJhbSB2YWxpZGF0b3IgVGhlIHZhbGlkYXRvciB0byBjaGVjay5cbiAqIEByZXR1cm5zIFdoZXRoZXIgdGhlIHZhbGlkYXRvciBpcyBwcmVzZW50LlxuICovXG5leHBvcnQgZnVuY3Rpb24gaGFzVmFsaWRhdG9yPFQgZXh0ZW5kcyBWYWxpZGF0b3JGbnxBc3luY1ZhbGlkYXRvckZuPihcbiAgICB2YWxpZGF0b3JzOiBUfFRbXXxudWxsLCB2YWxpZGF0b3I6IFQpOiBib29sZWFuIHtcbiAgcmV0dXJuIEFycmF5LmlzQXJyYXkodmFsaWRhdG9ycykgPyB2YWxpZGF0b3JzLmluY2x1ZGVzKHZhbGlkYXRvcikgOiB2YWxpZGF0b3JzID09PSB2YWxpZGF0b3I7XG59XG5cbi8qKlxuICogQ29tYmluZXMgdHdvIGFycmF5cyBvZiB2YWxpZGF0b3JzIGludG8gb25lLiBJZiBkdXBsaWNhdGVzIGFyZSBwcm92aWRlZCwgb25seSBvbmUgd2lsbCBiZSBhZGRlZC5cbiAqXG4gKiBAcGFyYW0gdmFsaWRhdG9ycyBUaGUgbmV3IHZhbGlkYXRvcnMuXG4gKiBAcGFyYW0gY3VycmVudFZhbGlkYXRvcnMgVGhlIGJhc2UgYXJyYXkgb2YgY3VycnJlbnQgdmFsaWRhdG9ycy5cbiAqIEByZXR1cm5zIEFuIGFycmF5IG9mIHZhbGlkYXRvcnMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhZGRWYWxpZGF0b3JzPFQgZXh0ZW5kcyBWYWxpZGF0b3JGbnxBc3luY1ZhbGlkYXRvckZuPihcbiAgICB2YWxpZGF0b3JzOiBUfFRbXSwgY3VycmVudFZhbGlkYXRvcnM6IFR8VFtdfG51bGwpOiBUW10ge1xuICBjb25zdCBjdXJyZW50ID0gbWFrZVZhbGlkYXRvcnNBcnJheShjdXJyZW50VmFsaWRhdG9ycyk7XG4gIGNvbnN0IHZhbGlkYXRvcnNUb0FkZCA9IG1ha2VWYWxpZGF0b3JzQXJyYXkodmFsaWRhdG9ycyk7XG4gIHZhbGlkYXRvcnNUb0FkZC5mb3JFYWNoKCh2OiBUKSA9PiB7XG4gICAgLy8gTm90ZTogaWYgdGhlcmUgYXJlIGR1cGxpY2F0ZSBlbnRyaWVzIGluIHRoZSBuZXcgdmFsaWRhdG9ycyBhcnJheSxcbiAgICAvLyBvbmx5IHRoZSBmaXJzdCBvbmUgd291bGQgYmUgYWRkZWQgdG8gdGhlIGN1cnJlbnQgbGlzdCBvZiB2YWxpZGFyb3JzLlxuICAgIC8vIER1cGxpY2F0ZSBvbmVzIHdvdWxkIGJlIGlnbm9yZWQgc2luY2UgYGhhc1ZhbGlkYXRvcmAgd291bGQgZGV0ZWN0XG4gICAgLy8gdGhlIHByZXNlbmNlIG9mIGEgdmFsaWRhdG9yIGZ1bmN0aW9uIGFuZCB3ZSB1cGRhdGUgdGhlIGN1cnJlbnQgbGlzdCBpbiBwbGFjZS5cbiAgICBpZiAoIWhhc1ZhbGlkYXRvcihjdXJyZW50LCB2KSkge1xuICAgICAgY3VycmVudC5wdXNoKHYpO1xuICAgIH1cbiAgfSk7XG4gIHJldHVybiBjdXJyZW50O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlVmFsaWRhdG9yczxUIGV4dGVuZHMgVmFsaWRhdG9yRm58QXN5bmNWYWxpZGF0b3JGbj4oXG4gICAgdmFsaWRhdG9yczogVHxUW10sIGN1cnJlbnRWYWxpZGF0b3JzOiBUfFRbXXxudWxsKTogVFtdIHtcbiAgcmV0dXJuIG1ha2VWYWxpZGF0b3JzQXJyYXkoY3VycmVudFZhbGlkYXRvcnMpLmZpbHRlcih2ID0+ICFoYXNWYWxpZGF0b3IodmFsaWRhdG9ycywgdikpO1xufVxuIl19